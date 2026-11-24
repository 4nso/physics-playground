// Generatore del mondo: tre zone tematiche (parcheggio multipiano, luna park, backrooms)
// i cui dettagli dipendono da un seed. Stesso seed = stessa mappa: l'host in multiplayer manda solo il numero.
import * as THREE from 'three';
import { scene } from '../core/renderer.js';
import { world, RAPIER } from '../core/physics.js';
import { makeRng } from './rng.js';
import { Builder } from './builder.js';
import { buildZones, ZONES, Z0, Z1 } from './zones.js';
import { buildNav } from './nav.js';
import { buildSigns, clearSigns } from './signs.js';
import { buildRideVisuals, clearRideVisuals } from './rideVisuals.js';
import { worldMat, aoMat, waterMat } from './worldMaterial.js';
import { clearDecals } from './decals.js';
import { buildUnderVisuals, clearUnderVisuals, underZoneAt, EXTRA, GATE_Z } from './underground.js';

/** Stato della mappa attuale. */
export const map = {
  seed: 0,
  zones: ZONES,
  props: [],         // oggetti fisici da creare: { kind, x, y, z, size | r }
  wreck: null,       // { ax, ay, az } aggancio della palla demolitrice
  spawn: { x: 0, y: 0, z: 0, yaw: 0 },
  bounds: { minX: ZONES[0].x0, minZ: Z0, maxX: ZONES[ZONES.length - 1].x1, maxZ: Z1 },
  walls: [],         // rettangoli per la minimappa [x0, z0, x1, z1]
  extraWalls: [],    // lo stesso per l'area dietro il cancello EXIT (tunnel, sala, cripta, cimitero)
  extra: EXTRA,      // rettangolo dell'area dietro il cancello EXIT
  ramps: [],
  safeZones: [],    // zone sicure { x0, z0, x1, z1, door } (vedi world/safezone.js)
  boxes: [],        // casse misteriose
  upgraders: [],    // potenziatori
  safeSigns: [],
  rides: [],        // giostre: { kind, x, y, z, R, n, ctrl, exitZ, plat } (vedi world/wheel.js, game/rides.js)
  ammoStalls: [],   // bancarelle delle munizioni: { x, z, fx, fz, ux, uz } (world/lunapark.js)
  shops: [],        // negozi: { x, z, y, fx, fz, signX, signY, signZ } (vedi world/shop.js)
};
/** Corpo fisso a cui è appesa la palla demolitrice. */
export let wreckAnchor = null;
/** Collider statico (handle) → superficie, per gli effetti dei colpi. */
export const staticSurface = new Map();
/** Collider statici invisibili (barriere, piattaforme nascoste): niente fori dei proiettili sopra. */
export const hiddenColliders = new Set();

/** Strisce d'ombra morbida (si vedono solo in qualità Media e Alta, vedi setWorldAO). */
let aoMesh = null, aoOn = true;
export function setWorldAO(on) { aoOn = on; if (aoMesh) aoMesh.visible = on; }
let built = [];        // mesh in scena
let staticBody = null;

function clearWorld() {
  for (const m of built) { scene.remove(m); m.geometry.dispose(); }
  built = [];
  aoMesh = null;
  if (staticBody) world.removeRigidBody(staticBody);
  if (wreckAnchor) world.removeRigidBody(wreckAnchor);
  staticBody = wreckAnchor = null;
  staticSurface.clear();
  hiddenColliders.clear();
  clearSigns();
  clearDecals();
  clearRideVisuals();
  clearUnderVisuals();
}

