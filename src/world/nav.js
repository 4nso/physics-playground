// Navigazione dei nemici.
// La mappa è divisa in colonne da 1×1 m; in ogni colonna possono esserci più "piani" calpestabili
// (pavimento, soppalco, vasca della piscina, rampa...). Ogni piano calpestabile è un nodo.
// I nodi vicini sono collegati se il dislivello è piccolo e non c'è un muro in mezzo.
// Per ogni giocatore si calcola un "campo di percorso" (Dijkstra): da ogni nodo si sa qual è il
// passo successivo per raggiungerlo. Così 20 nemici costano come uno solo.

const CLEAR = 1.75;   // altezza libera minima sopra un nodo
const STEP = 0.6;     // dislivello massimo tra due nodi vicini (rampe e gradini)
const BUCKET = 4;     // griglia di appoggio per cercare le forme vicine

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
};

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

/** Vista libera tra due punti (per non far comparire i nemici sotto gli occhi del giocatore). */
export function lineClear(ax, ay, az, bx, by, bz) { return !segBlocked(ax, ay, az, bx, by, bz); }

/* ---------- Costruzione ---------- */
/**
 * shapeList = forme del Builder; area = { minX, minZ, maxX, maxZ };
 * start = punto sicuramente raggiungibile (la partenza dei giocatori).
 */
export function buildNav(shapeList, area, start) {
  shapes = shapeList;
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
        for (const s of list) if (inside(s, x, z)) tops.push(topOf(s, x, z));
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
  const hasLink = (a, b) => { for (let d = 0; d < 4; d++) if (nav.nbr[a * 8 + d] === b) return true; return false; };
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
}

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
class Field {
  constructor() {
    this.dist = new Float32Array(nav.count);
    this.next = new Int32Array(nav.count);
    this.src = -1;
    this.age = 99;
    this.id = null;
  }
  compute(src) {
    const { dist, next } = this;
    dist.fill(Infinity);
    next.fill(-1);
    this.src = src;
    this.age = 0;
    if (src < 0) return;
    // Dijkstra con una coda a priorità (heap binario)
    heapN = 0;
    dist[src] = 0;
    push(src, 0);
    while (heapN > 0) {
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
    if (!targets.some((t) => t.id === fields[i].id && t.alive)) fields.splice(i, 1);
  }
  let worst = null, worstScore = 0;
  for (const t of targets) {
    if (!t.alive) continue;
    let f = fields.find((x) => x.id === t.id);
    if (!f) { f = new Field(); f.id = t.id; fields.push(f); }
    f.age += dt;
    const n = nodeAt(t.x, t.y - 0.8, t.z);
    f.want = n;
    if (n >= 0 && n !== f.src) {
      const score = f.src < 0 ? 100 : f.age;
      if (score > 0.25 && score > worstScore) { worst = f; worstScore = score; }
    }
  }
  if (worst) worst.compute(worst.want);
}

/**
 * Per un nemico nel nodo `from`: il campo (bersaglio) più vicino lungo il percorso e il punto
 * verso cui camminare. Restituisce null se nessun bersaglio è raggiungibile.
 */
const steerOut = { x: 0, y: 0, z: 0, dist: 0, id: null };
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
    if (nav.near[a]) continue;
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
    if (nav.near[a]) continue;
    const d = fields.length ? pathDist(a) : minD;
    if (d >= minD && d <= maxD) return { x: nav.x[a], y: nav.y[a], z: nav.z[a] };
  }
  const a = L[(Math.random() * L.length) | 0];
  return { x: nav.x[a], y: nav.y[a], z: nav.z[a] };
}
