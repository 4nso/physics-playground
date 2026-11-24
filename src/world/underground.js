// Il percorso dietro il cancello EXIT (fase 15, passo 2): tunnel → sala delle candele → scalinata → cripta,
// che sbuca dentro il cimitero (per ora un recinto vuoto: lapidi, bare e il resto arrivano nel passo 3).
//
// Pianta (il nord è -z; tutto è a sud del muro del luna park, fuori dalla mappa di prima):
//
//   z  36  ═══ muro sud del luna park ═══╡EXIT╞═══
//          tunnel largo 6 m (x 7…13): piano fino a z 39, poi scende di 8 m fino a z 81
//   z  82  ┌─ sala delle candele: rotonda, raggio 10 m, pavimento a y = -8 ─┐
//          │ porta sigillata a ovest (catene, simbolo inciso)                │
//   z 102  └─ porta aperta a sud con la scalinata che risale ────────────────┘
//   z 108  ═══ muro nord del cimitero ═══
//   z 110…125 cripta (la scalinata arriva dentro), cancelletto aperto verso sud
//   z 108…180, x -25…45: cimitero
//
// Le parti ferme finiscono nella geometria unita della mappa; le lampade che sfarfallano e le fiammelle
// delle candele sono due InstancedMesh (due sole chiamate di disegno). Suoni: gocce e passi con l'eco.
import * as THREE from 'three';
import { SKIP } from './builder.js';
import { scene } from '../core/renderer.js';
import { glowMat } from '../core/glow.js';
import { audioCtx } from '../core/audio.js';
import { skyState } from '../core/sky.js';

/* ---------- Misure (le usano anche minimappa, navigazione e modalità sviluppatore) ---------- */
export const GATE_Z = 36;                                   // muro sud del luna park (vedi world/zones.js)
export const TUN = { x0: 7, x1: 13, z0: 36.15, r0: 39, r1: 81, y1: -8 };
export const ROOM = { x: 10, z: 92.5, r: 10, y: -8, top: -1.5 };
export const STAIRS = { x0: 8, x1: 12, z0: 102, z1: 118.5 };
export const CRYPT = { x0: 7, x1: 13, z0: 109.5, z1: 125.2, door: 125.2 };
export const CEM = { x0: -25, x1: 45, z0: 108, z1: 180 };
/** Area nuova (fuori dalla mappa di prima): per la navigazione e la minimappa. */
export const EXTRA = { minX: -25, maxX: 45, minZ: GATE_Z, maxZ: CEM.z1 };

/** Altezza del pavimento del tunnel in z. */
export function tunnelFloor(z) {
  if (z <= TUN.r0) return 0;
  if (z >= TUN.r1) return TUN.y1;
  return (TUN.y1 * (z - TUN.r0)) / (TUN.r1 - TUN.r0);
}
/** Altezza del pavimento della scalinata in z. */
export function stairFloor(z) {
  if (z <= STAIRS.z0) return ROOM.y;
  if (z >= STAIRS.z1) return 0;
  return ROOM.y * (1 - (z - STAIRS.z0) / (STAIRS.z1 - STAIRS.z0));
}

const ZONE_NAMES = { tunnel: 'Tunnel', sala: 'Sala delle candele', cripta: 'Cripta', cimitero: 'Cimitero' };
/** Zona dell'area nuova in un punto (o null se il punto è nella mappa di prima). y = piedi. */
export function underZoneAt(x, y, z) {
  if (z <= GATE_Z) return null;
  let id = null;
  if (Math.hypot(x - ROOM.x, z - ROOM.z) < ROOM.r + 0.6 && y < -3) id = 'sala';
  else if (x > TUN.x0 - 0.5 && x < TUN.x1 + 0.5 && z < ROOM.z - ROOM.r + 1) id = 'tunnel';
  else if (x > CRYPT.x0 - 0.2 && x < CRYPT.x1 + 0.2 && z > STAIRS.z0 - 0.5 && z < CRYPT.z1) id = 'cripta';
  else if (x > CEM.x0 && x < CEM.x1 && z > CEM.z0 && z < CEM.z1) id = 'cimitero';
  return id ? { id, name: ZONE_NAMES[id] } : null;
}
/** Sotto terra (per i suoni con l'eco): tunnel, sala, scalinata. y = piedi. */
export function isUnderground(x, y, z) {
  const zn = underZoneAt(x, y, z);
  return !!zn && (zn.id === 'tunnel' || zn.id === 'sala' || (zn.id === 'cripta' && y < -0.5));
}

