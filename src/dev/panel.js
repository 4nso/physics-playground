// Modalità sviluppatore: pulsante 🛠 trascinabile e pannello a schede (docs/DESIGN.md → fase 14).
// Questo file si scarica solo quando la modalità si attiva (vedi core/devmode.js).
// I comandi usano le stesse funzioni del gioco (round, negozio, armi), così si prova la logica vera.
// Solo chi gioca da solo o fa da host: sui client la modalità si spegne da sola.
import * as THREE from 'three';
import './panel.css';
import { dev, devHooks, setDevMode } from '../core/devmode.js';
import { camera } from '../core/renderer.js';
import { requestLock, exitLock, input } from '../core/input.js';
import { pad } from '../core/gamepad.js';
import { initAudio } from '../core/audio.js';
import { castWorld } from '../world/raycast.js';
import { map } from '../world/map.js';
import { nav, nodeAt } from '../world/nav.js';
import { player, teleportPlayer, MAX_HEALTH } from '../player/player.js';
import { enemies, spawnEnemy, removeAllEnemies } from '../enemies/enemies.js';
import { roundConfig, MAX_ROUNDS } from '../game/difficulty.js';
import { game, team, localMember, devGoToRound, announce } from '../game/game.js';
import { resetHealLimit } from '../game/shop.js';
import { WEAPONS } from '../weapons/defs.js';
import { giveWeapon, setWeaponLevel, currentWeaponIndex, weaponLevel, refillOwned } from '../weapons/weapons.js';
import { startMatch } from '../net/sync.js';
import { net, broadcast } from '../net/net.js';
import { hud } from '../ui/hud.js';

const $ = (id) => document.getElementById(id);
const esc = (t) => String(t).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignora */ } },
};

/* ---------- Stato del pannello ---------- */
const ui = {
  built: false,
  tab: store.get('syf-dev-tab', 'partita'),
  spawnKind: 'base',
  spawnN: 5,
  roundN: 10,
  infoT: 0,
};
const urlRound = (() => { const v = parseInt(new URLSearchParams(location.search).get('round'), 10); return v > 0 ? v : 0; })();
let urlRoundDone = false;

const TABS = [['partita', '🎮 Partita'], ['giocatore', '🙂 Giocatore'], ['armi', '🔫 Armi']];
const KINDS = [['base', 'Base'], ['fast', 'Rosso'], ['big', 'Grosso'], ['armored', 'Corazzato'], ['boss', 'Boss']];
const TIMES = [0.25, 0.5, 1, 2];
const SPEEDS = [1, 2, 4];

/* ---------- Avvio e spegnimento ---------- */
export function startDev() {
  build();
  dev.on = true;
  devHooks.tick = tick;
  devHooks.shutdown = shutdown;
  devHooks.toggle = togglePanel;
  refresh();
}

function shutdown() {
  closePanel(false);
  Object.assign(dev, { on: false, freeze: false, god: false, infAmmo: false, noReload: false, fly: false, speedMul: 1, timeScale: 1, rigBox: -1, stallOpen: false, dayOverride: null, seed: 0 });
  if (ui.built) $('devBtn').classList.add('hidden');
  $('pauseDev').classList.add('hidden');
}

