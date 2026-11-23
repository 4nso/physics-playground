// Giostre su cui si sale davvero: ruota panoramica (world/wheel.js) e montagne russe (world/coaster.js).
//
// Chi comanda la partita (da solo questo dispositivo, in multiplayer l'host) decide tutto:
// posizione e velocità della giostra, stato della corsa e chi è seduto dove. Gli altri mandano richieste
// ("sali", "scendi", "avvia", "ferma", "velocità") e ricevono lo stato nelle istantanee.
// Ogni dispositivo guarda poi in quale posto risulta seduto e fa sedere (o alzare) il proprio giocatore.
//
// Ogni giostra ha uno stato comune:
//   idle      ferma, pronta per salire
//   countdown avvio ritardato: nessuno è seduto, si lascia il tempo di correre a sedersi
//   running   in corsa
//   unloading fine corsa: si fa scendere chi è a bordo
// e un "motore" (DRIVERS) che sa come si muove quel tipo di giostra e dove sono i posti.
// pos = angolo della ruota (radianti) o metri percorsi dal trenino lungo il binario; vel = sua velocità.
import { setSkyView, isTouch } from '../core/renderer.js';
import { pad } from '../core/gamepad.js';
import { thud } from '../core/audio.js';
import { player, sitDown, standUp } from '../player/player.js';
import { map } from '../world/map.js';
import { cabinPivot, WHEEL } from '../world/wheel.js';
import { coasterSeat } from '../world/coaster.js';
import { poseRide } from '../world/rideVisuals.js';
import { net } from '../net/net.js';
import { hud } from '../ui/hud.js';
import { team } from './game.js';

const $ = (id) => document.getElementById(id);
const TAU = Math.PI * 2;
const COUNTDOWN = 6;                        // avvio ritardato quando nessuno è seduto (s)
const BOARD_DIST = 2.2, CTRL_DIST = 1.9;    // distanze per vedere "Sali" e i comandi
const HOST_SLACK = 1.6;                     // l'host è più largo: le posizioni dei client arrivano in ritardo
const SEAT_UP = 0.75;                       // centro della capsula sopra il sedile (seduti)
const STATES = ['idle', 'countdown', 'running', 'unloading'];
const wrapTo = (a, p) => ((a % p) + p) % p;
const tmp = { x: 0, y: 0, z: 0 };
const anyone = (r) => r.seats.some(Boolean);
const approach = (v, want, max) => v + Math.max(-max, Math.min(max, want - v));

/* ======================= Ruota panoramica ======================= */
const W = {
  SPEEDS: [0.1, 0.17, 0.26],   // rad/s: un giro in ~63, 37, 24 s
  RIDE_TIME: 75,               // durata di una corsa (s)
  SLOW: 0.1,                   // per allineare una cabina alla pedana e per far scendere
  ACCEL: 0.06,                 // rad/s²
};
const floorY = (r, k) => cabinPivot(r.def, r.pos, k, tmp).y - WHEEL.HANG;

