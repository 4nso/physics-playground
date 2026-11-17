// Input: tastiera + mouse (con pointer lock) e touch (joystick a sinistra, sguardo a destra).
import { canvas, isTouch } from './renderer.js';
import { initAudio } from './audio.js';

const $ = (id) => document.getElementById(id);

export const input = {
  keys: {},
  joy: { x: 0, y: 0 },
  lookX: 0, // rotazione accumulata da applicare (radianti)
  lookY: 0,
  enabled: false,
  /** Restituisce e azzera la rotazione accumulata dallo sguardo. */
  takeLook() {
    const r = [this.lookX, this.lookY];
    this.lookX = this.lookY = 0;
    return r;
  },
};

const locked = () => document.pointerLockElement === canvas;
export function requestLock() {
  if (isTouch) return;
  try {
    const p = canvas.requestPointerLock();
    if (p && p.catch) p.catch(() => {});
  } catch (e) { /* non supportato */ }
}

/**
 * Collega l'input alle azioni di gioco.
 * actions: { trigger(on), tap, reload, weapon(i), nextWeapon(dir), grab, jump, boom, crate, reset }
 *  - trigger(true/false): grilletto premuto/rilasciato (fuoco continuo)
 *  - tap: un colpo singolo (clic del mouse quando il puntatore non è catturato)
 */
export function setupInput(actions) {
  const joy = { id: null, ox: 0, oy: 0 };
  const look = { id: null, x: 0, y: 0 };
  let fireId = null;     // dito che tiene premuto il pulsante "Spara"
  let mouseFire = false; // tasto sinistro premuto con il puntatore catturato
  let mouseDrag = null;
  const joyEl = $('joy'), knob = $('knob');

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
    if (e.code === 'KeyF') actions.boom();
    if (e.code === 'KeyQ') actions.crate();
    if (e.code === 'KeyR') actions.reload();
    if (e.code === 'Backspace') { actions.reset(); e.preventDefault(); }
    if (e.code === 'Digit1') actions.weapon(0);
    if (e.code === 'Digit2') actions.weapon(1);
    if (e.code === 'Digit3') actions.weapon(2);
  });
  addEventListener('keyup', (e) => { input.keys[e.code] = false; });
  addEventListener('blur', () => {
    for (const k in input.keys) input.keys[k] = false;
    releaseTrigger();
  });
  document.addEventListener('pointerlockchange', () => { if (!locked() && mouseFire) releaseTrigger(); });
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
    if (e.clientX < innerWidth * 0.45 && joy.id === null) {
      joy.id = e.pointerId; joy.ox = e.clientX; joy.oy = e.clientY;
      input.joy.x = input.joy.y = 0;
      joyEl.style.left = e.clientX + 'px';
      joyEl.style.top = e.clientY + 'px';
      joyEl.style.display = 'block';
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
        input.lookX -= e.movementX * 0.0022;
        input.lookY -= e.movementY * 0.0022;
      } else if (mouseDrag) {
        const dx = e.clientX - mouseDrag.x, dy = e.clientY - mouseDrag.y;
        mouseDrag.moved += Math.abs(dx) + Math.abs(dy);
        input.lookX -= dx * 0.005;
        input.lookY -= dy * 0.005;
        mouseDrag.x = e.clientX; mouseDrag.y = e.clientY;
      }
    } else if (e.pointerId === joy.id) {
      let dx = e.clientX - joy.ox, dy = e.clientY - joy.oy;
      const d = Math.hypot(dx, dy), R = 55;
      if (d > R) { dx *= R / d; dy *= R / d; }
      input.joy.x = dx / R;
      input.joy.y = -dy / R;
      knob.style.transform = `translate(${dx}px,${dy}px)`;
    } else if (e.pointerId === look.id) {
      input.lookX -= (e.clientX - look.x) * 0.0065;
      input.lookY -= (e.clientY - look.y) * 0.0065;
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
      joyEl.style.display = 'none';
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
  press($('bBoom'), actions.boom);
  press($('bReload'), actions.reload);
  press($('bCrate'), actions.crate);
  press($('bReset'), actions.reset);
  press($('weapon'), (e) => {
    const slot = e.target.closest('[data-w]');
    if (slot) actions.weapon(+slot.dataset.w); else actions.nextWeapon(1);
  });
}
