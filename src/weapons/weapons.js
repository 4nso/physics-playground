// Logica delle armi: sparo (raycast), munizioni, ricarica, rinculo, dispersione, cambio arma.
import * as THREE from 'three';
import { camera, setZoom } from '../core/renderer.js';
import { castWorld } from '../world/raycast.js';
import { addDecal } from '../world/decals.js';
import { player, addRecoil } from '../player/player.js';
import { rumble } from '../core/rumble.js';
import { WEAPONS, START_WEAPONS, MAX_SLOTS, weaponIndex, weaponStats } from './defs.js';
import { models, showModel, hideModel, kickModel, setReloadProgress, muzzleWorld, updateViewModel, setSkin } from './viewmodel.js';
import { spawnProjectile, updateProjectiles, clearProjectiles, projHooks, newPid } from './projectiles.js';
import { addTracer, impact, muzzleFlash, updateEffects } from './effects.js';
import { shotSound, reloadSound, emptySound, switchSound } from './sounds.js';
import { hud } from '../ui/hud.js';
import { damageEnemy } from '../enemies/enemies.js';

const state = {
  slots: [],      // armi in mano (indici in WEAPONS), al massimo MAX_SLOTS
  slot: 0,        // posizione dell'arma attuale in slots
  current: 0,     // indice in WEAPONS dell'arma attuale
  ammo: WEAPONS.map((w) => ({ mag: w.mag, reserve: w.reserve })),
  cooldown: 0,
  reloadT: 0,     // secondi di ricarica rimasti (0 = non sta ricaricando)
  reloadTotal: 1, // durata della ricarica in corso
  reloadMul: 1,   // potenziamento "ricarica veloce" (1 = normale)
  drawT: 0,       // secondi prima di poter sparare dopo il cambio arma
  trigger: false, // grilletto premuto (fuoco continuo)
  tap: false,     // un singolo colpo richiesto (clic senza pointer lock)
  bloom: 0,       // dispersione extra dovuta al fuoco continuo
  emptyClick: false,
  zoomed: false,  // mirino del cecchino
  levels: WEAPONS.map(() => 0), // livello del potenziatore per ogni arma (0, 1, 2)
};
/** Valori dell'arma wi con il suo livello di potenziamento. */
const stats = (wi) => weaponStats(wi, state.levels[wi]);
/**
 * Collegamenti verso gioco e rete:
 *  onEnemyHit(killed, headshot, shooterId) · onShot(origin, dirs, ends, weaponIndex)
 *  onProjectile(pid, origin, dir, weaponIndex) · isAuthority() → true se questo dispositivo decide i danni
 *  levelOf(shooterId, weaponIndex) → livello di potenziamento dell'arma di un altro giocatore (host)
 */
export const weaponHooks = { onEnemyHit: null, onShot: null, onProjectile: null, isAuthority: null, levelOf: null };
/** Mesh da ignorare negli spari (ad esempio l'oggetto che teniamo in mano). */
export const shotFilter = { ignore: null };
projHooks.onHit = (killed, owner) => { if (weaponHooks.onEnemyHit) weaponHooks.onEnemyHit(killed, false, owner); };

export const currentWeapon = () => stats(state.current);
export const currentWeaponIndex = () => state.current;
/** Armi in mano (indici in WEAPONS). */
export const ownedWeapons = () => state.slots;
export const ownsWeapon = (wi) => state.slots.includes(wi);
export const slotsFull = () => state.slots.length >= MAX_SLOTS;

export function initWeapons() {
  resetSlots();
  showModel(state.current);
  refreshHud();
}

export function setTrigger(on) {
  state.trigger = on;
  if (on) state.emptyClick = false;
}
export function tapFire() { state.tap = true; state.emptyClick = false; }

function equip(slot) {
  state.slot = slot;
  state.current = state.slots[slot];
  state.reloadT = 0;
  state.drawT = 0.3;
  state.bloom = 0;
  setZoomed(false);
  setReloadProgress(0);
  showModel(state.current);
  switchSound();
  refreshHud();
}

/** Prende l'arma nella posizione `slot` (tasti 1/2/3 o icone in alto). */
export function selectWeapon(slot) {
  if (slot < 0 || slot >= state.slots.length || slot === state.slot) return;
  equip(slot);
}
export function nextWeapon(dir) {
  const n = state.slots.length;
  if (n > 1) equip((state.slot + dir + n) % n);
}

/**
 * Dà un'arma (comprata o vinta). Se ce l'hai già, ricarica le sue munizioni.
 * Se hai già MAX_SLOTS armi, sostituisce quella in mano. Restituisce il nome dell'arma sostituita (o null).
 */
