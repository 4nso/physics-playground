// Giostre su cui si sale davvero (per ora la ruota panoramica; il disegno è in world/wheel.js).
//
// Chi comanda la partita (da solo questo dispositivo, in multiplayer l'host) decide tutto:
// angolo e velocità della ruota, stato della corsa e chi è seduto dove. Gli altri mandano richieste
// ("sali", "scendi", "avvia", "ferma", "velocità") e ricevono lo stato nelle istantanee.
// Ogni dispositivo guarda poi in quale posto risulta seduto e fa sedere (o alzare) il proprio giocatore.
//
// Stati di una giostra:
//   idle      ferma, con una cabina allineata alla pedana (se serve gira piano fino ad allinearla)
//   countdown avvio ritardato: nessuno è seduto, si lascia il tempo di correre a sedersi
//   running   in corsa per RIDE_TIME secondi alla velocità scelta
//   unloading fine corsa: gira piano e fa scendere chi passa in basso, poi torna ferma
import { camera, scene, VIEW_DIST, isTouch } from '../core/renderer.js';
import { thud } from '../core/audio.js';
import { player, sitDown, standUp } from '../player/player.js';
import { map } from '../world/map.js';
import { cabinPivot, poseRide, WHEEL } from '../world/wheel.js';
import { net } from '../net/net.js';
import { hud } from '../ui/hud.js';
import { team } from './game.js';

const $ = (id) => document.getElementById(id);
const TAU = Math.PI * 2;
export const SPEEDS = [0.1, 0.17, 0.26];   // velocità della ruota (radianti al secondo): un giro in ~63, 37, 24 s
const RIDE_TIME = 75;                       // durata di una corsa (s)
const COUNTDOWN = 6;                        // avvio ritardato quando nessuno è seduto (s)
const SLOW = 0.1;                           // velocità per allineare e far scendere
const ACCEL = 0.06;                         // accelerazione (rad/s²)
const BOARD_DIST = 2.2, CTRL_DIST = 1.9;    // distanze per vedere "Sali" e i comandi
const HOST_SLACK = 1.6;                     // l'host è più largo: le posizioni dei client arrivano in ritardo
const SEAT_UP = 0.75;                       // centro della capsula sopra il pavimento della cabina (seduti)
const STATES = ['idle', 'countdown', 'running', 'unloading'];
const STATE_TEXT = { idle: 'Ferma', countdown: 'Si parte tra', running: 'In corsa', unloading: 'Fine corsa: si scende in basso' };

/** Rete (impostato da net/sync.js): manda una richiesta all'host. */
export const rideNet = { toHost: null };

/** Giostre della partita: { def, state, angle, omega, level, timer, seats[] } */
export let rides = [];

const tmp = { x: 0, y: 0, z: 0 };
const floorY = (r, k) => cabinPivot(r.def, r.angle, k, tmp).y - WHEEL.HANG;
const step = (r) => TAU / r.def.n;
const wrap = (a) => ((a % TAU) + TAU) % TAU;

/** Nuova partita: giostre ferme e vuote. */
export function resetRides() {
  if (player.seated) leaveSeat(null);
  rides = (map.rides || []).map((def) => ({ def, state: 'idle', angle: 0, omega: 0, level: 1, timer: 0, seats: new Array(def.n).fill(null) }));
  for (const r of rides) poseRide(r.def, 0);
  mySeat = null;
  setView(0, true);
  hideBox();
}

/* ---------- Chi comanda: decide le richieste ---------- */
function posOfMember(id) {
  const m = team.get(id);
  if (!m) return null;
  return m.local ? player.pos : m;
}
function memberOk(id) {
  const m = team.get(id);
  return !!m && !m.down;
}

/**
 * Richiesta di un giocatore (id) per la giostra ri. a = 'board' | 'leave' | 'start' | 'stop' | 'speed'.
 * c = cabina (per 'board'). Restituisce un messaggio da mostrare a chi ha chiesto (o '').
 */