const wheel = {
  period: () => TAU,
  snap: 0.4,
  seat(r, k, out) {
    cabinPivot(r.def, r.pos, k, out);
    out.y += -WHEEL.HANG + SEAT_UP; out.z -= 0.1;
    return out;
  },
  /** Si può salire sulla cabina k adesso? (deve sfiorare la pedana) */
  boardable: (r, k) => r.state !== 'unloading' && floorY(r, k) < 1.3,
  canLeave: () => '',
  /** Dove ci si ritrova scendendo: sulla pedana se la cabina è in basso, altrimenti si salta giù. */
  exit(r, k, out) {
    const pv = cabinPivot(r.def, r.pos, k, out), floor = pv.y - WHEEL.HANG;
    if (floor < 1.5) { out.y = r.def.plat + 0.9; out.z = r.def.exitZ; } else { out.y = floor + 0.9; out.z += 1.9; }
    return out;
  },
  start(r) {
    if (anyone(r)) { r.state = 'running'; r.timer = W.RIDE_TIME; return 'Si parte!'; }
    r.state = 'countdown'; r.timer = COUNTDOWN;
    return `Si parte tra ${COUNTDOWN} secondi: corri a sederti!`;
  },
  stop(r) {
    if (r.state === 'countdown') { r.state = 'idle'; return 'Partenza annullata'; }
    if (r.state === 'running') { r.state = anyone(r) ? 'unloading' : 'idle'; return 'Fine corsa'; }
    return '';
  },
  simulate(r, dt) {
    let want = 0;
    if (r.state === 'countdown') {
      r.timer -= dt;
      if (r.timer <= 0) { r.state = 'running'; r.timer = W.RIDE_TIME; }
    } else if (r.state === 'running') {
      want = W.SPEEDS[r.level - 1];
      r.timer -= dt;
      if (r.timer <= 0) r.state = anyone(r) ? 'unloading' : 'idle';
    } else if (r.state === 'unloading') {
      // gira piano e fa scendere chi passa in basso
      want = W.SLOW;
      for (let k = 0; k < r.seats.length; k++) if (r.seats[k] && floorY(r, k) < WHEEL.PLAT + 0.35) r.seats[k] = null;
      if (!anyone(r)) r.state = 'idle';
    }
    if (r.state === 'idle') {
      // gira piano fino ad avere una cabina allineata alla pedana, poi si ferma
      const st = TAU / r.def.n, rem = wrapTo(r.pos, TAU) % st;
      const left = rem < 1e-4 ? 0 : st - rem;
      if (left > 0) {
        r.vel = Math.min(W.SLOW, Math.max(r.vel - W.ACCEL * dt, 0.03));
        if (r.vel * dt >= left) { r.pos += left; r.vel = 0; } else r.pos += r.vel * dt;
      } else r.vel = 0;
      r.pos = wrapTo(r.pos, TAU);
      return;
    }
    r.vel = approach(r.vel, want, W.ACCEL * dt);
    r.pos = wrapTo(r.pos + r.vel * dt, TAU);
  },
  info(r) {
    if (r.state === 'running') return `In corsa · velocità ${r.level} · ${Math.max(0, Math.ceil(r.timer))} s`;
    if (r.state === 'unloading') return 'Fine corsa: si scende in basso';
    return '';
  },
};

/* ======================= Montagne russe ======================= */
const C = {
  LAPS: 2,                     // giri per corsa
  LIFT: [2.8, 3.5, 4.5],       // velocità della salita a catena (m/s)
  MULT: [0.8, 1, 1.15],        // quanto "spinge" la discesa a ogni livello
  TOP_V: 3.5,                  // velocità in cima
  MAX_V: 22,
  BRAKE_V: 6,                  // velocità nel tratto di frenata prima della stazione
  STATION_V: 4,
  ACCEL: 10,                   // m/s²
};
const inRange = (s, a, b) => (a <= b ? s >= a && s <= b : s >= a || s <= b);

