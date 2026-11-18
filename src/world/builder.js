// Costruttore della geometria statica del mondo.
// Raccoglie tre cose mentre le stanze si "disegnano":
//  1. triangoli colorati, uniti in una sola mesh per riquadro (pochissime chiamate di disegno);
//     la luce è "dipinta" nei colori dei vertici (niente luci vere per le stanze);
//  2. i collider per la fisica (scatole, anche inclinate per rampe e scale);
//  3. le forme semplici (scatole e rampe) usate per calcolare la griglia di navigazione.
import * as THREE from 'three';

// Direzione della luce finta usata per ombreggiare le facce.
const L = new THREE.Vector3(0.45, 0.8, 0.35).normalize();
/** Quanto è illuminata una faccia con questa normale (0..1). */
function shadeOf(n) {
  return 0.62 + 0.25 * Math.max(0, n.x * L.x + n.y * L.y + n.z * L.z) + 0.13 * (n.y * 0.5 + 0.5);
}

const tmpC = new THREE.Color();
const v = new THREE.Vector3(), n = new THREE.Vector3();
const mat4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s1 = new THREE.Vector3(1, 1, 1);

// Facce di una scatola unitaria (da -1 a 1): normale e 4 angoli in senso antiorario.
const FACES = [
  { n: [1, 0, 0], c: [[1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1]] },
  { n: [-1, 0, 0], c: [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]] },
  { n: [0, 1, 0], c: [[-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1]] },
  { n: [0, -1, 0], c: [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]] },
  { n: [0, 0, 1], c: [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]] },
  { n: [0, 0, -1], c: [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]] },
];
/** Maschere per saltare facce che non si vedono mai. */
export const SKIP = { PX: 1, NX: 2, TOP: 4, BOTTOM: 8, PZ: 16, NZ: 32 };

export class Builder {
  constructor() {
    this.chunks = new Map();  // chiave → { pos: [], col: [] }
    this.cur = null;
    this.water = [];          // triangoli dell'acqua (mesh trasparente a parte)
    this.colliders = [];      // { hx, hy, hz, x, y, z, q, surface }
    this.shapes = [];         // forme per la navigazione
    this.auto = 12;           // divide la geometria in blocchi da 12×12 m (si disegna solo ciò che si vede)
  }

  /** Sceglie il blocco in base alla posizione; i pezzi molto grandi (pavimenti) vanno a parte. */
  _autoChunk(cx, cz, big) {
    if (!this.auto) return;
    this.chunk(big ? 'big' : `${Math.floor(cx / this.auto)},${Math.floor(cz / this.auto)}`);
  }

  /** Sceglie la mesh (riquadro) in cui finiscono i prossimi triangoli. */
  chunk(key) {
    if (!this.chunks.has(key)) this.chunks.set(key, { pos: [], col: [] });
    this.cur = this.chunks.get(key);
  }

  /**
   * Scatola allineata agli assi da (x0,y0,z0) a (x1,y1,z1).
   * o = { collide: true, visible: true, surface: 'stone', glow: false, skip: 0, nav: true, ao: true, groups }
   * (groups = gruppi di collisione speciali, ad esempio la barriera che ferma solo i nemici)
   */
  box(x0, y0, z0, x1, y1, z1, color, o = {}) {
    if (x0 > x1) [x0, x1] = [x1, x0];
    if (y0 > y1) [y0, y1] = [y1, y0];
    if (z0 > z1) [z0, z1] = [z1, z0];
    const hx = (x1 - x0) / 2, hy = (y1 - y0) / 2, hz = (z1 - z0) / 2;
    const cx = x0 + hx, cy = y0 + hy, cz = z0 + hz;
    if (o.visible !== false) {
      this._autoChunk(cx, cz, hx > this.auto / 2 || hz > this.auto / 2);
      mat4.compose(v.set(cx, cy, cz), q.identity(), n.set(hx, hy, hz));
      this._box(mat4, null, color, o, y0);
    }
    if (o.collide !== false) {
      this.colliders.push({ hx, hy, hz, x: cx, y: cy, z: cz, q: null, surface: o.surface || 'stone', groups: o.groups });
      if (o.nav !== false) this.shapes.push({ k: 0, x0, y0, z0, x1, y1, z1 });
    }
  }

