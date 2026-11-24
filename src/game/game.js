// Stato della partita: menu, gioco, pausa, game over; round, ondate, punteggio, record,
// squadra (fino a 4 giocatori) e rianimazione dei compagni a terra.
// Da solo e sull'host qui si decide tutto; sui client lo stato arriva dall'host (vedi net/sync.js).
import { input, requestLock, exitLock } from '../core/input.js';
import { thud } from '../core/audio.js';
import { player, resetPlayer, pushPlayer, MAX_HEALTH } from '../player/player.js';
import { setTrigger, resetWeapons, addAmmo, weaponHooks, unzoom } from '../weapons/weapons.js';
import { enemies, spawnEnemy, clearEnemies, enemyHooks, setFaceSets, enemyName } from '../enemies/enemies.js';
import { spawnPickup, clearPickups, pickupHooks } from './pickups.js';
import { buildLevel } from './level.js';
import { MAX_ROUNDS, roundConfig, pickVariant } from './difficulty.js';
import { setObjectsRemote, clearObjects } from '../world/objects.js';
import { map, buildWorld } from '../world/map.js';
import { dropHeld } from '../player/interact.js';
import { net } from '../net/net.js';
import { hud } from '../ui/hud.js';
import { resetShop, setShopMember, setShopRound, closeShopping } from './shop.js';
import { setupSafeZones, startBoxSpin, boxHooks } from './safezone.js';
import { inSafeZone } from '../world/map.js';
import { faceByName } from '../faces/gallery.js';
import { drawPoster } from '../faces/poster.js';
import { placePosters } from '../world/posters.js';
import { resetRides } from './rides.js';
import { dev, devLog } from '../core/devmode.js';
import { resetExit, exitHooks, bossDied } from './exitgate.js';
import { resetCoffins, hitCoffin, blastCoffins } from './coffins.js';
import { projHooks } from '../weapons/projectiles.js';

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
  spawned: 0,
  spawnT: 0,
  cfg: null,
  friendKills: new Map(), // nome dell'amico → quante volte l'ho eliminato (solo questo dispositivo)
  killedBy: '',           // nome dell'amico che mi ha messo a terra l'ultima volta
  killedByCount: new Map(), // nome dell'amico → quante volte mi ha messo a terra
  devUsed: false,          // in questa partita l'host ha usato la modalità sviluppatore (partita di test)
};

/* ---------- Messaggi con i nomi degli amici ---------- */
const esc = (t) => String(t).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
/** Questo giocatore ha eliminato un nemico con la faccia di un amico. */
export function noteFriendKill(name) {
  if (!name) return;
  const n = (game.friendKills.get(name) || 0) + 1;
  game.friendKills.set(name, n);
  hud.feed('Hai eliminato ', name, n > 1 ? ` ×${n}` : '');
}
/** Questo giocatore è stato messo a terra da un amico. */
export function noteKilledBy(name) {
  if (!name) return;
  game.killedBy = name;
  game.killedByCount.set(name, (game.killedByCount.get(name) || 0) + 1);
  hud.feed('Ti ha ucciso ', name, '', 3);
}

/** Rete (impostato da net/sync.js): send(id, msg) a un giocatore, all(msg) a tutti i client. */
export const gameNet = { sendTo: null, toAll: null };

/* ---------- Squadra ---------- */
/** id → { id, slot, local, health, down, reviveT, x, y, z } ; per il giocatore locale la posizione è player.pos */
export const team = new Map();
export function localMember() { return team.get(net.myId); }

export function setupTeam(members) {
  team.clear();
  for (const m of members) {
    team.set(m.id, {
      id: m.id, slot: m.slot, local: m.id === net.myId, health: MAX_HEALTH, maxHealth: MAX_HEALTH, down: false, reviveT: 0,
      x: 0, y: 0, z: 0, yaw: 0, pitch: 0, weapon: 0, speed: 0,
      money: 0, upg: { hp: 0, reload: 0 }, wlv: {}, // punti, potenziamenti e livelli delle armi (decisi da solo / dall'host)
    });
  }
}
setShopMember(() => localMember());
setShopRound(() => game.round);
/** Punti da spendere del giocatore locale. */
export function myMoney() { const me = localMember(); return me ? me.money || 0 : 0; }
export function removeMember(id) { team.delete(id); }

function posOf(m) { return m.local ? player.pos : m; }

