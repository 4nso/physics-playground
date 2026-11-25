// Navigazione dei nemici.
// La mappa è divisa in colonne da 1×1 m; in ogni colonna possono esserci più "piani" calpestabili
// (pavimento, soppalco, vasca della piscina, rampa...). Ogni piano calpestabile è un nodo.
// I nodi vicini sono collegati se il dislivello è piccolo e non c'è un muro in mezzo.
// Per ogni giocatore si calcola un "campo di percorso" (Dijkstra): da ogni nodo si sa qual è il
// passo successivo per raggiungerlo. Così 20 nemici costano come uno solo.

const CLEAR = 1.75;   // altezza libera minima sopra un nodo
const STEP = 0.6;     // dislivello massimo tra due nodi vicini (rampe e gradini)
/** Fase 16: gli zombi si arrampicano su ostacoli bassi (casse, banchi, cofani, piattaforme) fino a questo dislivello. */
export const CLIMB = 1.35;
const CLIMB_COST = 3;  // arrampicarsi costa come qualche passo in più (se c'è un giro corto si fa quello)
const BUCKET = 4;     // griglia di appoggio per cercare le forme vicine
/**
 * Correzione fase 16: sopra le forme più strette di così (recinti, ringhiere, parapetti, pali, schienali)
 * non nasce nessun punto calpestabile. Prima ci nascevano e, con l'arrampicata, gli zombi ci salivano
 * sopra e ricadevano dall'altra parte (sembrava che attraversassero gli oggetti).
 */
const MIN_TOP = 0.45;
const thin = (s) => s.k === 0 && (s.x1 - s.x0 < MIN_TOP || s.z1 - s.z0 < MIN_TOP);

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

export const nav = {
  ready: false,
  minX: 0, minZ: 0, cols: 0, rows: 0,
  count: 0,
  x: null, y: null, z: null,   // posizione dei nodi
  near: null,                  // 1 se il nodo è vicino a un muro (costa di più passarci)
  alive: null,                 // 1 se il nodo è nella zona raggiungibile principale
  colStart: null,              // nodi della colonna c: da colStart[c] a colStart[c+1]
  nbr: null, cost: null,       // 8 vicini per nodo (-1 = nessuno)
  aliveList: null,
  extra: null,                 // 1 se il nodo è dietro il cancello EXIT (tunnel, sala, cripta, cimitero)
  gateOpen: true,              // cancello aperto: i collegamenti attraverso il varco ci sono
};
/** Linea del cancello EXIT (z) e collegamenti che la attraversano: [indice in nbr, nodo] (vedi setNavGate). */
let gateZ = Infinity, gateLinks = [];

let shapes = [], buckets = null, bCols = 0, bRows = 0;

/* ---------- Forme ---------- */
function inside(s, x, z) { return x >= s.x0 && x <= s.x1 && z >= s.z0 && z <= s.z1; }
function topOf(s, x, z) {
  if (s.k === 0) return s.y1;
  const u = s.axis === 'x' ? (x - s.x0) / (s.x1 - s.x0) : (z - s.z0) / (s.z1 - s.z0);
  return s.h0 + (s.h1 - s.h0) * u;
}
function yRange(s) {
  return s.k === 0 ? [s.y0, s.y1] : [Math.min(s.h0, s.h1) - s.t, Math.max(s.h0, s.h1)];
}

function bucketsAround(x0, z0, x1, z1, fn) {
  const i0 = Math.max(0, Math.floor((x0 - nav.minX) / BUCKET)), i1 = Math.min(bCols - 1, Math.floor((x1 - nav.minX) / BUCKET));
  const j0 = Math.max(0, Math.floor((z0 - nav.minZ) / BUCKET)), j1 = Math.min(bRows - 1, Math.floor((z1 - nav.minZ) / BUCKET));
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) fn(buckets[j * bCols + i]);
}

/** C'è qualcosa di solido nella colonna (x,z) tra le altezze ya e yb? */
function columnBlocked(x, z, ya, yb) {
  let hit = false;
  bucketsAround(x, z, x, z, (list) => {
    if (hit) return;
    for (const s of list) {
      if (!inside(s, x, z)) continue;
      let lo, hi;
      if (s.k === 0) { lo = s.y0; hi = s.y1; } else { hi = topOf(s, x, z); lo = hi - s.t; }
      if (lo < yb && hi > ya) { hit = true; return; }
    }
  });
  return hit;
}

