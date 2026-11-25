// Qualità grafica: Bassa / Media / Alta, oppure Automatica.
// In automatico si parte da una scelta in base al dispositivo e poi si guarda quanti fps fa davvero
// il gioco: se rallenta si scende di un livello, se va molto liscio si risale (mai oltre la scelta iniziale).
// In più, a qualsiasi livello (anche scelto a mano), la risoluzione è dinamica: se il gioco non tiene
// i 60 fps la risoluzione scende un po' alla volta (fino al 70%), poi risale quando torna fluido.
import { isTouch, setRenderQuality, setShadows } from './renderer.js';
import { setPost } from './post.js';
import { setGlow } from './glow.js';
import { setWorldAO } from '../world/map.js';
import { setSkyDome } from './sky.js';
import { setDust } from '../world/dust.js';
import { setLowFog } from '../world/lowfog.js';

export const LEVELS = ['low', 'medium', 'high'];
export const LEVEL_NAMES = { low: 'Bassa', medium: 'Media', high: 'Alta' };

/**
 * Cosa cambia ogni livello. pr = pixel ratio massimo (risoluzione), dist = distanza di vista (m),
 * post = effetti di schermo (bloom, colori, vignettatura, antialiasing: core/post.js),
 * ao = ombre morbide alla base dei muri, shadows = ombre in tempo reale degli oggetti che si muovono.
 */
// mp = milioni di pixel al massimo. Sul computer (fase 12): un MacBook con schermo Retina a 2× in Alta
// disegnava 5,6 milioni di pixel con MSAA, ombre e bloom; ora Alta si ferma a 1,5× e a 3,4 milioni
// (con l'MSAA 4× la differenza quasi non si vede, il lavoro della scheda grafica si dimezza).
const PRESETS = {
  low: { pr: 1, mp: isTouch ? Infinity : 2.2, dist: 46, post: 'off', ao: false, shadows: false },
  medium: { pr: 1.25, mp: isTouch ? Infinity : 2.6, dist: 58, post: 'medium', ao: true, shadows: false },
  high: { pr: 1.5, mp: isTouch ? Infinity : 3.4, dist: 70, post: 'high', ao: true, shadows: true },
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
  res: 1,              // risoluzione dinamica: 1 = piena, fino a 0.7
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

function applyRes() {
  const p = PRESETS[quality.level];
  setRenderQuality(Math.max(MIN_PR, p.pr * quality.res), p.dist, p.mp * quality.res * quality.res);
}

function apply(level) {
  quality.level = level;
  quality.res = 1;
  resetRes();
  const p = PRESETS[level];
  applyRes();
  setGlow(setPost(p.post));
  setWorldAO(p.ao);
  setLowFog(level !== 'low'); // nebbia bassa del cimitero: spenta in Bassa
  setSkyDome(p.post !== 'off');
  setDust(p.post !== 'off');
  setShadows(p.shadows);
  for (const fn of listeners) fn(level);
}

/** Scelta del giocatore nelle impostazioni. */
export function setQualitySetting(s) {
  quality.setting = LEVELS.includes(s) ? s : 'auto';
  resetMeter();
  apply(quality.setting === 'auto' ? autoLevel : quality.setting);
}

/* ---------- Risoluzione dinamica ---------- */
const MIN_RES = 0.7, MIN_PR = 0.85;
let rFrames = 0, rTime = 0, rGood = 0, rCool = 0, rPrevFps = 0, rLowered = false, rPause = 0;
function resetRes() { rFrames = 0; rTime = 0; rGood = 0; rCool = 2; rLowered = false; }

/**
 * Ogni secondo: sotto i 52 fps la risoluzione scende del 10%; sopra i 58 per 4 secondi risale del 5%.
 * Se abbassarla non ha fatto salire gli fps (telefono in risparmio energetico, fermo a 30 fps)
 * torna com'era e per 30 secondi non ci riprova: perdere nitidezza non servirebbe a niente.
 */
function updateRes(rawDt) {
  if (rPause > 0) rPause -= rawDt;
  if (rCool > 0) { rCool -= rawDt; return; }
  rFrames++; rTime += rawDt;
  if (rTime < 1) return;
  const fps = rFrames / rTime;
  rFrames = 0; rTime = 0;
  if (rLowered) {
    rLowered = false;
    if (fps < rPrevFps * 1.05) { // nessun miglioramento: non è la risoluzione il problema
      quality.res = Math.min(1, quality.res / 0.9);
      applyRes();
      rPause = 30; rCool = 1;
      return;
    }
  }
  if (fps < 52 && quality.res > MIN_RES && rPause <= 0) {
    rPrevFps = fps;
    quality.res = Math.max(MIN_RES, quality.res * 0.9);
    rLowered = true; rGood = 0; rCool = 0.5;
    applyRes();
  } else if (fps >= 58) {
    if (++rGood >= 4 && quality.res < 1) {
      quality.res = Math.min(1, quality.res + 0.05);
      rGood = 0; rCool = 0.5;
      applyRes();
    }
  } else rGood = 0;
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

  if (!active || rawDt > 0.5) { frames = 0; time = 0; return; } // menu o pagina in secondo piano: non conta
  updateRes(rawDt);
  if (quality.setting !== 'auto') return;
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
