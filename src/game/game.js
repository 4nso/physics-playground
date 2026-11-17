// Stato della partita: menu, gioco, pausa, game over; round, ondate, punteggio, record,
// squadra (fino a 4 giocatori) e rianimazione dei compagni a terra.
// Da solo e sull'host qui si decide tutto; sui client lo stato arriva dall'host (vedi net/sync.js).
import { input, requestLock, exitLock } from '../core/input.js';
import { thud } from '../core/audio.js';
import { player, resetPlayer, pushPlayer, MAX_HEALTH } from '../player/player.js';
import { setTrigger, resetWeapons, unlockForRound, addAmmo, weaponHooks } from '../weapons/weapons.js';
import { enemies, spawnEnemy, clearEnemies, enemyHooks, setFaceSets } from '../enemies/enemies.js';
import { spawnPickup, clearPickups, pickupHooks } from './pickups.js';
import { rebuildLevel } from './level.js';
import { setObjectsRemote } from '../world/objects.js';
import { dropHeld } from '../player/interact.js';
import { net } from '../net/net.js';
import { hud } from '../ui/hud.js';

const $ = (id) => document.getElementById(id);
const BREAK_TIME = 12;
const REVIVE_TIME = 3;
const REVIVE_DIST = 1.9;
const RECORD_KEY = 'physics-playground-record';

export const game = {
  state: 'menu',   // 'menu' | 'playing' | 'paused' | 'over'
  phase: 'break',  // durante il gioco: 'break' (pausa tra i round) | 'fight' | 'dead'
  overlay: false,  // multiplayer: menu di pausa aperto ma la partita continua
  round: 0,
  score: 0,
  kills: 0,
  timer: 0,
  toSpawn: 0,
  spawnT: 0,
  cfg: null,
};

/** Rete (impostato da net/sync.js): send(id, msg) a un giocatore, all(msg) a tutti i client. */
export const gameNet = { sendTo: null, toAll: null };

/* ---------- Squadra ---------- */
/** id → { id, slot, local, health, down, reviveT, x, y, z } ; per il giocatore locale la posizione è player.pos */
export const team = new Map();
export function localMember() { return team.get(net.myId); }

export function setupTeam(members) {
  team.clear();
  for (const m of members) {
    team.set(m.id, { id: m.id, slot: m.slot, local: m.id === net.myId, health: MAX_HEALTH, down: false, reviveT: 0, x: 0, y: 0, z: 0, yaw: 0, pitch: 0, weapon: 0, speed: 0 });
  }
}
export function removeMember(id) { team.delete(id); }

function posOf(m) { return m.local ? player.pos : m; }

/** Bersagli per i nemici e raccoglitori di oggetti (riusati a ogni frame). */
const targets = [];
export function teamTargets() {
  targets.length = 0;
  for (const m of team.values()) {
    const p = posOf(m);
    targets.push({ id: m.id, x: p.x, y: p.y, z: p.z, alive: !m.down });
  }
  return targets;
}

/* ---------- Messaggi (anche ai client) ---------- */
export function announce(text, seconds = 2.4) {
  hud.flash(text, seconds);
  if (net.mode === 'host' && gameNet.toAll) gameNet.toAll({ t: 'msg', text, s: seconds });
}

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
  const n = Math.max(1, team.size); // più giocatori = più nemici, un po' più resistenti
  return {
    total: Math.round((4 + r * 3) * (1 + 0.5 * (n - 1))),
    maxAlive: Math.min(20, Math.round((4 + r * 2) * (1 + 0.3 * (n - 1)))),
    interval: Math.max(0.4, (1.5 - r * 0.08) / (1 + 0.3 * (n - 1))),
    health: (45 + (r - 1) * 12) * (1 + 0.2 * (n - 1)),
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
  if (fresh.length) addAmmo();
  if (net.mode === 'host' && gameNet.toAll) gameNet.toAll({ t: 'round', r: game.round });
  let text = `Round ${game.round}`;
  if (fresh.length) text += `<br><small>🔓 ${fresh.join(', ')} sbloccato!</small>`;
  if (game.cfg.specials) text += '<br><small>⚠️ Arrivano i grossi!</small>';
  announce(text, 2.6);
  thud(0.3, 70);
}