/** Bersagli per i nemici e raccoglitori di oggetti (riusati a ogni frame). */
const targets = [], pool = [];
export function teamTargets() {
  targets.length = 0;
  for (const m of team.values()) {
    const p = posOf(m);
    const t = pool[targets.length] || (pool[targets.length] = {});
    t.id = m.id; t.x = p.x; t.y = p.y; t.z = p.z;
    // chi è nella zona sicura è "invisibile" per i nemici: non lo inseguono e non lo colpiscono
    t.alive = !m.down && !inSafeZone(p.x, p.z);
    targets.push(t);
  }
  return targets;
}

/* ---------- Messaggi (anche ai client) ---------- */
export function announce(text, seconds = 2.4) {
  hud.flash(text, seconds);
  if (net.mode === 'host' && gameNet.toAll) gameNet.toAll({ t: 'msg', text, s: seconds });
}

// cancello EXIT e chiave (game/exitgate.js): decide chi comanda, i messaggi arrivano anche ai client
exitHooks.team = () => team;
exitHooks.myId = () => net.myId;
exitHooks.announce = announce;
exitHooks.tell = (id, text, s) => { if (gameNet.sendTo) gameNet.sendTo(id, { t: 'msg', text, s }); };
exitHooks.authority = () => net.mode !== 'client';

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

/* ---------- Difficoltà dei round (formule in difficulty.js) ---------- */
function nextVariant() {
  const v = pickVariant(game.cfg, game.spawned);
  return v;
}

function beginRound() {
  game.round++;
  game.phase = 'fight';
  game.cfg = roundConfig(game.round, team.size);
  game.toSpawn = game.cfg.total;
  game.spawned = 0;
  game.spawnT = 0.5;
  hud.setRound(game.round);
  hud.setBreak(null);
  devLog(`Round ${game.round}: ${game.cfg.total} nemici`);
  if (net.mode === 'host' && gameNet.toAll) gameNet.toAll({ t: 'round', r: game.round });
  let text = game.round === MAX_ROUNDS ? `Round ${game.round}: l'ultimo!` : `Round ${game.round}`;
  if (game.cfg.bosses) text += `<br><small>⚠️ Round del boss${game.cfg.bosses > 1 ? ' (sono ' + game.cfg.bosses + '!)' : ''}</small>`;
  else if (game.round === 8) text += '<br><small>⚠️ Arrivano i corazzati</small>';
  announce(text, 2.6);
  thud(0.3, 70);
}

function endRound() {
  if (game.round >= MAX_ROUNDS) {
    game.score += 250 * game.round;
    gameOver({ round: game.round, score: game.score, kills: game.kills, win: true });
    return;
  }
  game.phase = 'break';
  game.timer = BREAK_TIME;
  const bonus = 250 * game.round;
  game.score += bonus;
  devLog(`Round ${game.round} superato (+${bonus})`);
  for (const m of team.values()) {
    m.money = (m.money || 0) + bonus; // il bonus del round va a tutti
    if (!m.down) m.health = Math.min(m.maxHealth || MAX_HEALTH, m.health + 20);
  }
  spawnPickup('ammo');
  spawnPickup('health');
  if (game.round % 2 === 0 || team.size > 2) spawnPickup('ammo');
  announce(`Round ${game.round} superato!<br><small>+${bonus} punti · raccogli munizioni e vita, passa dal 🛒 negozio</small>`, 3);
}

