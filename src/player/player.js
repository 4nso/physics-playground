// Giocatore: corpo fisico a capsula, movimento, salto, telecamera in prima persona.
import { camera } from '../core/renderer.js';
import { world, RAPIER } from '../core/physics.js';
import { input } from '../core/input.js';

const RADIUS = 0.4, HALF = 0.4;        // capsula alta 1.6 m
const EYE = 0.75;                       // occhi sopra il centro della capsula (≈1.55 m da terra)
const SPAWN = { x: 0, y: HALF + RADIUS + 0.05, z: 9 };

export const player = {
  body: null,
  collider: null,
  yaw: 0,
  pitch: -0.08,
  grounded: false,
  jumpReq: false,
  shake: 0,
};

export function createPlayer() {
  player.body = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(SPAWN.x, SPAWN.y, SPAWN.z)
      .lockRotations()
      .setCanSleep(false)
      .setCcdEnabled(true),
  );
  player.collider = world.createCollider(
    RAPIER.ColliderDesc.capsule(HALF, RADIUS)
      .setMass(5)
      .setFriction(0)
      .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min)
      .setRestitution(0),
    player.body,
  );
}

export function resetPlayer() {
  player.body.setTranslation(SPAWN, true);
  player.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
  player.yaw = 0;
  player.pitch = -0.08;
}

export function jump() { player.jumpReq = true; }

// Raggi verso il basso (centro + 4 punti sul bordo) per capire se tocchiamo terra.
const ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });
const OFFS = [[0, 0], [0.28, 0], [-0.28, 0], [0, 0.28], [0, -0.28]];
function checkGrounded() {
  const p = player.body.translation();
  for (const [ox, oz] of OFFS) {
    ray.origin.x = p.x + ox; ray.origin.y = p.y; ray.origin.z = p.z + oz;
    const hit = world.castRay(ray, HALF + RADIUS + 0.12, true, undefined, undefined, player.collider, player.body);
    if (hit) return true;
  }
  return false;
}

export function updatePlayer(dt) {
  const [lx, ly] = input.takeLook();
  player.yaw += lx;
  player.pitch = Math.max(-1.5, Math.min(1.5, player.pitch + ly));

  const k = input.keys;
  let f = input.joy.y, r = input.joy.x;
  if (k.KeyW || k.ArrowUp) f += 1;
  if (k.KeyS || k.ArrowDown) f -= 1;
  if (k.KeyD || k.ArrowRight) r += 1;
  if (k.KeyA || k.ArrowLeft) r -= 1;
  const mag = Math.hypot(f, r);
  if (mag > 1) { f /= mag; r /= mag; }
  const speed = k.ShiftLeft || k.ShiftRight ? 9 : 5.5;
  const s = Math.sin(player.yaw), c = Math.cos(player.yaw);
  const vx = (-s * f + c * r) * speed, vz = (-c * f - s * r) * speed;

  player.grounded = checkGrounded();
  const v = player.body.linvel();
  const a = Math.min(1, (player.grounded ? 14 : 3) * dt);
  v.x += (vx - v.x) * a;
  v.z += (vz - v.z) * a;
  if (player.jumpReq && player.grounded && v.y < 3) v.y = 6.2;
  player.jumpReq = false;
  player.body.setLinvel(v, true);

  if (player.body.translation().y < -10) resetPlayer();
}

/** Aggiunge una spinta (velocità) al giocatore, ad esempio da un'esplosione. */
export function pushPlayer(dx, dy, dz) {
  const v = player.body.linvel();
  player.body.setLinvel({ x: v.x + dx, y: v.y + dy, z: v.z + dz }, true);
}

export function updateCamera(dt) {
  const p = player.body.translation();
  camera.position.set(p.x, p.y + EYE, p.z);
  camera.rotation.set(player.pitch, player.yaw, 0);
  if (player.shake > 0) {
    camera.position.x += (Math.random() - 0.5) * player.shake;
    camera.position.y += (Math.random() - 0.5) * player.shake;
    player.shake = Math.max(0, player.shake - dt * 0.8);
  }
}
