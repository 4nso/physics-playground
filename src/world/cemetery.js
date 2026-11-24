// Il cimitero (fase 15, passo 3): dentro il recinto costruito in world/underground.js.
//
// Pianta (x -25…45, z 108…180; il nord è -z, la cripta è in alto al centro):
//   - vialetto principale nord-sud (x 8,5…11,5) e est-ovest (z 144,5…147,5), due vialetti secondari per verso
//   - piazzetta rotonda al centro (10, 146) con la fontana funeraria: vasca scura, colonna e angelo
//   - 16 riquadri di tombe a file: lapide + terra smossa, qualche lumino rosso, fiori, fosse aperte
//   - 4 cappelle di famiglia, alberi spogli, siepi lungo il vialetto est-ovest, lampioni
//   - 10 bare chiuse (in cappelle, accanto alle fosse, sulla piazzetta): la logica è in game/coffins.js
// Tutto dipende dal seed (stessa mappa per tutti in multiplayer).
// Prestazioni: le lapidi sono 4 InstancedMesh (una per forma), la nebbia bassa due piani trasparenti;
// il resto finisce nella geometria unita della mappa.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SKIP } from './builder.js';
import { CEM, CRYPT } from './underground.js';
import { scene, camera } from '../core/renderer.js';
import { nav, nodeAt, lineClear } from './nav.js';

export const PLAZA = { x: 10, z: 146, r: 7 };
const PATH = 0x7a7367, PAVE = 0x8d877c, PAVE_D = 0x5d5850, STONE = 0x7c7a74, DARK = 0x34363a;
const HEDGE = 0x2b4628, TRUNK = 0x3a3029, METAL = 0x2a2c30, LAMP = 0xffe2a8;
const DIRT = [0x4a3a29, 0x51402c, 0x443524];
const FAMILIES = ['FAM. ROSSI', 'FAM. BIANCHI', 'FAM. ESPOSITO', 'FAM. COLOMBO', 'FAM. RICCI', 'FAM. MARINO', 'FAM. GRECO', 'FAM. BRUNO', 'FAM. FERRARI', 'FAM. CONTI'];

const sc = new THREE.Vector3();
const disc8 = new THREE.CylinderGeometry(1, 1, 1, 8);
const disc24 = new THREE.CylinderGeometry(1, 1, 1, 24);
const cone7 = new THREE.ConeGeometry(1, 1, 7);
const ico = new THREE.IcosahedronGeometry(1, 0);
const cyl6 = new THREE.CylinderGeometry(0.6, 1, 1, 6);
const torus = new THREE.TorusGeometry(1, 0.15, 5, 14);
const box1 = new THREE.BoxGeometry(1, 1, 1);

/** Il giocatore è nel cimitero (all'aperto, non sulla scalinata)? y = piedi. */
export function inCemetery(x, y, z) {
  return x > CEM.x0 && x < CEM.x1 && z > CEM.z0 && z < CEM.z1 && y > -1.2;
}

/* ============================== Costruzione ============================== */
const CHAPELS = [
  { x: -16.5, z: 136.5, door: 1 }, { x: 36.5, z: 136.5, door: -1 },
  { x: -16.5, z: 155.5, door: 1 }, { x: 36.5, z: 155.5, door: -1 },
];
const BLOCKS_X = [[-24, -9.25], [-6.75, 8], [12, 26.75], [29.25, 44]];
const BLOCKS_Z = [[109, 127], [129.5, 144], [148.5, 163], [165.5, 179]];

/**
 * Costruisce il cimitero. Aggiunge a ctx.cem:
 * { graves: [{ x, z }] (dove escono gli zombi), stones: [{ x, z, yaw, tilt, kind, s, c }], coffins: [{ x, y, z, along, ray }] }
 */
