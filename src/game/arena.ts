import * as THREE from 'three';

export interface AABB {
  min: THREE.Vector3;
  max: THREE.Vector3;
}

export interface ArenaData {
  group: THREE.Group;
  colliders: AABB[];
  spawnPoints: THREE.Vector3[];
  acidZones: { pos: THREE.Vector3; radius: number }[];
  jumpPads: { pos: THREE.Vector3; radius: number; power: number }[];
}

const BOX = (w: number, h: number, d: number, x: number, y: number, z: number): AABB => ({
  min: new THREE.Vector3(x - w / 2, y - h / 2, z - d / 2),
  max: new THREE.Vector3(x + w / 2, y + h / 2, z + d / 2),
});

export function buildArena(): ArenaData {
  const group = new THREE.Group();
  const colliders: AABB[] = [];
  const acidZones: ArenaData['acidZones'] = [];
  const jumpPads: ArenaData['jumpPads'] = [];

  // ——— Материалы ———
  const matFloor = new THREE.MeshStandardMaterial({ color: 0x1a0b33, roughness: 0.85, metalness: 0.25 });
  const matMetal = new THREE.MeshStandardMaterial({ color: 0x2b1548, roughness: 0.55, metalness: 0.7 });
  const matRust = new THREE.MeshStandardMaterial({ color: 0x4a2036, roughness: 0.9, metalness: 0.35 });
  const matNeonA = new THREE.MeshStandardMaterial({ color: 0x0d0221, emissive: 0xb6ff00, emissiveIntensity: 2.2, roughness: 0.4 });
  const matNeonB = new THREE.MeshStandardMaterial({ color: 0x0d0221, emissive: 0xff2bd6, emissiveIntensity: 2.0, roughness: 0.4 });
  const matNeonC = new THREE.MeshStandardMaterial({ color: 0x0d0221, emissive: 0x7a00ff, emissiveIntensity: 2.4, roughness: 0.4 });
  const matAcid = new THREE.MeshStandardMaterial({
    color: 0x2a4a00, emissive: 0x88ff00, emissiveIntensity: 1.7, roughness: 0.15, metalness: 0.1,
    transparent: true, opacity: 0.9,
  });

  const addBox = (
    w: number, h: number, d: number, x: number, y: number, z: number,
    mat: THREE.Material, solid = true,
  ) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    group.add(mesh);
    if (solid) colliders.push(BOX(w, h, d, x, y, z));
    return mesh;
  };

  // ——— Пол и стены ———
  addBox(46, 1, 46, 0, -0.5, 0, matFloor);
  addBox(46, 8, 1.2, 0, 4, -23, matMetal);
  addBox(46, 8, 1.2, 0, 4, 23, matMetal);
  addBox(1.2, 8, 46, -23, 4, 0, matMetal);
  addBox(1.2, 8, 46, 23, 4, 0, matMetal);

  // Неоновые плинтусы вдоль стен
  addBox(46, 0.18, 0.25, 0, 0.2, -22.3, matNeonA, false);
  addBox(46, 0.18, 0.25, 0, 0.2, 22.3, matNeonB, false);
  addBox(0.25, 0.18, 46, -22.3, 0.2, 0, matNeonB, false);
  addBox(0.25, 0.18, 46, 22.3, 0.2, 0, matNeonA, false);

  // ——— Центральная сцена ———
  addBox(12, 1.2, 12, 0, 0.6, 0, matRust);
  addBox(12.6, 0.16, 12.6, 0, 1.28, 0, matNeonC, false);
  // ступени к сцене
  addBox(4, 0.4, 2, 0, 0.2, 7.4, matMetal);
  addBox(4, 0.8, 2, 0, 0.4, 9.2, matMetal);
  addBox(4, 0.4, 2, 0, 0.2, -7.4, matMetal);
  addBox(4, 0.8, 2, 0, 0.4, -9.2, matMetal);
  addBox(2, 0.4, 4, 7.4, 0.2, 0, matMetal);
  addBox(2, 0.8, 4, 9.2, 0.4, 0, matMetal);
  addBox(2, 0.4, 4, -7.4, 0.2, 0, matMetal);
  addBox(2, 0.8, 4, -9.2, 0.4, 0, matMetal);

  // ——— Башни-колонки (по углам) ———
  const speaker = (x: number, z: number, neon: THREE.Material) => {
    addBox(3.2, 5.5, 3.2, x, 2.75, z, matRust);
    addBox(3.4, 0.3, 3.4, x, 5.65, z, neon, false);
    // динамики
    const cone = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.15, 0.35, 18), matNeonC);
    cone.rotation.x = Math.PI / 2;
    cone.position.set(x, 3.1, z + (z > 0 ? -1.65 : 1.65));
    group.add(cone);
    const cone2 = cone.clone();
    cone2.position.y = 1.6;
    group.add(cone2);
  };
  speaker(-16, -16, matNeonA);
  speaker(16, -16, matNeonB);
  speaker(-16, 16, matNeonB);
  speaker(16, 16, matNeonA);

  // ——— Возвышенные мостики ———
  addBox(10, 0.5, 3, -13, 3.2, 0, matMetal);
  addBox(10, 0.5, 3, 13, 3.2, 0, matMetal);
  addBox(3, 0.5, 10, 0, 3.2, -13, matMetal);
  addBox(3, 0.5, 10, 0, 3.2, 13, matMetal);
  // опоры
  for (const [x, z] of [[-17.2, -1.2], [-17.2, 1.2], [17.2, -1.2], [17.2, 1.2], [-1.2, -17.2], [1.2, -17.2], [-1.2, 17.2], [1.2, 17.2]] as const) {
    addBox(1, 3.2, 1, x, 1.6, z, matRust);
  }
  // перила-неон
  addBox(10, 0.14, 0.2, -13, 3.9, -1.45, matNeonA, false);
  addBox(10, 0.14, 0.2, -13, 3.9, 1.45, matNeonB, false);
  addBox(10, 0.14, 0.2, 13, 3.9, -1.45, matNeonB, false);
  addBox(10, 0.14, 0.2, 13, 3.9, 1.45, matNeonA, false);

  // ——— Ящики / укрытия ———
  addBox(2.2, 2.2, 2.2, -8, 1.1, -10, matRust);
  addBox(2.2, 1.4, 2.2, -8, 0.7, -12.4, matMetal);
  addBox(2.2, 2.2, 2.2, 8, 1.1, 10, matRust);
  addBox(2.2, 1.4, 2.2, 8, 0.7, 12.4, matMetal);
  addBox(2.2, 2.6, 2.2, -12, 1.3, 8, matMetal);
  addBox(2.2, 2.6, 2.2, 12, 1.3, -8, matMetal);
  addBox(3, 1.1, 1.2, 0, 0.55, -15.5, matRust);
  addBox(3, 1.1, 1.2, 0, 0.55, 15.5, matRust);

  // ——— Кислотные бочки (опасные зоны) ———
  const barrel = (x: number, z: number) => {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 1.8, 14), matAcid);
    b.position.set(x, 0.9, z);
    group.add(b);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.08, 8, 22), matNeonA);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(x, 1.35, z);
    group.add(ring);
    colliders.push(BOX(1.7, 1.8, 1.7, x, 0.9, z));
    acidZones.push({ pos: new THREE.Vector3(x, 0, z), radius: 2.2 });
  };
  barrel(-6.5, -14);
  barrel(6.5, 14);
  barrel(-14, 6.5);
  barrel(14, -6.5);

  // Лужа кислоты (плоская, только урон)
  const pool = new THREE.Mesh(new THREE.CircleGeometry(2.6, 26), matAcid);
  pool.rotation.x = -Math.PI / 2;
  pool.position.set(-16, 0.03, -5);
  group.add(pool);
  acidZones.push({ pos: new THREE.Vector3(-16, 0, -5), radius: 2.6 });
  const pool2 = pool.clone();
  pool2.position.set(16, 0.03, 5);
  group.add(pool2);
  acidZones.push({ pos: new THREE.Vector3(16, 0, 5), radius: 2.6 });

  // ——— Джамп-пады ———
  const pad = (x: number, z: number) => {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.7, 0.3, 18), matNeonB);
    p.position.set(x, 0.15, z);
    group.add(p);
    jumpPads.push({ pos: new THREE.Vector3(x, 0.3, z), radius: 1.7, power: 13.5 });
  };
  pad(-19, -19);
  pad(19, 19);

  // ——— Декор: прожекторы, флаги ———
  for (let i = 0; i < 8; i++) {
    const ang = (i / 8) * Math.PI * 2;
    const x = Math.cos(ang) * 21.2;
    const z = Math.sin(ang) * 21.2;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 4.2, 8), matMetal);
    pole.position.set(x, 2.1, z);
    group.add(pole);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 10), i % 2 ? matNeonA : matNeonB);
    lamp.position.set(x, 4.3, z);
    group.add(lamp);
  }

  // Вывеска «БЭДТРИП» — просто светящаяся планка над входом
  addBox(10, 1.6, 0.4, 0, 6.4, -22.3, matNeonB, false);

  // ——— Спавны (команда A — с юга, команда B — с севера) ———
  const spawnPoints = [
    new THREE.Vector3(-6, 0.1, 18), new THREE.Vector3(6, 0.1, 18),
    new THREE.Vector3(-2, 0.1, 16), new THREE.Vector3(2, 0.1, 16),
    new THREE.Vector3(-6, 0.1, -18), new THREE.Vector3(6, 0.1, -18),
    new THREE.Vector3(-2, 0.1, -16), new THREE.Vector3(2, 0.1, -16),
  ];

  return { group, colliders, spawnPoints, acidZones, jumpPads };
}