/** Una scatola (x±r, z±r, da ya a yb) tocca qualcosa? */
function boxBlocked(x, z, r, ya, yb) {
  let hit = false;
  bucketsAround(x - r, z - r, x + r, z + r, (list) => {
    if (hit) return;
    for (const s of list) {
      if (s.x1 < x - r || s.x0 > x + r || s.z1 < z - r || s.z0 > z + r) continue;
      const [lo, hi] = yRange(s);
      if (lo < yb && hi > ya) { hit = true; return; }
    }
  });
  return hit;
}

/** Il segmento da A a B attraversa una scatola (muri, soffitti...)? Le rampe non contano. */
function segBlocked(ax, ay, az, bx, by, bz) {
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  let hit = false;
  const seen = segSeen;
  seen.clear();
  bucketsAround(Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz), (list) => {
    if (hit) return;
    for (const s of list) {
      if (s.k !== 0 || seen.has(s)) continue;
      seen.add(s);
      let t0 = 0, t1 = 1;
      const slab = (o, d, lo, hi) => {
        if (Math.abs(d) < 1e-9) return o >= lo && o <= hi;
        let ta = (lo - o) / d, tb = (hi - o) / d;
        if (ta > tb) { const t = ta; ta = tb; tb = t; }
        if (ta > t0) t0 = ta;
        if (tb < t1) t1 = tb;
        return t0 <= t1;
      };
      if (slab(ax, dx, s.x0, s.x1) && slab(ay, dy, s.y0, s.y1) && slab(az, dz, s.z0, s.z1)) { hit = true; return; }
    }
  });
  return hit;
}
const segSeen = new Set();

/**
 * Tra i nodi a e b (vicini, stessa altezza h) c'è solo roba bassa e sottile? Ogni forma che il segmento
 * attraversa deve finire sotto h + CLIMB ed essere spessa meno di 0,6 m nella direzione del passaggio.
 */
function lowThinBetween(a, b, h) {
  const ax = nav.x[a], az = nav.z[a], bx = nav.x[b], bz = nav.z[b];
  let ok = true, any = false;
  bucketsAround(Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz), (list) => {
    if (!ok) return;
    for (const s of list) {
      if (s.k !== 0) { // rampe: non si scavalcano
        if (s.x1 >= Math.min(ax, bx) && s.x0 <= Math.max(ax, bx) && s.z1 >= Math.min(az, bz) && s.z0 <= Math.max(az, bz)) { ok = false; return; }
        continue;
      }
      if (s.y1 <= h + 0.05 || s.y0 >= h + CLIMB + 1.9) continue;   // sotto i piedi o molto sopra la testa
      // il segmento passa nella forma?
      const alongX = ax !== bx;
      const c = alongX ? az : ax;
      if (alongX ? c < s.z0 || c > s.z1 : c < s.x0 || c > s.x1) continue;
      const lo = alongX ? Math.min(ax, bx) : Math.min(az, bz), hi = alongX ? Math.max(ax, bx) : Math.max(az, bz);
      const s0 = alongX ? s.x0 : s.z0, s1 = alongX ? s.x1 : s.z1;
      if (s1 < lo || s0 > hi) continue;
      any = true;
      if (s.y1 > h + CLIMB || s1 - s0 > 0.6) { ok = false; return; }
    }
  });
  return ok && any;
}

/** Vista libera tra due punti (per non far comparire i nemici sotto gli occhi del giocatore). */
export function lineClear(ax, ay, az, bx, by, bz) { return !segBlocked(ax, ay, az, bx, by, bz); }

/* ---------- Costruzione ---------- */
/**
 * shapeList = forme del Builder; area = { minX, minZ, maxX, maxZ };
 * start = punto sicuramente raggiungibile (la partenza dei giocatori).
 */