/** Costruisce (o ricostruisce) il mondo per questo seed. */
export function buildWorld(seed) {
  clearWorld();
  const b = new Builder();
  const ctx = { props: [], wreck: null, spawn: null, shops: [], safeZones: [], boxes: [], upgraders: [], safeSigns: [], signs: [], rides: [] };
  buildZones(b, makeRng(seed), ctx);
  Object.assign(map, { seed, props: ctx.props, wreck: ctx.wreck, spawn: ctx.spawn, shops: ctx.shops, safeZones: ctx.safeZones, boxes: ctx.boxes, upgraders: ctx.upgraders, safeSigns: ctx.safeSigns, secretZ: ctx.secretZ, rides: ctx.rides, fountain: ctx.fountain || null, ammoStalls: ctx.ammoStalls || [] });

  // mesh unite: una per blocco da 12×12 m (quelle fuori dalla visuale non si disegnano)
  for (const ch of b.chunks.values()) {
    if (!ch.pos.length) continue;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(ch.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(ch.col, 3));
    g.setAttribute('glow', new THREE.Float32BufferAttribute(ch.glow, 1));
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, worldMat);
    m.matrixAutoUpdate = false;
    m.receiveShadow = true; // ombre degli oggetti che si muovono (solo in qualità Alta)
    scene.add(m);
    built.push(m);
  }

  if (b.water.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(b.water, 3));
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, waterMat);
    m.matrixAutoUpdate = false;
    m.renderOrder = 2;
    scene.add(m);
    built.push(m);
  }

  const ao = b.aoStrips();
  if (ao.pos.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(ao.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(ao.col, 3));
    g.computeBoundingSphere();
    aoMesh = new THREE.Mesh(g, aoMat);
    aoMesh.matrixAutoUpdate = false;
    aoMesh.frustumCulled = false;
    aoMesh.renderOrder = 1; // dopo il pavimento
    aoMesh.visible = aoOn;
    scene.add(aoMesh);
    built.push(aoMesh);
  }
  map.aoTriangles = ao.pos.length / 9;

  buildSigns(ctx.signs); // scritte delle insegne (luna park)
  buildRideVisuals(ctx.rides); // parti mobili delle giostre (la logica è in game/rides.js)
  buildUnderVisuals(ctx.under); // lampade e candele dietro il cancello EXIT

  // fisica: un solo corpo fisso con tutti i collider
  staticBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  for (const c of b.colliders) {
    const d = RAPIER.ColliderDesc.cuboid(c.hx, c.hy, c.hz).setTranslation(c.x, c.y, c.z).setFriction(0.5);
    if (c.q) d.setRotation({ x: c.q.x, y: c.q.y, z: c.q.z, w: c.q.w });
    if (c.groups) d.setCollisionGroups(c.groups);
    const col = world.createCollider(d, staticBody);
    staticSurface.set(col.handle, c.surface);
    if (c.hidden) hiddenColliders.add(col.handle);
  }
  const w = map.wreck;
  if (w) wreckAnchor = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(w.ax, w.ay, w.az));

  // minimappa: tutto ciò che è alto e poggia a terra (muri, pilastri) e le rampe
  const extra = (s) => s.z0 > GATE_Z + 0.1; // dietro il cancello EXIT: si mostra solo quando è aperto
  map.walls = b.shapes.filter((s) => s.k === 0 && !extra(s) && s.y0 < 0.5 && s.y1 > 1.2 && s.y1 - s.y0 < 20).map((s) => [s.x0, s.z0, s.x1, s.z1]);
  map.ramps = b.shapes.filter((s) => s.k === 1 && !extra(s) && Math.abs(s.h1 - s.h0) > 2).map((s) => [s.x0, s.z0, s.x1, s.z1]);
  // area nuova: muri (anche sotto terra) e scale
  map.extraWalls = b.shapes.filter((s) => s.k === 0 && extra(s) && s.y1 - s.y0 > 1.2 && s.y1 - s.y0 < 20).map((s) => [s.x0, s.z0, s.x1, s.z1]);

  // navigazione dei nemici
  const t0 = performance.now();
  // la navigazione copre anche l'area dietro il cancello EXIT (col cancello chiuso il varco è tagliato)
  const nb = map.bounds;
  buildNav(b.shapes, { minX: nb.minX, minZ: nb.minZ, maxX: nb.maxX, maxZ: EXTRA.maxZ }, { x: map.spawn.x, y: map.spawn.y + 0.05, z: map.spawn.z }, GATE_Z);
  map.navMs = Math.round(performance.now() - t0);
  map.triangles = built.filter((m) => m !== aoMesh).reduce((s, m) => s + m.geometry.attributes.position.count / 3, 0);
  map.chunks = built.length;
  return map;
}

/** true se il punto è dentro una zona sicura (i nemici non entrano). */
export function inSafeZone(x, z) {
  for (const s of map.safeZones) if (x > s.x0 && x < s.x1 && z > s.z0 && z < s.z1) return true;
  return false;
}

/** Zona in un punto (per la minimappa e i messaggi). Con z (e y = piedi) riconosce anche tunnel, sala, cripta, cimitero. */
export function zoneAt(x, z = 0, y = 0) {
  if (z > GATE_Z) { const u = underZoneAt(x, y, z); if (u) return u; }
  return ZONES.find((zn) => x >= zn.x0 && x < zn.x1) || null;
}
