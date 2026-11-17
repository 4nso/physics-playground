// Negozio: quando sei davanti al banco compare il pannello con armi, munizioni e potenziamenti.
// Su touch si compra con un tocco; con mouse e tastiera si preme B per liberare il mouse e cliccare.
// I punti (la moneta) li decide chi comanda la partita: da solo questo dispositivo, in multiplayer l'host.
// Il negozio è una zona tranquilla ma NON sicura: i nemici possono arrivare anche qui.
import * as THREE from 'three';
import { scene, isTouch } from '../core/renderer.js';
import { exitLock, requestLock } from '../core/input.js';
import { thud } from '../core/audio.js';
import { player, MAX_HEALTH } from '../player/player.js';
import { WEAPONS, UPGRADES } from '../weapons/defs.js';
import { giveWeapon, refillWeapon, ownsWeapon, slotsFull, currentWeapon, setReloadMul, setTrigger } from '../weapons/weapons.js';
import { map } from '../world/map.js';
import { net } from '../net/net.js';
import { hud } from '../ui/hud.js';

const $ = (id) => document.getElementById(id);
const NEAR = 2.8;          // distanza dal punto davanti al banco per vedere il pannello
const HOST_NEAR = 4.5;     // l'host è un po' più largo (le posizioni dei client arrivano in ritardo)

/** Rete (impostato da net/sync.js): manda una richiesta d'acquisto all'host. */
export const shopNet = { toHost: null };

/* ---------- Oggetti in vendita ---------- */
// Ordine nel pannello: prima le armi (tranne la pistola, che è gratis all'inizio), poi i potenziamenti.
const ITEMS = [
  ...WEAPONS.map((w, i) => ({ id: 'w' + i, wi: i })).filter((it) => WEAPONS[it.wi].id !== 'pistol'),
  { id: 'hp', up: 'hp' },
  { id: 'reload', up: 'reload' },
];
const PISTOL = { id: 'w0', wi: 0 };

/** Livelli dei potenziamenti di questo giocatore (copia locale, per prezzi e pulsanti). */
const mine = { hp: 0, reload: 0 };
export function resetShop() {
  mine.hp = mine.reload = 0;
  setReloadMul(1);
  closeShopping();
  near = null;
  $('shop').classList.add('hidden');
  buildSigns();
}

/** Cosa succede premendo un oggetto: { kind: 'weapon' | 'ammo' | 'up', price, label } (o null se non si può). */
function offer(it) {
  if (it.up) {
    const u = UPGRADES[it.up], lvl = mine[it.up];
    if (lvl >= u.prices.length) return { kind: 'up', price: 0, done: true, label: 'Al massimo' };
    return { kind: 'up', price: u.prices[lvl], label: `Livello ${lvl + 1}/${u.prices.length}` };
  }
  const w = WEAPONS[it.wi];
  if (ownsWeapon(it.wi)) {
    if (!w.ammoPrice) return { kind: 'ammo', price: 0, done: true, label: 'Ce l\'hai' };
    return { kind: 'ammo', price: w.ammoPrice, label: 'Munizioni' };
  }
  return { kind: 'weapon', price: w.price, label: slotsFull() ? `Al posto di: ${currentWeapon().name}` : 'Nuova arma' };
}

/* ---------- Host (o da solo): decide se l'acquisto si può fare ---------- */
/**
 * m = membro della squadra che compra, id = oggetto, kind = 'weapon' | 'ammo' | 'up'.
 * Toglie i punti e applica gli effetti decisi dall'host (vita massima).
 * Restituisce { ok: true, level } oppure { ok: false, why }.
 */
export function serverBuy(m, id, kind) {
  if (!m || m.down) return { ok: false, why: 'Sei a terra' };
  const p = m.local ? player.pos : m;
  if (!map.shops.some((s) => Math.hypot(p.x - s.x, p.z - s.z) < HOST_NEAR && Math.abs(p.y - 1 - s.y) < 2.5)) {
    return { ok: false, why: 'Sei troppo lontano dal negozio' };
  }
  if (!m.upg) m.upg = { hp: 0, reload: 0 };
  let price;
  if (kind === 'up') {
    const u = UPGRADES[id];
    if (!u || m.upg[id] >= u.prices.length) return { ok: false, why: 'Già al massimo' };
    price = u.prices[m.upg[id]];
  } else {
    const w = WEAPONS[+String(id).slice(1)];
    if (!w || String(id)[0] !== 'w') return { ok: false, why: '?' };
    price = kind === 'ammo' ? w.ammoPrice : w.price;
    if (!price) return { ok: false, why: '?' };
  }
  if ((m.money || 0) < price) return { ok: false, why: `Servono ${price} punti` };
  m.money -= price;
  let level = 0;
  if (kind === 'up') {
    level = ++m.upg[id];
    if (id === 'hp') { m.maxHealth = MAX_HEALTH + 25 * level; m.health = Math.min(m.maxHealth, m.health + 25); }
  }
  return { ok: true, level };
}

/* ---------- Questo giocatore: effetto dell'acquisto riuscito ---------- */
export function applyBuy(id, kind, level) {
  thud(0.25, 520);
  if (kind === 'up') {
    mine[id] = level;
    if (id === 'reload') setReloadMul(UPGRADES.reload.mul[level]);
    hud.flash(id === 'hp' ? `❤️ Vita massima +25!` : `⏱️ Ricarica più veloce!`, 1.6);
  } else {
    const wi = +String(id).slice(1);
    if (kind === 'ammo') { refillWeapon(wi); hud.flash(`📦 Munizioni: ${WEAPONS[wi].name}`, 1.4); }
    else {
      const replaced = giveWeapon(wi);
      if (replaced) hud.flash(`${WEAPONS[wi].icon} ${WEAPONS[wi].name}!<br><small>Hai lasciato: ${replaced}</small>`, 2);
    }
  }
  dirty = true;
}
export function buyFailed(why) {
  hud.flash(`❌ ${why}`, 1.4);
  thud(0.15, 120);
}