export function buildCemetery(b, rng, ctx) {
  const cem = { graves: [], stones: [], coffins: [] };
  ctx.cem = cem;
  paths(b);
  plaza(b);
  const names = rng.shuffle([...FAMILIES]);
  CHAPELS.forEach((c, i) => chapel(b, ctx, c, names[i], cem));

  // posti liberi per le tombe (lontano da cappelle, piazzetta, cripta, bare)
  const reserved = [
    ...CHAPELS.map((c) => [c.x - 4.2, c.z - 4.2, c.x + 4.2, c.z + 4.2]),
    [CRYPT.x0 - 1.5, CEM.z0, CRYPT.x1 + 1.5, CRYPT.z1 + 2.5],
    [14.5, 113.5, 18, 119.5],               // bara vicino alla cripta
  ];
  const free = (x0, z0, x1, z1) => !reserved.some((r) => x1 > r[0] && x0 < r[2] && z1 > r[1] && z0 < r[3])
    && Math.hypot(Math.max(x0 - PLAZA.x, PLAZA.x - x1, 0), Math.max(z0 - PLAZA.z, PLAZA.z - z1, 0)) > PLAZA.r + 0.8;
  const slots = [];
  for (const [bz0, bz1] of BLOCKS_Z) {
    for (const [bx0, bx1] of BLOCKS_X) {
      for (let z = bz0 + 0.4; z + 2.5 <= bz1; z += 3.4) {
        for (let x = bx0 + 0.75; x <= bx1 - 0.75; x += 2.3) {
          if (!free(x - 0.6, z, x + 0.6, z + 2.4) || rng.chance(0.28)) continue;
          slots.push({ x, z });
        }
      }
    }
  }
  rng.shuffle(slots);
  // alberi spogli al posto di qualche tomba
  for (const s of slots.splice(0, 12)) tree(b, rng, s.x, s.z + 1.2);
  // fosse aperte; accanto alle prime tre una bara (il posto a destra resta libero)
  const open = slots.splice(0, 5);
  open.forEach((s, i) => {
    openGrave(b, rng, s.x, s.z);
    if (i < 3) {
      const nx = s.x + 1.15;
      for (let k = slots.length - 1; k >= 0; k--) if (Math.abs(slots[k].z - s.z) < 0.1 && Math.abs(slots[k].x - s.x - 2.3) < 0.2) slots.splice(k, 1);
      cem.coffins.push({ x: nx, y: 0, z: s.z + 1.3, along: 'z' });
    }
  });
  for (const s of slots) grave(b, rng, s.x, s.z, cem);
  // bare sulla piazzetta (su due catafalchi) e una vicino alla cripta
  for (const [x, z] of [[PLAZA.x - 4.6, PLAZA.z - 4.6], [PLAZA.x + 4.6, PLAZA.z + 4.6]]) {
    b.box(x - 0.55, 0, z - 1.15, x + 0.55, 0.5, z + 1.15, PAVE_D, { skip: SKIP.BOTTOM });
    cem.coffins.push({ x, y: 0.5, z, along: 'z' });
  }
  cem.coffins.push({ x: 16.2, y: 0, z: 116.5, along: 'x' });
  // 2 bare su 10 hanno la raygun (scelte con il seed: uguali per tutti in multiplayer)
  for (const i of rng.shuffle(cem.coffins.map((_, k) => k)).slice(0, 2)) cem.coffins[i].ray = true;
  lamps(b);
}

function paths(b) {
  const P = { collide: false, ao: false, skip: SKIP.BOTTOM };
  const X0 = CEM.x0 + 0.5, X1 = CEM.x1 - 0.5, Z0 = CEM.z0 + 0.5, Z1 = CEM.z1 - 0.5;
  // principali (2,5 cm) e secondari (2 cm); dove si incrociano c'è solo quello principale
  b.box(8.5, 0, CRYPT.z1 + 0.8, 11.5, 0.025, Z1, PATH, P);
  for (const [x0, x1] of [[X0, 8.5], [11.5, X1]]) b.box(x0, 0, 144.5, x1, 0.025, 147.5, PATH, P);
  for (const z of [128.25, 164.25]) for (const [x0, x1] of [[X0, 8.5], [11.5, X1]]) b.box(x0, 0, z - 0.75, x1, 0.02, z + 0.75, PATH, P);
  for (const x of [-8, 28]) {
    for (const [z0, z1] of [[Z0, 127.5], [129, 144.5], [147.5, 163.5], [165, Z1]]) b.box(x - 0.75, 0, z0, x + 0.75, 0.02, z1, PATH, P);
  }
  // siepi lungo il vialetto est-ovest (si aprono agli incroci e alla piazzetta)
  for (const [x0, x1] of [[X0, -8.9], [-7.1, PLAZA.x - PLAZA.r - 0.6], [PLAZA.x + PLAZA.r + 0.6, 27.1], [28.9, X1]]) {
    for (const [z0, z1] of [[143.6, 144.35], [147.65, 148.4]]) b.box(x0, 0, z0, x1, 1.05, z1, HEDGE, { skip: SKIP.BOTTOM, surface: 'soft' });
  }
}