export function giveWeapon(wi) {
  const w = stats(wi);
  refillWeapon(wi);
  if (ownsWeapon(wi)) { equip(state.slots.indexOf(wi)); return null; }
  let replaced = null;
  if (state.slots.length < MAX_SLOTS) state.slots.push(wi);
  else { replaced = stats(state.slots[state.slot]).name; state.slots[state.slot] = wi; }
  hud.setSlots(state.slots.map((i) => WEAPONS[i]), state.slot);
  equip(state.slots.indexOf(wi));
  hud.flash(`${w.icon} ${w.name}!`, 1.6);
  return replaced;
}

/** Munizioni piene per un'arma. */
export function refillWeapon(wi) {
  const w = stats(wi);
  state.ammo[wi].mag = w.mag;
  state.ammo[wi].reserve = w.reserve;
  if (wi === state.current) { state.reloadT = 0; setReloadProgress(0); }
  refreshHud();
}

/** Potenziatore: l'arma wi passa al livello `level` (munizioni piene e strisce colorate). */
export function setWeaponLevel(wi, level) {
  state.levels[wi] = level;
  setSkin(wi, level);
  refillWeapon(wi);
}
export const weaponLevel = (wi) => state.levels[wi];
export const currentWeaponLevel = () => state.levels[state.current];

/** Potenziamento "ricarica veloce": mul = 1 normale, 0.8 = 20% più veloce... */
export function setReloadMul(mul) { state.reloadMul = mul; }

/** Aggiunge munizioni di riserva (raccolte da terra). */
export function addAmmo() {
  WEAPONS.forEach((w0, i) => {
    const a = state.ammo[i], w = stats(i);
    if (a.reserve !== Infinity) a.reserve = Math.min(w.reserve * 2, a.reserve + w.mag * 2);
  });
  refreshHud();
}

function resetSlots() {
  state.slots = START_WEAPONS.map(weaponIndex);
  state.slot = 0;
  state.current = state.slots[0];
  hud.setSlots(state.slots.map((i) => WEAPONS[i]), state.slot);
}

/** Nuova partita: munizioni piene, solo le armi iniziali, pistola in mano. */
export function resetWeapons() {
  state.trigger = false;
  state.reloadMul = 1;
  state.levels.fill(0);
  WEAPONS.forEach((w, i) => setSkin(i, 0));
  clearProjectiles();
  refillAmmo();
  resetSlots();
  equip(0);
}

export function reload() {
  const w = currentWeapon(), a = state.ammo[state.current];
  if (state.reloadT > 0 || state.drawT > 0 || a.mag >= w.mag || a.reserve <= 0) return;
  state.reloadTotal = w.reload * state.reloadMul;
  state.reloadT = state.reloadTotal;
  setZoomed(false);
  reloadSound(state.reloadTotal);
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
  WEAPONS.forEach((w0, i) => { const w = stats(i); state.ammo[i].mag = w.mag; state.ammo[i].reserve = w.reserve; });
  state.reloadT = 0;
  setReloadProgress(0);
  refreshHud();
}

/* ---------- Mirino con zoom (cecchino) ---------- */
function setZoomed(on) {
  const w = currentWeapon();
  on = !!(on && w.zoom);
  state.zoomed = on;
  setZoom(on ? w.zoom : 1);
  hideModel(on);
  hud.setScope(on);
}
/** Attiva o disattiva il mirino (solo per le armi che lo hanno). */
export function toggleZoom() {
  if (!currentWeapon().zoom || state.reloadT > 0) return;
  setZoomed(!state.zoomed);
}
export const hasZoom = () => !!currentWeapon().zoom;
export const isZoomed = () => state.zoomed;
/** Toglie il mirino (ad esempio quando si va in pausa o si muore). */
export function unzoom() { if (state.zoomed) setZoomed(false); }

/* ---------- Sparo ---------- */
const origin = new THREE.Vector3(), fwd = new THREE.Vector3(), right = new THREE.Vector3(), up = new THREE.Vector3();
const dir = new THREE.Vector3(), end = new THREE.Vector3(), muzzle = new THREE.Vector3(), normal = new THREE.Vector3();
const impulse = { x: 0, y: 0, z: 0 }, at = { x: 0, y: 0, z: 0 };

function currentSpread(w) {
  const air = player.grounded ? 0 : 0.03;
  const base = state.zoomed && w.zoomSpread !== undefined ? w.zoomSpread : w.spread;
  return base + state.bloom + Math.min(1, player.speed / 5.5) * w.moveSpread + air;
}

