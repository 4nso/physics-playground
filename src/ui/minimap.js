// Minimappa rotonda in alto a sinistra: ruota con la visuale (in alto c'è sempre "davanti").
// La pianta della mappa si disegna una volta sola in un canvas nascosto; a ogni aggiornamento
// se ne copia solo un pezzo ruotato, quindi costa pochissimo.
// Mappa grande (fase 15): toccando la minimappa (M sulla tastiera, ⧉ sul controller) si apre tutta
// la mappa vista dall'alto, ferma con il nord in alto, con giocatori, direzione e nomi delle zone.
// Serve solo a guardare: il gioco non si ferma. Il muro segreto non si vede (il pannello finto è
// disegnato come muro) e le zone non ancora scoperte non ci sono.
import { map, zoneAt } from '../world/map.js';
import { GATE } from '../world/zones.js';
import { exit } from '../game/exitgate.js';
import { SLOT_COLORS, playerName } from '../net/avatars.js';

const RANGE = 26;    // metri visibili dal centro al bordo
const $ = (id) => document.getElementById(id);

let plan = null, planSeed = -1, ctx = null, cv = null, timer = 0;
let bigPlan = null, bigSeed = -1;

/** Pianta della mappa a PX pixel per metro (la minimappa ne usa 3, la mappa grande di più). */
function drawPlan(PX = 3) {
  const b = map.bounds, W = (b.maxX - b.minX) * PX, H = (b.maxZ - b.minZ) * PX;
  const plan = document.createElement('canvas');
  plan.width = W; plan.height = H;
  const g = plan.getContext('2d');
  const X = (x) => (x - b.minX) * PX, Z = (z) => (z - b.minZ) * PX;
  for (const zn of map.zones) {
    g.fillStyle = zn.color;
    g.fillRect(X(zn.x0), 0, (zn.x1 - zn.x0) * PX, H);
  }
  g.fillStyle = 'rgba(255,255,255,.55)';
  for (const [x0, z0, x1, z1] of map.ramps || []) g.fillRect(X(x0), Z(z0), (x1 - x0) * PX, (z1 - z0) * PX);
  // percorso delle montagne russe (linea viola)
  g.strokeStyle = 'rgba(180,92,255,.85)';
  g.lineWidth = PX * 0.67;
  for (const r of map.rides || []) {
    if (!r.line) continue;
    g.beginPath();
    r.line.forEach(([x, z], i) => (i ? g.lineTo(X(x), Z(z)) : g.moveTo(X(x), Z(z))));
    g.closePath();
    g.stroke();
  }
  g.fillStyle = '#26221c';
  for (const [x0, z0, x1, z1] of map.walls) g.fillRect(X(x0), Z(z0), Math.max(1.5, (x1 - x0) * PX), Math.max(1.5, (z1 - z0) * PX));
  return plan;
}

/** Cancello EXIT sulla pianta: sbarra rossa se è chiuso, verde se è aperto. */
function drawGate(g, X, Z, k) {
  g.fillStyle = exit.open ? '#47e07a' : '#ff3b30';
  g.fillRect(X(GATE.x - GATE.w / 2), Z(GATE.z) - 1.5 * k, GATE.w * (X(1) - X(0)), 3 * k);
}

/** Freccia di un giocatore: punta nella direzione in cui guarda (yaw 0 = nord). */
function arrow(g, x, y, yaw, s, fill) {
  g.save();
  g.translate(x, y);
  g.rotate(-yaw);
  g.fillStyle = fill;
  g.strokeStyle = '#1b2433';
  g.lineWidth = s * 0.25;
  g.beginPath();
  g.moveTo(0, -s); g.lineTo(s * 0.75, s * 0.85); g.lineTo(0, s * 0.4); g.lineTo(-s * 0.75, s * 0.85); g.closePath();
  g.fill(); g.stroke();
  g.restore();
}

