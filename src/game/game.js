// Stato della partita: menu, gioco, pausa, game over; round, ondate, punteggio e record.
import { input, requestLock, exitLock } from '../core/input.js';
import { thud } from '../core/audio.js';
import { player, resetPlayer, pushPlayer, MAX_HEALTH } from '../player/player.js';
import { setTrigger, resetWeapons, unlockForRound, addAmmo, weaponHooks } from '../weapons/weapons.js';
import { enemies, spawnEnemy, clearEnemies, enemyHooks, setFaceSets } from '../enemies/enemies.js';
import { loadFaceMaterials } from '../faces/gallery.js';
import { spawnPickup, clearPickups, pickupHooks } from './pickups.js';
import { rebuildLevel } from './level.js';
import { hud } from '../ui/hud.js';

const $ = (id) => document.getElementById(id);
const BREAK_TIME = 12;
const RECORD_KEY = 'physics-playground-record';

export const game = {
  state: 'menu',   // 'menu' | 'playing' | 'paused' | 'over'
  phase: 'break',  // durante il gioco: 'break' (pausa tra i round) | 'fight' | 'dead'
  round: 0,
  score: 0,
  kills: 0,
  timer: 0,
  toSpawn: 0,
  spawnT: 0,
  cfg: null,
};

/* ---------- Record (salvato nel browser) ---------- */
function loadRecord() {
  try { return JSON.parse(localStorage.getItem(RECORD_KEY)) || { score: 0, round: 0 }; } catch (e) { return { score: 0, round: 0 }; }
}
function saveRecord(r) {
  try { localStorage.setItem(RECORD_KEY, JSON.stringify(r)); } catch (e) { /* storage non disponibile */ }
}
export function showRecord() {
  const r = loadRecord();
  $('record').textContent = r.score > 0 ? `🏆 Record: ${r.score} punti · round ${r.round}` : '';
}

/* ---------- Difficoltà dei round ---------- */
function roundConfig(r) {
  return {
    total: 4 + r * 3,
    maxAlive: Math.min(20, 4 + r * 2),
    interval: Math.max(0.45, 1.5 - r * 0.08),
    health: 45 + (r - 1) * 12,
    speed: Math.min(4.4, 2.6 + r * 0.15),
    specials: r % 5 === 0 ? 2 : 0, // ogni 5 round arrivano due "grossi" speciali
  };
}
function pickVariant(r) {
  if (game.cfg.specials > 0) { game.cfg.specials--; return 'big'; }
  const big = r >= 3 ? Math.min(0.22, 0.04 + 0.02 * r) : 0;
  const fast = r >= 2 ? Math.min(0.35, 0.08 + 0.03 * r) : 0;
  const x = Math.random();
  return x < big ? 'big' : x < big + fast ? 'fast' : 'base';
}

function beginRound() {
  game.round++;
  game.phase = 'fight';
  game.cfg = roundConfig(game.round);
  game.toSpawn = game.cfg.total;
  game.spawnT = 0.5;
  hud.setRound(game.round);
  hud.setBreak(null);
  const fresh = unlockForRound(game.round);
  let text = `Round ${game.round}`;
  if (fresh.length) { text += `<br><small>🔓 ${fresh.join(', ')} sbloccato!</small>`; addAmmo(); }
  if (game.cfg.specials) text += '<br><small>⚠️ Arrivano i grossi!</small>';
  hud.flash(text, 2.6);
  thud(0.3, 70);
}

function endRound() {
  game.phase = 'break';
  game.timer = BREAK_TIME;
  const bonus = 250 * game.round;
  game.score += bonus;
  hud.setScore(game.score);
  player.health = Math.min(MAX_HEALTH, player.health + 20);
  spawnPickup('ammo');
  spawnPickup('health');
  if (game.round % 2 === 0) spawnPickup('ammo');
  hud.flash(`Round ${game.round} superato!<br><small>+${bonus} punti · raccogli munizioni e vita</small>`, 3);
}