function plaza(b) {
  const { x, z, r } = PLAZA;
  b.geo(disc24, x, 0.015, z, PAVE_D, { scale: sc.set(r + 0.35, 0.03, r + 0.35) });
  b.geo(disc24, x, 0.02, z, PAVE, { scale: sc.set(r, 0.04, r) });
  // fontana: vasca ottagonale di pietra scura, acqua scura, colonna e angelo
  b.geo(disc8, x, 0.35, z, DARK, { scale: sc.set(2.8, 0.7, 2.8), rotY: Math.PI / 8 });
  b.geo(disc8, x, 0.74, z, 0x0e1a1f, { scale: sc.set(2.35, 0.04, 2.35), rotY: Math.PI / 8 });
  b.box(x - 2.45, 0, z - 2.45, x + 2.45, 0.75, z + 2.45, 0, { visible: false, surface: 'stone' });
  b.geo(cyl6, x, 1.5, z, DARK, { scale: sc.set(0.5, 1.6, 0.5) });
  b.box(x - 0.45, 0.75, z - 0.45, x + 0.45, 2.3, z + 0.45, 0, { visible: false });
  const A = 0x75736d; // l'angelo guarda verso la cripta (nord)
  b.geo(cone7, x, 2.95, z, A, { scale: sc.set(0.5, 1.35, 0.5) });
  b.box(x - 0.22, 3.25, z - 0.14, x + 0.22, 3.85, z + 0.14, A, { collide: false });
  b.geo(ico, x, 4.08, z - 0.02, A, { scale: sc.set(0.2, 0.22, 0.2) });
  b.geo(torus, x, 4.38, z, 0xa39c84, { scale: sc.set(0.2, 0.2, 0.2), rot: [Math.PI / 2, 0, 0] });
  b.box(x - 0.09, 3.45, z - 0.38, x + 0.09, 3.7, z - 0.14, A, { collide: false }); // mani giunte
  for (const s of [-1, 1]) {
    b.geo(box1, x + s * 0.42, 3.75, z + 0.24, A, { scale: sc.set(0.06, 1.15, 0.62), rot: [0.25, s * 0.55, s * -0.35] });
    b.box(x + s * 0.22 - 0.07, 3.3, z - 0.3, x + s * 0.22 + 0.07, 3.75, z - 0.12, A, { collide: false });
  }
  // panchine di pietra intorno
  for (const a of [Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4]) {
    const bx = x + Math.cos(a) * 5.4, bz = z + Math.sin(a) * 5.4, along = Math.abs(Math.cos(a)) < 0.5;
    if ((a > 0.5 && a < 1) || (a > 3.5 && a < 4.2)) continue; // lì ci sono i catafalchi con le bare
    const hx = along ? 0.9 : 0.3, hz = along ? 0.3 : 0.9;
    b.box(bx - hx, 0.35, bz - hz, bx + hx, 0.47, bz + hz, PAVE, {});
    b.box(bx - hx + 0.1, 0, bz - hz + 0.1, bx + hx - 0.1, 0.35, bz + hz - 0.1, PAVE_D, { collide: false, skip: SKIP.BOTTOM });
  }
}

