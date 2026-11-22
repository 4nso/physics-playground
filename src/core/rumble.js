// Vibrazione del controller (se il browser la supporta). Il controller da usare lo imposta gamepad.js.
import { settings } from '../ui/settings.js';

let pad = null;
/** Controller attuale (null quando si gioca con touch, mouse o tastiera). */
export function setRumblePad(g) { pad = g; }

/** strong/weak: intensità dei due motori (0..1), ms: durata. Non fa nulla se non supportata. */
export function rumble(strong = 0.5, weak = 0.3, ms = 80) {
  if (!pad || !settings.vibration) return;
  const a = pad.vibrationActuator;
  if (!a || !a.playEffect) return;
  try {
    const p = a.playEffect('dual-rumble', { duration: ms, strongMagnitude: Math.min(1, strong), weakMagnitude: Math.min(1, weak) });
    if (p && p.catch) p.catch(() => {});
  } catch (e) { /* non supportata */ }
}