/** Rettangolo [x0,z0,x1,z1] meno un buco: fino a 4 rettangoli che non si sovrappongono. */
function minus(r, h) {
  return [
    [r[0], r[1], h[0], r[3]], [h[2], r[1], r[2], r[3]],
    [h[0], r[1], h[2], h[1]], [h[0], h[3], h[2], r[3]],
  ].filter((q) => q[2] - q[0] > 0.01 && q[3] - q[1] > 0.01);
}

const ROCK = 0x2b2723, ROCK2 = 0x35302a, FLOOR = 0x3a342d, WARM = 0x6a4b2e, CEIL = 0x1f1c19;
const STONE = 0x8d877d, STONE_D = 0x5f5a52, METAL = 0x2a2c30, WOOD = 0x3a2614;
const sc = new THREE.Vector3();
const disc = new THREE.CylinderGeometry(1, 1, 1, 28);
const candleGeo = new THREE.CylinderGeometry(0.07, 0.08, 0.36, 6);
const torus = new THREE.TorusGeometry(0.45, 0.06, 6, 18);

/* ============================== Costruzione ============================== */
/** Tutto il percorso: aggiunge a ctx.under = { lamps: [[x,y,z]], candles: [[x,y,z]] } per world/map.js. */
export function buildUnderground(b, ctx) {
  const under = { lamps: [], candles: [] };
  ctx.under = under;
  outerGround(b);
  tunnel(b, under);
  room(b, under);
  stairsAndCrypt(b, ctx);
  cemeteryYard(b);
  // pavimento di sicurezza sotto tutta l'area nuova (invisibile)
  b.box(-30, -12.5, GATE_Z + 0.2, 50, -12, CEM.z1 + 5, 0, { visible: false, nav: false });
}

/** Prato scuro tra il luna park e il cimitero (si vede solo dall'alto): copre il tunnel, che affiora vicino al cancello. */
function outerGround(b) {
  for (const r of minus([-45, TUN.z0, 63, CEM.z0], [TUN.x0 - 0.3, TUN.z0, TUN.x1 + 0.3, 66.5])) {
    b.box(r[0], -0.3, r[1], r[2], 0, r[3], 0x46533a, { collide: false, skip: SKIP.BOTTOM });
  }
}

function tunnel(b, under) {
  const { x0, x1, z0, r0, r1 } = TUN, W = 0.3, H = 4.6;
  // pavimento: piano, rampa in discesa, piano fino alla sala
  b.box(x0, -0.3, z0 - 0.2, x1, 0, r0, FLOOR, { skip: SKIP.BOTTOM });
  b.ramp(x0, r0, x1, r1, 'z', 0, TUN.y1, FLOOR, { surface: 'stone' });
  b.box(x0, TUN.y1 - 0.3, r1, x1, TUN.y1, ROOM.z - ROOM.r - 0.5, FLOOR, { skip: SKIP.BOTTOM });
  // soffitto: segue la discesa (4,6 m sopra il pavimento)
  b.box(x0 - W, H, z0, x1 + W, H + 0.3, r0, CEIL);
  b.ramp(x0 - W, r0, x1 + W, r1, 'z', H + 0.3, TUN.y1 + H + 0.3, CEIL, { thick: 0.3 });
  b.box(x0 - W, TUN.y1 + H, r1, x1 + W, TUN.y1 + H + 0.3, ROOM.z - ROOM.r + 0.6, CEIL);
  // pareti a pezzi da 3 m (dal pavimento più basso al soffitto più alto del pezzo)
  const zEnd = ROOM.z - ROOM.r + 0.8;
  for (let z = z0; z < zEnd - 0.01; z += 3) {
    const zb = Math.min(zEnd, z + 3), lo = tunnelFloor(zb) - 0.4, hi = tunnelFloor(z) + H + 0.3;
    b.box(x0 - W, lo, z, x0, hi, zb, ROCK, { skip: SKIP.BOTTOM | SKIP.TOP, ao: false });
    b.box(x1, lo, z, x1 + W, hi, zb, ROCK, { skip: SKIP.BOTTOM | SKIP.TOP, ao: false });
    // zoccolo un po' più chiaro (si capisce meglio dove finisce il pavimento)
    const f0 = tunnelFloor(z), f1 = tunnelFloor(zb);
    b.box(x0, Math.min(f0, f1) - 0.2, z, x0 + 0.06, Math.max(f0, f1) + 0.35, zb, ROCK2, { collide: false, ao: false });
    b.box(x1 - 0.06, Math.min(f0, f1) - 0.2, z, x1, Math.max(f0, f1) + 0.35, zb, ROCK2, { collide: false, ao: false });
  }
  // archi di rinforzo ogni 6 m (travi di legno sul soffitto e montanti sulle pareti)
  for (let z = 42; z < r1; z += 6) {
    const f = tunnelFloor(z);
    for (const [a, c] of [[x0, x0 + 0.25], [x1 - 0.25, x1]]) b.box(a, f - 0.1, z - 0.15, c, f + H, z + 0.15, WOOD, { collide: false, ao: false });
    b.box(x0, f + H - 0.3, z - 0.15, x1, f + H, z + 0.15, WOOD, { collide: false, ao: false });
  }
  // lampade alle pareti (si alternano), con la macchia di luce calda dipinta intorno
  let side = -1;
  for (let z = 41; z < r1 + 1; z += 7) {
    const f = tunnelFloor(z), y = f + 3.1, wx = side < 0 ? x0 : x1, d = -side; // d = verso l'interno
    b.box(Math.min(wx, wx + d * 0.03), y - 1.5, z - 1, Math.max(wx, wx + d * 0.03), y + 0.7, z + 1, WARM, { collide: false, ao: false });
    b.box(Math.min(wx, wx + d * 0.3), y - 0.05, z - 0.05, Math.max(wx, wx + d * 0.3), y + 0.05, z + 0.05, METAL, { collide: false });
    under.lamps.push([wx + d * 0.32, y - 0.12, z]);
    side = -side;
  }
}

