// Editor di ritaglio: l'utente centra il viso in un quadrato (trascina + zoom) e scrive il nome;
// esce un JPEG 512×512.
const $ = (id) => document.getElementById(id);
const VIEW = 512, OUT = 512;
export const NAME_MAX = 14;
/** Pulisce un nome scritto dall'utente: niente spazi in più, lunghezza massima. */
export const cleanName = (t) => String(t || '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);

/**
 * Mostra l'editor per un file immagine.
 * Restituisce una Promise con { blob, name }, oppure null se l'utente salta la foto.
 */
export function cropImage(file, label) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.onload = () => edit(img, label, (blob) => { URL.revokeObjectURL(url); resolve(blob); });
    img.src = url;
  });
}

function edit(img, label, done) {
  const screen = $('crop'), cv = $('cCanvas'), g = cv.getContext('2d'), zoomEl = $('cZoom');
  const w = img.naturalWidth, h = img.naturalHeight;
  const base = VIEW / Math.min(w, h); // scala minima: l'immagine copre tutto il quadrato
  let zoom = 1, cx = VIEW / 2, cy = VIEW / 2;
  $('cCount').textContent = label || '';
  $('cName').value = '';
  zoomEl.value = 1;
  screen.classList.remove('hidden');

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
  const redraw = () => { clamp(); draw(g, 1); };
  const setZoom = (z) => { zoom = Math.max(1, Math.min(4, z)); zoomEl.value = zoom; redraw(); };
  redraw();

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

  cv.addEventListener('pointerdown', onDown);
  cv.addEventListener('pointermove', onMove);
  cv.addEventListener('pointerup', onUp);
  cv.addEventListener('pointercancel', onUp);
  cv.addEventListener('wheel', onWheel, { passive: false });
  zoomEl.addEventListener('input', onZoom);

  const finish = (save) => {
    cv.removeEventListener('pointerdown', onDown);
    cv.removeEventListener('pointermove', onMove);
    cv.removeEventListener('pointerup', onUp);
    cv.removeEventListener('pointercancel', onUp);
    cv.removeEventListener('wheel', onWheel);
    zoomEl.removeEventListener('input', onZoom);
    $('cSave').onclick = $('cSkip').onclick = null;
    screen.classList.add('hidden');
    if (!save) { done(null); return; }
    const out = document.createElement('canvas');
    out.width = out.height = OUT;
    draw(out.getContext('2d'), OUT / VIEW);
    const name = cleanName($('cName').value);
    out.toBlob((b) => done(b ? { blob: b, name } : null), 'image/jpeg', 0.9);
  };
  $('cSave').onclick = () => finish(true);
  $('cSkip').onclick = () => finish(false);
}
