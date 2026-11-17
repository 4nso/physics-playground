// Tipi di riquadro (stanze e aree esterne). Ogni riquadro è 15×15 m.
// Coordinate locali: x e z da 0 a 15. Le porte (larghe 2.4 m) sono sempre al centro dei lati
// (da 6.3 a 8.7): ogni stanza deve lasciare libero il passaggio tra le sue porte.
// I muri sui bordi li costruisce map.js; qui si fanno pavimento, soffitto e contenuto.
import * as THREE from 'three';
import { SKIP } from './builder.js';

export const TILE = 15;
export const DOOR0 = 6.3, DOOR1 = 8.7;

/**
 * Proprietà dei tipi: interno o esterno, altezza del soffitto, colori dei muri (lato interno),
 * della facciata (vista da fuori) e colore nella minimappa.
 */
export const TYPES = {
  corridoi: { indoor: true, H: 3.2, wall: 0xdcc65c, facade: 0xc8b98e, map: '#d9c35a', name: 'Corridoi gialli' },
  uffici: { indoor: true, H: 6, wall: 0xe4e0d4, facade: 0x8ea2b8, map: '#8ea2b8', name: 'Uffici' },
  piscina: { indoor: true, H: 6, wall: 0xc4e6e6, facade: 0xdbeef0, map: '#7fd0dc', name: 'Piscina' },
  parcheggio: { indoor: false, wall: 0x9a9c9f, map: '#6b7079', name: 'Parcheggio' },
  parco: { indoor: false, wall: 0xb4664a, map: '#79b04a', name: 'Parco giochi' },
  piazza: { indoor: false, wall: 0xb4664a, map: '#d7c39b', name: 'Piazza' },
};
export const FENCE_H = 2.6;

const cone = new THREE.ConeGeometry(1, 1, 7);
const ico = new THREE.IcosahedronGeometry(1, 0);
const sc = new THREE.Vector3();

/** Aiutanti con coordinate locali del riquadro. */
function helpers(c) {
  const { b, ox, oz } = c;
  return {
    box: (x0, y0, z0, x1, y1, z1, col, o) => b.box(ox + x0, y0, oz + z0, ox + x1, y1, oz + z1, col, o),
    ramp: (x0, z0, x1, z1, axis, h0, h1, col, o) => b.ramp(ox + x0, oz + z0, ox + x1, oz + z1, axis, h0, h1, col, o),
    geo: (g, x, y, z, col, o) => b.geo(g, ox + x, y, oz + z, col, o),
    water: (x0, z0, x1, z1, y) => b.waterQuad(ox + x0, oz + z0, ox + x1, oz + z1, y),
    crate: (x, y, z, size = 1) => c.props.push({ kind: 'crate', x: ox + x, y: y + size / 2 + 0.02, z: oz + z, size }),
    ball: (x, y, z, r = 0.5) => c.props.push({ kind: 'ball', x: ox + x, y: y + r + 0.05, z: oz + z, r }),
  };
}

/** Pavimento (con il lato di sotto nascosto) e soffitto con il tetto sopra. */
function floor(h, col, x0 = 0, z0 = 0, x1 = TILE, z1 = TILE, y = 0, surface = 'stone') {
  h.box(x0, y - 0.3, z0, x1, y, z1, col, { skip: SKIP.BOTTOM, surface });
}
function ceiling(h, H, col, roof = 0x8c8a84) {
  h.box(0, H, 0, TILE, H + 0.28, TILE, col, { skip: SKIP.TOP });
  h.box(0, H + 0.28, 0, TILE, H + 0.3, TILE, roof, { collide: false, skip: SKIP.BOTTOM });
}
/** Pannello luminoso (neon) sotto il soffitto. */
function neon(h, x, z, w, d, H, on = true) {
  h.box(x - w / 2, H - 0.05, z - d / 2, x + w / 2, H, z + d / 2, on ? 0xfffbe8 : 0x9a9688, { collide: false, glow: on });
}
/** Tavoli, sedie e simili: scatole statiche. */
function crateSpots(h, rng, spots, n) {
  rng.shuffle(spots);
  for (let i = 0; i < Math.min(n, spots.length); i++) {
    const [x, y, z] = spots[i];
    if (rng.chance(0.25)) h.ball(x, y, z, 0.35 + rng.next() * 0.25);
    else h.crate(x, y, z, rng.chance(0.2) ? 1.4 : 1);
  }
}

