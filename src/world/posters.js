// Manifesti "RICERCATO" con le facce della galleria, appesi qua e là sui muri della mappa.
// Le posizioni vengono dal seed della mappa (uguali per tutti in multiplayer): si cercano punti
// di passaggio vicini a un muro e si appende il foglio sul muro, all'altezza degli occhi.
import * as THREE from 'three';
import { scene } from '../core/renderer.js';
import { world, RAPIER, onBeforeStep } from '../core/physics.js';
import { nav } from './nav.js';
import { map, inSafeZone, zoneAt } from './map.js';
import { makeRng } from './rng.js';
import { drawPoster } from '../faces/poster.js';

const PER_ZONE = 5;          // manifesti per zona (parcheggio, parco, backrooms)
const MIN_GAP = 7;           // distanza minima tra due manifesti
const geo = new THREE.PlaneGeometry(0.96, 1.28);
const ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 });
const ONLY_STATIC = RAPIER.QueryFilterFlags.EXCLUDE_DYNAMIC | RAPIER.QueryFilterFlags.EXCLUDE_KINEMATIC;
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

let meshes = [], mats = [];

export function clearPosters() {
  for (const m of meshes) scene.remove(m);
  for (const m of mats) { m.map.dispose(); m.dispose(); }
  meshes = []; mats = [];
}

/** Un punto su un muro vicino al nodo di navigazione a, o null. */
function wallSpot(a, rng) {
  const x = nav.x[a], y = nav.y[a] + 1.7, z = nav.z[a];
  const start = rng.int(4);
  for (let k = 0; k < 4; k++) {
    const [dx, dz] = DIRS[(start + k) % 4];
    ray.origin.x = x; ray.origin.y = y; ray.origin.z = z;
    ray.dir.x = dx; ray.dir.y = 0; ray.dir.z = dz;
    const hit = world.castRayAndGetNormal(ray, 1.6, true, ONLY_STATIC);
    if (!hit) continue;
    const n = hit.normal;
    if (Math.abs(n.y) > 0.1 || Math.abs(n.x * dx + n.z * dz) < 0.95) continue; // solo muri dritti, di fronte
    const d = hit.timeOfImpact;
    const px = x + dx * d, pz = z + dz * d;
    // niente manifesti sulla barriera invisibile della zona sicura né sul passaggio segreto (muro est)
    if (inSafeZone(px - dx * 0.6, pz - dz * 0.6) || inSafeZone(px + dx * 0.6, pz + dz * 0.6) || px > map.bounds.maxX - 0.5) continue;
    // il muro deve esserci anche ai lati del foglio (non uno spigolo o un pilastro sottile)
    let ok = true;
    for (const s of [-0.55, 0.55]) {
      ray.origin.x = x - dz * s; ray.origin.z = z + dx * s;
      const h2 = world.castRay(ray, d + 0.15, true, ONLY_STATIC);
      if (!h2 || Math.abs(h2.timeOfImpact - d) > 0.08) { ok = false; break; }
    }
    if (!ok) continue;
    return { x: px + n.x * 0.025, y, z: pz + n.z * 0.025, nx: n.x, nz: n.z };
  }
  return null;
}

/*
 * I muri appena costruiti diventano "visibili" ai raggi solo dopo un passo della fisica:
 * per questo i manifesti si appendono poco dopo l'inizio della partita.
 */
let pending = null, steps = 0;
export function placePosters(faceSets) {
  clearPosters();
  pending = faceSets;
  steps = 0;
}
onBeforeStep(() => {
  if (!pending || ++steps < 2) return;
  const sets = pending;
  pending = null;
  hangPosters(sets);
});

/**
 * Appende i manifesti. faceSets = volti della partita: si usano quelli veri (con o senza nome);
 * se la galleria è vuota, le facce disegnate dal gioco.
 */
function hangPosters(faceSets) {
  clearPosters();
  if (!nav.ready || !nav.aliveList || !faceSets.length) return;
  const real = faceSets.filter((s) => !s.procedural);
  const faces = real.length ? real : faceSets;
  // un materiale per volto (i manifesti con la stessa faccia lo condividono)
  const matOf = new Map();
  const mat = (set, i) => {
    if (!matOf.has(set)) {
      const map2 = new THREE.CanvasTexture(drawPoster(set.canvas, set.name, set.name ? 'Pericoloso. Sparagli a vista' : '', i + 11, 256));
      map2.colorSpace = THREE.SRGBColorSpace;
      map2.anisotropy = 4;
      const m = new THREE.MeshBasicMaterial({ map: map2 });
      mats.push(m);
      matOf.set(set, m);
    }
    return matOf.get(set);
  };
  const rng = makeRng(map.seed * 31 + 7);
  const L = nav.aliveList, placed = [];
  const perZone = new Map();
  let n = 0;
  for (let tries = 0; tries < 900 && placed.length < PER_ZONE * map.zones.length; tries++) {
    const a = L[rng.int(L.length)];
    if (!nav.near[a]) continue;
    const zone = zoneAt(nav.x[a]);
    if (!zone || (perZone.get(zone.id) || 0) >= PER_ZONE) continue;
    if (placed.some((p) => Math.hypot(p.x - nav.x[a], p.z - nav.z[a]) < MIN_GAP)) continue;
    const spot = wallSpot(a, rng);
    if (!spot) continue;
    const set = faces[n % faces.length];
    const m = new THREE.Mesh(geo, mat(set, n));
    m.position.set(spot.x, spot.y, spot.z);
    m.rotation.set(0, Math.atan2(spot.nx, spot.nz), (rng.next() - 0.5) * 0.12);
    m.updateMatrix();
    m.matrixAutoUpdate = false;
    scene.add(m);
    meshes.push(m);
    placed.push(spot);
    perZone.set(zone.id, (perZone.get(zone.id) || 0) + 1);
    n++;
  }
}