/** Premuto un oggetto nel pannello. */
let localMember = null;
export function setShopMember(fn) { localMember = fn; }
function buy(it) {
  const o = offer(it);
  if (!o || o.done) return;
  const key = it.up || it.id;
  if (net.mode === 'client') {
    if (shopNet.toHost) shopNet.toHost({ t: 'buy', id: key, k: o.kind });
    return;
  }
  const r = serverBuy(localMember && localMember(), key, o.kind);
  if (r.ok) applyBuy(key, o.kind, r.level);
  else buyFailed(r.why);
}

/* ---------- Pannello ---------- */
let near = null, shopping = false, dirty = true, refreshT = 0, built = false;
let money = 0;

function buildPanel() {
  built = true;
  $('shopItems').innerHTML = ITEMS.map((it) => {
    const icon = it.up ? UPGRADES[it.up].icon : WEAPONS[it.wi].icon;
    const name = it.up ? UPGRADES[it.up].name : WEAPONS[it.wi].name;
    return `<button data-i="${it.id}"><span class="i">${icon}</span><span class="n">${name}</span><span class="n s"></span><span class="p"></span></button>`;
  }).join('');
  $('shopItems').addEventListener('pointerdown', (e) => {
    const b = e.target.closest('[data-i]');
    if (!b) return;
    e.preventDefault(); e.stopPropagation();
    const it = ITEMS.find((x) => x.id === b.dataset.i);
    if (it && player.alive) buy(it);
  });
}

function refreshPanel() {
  $('shopMoney').textContent = `★ ${money}`;
  $('shopHint').textContent = isTouch ? 'Tocca per comprare' : shopping ? 'Clicca per comprare · B per tornare a giocare' : 'Premi B per comprare';
  for (const b of $('shopItems').children) {
    const it = ITEMS.find((x) => x.id === b.dataset.i);
    const o = offer(it);
    b.querySelector('.s').textContent = o.label;
    b.querySelector('.p').textContent = o.done ? '✓' : `★ ${o.price}`;
    b.classList.toggle('done', !!o.done);
    b.classList.toggle('cant', !o.done && o.price > money);
  }
}

/** Mouse: B apre/chiude gli acquisti (libera il mouse per cliccare). */
export function toggleShopping() {
  if (isTouch) return;
  if (shopping) { closeShopping(); requestLock(); return; }
  if (!near || !player.alive) { hud.flash('🛒 Vai al negozio per comprare', 1.4); return; }
  shopping = true;
  setTrigger(false);
  exitLock();
  dirty = true;
}
/** Chiude gli acquisti; restituisce true se erano aperti (così Esc non mette in pausa). */
export function closeShopping() {
  if (!shopping) return false;
  shopping = false;
  dirty = true;
  return true;
}
export const isShopping = () => shopping;

/** A ogni frame: il pannello compare quando sei davanti al banco. myMoney = punti di questo giocatore. */
export function updateShop(dt, playing, myMoney) {
  if (!built) buildPanel();
  let s = null;
  if (playing && player.alive) {
    const p = player.pos;
    for (const sh of map.shops) {
      if (Math.hypot(p.x - sh.x, p.z - sh.z) < NEAR && Math.abs(p.y - 0.85 - sh.y) < 1.5) { s = sh; break; }
    }
  }
  if (s !== near) {
    near = s;
    $('shop').classList.toggle('hidden', !near);
    if (!near && shopping) { closeShopping(); }
    dirty = true;
  }
  if (myMoney !== money) { money = myMoney; dirty = true; }
  refreshT -= dt;
  if (near && (dirty || refreshT <= 0)) { refreshPanel(); dirty = false; refreshT = 0.3; }
  updateSigns(dt);
}

/* ---------- Insegna luminosa "NEGOZIO" (scritta sopra il banco) ---------- */
const signTex = (() => {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#ffcf3a'; g.fillRect(0, 0, 512, 128);
  g.fillStyle = '#c0392b'; g.font = 'bold 84px system-ui, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('NEGOZIO', 256, 70);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
})();
const signMat = new THREE.MeshBasicMaterial({ map: signTex, color: 0xffffff });
const signGeo = new THREE.PlaneGeometry(4.6, 1.0);
let signs = [], signT = 0;
function buildSigns() {
  for (const m of signs) scene.remove(m);
  signs = map.shops.map((s) => {
    const m = new THREE.Mesh(signGeo, signMat);
    m.position.set(s.signX + s.fx * 0.04, s.signY, s.signZ + s.fz * 0.04);
    m.rotation.y = Math.atan2(s.fx, s.fz);
    scene.add(m);
    return m;
  });
}
function updateSigns(dt) {
  // l'insegna "pulsa" piano, come un neon
  signT += dt;
  const k = 0.85 + 0.15 * Math.sin(signT * 3);
  signMat.color.setScalar(k);
}


// Se il mouse torna a muovere la visuale (clic sul gioco), gli acquisti si chiudono.
document.addEventListener('pointerlockchange', () => { if (document.pointerLockElement && shopping) closeShopping(); });
