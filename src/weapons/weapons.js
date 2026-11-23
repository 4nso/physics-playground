// Logica delle armi: sparo (raycast), munizioni, ricarica, rinculo, dispersione, cambio arma.
import * as THREE from 'three';
import { camera, setZoom } from '../core/renderer.js';
import { castWorld } from '../world/raycast.js';
import { addDecal } from '../world/decals.js';
import { player, addRecoil } from '../player/player.js';
import { rumble } from '../core/rumble.js';
import { WEAPONS, START_WEAPONS, MAX_SLOTS, weaponIndex, weaponStats } from './defs.js';
import { models, showModel, hideModel, kickModel, swingModel, altMuzzle, setReloadProgress, setAimAmount, muzzleWorld, updateViewModel, setSkin } from './viewmodel.js';
import { settings } from '../ui/settings.js';
import { spawnProjectile, updateProjectiles, clearProjectiles, projHooks, newPid } from './projectiles.js';
import { addTracer, impact, muzzleFlash, updateEffects } from './effects.js';
import { shotSound, reloadSound, emptySound, switchSound } from './sounds.js';
import { hud } from '../ui/hud.js';
import { damageEnemy } from '../enemies/enemies.js';
import { dev } from '../core/devmode.js';

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
  burstLeft: 0,   // colpi che mancano nella raffica in corso (mitra a tripletta)
  burstT: 0,
  swingDir: 1,    // il fendente va una volta da destra e una da sinistra
  zoomed: false,  // mirino del cecchino
  aimWant: false, // mira di precisione richiesta (tasto destro)
  aim: 0,         // avanzamento della mira: 0 = normale, 1 = si guarda attraverso le tacche
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
  state.burstLeft = 0;
  setZoomed(false);
  stopAim();
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
    if (w.noPickup) return; // raygun: solo alla bancarella delle munizioni
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
  state.aimWant = false; // la ricarica interrompe la mira
  reloadSound(state.reloadTotal);
  refreshHud();
}

function finishReload() {
  const w = currentWeapon(), a = state.ammo[state.current];
  const n = Math.min(w.mag - a.mag, a.reserve);
  a.mag += n;
  if (a.reserve !== Infinity && !dev.infAmmo) a.reserve -= n; // munizioni infinite: la riserva resta
  setReloadProgress(0);
  refreshHud();
}

