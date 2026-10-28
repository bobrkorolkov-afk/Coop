import * as THREE from 'three';
import { buildArena, raycastAABB, type AABB, type ArenaData } from './arena';
import { Effects } from './effects';
import { GameAudio } from './audio';
import { Player, type InputState } from './player';
import { BotController, botName } from './bots';
import { recomputeMods, pickDraft } from './cards';
import { CARDS, HEROES, TUNE, type CardDef, type HeroDef } from './constants';

export type GameMode = 'training' | 'online';
export type GamePhase = 'countdown' | 'playing' | 'draft' | 'roundEnd' | 'matchEnd' | 'paused';

export interface GameCallbacks {
  onBanner(text: string, sub?: string): void;
  onToast(text: string): void;
  onKillFeed(killer: string, victim: string, crit: boolean): void;
  onDraft(cards: CardDef[]): void;
  onMatchEnd(winner: 0 | 1, localWon: boolean, score: { a: number; b: number }): void;
  onPhase(phase: GamePhase): void;
}

interface Entity {
  kind: 'pool' | 'cloud' | 'wall' | 'clone' | 'ghost' | 'frog';
  obj: THREE.Object3D;
  until: number;
  owner: Player;
  radius: number;
  hp: number;
  tickAt: number;
  vel?: THREE.Vector3;
  colliderRef?: AABB;
  data?: number;
}

export class Game {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  effects: Effects;
  arena: ArenaData;
  colliders: AABB[] = [];
  audio: GameAudio;

  players: Player[] = [];
  localPlayer: Player;
  bots: BotController[] = [];
  entities: Entity[] = [];

  mode: GameMode = 'training';
  phase: GamePhase = 'countdown';
  phaseEndsAt = 0;
  roundNumber = 1;
  scoreA = 0;
  scoreB = 0;
  roundKillsA = 0;
  roundKillsB = 0;

  // глобальные проклятия/хаос (таймеры, сек)
  tripTimer = 0;
  volTimer = 0;
  bassTimer = 0;
  voiceChargeTimer = 0;
  frogsTimer = 0;

  // камера / фил
  shake = 0;
  fovKick = 0;
  sens = 1.2;
  mouseDown = false;
  running = false;
  private clock = new THREE.Clock();
  private time = 0;
  private input: InputState = {
    forward: false, back: false, left: false, right: false, jump: false, crouch: false, invertMove: false,
  };

  // онлайн: сетевые игроки
  netPlayers = new Map<number, { pos: THREE.Vector3; yaw: number; pitch: number; hp: number; anim: number }>();

  constructor(canvas: HTMLCanvasElement, audio: GameAudio, public callbacks: GameCallbacks) {
    this.audio = audio;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.camera = new THREE.PerspectiveCamera(95, window.innerWidth / window.innerHeight, 0.05, 220);

    // сцена: туман + свет
    this.scene.fog = new THREE.FogExp2(0x14032e, 0.016);
    this.scene.background = new THREE.Color(0x0d0221);
    const ambient = new THREE.AmbientLight(0x2a1550, 1.6);
    this.scene.add(ambient);
    const moon = new THREE.DirectionalLight(0x8a6cff, 1.4);
    moon.position.set(18, 32, -14);
    this.scene.add(moon);
    const acidLight = new THREE.PointLight(0xb6ff00, 60, 40, 1.8);
    acidLight.position.set(0, 8, 0);
    this.scene.add(acidLight);
    const pinkLight = new THREE.PointLight(0xff2bd6, 45, 36, 1.8);
    pinkLight.position.set(-14, 6, 14);
    this.scene.add(pinkLight);
    const uvLight = new THREE.PointLight(0x7a00ff, 45, 36, 1.8);
    uvLight.position.set(14, 6, -14);
    this.scene.add(uvLight);

    this.arena = buildArena();
    this.scene.add(this.arena.group);
    this.colliders = [...this.arena.colliders];

    this.effects = new Effects(this.scene, this.camera, this.renderer);

    // заглушка локального игрока (заменится при startMatch)
    this.localPlayer = new Player('ВЫ', 0, HEROES[0]);
    this.players.push(this.localPlayer);

    window.addEventListener('resize', () => this.onResize());
    this.bindInput(canvas);
    this.onResize();
  }

