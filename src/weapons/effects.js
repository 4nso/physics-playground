// Effetti dei colpi: scie dei proiettili, scintille/schegge, lampo di luce sulla scena.
import * as THREE from 'three';
import { scene } from '../core/renderer.js';
import { glowMat } from '../core/glow.js';

/* ---------- Scie: brevi strisce che viaggiano veloci dalla canna al bersaglio ---------- */
const TRACERS = 40, TRACER_SPEED = 260, TRACER_LEN = 2.5;
const tracerGeo = new THREE.BoxGeometry(1, 1, 1);
const tracerMat = glowMat(new THREE.MeshBasicMaterial({ color: 0xfff1a8, transparent: true, opacity: 0.85, depthWrite: false }), 2.2);
const tracers = [];
for (let i = 0; i < TRACERS; i++) {
  const m = new THREE.Mesh(tracerGeo, tracerMat);
  m.visible = false;
  m.frustumCulled = false;
  scene.add(m);
  tracers.push({ m, from: new THREE.Vector3(), dir: new THREE.Vector3(), total: 0, head: 0 });
}
let nextTracer = 0;
const tmp = new THREE.Vector3();

export function addTracer(from, to) {
  const t = tracers[nextTracer];
  nextTracer = (nextTracer + 1) % TRACERS;
  t.from.copy(from);
  t.dir.copy(to).sub(from);
  t.total = t.dir.length();
  if (t.total < 0.5) return;
  t.dir.divideScalar(t.total);
  t.head = Math.min(t.total, 1.2);
  t.m.visible = true;
  placeTracer(t);
}
function placeTracer(t) {
  const len = Math.min(TRACER_LEN, t.head);
  t.m.position.copy(t.from).addScaledVector(t.dir, t.head - len / 2);
  t.m.lookAt(tmp.copy(t.m.position).add(t.dir));
  t.m.scale.set(0.022, 0.022, len);
}

/* ---------- Particelle: scintille, schegge di legno, zolle di terra ---------- */
const N = 360;
const pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
const vel = new Float32Array(N * 3), life = new Float32Array(N);
for (let i = 0; i < N; i++) pos[i * 3 + 1] = -9999;
const pGeo = new THREE.BufferGeometry();
pGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
pGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
const points = new THREE.Points(pGeo, glowMat(new THREE.PointsMaterial({ size: 0.07, vertexColors: true }), 1.8));
points.frustumCulled = false;
scene.add(points);
let nextP = 0, alive = 0;

const PALETTES = {
  stone: [0xfff0a0, 0xffc040, 0xb8b0a0],
  metal: [0xfff6c0, 0xffd050, 0xff9a30],
  wood: [0xc68a4a, 0x8a5a2b, 0xffd050],
  dirt: [0x6b8f3a, 0x7a5a32, 0xa0c060],
  soft: [0xffffff, 0xffe080, 0xffb0b0],
  enemy: [0xffffff, 0xffe066, 0xff8a5a, 0xff5a4e],
  ray: [0xd8ffe0, 0x6dff8a, 0x2bd450],      // raygun
};
const PAL = {};
for (const k in PALETTES) PAL[k] = PALETTES[k].map((c) => new THREE.Color(c));

/** Schizzo di particelle nel punto colpito, lungo la normale della superficie. */
export function impact(point, normal, surface = 'stone', count = 8) {
  const pal = PAL[surface] || PAL.stone;
  for (let k = 0; k < count; k++) {
    const i = nextP;
    nextP = (nextP + 1) % N;
    const s = 1.5 + Math.random() * 3.5;
    vel[i * 3] = normal.x * s + (Math.random() - 0.5) * 3;
    vel[i * 3 + 1] = normal.y * s + Math.random() * 2;
    vel[i * 3 + 2] = normal.z * s + (Math.random() - 0.5) * 3;
    pos[i * 3] = point.x + normal.x * 0.03;
    pos[i * 3 + 1] = point.y + normal.y * 0.03;
    pos[i * 3 + 2] = point.z + normal.z * 0.03;
    const c = pal[(Math.random() * pal.length) | 0];
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    life[i] = 0.25 + Math.random() * 0.35;
  }
  alive = N;
  pGeo.attributes.color.needsUpdate = true;
}