/** Le armi in mano hanno già tutte le munizioni al massimo? (bancarella delle munizioni) */
export function allAmmoFull() {
  return state.slots.every((wi) => { const w = stats(wi); return state.ammo[wi].mag >= w.mag && state.ammo[wi].reserve >= w.reserve; });
}
/** Riempie tutte le armi in mano (bancarella delle munizioni). */
export function refillOwned() {
  for (const wi of state.slots) refillWeapon(wi);
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
/** Toglie il mirino e la mira (ad esempio quando si va in pausa o si muore). */
export function unzoom() { if (state.zoomed) setZoomed(false); stopAim(); }

/* ---------- Mira di precisione col tasto destro (fase 13, solo PC) ---------- */
const AIM_TIME = 0.2; // secondi per portare l'arma al centro
let zoomByMouse = false; // mirino del cecchino aperto tenendo premuto il tasto destro
/** Smette subito di mirare (cambio arma, pausa, fine partita). */
function stopAim() {
  state.aimWant = false;
  state.aim = 0;
  zoomByMouse = false;
  setAimAmount(0);
  if (!state.zoomed) setZoom(1);
  hud.setAim(0);
}
/** Quanto la mira è "dentro", con la transizione morbida (0..1). */
const aimK = () => state.aim * state.aim * (3 - 2 * state.aim);
/**
 * Tasto destro premuto (on = true) o rilasciato. Con "tieni premuto" si mira finché è giù,
 * con "premi per attivare" ogni pressione accende o spegne. Il cecchino usa il suo mirino.
 */
export function aimButton(on) {
  const w = currentWeapon(), toggle = settings.aimMode === 'toggle';
  if (w.zoom) {
    if (toggle) { if (on) toggleZoom(); return; }
    if (on && !state.zoomed) { toggleZoom(); zoomByMouse = state.zoomed; } else if (!on && zoomByMouse) { zoomByMouse = false; if (state.zoomed) setZoomed(false); }
    return;
  }
  if (!w.ads) return;
  if (toggle) { if (on) state.aimWant = !state.aimWant; } else state.aimWant = on;
}
/** Il mouse è stato liberato o la finestra ha perso il fuoco: con "tieni premuto" si smette di mirare. */
export function aimReleaseAll() {
  if (settings.aimMode === 'toggle') return;
  state.aimWant = false;
  if (zoomByMouse) { zoomByMouse = false; if (state.zoomed) setZoomed(false); }
}
export const isAiming = () => state.aimWant;

function updateAim(dt, w) {
  const ads = w.ads;
  // ricarica, corsa o morte interrompono la mira
  if (state.aimWant && (!ads || state.reloadT > 0 || player.wantsRun || !player.alive)) state.aimWant = false;
  player.aiming = state.aimWant;
  const prev = state.aim, step = dt / AIM_TIME;
  state.aim = state.aimWant ? Math.min(1, state.aim + step) : Math.max(0, state.aim - step);
  if (state.aim === prev && (state.aim === 0 || state.aim === 1)) return;
  const k = aimK();
  setAimAmount(state.aim);
  if (!state.zoomed) setZoom(1 + ((ads ? ads.zoom : 1) - 1) * k); // anche la sensibilità scende con lo zoom
  hud.setAim(ads && !ads.light ? k : 0); // con le tacche il mirino a croce sparisce
}

/* ---------- Sparo ---------- */
const origin = new THREE.Vector3(), fwd = new THREE.Vector3(), right = new THREE.Vector3(), up = new THREE.Vector3();
const dir = new THREE.Vector3(), end = new THREE.Vector3(), muzzle = new THREE.Vector3(), normal = new THREE.Vector3();
const impulse = { x: 0, y: 0, z: 0 }, at = { x: 0, y: 0, z: 0 };

function currentSpread(w) {
  const air = player.grounded ? 0 : 0.03;
  const base = state.zoomed && w.zoomSpread !== undefined ? w.zoomSpread : w.spread;
  // mirando resta solo una parte della dispersione (anche di quella dovuta al movimento)
  const aim = w.ads ? 1 - (1 - w.ads.spread) * aimK() : 1;
  return (base + state.bloom + Math.min(1, player.speed / 5.5) * w.moveSpread) * aim + air;
}

/**
 * Un pallino: raycast dal punto origin lungo dir. Mostra l'impatto e, se authority è vero
 * (partita da solo o host), applica danni e spinte. Restituisce true se ha colpito qualcosa
 * (il punto finale è in `end`).
 */
function castPellet(o, d, w, authority, shooterId, hitSet = null) {
  const hit = castWorld(o, d, w.range, shotFilter.ignore);
  if (!hit) { end.copy(o).addScaledVector(d, w.range); return false; }
  end.copy(hit.point);
  normal.copy(hit.normal);
  const n = w.pellets > 1 || w.melee ? 3 : 7;
  if (!hit.object) {
    if (hitSet && hitSet.has('wall')) return true; // corpo a corpo: una sola scintilla sul muro
    if (hitSet) hitSet.add('wall');
    impact(hit.point, normal, hit.surface, n + 1);
    if (!hit.hidden && !w.melee) addDecal(hit.point, normal, 'hole');
    return true;
  }
  const ud = hit.object.userData, obj = ud.obj, enemy = ud.enemy;
  // corpo a corpo: ogni nemico (o oggetto) si colpisce una volta sola per fendente
  const key = enemy || ud.enemyProxy || obj;
  if (hitSet && key) { if (hitSet.has(key)) return true; hitSet.add(key); }
  if (enemy || ud.enemyProxy) {
    impact(hit.point, normal, 'enemy', w.melee ? 10 : n);
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

const meleeSet = new Set();
/** Direzioni del ventaglio di un colpo corpo a corpo (in shotDirs). */
function meleeDirs(w) {
  const M = w.melee;
  for (let row = 0; row < M.rows; row++) {
    const pitch = -0.22 * row; // una fila dritta e una un po' più in basso (nemici bassi, teste vicine)
    for (let i = 0; i < M.rays; i++) {
      const yaw = M.rays > 1 ? -M.arc / 2 + (M.arc * i) / (M.rays - 1) : 0;
      dir.copy(fwd).multiplyScalar(Math.cos(yaw)).addScaledVector(right, Math.sin(yaw)).addScaledVector(up, Math.tan(pitch)).normalize();
      shotDirs.push([dir.x, dir.y, dir.z]);
    }
  }
}

/** Grilletto: un colpo, una raffica (tripletta) o un fendente. */
function shoot() {
  const w = currentWeapon();
  state.cooldown = w.rate;
  if (w.burst) { state.burstLeft = w.burst - 1; state.burstT = w.burstGap; }
  fireRound();
}

function fireRound() {
  const w = currentWeapon(), a = state.ammo[state.current];
  if (!dev.noReload) a.mag--; // modalità sviluppatore "niente ricarica": il caricatore non cala
  camera.updateMatrixWorld();
  const e = camera.matrixWorld.elements;
  right.set(e[0], e[1], e[2]);
  up.set(e[4], e[5], e[6]);
  fwd.set(-e[8], -e[9], -e[10]);
  origin.setFromMatrixPosition(camera.matrixWorld);
  if (w.dual) altMuzzle(); // uzi doppia: una volta la destra, una la sinistra
  muzzleWorld(muzzle);
  const spread = Math.tan(currentSpread(w));
  const authority = weaponHooks.isAuthority ? weaponHooks.isAuthority() : true;
  shotDirs.length = shotEnds.length = 0;

  if (w.melee) {
    meleeDirs(w);
    meleeSet.clear();
    for (const d of shotDirs) {
      dir.set(d[0], d[1], d[2]);
      const hit = castPellet(origin, dir, w, authority, 'local', meleeSet);
      shotEnds.push([end.x, end.y, end.z, hit ? 1 : 0]);
    }
  } else if (w.projectile) {
    // granata, razzo o raggio verde: parte dalla canna nella direzione in cui guardi
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
  const rk = w.ads ? 1 - (1 - w.ads.recoil) * aimK() : 1; // mirando la visuale sale meno
  addRecoil(w.recoil * rk, (Math.random() - 0.5) * w.recoil * 0.3 * rk);
  if (w.melee) { state.swingDir = -state.swingDir; swingModel(w.melee.swing, state.swingDir); }
  else { kickModel(w.kick * (0.5 + 0.5 * rk)); muzzleFlash(muzzle); }
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
  const set = w.melee ? new Set() : null;
  for (const d of dirs.slice(0, 20)) {
    remoteD.set(d[0], d[1], d[2]).normalize();
    const hit = castPellet(remoteO, remoteD, w, true, shooterId, set);
    if (!w.melee) addTracer(remoteFrom, end);
    ends.push([end.x, end.y, end.z, hit ? 1 : 0]);
  }
  shotSound(w, 0.45);
  return ends;
}

/** Mostra il colpo di un altro giocatore (scie, impatti, suono) senza calcolare nulla. */
const UP = new THREE.Vector3(0, 1, 0);
export function showRemoteShot(o, ends, wi) {
  remoteFrom.set(o[0], o[1] - 0.25, o[2]);
  if (WEAPONS[wi] && WEAPONS[wi].melee) { shotSound(WEAPONS[wi], 0.45); return; } // fendente: solo il suono
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

  // raffica in corso (mitra a tripletta): i colpi successivi arrivano da soli
  if (state.burstLeft > 0) {
    state.burstT -= dt;
    if (state.burstT <= 0) {
      if (a.mag > 0 && state.reloadT <= 0 && player.alive) { fireRound(); state.burstLeft--; state.burstT = w.burstGap; }
      else state.burstLeft = 0;
    }
  }

  const wantFire = state.trigger || state.tap;
  state.tap = false;
  if (dev.infAmmo && a.reserve < w.mag) { a.reserve = w.reserve; refreshHud(); }
  if (wantFire && state.cooldown <= 0 && state.drawT <= 0 && state.reloadT <= 0) {
    if (a.mag > 0) shoot();
    else if (a.reserve > 0) reload();
    else if (!state.emptyClick) { emptySound(); state.emptyClick = true; state.cooldown = 0.3; }
  }

  if (state.zoomed && !player.alive) setZoomed(false);
  updateAim(dt, w);
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
