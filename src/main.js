// Avvio del gioco e ciclo principale.
import './style.css';
import { renderer, scene, camera, followSun } from './core/renderer.js';
import { initPhysics, stepPhysics, alpha } from './core/physics.js';
import { setupInput, requestLock } from './core/input.js';
import { initAudio } from './core/audio.js';
import { buildArena } from './world/arena.js';
import { syncObjects, updateRope } from './world/objects.js';
import { player, createPlayer, updatePlayer, updateCamera, jump } from './player/player.js';
import { throwHeld, toggleGrab, updateHeld, updateCrosshair } from './player/interact.js';
import { weaponScene } from './weapons/viewmodel.js';
import { initWeapons, updateWeapons, setTrigger, tapFire, reload, selectWeapon, nextWeapon } from './weapons/weapons.js';
import { updateEnemies } from './enemies/enemies.js';
import { initGallery, openGallery } from './faces/gallery.js';
import { updatePickups } from './game/pickups.js';
import { buildLevel } from './game/level.js';
import { game, startGame, pauseGame, resumeGame, toMenu, updateGame, showRecord } from './game/game.js';
import { hud } from './ui/hud.js';

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
  grab() { setTrigger(false); toggleGrab(); },
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

  if (playing) {
    updatePlayer(dt);
    updateHeld();
    stepPhysics(dt);
  }
  syncObjects();
  updateRope();
  updateCamera(gdt, alpha);
  followSun(player.pos.x, player.pos.z);
  updateEnemies(gdt, alpha, playing);
  updatePickups(gdt);
  updateWeapons(gdt, player.lookDX, player.lookDY);
  updateGame(gdt);
  if (playing) updateCrosshair();
  hud.update(dt);

  renderer.clear();
  renderer.render(scene, camera);
  renderer.clearDepth();
  renderer.render(weaponScene, camera); // l'arma sopra a tutto, senza entrare nei muri
}

async function start() {
  hud.init();
  showRecord();
  try {
    await initPhysics();
  } catch (e) {
    console.error(e);
    hud.error('Non riesco ad avviare il motore fisico. Ricarica la pagina.');
    return;
  }
  buildArena();
  createPlayer();
  buildLevel();
  initWeapons();
  setupInput(actions);
  requestAnimationFrame(loop);

  const play = () => { initAudio(); requestLock(); last = performance.now(); startGame(); };
  $('play').onclick = play;
  $('again').onclick = play;
  $('restart').onclick = play;
  $('resume').onclick = () => { initAudio(); resumeGame(); };
  $('toMenu').onclick = toMenu;
  $('overMenu').onclick = toMenu;
  $('openGallery').onclick = openGallery;
  initGallery((n) => { $('openGallery').textContent = `🙂 Galleria volti (${n})`; });
  hud.ready();
}

// Solo in sviluppo (npm run dev): oggetti utili per i test automatici. Non finisce nel sito pubblicato.
if (import.meta.env.DEV) {
  Promise.all([import('./enemies/enemies.js'), import('./weapons/viewmodel.js')]).then(([m, v]) => {
    window.__pp = { game, player, enemies: m.enemies, camera, models: v.models };
  });
}

start();