/* ---------- Costruzione (una volta sola) ---------- */
function build() {
  if (ui.built) return;
  ui.built = true;
  const btn = document.createElement('button');
  btn.id = 'devBtn';
  btn.className = 'devUI hidden';
  btn.textContent = '🛠';
  btn.title = 'Modalità sviluppatore (tasto \\ o `)';
  btn.setAttribute('aria-label', 'Pannello sviluppatore');
  document.body.appendChild(btn);
  dragButton(btn);

  const p = document.createElement('div');
  p.id = 'devPanel';
  p.className = 'devUI hidden';
  p.innerHTML = `
    <div class="dvHead"><b>🛠 Sviluppatore</b><span id="dvInfo"></span><button id="dvClose" title="Riduci a icona" aria-label="Riduci a icona">—</button></div>
    <div class="dvTabs">${TABS.map(([id, label]) => `<button data-tab="${id}">${label}</button>`).join('')}</div>
    <div id="dvBody"></div>`;
  document.body.appendChild(p);
  $('dvClose').onclick = () => closePanel(true);
  p.querySelector('.dvTabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]');
    if (!b) return;
    ui.tab = b.dataset.tab;
    store.set('syf-dev-tab', ui.tab);
    renderTab();
  });
  // un solo gestore per tutti i pulsanti della scheda: data-a = azione, data-v = valore
  $('dvBody').addEventListener('click', (e) => {
    const b = e.target.closest('[data-a]');
    if (!b) return;
    initAudio();
    run(b.dataset.a, b.dataset.v);
    refresh();
  });
  $('dvBody').addEventListener('input', (e) => {
    if (e.target.id !== 'dvDay') return;
    dev.dayOverride = +e.target.value; // niente refresh: si rovinerebbe il trascinamento del cursore
    const auto = document.querySelector('#dvBody [data-a="dayAuto"]');
    if (auto) auto.classList.remove('on');
  });

  // tastiera: \ (o `) apre e chiude il pannello
  addEventListener('keydown', (e) => {
    if (e.code !== 'Backquote' && e.code !== 'Backslash' && e.code !== 'IntlBackslash') return;
    if (!dev.on || e.repeat || e.target instanceof HTMLInputElement) return;
    togglePanel();
  });
  // menu di pausa (anche col controller): apre il pannello e riprende la partita
  $('pauseDev').onclick = () => {
    if (game.state === 'paused') game.state = 'playing';
    game.overlay = false;
    hud.hide('pause');
    input.enabled = true;
    openPanel();
  };
}

/** Il pulsante 🛠 si trascina dove dà meno fastidio; un tocco apre/chiude il pannello. */
function dragButton(btn) {
  const pos = store.get('syf-dev-btn', null);
  const place = (x, y) => {
    x = Math.max(4, Math.min(innerWidth - 48, x));
    y = Math.max(4, Math.min(innerHeight - 48, y));
    btn.style.left = x + 'px';
    btn.style.top = y + 'px';
    return { x, y };
  };
  if (pos) place(pos.x, pos.y);
  addEventListener('resize', () => { const r = btn.getBoundingClientRect(); if (r.width) place(r.left, r.top); });
  let drag = null;
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault(); e.stopPropagation();
    const r = btn.getBoundingClientRect();
    drag = { id: e.pointerId, dx: e.clientX - r.left, dy: e.clientY - r.top, x0: e.clientX, y0: e.clientY, moved: false };
    try { btn.setPointerCapture(e.pointerId); } catch (err) { /* ignora */ }
  });
  btn.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 8) return;
    drag.moved = true;
    drag.at = place(e.clientX - drag.dx, e.clientY - drag.dy);
  });
  const end = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    if (drag.moved) store.set('syf-dev-btn', drag.at);
    else if (e.type === 'pointerup') togglePanel();
    drag = null;
  };
  btn.addEventListener('pointerup', end);
  btn.addEventListener('pointercancel', end);
  // col controller o la tastiera il pulsante si "clicca"
  btn.addEventListener('click', (e) => { if (e.detail === 0) togglePanel(); });
}

/* ---------- Apri / chiudi ---------- */
function openPanel() {
  if (!dev.on || net.mode === 'client') return;
  dev.panelOpen = true; // prima di liberare il mouse: così il gioco non va in pausa
  exitLock();
  $('devPanel').classList.remove('hidden');
  renderTab();
}
function closePanel(relock) {
  if (!ui.built) return;
  const was = dev.panelOpen;
  dev.panelOpen = false;
  $('devPanel').classList.add('hidden');
  if (relock && was && game.state === 'playing' && !pad.active) requestLock();
}
function togglePanel() {
  if (dev.panelOpen) closePanel(true); else openPanel();
}

