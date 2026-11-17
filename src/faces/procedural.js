// Facce disegnate dal codice, usate quando la galleria è vuota.
const SKINS = ['#f2c9a0', '#e0ac7e', '#c68857', '#8d5a3b', '#f5d6b8', '#b07a55', '#9fd36a', '#a3b8d9'];
const HAIR = ['#2b1d14', '#4a2f1d', '#8a5a2b', '#d8b45a', '#1d1d1d', '#b34a2a', '#6a6a6a'];

const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[(Math.random() * arr.length) | 0];

/** Disegna una faccia casuale 256×256. Restituisce { canvas, side } (side = colore dei lati della testa). */
export function proceduralFace() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const skin = pick(SKINS), hair = pick(HAIR);
  g.fillStyle = skin;
  g.fillRect(0, 0, 256, 256);
  // capelli (frangia a blocchi, stile low-poly)
  g.fillStyle = hair;
  const fringe = rnd(30, 70);
  g.fillRect(0, 0, 256, fringe);
  for (let x = 0; x < 256; x += 32) g.fillRect(x, fringe - 4, 32, rnd(0, 26));
  // sopracciglia: arrabbiate, sorprese o neutre
  const mood = pick(['angry', 'angry', 'surprised', 'neutral', 'crazy']);
  const eyeY = fringe + rnd(40, 55), eyeDX = rnd(42, 56), eyeR = rnd(13, 20);
  g.strokeStyle = hair;
  g.lineWidth = 10;
  g.lineCap = 'round';
  for (const s of [-1, 1]) {
    const x = 128 + s * eyeDX, tilt = mood === 'angry' ? 14 : mood === 'surprised' ? -8 : 0;
    g.beginPath();
    g.moveTo(x - 20 * s, eyeY - 30 - (mood === 'surprised' ? 10 : 0));
    g.lineTo(x + 20 * s, eyeY - 30 + tilt);
    g.stroke();
  }
  // occhi
  for (const s of [-1, 1]) {
    const x = 128 + s * eyeDX, r = mood === 'crazy' && s > 0 ? eyeR * 1.5 : eyeR;
    g.fillStyle = '#fff';
    g.beginPath(); g.arc(x, eyeY, r, 0, Math.PI * 2); g.fill();
    g.fillStyle = mood === 'crazy' ? '#c0201a' : '#1b1b1b';
    g.beginPath(); g.arc(x + rnd(-3, 3), eyeY + rnd(-2, 3), r * 0.45, 0, Math.PI * 2); g.fill();
  }
  // naso
  g.fillStyle = 'rgba(0,0,0,.15)';
  g.fillRect(122, eyeY + 10, 12, 34);
  // bocca
  const my = eyeY + rnd(70, 88);
  g.fillStyle = '#5a1a14';
  if (mood === 'surprised') {
    g.beginPath(); g.ellipse(128, my, 18, 24, 0, 0, Math.PI * 2); g.fill();
  } else {
    const w = rnd(40, 70), h = mood === 'crazy' ? 30 : rnd(10, 20);
    g.fillRect(128 - w / 2, my - h / 2, w, h);
    g.fillStyle = '#f4f1e6'; // denti
    const teeth = mood === 'angry' || mood === 'crazy';
    if (teeth) for (let x = 128 - w / 2 + 3; x < 128 + w / 2 - 6; x += 10) g.fillRect(x, my - h / 2, 7, h * 0.45);
  }
  return { canvas: c, side: skin, top: hair };
}

/** Colore medio dei bordi di un'immagine (per colorare i lati della testa con le foto). */
export function edgeColor(canvas) {
  const g = canvas.getContext('2d', { willReadFrequently: true });
  const d = g.getImageData(0, 0, canvas.width, canvas.height).data;
  let r = 0, gr = 0, b = 0, n = 0;
  const w = canvas.width, h = canvas.height;
  for (let y = 0; y < h; y += 8) for (let x = 0; x < w; x += 8) {
    if (x > 24 && x < w - 24 && y > 24 && y < h - 24) continue;
    const i = (y * w + x) * 4;
    r += d[i]; gr += d[i + 1]; b += d[i + 2]; n++;
  }
  const hex = (v) => Math.round(v / n).toString(16).padStart(2, '0');
  return `#${hex(r)}${hex(gr)}${hex(b)}`;
}
