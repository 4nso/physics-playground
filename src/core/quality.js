// Qualità grafica: Bassa / Media / Alta, oppure Automatica.
// In automatico si parte da una scelta in base al dispositivo e poi si guarda quanti fps fa davvero
// il gioco: se rallenta si scende di un livello, se va molto liscio si risale (mai oltre la scelta iniziale).
import { isTouch, setRenderQuality, setShadows } from './renderer.js';
import { setPost } from './post.js';
import { setGlow } from './glow.js';
import { setWorldAO } from '../world/map.js';
import { setSkyDome } from './sky.js';

export const LEVELS = ['low', 'medium', 'high'];
export const LEVEL_NAMES = { low: 'Bassa', medium: 'Media', high: 'Alta' };

/**
 * Cosa cambia ogni livello. pr = pixel ratio massimo (risoluzione), dist = distanza di vista (m),
 * post = effetti di schermo (bloom, colori, vignettatura, antialiasing: core/post.js),
 * ao = ombre morbide alla base dei muri, shadows = ombre in tempo reale degli oggetti che si muovono.
 */
const PRESETS = {
  low: { pr: 1, dist: 46, post: 'off', ao: false, shadows: false },
  medium: { pr: isTouch ? 1.25 : 1.5, dist: 58, post: 'medium', ao: true, shadows: false },
  high: { pr: isTouch ? 1.75 : 2, dist: 70, post: 'high', ao: true, shadows: true },
};

const AUTO_KEY = 'syf-autoq'; // ultimo livello scelto in automatico (si riparte da lì)

/** Scelta iniziale in base al dispositivo. */
function devicePick() {
  const cores = navigator.hardwareConcurrency || 4;
  const mem = navigator.deviceMemory || 4; // non c'è su Safari: vale 4
  if (cores <= 2 || mem <= 2) return 'low';
  if (isTouch) return 'medium'; // iPhone, iPad, Android: Media (deve fare 30+ fps)
  return 'high';
}

export const quality = {
  setting: 'auto',     // scelta del giocatore: 'auto' | 'low' | 'medium' | 'high'
  level: 'medium',     // livello in uso
  max: devicePick(),   // in automatico non si sale oltre questo
  fps: 0,              // fps medi dell'ultimo secondo (per il contatore)
};

let autoLevel = quality.max;
try {
  const saved = localStorage.getItem(AUTO_KEY);
  if (LEVELS.includes(saved) && LEVELS.indexOf(saved) < LEVELS.indexOf(autoLevel)) autoLevel = saved;
} catch (e) { /* localStorage non disponibile */ }

const listeners = [];
/** fn(level) a ogni cambio di livello (e subito una volta). */
export function onQuality(fn) {
  listeners.push(fn);
  fn(quality.level);
}

function apply(level) {
  quality.level = level;
  const p = PRESETS[level];
  setRenderQuality(p.pr, p.dist);
  setGlow(setPost(p.post));
  setWorldAO(p.ao);
  setSkyDome(p.post !== 'off');
  setShadows(p.shadows);
  for (const fn of listeners) fn(level);
}

/** Scelta del giocatore nelle impostazioni. */
export function setQualitySetting(s) {
  quality.setting = LEVELS.includes(s) ? s : 'auto';
  resetMeter();
  apply(quality.setting === 'auto' ? autoLevel : quality.setting);
}

/* ---------- Misura degli fps e adattamento ---------- */
const WINDOW = 2;          // secondi per ogni misura
const SLOW = 27;           // sotto questi fps per 2 misure di fila si scende
const FAST = 55;           // sopra questi fps per 6 misure di fila (12 s) si prova a salire
let frames = 0, time = 0, slowRuns = 0, fastRuns = 0, cooldown = 0;
let secFrames = 0, secTime = 0;
const failed = new Set(); // livelli già risultati lenti in questa sessione: non ci si torna (niente altalena)

function resetMeter() { frames = 0; time = 0; slowRuns = 0; fastRuns = 0; cooldown = 3; }

function saveAuto() {
  try { localStorage.setItem(AUTO_KEY, autoLevel); } catch (e) { /* ignora */ }
}

/**
 * A ogni frame con il tempo vero del frame (secondi, non limitato).
 * active = partita in corso: nei menu non si giudica (le pause falserebbero la misura).
 */
export function updateQuality(rawDt, active) {
  // contatore: media dell'ultimo secondo
  secFrames++; secTime += rawDt;
  if (secTime >= 1) { quality.fps = Math.round(secFrames / secTime); secFrames = 0; secTime = 0; }

  if (quality.setting !== 'auto' || !active) { frames = 0; time = 0; return; }
  if (rawDt > 0.5) return; // la pagina era in secondo piano: non conta
  if (cooldown > 0) { cooldown -= rawDt; return; } // appena cambiato: lasciamo assestare
  frames++; time += rawDt;
  if (time < WINDOW) return;
  const fps = frames / time;
  frames = 0; time = 0;
  slowRuns = fps < SLOW ? slowRuns + 1 : 0;
  fastRuns = fps > FAST ? fastRuns + 1 : 0;
  const i = LEVELS.indexOf(autoLevel);
  if (slowRuns >= 2 && i > 0) {
    failed.add(autoLevel);
    autoLevel = LEVELS[i - 1];
    saveAuto(); resetMeter(); cooldown = 4;
    apply(autoLevel);
  } else if (fastRuns >= 6 && i < LEVELS.indexOf(quality.max) && !failed.has(LEVELS[i + 1])) {
    autoLevel = LEVELS[i + 1];
    saveAuto(); resetMeter(); cooldown = 4;
    apply(autoLevel);
  }
}
