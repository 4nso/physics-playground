// Impostazioni del giocatore (sensibilità della visuale, dimensione dei pulsanti, qualità grafica,
// contatore fps), salvate in localStorage.
import { quality, setQualitySetting, onQuality, LEVEL_NAMES } from '../core/quality.js';

const KEY = 'syf-settings';
const DEFAULTS = { look: 1, buttons: 1, quality: 'auto', fps: false };
const $ = (id) => document.getElementById(id);

export const settings = { ...DEFAULTS };
const listeners = [];

try {
  const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
  for (const k in DEFAULTS) {
    if (typeof saved[k] !== typeof DEFAULTS[k]) continue;
    if (typeof saved[k] === 'number' && !isFinite(saved[k])) continue;
    settings[k] = saved[k];
  }
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
  for (const b of document.querySelectorAll('#sQuality [data-q]')) b.classList.toggle('on', b.dataset.q === settings.quality);
  $('sQualityV').textContent = settings.quality === 'auto' ? `Automatica (${LEVEL_NAMES[quality.level]})` : LEVEL_NAMES[quality.level];
  $('sFps').checked = settings.fps;
  $('fps').classList.toggle('hidden', !settings.fps);
}

export function initSettings() {
  setQualitySetting(settings.quality);
  onQuality(refresh);
  $('sLook').addEventListener('input', (e) => { settings.look = +e.target.value; changed(); });
  $('sBtn').addEventListener('input', (e) => { settings.buttons = +e.target.value; changed(); });
  $('sQuality').addEventListener('click', (e) => {
    const b = e.target.closest('[data-q]');
    if (!b) return;
    settings.quality = b.dataset.q;
    setQualitySetting(settings.quality);
    changed();
  });
  $('sFps').addEventListener('change', (e) => { settings.fps = e.target.checked; changed(); });
  $('sReset').onclick = () => { Object.assign(settings, DEFAULTS); setQualitySetting(settings.quality); changed(); };
  $('sClose').onclick = () => $('settings').classList.add('hidden');
  for (const id of ['openSettings', 'pauseSettings']) {
    $(id).onclick = () => $('settings').classList.remove('hidden');
  }
}
