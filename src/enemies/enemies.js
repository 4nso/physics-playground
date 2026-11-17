// Nemici: comparsa, inseguimento, attacco, danni, morte (si sbriciolano in pezzi fisici).
import * as THREE from 'three';
import { scene, camera } from '../core/renderer.js';
import { world, RAPIER, GROUPS, onBeforeStep, contactHandlers, prevSpeed } from '../core/physics.js';
import { pickables } from '../world/arena.js';
import { updateFields, nodeAt, steer, findSpawn } from '../world/nav.js';
import { VARIANTS, MODEL_HEIGHT, buildEnemyModel, animateModel, flashModel } from './model.js';
import { crumbleModel, updateDebris, clearDebris } from './debris.js';
import { speedFor } from '../game/difficulty.js';
import { WALK_SPEED } from '../player/player.js';

export const enemies = [];
/** Avvisi verso il gioco: onKill(enemy, headshot, dir, force), onPlayerHit(damage, x, z, targetId) */
export const enemyHooks = { onKill: null, onPlayerHit: null };

let faceSets = [];
let nextId = 0;
export function setFaceSets(sets) { faceSets = sets; }

/* ---------- Barra della vita (in scena, sempre rivolta alla telecamera) ---------- */
const barBgGeo = new THREE.PlaneGeometry(0.72, 0.09);
const barFgGeo = new THREE.PlaneGeometry(0.68, 0.06).translate(0.34, 0, 0);
const barBgMat = new THREE.MeshBasicMaterial({ color: 0x1b2433, transparent: true, opacity: 0.7, depthWrite: false });
const barFgMat = new THREE.MeshBasicMaterial({ color: 0xff5a4e, depthWrite: false });
export function makeBar() {
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
let lastTargets = [];
/** Punto lontano dai giocatori e fuori dalla loro vista (vedi world/nav.js). */
function spawnPoint() {
  const alive = lastTargets.filter((t) => t.alive);
  const p = findSpawn(alive.length ? alive : lastTargets);
  return p || { x: 0, y: 0, z: 0 };
}

/**
 * Crea un nemico. opts = configurazione del round (vedi game/difficulty.js):
 * { round, health, damage } — vita e danno di base, moltiplicati dalla variante.
 */
export function spawnEnemy(variant, opts) {
  const v = VARIANTS[variant];
  const faceIdx = (Math.random() * faceSets.length) | 0;
  const model = buildEnemyModel(variant, faceSets[faceIdx]);
  const half = 0.45 * v.scale, radius = 0.33 * v.scale, centerY = half + radius;
  const sp = spawnPoint();
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic().setTranslation(sp.x, sp.y + centerY + 0.05, sp.z).lockRotations(),
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
    id: ++nextId, faceIdx, walk: 0,
    variant, v, model, body, collider, centerY,
    health: opts.health * v.health,
    maxHealth: opts.health * v.health,
    // limite fisso: nessun nemico è più veloce del giocatore che cammina
    speed: Math.min(WALK_SPEED, speedFor(variant, opts.round)),
    damage: Math.round(v.damage * (opts.damage || 1)),
    yaw: Math.atan2(-sp.x, -sp.z),
    phase: Math.random() * 6,
    attackT: 0, attackCd: 0.5, hitDone: false,
    stun: 0, flash: 0, spawnT: 0,
    stuckT: 0, detourT: 0, detourSide: 1,
    prev: { x: sp.x, y: sp.y + centerY, z: sp.z },
    bar: makeBar(),
    dead: false,
  };
  for (const p of model.parts) { p.userData.enemy = e; pickables.push(p); }
  model.group.position.set(sp.x, sp.y, sp.z);
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
    const force = Math.max(impulse, 3);
    if (enemyHooks.onKill) enemyHooks.onKill(e, headshot, dir, force);
    removeEnemy(e, false);
    crumbleModel(e.model, dir, force);
    return true;
  }
  return false;
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
  clearDebris();
}

/* ---------- Intelligenza ---------- */
const pos = [];
/**
 * targets = giocatori da inseguire: [{ id, x, y, z, alive }]. Ogni nemico insegue il più vicino vivo.
 */
export function updateEnemies(dt, alpha, active, targets) {
  updateDebris(dt);
  lastTargets = targets;
  if (active) updateFields(dt, targets);
  for (let i = 0; i < enemies.length; i++) pos[i] = enemies[i].body.translation();
  const anyAlive = targets.some((tg) => tg.alive);

  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i], t = pos[i];
    e.spawnT = Math.min(1, e.spawnT + dt / 0.35);
    // percorso: il campo di navigazione dice verso quale giocatore andare e dove fare il prossimo passo
    const way = active ? steer(nodeAt(t.x, t.y - e.centerY, t.z)) : null;
    let pp = null;
    if (way) pp = targets.find((tg) => tg.id === way.id);
    if (!pp) {
      let best = Infinity;
      pp = targets[0];
      for (const tg of targets) {
        if (!tg.alive && anyAlive) continue;
        const d = (tg.x - t.x) ** 2 + (tg.z - t.z) ** 2;
        if (d < best) { best = d; pp = tg; }
      }
    }
    let dx = pp.x - t.x, dz = pp.z - t.z;
    const dist = Math.hypot(dx, dz) || 0.001;
    dx /= dist; dz /= dist;
    // direzione di marcia: verso il prossimo punto del percorso, o dritto se il giocatore è lì vicino
    let wx = dx, wz = dz;
    const close = dist < 2.5 && Math.abs(pp.y - t.y) < 1.2;
    if (way && !close) {
      const ax = way.x - t.x, az = way.z - t.z, al = Math.hypot(ax, az);
      if (al > 0.05) { wx = ax / al; wz = az / al; }
    }
    const reach = 0.95 + 0.33 * e.v.scale;
    const v = e.body.linvel();
    let walk = 0;

    if (active) {
      e.attackCd -= dt;
      if (e.stun > 0) e.stun -= dt;
      else {
        let mx = 0, mz = 0;
        if (dist > reach * 0.8 && pp.alive) {
          mx = wx; mz = wz;
          if (e.detourT > 0 && !way) {
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
          if (dist < reach + 0.35 && Math.abs(pp.y - t.y) < 1.6 && pp.alive && enemyHooks.onPlayerHit) {
            enemyHooks.onPlayerHit(e.damage, t.x, t.z, pp.id);
          }
        }
        if (e.attackT >= 1) e.attackT = 0;
      } else if (dist < reach && e.attackCd <= 0 && pp.alive) {
        e.attackT = 0.001;
        e.hitDone = false;
        e.attackCd = 1.1;
      }
    }

    // guarda il giocatore se è vicino, altrimenti dove sta andando
    const targetYaw = dist < 6 ? Math.atan2(dx, dz) : Math.atan2(wx, wz);
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
    e.walk = walk;
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
