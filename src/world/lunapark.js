// LUNA PARK: la zona centrale della mappa (prima "parco giochi").
//
// Pianta (il nord è -z, come nella minimappa; XC = asse del viale):
//
//   z -36 ┌──────────────────────────────────────────────┐
//         │  RUOTA PANORAMICA       │ MONTAGNE RUSSE (staz.)│  (world/wheel.js, world/coaster.js)
//   z -12 ├──── vialetto ─────────────────────────────────┤
//         │ gioco │        NEGOZIO (edificio)       │gioco│
//         │       │   PIAZZA rotonda + palla demol.  │     │  ← partenza
//         │ gioco │                                  │gioco│
//   z  12 ├───────┴──────┬─── VIALE ───┬──────────────────┤
//         │ gioco │ ristoro + bancarelle │ ristoro │gioco │
//   z  24 ├──────────────┤  ARCO        ├──────────────────┤
//         │ gioco │ gioco│  d'ingresso  │ gioco   │gioco │
//   z  36 └──────────────────────────────────────────────┘
//
// I giochi di prima (torri, altalene, piscina di palline...) stanno nelle piazzole ai lati (world/toys.js).
// Regola contro lo sfarfallio: pavimentazioni a quote tutte diverse dove si sovrappongono
// (vialetti 2-3 cm, bordo della piazza 3,5 cm, aree giostre 4 cm, viale 4,5 cm, piazza 5 cm...).
import * as THREE from 'three';
import { SKIP } from './builder.js';
import { buildShop } from './shop.js';
import { buildWheel } from './wheel.js';
import { buildCoaster } from './coaster.js';
import { Z0, Z1 } from './zones.js';
import { TOYS, BRIGHT, METAL, YEL, RED, WOOD, cone, ico, tree, bench } from './toys.js';

const sc = new THREE.Vector3();
const disc = new THREE.CylinderGeometry(1, 1, 1, 28);
const GRASS = 0x79b04a, PATH = 0xcdb68a, VIALE = 0xe2b98a, NAVY = 0x2c3e66, PINK = 0xff6fb5, WHITE = 0xfaf7f0;
const LAMP = 0xfff4c8;

// direzione "avanti" e "destra" per gli elementi orientabili (bancarelle)
const AXES = {
  '+z': { f: [0, 1], r: [1, 0] },
  '-z': { f: [0, -1], r: [-1, 0] },
  '+x': { f: [1, 0], r: [0, -1] },
  '-x': { f: [-1, 0], r: [0, 1] },
};
/** Scatola in coordinate locali (u = a destra, v = in avanti) rispetto al punto (x, z). */
function localBox(b, x, z, facing) {
  const { f, r } = AXES[facing];
  return (u0, y0, v0, u1, y1, v1, color, o) => {
    const ax = x + r[0] * u0 + f[0] * v0, az = z + r[1] * u0 + f[1] * v0;
    const bx = x + r[0] * u1 + f[0] * v1, bz = z + r[1] * u1 + f[1] * v1;
    b.box(Math.min(ax, bx), y0, Math.min(az, bz), Math.max(ax, bx), y1, Math.max(az, bz), color, o);
  };
}

/** Lampione: palo, braccio e globo luminoso. */
function lamp(b, x, z, h = 4.4) {
  b.box(x - 0.09, 0, z - 0.09, x + 0.09, h, z + 0.09, METAL, { surface: 'metal', skip: SKIP.BOTTOM });
  b.box(x - 0.16, 0, z - 0.16, x + 0.16, 0.35, z + 0.16, METAL, { collide: false, skip: SKIP.BOTTOM });
  b.box(x - 0.35, h - 0.05, z - 0.04, x + 0.35, h + 0.03, z + 0.04, METAL, { collide: false });
  b.geo(ico, x, h + 0.28, z, LAMP, { glow: true, scale: sc.set(0.3, 0.3, 0.3) });
}

/** Festone di lampadine colorate tra due punti (curva un po' verso il basso). */
function garland(b, x0, z0, x1, z1, y, sag = 0.45, step = 0.6, shift = 0) {
  const n = Math.max(2, Math.round(Math.hypot(x1 - x0, z1 - z0) / step));
  for (let i = 1; i < n; i++) {
    const t = i / n, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t, yy = y - sag * 4 * t * (1 - t);
    b.box(x - 0.07, yy - 0.07, z - 0.07, x + 0.07, yy + 0.07, z + 0.07, BRIGHT[(i + shift) % BRIGHT.length], { collide: false, glow: true });
  }
}

