// Generatore del mondo: una griglia di riquadri (stanze ed esterni) decisa da un seed.
// Stesso seed = stessa mappa: l'host in multiplayer manda solo il numero.
import * as THREE from 'three';
import { scene } from '../core/renderer.js';
import { world, RAPIER } from '../core/physics.js';
import { makeRng } from './rng.js';
import { Builder, SKIP } from './builder.js';
import { TYPES, BUILDERS, TILE, DOOR0, DOOR1, FENCE_H } from './rooms.js';
import { buildNav } from './nav.js';

export const GRID = 6;                 // riquadri per lato
const HALF = (GRID * TILE) / 2;        // la mappa va da -HALF a +HALF
const START = [2, 2];                  // riquadro di partenza (la piazza)
const OUTER_H = 8;                     // altezza del muro di confine
const DOOR_H = 2.7;

/** Stato della mappa attuale. */
export const map = {
  seed: 0,
  tiles: [],         // [{ i, j, type, ox, oz }]
  props: [],         // oggetti fisici da creare: { kind, x, y, z, size | r }
  wreck: null,       // { ax, ay, az } aggancio della palla demolitrice
  spawn: { x: 0, y: 0, z: 0, yaw: 0 },
  bounds: { minX: -HALF, minZ: -HALF, maxX: HALF, maxZ: HALF },
  walls: [],         // rettangoli dei muri per la minimappa [x0, z0, x1, z1]
};
/** Corpo fisso a cui è appesa la palla demolitrice. */
export let wreckAnchor = null;
/** Collider statico (handle) → superficie, per gli effetti dei colpi. */
export const staticSurface = new Map();

const worldMat = new THREE.MeshBasicMaterial({ vertexColors: true });
const waterMat = new THREE.MeshBasicMaterial({ color: 0x4fb8e0, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide });
let built = [];        // mesh in scena
let staticBody = null;

/* ---------- Disposizione (solo dati, deterministica) ---------- */
const WEIGHTS = [['corridoi', 0.3], ['uffici', 0.2], ['piscina', 0.12], ['parcheggio', 0.16], ['parco', 0.22]];
function pickType(rng) {
  let x = rng.next() * WEIGHTS.reduce((s, w) => s + w[1], 0);
  for (const [t, w] of WEIGHTS) { x -= w; if (x <= 0) return t; }
  return 'corridoi';
}

export function layout(seed) {
  const rng = makeRng(seed);
  const types = [];
  for (let j = 0; j < GRID; j++) for (let i = 0; i < GRID; i++) {
    let t = i === START[0] && j === START[1] ? 'piazza' : pickType(rng);
    // niente due piscine vicine
    if (t === 'piscina' && ((i > 0 && types[j * GRID + i - 1] === 'piscina') || (j > 0 && types[(j - 1) * GRID + i] === 'piscina'))) t = 'corridoi';
    types.push(t);
  }
  // collegamenti: albero casuale (tutto raggiungibile) + passaggi in più per fare dei giri
  const parent = types.map((_, k) => k);
  const find = (k) => (parent[k] === k ? k : (parent[k] = find(parent[k])));
  const edges = [];
  for (let j = 0; j < GRID; j++) for (let i = 0; i < GRID; i++) {
    if (i < GRID - 1) edges.push({ a: j * GRID + i, b: j * GRID + i + 1, dir: 'x', i, j });
    if (j < GRID - 1) edges.push({ a: j * GRID + i, b: (j + 1) * GRID + i, dir: 'z', i, j });
  }
  rng.shuffle(edges);
  for (const e of edges) {
    const outA = !TYPES[types[e.a]].indoor, outB = !TYPES[types[e.b]].indoor;
    if (find(e.a) !== find(e.b)) { parent[find(e.a)] = find(e.b); e.kind = 'door'; }
    else e.kind = rng.chance(0.4) ? 'door' : 'wall';
    if (e.kind === 'door' && outA && outB && rng.chance(0.55)) e.kind = 'open';
  }
  return { types, edges, rng };
}