export function buildNav(shapeList, area, start, gateLine = Infinity) {
  shapes = shapeList;
  gateZ = gateLine;
  nav.minX = area.minX; nav.minZ = area.minZ;
  nav.cols = Math.round(area.maxX - area.minX); nav.rows = Math.round(area.maxZ - area.minZ);
  bCols = Math.ceil(nav.cols / BUCKET); bRows = Math.ceil(nav.rows / BUCKET);
  buckets = Array.from({ length: bCols * bRows }, () => []);
  for (const s of shapes) {
    const i0 = Math.max(0, Math.floor((s.x0 - nav.minX) / BUCKET)), i1 = Math.min(bCols - 1, Math.floor((s.x1 - nav.minX) / BUCKET));
    const j0 = Math.max(0, Math.floor((s.z0 - nav.minZ) / BUCKET)), j1 = Math.min(bRows - 1, Math.floor((s.z1 - nav.minZ) / BUCKET));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) buckets[j * bCols + i].push(s);
  }

  // 1. nodi: le superfici calpestabili di ogni colonna, con abbastanza spazio sopra
  const X = [], Y = [], Z = [], NEAR = [];
  const colStart = new Int32Array(nav.cols * nav.rows + 1);
  const tops = [];
  for (let j = 0; j < nav.rows; j++) {
    for (let i = 0; i < nav.cols; i++) {
      const c = j * nav.cols + i;
      colStart[c] = X.length;
      const x = nav.minX + i + 0.5, z = nav.minZ + j + 0.5;
      tops.length = 0;
      bucketsAround(x, z, x, z, (list) => {
        for (const s of list) if (inside(s, x, z) && !thin(s)) tops.push(topOf(s, x, z));
      });
      tops.sort((a, b) => a - b);
      let lastY = -1e9;
      for (const y of tops) {
        if (y - lastY < 0.05) continue;
        lastY = y;
        if (columnBlocked(x, z, y + 0.05, y + CLEAR)) continue;
        X.push(x); Y.push(y); Z.push(z);
        NEAR.push(boxBlocked(x, z, 0.62, y + 0.3, y + 1.6) ? 1 : 0);
      }
    }
  }
  colStart[nav.cols * nav.rows] = X.length;
  const N = X.length;
  nav.count = N;
  nav.x = Float32Array.from(X); nav.y = Float32Array.from(Y); nav.z = Float32Array.from(Z);
  nav.near = Uint8Array.from(NEAR);
  nav.colStart = colStart;
  nav.nbr = new Int32Array(N * 8).fill(-1);
  nav.cost = new Float32Array(N * 8);

  // 2. collegamenti: prima i 4 vicini diritti, poi le diagonali (solo se non tagliano gli spigoli)
  const linkTo = (a, ci, cj) => {
    if (ci < 0 || cj < 0 || ci >= nav.cols || cj >= nav.rows) return -1;
    const c = cj * nav.cols + ci;
    let best = -1, bd = STEP;
    for (let b = colStart[c]; b < colStart[c + 1]; b++) {
      const d = Math.abs(nav.y[b] - nav.y[a]);
      if (d <= bd) { bd = d; best = b; }
    }
    return best;
  };
  /** Nodo nella colonna vicina raggiungibile solo arrampicandosi (o saltando giù): dislivello tra STEP e CLIMB. */
  const climbTo = (a, ci, cj) => {
    if (ci < 0 || cj < 0 || ci >= nav.cols || cj >= nav.rows) return -1;
    const c = cj * nav.cols + ci;
    let best = -1, bd = CLIMB;
    for (let b = colStart[c]; b < colStart[c + 1]; b++) {
      const d = Math.abs(nav.y[b] - nav.y[a]);
      if (d > STEP && d <= bd) { bd = d; best = b; }
    }
    return best;
  };
  const colOf = (a) => [Math.floor(nav.x[a] - nav.minX), Math.floor(nav.z[a] - nav.minZ)];
  const edgeCost = (a, b, diag) => (diag ? 1.414 : 1) * (nav.near[b] ? 2.4 : 1) + Math.abs(nav.y[b] - nav.y[a]) * 0.5;
  for (let a = 0; a < N; a++) {
    const [ci, cj] = colOf(a);
    for (let d = 0; d < 4; d++) {
      const b = linkTo(a, ci + DIRS[d][0], cj + DIRS[d][1]);
      if (b < 0) continue;
      const h = Math.max(nav.y[a], nav.y[b]);
      if (segBlocked(nav.x[a], h + 0.5, nav.z[a], nav.x[b], h + 0.5, nav.z[b])) continue;
      if (segBlocked(nav.x[a], h + 1.3, nav.z[a], nav.x[b], h + 1.3, nav.z[b])) continue;
      nav.nbr[a * 8 + d] = b;
      nav.cost[a * 8 + d] = edgeCost(a, b, false);
    }
  }
  // 2a. arrampicate (fase 16): solo nelle 4 direzioni diritte e solo dove non c'è già un passaggio normale
  nav.jump = new Uint8Array(N * 8); // 1 = arrampicata (o salto giù), 2 = scavalcamento di un ostacolo basso
  let climbs = 0, vaults = 0;
  for (let a = 0; a < N; a++) {
    const [ci, cj] = colOf(a);
    for (let d = 0; d < 4; d++) {
      if (nav.nbr[a * 8 + d] >= 0) continue;
      const b = climbTo(a, ci + DIRS[d][0], cj + DIRS[d][1]);
      if (b < 0) continue;
      const lo = Math.min(nav.y[a], nav.y[b]), h = Math.max(nav.y[a], nav.y[b]);
      // spazio per passare: sopra il bordo e, dal lato basso, fino a sopra il bordo
      if (segBlocked(nav.x[a], h + 0.5, nav.z[a], nav.x[b], h + 0.5, nav.z[b])) continue;
      if (segBlocked(nav.x[a], h + 1.3, nav.z[a], nav.x[b], h + 1.3, nav.z[b])) continue;
      const low = nav.y[a] < nav.y[b] ? a : b;
      if (columnBlocked(nav.x[low], nav.z[low], lo + 0.05, h + 1.6)) continue;
      nav.nbr[a * 8 + d] = b;
      nav.cost[a * 8 + d] = edgeCost(a, b, false) + CLIMB_COST;
      nav.jump[a * 8 + d] = 1;
      climbs++;
    }
  }
  // 2b. scavalcamenti (fase 16): due nodi alla stessa altezza separati da qualcosa di basso e sottile
  // (bancone, recinto, ringhiera): si passa se sopra l'ostacolo (fino a CLIMB) c'è spazio libero
  for (let a = 0; a < N; a++) {
    const [ci, cj] = colOf(a);
    for (let d = 0; d < 4; d++) {
      if (nav.nbr[a * 8 + d] >= 0) continue;
      const b = linkTo(a, ci + DIRS[d][0], cj + DIRS[d][1]);
      if (b < 0) continue;
      const h = Math.max(nav.y[a], nav.y[b]);
      if (!segBlocked(nav.x[a], h + 0.5, nav.z[a], nav.x[b], h + 0.5, nav.z[b])) continue; // non c'era ostacolo: era un'altra cosa
      if (!lowThinBetween(a, b, h)) continue; // solo recinti, ringhiere, banconi: niente muri
      if (segBlocked(nav.x[a], h + CLIMB + 0.15, nav.z[a], nav.x[b], h + CLIMB + 0.15, nav.z[b])) continue;
      if (segBlocked(nav.x[a], h + CLIMB + 1.0, nav.z[a], nav.x[b], h + CLIMB + 1.0, nav.z[b])) continue;
      if (columnBlocked(nav.x[a], nav.z[a], nav.y[a] + 0.05, h + CLIMB + 1.2) || columnBlocked(nav.x[b], nav.z[b], nav.y[b] + 0.05, h + CLIMB + 1.2)) continue;
      nav.nbr[a * 8 + d] = b;
      nav.cost[a * 8 + d] = edgeCost(a, b, false) + CLIMB_COST;
      nav.jump[a * 8 + d] = 2;
      vaults++;
    }
  }
  nav.climbs = climbs;
  nav.vaults = vaults;
  // le diagonali si appoggiano solo a passaggi a piedi (mai ad arrampicate o scavalcamenti:
  // altrimenti diventerebbero un passaggio "a piedi" che taglia lo spigolo di un ostacolo)
  const hasLink = (a, b) => { for (let d = 0; d < 4; d++) if (nav.nbr[a * 8 + d] === b && !nav.jump[a * 8 + d]) return true; return false; };
  for (let a = 0; a < N; a++) {
    const [ci, cj] = colOf(a);
    for (let d = 4; d < 8; d++) {
      const [di, dj] = DIRS[d];
      const b = linkTo(a, ci + di, cj + dj);
      if (b < 0) continue;
      const s1 = nav.nbr[a * 8 + (di > 0 ? 0 : 1)], s2 = nav.nbr[a * 8 + (dj > 0 ? 2 : 3)];
      if (s1 < 0 || s2 < 0 || !hasLink(s1, b) || !hasLink(s2, b)) continue;
      nav.nbr[a * 8 + d] = b;
      nav.cost[a * 8 + d] = edgeCost(a, b, true);
    }
  }

  // 2b. nodi dietro il cancello EXIT e collegamenti attraverso il varco (si tolgono col cancello chiuso)
  nav.extra = new Uint8Array(N);
  gateLinks = [];
  for (let a = 0; a < N; a++) {
    if (nav.z[a] > gateZ) nav.extra[a] = 1;
    for (let d = 0; d < 8; d++) {
      const b = nav.nbr[a * 8 + d];
      if (b >= 0 && (nav.z[a] < gateZ) !== (nav.z[b] < gateZ)) gateLinks.push([a * 8 + d, b]);
    }
  }
  nav.gateOpen = true;

  // 3. solo la zona collegata alla partenza (i tetti irraggiungibili e simili non contano)
  nav.alive = new Uint8Array(N);
  nav.ready = true;
  const s0 = nodeAt(start.x, start.y, start.z, true);
  const list = [];
  if (s0 >= 0) {
    const stack = [s0];
    nav.alive[s0] = 1;
    while (stack.length) {
      const a = stack.pop();
      list.push(a);
      for (let d = 0; d < 8; d++) {
        const b = nav.nbr[a * 8 + d];
        if (b >= 0 && !nav.alive[b]) { nav.alive[b] = 1; stack.push(b); }
      }
    }
  }
  nav.aliveList = Int32Array.from(list);
  fields.length = 0;
  job = null;
}

