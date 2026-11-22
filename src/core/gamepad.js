// Controller (Gamepad API): Xbox, PlayStation e simili collegati via Bluetooth, su iPad, telefono e computer.
// Safari mostra il controller solo dopo la prima pressione di un tasto: da lì si attiva da solo.
// In partita muove, guarda e spara; nei menu sposta la selezione (A conferma, B indietro).
// Quando si usa il controller il corpo della pagina ha la classe "pad" (spariscono i pulsanti touch);
// toccando lo schermo, usando mouse o tastiera si torna ai controlli di prima.
import { input } from './input.js';
import { initAudio } from './audio.js';
import { setRumblePad } from './rumble.js';
import { view } from './renderer.js';
import { settings } from '../ui/settings.js';
import { player } from '../player/player.js';
import { staticBlocked } from '../world/raycast.js';

const $ = (id) => document.getElementById(id);

// Mappatura "standard" della Gamepad API (uguale per Xbox e PlayStation)
const A = 0, B = 1, X = 2, Y = 3, LB = 4, RB = 5, LT = 6, RT = 7, VIEW = 8, MENU = 9, L3 = 10;
const UP = 12, DOWN = 13, LEFT = 14, RIGHT = 15;
const N = 17;

export const pad = { active: false, connected: false, name: '' };
const modeListeners = [];
/** fn(attivo) quando si passa dal controller al touch/mouse e viceversa (e subito una volta). */
export function onPadMode(fn) { modeListeners.push(fn); fn(pad.active); }
function setActive(on) {
  if (pad.active === on) return;
  pad.active = on;
  document.body.classList.toggle('pad', on);
  if (!on) clearFocus();
  for (const fn of modeListeners) fn(on);
}

const cur = new Array(N).fill(false), prev = new Array(N).fill(false);
const down = (i) => cur[i] && !prev[i];
const up = (i) => !cur[i] && prev[i];

let actions = null, hooks = null;
/**
 * actions: le stesse azioni di tastiera e touch (vedi core/input.js).
 * hooks: { interact(), shopActive(), shopMove(dir), shopBuy(), rideSpeed(), stats(), eachEnemy(fn(x, z, model)), zoomed() }
 */
export function setupGamepad(a, h) {
  actions = a; hooks = h;
  // tocco, mouse o tastiera: si torna ai controlli di prima
  addEventListener('pointerdown', () => setActive(false), true);
  addEventListener('keydown', () => setActive(false), true);
  addEventListener('gamepadconnected', (e) => noteConnected(e.gamepad));
  addEventListener('gamepaddisconnected', () => {
    if (!readPad()) { pad.connected = false; setActive(false); setRumblePad(null); showPadNote(); }
  });
  showPadNote();
}

function noteConnected(g) {
  if (!g) return;
  pad.connected = true;
  pad.name = padName(g.id);
  showPadNote();
}
/** Nome leggibile del controller (dal suo id, es. "Xbox Wireless Controller (STANDARD GAMEPAD …)"). */
function padName(id) {
  const s = String(id || '');
  if (/xbox|xinput|045e/i.test(s)) return 'Xbox';
  if (/dualsense|dualshock|playstation|054c/i.test(s)) return 'PlayStation';
  return '';
}
function showPadNote() {
  const el = $('padNote');
  if (!el) return;
  if (!navigator.getGamepads) { el.textContent = ''; return; }
  el.textContent = pad.connected
    ? `🎮 Controller ${pad.name} collegato: muovi con la croce, A conferma, B indietro`
    : '🎮 Hai un controller? Collegalo via Bluetooth e premi un tasto';
}

function readPad() {
  if (!navigator.getGamepads) return null;
  let best = null;
  let list;
  try { list = navigator.getGamepads(); } catch (e) { return null; }
  for (const g of list) if (g && g.connected !== false && (!best || g.timestamp > best.timestamp)) best = g;
  return best;
}

