// Montagne russe: un percorso chiuso (curva liscia Catmull-Rom) che parte dalla stazione nel luna park,
// sale sopra le backrooms, torna indietro passando sopra il luna park e il parcheggio e rientra in stazione.
// Alcuni punti cambiano con il seed (altezza della cima e delle gobbe, piccole curve).
//
// buildCoaster(...) disegna nella geometria unita della mappa binari, traversine, trave centrale,
// sostegni, stazione e cabina di comando: sono fermi, quindi costano pochissimo (nessuna mesh in più).
// Si muove solo il trenino (3 vagoni da 2 posti), mesh normali aggiornate da game/rides.js.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SKIP } from './builder.js';

export const COASTER = {
  CARS: 3,           // vagoni
  GAP: 2.6,          // distanza tra i centri di due vagoni lungo il binario
  GAUGE: 0.55,       // metà distanza tra le rotaie
  RAIL_Y: 0.3,       // altezza delle rotaie in stazione
  SAMPLE: 0.25,      // passo della tabella delle posizioni (m)
};

const RAIL = 0xe8e6e0, TIE = 0x4a3a2a, SPINE = 0xe0503c, POST = 0xf2efe6, DARK = 0x3b4250, YEL = 0xffd166;
const UP = new THREE.Vector3(0, 1, 0);
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _f = new THREE.Vector3(), _r = new THREE.Vector3(), _u = new THREE.Vector3();
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion();

/** Punti di controllo del percorso (in ordine di marcia). */
function controlPoints(rng) {
  const top = 20 + rng.range(0, 2), hill = 13 + rng.range(0, 4), mid = 14 + rng.range(-1, 2), jz = () => rng.range(-1.5, 1.5);
  const y = COASTER.RAIL_Y;
  return [
    [14, y, -29], [17.5, y, -29], [21, y, -29], [24.5, y, -29],      // stazione (dritta e in piano)
    [28.5, 3, -29], [34, 9.5, -29], [40, 16, -29], [46, top, -28.5], // salita a catena sopra le backrooms
    [52, top - 9, -26], [57, 7.5 - rng.range(0, 1), -17], [58, 10, -4], // discesa
    [55, hill, 6], [47, 11, 13 + jz()], [38, 13, 21],                // gobba e curva verso ovest
    [26, 14, 24], [10, mid, 24], [-6, 14, 24],                       // sopra il luna park (sul vialetto)
    [-22, 13.5, 22], [-33, 14, 14 + jz()], [-37.5, 13, 0], [-37, 12.5, -16 + jz()], // sopra il parcheggio
    [-30, 12, -29], [-21, 11.5, -32.5],                              // curva verso est
    [-9, 5.5, -32.5], [0, 3.2, -32.5], [9.5, 2.6, -31],              // ritorno lungo il muro nord, frenata
  ].map(([x, yy, z]) => new THREE.Vector3(x, yy, z));
}

/** Tabella delle posizioni lungo il binario (ogni SAMPLE metri): posizione e direzione. */
function makeTrack(points) {
  const curve = new THREE.CatmullRomCurve3(points, true, 'centripetal');
  curve.arcLengthDivisions = 4000;
  const L = curve.getLength();
  const n = Math.round(L / COASTER.SAMPLE);
  const pts = curve.getSpacedPoints(n); // n+1 punti, l'ultimo coincide con il primo
  const px = new Float32Array(n), py = new Float32Array(n), pz = new Float32Array(n);
  for (let i = 0; i < n; i++) { px[i] = pts[i].x; py[i] = Math.max(COASTER.RAIL_Y, pts[i].y); pz[i] = pts[i].z; }
  return { L, n, step: L / n, px, py, pz };
}

/**
 * Posizione e assi del binario alla distanza s: out = { x, y, z, f: Vector3 avanti, r: destra, u: su }.
 * Le rotaie non si inclinano di lato (niente vagoni storti): "su" resta il più possibile verso l'alto.
 */
