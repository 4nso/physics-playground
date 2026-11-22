// Suoni generati con WebAudio (niente file audio).
let actx = null;

/** Il contesto audio (null finché il giocatore non ha toccato lo schermo). */
export const audioCtx = () => actx;
let lastSnd = 0;

/** Da chiamare dentro un gesto dell'utente (tocco/clic): i browser lo richiedono. */
export function initAudio() {
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
  } catch (e) {
    actx = null;
  }
}

export function thud(vol, freq) {
  if (!actx) return;
  const t = actx.currentTime;
  if (t - lastSnd < 0.035) return;
  lastSnd = t;
  try {
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(freq * 0.5, t + 0.12);
    g.gain.setValueAtTime(Math.min(0.35, vol), t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    o.connect(g).connect(actx.destination);
    o.start(t);
    o.stop(t + 0.16);
  } catch (e) { /* audio non disponibile */ }
}

/** "Tic" quando un colpo va a segno: kind = 'hit' | 'head' | 'kill'. */
let lastTick = 0;
export function hitTick(kind) {
  if (!actx) return;
  const t = actx.currentTime;
  if (kind === 'hit' && t - lastTick < 0.06) return; // mitra e pompa: non troppi tic
  lastTick = t;
  try {
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = 'sine';
    const f = kind === 'kill' ? 700 : kind === 'head' ? 2300 : 1700;
    o.frequency.setValueAtTime(f, t);
    if (kind === 'kill') o.frequency.exponentialRampToValueAtTime(1500, t + 0.09);
    const len = kind === 'kill' ? 0.14 : 0.05;
    g.gain.setValueAtTime(kind === 'hit' ? 0.07 : 0.11, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + len);
    o.connect(g).connect(actx.destination);
    o.start(t);
    o.stop(t + len + 0.01);
  } catch (e) { /* audio non disponibile */ }
}

let noiseBuf = null;
export function boomSound() {
  if (!actx) return;
  try {
    const t = actx.currentTime;
    if (!noiseBuf) {
      const len = actx.sampleRate * 0.6;
      noiseBuf = actx.createBuffer(1, len, actx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.5);
    }
    const s = actx.createBufferSource(), f = actx.createBiquadFilter(), g = actx.createGain();
    s.buffer = noiseBuf;
    f.type = 'lowpass';
    f.frequency.value = 700;
    g.gain.value = 0.7;
    s.connect(f).connect(g).connect(actx.destination);
    s.start(t);
  } catch (e) { /* audio non disponibile */ }
}