/** Fila di lampadine lungo un segmento (bordi dell'arco e della facciata). */
function bulbRow(b, x0, y0, z0, x1, y1, z1, n, color) {
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t, z = z0 + (z1 - z0) * t;
    b.box(x - 0.08, y - 0.08, z - 0.08, x + 0.08, y + 0.08, z + 0.08, color ?? (i % 2 ? 0xfff1a8 : 0xff7a59), { collide: false, glow: true });
  }
}

/** Testo da appendere (lo disegna world/signs.js). */
function sign(ctx, s) { (ctx.signs || (ctx.signs = [])).push(s); }
const ROT = { '+z': 0, '-z': Math.PI, '+x': Math.PI / 2, '-x': -Math.PI / 2 };

/**
 * Bancarella con tenda a strisce e insegna. (x, z) = centro del bordo anteriore del banco,
 * facing = verso il viale. Occupa 2,6 m di larghezza e 2 m di profondità.
 */
function stall(b, ctx, x, z, facing, color, text) {
  const box = localBox(b, x, z, facing);
  const { f } = AXES[facing];
  box(-1.3, 0, -0.5, 1.3, 1.0, 0, color, { skip: SKIP.BOTTOM, surface: 'wood' });           // banco
  box(-1.35, 1.0, -0.55, 1.35, 1.08, 0.05, 0xe8d7b0, { surface: 'wood' });
  box(-1.3, 0, -2.0, 1.3, 2.6, -1.8, WHITE, { skip: SKIP.BOTTOM, surface: 'wood' });         // fondo
  box(-1.3, 0, -1.8, -1.15, 2.6, -0.5, WHITE, { skip: SKIP.BOTTOM, surface: 'wood' });       // lati
  box(1.15, 0, -1.8, 1.3, 2.6, -0.5, WHITE, { skip: SKIP.BOTTOM, surface: 'wood' });
  box(-1.4, 2.6, -2.1, 1.4, 2.75, 0, color, { surface: 'wood' });                            // tetto
  for (let i = 0; i < 6; i++) {
    const u0 = -1.4 + i * (2.8 / 6);
    box(u0, 2.35, 0.0, u0 + 2.8 / 6, 2.5, 0.75, i % 2 ? WHITE : color, { collide: false }); // tenda
  }
  box(-1.2, 2.75, -0.32, 1.2, 3.45, -0.2, 0xfff1c2, { collide: false, glow: 0.2, skip: SKIP.BOTTOM }); // insegna
  for (let k = 0; k < 4; k++) box(-1.0 + k * 0.55, 1.08, -0.45, -0.7 + k * 0.55, 1.35, -0.2, BRIGHT[(k * 2 + text.length) % BRIGHT.length], { collide: false });
  sign(ctx, {
    text, x: x - f[0] * 0.185, y: 3.1, z: z - f[1] * 0.185, w: 2.3, h: 0.62, rotY: ROT[facing],
    bg: '#fff1c2', fg: '#' + color.toString(16).padStart(6, '0'),
  });
  // per chi la usa (bancarella delle munizioni): centro dell'apertura, direzione e punto davanti al banco
  return { x, z, fx: f[0], fz: f[1], ux: x + f[0] * 1.05, uz: z + f[1] * 1.05 };
}

/** Tavolino con due panche (zona ristoro). */
function table(b, x, z) {
  b.box(x - 0.9, 0.72, z - 0.45, x + 0.9, 0.8, z + 0.45, WOOD, { surface: 'wood' });
  b.box(x - 0.08, 0, z - 0.08, x + 0.08, 0.72, z + 0.08, METAL, { collide: false, skip: SKIP.BOTTOM });
  bench(b, x, z - 0.9); bench(b, x, z + 0.9);
}

/** Pavimentazione di un'area giostra con il cordolo colorato. */
function ridePave(b, x0, z0, x1, z1) {
  b.box(x0, 0, z0, x1, 0.04, z1, 0xcdbb9c, { collide: false, skip: SKIP.BOTTOM });
  // cordolo colorato: le strisce lungo x vanno tra quelle lungo z (nessuna sovrapposizione)
  b.box(x0, 0, z0, x0 + 0.3, 0.06, z1, RED, { collide: false, skip: SKIP.BOTTOM });
  b.box(x1 - 0.3, 0, z0, x1, 0.06, z1, RED, { collide: false, skip: SKIP.BOTTOM });
  b.box(x0 + 0.3, 0, z0, x1 - 0.3, 0.06, z0 + 0.3, RED, { collide: false, skip: SKIP.BOTTOM });
  b.box(x0 + 0.3, 0, z1 - 0.3, x1 - 0.3, 0.06, z1, RED, { collide: false, skip: SKIP.BOTTOM });
}

