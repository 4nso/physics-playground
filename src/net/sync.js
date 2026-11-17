// Multiplayer cooperativo: lobby, avvio della partita, sincronizzazione host ↔ client.
// L'host simula tutto (nemici, round, danni) e manda istantanee ~15 volte al secondo.
// Ogni client muove il proprio giocatore e manda posizione e colpi all'host.
import { world, RAPIER, GROUPS } from '../core/physics.js';
import { thud } from '../core/audio.js';
import { player, pushPlayer, spawnPoint } from '../player/player.js';
import { enemies, enemyHooks } from '../enemies/enemies.js';
import { objects, applyObjectState } from '../world/objects.js';
import { weaponHooks, resolveRemoteShot, showRemoteShot, currentWeaponIndex, unlockForRound, addAmmo } from '../weapons/weapons.js';
import { loadFaceMaterials, faceBuffers, facesFromBuffers } from '../faces/gallery.js';
import { pickupSnapshot, applyPickupSnapshot } from '../game/pickups.js';
import { game, team, gameNet, startGame, gameOver, toMenu, applyPick, syncLocalMember, removeMember, announce } from '../game/game.js';
import { net, on, createRoom, joinRoom, broadcast, sendTo, sendHost, leaveRoom, setAccepting } from './net.js';
import { setAvatar, removeAvatar, clearAvatars, updateAvatars, slotName, SLOT_COLORS } from './avatars.js';
import { VARIANT_KEYS, applyEnemySnapshot, killProxy, updateProxies, clearProxies, setProxyFaces } from './proxies.js';
import { hud } from '../ui/hud.js';
import { randomSeed } from '../world/rng.js';

/** Seed della prossima partita: ?seed=123456 nell'indirizzo per rigiocare sempre la stessa mappa. */
function matchSeed() {
  const s = parseInt(new URLSearchParams(location.search).get('seed'), 10);
  return s > 0 ? s : randomSeed();
}

const $ = (id) => document.getElementById(id);
const q = (v) => Math.round(v * 100);       // numeri interi: messaggi più piccoli
const PHASES = ['break', 'fight', 'dead'];

gameNet.sendTo = (id, msg) => sendTo(id, msg);
gameNet.toAll = (msg) => broadcast(msg);

/* ---------- Lobby ---------- */
let lobby = [];  // [{ id, slot }] giocatori nella stanza (host compreso)

function renderLobby() {
  $('lCode').textContent = net.code || '-----';
  $('lPlayers').innerHTML = lobby
    .slice().sort((a, b) => a.slot - b.slot)
    .map((p) => `<li><i style="background:${SLOT_COLORS[p.slot % 4]}"></i>${slotName(p.slot)}${p.id === net.myId ? ' (tu)' : ''}</li>`)
    .join('');
  const host = net.mode === 'host';
  $('lStart').style.display = host ? '' : 'none';
  $('lWait').style.display = host ? 'none' : '';
  $('lHelp').textContent = host
    ? "Gli amici aprono il gioco, toccano \"Entra con codice\" e scrivono questo codice. Da 2 a 4 giocatori."
    : 'Sei nella stanza:';
  $('lStart').textContent = lobby.length > 1 ? `Inizia partita (${lobby.length} giocatori)` : 'Inizia partita (aspetta almeno un amico)';
}

function showNetNote(text) { $('netNote').textContent = text || ''; }

export async function openCreateRoom() {
  showNetNote('');
  hud.hide('start');
  hud.show('lobby');
  $('lCode').textContent = '…';
  $('lPlayers').innerHTML = '<li>Creo la stanza…</li>';
  $('lStart').style.display = 'none';
  $('lWait').style.display = 'none';
  try {
    await createRoom({
      onJoin(id, slot) {
        lobby.push({ id, slot });
        renderLobby();
        broadcast({ t: 'lobby', list: lobby });
        thud(0.2, 520);
      },
      onLeave(id) {
        lobby = lobby.filter((p) => p.id !== id);
        broadcast({ t: 'lobby', list: lobby });
        if (game.state === 'menu') renderLobby();
        else memberLeft(id);
      },
    });
    lobby = [{ id: 'host', slot: 0 }];
    renderLobby();
  } catch (e) {
    hud.hide('lobby');
    hud.show('start');
    showNetNote('Non riesco a creare la stanza: controlla la connessione e riprova.');
  }
}

