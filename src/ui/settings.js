// Impostazioni del giocatore (sensibilità della visuale, dimensione dei pulsanti, qualità grafica,
// contatore fps, mira col tasto destro, controller), salvate in localStorage.
import { quality, setQualitySetting, onQuality, LEVEL_NAMES } from '../core/quality.js';
import { dev, setDevMode } from '../core/devmode.js';
import { net } from '../net/net.js';

const KEY = 'syf-settings';
const DEFAULTS = { look: 1, buttons: 1, quality: 'auto', fps: false, padLook: 1, aimAssist: true, vibration: true, aimMode: 'hold' };
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
  for (const b of document.querySelectorAll('#sAim [data-a]')) b.classList.toggle('on', b.dataset.a === settings.aimMode);
  $('sFps').checked = settings.fps;
  $('sPad').value = settings.padLook;
  $('sPadV').textContent = pct(settings.padLook);
  $('sAssist').checked = settings.aimAssist;
  $('sVib').checked = settings.vibration;
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
  $('sAim').addEventListener('click', (e) => {
    const b = e.target.closest('[data-a]');
    if (!b) return;
    settings.aimMode = b.dataset.a;
    changed();
  });
  $('sFps').addEventListener('change', (e) => { settings.fps = e.target.checked; changed(); });
  $('sPad').addEventListener('input', (e) => { settings.padLook = +e.target.value; changed(); });
  $('sAssist').addEventListener('change', (e) => { settings.aimAssist = e.target.checked; changed(); });
  $('sVib').addEventListener('change', (e) => { settings.vibration = e.target.checked; changed(); });
  $('sReset').onclick = () => { Object.assign(settings, DEFAULTS); setQualitySetting(settings.quality); changed(); };
  $('sClose').onclick = () => $('settings').classList.add('hidden');
  for (const id of ['openSettings', 'pauseSettings']) {
    $(id).onclick = () => { refreshDev(); $('settings').classList.remove('hidden'); };
  }
  // Modalità sviluppatore: solo da soli o per l'host, con conferma (non resta salvata: dura finché non ricarichi)
  $('sDev').addEventListener('change', async (e) => {
    const box = e.target;
    if (!box.checked) { setDevMode(false); refreshDev(); return; }
    if (net.mode === 'client') { box.checked = false; refreshDev(); return; }
    if (!confirm('Attivare la modalità sviluppatore?\n\nCompare il pulsante 🛠 per provare tutto velocemente. In questa partita tutti vedranno "🛠 DEV" e record e statistiche non verranno salvati.')) {
      box.checked = false;
      return;
    }
    try { await setDevMode(true); } catch (err) { console.error(err); box.checked = false; }
    refreshDev();
  });
}

/** Stato dell'interruttore "Modalità sviluppatore" (i client della stanza non possono usarla). */
function refreshDev() {
  const client = net.mode === 'client';
  $('sDev').checked = dev.on && !client;
  $('sDev').disabled = client;
  $('sDevNote').textContent = client
    ? 'Solo chi fa da host può usarla.'
    : 'Per provare tutto velocemente. Solo per chi gioca da solo o fa da host: gli altri vedono "🛠 DEV" e il record non si salva. Scorciatoia: ?dev nell\'indirizzo.';
}