/** Zona morta circolare: restituisce [x, y] riscalati da 0 (bordo della zona morta) a 1. */
function stick(x, y, dead) {
  const m = Math.hypot(x, y);
  if (m < dead) return [0, 0, 0];
  const k = Math.min(1, (m - dead) / (1 - dead));
  return [(x / m) * k, (y / m) * k, k];
}

/* ---------- Ciclo: da chiamare a ogni frame ---------- */
let wasGame = false, runLatch = false, boostT = 0, zoomByLT = false;
export function updateGamepad(dt) {
  const g = readPad();
  if (!g) {
    for (let i = 0; i < N; i++) cur[i] = prev[i] = false;
    input.padX = input.padY = 0; input.padRun = false;
    return;
  }
  for (let i = 0; i < N; i++) {
    const b = g.buttons[i];
    cur[i] = !!b && (b.pressed || b.value > (i === LT || i === RT ? 0.35 : 0.5));
  }
  const ax = g.axes;
  const lx = ax[0] || 0, ly = ax[1] || 0, rx = ax[2] || 0, ry = ax[3] || 0;
  let any = false;
  for (let i = 0; i < N; i++) if (down(i)) any = true;
  if (any || Math.hypot(lx, ly) > 0.6 || Math.hypot(rx, ry) > 0.6) {
    if (!pad.connected || !pad.name) noteConnected(g);
    if (any) initAudio();
    if (!pad.active) {
      setActive(true);
      // nei menu la prima pressione serve solo ad attivare il controller e mostrare la selezione
      if (topScreen()) for (let i = 0; i < N; i++) prev[i] = cur[i];
    }
  }
  setRumblePad(pad.active ? g : null);

  const screen = topScreen();
  const game = !screen && input.enabled;
  if (wasGame && !game) {
    // si esce dal gioco (pausa, fine partita): niente comandi rimasti a metà
    input.padX = input.padY = 0; input.padRun = false;
    runLatch = false; zoomByLT = false;
  }
  wasGame = game;
  if (screen) menu(screen, dt, lx, ly);
  else {
    if (focusScreen) { focusScreen = null; clearFocus(); }
    if (game && pad.active) play(dt, lx, ly, rx, ry);
  }
  for (let i = 0; i < N; i++) prev[i] = cur[i];
}

/* ---------- In partita ---------- */
function play(dt, lx, ly, rx, ry) {
  const shopping = hooks.shopActive();
  // movimento: levetta sinistra (premuta = corsa finché la si tiene spinta)
  const [mx, my, mm] = stick(lx, ly, 0.18);
  input.padX = mx; input.padY = -my;
  if (down(L3)) runLatch = true;
  if (mm < 0.3) runLatch = false;
  input.padRun = runLatch;

  // visuale: levetta destra con zona morta e curva (piano per mirare, veloce a fondo corsa)
  const [vx, vy, vm] = stick(rx, ry, 0.13);
  const assist = settings.aimAssist && player.alive ? aimAssist(dt, vm, mm) : 1;
  if (vm > 0) {
    boostT = vm > 0.93 ? boostT + dt : 0;
    const boost = 1 + Math.min(1, Math.max(0, (boostT - 0.25) / 0.35)) * 0.5; // a fondo per un po': gira più svelto
    const curve = 0.3 * vm + 0.7 * vm * vm * vm;
    const k = (curve / vm) * settings.padLook * boost * assist * dt;
    input.lookX -= vx * k * 3.1;
    input.lookY -= vy * k * 2.1;
  } else boostT = 0;

  // grilletti: RT spara (tenuto = fuoco continuo), LT mirino tenuto premuto
  if (down(RT)) actions.trigger(true);
  if (up(RT)) actions.trigger(false);
  if (down(LT) && !hooks.zoomed()) { actions.zoom(); zoomByLT = hooks.zoomed(); }
  if (up(LT) && zoomByLT) { if (hooks.zoomed()) actions.zoom(); zoomByLT = false; }

  if (shopping) {
    // negozio aperto: croce ◀ ▶ sceglie, A compra, B chiude
    if (down(LEFT) || down(UP)) hooks.shopMove(-1);
    if (down(RIGHT) || down(DOWN)) hooks.shopMove(1);
    if (down(A)) hooks.shopBuy();
  } else {
    if (down(A)) actions.jump();
    if (down(LEFT)) actions.weapon(0);
    if (down(UP)) actions.weapon(1);
    if (down(RIGHT)) actions.weapon(2);
    if (down(DOWN)) hooks.rideSpeed();
  }
  if (down(B)) hooks.interact();
  if (down(X)) actions.reload();
  if (down(Y) || down(RB)) actions.nextWeapon(1);
  if (down(LB)) actions.nextWeapon(-1);
  if (down(VIEW)) hooks.stats();
  if (down(MENU)) actions.pause();
}