/* ---------- Ogni frame (solo con la modalità attiva) ---------- */
function tick(dt) {
  // i client della stanza non possono usarla: si spegne da sola
  if (net.mode === 'client') {
    setDevMode(false);
    hud.flash('🛠 Modalità sviluppatore spenta: la può usare solo l\'host', 2.4);
    return;
  }
  const inGame = game.state !== 'menu';
  if (game.state === 'playing') game.devUsed = true; // partita di test: etichetta DEV e niente record
  $('devBtn').classList.toggle('hidden', !inGame);
  $('pauseDev').classList.toggle('hidden', !inGame);
  if (!inGame && dev.panelOpen) closePanel(false);
  // ?round=N con ?dev: la partita parte da quel round
  if (urlRound && !urlRoundDone && game.state === 'playing' && game.round === 0) {
    urlRoundDone = true;
    devGoToRound(urlRound);
  }
  if (game.state === 'menu') urlRoundDone = false;
  ui.infoT -= dt;
  if (dev.panelOpen && ui.infoT <= 0) { ui.infoT = 0.4; refreshInfo(); }
}

function refreshInfo() {
  const me = localMember();
  $('dvInfo').textContent = `R${Math.max(0, game.round)} · 👾${enemies.length + (game.toSpawn || 0)} · ★${me ? me.money || 0 : 0} · mappa ${map.seed}`;
}

/* ---------- Schede ---------- */
const btn = (a, v, label, on = false, cls = '') => `<button data-a="${a}"${v !== undefined ? ` data-v="${esc(v)}"` : ''} class="${on ? 'on ' : ''}${cls}">${label}</button>`;
const row = (title, html, note = '') => `<div class="dvRow"><span class="dvT">${title}</span><div class="dvBtns">${html}</div>${note ? `<small>${note}</small>` : ''}</div>`;

function renderTab() {
  if (!ui.built) return;
  for (const b of document.querySelectorAll('#devPanel [data-tab]')) b.classList.toggle('on', b.dataset.tab === ui.tab);
  const body = $('dvBody');
  if (ui.tab === 'giocatore') body.innerHTML = tabPlayer();
  else if (ui.tab === 'armi') body.innerHTML = tabWeapons();
  else body.innerHTML = tabGame();
  refreshInfo();
}
/** Dopo un comando: stessa scheda, valori aggiornati (senza perdere la selezione del controller). */
function refresh() {
  if (!dev.panelOpen) return;
  const focused = document.querySelector('#dvBody .padFocus');
  const key = focused ? [focused.dataset.a, focused.dataset.v] : null;
  renderTab();
  if (key) {
    const el = [...document.querySelectorAll('#dvBody [data-a]')].find((b) => b.dataset.a === key[0] && b.dataset.v === key[1]);
    if (el) el.classList.add('padFocus'); // il controller ritrova la sua selezione al prossimo frame
  }
}

function tabGame() {
  const day = dev.dayOverride;
  return [
    row('Zombi', btn('freeze', undefined, dev.freeze ? '⏸ Fermi' : '⏸ Ferma zombi', dev.freeze) + btn('killall', undefined, '💥 Elimina tutti'), 'Elimina tutti: senza punti'),
    row(`Round (ora ${Math.max(0, game.round)}/${MAX_ROUNDS})`, btn('nextRound', undefined, '⏭ Successivo') + btn('restartRound', undefined, '↺ Ricomincia')
      + btn('roundN', -5, '−5') + btn('roundN', -1, '−1') + `<b class="dvVal">${ui.roundN}</b>` + btn('roundN', 1, '+1') + btn('roundN', 5, '+5') + btn('goRound', undefined, `Vai al ${ui.roundN}`, false, 'primary')),
    row('Crea nemici', KINDS.map(([k, l]) => btn('spawnKind', k, l, ui.spawnKind === k)).join('')
      + '<i class="dvBr"></i>' + [1, 3, 5, 10, 20].map((n) => btn('spawnN', n, `×${n}`, ui.spawnN === n)).join('')
      + '<i class="dvBr"></i>' + btn('spawn', 'front', '➕ Davanti a me', false, 'primary') + btn('spawn', 'look', '🎯 Dove guardo', false, 'primary')),
    row('Velocità del tempo', TIMES.map((t) => btn('time', t, `×${String(t).replace('.', ',')}`, dev.timeScale === t)).join('')),
    row(`Ora del giorno ${day === null ? '(segue i round)' : day < 0.25 ? '(giorno)' : day < 0.6 ? '(tramonto)' : '(notte)'}`,
      `<input id="dvDay" type="range" min="0" max="1" step="0.05" value="${day === null ? 0 : day}">` + btn('dayAuto', undefined, 'Automatica', day === null)),
    row(`Mappa (ora n. ${map.seed})`, btn('newMap', 'random', '🎲 Nuova mappa casuale') + btn('newMap', 'ask', '🔢 Scegli il seed…') + btn('newMap', 'same', '↺ Stessa mappa'), 'Ricomincia la partita (in multiplayer per tutti)'),
    row('Scorciatoie nell\'indirizzo', '', '<code>?dev</code> modalità sviluppatore · <code>?dev&amp;round=10</code> parti dal round 10 · <code>?seed=123</code> mappa · <code>?ora=0.8</code> ora del giorno · <code>?prof</code> tempi per parte · <code>?peer=host:porta</code> server di prova'),
    row('', btn('off', undefined, '⏻ Spegni la modalità sviluppatore', false, 'danger')),
  ].join('');
}