  private onResize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.effects.resize(w, h);
  }

  // ============ Запуск матча ============
  startMatch(mode: GameMode, hero: HeroDef, playerName: string) {
    this.mode = mode;
    this.players = [];
    this.bots = [];
    this.entities.forEach((e) => this.scene.remove(e.obj));
    this.entities = [];

    const local = new Player(playerName, 0, hero);
    local.isLocal = true;
    this.localPlayer = local;
    this.players.push(local);

    if (mode === 'training') {
      // 2×2: вы + союзный бот против двух ботов
      const allyHero = HEROES.find((h) => h.id !== hero.id) ?? HEROES[1];
      const ally = new Player(botName(0), 0, allyHero);
      ally.isBot = true;
      this.players.push(ally);
      this.bots.push(new BotController(ally, 0.7));

      const e1 = new Player(botName(1), 1, HEROES[(HEROES.indexOf(hero) + 2) % 4]);
      const e2 = new Player(botName(2), 1, HEROES[(HEROES.indexOf(hero) + 3) % 4]);
      e1.isBot = e2.isBot = true;
      this.players.push(e1, e2);
      this.bots.push(new BotController(e1, 0.72), new BotController(e2, 0.62));
    }

    this.roundNumber = 1;
    this.scoreA = 0;
    this.scoreB = 0;
    this.startRound(true);
    this.running = true;
    this.clock.start();
  }

  private startRound(first = false) {
    this.roundKillsA = 0;
    this.roundKillsB = 0;
    this.phase = 'countdown';
    this.phaseEndsAt = this.time + 3;
    this.roundStartTime = this.time;
    this.callbacks.onPhase(this.phase);
    this.respawnAll();
    this.callbacks.onBanner(first ? 'БЭДТРИП' : `РАУНД ${this.roundNumber}`, first ? 'готовься…' : 'приготовься к бою');
  }

  private respawnAll() {
    for (const p of this.players) {
      this.respawnPlayer(p);
    }
  }

  private spawnFor(team: 0 | 1): { pos: THREE.Vector3; yaw: number } {
    const base = team === 0 ? 0 : 4;
    const idx = base + Math.floor(Math.random() * 4);
    const pos = this.arena.spawnPoints[idx % this.arena.spawnPoints.length].clone();
    return { pos, yaw: team === 0 ? Math.PI : 0 };
  }

  respawnPlayer(p: Player) {
    const { pos, yaw } = this.spawnFor(p.team);
    p.respawn(pos, yaw);
    p.ultCharge = Math.min(p.ultCharge, 40);
  }

  // ============ Ввод ============
  private bindInput(canvas: HTMLCanvasElement) {
    const keyMap: Record<string, keyof InputState> = {
      KeyW: 'forward', KeyS: 'back', KeyA: 'left', KeyD: 'right',
      Space: 'jump', ShiftLeft: 'crouch', ShiftRight: 'crouch', KeyC: 'crouch', ControlLeft: 'crouch',
    };
    window.addEventListener('keydown', (e) => {
      if (e.code in keyMap) {
        this.input[keyMap[e.code]] = true;
        e.preventDefault();
      }
      if (!this.running) return;
      const p = this.localPlayer;
      if (e.code === 'KeyR') this.tryReload(p);
      if (e.code === 'KeyQ') this.useQ(p);
      if (e.code === 'KeyE') this.useE(p);
      if (e.code === 'KeyF') this.useUlt(p);
      if (e.code === 'Digit3') this.playCardByIndex(0);
      if (e.code === 'Digit4') this.playCardByIndex(1);
    });
    window.addEventListener('keyup', (e) => {
      if (e.code in keyMap) this.input[keyMap[e.code]] = false;
    });
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) this.mouseDown = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseDown = false;
    });
    window.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement !== canvas) return;
      const p = this.localPlayer;
      p.yaw -= e.movementX * 0.0022 * this.sens;
      p.pitch -= e.movementY * 0.0022 * this.sens;
      p.pitch = Math.max(-1.45, Math.min(1.45, p.pitch));
    });
    canvas.addEventListener('click', () => {
      if (this.running && document.pointerLockElement !== canvas) {
        canvas.requestPointerLock();
      }
    });
    document.addEventListener('pointerlockchange', () => {
      if (document.pointerLockElement !== canvas) this.mouseDown = false;
    });
  }

  requestPointerLock() {
    const canvas = this.renderer.domElement;
    canvas.requestPointerLock();
  }

  // ============ Главный цикл ============
  update() {
    if (!this.running) return;
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.time += dt;
    const now = this.time;

    // фазы
    if (this.phase === 'countdown' && now >= this.phaseEndsAt) {
      this.phase = 'playing';
      this.callbacks.onPhase(this.phase);
    }

    // глобальные таймеры
    this.tripTimer = Math.max(0, this.tripTimer - dt);
    this.volTimer = Math.max(0, this.volTimer - dt);
    this.bassTimer = Math.max(0, this.bassTimer - dt);
    this.voiceChargeTimer = Math.max(0, this.voiceChargeTimer - dt);
    this.frogsTimer = Math.max(0, this.frogsTimer - dt);
    this.effects.invert = this.tripTimer > 0 ? 1 : 0;
    if (this.bassTimer > 0) this.shake = Math.max(this.shake, 0.02 + Math.abs(Math.sin(now * 9)) * 0.03);
    if (this.frogsTimer > 0 && Math.random() < dt * 2.2) this.spawnFrog();

    // голос = газ → ульта (ГРОМКОЕ ЭХО / ГОЛОСОВОЙ ЗАРЯД)
    const lp = this.localPlayer;
    if (lp.alive && lp.voiceBoost > 0.02) {
      const echo = lp.cardIds.includes('echo') ? 1.15 : 1;
      lp.ultCharge += dt * 4.5 * lp.voiceBoost * 2.5 * echo * (this.voiceChargeTimer > 0 ? 1.35 : 1);
    }

    // ——— Локальный игрок ———
    if (lp.alive) {
      if (this.phase === 'playing' || this.phase === 'countdown') {
        lp.update(dt, this.input, this.colliders);
        if (this.mouseDown && this.phase === 'playing') this.tryFire(lp);
      }
      this.updateCamera(dt);
    } else if (now >= lp.respawnAt && (this.phase === 'playing' || this.phase === 'countdown')) {
      this.respawnPlayer(lp);
    }

    // ——— Боты ———
    for (const bot of this.bots) {
      const p = bot.player;
      if (!p.alive) {
        if (now >= p.respawnAt && this.phase === 'playing') this.respawnPlayer(p);
        continue;
      }
      const botInput: InputState = {
        forward: false, back: false, left: false, right: false,
        jump: false, crouch: false, invertMove: false,
      };
      if (this.phase === 'playing') {
        bot.update(dt, now, this.players, this.colliders, botInput);
        if (bot.lastLos && Math.random() < dt * 8 * bot.difficulty) this.tryFire(p);
        if (Math.random() < dt * 0.12) this.useQ(p);
        if (Math.random() < dt * 0.08) this.useE(p);
        if (p.ultCharge >= 100 && Math.random() < dt * 0.2) this.useUlt(p);
      }
      p.update(dt, botInput, this.colliders);
    }

    // ——— Сетевые игроки (интерполяция) ———
    for (const p of this.players) {
      if (p.isBot || p.isLocal) continue;
      const net = this.netPlayers.get(p.id);
      if (net) {
        p.pos.lerp(net.pos, Math.min(1, dt * 12));
        p.yaw += (net.yaw - p.yaw) * Math.min(1, dt * 12);
        p.pitch += (net.pitch - p.pitch) * Math.min(1, dt * 12);
        p.hp = net.hp;
      }
    }

    // ——— Сущности ———
    this.updateEntities(dt, now);

    // ——— Окружение: кислота и джамп-пады ———
    for (const p of this.players) {
      if (!p.alive) continue;
      for (const z of this.arena.acidZones) {
        if (p.pos.distanceTo(z.pos) < z.radius) {
          this.damagePlayer(p, 9 * dt, null, false, true);
        }
      }
      for (const pad of this.arena.jumpPads) {
        if (p.pos.distanceTo(pad.pos) < pad.radius && p.pos.y < pad.pos.y + 1.2 && p.vel.y <= 0.5) {
          p.vel.y = pad.power;
          p.onGround = false;
          if (p.isLocal) {
            this.audio.ability();
            this.effects.spawnBurst(p.pos, 0xff2bd6, 18, 6);
          }
        }
      }
    }

    // ——— Чих (карта БАСОВИТЫЙ ЧИХ) ———
    for (const p of this.players) {
      if (!p.alive || p.mods.chihInterval <= 0) continue;
      if (now >= p.chihNextAt) {
        p.chihNextAt = now + p.mods.chihInterval;
        this.audio.chih();
        this.shake = Math.max(this.shake, 0.05);
        for (const other of this.players) {
          if (other.team === p.team || !other.alive) continue;
          const d = other.pos.distanceTo(p.pos);
          if (d < 3.2) {
            const push = other.pos.clone().sub(p.pos).setY(0.4).normalize().multiplyScalar(11);
            other.vel.add(push);
            if (p.isLocal) this.callbacks.onToast('АПЧХИ! 🤧');
          }
        }
      }
    }

    // ——— Ложный урон / фейковые эффекты ———
    if (lp.hasCurse('fakehp') && Math.random() < dt * 1.4) {
      this.shake = Math.max(this.shake, 0.04);
    }

    // ——— Эффекты и камера ———
    this.effects.update(dt, now);
    this.shake = Math.max(0, this.shake - dt * 1.6);

    // таймер раунда
    if (this.phase === 'playing') {
      const remain = TUNE.roundTime - (now - this.roundStartTime);
      if (this.roundKillsA >= TUNE.roundKillTarget || this.roundKillsB >= TUNE.roundKillTarget || remain <= 0) {
        const winner: 0 | 1 = this.roundKillsA >= this.roundKillsB ? 0 : 1;
        this.endRound(winner);
      }
    }

    this.effects.composer.render();
  }

  private roundStartTime = 0;

  // ============ Камера ============
  private updateCamera(dt: number) {
    const p = this.localPlayer;
    const eye = p.eyePos;
    this.camera.position.copy(eye);

    // тряска
    if (this.shake > 0.001 || p.hasCurse('chorus')) {
      const s = this.shake + (p.hasCurse('chorus') ? 0.025 : 0);
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.y += (Math.random() - 0.5) * s;
      this.camera.position.z += (Math.random() - 0.5) * s;
    }

    this.camera.rotation.set(0, 0, 0);
    this.camera.rotateY(p.yaw);
    this.camera.rotateX(p.pitch);

    // крен на стрейфе/слайде
    const strafe = (this.input.right ? 1 : 0) - (this.input.left ? 1 : 0);
    const rollTarget = strafe * -0.05 + (p.sliding ? -0.09 : 0);
    this.camera.rotateZ(rollTarget);

    // FOV: скорость + слайд
    const speedNorm = Math.min(1, p.horizontalSpeed / TUNE.maxSpeed);
    const targetFov = 95 + speedNorm * 15 + (p.sliding ? 8 : 0) + (p.isUltActive() && p.hero.id === 'shilo' ? 10 : 0);
    this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 8);
    this.camera.updateProjectionMatrix();
  }

  // ============ Стрельба ============
  tryFire(p: Player) {
    const now = this.time;
    if (p.reloading || now < p.nextShotAt || !p.alive) return;
    const w = p.hero.weapon;
    if (p.ammo <= 0) {
      this.tryReload(p);
      if (p.isLocal) this.audio.empty();
      return;
    }

    const rate = w.fireRate * p.mods.fireRateMult * (p.isUltActive() && p.hero.id === 'shilo' ? 2 : 1);
    p.nextShotAt = now + 1 / rate;
    p.ammo--;

    const pellets = w.pellets ?? 1;
    const spread = w.spread * (p.hasCurse('flies') ? 1.4 : 1) * (p.hasCurse('chorus') ? 1.4 : 1);
    const eye = p.eyePos;
    const baseDir = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(p.pitch, p.yaw, 0, 'YXZ'));

    if (p.isLocal) this.audio.shoot(w.pellets !== undefined || w.damage > 12);

    for (let i = 0; i < pellets; i++) {
      const dir = baseDir.clone();
      dir.x += (Math.random() - 0.5) * spread * 2;
      dir.y += (Math.random() - 0.5) * spread * 2;
      dir.z += (Math.random() - 0.5) * spread * 2;
      dir.normalize();
      this.shootRay(p, eye, dir, w.range);
    }
  }

  private shootRay(shooter: Player, origin: THREE.Vector3, dir: THREE.Vector3, range: number) {
    // луч против геометрии
    let hitDist = range;
    let hitPoint = origin.clone().add(dir.clone().multiplyScalar(range));
    for (const c of this.colliders) {
      const t = raycastAABB(origin, dir, hitDist, c);
      if (t !== null && t < hitDist) {
        hitDist = t;
        hitPoint = origin.clone().add(dir.clone().multiplyScalar(t));
      }
    }
    // луч против сущностей (стены, клоны)
    for (const e of this.entities) {
      if (e.kind === 'wall') {
        const box = e.colliderRef;
        if (!box) continue;
        const t = raycastAABB(origin, dir, hitDist, box);
        if (t !== null && t < hitDist) {
          hitDist = t;
          hitPoint = origin.clone().add(dir.clone().multiplyScalar(t));
          e.hp -= 25;
        }
      }
      if (e.kind === 'clone') {
        const d = this.rayPointDist(origin, dir, e.obj.position);
        if (d < 0.9 && e.obj.position.distanceTo(origin) < hitDist) {
          hitDist = origin.distanceTo(e.obj.position);
          hitPoint = e.obj.position.clone();
          e.hp -= 30;
          // кто стреляет по клону — светится
          if (shooter.team !== e.owner.team) {
            shooter.addCurse('revealed', 5);
            this.damagePlayer(shooter, 6, e.owner, false);
          }
        }
      }
    }

    // луч против игроков
    let hitPlayer: Player | null = null;
    let playerDist = hitDist;
    for (const target of this.players) {
      if (target === shooter || !target.alive) continue;
      const box: AABB = {
        min: new THREE.Vector3(target.pos.x - 0.45, target.pos.y, target.pos.z - 0.45),
        max: new THREE.Vector3(target.pos.x + 0.45, target.pos.y + target.height, target.pos.z + 0.45),
      };
      const t = raycastAABB(origin, dir, playerDist, box);
      if (t !== null && t < playerDist) {
        playerDist = t;
        hitPlayer = target;
      }
    }

    if (hitPlayer) {
      hitPoint = origin.clone().add(dir.clone().multiplyScalar(playerDist));
      const w = shooter.hero.weapon;
      const isCrit = shooter.critNextShot || Math.random() < shooter.mods.critChance;
      shooter.critNextShot = false;
      let dmg = w.damage * shooter.mods.damageMult * (isCrit ? 2 : 1);
      if (shooter.isUltActive() && shooter.hero.id === 'shilo') dmg *= 1.15;

      // союзное лечение СПОРА
      if (hitPlayer.team === shooter.team) {
        if (w.healAlly) {
          hitPlayer.hp = Math.min(hitPlayer.maxHp, hitPlayer.hp + w.healAlly);
          this.effects.spawnBurst(hitPoint, 0xb6ff00, 8, 3);
        }
        return;
      }

      this.damagePlayer(hitPlayer, dmg, shooter, isCrit);
      if (w.bleed) hitPlayer.addCurse('bleed', 3);
      if (w.slow) hitPlayer.addCurse('slow', 1.2);
      this.effects.spawnBurst(hitPoint, isCrit ? 0xffe600 : 0xff2bd6, isCrit ? 16 : 9, 4.5);
      if (shooter.isLocal || hitPlayer.isLocal) {
        this.effects.spawnTracer(origin, hitPoint, shooter.hero.color);
      }
      if (hitPlayer.isLocal) {
        this.audio.hurt();
        this.shake = Math.max(this.shake, 0.055);
      }
      if (shooter.isLocal) {
        if (isCrit) this.audio.crit();
        else this.audio.hit();
      }
    } else {
      if (shooter.isLocal) this.effects.spawnTracer(origin, hitPoint, shooter.hero.color);
      this.effects.spawnBurst(hitPoint, 0x7a00ff, 5, 2.4);
    }
  }

  private rayPointDist(origin: THREE.Vector3, dir: THREE.Vector3, point: THREE.Vector3): number {
    const v = point.clone().sub(origin);
    const t = v.dot(dir);
    if (t < 0) return Infinity;
    return v.addScaledVector(dir, -t).length();
  }

  tryReload(p: Player) {
    if (p.reloading || p.ammo === p.hero.weapon.mag) return;
    p.reloading = true;
    p.reloadEnds = this.time + p.hero.weapon.reloadTime / p.mods.reloadSpeedMult;
    if (p.isLocal) this.audio.reload();
  }

  // ============ Урон / смерть ============
  damagePlayer(target: Player, amount: number, source: Player | null, isCrit = false, silent = false) {
    if (!target.alive) return;
    const reduced = amount * (1 - target.mods.damageReduction);
    target.hp -= reduced;

    if (source && source.team !== target.team) {
      source.ultCharge += reduced * TUNE.ultPerDamage;
      if (source.ultCharge > 100) source.ultCharge = 100;
    }

    if (target.hp <= 0) {
      target.hp = 0;
      target.alive = false;
      target.deaths++;
      target.respawnAt = this.time + TUNE.respawnTime;
      this.effects.spawnBurst(target.chestPos, target.hero.color, 26, 7);
      this.effects.hitFlash();

      // УЛЬТА-ЭХО
      if (target.ultEchoReady && !target.ultEchoUsed) {
        target.ultEchoUsed = true;
        target.ultEchoReady = false;
        this.useUlt(target);
      }

      if (source && source.team !== target.team) {
        source.kills++;
        source.score += 100 + (isCrit ? 25 : 0);
        source.ultCharge = Math.min(100, source.ultCharge + TUNE.ultPerKill);
        if (source.team === 0) this.roundKillsA++;
        else this.roundKillsB++;
        this.callbacks.onKillFeed(source.name, target.name, isCrit);
      } else {
        this.callbacks.onKillFeed('☠️', target.name, false);
      }

      if (target.isLocal) {
        this.audio.death();
        this.shake = 0.12;
      }
      if (source?.isLocal) this.audio.kill();
    } else if (!silent && target.isLocal && Math.random() < 0.3) {
      this.audio.hurt();
    }
  }

  // ============ Способности ============
  useQ(p: Player) {
    if (!p.alive || this.time < p.qReadyAt || this.phase !== 'playing') return;
    p.qReadyAt = this.time + p.hero.q.cd;
    if (p.isLocal) this.audio.ability();

    switch (p.hero.id) {
      case 'shilo': {
        const dir = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(0, p.yaw, 0, 'YXZ'));
        p.vel.x = dir.x * 24;
        p.vel.z = dir.z * 24;
        p.vel.y = Math.max(p.vel.y, 1.5);
        p.critNextShot = true;
        this.effects.spawnBurst(p.pos, 0xb6ff00, 20, 6);
        if (p.isLocal) this.callbacks.onToast('РЫВОК! Следующий выстрел — крит');
        break;
      }
      case 'spora': {
        this.spawnCloud(p, p.pos.clone(), 4.2, 6);
        break;
      }
      case 'golosa': {
        this.spawnClone(p);
        break;
      }
      case 'zhizha': {
        this.spawnPool(p, p.pos.clone(), 3.4, 7);
        break;
      }
    }
  }

  useE(p: Player) {
    if (!p.alive || this.time < p.eReadyAt || this.phase !== 'playing') return;
    p.eReadyAt = this.time + p.hero.e.cd;
    if (p.isLocal) this.audio.ability();
    const forward = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(0, p.yaw, 0, 'YXZ'));

    switch (p.hero.id) {
      case 'shilo': {
        const eye = p.eyePos;
        for (let i = 0; i < 7; i++) {
          const dir = forward.clone();
          dir.x += (Math.random() - 0.5) * 0.22;
          dir.y += (Math.random() - 0.5) * 0.1;
          dir.z += (Math.random() - 0.5) * 0.22;
          dir.normalize();
          this.shootRay(p, eye, dir, 30);
        }
        if (p.isLocal) this.callbacks.onToast('ШИЛО-ГРАД! 💥');
        break;
      }
      case 'spora': {
        this.spawnWall(p, forward, 0x7a00ff);
        if (p.doubleE) {
          setTimeout(() => this.spawnWall(p, forward, 0x7a00ff), 180);
        }
        break;
      }
      case 'golosa': {
        const base = p.pos.clone().add(forward.clone().multiplyScalar(8));
        for (let i = 0; i < 3; i++) {
          const offset = new THREE.Vector3((Math.random() - 0.5) * 10, 0, (Math.random() - 0.5) * 10);
          this.spawnGhost(base.clone().add(offset));
        }
        this.audio.slide();
        if (p.isLocal) this.callbacks.onToast('КТО-ТО ХОДИТ… 👻');
        break;
      }
      case 'zhizha': {
        this.spawnWall(p, forward, 0xffe600, true);
        break;
      }
    }
  }

  useUlt(p: Player) {
    if (!p.alive || p.ultCharge < 100 || this.phase !== 'playing') return;
    p.ultCharge = 0;
    p.ultActiveUntil = this.time + (p.hero.id === 'shilo' ? 6 : 5);
    if (p.isLocal) {
      this.audio.ult();
      this.effects.hitFlash();
      this.callbacks.onBanner(p.hero.ult.name, 'УЛЬТА!');
    }

    switch (p.hero.id) {
      case 'shilo':
        break; // пассивная ульта (скорость/темп)
      case 'spora': {
        for (const other of this.players) {
          if (other.team === p.team || !other.alive) continue;
          if (other.pos.distanceTo(p.pos) < 12) {
            other.addCurse('mirror', 3);
            other.addCurse('poison', 6);
          }
        }
        this.effects.spawnBurst(p.pos, 0x7a00ff, 40, 9);
        break;
      }
      case 'golosa': {
        for (const other of this.players) {
          if (other.team === p.team || !other.alive) continue;
          if (other.pos.distanceTo(p.pos) < 18) other.addCurse('chorus', 8);
        }
        this.effects.hitFlash();
        break;
      }
      case 'zhizha': {
        this.effects.spawnBurst(p.pos, 0xffe600, 40, 8);
        break;
      }
    }
  }

  // Ульт-обновление (каждый кадр)
  private updateUltStates(dt: number) {
    for (const p of this.players) {
      if (!p.alive || !p.isUltActive()) continue;
      if (p.hero.id === 'zhizha') {
        for (const other of this.players) {
          if (other.team === p.team || !other.alive) continue;
          if (other.pos.distanceTo(p.pos) < 4.5) {
            other.addCurse('slow', 0.5);
            this.damagePlayer(other, 20 * dt, p, false, true);
          }
        }
        p.hp = Math.min(p.maxHp, p.hp + 22 * dt);
      }
      // яд и кровотечение
      if (p.hasCurse('poison')) this.damagePlayer(p, 7 * dt, null, false, true);
      if (p.hasCurse('bleed')) this.damagePlayer(p, 3 * dt, null, false, true);
    }
  }

  // ============ Сущности ============
  private spawnPool(owner: Player, pos: THREE.Vector3, radius: number, duration: number) {
    const mult = owner.cardIds.includes('acid2') ? 1.5 : 1;
    const geo = new THREE.CircleGeometry(radius * mult, 24);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x88ff00, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(pos.x, 0.06, pos.z);
    this.scene.add(mesh);
    this.entities.push({
      kind: 'pool', obj: mesh, until: this.time + duration * mult, owner,
      radius: radius * mult, hp: Infinity, tickAt: 0,
    });
  }

  private spawnCloud(owner: Player, pos: THREE.Vector3, radius: number, duration: number) {
    const mult = owner.cardIds.includes('acid2') ? 1.5 : 1;
    const geo = new THREE.SphereGeometry(radius * mult, 14, 10);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x9dff3c, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(pos.x, 1.4, pos.z);
    this.scene.add(mesh);
    this.entities.push({
      kind: 'cloud', obj: mesh, until: this.time + duration * mult, owner,
      radius: radius * mult, hp: Infinity, tickAt: 0,
    });
  }

  private spawnWall(owner: Player, forward: THREE.Vector3, color: number, jelly = false) {
    const pos = owner.pos.clone().add(forward.clone().setY(0).normalize().multiplyScalar(2.6));
    const w = jelly ? 3.5 : 4.2, h = 2.5, d = 0.55;
    const geo = new THREE.BoxGeometry(w, h, d);
    const mat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(pos.x, pos.y + h / 2, pos.z);
    mesh.lookAt(owner.pos.x, mesh.position.y, owner.pos.z);
    mesh.rotateY(Math.PI / 2);
    this.scene.add(mesh);

    const collider: AABB = {
      min: new THREE.Vector3(pos.x - w / 2, pos.y, pos.z - d / 2),
      max: new THREE.Vector3(pos.x + w / 2, pos.y + h, pos.z + d / 2),
    };
    this.colliders.push(collider);
    this.entities.push({
      kind: 'wall', obj: mesh, until: this.time + 6, owner,
      radius: w / 2, hp: 150, tickAt: 0, colliderRef: collider,
      data: jelly ? 1 : 0,
    });
  }

  private spawnClone(owner: Player) {
    const geo = new THREE.CapsuleGeometry(0.4, 1.0, 6, 12);
    const mat = new THREE.MeshBasicMaterial({
      color: owner.hero.color, transparent: true, opacity: 0.55, wireframe: true,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(owner.pos).setY(owner.pos.y + 1);
    this.scene.add(mesh);
    const forward = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(0, owner.yaw, 0, 'YXZ'));
    this.entities.push({
      kind: 'clone', obj: mesh, until: this.time + 8, owner, radius: 0.9, hp: 60,
      tickAt: 0, vel: forward.multiplyScalar(8),
    });
  }

  private spawnGhost(pos: THREE.Vector3) {
    const geo = new THREE.SphereGeometry(0.55, 8, 8);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xff2a4d, transparent: true, opacity: 0.6, wireframe: true,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(pos).setY(1.2);
    this.scene.add(mesh);
    this.entities.push({
      kind: 'ghost', obj: mesh, until: this.time + 8, owner: this.localPlayer,
      radius: 0.6, hp: Infinity, tickAt: 0,
      vel: new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize().multiplyScalar(3),
    });
  }

  private spawnFrog() {
    const geo = new THREE.SphereGeometry(0.32, 8, 8);
    const mat = new THREE.MeshBasicMaterial({ color: 0x7cff3c });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set((Math.random() - 0.5) * 36, 14, (Math.random() - 0.5) * 36);
    this.scene.add(mesh);
    this.entities.push({
      kind: 'frog', obj: mesh, until: this.time + 20, owner: this.localPlayer,
      radius: 0.5, hp: Infinity, tickAt: 0, vel: new THREE.Vector3(0, -8, 0),
    });
  }

  private updateEntities(dt: number, now: number) {
    this.updateUltStates(dt);
    for (let i = this.entities.length - 1; i >= 0; i--) {
      const e = this.entities[i];
      if (now > e.until || e.hp <= 0) {
        this.scene.remove(e.obj);
        if (e.kind === 'wall' && e.colliderRef) {
          const idx = this.colliders.indexOf(e.colliderRef);
          if (idx >= 0) this.colliders.splice(idx, 1);
        }
        this.entities.splice(i, 1);
        continue;
      }

      switch (e.kind) {
        case 'pool': {
          if (now >= e.tickAt) {
            e.tickAt = now + 0.25;
            for (const p of this.players) {
              if (!p.alive) continue;
              const d = p.pos.distanceTo(e.obj.position);
              if (d < e.radius) {
                if (p.team === e.owner.team) {
                  p.addCurse('slow', 0.3);
                } else {
                  this.damagePlayer(p, 14 * 0.25, e.owner, false, true);
                  p.addCurse('slow', 0.4);
                }
              }
            }
          }
          break;
        }
        case 'cloud': {
          if (now >= e.tickAt) {
            e.tickAt = now + 0.25;
            for (const p of this.players) {
              if (!p.alive) continue;
              if (p.pos.distanceTo(e.obj.position) < e.radius) {
                if (p.team === e.owner.team) {
                  p.hp = Math.min(p.maxHp, p.hp + 14 * 0.25);
                } else {
                  this.damagePlayer(p, 6 * 0.25, e.owner, false, true);
                  p.addCurse('flies', 1);
                }
              }
            }
          }
          const m = (e.obj as THREE.Mesh).material as THREE.MeshBasicMaterial;
          m.opacity = 0.22 + Math.sin(now * 3) * 0.05;
          break;
        }
        case 'clone': {
          if (e.vel) {
            e.obj.position.addScaledVector(e.vel, dt);
            (e.obj as THREE.Mesh).rotation.y += dt * 4;
          }
          break;
        }
        case 'ghost': {
          if (e.vel) {
            e.obj.position.addScaledVector(e.vel, dt);
            e.obj.position.y = 1.2 + Math.sin(now * 2 + e.obj.position.x) * 0.35;
          }
          break;
        }
        case 'frog': {
          if (e.vel) {
            e.obj.position.addScaledVector(e.vel, dt);
            if (e.obj.position.y < 0.3) {
              e.obj.position.y = 0.3;
              e.vel.y = Math.abs(e.vel.y) * 0.35;
              e.vel.x = (Math.random() - 0.5) * 4;
              e.vel.z = (Math.random() - 0.5) * 4;
            }
            for (const p of this.players) {
              if (p.alive && p.pos.distanceTo(e.obj.position) < 1.1) {
                p.addCurse('slow', 1.2);
                this.effects.spawnBurst(e.obj.position, 0x7cff3c, 8, 3);
                e.until = 0;
              }
            }
          }
          break;
        }
      }
    }
  }

  // ============ Карты ============
  getDraftCards(): CardDef[] {
    return pickDraft(this.localPlayer.cardIds, 3);
  }

  chooseDraftCard(card: CardDef) {
    const p = this.localPlayer;
    p.cardIds.push(card.id);
    recomputeMods(p);
    this.audio.card();
    const isActive = card.type === 'ruin' || card.type === 'chaos';
    this.callbacks.onToast(
      isActive ? `КАРТА: ${card.name} (3/4 — сыграть)` : `ПАССИВКА: ${card.name}`,
    );

    // боты тоже качаются
    for (const bot of this.bots) {
      const pool = CARDS.filter((c) => c.type === 'upgrade' || c.type === 'mutation');
      const c = pool[Math.floor(Math.random() * pool.length)];
      bot.player.cardIds.push(c.id);
      recomputeMods(bot.player);
    }

    // следующий раунд
    this.roundNumber++;
    this.startRound();
  }

  playCardByIndex(handIndex: number) {
    // активные карты в слотах 2..3 (индексы), пассивные просто есть
    const p = this.localPlayer;
    const actives = p.cardIds
      .map((id) => CARDS.find((c) => c.id === id))
      .filter((c): c is CardDef => !!c && (c.type === 'ruin' || c.type === 'chaos'));
    const card = actives[handIndex];
    if (card) {
      this.playActiveCard(p, card);
      p.cardIds = p.cardIds.filter((id) => id !== card.id);
      recomputeMods(p);
    }
  }

  playActiveCard(caster: Player, card: CardDef) {
    this.audio.boom();
    const enemies = this.players.filter((p) => p.team !== caster.team && p.alive);
    const target = enemies.sort((a, b) => a.pos.distanceTo(caster.pos) - b.pos.distanceTo(caster.pos))[0];

    switch (card.curse) {
      case 'mirror':
        target?.addCurse('mirror', card.duration ?? 8);
        if (target?.isLocal) this.callbacks.onToast('ЗЕРКАЛО! Управление инвертировано 🪞');
        break;
      case 'hat':
        target?.addCurse('hat', card.duration ?? 5);
        if (target?.isLocal) this.callbacks.onToast('ШЛЯПА! 🎩');
        break;
      case 'steps':
        target?.addCurse('steps', card.duration ?? 15);
        if (target?.isLocal) this.callbacks.onToast('Кто-то ходит… 👣');
        break;
      case 'fakehp':
        target?.addCurse('fakehp', card.duration ?? 10);
        if (target?.isLocal) this.callbacks.onToast('Тебе кажется, что тебе больно 🤥');
        break;
      case 'podslushka':
        caster.addCurse('podslushka', card.duration ?? 20);
        if (caster.isLocal) this.callbacks.onToast('Подслушка включена 🎧');
        break;
      case 'flies':
        target?.addCurse('flies', card.duration ?? 12);
        if (target?.isLocal) this.callbacks.onToast('МУХИ! 🪰');
        break;
      case 'oldshoes':
        target?.addCurse('oldshoes', card.duration ?? 12);
        if (target?.isLocal) this.callbacks.onToast('СТАРЫЕ КРОССОВКИ! 👟');
        break;
      case 'slippery':
        target?.addCurse('slippery', card.duration ?? 10);
        if (target?.isLocal) this.callbacks.onToast('СКОЛЬЗКИЙ ПОЛ! 🧊');
        break;
      case 'trip':
        this.tripTimer = card.duration ?? 15;
        this.callbacks.onToast('ТРИП! 🌀');
        break;
      case 'swap': {
        const all = this.players.filter((p) => p.alive);
        if (all.length >= 2) {
          const a = all[Math.floor(Math.random() * all.length)];
          let b = all[Math.floor(Math.random() * all.length)];
          if (a === b) b = all[(all.indexOf(a) + 1) % all.length];
          const tmp = a.pos.clone();
          a.pos.copy(b.pos);
          b.pos.copy(tmp);
          this.effects.spawnBurst(a.pos, 0xffe600, 30, 8);
          this.effects.spawnBurst(b.pos, 0xffe600, 30, 8);
          this.callbacks.onToast('ОБМЕН ТЕЛАМИ! 🫠');
        }
        break;
      }
      case 'voicecharge':
        this.voiceChargeTimer = card.duration ?? 10;
        this.callbacks.onToast('ГОЛОСОВОЙ ЗАРЯД! Болтайте! 🎤');
        break;
      case 'frogs':
        this.frogsTimer = card.duration ?? 20;
        this.callbacks.onToast('ДОЖДЬ ИЗ ЖАБ! 🐸');
        break;
      case 'vol11':
        this.volTimer = card.duration ?? 12;
        this.audio.setSfxVolume(Math.min(1, this.audio.sfxVolume * 1.6));
        setTimeout(() => this.audio.setSfxVolume(this.audio.sfxVolume / 1.6), (card.duration ?? 12) * 1000);
        this.callbacks.onToast('ГРОМКОСТЬ 11! 🔊');
        break;
      case 'bass':
        this.bassTimer = card.duration ?? 8;
        this.callbacks.onToast('ОБЩИЙ БАСС! 🎵');
        break;
    }
  }

  // ============ Раунды ============
  private endRound(winner: 0 | 1) {
    this.phase = 'roundEnd';
    this.callbacks.onPhase(this.phase);
    if (winner === 0) this.scoreA++;
    else this.scoreB++;
    const localWon = this.localPlayer.team === winner;
    if (localWon) this.audio.roundWin();
    else this.audio.roundLose();
    this.callbacks.onBanner(localWon ? 'РАУНД ЗА ТЕБЯ!' : 'РАУНД ПРОИГРАН', `счёт ${this.scoreA} : ${this.scoreB}`);

    const matchOver = this.scoreA >= TUNE.roundsToWin || this.scoreB >= TUNE.roundsToWin;
    setTimeout(() => {
      if (matchOver) {
        this.phase = 'matchEnd';
        this.callbacks.onPhase(this.phase);
        const winnerTeam: 0 | 1 = this.scoreA > this.scoreB ? 0 : 1;
        this.callbacks.onMatchEnd(winnerTeam, this.localPlayer.team === winnerTeam, { a: this.scoreA, b: this.scoreB });
      } else {
        this.phase = 'draft';
        this.callbacks.onPhase(this.phase);
        this.callbacks.onDraft(this.getDraftCards());
      }
    }, 2200);
    this.roundStartTime = this.time;
  }

  // подсчёт очков для таблицы рекордов
  getMatchScore(): number {
    return this.localPlayer.score + this.localPlayer.kills * 50 + this.scoreA * 300;
  }

  startRoundTimer() {
    this.roundStartTime = this.time;
  }

  dispose() {
    this.running = false;
    this.audio.stopMusic();
    document.exitPointerLock?.();
  }
}