const coaster = {
  period: (r) => r.def.track.L,
  snap: 3,
  seat: (r, k, out) => coasterSeat(r.def, r.pos, k, SEAT_UP, out),
  boardable: (r) => r.state === 'idle' || r.state === 'countdown',
  canLeave: (r) => (r.state === 'idle' || r.state === 'countdown' ? '' : '⏳ Si scende in stazione, a fine corsa'),
  /** Si scende sempre sulla banchina, accanto al proprio posto. */
  exit(r, k, out) {
    coasterSeat(r.def, r.pos, k, SEAT_UP, out);
    out.y = r.def.plat + 0.9; out.z = r.def.exitZ;
    return out;
  },
  start(r) {
    r.timer = 0; r.goal = 0; // timer = metri percorsi in questa corsa; goal = dove fermarsi (0 = dopo LAPS giri)
    if (anyone(r)) { r.state = 'running'; return 'Tenetevi forte!'; }
    r.state = 'countdown'; r.timer = COUNTDOWN;
    return `Si parte tra ${COUNTDOWN} secondi: corri a sederti!`;
  },
  stop(r) {
    if (r.state === 'countdown') { r.state = 'idle'; r.timer = 0; return 'Partenza annullata'; }
    if (r.state === 'running') {
      // non si frena in aria: si ferma alla prossima stazione
      r.goal = Math.min(r.goal || Infinity, Math.ceil((r.timer + 20) / r.def.track.L) * r.def.track.L);
      return 'Si ferma alla prossima stazione';
    }
    return '';
  },
  /** Velocità "giusta" in un punto: catena in salita, gravità in discesa, freni prima della stazione. */
  target(r) {
    const d = r.def, s = r.pos, lvl = r.level - 1;
    if (inRange(s, d.liftS0, d.liftS1)) return C.LIFT[lvl];
    if (inRange(s, d.brakeS0, d.brakeS1)) return C.BRAKE_V;
    if (inRange(s, d.brakeS1, d.liftS0)) return C.STATION_V;
    const y = d.track.py[Math.floor(wrapTo(s, d.track.L) / d.track.step) % d.track.n];
    return Math.min(C.MAX_V, Math.sqrt(C.TOP_V ** 2 + 2 * 9.8 * Math.max(0, d.yTop - y)) * C.MULT[lvl]);
  },
  simulate(r, dt) {
    const d = r.def, L = d.track.L;
    if (r.state === 'countdown') {
      r.timer -= dt;
      if (r.timer <= 0) { r.state = 'running'; r.timer = 0; }
    }
    if (r.state !== 'running') { r.vel = 0; r.pos = d.stationS; return; }
    const goal = r.goal || C.LAPS * L;
    const left = goal - r.timer;
    let want = coaster.target(r);
    if (left < 16) want = Math.min(want, Math.max(0.6, left * 0.9)); // ultima frenata: si ferma in stazione
    r.vel = approach(r.vel, want, C.ACCEL * dt);
    const ds = r.vel * dt;
    if (ds >= left) {
      // arrivati: tutti giù sulla banchina
      r.pos = d.stationS; r.vel = 0; r.timer = 0; r.goal = 0;
      r.state = 'idle';
      for (let k = 0; k < r.seats.length; k++) r.seats[k] = null;
      return;
    }
    r.timer += ds;
    r.pos = wrapTo(r.pos + ds, L);
  },
  info(r) {
    if (r.state === 'running') return `Giro ${Math.min(C.LAPS, Math.floor(r.timer / r.def.track.L) + 1)}/${C.LAPS} · velocità ${r.level} · ${Math.round(r.vel * 3.6)} km/h`;
    return '';
  },
};

const DRIVERS = { wheel, coaster };
const drv = (r) => DRIVERS[r.def.kind];

/** Rete (impostato da net/sync.js): manda una richiesta all'host. */
export const rideNet = { toHost: null };

/** Giostre della partita: { def, state, pos, vel, level, timer, seats[] } */
export let rides = [];