/**
 * Un pallino: raycast dal punto origin lungo dir. Mostra l'impatto e, se authority è vero
 * (partita da solo o host), applica danni e spinte. Restituisce true se ha colpito qualcosa
 * (il punto finale è in `end`).
 */
function castPellet(o, d, w, authority, shooterId) {
  const hit = castWorld(o, d, w.range, shotFilter.ignore);
  if (!hit) { end.copy(o).addScaledVector(d, w.range); return false; }
  end.copy(hit.point);
  normal.copy(hit.normal);
  const n = w.pellets > 1 ? 3 : 7;
  if (!hit.object) {
    impact(hit.point, normal, hit.surface, n + 1);
    if (!hit.hidden) addDecal(hit.point, normal, 'hole');
    return true;
  }
  const ud = hit.object.userData, obj = ud.obj, enemy = ud.enemy;
  if (enemy || ud.enemyProxy) {
    impact(hit.point, normal, 'enemy', n);
    if (enemy && authority) {
      const head = !!ud.head;
      const killed = damageEnemy(enemy, w.damage * (head ? w.headMul || 2 : 1), d, hit.point, head, w.impulse, shooterId);
      if (weaponHooks.onEnemyHit) weaponHooks.onEnemyHit(killed, head, shooterId);
    }
  } else impact(hit.point, normal, ud.surface || (obj && obj.surface) || 'stone', n + 1);
  if (obj && authority) {
    impulse.x = d.x * w.impulse; impulse.y = d.y * w.impulse; impulse.z = d.z * w.impulse;
    at.x = hit.point.x; at.y = hit.point.y; at.z = hit.point.z;
    obj.body.applyImpulseAtPoint(impulse, at, true);
  }
  return true;
}

const shotDirs = [];   // direzioni dei pallini dell'ultimo colpo (da mandare in rete)
const shotEnds = [];   // punti d'arrivo (per far vedere le scie agli altri)

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
  const authority = weaponHooks.isAuthority ? weaponHooks.isAuthority() : true;
  shotDirs.length = shotEnds.length = 0;

  if (w.projectile) {
    // granata o razzo: parte dalla canna nella direzione in cui guardi
    const r = Math.sqrt(Math.random()) * spread, a2 = Math.random() * Math.PI * 2;
    dir.copy(fwd).addScaledVector(right, Math.cos(a2) * r).addScaledVector(up, Math.sin(a2) * r).normalize();
    const pid = newPid();
    spawnProjectile(pid, state.current, muzzle, dir, 'local', authority, shotFilter.ignore, state.levels[state.current]);
    if (weaponHooks.onProjectile) weaponHooks.onProjectile(pid, muzzle, dir, state.current);
  } else for (let p = 0; p < w.pellets; p++) {
    // direzione casuale dentro un cono (distribuzione uniforme nel disco)
    const r = Math.sqrt(Math.random()) * spread, a2 = Math.random() * Math.PI * 2;
    dir.copy(fwd).addScaledVector(right, Math.cos(a2) * r).addScaledVector(up, Math.sin(a2) * r).normalize();
    const hit = castPellet(origin, dir, w, authority, 'local');
    addTracer(muzzle, end);
    shotDirs.push([dir.x, dir.y, dir.z]);
    shotEnds.push([end.x, end.y, end.z, hit ? 1 : 0]);
  }
  if (!w.projectile && weaponHooks.onShot) weaponHooks.onShot(origin, shotDirs, shotEnds, state.current);

  state.bloom = Math.min(w.maxBloom, state.bloom + w.bloom);
  addRecoil(w.recoil, (Math.random() - 0.5) * w.recoil * 0.3);
  kickModel(w.kick);
  muzzleFlash(muzzle);
  shotSound(w);
  rumble(Math.min(1, 0.15 + w.recoil * 6), 0.35, w.projectile ? 140 : 60);
  refreshHud();
  if (a.mag === 0 && a.reserve > 0) reload(); // ricarica automatica a caricatore vuoto
}