/* ---------- Aiuto alla mira (solo col controller) ----------
 * Se il mirino passa vicino a un nemico visibile la visuale rallenta un po' (più facile fermarsi
 * sul bersaglio) e, mentre ci si muove o si gira, viene tirata piano verso di lui. */
const camPos = { x: 0, y: 0, z: 0 };
const dirV = { x: 0, y: 0, z: 0 };
let best = null, bestAng = 0, bestYaw = 0, bestPitch = 0, bestD = 0, bx = 0, by = 0, bz = 0;
function wrap(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; }
function consider(x, z, model) {
  if (!model) return;
  const s = model.v ? model.v.scale : 1;
  const y = model.group.position.y + 1.2 * s; // all'altezza del petto
  const dx = x - camPos.x, dy = y - camPos.y, dz = z - camPos.z;
  const h = Math.hypot(dx, dz), d = Math.hypot(h, dy);
  if (d < 1 || d > 45) return;
  const dyaw = wrap(Math.atan2(-dx, -dz) - player.yaw);
  const dpitch = Math.atan2(dy, h) - player.pitch;
  const cone = Math.atan((0.75 * s) / d) + 0.03;
  const ang = Math.hypot(dyaw, dpitch) / cone; // < 1: il mirino è sul nemico
  if (ang > 2.4 || (best && ang >= bestAng)) return;
  best = model; bestAng = ang; bestYaw = dyaw; bestPitch = dpitch; bestD = d;
  bx = dx / d; by = dy / d; bz = dz / d;
}
function aimAssist(dt, lookMag, moveMag) {
  if (lookMag < 0.02 && moveMag < 0.2) return 1;
  camPos.x = player.pos.x; camPos.y = player.pos.y + 0.75; camPos.z = player.pos.z;
  best = null;
  hooks.eachEnemy(consider);
  if (!best) return 1;
  dirV.x = bx; dirV.y = by; dirV.z = bz;
  if (staticBlocked(camPos, dirV, bestD - 0.6)) return 1; // dietro un muro: niente aiuto
  // tiro leggero verso il nemico (più forte vicino al mirino, mai uno scatto)
  const pull = Math.min(1, dt * (lookMag > 0.02 ? 2.2 : 1.4)) * 0.4 * Math.max(0, 1 - bestAng / 2.4);
  input.lookX += bestYaw * pull / Math.max(0.3, view.lookScale);
  input.lookY += bestPitch * pull * 0.6 / Math.max(0.3, view.lookScale);
  return bestAng < 1 ? 0.55 : 1;
}

/* ---------- Menu ---------- */
// Schermate in ordine di DOM: l'ultima visibile è quella in primo piano.
const SCREENS = ['start', 'pause', 'over', 'lobby', 'join', 'gallery', 'crop', 'settings'];
// B = indietro: il pulsante da premere per ogni schermata
const BACK = { pause: 'resume', lobby: 'lLeave', join: 'jBack', gallery: 'gClose', crop: 'cSkip', settings: 'sClose' };
// Menu (≡) = il pulsante principale della schermata
const MAIN = { start: 'play', pause: 'resume', over: 'again', settings: 'sClose' };
const FOCUSABLE = 'button, label.btn, label.check, label.chk, input[type=range], input.nameIn, #jCode';

