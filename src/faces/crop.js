// Editor di ritaglio: il gioco cerca da solo il viso, lo centra, lo ingrandisce e toglie lo sfondo
// (vedi detect.js). L'utente può sempre correggere a mano (trascina + zoom) e scrive il nome;
// esce un JPEG 512×512.
import { findFace, faceSquare, removeBackground, preloadDetector } from './detect.js';

const $ = (id) => document.getElementById(id);
const VIEW = 512, OUT = 512;
const MAX_ZOOM = 12; // le foto del telefono sono grandi: un viso piccolo va ingrandito molto
export const NAME_MAX = 14;
/** Pulisce un nome scritto dall'utente: niente spazi in più, lunghezza massima. */
export const cleanName = (t) => String(t || '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
export { preloadDetector };

/**
 * Mostra l'editor per un file immagine.
 * Restituisce una Promise con { blob, name }, oppure null se l'utente salta la foto.
 */
export function cropImage(file, label, name = '') {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.onload = () => edit(img, label, (r) => { URL.revokeObjectURL(url); resolve(r); }, name);
    img.src = url;
  });
}

function edit(img, label, done, presetName = '') {
  const screen = $('crop'), cv = $('cCanvas'), g = cv.getContext('2d', { willReadFrequently: true }), zoomEl = $('cZoom');
  const status = $('cAuto'), cutBtn = $('cCut');
  const w = img.naturalWidth, h = img.naturalHeight;
  const base = VIEW / Math.min(w, h); // scala minima: l'immagine copre tutto il quadrato
  let zoom = 1, cx = VIEW / 2, cy = VIEW / 2;
  let cut = true, closed = false, cutTimer = 0;
  $('cCount').textContent = label || '';
  $('cName').value = presetName;
  zoomEl.max = MAX_ZOOM;
  zoomEl.value = 1;
  screen.classList.remove('hidden');

  let found = '';
  const say = (text) => { status.textContent = text; };
  const paintCutBtn = () => {
    cutBtn.classList.toggle('on', cut);
    cutBtn.textContent = cut ? '✂️ Sfondo tolto' : '✂️ Togli lo sfondo';
  };
  paintCutBtn();

  const clamp = () => {
    const s = base * zoom, mx = (w * s - VIEW) / 2, my = (h * s - VIEW) / 2;
    cx = Math.min(VIEW / 2 + mx, Math.max(VIEW / 2 - mx, cx));
    cy = Math.min(VIEW / 2 + my, Math.max(VIEW / 2 - my, cy));
  };
  const draw = (ctx, k) => {
    const s = base * zoom * k;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, VIEW * k, VIEW * k);
    ctx.drawImage(img, cx * k - (w * s) / 2, cy * k - (h * s) / 2, w * s, h * s);
  };
  // anteprima dello sfondo tolto: si calcola poco dopo che l'utente ha smesso di muovere
  const previewCut = () => {
    clearTimeout(cutTimer);
    if (!cut) return;
    cutTimer = setTimeout(async () => {
      if (closed || !cut) return;
      const ok = await removeBackground(cv);
      if (!ok && !closed && cut) {
        // nessuna persona riconosciuta: lo sfondo resta (si può riprovare dopo aver spostato la foto)
        cut = false;
        paintCutBtn();
        say(`${found ? found + ' · ' : ''}lo sfondo resta`);
      }
    }, 220);
  };
  const redraw = () => { clamp(); draw(g, 1); previewCut(); };
  const setZoom = (z) => { zoom = Math.max(1, Math.min(MAX_ZOOM, z)); zoomEl.value = zoom; redraw(); };
  /** Inquadra un quadrato dell'immagine: { cx, cy, size } in pixel della foto. */
  const frame = (sq) => {
    zoom = Math.max(1, Math.min(MAX_ZOOM, VIEW / sq.size / base));
    const s = base * zoom;
    cx = VIEW / 2 - (sq.cx - w / 2) * s;
    cy = VIEW / 2 - (sq.cy - h / 2) * s;
    zoomEl.value = zoom;
    redraw();
  };
  redraw();

  // Ritaglio automatico: cerca il viso e lo inquadra (l'utente può comunque correggere)
  say('🔍 Cerco il viso…');
  findFace(img).then((box) => {
    if (closed) return;
    found = box ? '✅ Viso trovato' : 'Viso non trovato: centralo tu con le dita';
    say(box ? '✅ Viso trovato: se serve, sistemalo con le dita' : found);
    if (box) frame(faceSquare(box));
  });

  // Trascina con un dito, pizzica con due
  const pts = new Map();
  let pinch = null;
  const toCanvas = () => VIEW / cv.getBoundingClientRect().width;
  const onDown = (e) => {
    cv.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: zoom };
    }
  };
  const onMove = (e) => {
    const p = pts.get(e.pointerId);
    if (!p) return;
    if (pts.size === 1) {
      const k = toCanvas();
      cx += (e.clientX - p.x) * k;
      cy += (e.clientY - p.y) * k;
    }
    p.x = e.clientX; p.y = e.clientY;
    if (pts.size === 2 && pinch) {
      const [a, b] = [...pts.values()];
      setZoom(pinch.z * (Math.hypot(a.x - b.x, a.y - b.y) / pinch.d));
    } else redraw();
  };
  const onUp = (e) => { pts.delete(e.pointerId); if (pts.size < 2) pinch = null; };
  const onWheel = (e) => { e.preventDefault(); setZoom(zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08)); };
  const onZoom = () => setZoom(+zoomEl.value);
  const onCut = () => { cut = !cut; paintCutBtn(); redraw(); };

  cv.addEventListener('pointerdown', onDown);
  cv.addEventListener('pointermove', onMove);
  cv.addEventListener('pointerup', onUp);
  cv.addEventListener('pointercancel', onUp);
  cv.addEventListener('wheel', onWheel, { passive: false });
  zoomEl.addEventListener('input', onZoom);
  cutBtn.addEventListener('click', onCut);

  const finish = async (save) => {
    if (closed) return;
    closed = true;
    clearTimeout(cutTimer);
    cv.removeEventListener('pointerdown', onDown);
    cv.removeEventListener('pointermove', onMove);
    cv.removeEventListener('pointerup', onUp);
    cv.removeEventListener('pointercancel', onUp);
    cv.removeEventListener('wheel', onWheel);
    zoomEl.removeEventListener('input', onZoom);
    cutBtn.removeEventListener('click', onCut);
    $('cSave').onclick = $('cSkip').onclick = null;
    if (!save) { screen.classList.add('hidden'); done(null); return; }
    const name = cleanName($('cName').value);
    const out = document.createElement('canvas');
    out.width = out.height = OUT;
    draw(out.getContext('2d', { willReadFrequently: true }), OUT / VIEW);
    if (cut) await removeBackground(out);
    screen.classList.add('hidden');
    out.toBlob((b) => done(b ? { blob: b, name } : null), 'image/jpeg', 0.9);
  };
  $('cSave').onclick = () => finish(true);
  $('cSkip').onclick = () => finish(false);
}
