// Misura del tempo di ogni fotogramma, diviso per parti (fase 12, passo 1).
// Si accende aggiungendo ?prof all'indirizzo (o da __pp.prof nei test). Spento non costa niente:
// mark() esce subito. Mostra sotto il contatore fps i millisecondi medi di ogni parte (CPU) e,
// se il browser lo permette (Chrome sul computer), anche il tempo della scheda grafica (GPU).
import { renderer } from './renderer.js';

export const prof = {
  on: /[?&]prof\b/.test(location.search),
  /** medie in ms dell'ultimo mezzo secondo: { nome: ms } */
  avg: {},
  gpu: 0,      // ms di GPU per fotogramma (0 se non misurabile)
  frame: 0,    // ms totali di CPU nel ciclo
  peak: 0,     // fotogramma più lento dell'ultimo mezzo secondo (ms di CPU): gli scatti
  calls: 0,    // chiamate di disegno
  tris: 0,     // triangoli
};

const sums = new Map();
let t0 = 0, tFrame = 0, n = 0, acc = 0, peak = 0;

/** Inizio del fotogramma. */
export function profBegin() {
  if (!prof.on) return;
  t0 = tFrame = performance.now();
  gpuBegin();
}

/** Fine di una parte: il tempo dall'ultimo mark va nella voce "name". */
export function mark(name) {
  if (!prof.on) return;
  const t = performance.now();
  sums.set(name, (sums.get(name) || 0) + t - t0);
  t0 = t;
}

/** Fine del fotogramma (dopo il disegno). */
export function profEnd(rawDt) {
  if (!prof.on) return;
  gpuEnd();
  const ft = performance.now() - tFrame;
  prof.frame = prof.frame * 0.9 + ft * 0.1;
  if (ft > peak) peak = ft;
  n++; acc += rawDt;
  if (acc < 0.5) return;
  prof.avg = {};
  for (const [k, v] of sums) prof.avg[k] = v / n;
  sums.clear();
  n = 0; acc = 0;
  prof.peak = peak; peak = 0;
  prof.calls = renderer.info.render.calls;
  prof.tris = renderer.info.render.triangles;
}

/** Testo per il contatore. */
export function profText() {
  const parts = Object.entries(prof.avg).sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k} ${v.toFixed(1)}`);
  const cpu = Object.values(prof.avg).reduce((a, b) => a + b, 0);
  return `CPU ${cpu.toFixed(1)} ms (max ${prof.peak.toFixed(0)})${prof.gpu ? ` · GPU ${prof.gpu.toFixed(1)} ms` : ' · GPU n.d.'} · ${prof.calls} disegni · ${Math.round(prof.tris / 1000)}k tri<br>${parts.join(' · ')}`;
}

/* ---------- Tempo della scheda grafica (EXT_disjoint_timer_query_webgl2) ---------- */
let ext = null, gl = null;
const pending = [];
let active = null;
function gpuBegin() {
  if (!gl) {
    gl = renderer.getContext();
    ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  }
  if (!ext || active || pending.length > 4) return;
  active = gl.createQuery();
  gl.beginQuery(ext.TIME_ELAPSED_EXT, active);
}
function gpuEnd() {
  if (!ext) return;
  if (active) { gl.endQuery(ext.TIME_ELAPSED_EXT); pending.push(active); active = null; }
  while (pending.length) {
    const q = pending[0];
    if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) break;
    pending.shift();
    if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) {
      const ms = gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6;
      prof.gpu = prof.gpu ? prof.gpu * 0.9 + ms * 0.1 : ms;
    }
    gl.deleteQuery(q);
  }
}
