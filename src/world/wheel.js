// Ruota panoramica del luna park.
//
// buildWheel(...) disegna le parti FISSE nella geometria unita della mappa (gambe ad A, asse, pedana,
// recinto, cabina di comando) e aggiunge a ctx.rides la descrizione della giostra.
// makeWheelVisual(...) crea le parti che SI MUOVONO (ruota e cabine), mesh normali di Three.js
// aggiornate a ogni frame da game/rides.js con l'angolo della ruota (vedi world/rideVisuals.js).
// Le cabine non hanno collider: chi è seduto segue il posto da programma (vedi player.js).
import * as THREE from 'three';
import { glowMat } from '../core/glow.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SKIP } from './builder.js';

export const WHEEL = {
  R: 9.5,          // raggio (dal mozzo all'aggancio delle cabine)
  N: 8,            // cabine
  HANG: 2.3,       // dall'aggancio al pavimento della cabina
  RIM_Z: 1.05,     // distanza dei due anelli dal piano centrale
  PLAT: 0.25,      // altezza della pedana d'imbarco
};
WHEEL.HUB = WHEEL.R + WHEEL.HANG + WHEEL.PLAT + 0.07; // la cabina più bassa sfiora la pedana

const BRIGHT = [0xff5a4e, 0xffb627, 0x2fbf71, 0x3d8bff, 0xb45cff, 0xff6fb5, 0x2ec4b6, 0xff8a3d];
const STEEL = 0xf2efe6, DARK = 0x3b4250, YEL = 0xffd166;
const Y = new THREE.Vector3(0, 1, 0);

/* ======================= Parti fisse (geometria della mappa) ======================= */

/** Trave tra due punti, disegnata nella geometria unita (senza collider). */
function beam(b, ax, ay, az, bx, by, bz, w, color) {
  const d = new THREE.Vector3(bx - ax, by - ay, bz - az), len = d.length();
  const g = new THREE.BoxGeometry(w, len, w);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(Y, d.normalize()));
  b.geo(g, (ax + bx) / 2, (ay + by) / 2, (az + bz) / 2, color);
  g.dispose();
}

/** Recinto basso lungo un segmento allineato agli assi, con un eventuale varco [da, a]. */
function fence(b, x0, z0, x1, z1, gap) {
  const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0);
  const a0 = alongX ? x0 : z0, a1 = alongX ? x1 : z1;
  const segs = gap ? [[a0, gap[0]], [gap[1], a1]] : [[a0, a1]];
  for (const [s0, s1] of segs) {
    if (s1 - s0 < 0.1) continue;
    if (alongX) {
      b.box(s0, 0, z0 - 0.06, s1, 1.0, z0 + 0.06, DARK, { skip: SKIP.BOTTOM, surface: 'metal' });
      b.box(s0, 0.85, z0 - 0.09, s1, 1.05, z0 + 0.09, YEL, { collide: false });
    } else {
      b.box(x0 - 0.06, 0, s0, x0 + 0.06, 1.0, s1, DARK, { skip: SKIP.BOTTOM, surface: 'metal' });
      b.box(x0 - 0.09, 0.85, s0, x0 + 0.09, 1.05, s1, YEL, { collide: false });
    }
  }
}

/**
 * Ruota con il centro della base in (cx, cz); il piano della ruota è parallelo all'asse x.
 * La pedana d'imbarco è sotto la cabina più bassa, la cabina di comando davanti a destra (+x, +z).
 */
