// Nemici: comparsa, inseguimento, attacco, danni, morte (si sbriciolano in pezzi fisici).
import * as THREE from 'three';
import { scene, camera } from '../core/renderer.js';
import { world, RAPIER, GROUPS, onBeforeStep, contactHandlers, prevSpeed } from '../core/physics.js';
import { thud } from '../core/audio.js';
import { pickables } from '../world/arena.js';
import { player } from '../player/player.js';
import { VARIANTS, MODEL_HEIGHT, buildEnemyModel, animateModel, flashModel } from './model.js';

export const enemies = [];
/** Avvisi verso il gioco: onKill(enemy, headshot), onPlayerHit(damage, x, z) */
export const enemyHooks = { onKill: null, onPlayerHit: null };

let faceSets = [];
export function setFaceSets(sets) { faceSets = sets; }

/* ---------- Barra della vita (in scena, sempre rivolta alla telecamera) ---------- */
const barBgGeo = new THREE.PlaneGeometry(0.72, 0.09);
const barFgGeo = new THREE.PlaneGeometry(0.68, 0.06).translate(0.34, 0, 0);
const barBgMat = new THREE.MeshBasicMaterial({ color: 0x1b2433, transparent: true, opacity: 0.7, depthWrite: false });
const barFgMat = new THREE.MeshBasicMaterial({ color: 0xff5a4e, depthWrite: false });
function makeBar() {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(barBgGeo, barBgMat));
  const fg = new THREE.Mesh(barFgGeo, barFgMat);
  fg.position.set(-0.34, 0, 0.001);
  g.add(fg);
  g.visible = false;
  scene.add(g);
  return { g, fg };
}

/* ---------- Comparsa ---------- */
function spawnPoint() {
  const p = player.pos;
  let best = null;
  for (let i = 0; i < 10; i++) {
    const side = (Math.random() * 4) | 0, along = (Math.random() * 2 - 1) * 26, edge = 27.5;
    const x = side === 0 ? along : side === 1 ? along : side === 2 ? edge : -edge;
    const z = side === 0 ? edge : side === 1 ? -edge : along;
    const d = Math.hypot(x - p.x, z - p.z);
    if (!best || d > best.d) best = { x, z, d };
    if (d > 14) break;
  }
  return best;
}

/**
 * Crea un nemico. opts = { health, speed } valori di base del round (moltiplicati dalla variante).
 */
export function spawnEnemy(variant, opts) {
  const v = VARIANTS[variant];
  const face = faceSets[(Math.random() * faceSets.length) | 0];
  const model = buildEnemyModel(variant, face);
  const half = 0.45 * v.scale, radius = 0.33 * v.scale, centerY = half + radius;
  const sp = spawnPoint();
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic().setTranslation(sp.x, centerY + 0.05, sp.z).lockRotations(),
  );
  const collider = world.createCollider(
    RAPIER.ColliderDesc.capsule(half, radius)
      .setMass(v.mass)
      .setFriction(0)
      .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min)
      .setCollisionGroups(GROUPS.enemy)
      .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
    body,
  );
  const e = {
    variant, v, model, body, collider, centerY,
    health: opts.health * v.health,
    maxHealth: opts.health * v.health,
    speed: Math.min(variant === 'fast' ? 6.5 : 5.5, opts.speed * v.speed),
    damage: v.damage,
    yaw: Math.atan2(-sp.x, -sp.z),
    phase: Math.random() * 6,
    attackT: 0, attackCd: 0.5, hitDone: false,
    stun: 0, flash: 0, spawnT: 0,
    stuckT: 0, detourT: 0, detourSide: 1,
    prev: { x: sp.x, y: centerY, z: sp.z },
    bar: makeBar(),
    dead: false,
  };
  for (const p of model.parts) { p.userData.enemy = e; pickables.push(p); }
  model.group.position.set(sp.x, 0, sp.z);
  model.group.scale.setScalar(0.01);
  scene.add(model.group);
  // Oggetti lanciati o la palla demolitrice fanno male se arrivano veloci
  contactHandlers.set(collider.handle, (other) => {
    const s = prevSpeed(other);
    if (s > 6 && !e.dead) {
      const t = e.body.translation();
      damageEnemy(e, (s - 4) * 9, { x: 0, y: 0.3, z: 0 }, t, false, 0);
    }
  });
  enemies.push(e);
  return e;
}

onBeforeStep(() => {
  for (const e of enemies) {
    const t = e.body.translation();
    e.prev.x = t.x; e.prev.y = t.y; e.prev.z = t.z;
  }
});

/* ---------- Danni e morte ---------- */
/**
 * Infligge danno. dir = direzione del colpo (unitaria), point = punto colpito.
 * impulse = spinta fisica. Restituisce true se il nemico muore.
 */
