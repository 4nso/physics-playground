// Oggetti da raccogliere tra un round e l'altro: munizioni e vita.
import * as THREE from 'three';
import { scene } from '../core/renderer.js';
import { canvasTex } from '../world/materials.js';
import { randomNodeNear } from '../world/nav.js';

const geo = new THREE.BoxGeometry(0.55, 0.4, 0.55);
const ammoTex = canvasTex(64, 64, (g, w, h) => {
  g.fillStyle = '#3f6b2e'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#ffd54a'; g.fillRect(0, h * 0.38, w, h * 0.24);
  g.fillStyle = '#2b2b2b'; for (let i = 0; i < 3; i++) g.fillRect(14 + i * 14, 10, 8, 16);
});
const healthTex = canvasTex(64, 64, (g, w, h) => {
  g.fillStyle = '#f4f4f4'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#e8403a'; g.fillRect(w * 0.4, 10, w * 0.2, h - 20); g.fillRect(10, h * 0.4, w - 20, h * 0.2);
});
const MATS = {
  ammo: new THREE.MeshLambertMaterial({ map: ammoTex, emissive: 0x223311, flatShading: true }),
  health: new THREE.MeshLambertMaterial({ map: healthTex, emissive: 0x331111, flatShading: true }),
};

export const KINDS = ['ammo', 'health'];
const items = [];
let nextId = 0;
/** Avviso quando un giocatore raccoglie qualcosa: onPick(kind, idGiocatore) */
export const pickupHooks = { onPick: null };

function add(id, kind, x, y, z) {
  const m = new THREE.Mesh(geo, MATS[kind]);
  m.position.set(x, y + 0.5, z);
  scene.add(m);
  items.push({ id, kind, m, y, t: Math.random() * 6 });
}

/** Fa comparire munizioni o vita in un punto raggiungibile, non troppo lontano dai giocatori. */
export function spawnPickup(kind) {
  if (items.filter((i) => i.kind === kind).length >= 3) return;
  const p = randomNodeNear(5, 24);
  if (p) add(++nextId, kind, p.x, p.y, p.z);
}

/**
 * collectors = giocatori vivi [{ id, x, y, z }]: chi passa sopra un oggetto lo raccoglie.
 * Senza collectors (client in multiplayer) gli oggetti girano soltanto: decide l'host.
 */
export function updatePickups(dt, collectors) {
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    it.t += dt;
    it.m.rotation.y = it.t * 1.5;
    it.m.position.y = it.y + 0.45 + Math.sin(it.t * 3) * 0.1;
    if (!collectors) continue;
    for (const p of collectors) {
      const dx = it.m.position.x - p.x, dz = it.m.position.z - p.z;
      if (dx * dx + dz * dz < 1.3 * 1.3 && Math.abs(p.y - 0.85 - it.y) < 1.6) {
        scene.remove(it.m);
        items.splice(i, 1);
        if (pickupHooks.onPick) pickupHooks.onPick(it.kind, p.id);
        break;
      }
    }
  }
}

/** Host → client: elenco compatto [[id, tipo, x×100, z×100, y×100], ...] */
export function pickupSnapshot() {
  return items.map((it) => [it.id, KINDS.indexOf(it.kind), Math.round(it.m.position.x * 100), Math.round(it.m.position.z * 100), Math.round(it.y * 100)]);
}
/** Client: allinea gli oggetti a quelli dell'host. */
export function applyPickupSnapshot(list) {
  const seen = new Set(list.map((p) => p[0]));
  for (let i = items.length - 1; i >= 0; i--) {
    if (!seen.has(items[i].id)) { scene.remove(items[i].m); items.splice(i, 1); }
  }
  for (const [id, k, x, z, y] of list) {
    if (!items.some((it) => it.id === id)) add(id, KINDS[k], x / 100, (y || 0) / 100, z / 100);
  }
}

export function clearPickups() {
  for (const it of items) scene.remove(it.m);
  items.length = 0;
}