function room(b, under) {
  const { x: cx, z: cz, r: R, y: Y, top } = ROOM;
  // pavimento, cerchi incisi, soffitto
  b.box(cx - R - 0.5, Y - 0.3, cz - R - 0.5, cx + R + 0.5, Y, cz + R + 0.5, FLOOR, { skip: SKIP.BOTTOM });
  b.geo(disc, cx, Y + 0.01, cz, 0x4d4036, { scale: sc.set(6.6, 0.02, 6.6) });
  b.geo(disc, cx, Y + 0.02, cz, FLOOR, { scale: sc.set(6.1, 0.02, 6.1) });
  b.geo(disc, cx, Y + 0.03, cz, 0x5a2a22, { scale: sc.set(2.2, 0.02, 2.2) });
  b.geo(disc, cx, Y + 0.04, cz, 0x2a221d, { scale: sc.set(1.7, 0.02, 1.7) });
  b.box(cx - R - 0.5, top, cz - R - 0.6, cx + R + 0.5, top + 0.3, cz + R + 0.6, CEIL);
  // muro rotondo: 32 pezzi; aperture a nord (tunnel), a sud (scalinata) e a ovest (porta sigillata)
  const N = 32, Rw = R + 0.25, half = Math.PI / N;
  const skip = new Set([7, 8, 9, 16, 23, 24, 25]);
  for (let k = 0; k < N; k++) {
    if (skip.has(k)) continue;
    const a = (k * 2 * Math.PI) / N;
    const ax = cx + Math.cos(a - half) * Rw, az = cz + Math.sin(a - half) * Rw;
    const bx = cx + Math.cos(a + half) * Rw, bz = cz + Math.sin(a + half) * Rw;
    b.wallSeg(ax, az, bx, bz, Y - 0.3, top, 0.5, ROCK);
    // candela su una mensola, con la luce calda dipinta sul muro intorno
    const ix = Math.cos(a), iz = Math.sin(a);
    const wa = a - half * 0.55, wb = a + half * 0.55, rr = Rw * Math.cos(half) - 0.25; // appena davanti alla faccia interna
    b.wallSeg(cx + Math.cos(wa) * rr, cz + Math.sin(wa) * rr, cx + Math.cos(wb) * rr, cz + Math.sin(wb) * rr, Y + 1.6, Y + 3.9, 0.04, WARM, { collide: false });
    const px = cx + ix * (R - 0.2), pz = cz + iz * (R - 0.2);
    b.box(px - 0.17, Y + 2.45, pz - 0.17, px + 0.17, Y + 2.55, pz + 0.17, METAL, { collide: false });
    b.geo(candleGeo, px, Y + 2.73, pz, 0xf1e6c8);
    under.candles.push([px, Y + 3.04, pz]);
  }
  // architravi sopra le aperture del tunnel e della scalinata
  b.box(TUN.x0 - 0.3, Y + 4.6, cz - R - 0.6, TUN.x1 + 0.3, top, cz - R + 0.7, ROCK);
  b.box(TUN.x0 - 0.3, Y + 3.3, cz + R - 0.7, TUN.x1 + 0.3, top, cz + R + 0.6, ROCK);
  // quattro colonne (riparo durante gli scontri)
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + (k * Math.PI) / 2, x = cx + Math.cos(a) * 6, z = cz + Math.sin(a) * 6;
    b.box(x - 0.5, Y, z - 0.5, x + 0.5, top, z + 0.5, STONE_D, { skip: SKIP.BOTTOM | SKIP.TOP });
    b.box(x - 0.62, Y, z - 0.62, x + 0.62, Y + 0.4, z + 0.62, ROCK2, { collide: false, skip: SKIP.BOTTOM });
    b.box(x - 0.62, top - 0.4, z - 0.62, x + 0.62, top, z + 0.62, ROCK2, { collide: false, skip: SKIP.TOP });
  }
  sealedDoor(b, cx - Rw, cz);
}