/** Arco d'ingresso con due torrette (biglietterie), insegna e lampadine. Il viale ci passa sotto. */
function entranceArch(b, ctx, xc, z) {
  const T0 = 4, T1 = 5.6, H = 7;
  for (const s of [-1, 1]) {
    const xa = xc + s * T0, xb = xc + s * T1;
    b.box(xa, 0, z - 0.8, xb, H, z + 0.8, RED, { skip: SKIP.BOTTOM, surface: 'wood' });
    for (const y of [2.6, 5.2]) b.box(xa - 0.05 * s, y, z - 0.85, xb + 0.05 * s, y + 0.35, z + 0.85, YEL, { collide: false });
    // finestrelle della biglietteria (davanti e dietro)
    for (const d of [-1, 1]) b.box(Math.min(xa, xb) + 0.3, 1.1, z + d * 0.8, Math.max(xa, xb) - 0.3, 2.0, z + d * 0.83, LAMP, { collide: false, glow: 0.4 });
    const cx = (xa + xb) / 2;
    b.geo(cone, cx, H + 0.6, z, YEL, { scale: sc.set(1.15, 1.2, 1.15), rotY: Math.PI / 7 });
    b.box(cx - 0.04, H + 1.2, z - 0.04, cx + 0.04, H + 2.6, z + 0.04, METAL, { collide: false });
    b.box(cx + 0.04, H + 2.0, z - 0.03, cx + 0.9, H + 2.55, z + 0.03, s < 0 ? PINK : 0x2fbf71, { collide: false });
    bulbRow(b, xc + s * (T0 - 0.1), 0.6, z - 0.9, xc + s * (T0 - 0.1), 6.0, z - 0.9, 10);
    bulbRow(b, xc + s * (T0 - 0.1), 0.6, z + 0.9, xc + s * (T0 - 0.1), 6.0, z + 0.9, 10);
  }
  b.box(xc - T0, 6.2, z - 0.5, xc + T0, 7.0, z + 0.5, NAVY, { collide: false });
  b.box(xc - 4.3, 7.0, z - 0.1, xc + 4.3, 9.1, z + 0.1, 0xffcf3a, { collide: false, glow: 0.2, skip: SKIP.BOTTOM });
  bulbRow(b, xc - 4.3, 9.2, z, xc + 4.3, 9.2, z, 18);
  for (const d of [-1, 1]) {
    bulbRow(b, xc - T0 + 0.1, 6.12, z + d * 0.55, xc + T0 - 0.1, 6.12, z + d * 0.55, 14);
    sign(ctx, {
      text: 'LUNA PARK', sub: 'Shoot Your Friends', x: xc, y: 8.05, z: z + d * 0.115, w: 8.2, h: 1.9,
      rotY: d > 0 ? 0 : Math.PI, bg: '#ffcf3a', fg: '#c0392b', subColor: '#2c3e66', border: '#c0392b',
    });
  }
}