/* ---------- Costruzione ---------- */
function clearWorld() {
  for (const m of built) { scene.remove(m); m.geometry.dispose(); }
  built = [];
  if (staticBody) world.removeRigidBody(staticBody);
  if (wreckAnchor) world.removeRigidBody(wreckAnchor);
  staticBody = wreckAnchor = null;
  staticSurface.clear();
}

const wallH = (t) => (TYPES[t].indoor ? TYPES[t].H + 0.3 : FENCE_H);
/** Colore del lato di un muro visto dal riquadro `t` (con `o` dall'altra parte). */
function sideColor(t, o) {
  if (TYPES[t].indoor) return TYPES[t].wall;
  if (o && TYPES[o].indoor) return TYPES[o].facade;
  return TYPES[t].wall;
}

/**
 * Un muro sul bordo tra due riquadri, diviso in due metà (una per lato) così ogni lato ha il suo colore.
 * axis 'x': muro lungo z alla coordinata x = pos, da z = from a z = from + TILE.
 */
function edgeWall(b, axis, pos, from, kind, h, sides) {
  const t = 0.15;
  const segs = kind === 'wall' ? [[0, TILE, 0, h]] : [[0, DOOR0, 0, h], [DOOR1, TILE, 0, h]];
  if (kind === 'door' && h > DOOR_H) segs.push([DOOR0, DOOR1, DOOR_H, h]);
  for (let s = 0; s < 2; s++) {
    const side = sides[s];
    if (!side) continue;
    b.chunk(side.key);
    for (const [a0, a1, y0, y1] of segs) {
      if (axis === 'x') {
        const x0 = s === 0 ? pos - t : pos, x1 = s === 0 ? pos : pos + t;
        b.box(x0, y0, from + a0, x1, y1, from + a1, side.col, { skip: SKIP.BOTTOM });
      } else {
        const z0 = s === 0 ? pos - t : pos, z1 = s === 0 ? pos : pos + t;
        b.box(from + a0, y0, z0, from + a1, y1, z1, side.col, { skip: SKIP.BOTTOM });
      }
    }
  }
}