function endRound() {
  game.phase = 'break';
  game.timer = BREAK_TIME;
  const bonus = 250 * game.round;
  game.score += bonus;
  hud.setScore(game.score);
  for (const m of team.values()) if (!m.down) m.health = Math.min(MAX_HEALTH, m.health + 20);
  spawnPickup('ammo');
  spawnPickup('health');
  if (game.round % 2 === 0 || team.size > 2) spawnPickup('ammo');
  announce(`Round ${game.round} superato!<br><small>+${bonus} punti · raccogli munizioni e vita</small>`, 3);
}

/* ---------- Avvisi da nemici, armi e oggetti ---------- */
enemyHooks.onKill = (e, head) => {
  game.kills++;
  game.score += Math.round(e.v.points * (head ? 1.5 : 1));
  hud.setScore(game.score);
};
enemyHooks.onPlayerHit = (damage, ex, ez, targetId) => {
  const m = team.get(targetId);
  if (!m || m.down || game.phase === 'dead') return;
  m.health -= damage;
  const p = posOf(m);
  const dx = p.x - ex, dz = p.z - ez, d = Math.hypot(dx, dz) || 1;
  if (m.local) {
    hud.hurt(damage / 20);
    player.shake = Math.max(player.shake, 0.06);
    pushPlayer((dx / d) * 4, 1.5, (dz / d) * 4);
    thud(0.35, 80);
  } else if (gameNet.sendTo) {
    gameNet.sendTo(m.id, { t: 'hurt', d: damage, x: (dx / d) * 4, z: (dz / d) * 4 });
  }
  if (m.health <= 0) downMember(m);
};
weaponHooks.onEnemyHit = (killed, head, shooterId) => {
  if (shooterId === 'local') hud.hitMarker(killed);
  else if (gameNet.sendTo) gameNet.sendTo(shooterId, { t: 'hit', k: killed ? 1 : 0 });
};
weaponHooks.isAuthority = () => net.mode !== 'client';
pickupHooks.onPick = (kind, id) => {
  const m = team.get(id);
  if (!m) return;
  if (kind === 'health') m.health = Math.min(MAX_HEALTH, m.health + 35);
  if (m.local) applyPick(kind);
  else if (gameNet.sendTo) gameNet.sendTo(id, { t: 'pick', k: kind });
};
/** Effetto locale di un oggetto raccolto (le munizioni sono gestite da ogni giocatore). */
export function applyPick(kind) {
  if (kind === 'ammo') { addAmmo(); hud.flash('+ Munizioni', 1.2); }
  else hud.flash('+ Vita', 1.2);
  thud(0.2, 660);
}

function downMember(m) {
  m.health = 0;
  m.down = true;
  m.reviveT = 0;
  const allDown = [...team.values()].every((x) => x.down);
  if (allDown) {
    game.phase = 'dead';
    game.timer = 1.8;
  }
  if (m.local) {
    setTrigger(false);
    dropHeld();
    hud.flash(allDown ? 'Sei a terra!' : 'Sei a terra!<br><small>Un compagno deve starti vicino per rianimarti</small>', 2.4);
  } else if (!allDown) {
    announce(`⛑ Un compagno è a terra: avvicinati per rianimarlo!`, 2.4);
  }
}

/** Host: un compagno vivo vicino a uno a terra lo rianima in pochi secondi. */
function updateRevive(dt) {
  for (const m of team.values()) {
    if (!m.down) continue;
    const p = posOf(m);
    let helper = false;
    for (const o of team.values()) {
      if (o === m || o.down) continue;
      const q = posOf(o);
      if (Math.hypot(q.x - p.x, q.z - p.z) < REVIVE_DIST) { helper = true; break; }
    }
    m.reviveT = helper ? m.reviveT + dt : Math.max(0, m.reviveT - dt * 0.5);
    if (m.reviveT >= REVIVE_TIME) {
      m.down = false;
      m.health = 40;
      m.reviveT = 0;
      announce('⛑ Compagno rianimato!', 1.6);
    }
  }
}