/* ---------- Corridoi gialli (backrooms) ---------- */
function corridoi(c) {
  const h = helpers(c), { rng } = c, T = TYPES.corridoi, H = T.H;
  floor(h, 0xa98e44, 0, 0, TILE, TILE, 0, 'soft');
  ceiling(h, H, 0xe2dbb4);
  // labirinto su una griglia 5×5 di celle da 3 m: albero casuale + qualche apertura in più
  const N = 5, S = TILE / N;
  const parent = Array.from({ length: N * N }, (_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const edges = [];
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    if (i < N - 1) edges.push([i, j, 'x']);
    if (j < N - 1) edges.push([i, j, 'z']);
  }
  rng.shuffle(edges);
  const open = new Set();
  for (const e of edges) {
    const a = e[1] * N + e[0], bb = e[2] === 'x' ? a + 1 : a + N;
    if (find(a) !== find(bb)) { parent[find(a)] = find(bb); open.add(e.join()); }
    else if (rng.chance(0.42)) open.add(e.join());
  }
  const wallCol = T.wall, base = 0x8a7430, t = 0.1;
  for (const e of edges) {
    if (open.has(e.join())) continue;
    const [i, j, ax] = e;
    if (ax === 'x') {
      const x = (i + 1) * S;
      h.box(x - t, 0, j * S - t, x + t, H, (j + 1) * S + t, wallCol);
      h.box(x - t - 0.02, 0, j * S - t, x + t + 0.02, 0.14, (j + 1) * S + t, base, { collide: false, ao: false });
    } else {
      const z = (j + 1) * S;
      h.box(i * S - t, 0, z - t, (i + 1) * S + t, H, z + t, wallCol);
      h.box(i * S - t, 0, z - t - 0.02, (i + 1) * S + t, 0.14, z + t + 0.02, base, { collide: false, ao: false });
    }
  }
  // neon: uno per cella, qualcuno spento (fa più "backrooms")
  const spots = [];
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    neon(h, i * S + S / 2, j * S + S / 2, 1.3, 0.45, H, !rng.chance(0.15));
    if (i !== 2 && j !== 2) spots.push([i * S + S / 2 + rng.range(-0.6, 0.6), 0, j * S + S / 2 + rng.range(-0.6, 0.6)]);
  }
  crateSpots(h, rng, spots, 2 + rng.int(2));
}

