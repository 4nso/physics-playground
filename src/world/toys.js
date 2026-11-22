// Giochi del luna park (prima "parco giochi"): ognuno occupa una piazzola di 8×10 m centrata in (x, z).
// Usati da world/lunapark.js. Le casse e le palle sono oggetti fisici (ctx.props).
import * as THREE from 'three';
import { SKIP } from './builder.js';

export const WOOD = 0xc98a4a, RED = 0xe0503c, METAL = 0x3b4250, YEL = 0xffd166, BLUE = 0x3e9be0;
export const BRIGHT = [0xff5a4e, 0xffb627, 0x2fbf71, 0x3d8bff, 0xb45cff, 0xff6fb5];
export const cone = new THREE.ConeGeometry(1, 1, 7);
export const ico = new THREE.IcosahedronGeometry(1, 0);
export const cyl = new THREE.CylinderGeometry(1, 1, 1, 10);
const sc = new THREE.Vector3();

export function tree(b, rng, x, z) {
  b.box(x - 0.18, 0, z - 0.18, x + 0.18, 2.2, z + 0.18, 0x7a5232, { surface: 'wood', skip: SKIP.BOTTOM });
  const s = rng.range(1.3, 1.9);
  if (rng.chance(0.5)) b.geo(ico, x, 2.2 + s * 0.8, z, rng.pick([0x4f9a3c, 0x5fae45, 0x3f8a3a]), { scale: sc.set(s, s * 1.1, s), rotY: rng.next() * 6 });
  else b.geo(cone, x, 2.2 + s, z, rng.pick([0x3f8a3a, 0x2f7a4a]), { scale: sc.set(s, s * 2.6, s), rotY: rng.next() * 6 });
}
export function bench(b, x, z, alongX = true) {
  const [hx, hz] = alongX ? [0.8, 0.25] : [0.25, 0.8];
  b.box(x - hx, 0.4, z - hz, x + hx, 0.5, z + hz, WOOD, { surface: 'wood' });
  b.box(x - hx + 0.1, 0, z - hz + 0.05, x - hx + 0.2, 0.4, z + hz - 0.05, METAL, { collide: false, skip: SKIP.BOTTOM });
  b.box(x + hx - 0.2, 0, z - hz + 0.05, x + hx - 0.1, 0.4, z + hz - 0.05, METAL, { collide: false, skip: SKIP.BOTTOM });
}
export const crate = (ctx, x, y, z, size = 1) => ctx.props.push({ kind: 'crate', x, y: y + size / 2 + 0.02, z, size });
export const ball = (ctx, x, y, z, r = 0.5) => ctx.props.push({ kind: 'ball', x, y: y + r + 0.05, z, r });

