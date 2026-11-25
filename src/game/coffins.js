// Bare del cimitero (fase 15, passo 3): docs/DESIGN.md → "Le bare con la raygun".
// - 10 bare chiuse (posizioni in world/cemetery.js). Si rompono sparandoci: hanno una "vita" (pochi colpi di
//   fucile a pompa, molti di pistola), un'esplosione le apre subito. Il coperchio vola via (fisica) e restano
//   i pezzi; le bare rotte non si ricompongono.
// - 2 bare (scelte con il seed) hanno una raygun che fluttua con una luce verde: si prende con il pulsante
//   d'azione ("Prendi raygun"), gratis. Ogni raygun una volta sola (al massimo 2 giocatori la trovano così).
// - Chi comanda (da solo / host) decide danni, rotture e chi prende la raygun; ai client arriva lo stato
//   nell'istantanea (vedi net/sync.js). Coperchio e schegge che volano sono solo grafica, su ogni dispositivo.
// Prestazioni: bare intere e bare aperte sono due InstancedMesh (due disegni per tutte e 10).
import * as THREE from 'three';
import { scene, isTouch } from '../core/renderer.js';
import { world, RAPIER, GROUPS } from '../core/physics.js';
import { pad } from '../core/gamepad.js';
import { pickables } from '../world/arena.js';
import { map, staticSurface } from '../world/map.js';
import { impact } from '../weapons/effects.js';
import { WEAPONS } from '../weapons/defs.js';
import { models } from '../weapons/viewmodel.js';
import { giveWeapon } from '../weapons/weapons.js';
import { raygunJingle } from '../weapons/sounds.js';
import { boomSound, thud } from '../core/audio.js';
import { player } from '../player/player.js';
import { hud } from '../ui/hud.js';
import { devLog } from '../core/devmode.js';
import { exitHooks } from './exitgate.js';
import { addLowFog } from '../world/lowfog.js';

export const RAYGUN = WEAPONS.findIndex((w) => w.id === 'raygun');
const HP = 400;            // vita di una bara (pistola 26 a colpo, pompa 9×15, esplosione: subito)
const NEAR = 1.9;          // distanza per "Prendi raygun"
const HOST_NEAR = 3.5;
/** Rete (impostato da net/sync.js): toHost(msg) manda una richiesta all'host. */
export const coffinNet = { toHost: null };

/* ---------- Geometrie: bara a sei lati, coperchio con la croce ---------- */
const WOOD = new THREE.Color(0x4a2c1a), WOOD_L = new THREE.Color(0x5e3a22), CROSS = new THREE.Color(0xb99a5a), INSIDE = new THREE.Color(0x120c08);
function outline(s = 1) {
  const sh = new THREE.Shape();
  [[-0.24, -1], [0.24, -1], [0.36, -0.42], [0.29, 1], [-0.29, 1], [-0.36, -0.42]].forEach(([x, z], i) => (i ? sh.lineTo(x * s, z * s) : sh.moveTo(x * s, z * s)));
  sh.closePath();
  return sh;
}
/** Prisma dalla sagoma, da y0 a y1, colorato (attributo color). */
function prism(s, y0, y1, color) {
  const g = new THREE.ExtrudeGeometry(outline(s), { depth: y1 - y0, bevelEnabled: false });
  g.rotateX(Math.PI / 2);
  g.translate(0, y1, 0);
  return paint(g.index ? g.toNonIndexed() : g, color);
}
function block(w, h, d, x, y, z, color) {
  const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
  g.translate(x, y, z);
  return paint(g, color);
}
function paint(g, c) {
  g.deleteAttribute('uv');
  const n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}