export function damageEnemy(e, amount, dir, point, headshot, impulse) {
  if (e.dead) return false;
  e.health -= amount;
  e.flash = 0.08;
  flashModel(e.model, true);
  if (impulse > 0) {
    e.body.applyImpulse({ x: dir.x * impulse, y: Math.max(0, dir.y) * impulse * 0.3, z: dir.z * impulse }, true);
    e.stun = Math.max(e.stun, Math.min(0.4, (impulse / e.v.mass) * 0.12));
  }
  if (e.health <= 0) {
    e.dead = true;
    if (enemyHooks.onKill) enemyHooks.onKill(e, headshot);
    crumble(e, dir, Math.max(impulse, 3));
    return true;
  }
  return false;
}

/* I pezzi del nemico morto diventano corpi fisici che rotolano e poi spariscono. */
const debris = [];
const MAX_DEBRIS = 48;
const wp = new THREE.Vector3(), wq = new THREE.Quaternion(), ws = new THREE.Vector3();

function crumble(e, dir, force) {
  removeEnemy(e, false);
  const k = Math.min(9, 2 + force * 0.5);
  e.model.group.updateMatrixWorld(true);
  for (const part of e.model.parts) {
    part.getWorldPosition(wp);
    part.getWorldQuaternion(wq);
    part.getWorldScale(ws);
    const size = part.geometry.userData.size, oy = part.geometry.userData.offsetY;
    // la geometria può essere spostata (gambe/braccia): il centro reale è più in basso
    const center = new THREE.Vector3(0, oy, 0).multiply(ws).applyQuaternion(wq).add(wp);
    part.removeFromParent();
    part.position.copy(center);
    part.quaternion.copy(wq);
    part.scale.copy(ws);
    part.userData.offset = new THREE.Vector3(0, -oy, 0);
    scene.add(part);
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(center.x, center.y, center.z)
        .setRotation({ x: wq.x, y: wq.y, z: wq.z, w: wq.w })
        .setLinvel(dir.x * k + (Math.random() - 0.5) * 3, 2 + Math.random() * 3, dir.z * k + (Math.random() - 0.5) * 3)
        .setAngvel({ x: (Math.random() - 0.5) * 12, y: (Math.random() - 0.5) * 12, z: (Math.random() - 0.5) * 12 }),
    );
    world.createCollider(
      RAPIER.ColliderDesc.cuboid((size[0] * ws.x) / 2, (size[1] * ws.y) / 2, (size[2] * ws.z) / 2)
        .setDensity(1.5).setFriction(0.7).setRestitution(0.2)
        .setCollisionGroups(GROUPS.debris),
      body,
    );
    debris.push({ mesh: part, body, t: 0, s: ws.x });
  }
  scene.remove(e.model.group);
  while (debris.length > MAX_DEBRIS) removeDebris(debris[0]);
  thud(0.3, 110);
}

const offV = new THREE.Vector3();
function updateDebris(dt) {
  for (let i = debris.length - 1; i >= 0; i--) {
    const d = debris[i];
    d.t += dt;
    const p = d.body.translation(), q = d.body.rotation();
    d.mesh.quaternion.set(q.x, q.y, q.z, q.w);
    offV.copy(d.mesh.userData.offset).multiply(d.mesh.scale).applyQuaternion(d.mesh.quaternion);
    d.mesh.position.set(p.x + offV.x, p.y + offV.y, p.z + offV.z);
    if (d.t > 2.6) {
      const f = Math.max(0, 1 - (d.t - 2.6) / 0.5);
      d.mesh.scale.setScalar(d.s * f);
      if (f <= 0) removeDebris(d);
    }
  }
}
function removeDebris(d) {
  const i = debris.indexOf(d);
  if (i >= 0) debris.splice(i, 1);
  world.removeRigidBody(d.body);
  scene.remove(d.mesh);
}

function removeEnemy(e, removeModel = true) {
  const i = enemies.indexOf(e);
  if (i >= 0) enemies.splice(i, 1);
  contactHandlers.delete(e.collider.handle);
  world.removeRigidBody(e.body);
  for (const p of e.model.parts) {
    const k = pickables.indexOf(p);
    if (k >= 0) pickables.splice(k, 1);
    p.material = p.userData.baseMat || p.material;
  }
  scene.remove(e.bar.g);
  if (removeModel) scene.remove(e.model.group);
}

export function clearEnemies() {
  for (let i = enemies.length - 1; i >= 0; i--) removeEnemy(enemies[i]);
  for (let i = debris.length - 1; i >= 0; i--) removeDebris(debris[i]);
}

