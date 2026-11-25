// Avvio del gioco e ciclo principale.
import './style.css';
import { renderer, scene, camera, followSun, isTouch } from './core/renderer.js';
import { initPhysics, stepPhysics, alpha } from './core/physics.js';
import { setupInput, requestLock } from './core/input.js';
import { setupGamepad, updateGamepad, onPadMode } from './core/gamepad.js';
import { initAudio } from './core/audio.js';
import { buildWorld, map } from './world/map.js';
import { nav } from './world/nav.js';
import { randomSeed } from './world/rng.js';
import { minimap, bigmap } from './ui/minimap.js';
import { enemies } from './enemies/enemies.js';
import { forEachProxy } from './net/proxies.js';
import { syncObjects, updateRope } from './world/objects.js';
import { player, createPlayer, resetPlayer, updatePlayer, updateCamera, jump } from './player/player.js';
import { throwHeld, toggleGrab, updateHeld, updateCrosshair, isHolding } from './player/interact.js';
import { weaponScene } from './weapons/viewmodel.js';
import { initWeapons, updateWeapons, setTrigger, tapFire, reload, selectWeapon, nextWeapon, toggleZoom, isZoomed, aimButton, aimReleaseAll } from './weapons/weapons.js';
import { updateShop, toggleShopping, closeShopping, isShopping, padShopInteract, padShopping, padShopMove, padShopBuy, shopAction, touchShopAction } from './game/shop.js';
import { updateSafeZones } from './game/safezone.js';
import { updateExit, exitAction, exitActionButton } from './game/exitgate.js';
import { updateUnderground } from './world/underground.js';
import { updateCoffins, coffinAction, coffinActionButton } from './game/coffins.js';
import { updateAntiCamp, antiCamp } from './game/anticamp.js';
import { updateCemetery, inCemetery, graveSpawn } from './world/cemetery.js';
import { zombieView } from './enemies/model.js';
import { enemyHooks } from './enemies/enemies.js';
import { updateRides, rideAction, rideNearKind, rideActionButton } from './game/rides.js';
import { updateEnemies } from './enemies/enemies.js';
import { initGallery, openGallery } from './faces/gallery.js';
import { updatePickups } from './game/pickups.js';
import { buildLevel } from './game/level.js';
import { game, pauseGame, resumeGame, updateGame, showRecord, teamTargets, team, myMoney } from './game/game.js';
import { net } from './net/net.js';
import { startMatch, openCreateRoom, openJoin, joinWithCode, leaveToMenu, netBeforePhysics, netUpdate, shareInvite, joinFromLink } from './net/sync.js';
import { hud } from './ui/hud.js';
import { initSettings } from './ui/settings.js';
import { quality, updateQuality, LEVEL_NAMES } from './core/quality.js';
import { renderFrame } from './core/post.js';
import { updateSky } from './core/sky.js';
import { updateDayNight } from './game/daynight.js';
import { updateWorldMat, tickWater } from './world/worldMaterial.js';
import { updateDecals } from './world/decals.js';
import { updateDust } from './world/dust.js';
import { initMobile } from './ui/mobile.js';
import { prof, profBegin, mark, profEnd, profText } from './core/prof.js';
import { dev, devHooks, setDevMode, devFromUrl } from './core/devmode.js';
import { holdEnemies } from './enemies/enemies.js';

const $ = (id) => document.getElementById(id);
let last = performance.now();
let shadowFrame = false;
const aliveTargets = []; // riusato a ogni frame
const underMe = { x: 0, y: 0, z: 0, ground: false }; // per i suoni sotto terra
renderer.autoClear = false;

