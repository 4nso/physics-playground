// Avvio del gioco e ciclo principale.
import './style.css';
import { renderer, scene, camera, followSun } from './core/renderer.js';
import { initPhysics, stepPhysics, alpha } from './core/physics.js';
import { setupInput, requestLock } from './core/input.js';
import { initAudio } from './core/audio.js';
import { buildWorld, map } from './world/map.js';
import { nav } from './world/nav.js';
import { randomSeed } from './world/rng.js';
import { minimap } from './ui/minimap.js';
import { enemies } from './enemies/enemies.js';
import { forEachProxy } from './net/proxies.js';
import { syncObjects, updateRope } from './world/objects.js';
import { player, createPlayer, resetPlayer, updatePlayer, updateCamera, jump } from './player/player.js';
import { throwHeld, toggleGrab, updateHeld, updateCrosshair } from './player/interact.js';
import { weaponScene } from './weapons/viewmodel.js';
import { initWeapons, updateWeapons, setTrigger, tapFire, reload, selectWeapon, nextWeapon } from './weapons/weapons.js';
import { updateEnemies } from './enemies/enemies.js';
import { initGallery, openGallery } from './faces/gallery.js';
import { updatePickups } from './game/pickups.js';
import { buildLevel } from './game/level.js';
import { game, pauseGame, resumeGame, updateGame, showRecord, teamTargets, team } from './game/game.js';
import { net } from './net/net.js';
import { startMatch, openCreateRoom, openJoin, joinWithCode, leaveToMenu, netBeforePhysics, netUpdate, shareInvite, joinFromLink } from './net/sync.js';
import { hud } from './ui/hud.js';
import { initSettings } from './ui/settings.js';
import { initMobile } from './ui/mobile.js';

const $ = (id) => document.getElementById(id);
let last = performance.now();
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
  grab() { if (net.mode !== 'client' && player.alive) { setTrigger(false); toggleGrab(); } },
  jump,
  pause: pauseGame,
  lockLost() { if (game.state === 'playing' && game.phase !== 'dead') pauseGame(); },
};

function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const playing = game.state === 'playing';
  const gdt = playing ? dt : 0;
  const authority = net.mode !== 'client'; // da solo o host: qui si simula tutto

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
  netUpdate(dt);
  if (game.state !== 'menu') updateMinimap(dt);
  if (playing && net.mode !== 'client') updateCrosshair();
  hud.update(dt);

  renderer.clear();
  renderer.render(scene, camera);
  renderer.clearDepth();
  renderer.render(weaponScene, camera); // l'arma sopra a tutto, senza entrare nei muri
}

/* ---------- Minimappa ---------- */
const mates = [];
const eachEnemy = (fn) => {
  if (net.mode === 'client') forEachProxy(fn);
  else for (const e of enemies) fn(e.model.group.position.x, e.model.group.position.z);
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
  Promise.all([import('./enemies/enemies.js'), import('./weapons/viewmodel.js'), import('./game/game.js')]).then(([m, v, g]) => {
    window.__pp = { game, player, enemies: m.enemies, camera, models: v.models, net, team: g.team, map, renderer, nav };
  });
}

start();
