// Passaggio segreto e zona sicura: elemento riutilizzabile in qualsiasi mappa.
//
// buildSecretPassage(...) disegna un pezzo di muro "finto" (si attraversa) di un colore appena
// diverso dal muro vero, più una barriera invisibile che ferma solo i nemici.
// buildSafeRoom(...) costruisce dietro la stanza sicura con la cassa misteriosa e il potenziatore.
// Chi usa questi elementi deve lasciare un buco nel suo muro dove sta il passaggio.
// La logica (cassa, potenziatore, "qui i nemici non entrano") è in game/safezone.js.
import { SKIP } from './builder.js';
import { GROUPS } from '../core/physics.js';

const AXES = {
  '+x': { f: [1, 0], r: [0, 1] },
  '-x': { f: [-1, 0], r: [0, -1] },
  '+z': { f: [0, 1], r: [-1, 0] },
  '-z': { f: [0, -1], r: [1, 0] },
};

/** Colore "appena più giallo": differenza minima, si nota solo guardando bene. */
export function slightlyYellower(color) {
  const r = Math.min(255, ((color >> 16) & 255) + 7);
  const g = Math.min(255, ((color >> 8) & 255) + 4);
  const b = Math.max(0, (color & 255) - 6);
  return (r << 16) | (g << 8) | b;
}

/** Scatola in coordinate locali: s = di lato (destra), d = in avanti (dentro la stanza). */
function localBox(b, x, z, f, r) {
  return (s0, y0, d0, s1, y1, d1, color, o) => {
    const ax = x + r[0] * s0 + f[0] * d0, az = z + r[1] * s0 + f[1] * d0;
    const bx = x + r[0] * s1 + f[0] * d1, bz = z + r[1] * s1 + f[1] * d1;
    b.box(Math.min(ax, bx), y0, Math.min(az, bz), Math.max(ax, bx), y1, Math.max(az, bz), color, o);
  };
}

/**
 * Passaggio segreto in un muro. (x, z) = centro del buco sul piano del muro, dir = verso la stanza.
 * o = { width, height, thick (spessore di ogni metà del muro), color (lato mappa), backColor (lato stanza) }
 */
export function buildSecretPassage(b, x, z, dir, o) {
  const { f, r } = AXES[dir];
  const box = localBox(b, x, z, f, r);
  const w = o.width / 2, t = o.thick;
  // pannello finto: niente collider, stesso piano del muro vero, colore appena diverso
  box(-w, 0, -t, w, o.height, 0, slightlyYellower(o.color), { collide: false, skip: SKIP.BOTTOM });
  box(-w, 0, 0, w, o.height, t, o.backColor, { collide: false, skip: SKIP.BOTTOM });
  // barriera invisibile: i nemici non passano, i giocatori sì (i colpi si fermano, come su un muro)
  box(-w, 0, -t, w, o.height, t, 0, { visible: false, nav: false, groups: GROUPS.barrier, surface: 'wood' });
}

/**
 * Stanza sicura dietro il passaggio. (x, z) = centro del passaggio, dir = verso l'interno.
 * o = { width (default 10), depth (default 10), height, wallThick (spessore del muro del passaggio), door: [larghezza, altezza] }
 * Aggiunge a ctx: safeZones [{ x0, z0, x1, z1 }], boxes [{ x, z, ... }], upgraders [{ x, z, ... }], safeSigns.
 */