/** Nuova partita: giostre ferme e vuote. */
export function resetRides() {
  if (player.seated) leaveSeat(null);
  rides = (map.rides || []).filter((def) => DRIVERS[def.kind]).map((def) => ({
    def, state: 'idle', pos: def.kind === 'coaster' ? def.stationS : 0, vel: 0, level: 1, timer: 0, goal: 0,
    seats: new Array(def.n).fill(null),
  }));
  for (const r of rides) poseRide(r.def, r.pos);
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
 * c = posto (per 'board'). Restituisce un messaggio da mostrare a chi ha chiesto (o '').
 */
export function serverRide(id, ri, a, c) {
  const r = rides[ri];
  if (!r) return '';
  const D = drv(r);
  const seat = r.seats.indexOf(id);
  const p = posOfMember(id);
  const slack = id === net.myId ? 0 : HOST_SLACK;
  if (a === 'leave') {
    if (seat < 0) return '';
    const why = D.canLeave(r);
    if (why) return why;
    r.seats[seat] = null;
    return '';
  }
  if (!p || !memberOk(id)) return '';
  if (a === 'board') {
    c |= 0;
    if (seat >= 0 || c < 0 || c >= r.def.n) return '';
    if (rides.some((o) => o.seats.includes(id))) return '';
    if (r.seats[c]) return '❌ Posto occupato';
    if (!D.boardable(r, c)) return r.state === 'unloading' ? '⏳ La corsa sta finendo: aspetta' : '⏳ Aspetta che la giostra si fermi';
    const sp = D.seat(r, c, tmp);
    if (Math.hypot(p.x - sp.x, p.z - sp.z) > BOARD_DIST + slack) return '❌ Il posto è troppo lontano';
    r.seats[c] = id;
    return '';
  }
  // comandi: bisogna essere alla cabina di comando
  if (Math.hypot(p.x - r.def.ctrl.x, p.z - r.def.ctrl.z) > CTRL_DIST + 0.6 + slack) return '❌ Vai alla cabina di comando';
  const icon = r.def.icon;
  if (a === 'speed') { r.level = (r.level % 3) + 1; return `${icon} Velocità ${r.level}`; }
  if (a === 'start' && (r.state === 'idle' || r.state === 'unloading')) return `${icon} ${D.start(r)}`;
  if (a === 'stop') { const t = D.stop(r); return t ? `${icon} ${t}` : ''; }
  return '';
}

/** Avanza lo stato di una giostra (solo chi comanda). */
function simulate(r, dt) {
  for (let k = 0; k < r.seats.length; k++) if (r.seats[k] && !memberOk(r.seats[k])) r.seats[k] = null;
  drv(r).simulate(r, dt);
}

/* ---------- Istantanee per i client ---------- */
export function rideSnapshot() {
  return rides.map((r) => [STATES.indexOf(r.state), Math.round(r.pos * 1000), Math.round(r.vel * 1000), r.level, Math.round(r.timer * 10), r.seats.map((s) => s || '')]);
}
export function applyRideSnapshot(list) {
  if (!Array.isArray(list)) return;
  list.forEach((s, i) => {
    const r = rides[i];
    if (!r || !Array.isArray(s)) return;
    const D = drv(r), P = D.period(r);
    r.state = STATES[s[0]] || 'idle';
    r.vel = s[2] / 1000; r.level = s[3] || 1; r.timer = s[4] / 10;
    r.seats = (s[5] || []).map((x) => x || null);
    // la posizione si corregge piano (tra un'istantanea e l'altra il client la fa avanzare da solo)
    let d = wrapTo(s[1] / 1000 - r.pos, P);
    if (d > P / 2) d -= P;
    r.pos = Math.abs(d) > D.snap ? s[1] / 1000 : wrapTo(r.pos + d * 0.35, P);
  });
}

/* ---------- Questo giocatore: sedersi e alzarsi ---------- */
let mySeat = null; // { r, k }
let ignoreSeatUntil = 0; // client: appena sceso, per un attimo non ci si risiede (l'host deve ancora saperlo)

function takeSeat(r, k) {
  mySeat = { r, k };
  drv(r).seat(r, k, tmp);
  sitDown(tmp.x, tmp.y, tmp.z);
  thud(0.2, 420);
}

/** Si alza: il punto d'arrivo lo decide il tipo di giostra. */
function leaveSeat(r) {
  const s = mySeat;
  mySeat = null;
  if (!player.seated) return;
  if (s && r) {
    drv(s.r).exit(s.r, s.k, tmp);
    standUp(tmp.x, tmp.y, tmp.z);
  } else {
    const p = player.seatPos;
    standUp(p.x, p.y, p.z + 1.9);
  }
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
  if (mySeat) drv(mySeat.r).seat(mySeat.r, mySeat.k, player.seatPos);
}

/* ---------- Dall'alto si vede lontano ---------- */
let viewK = 0;
function setView(k, force) {
  if (!force && Math.abs(k - viewK) < 0.01) return;
  viewK = k;
  setSkyView(k);
}

/* ---------- Pannello (Sali / Scendi / comandi) ---------- */
let near = null;       // cosa si può fare qui: { kind: 'seat' | 'board' | 'ctrl', r, k }
let built = '', boxShown = false;

function hideBox() {
  if (!boxShown) return;
  boxShown = false;
  built = null; // alla prossima apertura il pannello si ricostruisce sempre
  $('ride').classList.add('hidden');
}

function buttons() {
  if (!near) return [];
  // tasto da premere: col controller B (sali/scendi, avvia/ferma) e croce giù (velocità)
  const k = (key, padKey) => (pad.active ? ` <kbd>${padKey}</kbd>` : isTouch ? '' : ` <kbd>${key}</kbd>`);
  // su touch Sali/Scendi e Avvia/Ferma stanno nel pulsante d'azione: qui restano info e velocità
  if (isTouch && !pad.active) return near.kind === 'ctrl' ? [['speed', `⚡ Velocità ${near.r.level}`]] : [];
  if (near.kind === 'seat') return [['seat', `⬇️ Scendi${k('F', 'B')}`]];
  if (near.kind === 'board') return [['seat', `🪑 Sali${k('F', 'B')}`]];
  const r = near.r, on = r.state === 'running' || r.state === 'countdown';
  return [['toggle', on ? `⏹️ Ferma${k('G', 'B')}` : `▶️ Avvia${k('G', 'B')}`], ['speed', `⚡ Velocità ${r.level}${k('V', '▼')}`]];
}

function info(r) {
  if (r.state === 'countdown') return `Si parte tra ${Math.max(1, Math.ceil(r.timer))}…`;
  return drv(r).info(r) || 'Ferma';
}

let shownInfo = '';
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
  const txt = info(near.r);
  if (txt !== shownInfo) { shownInfo = txt; $('rideInfo').textContent = txt; }
}

