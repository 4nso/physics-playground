// Impostazioni del giocatore (sensibilità della visuale, dimensione dei pulsanti), salvate in localStorage.
const KEY = 'syf-settings';
const DEFAULTS = { look: 1, buttons: 1 };
const $ = (id) => document.getElementById(id);

export const settings = { ...DEFAULTS };
const listeners = [];

try {
  const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
  for (const k in DEFAULTS) if (typeof saved[k] === 'number' && isFinite(saved[k])) settings[k] = saved[k];
} catch (e) { /* localStorage non disponibile */ }

/** Chiama fn ogni volta che le impostazioni cambiano (e subito una volta). */
export function onSettings(fn) {
  listeners.push(fn);
  fn(settings);
}

function changed() {
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch (e) { /* ignora */ }
  for (const fn of listeners) fn(settings);
  refresh();
}

const pct = (v) => `${Math.round(v * 100)}%`;
function refresh() {
  $('sLook').value = settings.look;
  $('sLookV').textContent = pct(settings.look);
  $('sBtn').value = settings.buttons;
  $('sBtnV').textContent = pct(settings.buttons);
}

export function initSettings() {
  refresh();
  $('sLook').addEventListener('input', (e) => { settings.look = +e.target.value; changed(); });
  $('sBtn').addEventListener('input', (e) => { settings.buttons = +e.target.value; changed(); });
  $('sReset').onclick = () => { Object.assign(settings, DEFAULTS); changed(); };
  $('sClose').onclick = () => $('settings').classList.add('hidden');
  for (const id of ['openSettings', 'pauseSettings']) {
    $(id).onclick = () => $('settings').classList.remove('hidden');
  }
}