/** Porta sigillata (a ovest della sala): incassata, sbarrata da catene, con un simbolo inciso che brilla appena. */
function sealedDoor(b, xw, cz) {
  const Y = ROOM.y, x0 = xw - 1.4;
  b.box(x0 - 0.3, Y - 0.3, cz - 1.6, xw - 0.25, Y, cz + 1.6, FLOOR, { skip: SKIP.BOTTOM }); // pavimento della nicchia
  b.box(x0 - 0.3, Y, cz - 1.6, x0, Y + 4.4, cz + 1.6, ROCK);                         // fondo
  for (const s of [-1, 1]) b.box(x0, Y, cz + s * 1.1 - 0.25, xw + 0.25, Y + 4.4, cz + s * 1.1 + 0.25, ROCK); // spalle
  b.box(x0, Y + 3.4, cz - 1.6, xw + 0.25, ROOM.top, cz + 1.6, ROCK);    // sopra la porta
  b.box(x0, Y, cz - 0.86, x0 + 0.2, Y + 3.4, cz + 0.86, WOOD, { surface: 'wood' });  // porta
  for (const y of [0.6, 1.7, 2.8]) b.box(x0 + 0.2, Y + y - 0.07, cz - 0.86, x0 + 0.25, Y + y + 0.07, cz + 0.86, METAL, { collide: false });
  // catene incrociate (anelli a scaletta) e lucchetto
  for (const dir of [-1, 1]) {
    for (let i = 0; i <= 11; i++) {
      const t = i / 11, z = cz + dir * (-0.8 + 1.6 * t), y = Y + 0.3 + 2.9 * t;
      b.box(x0 + 0.25, y - 0.07, z - 0.08, x0 + 0.33, y + 0.07, z + 0.08, 0x55585e, { collide: false });
    }
  }
  b.box(x0 + 0.27, Y + 1.55, cz - 0.17, x0 + 0.4, Y + 1.9, cz + 0.17, 0x7a6420, { collide: false });
  // simbolo inciso sopra la porta: cerchio con un triangolo e un occhio al centro
  const sx = xw + 0.27, sy = Y + 3.95, R3 = 0.36, RED = 0xa02020, G = { collide: false, glow: 0.35 };
  b.geo(torus, sx, sy, cz, RED, { rotY: Math.PI / 2, glow: 0.35 });
  const P = [0, 1, 2].map((i) => [cz + Math.sin((i * 2 * Math.PI) / 3) * R3, sy + Math.cos((i * 2 * Math.PI) / 3) * R3]);
  for (let e = 0; e < 3; e++) {
    const [za, ya] = P[e], [zb, yb] = P[(e + 1) % 3];
    for (let i = 0; i <= 7; i++) {
      const t = i / 7, z = za + (zb - za) * t, y = ya + (yb - ya) * t;
      b.box(sx - 0.02, y - 0.035, z - 0.035, sx + 0.03, y + 0.035, z + 0.035, RED, G);
    }
  }
  b.box(sx - 0.02, sy - 0.07, cz - 0.07, sx + 0.04, sy + 0.07, cz + 0.07, 0xff5a3a, { collide: false, glow: 0.8 });
}