export function serverRide(id, ri, a, c) {
  const r = rides[ri];
  if (!r) return '';
  const seat = r.seats.indexOf(id);
  const p = posOfMember(id);
  const slack = id === net.myId ? 0 : HOST_SLACK;
  if (a === 'leave') { if (seat >= 0) r.seats[seat] = null; return ''; }
  if (!p || !memberOk(id)) return '';
  if (a === 'board') {
    c |= 0;
    if (seat >= 0 || c < 0 || c >= r.def.n) return '';
    if (rides.some((o) => o.seats.includes(id))) return '';
    if (r.seats[c]) return '❌ Posto occupato';
    if (r.state === 'unloading') return '⏳ La corsa sta finendo: aspetta';
    const pv = cabinPivot(r.def, r.angle, c, tmp);
    if (pv.y - WHEEL.HANG > 1.3 || Math.hypot(p.x - pv.x, p.z - pv.z) > BOARD_DIST + slack) return '❌ La cabina è troppo lontana';
    r.seats[c] = id;
    return '';
  }
  // comandi: bisogna essere alla cabina di comando
  if (Math.hypot(p.x - r.def.ctrl.x, p.z - r.def.ctrl.z) > CTRL_DIST + 0.6 + slack) return '❌ Vai alla cabina di comando';
  if (a === 'speed') { r.level = (r.level % SPEEDS.length) + 1; return `${r.def.icon} Velocità ${r.level}`; }
  const busy = r.seats.some(Boolean);
  if (a === 'start') {
    if (r.state === 'running' || r.state === 'countdown') return '';
    if (busy) { r.state = 'running'; r.timer = RIDE_TIME; return `${r.def.icon} Si parte!`; }
    r.state = 'countdown'; r.timer = COUNTDOWN;
    return `${r.def.icon} Si parte tra ${COUNTDOWN} secondi: corri a sederti!`;
  }
  if (a === 'stop') {
    if (r.state === 'countdown') { r.state = 'idle'; return `${r.def.icon} Partenza annullata`; }
    if (r.state === 'running') { r.state = busy ? 'unloading' : 'idle'; return `${r.def.icon} Fine corsa`; }
  }
  return '';
}

/** Avanza lo stato di una giostra (solo chi comanda). */
function simulate(r, dt) {
  for (let k = 0; k < r.seats.length; k++) if (r.seats[k] && !memberOk(r.seats[k])) r.seats[k] = null;
  let want = 0;
  if (r.state === 'countdown') {
    r.timer -= dt;
    if (r.timer <= 0) { r.state = 'running'; r.timer = RIDE_TIME; }
  } else if (r.state === 'running') {
    want = SPEEDS[r.level - 1];
    r.timer -= dt;
    if (r.timer <= 0) r.state = r.seats.some(Boolean) ? 'unloading' : 'idle';
  } else if (r.state === 'unloading') {
    want = SLOW;
    for (let k = 0; k < r.seats.length; k++) if (r.seats[k] && floorY(r, k) < WHEEL.PLAT + 0.35) r.seats[k] = null;
    if (!r.seats.some(Boolean)) r.state = 'idle';
  }
  if (r.state === 'idle') {
    // gira piano fino ad avere una cabina allineata alla pedana, poi si ferma
    const rem = wrap(r.angle) % step(r);
    const left = rem < 1e-4 ? 0 : step(r) - rem;
    if (left > 0) {
      r.omega = Math.min(SLOW, Math.max(r.omega - ACCEL * dt, 0.03));
      if (r.omega * dt >= left) { r.angle += left; r.omega = 0; }
      else r.angle += r.omega * dt;
    } else r.omega = 0;
    r.angle = wrap(r.angle);
    return;
  }
  const d = want - r.omega, mx = ACCEL * dt;
  r.omega += Math.max(-mx, Math.min(mx, d));
  r.angle = wrap(r.angle + r.omega * dt);
}