/* ---------- Avvisi da nemici, armi e oggetti ---------- */
enemyHooks.onKill = (e, head) => {
  game.kills++;
  if (e.variant === 'boss') bossDied(e, game.round); // round 10: cade la chiave del cancello EXIT
  const pts = Math.round(e.v.points * (head ? 1.5 : 1));
  game.score += pts;
  // i punti da spendere vanno a chi l'ha colpito per ultimo ('local' o nessuno = questo dispositivo)
  const id = !e.lastBy || e.lastBy === 'local' ? net.myId : e.lastBy;
  const m = team.get(id);
  if (m) m.money = (m.money || 0) + pts;
  const name = enemyName(e);
  if (name) {
    if (!m || m.local) noteFriendKill(name);
    else if (gameNet.sendTo) gameNet.sendTo(m.id, { t: 'fkill', n: name });
  }
};
enemyHooks.onPlayerHit = (damage, ex, ez, targetId, enemy) => {
  const m = team.get(targetId);
  if (!m || m.down || game.phase === 'dead') return;
  if ((m.local && dev.god) || m.devGod) return; // modalità sviluppatore: invincibile (anche un giocatore scelto dall'host)
  m.health -= damage;
  const p = posOf(m);
  const dx = p.x - ex, dz = p.z - ez, d = Math.hypot(dx, dz) || 1;
  if (m.local) {
    hud.hurt(damage / 20);
    player.shake = Math.max(player.shake, 0.06);
    pushPlayer((dx / d) * 4, 1.5, (dz / d) * 4);
    thud(0.35, 80);
  }
  const name = m.health <= 0 && enemy ? enemyName(enemy) : '';
  if (m.local) { if (name) noteKilledBy(name); }
  else if (gameNet.sendTo) gameNet.sendTo(m.id, { t: 'hurt', d: damage, x: (dx / d) * 4, z: (dz / d) * 4, n: name || undefined });
  if (m.health <= 0) downMember(m);
};
weaponHooks.onEnemyHit = (killed, head, shooterId) => {
  if (shooterId === 'local') hud.hitMarker(killed, head);
  else if (gameNet.sendTo) gameNet.sendTo(shooterId, { t: 'hit', k: killed ? 1 : 0, h: head ? 1 : 0 });
};
weaponHooks.isAuthority = () => net.mode !== 'client';
// bare del cimitero: colpi ed esplosioni (solo chi comanda; vedi game/coffins.js)
weaponHooks.onCoffinHit = (i, damage, dir, by) => hitCoffin(i, damage, dir, by);
projHooks.onBlast = (x, y, z, R) => blastCoffins(x, y, z, R);
// host: livello del potenziatore dell'arma di un altro giocatore (per i danni dei suoi colpi)
weaponHooks.levelOf = (id, wi) => { const m = team.get(id); return m && m.wlv ? m.wlv[wi] || 0 : 0; };
// cassa misteriosa pagata: tutti vedono l'animazione, l'arma va a chi ha pagato
boxHooks.spin = (idx, wi, by) => {
  startBoxSpin(idx, wi, by === net.myId);
  if (net.mode === 'host' && gameNet.toAll) gameNet.toAll({ t: 'boxfx', s: idx, wi, by });
};
pickupHooks.onPick = (kind, id) => {
  const m = team.get(id);
  if (!m) return;
  if (kind === 'health') m.health = Math.min(m.maxHealth || MAX_HEALTH, m.health + 35);
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
  devLog(`A terra: ${m.local ? 'io' : m.id}`);
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
  hud.setHealth(me.health, me.maxHealth || MAX_HEALTH);
  hud.setScore(me.money || 0);
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
  unzoom();
  closeShopping();
  exitLock();
  hud.setPlaying(false);
  hud.hide('pause');
  hud.flash('', 0); // niente messaggi sopra la schermata finale
  hud.clearFeed();
  const r = info || { round: game.round, score: game.score, kills: game.kills };
  devLog(`Fine partita: round ${r.round}, ${r.score} punti${r.win ? ' (vittoria)' : ''}`);
  const win = !!r.win;
  if (r.dev) game.devUsed = true;
  const test = !!game.devUsed; // partita di test (modalità sviluppatore): niente record
  if (net.mode === 'host' && gameNet.toAll) gameNet.toAll({ t: 'over', round: r.round, score: r.score, kills: r.kills, win: win ? 1 : 0, dev: test ? 1 : 0 });
  const rec = loadRecord();
  const isRecord = !test && r.score > rec.score;
  if (isRecord) saveRecord({ score: r.score, round: r.round });
  const many = team.size > 1;
  $('overTitle').textContent = win ? '🏆 Vittoria!' : 'Game over';
  $('over').classList.toggle('win', win);
  if (win) {
    $('overInfo').textContent = `${many ? 'Avete' : 'Hai'} superato tutti i ${MAX_ROUNDS} round con ${r.score} punti (${r.kills} nemici eliminati)!`;
  } else {
    $('overInfo').textContent = `${many ? 'La squadra è arrivata' : 'Sei arrivato'} al round ${r.round} con ${r.score} punti (${r.kills} nemici eliminati).`;
  }
  if (game.killedBy && !win) $('overInfo').innerHTML = `${esc($('overInfo').textContent)}<br>💀 Ti ha ucciso <b>${esc(game.killedBy)}</b>`;
  showWanted();
  $('overRecord').textContent = test ? '🛠 Partita di test: record e statistiche non salvati'
    : isRecord ? '🏆 Nuovo record!' : rec.score ? `Record: ${rec.score} punti · round ${rec.round}` : '';
  $('again').style.display = net.mode === 'client' ? 'none' : '';
  $('overWait').style.display = net.mode === 'client' ? '' : 'none';
  hud.show('over');
}