/** Tomba: lapide (instanced, collider invisibile), terra smossa, a volte cordolo, lumino e fiori. */
function grave(b, rng, x, z, cem) {
  const kind = rng.int(4), s = rng.range(0.85, 1.12), tilt = rng.chance(0.15) ? rng.range(-0.18, 0.18) : 0;
  const c = rng.range(0.72, 1.05);
  cem.stones.push({ x, z: z + 0.15, yaw: rng.range(-0.06, 0.06), tilt, kind, s, c });
  const [w, h] = STONE_SIZE[kind];
  b.box(x - (w * s) / 2, 0, z + 0.04, x + (w * s) / 2, h * s, z + 0.27, 0, { visible: false });
  const col = rng.pick(DIRT);
  b.box(x - 0.45, 0, z + 0.35, x + 0.45, 0.1, z + 2.25, col, { collide: false, skip: SKIP.BOTTOM });
  if (rng.chance(0.5)) {
    const K = 0x8a857b, o = { collide: false, ao: false, skip: SKIP.BOTTOM };
    b.box(x - 0.55, 0, z + 0.3, x - 0.45, 0.16, z + 2.35, K, o);
    b.box(x + 0.45, 0, z + 0.3, x + 0.55, 0.16, z + 2.35, K, o);
    b.box(x - 0.45, 0, z + 2.25, x + 0.45, 0.16, z + 2.35, K, o);
  }
  if (rng.chance(0.25)) b.box(x + 0.18, 0.1, z + 0.45, x + 0.3, 0.26, z + 0.57, 0xff4a2a, { collide: false, glow: 0.9 }); // lumino
  if (rng.chance(0.2)) {
    const fc = rng.pick([0xd9433a, 0xf2e8d0, 0xb45cff, 0xffd23f]);
    b.box(x - 0.25, 0.1, z + 0.9, x - 0.05, 0.2, z + 1.3, 0x3f6b2c, { collide: false, ao: false });
    b.box(x - 0.23, 0.2, z + 0.95, x - 0.07, 0.27, z + 1.25, fc, { collide: false, ao: false });
  }
  cem.graves.push({ x, z: z + 1.3 });
}

/** Fossa aperta: buco buio (non ci si cammina), mucchio di terra, pala piantata. */
function openGrave(b, rng, x, z) {
  b.box(x - 0.45, 0, z + 0.35, x + 0.45, 0.012, z + 2.25, 0x080605, { collide: false, ao: false, skip: SKIP.BOTTOM });
  for (const [a, c] of [[x - 0.55, x - 0.45], [x + 0.45, x + 0.55]]) b.box(a, 0, z + 0.3, c, 0.12, z + 2.3, 0x3a2c1f, { collide: false, ao: false });
  b.box(x - 0.45, 0, z + 0.35, x + 0.45, 0.6, z + 2.25, 0, { visible: false, surface: 'dirt' });
  b.geo(cone7, x - 1.1, 0.25, z + 1.3, rng.pick(DIRT), { scale: sc.set(0.5, 0.5, 0.95) });
  b.geo(box1, x - 1.05, 0.75, z + 1.6, TRUNK, { scale: sc.set(0.05, 1.0, 0.05), rot: [0.25, 0, 0.15] });
  b.geo(box1, x - 1.02, 0.15, z + 1.72, METAL, { scale: sc.set(0.22, 0.3, 0.04), rot: [0.25, 0, 0.15] });
  b.box(x - 0.3, 0, z + 0.04, x + 0.3, 0.55, z + 0.24, 0x6a675f, {}); // lapide provvisoria (bassa)
}