export function trackFrame(track, s, out) {
  const { n, step, px, py, pz } = track;
  let t = (((s % track.L) + track.L) % track.L) / step;
  const i = Math.floor(t) % n, j = (i + 1) % n, k = (i + 2) % n, h = (i - 1 + n) % n;
  t -= Math.floor(t);
  out.x = px[i] + (px[j] - px[i]) * t;
  out.y = py[i] + (py[j] - py[i]) * t;
  out.z = pz[i] + (pz[j] - pz[i]) * t;
  // direzione: media di due tratti vicini (più liscia)
  out.f.set(px[k] - px[h], py[k] - py[h], pz[k] - pz[h]).normalize();
  out.r.crossVectors(UP, out.f);
  if (out.r.lengthSq() < 1e-6) out.r.set(1, 0, 0);
  out.r.normalize();
  out.u.crossVectors(out.f, out.r);
  return out;
}
const newFrame = () => ({ x: 0, y: 0, z: 0, f: new THREE.Vector3(), r: new THREE.Vector3(), u: new THREE.Vector3() });

/** Scatola orientata secondo gli assi del binario, nella geometria unita. */
function orientedBox(b, fr, cx, cy, cz, w, h, l, color) {
  const g = new THREE.BoxGeometry(w, h, l);
  _m.makeBasis(fr.r, fr.u, fr.f);
  g.applyMatrix4(_m);
  b.geo(g, cx, cy, cz, color);
  g.dispose();
}
/** Trave tra due punti (sezione quadrata), nella geometria unita. */
function beam(b, a, c, w, color) {
  _f.subVectors(c, a);
  const len = _f.length();
  const g = new THREE.BoxGeometry(w, len, w);
  g.applyQuaternion(_q.setFromUnitVectors(UP, _f.normalize()));
  b.geo(g, (a.x + c.x) / 2, (a.y + c.y) / 2, (a.z + c.z) / 2, color);
  g.dispose();
}

/** Su cosa poggia un sostegno in (x, z): altezza della base, o null se lì non si può mettere. */
function postBase(x, z, noPost) {
  const near = (v, w) => Math.abs(v - w) < 0.7;
  if (near(x, -45) || near(x, -15) || near(x, 33) || near(x, 63) || Math.abs(z) > 35.2) return null; // muri
  if (x > -44.6 && x < -15.4) {
    // parcheggio: sul tetto, lontano dalle auto, dai lampioni e dal buco della rampa
    if (x < -39.2 || x > -20.8) return null;
    if ([[-36, -24], [-24, -2], [-36, 12], [-24, 28]].some(([lx, lz]) => Math.hypot(x - lx, z - lz) < 1.5)) return null;
    if (x > -32.6 && x < -27.4 && z > 6.4 && z < 16.6) return null;
    if (x > -27.1 && x < -21.9 && z > -16.6 && z < -6.4) return null; // seconda rampa (fase 16)
    return { y: 7, solid: true };
  }
  if (x > 33.4 && x < 62.6) return { y: 3.5, solid: false }; // sopra il soffitto delle backrooms
  if (x > -15 && x < 33) {
    if (noPost.some(([x0, z0, x1, z1]) => x > x0 && x < x1 && z > z0 && z < z1)) return null;
    return { y: 0, solid: true };
  }
  return null;
}

/**
 * Costruisce le montagne russe. noPost = rettangoli [x0, z0, x1, z1] del luna park dove non mettere sostegni.
 * Aggiunge a ctx.rides la descrizione della giostra (con la tabella del binario) e le insegne.
 */
