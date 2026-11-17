// Input: tastiera + mouse (con pointer lock) e touch (joystick a sinistra, sguardo a destra).
import { canvas, isTouch } from './renderer.js';
import { initAudio } from './audio.js';
import { settings } from '../ui/settings.js';

const $ = (id) => document.getElementById(id);

export const input = {
  keys: {},
  joy: { x: 0, y: 0 },
  run: false,         // joystick spinto oltre il bordo: corsa
  lookX: 0, // rotazione accumulata da applicare subito (mouse, radianti)
  lookY: 0,
  touchX: 0, // rotazione dal dito, applicata in modo morbido (vedi takeLook)
  touchY: 0,
  enabled: false,
  /**
   * Restituisce e azzera la rotazione accumulata dallo sguardo.
   * Quella del dito viene distribuita su qualche frame (circa 30 ms): gli eventi touch
   * arrivano a scatti rispetto ai frame e così la visuale non trema.
   */
  takeLook(dt = 1 / 60) {
    const k = 1 - Math.exp(-dt / 0.03);
    const tx = this.touchX * k, ty = this.touchY * k;
    this.touchX -= tx; this.touchY -= ty;
    const r = [this.lookX + tx, this.lookY + ty];
    this.lookX = this.lookY = 0;
    return r;
  },
  /** Cancella i movimenti in sospeso (pausa, fine partita). */
  reset() {
    this.lookX = this.lookY = this.touchX = this.touchY = 0;
    this.joy.x = this.joy.y = 0;
    this.run = false;
  },
};

/**
 * Sensibilità del dito in radianti per pixel: cresce sugli schermi piccoli
 * (su un telefono lo spazio per trascinare è poco), moltiplicata dall'impostazione.
 */
function touchSens() {
  const short = Math.max(280, Math.min(innerWidth, innerHeight));
  return 0.0065 * Math.sqrt(600 / short) * settings.look;
}
/** Raggio del joystick in pixel, proporzionale allo schermo. */
const joyRadius = () => Math.max(46, Math.min(70, Math.min(innerWidth, innerHeight) * 0.14));

const locked = () => document.pointerLockElement === canvas;
export function exitLock() {
  if (document.pointerLockElement) document.exitPointerLock();
}
export function requestLock() {
  if (isTouch) return;
  try {
    const p = canvas.requestPointerLock();
    if (p && p.catch) p.catch(() => {});
  } catch (e) { /* non supportato */ }
}

/**
 * Collega l'input alle azioni di gioco.
 * actions: { trigger(on), tap, reload, weapon(i), nextWeapon(dir), grab, jump, pause, lockLost }
 *  - trigger(true/false): grilletto premuto/rilasciato (fuoco continuo)
 *  - tap: un colpo singolo (clic del mouse quando il puntatore non è catturato)
 */