function merge(list) {
  const pos = [], col = [];
  for (const g of list) { pos.push(...g.attributes.position.array); col.push(...g.attributes.color.array); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}
const lidParts = () => [prism(1.04, 0, 0.1, WOOD_L), block(0.09, 0.03, 1.1, 0, 0.115, -0.1, CROSS), block(0.5, 0.03, 0.09, 0, 0.115, -0.45, CROSS)];
const GEO_CLOSED = merge([prism(1, 0, 0.42, WOOD), ...lidParts().map((g) => g.translate(0, 0.42, 0))]);
const GEO_OPEN = merge([prism(1, 0, 0.42, WOOD), prism(0.86, 0.42, 0.425, INSIDE)]);
const GEO_LID = merge(lidParts());
const GEO_PLANK = new THREE.BoxGeometry(0.1, 0.06, 0.7);
const woodMat = addLowFog(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
const plankMat = addLowFog(new THREE.MeshLambertMaterial({ color: 0x5e3a22, flatShading: true }));

/* ---------- Stato ---------- */
let list = [];            // { x, y, z, along, ray, hp, broken, taken, col, lid, planks, gun }
let closed = null, open = null, body = null;
const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p3 = new THREE.Vector3(), s3 = new THREE.Vector3(), c3 = new THREE.Color();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const Y = new THREE.Vector3(0, 1, 0);

function placeMatrix(c) {
  return m4.compose(p3.set(c.x, c.y, c.z), q.setFromAxisAngle(Y, c.along === 'x' ? Math.PI / 2 : 0), s3.set(1, 1, 1));
}

/** Toglie tutto (bare, coperchi, schegge, raygun). */
function clearCoffins() {
  for (const c of list) {
    dropDebris(c);
    if (c.gun) scene.remove(c.gun);
  }
  list = [];
  for (const m of [closed, open]) if (m) { scene.remove(m); m.dispose(); const i = pickables.indexOf(m); if (i >= 0) pickables.splice(i, 1); }
  closed = open = null;
  if (body) world.removeRigidBody(body);
  body = null;
}

/** Secondi dopo cui coperchio e schegge spariscono (l'ultimo mezzo secondo si rimpiccioliscono). */
const DEBRIS_LIFE = 14;
function dropDebris(c) {
  for (const b of [c.lid, ...(c.planks || [])]) if (b) { scene.remove(b.mesh); world.removeRigidBody(b.body); }
  c.lid = null; c.planks = [];
}

function addCollider(c) {
  const hx = 0.33, hz = 0.97, hy = 0.24;
  const d = RAPIER.ColliderDesc.cuboid(c.along === 'x' ? hz : hx, hy, c.along === 'x' ? hx : hz).setTranslation(c.x, c.y + hy, c.z);
  const col = world.createCollider(d, body);
  staticSurface.set(col.handle, 'wood');
  return col;
}

/** Nuova partita: tutte le bare chiuse (dalla mappa attuale). */
export function resetCoffins() {
  clearCoffins();
  const data = (map.cem && map.cem.coffins) || [];
  if (!data.length) return;
  body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  closed = new THREE.InstancedMesh(GEO_CLOSED, woodMat, data.length);
  open = new THREE.InstancedMesh(GEO_OPEN, woodMat, data.length);
  closed.userData.coffin = true;     // i colpi la riconoscono (weapons.js → onCoffinHit)
  closed.userData.surface = 'wood';
  // fase 16: una bara rotta non si colpisce più (prima la sua istanza "a scala zero" prendeva ancora i colpi)
  const baseRay = THREE.InstancedMesh.prototype.raycast;
  closed.raycast = function (rc, out) {
    const n = out.length;
    baseRay.call(this, rc, out);
    for (let k = out.length - 1; k >= n; k--) { const c = list[out[k].instanceId]; if (!c || c.broken) out.splice(k, 1); }
  };
  list = data.map((d, i) => {
    const c = { ...d, hp: HP, broken: false, taken: null, flash: 0 };
    closed.setMatrixAt(i, placeMatrix(c));
    closed.setColorAt(i, c3.setRGB(1, 1, 1));
    open.setMatrixAt(i, ZERO);
    c.col = addCollider(c);
    return c;
  });
  for (const m of [closed, open]) { m.castShadow = true; m.computeBoundingSphere(); scene.add(m); }
  closed.instanceColor.needsUpdate = true;
  pickables.push(closed);
  lastNear = -1;
}

/* ---------- Danni (solo chi comanda) ---------- */
/** Un colpo sulla bara i. dir = direzione del colpo. Restituisce true se si è rotta. */
export function hitCoffin(i, damage, dir, by) {
  const c = list[i];
  if (!c || c.broken) return false;
  c.hp -= damage;
  c.flash = 0.08;
  if (c.hp > 0) return false;
  breakCoffin(i, dir);
  devLog(`⚰️ Bara ${i} rotta${c.ray ? ' (c\'era la raygun!)' : ''}${by && by !== 'local' ? ` da ${by}` : ''}`);
  return true;
}

/** Un'esplosione in (x, y, z) con raggio R: le bare vicine si aprono subito. */
export function blastCoffins(x, y, z, R) {
  list.forEach((c, i) => {
    if (c.broken) return;
    const d = Math.hypot(c.x - x, c.y + 0.3 - y, c.z - z);
    if (d < R + 0.9) hitCoffin(i, HP * 10, { x: c.x - x, y: 0.5, z: c.z - z });
  });
}

/* ---------- Rottura (su ogni dispositivo: chi comanda subito, i client quando arriva lo stato) ---------- */
function debris(geo, mat, x, y, z, rot, hx, hy, hz, vel, spin) {
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  scene.add(mesh);
  const b = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(x, y, z).setRotation(rot).setLinearDamping(0.3).setAngularDamping(0.4));
  world.createCollider(RAPIER.ColliderDesc.cuboid(hx, hy, hz).setDensity(0.6).setFriction(0.8).setCollisionGroups(GROUPS.debris), b);
  b.setLinvel(vel, true);
  b.setAngvel(spin, true);
  return { mesh, body: b };
}

function breakCoffin(i, dir = null) {
  const c = list[i];
  if (!c || c.broken) return;
  c.broken = true;
  closed.setMatrixAt(i, ZERO);
  closed.instanceMatrix.needsUpdate = true;
  open.setMatrixAt(i, placeMatrix(c));
  open.instanceMatrix.needsUpdate = true;
  // fase 16: via subito il corpo fisico (e la hitbox, vedi raycast in resetCoffins): la bara aperta è solo decorazione
  if (c.col) world.removeCollider(c.col, false);
  c.col = null;
  c.debrisT = DEBRIS_LIFE;
  // il coperchio vola via nella direzione del colpo, le schegge saltano intorno
  const l = dir ? Math.hypot(dir.x, dir.z) || 1 : 1;
  const dx = dir ? dir.x / l : Math.random() - 0.5, dz = dir ? dir.z / l : Math.random() - 0.5;
  const rq = new THREE.Quaternion().setFromAxisAngle(Y, c.along === 'x' ? Math.PI / 2 : 0);
  c.lid = debris(GEO_LID, woodMat, c.x, c.y + 0.5, c.z, rq, c.along === 'x' ? 1 : 0.36, 0.06, c.along === 'x' ? 0.36 : 1,
    { x: dx * 4 + (Math.random() - 0.5), y: 6 + Math.random() * 2, z: dz * 4 + (Math.random() - 0.5) },
    { x: (Math.random() - 0.5) * 8, y: (Math.random() - 0.5) * 6, z: (Math.random() - 0.5) * 8 });
  c.planks = [];
  for (let k = 0; k < 3; k++) {
    const a = Math.random() * Math.PI * 2;
    c.planks.push(debris(GEO_PLANK, plankMat, c.x + Math.cos(a) * 0.3, c.y + 0.4, c.z + Math.sin(a) * 0.3, new THREE.Quaternion().setFromAxisAngle(Y, a), 0.05, 0.03, 0.35,
      { x: Math.cos(a) * 3, y: 3 + Math.random() * 2, z: Math.sin(a) * 3 }, { x: Math.random() * 10 - 5, y: Math.random() * 10 - 5, z: Math.random() * 10 - 5 }));
  }
  p3.set(c.x, c.y + 0.5, c.z);
  impact(p3, Y, 'wood', 26);
  boomSound();
  thud(0.3, 90);
  if (c.ray) {
    c.gun = rayDisplay();
    c.gun.position.set(c.x, c.y + 1.1, c.z);
    scene.add(c.gun);
    raygunJingle();
  }
}

/** La raygun che fluttua sopra la bara, con un alone verde. */
const haloTex = (() => {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const g = cv.getContext('2d'), r = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  r.addColorStop(0, 'rgba(120,255,140,0.95)'); r.addColorStop(1, 'rgba(60,255,90,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(cv);
})();
const haloMat = new THREE.SpriteMaterial({ map: haloTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
function rayDisplay() {
  const g = new THREE.Group();
  const m = models[RAYGUN], ud = m.userData;
  m.userData = {}; // i dati del modello in prima persona non vanno copiati
  const gun = m.clone(true);
  m.userData = ud;
  gun.position.set(0, 0, 0);
  gun.rotation.set(0, Math.PI / 2, 0);
  gun.scale.setScalar(2.2);
  gun.visible = true;
  gun.traverse((o) => { o.visible = true; });
  const halo = new THREE.Sprite(haloMat);
  halo.scale.set(1.6, 1.6, 1);
  g.add(halo, gun);
  g.userData.gun = gun;
  return g;
}

/* ---------- Prendere la raygun ---------- */
const teamMap = () => (exitHooks.team ? exitHooks.team() : new Map());
const myId = () => (exitHooks.myId ? exitHooks.myId() : 'host');
const posOf = (m) => (m.local ? { x: player.pos.x, y: player.pos.y - 0.85, z: player.pos.z } : { x: m.x, y: (m.y || 0.85) - 0.85, z: m.z });
const takers = () => list.filter((c) => c.taken).map((c) => c.taken);

/** Chi comanda: il giocatore id vuole la raygun della bara i. Restituisce il motivo del no ('' = presa). */
export function serverTake(id, i) {
  const c = list[i], m = teamMap().get(id);
  if (!c || !c.ray || !c.broken) return '';
  if (c.taken) return 'Qualcuno l\'ha già presa';
  if (!m || m.down) return 'Sei a terra';
  if (takers().includes(id)) return 'Hai già preso una raygun';
  const p = posOf(m);
  if (Math.hypot(p.x - c.x, p.z - c.z) > (m.local ? NEAR + 0.5 : HOST_NEAR)) return 'Avvicinati alla bara';
  c.taken = id;
  devLog(`🛸 Raygun della bara ${i} a ${m.local ? 'me' : id}`);
  if (id === myId()) gotRaygun();
  else if (grantHook) grantHook(id); // al client arriva l'arma (messaggio 'grant')
  for (const o of teamMap().values()) {
    if (o.id === id) continue;
    if (o.id === myId()) hud.flash('🛸 Un compagno ha trovato una raygun', 2);
    else if (exitHooks.tell) exitHooks.tell(o.id, '🛸 Un compagno ha trovato una raygun', 2);
  }
  return '';
}
/** Impostato da net/sync.js: manda la raygun al client che l'ha presa. */
let grantHook = null;
export function setGrantHook(fn) { grantHook = fn; }
/** Questo giocatore riceve la raygun. */
export function gotRaygun() {
  giveWeapon(RAYGUN);
  raygunJingle();
  hud.flash('🛸 Hai trovato la Raygun!', 2.2);
}

/** La bara con la raygun vicina al giocatore locale (indice o -1). */
function nearRay() {
  if (!player.alive || player.seated) return -1;
  const p = player.pos;
  for (let i = 0; i < list.length; i++) {
    const c = list[i];
    if (c.ray && c.broken && !c.taken && Math.hypot(p.x - c.x, p.z - c.z) < NEAR && Math.abs(p.y - 0.85 - c.y) < 1.5) return i;
  }
  return -1;
}
/** Pulsante d'azione touch (o null). */
export function coffinActionButton() {
  return nearRay() >= 0 ? { id: 'raygun', icon: '🛸', label: 'Prendi raygun', kind: 'shop' } : null;
}
/** F, B sul controller o pulsante d'azione: true se ha fatto qualcosa. */
export function coffinAction() {
  const i = nearRay();
  if (i < 0) return false;
  if (exitHooks.authority && !exitHooks.authority()) {
    if (coffinNet.toHost) coffinNet.toHost({ t: 'coffin', a: 'take', i });
  } else {
    const why = serverTake(myId(), i);
    if (why) hud.flash(why, 1.6);
  }
  return true;
}

/* ---------- A ogni frame ---------- */
let t = 0, lastNear = -1;
export function updateCoffins(dt, playing) {
  if (!closed) return;
  t += dt;
  let dirty = false;
  list.forEach((c, i) => {
    if (c.flash > 0) {
      c.flash -= dt;
      const k = 0.55 + 0.45 * (c.hp / HP); // più si rovina, più è scura
      closed.setColorAt(i, c.flash > 0 ? c3.setRGB(1.6, 1.4, 1.2) : c3.setRGB(k, k, k));
      dirty = true;
    }
    if (c.debrisT > 0) {
      c.debrisT -= dt;
      if (c.debrisT <= 0) dropDebris(c);
      else if (c.debrisT < 0.5) for (const b of [c.lid, ...c.planks]) if (b) b.mesh.scale.setScalar(c.debrisT * 2);
    }
    for (const b of [c.lid, ...(c.planks || [])]) {
      if (!b || b.body.isSleeping()) continue;
      const tr = b.body.translation(), r = b.body.rotation();
      b.mesh.position.set(tr.x, tr.y, tr.z);
      b.mesh.quaternion.set(r.x, r.y, r.z, r.w);
    }
    if (c.gun) {
      c.gun.visible = !c.taken;
      if (!c.taken) {
        c.gun.position.y = c.y + 1.1 + Math.sin(t * 2.2) * 0.1;
        c.gun.userData.gun.rotation.y = Math.PI / 2 + t * 1.2;
        if (Math.random() < dt * 4) { p3.set(c.x + (Math.random() - 0.5) * 0.6, c.y + 0.6, c.z + (Math.random() - 0.5) * 0.6); impact(p3, Y, 'ray', 2); }
      }
    }
  });
  if (dirty) closed.instanceColor.needsUpdate = true;
  // avviso quando si arriva vicino alla raygun
  const n = playing ? nearRay() : -1;
  if (n >= 0 && n !== lastNear) {
    const k = pad.active ? ' <kbd>B</kbd>' : isTouch ? '' : ' <kbd>F</kbd>';
    hud.flash(`🛸 Prendi la raygun${k}`, 2);
  }
  lastNear = n;
}

/* ---------- Rete ---------- */
/** Host → client: [bare rotte (bit), raygun prese (bit)]. */
export function coffinSnapshot() {
  let b = 0, tk = 0;
  list.forEach((c, i) => { if (c.broken) b |= 1 << i; if (c.taken) tk |= 1 << i; });
  return [b, tk];
}
export function applyCoffinSnapshot(s) {
  if (!Array.isArray(s)) return;
  list.forEach((c, i) => {
    if ((s[0] >> i) & 1 && !c.broken) breakCoffin(i);
    c.taken = (s[1] >> i) & 1 ? c.taken || 'x' : null;
  });
}

/* ---------- Modalità sviluppatore ---------- */
export function devBreakAll() { list.forEach((c, i) => { if (!c.broken) { breakCoffin(i, null); devLog(`⚰️ Bara ${i} rotta (dev)`); } }); }
/** Dove sono le bare con la raygun (per il teletrasporto). */
export function rayCoffins() { return list.filter((c) => c.ray); }
export const coffinCount = () => list.length;
