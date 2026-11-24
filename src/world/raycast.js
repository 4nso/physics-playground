// Raggio usato da armi e mirino: colpisce sia le mesh dinamiche (oggetti, nemici) con Three.js,
// sia il mondo statico con la fisica di Rapier (molto più veloce sulle mesh unite delle stanze).
import * as THREE from 'three';
import { world, RAPIER } from '../core/physics.js';
import { pickables } from './arena.js';
import { staticSurface, hiddenColliders } from './map.js';

const raycaster = new THREE.Raycaster();
const ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 });
const ONLY_STATIC = RAPIER.QueryFilterFlags.EXCLUDE_DYNAMIC | RAPIER.QueryFilterFlags.EXCLUDE_KINEMATIC;

/** Risultato riusato: { point, normal, distance, object (mesh o null), surface } */
const out = { point: new THREE.Vector3(), normal: new THREE.Vector3(), distance: 0, object: null, surface: 'stone', face: true, hidden: false, instanceId: -1 };

/**
 * Lancia un raggio da `origin` lungo `dir` (unitaria) fino a `far`.
 * ignore = mesh da saltare (l'oggetto in mano). Restituisce `out` o null.
 */
export function castWorld(origin, dir, far, ignore = null) {
  ray.origin.x = origin.x; ray.origin.y = origin.y; ray.origin.z = origin.z;
  ray.dir.x = dir.x; ray.dir.y = dir.y; ray.dir.z = dir.z;
  // nota: i colpi si fermano anche sulla barriera della zona sicura (da lì dentro non si spara fuori)
  const sh = world.castRayAndGetNormal(ray, far, true, ONLY_STATIC);
  const sDist = sh ? sh.timeOfImpact : Infinity;

  raycaster.set(origin, dir);
  raycaster.far = Math.min(far, sDist);
  const hits = raycaster.intersectObjects(pickables, false);
  for (const h of hits) {
    if (h.object === ignore) continue;
    out.point.copy(h.point);
    if (h.face) out.normal.copy(h.face.normal).transformDirection(h.object.matrixWorld);
    else out.normal.copy(dir).negate();
    out.distance = h.distance;
    out.object = h.object;
    out.instanceId = h.instanceId ?? -1; // InstancedMesh (bare del cimitero)
    out.surface = null;
    return out;
  }
  if (!sh) return null;
  out.point.copy(origin).addScaledVector(dir, sDist);
  out.normal.set(sh.normal.x, sh.normal.y, sh.normal.z);
  out.distance = sDist;
  out.object = null;
  out.surface = staticSurface.get(sh.collider.handle) || 'stone';
  out.hidden = hiddenColliders.has(sh.collider.handle);
  return out;
}

/** C'è un muro (mondo statico) tra origin e la distanza far lungo dir (unitaria)? Per l'aiuto alla mira. */
export function staticBlocked(origin, dir, far) {
  ray.origin.x = origin.x; ray.origin.y = origin.y; ray.origin.z = origin.z;
  ray.dir.x = dir.x; ray.dir.y = dir.y; ray.dir.z = dir.z;
  return !!world.castRay(ray, far, true, ONLY_STATIC);
}
