// Le tre zone tematiche della mappa, una accanto all'altra (da ovest a est):
//   PARCHEGGIO multipiano (3 livelli con rampe) · LUNA PARK (world/lunapark.js) · BACKROOMS (labirinto giallo)
// Il seed cambia i dettagli (labirinto, auto, giochi del parco, porte), non l'ordine delle zone.
// Regola contro lo sfarfallio: due superfici non devono mai stare sullo stesso piano
// (strisce e decorazioni sono sempre un po' più in alto del pavimento e mai sovrapposte tra loro).
import * as THREE from 'three';
import { SKIP } from './builder.js';
import { lunaPark } from './lunapark.js';
import { crate, ball } from './toys.js';
import { buildSecretPassage, buildSafeRoom } from './safezone.js';

export const Z0 = -36, Z1 = 36;          // la mappa va da z = -36 a 36
export const ZONES = [
  { id: 'parcheggio', name: 'Parcheggio', x0: -45, x1: -15, color: '#7b8089' },
  { id: 'parco', name: 'Luna park', x0: -15, x1: 33, color: '#79b04a' },
  { id: 'backrooms', name: 'Backrooms', x0: 33, x1: 63, color: '#d9c35a' },
];
export const OUTER_H = 11;               // muro di confine: abbastanza alto da non scavalcarlo

const BRICK = 0xb4664a, CONC = 0x9a9da2, PAPER = 0xdcc65c, FACADE = 0xc8b98e;
const cone = new THREE.ConeGeometry(1, 1, 7);
const sc = new THREE.Vector3();
const [, PARK, BACK] = ZONES;

/**
 * Muro dritto con eventuali aperture, diviso in due metà (ognuna col colore del suo lato).
 * axis 'x': muro alla coordinata x = pos, lungo z da a0 ad a1 (lato 0 = x minori).
 * axis 'z': muro alla coordinata z = pos, lungo x. holes = [[centro, larghezza, altezza]].
 */
export function wallLine(b, axis, pos, a0, a1, h, holes, col0, col1) {
  const t = 0.15, segs = [];
  let a = a0;
  for (const [c, w, hh] of [...holes].sort((p, q) => p[0] - q[0])) {
    if (c - w / 2 > a) segs.push([a, c - w / 2, 0, h]);
    if (hh < h) segs.push([c - w / 2, c + w / 2, hh, h]);
    a = c + w / 2;
  }
  if (a < a1) segs.push([a, a1, 0, h]);
  for (let s = 0; s < 2; s++) {
    const col = s === 0 ? col0 : col1;
    for (const [s0, s1, y0, y1] of segs) {
      const p0 = s === 0 ? pos - t : pos, p1 = s === 0 ? pos : pos + t;
      if (axis === 'x') b.box(p0, y0, s0, p1, y1, s1, col, { skip: SKIP.BOTTOM });
      else b.box(s0, y0, p0, s1, y1, p1, col, { skip: SKIP.BOTTOM });
    }
  }
}

/* ======================= PARCHEGGIO MULTIPIANO ======================= */
const CAR_COLS = [0xd94f45, 0x3e7fd1, 0xf2c14e, 0x5cb85c, 0xe8e8e8, 0x2b2e35, 0x9a5fd0, 0xff8a3d];
/** Auto low-poly orientata lungo x, centrata in (x, z), appoggiata all'altezza y. */
function car(b, rng, x, z, y) {
  const col = rng.pick(CAR_COLS), dir = rng.chance(0.5) ? 1 : -1;
  b.box(x - 2, y + 0.3, z - 0.9, x + 2, y + 1.0, z + 0.9, col, { surface: 'metal' });
  b.box(x + (dir > 0 ? -1.1 : -0.7), y + 1.0, z - 0.78, x + (dir > 0 ? 0.7 : 1.1), y + 1.55, z + 0.78, 0x2c3a48, { surface: 'metal' });
  for (const [dx, dz] of [[-1.3, -0.86], [1.3, -0.86], [-1.3, 0.86], [1.3, 0.86]]) {
    b.box(x + dx - 0.33, y + 0.01, z + dz - 0.14, x + dx + 0.33, y + 0.62, z + dz + 0.14, 0x1d1f23, { collide: false });
  }
  // fari
  b.box(x + 2 * dir - 0.02, y + 0.6, z - 0.7, x + 2 * dir + 0.02, y + 0.8, z - 0.35, 0xfff6c8, { collide: false, glow: true });
  b.box(x + 2 * dir - 0.02, y + 0.6, z + 0.35, x + 2 * dir + 0.02, y + 0.8, z + 0.7, 0xfff6c8, { collide: false, glow: true });
}

