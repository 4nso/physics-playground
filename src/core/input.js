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
 * actions: { fire, grab, jump, boom, crate, reset }
 */
export function setupInput(actions) {
  const joy = { id: null, ox: 0, oy: 0 };
  const look = { id: null, x: 0, y: 0 };
  let mouseDrag = null;
  const joyEl = $('joy'), knob = $('knob');

  addEventListener('keydown', (e) => {
    input.keys[e.code] = true;
    if (!input.enabled || e.repeat) return;
    if (e.code === 'Space') { actions.jump(); e.preventDefault(); }
    if (e.code === 'KeyE') actions.grab();
    if (e.code === 'KeyF') actions.boom();
    if (e.code === 'KeyQ') actions.crate();
    if (e.code === 'KeyR') actions.reset();
  });
  addEventListener('keyup', (e) => { input.keys[e.code] = false; });
  addEventListener('blur', () => { for (const k in input.keys) input.keys[k] = false; });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  canvas.addEventListener('pointerdown', (e) => {
    if (!input.enabled) return;
    initAudio();
    if (e.pointerType === 'mouse') {
      if (locked()) {
        if (e.button === 0) actions.fire();
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
      if (mouseDrag && !locked() && mouseDrag.moved < 6) {
        if (mouseDrag.button === 2) actions.grab(); else actions.fire();
      }
      mouseDrag = null;
      return;
    }
    if (e.pointerId === joy.id) {
      joy.id = null; input.joy.x = input.joy.y = 0;
      joyEl.style.display = 'none';
    }
    if (e.pointerId === look.id) look.id = null;
  }
  addEventListener('pointerup', endPointer);
  addEventListener('pointercancel', endPointer);

  const bind = (id, fn) => {
    $(id).addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation();
      initAudio();
      if (input.enabled) fn();
    });
  };
  bind('bFire', actions.fire);
  bind('bJump', actions.jump);
  bind('bGrab', actions.grab);
  bind('bBoom', actions.boom);
  bind('bCrate', actions.crate);
  bind('bReset', actions.reset);
}