/** Costruisce (o ricostruisce) il mondo per questo seed. */
export function buildWorld(seed) {
  clearWorld();
  const { types, edges } = layout(seed);
  const b = new Builder();
  Object.assign(map, { seed, tiles: [], props: [], wreck: null, walls: [] });

  // 1. riquadri
  for (let j = 0; j < GRID; j++) for (let i = 0; i < GRID; i++) {
    const type = types[j * GRID + i];
    const ox = -HALF + i * TILE, oz = -HALF + j * TILE;
    // ogni riquadro ha il suo generatore di numeri, così cambiarne uno non sposta gli altri
    const ctx = { b, ox, oz, rng: makeRng(seed * 31 + j * GRID + i + 7), props: map.props, wreck: null, spawn: null };
    b.chunk(j * GRID + i);
    BUILDERS[type](ctx);
    if (ctx.wreck) map.wreck = ctx.wreck;
    if (ctx.spawn) map.spawn = ctx.spawn;
    map.tiles.push({ i, j, type, ox, oz });
  }

  // 2. muri tra i riquadri
  for (const e of edges) {
    const ta = types[e.a], tb = types[e.b];
    if (e.kind === 'open') continue;
    const h = Math.max(wallH(ta), wallH(tb));
    const sides = [{ key: e.a, col: sideColor(ta, tb) }, { key: e.b, col: sideColor(tb, ta) }];
    if (e.dir === 'x') edgeWall(b, 'x', -HALF + (e.i + 1) * TILE, -HALF + e.j * TILE, e.kind, h, sides);
    else edgeWall(b, 'z', -HALF + (e.j + 1) * TILE, -HALF + e.i * TILE, e.kind, h, sides);
  }
  // muro di confine (alto, così non si esce)
  for (let k = 0; k < GRID; k++) {
    const north = types[k], south = types[(GRID - 1) * GRID + k], west = types[k * GRID], east = types[k * GRID + GRID - 1];
    const from = -HALF + k * TILE;
    edgeWall(b, 'z', -HALF, from, 'wall', OUTER_H, [{ key: 'outer', col: 0x6d6a66 }, { key: k, col: sideColor(north) }]);
    edgeWall(b, 'z', HALF, from, 'wall', OUTER_H, [{ key: (GRID - 1) * GRID + k, col: sideColor(south) }, { key: 'outer', col: 0x6d6a66 }]);
    edgeWall(b, 'x', -HALF, from, 'wall', OUTER_H, [{ key: 'outer', col: 0x6d6a66 }, { key: k * GRID, col: sideColor(west) }]);
    edgeWall(b, 'x', HALF, from, 'wall', OUTER_H, [{ key: k * GRID + GRID - 1, col: sideColor(east) }, { key: 'outer', col: 0x6d6a66 }]);
  }
  // pilastrini agli incroci dei muri (chiudono i buchi negli angoli)
  b.chunk('outer');
  for (let j = 0; j <= GRID; j++) for (let i = 0; i <= GRID; i++) {
    const x = -HALF + i * TILE, z = -HALF + j * TILE;
    const edge = i === 0 || j === 0 || i === GRID || j === GRID;
    let h = edge ? OUTER_H : 0;
    for (const [di, dj] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) {
      const ii = i + di, jj = j + dj;
      if (ii >= 0 && jj >= 0 && ii < GRID && jj < GRID) h = Math.max(h, wallH(types[jj * GRID + ii]));
    }
    b.box(x - 0.2, 0, z - 0.2, x + 0.2, h + 0.05, z + 0.2, 0x8a857c, { skip: SKIP.BOTTOM });
  }
  // pavimento di sicurezza sotto tutto (invisibile)
  b.box(-HALF - 5, -3, -HALF - 5, HALF + 5, -2.5, HALF + 5, 0, { visible: false, nav: false });

  // 3. mesh unite: una per riquadro
  for (const ch of b.chunks.values()) {
    if (!ch.pos.length) continue;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(ch.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(ch.col, 3));
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, worldMat);
    m.matrixAutoUpdate = false;
    scene.add(m);
    built.push(m);
  }
  if (b.water.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(b.water, 3));
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, waterMat);
    m.renderOrder = 2;
    scene.add(m);
    built.push(m);
  }

  // 4. fisica: un solo corpo fisso con tutti i collider
  staticBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  for (const c of b.colliders) {
    const d = RAPIER.ColliderDesc.cuboid(c.hx, c.hy, c.hz).setTranslation(c.x, c.y, c.z).setFriction(0.5);
    if (c.q) d.setRotation({ x: c.q.x, y: c.q.y, z: c.q.z, w: c.q.w });
    const col = world.createCollider(d, staticBody);
    staticSurface.set(col.handle, c.surface);
  }
  const w = map.wreck;
  if (w) wreckAnchor = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(w.ax, w.ay, w.az));

  // minimappa: tutto ciò che è alto e poggia a terra (muri, pilastri, divisori) e le rampe
  map.walls = b.shapes.filter((s) => s.k === 0 && s.y0 < 0.5 && s.y1 > 1.2 && s.y1 - s.y0 < 20).map((s) => [s.x0, s.z0, s.x1, s.z1]);
  map.ramps = b.shapes.filter((s) => s.k === 1).map((s) => [s.x0, s.z0, s.x1, s.z1]);
  map.decks = b.shapes.filter((s) => s.k === 0 && s.y0 > 1.5 && s.y1 < 4 && (s.x1 - s.x0) * (s.z1 - s.z0) > 8).map((s) => [s.x0, s.z0, s.x1, s.z1]);

  // 5. navigazione
  const t0 = performance.now();
  buildNav(b.shapes, map.bounds, { x: map.spawn.x, y: map.spawn.y + 0.05, z: map.spawn.z });
  map.navMs = Math.round(performance.now() - t0);
  map.triangles = built.reduce((s, m) => s + m.geometry.attributes.position.count / 3, 0);
  return map;
}

/** Nome del tipo di riquadro in un punto (per la minimappa e i messaggi). */
export function tileAt(x, z) {
  const i = Math.floor((x + HALF) / TILE), j = Math.floor((z + HALF) / TILE);
  if (i < 0 || j < 0 || i >= GRID || j >= GRID) return null;
  return map.tiles[j * GRID + i];
}