/** Rettangolo [x0,z0,x1,z1] meno un buco: restituisce fino a 4 rettangoli che non si sovrappongono. */
function rectMinus(r, h) {
  if (!h) return [r];
  return [
    [r[0], r[1], h[0], r[3]],
    [h[2], r[1], r[2], r[3]],
    [h[0], r[1], h[2], h[1]],
    [h[0], h[3], h[2], r[3]],
  ].filter((q) => q[2] - q[0] > 0.01 && q[3] - q[1] > 0.01);
}

export const PARK_GATES = [-24, 0, 24];   // varchi a piano terra tra parcheggio e parco (z)

function parking(b, rng, ctx) {
  const X0 = -45, U = (u) => X0 + u, V = (v) => Z0 + v;
  const LV = [0, 3.5, 7], T = 0.3;
  const BAND = [0xf2c14e, 0x3e7fd1, 0xd94f45]; // colore del piano: giallo, blu, rosso
  b.box(U(0), -0.3, V(0), U(30), 0, V(72), 0x4a4e55, { skip: SKIP.BOTTOM });
  // solette dei piani 1 e 2 con il buco per la rampa
  const holes = [null, [13, 20, 17, 29], [13, 43, 17, 52]];
  for (let L = 1; L <= 2; L++) {
    for (const r of rectMinus([0.15, 0.15, 29.85, 71.85], holes[L])) {
      b.box(U(r[0]), LV[L] - T, V(r[1]), U(r[2]), LV[L], V(r[3]), 0x8a8d93);
    }
  }
  // rampe: terra → piano 1 (va verso sud), piano 1 → piano 2 (torna verso nord)
  b.ramp(U(13), V(20), U(17), V(29), 'z', 0, LV[1], 0x7f8288);
  b.ramp(U(13), V(43), U(17), V(52), 'z', LV[2], LV[1], 0x7f8288);
  for (const [x, h0, h1] of [[13, 0, 1], [17, 0, 1]]) {
    // cordoli colorati ai lati della prima rampa (solo decorazione)
    b.box(U(x) - 0.08, h0, V(19.9), U(x) + 0.08, h1 * 0.25, V(20.6), 0xf2c14e, { collide: false });
  }
  // ringhiere intorno ai buchi delle rampe (si entra solo dal lato giusto)
  const rail = (x0, z0, x1, z1, y) => b.box(U(x0), y, V(z0), U(x1), y + 1.1, V(z1), 0xf2c14e, { surface: 'metal', skip: SKIP.BOTTOM });
  rail(12.8, 19.8, 13, 29, LV[1]); rail(17, 19.8, 17.2, 29, LV[1]); rail(13, 19.8, 17, 20, LV[1]);
  rail(12.8, 43, 13, 52.2, LV[2]); rail(17, 43, 17.2, 52.2, LV[2]); rail(13, 52, 17, 52.2, LV[2]);
  // pilastri con una fascia del colore del piano, neon sotto le solette
  for (let L = 0; L < 2; L++) {
    for (const pu of [6, 12, 18, 24]) for (let pv = 6; pv <= 66; pv += 6) {
      const x = U(pu), z = V(pv);
      b.box(x - 0.3, LV[L], z - 0.3, x + 0.3, LV[L + 1] - T, z + 0.3, CONC, { skip: SKIP.BOTTOM | SKIP.TOP });
      b.box(x - 0.32, LV[L] + 1.2, z - 0.32, x + 0.32, LV[L] + 1.7, z + 0.32, BAND[L], { collide: false, ao: false });
    }
    for (const pu of [9, 21]) for (let pv = 3; pv < 72; pv += 6) {
      b.box(U(pu) - 0.12, LV[L + 1] - T - 0.06, V(pv) - 1, U(pu) + 0.12, LV[L + 1] - T - 0.01, V(pv) + 1, 0xf4fbff, { collide: false, glow: true });
    }
  }
  // parapetti dei piani 1 e 2 (sul lato del parco si vede giù)
  for (let L = 1; L <= 2; L++) {
    const y = LV[L], h = 1.1, c = 0xb9bbbf;
    b.box(U(29.6), y, V(0.15), U(29.85), y + h, V(71.85), c, { skip: SKIP.BOTTOM });
    if (L === 2) {
      b.box(U(0.15), y, V(0.15), U(0.4), y + h, V(71.85), c, { skip: SKIP.BOTTOM });
      b.box(U(0.4), y, V(0.15), U(29.6), y + h, V(0.4), c, { skip: SKIP.BOTTOM });
      b.box(U(0.4), y, V(71.6), U(29.6), y + h, V(71.85), c, { skip: SKIP.BOTTOM });
    }
  }
  // lampioni sul tetto
  for (const [pu, pv] of [[9, 12], [21, 30], [9, 48], [21, 64]]) {
    b.box(U(pu) - 0.08, LV[2], V(pv) - 0.08, U(pu) + 0.08, LV[2] + 3.4, V(pv) + 0.08, 0x3b4250, { surface: 'metal' });
    b.box(U(pu) - 0.3, LV[2] + 3.4, V(pv) - 0.3, U(pu) + 0.3, LV[2] + 3.65, V(pv) + 0.3, 0xfff4c8, { collide: false, glow: true });
  }
  // posti auto: strisce bianche e auto nelle file lungo i due lati
  for (let L = 0; L <= 2; L++) {
    const y = LV[L];
    for (const [u0, u1] of [[0.6, 5.4], [24.6, 29.4]]) {
      for (let v = 1.7; v < 71; v += 2.6) {
        b.box(U(u0), y, V(v) - 0.05, U(u1), y + 0.025, V(v) + 0.05, 0xf2f2f2, { collide: false, ao: false });
        const vc = v + 1.3;
        if (vc > 70.5) continue;
        if (L === 0 && u0 > 20 && PARK_GATES.some((g) => Math.abs(V(vc) - g) < 3.6)) continue;
        if (rng.chance(L === 2 ? 0.35 : 0.5)) car(b, rng, U((u0 + u1) / 2), V(vc), y);
      }
    }
    // frecce gialle nella corsia centrale
    for (let v = 6; v < 70; v += 12) {
      if (v > 18 && v < 54) continue;
      b.box(U(14.7), y, V(v), U(15.3), y + 0.025, V(v + 2.5), 0xf2c14e, { collide: false, ao: false });
    }
    // casse e coni nelle corsie
    for (let k = 0; k < 3; k++) {
      const u = rng.pick([8, 10, 20, 22]), v = rng.range(4, 68);
      if (L > 0 && v > 18 && v < 54 && u > 11 && u < 19) continue;
      ctx.props.push({ kind: 'crate', x: U(u), y: y + 0.52, z: V(v), size: 1 });
    }
    for (let k = 0; k < 4; k++) {
      const x = U(rng.pick([7, 11, 19, 23])), z = V(rng.range(3, 69));
      b.geo(cone, x, y + 0.36, z, 0xff7a2f, { scale: sc.set(0.25, 0.7, 0.25) });
    }
  }
  ctx.props.push({ kind: 'ball', x: U(9), y: LV[2] + 0.6, z: V(36), r: 0.55 });
}