/** Host: un altro giocatore ha lanciato una granata o un razzo (qui è vero e fa danni). */
const pv = new THREE.Vector3(), pd = new THREE.Vector3();
export function resolveRemoteProjectile(shooterId, pid, o, d, wi) {
  if (!WEAPONS[wi] || !WEAPONS[wi].projectile) return;
  const lvl = weaponHooks.levelOf ? weaponHooks.levelOf(shooterId, wi) : 0;
  spawnProjectile(pid, wi, pv.set(o[0], o[1], o[2]), pd.set(d[0], d[1], d[2]).normalize(), shooterId, true, null, lvl);
  shotSound(WEAPONS[wi], 0.45);
}
/** Client: mostra la granata o il razzo di un altro giocatore (solo da vedere). */
export function showRemoteProjectile(pid, o, d, wi) {
  if (!WEAPONS[wi] || !WEAPONS[wi].projectile) return;
  spawnProjectile(pid, wi, pv.set(o[0], o[1], o[2]), pd.set(d[0], d[1], d[2]).normalize(), 'remote', false);
  shotSound(WEAPONS[wi], 0.45);
}

/**
 * Host: risolve il colpo di un altro giocatore (danni, spinte, effetti) e restituisce i punti d'arrivo.
 * o = [x,y,z] occhi del tiratore, dirs = [[dx,dy,dz], ...], wi = indice dell'arma.
 */
const remoteO = new THREE.Vector3(), remoteD = new THREE.Vector3(), remoteFrom = new THREE.Vector3();
export function resolveRemoteShot(shooterId, o, dirs, wi) {
  if (!WEAPONS[wi]) wi = 0;
  const w = weaponStats(wi, weaponHooks.levelOf ? weaponHooks.levelOf(shooterId, wi) : 0);
  remoteO.set(o[0], o[1], o[2]);
  remoteFrom.set(o[0], o[1] - 0.25, o[2]);
  const ends = [];
  for (const d of dirs.slice(0, 12)) {
    remoteD.set(d[0], d[1], d[2]).normalize();
    const hit = castPellet(remoteO, remoteD, w, true, shooterId);
    addTracer(remoteFrom, end);
    ends.push([end.x, end.y, end.z, hit ? 1 : 0]);
  }
  shotSound(w, 0.45);
  return ends;
}

/** Mostra il colpo di un altro giocatore (scie, impatti, suono) senza calcolare nulla. */
const UP = new THREE.Vector3(0, 1, 0);
export function showRemoteShot(o, ends, wi) {
  remoteFrom.set(o[0], o[1] - 0.25, o[2]);
  for (const e of ends) {
    end.set(e[0], e[1], e[2]);
    addTracer(remoteFrom, end);
    if (e[3]) {
      // il foro sul muro: un raggio corto verso il punto colpito per sapere com'è girata la superficie
      remoteD.copy(end).sub(remoteFrom);
      const len = remoteD.length();
      remoteD.divideScalar(len || 1);
      const h = castWorld(remoteFrom, remoteD, len + 0.3);
      if (h && !h.object && !h.hidden && h.point.distanceToSquared(end) < 0.09) {
        impact(end, h.normal, h.surface, 4);
        addDecal(h.point, h.normal, 'hole');
      } else impact(end, UP, 'stone', 4);
    }
  }
  shotSound(WEAPONS[wi] || WEAPONS[0], 0.45);
}

export function updateWeapons(dt, lookDX, lookDY) {
  const w = currentWeapon(), a = state.ammo[state.current];
  state.cooldown -= dt;
  state.drawT = Math.max(0, state.drawT - dt);
  state.bloom *= Math.exp(-dt * 4);

  if (state.reloadT > 0) {
    state.reloadT -= dt;
    const prog = 1 - Math.max(0, state.reloadT) / state.reloadTotal;
    setReloadProgress(prog);
    hud.setReload(prog);
    if (state.reloadT <= 0) { state.reloadT = 0; finishReload(); }
  }

  const wantFire = state.trigger || state.tap;
  state.tap = false;
  if (wantFire && state.cooldown <= 0 && state.drawT <= 0 && state.reloadT <= 0) {
    if (a.mag > 0) shoot();
    else if (a.reserve > 0) reload();
    else if (!state.emptyClick) { emptySound(); state.emptyClick = true; state.cooldown = 0.3; }
  }

  if (state.zoomed && !player.alive) setZoomed(false);
  updateViewModel(dt, player.speed, player.grounded, lookDX, lookDY);
  updateEffects(dt);
  updateProjectiles(dt);

  // Mirino: la distanza delle stanghette mostra la dispersione attuale
  const px = (Math.tan(currentSpread(w)) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) * (innerHeight / 2);
  hud.setSpread(4 + px);
}

function refreshHud() {
  const w = currentWeapon(), a = state.ammo[state.current];
  hud.setWeapon(state.slot, w.name, a.mag, a.reserve, state.reloadT > 0);
  hud.setZoomButton(!!w.zoom);
}

export { models };