/* ---------- Statistiche di fine partita: manifesti "RICERCATO" ---------- */
const top = (m) => { let best = null; for (const [k, n] of m) if (!best || n > best[1]) best = [k, n]; return best; };
function showWanted() {
  const box = $('overPosters');
  box.innerHTML = '';
  const list = [];
  const most = top(game.friendKills), killer = top(game.killedByCount);
  if (most) list.push([most[0], `L'hai eliminato ${most[1] === 1 ? 'una volta' : most[1] + ' volte'}`]);
  if (killer) list.push([killer[0], `Ti ha ucciso ${killer[1] === 1 ? 'una volta' : killer[1] + ' volte'}`]);
  list.forEach(([name, line], i) => {
    const set = faceByName(name);
    const fig = document.createElement('figure');
    const cv = drawPoster(set ? set.canvas : null, name, line, i + 3);
    const cap = document.createElement('figcaption');
    cap.textContent = i === 0 && most ? 'Il più eliminato' : 'Il tuo assassino';
    fig.append(cv, cap);
    box.appendChild(fig);
  });
  box.style.display = list.length ? '' : 'none';
}

/* ---------- Comandi del menu ---------- */

/**
 * Avvia una partita. faceSets = materiali dei volti già pronti.
 * members = [{ id, slot }] squadra (da solo: un solo membro 'host'). seed = numero della mappa.
 */
export function startGame(faceSets, members, seed) {
  setFaceSets(faceSets);
  clearEnemies();
  clearPickups();
  dropHeld();
  clearObjects();
  setObjectsRemote(net.mode === 'client');
  if (seed && seed !== map.seed) buildWorld(seed); // nuova mappa (stesso seed = stessa mappa)
  buildLevel();
  placePosters(faceSets); // manifesti "RICERCATO" con le facce sui muri
  setupTeam(members);
  devLog(`Nuova partita: mappa ${map.seed}, ${members.length} giocator${members.length > 1 ? 'i' : 'e'}`);
  resetPlayer(net.mySlot);
  resetWeapons();
  resetShop();
  setupSafeZones();
  resetRides();
  resetExit();
  resetCoffins();
  Object.assign(game, { state: 'playing', phase: 'break', overlay: false, round: 0, score: 0, kills: 0, timer: 3, killedBy: '', devUsed: false });
  game.friendKills.clear();
  game.killedByCount.clear();
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
  unzoom();
  closeShopping();
  exitLock();
  if (net.mode === 'solo') game.state = 'paused';
  else game.overlay = true; // in multiplayer la partita non si ferma per gli altri
  $('pauseInfo').textContent = `Round ${Math.max(1, game.round)} · ${game.score} punti · mappa n. ${map.seed}` + (net.mode !== 'solo' ? ' · la partita continua!' : '');
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
  unzoom();
  closeShopping();
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
  // combattimento: fa comparire i nemici un po' alla volta (non con "Ferma zombi")
  if (!dev.freeze) game.spawnT -= dt;
  if (!dev.freeze && game.toSpawn > 0 && game.spawnT <= 0 && enemies.length < game.cfg.maxAlive) {
    const e = spawnEnemy(nextVariant(), game.cfg);
    if (e.variant === 'boss') {
      const name = enemyName(e);
      announce(name ? `👹 Arriva il boss: <b>${esc(name.toUpperCase())}</b>!` : '👹 Arriva il boss!', 2.6);
    }
    game.toSpawn--;
    game.spawned++;
    game.spawnT = game.cfg.interval * (0.6 + Math.random() * 0.8);
  }
  hud.setEnemies(enemies.length + game.toSpawn);
  if (game.toSpawn === 0 && enemies.length === 0) endRound();
}

/**
 * Modalità sviluppatore: salta al round n (1..MAX_ROUNDS). I nemici rimasti vanno tolti prima
 * (vedi src/dev/). Il round parte subito, con l'annuncio e i nemici giusti.
 */
export function devGoToRound(n) {
  if (game.state !== 'playing') return;
  n = Math.max(1, Math.min(MAX_ROUNDS, Math.round(n) || 1));
  game.round = n - 1;
  game.phase = 'break';
  game.timer = 0;
  game.toSpawn = 0;
}