/* ---------- Uffici vuoti con soppalco ---------- */
function desk(h, x, z, y = 0, w = 1.6, d = 0.8) {
  h.box(x - w / 2, y + 0.7, z - d / 2, x + w / 2, y + 0.76, z + d / 2, 0xd9cdb2, { surface: 'wood' });
  h.box(x - w / 2 + 0.05, y, z - d / 2 + 0.05, x - w / 2 + 0.12, y + 0.7, z + d / 2 - 0.05, 0x6b6f78, { surface: 'metal' });
  h.box(x + w / 2 - 0.12, y, z - d / 2 + 0.05, x + w / 2 - 0.05, y + 0.7, z + d / 2 - 0.05, 0x6b6f78, { surface: 'metal' });
  // monitor
  h.box(x - 0.3, y + 0.76, z - 0.05, x + 0.3, y + 1.15, z + 0.02, 0x23262d, { collide: false });
}
function uffici(c) {
  const h = helpers(c), { rng } = c, T = TYPES.uffici, H = T.H, M = 3; // M = altezza del soppalco
  floor(h, 0x5f6f86, 0, 0, TILE, TILE, 0, 'soft');
  ceiling(h, H, 0xd9d8cf);
  for (let x = 2.5; x < TILE; x += 5) for (let z = 2; z < TILE; z += 3.5) neon(h, x, z, 0.4, 2.2, H);
  // soppalco lungo il lato nord, con ringhiera e pilastri
  h.box(0.15, M - 0.25, 0.15, 14.85, M, 4.5, 0x55657d, { surface: 'soft' });
  h.box(0.15, M - 0.3, 4.45, 14.85, M - 0.25, 4.5, 0xc9c9c9, { collide: false });
  for (const x of [1.5, 10.5, 13.5]) h.box(x - 0.15, 0, 4.15, x + 0.15, M - 0.25, 4.45, 0xcfd2d6);
  const rail = 0x3b4250;
  h.box(0.15, M, 4.42, 3.5, M + 1, 4.5, rail, { surface: 'metal' });
  h.box(5.5, M, 4.42, 14.85, M + 1, 4.5, rail, { surface: 'metal' });
  // scala verso il soppalco (gradini disegnati, rampa liscia per la fisica)
  h.ramp(3.5, 4.5, 5.5, 12.5, 'z', M, 0, 0x9aa3ad, { steps: true });
  h.box(3.42, 0, 4.5, 3.5, 1.0, 12.5, rail, { collide: false });
  // scrivanie e pareti divisorie (lasciano liberi i passaggi tra le porte)
  for (const [x, z] of [[10.6, 10.6], [13.2, 10.6], [10.6, 13.2], [13.2, 13.2], [1.6, 10.4], [1.6, 13.3]]) desk(h, x, z);
  h.box(9.6, 0, 11.85, 14.6, 1.35, 11.95, 0x8f9bb0);
  h.box(0.4, 0, 11.85, 2.6, 1.35, 11.95, 0x8f9bb0);
  // al piano di sopra
  desk(h, 9.5, 1.6, M); desk(h, 12.4, 1.6, M);
  // piante in vaso
  for (const [x, z] of [[14.2, 5.4], [0.9, 5.4]]) {
    h.box(x - 0.3, 0, z - 0.3, x + 0.3, 0.5, z + 0.3, 0xb0643c);
    h.geo(cone, x, 1.2, z, 0x3f8a3a, { scale: sc.set(0.5, 1.4, 0.5) });
  }
  crateSpots(h, rng, [[7.5, M, 2.2], [12.5, M, 3.6], [6.5, 0, 12.8], [12, 0, 7.5], [2.5, 0, 2.4], [8.6, 0, 1.4]], 3);
}

/* ---------- Piscina coperta (vasca vuota a metà, con acqua bassa) ---------- */
function piscina(c) {
  const h = helpers(c), { rng } = c, T = TYPES.piscina, H = T.H, D = 1.6;
  const tile = 0xe8f3f2, blue = 0x6fc0d4;
  const P = [3, 3.5, 12, 11.5]; // vasca: x0, z0, x1, z1
  // bordi della vasca: sopra piastrelle chiare, sotto (le pareti della vasca) azzurro
  const strips = [[0, 0, TILE, P[1]], [0, P[3], TILE, TILE], [0, P[1], P[0], P[3]], [P[2], P[1], TILE, P[3]]];
  for (const [x0, z0, x1, z1] of strips) {
    h.box(x0, -0.3, z0, x1, 0, z1, tile, { skip: SKIP.BOTTOM });
    h.box(x0, -D - 0.3, z0, x1, -0.3, z1, blue, { skip: SKIP.BOTTOM | SKIP.TOP });
  }
  h.box(P[0], -D - 0.3, P[1], P[2], -D, P[3], blue, { skip: SKIP.BOTTOM });
  for (let x = P[0] + 1.5; x < P[2]; x += 1.5) h.box(x - 0.1, -D, P[1] + 0.6, x + 0.1, -D + 0.01, P[3] - 0.6, 0x2f6f9a, { collide: false });
  // rampe per scendere nella vasca
  h.ramp(P[0], P[1], P[0] + 2, 9, 'z', 0, -D, 0xd5ecee);
  h.ramp(P[2] - 2, 6, P[2], P[3], 'z', -D, 0, 0xd5ecee);
  h.water(P[0], P[1], P[2], P[3], -0.6);
  ceiling(h, H, 0xf0f0e8);
  for (let x = 3.75; x < TILE; x += 3.75) neon(h, x, 7.5, 1.6, 6, H);
  for (const [x, z] of [[1.4, 1.4], [13.6, 1.4], [1.4, 13.6], [13.6, 13.6]]) h.box(x - 0.35, 0, z - 0.35, x + 0.35, H, z + 0.35, 0xf6f6f2);
  // trampolino e lettini
  h.box(9.1, 0, 12.2, 9.9, 0.8, 12.9, 0xb9c1c8);
  h.box(9.2, 0.8, 10.6, 9.8, 0.9, 12.9, 0x2f8fd0, { surface: 'metal' });
  for (const x of [1.2, 3.2, 11.0, 13.0]) h.box(x - 0.4, 0, 12.6, x + 0.4, 0.4, 14.4, rng.pick([0xff7a59, 0xffd166, 0x5ec4a8]), { surface: 'soft' });
  // palloni da spiaggia
  h.ball(6, -D, 6.5, 0.45); h.ball(8.5, -D, 9, 0.45);
  crateSpots(h, rng, [[13.5, 0, 6], [1.5, 0, 9.5], [6, 0, 1.6]], 1 + rng.int(2));
}