// Разрешение коллизии AABB игрока против списка твёрдых тел (по осям)
export function collideMove(
  pos: THREE.Vector3,
  vel: THREE.Vector3,
  dt: number,
  colliders: AABB[],
  radius: number,
  height: number,
): { onGround: boolean; hitWall: boolean } {
  let onGround = false;
  let hitWall = false;

  const move = vel.clone().multiplyScalar(dt);
  const steps = Math.max(1, Math.ceil(move.length() / 0.35));
  const step = move.divideScalar(steps);

  for (let s = 0; s < steps; s++) {
    // X
    pos.x += step.x;
    for (const c of colliders) {
      if (boxOverlap(pos, radius, height, c)) {
        if (step.x > 0) pos.x = c.min.x - radius - 0.001;
        else if (step.x < 0) pos.x = c.max.x + radius + 0.001;
        vel.x = 0;
        hitWall = true;
      }
    }
    // Z
    pos.z += step.z;
    for (const c of colliders) {
      if (boxOverlap(pos, radius, height, c)) {
        if (step.z > 0) pos.z = c.min.z - radius - 0.001;
        else if (step.z < 0) pos.z = c.max.z + radius + 0.001;
        vel.z = 0;
        hitWall = true;
      }
    }
    // Y
    pos.y += step.y;
    for (const c of colliders) {
      if (boxOverlap(pos, radius, height, c)) {
        if (step.y < 0) {
          pos.y = c.max.y + 0.001;
          onGround = true;
        } else if (step.y > 0) {
          pos.y = c.min.y - height - 0.001;
        }
        vel.y = 0;
      }
    }
  }
  return { onGround, hitWall };
}