export function openJoin() {
  showNetNote('');
  $('jErr').textContent = '';
  hud.hide('start');
  hud.show('join');
  setTimeout(() => $('jCode').focus(), 50);
}

export async function joinWithCode() {
  const code = $('jCode').value.trim().toUpperCase();
  if (code.length < 5) { $('jErr').textContent = 'Il codice ha 5 caratteri.'; return; }
  $('jErr').textContent = 'Mi collego…';
  $('jGo').disabled = true;
  try {
    const me = await joinRoom(code, { onClose: hostGone });
    lobby = [{ id: 'host', slot: 0 }, { id: me.id, slot: me.slot }];
    hud.hide('join');
    hud.show('lobby');
    renderLobby();
  } catch (e) {
    $('jErr').textContent = e.message;
  }
  $('jGo').disabled = false;
}

/** Esce dalla stanza (o la chiude, se host) e torna al menu. */
export function leaveToMenu() {
  if (net.mode !== 'solo') leaveRoom();
  lobby = [];
  cleanupNet();
  toMenu();
}

function hostGone(reason) {
  if (net.mode !== 'client') return;
  leaveRoom();
  lobby = [];
  cleanupNet();
  toMenu();
  showNetNote(reason);
}

function cleanupNet() {
  for (const b of remoteBodies.values()) world.removeRigidBody(b);
  remoteBodies.clear();
  clearAvatars();
  clearProxies();
  faceBuf.length = 0;
  hud.setGrabVisible(true);
}

/* ---------- Avvio della partita ---------- */
const faceBuf = [];

/** Host: manda i volti e fa partire tutti. Da solo: parte e basta. */
export async function startMatch() {
  if (net.mode === 'client') return;
  const sets = await loadFaceMaterials();
  const seed = matchSeed();
  if (net.mode === 'host') {
    setAccepting(false);
    const bufs = await faceBuffers();
    // I volti vanno direttamente ai giocatori della stanza; loro li tengono solo in memoria.
    bufs.forEach((b, i) => broadcast({ t: 'face', i, b }));
    // la mappa non si manda: basta il seed, ogni client la costruisce uguale
    broadcast({ t: 'start', members: lobby, n: bufs.length, seed });
    cleanupNet();
  }
  startGame(sets, net.mode === 'host' ? lobby : [{ id: 'host', slot: 0 }], seed);
  if (net.mode === 'host') for (const p of lobby) if (p.id !== 'host') remoteBodies.set(p.id, makeRemoteBody(p.slot));
}

on('lobby', (msg) => { lobby = msg.list; if (game.state === 'menu') renderLobby(); });
on('face', (msg) => { faceBuf[msg.i] = msg.b; });
on('start', async (msg) => {
  const sets = await facesFromBuffers(faceBuf.slice(0, msg.n));
  faceBuf.length = 0;
  clearAvatars();
  clearProxies();
  setProxyFaces(sets);
  lobby = msg.members;
  startGame(sets, msg.members, msg.seed);
  hud.setGrabVisible(false); // sui client gli oggetti li muove l'host
});

/* ---------- Host: corpi dei giocatori remoti (i nemici li vedono e li inseguono) ---------- */
const remoteBodies = new Map();
function makeRemoteBody(slot) {
  const sp = spawnPoint(slot);
  const b = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(sp.x, sp.y, sp.z));
  world.createCollider(RAPIER.ColliderDesc.capsule(0.4, 0.4).setCollisionGroups(GROUPS.player), b);
  return b;
}