/* ---------- Parcheggio con piano rialzato ---------- */
const CAR_COLS = [0xd94f45, 0x3e7fd1, 0xf2c14e, 0x5cb85c, 0xe8e8e8, 0x2b2e35, 0x9a5fd0];
function car(h, rng, x, z, y = 0) {
  const col = rng.pick(CAR_COLS);
  h.box(x - 0.9, y + 0.3, z - 2, x + 0.9, y + 1.0, z + 2, col, { surface: 'metal' });
  h.box(x - 0.78, y + 1.0, z - 1.1, x + 0.78, y + 1.55, z + 0.9, 0x2c3a48, { surface: 'metal' });
  for (const [dx, dz] of [[-0.85, -1.3], [0.85, -1.3], [-0.85, 1.3], [0.85, 1.3]]) {
    h.box(x + dx - 0.14, y, z + dz - 0.33, x + dx + 0.14, y + 0.62, z + dz + 0.33, 0x1d1f23, { collide: false });
  }
}
function parcheggio(c) {
  const h = helpers(c), { rng } = c, M = 3;
  const conc = 0xa3a5a8;
  floor(h, 0x4a4e55);
  // strisce dei posti auto
  for (const x of [0.4, 3.2, 6.0]) h.box(x - 0.06, 0, 9.2, x + 0.06, 0.012, 13.8, 0xf2f2f2, { collide: false });
  h.box(0.4, 0, 13.74, 6.0, 0.012, 13.86, 0xf2f2f2, { collide: false });
  for (let z = 7; z < 15; z += 2) h.box(13.66, 0, z, 13.74, 0.012, z + 1, 0xf2c14e, { collide: false });
  // piano rialzato a nord, su pilastri, con parapetti
  h.box(0.15, M - 0.3, 0.15, 14.85, M, 6, conc);
  for (const [x, z] of [[4, 2], [11, 2], [4, 5.6], [11, 5.6]]) h.box(x - 0.25, 0, z - 0.25, x + 0.25, M - 0.3, z + 0.25, conc);
  const par = 0xbfc1c4;
  h.box(0.15, M, 5.85, 10, M + 1, 6.05, par);
  h.box(12.5, M, 5.85, 14.85, M + 1, 6.05, par);
  h.box(0.15, M, 0.15, 14.85, M + 1, 0.4, par);
  h.box(0.15, M, 0.4, 0.4, M + 1, 5.85, par);
  h.box(14.6, M, 0.4, 14.85, M + 1, 5.85, par);
  for (const x of [0.4, 3.2, 6.0, 8.8]) h.box(x - 0.06, M, 0.6, x + 0.06, M + 0.012, 5.2, 0xf2f2f2, { collide: false });
  // rampa per le auto
  h.ramp(10, 6, 12.5, 14, 'z', M, 0, 0x8e9196);
  h.box(9.85, 0, 6.05, 10, 0.9, 14, par, { collide: false });
  // auto parcheggiate
  car(h, rng, 1.8, 11.5); if (rng.chance(0.7)) car(h, rng, 4.6, 11.5);
  car(h, rng, 1.8, 3, M); car(h, rng, 7.4, 3, M);
  if (rng.chance(0.6)) car(h, rng, 4.6, 3, M);
  crateSpots(h, rng, [[13.4, M, 1.6], [9.6, M, 1.6], [14, 0, 14], [6.5, 0, 13.5], [8.4, 0, 3.5], [13, 0, 4.2]], 3);
}

