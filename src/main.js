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
import { minimap } from './ui/minimap.js';
import { enemies } from './enemies/enemies.js';
import { forEachProxy } from './net/proxies.js';
import { syncObjects, updateRope } from './world/objects.js';
import { player, createPlayer, resetPlayer, updatePlayer, updateCamera, jump } from './player/player.js';
import { throwHeld, toggleGrab, updateHeld, updateCrosshair, isHolding } from './player/interact.js';
import { weaponScene } from './weapons/viewmodel.js';
import { initWeapons, updateWeapons, setTrigger, tapFire, reload, selectWeapon, nextWeapon, toggleZoom, hasZoom, isZoomed } from './weapons/weapons.js';
import { updateShop, toggleShopping, closeShopping, isShopping, padShopInteract, padShopping, padShopMove, padShopBuy, shopAction, touchShopAction } from './game/shop.js';
import { updateSafeZones } from './game/safezone.js';
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

const $ = (id) => document.getElementById(id);
let last = performance.now();
let shadowFrame = false;
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
    if (a.kind === 'ride') actions.ride(a.id === 'start' || a.id === 'stop' ? 'toggle' : 'seat');
    else if (a.kind === 'shop') touchShopAction();
    else if (a.id === 'throw') throwHeld();
    else actions.grab();
  },
  // tasto destro: mirino se l'arma ce l'ha, altrimenti afferra
  alt() { if (hasZoom()) toggleZoom(); else actions.grab(); },
  zoom() { if (player.alive) toggleZoom(); },
  shop: toggleShopping,
  ride(what) { if (game.state === 'playing') rideAction(what); },
  jump,
  pause() { if (closeShopping()) { requestLock(); return; } pauseGame(); },
  // il mouse liberato per comprare non mette in pausa
  lockLost() { if (game.state === 'playing' && game.phase !== 'dead' && !isShopping()) pauseGame(); },
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
    if (padShopInteract()) return;
    actions.grab();
  },
  shopActive: padShopping,
  shopMove: padShopMove,
  shopBuy: padShopBuy,
  rideSpeed() { if (rideNearKind() === 'ctrl') actions.ride('speed'); },
  zoomed: isZoomed,
  eachEnemy: (fn) => eachEnemy(fn),
  // ⧉: statistiche della partita
  stats() {
    let top = null;
    for (const [n, k] of game.friendKills) if (!top || k > top[1]) top = [n, k];
    hud.flash(`Round ${Math.max(1, game.round)} · ★ ${myMoney()} punti<br><small>${game.kills} nemici eliminati${top ? ` · il più eliminato: <b>${esc(top[0])}</b> ×${top[1]}` : ''} · mappa n. ${map.seed}</small>`, 3);
  },
};

function loop(now) {
  requestAnimationFrame(loop);
  const rawDt = Math.max(0, (now - last) / 1000);
  const dt = Math.min(0.05, rawDt);
  last = now;
  const playing = game.state === 'playing';
  updateQuality(rawDt, playing && !game.overlay);
  showFps(rawDt);
  const gdt = playing ? dt : 0;
  const authority = net.mode !== 'client'; // da solo o host: qui si simula tutto

  updateRides(gdt, authority, playing && !game.overlay); // prima del giocatore: chi è seduto segue il posto
  updateGamepad(dt);
  if (playing) {
    updatePlayer(dt);
    updateHeld();
    netBeforePhysics(dt);
    stepPhysics(dt);
  }
  syncObjects();
  updateRope();
  updateCamera(gdt, alpha);
  followSun(player.pos.x, player.pos.z);
  if (authority) {
    const targets = teamTargets();
    updateEnemies(gdt, alpha, playing, targets);
    updatePickups(gdt, playing ? targets.filter((t) => t.alive) : null);
    updateGame(gdt);
  } else {
    updatePickups(gdt, null);
  }
  updateWeapons(gdt, player.lookDX, player.lookDY);
  updateShop(dt, playing && !game.overlay, myMoney());
  updateSafeZones(gdt, playing);
  netUpdate(dt);
  if (game.state !== 'menu') updateMinimap(dt);
  const canGrab = playing && net.mode !== 'client' && updateCrosshair();
  if (isTouch) { curAction = touchAction(canGrab); hud.setAction(curAction); }
  hud.update(dt);

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
  renderer.info.reset();
  renderFrame(scene, weaponScene, camera); // l'arma sopra a tutto, senza entrare nei muri
}

/* ---------- Contatore fps (Impostazioni → Mostra gli fps) ---------- */
const fpsEl = $('fps');
let fpsT = 0;
function showFps(rawDt) {
  fpsT += rawDt;
  if (fpsT < 0.5 || fpsEl.classList.contains('hidden')) return;
  fpsT = 0;
  fpsEl.textContent = `${quality.fps} fps · ${LEVEL_NAMES[quality.level]}${quality.setting === 'auto' ? ' (auto)' : ''}${quality.res < 1 ? ` · ris. ${Math.round(quality.res * 100)}%` : ''}`;
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
  minimap.update(dt, { x: player.pos.x, y: player.pos.y - 0.85, z: player.pos.z, yaw: player.yaw }, mates, eachEnemy);
}

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
  setupInput(actions);
  setupGamepad(actions, padHooks);
  onPadMode((on) => hud.setPadMode(on));
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
}

// Solo in sviluppo (npm run dev): oggetti utili per i test automatici. Non finisce nel sito pubblicato.
if (import.meta.env.DEV) {
  Promise.all([import('./enemies/enemies.js'), import('./weapons/viewmodel.js'), import('./game/game.js'), import('./game/rides.js')]).then(([m, v, g, r]) => {
    window.__pp = { game, player, enemies: m.enemies, camera, models: v.models, net, team: g.team, map, renderer, nav, rides: r, quality };
  });
}

start();
