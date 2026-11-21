// Manifesto "RICERCATO" disegnato dal gioco: carta ingiallita, titolo, foto dell'amico, nome e una riga.
// Usato a fine partita (statistiche) e appeso sui muri della mappa.

/**
 * Disegna il manifesto su un canvas nuovo e lo restituisce.
 * photo = canvas/immagine quadrata del volto; name = nome (può essere vuoto); line = testo sotto.
 * seed = numero per le piccole differenze (macchie, angoli) tra un manifesto e l'altro.
 */
export function drawPoster(photo, name, line = '', seed = 1, w = 300) {
  const h = Math.round(w * 4 / 3), k = w / 300;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  let s = seed * 9301 + 49297;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);

  // carta
  const paper = g.createRadialGradient(w / 2, h * 0.45, w * 0.2, w / 2, h / 2, w * 0.85);
  paper.addColorStop(0, '#f1e2bb');
  paper.addColorStop(1, '#cfb27a');
  g.fillStyle = paper;
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 14; i++) { // macchie
    g.fillStyle = `rgba(120,80,30,${0.04 + rnd() * 0.06})`;
    g.beginPath(); g.arc(rnd() * w, rnd() * h, (6 + rnd() * 26) * k, 0, Math.PI * 2); g.fill();
  }
  g.strokeStyle = 'rgba(70,45,20,.7)';
  g.lineWidth = 4 * k;
  g.strokeRect(10 * k, 10 * k, w - 20 * k, h - 20 * k);

  // titolo
  g.fillStyle = '#4a2712';
  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';
  g.font = `900 ${46 * k}px Georgia, 'Times New Roman', serif`;
  g.fillText('RICERCATO', w / 2, 62 * k, w - 30 * k);

  // foto
  const px = 40 * k, py = 78 * k, ps = w - 80 * k;
  g.fillStyle = '#3a2412';
  g.fillRect(px - 4 * k, py - 4 * k, ps + 8 * k, ps + 8 * k);
  if (photo) {
    g.save();
    g.drawImage(photo, px, py, ps, ps);
    // un velo seppia, come una vecchia stampa
    g.fillStyle = 'rgba(160,110,40,.18)';
    g.fillRect(px, py, ps, ps);
    g.restore();
  }

  // nome e riga sotto
  g.fillStyle = '#3a1d0c';
  g.font = `800 ${34 * k}px Georgia, 'Times New Roman', serif`;
  g.fillText((name || 'SCONOSCIUTO').toUpperCase(), w / 2, py + ps + 44 * k, w - 30 * k);
  if (line) {
    g.font = `700 ${17 * k}px system-ui, sans-serif`;
    g.fillStyle = '#5a3418';
    g.fillText(line, w / 2, py + ps + 72 * k, w - 30 * k);
  }
  return c;
}
