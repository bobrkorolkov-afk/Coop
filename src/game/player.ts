import * as THREE from 'three';
import { collideMove, probeGround, type AABB } from './arena';
import { HEROES, TUNE, type HeroDef, DEFAULT_MODS, type PlayerMods } from './constants';

export interface InputState {
  forward: boolean;
  back: boolean;
  left: boolean;
  right: boolean;
  jump: boolean;
  crouch: boolean;
  // инверсия управления (карта «ЗЕРКАЛО» / ульт СПОРА)
  invertMove: boolean;
}

export interface CurseRuntime {
  until: number; // performance.now() / 1000
  value?: number;
}

let nextId = 1;

export class Player {
  id = nextId++;
  name: string;
  team: 0 | 1;
  hero: HeroDef;
  isBot = false;
  isLocal = false;

  pos = new THREE.Vector3(0, 0, 0);
  vel = new THREE.Vector3();
  yaw = 0;
  pitch = 0;

  hp: number;
  maxHp: number;
  alive = true;
  respawnAt = 0;

  // мувмент-стейт
  onGround = false;
  sliding = false;
  slideTime = 0;
  private jumpBufferT = 0;
  private coyoteT = 0;
  private lastLandTime = -10;
  private lastJumpTime = -10;
  speedOnLand = 0;
  eyeHeight = TUNE.playerHeight * 0.92;
  crouchAmount = 0; // 0..1

  // бой
  ammo: number;
  reloading = false;
  reloadEnds = 0;
  nextShotAt = 0;
  critNextShot = false;

  // способности
  qReadyAt = 0;
  eReadyAt = 0;
  ultCharge = 0; // 0..100
  ultActiveUntil = 0;
  kills = 0;
  deaths = 0;
  score = 0;

  // карты и проклятия
  mods: PlayerMods = { ...DEFAULT_MODS };
  cardIds: string[] = [];
  curses = new Map<string, CurseRuntime>();
  chihNextAt = 0;
  slideJumpBoostUntil = 0;
  ultEchoReady = false;
  ultEchoUsed = false;
  doubleE = false;

  // голос = газ
  voiceBoost = 0; // 0..0.35

  constructor(name: string, team: 0 | 1, hero: HeroDef) {
    this.name = name;
    this.team = team;
    this.hero = hero;
    this.hp = hero.hp;
    this.maxHp = hero.hp;
    this.ammo = hero.weapon.mag;
  }

  get speedMultiplier(): number {
    let m = this.hero.speed * this.mods.speedMult * (1 + this.voiceBoost);
    if (this.curses.has('oldshoes')) m *= 0.7;
    if (this.curses.has('slippery')) m *= 0.92;
    if (this.curses.has('slow')) m *= 0.62;
    if (this.isUltActive()) {
      if (this.hero.id === 'shilo') m *= 1.35;
      if (this.hero.id === 'zhizha') m *= 0.8;
    }
    return m;
  }

  isUltActive(): boolean {
    return performance.now() / 1000 < this.ultActiveUntil;
  }

  hasCurse(id: string): boolean {
    const c = this.curses.get(id);
    if (!c) return false;
    if (performance.now() / 1000 > c.until) {
      this.curses.delete(id);
      return false;
    }
    return true;
  }

  addCurse(id: string, duration: number) {
    const now = performance.now() / 1000;
    const prev = this.curses.get(id);
    this.curses.set(id, { until: Math.max(now + duration, prev?.until ?? 0) });
  }