/** Albero spoglio: tronco, rami storti e rametti. */
function tree(b, rng, x, z) {
  const H = rng.range(3, 4.2);
  b.geo(new THREE.CylinderGeometry(0.14, 0.26, H, 6), x, H / 2, z, TRUNK);
  b.box(x - 0.22, 0, z - 0.22, x + 0.22, H, z + 0.22, 0, { visible: false, surface: 'wood' });
  const branch = new THREE.CylinderGeometry(0.04, 0.09, 1, 5);
  const n = 4 + rng.int(3);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rng.range(-0.4, 0.4), y = H * rng.range(0.55, 0.95), L = rng.range(0.9, 1.6), t = rng.range(0.55, 1.0);
    const dx = Math.cos(a) * Math.sin(t), dz = Math.sin(a) * Math.sin(t), dy = Math.cos(t);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx, dy, dz));
    const e = new THREE.Euler().setFromQuaternion(q);
    b.geo(branch, x + dx * L * 0.5, y + dy * L * 0.5, z + dz * L * 0.5, TRUNK, { scale: sc.set(1, L, 1), rot: [e.x, e.y, e.z] });
    // rametto in cima al ramo
    const a2 = a + rng.range(-1, 1), t2 = t * 0.6, L2 = L * 0.5;
    const ex = Math.cos(a2) * Math.sin(t2), ez = Math.sin(a2) * Math.sin(t2), ey = Math.cos(t2);
    const q2 = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(ex, ey, ez));
    const e2 = new THREE.Euler().setFromQuaternion(q2);
    const bx = x + dx * L, by = y + dy * L, bz = z + dz * L;
    b.geo(branch, bx + ex * L2 * 0.5, by + ey * L2 * 0.5, bz + ez * L2 * 0.5, TRUNK, { scale: sc.set(0.6, L2, 0.6), rot: [e2.x, e2.y, e2.z] });
  }
}

/** Cappella di famiglia: muri di pietra, porta aperta verso il vialetto, tetto a gradoni, croce, nome. Dentro una bara. */
function chapel(b, ctx, c, name, cem) {
  const { x, z, door } = c, W = 3, H = 3.6, T = 0.35, ST = 0x8a857b, ROOF = 0x56524c;
  b.box(x - W, 0, z - W, x + W, 0.05, z + W, PAVE_D, { collide: false, skip: SKIP.BOTTOM });
  // muri: davanti (x = x + door·W) con la porta larga 1,8 m e alta 2,6
  const fx = x + door * W, bx = x - door * W;
  b.box(Math.min(bx, bx + door * T), 0, z - W, Math.max(bx, bx + door * T), H, z + W, ST, { skip: SKIP.BOTTOM });
  for (const s of [-1, 1]) b.box(x - W, 0, z + s * W - (s > 0 ? T : 0), x + W, H, z + s * W + (s < 0 ? T : 0), ST, { skip: SKIP.BOTTOM });
  const f0 = Math.min(fx, fx - door * T), f1 = Math.max(fx, fx - door * T);
  b.box(f0, 0, z - W, f1, H, z - 0.9, ST, { skip: SKIP.BOTTOM });
  b.box(f0, 0, z + 0.9, f1, H, z + W, ST, { skip: SKIP.BOTTOM });
  b.box(f0, 2.6, z - 0.9, f1, H, z + 0.9, ST);
  // tetto a gradoni e croce sopra la porta
  b.box(x - W - 0.3, H, z - W - 0.3, x + W + 0.3, H + 0.3, z + W + 0.3, ROOF);
  b.box(x - W + 0.4, H + 0.3, z - W + 0.4, x + W - 0.4, H + 0.6, z + W - 0.4, ROOF);
  b.box(x - W + 1.2, H + 0.6, z - W + 1.2, x + W - 1.2, H + 0.9, z + W - 1.2, ROOF);
  const cx = fx + door * 0.05;
  b.box(cx - 0.07, H + 0.3, z - 0.07, cx + 0.07, H + 1.6, z + 0.07, ST, { collide: false });
  b.box(cx - 0.07, H + 1.05, z - 0.4, cx + 0.07, H + 1.2, z + 0.4, ST, { collide: false });
  (ctx.signs || (ctx.signs = [])).push({ text: name, x: fx + door * 0.03, y: 3.05, z, w: 2.2, h: 0.42, rotY: door > 0 ? Math.PI / 2 : -Math.PI / 2, bg: '#8a857b', fg: '#2a2622' });
  // dentro: un lumino sull'altare in fondo e la bara al centro (perpendicolare alla porta)
  b.box(bx + door * T, 0, z - 0.8, bx + door * (T + 0.6), 1.0, z + 0.8, PAVE_D, {});
  b.box(bx + door * (T + 0.25) - 0.06, 1.0, z - 0.06, bx + door * (T + 0.25) + 0.06, 1.18, z + 0.06, 0xff4a2a, { collide: false, glow: 0.9 });
  cem.coffins.push({ x: x + door * 0.2, y: 0.05, z, along: 'x' });
}