function stairsAndCrypt(b, ctx) {
  const { x0, x1, z0, z1 } = STAIRS, C = CRYPT, H = 4.5, ROOF = 110;
  b.ramp(x0, z0, x1, z1, 'z', ROOM.y, 0, 0x4a4239, { steps: true, surface: 'stone' });
  // soffitto della scalinata fino alla cripta (poi c'è il tetto della cripta)
  b.ramp(x0 - 1, z0, x1 + 1, ROOF, 'z', stairFloor(z0) + 3.6, stairFloor(ROOF) + 3.6, CEIL, { thick: 0.3 });
  // pareti: sotto terra roccia, sopra terra la pietra chiara della cripta
  for (let z = z0 - 0.4; z < C.z1 - 0.7 - 0.01; z += 2) {
    const zb = Math.min(C.z1 - 0.7, z + 2), lo = stairFloor(z) - 0.6;
    const hi = zb <= ROOF ? stairFloor(zb) + 3.9 : H;
    for (const [a, c] of [[C.x0, x0], [x1, C.x1]]) {
      if (lo < 0) b.box(a, lo, z, c, Math.min(0, hi), zb, ROCK, { skip: SKIP.BOTTOM, ao: false });
      if (hi > 0) b.box(a, Math.max(0, lo), z, c, hi, zb, STONE, { skip: SKIP.BOTTOM });
    }
  }
  // cripta: muro nord, pavimento in cima alle scale, facciata con la porta, tetto a gradoni, croce
  b.box(C.x0, -1, C.z0, C.x1, H, ROOF, STONE, { skip: SKIP.BOTTOM });
  b.box(x0, -0.3, z1, x1, 0, C.z1 + 0.2, 0x6b655c, { skip: SKIP.BOTTOM });
  const DZ0 = C.z1 - 0.7, DX0 = 8.8, DX1 = 11.2, DH = 3;
  b.box(C.x0, 0, DZ0, DX0, H, C.z1, STONE, { skip: SKIP.BOTTOM });
  b.box(DX1, 0, DZ0, C.x1, H, C.z1, STONE, { skip: SKIP.BOTTOM });
  b.box(DX0, DH, DZ0, DX1, H, C.z1, STONE);
  b.box(C.x0 - 0.4, H, C.z0 - 0.4, C.x1 + 0.4, H + 0.3, C.z1 + 0.4, STONE_D);
  b.box(C.x0 + 0.2, H + 0.3, C.z0, C.x1 - 0.2, H + 0.6, C.z1, STONE_D);
  b.box(C.x0 + 0.9, H + 0.6, C.z0 + 0.4, C.x1 - 0.9, H + 0.9, C.z1 - 0.4, STONE_D);
  for (const [a, c, y] of [[7.2, 12.8, 0.3], [8.1, 11.9, 0.8], [9.1, 10.9, 1.3]]) b.box(a, H + y, C.z1, c, H + y + 0.5, C.z1 + 0.25, STONE);
  b.box(9.92, H + 1.8, C.z1 + 0.05, 10.08, H + 3.1, C.z1 + 0.2, STONE);
  b.box(9.55, H + 2.5, C.z1 + 0.05, 10.45, H + 2.66, C.z1 + 0.2, STONE);
  // colonnine ai lati della porta e gradino davanti
  for (const x of [DX0 - 0.35, DX1 + 0.35]) b.box(x - 0.2, 0, C.z1, x + 0.2, DH + 0.3, C.z1 + 0.3, 0xa39d92, { skip: SKIP.BOTTOM });
  b.box(DX0 - 0.4, 0, C.z1, DX1 + 0.4, 0.12, C.z1 + 0.8, 0x7a746a, { skip: SKIP.BOTTOM });
  (ctx.signs || (ctx.signs = [])).push({ text: 'CRIPTA', x: 10, y: 3.55, z: C.z1 + 0.02, w: 2.6, h: 0.55, rotY: 0, bg: '#9a948a', fg: '#2a2622' });
  // cancelletto di ferro aperto (si può andare e tornare): un'anta girata verso fuori
  const hx = DX1, hz = C.z1 + 0.12, ang = (68 * Math.PI) / 180, L = DX1 - DX0;
  const ux = Math.cos(ang), uz = Math.sin(ang);
  for (const y of [0.3, 1.4, 2.45]) b.wallSeg(hx, hz, hx + ux * L, hz + uz * L, y - 0.04, y + 0.04, 0.05, METAL, { collide: false });
  for (let i = 0; i <= 8; i++) {
    const t = i / 8, x = hx + ux * L * t, z = hz + uz * L * t;
    b.box(x - 0.025, 0.05, z - 0.025, x + 0.025, 2.6 + (i % 2) * 0.15, z + 0.025, METAL, { collide: false });
  }
}