/* ============================== BACKROOMS ============================== */
function backrooms(b, rng, ctx, doors) {
  const X0 = BACK.x0, X1 = BACK.x1, NX = 10, NZ = 24, S = 3, H = 3.2;
  b.box(X0, -0.3, Z0, X1, 0, Z1, 0xa98e44, { skip: SKIP.BOTTOM, surface: 'soft' });
  b.box(X0 + 0.15, H, Z0 + 0.15, X1 - 0.15, H + 0.3, Z1 - 0.15, 0xe2dbb4);
  // labirinto: albero casuale (tutto raggiungibile) + aperture in più + qualche salone
  const parent = Array.from({ length: NX * NZ }, (_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const edges = [];
  for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
    if (i < NX - 1) edges.push([i, j, 'x']);
    if (j < NZ - 1) edges.push([i, j, 'z']);
  }
  rng.shuffle(edges);
  const open = new Set();
  for (const e of edges) {
    const a = e[1] * NX + e[0], c = e[2] === 'x' ? a + 1 : a + NX;
    if (find(a) !== find(c)) { parent[find(a)] = find(c); open.add(e.join()); }
    else if (rng.chance(0.18)) open.add(e.join());
  }
  for (let k = 0; k < 5; k++) {
    const w = 2 + rng.int(2), d = 2 + rng.int(2), i0 = rng.int(NX - w), j0 = rng.int(NZ - d);
    for (let j = j0; j < j0 + d; j++) for (let i = i0; i < i0 + w; i++) {
      if (i < i0 + w - 1) open.add([i, j, 'x'].join());
      if (j < j0 + d - 1) open.add([i, j, 'z'].join());
    }
  }
  const t = 0.1, base = 0x8a7430;
  for (const e of edges) {
    if (open.has(e.join())) continue;
    const [i, j, ax] = e;
    if (ax === 'x') {
      const x = X0 + (i + 1) * S, z0 = Z0 + j * S - t, z1 = Z0 + (j + 1) * S + t;
      b.box(x - t, 0, z0, x + t, H, z1, PAPER, { skip: SKIP.BOTTOM | SKIP.TOP });
      b.box(x - t - 0.02, 0, z0 - 0.02, x + t + 0.02, 0.14, z1 + 0.02, base, { collide: false, ao: false, skip: SKIP.BOTTOM });
    } else {
      const z = Z0 + (j + 1) * S, x0 = X0 + i * S - t, x1 = X0 + (i + 1) * S + t;
      b.box(x0, 0, z - t, x1, H, z + t, PAPER, { skip: SKIP.BOTTOM | SKIP.TOP });
      b.box(x0 - 0.02, 0, z - t - 0.02, x1 + 0.02, 0.14, z + t + 0.02, base, { collide: false, ao: false, skip: SKIP.BOTTOM });
    }
  }
  // neon (qualcuno spento), macchie sulla moquette, casse e sedie abbandonate
  const cells = [];
  for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
    const x = X0 + i * S + S / 2, z = Z0 + j * S + S / 2, on = !rng.chance(0.18);
    b.box(x - 0.65, H - 0.05, z - 0.22, x + 0.65, H, z + 0.22, on ? 0xfffbe8 : 0x9a9688, { collide: false, glow: on });
    cells.push([x, z]);
  }
  rng.shuffle(cells);
  for (let k = 0; k < 14; k++) {
    const [x, z] = cells[k], r = rng.range(0.5, 1.1);
    b.box(x - r, 0, z - r * 0.8, x + r, 0.015, z + r * 0.8, 0x8f7638, { collide: false, ao: false, skip: SKIP.BOTTOM });
  }
  for (let k = 14; k < 24; k++) {
    const [x, z] = cells[k];
    if (k % 3 === 0) {
      b.box(x - 0.25, 0.42, z - 0.25, x + 0.25, 0.48, z + 0.25, 0x6b6f78);
      b.box(x - 0.25, 0.48, z + 0.2, x + 0.25, 1.0, z + 0.25, 0x6b6f78);
      b.box(x - 0.2, 0, z - 0.2, x + 0.2, 0.42, z + 0.2, 0, { visible: false });
    } else if (k % 5 === 0) ball(ctx, x + 0.4, 0, z, 0.4);
    else crate(ctx, x + 0.4, 0, z - 0.3);
  }
  // porte verso il parco: una per gruppo di righe, la riga cambia col seed
  for (const g of [[2, 6], [10, 13], [17, 21]]) doors.push(Z0 + (g[0] + rng.int(g[1] - g[0] + 1)) * S + S / 2);
  // passaggio segreto: in un corridoio lungo il muro est (la riga cambia col seed), lontano dagli angoli
  ctx.secretZ = Z0 + (3 + rng.int(NZ - 6)) * S + S / 2;
}

