// Oggetti da raccogliere tra un round e l'altro: munizioni e vita.
import * as THREE from 'three';
import { scene } from '../core/renderer.js';
import { canvasTex } from '../world/materials.js';
import { player } from '../player/player.js';

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
  ammo: new THREE.MeshStandardMaterial({ map: ammoTex, roughness: 0.7, emissive: 0x223311, flatShading: true }),
  health: new THREE.MeshStandardMaterial({ map: healthTex, roughness: 0.7, emissive: 0x331111, flatShading: true }),
};

const items = [];
/** Avviso quando il giocatore raccoglie qualcosa: onPick(kind) */
export const pickupHooks = { onPick: null };

export function spawnPickup(kind) {
  if (items.filter((i) => i.kind === kind).length >= 3) return;
  const m = new THREE.Mesh(geo, MATS[kind]);
  const a = Math.random() * Math.PI * 2, r = 5 + Math.random() * 15;
  m.position.set(Math.cos(a) * r, 0.5, Math.sin(a) * r);
  m.castShadow = true;
  scene.add(m);
  items.push({ kind, m, t: Math.random() * 6 });
}

export function updatePickups(dt) {
  const p = player.pos;
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    it.t += dt;
    it.m.rotation.y = it.t * 1.5;
    it.m.position.y = 0.45 + Math.sin(it.t * 3) * 0.1;
    const dx = it.m.position.x - p.x, dz = it.m.position.z - p.z;
    if (player.alive && dx * dx + dz * dz < 1.3 * 1.3 && Math.abs(p.y - 0.85) < 1.6) {
      scene.remove(it.m);
      items.splice(i, 1);
      if (pickupHooks.onPick) pickupHooks.onPick(it.kind);
    }
  }
}

export function clearPickups() {
  for (const it of items) scene.remove(it.m);
  items.length = 0;
}
