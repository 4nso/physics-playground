// Giocatore: corpo fisico a capsula, movimento, salto, vita, telecamera in prima persona.
import { camera, view } from '../core/renderer.js';
import { world, RAPIER, GROUPS, onBeforeStep } from '../core/physics.js';
import { input } from '../core/input.js';
import { map } from '../world/map.js';
import { dev } from '../core/devmode.js';

const RADIUS = 0.4, HALF = 0.4;        // capsula alta 1.6 m
const EYE = 0.75;                       // occhi sopra il centro della capsula (≈1.55 m da terra)
const SPAWN = { x: 0, y: HALF + RADIUS + 0.05, z: 9 };
export const MAX_HEALTH = 100;
/** Velocità del giocatore (m/s): camminata e corsa. I nemici non superano mai WALK_SPEED. */
export const WALK_SPEED = 5.5;
export const RUN_SPEED = 9;
/** Mirando si cammina al 70%. */
const AIM_SPEED = 0.7;

export const player = {
  body: null,
  collider: null,
  yaw: 0,
  pitch: -0.08,
  grounded: false,
  jumpReq: false,
  shake: 0,
  speed: 0,        // velocità orizzontale (per oscillazione dell'arma e dispersione)
  recoil: 0,       // rinculo della visuale verso l'alto (segue recoilTarget in modo morbido)
  recoilTarget: 0,
  recoilYaw: 0,
  recoilYawTarget: 0,
  lookDX: 0,       // rotazione della visuale in questo frame
  lookDY: 0,
  health: MAX_HEALTH,
  alive: true,
  /** Posizione interpolata tra due passi fisici: è quella da usare per disegnare. */
  pos: { x: SPAWN.x, y: SPAWN.y, z: SPAWN.z },
  /** Seduto su una giostra: il corpo segue il posto (seatPos, centro della capsula) e non si cammina. */
  seated: false,
  seatPos: { x: 0, y: 0, z: 0 },
  /** Mira di precisione (la decide weapons.js): si cammina più piano e non si corre. */
  aiming: false,
  /** Sta chiedendo di correre mentre si muove (la corsa interrompe la mira). */
  wantsRun: false,
};
const prev = { x: SPAWN.x, y: SPAWN.y, z: SPAWN.z };

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
      .setRestitution(0)
      .setCollisionGroups(GROUPS.player),
    player.body,
  );
  onBeforeStep(() => {
    const t = player.body.translation();
    prev.x = t.x; prev.y = t.y; prev.z = t.z;
  });
}

const SLOT_OFF = [0, 1.6, -1.6, 3.2];
let spawn = { ...SPAWN };
/** Punto di partenza del giocatore nello slot (0..3) sulla mappa attuale: ognuno un po' spostato. */
export function spawnPoint(slot = 0) {
  const s = map.spawn;
  return { x: s.x, y: s.y + HALF + RADIUS + 0.05, z: s.z + SLOT_OFF[slot % 4] };
}
/** slot = posto del giocatore in multiplayer (0..3). */
export function resetPlayer(slot = 0) {
  if (player.seated) standUp(0, 0, 0);
  spawn = spawnPoint(slot);
  player.body.setTranslation(spawn, true);
  player.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
  Object.assign(prev, spawn);
  Object.assign(player.pos, spawn);
  player.yaw = map.spawn.yaw || 0;
  player.pitch = -0.08;
  player.recoil = player.recoilTarget = player.recoilYaw = player.recoilYawTarget = 0;
  player.shake = 0;
  player.health = MAX_HEALTH;
  player.alive = true;
}

export function jump() { player.jumpReq = true; }

/** Modalità sviluppatore: porta il giocatore in (x, feetY, z), con i piedi a quell'altezza. */
export function teleportPlayer(x, feetY, z, yaw) {
  if (player.seated) standUp(x, feetY + HALF + RADIUS + 0.05, z);
  const p = { x, y: feetY + HALF + RADIUS + 0.05, z };
  player.body.setTranslation(p, true);
  player.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
  Object.assign(prev, p);
  Object.assign(player.pos, p);
  if (yaw !== undefined) player.yaw = yaw;
}

/** Modalità sviluppatore: volo libero (niente gravità né collisioni con i muri). */
let flying = false;
function setFlying(on) {
  if (flying === on || player.seated) return;
  flying = on;
  player.collider.setEnabled(!on);
  player.body.setGravityScale(on ? 0 : 1, true);
  player.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
}

