// Azioni del giocatore: afferrare, lanciare, esplosione, nuova cassa.
import * as THREE from 'three';
import { scene, camera } from '../core/renderer.js';
import { thud, boomSound } from '../core/audio.js';
import { pickables } from '../world/arena.js';
import { objects, hooks, makeCrate } from '../world/objects.js';
import { shotFilter } from '../weapons/weapons.js';
import { sphereGeo } from '../world/materials.js';
import { player, pushPlayer } from './player.js';
import { hud } from '../ui/hud.js';

const camDir = new THREE.Vector3();
const raycaster = new THREE.Raycaster();
const center = new THREE.Vector2(0, 0);

export function aim(maxDist) {
  raycaster.setFromCamera(center, camera);
  raycaster.far = maxDist;
  const hits = raycaster.intersectObjects(pickables, false);
  return hits.length ? hits[0] : null;
}

let held = null, holdDist = 2.6;
export const isHolding = () => !!held;

function setHeld(o) {
  held = o;
  shotFilter.ignore = o ? o.mesh : null;
  hud.setHolding(!!o);
}
hooks.onRemove = (o) => {
  if (held === o) setHeld(null);
};
export function dropHeld() { setHeld(null); }

export function toggleGrab() {
  if (held) { setHeld(null); return; }
  const h = aim(7);
  if (h && h.object.userData.obj) {
    const o = h.object.userData.obj;
    setHeld(o);
    holdDist = Math.max(1.8, Math.min(3.5, h.distance + 0.3));
    o.body.wakeUp();
  }
}

/** Se teniamo un oggetto lo lancia e restituisce true; altrimenti non fa nulla. */
export function throwHeld() {
  if (!held) return false;
  camera.getWorldDirection(camDir);
  const b = held.body, s = held.kind === 'wreck' ? 8 : 16;
  b.setLinvel({ x: camDir.x * s, y: camDir.y * s + 1.5, z: camDir.z * s }, true);
  b.setAngvel({ x: Math.random() * 6 - 3, y: Math.random() * 6 - 3, z: Math.random() * 6 - 3 }, true);
  setHeld(null);
  thud(0.15, 200);
  return true;
}

export function spawnCrate() {
  camera.getWorldDirection(camDir);
  const h = aim(4);
  const d = h ? Math.max(1.4, h.distance - 0.8) : 3;
  const p = camera.position;
  makeCrate(p.x + camDir.x * d, Math.max(0.6, p.y + camDir.y * d + 0.3), p.z + camDir.z * d, 1, player.yaw);
}

/** Mentre teniamo un oggetto, lo tiriamo verso un punto davanti alla telecamera. */
export function updateHeld() {
  if (!held) return;
  camera.getWorldDirection(camDir);
  const b = held.body, p = camera.position, bp = b.translation();
  const tx = p.x + camDir.x * holdDist, ty = Math.max(0.35, p.y + camDir.y * holdDist), tz = p.z + camDir.z * holdDist;
  const dx = tx - bp.x, dy = ty - bp.y, dz = tz - bp.z;
  if (Math.hypot(dx, dy, dz) > 6) { setHeld(null); return; }
  const k = 12;
  let vx = dx * k, vy = dy * k, vz = dz * k;
  const sp = Math.hypot(vx, vy, vz);
  if (sp > 20) { vx *= 20 / sp; vy *= 20 / sp; vz *= 20 / sp; }
  b.setLinvel({ x: vx, y: vy, z: vz }, true);
  const av = b.angvel();
  b.setAngvel({ x: av.x * 0.85, y: av.y * 0.85, z: av.z * 0.85 }, true);
}

/* ---------- Esplosione ---------- */
const fx = [];
const boomLight = new THREE.PointLight(0xffaa44, 0, 18, 1);
scene.add(boomLight);

export function boom() {
  camera.getWorldDirection(camDir);
  const h = aim(40);
  const p = h ? h.point.clone() : camera.position.clone().addScaledVector(camDir, 15);
  const R = 6;
  const push = (pos, strength, apply) => {
    const dx = pos.x - p.x, dy = pos.y - p.y, dz = pos.z - p.z;
    const dist = Math.hypot(dx, dy, dz);
    if (dist > R) return;
    const k = (1 - dist / R) * strength;
    const len = Math.hypot(dx, dy + 0.8, dz) || 1;
    apply((dx / len) * k, ((dy + 0.8) / len) * k, (dz / len) * k);
  };
  for (const o of objects) {
    const b = o.body;
    push(b.translation(), 14, (x, y, z) => {
      const v = b.linvel(), av = b.angvel();
      b.setLinvel({ x: v.x + x, y: v.y + y, z: v.z + z }, true);
      b.setAngvel({ x: av.x + Math.random() * 10 - 5, y: av.y, z: av.z + Math.random() * 10 - 5 }, true);
    });
  }
  push(player.body.translation(), 9, pushPlayer);

  const m = new THREE.Mesh(sphereGeo, new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.85, depthWrite: false }));
  m.position.copy(p);
  m.scale.setScalar(0.1);
  scene.add(m);
  fx.push({ m, t: 0 });
  boomLight.position.copy(p);
  boomLight.intensity = 30;
  player.shake = Math.max(0, 0.35 - camera.position.distanceTo(p) * 0.015);
  boomSound();
}

export function updateFx(dt) {
  for (let i = fx.length - 1; i >= 0; i--) {
    const e = fx[i];
    e.t += dt;
    e.m.scale.setScalar(0.3 + e.t * 14);
    e.m.material.opacity = Math.max(0, 0.85 - e.t * 2.4);
    if (e.t > 0.4) { scene.remove(e.m); e.m.material.dispose(); fx.splice(i, 1); }
  }
  boomLight.intensity = Math.max(0, boomLight.intensity - dt * 100);
}

/** Aggiorna il mirino: giallo se c'è qualcosa da afferrare. */
export function updateCrosshair() {
  if (held) return;
  const h = aim(7);
  hud.setCanGrab(!!(h && h.object.userData.obj));
}