function tabPlayer() {
  const me = localMember();
  const money = me ? me.money || 0 : 0;
  return [
    row(`Soldi (★ ${money})`, btn('money', 1000, '+1000') + btn('money', 10000, '+10 000') + btn('moneySet', undefined, 'Imposta…')),
    row(`Vita (${me ? Math.round(me.health) : 0}/${me ? me.maxHealth || MAX_HEALTH : MAX_HEALTH})`, btn('heal', undefined, '❤️ Vita piena') + btn('god', undefined, dev.god ? '🛡 Invincibile' : '🛡 Invincibile: no', dev.god)),
    row('Munizioni', btn('infAmmo', undefined, '∞ Munizioni infinite', dev.infAmmo) + btn('noReload', undefined, '⚡ Niente ricarica', dev.noReload)),
    row('Movimento', btn('fly', undefined, dev.fly ? '🕊 Volo libero: sì' : '🕊 Volo libero', dev.fly) + SPEEDS.map((s) => btn('speed', s, `×${s}`, dev.speedMul === s)).join(''),
      'In volo vai dove guardi (guarda in alto per salire) · tastiera: Spazio sale, C scende · attraversi i muri'),
    row('Teletrasporto', DESTS.map(([id, label]) => btn('tp', id, label)).join('')),
    team.size > 1 ? row('', '', 'Per ora i comandi valgono solo per te (gli altri giocatori: nel passo 2).') : '',
  ].join('');
}

function tabWeapons() {
  const wi = currentWeaponIndex(), lvl = weaponLevel(wi);
  return [
    row('Prendi un\'arma', WEAPONS.map((w, i) => btn('give', i, `${w.icon} ${esc(w.name)}`, wi === i)).join('')),
    row(`Potenziamento di ${WEAPONS[wi].icon} ${esc(WEAPONS[wi].name)}`, [0, 1, 2].map((l) => btn('level', l, l ? '★'.repeat(l) : 'Base', lvl === l)).join('') + btn('refill', undefined, '📦 Munizioni piene')),
    row('🎁 Cassa misteriosa truccata', btn('rig', -1, 'A caso', dev.rigBox < 0) + WEAPONS.map((w, i) => btn('rig', i, w.icon, dev.rigBox === i)).join(''),
      dev.rigBox >= 0 ? `La prossima estrazione dà: ${WEAPONS[dev.rigBox].icon} ${esc(WEAPONS[dev.rigBox].name)}` : 'La prossima estrazione è normale'),
    row('Negozio', btn('stall', undefined, dev.stallOpen ? '📦 Bancarella aperta' : '📦 Apri la bancarella munizioni', dev.stallOpen) + btn('healReset', undefined, '💊 Azzera il limite della cura')),
  ].join('');
}

/* ---------- Comandi ---------- */
const needGame = () => {
  if (game.state === 'playing') return true;
  hud.flash('🛠 Prima inizia una partita', 1.4);
  return false;
};

