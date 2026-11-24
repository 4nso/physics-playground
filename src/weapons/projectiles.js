// Proiettili veri (granate e razzi) ed esplosioni con danno ad area e spinta fisica.
// Il volo si calcola a mano con brevi raggi a ogni frame (niente corpi fisici: costa pochissimo).
// Da solo e sull'host i proiettili sono "veri" (auth): esplodono e fanno danni.
// Sui client sono solo da vedere: si fermano dove colpiscono e aspettano l'esplosione decisa dall'host.
import * as THREE from 'three';
import { glowMat } from '../core/glow.js';
import { scene } from '../core/renderer.js';
import { castWorld } from '../world/raycast.js';
import { addDecal } from '../world/decals.js';
import { enemies, damageEnemy } from '../enemies/enemies.js';
import { objects } from '../world/objects.js';
import { player, pushPlayer } from '../player/player.js';
import { WEAPONS, weaponStats } from './defs.js';
import { impact, smoke } from './effects.js';
import { boomSound, bounceSound } from './sounds.js';

/**
 * Avvisi verso armi e rete:
 *  onHit(killed, shooterId)        un nemico colpito da un'esplosione (per il segno sul mirino)
 *  onBoom(pid, x, y, z, wi)        esplosione decisa qui (l'host la manda ai client)
 */
export const projHooks = { onHit: null, onBoom: null, onBlast: null };

/* ---------- Modelli dei proiettili (riusati) ---------- */
const grenadeGeo = new THREE.IcosahedronGeometry(0.09, 0);
const grenadeMat = new THREE.MeshLambertMaterial({ color: 0x3f5a2a, flatShading: true });
const rocketGeo = new THREE.CylinderGeometry(0.06, 0.07, 0.5, 6).rotateX(Math.PI / 2);
const rocketMat = new THREE.MeshLambertMaterial({ color: 0x5d6b4a, flatShading: true });
const flameGeo = new THREE.ConeGeometry(0.07, 0.3, 6).rotateX(-Math.PI / 2).translate(0, 0, 0.38);
const flameMat = glowMat(new THREE.MeshBasicMaterial({ color: 0xffb040 }), 3);

// raggio verde della raygun: una palla luminosa con un alone
const rayGeo = new THREE.IcosahedronGeometry(0.09, 1);
const rayMat = glowMat(new THREE.MeshBasicMaterial({ color: 0x5dff7a }), 3.2);
const rayHaloMat = glowMat(new THREE.MeshBasicMaterial({ color: 0x20c845, transparent: true, opacity: 0.45, depthWrite: false }), 1.8);

function makeMesh(kind) {
  if (kind === 'ray') {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(rayGeo, rayMat));
    const halo = new THREE.Mesh(rayGeo, rayHaloMat);
    halo.scale.set(1.7, 1.7, 3.2); // allungato nella direzione del volo
    g.add(halo);
    return g;
  }
  if (kind === 'rocket') {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(rocketGeo, rocketMat));
    g.add(new THREE.Mesh(flameGeo, flameMat));
    return g;
  }
  return new THREE.Mesh(grenadeGeo, grenadeMat);
}
const pool = { grenade: [], rocket: [], ray: [] };
function takeMesh(kind) {
  const m = pool[kind].pop() || makeMesh(kind);
  m.visible = true;
  scene.add(m);
  return m;
}
function giveMesh(kind, m) { scene.remove(m); pool[kind].push(m); }

/* ---------- Palle di fuoco ---------- */
const fireGeo = new THREE.IcosahedronGeometry(1, 1);
// palle di fuoco arancioni (granate, razzi) e verdi (raygun)
function firePool(n, fireCol, smokeCol) {
  const list = [];
  for (let i = 0; i < n; i++) {
    const fire = new THREE.Mesh(fireGeo, glowMat(new THREE.MeshBasicMaterial({ color: fireCol, transparent: true, depthWrite: false }), 2.4));
    const smoke = new THREE.Mesh(fireGeo, new THREE.MeshBasicMaterial({ color: smokeCol, transparent: true, depthWrite: false }));
    fire.visible = smoke.visible = false;
    fire.frustumCulled = smoke.frustumCulled = false;
    scene.add(fire, smoke);
    list.push({ fire, smoke, t: 1, r: 1 });
  }
  return { list, next: 0 };
}
const FIRES = { orange: firePool(6, 0xffa13a, 0x4a4a4a), green: firePool(5, 0x4dff6a, 0x1f5a2e) };
const FIRE = [...FIRES.orange.list, ...FIRES.green.list];
const boomLight = new THREE.PointLight(0xffa040, 0, 18, 2);
scene.add(boomLight);
const UP = new THREE.Vector3(0, 1, 0);

