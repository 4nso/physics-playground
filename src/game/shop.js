// Negozio: quando sei davanti al banco compare il pannello con armi, munizioni e potenziamenti.
// Su touch il pannello del negozio si apre col pulsante d'azione "Compra" e si compra con un tocco
// (cassa e potenziatore: il pulsante d'azione compra subito); con mouse e tastiera si preme B per
// liberare il mouse e cliccare.
// I punti (la moneta) li decide chi comanda la partita: da solo questo dispositivo, in multiplayer l'host.
// Il negozio è una zona tranquilla ma NON sicura: i nemici possono arrivare anche qui.
// Lo stesso pannello serve anche per la cassa misteriosa e il potenziatore della zona sicura
// (le "postazioni": shop, box, pap).
import * as THREE from 'three';
import { glowMat } from '../core/glow.js';
import { scene, isTouch } from '../core/renderer.js';
import { pad } from '../core/gamepad.js';
import { exitLock, requestLock } from '../core/input.js';
import { thud } from '../core/audio.js';
import { player, MAX_HEALTH } from '../player/player.js';
import { WEAPONS, UPGRADES, BOX_PRICE, PAP } from '../weapons/defs.js';
import { giveWeapon, refillWeapon, ownsWeapon, slotsFull, currentWeapon, setReloadMul, setTrigger, ownedWeapons, currentWeaponIndex, currentWeaponLevel, setWeaponLevel } from '../weapons/weapons.js';
import { boxBusy, boxHooks, upgraderFx } from './safezone.js';
import { map } from '../world/map.js';
import { net } from '../net/net.js';
import { hud } from '../ui/hud.js';

const $ = (id) => document.getElementById(id);
const NEAR = 2.8;          // distanza dal punto davanti al banco per vedere il pannello
const NEAR_MACHINE = 1.9;  // distanza per cassa misteriosa e potenziatore
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
const ITEMS_BY = { shop: ITEMS, box: [{ id: 'box' }], pap: [{ id: 'pap' }] };
const TITLES = { shop: '🛒 Negozio', box: '🎁 Cassa misteriosa', pap: '🔮 Potenziatore' };

/** Postazioni della mappa: { kind, idx, x, z, y } (punto dove si mette il giocatore). */
function stations() {
  const list = [];
  map.shops.forEach((s, idx) => list.push({ kind: 'shop', idx, x: s.x, z: s.z, y: s.y, r: NEAR }));
  map.boxes.forEach((s, idx) => list.push({ kind: 'box', idx, x: s.ux, z: s.uz, y: 0, r: NEAR_MACHINE }));
  map.upgraders.forEach((s, idx) => list.push({ kind: 'pap', idx, x: s.ux, z: s.uz, y: 0, r: NEAR_MACHINE }));
  return list;
}

/** Livelli dei potenziamenti di questo giocatore (copia locale, per prezzi e pulsanti). */
const mine = { hp: 0, reload: 0 };
export function resetShop() {
  mine.hp = mine.reload = 0;
  setReloadMul(1);
  closeShopping();
  near = null;
  touchOpen = false;
  $('shop').classList.add('hidden');
  buildSigns();
}