/* ---------- Parco giochi / cortile ---------- */
function tree(h, rng, x, z) {
  h.box(x - 0.18, 0, z - 0.18, x + 0.18, 2.2, z + 0.18, 0x7a5232, { surface: 'wood' });
  const s = rng.range(1.3, 1.9);
  if (rng.chance(0.5)) h.geo(ico, x, 2.2 + s * 0.8, z, rng.pick([0x4f9a3c, 0x5fae45, 0x3f8a3a]), { scale: sc.set(s, s * 1.1, s), rotY: rng.next() * 6 });
  else h.geo(cone, x, 2.2 + s, z, rng.pick([0x3f8a3a, 0x2f7a4a]), { scale: sc.set(s, s * 2.6, s), rotY: rng.next() * 6 });
}
function paths(h, col) {
  h.box(DOOR0, 0, 0, DOOR1, 0.012, TILE, col, { collide: false });
  h.box(0, 0, DOOR0, TILE, 0.012, DOOR1, col, { collide: false });
}
function parco(c) {
  const h = helpers(c), { rng } = c, wood = 0xc98a4a, red = 0xe0503c, metal = 0x3b4250;
  floor(h, 0x79b04a, 0, 0, TILE, TILE, 0, 'dirt');
  paths(h, 0xcdb68a);
  // torretta con scala e scivolo (angolo nord-ovest)
  const P = 2.0;
  h.box(0.6, P - 0.15, 0.6, 2.4, P, 2.4, wood, { surface: 'wood' });
  for (const [x, z] of [[0.6, 0.6], [2.25, 0.6], [0.6, 2.25], [2.25, 2.25]]) h.box(x, 0, z, x + 0.15, P + 1.1, z + 0.15, red, { surface: 'metal' });
  h.box(0.6, P, 0.6, 2.4, P + 0.9, 0.7, red, { surface: 'metal' });
  h.box(0.6, P, 0.6, 0.7, P + 0.9, 2.4, red, { surface: 'metal' });
  h.box(0.6, P + 1.1, 0.6, 2.4, P + 1.15, 2.4, 0xffd166, { collide: false });
  h.geo(cone, 1.5, P + 1.7, 1.5, 0xffd166, { scale: sc.set(1.35, 1.1, 1.35), rotY: Math.PI / 4 });
  h.ramp(0.8, 2.4, 2.2, 6.2, 'z', P, 0, wood, { steps: true });
  h.ramp(2.4, 0.8, 6.2, 1.8, 'x', P, 0.25, 0x3e9be0, { thick: 0.15 });
  // altalene (angolo sud-est)
  for (const x of [10, 14]) h.box(x - 0.1, 0, 11.9, x + 0.1, 2.7, 12.1, metal, { surface: 'metal' });
  h.box(9.9, 2.6, 11.9, 14.1, 2.75, 12.1, metal, { collide: false });
  for (const x of [11.2, 12.8]) {
    for (const dz of [-0.2, 0.2]) h.box(x - 0.02, 0.55, 12 + dz - 0.02, x + 0.02, 2.6, 12 + dz + 0.02, 0x222222, { collide: false });
    h.box(x - 0.35, 0.5, 11.75, x + 0.35, 0.56, 12.25, red, { collide: false });
  }
  // sabbiera (angolo nord-est)
  const sx0 = 10.2, sz0 = 1.2, sx1 = 13.8, sz1 = 4.8;
  h.box(sx0, 0, sz0, sx1, 0.25, sz0 + 0.2, wood); h.box(sx0, 0, sz1 - 0.2, sx1, 0.25, sz1, wood);
  h.box(sx0, 0, sz0 + 0.2, sx0 + 0.2, 0.25, sz1 - 0.2, wood); h.box(sx1 - 0.2, 0, sz0 + 0.2, sx1, 0.25, sz1 - 0.2, wood);
  h.box(sx0 + 0.2, 0, sz0 + 0.2, sx1 - 0.2, 0.06, sz1 - 0.2, 0xf0d68a, { collide: false });
  // panchine e alberi (angolo sud-ovest e dintorni)
  for (const [x, z] of [[2, 10.5], [4.4, 13.6]]) {
    h.box(x - 0.8, 0.4, z - 0.25, x + 0.8, 0.5, z + 0.25, wood, { surface: 'wood' });
    h.box(x - 0.7, 0, z - 0.2, x - 0.6, 0.4, z + 0.2, metal, { collide: false });
    h.box(x + 0.6, 0, z - 0.2, x + 0.7, 0.4, z + 0.2, metal, { collide: false });
  }
  const treeSpots = [[1.2, 13.4], [4.6, 10.2], [13.6, 9.6], [9.8, 14], [13.8, 6], [4.8, 4.6]];
  rng.shuffle(treeSpots);
  for (let i = 0; i < 4; i++) tree(h, rng, ...treeSpots[i]);
  h.ball(12, 0, 3, 0.4);
  crateSpots(h, rng, [[11.5, 0, 9.5], [3.5, 0, 8.6], [9.5, 0, 5.2], [13.6, 0, 13.6]], 2);
}