/** Solo effetti (fuoco, fumo, luce, schegge, suono, scossa): uguale su tutti i dispositivi. */
function boomFx(x, y, z, radius, green = false) {
  const P = green ? FIRES.green : FIRES.orange;
  const f = P.list[P.next];
  P.next = (P.next + 1) % P.list.length;
  f.t = 0; f.r = radius;
  f.fire.position.set(x, y, z);
  f.smoke.position.set(x, y + 0.3, z);
  f.fire.visible = f.smoke.visible = true;
  boomLight.position.set(x, y + 0.5, z);
  boomLight.intensity = 40;
  boomLight.color.setHex(green ? 0x50ff70 : 0xffa040);
  tmp.set(x, y, z);
  if (green) impact(tmp, UP, 'ray', 30);
  impact(tmp, UP, 'metal', green ? 8 : 26);
  impact(tmp, UP, 'stone', 14);
  impact(tmp, UP, 'dirt', 16);   // detriti
  smoke(tmp, 7, radius);
  scorch(x, y, z, radius);
  const d = Math.hypot(player.pos.x - x, player.pos.y - y, player.pos.z - z);
  boomSound(1.2 / (1 + d * 0.08));
  player.shake = Math.max(player.shake, Math.min(0.25, (radius * 0.6) / (1 + d * 0.5)));
  // il giocatore vicino viene spinto via (senza danni: le proprie esplosioni non fanno male)
  if (d < radius * 1.3 && player.alive) {
    const k = 9 * (1 - d / (radius * 1.3));
    const dx = player.pos.x - x, dz = player.pos.z - z, l = Math.hypot(dx, dz) || 1;
    pushPlayer((dx / l) * k, 2 + k * 0.4, (dz / l) * k);
  }
}

/** Bruciatura dove è scoppiato: sul pavimento sotto, oppure sul muro più vicino se è più vicino. */
const DIRS = [[0, -1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]].map((d) => new THREE.Vector3(...d));
const sOrig = new THREE.Vector3(), sBest = new THREE.Vector3(), sNorm = new THREE.Vector3();
function scorch(x, y, z, radius) {
  sOrig.set(x, y + 0.2, z);
  let best = Infinity;
  for (const d of DIRS) {
    const h = castWorld(sOrig, d, d.y < 0 ? radius + 0.8 : 1.2);
    if (!h || h.object || h.hidden || h.distance >= best) continue;
    best = h.distance;
    sBest.copy(h.point); sNorm.copy(h.normal);
  }
  if (best < Infinity) addDecal(sBest, sNorm, 'burn', radius * (sNorm.y > 0.5 ? 1.2 : 0.8));
}

/* ---------- Danni ad area (solo da solo / host) ---------- */
const dirV = new THREE.Vector3(), tmp = new THREE.Vector3();
const imp = { x: 0, y: 0, z: 0 };
function blastDamage(x, y, z, w, owner) {
  const R = w.projectile.radius;
  if (projHooks.onBlast) projHooks.onBlast(x, y, z, R); // le bare vicine si aprono subito
  for (const e of [...enemies]) {
    if (e.dead) continue;
    const t = e.body.translation();
    const dx = t.x - x, dy = t.y - y, dz = t.z - z;
    const d = Math.max(0, Math.hypot(dx, dy, dz) - 0.4 * e.v.scale);
    if (d > R) continue;
    const fall = 1 - 0.6 * (d / R); // al centro danno pieno, al bordo il 40%
    const l = Math.hypot(dx, dz) || 1;
    dirV.set(dx / l, 0.5, dz / l).normalize();
    tmp.set(t.x, t.y, t.z);
    const killed = damageEnemy(e, w.damage * fall, dirV, tmp, false, w.impulse * fall, owner);
    if (projHooks.onHit) projHooks.onHit(killed, owner);
  }
  for (const o of objects) {
    const t = o.body.translation();
    const dx = t.x - x, dy = t.y - y, dz = t.z - z, d = Math.hypot(dx, dy, dz);
    if (d > R * 1.4) continue;
    const k = (w.impulse * 0.5 * (1 - d / (R * 1.4))) / (d + 0.3);
    imp.x = dx * k; imp.y = Math.abs(dy) * k + w.impulse * 0.2 * (1 - d / (R * 1.4)); imp.z = dz * k;
    o.body.applyImpulse(imp, true);
  }
}

/* ---------- Volo ---------- */
const list = [];
const pos = new THREE.Vector3(), step = new THREE.Vector3(), n = new THREE.Vector3();

/**
 * Lancia un proiettile. o = punto di partenza, d = direzione (unitaria), wi = indice dell'arma.
 * pid = numero che identifica il proiettile in rete. auth = true se qui si decidono i danni.
 * ignore = mesh da saltare (l'oggetto in mano). level = livello del potenziatore (più danno).
 */