/**
 * Cancello EXIT aperto o chiuso: col cancello chiuso i nemici non passano dal varco
 * e non compaiono dietro (tunnel, sala, cripta, cimitero).
 */
export function setNavGate(open) {
  if (!nav.ready || nav.gateOpen === open) return;
  nav.gateOpen = open;
  for (const [i, b] of gateLinks) nav.nbr[i] = open ? b : -1;
  if (job) job = null;
  for (const f of fields) f.src = -1; // i percorsi si ricalcolano subito
}
const hiddenNode = (a) => !nav.gateOpen && nav.extra[a];

/**
 * Nodo sotto i piedi in (x, feetY, z), o -1. Cerca anche nelle colonne vicine
 * (ad esempio se si è appoggiati a un muro o sopra una cassa).
 */
export function nodeAt(x, feetY, z, any = false) {
  if (!nav.ready) return -1;
  const ci = Math.floor(x - nav.minX), cj = Math.floor(z - nav.minZ);
  let best = -1, bs = Infinity;
  for (let r = 0; r <= 2 && best < 0; r++) {
    for (let dj = -r; dj <= r; dj++) {
      for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
        const i = ci + di, j = cj + dj;
        if (i < 0 || j < 0 || i >= nav.cols || j >= nav.rows) continue;
        const c = j * nav.cols + i;
        for (let b = nav.colStart[c]; b < nav.colStart[c + 1]; b++) {
          if (!any && !nav.alive[b]) continue;
          const dy = feetY - nav.y[b];
          if (dy < -0.8 || dy > 3) continue; // il nodo deve essere sotto di noi (o poco sopra)
          const sc = Math.abs(dy) * 2 + Math.hypot(nav.x[b] - x, nav.z[b] - z);
          if (sc < bs) { bs = sc; best = b; }
        }
      }
    }
  }
  return best;
}

