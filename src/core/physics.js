// Mondo fisico Rapier: inizializzazione, passo a tempo fisso, suoni degli urti.
import RAPIER from '@dimforge/rapier3d-compat';
import { thud } from './audio.js';

export { RAPIER };
export let world = null;
let eventQueue = null;

const STEP = 1 / 60;
const MAX_STEPS = 4;
let acc = 0;

/** Frazione (0..1) di passo fisico non ancora simulata: serve per interpolare le posizioni. */
export let alpha = 0;

/** Gruppi di collisione: [appartenenza << 16] | filtro. */
const G = { STATIC: 1, PLAYER: 2, ENEMY: 4, OBJECT: 8, DEBRIS: 16 };
const groups = (member, filter) => ((member & 0xffff) << 16) | (filter & 0xffff);
export const GROUPS = {
  player: groups(G.PLAYER, 0xffff),
  enemy: groups(G.ENEMY, 0xffff),
  // i pezzi dei nemici distrutti non ostacolano giocatore e nemici
  debris: groups(G.DEBRIS, G.STATIC | G.OBJECT | G.DEBRIS),
};

const beforeStep = [];
/** Funzione chiamata prima di ogni passo fisico (per ricordare le posizioni precedenti). */
export function onBeforeStep(fn) { beforeStep.push(fn); }

/** Collider (handle) → funzione(altroHandle) chiamata quando inizia un contatto. */
export const contactHandlers = new Map();

/** Velocità di un oggetto rumoroso un attimo prima dell'ultimo passo (0 se sconosciuto). */
export function prevSpeed(handle) {
  const s = sounding.get(handle);
  return s ? Math.hypot(s.vx, s.vy, s.vz) : 0;
}

/** Collider (handle) → { body, freq }: chi fa rumore quando urta. */
const sounding = new Map();

export async function initPhysics() {
  await RAPIER.init();
  world = new RAPIER.World({ x: 0, y: -9.82, z: 0 });
  world.timestep = STEP;
  eventQueue = new RAPIER.EventQueue(true);
}

/** Registra un collider che emette un "toc" quando sbatte contro qualcosa. */
export function addSound(collider, body, freq) {
  collider.setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
  sounding.set(collider.handle, { body, freq, vx: 0, vy: 0, vz: 0 });
}
export function removeSound(collider) {
  sounding.delete(collider.handle);
}

function rememberVelocities() {
  for (const s of sounding.values()) {
    if (s.body.isSleeping()) { s.vx = s.vy = s.vz = 0; continue; }
    const v = s.body.linvel();
    s.vx = v.x; s.vy = v.y; s.vz = v.z;
  }
}

function onCollision(h1, h2, started) {
  if (!started) return;
  const c1 = contactHandlers.get(h1), c2 = contactHandlers.get(h2);
  if (c1) c1(h2);
  if (c2) c2(h1);
  const a = sounding.get(h1), b = sounding.get(h2);
  const s = a || b;
  if (!s) return;
  // Velocità d'urto: differenza tra le velocità dei due corpi un attimo prima del contatto.
  let dx = a ? a.vx : 0, dy = a ? a.vy : 0, dz = a ? a.vz : 0;
  if (b) { dx -= b.vx; dy -= b.vy; dz -= b.vz; }
  const v = Math.hypot(dx, dy, dz);
  if (v > 1.5) thud(v * 0.03, s.freq * (0.85 + Math.random() * 0.3));
}

/** Fa avanzare la fisica di dt secondi con passi fissi da 1/60 s. */
export function stepPhysics(dt) {
  acc += dt;
  let n = 0;
  while (acc >= STEP && n < MAX_STEPS) {
    rememberVelocities();
    for (const fn of beforeStep) fn();
    world.step(eventQueue);
    eventQueue.drainCollisionEvents(onCollision);
    acc -= STEP;
    n++;
  }
  if (n === MAX_STEPS) acc = 0;
  alpha = acc / STEP;
}