// Il grilletto lancia l'oggetto in mano, se ce n'è uno; altrimenti spara.
let triggerBlocked = false;
const actions = {
  trigger(on) {
    if (on && throwHeld()) { triggerBlocked = true; return; }
    if (!on) triggerBlocked = false;
    if (!triggerBlocked && player.alive) setTrigger(on);
  },
  tap() { if (!throwHeld() && player.alive) tapFire(); },
  reload,
  weapon: selectWeapon,
  nextWeapon,
  grab() { if (net.mode !== 'client' && player.alive && !player.seated) { setTrigger(false); toggleGrab(); } },
  // pulsante d'azione touch: fa quello che mostra (vedi touchAction più sotto)
  act() {
    const a = curAction;
    if (!a || game.state !== 'playing' || !player.alive) return;
    if (a.id === 'exitOpen') exitAction();
    else if (a.id === 'raygun') coffinAction();
    else if (a.kind === 'ride') actions.ride(a.id === 'start' || a.id === 'stop' ? 'toggle' : 'seat');
    else if (a.kind === 'shop') touchShopAction();
    else if (a.id === 'throw') throwHeld();
    else actions.grab();
  },
  // tasto destro: mira di precisione (cecchino: il suo mirino). Afferrare su PC è solo il tasto E.
  aim(on) { if (!on || (player.alive && game.state === 'playing' && !game.overlay)) aimButton(on); },
  aimRelease: aimReleaseAll,
  zoom() { if (player.alive) toggleZoom(); },
  shop: toggleShopping,
  // F: giostra (sali/scendi), oppure il cancello EXIT se ci sei davanti
  ride(what) {
    if (game.state !== 'playing') return;
    if (what === 'seat' && !rideNearKind() && (exitAction() || coffinAction())) return;
    rideAction(what);
  },
  jump,
  pause() { if (closeShopping()) { requestLock(); return; } bigmap.close(); pauseGame(); },
  map() { if (game.state === 'playing' && !game.overlay) bigmap.toggle(); },
  // il mouse liberato per comprare non mette in pausa
  lockLost() { if (game.state === 'playing' && game.phase !== 'dead' && !isShopping() && !dev.panelOpen) pauseGame(); },
};

/* ---------- Touch: pulsante d'azione contestuale (docs/DESIGN.md → "Controlli touch") ---------- */
// Ordine: Scendi, Lancia, giostra (cabina o posto), negozio/cassa/potenziatore, Afferra.
const ACT_THROW = { id: 'throw', icon: '🤾', label: 'Lancia', kind: 'throw' };
const ACT_GRAB = { id: 'grab', icon: '✋', label: 'Afferra', kind: '' };
let curAction = null;
function touchAction(canGrab) {
  if (game.state !== 'playing' || game.overlay || !player.alive) return null;
  const k = rideNearKind();
  if (k === 'seat') return rideActionButton();
  if (isHolding()) return ACT_THROW;
  if (k) return rideActionButton();
  const ex = exitActionButton() || coffinActionButton();
  if (ex) return ex;
  const s = shopAction();
  if (s) return s;
  return canGrab && net.mode !== 'client' ? ACT_GRAB : null;
}

/* ---------- Controller: azioni in più rispetto a tastiera e touch ---------- */
const esc = (t) => String(t).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const padHooks = {
  // B: giostra (sali/scendi, avvia/ferma), altrimenti negozio, altrimenti afferra/lascia
  interact() {
    const k = rideNearKind();
    if (k) { actions.ride(k === 'ctrl' ? 'toggle' : 'seat'); return; }
    if (exitAction() || coffinAction()) return;
    if (padShopInteract()) return;
    actions.grab();
  },
  shopActive: padShopping,
  shopMove: padShopMove,
  shopBuy: padShopBuy,
  rideSpeed() { if (rideNearKind() === 'ctrl') actions.ride('speed'); },
  zoomed: isZoomed,
  eachEnemy: (fn) => eachEnemy(fn),
  // ⧉: mappa grande (sotto ci sono le statistiche della partita)
  stats() { if (game.state === 'playing') bigmap.toggle(); },
};