function lamps(b) {
  const spots = [[7.6, 130.2], [12.4, 162.6], [-9.2, 143.6], [29.2, 148.4], [12.4, 126.6], [-9.2, 165.8], [29.2, 129.6], [7.6, 177]];
  for (const [x, z] of spots) {
    b.box(x - 0.08, 0, z - 0.08, x + 0.08, 3.4, z + 0.08, METAL, { surface: 'metal', skip: SKIP.BOTTOM });
    b.box(x - 0.18, 3.4, z - 0.18, x + 0.18, 3.48, z + 0.18, METAL, { collide: false });
    b.box(x - 0.13, 3.48, z - 0.13, x + 0.13, 3.8, z + 0.13, LAMP, { collide: false, glow: true });
    b.box(x - 0.2, 3.8, z - 0.2, x + 0.2, 3.88, z + 0.2, METAL, { collide: false });
  }
}

/* ============================ Lapidi e nebbia ============================ */
// misure delle 4 forme di lapide: [larghezza, altezza]
const STONE_SIZE = [[0.8, 1.15], [0.6, 1.3], [1.0, 1.0], [0.6, 1.75]];
function stoneGeometries() {
  const nb = (g, x, y, z, rx = 0, ry = 0, rz = 0) => {
    g = g.index ? g.toNonIndexed() : g;
    if (rx) g.rotateX(rx);
    if (ry) g.rotateY(ry);
    if (rz) g.rotateZ(rz);
    g.translate(x, y, z);
    g.deleteAttribute('uv');
    return g;
  };
  return [
    mergeGeometries([nb(new THREE.BoxGeometry(0.8, 0.75, 0.18), 0, 0.375, 0), nb(new THREE.CylinderGeometry(0.4, 0.4, 0.18, 10, 1, false, 0, Math.PI), 0, 0.75, 0, Math.PI / 2, 0, Math.PI / 2)]),
    mergeGeometries([nb(new THREE.BoxGeometry(0.5, 0.2, 0.32), 0, 0.1, 0), nb(new THREE.BoxGeometry(0.15, 1.1, 0.13), 0, 0.75, 0), nb(new THREE.BoxGeometry(0.6, 0.14, 0.13), 0, 0.95, 0)]),
    mergeGeometries([nb(new THREE.BoxGeometry(1.0, 0.15, 0.34), 0, 0.075, 0), nb(new THREE.BoxGeometry(0.86, 0.85, 0.2), 0, 0.575, 0)]),
    mergeGeometries([nb(new THREE.BoxGeometry(0.6, 0.3, 0.6), 0, 0.15, 0), nb(new THREE.CylinderGeometry(0.1, 0.22, 1.45, 4), 0, 1.02, 0, 0, Math.PI / 4)]),
  ];
}
let stoneMeshes = [], fog = [], fogTex = null;
const stoneMat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });

function fogTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  for (let i = 0; i < 70; i++) {
    const x = Math.random() * 128, y = Math.random() * 128, r = 10 + Math.random() * 26;
    for (const [ox, oy] of [[0, 0], [128, 0], [-128, 0], [0, 128], [0, -128]]) {
      const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
      gr.addColorStop(0, 'rgba(255,255,255,0.16)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(5, 5);
  return t;
}

export function clearCemVisuals() {
  for (const m of [...stoneMeshes, ...fog]) { scene.remove(m); if (m.isInstancedMesh) m.dispose(); }
  stoneMeshes = []; fog = [];
  graves = [];
}

let geos = null, graves = [];
/** Lapidi (instancing) e nebbia bassa: a ogni nuova mappa, dai dati raccolti in buildCemetery. */
export function buildCemVisuals(cem) {
  clearCemVisuals();
  if (!cem) return;
  graves = cem.graves;
  geos = geos || stoneGeometries();
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3(), col = new THREE.Color();
  for (let k = 0; k < 4; k++) {
    const list = cem.stones.filter((st) => st.kind === k);
    if (!list.length) continue;
    const im = new THREE.InstancedMesh(geos[k], stoneMat, list.length);
    list.forEach((st, i) => {
      q.setFromEuler(e.set(st.tilt, st.yaw, st.tilt * 0.4));
      im.setMatrixAt(i, m4.compose(p.set(st.x, 0, st.z), q, s.set(st.s, st.s, st.s)));
      im.setColorAt(i, col.setRGB(0.55 * st.c, 0.54 * st.c, 0.51 * st.c));
    });
    im.castShadow = true;
    im.computeBoundingSphere();
    scene.add(im);
    stoneMeshes.push(im);
  }
  // nebbia bassa: due veli trasparenti sopra il prato, che scorrono piano
  fogTex = fogTex || fogTexture();
  for (const [y, op, sp] of [[0.3, 0.5, 1], [0.85, 0.3, -0.7]]) {
    const t = fogTex.clone();
    t.needsUpdate = true;
    // Lambert: la nebbia prende la luce del cielo (di notte si scurisce da sola)
    const m = new THREE.Mesh(new THREE.PlaneGeometry(CEM.x1 - CEM.x0, CEM.z1 - CEM.z0), new THREE.MeshLambertMaterial({
      map: t, color: 0x9aa6b4, transparent: true, opacity: op, depthWrite: false, fog: true,
    }));
    m.rotation.x = -Math.PI / 2;
    m.position.set((CEM.x0 + CEM.x1) / 2, y, (CEM.z0 + CEM.z1) / 2);
    m.renderOrder = 4;
    m.userData.sp = sp;
    m.visible = false;
    scene.add(m);
    fog.push(m);
  }
}

/** A ogni frame: la nebbia c'è solo quando la telecamera è vicina al cimitero, e scorre piano. */
export function updateCemetery(dt) {
  const near = camera.position.z > CEM.z0 - 30;
  for (const m of fog) {
    m.visible = near;
    if (near) { const t = m.material.map; t.offset.x += dt * 0.006 * m.userData.sp; t.offset.y += dt * 0.004; }
  }
}

/* ============================ Zombi dalle tombe ============================ */
/**
 * Punto di comparsa su una tomba, se un giocatore vivo è nel cimitero (a volte sì, a volte no:
 * gli altri nemici arrivano come sempre). Lontano dai giocatori (mai davanti ai piedi) e raggiungibile.
 * targets = [{ x, y (centro), z, alive }]. Restituisce { x, y, z, grave: true } o null.
 */
export function graveSpawn(targets) {
  if (!graves.length || !nav.ready || !nav.gateOpen) return null;
  const inside = targets.filter((t) => t.alive && inCemetery(t.x, t.y - 0.85, t.z));
  if (!inside.length || Math.random() > 0.6) return null;
  for (let k = 0; k < 30; k++) {
    const g = graves[(Math.random() * graves.length) | 0];
    let near = Infinity, tooClose = false;
    for (const t of targets) {
      const d = Math.hypot(g.x - t.x, g.z - t.z);
      if (d < 9) { tooClose = true; break; }
      if (t.alive) near = Math.min(near, d);
    }
    if (tooClose || near > 32) continue;
    const n = nodeAt(g.x, 0, g.z);
    if (n < 0 || !nav.alive[n]) continue;
    // meglio se non proprio sotto gli occhi: si sceglie una tomba nascosta quando c'è
    if (k < 15 && inside.some((t) => lineClear(t.x, t.y + 0.75, t.z, g.x, 1.2, g.z))) continue;
    return { x: nav.x[n], y: nav.y[n], z: nav.z[n], grave: true };
  }
  return null;
}