/** Costruisce tutta la mappa. ctx = { props, wreck, spawn }. */
export function buildZones(b, rng, ctx) {
  parking(b, rng, ctx);
  lunaPark(b, rng, ctx, PARK.x0, PARK.x1);
  const doors = [];
  backrooms(b, rng, ctx, doors);

  // muri tra le zone: parcheggio | parco (fino alla soletta del piano 1, con 3 varchi)
  wallLine(b, 'x', -15, Z0, Z1, 3.2, PARK_GATES.map((z) => [z, 3.6, 3.2]), CONC, 0xa7a9ac);
  for (const z of PARK_GATES) {
    // cartello sopra ogni varco: "P" blu
    b.box(-14.85, 2.4, z - 0.6, -14.8, 3.1, z + 0.6, 0x2f6fd0, { collide: false, glow: true });
  }
  // luna park | backrooms: facciata alta 6 m con le porte
  const XB = BACK.x0;
  wallLine(b, 'x', XB, Z0, Z1, 6, doors.map((z) => [z, 2.4, 2.7]), FACADE, PAPER);
  for (const z of doors) b.box(XB - 0.2, 2.7, z - 1.35, XB - 0.15, 2.95, z + 1.35, 0x5b4a2a, { collide: false });

  // muri di confine (alti, non si scavalcano): colore interno di ogni zona, fuori grigio scuro
  const OUT = 0x6d6a66, inside = { parcheggio: CONC, parco: BRICK, backrooms: PAPER };
  for (const zn of ZONES) {
    wallLine(b, 'z', Z0, zn.x0, zn.x1, OUTER_H, [], OUT, inside[zn.id]);
    wallLine(b, 'z', Z1, zn.x0, zn.x1, OUTER_H, [], inside[zn.id], OUT);
  }
  wallLine(b, 'x', -45, Z0, Z1, OUTER_H, [], OUT, CONC);
  // muro est delle backrooms: c'è il buco del passaggio segreto (coperto dal pannello finto)
  const SD = [1.8, 2.6];
  // il pannello finto è alto quanto il muro: così l'ombreggiatura è identica e cambia solo (di pochissimo) il colore
  const XE = BACK.x1;
  wallLine(b, 'x', XE, Z0, Z1, OUTER_H, [[ctx.secretZ, SD[0], OUTER_H]], PAPER, OUT);
  buildSecretPassage(b, XE, ctx.secretZ, '+x', { width: SD[0], height: OUTER_H, thick: 0.15, color: PAPER, backColor: 0xcfe8de });
  buildSafeRoom(b, ctx, XE, ctx.secretZ, '+x', { width: 10, depth: 10, height: 3.2, wallThick: 0.15, door: SD });
  // pilastri agli angoli e agli incroci dei muri
  for (const x of [-45, PARK.x0, BACK.x0, XE]) for (const z of [Z0, Z1]) {
    b.box(x - 0.25, 0, z - 0.25, x + 0.25, OUTER_H + 0.1, z + 0.25, 0x8a857c, { skip: SKIP.BOTTOM });
  }
  // pavimento di sicurezza sotto tutto (invisibile)
  b.box(-50, -3, Z0 - 5, XE + 15, -2.5, Z1 + 5, 0, { visible: false, nav: false });
}