/** Si siede su una giostra: niente collisioni né gravità, la posizione la decide game/rides.js. */
export function sitDown(x, y, z) {
  flying = false;
  player.seated = true;
  player.collider.setEnabled(false);
  player.body.setGravityScale(0, true);
  player.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
  Object.assign(player.seatPos, { x, y, z });
  player.body.setTranslation(player.seatPos, true);
  Object.assign(prev, player.seatPos);
}
/** Si alza dalla giostra e si ritrova in (x, y, z) (centro della capsula). */
export function standUp(x, y, z) {
  flying = false;
  player.seated = false;
  player.collider.setEnabled(true);
  player.body.setGravityScale(1, true);
  player.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
  const p = { x, y, z };
  player.body.setTranslation(p, true);
  Object.assign(prev, p);
  Object.assign(player.pos, p);
}

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
  let [lx, ly] = input.takeLook(dt);
  lx *= view.lookScale; ly *= view.lookScale; // col mirino zoomato lo sguardo è più lento e preciso
  player.lookDX = lx;
  player.lookDY = ly;
  setFlying(dev.fly && player.alive);
  if (!player.alive) return;
  player.yaw += lx;
  player.pitch = Math.max(-1.5, Math.min(1.5, player.pitch + ly));
  if (player.seated) {
    // seduti: si guarda e si spara, ma non ci si muove (il posto si muove da solo)
    player.body.setTranslation(player.seatPos, true);
    player.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    player.jumpReq = false;
    player.speed = 0;
    player.grounded = true;
    player.wantsRun = false;
    return;
  }

  const k = input.keys;
  let f = input.joy.y + input.padY, r = input.joy.x + input.padX;
  if (k.KeyW || k.ArrowUp) f += 1;
  if (k.KeyS || k.ArrowDown) f -= 1;
  if (k.KeyD || k.ArrowRight) r += 1;
  if (k.KeyA || k.ArrowLeft) r -= 1;
  const mag = Math.hypot(f, r);
  if (mag > 1) { f /= mag; r /= mag; }
  const runKey = k.ShiftLeft || k.ShiftRight || input.run || input.padRun;
  player.wantsRun = !!runKey && mag > 0.1;
  const speed = (player.aiming ? WALK_SPEED * AIM_SPEED : runKey ? RUN_SPEED : WALK_SPEED) * dev.speedMul;
  const s = Math.sin(player.yaw), c = Math.cos(player.yaw);
  const vx = (-s * f + c * r) * speed, vz = (-c * f - s * r) * speed;

  if (flying) {
    // si vola dove si guarda (guardando in alto e andando avanti si sale); Spazio sale, C/Ctrl scende
    const cp = Math.cos(player.pitch), sp = Math.sin(player.pitch);
    const fs = RUN_SPEED * 1.3 * dev.speedMul;
    let vy = f * sp * fs;
    if (k.Space) vy += fs;
    if (k.KeyC || k.ControlLeft) vy -= fs;
    player.body.setLinvel({ x: (-s * f * cp + c * r) * fs, y: vy, z: (-c * f * cp - s * r) * fs }, true);
    player.jumpReq = false;
    player.grounded = false;
    player.speed = 0;
    return;
  }

  player.grounded = checkGrounded();
  const v = player.body.linvel();
  const a = Math.min(1, (player.grounded ? 14 : 3) * dt);
  v.x += (vx - v.x) * a;
  v.z += (vz - v.z) * a;
  if (player.jumpReq && player.grounded && v.y < 3) v.y = 6.2;
  player.jumpReq = false;
  player.body.setLinvel(v, true);
  player.speed = Math.hypot(v.x, v.z);

  if (player.body.translation().y < -10) {
    player.body.setTranslation(spawn, true);
    player.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
  }
}

/** Aggiunge una spinta (velocità) al giocatore, ad esempio da un'esplosione o da un colpo. */
export function pushPlayer(dx, dy, dz) {
  const v = player.body.linvel();
  player.body.setLinvel({ x: v.x + dx, y: v.y + dy, z: v.z + dz }, true);
}

/** Rinculo dell'arma: la visuale sale in modo morbido e poi torna giù da sola. */
export function addRecoil(pitch, yaw) {
  player.recoilTarget += pitch;
  player.recoilYawTarget += yaw;
}

let shakeT = 0;
export function updateCamera(dt, alpha) {
  if (player.seated) {
    // sulla giostra la posizione arriva già liscia da game/rides.js (niente interpolazione della fisica)
    Object.assign(player.pos, player.seatPos);
  } else {
    const t = player.body.translation();
    // Interpolazione tra l'ultimo e il penultimo passo fisico: movimento fluido anche a 120 Hz
    player.pos.x = prev.x + (t.x - prev.x) * alpha;
    player.pos.y = prev.y + (t.y - prev.y) * alpha;
    player.pos.z = prev.z + (t.z - prev.z) * alpha;
  }

  const decay = Math.exp(-dt * 8);
  player.recoilTarget *= decay;
  player.recoilYawTarget *= decay;
  const follow = Math.min(1, dt * 30);
  player.recoil += (player.recoilTarget - player.recoil) * follow;
  player.recoilYaw += (player.recoilYawTarget - player.recoilYaw) * follow;

  camera.position.set(player.pos.x, player.pos.y + (player.alive ? EYE : 0.2), player.pos.z);
  camera.rotation.set(Math.min(1.55, player.pitch + player.recoil), player.yaw + player.recoilYaw, player.alive ? 0 : 0.5);
  if (player.shake > 0) {
    // scossa morbida (oscillazioni sovrapposte), non rumore casuale a ogni frame
    shakeT += dt;
    camera.position.x += (Math.sin(shakeT * 47) + Math.sin(shakeT * 29)) * 0.5 * player.shake;
    camera.position.y += (Math.sin(shakeT * 41 + 1) + Math.sin(shakeT * 23)) * 0.5 * player.shake;
    player.shake = Math.max(0, player.shake - dt * 0.8);
  }
}