export function setupInput(actions) {
  const joy = { id: null, ox: 0, oy: 0, R: 55 };
  const look = { id: null, x: 0, y: 0 };
  let fireId = null;     // dito che tiene premuto il pulsante "Spara"
  let mouseFire = false; // tasto sinistro premuto con il puntatore catturato
  let mouseDrag = null;
  const joyEl = $('joy'), knob = $('knob');
  const placeJoy = (x, y) => { joyEl.style.left = x + 'px'; joyEl.style.top = y + 'px'; };
  const sizeJoy = () => { if (joy.id === null) joyEl.style.setProperty('--jr', joyRadius() + 'px'); };
  sizeJoy();
  addEventListener('resize', sizeJoy);

  const releaseTrigger = () => {
    if (fireId !== null || mouseFire) actions.trigger(false);
    fireId = null;
    mouseFire = false;
  };

  addEventListener('keydown', (e) => {
    input.keys[e.code] = true;
    if (!input.enabled || e.repeat) return;
    if (e.code === 'Space') { actions.jump(); e.preventDefault(); }
    if (e.code === 'KeyE') actions.grab();
    if (e.code === 'KeyR') actions.reload();
    if (e.code === 'KeyP' || e.code === 'Escape') actions.pause();
    if (e.code === 'Digit1') actions.weapon(0);
    if (e.code === 'Digit2') actions.weapon(1);
    if (e.code === 'Digit3') actions.weapon(2);
  });
  addEventListener('keyup', (e) => { input.keys[e.code] = false; });
  addEventListener('blur', () => {
    for (const k in input.keys) input.keys[k] = false;
    releaseTrigger();
  });
  // Quando il mouse viene liberato (tasto Esc) il gioco va in pausa
  let wasLocked = false;
  document.addEventListener('pointerlockchange', () => {
    if (locked()) { wasLocked = true; return; }
    releaseTrigger();
    if (wasLocked) { wasLocked = false; actions.lockLost(); }
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  // Rotella del mouse: arma successiva/precedente (con una piccola pausa per i trackpad)
  let lastWheel = 0;
  addEventListener('wheel', (e) => {
    if (!input.enabled || Math.abs(e.deltaY) < 4) return;
    const now = performance.now();
    if (now - lastWheel < 180) return;
    lastWheel = now;
    actions.nextWeapon(e.deltaY > 0 ? 1 : -1);
  }, { passive: true });

  canvas.addEventListener('pointerdown', (e) => {
    if (!input.enabled) return;
    initAudio();
    if (e.pointerType === 'mouse') {
      if (locked()) {
        if (e.button === 0) { mouseFire = true; actions.trigger(true); }
        else if (e.button === 2) actions.grab();
        return;
      }
      requestLock();
      mouseDrag = { x: e.clientX, y: e.clientY, moved: 0, button: e.button };
      return;
    }
    // metà sinistra: joystick (compare dove appoggi il pollice); il resto dello schermo: guarda
    if (e.clientX < innerWidth * 0.5 && joy.id === null) {
      joy.id = e.pointerId; joy.ox = e.clientX; joy.oy = e.clientY;
      joy.R = joyRadius();
      joyEl.style.setProperty('--jr', joy.R + 'px');
      input.joy.x = input.joy.y = 0;
      input.run = false;
      joyEl.classList.add('on');
      placeJoy(e.clientX, e.clientY);
      knob.style.transform = '';
    } else if (look.id === null) {
      look.id = e.pointerId; look.x = e.clientX; look.y = e.clientY;
    }
  });

  addEventListener('pointermove', (e) => {
    if (!input.enabled) return;
    if (e.pointerType === 'mouse') {
      if (locked()) {
        // alcuni browser mandano ogni tanto salti enormi e finti: li ignoriamo
        if (Math.abs(e.movementX) > 300 || Math.abs(e.movementY) > 300) return;
        input.lookX -= e.movementX * 0.0022 * settings.look;
        input.lookY -= e.movementY * 0.0022 * settings.look;
      } else if (mouseDrag) {
        const dx = e.clientX - mouseDrag.x, dy = e.clientY - mouseDrag.y;
        mouseDrag.moved += Math.abs(dx) + Math.abs(dy);
        input.lookX -= dx * 0.005;
        input.lookY -= dy * 0.005;
        mouseDrag.x = e.clientX; mouseDrag.y = e.clientY;
      }
    } else if (e.pointerId === joy.id) {
      const R = joy.R;
      let dx = e.clientX - joy.ox, dy = e.clientY - joy.oy;
      let d = Math.hypot(dx, dy);
      // se il pollice va molto oltre il bordo, il joystick lo segue (non si perde il controllo)
      const FOLLOW = R * 1.6;
      if (d > FOLLOW) {
        joy.ox += dx * (1 - FOLLOW / d); joy.oy += dy * (1 - FOLLOW / d);
        placeJoy(joy.ox, joy.oy);
        dx = e.clientX - joy.ox; dy = e.clientY - joy.oy; d = FOLLOW;
      }
      input.run = d > R * 1.2; // spinto oltre il cerchio: corsa
      const c = Math.min(d, R);
      const kx = d > 0 ? dx / d : 0, ky = d > 0 ? dy / d : 0;
      // zona morta piccola al centro, poi risposta lineare fino al bordo
      const DEAD = 0.12;
      const m = Math.max(0, (c / R - DEAD) / (1 - DEAD));
      input.joy.x = kx * m;
      input.joy.y = -ky * m;
      knob.style.transform = `translate(${kx * c}px,${ky * c}px)`;
      joyEl.classList.toggle('run', input.run);
    } else if (e.pointerId === look.id) {
      const k = touchSens();
      input.touchX -= (e.clientX - look.x) * k;
      input.touchY -= (e.clientY - look.y) * k;
      look.x = e.clientX; look.y = e.clientY;
    }
  });

  function endPointer(e) {
    if (e.pointerType === 'mouse') {
      if (mouseFire && e.button === 0) { mouseFire = false; actions.trigger(false); }
      if (mouseDrag && !locked() && mouseDrag.moved < 6) {
        if (mouseDrag.button === 2) actions.grab(); else actions.tap();
      }
      mouseDrag = null;
      return;
    }
    if (e.pointerId === fireId) { fireId = null; actions.trigger(false); }
    if (e.pointerId === joy.id) {
      joy.id = null; input.joy.x = input.joy.y = 0;
      input.run = false;
      joyEl.classList.remove('on', 'run');
      joyEl.style.left = joyEl.style.top = '';
      knob.style.transform = '';
    }
    if (e.pointerId === look.id) look.id = null;
  }
  addEventListener('pointerup', endPointer);
  addEventListener('pointercancel', endPointer);

  const press = (el, fn) => {
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation();
      initAudio();
      if (input.enabled) fn(e);
    });
  };
  // "Spara": tieni premuto per il fuoco continuo; trascinando il dito sul pulsante si mira.
  press($('bFire'), (e) => {
    fireId = e.pointerId;
    if (look.id === null) { look.id = e.pointerId; look.x = e.clientX; look.y = e.clientY; }
    actions.trigger(true);
  });
  press($('bJump'), actions.jump);
  press($('bGrab'), actions.grab);
  press($('bReload'), actions.reload);
  press($('bPause'), actions.pause);
  press($('weapon'), (e) => {
    const slot = e.target.closest('[data-w]');
    if (slot) actions.weapon(+slot.dataset.w);
  });
  blockGestures();
}

/**
 * Blocca i gesti del browser che rovinano il gioco su iPhone/Android:
 * zoom con due dita, doppio tocco, selezione del testo, menu a pressione lunga,
 * swipe dal bordo per tornare indietro. Le schermate dei menu restano scorrevoli.
 */
function blockGestures() {
  const inMenu = (t) => t instanceof Element && t.closest('.screen, input, label, textarea');
  const stop = (e) => { if (!inMenu(e.target)) e.preventDefault(); };
  document.addEventListener('touchstart', stop, { passive: false });
  document.addEventListener('touchmove', (e) => {
    if (!inMenu(e.target) || e.touches.length > 1) e.preventDefault();
  }, { passive: false });
  for (const ev of ['gesturestart', 'gesturechange', 'gestureend', 'dblclick']) {
    document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
  }
  document.addEventListener('contextmenu', (e) => { if (!(e.target instanceof HTMLInputElement)) e.preventDefault(); });
  document.addEventListener('selectstart', (e) => { if (!(e.target instanceof HTMLInputElement)) e.preventDefault(); });
}