function loop(now) {
  requestAnimationFrame(loop);
  const rawDt = Math.max(0, (now - last) / 1000);
  // modalità sviluppatore: il tempo può andare più piano o più veloce (×0,25 … ×2)
  const dt = Math.min(0.05, rawDt) * dev.timeScale;
  last = now;
  profBegin();
  const playing = game.state === 'playing';
  updateQuality(rawDt, playing && !game.overlay);
  showFps(rawDt);
  const gdt = playing ? dt : 0;
  const authority = net.mode !== 'client'; // da solo o host: qui si simula tutto

  updateRides(gdt, authority, playing && !game.overlay); // prima del giocatore: chi è seduto segue il posto
  mark('giostre');
  updateGamepad(dt);
  if (playing) {
    updatePlayer(dt);
    updateHeld();
    netBeforePhysics(dt);
    mark('giocatore');
    stepPhysics(dt);
  }
  mark('fisica');
  syncObjects();
  updateRope();
  updateCamera(gdt, alpha);
  followSun(player.pos.x, player.pos.z);
  mark('giocatore');
  if (authority) {
    const targets = teamTargets();
    // modalità sviluppatore "Ferma zombi": nemici immobili, il resto del mondo continua
    updateEnemies(dev.freeze ? 0 : gdt, alpha, playing && !dev.freeze, targets);
    if (dev.freeze && playing) holdEnemies();
    mark('nemici');
    aliveTargets.length = 0;
    for (const t of targets) if (t.alive) aliveTargets.push(t);
    updatePickups(gdt, playing ? aliveTargets : null);
    updateGame(gdt);
  } else {
    updatePickups(gdt, null);
  }
  mark('partita');
  updateWeapons(gdt, player.lookDX, player.lookDY);
  mark('armi');
  updateShop(dt, playing && !game.overlay, myMoney());
  updateSafeZones(gdt, playing);
  updateExit(gdt, authority, playing && game.phase !== 'dead');
  underMe.x = player.pos.x; underMe.y = player.pos.y - 0.85; underMe.z = player.pos.z; underMe.ground = player.grounded;
  updateUnderground(gdt, underMe, playing && player.alive);
  updateCemetery(dt);
  updateCoffins(gdt, playing && player.alive);
  updateAntiCamp(gdt, playing && !game.overlay && game.phase !== 'dead', authority && !dev.freeze);
  zombieView.on = game.state !== 'menu' && inCemetery(underMe.x, underMe.y, underMe.z); // nel cimitero i nemici sono zombi
  netUpdate(dt);
  mark('negozio/rete');
  if (game.state !== 'menu') updateMinimap(dt);
  mark('minimappa');
  const canGrab = playing && net.mode !== 'client' && updateCrosshair(dt);
  if (isTouch) { curAction = touchAction(canGrab); hud.setAction(curAction); }
  hud.update(dt);
  hud.setDev(!!game.devUsed && game.state !== 'menu');
  if (dev.on && devHooks.tick) devHooks.tick(dt);
  mark('hud');

  updateDayNight(dt, game.state === 'menu' ? 0 : game.round);
  updateSky();
  tickWater(now / 1000);
  updateDecals(dt);
  updateDust(dt);
  if (renderer.shadowMap.enabled) {
    // ombre aggiornate a 30 fps (un frame sì e uno no): metà del lavoro, a occhio non si nota
    shadowFrame = !shadowFrame;
    renderer.shadowMap.needsUpdate = shadowFrame;
    if (shadowFrame) updateWorldMat(player.pos.x, player.pos.z);
  }
  mark('effetti');
  renderer.info.reset();
  renderFrame(scene, weaponScene, camera); // l'arma sopra a tutto, senza entrare nei muri
  mark('disegno');
  profEnd(rawDt);
}

/* ---------- Contatore fps (Impostazioni → Mostra gli fps) ---------- */
const fpsEl = $('fps');
let fpsT = 0;
function showFps(rawDt) {
  fpsT += rawDt;
  if (prof.on) fpsEl.classList.remove('hidden'), fpsEl.classList.add('prof');
  if (fpsT < 0.5 || fpsEl.classList.contains('hidden')) return;
  fpsT = 0;
  fpsEl.innerHTML = `${quality.fps} fps · ${LEVEL_NAMES[quality.level]}${quality.setting === 'auto' ? ' (auto)' : ''}${quality.res < 1 ? ` · ris. ${Math.round(quality.res * 100)}%` : ''}${prof.on ? `<br>${profText()}` : ''}`;
}