function memberLeft(id) {
  const m = team.get(id);
  const b = remoteBodies.get(id);
  if (b) { world.removeRigidBody(b); remoteBodies.delete(id); }
  removeAvatar(id);
  removeMember(id);
  if (m) announce(`${slotName(m.slot)} ha lasciato la partita`, 2);
}

on('p', (msg, id) => {
  const m = team.get(id);
  if (!m || net.mode !== 'host') return;
  m.x = msg.x; m.y = msg.y; m.z = msg.z;
  m.yaw = msg.yaw; m.pitch = msg.pitch; m.weapon = msg.w; m.speed = msg.s;
  m.seen = true;
});

on('shot', (msg, id) => {
  if (net.mode !== 'host' || game.state === 'menu') return;
  const m = team.get(id);
  if (!m || m.down) return;
  const ends = resolveRemoteShot(id, msg.o, msg.d, msg.w);
  broadcast({ t: 'fx', o: msg.o, e: ends.map((e) => [q(e[0]), q(e[1]), q(e[2]), e[3]]), w: msg.w }, id);
});

/* ---------- Colpi del giocatore locale ---------- */
weaponHooks.onShot = (o, dirs, ends, wi) => {
  if (net.mode === 'client') {
    sendHost({ t: 'shot', o: [o.x, o.y, o.z], d: dirs.map((d) => [d[0], d[1], d[2]]), w: wi });
  } else if (net.mode === 'host') {
    broadcast({ t: 'fx', o: [o.x, o.y, o.z], e: ends.map((e) => [q(e[0]), q(e[1]), q(e[2]), e[3]]), w: wi });
  }
};

/* ---------- Host: nemici uccisi ---------- */
const origKill = enemyHooks.onKill;
enemyHooks.onKill = (e, head, dir, force) => {
  origKill(e, head, dir, force);
  if (net.mode === 'host') broadcast({ t: 'kill', id: e.id, dx: dir.x, dz: dir.z, f: force });
};

/* ---------- Client: messaggi dall'host ---------- */
on('fx', (msg) => showRemoteShot(msg.o, msg.e.map((e) => [e[0] / 100, e[1] / 100, e[2] / 100, e[3]]), msg.w));
on('kill', (msg) => killProxy(msg.id, msg.dx, msg.dz, msg.f));
on('hit', (msg) => hud.hitMarker(!!msg.k));
on('pick', (msg) => applyPick(msg.k));
on('msg', (msg) => hud.flash(msg.text, msg.s));
on('round', (msg) => { if (unlockForRound(msg.r).length) addAmmo(); });
on('hurt', (msg) => {
  hud.hurt(msg.d / 20);
  player.shake = Math.max(player.shake, 0.06);
  pushPlayer(msg.x, 1.5, msg.z);
  thud(0.35, 80);
});
on('over', (msg) => gameOver(msg));

on('s', (msg) => {
  if (net.mode !== 'client' || game.state === 'menu') return;
  const [round, phase, timer, score, left, kills] = msg.g;
  game.round = round; game.phase = PHASES[phase]; game.timer = timer / 10; game.score = score; game.kills = kills;
  hud.setRound(Math.max(1, round));
  hud.setScore(score);
  hud.setEnemies(left);
  hud.setBreak(game.phase === 'break' && round > 0 ? game.timer : null);
  const seen = new Set();
  for (const p of msg.pl) {
    const [id, slot, x, y, z, yaw, pitch, hp, down, revive, w, speed] = p;
    seen.add(id);
    let m = team.get(id);
    if (!m) { m = { id, slot, local: id === net.myId }; team.set(id, m); }
    m.health = hp; m.down = !!down; m.reviveT = revive / 100;
    if (!m.local) {
      m.x = x / 100; m.y = y / 100; m.z = z / 100;
      setAvatar(id, { slot, x: m.x, y: m.y, z: m.z, yaw: yaw / 100, pitch: pitch / 100, speed: speed / 10, down: m.down, weapon: w });
    }
  }
  for (const id of [...team.keys()]) if (!seen.has(id)) { removeAvatar(id); team.delete(id); }
  applyEnemySnapshot(msg.en);
  for (const o of msg.ob) applyObjectState(o[0], o[1] / 100, o[2] / 100, o[3] / 100, o[4] / 1000, o[5] / 1000, o[6] / 1000, o[7] / 1000);
  applyPickupSnapshot(msg.pk);
});