/* ---------- Campi di percorso (uno per giocatore) ---------- */
// Il calcolo di un campo (Dijkstra su ~14 000 nodi) costa qualche millisecondo: per non avere
// scatti si fa a pezzi, su più fotogrammi, in una copia; quando è finito prende il posto di quello vecchio
// (fase 12). Nel frattempo i nemici seguono il campo precedente, che va benissimo per pochi fotogrammi.
const STEP_BUDGET = 1500; // nodi estratti dalla coda per fotogramma (~0,2 ms su un computer recente)
let job = null;           // campo in calcolo (uno alla volta: la coda è condivisa)
class Field {
  constructor() {
    this.dist = new Float32Array(nav.count);
    this.next = new Int32Array(nav.count);
    this.wDist = new Float32Array(nav.count); // copie di lavoro del calcolo a pezzi
    this.wNext = new Int32Array(nav.count);
    this.src = -1;
    this.wSrc = -1;
    this.age = 99;
    this.id = null;
  }
  /** Inizia il calcolo verso il nodo src (lo finisce step()). */
  start(src) {
    this.wDist.fill(Infinity);
    this.wNext.fill(-1);
    this.wSrc = src;
    heapN = 0;
    if (src >= 0) { this.wDist[src] = 0; push(src, 0); }
    job = this;
  }
  /** Continua il calcolo per al massimo `budget` nodi; true quando è finito (e il campo nuovo è in uso). */
  step(budget) {
    const dist = this.wDist, next = this.wNext;
    while (heapN > 0 && budget-- > 0) {
      const a = pop();
      const da = popD;
      if (da > dist[a]) continue;
      for (let d = 0; d < 8; d++) {
        const b = nav.nbr[a * 8 + d];
        if (b < 0) continue;
        const nd = da + nav.cost[a * 8 + d];
        if (nd < dist[b]) { dist[b] = nd; next[b] = a; push(b, nd); }
      }
    }
    if (heapN > 0) return false;
    this.wDist = this.dist; this.wNext = this.next;
    this.dist = dist; this.next = next;
    this.src = this.wSrc;
    job = null;
    return true;
  }
  /** Calcolo completo subito (campo nuovo, quando i nemici non hanno ancora un percorso). */
  compute(src) {
    this.start(src);
    this.step(Infinity);
    this.age = 0;
  }
}