/* ---------- Avvisi da nemici, armi e oggetti ---------- */
enemyHooks.onKill = (e, head) => {
  game.kills++;
  game.score += Math.round(e.v.points * (head ? 1.5 : 1));
  hud.setScore(game.score);
};
enemyHooks.onPlayerHit = (damage, ex, ez) => {
  if (game.phase === 'dead') return;
  player.health -= damage;
  hud.hurt(damage / 20);
  player.shake = Math.max(player.shake, 0.06);
  // piccola spinta lontano dal nemico
  const dx = player.pos.x - ex, dz = player.pos.z - ez, d = Math.hypot(dx, dz) || 1;
  pushPlayer((dx / d) * 4, 1.5, (dz / d) * 4);
  thud(0.35, 80);
  if (player.health <= 0) die();
};
weaponHooks.onEnemyHit = (killed) => hud.hitMarker(killed);
pickupHooks.onPick = (kind) => {
  if (kind === 'ammo') { addAmmo(); hud.flash('+ Munizioni', 1.2); }
  else { player.health = Math.min(MAX_HEALTH, player.health + 35); hud.flash('+ Vita', 1.2); }
  thud(0.2, 660);
};

function die() {
  player.health = 0;
  player.alive = false;
  game.phase = 'dead';
  game.timer = 1.8;
  setTrigger(false);
  hud.flash('Sei a terra!', 1.8);
}

function gameOver() {
  game.state = 'over';
  input.enabled = false;
  exitLock();
  hud.setPlaying(false);
  const rec = loadRecord();
  const isRecord = game.score > rec.score;
  if (isRecord) saveRecord({ score: game.score, round: game.round });
  $('overInfo').textContent = `Sei arrivato al round ${game.round} con ${game.score} punti (${game.kills} nemici eliminati).`;
  $('overRecord').textContent = isRecord ? '🏆 Nuovo record!' : rec.score ? `Record: ${rec.score} punti · round ${rec.round}` : '';
  hud.show('over');
}

/* ---------- Comandi del menu ---------- */
export async function startGame() {
  setFaceSets(await loadFaceMaterials());
  clearEnemies();
  clearPickups();
  rebuildLevel();
  resetPlayer();
  resetWeapons();
  Object.assign(game, { state: 'playing', phase: 'break', round: 0, score: 0, kills: 0, timer: 3 });
  hud.setRound(1);
  hud.setScore(0);
  hud.setEnemies(0);
  hud.setHealth(player.health, MAX_HEALTH);
  for (const id of ['start', 'pause', 'over']) hud.hide(id);
  hud.setPlaying(true);
  input.enabled = true;
  requestLock();
  hud.flash('Preparati!', 2.5);
}

export function pauseGame() {
  if (game.state !== 'playing') return;
  game.state = 'paused';
  input.enabled = false;
  setTrigger(false);
  exitLock();
  $('pauseInfo').textContent = `Round ${Math.max(1, game.round)} · ${game.score} punti`;
  hud.show('pause');
}

export function resumeGame() {
  if (game.state !== 'paused') return;
  game.state = 'playing';
  hud.hide('pause');
  input.enabled = true;
  requestLock();
}

export function toMenu() {
  game.state = 'menu';
  input.enabled = false;
  setTrigger(false);
  exitLock();
  clearEnemies();
  clearPickups();
  hud.setPlaying(false);
  for (const id of ['pause', 'over']) hud.hide(id);
  showRecord();
  hud.show('start');
}

/* ---------- Aggiornamento a ogni frame ---------- */
export function updateGame(dt) {
  if (game.state !== 'playing') return;
  hud.setHealth(player.health, MAX_HEALTH);

  if (game.phase === 'dead') {
    game.timer -= dt;
    if (game.timer <= 0) gameOver();
    return;
  }
  if (game.phase === 'break') {
    game.timer -= dt;
    hud.setBreak(game.round > 0 ? game.timer : null);
    if (game.timer <= 0) beginRound();
    hud.setEnemies(0);
    return;
  }
  // combattimento: fa comparire i nemici un po' alla volta
  game.spawnT -= dt;
  if (game.toSpawn > 0 && game.spawnT <= 0 && enemies.length < game.cfg.maxAlive) {
    spawnEnemy(pickVariant(game.round), game.cfg);
    game.toSpawn--;
    game.spawnT = game.cfg.interval * (0.6 + Math.random() * 0.8);
  }
  hud.setEnemies(enemies.length + game.toSpawn);
  if (game.toSpawn === 0 && enemies.length === 0) endRound();
}
