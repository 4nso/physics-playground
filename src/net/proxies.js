// Client: copie dei nemici, mosse dalle posizioni che manda l'host (che li simula davvero).
import { scene, camera } from '../core/renderer.js';
import { pickables } from '../world/arena.js';
import { buildEnemyModel, animateModel, flashModel, disposeModel, modelTop, fitHead, VARIANTS } from '../enemies/model.js';
import { crumbleModel, updateDebris, clearDebris } from '../enemies/debris.js';
import { makeBar } from '../enemies/enemies.js';

export const VARIANT_KEYS = ['base', 'fast', 'big', 'armored', 'boss'];
const proxies = new Map();
let faceSets = [];
export function setProxyFaces(sets) { faceSets = sets; }

function create(id, vi, fi, x, y, z) {
  const variant = VARIANT_KEYS[vi] || 'base';
  const v = VARIANTS[variant];
  const model = buildEnemyModel(variant, faceSets[fi % Math.max(1, faceSets.length)]);
  const p = { id, v, model, bar: makeBar(), x, y, z, yaw: 0, tx: x, ty: y, tz: z, tyaw: 0, hp: 1, attack: 0, walk: 0, phase: Math.random() * 6, flash: 0, spawnT: 0 };
  for (const part of model.parts) { part.userData.enemyProxy = p; pickables.push(part); }
  scene.add(model.group);
  proxies.set(id, p);
  return p;
}

function remove(p, keepModel) {
  proxies.delete(p.id);
  for (const part of p.model.parts) {
    const k = pickables.indexOf(part);
    if (k >= 0) pickables.splice(k, 1);
  }
  scene.remove(p.bar.g);
  if (!keepModel) { scene.remove(p.model.group); disposeModel(p.model); }
}

/** list = [[id, variante, volto, x, y, z, yaw, vita%, attacco%, camminata%], ...] (posizioni ×100) */
export function applyEnemySnapshot(list) {
  const seen = new Set();
  for (const e of list) {
    const [id, vi, fi] = e;
    const x = e[3] / 100, y = e[4] / 100, z = e[5] / 100;
    let p = proxies.get(id) || create(id, vi, fi, x, y, z);
    seen.add(id);
    p.tx = x; p.ty = y; p.tz = z; p.tyaw = e[6] / 100;
    const hp = e[7] / 100;
    if (hp < p.hp) { p.flash = 0.08; flashModel(p.model, true); }
    p.hp = hp; p.attack = e[8] / 100; p.walk = e[9] / 100;
  }
  for (const p of [...proxies.values()]) if (!seen.has(p.id)) remove(p);
}

/** L'host dice che un nemico è morto: si sbriciola anche qui. */
export function killProxy(id, dx, dz, force) {
  const p = proxies.get(id);
  if (!p) return;
  remove(p, true);
  crumbleModel(p.model, { x: dx, y: 0, z: dz }, force);
}

export function proxyCount() { return proxies.size; }

export function updateProxies(dt) {
  updateDebris(dt);
  const f = 1 - Math.exp(-dt * 12);
  for (const p of proxies.values()) {
    p.spawnT = Math.min(1, p.spawnT + dt / 0.35);
    p.x += (p.tx - p.x) * f; p.y += (p.ty - p.y) * f; p.z += (p.tz - p.z) * f;
    let dy = p.tyaw - p.yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    p.yaw += dy * f;
    p.phase += dt * 6 * p.walk;
    const g = p.model.group;
    g.position.set(p.x, p.y, p.z);
    g.rotation.y = p.yaw;
    g.scale.setScalar(p.spawnT < 1 ? 0.2 + 0.8 * p.spawnT : 1);
    animateModel(p.model, p.phase, p.walk, p.attack, dt, p.hp);
    fitHead(p.model, p.x, p.y, p.z, dt);
    if (p.flash > 0) { p.flash -= dt; if (p.flash <= 0) flashModel(p.model, false); }
    p.bar.g.visible = p.hp < 0.999;
    if (p.bar.g.visible) {
      p.bar.g.position.set(p.x, p.y + modelTop(p.model) + 0.2, p.z);
      p.bar.g.quaternion.copy(camera.quaternion);
      p.bar.fg.scale.x = Math.max(0.001, p.hp);
    }
  }
}

export function clearProxies() {
  for (const p of [...proxies.values()]) remove(p);
  clearDebris();
}

/** Per la minimappa: chiama fn(x, z) per ogni nemico copiato. */
export function forEachProxy(fn) {
  for (const p of proxies.values()) fn(p.model.group.position.x, p.model.group.position.z);
}
