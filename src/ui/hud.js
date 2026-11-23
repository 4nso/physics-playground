// HUD: round, nemici, punteggio, vita, mirino, arma, messaggi e schermate.
import { hitTick } from '../core/audio.js';
import { MAX_ROUNDS } from '../game/difficulty.js';
import { isTouch } from '../core/renderer.js';
import { onSettings } from './settings.js';
import { rumble } from '../core/rumble.js';

const $ = (id) => document.getElementById(id);
let msgTimer = 0, hurtT = 0, markT = 0;
let lastGap = -1;
let slotsKey = '';
let actId = '';
const last = {};
const setText = (id, text) => { if (last[id] !== text) { $(id).textContent = text; last[id] = text; } };

// Su touch solo l'icona (pillola compatta), su desktop anche il tasto numerico.
const slotLabel = (i, icon) => (isTouch ? icon : `${i + 1} ${icon}`);

/**
 * Pulsanti touch ad arco nell'angolo in basso a destra: "Spara" nell'angolo (il più grande),
 * gli altri intorno a lui alla stessa distanza, così il pollice li raggiunge ruotando:
 * Salta a sinistra, Ricarica in diagonale, il pulsante d'azione sopra Spara, Mirino al secondo giro.
 * La dimensione dipende dallo schermo e dall'impostazione "Dimensione dei pulsanti".
 */
let btnScale = 1;
function layoutButtons(scale = btnScale) {
  btnScale = scale;
  const short = Math.min(innerWidth, innerHeight);
  const F = Math.round(Math.max(72, Math.min(104, short * 0.22)) * scale); // diametro di "Spara"
  const gap = Math.round(9 * scale);
  const c = F / 2; // centro di "Spara" rispetto all'angolo
  const place = (id, d, deg, extra = 0) => {
    const el = $(id), a = (deg * Math.PI) / 180, r = c + gap + d / 2 + extra;
    Object.assign(el.style, {
      width: d + 'px', height: d + 'px',
      right: Math.round(c - r * Math.cos(a) - d / 2) + 'px',
      bottom: Math.round(c + r * Math.sin(a) - d / 2) + 'px',
    });
  };
  Object.assign($('bFire').style, { width: F + 'px', height: F + 'px', right: '0px', bottom: '0px' });
  place('bJump', Math.round(F * 0.7), 180);
  place('bReload', Math.round(F * 0.6), 138);
  place('bAct', Math.round(F * 0.7), 84); // pulsante d'azione: sopra "Spara", compare solo se serve
  place('bZoom', Math.round(F * 0.6), 128, Math.round(F * 0.6) + gap); // secondo giro, sopra "Ricarica"
  // il pannello del negozio sta subito a sinistra dei pulsanti, sotto il pollice destro
  document.documentElement.style.setProperty('--arc', Math.round(F * 1.75 + gap * 2 + 6) + 'px');
  document.documentElement.style.setProperty('--bs', scale);
}

const HOWTO_TOUCH = "<li><b>Pollice sinistro</b>: muoviti · <b>trascina a destra</b>: guarda</li><li><b>Spara</b>: tienilo premuto e trascina il dito per mirare</li><li>Tocca le <b>icone delle armi</b> in alto a destra per cambiarla · <b>⟳</b> ricarica</li><li>Spingi il joystick <b>oltre il bordo</b> per correre</li><li>Mira alla <b>testa</b>: danno doppio!</li><li>Il <b>pulsante d'azione</b> sopra Spara compare solo quando serve: <b>🛒 Compra</b> al negozio, <b>Sali/Scendi</b> sulle giostre, <b>✋ Afferra</b> e <b>Lancia</b> le casse</li><li>Cecchino: <b>🔭 Mirino</b> per lo zoom</li>";
const HOWTO_DESK = "<li><b>WASD</b> muovi · <b>Mouse</b> mira · <b>Shift</b> corri · <b>Spazio</b> salta</li><li><b>Clic</b> spara · <b>1/2/3</b> o <b>rotella</b> cambia arma · <b>R</b> ricarica</li><li><b>E</b>: afferra una cassa, poi <b>clic</b> per lanciarla sui nemici</li><li>Mira alla <b>testa</b>: danno doppio! · <b>Esc</b> pausa</li><li>Con i punti compra armi e potenziamenti al <b>🛒 negozio</b> davanti alla partenza: avvicinati al banco e premi <b>B</b></li><li>Cecchino: <b>tasto destro</b> o <b>Q</b> per il mirino</li>";
const HOWTO_PAD = "<li><b>Levetta sinistra</b> muovi (premila per correre) · <b>levetta destra</b> guarda</li><li><b>RT</b> spara · <b>LT</b> mirino · <b>A</b> salta · <b>X</b> ricarica</li><li><b>Y</b>, <b>LB</b>/<b>RB</b> o la <b>croce</b> cambiano arma</li><li><b>B</b>: compra al 🛒 negozio, afferra una cassa (poi <b>RT</b> per lanciarla), sali sulle giostre</li><li>Mira alla <b>testa</b>: danno doppio! · <b>≡</b> pausa · <b>⧉</b> statistiche</li>";
const KEYS_DESK = 'WASD muovi · Mouse mira · Clic spara · 1/2/3 o rotella arma · R ricarica · E afferra · Q mirino · B negozio · F sali/scendi · Spazio salta · Esc pausa';
const KEYS_PAD = 'RT spara · LT mirino · A salta · X ricarica · Y arma · B interagisci · L3 corri · ≡ pausa';