/* ---------- Ogni frame ---------- */
let sendT = 0, snapCount = 0;

/** Prima della fisica: l'host sposta i corpi dei giocatori remoti verso l'ultima posizione ricevuta. */
export function netBeforePhysics(dt) {
  if (net.mode !== 'host') return;
  const f = 1 - Math.exp(-dt * 15);
  for (const [id, b] of remoteBodies) {
    const m = team.get(id);
    if (!m || !m.seen) continue;
    const t = b.translation();
    b.setNextKinematicTranslation({ x: t.x + (m.x - t.x) * f, y: t.y + (m.y - t.y) * f, z: t.z + (m.z - t.z) * f });
  }
}

function snapshot() {
  snapCount++;
  const pl = [];
  for (const m of team.values()) {
    const p = m.local ? player.pos : m;
    const yaw = m.local ? player.yaw : m.yaw, pitch = m.local ? player.pitch : m.pitch;
    const w = m.local ? currentWeaponIndex() : m.weapon, sp = m.local ? player.speed : m.speed;
    pl.push([m.id, m.slot, q(p.x), q(p.y), q(p.z), q(yaw), q(pitch), Math.round(m.health), m.down ? 1 : 0, q(m.reviveT || 0), w || 0, Math.round((sp || 0) * 10)]);
  }
  const en = enemies.map((e) => {
    const g = e.model.group.position;
    return [e.id, VARIANT_KEYS.indexOf(e.variant), e.faceIdx, q(g.x), q(g.y), q(g.z), q(e.yaw), Math.round((e.health / e.maxHealth) * 100), Math.round(e.attackT * 100), Math.round(e.walk * 100)];
  });
  const full = snapCount % 30 === 0;
  const ob = [];
  for (const o of objects) {
    if (!full && o.body.isSleeping()) continue;
    const t = o.body.translation(), r = o.body.rotation();
    ob.push([o.id, q(t.x), q(t.y), q(t.z), Math.round(r.x * 1000), Math.round(r.y * 1000), Math.round(r.z * 1000), Math.round(r.w * 1000)]);
  }
  return {
    t: 's',
    g: [game.round, Math.max(0, PHASES.indexOf(game.phase)), Math.round(game.timer * 10), game.score, enemies.length + game.toSpawn, game.kills],
    pl, en, ob, pk: pickupSnapshot(),
  };
}

/** Dopo la logica di gioco: avatar, copie dei nemici e invio dei messaggi. */
export function netUpdate(dt) {
  if (net.mode === 'solo' || game.state === 'menu') return;
  updateAvatars(dt);
  if (net.mode === 'host') {
    for (const m of team.values()) {
      if (m.local || !m.seen) continue;
      setAvatar(m.id, { slot: m.slot, x: m.x, y: m.y, z: m.z, yaw: m.yaw, pitch: m.pitch, speed: m.speed, down: m.down });
    }
    sendT -= dt;
    if (sendT <= 0 && game.state === 'playing') { sendT = 1 / 15; broadcast(snapshot()); }
  } else {
    updateProxies(dt);
    syncLocalMember();
    sendT -= dt;
    if (sendT <= 0 && game.state === 'playing') {
      sendT = 1 / 20;
      const p = player.pos;
      sendHost({ t: 'p', x: p.x, y: p.y, z: p.z, yaw: player.yaw, pitch: player.pitch, w: currentWeaponIndex(), s: player.speed });
    }
  }
}