function topScreen() {
  let top = null;
  for (const id of SCREENS) {
    const el = $(id);
    if (el && !el.classList.contains('hidden')) top = el;
  }
  return top;
}
const visible = (el) => !el.disabled && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';

let focused = null, focusScreen = null, repeatDir = '', repeatT = 0;
function clearFocus() {
  if (focused) focused.classList.remove('padFocus');
  focused = null;
}
function setFocus(el) {
  if (focused === el) return;
  clearFocus();
  focused = el;
  if (!el) return;
  el.classList.add('padFocus');
  el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}
function candidates(screen) { return [...screen.querySelectorAll(FOCUSABLE)].filter(visible); }
function defaultFocus(screen) {
  const list = candidates(screen);
  return list.find((e) => e.classList.contains('primary')) || list[0] || null;
}

/** Sposta la selezione verso l'elemento più vicino nella direzione (dx, dy). */
function moveFocus(screen, dx, dy) {
  const list = candidates(screen);
  if (!focused) { setFocus(defaultFocus(screen)); return; }
  const r = focused.getBoundingClientRect();
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  let pick = null, ps = Infinity;
  for (const el of list) {
    if (el === focused) continue;
    const q = el.getBoundingClientRect();
    const ex = q.left + q.width / 2, ey = q.top + q.height / 2;
    // distanza lungo la direzione (deve essere in avanti) e di lato (pesa di più)
    const along = dx ? (ex - cx) * dx : (ey - cy) * dy;
    if (along <= 4) continue;
    const gapSide = dx ? Math.max(0, Math.abs(ey - cy) - (r.height + q.height) / 2) : Math.max(0, Math.abs(ex - cx) - (r.width + q.width) / 2);
    const side = dx ? Math.abs(ey - cy) : Math.abs(ex - cx);
    const score = along + gapSide * 4 + side * 0.15;
    if (score < ps) { ps = score; pick = el; }
  }
  if (pick) setFocus(pick);
}

function nudgeRange(el, dir) {
  const min = +el.min || 0, max = +el.max || 100, step = +el.step || 1;
  const d = Math.max(step, (max - min) / 30);
  const v = Math.round(Math.min(max, Math.max(min, +el.value + dir * d)) / step) * step;
  el.value = String(v);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

function press(el) {
  if (!el) return;
  if (el.matches('input.nameIn, #jCode')) { el.focus(); return; } // si apre la tastiera
  if (el.type === 'range') return;
  el.click();
}

function menu(screen, dt, lx, ly) {
  if (screen !== focusScreen) { focusScreen = screen; clearFocus(); }
  if (!pad.active) return;
  if (!focused || !screen.contains(focused) || !visible(focused)) setFocus(defaultFocus(screen));

  // direzione: croce o levetta sinistra, con ripetizione se tenuta premuta
  let dir = '';
  if (cur[UP] || ly < -0.6) dir = 'u';
  else if (cur[DOWN] || ly > 0.6) dir = 'd';
  else if (cur[LEFT] || lx < -0.6) dir = 'l';
  else if (cur[RIGHT] || lx > 0.6) dir = 'r';
  let fire = false;
  if (dir !== repeatDir) { repeatDir = dir; repeatT = 0.38; fire = !!dir; }
  else if (dir) { repeatT -= dt; if (repeatT <= 0) { repeatT = 0.11; fire = true; } }
  if (fire) {
    const range = focused && focused.type === 'range';
    if (range && (dir === 'l' || dir === 'r')) nudgeRange(focused, dir === 'r' ? 1 : -1);
    else moveFocus(screen, dir === 'l' ? -1 : dir === 'r' ? 1 : 0, dir === 'u' ? -1 : dir === 'd' ? 1 : 0);
  }
  if (down(A)) press(focused);
  if (down(B)) {
    if (document.activeElement && document.activeElement.matches('input')) document.activeElement.blur();
    else { const b = BACK[screen.id] && $(BACK[screen.id]); if (b && visible(b)) b.click(); }
  }
  if (down(MENU)) { const m = MAIN[screen.id] && $(MAIN[screen.id]); if (m && visible(m)) m.click(); }
}
