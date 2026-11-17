// Azioni del giocatore con gli oggetti: afferrare e lanciare (casse, palloni, palla demolitrice).
import * as THREE from 'three';
import { camera } from '../core/renderer.js';
import { thud } from '../core/audio.js';
import { pickables } from '../world/arena.js';
import { hooks } from '../world/objects.js';
import { shotFilter } from '../weapons/weapons.js';
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

function setHeld(o) {
  held = o;
  shotFilter.ignore = o ? o.mesh : null;
  hud.setHolding(!!o);
}
hooks.onRemove = (o) => { if (held === o) setHeld(null); };
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
  const b = held.body, s = held.kind === 'wreck' ? 8 : 18;
  b.setLinvel({ x: camDir.x * s, y: camDir.y * s + 1.5, z: camDir.z * s }, true);
  b.setAngvel({ x: Math.random() * 6 - 3, y: Math.random() * 6 - 3, z: Math.random() * 6 - 3 }, true);
  setHeld(null);
  thud(0.15, 200);
  return true;
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

/** Aggiorna il mirino: giallo se c'è qualcosa da afferrare. */
export function updateCrosshair() {
  if (held) return;
  const h = aim(7);
  hud.setCanGrab(!!(h && h.object.userData.obj));
}