/** Cosa succede premendo un oggetto: { kind: 'weapon' | 'ammo' | 'up', price, label } (o null se non si può). */
function offer(it) {
  if (it.id === 'box') {
    if (near && boxBusy(near.idx)) return { kind: 'box', price: 0, done: true, label: 'Sta girando…' };
    return { kind: 'box', price: BOX_PRICE, label: 'Arma a caso' };
  }
  if (it.id === 'pap') {
    const w = WEAPONS[currentWeaponIndex()], lvl = currentWeaponLevel();
    if (lvl >= PAP.prices.length) return { kind: 'pap', price: 0, done: true, label: `${w.name}: al massimo` };
    return { kind: 'pap', price: PAP.prices[lvl], label: `${w.name} → ${'★'.repeat(lvl + 1)}` };
  }
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
 * m = membro della squadra che compra, id = oggetto, kind = 'weapon' | 'ammo' | 'up' | 'box' | 'pap'.
 * extra = { own: armi che ha in mano, wi: arma in mano } (servono a cassa e potenziatore).
 * Toglie i punti e applica gli effetti decisi dall'host (vita massima, giro della cassa).
 * Restituisce { ok: true, level } oppure { ok: false, why }. Per la cassa level = arma uscita.
 */
export function serverBuy(m, id, kind, extra = {}) {
  if (!m || m.down) return { ok: false, why: 'Sei a terra' };
  const p = m.local ? player.pos : m;
  const want = kind === 'box' ? 'box' : kind === 'pap' ? 'pap' : 'shop';
  const st = stations().find((s) => s.kind === want && Math.hypot(p.x - s.x, p.z - s.z) < HOST_NEAR && Math.abs(p.y - 1 - s.y) < 2.5);
  if (!st) return { ok: false, why: 'Sei troppo lontano' };
  if (!m.upg) m.upg = { hp: 0, reload: 0 };
  if (!m.wlv) m.wlv = {};
  let price, level = 0, boxWeapon = -1;
  if (kind === 'box') {
    if (boxBusy(st.idx)) return { ok: false, why: 'La cassa sta già girando' };
    const own = Array.isArray(extra.own) ? extra.own : [];
    const pool = WEAPONS.map((w, i) => i).filter((i) => WEAPONS[i].id !== 'pistol' && !own.includes(i));
    if (!pool.length) return { ok: false, why: 'Hai già tutto!' };
    price = BOX_PRICE;
    boxWeapon = pool[(Math.random() * pool.length) | 0];
  } else if (kind === 'pap') {
    const wi = extra.wi | 0;
    if (!WEAPONS[wi]) return { ok: false, why: '?' };
    const lvl = m.wlv[wi] || 0;
    if (lvl >= PAP.prices.length) return { ok: false, why: 'Già al massimo' };
    price = PAP.prices[lvl];
  } else if (kind === 'up') {
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
  if (kind === 'box') {
    level = boxWeapon;
    if (boxHooks.spin) boxHooks.spin(st.idx, boxWeapon, m.id); // tutti vedono la cassa girare
  }
  if (kind === 'pap') level = m.wlv[extra.wi | 0] = (m.wlv[extra.wi | 0] || 0) + 1;
  if (kind === 'up') {
    level = ++m.upg[id];
    if (id === 'hp') { m.maxHealth = MAX_HEALTH + 25 * level; m.health = Math.min(m.maxHealth, m.health + 25); }
  }
  return { ok: true, level };
}

/* ---------- Questo giocatore: effetto dell'acquisto riuscito ---------- */
export function applyBuy(id, kind, level, wi) {
  thud(0.25, 520);
  if (kind === 'box') {
    hud.flash('🎁 La cassa gira…', 1.4); // l'arma arriva alla fine dell'animazione (game/safezone.js)
  } else if (kind === 'pap') {
    setWeaponLevel(wi, level);
    upgraderFx(near && near.kind === 'pap' ? near.idx : 0);
    hud.flash(`🔮 ${WEAPONS[wi].name} potenziato!<br><small>${level === 1 ? 'Strisce viola: più danno, colpi e cadenza' : 'Livello massimo: viola e arancione!'}</small>`, 2.2);
  } else if (kind === 'up') {
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
  const extra = { own: [...ownedWeapons()], wi: currentWeaponIndex() };
  if (net.mode === 'client') {
    if (shopNet.toHost) shopNet.toHost({ t: 'buy', id: key, k: o.kind, ...extra });
    return;
  }
  const r = serverBuy(localMember && localMember(), key, o.kind, extra);
  if (r.ok) applyBuy(key, o.kind, r.level, extra.wi);
  else buyFailed(r.why);
}

/* ---------- Pannello ---------- */
let near = null, shopping = false, dirty = true, refreshT = 0, built = false, panelKind = '';
let money = 0;
let padWas = false;
let items = ITEMS;

const ITEM_LOOK = { box: ['🎁', 'Cassa misteriosa'], pap: ['🔮', "Potenzia l'arma in mano"] };
function buildPanel(kind) {
  panelKind = kind;
  items = ITEMS_BY[kind];
  $('shopTitle').textContent = TITLES[kind];
  $('shop').classList.toggle('single', items.length === 1);
  $('shopItems').innerHTML = items.map((it) => {
    const look = ITEM_LOOK[it.id];
    const icon = look ? look[0] : it.up ? UPGRADES[it.up].icon : WEAPONS[it.wi].icon;
    const name = look ? look[1] : it.up ? UPGRADES[it.up].name : WEAPONS[it.wi].name;
    return `<button data-i="${it.id}"><span class="i">${icon}</span><span class="n">${name}</span><span class="n s"></span><span class="p"></span></button>`;
  }).join('');
  if (built) return;
  built = true;
  $('shopItems').addEventListener('pointerdown', (e) => {
    const b = e.target.closest('[data-i]');
    if (!b) return;
    e.preventDefault(); e.stopPropagation();
    const it = items.find((x) => x.id === b.dataset.i);
    if (it && player.alive) buy(it);
  });
}

function refreshPanel() {
  $('shopMoney').textContent = `★ ${money}`;
  $('shopHint').textContent = pad.active
    ? (items.length === 1 ? 'B Compra' : padSel >= 0 ? '◀ ▶ Scegli · A Compra · B Chiudi' : 'B Scegli cosa comprare')
    : isTouch ? 'Tocca per comprare'
    : items.length === 1 ? 'Premi B per comprare'
    : shopping ? 'Clicca su un oggetto per comprarlo · B per tornare a giocare' : 'Premi B per scegliere col mouse';
  markPadSel();
  for (const b of $('shopItems').children) {
    const it = items.find((x) => x.id === b.dataset.i);
    const o = offer(it);
    b.querySelector('.s').textContent = o.label;
    b.querySelector('.p').textContent = o.done ? '✓' : `★ ${o.price}`;
    b.classList.toggle('done', !!o.done);
    b.classList.toggle('cant', !o.done && o.price > money);
  }
}

/* ---------- Controller: B apre la scelta, croce sceglie, A compra, B chiude ---------- */
let padSel = -1; // oggetto selezionato col controller (-1 = scelta chiusa)
function markPadSel() {
  [...$('shopItems').children].forEach((b, i) => b.classList.toggle('padSel', i === padSel));
}
/** Tasto B vicino a un banco. Restituisce false se non c'è nessun negozio qui. */
export function padShopInteract() {
  if (!near || !player.alive) return false;
  if (items.length === 1) { buy(items[0]); dirty = true; return true; }
  padSel = padSel >= 0 ? -1 : 0;
  if (padSel >= 0) setTrigger(false);
  dirty = true;
  refreshPanel();
  return true;
}
export const padShopping = () => padSel >= 0 && !!near;
export function padShopMove(d) {
  padSel = (padSel + d + items.length) % items.length;
  markPadSel();
  thud(0.06, 900);
}
export function padShopBuy() {
  if (padSel >= 0 && items[padSel] && player.alive) { buy(items[padSel]); dirty = true; }
}

/* ---------- Touch: pulsante d'azione (Compra / Chiudi, Cassa, Potenzia) ---------- */
let touchOpen = false; // pannello del negozio aperto dal pulsante d'azione
const touchUI = () => isTouch && !pad.active;
/** Cosa mostra il pulsante d'azione qui (o null se non c'è nessuna postazione). */
export function shopAction() {
  if (!near || !player.alive) return null;
  if (near.kind === 'box') return { id: 'box', icon: '🎁', label: 'Cassa', kind: 'shop' };
  if (near.kind === 'pap') return { id: 'pap', icon: '🔮', label: 'Potenzia', kind: 'shop' };
  return touchOpen ? { id: 'shopx', icon: '✕', label: 'Chiudi', kind: 'shop' } : { id: 'shop', icon: '🛒', label: 'Compra', kind: 'shop' };
}
/** Premuto il pulsante d'azione vicino a una postazione. */
export function touchShopAction() {
  if (!near || !player.alive) return;
  if (items.length === 1) { buy(items[0]); dirty = true; return; }
  touchOpen = !touchOpen;
  if (touchOpen) setTrigger(false);
  thud(0.06, touchOpen ? 900 : 600);
  showPanel();
}
function showPanel() {
  $('shop').classList.toggle('hidden', !near || (touchUI() && items.length > 1 && !touchOpen));
  dirty = true;
}

/** Mouse: B apre/chiude gli acquisti (libera il mouse per cliccare). */
export function toggleShopping() {
  if (isTouch) return;
  if (shopping) { closeShopping(); requestLock(); return; }
  if (!near || !player.alive) { hud.flash('🛒 Vai al negozio (o a una macchina) per comprare', 1.4); return; }
  // cassa misteriosa e potenziatore: un solo acquisto possibile, B compra subito
  if (items.length === 1) { buy(items[0]); dirty = true; return; }
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
  let s = null;
  if (playing && player.alive) {
    const p = player.pos;
    for (const st of stations()) {
      if (Math.hypot(p.x - st.x, p.z - st.z) < st.r && Math.abs(p.y - 0.85 - st.y) < 1.5) { s = st; break; }
    }
  }
  const key = s ? s.kind + s.idx : '';
  if (key !== (near ? near.kind + near.idx : '')) {
    near = s;
    padSel = -1;
    touchOpen = false;
    if (near && near.kind !== panelKind) buildPanel(near.kind);
    showPanel();
    if (!near && shopping) { closeShopping(); }
  }
  if (near && padWas !== pad.active) showPanel(); // passando da touch a controller e viceversa
  padWas = pad.active;
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
const signMat = glowMat(new THREE.MeshBasicMaterial({ map: signTex, color: 0xffffff }), 1.15);
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