/* ---------- Minimappa ---------- */
const mates = [];
const eachEnemy = (fn) => {
  if (net.mode === 'client') forEachProxy(fn);
  else for (const e of enemies) if (!e.dead) fn(e.model.group.position.x, e.model.group.position.z, e.model);
};
function updateMinimap(dt) {
  mates.length = 0;
  for (const m of team.values()) if (!m.local) mates.push(m);
  const me = { x: player.pos.x, y: player.pos.y - 0.85, z: player.pos.z, yaw: player.yaw };
  minimap.update(dt, me, mates, eachEnemy);
  if (game.state !== 'playing' || game.overlay) bigmap.close();
  else if (bigmap.open) bigmap.update(dt, me, mates, bigmapNote());
}
/** Riga sotto la mappa grande: statistiche della partita e come chiuderla. */
function bigmapNote() {
  let top = null;
  for (const [n, k] of game.friendKills) if (!top || k > top[1]) top = [n, k];
  const how = isTouch && !padOn ? 'tocca la mappa per chiuderla' : padOn ? '⧉ per chiuderla' : 'M per chiuderla';
  return `Round ${Math.max(1, game.round)} · ★ ${myMoney()} punti · ${game.kills} nemici eliminati${top ? ` · il più eliminato: <b>${esc(top[0])}</b> ×${top[1]}` : ''}`
    + `<br><small>Mappa n. ${map.seed} · ${how}</small>`;
}
let padOn = false;

async function start() {
  hud.init();
  initSettings();
  initMobile(() => { if (game.state === 'playing' && game.phase !== 'dead') pauseGame(); });
  showRecord();
  try {
    await initPhysics();
  } catch (e) {
    console.error(e);
    hud.error('Non riesco ad avviare il motore fisico. Ricarica la pagina.');
    return;
  }
  // una mappa subito (si vede dietro al menu); ogni partita ne genera una nuova dal suo seed
  buildWorld(randomSeed());
  createPlayer();
  resetPlayer(0);
  buildLevel();
  initWeapons();
  enemyHooks.graveSpawn = graveSpawn; // nel cimitero una parte dei nemici esce dalle tombe
  setupInput(actions);
  setupGamepad(actions, padHooks);
  onPadMode((on) => { padOn = on; hud.setPadMode(on); });
  // mappa grande: si apre toccando (o cliccando) la minimappa, si chiude toccandola
  for (const id of ['minimap', 'bigmapCv']) {
    $(id).addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation();
      if (game.state === 'playing' && !game.overlay) bigmap.toggle();
    });
  }
  requestAnimationFrame(loop);

  const play = () => { initAudio(); requestLock(); last = performance.now(); startMatch(); };
  $('play').onclick = play;      // gioca da solo
  $('again').onclick = play;     // rigioca (da solo o, se host, con la stessa stanza)
  $('restart').onclick = play;
  $('lStart').onclick = () => { if (net.clients.size > 0) play(); };
  $('resume').onclick = () => { initAudio(); resumeGame(); };
  $('toMenu').onclick = leaveToMenu;
  $('overMenu').onclick = leaveToMenu;
  $('lLeave').onclick = leaveToMenu;
  $('lShare').onclick = shareInvite;
  $('create').onclick = () => { initAudio(); openCreateRoom(); };
  $('joinBtn').onclick = () => { initAudio(); openJoin(); };
  $('jGo').onclick = joinWithCode;
  $('jCode').addEventListener('keydown', (e) => { if (e.key === 'Enter') joinWithCode(); });
  $('jBack').onclick = leaveToMenu;
  $('openGallery').onclick = openGallery;
  initGallery((n) => { $('openGallery').textContent = `🙂 Galleria volti (${n})`; });
  hud.ready();
  joinFromLink(); // aperto da un link d'invito: entra subito nella stanza
  if (devFromUrl) setDevMode(true); // ?dev nell'indirizzo: modalità sviluppatore subito attiva
}

// Solo in sviluppo (npm run dev): oggetti utili per i test automatici. Non finisce nel sito pubblicato.
if (import.meta.env.DEV) {
  Promise.all([import('./enemies/enemies.js'), import('./weapons/viewmodel.js'), import('./game/game.js'), import('./game/rides.js'), import('./player/player.js'), import('./game/coffins.js'), import('./world/lowfog.js'), import('./world/raycast.js'), import('./core/physics.js')]).then(([m, v, g, r, pl, cf, lf, rc, ph]) => {
    window.__pp = { dev, game, player, enemies: m.enemies, camera, models: v.models, net, team: g.team, map, renderer, nav, rides: r, quality, prof, scene, spawnEnemy: m.spawnEnemy,
      teleport: pl.teleportPlayer, antiCamp, coffins: cf, lowFog: lf, castWorld: rc.castWorld, physics: ph };
  });
}

start();