/* ---------- Istantanee per i client ---------- */
export function rideSnapshot() {
  return rides.map((r) => [STATES.indexOf(r.state), Math.round(r.angle * 1000), Math.round(r.omega * 1000), r.level, Math.round(r.timer * 10), r.seats.map((s) => s || '')]);
}
export function applyRideSnapshot(list) {
  if (!Array.isArray(list)) return;
  list.forEach((s, i) => {
    const r = rides[i];
    if (!r || !Array.isArray(s)) return;
    r.state = STATES[s[0]] || 'idle';
    r.omega = s[2] / 1000; r.level = s[3] || 1; r.timer = s[4] / 10;
    r.seats = (s[5] || []).map((x) => x || null);
    // l'angolo si corregge piano (tra un'istantanea e l'altra il client lo fa avanzare da solo)
    let d = wrap(s[1] / 1000 - r.angle);
    if (d > Math.PI) d -= TAU;
    r.angle = Math.abs(d) > 0.4 ? s[1] / 1000 : r.angle + d * 0.35;
  });
}

/* ---------- Questo giocatore: sedersi e alzarsi ---------- */
let mySeat = null; // { r, k }
let ignoreSeatUntil = 0; // client: appena sceso, per un attimo non ci si risiede (l'host deve ancora saperlo)

function seatPoint(r, k, out) {
  cabinPivot(r.def, r.angle, k, out);
  out.y += -WHEEL.HANG + SEAT_UP;
  out.z -= 0.1;
  return out;
}

function takeSeat(r, k) {
  mySeat = { r, k };
  seatPoint(r, k, tmp);
  sitDown(tmp.x, tmp.y, tmp.z);
  hud.setGrabVisible(false);
  thud(0.2, 420);
}

/** Si alza: se la cabina è in basso si scende sulla pedana, altrimenti si salta giù. */
function leaveSeat(r) {
  const s = mySeat;
  mySeat = null;
  if (!player.seated) return;
  if (s && r) {
    const pv = cabinPivot(s.r.def, s.r.angle, s.k, tmp);
    const floor = pv.y - WHEEL.HANG;
    if (floor < 1.5) standUp(pv.x, s.r.def.plat + 0.9, s.r.def.exitZ);
    else standUp(pv.x, floor + 0.9, pv.z + 1.9);
  } else {
    const p = player.seatPos;
    standUp(p.x, p.y, p.z + 1.9);
  }
  hud.setGrabVisible(net.mode !== 'client');
  thud(0.15, 260);
}

/** Allinea il giocatore locale con quello che dice chi comanda. */
function syncMySeat() {
  const me = net.myId;
  let found = null;
  if (performance.now() > ignoreSeatUntil) {
    for (const r of rides) {
      const k = r.seats.indexOf(me);
      if (k >= 0) { found = { r, k }; break; }
    }
  }
  if (found && (!mySeat || mySeat.r !== found.r || mySeat.k !== found.k)) {
    if (mySeat) leaveSeat(null);
    takeSeat(found.r, found.k);
  } else if (!found && mySeat) leaveSeat(mySeat.r);
  if (mySeat) seatPoint(mySeat.r, mySeat.k, player.seatPos);
}

/* ---------- Dall'alto si vede lontano ---------- */
let viewK = 0;
function setView(k, force) {
  if (!force && Math.abs(k - viewK) < 0.01) return;
  viewK = k;
  scene.fog.near = 16 + 30 * k;
  scene.fog.far = VIEW_DIST - 3 + 55 * k;
  camera.far = VIEW_DIST + 55 * k;
  camera.updateProjectionMatrix();
}

/* ---------- Pannello (Sali / Scendi / comandi) ---------- */
let near = null;       // cosa si può fare qui: { kind: 'seat' | 'board' | 'ctrl', r, k }
let built = '', boxShown = false;

function hideBox() {
  if (!boxShown) return;
  boxShown = false;
  built = '';
  $('ride').classList.add('hidden');
}

function buttons() {
  if (!near) return [];
  const k = (key) => (isTouch ? '' : ` <kbd>${key}</kbd>`);
  if (near.kind === 'seat') return [['seat', `⬇️ Scendi${k('F')}`]];
  if (near.kind === 'board') return [['seat', `🪑 Sali${k('F')}`]];
  const r = near.r, on = r.state === 'running' || r.state === 'countdown';
  return [['toggle', on ? `⏹️ Ferma${k('G')}` : `▶️ Avvia${k('G')}`], ['speed', `⚡ Velocità ${r.level}${k('V')}`]];
}