export function buildCoaster(b, ctx, rng, noPost = []) {
  const track = makeTrack(controlPoints(rng));
  const { L } = track;
  const A = newFrame(), B = newFrame();
  // binari: due rotaie, traversine, trave centrale (dove il binario è alto), sostegni ogni ~5 m
  const SEG = 1.0;
  const nSeg = Math.round(L / SEG);
  let nextPost = 2;
  for (let i = 0; i < nSeg; i++) {
    const s0 = (i * L) / nSeg, s1 = ((i + 1) * L) / nSeg;
    trackFrame(track, s0, A); trackFrame(track, s1, B);
    for (const side of [-1, 1]) {
      const g = COASTER.GAUGE * side;
      _a.set(A.x, A.y, A.z).addScaledVector(A.r, g).addScaledVector(A.u, -0.05);
      _b.set(B.x, B.y, B.z).addScaledVector(B.r, g).addScaledVector(B.u, -0.05);
      beam(b, _a, _b, 0.1, RAIL);
    }
    const high = A.y > 1.2;
    if (i % 1 === 0) orientedBox(b, A, A.x - A.u.x * 0.15, A.y - A.u.y * 0.15, A.z - A.u.z * 0.15, 1.45, 0.08, 0.22, TIE);
    if (high) {
      _a.set(A.x, A.y, A.z).addScaledVector(A.u, -0.42);
      _b.set(B.x, B.y, B.z).addScaledVector(B.u, -0.42);
      beam(b, _a, _b, 0.3, SPINE);
    }
    // sostegni
    if (s0 >= nextPost && high) {
      const base = postBase(A.x, A.z, noPost);
      const top = A.y - 0.55;
      if (base && top - base.y > 1.4) {
        nextPost = s0 + 5;
        const x = A.x, z = A.z;
        b.box(x - 0.16, base.y, z - 0.16, x + 0.16, top, z + 0.16, POST, { collide: base.solid, nav: base.solid, skip: SKIP.BOTTOM, surface: 'metal', noStand: true });
        b.box(x - 0.35, base.y, z - 0.35, x + 0.35, base.y + 0.3, z + 0.35, 0x8a8d93, { collide: false, skip: SKIP.BOTTOM });
      }
    }
  }

  // stazione: pensilina sopra il binario, banchina a sud (+z) con il bordo giallo
  const ZT = -29, P0 = 13, P1 = 25.5, ZP0 = -28.1, ZP1 = -26.5;
  b.box(P0, 0, ZP0, P1, 0.25, ZP1, 0xa9acb1, { skip: SKIP.BOTTOM });
  b.box(P0, 0.25, ZP0, P1, 0.27, ZP0 + 0.25, YEL, { collide: false, ao: false });
  for (const x of [P0 + 0.3, (P0 + P1) / 2, P1 - 0.3]) {
    for (const z of [ZT - 1.4, ZP1 - 0.2]) b.box(x - 0.12, 0, z - 0.12, x + 0.12, 3.2, z + 0.12, DARK, { skip: SKIP.BOTTOM, surface: 'metal', noStand: true });
  }
  // pensilina: non calpestabile (fase 16)
  b.box(P0 - 0.3, 3.2, ZT - 1.7, P1 + 0.3, 3.4, ZP1 + 0.2, 0xb45cff, { surface: 'metal', noStand: true });
  for (let x = P0; x < P1; x += 1.2) b.box(x, 3.0, ZP1 + 0.15, x + 0.6, 3.2, ZP1 + 0.3, x % 2.4 < 1.2 ? 0xffffff : 0xb45cff, { collide: false });
  for (let x = P0 + 0.4; x < P1; x += 0.8) b.box(x - 0.07, 2.95, ZP1 + 0.32, x + 0.07, 3.09, ZP1 + 0.46, x % 1.6 < 0.8 ? 0xfff1a8 : 0xff7a59, { collide: false, glow: true });
  (ctx.signs || (ctx.signs = [])).push(
    { text: 'MONTAGNE RUSSE', sub: 'Sali in stazione', x: (P0 + P1) / 2, y: 3.95, z: ZP1 + 0.32, w: 4.4, h: 1.0, bg: '#b45cff', fg: '#ffffff', subColor: '#ffd166' },
  );
  b.box((P0 + P1) / 2 - 2.3, 3.4, ZP1 + 0.19, (P0 + P1) / 2 + 2.3, 4.5, ZP1 + 0.3, 0xb45cff, { collide: false, skip: SKIP.BOTTOM });

  // cabina di comando a est della banchina, rivolta verso +z
  const bx = 27.6, bz = -24.9;
  b.box(bx - 1.1, 0, bz - 1.9, bx + 1.1, 2.5, bz - 1.75, 0xf2efe6, { skip: SKIP.BOTTOM, surface: 'wood', noStand: true });
  b.box(bx - 1.1, 0, bz - 1.75, bx - 0.95, 2.5, bz, 0xf2efe6, { skip: SKIP.BOTTOM, surface: 'wood', noStand: true });
  b.box(bx + 0.95, 0, bz - 1.75, bx + 1.1, 2.5, bz, 0xf2efe6, { skip: SKIP.BOTTOM, surface: 'wood', noStand: true });
  b.box(bx - 1.25, 2.5, bz - 2.05, bx + 1.25, 2.7, bz + 0.35, 0xb45cff, { surface: 'wood', noStand: true });
  b.box(bx - 0.95, 0, bz - 0.55, bx + 0.95, 1.0, bz, DARK, { skip: SKIP.BOTTOM, surface: 'metal' });
  b.box(bx - 0.95, 1.0, bz - 0.6, bx + 0.95, 1.06, bz + 0.05, 0x5a6273, { surface: 'metal' });
  b.box(bx - 0.7, 1.06, bz - 0.35, bx - 0.4, 1.12, bz - 0.15, 0x2fbf71, { collide: false, glow: true });
  b.box(bx - 0.25, 1.06, bz - 0.35, bx + 0.05, 1.12, bz - 0.15, 0xff5a4e, { collide: false, glow: true });
  b.box(bx + 0.4, 1.06, bz - 0.3, bx + 0.48, 1.5, bz - 0.22, DARK, { collide: false });
  b.box(bx + 0.36, 1.5, bz - 0.34, bx + 0.52, 1.62, bz - 0.18, 0xff5a4e, { collide: false, glow: true });
  ctx.signs.push({ text: 'COMANDI', x: bx, y: 3.0, z: bz + 0.37, w: 2.2, h: 0.5, bg: '#b45cff', fg: '#ffffff' });

  // punti speciali lungo il binario: fermata in stazione, salita a catena, frenata prima della stazione
  const sAt = (x, z) => {
    let best = 0, bd = Infinity;
    for (let i = 0; i < track.n; i++) {
      const d = (track.px[i] - x) ** 2 + (track.pz[i] - z) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    return best * track.step;
  };
  let topI = 0;
  for (let i = 0; i < track.n; i++) if (track.py[i] > track.py[topI]) topI = i;
  const stationS = sAt(23, ZT);           // muso del primo vagone quando il treno è fermo
  (ctx.rides || (ctx.rides = [])).push({
    kind: 'coaster', name: 'Montagne russe', icon: '🎢',
    n: COASTER.CARS * 2,
    ctrl: { x: bx, z: bz + 0.9 },
    exitZ: (ZP0 + ZP1) / 2 + 0.2, plat: 0.25,
    track, stationS,
    liftS0: sAt(25.5, ZT), liftS1: topI * track.step,
    brakeS0: sAt(-9, -32.5), brakeS1: sAt(15, ZT),
    yTop: track.py[topI],
    line: Array.from({ length: Math.ceil(track.n / 8) }, (_, i) => [track.px[i * 8], track.pz[i * 8]]), // per la minimappa
  });
}

/* ======================= Il trenino ======================= */

function paint(g, color) {
  const c = new THREE.Color(color), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  g.deleteAttribute('uv');
  return g.index ? g.toNonIndexed() : g;
}
function part(list, geo, color, x, y, z, rx = 0) {
  if (rx) geo.rotateX(rx);
  geo.translate(x, y, z);
  list.push(paint(geo, color));
}

/**
 * Vagone: origine al centro tra le rotaie (in alto), avanti = +z, destra = +x.
 * Nessuna faccia di due pezzi diversi sta nello stesso piano: altrimenti la scheda grafica non sa
 * quale disegnare davanti e il bordo "sfarfalla" a strisce (era il glitch sul bordo davanti).
 */
function carGeometry(color, front) {
  const l = [];
  part(l, new THREE.BoxGeometry(1.3, 0.25, 2.2), DARK, 0, 0.25, 0);                 // telaio
  part(l, new THREE.BoxGeometry(0.08, 0.55, 2.3), color, 0.65, 0.65, 0);            // fianchi
  part(l, new THREE.BoxGeometry(0.08, 0.55, 2.3), color, -0.65, 0.65, 0);
  part(l, new THREE.BoxGeometry(1.22, 0.52, 0.1), color, 0, 0.65, 1.1);             // davanti: tra i fianchi, sotto il bordo
  part(l, new THREE.BoxGeometry(1.22, 0.75, 0.1), color, 0, 0.75, -1.1);            // dietro
  part(l, new THREE.BoxGeometry(1.42, 0.06, 2.36), 0xfaf7f0, 0, 0.95, 0);           // bordo: sporge un po' tutto intorno
  for (const sx of [-0.32, 0.32]) {
    part(l, new THREE.BoxGeometry(0.5, 0.12, 0.6), 0x2c3e66, sx, 0.44, -0.25);      // sedile
    part(l, new THREE.BoxGeometry(0.5, 0.6, 0.12), 0x2c3e66, sx, 0.75, -0.6);       // schienale
  }
  part(l, new THREE.BoxGeometry(1.1, 0.06, 0.06), YEL, 0, 1.0, 0.2);                // barra di sicurezza
  for (const sx of [-0.62, 0.62]) for (const sz of [-0.75, 0.75]) part(l, new THREE.BoxGeometry(0.16, 0.26, 0.36), DARK, sx, 0.0, sz); // ruote
  // muso a piramide: base quadrata nascosta dentro il pannello davanti, punta in avanti, non sporge sopra il bordo
  if (front) part(l, new THREE.ConeGeometry(0.6, 0.6, 4, 1, false, Math.PI / 4), color, 0, 0.52, 1.42, Math.PI / 2);
  return mergeGeometries(l);
}

const solidMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
const CAR_COLS = [0xff5a4e, 0xffb627, 0x3d8bff];

/** Mesh del trenino: { group, geos, pose(s) }. */
export function makeTrainVisual(def) {
  const group = new THREE.Group(), geos = [], cars = [];
  for (let c = 0; c < COASTER.CARS; c++) {
    const g = carGeometry(CAR_COLS[c % CAR_COLS.length], c === 0);
    geos.push(g);
    const m = new THREE.Mesh(g, solidMat);
    m.matrixAutoUpdate = false;
    group.add(m);
    cars.push(m);
  }
  const fr = newFrame();
  return {
    group, geos,
    pose(s) {
      for (let c = 0; c < cars.length; c++) {
        trackFrame(def.track, s - c * COASTER.GAP, fr);
        const m = cars[c].matrix;
        m.makeBasis(fr.r, fr.u, fr.f);
        m.setPosition(fr.x, fr.y, fr.z);
        cars[c].matrixWorldNeedsUpdate = true;
      }
    },
  };
}

const seatFr = newFrame();
/** Centro della capsula di chi è seduto nel posto k (2 per vagone) con il treno a s. */
export function coasterSeat(def, s, k, seatUp, out) {
  const c = Math.floor(k / 2), side = k % 2 ? 0.32 : -0.32;
  const fr = trackFrame(def.track, s - c * COASTER.GAP, seatFr);
  out.x = fr.x + fr.r.x * side + fr.u.x * (0.38 + seatUp) - fr.f.x * 0.2;
  out.y = fr.y + fr.r.y * side + fr.u.y * (0.38 + seatUp) - fr.f.y * 0.2;
  out.z = fr.z + fr.r.z * side + fr.u.z * (0.38 + seatUp) - fr.f.z * 0.2;
  return out;
}