/* ---------- Mappa grande ---------- */
let big = null, bigCtx = null, bigT = 0, bigNote = '';
export const bigmap = {
  open: false,
  toggle() { if (this.open) this.close(); else this.show(); },
  show() {
    big = big || $('bigmapCv');
    bigCtx = bigCtx || big.getContext('2d');
    this.open = true;
    bigT = 0;
    bigNote = '';
    $('bigmap').classList.remove('hidden');
  },
  close() {
    if (!this.open) return;
    this.open = false;
    $('bigmap').classList.add('hidden');
  },
  /** me = { x, z, yaw }, mates = membri della squadra (x, z, yaw, slot, down), note = riga sotto la mappa. */
  update(dt, me, mates, note) {
    if (!this.open) return;
    bigT -= dt;
    if (bigT > 0) return;
    bigT = 1 / 10;
    if (bigSeed !== map.seed || !bigPlan) { bigPlan = drawPlan(8); bigSeed = map.seed; }
    const b = map.bounds, MW = b.maxX - b.minX, MH = b.maxZ - b.minZ;
    // dimensione: la più grande che sta nello schermo con le proporzioni della mappa
    const availW = innerWidth * 0.94, availH = innerHeight * 0.8;
    const scale = Math.min(availW / MW, availH / MH);
    const cw = Math.round(MW * scale), ch = Math.round(MH * scale);
    const dpr = Math.min(2, devicePixelRatio || 1);
    if (big.width !== Math.round(cw * dpr) || big.height !== Math.round(ch * dpr)) {
      big.width = Math.round(cw * dpr); big.height = Math.round(ch * dpr);
      big.style.width = cw + 'px'; big.style.height = ch + 'px';
    }
    const k = scale * dpr, g = bigCtx;
    const X = (x) => (x - b.minX) * k, Z = (z) => (z - b.minZ) * k;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#2b2f36';
    g.fillRect(0, 0, big.width, big.height);
    g.globalAlpha = 0.95;
    g.drawImage(bigPlan, 0, 0, big.width, big.height);
    g.globalAlpha = 1;
    drawGate(g, X, Z, dpr);
    // nomi delle zone (e del cancello)
    const label = (text, x, y, size, col = '#fff') => {
      g.font = `800 ${size}px system-ui, sans-serif`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineWidth = size * 0.28; g.strokeStyle = 'rgba(10,16,26,.85)';
      g.strokeText(text, x, y);
      g.fillStyle = col;
      g.fillText(text, x, y);
    };
    const zs = Math.max(11, Math.min(22, k * 2.6));
    for (const zn of map.zones) label(zn.name, X((zn.x0 + zn.x1) / 2), Z(b.minZ) + zs * 1.2, zs);
    label('EXIT', X(GATE.x), Z(GATE.z) - zs * 0.9, zs * 0.75, exit.open ? '#7dffa6' : '#ff6b5e');
    // giocatori: compagni con il loro colore, io in bianco (sopra a tutti)
    const s = Math.max(7, Math.min(13, k * 0.9));
    for (const m of mates) {
      const col = m.down ? '#ffb627' : SLOT_COLORS[(m.slot || 0) % 4];
      arrow(g, X(m.x), Z(m.z), m.yaw || 0, s, col);
      label(playerName(m.id, m.slot || 0), X(m.x), Z(m.z) + s * 1.9, s * 1.1, col);
    }
    arrow(g, X(me.x), Z(me.z), me.yaw, s * 1.2, '#fff');
    // "N" in alto a destra
    label('↑N', big.width - zs * 1.4, zs * 1.2, zs, '#ffd54a');
    if (note !== bigNote) { bigNote = note; $('bigmapNote').innerHTML = note; }
  },
};

export const minimap = {
  /**
   * me = { x, y (piedi), z, yaw }, mates = [{ x, z, down }], eachEnemy(fn) chiama fn(x, z) per ogni nemico.
   */
  update(dt, me, mates, eachEnemy) {
    timer -= dt;
    if (timer > 0) return;
    timer = 1 / 15;
    if (!cv) { cv = $('minimap'); ctx = cv.getContext('2d'); }
    const size = cv.clientWidth;
    if (!size) return;
    const dpr = Math.min(2, devicePixelRatio || 1), S = Math.round(size * dpr);
    if (cv.width !== S) { cv.width = cv.height = S; }
    if (planSeed !== map.seed || !plan) { plan = drawPlan(3); planSeed = map.seed; }
    const k = S / 2 / RANGE, b = map.bounds;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, S, S);
    ctx.save();
    ctx.beginPath();
    ctx.arc(S / 2, S / 2, S / 2 - 1, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#2b2f36';
    ctx.fillRect(0, 0, S, S);
    // mondo → minimappa: centro sul giocatore, ruotato con lo sguardo
    ctx.translate(S / 2, S / 2);
    ctx.rotate(me.yaw);
    ctx.translate(-me.x * k, -me.z * k);
    ctx.globalAlpha = 0.92;
    ctx.drawImage(plan, b.minX * k, b.minZ * k, (b.maxX - b.minX) * k, (b.maxZ - b.minZ) * k);
    ctx.globalAlpha = 1;
    drawGate(ctx, (x) => x * k, (z) => z * k, dpr);
    const dot = (x, z, r, col) => {
      if (Math.abs(x - me.x) > RANGE * 1.5 || Math.abs(z - me.z) > RANGE * 1.5) return;
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(x * k, z * k, r * dpr, 0, Math.PI * 2);
      ctx.fill();
    };
    eachEnemy((x, z) => dot(x, z, 2.6, '#ff3b30'));
    for (const m of mates) dot(m.x, m.z, 3.4, m.down ? '#ffb627' : '#3d8bff');
    ctx.restore();
    // il giocatore: freccia al centro, sempre verso l'alto
    ctx.save();
    ctx.translate(S / 2, S / 2);
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#1b2433';
    ctx.lineWidth = 1.5 * dpr;
    ctx.beginPath();
    ctx.moveTo(0, -6 * dpr); ctx.lineTo(4.5 * dpr, 5 * dpr); ctx.lineTo(0, 2.5 * dpr); ctx.lineTo(-4.5 * dpr, 5 * dpr); ctx.closePath();
    ctx.fill(); ctx.stroke();
    // "N" sul bordo: il nord è la direzione -z del mondo
    const r = S / 2 - 8 * dpr;
    ctx.fillStyle = '#ffd54a';
    ctx.font = `bold ${10 * dpr}px system-ui, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('N', Math.sin(me.yaw) * r, -Math.cos(me.yaw) * r);
    ctx.restore();
    // nome della zona (e piano del parcheggio) in basso
    const zn = zoneAt(me.x);
    if (zn) {
      let label = zn.name;
      if (zn.id === 'parcheggio') label = `Piano ${me.y < 2.6 ? 0 : me.y < 6.1 ? 1 : 2}`;
      ctx.font = `bold ${9 * dpr}px system-ui, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const w = ctx.measureText(label).width + 10 * dpr;
      ctx.fillStyle = 'rgba(15,25,40,.7)';
      ctx.fillRect(S / 2 - w / 2, S - 17 * dpr, w, 13 * dpr);
      ctx.fillStyle = '#fff';
      ctx.fillText(label, S / 2, S - 10.5 * dpr);
    }
  },
};
