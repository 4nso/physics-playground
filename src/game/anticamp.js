// Sicurezza anti-campeggio (fase 16): docs/DESIGN.md → "Correzioni e regole anti-campeggio".
// Regola: nessun punto della mappa deve rendere il giocatore irraggiungibile dai nemici.
// Ogni dispositivo controlla il SUO giocatore: se sta fermo in un punto dove gli zombi non arrivano
// (fuori dalla griglia di navigazione raggiungibile, ad esempio in cima a una pila di casse o a un oggetto
// fisso) mentre ci sono zombi vicini che non riescono a colpirlo, dopo ~4 s:
//   - se sta su una cassa (oggetto fisico) chi comanda la scuote e la spinge: la cassa cade;
//   - in ogni caso il giocatore viene sbalzato giù con una spinta leggera verso il punto raggiungibile più vicino.
// Da seduti sulle giostre non vale (lì si è irraggiungibili per scelta, e la corsa finisce).
import { player } from '../player/player.js';
import { nav, nodeAt } from '../world/nav.js';
import { inSafeZone } from '../world/map.js';
import { enemies } from '../enemies/enemies.js';
import { forEachProxyFeet } from '../net/proxies.js';
import { hud } from '../ui/hud.js';
import { thud } from '../core/audio.js';
import { devLog } from '../core/devmode.js';

const LIMIT = 4;        // secondi irraggiungibile (con zombi vicini) prima della spinta
const NEAR_H = 7;       // zombi "vicini": entro 7 m in orizzontale
const HIT_GRACE = 2.5;  // se uno zombi ti ha colpito da poco, vuol dire che ti raggiunge

export const antiCamp = { t: 0, lastHit: 99, reachable: true, fired: 0 };

/** Il giocatore locale è stato colpito da uno zombi (da game.js e net/sync.js). */
export function antiCampHit() { antiCamp.lastHit = 0; }

/** I piedi sono su un punto della griglia raggiungibile dagli zombi? */
function reachable(x, feet, z) {
  if (!nav.ready) return true;
  const n = nodeAt(x, feet, z, true);
  if (n < 0) return false;
  if (!nav.alive[n] || (!nav.gateOpen && nav.extra[n])) return false;
  return Math.abs(feet - nav.y[n]) < 0.75 && Math.hypot(nav.x[n] - x, nav.z[n] - z) < 1.3;
}

/** Punto raggiungibile più vicino, non più in alto dei piedi (dove far scendere il giocatore). */
function landing(x, feet, z) {
  const ci = Math.floor(x - nav.minX), cj = Math.floor(z - nav.minZ);
  let best = -1, bd = Infinity;
  for (let dj = -4; dj <= 4; dj++) for (let di = -4; di <= 4; di++) {
    const i = ci + di, j = cj + dj;
    if (i < 0 || j < 0 || i >= nav.cols || j >= nav.rows) continue;
    const c = j * nav.cols + i;
    for (let b = nav.colStart[c]; b < nav.colStart[c + 1]; b++) {
      if (!nav.alive[b] || nav.y[b] > feet + 0.3 || feet - nav.y[b] > 6) continue;
      const d = Math.hypot(nav.x[b] - x, nav.z[b] - z);
      if (d > 0.6 && d < bd) { bd = d; best = b; }
    }
  }
  return best;
}

let nearCount = 0, nx = 0, nz = 0;
function countNear(x, feet, z) {
  nearCount = 0; nx = 0; nz = 0;
  const add = (ex, ey, ez) => {
    if (Math.hypot(ex - x, ez - z) < NEAR_H && Math.abs(ey - feet) < 8) { nearCount++; nx += ex; nz += ez; }
  };
  if (enemies.length) for (const e of enemies) { const t = e.body.translation(); add(t.x, t.y - e.centerY, t.z); }
  else forEachProxyFeet(add);
}

/**
 * A ogni frame. playing = partita in corso e giocatore vivo; authority = da solo o host (può spingere le casse).
 */
export function updateAntiCamp(dt, playing, authority) {
  const a = antiCamp;
  a.lastHit += dt;
  if (!playing || !player.alive || player.seated || !player.body || player.shove) { a.t = 0; return; }
  const p = player.body.translation(), feet = p.y - 0.8;
  if (inSafeZone(p.x, p.z)) { a.t = 0; return; }
  a.reachable = reachable(p.x, feet, p.z);
  countNear(p.x, feet, p.z);
  if (!a.reachable && player.grounded && nearCount > 0 && a.lastHit > HIT_GRACE) a.t += dt;
  else a.t = Math.max(0, a.t - dt * 2);
  if (a.t < LIMIT) return;
  a.t = 0;
  a.fired++;

  // direzione: verso il punto raggiungibile più vicino (più in basso); se non c'è, verso gli zombi
  let dx = 0, dz = 0;
  const n = landing(p.x, feet, p.z);
  if (n >= 0) { dx = nav.x[n] - p.x; dz = nav.z[n] - p.z; }
  else if (nearCount) { dx = nx / nearCount - p.x; dz = nz / nearCount - p.z; }
  const l = Math.hypot(dx, dz);
  if (l < 0.01) { dx = Math.sin(player.yaw); dz = Math.cos(player.yaw); } else { dx /= l; dz /= l; }

  // sta su una cassa (oggetto fisico)? chi comanda la scuote e la butta giù
  const col = player.groundCol, body = col && col.parent();
  const onCrate = !!(body && body.isDynamic && body.isDynamic());
  if (onCrate && authority) {
    const m = body.mass();
    body.applyImpulse({ x: -dx * m * 3.5, y: m * 2.2, z: -dz * m * 3.5 }, true);
    body.applyTorqueImpulse({ x: (Math.random() - 0.5) * m * 2, y: (Math.random() - 0.5) * m, z: (Math.random() - 0.5) * m * 2 }, true);
  }
  // il giocatore scivola giù: spinta leggera (più forte se la cassa cade)
  const sp = onCrate ? 5 : 3.6;
  player.shove = { x: dx * sp, z: dz * sp, t: 0.45 };
  // se il punto è alla stessa altezza (ad esempio chiusi dietro un bancone) serve un saltello per scavalcare
  const hop = n >= 0 && nav.y[n] > feet - 0.4 ? 5.4 : 2.2;
  const v = player.body.linvel();
  player.body.setLinvel({ x: dx * sp, y: Math.max(v.y, hop), z: dz * sp }, true);
  player.shake = Math.max(player.shake, 0.08);
  thud(0.4, 70);
  hud.flash(onCrate ? '🧟 Gli zombi hanno scosso la cassa!' : '🧟 Gli zombi ti fanno scendere!', 1.6);
  devLog(`🧟 Anti-campeggio: spinta (${onCrate ? 'cassa' : 'oggetto fisso'}) a ${p.x.toFixed(1)}, ${feet.toFixed(1)}, ${p.z.toFixed(1)}`);
}