export function buildWheel(b, ctx, cx, cz) {
  const { R, HUB, PLAT } = WHEEL;
  // pedana d'imbarco con bordo giallo e frecce
  b.box(cx - 4, 0, cz - 2.2, cx + 4, PLAT, cz + 2.2, 0xa9acb1, { skip: SKIP.BOTTOM });
  b.box(cx - 4.05, PLAT, cz + 2.0, cx + 4.05, PLAT + 0.02, cz + 2.2, YEL, { collide: false, ao: false });
  b.box(cx - 1.2, PLAT, cz - 1.0, cx + 1.2, PLAT + 0.015, cz + 1.0, 0x8f9298, { collide: false, ao: false });
  // gambe ad A davanti e dietro la ruota (dai piedi fino al mozzo) e asse centrale
  for (const sz of [-1, 1]) {
    for (const sx of [-1, 1]) {
      const fx = cx + sx * 5.8, fz = cz + sz * 2.7;
      beam(b, fx, 0.3, fz, cx + sx * 0.25, HUB, cz + sz * 1.5, 0.34, STEEL);
      b.box(fx - 0.45, 0, fz - 0.45, fx + 0.45, 0.4, fz + 0.45, 0x8a8d93, { skip: SKIP.BOTTOM });
    }
    // traverse orizzontali tra le due gambe
    for (const h of [4, 8.5]) {
      const t = h / HUB, off = 5.8 * (1 - t) + 0.25 * t, zz = cz + sz * (2.7 * (1 - t) + 1.5 * t);
      b.box(cx - off, h - 0.12, zz - 0.12, cx + off, h + 0.12, zz + 0.12, STEEL, { collide: false });
    }
  }
  b.box(cx - 0.22, HUB - 0.22, cz - 1.75, cx + 0.22, HUB + 0.22, cz + 1.75, DARK, { collide: false });
  // recinto intorno (varco davanti, verso la piazza)
  const X0 = cx - 7.5, X1 = cx + 7.5, Z0 = cz - 4.5, Z1 = cz + 6.8;
  fence(b, X0, Z0, X1, Z0);
  fence(b, X0, Z1, X1, Z1, [cx - 2.2, cx + 2.2]);
  fence(b, X0, Z0, X0, Z1);
  fence(b, X1, Z0, X1, Z1);
  // cabina di comando: casetta con il banco dei comandi, rivolta verso +z
  const bx = cx + 4.2, bz = cz + 5.2;
  b.box(bx - 1.1, 0, bz - 1.8, bx + 1.1, 0.08, bz, 0x2c3e66, { collide: false, skip: SKIP.BOTTOM });
  // pareti e tetto della cabina: sopra non ci si sta in piedi (fase 16)
  b.box(bx - 1.1, 0, bz - 1.9, bx + 1.1, 2.5, bz - 1.75, STEEL, { skip: SKIP.BOTTOM, surface: 'wood', noStand: true });
  b.box(bx - 1.1, 0, bz - 1.75, bx - 0.95, 2.5, bz, STEEL, { skip: SKIP.BOTTOM, surface: 'wood', noStand: true });
  b.box(bx + 0.95, 0, bz - 1.75, bx + 1.1, 2.5, bz, STEEL, { skip: SKIP.BOTTOM, surface: 'wood', noStand: true });
  b.box(bx - 1.25, 2.5, bz - 2.05, bx + 1.25, 2.7, bz + 0.35, 0x3d8bff, { surface: 'wood', noStand: true });
  b.box(bx - 0.95, 0, bz - 0.55, bx + 0.95, 1.0, bz, DARK, { skip: SKIP.BOTTOM, surface: 'metal' });
  b.box(bx - 0.95, 1.0, bz - 0.6, bx + 0.95, 1.06, bz + 0.05, 0x5a6273, { surface: 'metal' });
  b.box(bx - 0.7, 1.06, bz - 0.35, bx - 0.4, 1.12, bz - 0.15, 0x2fbf71, { collide: false, glow: true });
  b.box(bx - 0.25, 1.06, bz - 0.35, bx + 0.05, 1.12, bz - 0.15, 0xff5a4e, { collide: false, glow: true });
  b.box(bx + 0.4, 1.06, bz - 0.3, bx + 0.48, 1.5, bz - 0.22, DARK, { collide: false });                    // leva
  b.box(bx + 0.36, 1.5, bz - 0.34, bx + 0.52, 1.62, bz - 0.18, 0xff5a4e, { collide: false, glow: true });
  (ctx.signs || (ctx.signs = [])).push(
    { text: 'RUOTA PANORAMICA', sub: 'Cabina di comando', x: bx, y: 3.05, z: bz + 0.37, w: 2.4, h: 0.62, bg: '#3d8bff', fg: '#ffffff', subColor: '#ffd166' },
  );
  (ctx.rides || (ctx.rides = [])).push({
    kind: 'wheel', name: 'Ruota panoramica', icon: '🎡',
    x: cx, y: HUB, z: cz, R, n: WHEEL.N,
    ctrl: { x: bx, z: bz + 0.9 },                 // dove ci si mette per usare i comandi
    exitZ: cz + 1.6,                              // si scende sulla pedana, davanti alla cabina
    plat: PLAT,
  });
}