/* ---------- Intelligenza ---------- */
const pos = [];
export function updateEnemies(dt, alpha, active) {
  updateDebris(dt);
  const pp = player.body.translation();
  for (let i = 0; i < enemies.length; i++) pos[i] = enemies[i].body.translation();

  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i], t = pos[i];
    e.spawnT = Math.min(1, e.spawnT + dt / 0.35);
    let dx = pp.x - t.x, dz = pp.z - t.z;
    const dist = Math.hypot(dx, dz) || 0.001;
    dx /= dist; dz /= dist;
    const reach = 0.95 + 0.33 * e.v.scale;
    const v = e.body.linvel();
    let walk = 0;

    if (active) {
      e.attackCd -= dt;
      if (e.stun > 0) e.stun -= dt;
      else {
        let mx = 0, mz = 0;
        if (dist > reach * 0.8 && player.alive) {
          mx = dx; mz = dz;
          if (e.detourT > 0) {
            // aggira l'ostacolo girando di ~70°
            e.detourT -= dt;
            const c = Math.cos(1.2 * e.detourSide), s = Math.sin(1.2 * e.detourSide);
            const rx = mx * c - mz * s, rz = mx * s + mz * c;
            mx = rx; mz = rz;
          }
        }
        // separazione dagli altri nemici
        for (let j = 0; j < enemies.length; j++) {
          if (j === i) continue;
          const ox = t.x - pos[j].x, oz = t.z - pos[j].z, d2 = ox * ox + oz * oz;
          const min = 0.9 * (e.v.scale + enemies[j].v.scale) * 0.6;
          if (d2 < min * min && d2 > 1e-4) {
            const d = Math.sqrt(d2), f = (min - d) / min;
            mx += (ox / d) * f * 1.5; mz += (oz / d) * f * 1.5;
          }
        }
        const ml = Math.hypot(mx, mz);
        if (ml > 1) { mx /= ml; mz /= ml; }
        const tx = mx * e.speed, tz = mz * e.speed;
        const a = Math.min(1, dt * 8);
        v.x += (tx - v.x) * a;
        v.z += (tz - v.z) * a;
        // bloccato? prova ad aggirare e, se il giocatore è più in alto, salta
        const want = Math.hypot(tx, tz), got = Math.hypot(v.x, v.z);
        const realSpeed = Math.hypot(t.x - e.prev.x, t.z - e.prev.z) * 60;
        if (want > 1 && realSpeed < want * 0.3 && dist > reach) e.stuckT += dt; else e.stuckT = Math.max(0, e.stuckT - dt);
        if (e.stuckT > 0.45) {
          e.stuckT = 0;
          e.detourT = 0.9;
          e.detourSide = Math.random() < 0.5 ? -1 : 1;
          if (Math.abs(v.y) < 0.2) v.y = 5.5;
        }
        e.body.setLinvel(v, true);
        walk = Math.min(1, got / Math.max(1, e.speed));
      }

      // attacco in mischia
      if (e.attackT > 0) {
        e.attackT += dt / 0.5;
        if (!e.hitDone && e.attackT > 0.5) {
          e.hitDone = true;
          if (dist < reach + 0.35 && Math.abs(pp.y - t.y) < 1.6 && player.alive && enemyHooks.onPlayerHit) {
            enemyHooks.onPlayerHit(e.damage, t.x, t.z);
          }
        }
        if (e.attackT >= 1) e.attackT = 0;
      } else if (dist < reach && e.attackCd <= 0 && player.alive) {
        e.attackT = 0.001;
        e.hitDone = false;
        e.attackCd = 1.1;
      }
    }

    // gira la faccia verso il giocatore
    const targetYaw = Math.atan2(dx, dz);
    let dy = targetYaw - e.yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    e.yaw += dy * Math.min(1, dt * 8);
    e.phase += dt * (3 + e.speed * 1.4) * walk;

    if (e.flash > 0) { e.flash -= dt; if (e.flash <= 0) flashModel(e.model, false); }

    // posizione disegnata = interpolazione tra gli ultimi due passi fisici
    const g = e.model.group;
    g.position.set(
      e.prev.x + (t.x - e.prev.x) * alpha,
      e.prev.y + (t.y - e.prev.y) * alpha - e.centerY,
      e.prev.z + (t.z - e.prev.z) * alpha,
    );
    g.rotation.y = e.yaw;
    g.scale.setScalar(e.spawnT < 1 ? 0.2 + 0.8 * e.spawnT : 1);
    animateModel(e.model, e.phase, walk, e.attackT);

    // barra della vita (solo se ferito)
    const b = e.bar;
    b.g.visible = e.health < e.maxHealth;
    if (b.g.visible) {
      b.g.position.set(g.position.x, g.position.y + MODEL_HEIGHT * e.v.scale + 0.25, g.position.z);
      b.g.quaternion.copy(camera.quaternion);
      b.fg.scale.x = Math.max(0.001, e.health / e.maxHealth);
    }

    if (t.y < -10) removeEnemy(e); // caduto fuori dal mondo (non dovrebbe succedere)
  }
}