/** Il negozio dentro un edificio: torrette ai lati, facciata con frontone, lampadine. */
function shopBuilding(b, ctx, xc, zf) {
  buildShop(b, ctx, xc, zf, '+z');
  const zb = zf - 4.7, H = 6;
  for (const s of [-1, 1]) {
    const xa = xc + s * 3.5, xb = xc + s * 4.3;
    b.box(Math.min(xa, xb), 0, zb, Math.max(xa, xb), H, zf + 0.3, PINK, { skip: SKIP.BOTTOM, surface: 'wood' });
    b.box(Math.min(xa, xb) - 0.05, 0, zf + 0.25, Math.max(xa, xb) + 0.05, 0.5, zf + 0.35, NAVY, { collide: false, skip: SKIP.BOTTOM });
    b.geo(cone, (xa + xb) / 2, H + 0.7, zf - 2.2, NAVY, { scale: sc.set(0.75, 1.4, 0.75) });
    bulbRow(b, xc + s * 3.45, 0.7, zf + 0.42, xc + s * 3.45, H - 0.2, zf + 0.42, 9);
  }
  // facciata sopra il tetto del chiosco (dietro l'insegna "NEGOZIO"), con il frontone a gradini
  const v0 = zf - 0.85, v1 = zf - 0.55;
  b.box(xc - 3.5, 3.4, v0, xc + 3.5, H, v1, PINK, { skip: SKIP.BOTTOM, surface: 'wood' });
  b.box(xc - 2.5, H, v0, xc + 2.5, H + 0.6, v1, PINK, { surface: 'wood' });
  b.box(xc - 1.3, H + 0.6, v0, xc + 1.3, H + 1.1, v1, PINK, { surface: 'wood' });
  b.geo(ico, xc, H + 1.45, (v0 + v1) / 2, YEL, { glow: true, scale: sc.set(0.4, 0.4, 0.4) });
  bulbRow(b, xc - 3.4, H + 0.08, v1 + 0.05, xc + 3.4, H + 0.08, v1 + 0.05, 14);
  sign(ctx, { text: 'ARMI & MUNIZIONI', x: xc, y: 5.15, z: v1 + 0.02, w: 6.2, h: 0.95, bg: '#2c3e66', fg: '#ffcf3a' });
}

/**
 * Costruisce il luna park tra x0 e x1 (tutta la profondità della mappa).
 * Mette in ctx: spawn, wreck (palla demolitrice), shops, props (casse e palle), signs (scritte).
 */
