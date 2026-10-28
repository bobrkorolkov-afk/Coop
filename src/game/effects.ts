import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

// Кастомный пост-шейдер: grain + хроматика + виньетка + глитч + инверсия
const PostShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uTime: { value: 0 },
    uGlitch: { value: 0 },
    uInvert: { value: 0 },
    uChroma: { value: 0.0018 },
    uGrain: { value: 0.055 },
    uVignette: { value: 0.32 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime, uGlitch, uInvert, uChroma, uGrain, uVignette;
    varying vec2 vUv;

    float rand(vec2 co) {
      return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
    }

    void main() {
      vec2 uv = vUv;

      // глитч: горизонтальные сдвиги
      if (uGlitch > 0.001) {
        float n = rand(vec2(floor(uv.y * 36.0), floor(uTime * 14.0)));
        uv.x += (n - 0.5) * 0.11 * uGlitch * step(0.72, n);
      }

      // хроматическая аберрация
      float ca = uChroma * (1.0 + uGlitch * 7.0);
      vec2 dir = uv - 0.5;
      float r = texture2D(tDiffuse, uv + dir * ca).r;
      float g = texture2D(tDiffuse, uv).g;
      float b = texture2D(tDiffuse, uv - dir * ca).b;
      vec3 col = vec3(r, g, b);

      // grain
      float grain = (rand(uv * (uTime + 1.0)) - 0.5) * uGrain;
      col += grain;

      // виньетка
      float d = length(dir * vec2(1.15, 1.0));
      col *= smoothstep(0.95, 0.35, d * uVignette * 2.2);

      // инверсия (кислотный трип)
      if (uInvert > 0.001) col = mix(col, 1.0 - col, uInvert);

      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

export class Effects {
  composer: EffectComposer;
  bloomPass: UnrealBloomPass;
  postPass: ShaderPass;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;

  // частицы
  private particleGeo = new THREE.BufferGeometry();
  private particleMax = 900;
  private pPos: Float32Array;
  private pVel: Float32Array;
  private pLife: Float32Array;
  private pSize: Float32Array;
  private pColor: Float32Array;
  private pCount = 0;
  private points: THREE.Points;

  // трейсеры
  private tracers: { mesh: THREE.Mesh; life: number }[] = [];

  glitch = 0;     // 0..1 сила глитча
  invert = 0;     // 0..1 инверсия цвета

  constructor(scene: THREE.Scene, camera: THREE.PerspectiveCamera, renderer: THREE.WebGLRenderer) {
    this.scene = scene;
    this.camera = camera;

    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.85, 0.55, 0.18);
    this.composer.addPass(this.bloomPass);
    this.postPass = new ShaderPass(PostShader);
    this.composer.addPass(this.postPass);

    // инициализация буфера частиц
    this.pPos = new Float32Array(this.particleMax * 3);
    this.pVel = new Float32Array(this.particleMax * 3);
    this.pLife = new Float32Array(this.particleMax);
    this.pSize = new Float32Array(this.particleMax);
    this.pColor = new Float32Array(this.particleMax * 3);
    this.particleGeo.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3));
    this.particleGeo.setAttribute('size', new THREE.BufferAttribute(this.pSize, 1));
    this.particleGeo.setAttribute('color', new THREE.BufferAttribute(this.pColor, 3));

    const mat = new THREE.PointsMaterial({
      size: 0.14,
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });
    this.points = new THREE.Points(this.particleGeo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  resize(w: number, h: number) {
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  setBloom(enabled: boolean) {
    this.bloomPass.strength = enabled ? 0.85 : 0.0;
    this.postPass.uniforms.uGrain.value = enabled ? 0.055 : 0.02;
    this.postPass.uniforms.uChroma.value = enabled ? 0.0018 : 0.0004;
  }

  spawnBurst(pos: THREE.Vector3, color: THREE.Color | number, count = 14, speed = 5, size = 0.14) {
    const c = new THREE.Color(color);
    for (let i = 0; i < count; i++) {
      if (this.pCount >= this.particleMax) this.pCount = 0;
      const idx = this.pCount++;
      const i3 = idx * 3;
      this.pPos[i3] = pos.x; this.pPos[i3 + 1] = pos.y; this.pPos[i3 + 2] = pos.z;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const sp = speed * (0.35 + Math.random() * 0.85);
      this.pVel[i3] = Math.sin(phi) * Math.cos(theta) * sp;
      this.pVel[i3 + 1] = Math.abs(Math.cos(phi)) * sp * 0.9;
      this.pVel[i3 + 2] = Math.sin(phi) * Math.sin(theta) * sp;
      this.pLife[idx] = 0.35 + Math.random() * 0.5;
      this.pSize[idx] = size * (0.6 + Math.random());
      this.pColor[i3] = c.r; this.pColor[i3 + 1] = c.g; this.pColor[i3 + 2] = c.b;
    }
  }

  spawnTracer(from: THREE.Vector3, to: THREE.Vector3, color: number | THREE.Color = 0xb6ff00) {
    const dir = to.clone().sub(from);
    const len = dir.length();
    if (len < 0.05) return;
    const geo = new THREE.CylinderGeometry(0.018, 0.018, len, 5, 1, true);
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(from).add(dir.multiplyScalar(0.5));
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
    this.scene.add(mesh);
    this.tracers.push({ mesh, life: 0.09 });
  }

  update(dt: number, time: number) {
    // частицы
    for (let i = 0; i < this.particleMax; i++) {
      if (this.pLife[i] <= 0) continue;
      const i3 = i * 3;
      this.pLife[i] -= dt;
      this.pVel[i3 + 1] -= 9.5 * dt;
      this.pPos[i3] += this.pVel[i3] * dt;
      this.pPos[i3 + 1] += this.pVel[i3 + 1] * dt;
      this.pPos[i3 + 2] += this.pVel[i3 + 2] * dt;
      if (this.pPos[i3 + 1] < 0.05) {
        this.pPos[i3 + 1] = 0.05;
        this.pVel[i3 + 1] *= -0.35;
        this.pVel[i3] *= 0.7;
        this.pVel[i3 + 2] *= 0.7;
      }
      if (this.pLife[i] <= 0) {
        this.pSize[i] = 0;
        this.pPos[i3 + 1] = -50;
      }
    }
    (this.particleGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.particleGeo.attributes.size as THREE.BufferAttribute).needsUpdate = true;
    (this.particleGeo.attributes.color as THREE.BufferAttribute).needsUpdate = true;

    // трейсеры
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.life -= dt;
      const m = t.mesh.material as THREE.MeshBasicMaterial;
      m.opacity = Math.max(0, t.life / 0.09) * 0.85;
      if (t.life <= 0) {
        this.scene.remove(t.mesh);
        t.mesh.geometry.dispose();
        m.dispose();
        this.tracers.splice(i, 1);
      }
    }

    // пост-параметры
    const u = this.postPass.uniforms;
    u.uTime.value = time;
    u.uGlitch.value = this.glitch;
    u.uInvert.value = this.invert;
    this.glitch = Math.max(0, this.glitch - dt * 2.2);
    // invert управляется снаружи (таймером карты)
  }

  hitFlash() {
    this.glitch = Math.min(1, this.glitch + 0.25);
  }
}