let heapI = new Int32Array(1024), heapD = new Float32Array(1024), heapN = 0, popD = 0;
function push(i, d) {
  if (heapN >= heapI.length) {
    const ni = new Int32Array(heapI.length * 2); ni.set(heapI); heapI = ni;
    const nd = new Float32Array(heapD.length * 2); nd.set(heapD); heapD = nd;
  }
  let k = heapN++;
  while (k > 0) {
    const p = (k - 1) >> 1;
    if (heapD[p] <= d) break;
    heapI[k] = heapI[p]; heapD[k] = heapD[p]; k = p;
  }
  heapI[k] = i; heapD[k] = d;
}
function pop() {
  const top = heapI[0];
  popD = heapD[0];
  const li = heapI[--heapN], ld = heapD[heapN];
  let k = 0;
  for (;;) {
    let c = 2 * k + 1;
    if (c >= heapN) break;
    if (c + 1 < heapN && heapD[c + 1] < heapD[c]) c++;
    if (heapD[c] >= ld) break;
    heapI[k] = heapI[c]; heapD[k] = heapD[c]; k = c;
  }
  heapI[k] = li; heapD[k] = ld;
  return top;
}

/** Campi attivi, uno per bersaglio vivo: [{ id, field }] */
export const fields = [];

/**
 * Aggiorna i campi di percorso dei bersagli. Ricalcola al massimo un campo per frame,
 * e solo se il bersaglio ha cambiato nodo (o il campo è vecchio).
 * targets = [{ id, x, y (centro della capsula), z, alive }]
 */
export function updateFields(dt, targets) {
  if (!nav.ready) return;
  for (let i = fields.length - 1; i >= 0; i--) {
    if (!targets.some((t) => t.id === fields[i].id && t.alive)) {
      if (job === fields[i]) job = null;
      fields.splice(i, 1);
    }
  }
  let worst = null, worstScore = 0;
  for (const t of targets) {
    if (!t.alive) continue;
    let f = null;
    for (const x of fields) if (x.id === t.id) { f = x; break; }
    if (!f) { f = new Field(); f.id = t.id; fields.push(f); }
    f.age += dt;
    const n = nodeAt(t.x, t.y - 0.8, t.z);
    f.want = n;
    if (n >= 0 && n !== f.src && f !== job) {
      if (f.src < 0) { f.compute(n); continue; } // nessun percorso ancora: subito
      if (f.age > 0.25 && f.age > worstScore) { worst = f; worstScore = f.age; }
    }
  }
  if (job) job.step(STEP_BUDGET);
  else if (worst) { worst.age = 0; worst.start(worst.want); worst.step(STEP_BUDGET); }
}