export function lunaPark(b, rng, ctx, x0, x1) {
  const XC = x0 + 25;                 // asse del viale e centro della piazza
  const WEST = x0 + 5.5, EAST = x1 - 4.5; // colonne delle piazzole dei giochi
  b.box(x0, -0.3, Z0, x1, 0, Z1, GRASS, { skip: SKIP.BOTTOM, surface: 'dirt' });

  // vialetti trasversali (3 cm) e quello verso nord tra le due giostre (2 cm)
  for (const z of [-12, 12, 24]) b.box(x0, 0, z - 1, x1, 0.03, z + 1, PATH, { collide: false, skip: SKIP.BOTTOM });
  b.box(x0, 0, -1, XC - 9.8, 0.03, 1, PATH, { collide: false, skip: SKIP.BOTTOM });
  b.box(XC + 9.8, 0, -1, x1, 0.03, 1, PATH, { collide: false, skip: SKIP.BOTTOM });
  b.box(XC - 1, 0, Z0, XC + 1, 0.02, -11, PATH, { collide: false, skip: SKIP.BOTTOM });
  // viale principale (4,5 cm) dall'ingresso alla piazza
  b.box(XC - 3, 0, 10.3, XC + 3, 0.045, Z1, VIALE, { collide: false, skip: SKIP.BOTTOM });
  for (const s of [-1, 1]) b.box(XC + s * 3 - 0.15, 0, 10.3, XC + s * 3 + 0.15, 0.055, Z1, RED, { collide: false, skip: SKIP.BOTTOM });

  // piazza rotonda (5 cm) con il bordo rosso (3,5 cm) e il cerchio giallo (6 cm) sotto la palla demolitrice
  b.geo(disc, XC, 0.02, 0, RED, { scale: sc.set(10.4, 0.03, 10.4) });
  b.geo(disc, XC, 0.03, 0, 0xe8d3a8, { scale: sc.set(9.9, 0.04, 9.9) });
  b.geo(disc, XC, 0.04, 0.5, YEL, { scale: sc.set(3, 0.04, 3) });

  // negozio in un edificio sul lato nord della piazza
  shopBuilding(b, ctx, XC, -6.5);

  // portale della palla demolitrice al centro della piazza, partenza poco più a sud
  b.box(XC - 3.75, 0, 0.35, XC - 3.45, 7.3, 0.65, METAL, { surface: 'metal', skip: SKIP.BOTTOM });
  b.box(XC + 3.45, 0, 0.35, XC + 3.75, 7.3, 0.65, METAL, { surface: 'metal', skip: SKIP.BOTTOM });
  b.box(XC - 3.8, 7.15, 0.3, XC + 3.8, 7.45, 0.7, METAL, { collide: false });
  bulbRow(b, XC - 3.6, 7.55, 0.5, XC + 3.6, 7.55, 0.5, 12);
  ctx.wreck = { ax: XC, ay: 7.15, az: 0.5 };
  ctx.spawn = { x: XC, y: 0, z: 7.5, yaw: 0 };

  // lampioni intorno alla piazza, uniti da festoni di lampadine
  const ring = [-30, 15, 55, 125, 165, 210].map((a) => {
    const t = (a * Math.PI) / 180;
    return [XC + Math.cos(t) * 11, Math.sin(t) * 11];
  });
  for (const [x, z] of ring) lamp(b, x, z);
  for (let i = 0; i < ring.length - 1; i++) garland(b, ring[i][0], ring[i][1], ring[i + 1][0], ring[i + 1][1], 4.5, 0.5, 0.6, i);
  for (const s of [-1, 1]) bench(b, XC + s * 6.2, 5.6, false);

  // viale: lampioni ai lati e festoni che lo attraversano
  for (const z of [12, 16, 20, 24]) {
    lamp(b, XC - 3.6, z); lamp(b, XC + 3.6, z);
    garland(b, XC - 3.6, z, XC + 3.6, z, 4.5, 0.45, 0.55, z);
  }
  entranceArch(b, ctx, XC, 27);

  // zone ristoro ai lati del viale: bancarelle, tavolini, alberi
  // bancarella delle MUNIZIONI (fase 12): chiusa fino al round 10, poi riempie tutte le armi (game/shop.js)
  ctx.ammoStalls = [stall(b, ctx, XC - 4.4, 14, '+x', 0x5f7a2c, 'MUNIZIONI')];
  stall(b, ctx, XC - 4.4, 22, '+x', 0xff6fb5, 'ZUCCHERO FILATO');
  stall(b, ctx, XC + 4.4, 14, '-x', 0x3d8bff, 'BIBITE');
  stall(b, ctx, XC + 4.4, 22, '-x', 0x2fbf71, 'GELATI');
  for (const s of [-1, 1]) {
    table(b, XC + s * 10, 15.2); table(b, XC + s * 10, 20.8);
    tree(b, rng, XC + s * 13, 18); tree(b, rng, XC + s * 7.6, 18);
  }

  // lampioni lungo il vialetto nord
  for (const x of [x0 + 4, x0 + 12, x0 + 20, XC + 5, XC + 13, XC + 21]) lamp(b, x, -13.3);

  // aree delle giostre: ruota panoramica a ovest (world/wheel.js), stazione delle montagne russe a est (in fondo)
  ridePave(b, x0 + 1.5, Z0 + 1.5, XC - 3.5, -15);
  buildWheel(b, ctx, XC - 13, -25);
  for (const [x, z] of [[x0 + 3, -17], [XC - 5, -17]]) lamp(b, x, z);
  ridePave(b, XC + 3.5, Z0 + 1.5, x1 - 1.5, -15);

  // piazzole con i giochi di sempre: colonne ai lati e due vicino all'ingresso
  const slots = [];
  for (const cz of [-6, 6, 18, 30]) slots.push([WEST, cz], [EAST, cz]);
  slots.push([XC - 10, 30], [XC + 10, 30]);
  // la fontana (con l'acqua animata) c'è sempre, gli altri giochi a caso
  const list = rng.shuffle(['fontana', ...rng.shuffle(Object.keys(TOYS).filter((k) => k !== 'fontana')).slice(0, slots.length - 1)]);
  while (list.length < slots.length) list.push(rng.pick(['torre', 'piscinaPalline', 'fortino', 'trampolini', 'pallone', 'boschetto']));
  slots.forEach(([cx, cz], i) => TOYS[list[i]](b, rng, ctx, cx, cz));

  // montagne russe (world/coaster.js): i sostegni non cadono su giochi, piazza, viale, negozio, bancarelle, ruota
  const noPost = [
    ...slots.map(([cx, cz]) => [cx - 4.3, cz - 5.3, cx + 4.3, cz + 5.3]),
    [XC - 10.8, -11.5, XC + 10.8, 10.8],          // piazza e negozio
    [XC - 3.8, 9, XC + 3.8, Z1],                  // viale
    [XC - 6.2, 25.6, XC + 6.2, 28.4],             // arco d'ingresso
    [XC - 15.5, 12.4, XC - 3.4, 23.6], [XC + 3.4, 12.4, XC + 15.5, 23.6], // zone ristoro
    [XC - 20.8, -29.8, XC - 5.2, -17.9],          // recinto della ruota
    [XC + 2, -31.5, x1, -21.5],                   // stazione e comandi delle montagne russe
  ];
  buildCoaster(b, ctx, rng, noPost);
}
