// Oggetti dinamici: casse, palloni, palla demolitrice.
import * as THREE from 'three';
import { scene } from '../core/renderer.js';
import { world, RAPIER, addSound, removeSound } from '../core/physics.js';
import { M, ballMats, sphereGeo, unitBox } from './materials.js';
import { pickables, wreckAnchor } from './arena.js';

/** Tutti gli oggetti dinamici: { body, collider, mesh, kind } */
export const objects = [];
/** Callback chiamata quando un oggetto viene rimosso (es. per lasciarlo se è in mano). */
export const hooks = { onRemove: null };

const SURFACE = { crate: 'wood', ball: 'soft', wreck: 'metal' };

/** Ogni oggetto ha un id: il livello è costruito uguale su host e client, quindi gli id coincidono. */
let nextId = 0;
export const objById = new Map();
/**
 * In multiplayer, sui client gli oggetti non sono simulati: seguono le posizioni mandate dall'host
 * (corpi "cinematici", che il giocatore non può attraversare).
 */
let remote = false;
export function setObjectsRemote(on) { remote = on; }

function addObj(bodyDesc, colliderDesc, mesh, kind, freq) {
  const body = world.createRigidBody(bodyDesc);
  const collider = world.createCollider(colliderDesc, body);
  if (remote) body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);
  else addSound(collider, body, freq);
  mesh.castShadow = mesh.receiveShadow = true;
  scene.add(mesh);
  const o = { id: ++nextId, body, collider, mesh, kind, surface: SURFACE[kind] || 'stone' };
  objById.set(o.id, o);
  mesh.userData.obj = o;
  objects.push(o);
  pickables.push(mesh);
  syncOne(o);
  return o;
}

export function removeObj(o) {
  const i = objects.indexOf(o);
  if (i < 0) return;
  objects.splice(i, 1);
  objById.delete(o.id);
  removeSound(o.collider);
  world.removeRigidBody(o.body); // rimuove anche collider e giunti collegati
  scene.remove(o.mesh);
  const pi = pickables.indexOf(o.mesh);
  if (pi >= 0) pickables.splice(pi, 1);
  if (o === wreck) wreck = null;
  if (hooks.onRemove) hooks.onRemove(o);
}

export function makeCrate(x, y, z, size = 1, yaw = 0) {
  const h = size / 2;
  const desc = RAPIER.RigidBodyDesc.dynamic().setTranslation(x, y, z).setAngularDamping(0.1);
  if (yaw) desc.setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) });
  const col = RAPIER.ColliderDesc.cuboid(h, h, h).setDensity(1).setFriction(0.5).setRestitution(0.1);
  const m = new THREE.Mesh(unitBox, M.crate);
  m.scale.setScalar(size);
  return addObj(desc, col, m, 'crate', 140);
}

let ballIdx = 0;
export function makeBall(x, y, z, r, mass) {
  const desc = RAPIER.RigidBodyDesc.dynamic()
    .setTranslation(x, y, z)
    .setLinearDamping(0.05)
    .setAngularDamping(0.25)
    .setCcdEnabled(true);
  const volume = (4 / 3) * Math.PI * r * r * r;
  const col = RAPIER.ColliderDesc.ball(r)
    .setDensity(mass / volume)
    .setFriction(0.4)
    .setRestitution(0.6)
    .setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Max);
  const m = new THREE.Mesh(sphereGeo, ballMats[ballIdx++ % ballMats.length]);
  m.scale.setScalar(r);
  return addObj(desc, col, m, 'ball', 320 / Math.max(0.3, r * 2));
}

// Corda della palla demolitrice: un cilindro sottile tra l'aggancio e la palla.
let wreck = null;
const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 1, 6), M.rope);
rope.castShadow = true;
rope.visible = false;
scene.add(rope);
const UP = new THREE.Vector3(0, 1, 0), ropeA = new THREE.Vector3(), ropeB = new THREE.Vector3(), ropeD = new THREE.Vector3();

export function updateRope() {
  rope.visible = !!wreck;
  if (!wreck) return;
  const a = wreckAnchor.translation(), b = wreck.body.translation();
  ropeA.set(a.x, a.y, a.z);
  ropeB.set(b.x, b.y, b.z);
  const len = ropeA.distanceTo(ropeB);
  rope.position.copy(ropeA).add(ropeB).multiplyScalar(0.5);
  rope.scale.set(1, Math.max(0.01, len - 0.6), 1);
  rope.quaternion.setFromUnitVectors(UP, ropeD.copy(ropeA).sub(ropeB).normalize());
}

/** Palla demolitrice appesa con una corda (giunto sferico) al portale. */
export function makeWreck() {
  const desc = RAPIER.RigidBodyDesc.dynamic()
    .setTranslation(4, 2.15, -8)
    .setLinearDamping(0.02)
    .setAngularDamping(0.3);
  const col = RAPIER.ColliderDesc.ball(0.7).setMass(6).setFriction(0.5).setRestitution(0.1);
  const m = new THREE.Mesh(sphereGeo, M.wreck);
  m.scale.setScalar(0.7);
  const o = addObj(desc, col, m, 'wreck', 90);
  wreck = o;
  world.createImpulseJoint(
    RAPIER.JointData.spherical({ x: 0, y: 0, z: 0 }, { x: 0, y: 5, z: 0 }),
    wreckAnchor, o.body, true,
  );
  return o;
}

function syncOne(o) {
  const p = o.body.translation(), q = o.body.rotation();
  o.mesh.position.set(p.x, p.y, p.z);
  o.mesh.quaternion.set(q.x, q.y, q.z, q.w);
}

/** Copia posizione e rotazione dalla fisica alle mesh; elimina ciò che cade fuori dal mondo. */
export function syncObjects() {
  for (let i = objects.length - 1; i >= 0; i--) {
    const o = objects[i];
    if (o.body.isSleeping()) continue;
    if (o.body.translation().y < -30) { removeObj(o); continue; }
    syncOne(o);
  }
}

/** Client: applica la posizione ricevuta dall'host. */
export function applyObjectState(id, x, y, z, qx, qy, qz, qw) {
  const o = objById.get(id);
  if (!o) return;
  o.body.setNextKinematicTranslation({ x, y, z });
  o.body.setNextKinematicRotation({ x: qx, y: qy, z: qz, w: qw });
}

export function clearObjects() {
  nextId = 0;
  for (let i = objects.length - 1; i >= 0; i--) removeObj(objects[i]);
}
