import * as THREE from 'three';
import { raycastAABB, type AABB } from './arena';
import type { InputState, Player } from './player';

interface BotBrain {
  target: Player | null;
  strafeDir: 1 | -1;
  nextThink: number;
  nextSlide: number;
  aimError: number;
  jumpHold: number;
  wander: THREE.Vector3;
}

const BOT_NAMES = ['КРЭК-БОТ', 'ГРИБОЙД', 'ПЫЛЬ', 'АУРА', 'ШУМ', 'ВХУЙ'];

export function botName(i: number): string {
  return BOT_NAMES[i % BOT_NAMES.length];
}

export class BotController {
  brain: BotBrain = {
    target: null,
    strafeDir: 1,
    nextThink: 0,
    nextSlide: 0,
    aimError: 0.05,
    jumpHold: 0,
    wander: new THREE.Vector3(),
  };

  constructor(public player: Player, public difficulty = 0.75) {}

  update(
    dt: number,
    time: number,
    allPlayers: Player[],
    colliders: AABB[],
    input: InputState,
  ) {
    const p = this.player;
    const b = this.brain;

    // сброс удержания кнопок
    input.forward = input.back = input.left = input.right = input.jump = input.crouch = false;

    if (time >= b.nextThink) {
      b.nextThink = time + 0.35 + Math.random() * 0.35;
      // цель — ближайший живой враг
      let best: Player | null = null;
      let bestD = Infinity;
      for (const other of allPlayers) {
        if (other.team === p.team || !other.alive || other === p) continue;
        const d = p.pos.distanceTo(other.pos);
        if (d < bestD) {
          bestD = d;
          best = other;
        }
      }
      b.target = best;
      if (Math.random() < 0.3) b.strafeDir = (Math.random() < 0.5 ? 1 : -1) as 1 | -1;
      b.aimError = 0.045 + (1 - this.difficulty) * 0.11;
    }

    const target = b.target;
    if (!target || !target.alive) {
      // патруль к центру
      const toCenter = new THREE.Vector3(0, p.pos.y, 0).sub(p.pos);
      if (toCenter.length() > 2) {
        this.lookAt(p, new THREE.Vector3(0, p.pos.y + 1, 0), 0);
        input.forward = true;
      }
      return;
    }

    const toTarget = target.pos.clone().sub(p.pos);
    const dist = toTarget.length();
    const flat = new THREE.Vector3(toTarget.x, 0, toTarget.z).normalize();

    // ——— Наведение ———
    const desiredYaw = Math.atan2(-flat.x, -flat.z) + (Math.random() - 0.5) * b.aimError * dist * 0.02;
    const aimPoint = target.chestPos.clone();
    const dxz = Math.hypot(toTarget.x, toTarget.z);
    const desiredPitch = -Math.atan2(aimPoint.y - p.eyePos.y, dxz) + (Math.random() - 0.5) * b.aimError * 0.35;

    let yawDiff = desiredYaw - p.yaw;
    while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
    while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
    p.yaw += yawDiff * Math.min(1, dt * 7 * this.difficulty + dt * 2);
    p.pitch += (desiredPitch - p.pitch) * Math.min(1, dt * 6);

    // ——— Движение ———
    const idealRange = p.hero.id === 'zhizha' ? 6 : p.hero.id === 'spora' ? 9 : 14;
    input.forward = dist > idealRange;
    input.back = dist < idealRange * 0.55;

    // стрейф
    if (dist < 22) {
      if (b.strafeDir > 0) input.right = true;
      else input.left = true;
    }

    // бхоп-привычка: прыгаем на скорости
    b.jumpHold -= dt;
    if (p.onGround && p.horizontalSpeed > 6.5 && Math.random() < dt * 3.2) {
      b.jumpHold = 0.12;
    }
    if (b.jumpHold > 0) input.jump = true;

    // слайд на разгоне
    if (time > b.nextSlide && p.horizontalSpeed > 8 && p.onGround && Math.random() < dt * 0.7) {
      b.nextSlide = time + 3 + Math.random() * 3;
      input.crouch = true;
    } else if (p.sliding && Math.random() < dt * 2) {
      input.crouch = true;
    }

    // прыжок-падение с уступов: если близко и выше — подпрыгиваем
    if (target.pos.y > p.pos.y + 1.2 && dist < 6 && p.onGround) input.jump = true;

    // ——— ЛОС и стрельба ———
    const eye = p.eyePos;
    const dir = target.chestPos.clone().sub(eye).normalize();
    const maxDist = p.hero.weapon.range;
    let blocked = false;
    for (const c of colliders) {
      const t = raycastAABB(eye, dir, maxDist, c);
      if (t !== null && t < dist - 1.2) {
        blocked = true;
        break;
      }
    }
    this.lastLos = !blocked && dist < maxDist;
  }

  lastLos = false;

  private lookAt(p: Player, point: THREE.Vector3, ease: number) {
    const d = point.clone().sub(p.pos);
    p.yaw = Math.atan2(-d.x, -d.z) * (1 - ease) + p.yaw * ease;
  }
}
