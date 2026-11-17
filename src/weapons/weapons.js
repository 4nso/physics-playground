// Logica delle armi: sparo (raycast), munizioni, ricarica, rinculo, dispersione, cambio arma.
import * as THREE from 'three';
import { camera } from '../core/renderer.js';
import { pickables } from '../world/arena.js';
import { player, addRecoil } from '../player/player.js';
import { WEAPONS } from './defs.js';
import { models, showModel, kickModel, setReloadProgress, muzzleWorld, updateViewModel } from './viewmodel.js';
import { addTracer, impact, muzzleFlash, updateEffects } from './effects.js';
import { shotSound, reloadSound, emptySound, switchSound } from './sounds.js';
import { hud } from '../ui/hud.js';
import { damageEnemy } from '../enemies/enemies.js';

const state = {
  current: 0,
  ammo: WEAPONS.map((w) => ({ mag: w.mag, reserve: w.reserve })),
  cooldown: 0,
  reloadT: 0,     // secondi di ricarica rimasti (0 = non sta ricaricando)
  drawT: 0,       // secondi prima di poter sparare dopo il cambio arma
  trigger: false, // grilletto premuto (fuoco continuo)
  tap: false,     // un singolo colpo richiesto (clic senza pointer lock)
  bloom: 0,       // dispersione extra dovuta al fuoco continuo
  emptyClick: false,
  unlocked: WEAPONS.map((w) => w.unlockRound <= 1),
};
/** Avviso verso il gioco quando un colpo prende un nemico: onEnemyHit(killed, headshot) */
export const weaponHooks = { onEnemyHit: null };
/** Mesh da ignorare negli spari (ad esempio l'oggetto che teniamo in mano). */
export const shotFilter = { ignore: null };

export const currentWeapon = () => WEAPONS[state.current];

export function initWeapons() {
  hud.buildWeaponSlots(WEAPONS);
  hud.setLocked(state.unlocked);
  showModel(state.current);
  refreshHud();
}

export function setTrigger(on) {
  state.trigger = on;
  if (on) state.emptyClick = false;
}
export function tapFire() { state.tap = true; state.emptyClick = false; }

export function selectWeapon(i) {
  if (i < 0 || i >= WEAPONS.length || i === state.current) return;
  if (!state.unlocked[i]) { hud.flash(`🔒 ${WEAPONS[i].name}: dal round ${WEAPONS[i].unlockRound}`); return; }
  state.current = i;
  state.reloadT = 0;
  state.drawT = 0.3;
  state.bloom = 0;
  setReloadProgress(0);
  showModel(i);
  switchSound();
  refreshHud();
}
export function nextWeapon(dir) {
  let i = state.current;
  for (let k = 0; k < WEAPONS.length; k++) {
    i = (i + dir + WEAPONS.length) % WEAPONS.length;
    if (state.unlocked[i]) break;
  }
  selectWeapon(i);
}

/** Sblocca le armi disponibili a questo round. Restituisce i nomi di quelle appena sbloccate. */
export function unlockForRound(round) {
  const fresh = [];
  WEAPONS.forEach((w, i) => {
    if (!state.unlocked[i] && w.unlockRound <= round) { state.unlocked[i] = true; fresh.push(w.name); }
  });
  hud.setLocked(state.unlocked);
  return fresh;
}

/** Aggiunge munizioni di riserva (raccolte da terra). */
export function addAmmo() {
  WEAPONS.forEach((w, i) => {
    const a = state.ammo[i];
    if (a.reserve !== Infinity) a.reserve = Math.min(w.reserve * 2, a.reserve + w.mag * 2);
  });
  refreshHud();
}

/** Nuova partita: munizioni piene, solo le armi iniziali, pistola in mano. */
export function resetWeapons() {
  state.unlocked = WEAPONS.map((w) => w.unlockRound <= 1);
  hud.setLocked(state.unlocked);
  state.trigger = false;
  refillAmmo();
  if (state.current !== 0) selectWeapon(0);
}

export function reload() {
  const w = currentWeapon(), a = state.ammo[state.current];
  if (state.reloadT > 0 || state.drawT > 0 || a.mag >= w.mag || a.reserve <= 0) return;
  state.reloadT = w.reload;
  reloadSound(w.reload);
  refreshHud();
}

function finishReload() {
  const w = currentWeapon(), a = state.ammo[state.current];
  const n = Math.min(w.mag - a.mag, a.reserve);
  a.mag += n;
  if (a.reserve !== Infinity) a.reserve -= n;
  setReloadProgress(0);
  refreshHud();
}

/** Ricarica tutte le armi al massimo (usato quando si ricomincia). */
export function refillAmmo() {
  WEAPONS.forEach((w, i) => { state.ammo[i].mag = w.mag; state.ammo[i].reserve = w.reserve; });
  state.reloadT = 0;
  setReloadProgress(0);
  refreshHud();
}