/** Il recinto del cimitero (prato e muri). Tombe, cappelle, fontana e il resto sono in world/cemetery.js. */
function cemeteryYard(b) {
  const { x0, x1, z0, z1 } = CEM, H = 4, T = 0.5, WALL = 0x4a4742;
  for (const r of minus([x0, z0, x1, z1], [CRYPT.x0, CRYPT.z0, CRYPT.x1, CRYPT.z1])) {
    b.box(r[0], -0.3, r[1], r[2], 0, r[3], 0x3c5233, { skip: SKIP.BOTTOM, surface: 'dirt' });
  }
  b.box(x0 - T, 0, z0 - T, x1 + T, H, z0, WALL, { skip: SKIP.BOTTOM });
  b.box(x0 - T, 0, z1, x1 + T, H, z1 + T, WALL, { skip: SKIP.BOTTOM });
  b.box(x0 - T, 0, z0, x0, H, z1, WALL, { skip: SKIP.BOTTOM });
  b.box(x1, 0, z0, x1 + T, H, z1, WALL, { skip: SKIP.BOTTOM });
  // punte di ferro sopra i muri
  for (let x = x0; x <= x1; x += 1.5) for (const z of [z0 - T / 2, z1 + T / 2]) b.box(x - 0.04, H, z - 0.04, x + 0.04, H + 0.6, z + 0.04, METAL, { collide: false, ao: false });
  for (let z = z0; z <= z1; z += 1.5) for (const x of [x0 - T / 2, x1 + T / 2]) b.box(x - 0.04, H, z - 0.04, x + 0.04, H + 0.6, z + 0.04, METAL, { collide: false, ao: false });
}

/* ============================ Parti che si muovono ============================ */
let lamps = null, flames = null, lampState = [], flameT = [];
const lampMat = glowMat(new THREE.MeshBasicMaterial({ color: 0xffffff }), 2.2);
const flameMat = glowMat(new THREE.MeshBasicMaterial({ color: 0xffffff }), 2.4);
const LAMP_ON = new THREE.Color(0xffd79a), LAMP_DIM = new THREE.Color(0x4a3a2a), col = new THREE.Color();
const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p3 = new THREE.Vector3(), s3 = new THREE.Vector3();

export function clearUnderVisuals() {
  for (const m of [lamps, flames]) if (m) { scene.remove(m); m.dispose(); }
  lamps = flames = null;
}

/** Lampade e fiammelle (a ogni nuova mappa, dai punti raccolti in buildUnderground). */
export function buildUnderVisuals(under) {
  clearUnderVisuals();
  if (!under) return;
  lamps = new THREE.InstancedMesh(new THREE.BoxGeometry(0.22, 0.26, 0.22), lampMat, under.lamps.length);
  lampState = under.lamps.map(() => ({ t: Math.random() * 5, off: 0, bad: Math.random() < 0.35 }));
  under.lamps.forEach(([x, y, z], i) => { lamps.setMatrixAt(i, m4.makeTranslation(x, y, z)); lamps.setColorAt(i, LAMP_ON); });
  flames = new THREE.InstancedMesh(new THREE.ConeGeometry(0.075, 0.26, 5), flameMat, under.candles.length);
  flames.userData.pos = under.candles;
  flameT = under.candles.map(() => Math.random() * 10);
  under.candles.forEach(([x, y, z], i) => { flames.setMatrixAt(i, m4.makeTranslation(x, y, z)); flames.setColorAt(i, col.setHex(0xffb24a)); });
  for (const m of [lamps, flames]) { m.computeBoundingSphere(); scene.add(m); }
}

