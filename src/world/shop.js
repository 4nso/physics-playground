// Negozio: chiosco con banco, scaffali, tenda a strisce e insegna luminosa.
// È un elemento riutilizzabile: buildShop(b, ctx, x, z, facing) lo mette in qualsiasi mappa.
// Il banco guarda verso `facing` ('+z', '-z', '+x', '-x'); il giocatore si mette davanti al banco.
// La logica (vicinanza, acquisti, pannello) è in game/shop.js e usa ctx.shops.
import { SKIP } from './builder.js';

const WALL = 0xf2efe6, TRIM = 0x2c3e66, COUNTER = 0xb5773e, TOP = 0xe8d7b0;
const RED = 0xe0503c, WHITE = 0xfaf7f0, SIGN = 0xffcf3a, SHELF = 0x8a5a2b;
const GOODS = [0x3b4250, 0x5d6b4a, 0x6b4a3a, 0x2b2e35, 0xb59a6a];

// direzione "avanti" (verso il giocatore) e "destra" del banco, per ogni orientamento
const AXES = {
  '+z': { f: [0, 1], r: [1, 0] },
  '-z': { f: [0, -1], r: [-1, 0] },
  '+x': { f: [1, 0], r: [0, -1] },
  '-x': { f: [-1, 0], r: [0, 1] },
};

/**
 * Disegna il negozio. (x, z) = centro del bordo anteriore del banco.
 * Aggiunge a ctx.shops { x, z, y, fx, fz }: punto davanti al banco dove si compra.
 */
export function buildShop(b, ctx, x, z, facing = '+z') {
  const { f, r } = AXES[facing] || AXES['+z'];
  // scatola in coordinate locali: u = a destra, v = in avanti (0 = davanti al banco)
  const box = (u0, y0, v0, u1, y1, v1, color, o) => {
    const ax = x + r[0] * u0 + f[0] * v0, az = z + r[1] * u0 + f[1] * v0;
    const bx = x + r[0] * u1 + f[0] * v1, bz = z + r[1] * u1 + f[1] * v1;
    b.box(Math.min(ax, bx), y0, Math.min(az, bz), Math.max(ax, bx), y1, Math.max(az, bz), color, o);
  };
  const H = 3.2;
  // pavimento a piastrelle, appena sopra il prato: solo dentro il chiosco (tra le pareti e dietro il banco),
  // così nessun bordo sporge fuori a terra
  for (let i = 0; i < 8; i++) {
    for (let j = 0; j < 4; j++) {
      const c = (i + j) % 2 ? 0x2c3e66 : 0xdfe6f2;
      box(-3.2 + i * 0.8, 0, -4.2 + j * 0.9, -2.4 + i * 0.8, 0.06, -3.3 + j * 0.9, c, { collide: false, skip: SKIP.BOTTOM });
    }
  }
  // pareti: fondo e lati
  box(-3.5, 0, -4.5, 3.5, H, -4.2, WALL, { skip: SKIP.BOTTOM, surface: 'wood' });
  box(-3.5, 0, -4.2, -3.2, H, -0.2, WALL, { skip: SKIP.BOTTOM, surface: 'wood' });
  box(3.2, 0, -4.2, 3.5, H, -0.2, WALL, { skip: SKIP.BOTTOM, surface: 'wood' });
  // fascia blu in basso sulle pareti (sporge un po': niente facce sovrapposte)
  box(-3.55, 0.06, -0.25, -3.15, 0.5, -0.15, TRIM, { collide: false, skip: SKIP.BOTTOM });
  box(3.15, 0.06, -0.25, 3.55, 0.5, -0.15, TRIM, { collide: false, skip: SKIP.BOTTOM });
  // banco lungo tutta la larghezza (non si passa dietro)
  box(-3.2, 0, -0.6, 3.2, 1.08, 0, COUNTER, { skip: SKIP.BOTTOM, surface: 'wood' });
  box(-3.25, 1.08, -0.65, 3.25, 1.16, 0.06, TOP, { surface: 'wood' });
  // scaffali sul fondo con la "merce" (scatole colorate di armi e munizioni)
  for (const y of [1.0, 1.9]) {
    box(-3.1, y, -4.2, 3.1, y + 0.07, -3.75, SHELF, { collide: false });
    for (let k = 0; k < 7; k++) {
      const w = 0.55 + ((k * 37) % 5) * 0.06, u = -2.8 + k * 0.85;
      box(u, y + 0.07, -4.15, u + w, y + 0.32 + ((k * 13) % 3) * 0.08, -3.85, GOODS[(k + (y > 1.5 ? 2 : 0)) % GOODS.length], { collide: false });
    }
  }
  // tetto con tenda a strisce rosse e bianche che sporge davanti
  box(-3.7, H, -4.7, 3.7, H + 0.2, -0.1, TRIM, { surface: 'wood' });
  for (let i = 0; i < 8; i++) {
    const u0 = -3.7 + i * (7.4 / 8);
    box(u0, H - 0.25, -0.05, u0 + 7.4 / 8, H + 0.12, 1.1, i % 2 ? WHITE : RED, { collide: false });
  }
  // insegna luminosa sopra il tetto (la scritta "NEGOZIO" la aggiunge game/shop.js)
  box(-2.4, H + 0.2, -0.45, 2.4, H + 1.25, -0.2, SIGN, { collide: false, glow: true, skip: SKIP.BOTTOM });
  box(-2.55, H + 0.2, -0.5, -2.4, H + 1.35, -0.15, TRIM, { collide: false, skip: SKIP.BOTTOM });
  box(2.4, H + 0.2, -0.5, 2.55, H + 1.35, -0.15, TRIM, { collide: false, skip: SKIP.BOTTOM });
  // due luci sotto la tenda
  box(-2.2, H - 0.34, 0.3, -1.6, H - 0.27, 0.7, 0xfff4c8, { collide: false, glow: true });
  box(1.6, H - 0.34, 0.3, 2.2, H - 0.27, 0.7, 0xfff4c8, { collide: false, glow: true });

  if (!ctx.shops) ctx.shops = [];
  ctx.shops.push({
    x: x + f[0] * 1.3, z: z + f[1] * 1.3, y: 0, // dove si mette il giocatore per comprare
    fx: f[0], fz: f[1],
    signX: x - f[0] * 0.18, signZ: z - f[1] * 0.18, signY: H + 0.72, // centro della faccia anteriore dell'insegna
  });
}