export const hud = {
  /** Controller in uso (true) o touch/mouse (false): istruzioni e suggerimenti con i tasti giusti. */
  setPadMode(on) {
    $('howto').innerHTML = on ? HOWTO_PAD : isTouch ? HOWTO_TOUCH : HOWTO_DESK;
    $('keys').textContent = on ? KEYS_PAD : KEYS_DESK;
  },
  init() {
    this.setPadMode(false);
    if (isTouch) {
      document.body.classList.add('touch');
      $('btns').style.display = 'block';
      onSettings((st) => layoutButtons(st.buttons));
      addEventListener('resize', () => layoutButtons());
    }
    this.setPlaying(false);
  },
  /** Mostra o nasconde l'HUD di gioco (durante i menu resta nascosto). */
  setPlaying(on) {
    for (const id of ['hud', 'health', 'minimap', 'cross', 'weapon', 'top', 'keys', 'joy']) $(id).style.visibility = on ? '' : 'hidden';
    $('btns').style.visibility = on ? '' : 'hidden';
  },
  show(id) { $(id).classList.remove('hidden'); },
  hide(id) { $(id).classList.add('hidden'); },

  /** Abilita il pulsante "Gioca" quando la fisica è pronta. */
  ready() {
    const b = $('play');
    b.disabled = false;
    b.textContent = '▶ Gioca da solo';
  },
  error(text) {
    const e = $('err');
    e.style.display = 'flex';
    e.textContent = text;
  },
  flash(text, seconds = 2.4) {
    const m = $('msg');
    m.innerHTML = text;
    m.classList.add('show');
    msgTimer = seconds;
  },
  /**
   * Riga piccola in alto, per i messaggi sugli amici (es. "Hai eliminato Marco ×3").
   * Il nome è scritto dall'utente: va sempre come testo, mai come HTML.
   */
  feed(before, name, after = '', seconds = 2.2) {
    let box = $('feed');
    if (!box) { box = document.createElement('div'); box.id = 'feed'; document.body.appendChild(box); }
    const line = document.createElement('div');
    const b = document.createElement('b');
    b.textContent = name;
    line.append(before, b, after);
    box.prepend(line);
    while (box.children.length > 3) box.lastChild.remove();
    setTimeout(() => { line.style.opacity = '0'; }, seconds * 1000);
    setTimeout(() => line.remove(), seconds * 1000 + 450);
  },
  clearFeed() { const box = $('feed'); if (box) box.innerHTML = ''; },
  setRound(n) { setText('pRound', `Round ${n}/${MAX_ROUNDS}`); },
  setEnemies(n) { setText('pEnemies', `👾 ${n}`); },
  /** Punti da spendere (la moneta del negozio). */
  setScore(n) { setText('pScore', `★ ${n}`); },
  /** Conto alla rovescia tra i round (null per nasconderlo). */
  setBreak(seconds) {
    $('pBreak').classList.toggle('hidden', seconds == null);
    if (seconds != null) setText('pBreak', `Prossimo round tra ${Math.ceil(seconds)}`);
  },
  setHealth(h, max) {
    const v = Math.max(0, Math.round(h));
    if (last.health === v) return;
    last.health = v;
    $('hNum').textContent = v;
    $('hBar').firstChild.style.width = `${(v / max) * 100}%`;
  },
  /** Bordo rosso quando il giocatore viene colpito. */
  hurt(strength = 1) {
    hurtT = Math.min(1, 0.5 + strength * 0.5);
    rumble(0.9, 0.5, 180);
  },
  /**
   * Segno sul mirino quando si colpisce un nemico: una X che scatta fuori dal centro,
   * bianca per un colpo, gialla e più grande alla testa, rossa e lunga quando muore. Più un "tic".
   */
  hitMarker(kill, head = false) {
    const c = $('cross');
    c.classList.toggle('kill', kill);
    c.classList.add('hit');
    markT = kill ? 0.25 : 0.12;
    const x = $('hitX');
    x.className = '';
    void x.offsetWidth; // riparte l'animazione
    x.className = kill ? 'kill' : head ? 'head' : 'hit';
    hitTick(kill ? 'kill' : head ? 'head' : 'hit');
  },

  /** Armi in mano (al massimo 3): un pulsante per ognuna. current = posizione dell'arma attuale. */
  setSlots(list, current) {
    const key = list.map((w) => w.id).join(',');
    if (key !== slotsKey) {
      slotsKey = key;
      $('wSlots').innerHTML = list.map((w, i) => `<button data-w="${i}" aria-label="${w.name}">${slotLabel(i, w.icon)}</button>`).join('');
    }
    document.querySelectorAll('#wSlots button').forEach((b, i) => b.classList.toggle('on', i === current));
  },
  /** Mirino del cecchino (cerchio nero attorno). */
  setScope(on) {
    $('scope').classList.toggle('on', on);
    document.body.classList.toggle('scoped', on);
  },
  /** Pulsante "Mirino" su touch: c'è solo con le armi che hanno lo zoom. */
  setZoomButton(on) { $('bZoom').style.display = on ? '' : 'none'; },
  setWeapon(index, name, mag, reserve, reloading) {
    document.querySelectorAll('#wSlots button').forEach((b, i) => b.classList.toggle('on', i === index));
    $('wName').textContent = name;
    // armi corpo a corpo (coltello, spada): niente munizioni
    $('wMag').textContent = mag === Infinity ? '∞' : mag;
    $('wRes').textContent = mag === Infinity ? '' : '/ ' + (reserve === Infinity ? '∞' : reserve);
    $('wAmmo').classList.toggle('low', mag === 0);
    $('weapon').classList.toggle('reloading', reloading);
    if (!reloading) $('wBar').firstChild.style.width = '0';
  },
  setReload(p) {
    $('wBar').firstChild.style.width = (p * 100).toFixed(0) + '%';
  },
  /** Distanza in pixel delle stanghette del mirino dal centro. */
  setSpread(px) {
    const g = Math.round(Math.min(80, px));
    if (g !== lastGap) { $('cross').style.setProperty('--g', g + 'px'); lastGap = g; }
  },
  /** Barra di rianimazione (text = null per nasconderla). */
  setRevive(text, progress = 0) {
    const el = $('revive');
    el.classList.toggle('hidden', !text);
    if (!text) return;
    setText('rText', text);
    $('rBar').firstChild.style.width = `${Math.round(Math.min(1, progress) * 100)}%`;
  },
  /**
   * Pulsante d'azione touch (docs/DESIGN.md → "Controlli touch"): a = { id, icon, label, kind } o null.
   * Compare con un'animazione quando appare o cambia azione; senza niente vicino resta nascosto.
   */
  setAction(a) {
    const id = a ? a.id : '';
    if (id === actId) return;
    const el = $('bAct');
    actId = id;
    if (!a) { el.style.display = 'none'; el.classList.remove('pop'); return; }
    $('bActI').textContent = a.icon;
    $('bActL').textContent = a.label;
    el.className = a.kind ? 'k-' + a.kind : '';
    el.style.display = '';
    void el.offsetWidth; // riparte l'animazione
    el.classList.add('pop');
  },
  setHolding(on) {
    $('cross').classList.toggle('hold', on);
    if (on) $('cross').classList.remove('can');
  },
  setCanGrab(on) {
    $('cross').classList.toggle('can', on);
  },
  update(dt) {
    if (msgTimer > 0) {
      msgTimer -= dt;
      if (msgTimer <= 0) $('msg').classList.remove('show');
    }
    if (hurtT > 0) {
      hurtT = Math.max(0, hurtT - dt * 1.6);
      $('hurt').style.opacity = hurtT.toFixed(2);
    }
    if (markT > 0) {
      markT -= dt;
      if (markT <= 0) $('cross').classList.remove('hit', 'kill');
    }
  },
};