export function spawnProjectile(pid, wi, o, d, owner, auth, ignore = null, level = 0) {
  const w = WEAPONS[wi] && weaponStats(wi, level);
  if (!w || !w.projectile) return;
  const P = w.projectile;
  const mesh = takeMesh(P.kind);
  const p = {
    pid, w, wi, owner, auth, ignore, kind: P.kind, mesh, t: 0, stopped: false, wait: 0,
    pos: new THREE.Vector3(o.x, o.y, o.z),
    vel: new THREE.Vector3(d.x, d.y, d.z).multiplyScalar(P.speed),
  };
  // la granata parte un po' verso l'alto: arco più naturale
  if (P.kind === 'grenade') p.vel.y += 2.5;
  mesh.position.copy(p.pos);
  list.push(p);
}

function remove(p) {
  const i = list.indexOf(p);
  if (i >= 0) list.splice(i, 1);
  giveMesh(p.kind, p.mesh);
}

function explode(p) {
  const { x, y, z } = p.pos;
  if (p.auth) {
    blastDamage(x, y, z, p.w, p.owner);
    if (projHooks.onBoom) projHooks.onBoom(p.pid, x, y, z, p.wi);
    boomFx(x, y, z, p.w.projectile.radius, p.kind === 'ray');
    remove(p);
  } else {
    // client: si ferma qui e aspetta l'esplosione dall'host (al massimo 2 secondi)
    p.stopped = true;
    p.mesh.visible = false;
    p.wait = 2;
  }
}

/** Client: l'host dice che un proiettile è esploso in (x, y, z). */
export function remoteBoom(pid, x, y, z, wi) {
  const p = list.find((q) => q.pid === pid);
  if (p) remove(p);
  const w = WEAPONS[wi];
  boomFx(x, y, z, w && w.projectile ? w.projectile.radius : 4, !!(w && w.projectile && w.projectile.kind === 'ray'));
}

export function updateProjectiles(dt) {
  for (let i = list.length - 1; i >= 0; i--) {
    const p = list[i];
    if (p.stopped) { p.wait -= dt; if (p.wait <= 0) remove(p); continue; }
    const P = p.w.projectile;
    p.t += dt;
    if (p.t >= P.fuse) { explode(p); continue; }
    p.vel.y -= P.gravity * dt;
    step.copy(p.vel).multiplyScalar(dt);
    const len = step.length();
    if (len > 1e-5) {
      dirV.copy(step).divideScalar(len);
      const hit = castWorld(p.pos, dirV, len + 0.08, p.ignore);
      if (hit) {
        const ud = hit.object ? hit.object.userData : {};
        const onEnemy = !!(ud.enemy || ud.enemyProxy);
        if (p.kind !== 'grenade' || onEnemy) {
          p.pos.copy(hit.point).addScaledVector(hit.normal, 0.15);
          explode(p);
          continue;
        }
        // granata: rimbalza sul mondo e sugli oggetti
        n.copy(hit.normal);
        const vn = p.vel.dot(n);
        if (vn < 0) p.vel.addScaledVector(n, -(1 + P.bounce) * vn).multiplyScalar(0.75);
        p.pos.copy(hit.point).addScaledVector(n, 0.1);
        if (-vn > 2.5) bounceSound();
        if (p.vel.lengthSq() < 0.6) p.vel.set(0, 0, 0);
      } else p.pos.add(step);
    }
    p.mesh.position.copy(p.pos);
    if (p.kind === 'ray') {
      p.mesh.lookAt(pos.copy(p.pos).sub(p.vel));
      if (Math.random() < 0.7) impact(p.pos, UP, 'ray', 1); // scia di scintille verdi
    } else if (p.kind === 'rocket') {
      p.mesh.lookAt(pos.copy(p.pos).sub(p.vel));
      if (Math.random() < 0.6) impact(p.pos, UP, 'soft', 1); // scia di fumo
    } else {
      p.mesh.rotation.x += dt * 9; p.mesh.rotation.z += dt * 6;
    }
    if (p.pos.y < -20) remove(p);
  }

  // fuoco e fumo che si espandono e svaniscono
  for (const f of FIRE) {
    if (!f.fire.visible) continue;
    f.t += dt;
    const a = Math.min(1, f.t / 0.22);
    f.fire.scale.setScalar(f.r * (0.25 + 0.65 * a));
    f.fire.material.opacity = Math.max(0, 0.95 - f.t * 2.4);
    f.smoke.scale.setScalar(f.r * (0.3 + 0.55 * Math.min(1, f.t / 0.6)));
    f.smoke.position.y += dt * 1.2;
    f.smoke.material.opacity = Math.max(0, 0.55 - f.t * 0.55);
    if (f.t > 1) f.fire.visible = f.smoke.visible = false;
  }
  boomLight.intensity = Math.max(0, boomLight.intensity - dt * 120);
}

export function clearProjectiles() {
  for (let i = list.length - 1; i >= 0; i--) remove(list[i]);
}

/** Numero casuale che identifica un proiettile in rete. */
export const newPid = () => (Math.random() * 2147483647) | 0;