/** Copia vita e stato del giocatore locale (deciso qui o dall'host) nel giocatore e nell'HUD. */
export function syncLocalMember() {
  const me = localMember();
  if (!me) return;
  player.health = me.health;
  if (player.alive && me.down) { player.alive = false; setTrigger(false); dropHeld(); }
  if (!player.alive && !me.down) { player.alive = true; hud.flash('Rianimato!', 1.4); }
  hud.setHealth(me.health, MAX_HEALTH);
  // barra di rianimazione: per chi è a terra e per chi lo sta aiutando
  let text = null, prog = 0;
  if (me.down) {
    text = team.size > 1 ? 'A terra: aspetta un compagno' : 'A terra';
    prog = me.reviveT / REVIVE_TIME;
  } else {
    for (const m of team.values()) {
      if (!m.down || m === me) continue;
      const p = posOf(m);
      if (Math.hypot(p.x - player.pos.x, p.z - player.pos.z) < REVIVE_DIST) { text = 'Stai rianimando un compagno…'; prog = m.reviveT / REVIVE_TIME; }
    }
  }
  hud.setRevive(text, prog);
}

export function gameOver(info) {
  game.state = 'over';
  game.overlay = false;
  input.enabled = false;
  setTrigger(false);
  exitLock();
  hud.setPlaying(false);
  hud.hide('pause');
  const r = info || { round: game.round, score: game.score, kills: game.kills };
  if (net.mode === 'host' && gameNet.toAll) gameNet.toAll({ t: 'over', round: r.round, score: r.score, kills: r.kills });
  const rec = loadRecord();
  const isRecord = r.score > rec.score;
  if (isRecord) saveRecord({ score: r.score, round: r.round });
  const who = team.size > 1 ? 'La squadra è arrivata' : 'Sei arrivato';
  $('overInfo').textContent = `${who} al round ${r.round} con ${r.score} punti (${r.kills} nemici eliminati).`;
  $('overRecord').textContent = isRecord ? '🏆 Nuovo record!' : rec.score ? `Record: ${rec.score} punti · round ${rec.round}` : '';
  $('again').style.display = net.mode === 'client' ? 'none' : '';
  $('overWait').style.display = net.mode === 'client' ? '' : 'none';
  hud.show('over');
}

/* ---------- Comandi del menu ---------- */

/**
 * Avvia una partita. faceSets = materiali dei volti già pronti.
 * members = [{ id, slot }] squadra (da solo: un solo membro 'host').
 */
export function startGame(faceSets, members) {
  setFaceSets(faceSets);
  clearEnemies();
  clearPickups();
  setObjectsRemote(net.mode === 'client');
  rebuildLevel();
  setupTeam(members);
  resetPlayer(net.mySlot);
  resetWeapons();
  Object.assign(game, { state: 'playing', phase: 'break', overlay: false, round: 0, score: 0, kills: 0, timer: 3 });
  hud.setRound(1);
  hud.setScore(0);
  hud.setEnemies(0);
  hud.setHealth(MAX_HEALTH, MAX_HEALTH);
  hud.setRevive(null);
  for (const id of ['start', 'pause', 'over', 'lobby', 'join']) hud.hide(id);
  hud.setPlaying(true);
  input.enabled = true;
  requestLock();
  hud.flash(team.size > 1 ? `Preparatevi! (${team.size} giocatori)` : 'Preparati!', 2.5);
}

export function pauseGame() {
  if (game.state !== 'playing' || game.overlay) return;
  input.enabled = false;
  input.reset();
  setTrigger(false);
  exitLock();
  if (net.mode === 'solo') game.state = 'paused';
  else game.overlay = true; // in multiplayer la partita non si ferma per gli altri
  $('pauseInfo').textContent = `Round ${Math.max(1, game.round)} · ${game.score} punti` + (net.mode !== 'solo' ? ' · la partita continua!' : '');
  $('restart').style.display = net.mode === 'client' ? 'none' : '';
  hud.show('pause');
}

export function resumeGame() {
  if (game.state === 'paused') game.state = 'playing';
  else if (!game.overlay) return;
  game.overlay = false;
  hud.hide('pause');
  input.enabled = true;
  requestLock();
}

export function toMenu() {
  game.state = 'menu';
  game.overlay = false;
  input.enabled = false;
  setTrigger(false);
  exitLock();
  clearEnemies();
  clearPickups();
  team.clear();
  hud.setPlaying(false);
  for (const id of ['pause', 'over', 'lobby', 'join']) hud.hide(id);
  showRecord();
  hud.show('start');
}

/* ---------- Aggiornamento a ogni frame (da solo e host) ---------- */
export function updateGame(dt) {
  if (game.state !== 'playing') return;
  updateRevive(dt);
  syncLocalMember();

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
