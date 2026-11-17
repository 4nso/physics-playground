// Pezzi dei nemici distrutti: le parti del modello diventano corpi fisici che rotolano e poi spariscono.
// Usato sia dall'host (nemici veri) sia dai client (copie dei nemici).
import * as THREE from 'three';
import { scene } from '../core/renderer.js';
import { world, RAPIER, GROUPS } from '../core/physics.js';
import { thud } from '../core/audio.js';

const debris = [];
const MAX_DEBRIS = 48;
const wp = new THREE.Vector3(), wq = new THREE.Quaternion(), ws = new THREE.Vector3(), offV = new THREE.Vector3();

/** model = { group, parts } ; dir = direzione del colpo {x,z}; force = forza della spinta. */
export function crumbleModel(model, dir, force) {
  const k = Math.min(9, 2 + force * 0.5);
  model.group.updateMatrixWorld(true);
  for (const part of model.parts) {
    part.getWorldPosition(wp);
    part.getWorldQuaternion(wq);
    part.getWorldScale(ws);
    part.material = part.userData.baseMat || part.material;
    const size = part.geometry.userData.size, oy = part.geometry.userData.offsetY;
    // gambe e braccia hanno la geometria spostata: il centro reale non coincide con l'origine
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
  scene.remove(model.group);
  while (debris.length > MAX_DEBRIS) removeDebris(debris[0]);
  thud(0.3, 110);
}

export function updateDebris(dt) {
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

export function clearDebris() {
  for (let i = debris.length - 1; i >= 0; i--) removeDebris(debris[i]);
}