/* ---------- Suoni: gocce e passi con l'eco ---------- */
let echo = null;
/** Un'uscita con l'eco (ritardo che si ripete piano), creata la prima volta che serve. */
function echoOut(ctx) {
  if (echo && echo.ctx === ctx) return echo.input;
  const input = ctx.createGain(), d = ctx.createDelay(1), fb = ctx.createGain(), wet = ctx.createGain();
  d.delayTime.value = 0.23; fb.gain.value = 0.42; wet.gain.value = 0.55;
  input.connect(ctx.destination);
  input.connect(d); d.connect(fb).connect(d); d.connect(wet).connect(ctx.destination);
  echo = { ctx, input };
  return input;
}
function drip() {
  const ctx = audioCtx();
  if (!ctx) return;
  try {
    const t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain(), f = 900 + Math.random() * 900;
    o.type = 'sine';
    o.frequency.setValueAtTime(f, t);
    o.frequency.exponentialRampToValueAtTime(f * 1.9, t + 0.06);
    g.gain.setValueAtTime(0.001, t);
    g.gain.exponentialRampToValueAtTime(0.06, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    o.connect(g).connect(echoOut(ctx));
    o.start(t); o.stop(t + 0.14);
  } catch (e) { /* audio non disponibile */ }
}
function footstep() {
  const ctx = audioCtx();
  if (!ctx) return;
  try {
    const t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
    o.type = 'triangle';
    o.frequency.setValueAtTime(95 + Math.random() * 25, t);
    o.frequency.exponentialRampToValueAtTime(55, t + 0.07);
    f.type = 'lowpass'; f.frequency.value = 600;
    g.gain.setValueAtTime(0.09, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    o.connect(f).connect(g).connect(echoOut(ctx));
    o.start(t); o.stop(t + 0.1);
  } catch (e) { /* audio non disponibile */ }
}

let flickT = 0, dripT = 2, stepD = 0, lastX = 0, lastZ = 0;
/**
 * A ogni frame. me = { x, y (piedi), z, ground } del giocatore locale, playing = partita in corso.
 * Lampade e candele si aggiornano 20 volte al secondo e solo se il giocatore è nell'area nuova.
 */
export function updateUnderground(dt, me, playing) {
  if (!lamps) return;
  const near = me.z > GATE_Z - 25;
  flickT -= dt;
  if (near && flickT <= 0) {
    const step = 0.05 - flickT;
    flickT = 0.05;
    lampState.forEach((s, i) => {
      s.t -= step;
      if (s.off > 0) s.off -= step;
      if (s.t <= 0) {
        // le lampade "malate" sfarfallano spesso, le altre ogni tanto
        s.t = s.bad ? 0.08 + Math.random() * (Math.random() < 0.5 ? 0.3 : 2.5) : 2 + Math.random() * 7;
        s.off = Math.random() < (s.bad ? 0.6 : 0.3) ? 0.04 + Math.random() * 0.12 : 0;
      }
      lamps.setColorAt(i, s.off > 0 ? LAMP_DIM : col.copy(LAMP_ON).multiplyScalar(0.9 + Math.random() * 0.1));
    });
    lamps.instanceColor.needsUpdate = true;
    const pos = flames.userData.pos;
    for (let i = 0; i < pos.length; i++) {
      flameT[i] += step * (6 + (i % 5));
      const k = 0.8 + Math.sin(flameT[i]) * 0.12 + Math.sin(flameT[i] * 2.7) * 0.08;
      const [x, y, z] = pos[i];
      m4.compose(p3.set(x, y + (k - 0.8) * 0.06, z), q.identity(), s3.set(1, k * 1.25, 1));
      flames.setMatrixAt(i, m4);
      flames.setColorAt(i, col.setRGB(1, 0.42 + k * 0.18, 0.08 + k * 0.06));
    }
    flames.instanceMatrix.needsUpdate = true;
    flames.instanceColor.needsUpdate = true;
  }
  // nebbia buia sotto terra (sfuma in mezzo secondo)
  const inside = isUnderground(me.x, me.y, me.z) || (me.z > TUN.r0 && me.z < CEM.z0 && me.y < 0.5);
  const u = skyState.under || 0, want = inside ? 1 : 0;
  if (u !== want) skyState.under = Math.abs(want - u) < 0.02 ? want : u + (want - u) * Math.min(1, dt * 3);
  // suoni sotto terra
  if (!playing || !isUnderground(me.x, me.y, me.z)) { lastX = me.x; lastZ = me.z; return; }
  dripT -= dt;
  if (dripT <= 0) { dripT = 1.2 + Math.random() * 3.5; drip(); }
  const moved = Math.hypot(me.x - lastX, me.z - lastZ);
  lastX = me.x; lastZ = me.z;
  if (me.ground && moved < 1) {
    stepD += moved;
    if (stepD > 1.9) { stepD = 0; footstep(); }
  }
}

