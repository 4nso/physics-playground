// Suoni delle armi generati con WebAudio: rumore filtrato + "botta" bassa.
import { audioCtx } from '../core/audio.js';

let noise = null;
function noiseBuffer(ctx) {
  if (!noise) {
    const len = ctx.sampleRate;
    noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }
  return noise;
}

export function shotSound(w, volume = 1) {
  const ctx = audioCtx();
  if (!ctx) return;
  try {
    const s = { ...w.sound, vol: w.sound.vol * volume }, t = ctx.currentTime, k = 0.9 + Math.random() * 0.2;
    // Scoppio: rumore bianco passa-basso con coda breve
    const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = noiseBuffer(ctx);
    src.playbackRate.value = k;
    f.type = 'lowpass';
    f.frequency.setValueAtTime(s.cut * k, t);
    f.frequency.exponentialRampToValueAtTime(s.cut * 0.25, t + s.decay);
    g.gain.setValueAtTime(s.vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + s.decay);
    src.connect(f).connect(g).connect(ctx.destination);
    src.start(t, Math.random() * 0.5);
    src.stop(t + s.decay + 0.02);
    // Botta: sinusoide che scende di tono
    const o = ctx.createOscillator(), og = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(s.thump * k, t);
    o.frequency.exponentialRampToValueAtTime(s.thump * 0.35, t + s.decay * 0.8);
    og.gain.setValueAtTime(s.vol * 0.9, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + s.decay * 0.9);
    o.connect(og).connect(ctx.destination);
    o.start(t);
    o.stop(t + s.decay);
  } catch (e) { /* audio non disponibile */ }
}

function click(freq, vol, delay = 0, len = 0.03) {
  const ctx = audioCtx();
  if (!ctx) return;
  try {
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'square';
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(freq * 0.6, t + len);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + len);
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + len + 0.01);
  } catch (e) { /* audio non disponibile */ }
}

export function reloadSound(dur) {
  click(700, 0.12, 0.05, 0.05);          // caricatore fuori
  click(1100, 0.12, dur * 0.6, 0.04);    // caricatore dentro
  click(1500, 0.1, dur - 0.12, 0.03);    // carrello
}
export const emptySound = () => click(2400, 0.1, 0, 0.02);
export const switchSound = () => click(1300, 0.07, 0, 0.03);

/** Esplosione: rumore lungo e cupo + botta molto bassa. volume più basso se lontana. */
export function boomSound(volume = 1) {
  const ctx = audioCtx();
  if (!ctx || volume < 0.03) return;
  try {
    const t = ctx.currentTime, v = Math.min(1, volume);
    const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = noiseBuffer(ctx);
    src.playbackRate.value = 0.6;
    f.type = 'lowpass';
    f.frequency.setValueAtTime(1800, t);
    f.frequency.exponentialRampToValueAtTime(120, t + 1.1);
    g.gain.setValueAtTime(0.9 * v, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 1.2);
    src.connect(f).connect(g).connect(ctx.destination);
    src.start(t);
    src.stop(t + 1.25);
    const o = ctx.createOscillator(), og = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(90, t);
    o.frequency.exponentialRampToValueAtTime(28, t + 0.6);
    og.gain.setValueAtTime(1.0 * v, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
    o.connect(og).connect(ctx.destination);
    o.start(t);
    o.stop(t + 0.72);
  } catch (e) { /* audio non disponibile */ }
}

/** Piccolo "tonc" quando una granata rimbalza. */
export const bounceSound = () => click(260, 0.08, 0, 0.05);
