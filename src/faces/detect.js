// Ritaglio intelligente: trova il viso in una foto e toglie lo sfondo, tutto nel browser.
// Usa MediaPipe (riconoscimento del viso BlazeFace e segmentazione "selfie"). I due modelli sono
// file del programma in public/models/; il motore (WASM) viene copiato nella build da vite.config.js.
// Nessuna foto lascia il dispositivo. Se qualcosa non va (browser vecchio, errore), si torna al
// ritaglio manuale: queste funzioni restituiscono null invece di dare errore.
const BASE = import.meta.env.BASE_URL;
let loading = null;

/** Carica (una volta sola, solo quando serve) il motore e i due modelli. */
function load() {
  if (!loading) {
    loading = (async () => {
      const { FilesetResolver, FaceDetector, ImageSegmenter } = await import('@mediapipe/tasks-vision');
      const files = await FilesetResolver.forVisionTasks(`${BASE}mediapipe`);
      const opts = (path) => ({ baseOptions: { modelAssetPath: `${BASE}models/${path}`, delegate: 'CPU' }, runningMode: 'IMAGE' });
      const [detector, segmenter] = await Promise.all([
        FaceDetector.createFromOptions(files, { ...opts('face_detector.tflite'), minDetectionConfidence: 0.45 }),
        ImageSegmenter.createFromOptions(files, { ...opts('selfie_segmenter.tflite'), outputConfidenceMasks: true, outputCategoryMask: false }),
      ]);
      return { detector, segmenter };
    })().catch((e) => {
      console.warn('Ritaglio automatico non disponibile:', e);
      loading = null; // riproverà alla prossima foto
      return null;
    });
  }
  return loading;
}

/** Inizia a caricare i modelli in anticipo (ad esempio quando si apre la galleria). */
export function preloadDetector() { load(); }

/** Copia (rimpicciolita) di una zona dell'immagine in un canvas, con il lato lungo al massimo `max`. */
function shrink(img, sx, sy, sw, sh, max) {
  const k = Math.min(1, max / Math.max(sw, sh));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(sw * k));
  c.height = Math.max(1, Math.round(sh * k));
  c.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
  return { c, k };
}

/**
 * Cerca il viso più grande. Restituisce { x, y, w, h } in pixel dell'immagine originale, o null.
 * Prima su tutta la foto; se non lo trova (viso piccolo, ad esempio una foto a figura intera)
 * riprova su 4 zone sovrapposte, ingrandite.
 */
export async function findFace(img) {
  const m = await load();
  if (!m) return null;
  const W = img.naturalWidth || img.width, H = img.naturalHeight || img.height;
  const zones = [[0, 0, W, H]];
  const zw = W * 0.6, zh = H * 0.6;
  for (const [fx, fy] of [[0, 0], [0.4, 0], [0, 0.4], [0.4, 0.4]]) zones.push([W * fx, H * fy, zw, zh]);
  for (const [sx, sy, sw, sh] of zones) {
    const { c, k } = shrink(img, sx, sy, sw, sh, 1024);
    let best = null;
    try {
      for (const d of m.detector.detect(c).detections) {
        const b = d.boundingBox;
        if (b && (!best || b.width * b.height > best.width * best.height)) best = b;
      }
    } catch (e) { return null; }
    if (best) return { x: sx + best.originX / k, y: sy + best.originY / k, w: best.width / k, h: best.height / k };
  }
  return null;
}

/**
 * Quanto ritagliare intorno al viso trovato: un quadrato che contiene viso e capelli.
 * Restituisce { cx, cy, size } in pixel dell'immagine.
 */
export function faceSquare(box) {
  const size = Math.max(box.w, box.h) * 1.6;
  return { cx: box.x + box.w / 2, cy: box.y + box.h * 0.38, size };
}

/**
 * Toglie lo sfondo da un ritaglio quadrato (canvas), in place: resta la persona (viso e capelli),
 * lo sfondo diventa un colore pieno simile alla pelle, che sarà anche il colore della testa in gioco.
 * Restituisce true se ci è riuscito.
 */
export async function removeBackground(canvas) {
  const m = await load();
  if (!m) return false;
  const W = canvas.width, H = canvas.height;
  let mask = null, mw = 0, mh = 0;
  try {
    m.segmenter.segment(canvas, (res) => {
      const cm = res.confidenceMasks && res.confidenceMasks[0];
      if (cm) { mask = cm.getAsFloat32Array().slice(); mw = cm.width; mh = cm.height; }
    });
  } catch (e) { return false; }
  if (!mask) return false;
  const g = canvas.getContext('2d', { willReadFrequently: true });
  const img = g.getImageData(0, 0, W, H), d = img.data;
  const conf = (x, y) => mask[Math.min(mh - 1, ((y * mh) / H) | 0) * mw + Math.min(mw - 1, ((x * mw) / W) | 0)];
  // persona trovata? (almeno un po' di pixel sicuri al centro)
  let sure = 0, r = 0, gg = 0, b = 0, n = 0;
  for (let y = 0; y < H; y += 4) for (let x = 0; x < W; x += 4) {
    const c = conf(x, y);
    if (c > 0.8) sure++;
    // colore della pelle: zona centrale del viso (guance), dove la persona è sicura
    const dx = (x - W / 2) / W, dy = (y - H * 0.55) / H;
    if (c > 0.9 && dx * dx + dy * dy < 0.012) { const i = (y * W + x) * 4; r += d[i]; gg += d[i + 1]; b += d[i + 2]; n++; }
  }
  if (sure < (W * H) / 16 / 12) return false; // meno di 1/12 della foto: lasciamo stare
  const bg = n ? [r / n * 0.82, gg / n * 0.82, b / n * 0.82] : [200, 160, 130];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const t = Math.min(1, Math.max(0, (conf(x, y) - 0.3) / 0.4));
    const a = t * t * (3 - 2 * t); // bordo morbido
    if (a >= 1) continue;
    const i = (y * W + x) * 4;
    d[i] = d[i] * a + bg[0] * (1 - a);
    d[i + 1] = d[i + 1] * a + bg[1] * (1 - a);
    d[i + 2] = d[i + 2] * a + bg[2] * (1 - a);
  }
  g.putImageData(img, 0, 0);
  return true;
}