/* ---------- Piazza di partenza: palla demolitrice, piedistallo con casse ---------- */
function piazza(c) {
  const h = helpers(c), { rng } = c, metal = 0x3b4250;
  floor(h, 0xd7c39b);
  // disegno a scacchi sul pavimento
  for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) {
    if ((i + j) % 2) h.box(i * 3, 0, j * 3, i * 3 + 3, 0.01, j * 3 + 3, 0xc9b285, { collide: false });
  }
  // portale della palla demolitrice
  const gx = 10.5;
  h.box(gx - 0.15, 0, 3.75, gx + 0.15, 7.3, 4.05, metal, { surface: 'metal' });
  h.box(gx - 0.15, 0, 10.95, gx + 0.15, 7.3, 11.25, metal, { surface: 'metal' });
  h.box(gx - 0.2, 7.15, 3.7, gx + 0.2, 7.45, 11.3, metal, { collide: false });
  c.wreck = { ax: c.ox + gx, ay: 7.15, az: c.oz + 7.5 };
  // piedistallo con piramide di casse
  h.box(1, 0, 1, 5, 1, 5, 0xcfc5b4);
  for (let i = 0; i < 3; i++) h.crate(2 + i * 1.02, 1, 3);
  h.crate(2.51, 2, 3); h.crate(3.53, 2, 3);
  h.ball(12.5, 0, 13, 0.5); h.ball(13.5, 0, 2, 0.5); h.ball(6, 0, 12.5, 0.6);
  for (const [x, z] of [[13.4, 13.4], [1.6, 13.4]]) tree(h, rng, x, z);
  // lampioni
  for (const [x, z] of [[5.6, 5.6], [9.4, 9.4]]) {
    h.box(x - 0.08, 0, z - 0.08, x + 0.08, 3.4, z + 0.08, metal, { surface: 'metal' });
    h.box(x - 0.25, 3.4, z - 0.25, x + 0.25, 3.7, z + 0.25, 0xfff4c8, { collide: false, glow: true });
  }
  c.spawn = { x: c.ox + 5.5, y: 0, z: c.oz + 8.5, yaw: -Math.PI / 2 };
}

export const BUILDERS = { corridoi, uffici, piscina, parcheggio, parco, piazza };