/* ---------- Sparo ---------- */
const raycaster = new THREE.Raycaster();
const origin = new THREE.Vector3(), fwd = new THREE.Vector3(), right = new THREE.Vector3(), up = new THREE.Vector3();
const dir = new THREE.Vector3(), end = new THREE.Vector3(), muzzle = new THREE.Vector3(), normal = new THREE.Vector3();
const impulse = { x: 0, y: 0, z: 0 }, at = { x: 0, y: 0, z: 0 };

function currentSpread(w) {
  const air = player.grounded ? 0 : 0.03;
  return w.spread + state.bloom + Math.min(1, player.speed / 5.5) * w.moveSpread + air;
}

function shoot() {
  const w = currentWeapon(), a = state.ammo[state.current];
  a.mag--;
  state.cooldown = w.rate;
  camera.updateMatrixWorld();
  const e = camera.matrixWorld.elements;
  right.set(e[0], e[1], e[2]);
  up.set(e[4], e[5], e[6]);
  fwd.set(-e[8], -e[9], -e[10]);
  origin.setFromMatrixPosition(camera.matrixWorld);
  muzzleWorld(muzzle);
  const spread = Math.tan(currentSpread(w));

  for (let p = 0; p < w.pellets; p++) {
    // direzione casuale dentro un cono (distribuzione uniforme nel disco)
    const r = Math.sqrt(Math.random()) * spread, a2 = Math.random() * Math.PI * 2;
    dir.copy(fwd).addScaledVector(right, Math.cos(a2) * r).addScaledVector(up, Math.sin(a2) * r).normalize();
    raycaster.set(origin, dir);
    raycaster.far = w.range;
    const hits = raycaster.intersectObjects(pickables, false);
    let hit = null;
    for (const h of hits) if (h.object !== shotFilter.ignore) { hit = h; break; }
    if (hit) {
      end.copy(hit.point);
      if (hit.face) normal.copy(hit.face.normal).transformDirection(hit.object.matrixWorld);
      else normal.copy(dir).negate();
      const obj = hit.object.userData.obj, enemy = hit.object.userData.enemy;
      if (enemy) {
        const head = !!hit.object.userData.head;
        impact(hit.point, normal, 'enemy', w.pellets > 1 ? 3 : 7);
        const killed = damageEnemy(enemy, w.damage * (head ? 2 : 1), dir, hit.point, head, w.impulse);
        if (weaponHooks.onEnemyHit) weaponHooks.onEnemyHit(killed, head);
      } else impact(hit.point, normal, hit.object.userData.surface || (obj && obj.surface) || 'stone', w.pellets > 1 ? 4 : 9);
      if (obj) {
        impulse.x = dir.x * w.impulse; impulse.y = dir.y * w.impulse; impulse.z = dir.z * w.impulse;
        at.x = hit.point.x; at.y = hit.point.y; at.z = hit.point.z;
        obj.body.applyImpulseAtPoint(impulse, at, true);
      }
    } else {
      end.copy(origin).addScaledVector(dir, w.range);
    }
    addTracer(muzzle, end);
  }

  state.bloom = Math.min(w.maxBloom, state.bloom + w.bloom);
  addRecoil(w.recoil, (Math.random() - 0.5) * w.recoil * 0.3);
  kickModel(w.kick);
  muzzleFlash(muzzle);
  shotSound(w);
  refreshHud();
  if (a.mag === 0 && a.reserve > 0) reload(); // ricarica automatica a caricatore vuoto
}

export function updateWeapons(dt, lookDX, lookDY) {
  const w = currentWeapon(), a = state.ammo[state.current];
  state.cooldown -= dt;
  state.drawT = Math.max(0, state.drawT - dt);
  state.bloom *= Math.exp(-dt * 4);

  if (state.reloadT > 0) {
    state.reloadT -= dt;
    setReloadProgress(1 - Math.max(0, state.reloadT) / w.reload);
    hud.setReload(1 - Math.max(0, state.reloadT) / w.reload);
    if (state.reloadT <= 0) { state.reloadT = 0; finishReload(); }
  }

  const wantFire = state.trigger || state.tap;
  state.tap = false;
  if (wantFire && state.cooldown <= 0 && state.drawT <= 0 && state.reloadT <= 0) {
    if (a.mag > 0) shoot();
    else if (a.reserve > 0) reload();
    else if (!state.emptyClick) { emptySound(); state.emptyClick = true; state.cooldown = 0.3; }
  }

  updateViewModel(dt, player.speed, player.grounded, lookDX, lookDY);
  updateEffects(dt);

  // Mirino: la distanza delle stanghette mostra la dispersione attuale
  const px = (Math.tan(currentSpread(w)) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) * (innerHeight / 2);
  hud.setSpread(4 + px);
}

function refreshHud() {
  const w = currentWeapon(), a = state.ammo[state.current];
  hud.setWeapon(state.current, w.name, a.mag, a.reserve, state.reloadT > 0);
}

export { models };