function info(r) {
  if (r.state === 'countdown') return `${STATE_TEXT.countdown} ${Math.max(1, Math.ceil(r.timer))}…`;
  if (r.state === 'running') return `${STATE_TEXT.running} · velocità ${r.level} · ${Math.max(0, Math.ceil(r.timer))} s`;
  return STATE_TEXT[r.state];
}

function updateBox() {
  if (!near) { hideBox(); return; }
  const list = buttons();
  const key = list.map((b) => b.join(':')).join('|');
  if (!boxShown) { boxShown = true; $('ride').classList.remove('hidden'); }
  if (key !== built) {
    built = key;
    $('rideTitle').textContent = `${near.r.def.icon} ${near.r.def.name}`;
    $('rideBtns').innerHTML = list.map(([a, label]) => `<button data-a="${a}">${label}</button>`).join('');
  }
  $('rideInfo').textContent = info(near.r);
}

/** Cosa può fare il giocatore qui? */
function findNear() {
  if (mySeat) return { kind: 'seat', r: mySeat.r, k: mySeat.k };
  if (!player.alive) return null;
  const p = player.pos;
  let best = null, bd = BOARD_DIST;
  for (const r of rides) {
    if (Math.hypot(p.x - r.def.ctrl.x, p.z - r.def.ctrl.z) < CTRL_DIST && Math.abs(p.y - 0.9) < 1.5) return { kind: 'ctrl', r };
    if (r.state === 'unloading') continue;
    for (let k = 0; k < r.def.n; k++) {
      if (r.seats[k]) continue;
      const pv = cabinPivot(r.def, r.angle, k, tmp), fy = pv.y - WHEEL.HANG;
      if (fy > 1.3 || Math.abs(p.y - 0.85 - fy) > 1.2) continue;
      const d = Math.hypot(p.x - pv.x, p.z - pv.z);
      if (d < bd) { bd = d; best = { kind: 'board', r, k }; }
    }
  }
  return best;
}

/** Azione del giocatore locale: 'seat' (sali/scendi), 'toggle' (avvia/ferma), 'speed'. */
export function rideAction(what) {
  if (!near) return;
  const ri = rides.indexOf(near.r);
  let a = what, c = 0;
  if (what === 'seat') {
    if (near.kind === 'seat') a = 'leave';
    else if (near.kind === 'board') { a = 'board'; c = near.k; } else return;
  } else if (near.kind !== 'ctrl') return;
  else if (what === 'toggle') {
    const on = near.r.state === 'running' || near.r.state === 'countdown';
    a = on ? 'stop' : 'start';
  }
  thud(0.12, 600);
  if (net.mode === 'client') {
    if (rideNet.toHost) rideNet.toHost({ t: 'ride', r: ri, a, c });
    if (a === 'leave' && mySeat) { mySeat.r.seats[mySeat.k] = null; ignoreSeatUntil = performance.now() + 1500; } // si scende subito
    return;
  }
  const msg = serverRide(net.myId, ri, a, c);
  if (msg) hud.flash(msg, 1.8);
}

let wired = false;
function wire() {
  if (wired) return;
  wired = true;
  $('rideBtns').addEventListener('pointerdown', (e) => {
    const b = e.target.closest('[data-a]');
    if (!b) return;
    e.preventDefault(); e.stopPropagation();
    rideAction(b.dataset.a);
  });
}

/**
 * A ogni frame, prima del giocatore. authority = da solo o host.
 * playing = partita in corso (in pausa le giostre si fermano solo da soli).
 */
export function updateRides(dt, authority, playing) {
  if (!rides.length) return;
  wire();
  for (const r of rides) {
    if (authority) { if (dt > 0) simulate(r, dt); }
    else r.angle = wrap(r.angle + r.omega * dt);
    poseRide(r.def, r.angle);
  }
  syncMySeat();
  near = playing ? findNear() : null;
  updateBox();
  // seduti in alto la nebbia si allontana: dalla cima si vede tutta la mappa
  const k = player.seated ? Math.max(0, Math.min(1, (player.seatPos.y - 4) / 12)) : 0;
  setView(viewK + (k - viewK) * Math.min(1, dt * 2));
}