/* ======================= Parti che si muovono ======================= */

/** Colora tutti i vertici di una geometria. */
function paint(g, color) {
  const c = new THREE.Color(color), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  g.deleteAttribute('uv');
  return g.index ? g.toNonIndexed() : g;
}
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);
const Z = new THREE.Vector3(0, 0, 1), X = new THREE.Vector3(1, 0, 0);
/** Aggiunge alla lista una geometria spostata e ruotata (rz attorno a z, poi rx attorno a x). */
function put(list, geo, color, x, y, z, rz = 0, rx = 0) {
  _q.setFromAxisAngle(Z, rz);
  if (rx) _q.multiply(new THREE.Quaternion().setFromAxisAngle(X, rx));
  _m.compose(_p.set(x, y, z), _q, _s);
  list.push(paint(geo.applyMatrix4(_m), color));
}

const solidMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
const lampMat = glowMat(new THREE.MeshBasicMaterial({ vertexColors: true }), 2.6);

/** Ruota (anelli, raggi, mozzo, lampadine): gira attorno all'asse z del gruppo. */
function rotorGeometry(def) {
  const { R, n } = def, solid = [], glow = [];
  for (const s of [-1, 1]) {
    const z = s * WHEEL.RIM_Z;
    const SEG = 32;
    for (let i = 0; i < SEG; i++) {
      const a = ((i + 0.5) / SEG) * Math.PI * 2;
      put(solid, new THREE.BoxGeometry(0.26, (2 * Math.PI * R) / SEG * 1.04, 0.22), STEEL, Math.cos(a) * R, Math.sin(a) * R, z, a);
      const r2 = R * 0.55;
      put(solid, new THREE.BoxGeometry(0.16, (2 * Math.PI * r2) / SEG * 1.06, 0.16), 0xff6fb5, Math.cos(a) * r2, Math.sin(a) * r2, z, a);
      put(glow, new THREE.BoxGeometry(0.16, 0.16, 0.16), BRIGHT[i % BRIGHT.length], Math.cos(a) * (R + 0.2), Math.sin(a) * (R + 0.2), z + s * 0.1);
    }
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 + Math.PI / 16;
      put(solid, new THREE.BoxGeometry(R - 0.5, 0.12, 0.12), STEEL, Math.cos(a) * (R / 2 + 0.25), Math.sin(a) * (R / 2 + 0.25), z, a);
      put(glow, new THREE.BoxGeometry(0.13, 0.13, 0.13), 0xfff1a8, Math.cos(a) * R * 0.78, Math.sin(a) * R * 0.78, z + s * 0.1);
    }
  }
  // perni delle cabine (tra i due anelli) e mozzo
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 - Math.PI / 2;
    put(solid, new THREE.BoxGeometry(0.16, 0.16, WHEEL.RIM_Z * 2 + 0.25), DARK, Math.cos(a) * R, Math.sin(a) * R, 0);
  }
  put(solid, new THREE.CylinderGeometry(0.9, 0.9, 2.5, 12), 0xff5a4e, 0, 0, 0, 0, Math.PI / 2);
  put(glow, new THREE.CylinderGeometry(0.45, 0.45, 2.6, 10), YEL, 0, 0, 0, 0, Math.PI / 2);
  return { solid: mergeGeometries(solid), glow: mergeGeometries(glow) };
}