function run(a, v) {
  const me = localMember();
  switch (a) {
    /* Partita */
    case 'freeze': dev.freeze = !dev.freeze; break;
    case 'killall': if (needGame()) killAll(); break;
    case 'nextRound': if (needGame()) { killAll(); devGoToRound(game.round + 1); } break;
    case 'restartRound': if (needGame()) { killAll(); devGoToRound(Math.max(1, game.round)); } break;
    case 'roundN': ui.roundN = Math.max(1, Math.min(MAX_ROUNDS, ui.roundN + +v)); break;
    case 'goRound': if (needGame()) { killAll(); devGoToRound(ui.roundN); } break;
    case 'spawnKind': ui.spawnKind = v; break;
    case 'spawnN': ui.spawnN = +v; break;
    case 'spawn': if (needGame()) spawnHere(v === 'look'); break;
    case 'time': dev.timeScale = +v; break;
    case 'dayAuto': dev.dayOverride = null; break;
    case 'newMap': newMap(v); break;
    case 'off': setDevMode(false); hud.flash('🛠 Modalità sviluppatore spenta', 1.6); break;
    /* Giocatore */
    case 'money': if (me) me.money = (me.money || 0) + +v; break;
    case 'moneySet': {
      if (!me) break;
      const s = prompt('Quanti punti vuoi avere?', String(me.money || 0));
      const n = parseInt(String(s || '').replace(/\D/g, ''), 10);
      if (n >= 0) me.money = Math.min(1e7, n);
      break;
    }
    case 'heal': if (me && needGame()) healMember(me); break;
    case 'god': dev.god = !dev.god; break;
    case 'infAmmo': dev.infAmmo = !dev.infAmmo; if (dev.infAmmo) refillOwned(); break;
    case 'noReload': dev.noReload = !dev.noReload; if (dev.noReload) refillOwned(); break;
    case 'fly': dev.fly = !dev.fly; break;
    case 'speed': dev.speedMul = +v; break;
    case 'tp': if (needGame()) teleport(v); break;
    /* Armi */
    case 'give': if (needGame()) giveWeapon(+v); break;
    case 'level': {
      const wi = currentWeaponIndex();
      setWeaponLevel(wi, +v);
      if (me) { if (!me.wlv) me.wlv = {}; me.wlv[wi] = +v; } // l'host usa questo livello per i danni
      break;
    }
    case 'refill': refillOwned(); hud.flash('📦 Munizioni piene', 1.2); break;
    case 'rig': dev.rigBox = +v; break;
    case 'stall': dev.stallOpen = !dev.stallOpen; break;
    case 'healReset': resetHealLimit(me); hud.flash('💊 La cura si può riusare', 1.2); break;
  }
}

/** Elimina tutti i nemici senza punti (in multiplayer si sbriciolano anche dagli altri). */
function killAll() {
  removeAllEnemies((e) => {
    if (net.mode === 'host') broadcast({ t: 'kill', id: e.id, dx: 0, dz: 1, f: 3 });
  });
}

function healMember(m) {
  m.health = m.maxHealth || MAX_HEALTH;
  m.down = false;
  m.reviveT = 0;
  if (game.phase === 'dead') game.phase = 'fight'; // tutti a terra: la partita non finisce più
}

/* ---------- Nemici davanti a me o dove guardo ---------- */
const o = new THREE.Vector3(), d = new THREE.Vector3();
function spawnHere(look) {
  let x, z, feet = player.pos.y - 0.85;
  const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);
  if (look) {
    camera.getWorldPosition(o);
    camera.getWorldDirection(d);
    const hit = castWorld(o, d, 90);
    const p = hit ? hit.point : o.clone().addScaledVector(d, 25);
    // un passo indietro dal punto colpito (non dentro il muro)
    x = p.x - d.x * 0.8; z = p.z - d.z * 0.8; feet = p.y + 0.1;
  } else {
    x = player.pos.x + fx * 4; z = player.pos.z + fz * 4;
  }
  const cfg = game.cfg || roundConfig(Math.max(1, game.round), team.size);
  const opts = { ...cfg, round: Math.max(1, game.round) };
  for (let i = 0; i < ui.spawnN; i++) {
    // a spirale intorno al punto scelto, così non nascono uno dentro l'altro
    const r = i ? 0.9 * Math.sqrt(i) : 0, ang = i * 2.4;
    const px = x + Math.cos(ang) * r, pz = z + Math.sin(ang) * r;
    const n = nodeAt(px, feet, pz, true);
    const at = n >= 0 ? { x: nav.x[n], y: nav.y[n], z: nav.z[n] } : { x: px, y: feet, z: pz };
    spawnEnemy(ui.spawnKind, opts, at);
  }
  if (ui.spawnKind === 'boss') announce('👹 Arriva il boss! <small>(sviluppatore)</small>', 1.8);
}