  /**
   * Rampa: la superficie di sopra va da altezza h0 (all'inizio, x0 o z0) a h1 (alla fine, x1 o z1).
   * axis = 'x' o 'z'. o.steps = true disegna dei gradini (il collider resta una rampa liscia).
   */
  ramp(x0, z0, x1, z1, axis, h0, h1, color, o = {}) {
    const t = o.thick || 0.3;
    const len = axis === 'x' ? x1 - x0 : z1 - z0;
    const wid = axis === 'x' ? z1 - z0 : x1 - x0;
    const rise = h1 - h0, ang = Math.atan2(rise, len), slant = Math.hypot(len, rise);
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, cy = (h0 + h1) / 2 - t / 2 / Math.cos(ang);
    if (axis === 'x') q.setFromAxisAngle(v.set(0, 0, 1), ang);
    else q.setFromAxisAngle(v.set(1, 0, 0), -ang);
    const hx = axis === 'x' ? slant / 2 : wid / 2, hz = axis === 'x' ? wid / 2 : slant / 2;
    const rq = q.clone();
    if (o.steps) {
      // gradini: lastre orizzontali una sopra l'altra (sotto la scala si può passare)
      const nSteps = Math.max(2, Math.round(Math.abs(rise) / 0.25));
      const sl = len / nSteps;
      for (let i = 0; i < nSteps; i++) {
        // a metà altezza di ogni tratto: nessun gradino è allo stesso livello del pavimento (niente sfarfallio)
        const top = h0 + rise * ((i + 0.5) / nSteps);
        const a = (axis === 'x' ? x0 : z0) + sl * i, b = a + sl;
        if (axis === 'x') this.box(a, top - 0.3, z0, b, top, z1, color, { collide: false, ao: false });
        else this.box(x0, top - 0.3, a, x1, top, b, color, { collide: false, ao: false });
      }
    } else if (o.visible !== false) {
      this._autoChunk(cx, cz, false);
      mat4.compose(v.set(cx, cy, cz), rq, n.set(hx, t / 2, hz));
      this._box(mat4, null, color, { ...o, ao: false }, 0);
    }
    this.colliders.push({ hx, hy: t / 2, hz, x: cx, y: cy, z: cz, q: rq, surface: o.surface || 'stone' });
    this.shapes.push({ k: 1, x0, z0, x1, z1, axis, h0, h1, t: t / Math.cos(ang) });
  }

  /** Geometria decorativa qualsiasi di Three.js (coni, sfere...), senza collider. */
  geo(geometry, x, y, z, color, o = {}) {
    const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    mat4.compose(v.set(x, y, z), q.setFromAxisAngle(n.set(0, 1, 0), o.rotY || 0), o.scale || s1);
    g.applyMatrix4(mat4);
    this._autoChunk(x, z, false);
    const p = g.attributes.position.array;
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    tmpC.set(color);
    const out = this.cur;
    for (let i = 0; i < p.length; i += 9) {
      a.fromArray(p, i); b.fromArray(p, i + 3); c.fromArray(p, i + 6);
      n.subVectors(c, b).cross(v.subVectors(a, b)).normalize();
      const s = o.glow ? 1 : shadeOf(n);
      for (let k = 0; k < 9; k++) out.pos.push(p[i + k]);
      for (let k = 0; k < 3; k++) out.col.push(tmpC.r * s, tmpC.g * s, tmpC.b * s);
    }
    g.dispose();
  }

  /** Superficie d'acqua orizzontale (trasparente). */
  waterQuad(x0, z0, x1, z1, y) {
    this.water.push(x0, y, z0, x0, y, z1, x1, y, z1, x0, y, z0, x1, y, z1, x1, y, z0);
  }

  _box(m, _unused, color, o, minY) {
    const out = this.cur;
    tmpC.set(color);
    const skip = o.skip || 0;
    const e = m.elements;
    for (let f = 0; f < 6; f++) {
      if (skip & (1 << f)) continue;
      const F = FACES[f];
      n.set(F.n[0], F.n[1], F.n[2]).transformDirection(m);
      const s = o.glow ? 1 : shadeOf(n);
      const side = Math.abs(n.y) < 0.5 && o.ao !== false && !o.glow;
      const vs = F.c.map((c) => {
        const x = c[0], y = c[1], z = c[2];
        return [e[0] * x + e[4] * y + e[8] * z + e[12], e[1] * x + e[5] * y + e[9] * z + e[13], e[2] * x + e[6] * y + e[10] * z + e[14]];
      });
      for (const idx of [0, 1, 2, 0, 2, 3]) {
        const p = vs[idx];
        out.pos.push(p[0], p[1], p[2]);
        // "occlusione ambientale" finta: le pareti sono più scure vicino al pavimento
        const ao = side ? 0.7 + 0.3 * Math.min(1, Math.max(0, (p[1] - minY) / 1.4)) : 1;
        out.col.push(tmpC.r * s * ao, tmpC.g * s * ao, tmpC.b * s * ao);
      }
    }
  }
}