function boxOverlap(pos: THREE.Vector3, radius: number, height: number, c: AABB): boolean {
  return (
    pos.x + radius > c.min.x && pos.x - radius < c.max.x &&
    pos.z + radius > c.min.z && pos.z - radius < c.max.z &&
    pos.y + height > c.min.y && pos.y < c.max.y
  );
}

// Щуп земли: слегка «опускаем» игрока и смотрим, касается ли он твёрдого тела
export function probeGround(
  pos: THREE.Vector3,
  colliders: AABB[],
  radius: number,
  height: number,
  gap = 0.12,
): boolean {
  const p = new THREE.Vector3(pos.x, pos.y - gap, pos.z);
  for (const c of colliders) {
    if (boxOverlap(p, radius, height, c)) return true;
  }
  return false;
}

// Пересечение отрезка (луч) с AABB — для стрельбы
export function raycastAABB(origin: THREE.Vector3, dir: THREE.Vector3, maxDist: number, c: AABB): number | null {
  const inv = new THREE.Vector3(1 / dir.x, 1 / dir.y, 1 / dir.z);
  const t1 = (c.min.x - origin.x) * inv.x;
  const t2 = (c.max.x - origin.x) * inv.x;
  const t3 = (c.min.y - origin.y) * inv.y;
  const t4 = (c.max.y - origin.y) * inv.y;
  const t5 = (c.min.z - origin.z) * inv.z;
  const t6 = (c.max.z - origin.z) * inv.z;
  const tmin = Math.max(Math.min(t1, t2), Math.min(t3, t4), Math.min(t5, t6));
  const tmax = Math.min(Math.max(t1, t2), Math.max(t3, t4), Math.max(t5, t6));
  if (tmax < 0 || tmin > tmax || tmin > maxDist) return null;
  return tmin >= 0 ? tmin : tmax;
}