/* ---------- Teletrasporto ---------- */
const DESTS = [
  ['shop', '🛒 Negozio'], ['stall', '📦 Bancarella'], ['safe', '🛡️ Zona sicura'], ['box', '🎁 Cassa'], ['pap', '🔮 Potenziatore'],
  ['wheel', '🎡 Ruota'], ['coaster', '🎢 Montagne russe'], ['backrooms', '🟨 Backrooms'], ['parking', '🅿️ Parcheggio'], ['spawn', '🚩 Partenza'],
];
/** Il punto calpestabile più vicino a (x, z), all'altezza più simile a yHint. */
function groundAt(x, z, yHint = 0) {
  let best = -1, bs = Infinity;
  for (let i = 0; i < nav.count; i++) {
    const s = (nav.x[i] - x) ** 2 + (nav.z[i] - z) ** 2 + (nav.y[i] - yHint) ** 2 * 4;
    if (s < bs) { bs = s; best = i; }
  }
  return best >= 0 ? { x: nav.x[best], y: nav.y[best], z: nav.z[best] } : { x, y: yHint, z };
}
function zoneCenter(id) {
  const zn = map.zones.find((z) => z.id === id);
  return zn ? groundAt((zn.x0 + zn.x1) / 2, (map.bounds.minZ + map.bounds.maxZ) / 2, 0) : null;
}
function teleport(id) {
  let p = null, yaw;
  const ride = (k) => (map.rides || []).find((r) => r.kind === k);
  if (id === 'shop' && map.shops[0]) { const s = map.shops[0]; p = { x: s.x, y: s.y, z: s.z }; }
  else if (id === 'stall' && map.ammoStalls[0]) { const s = map.ammoStalls[0]; p = groundAt(s.ux, s.uz); }
  else if (id === 'safe' && map.safeZones[0]) { const s = map.safeZones[0]; p = groundAt((s.x0 + s.x1) / 2, (s.z0 + s.z1) / 2); }
  else if (id === 'box' && map.boxes[0]) { const s = map.boxes[0]; p = groundAt(s.ux, s.uz); }
  else if (id === 'pap' && map.upgraders[0]) { const s = map.upgraders[0]; p = groundAt(s.ux, s.uz); }
  else if ((id === 'wheel' || id === 'coaster') && ride(id)) { const c = ride(id).ctrl; p = groundAt(c.x, c.z); }
  else if (id === 'backrooms') p = zoneCenter('backrooms');
  else if (id === 'parking') p = zoneCenter('parcheggio');
  else if (id === 'spawn') { p = map.spawn; yaw = map.spawn.yaw || 0; }
  if (!p) { hud.flash('🛠 Non c\'è in questa mappa', 1.4); return; }
  teleportPlayer(p.x, p.y, p.z, yaw);
  const label = (DESTS.find((x) => x[0] === id) || [])[1] || '';
  hud.flash(`🛠 ${label}`, 1);
}

/* ---------- Nuova mappa ---------- */
function newMap(how) {
  if (game.state === 'menu') { hud.flash('🛠 Prima inizia una partita', 1.4); return; }
  if (how === 'ask') {
    const s = prompt('Numero della mappa (seed):', String(map.seed));
    const n = parseInt(String(s || '').replace(/\D/g, ''), 10);
    if (!(n > 0)) return;
    dev.seed = n;
  } else if (how === 'same') dev.seed = map.seed;
  else dev.seed = 0; // casuale
  closePanel(false);
  startMatch();
}