/* ---------- Fumo: sbuffi morbidi che salgono, si allargano e svaniscono (esplosioni) ---------- */
const smokeTex = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 2, 32, 32, 31);
  gr.addColorStop(0, 'rgba(255,255,255,0.9)');
  gr.addColorStop(0.5, 'rgba(255,255,255,0.45)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
})();
const PUFFS = 28;
const puffs = [];
for (let i = 0; i < PUFFS; i++) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, color: 0x6e6a66, transparent: true, depthWrite: false, opacity: 0 }));
  s.visible = false;
  scene.add(s);
  puffs.push({ s, t: 0, life: 1, vx: 0, vy: 0, vz: 0, r0: 1, r1: 2 });
}
let nextPuff = 0;
/** n sbuffi di fumo attorno al punto, grandi circa `radius`. */
export function smoke(point, n, radius) {
  for (let k = 0; k < n; k++) {
    const p = puffs[nextPuff];
    nextPuff = (nextPuff + 1) % PUFFS;
    const a = Math.random() * Math.PI * 2, d = Math.random() * radius * 0.4;
    p.s.position.set(point.x + Math.cos(a) * d, point.y + 0.3 + Math.random() * 0.5, point.z + Math.sin(a) * d);
    p.vx = Math.cos(a) * 0.6; p.vz = Math.sin(a) * 0.6; p.vy = 0.8 + Math.random() * 0.9;
    p.t = 0; p.life = 2 + Math.random() * 1.5;
    p.r0 = radius * (0.35 + Math.random() * 0.25); p.r1 = radius * (0.9 + Math.random() * 0.5);
    const g = 0.32 + Math.random() * 0.18;
    p.s.material.color.setRGB(g, g * 0.97, g * 0.94);
    p.s.material.rotation = Math.random() * 6.28;
    p.s.visible = true;
  }
}
function updateSmoke(dt) {
  for (const p of puffs) {
    if (!p.s.visible) continue;
    p.t += dt;
    const k = p.t / p.life;
    if (k >= 1) { p.s.visible = false; continue; }
    p.s.position.x += p.vx * dt; p.s.position.y += p.vy * dt; p.s.position.z += p.vz * dt;
    p.vx *= 1 - dt; p.vz *= 1 - dt;
    p.s.scale.setScalar(p.r0 + (p.r1 - p.r0) * Math.sqrt(k));
    p.s.material.opacity = Math.min(1, p.t * 6) * (1 - k) * 0.75;
  }
}

/* ---------- Lampo della canna sulla scena ---------- */
const muzzleLight = new THREE.PointLight(0xffc070, 0, 10, 2);
scene.add(muzzleLight);
export function muzzleFlash(at) {
  muzzleLight.position.copy(at);
  muzzleLight.intensity = 12;
}

export function updateEffects(dt) {
  for (const t of tracers) {
    if (!t.m.visible) continue;
    t.head += TRACER_SPEED * dt;
    if (t.head >= t.total + TRACER_LEN * 0.5) { t.m.visible = false; continue; }
    if (t.head > t.total) {
      // la coda arriva al bersaglio: accorcia la striscia
      const len = Math.max(0.05, TRACER_LEN - (t.head - t.total) * 2);
      t.m.position.copy(t.from).addScaledVector(t.dir, t.total - len / 2);
      t.m.scale.z = len;
    } else placeTracer(t);
  }

  if (alive > 0) {
    let any = 0;
    for (let i = 0; i < N; i++) {
      if (life[i] <= 0) continue;
      life[i] -= dt;
      if (life[i] <= 0) { pos[i * 3 + 1] = -9999; continue; }
      any++;
      vel[i * 3 + 1] -= 12 * dt;
      pos[i * 3] += vel[i * 3] * dt;
      pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
      pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
    }
    pGeo.attributes.position.needsUpdate = true;
    alive = any;
  }

  updateSmoke(dt);
  muzzleLight.intensity = Math.max(0, muzzleLight.intensity - dt * 200);
}
