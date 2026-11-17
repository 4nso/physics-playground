// Arena statica: terreno, mura, piedistallo, rampa, portale della palla demolitrice, colline.
import * as THREE from 'three';
import { scene } from '../core/renderer.js';
import { world, RAPIER } from '../core/physics.js';
import { M } from './materials.js';

/** Mesh colpibili dal mirino (statiche + oggetti dinamici). */
export const pickables = [];
/** Corpo fisso a cui è appesa la palla demolitrice. */
export let wreckAnchor = null;

const tmpQ = new THREE.Quaternion();
const X_AXIS = new THREE.Vector3(1, 0, 0);

function staticBox(size, pos, mat, rotX = 0) {
  tmpQ.setFromAxisAngle(X_AXIS, rotX);
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.fixed()
      .setTranslation(pos[0], pos[1], pos[2])
      .setRotation({ x: tmpQ.x, y: tmpQ.y, z: tmpQ.z, w: tmpQ.w }),
  );
  world.createCollider(RAPIER.ColliderDesc.cuboid(size[0] / 2, size[1] / 2, size[2] / 2).setFriction(0.5), body);
  const m = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), mat);
  m.position.set(pos[0], pos[1], pos[2]);
  m.quaternion.copy(tmpQ);
  m.castShadow = m.receiveShadow = true;
  scene.add(m);
  pickables.push(m);
  return body;
}

export function buildArena() {
  // Terreno: un parallelepipedo sottile sotto y = 0 (Rapier non ha piani infiniti)
  const ground = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.5, 0));
  world.createCollider(RAPIER.ColliderDesc.cuboid(100, 0.5, 100).setFriction(0.5), ground);
  const groundMesh = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), M.ground);
  groundMesh.rotation.x = -Math.PI / 2;
  groundMesh.receiveShadow = true;
  scene.add(groundMesh);
  pickables.push(groundMesh);

  // Mura perimetrali
  staticBox([61, 2.5, 1], [0, 1.25, -30.5], M.wall);
  staticBox([61, 2.5, 1], [0, 1.25, 30.5], M.wall);
  staticBox([1, 2.5, 61], [-30.5, 1.25, 0], M.wall);
  staticBox([1, 2.5, 61], [30.5, 1.25, 0], M.wall);
  // Piedistallo della torre
  staticBox([4, 1, 4], [0, 0.5, -8], M.stone);
  // Rampa + piattaforma
  staticBox([4, 0.4, 8], [12, 1.0, 8], M.ramp, 0.3);
  staticBox([4, 2.3, 4], [12, 1.15, 2.2], M.stone);
  // Portale della palla demolitrice
  staticBox([0.3, 7.3, 0.3], [4, 3.65, -11.6], M.metal);
  staticBox([0.3, 7.3, 0.3], [4, 3.65, -4.4], M.metal);
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.3, 7.6), M.metal);
  bar.position.set(4, 7.3, -8);
  bar.castShadow = true;
  scene.add(bar);
  wreckAnchor = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(4, 7.15, -8));

  // Colline lontane, low-poly
  const hillGeo = new THREE.IcosahedronGeometry(1, 1);
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2, r = 60 + Math.random() * 20;
    const hill = new THREE.Mesh(hillGeo, M.hill);
    const s = 10 + Math.random() * 8;
    hill.scale.set(s, s * 0.6, s);
    hill.position.set(Math.cos(a) * r, -4, Math.sin(a) * r);
    scene.add(hill);
  }
}