export function buildSafeRoom(b, ctx, x, z, dir, o = {}) {
  const { f, r } = AXES[dir];
  const box = localBox(b, x, z, f, r);
  const W = (o.width || 10) / 2, D = o.depth || 10, H = o.height || 3.2;
  const d0 = o.wallThick || 0.15; // la stanza inizia dietro il muro
  const [dw, dh] = o.door || [1.8, 2.6];
  const WALL = 0xcfe8de, FLOOR = 0x4f8f7a, TRIM = 0x2f6f5c, CEIL = 0xeef6f2;
  const nn = { nav: false }; // niente navigazione: i nemici non hanno nodi qui dentro (e la minimappa non la mostra)

  // pavimento, soffitto e pareti
  box(-W - 0.3, -0.3, d0, W + 0.3, 0, D + 0.3, FLOOR, { ...nn, skip: SKIP.BOTTOM, surface: 'soft' });
  box(-W - 0.3, H, d0, W + 0.3, H + 0.3, D + 0.3, CEIL, nn);
  box(-W - 0.3, 0, d0, -W, H, D + 0.3, WALL, { ...nn, skip: SKIP.BOTTOM | SKIP.TOP });
  box(W, 0, d0, W + 0.3, H, D + 0.3, WALL, { ...nn, skip: SKIP.BOTTOM | SKIP.TOP });
  box(-W, 0, D, W, H, D + 0.3, WALL, { ...nn, skip: SKIP.BOTTOM | SKIP.TOP });
  // lato del passaggio: rivestimento sopra il muro esistente (senza collider, c'è già il muro)
  box(-W, 0, d0, -dw / 2, H, d0 + 0.05, WALL, { collide: false, skip: SKIP.BOTTOM | SKIP.TOP });
  box(dw / 2, 0, d0, W, H, d0 + 0.05, WALL, { collide: false, skip: SKIP.BOTTOM | SKIP.TOP });
  box(-dw / 2, dh, d0, dw / 2, H, d0 + 0.05, WALL, { collide: false, skip: SKIP.TOP });
  // battiscopa verde scuro
  box(-W + 0.02, 0, D - 0.06, W - 0.02, 0.18, D, TRIM, { collide: false, skip: SKIP.BOTTOM });
  box(-W, 0, d0 + 0.05, -W + 0.06, 0.18, D - 0.06, TRIM, { collide: false, skip: SKIP.BOTTOM });
  box(W - 0.06, 0, d0 + 0.05, W, 0.18, D - 0.06, TRIM, { collide: false, skip: SKIP.BOTTOM });
  // luci a pannello sul soffitto
  for (const s of [-W / 2, W / 2]) for (const d of [D * 0.3, D * 0.72]) {
    box(s - 0.7, H - 0.05, d - 0.4, s + 0.7, H, d + 0.4, 0xf4fff9, { collide: false, glow: true });
  }
  // tappeto al centro e due panche ai lati
  box(-2, 0, D * 0.25, 2, 0.02, D * 0.65, 0x7a4fb0, { collide: false, skip: SKIP.BOTTOM });
  for (const s of [-W + 0.5, W - 1.0]) {
    box(s, 0, D * 0.3, s + 0.5, 0.45, D * 0.55, 0x8a5a2b, { ...nn, skip: SKIP.BOTTOM });
  }

  // cassa misteriosa (a sinistra in fondo) e potenziatore (a destra in fondo)
  const at = (s, d) => ({ x: x + r[0] * s + f[0] * d, z: z + r[1] * s + f[1] * d });
  const yaw = Math.atan2(-f[0], -f[1]); // le macchine guardano verso il passaggio
  // piedistallo della cassa
  box(-W / 2 - 1.0, 0, D - 1.5, -W / 2 + 1.0, 0.5, D - 0.6, 0x3b4250, { ...nn, skip: SKIP.BOTTOM, surface: 'metal' });
  box(-W / 2 - 1.05, 0.5, D - 1.55, -W / 2 + 1.05, 0.55, D - 0.55, 0xffcf3a, { collide: false, glow: true });
  // potenziatore: macchina viola con bordi arancioni e schermo luminoso
  box(W / 2 - 0.9, 0, D - 1.4, W / 2 + 0.9, 2.3, D - 0.3, 0x5b2a86, { ...nn, skip: SKIP.BOTTOM, surface: 'metal' });
  box(W / 2 - 0.95, 2.3, D - 1.45, W / 2 + 0.95, 2.45, D - 0.25, 0xff8a1f, { collide: false, glow: true });
  box(W / 2 - 0.95, 0, D - 1.45, W / 2 + 0.95, 0.15, D - 0.25, 0xff8a1f, { collide: false, glow: true, skip: SKIP.BOTTOM });
  box(W / 2 - 0.6, 1.2, D - 1.45, W / 2 + 0.6, 2.0, D - 1.4, 0xd59cff, { collide: false, glow: true });
  box(W / 2 - 0.7, 0.9, D - 1.75, W / 2 + 0.7, 1.0, D - 1.4, 0x2b2e35, { ...nn, surface: 'metal' }); // ripiano per l'arma

  if (!ctx.safeZones) ctx.safeZones = [];
  if (!ctx.boxes) ctx.boxes = [];
  if (!ctx.upgraders) ctx.upgraders = [];
  if (!ctx.safeSigns) ctx.safeSigns = [];
  const c0 = at(-W, d0), c1 = at(W, D);
  ctx.safeZones.push({ x0: Math.min(c0.x, c1.x), z0: Math.min(c0.z, c1.z), x1: Math.max(c0.x, c1.x), z1: Math.max(c0.z, c1.z), door: { x, z } });
  const boxPos = at(-W / 2, D - 1.05), use1 = at(-W / 2, D - 3.0);
  ctx.boxes.push({ x: boxPos.x, y: 0.55, z: boxPos.z, yaw, ux: use1.x, uz: use1.z });
  const upPos = at(W / 2, D - 1.6), use2 = at(W / 2, D - 2.8);
  ctx.upgraders.push({ x: upPos.x, y: 1.0, z: upPos.z, yaw, ux: use2.x, uz: use2.z });
  // scritta "ZONA SICURA" sopra il passaggio, dal lato della stanza
  const sg = at(0, d0 + 0.07);
  ctx.safeSigns.push({ x: sg.x, y: Math.min(H - 0.3, dh + 0.3), z: sg.z, yaw: Math.atan2(f[0], f[1]) });
}