/** Cosa può fare il giocatore qui? */
function findNear() {
  if (mySeat) return { kind: 'seat', r: mySeat.r, k: mySeat.k };
  if (!player.alive) return null;
  const p = player.pos;
  let best = null, bd = BOARD_DIST;
  for (const r of rides) {
    if (Math.hypot(p.x - r.def.ctrl.x, p.z - r.def.ctrl.z) < CTRL_DIST && Math.abs(p.y - 0.9) < 1.5) return { kind: 'ctrl', r };
    const D = drv(r);
    for (let k = 0; k < r.def.n; k++) {
      if (r.seats[k] || !D.boardable(r, k)) continue;
      const sp = D.seat(r, k, tmp);
      if (Math.abs(p.y - (sp.y - SEAT_UP) - 0.5) > 1.4) continue;
      const d = Math.hypot(p.x - sp.x, p.z - sp.z);
      if (d < bd) { bd = d; best = { kind: 'board', r, k }; }
    }
  }
  return best;
}

/** Cosa si può fare qui con la giostra: 'seat' (scendi), 'board' (sali), 'ctrl' (comandi) o null. */
export const rideNearKind = () => (near ? near.kind : null);

/** Pulsante d'azione touch per la giostra qui vicino (o null). */
export function rideActionButton() {
  if (!near) return null;
  if (near.kind === 'seat') return { id: 'leave', icon: '⬇️', label: 'Scendi', kind: 'ride' };
  if (near.kind === 'board') return { id: 'board', icon: '🪑', label: 'Sali', kind: 'ride' };
  const on = near.r.state === 'running' || near.r.state === 'countdown';
  return on ? { id: 'stop', icon: '⏹️', label: 'Ferma', kind: 'ride' } : { id: 'start', icon: '▶️', label: 'Avvia', kind: 'ride' };
}

/** Azione del giocatore locale: 'seat' (sali/scendi), 'toggle' (avvia/ferma), 'speed'. */
export function rideAction(what) {
  if (!near) return;
  const r = near.r, ri = rides.indexOf(r);
  let a = what, c = 0;
  if (what === 'seat') {
    if (near.kind === 'seat') a = 'leave';
    else if (near.kind === 'board') { a = 'board'; c = near.k; } else return;
  } else if (near.kind !== 'ctrl') return;
  else if (what === 'toggle') a = r.state === 'running' || r.state === 'countdown' ? 'stop' : 'start';
  thud(0.12, 600);
  if (net.mode === 'client') {
    if (a === 'leave') {
      const why = drv(r).canLeave(r);
      if (why) { hud.flash(why, 1.6); return; }
      if (mySeat) { r.seats[mySeat.k] = null; ignoreSeatUntil = performance.now() + 1500; } // si scende subito
    }
    if (rideNet.toHost) rideNet.toHost({ t: 'ride', r: ri, a, c });
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
 * playing = partita in corso e senza menu aperto (serve per mostrare il pannello).
 */
export function updateRides(dt, authority, playing) {
  if (!rides.length) return;
  wire();
  for (const r of rides) {
    if (authority) { if (dt > 0) simulate(r, dt); }
    else if (r.state === 'running' || r.def.kind === 'wheel') r.pos = wrapTo(r.pos + r.vel * dt, drv(r).period(r));
    poseRide(r.def, r.pos);
  }
  syncMySeat();
  near = playing ? findNear() : null;
  updateBox();
  // seduti in alto la nebbia si allontana: dall'alto si vede tutta la mappa
  const k = player.seated ? Math.max(0, Math.min(1, (player.seatPos.y - 4) / 12)) : 0;
  setView(viewK + (k - viewK) * Math.min(1, dt * 2));
}