/**
 * Per un nemico nel nodo `from`: il campo (bersaglio) più vicino lungo il percorso e il punto
 * verso cui camminare. Restituisce null se nessun bersaglio è raggiungibile.
 */
const steerOut = { x: 0, y: 0, z: 0, nx: 0, ny: 0, nz: 0, jump: 0, dist: 0, id: null };
export function steer(from) {
  if (from < 0 || !fields.length) return null;
  let best = null, bd = Infinity;
  for (const f of fields) {
    const d = f.dist[from];
    if (d < bd) { bd = d; best = f; }
  }
  if (!best) return null;
  // guarda due passi avanti lungo il percorso: il movimento è più morbido
  let w = best.next[from];
  if (w < 0) w = from;
  // primo passo (per capire se bisogna arrampicarsi o scavalcare: vedi enemies.js)
  steerOut.nx = nav.x[w]; steerOut.ny = nav.y[w]; steerOut.nz = nav.z[w];
  steerOut.jump = 0;
  for (let d = 0; d < 4; d++) if (nav.nbr[from * 8 + d] === w) { steerOut.jump = nav.jump[from * 8 + d]; break; }
  const w2 = best.next[w];
  if (w2 >= 0) w = w2;
  steerOut.x = nav.x[w]; steerOut.y = nav.y[w]; steerOut.z = nav.z[w];
  steerOut.dist = bd; steerOut.id = best.id;
  return steerOut;
}

/** Distanza (lungo i percorsi) dal bersaglio più vicino; Infinity se irraggiungibile. */
export function pathDist(node) {
  let bd = Infinity;
  for (const f of fields) if (f.dist[node] < bd) bd = f.dist[node];
  return bd;
}

/**
 * Punto di comparsa per un nemico: lontano dai giocatori (lungo i percorsi)
 * e fuori dalla loro vista. targets = [{ x, y, z, alive }].
 */
export function findSpawn(targets, minD = 18, maxD = 55) {
  if (!nav.ready || !nav.aliveList.length) return null;
  const L = nav.aliveList;
  let fallback = null, fd = -1;
  for (let k = 0; k < 80; k++) {
    const a = L[(Math.random() * L.length) | 0];
    if (nav.near[a] || hiddenNode(a)) continue;
    const d = fields.length ? pathDist(a) : 30;
    if (d === Infinity) continue;
    let visible = false, close = false;
    for (const t of targets) {
      const ex = t.x, ey = t.y + 0.75, ez = t.z;
      const e = Math.hypot(nav.x[a] - ex, nav.z[a] - ez);
      if (e < 9) close = true;
      if (e < 50 && lineClear(ex, ey, ez, nav.x[a], nav.y[a] + 1.2, nav.z[a])) visible = true;
    }
    if (close) continue;
    if (!visible && d >= minD && d <= maxD) return { x: nav.x[a], y: nav.y[a], z: nav.z[a] };
    const score = (visible ? 0 : 100) + Math.min(d, 60);
    if (score > fd) { fd = score; fallback = { x: nav.x[a], y: nav.y[a], z: nav.z[a] }; }
  }
  return fallback;
}

/** Un nodo a caso a una certa distanza (lungo i percorsi) dai giocatori: per munizioni e vita. */
export function randomNodeNear(minD, maxD) {
  if (!nav.ready || !nav.aliveList.length) return null;
  const L = nav.aliveList;
  for (let k = 0; k < 120; k++) {
    const a = L[(Math.random() * L.length) | 0];
    if (nav.near[a] || hiddenNode(a)) continue;
    const d = fields.length ? pathDist(a) : minD;
    if (d >= minD && d <= maxD) return { x: nav.x[a], y: nav.y[a], z: nav.z[a] };
  }
  let a = L[(Math.random() * L.length) | 0];
  for (let k = 0; k < 20 && hiddenNode(a); k++) a = L[(Math.random() * L.length) | 0];
  return { x: nav.x[a], y: nav.y[a], z: nav.z[a] };
}
