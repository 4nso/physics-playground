// Avvio del gioco e ciclo principale.
import './style.css';
import { renderer, scene, camera, followSun } from './core/renderer.js';
import { initPhysics, stepPhysics } from './core/physics.js';
import { input, setupInput, requestLock } from './core/input.js';
import { initAudio } from './core/audio.js';
import { buildArena } from './world/arena.js';
import { syncObjects, updateRope } from './world/objects.js';
import { player, createPlayer, updatePlayer, updateCamera, jump } from './player/player.js';
import { fire, toggleGrab, boom, spawnCrate, updateHeld, updateFx, updateCrosshair } from './player/interact.js';
import { buildLevel, resetAll, updateObjectives } from './game/playground.js';
import { hud } from './ui/hud.js';
import { isTouch } from './core/renderer.js';

let running = false;
let last = performance.now();

function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  if (running) {
    updatePlayer(dt);
    updateHeld();
    stepPhysics(dt);
  }
  syncObjects();
  updateRope();
  updateCamera(dt);
  const p = player.body.translation();
  followSun(p.x, p.z);
  updateFx(dt);
  if (running) {
    updateCrosshair();
    updateObjectives();
  }
  hud.update(dt);
  renderer.render(scene, camera);
}

async function start() {
  hud.init();
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
  setupInput({ fire, grab: toggleGrab, jump, boom, crate: spawnCrate, reset: resetAll });
  requestAnimationFrame(loop);

  hud.ready(() => {
    initAudio();
    running = true;
    input.enabled = true;
    last = performance.now();
    requestLock();
    hud.flash(isTouch ? 'Abbatti la torre!' : 'Abbatti la torre! (clic per catturare il mouse)');
  });
}

start();
