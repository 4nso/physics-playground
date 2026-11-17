// Minimappa rotonda in alto a sinistra: ruota con la visuale (in alto c'è sempre "davanti").
// La pianta della mappa si disegna una volta sola in un canvas nascosto; a ogni aggiornamento
// se ne copia solo un pezzo ruotato, quindi costa pochissimo.
import { map } from '../world/map.js';
import { TYPES, TILE } from '../world/rooms.js';

const PX = 3;        // pixel per metro nella pianta
const RANGE = 26;    // metri visibili dal centro al bordo
const $ = (id) => document.getElementById(id);

let plan = null, planSeed = -1, ctx = null, cv = null, timer = 0;

function drawPlan() {
  const b = map.bounds, W = (b.maxX - b.minX) * PX, H = (b.maxZ - b.minZ) * PX;
  plan = document.createElement('canvas');
  plan.width = W; plan.height = H;
  const g = plan.getContext('2d');
  const X = (x) => (x - b.minX) * PX, Z = (z) => (z - b.minZ) * PX;
  for (const t of map.tiles) {
    g.fillStyle = TYPES[t.type].map;
    g.fillRect(X(t.ox), Z(t.oz), TILE * PX, TILE * PX);
  }
  g.fillStyle = 'rgba(255,255,255,.28)';
  for (const [x0, z0, x1, z1] of map.decks || []) g.fillRect(X(x0), Z(z0), (x1 - x0) * PX, (z1 - z0) * PX);
  g.fillStyle = 'rgba(255,255,255,.5)';
  for (const [x0, z0, x1, z1] of map.ramps || []) g.fillRect(X(x0), Z(z0), (x1 - x0) * PX, (z1 - z0) * PX);
  g.fillStyle = '#26221c';
  for (const [x0, z0, x1, z1] of map.walls) g.fillRect(X(x0), Z(z0), Math.max(1.5, (x1 - x0) * PX), Math.max(1.5, (z1 - z0) * PX));
  planSeed = map.seed;
}

export const minimap = {
  /**
   * me = { x, z, yaw }, mates = [{ x, z, down }], eachEnemy(fn) chiama fn(x, z) per ogni nemico.
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
    if (planSeed !== map.seed || !plan) drawPlan();
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
  },
};
