// HUD: round, nemici, punteggio, vita, mirino, arma, messaggi e schermate.
import { isTouch } from '../core/renderer.js';

const $ = (id) => document.getElementById(id);
let msgTimer = 0, hurtT = 0, markT = 0;
let lastGap = -1;
let icons = [];
const last = {};
const setText = (id, text) => { if (last[id] !== text) { $(id).textContent = text; last[id] = text; } };

export const hud = {
  init() {
    $('howto').innerHTML = isTouch
      ? "<li><b>Pollice sinistro</b>: muoviti · <b>trascina a destra</b>: guarda</li><li><b>Spara</b>: tienilo premuto e trascina il dito per mirare</li><li>Tocca il <b>pannello dell'arma</b> per cambiarla · <b>⟳</b> ricarica</li><li>Mira alla <b>testa</b>: danno doppio!</li><li>Tra un round e l'altro raccogli <b>munizioni</b> e <b>vita</b></li>"
      : "<li><b>WASD</b> muovi · <b>Mouse</b> mira · <b>Shift</b> corri · <b>Spazio</b> salta</li><li><b>Clic</b> spara · <b>1/2/3</b> o <b>rotella</b> cambia arma · <b>R</b> ricarica</li><li><b>E</b>: afferra una cassa, poi <b>clic</b> per lanciarla sui nemici</li><li>Mira alla <b>testa</b>: danno doppio! · <b>Esc</b> pausa</li><li>Tra un round e l'altro raccogli <b>munizioni</b> e <b>vita</b></li>";
    if (isTouch) {
      document.body.classList.add('touch');
      $('btns').style.display = 'block';
    }
    this.setPlaying(false);
  },
  /** Mostra o nasconde l'HUD di gioco (durante i menu resta nascosto). */
  setPlaying(on) {
    for (const id of ['hud', 'health', 'cross', 'weapon', 'top', 'keys']) $(id).style.visibility = on ? '' : 'hidden';
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
  setRound(n) { setText('pRound', `Round ${n}`); },
  setEnemies(n) { setText('pEnemies', `👾 ${n}`); },
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
  hurt(strength = 1) { hurtT = Math.min(1, 0.5 + strength * 0.5); },
  /** Segno sul mirino quando si colpisce un nemico (rosso se muore). */
  hitMarker(kill) {
    const c = $('cross');
    c.classList.toggle('kill', kill);
    c.classList.add('hit');
    markT = kill ? 0.25 : 0.12;
  },

  buildWeaponSlots(list) {
    icons = list.map((w) => w.icon);
    $('wSlots').innerHTML = list.map((w, i) => `<button data-w="${i}">${i + 1} ${w.icon}</button>`).join('');
  },
  setLocked(unlocked) {
    document.querySelectorAll('#wSlots button').forEach((b, i) => {
      b.style.opacity = unlocked[i] ? '' : '0.45';
      b.textContent = `${i + 1} ${unlocked[i] ? icons[i] : '🔒'}`;
    });
  },
  setWeapon(index, name, mag, reserve, reloading) {
    document.querySelectorAll('#wSlots button').forEach((b, i) => b.classList.toggle('on', i === index));
    $('wName').textContent = name;
    $('wMag').textContent = mag;
    $('wRes').textContent = '/ ' + (reserve === Infinity ? '∞' : reserve);
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
  setGrabVisible(on) { $('bGrab').style.display = on ? '' : 'none'; },
  setHolding(on) {
    $('bGrab').classList.toggle('on', on);
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