  // ============ Обновление мувмента ============
  update(dt: number, input: InputState, colliders: AABB[], extraGravity = 0) {
    const now = performance.now() / 1000;

    // инверсия управления
    let f = input.forward, b = input.back, l = input.left, r = input.right;
    if (input.invertMove || this.hasCurse('mirror')) {
      [f, b] = [b, f];
      [l, r] = [r, l];
    }

    const yawQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(yawQ);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(yawQ);

    const wish = new THREE.Vector3();
    if (f) wish.add(fwd);
    if (b) wish.sub(fwd);
    if (r) wish.add(right);
    if (l) wish.sub(right);
    const hasWish = wish.lengthSq() > 0.001;
    if (hasWish) wish.normalize();

    // ——— Слайд ———
    const wantSlide = input.crouch && this.onGround && this.vel.length() > TUNE.slideStartMin;
    if (wantSlide && !this.sliding) {
      this.sliding = true;
      this.slideTime = 0;
      // разгон слайда
      const boost = TUNE.slideBoostMult;
      this.vel.x *= boost;
      this.vel.z *= boost;
      const sp = Math.hypot(this.vel.x, this.vel.z);
      if (sp > TUNE.maxSpeed * 1.35) {
        const k = (TUNE.maxSpeed * 1.35) / sp;
        this.vel.x *= k;
        this.vel.z *= k;
      }
    }
    if (this.sliding && (!input.crouch || this.vel.length() < TUNE.slideMinSpeed)) {
      this.sliding = false;
    }

    // ——— Трение / ускорение ———
    const speedCap = TUNE.maxSpeed * this.speedMultiplier;
    if (this.onGround) {
      this.coyoteT = TUNE.coyoteTime;
      if (this.sliding) {
        // низкое трение
        const fr = TUNE.slideFriction * this.mods.slideFrictionMult * (this.hasCurse('slippery') ? 0.25 : 1);
        const sp = this.vel.length();
        if (sp > 0) {
          const drop = Math.max(sp, 3) * fr * dt;
          const k = Math.max(0, sp - drop) / sp;
          this.vel.x *= k;
          this.vel.z *= k;
        }
        // лёгкий контрель руля во время слайда
        if (hasWish) this.accelerate(wish, speedCap, TUNE.groundAccel * 0.12, dt);
      } else {
        this.applyFriction(dt);
        this.accelerate(wish, speedCap, TUNE.groundAccel, dt);
      }
    } else {
      // air strafe: Quake-модель
      const wishSpeed = Math.min(speedCap, TUNE.airSpeedCap * this.speedMultiplier);
      this.accelerate(wish, hasWish ? wishSpeed : 0, TUNE.airAccel, dt);
      this.coyoteT = Math.max(0, this.coyoteT - dt);
      this.vel.y -= (TUNE.gravity + extraGravity) * dt;
    }

    // ограничение итоговой горизонтальной скорости (потолок с запасом на слайд-прыжки)
    const hs = Math.hypot(this.vel.x, this.vel.z);
    const hardCap = speedCap * 1.45;
    if (hs > hardCap) {
      const k = hardCap / hs;
      this.vel.x *= k;
      this.vel.z *= k;
    }

    // ——— Прыжок (буфер + койот + бхоп) ———
    if (input.jump) this.jumpBufferT = TUNE.jumpBuffer * this.mods.bhopWindowMult;
    else this.jumpBufferT = Math.max(0, this.jumpBufferT - dt);

    if (this.jumpBufferT > 0 && (this.onGround || this.coyoteT > 0)) {
      const sinceLand = now - this.lastLandTime;
      const isBhop = sinceLand < TUNE.bhopWindow * this.mods.bhopWindowMult && this.lastJumpTime > this.lastLandTime - 0.01 === false;
      // сохранение скорости: не гасим горизонталь при бхопе (и так не гасим — friction только на земле)
      const jumpV = TUNE.jumpVel * this.hero.jump * this.mods.jumpMult;
      this.vel.y = jumpV;
      if (this.sliding) {
        // слайд-прыжок: +15% (или больше от карт)
        const boost = this.mods.slideJumpBoost + (this.slideJumpBoostUntil > now ? 0.25 : 0);
        this.vel.x *= 1 + boost;
        this.vel.z *= 1 + boost;
        this.sliding = false;
      }
      this.onGround = false;
      this.coyoteT = 0;
      this.jumpBufferT = 0;
      this.lastJumpTime = now;
      if (!isBhop && this.speedOnLand > 8) {
        // мягкий кап уже применён в hardCap
      }
      this.onJump?.();
    }

    // ——— Интеграция позиции с коллизиями ———
    const beforeY = this.vel.y;
    const res = collideMove(this.pos, this.vel, dt, colliders, TUNE.playerRadius, this.height);
    const grounded = res.onGround || (beforeY <= 0.01 && probeGround(this.pos, colliders, TUNE.playerRadius, this.height));
    if (grounded) {
      if (!this.onGround) {
        this.lastLandTime = performance.now() / 1000;
        this.speedOnLand = Math.hypot(this.vel.x, this.vel.z);
        if (beforeY < -2) this.onLand?.();
      }
      this.onGround = true;
      if (this.vel.y < 0) this.vel.y = 0;
    } else {
      this.onGround = false;
    }

    // плавная высота камеры (слайд/присед)
    const targetCrouch = this.sliding ? 1 : input.crouch ? 0.65 : 0;
    this.crouchAmount += (targetCrouch - this.crouchAmount) * Math.min(1, dt * 12);
    this.eyeHeight = TUNE.playerHeight * 0.92 - this.crouchAmount * 0.55;

    // таймеры
    if (this.reloading && now >= this.reloadEnds) {
      this.reloading = false;
      this.ammo = this.hero.weapon.mag;
    }
    if (this.ultCharge > 100) this.ultCharge = 100;
  }

  get height(): number {
    return this.sliding ? TUNE.crouchHeight + 0.25 : TUNE.playerHeight - this.crouchAmount * 0.55;
  }

  private applyFriction(dt: number) {
    const sp = Math.hypot(this.vel.x, this.vel.z);
    if (sp < 0.01) return;
    const drop = sp * TUNE.groundFriction * dt * (this.hasCurse('slippery') ? 0.3 : 1);
    const k = Math.max(0, sp - drop) / sp;
    this.vel.x *= k;
    this.vel.z *= k;
  }

  // Quake accelerate
  private accelerate(wishDir: THREE.Vector3, wishSpeed: number, accel: number, dt: number) {
    if (wishSpeed <= 0) return;
    const currentSpeed = this.vel.x * wishDir.x + this.vel.z * wishDir.z;
    const addSpeed = wishSpeed - currentSpeed;
    if (addSpeed <= 0) return;
    const accelSpeed = Math.min(accel * dt * wishSpeed, addSpeed);
    this.vel.x += wishDir.x * accelSpeed;
    this.vel.z += wishDir.z * accelSpeed;
  }

  get horizontalSpeed(): number {
    return Math.hypot(this.vel.x, this.vel.z);
  }

  get eyePos(): THREE.Vector3 {
    return new THREE.Vector3(this.pos.x, this.pos.y + this.eyeHeight, this.pos.z);
  }

  get chestPos(): THREE.Vector3 {
    return new THREE.Vector3(this.pos.x, this.pos.y + this.height * 0.55, this.pos.z);
  }

  respawn(pos: THREE.Vector3, yaw: number) {
    this.pos.copy(pos);
    this.pos.y += 0.1;
    this.vel.set(0, 0, 0);
    this.yaw = yaw;
    this.pitch = 0;
    this.hp = this.maxHp;
    this.alive = true;
    this.ammo = this.hero.weapon.mag;
    this.reloading = false;
    this.sliding = false;
    this.curses.clear();
    this.ultActiveUntil = 0;
  }

  // Колбэки, которые цепляет Game
  onJump: (() => void) | null = null;
  onLand: (() => void) | null = null;
}