/* Giochi: ognuno occupa una piazzola di 8×10 m centrata in (x, z). */
export const TOYS = {
  torre(b, rng, ctx, x, z) {
    const P = 2.2;
    b.box(x - 1, P - 0.15, z - 1, x + 1, P, z + 1, WOOD, { surface: 'wood' });
    for (const [dx, dz] of [[-1, -1], [0.85, -1], [-1, 0.85], [0.85, 0.85]]) b.box(x + dx, 0, z + dz, x + dx + 0.15, P + 1.2, z + dz + 0.15, RED, { surface: 'metal', skip: SKIP.BOTTOM });
    b.box(x - 1, P, z - 1, x + 1, P + 0.9, z - 0.9, RED, { surface: 'metal' });
    b.box(x - 1, P, z - 0.9, x - 0.9, P + 0.9, z + 1, RED, { surface: 'metal' });
    b.box(x - 1.05, P + 1.2, z - 1.05, x + 1.05, P + 1.25, z + 1.05, YEL, { collide: false });
    b.geo(cone, x, P + 1.85, z, YEL, { scale: sc.set(1.5, 1.2, 1.5), rotY: Math.PI / 4 });
    b.ramp(x - 0.7, z + 1, x + 0.7, z + 4.8, 'z', P, 0, WOOD, { steps: true });
    b.ramp(x + 1, z - 0.45, x + 4.3, z + 0.45, 'x', P - 0.15, 0.2, BLUE, { thick: 0.15 });
    ball(ctx, x + 3, 0, z - 2.5, 0.45);
  },
  altalene(b, rng, ctx, x, z) {
    for (const dx of [-2.6, 2.6]) b.box(x + dx - 0.1, 0, z - 0.1, x + dx + 0.1, 2.7, z + 0.1, METAL, { surface: 'metal', skip: SKIP.BOTTOM });
    b.box(x - 2.7, 2.62, z - 0.12, x + 2.7, 2.78, z + 0.12, METAL, { collide: false });
    for (const dx of [-1.3, 0, 1.3]) {
      for (const dz of [-0.2, 0.2]) b.box(x + dx - 0.02, 0.55, z + dz - 0.02, x + dx + 0.02, 2.62, z + dz + 0.02, 0x222222, { collide: false });
      b.box(x + dx - 0.35, 0.5, z - 0.25, x + dx + 0.35, 0.55, z + 0.25, rng.pick(BRIGHT), { collide: false });
    }
    crate(ctx, x - 2, 0, z + 3); ball(ctx, x + 2, 0, z - 3, 0.4);
  },
  sabbiera(b, rng, ctx, x, z) {
    const r = 3;
    b.box(x - r, 0, z - r, x + r, 0.25, z - r + 0.2, WOOD, { skip: SKIP.BOTTOM }); b.box(x - r, 0, z + r - 0.2, x + r, 0.25, z + r, WOOD, { skip: SKIP.BOTTOM });
    b.box(x - r, 0, z - r + 0.2, x - r + 0.2, 0.25, z + r - 0.2, WOOD, { skip: SKIP.BOTTOM }); b.box(x + r - 0.2, 0, z - r + 0.2, x + r, 0.25, z + r - 0.2, WOOD, { skip: SKIP.BOTTOM });
    b.box(x - r + 0.2, 0, z - r + 0.2, x + r - 0.2, 0.07, z + r - 0.2, 0xf0d68a, { collide: false, skip: SKIP.BOTTOM });
    crate(ctx, x - 1, 0.07, z - 1); crate(ctx, x + 1.2, 0.07, z + 0.6, 0.7);
    ball(ctx, x + 1, 0.07, z - 1.5, 0.35); ball(ctx, x - 1.5, 0.07, z + 1.5, 0.35);
    b.geo(cone, x, 0.45, z, 0xff7a2f, { scale: sc.set(0.4, 0.8, 0.4) }); // secchiello
  },
  piscinaPalline(b, rng, ctx, x, z) {
    const r = 3, h = 0.7, c = rng.pick([0x3d8bff, 0xff6fb5, 0x2fbf71]);
    b.box(x - r, 0, z - r, x + r, h, z - r + 0.25, c, { skip: SKIP.BOTTOM }); b.box(x - r, 0, z + r - 0.25, x + r, h, z + r, c, { skip: SKIP.BOTTOM });
    b.box(x - r, 0, z - r + 0.25, x - r + 0.25, h, z + r - 0.25, c, { skip: SKIP.BOTTOM });
    b.box(x + r - 0.25, 0, z - r + 0.25, x + r, h, z - 0.8, c, { skip: SKIP.BOTTOM }); b.box(x + r - 0.25, 0, z + 0.8, x + r, h, z + r - 0.25, c, { skip: SKIP.BOTTOM });
    b.box(x - r + 0.25, 0, z - r + 0.25, x + r - 0.25, 0.03, z + r - 0.25, 0xffffff, { collide: false, skip: SKIP.BOTTOM });
    for (let k = 0; k < 14; k++) ball(ctx, x + rng.range(-2.3, 2.3), 0.03 + (k % 3) * 0.6, z + rng.range(-2.3, 2.3), rng.range(0.25, 0.33));
  },
  fortino(b, rng, ctx, x, z) {
    for (let i = 0; i < 4; i++) for (let k = 0; k < 2; k++) crate(ctx, x - 1.55 + i * 1.03, k * 1.02, z - 2);
    for (const sx of [-2.1, 2.1]) for (let i = 0; i < 2; i++) for (let k = 0; k < 2; k++) crate(ctx, x + sx, k * 1.02, z - 0.9 + i * 1.03);
    ball(ctx, x, 0, z + 2, 0.5);
  },
  arrampicata(b, rng, ctx, x, z) {
    const c1 = rng.pick(BRIGHT), c2 = rng.pick(BRIGHT);
    b.box(x - 2, 1.05, z - 1.5, x, 1.2, z + 1.5, c1, { surface: 'metal' });
    b.box(x, 2.25, z - 1.5, x + 2, 2.4, z, c2, { surface: 'metal' });
    for (const [px, pz, h] of [[-2, -1.5, 1.2], [-2, 1.5, 1.2], [0, 1.5, 1.2], [0, -1.5, 2.4], [2, -1.5, 2.4], [2, 0, 2.4], [0, 0, 2.4]]) {
      b.box(x + px - 0.07, 0, z + pz - 0.07, x + px + 0.07, h + 0.7, z + pz + 0.07, METAL, { surface: 'metal', skip: SKIP.BOTTOM });
    }
    b.ramp(x - 4.5, z - 0.6, x - 2, z + 0.6, 'x', 0, 1.2, WOOD, { steps: true });
    ball(ctx, x + 2.5, 0, z + 3, 0.5);
  },
  trampolini(b, rng, ctx, x, z) {
    b.ramp(x - 3.5, z - 2.5, x - 1.5, z + 1.5, 'z', 0.05, 1.1, WOOD, { thick: 0.2 });
    b.box(x - 3.5, 0, z + 1.3, x - 1.5, 0.95, z + 1.5, 0x8a5a2e, { skip: SKIP.BOTTOM });
    b.ramp(x + 1.5, z - 1.5, x + 3.5, z + 2.5, 'z', 1.1, 0.05, WOOD, { thick: 0.2 });
    b.box(x + 1.5, 0, z - 1.5, x + 3.5, 0.95, z - 1.3, 0x8a5a2e, { skip: SKIP.BOTTOM });
    ball(ctx, x, 0, z - 3, 0.5); ball(ctx, x, 0, z + 3, 0.5); crate(ctx, x, 0, z);
  },
  giostra(b, rng, ctx, x, z) {
    b.geo(cyl, x - 1.5, 0.25, z - 1, rng.pick(BRIGHT), { scale: sc.set(1.8, 0.3, 1.8) });
    b.box(x - 2.8, 0, z - 2.3, x - 0.2, 0.4, z + 0.3, 0, { visible: false });
    b.box(x - 1.58, 0.4, z - 1.08, x - 1.42, 1.6, z - 0.92, METAL, { collide: false });
    b.geo(cone, x - 1.5, 1.9, z - 1, RED, { scale: sc.set(0.9, 0.6, 0.9) });
    // altalena a dondolo (una rampa sottile: ci si può salire!)
    b.box(x + 2.2, 0, z + 1.8, x + 2.6, 0.45, z + 2.2, METAL, { skip: SKIP.BOTTOM });
    b.ramp(x + 0.4, z + 1.8, x + 4.4, z + 2.2, 'x', 0.15, 0.85, rng.pick(BRIGHT), { thick: 0.12 });
    ball(ctx, x + 2.5, 0, z - 2.5, 0.45);
  },
  boschetto(b, rng, ctx, x, z) {
    const spots = [[-2.5, -3], [2.5, -2.5], [-2, 3], [2.8, 3.2], [0, 0.5]];
    rng.shuffle(spots);
    for (let i = 0; i < 3; i++) tree(b, rng, x + spots[i][0], z + spots[i][1]);
    bench(b, x + spots[3][0], z + spots[3][1]);
    crate(ctx, x + spots[4][0], 0, z + spots[4][1]);
  },
  picnic(b, rng, ctx, x, z) {
    for (const dz of [-2.2, 2.2]) {
      b.box(x - 1.2, 0.72, z + dz - 0.45, x + 1.2, 0.8, z + dz + 0.45, WOOD, { surface: 'wood' });
      b.box(x - 0.08, 0, z + dz - 0.08, x + 0.08, 0.72, z + dz + 0.08, METAL, { collide: false, skip: SKIP.BOTTOM });
      bench(b, x, z + dz - 0.9); bench(b, x, z + dz + 0.9);
    }
    ball(ctx, x + 2.5, 0, z, 0.35); crate(ctx, x - 2.8, 0, z, 0.8);
  },
  pallone(b, rng, ctx, x, z) {
    // palle giganti da spingere e lanciare addosso ai nemici
    ball(ctx, x - 2, 0, z - 2, 1.1); ball(ctx, x + 2, 0, z + 1, 0.9); ball(ctx, x, 0, z + 3.5, 0.75);
  },
  fontana(b, rng, ctx, x, z) {
    // vasca quadrata con l'acqua animata (world/worldMaterial.js, waterMat) e colonna con la coppa al centro
    const r = 2.8, h = 0.45, t = 0.3, STONE = 0xd9d2c2;
    b.box(x - r, 0, z - r, x + r, h, z - r + t, STONE, { skip: SKIP.BOTTOM }); b.box(x - r, 0, z + r - t, x + r, h, z + r, STONE, { skip: SKIP.BOTTOM });
    b.box(x - r, 0, z - r + t, x - r + t, h, z + r - t, STONE, { skip: SKIP.BOTTOM }); b.box(x + r - t, 0, z - r + t, x + r, h, z + r - t, STONE, { skip: SKIP.BOTTOM });
    b.box(x - r + t, 0, z - r + t, x + r - t, 0.04, z + r - t, 0x2f7fb8, { collide: false, skip: SKIP.BOTTOM, ao: false }); // fondo
    b.box(x - 0.25, 0, z - 0.25, x + 0.25, 1.3, z + 0.25, STONE, { skip: SKIP.BOTTOM });
    b.geo(cyl, x, 1.38, z, STONE, { scale: sc.set(0.9, 0.16, 0.9) });
    b.waterQuad(x - r + t, z - r + t, x + r - t, z + r - t, 0.34);
    b.waterQuad(x - 0.78, z - 0.78, x + 0.78, z + 0.78, 1.47); // acqua nella coppa
    bench(b, x, z + r + 1.2); bench(b, x, z - r - 1.2);
    ctx.fountain = { x, z };
  },
  piramide(b, rng, ctx, x, z) {
    b.box(x - 2, 0, z - 2, x + 2, 1, z + 2, 0xcfc5b4, { skip: SKIP.BOTTOM });
    for (let i = 0; i < 3; i++) crate(ctx, x - 1.02 + i * 1.02, 1, z);
    crate(ctx, x - 0.51, 2.02, z); crate(ctx, x + 0.51, 2.02, z);
    crate(ctx, x, 3.04, z);
  },
};