/** Cabina appesa: l'origine è il perno, la cabina sta sotto (pavimento a -HANG). */
function cabinGeometry(color) {
  const H = WHEEL.HANG, list = [];
  put(list, new THREE.BoxGeometry(1.8, 0.06, 1.5), DARK, 0, -H - 0.03, 0);                // pavimento
  put(list, new THREE.BoxGeometry(1.8, 0.75, 0.06), color, 0, -H + 0.375, 0.72);         // parapetti
  put(list, new THREE.BoxGeometry(1.8, 0.75, 0.06), color, 0, -H + 0.375, -0.72);
  put(list, new THREE.BoxGeometry(0.06, 0.75, 1.38), color, 0.87, -H + 0.375, 0);
  put(list, new THREE.BoxGeometry(0.06, 0.75, 1.38), color, -0.87, -H + 0.375, 0);
  // corrimano: quattro barre sopra i parapetti (dentro la cabina si vede giù)
  put(list, new THREE.BoxGeometry(1.86, 0.07, 0.1), 0xfaf7f0, 0, -H + 0.78, 0.72);
  put(list, new THREE.BoxGeometry(1.86, 0.07, 0.1), 0xfaf7f0, 0, -H + 0.78, -0.72);
  put(list, new THREE.BoxGeometry(0.1, 0.07, 1.36), 0xfaf7f0, 0.87, -H + 0.78, 0);
  put(list, new THREE.BoxGeometry(0.1, 0.07, 1.36), 0xfaf7f0, -0.87, -H + 0.78, 0);
  for (const [x, z] of [[-0.87, -0.72], [0.87, -0.72], [-0.87, 0.72], [0.87, 0.72]]) {
    put(list, new THREE.BoxGeometry(0.07, 1.1, 0.07), 0xfaf7f0, x, -H + 1.35, z);         // montanti
  }
  put(list, new THREE.BoxGeometry(2.0, 0.1, 1.7), color, 0, -H + 1.95, 0);                // tetto
  put(list, new THREE.ConeGeometry(1.3, 0.35, 4), color, 0, -H + 2.17, 0, 0, 0);
  put(list, new THREE.BoxGeometry(0.1, 0.4, 0.1), DARK, 0, -0.2, 0);                       // gancio
  put(list, new THREE.BoxGeometry(1.4, 0.08, 0.4), 0xc98a4a, 0, -H + 0.45, -0.45);         // panca
  return mergeGeometries(list);
}

/** Mesh della ruota e delle cabine: { group, geos, pose(angle) }. */
export function makeWheelVisual(def) {
  const group = new THREE.Group();
  const rotor = new THREE.Group();
  rotor.position.set(def.x, def.y, def.z);
  const { solid, glow } = rotorGeometry(def);
  rotor.add(new THREE.Mesh(solid, solidMat), new THREE.Mesh(glow, lampMat));
  group.add(rotor);
  const geos = [solid, glow], cabins = [];
  for (let k = 0; k < def.n; k++) {
    const g = cabinGeometry(BRIGHT[k % BRIGHT.length]);
    geos.push(g);
    const m = new THREE.Mesh(g, solidMat);
    group.add(m);
    cabins.push(m);
  }
  const tmp = { x: 0, y: 0, z: 0 };
  return {
    group, geos,
    // ruota all'angolo dato; le cabine restano sempre dritte
    pose(angle) {
      rotor.rotation.z = angle;
      for (let k = 0; k < def.n; k++) {
        cabinPivot(def, angle, k, tmp);
        cabins[k].position.set(tmp.x, tmp.y, tmp.z);
      }
    },
  };
}

/** Posizione del perno della cabina k con la ruota all'angolo `angle`. */
export function cabinPivot(def, angle, k, out) {
  const a = angle + (k / def.n) * Math.PI * 2 - Math.PI / 2;
  out.x = def.x + Math.cos(a) * def.R;
  out.y = def.y + Math.sin(a) * def.R;
  out.z = def.z;
  return out;
}

