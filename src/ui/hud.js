// HUD: round, nemici, punteggio, vita, mirino, arma, messaggi e schermate.
import { isTouch } from '../core/renderer.js';
import { onSettings } from './settings.js';

const $ = (id) => document.getElementById(id);
let msgTimer = 0, hurtT = 0, markT = 0;
let lastGap = -1;
let icons = [];
const last = {};
const setText = (id, text) => { if (last[id] !== text) { $(id).textContent = text; last[id] = text; } };

// Su touch solo l'icona (pillola compatta), su desktop anche il tasto numerico.
const slotLabel = (i, icon) => (isTouch ? icon : `${i + 1} ${icon}`);

/**
 * Pulsanti touch ad arco nell'angolo in basso a destra: "Spara" nell'angolo (il più grande),
 * gli altri intorno a lui alla stessa distanza, così il pollice li raggiunge ruotando.
 * La dimensione dipende dallo schermo e dall'impostazione "Dimensione dei pulsanti".
 */
let btnScale = 1;
function layoutButtons(scale = btnScale) {
  btnScale = scale;
  const short = Math.min(innerWidth, innerHeight);
  const F = Math.round(Math.max(72, Math.min(104, short * 0.22)) * scale); // diametro di "Spara"
  const gap = Math.round(9 * scale);
  const c = F / 2; // centro di "Spara" rispetto all'angolo
  const place = (id, d, deg) => {
    const el = $(id), a = (deg * Math.PI) / 180, r = c + gap + d / 2;
    Object.assign(el.style, {
      width: d + 'px', height: d + 'px',
      right: Math.round(c - r * Math.cos(a) - d / 2) + 'px',
      bottom: Math.round(c + r * Math.sin(a) - d / 2) + 'px',
    });
  };
  Object.assign($('bFire').style, { width: F + 'px', height: F + 'px', right: '0px', bottom: '0px' });
  place('bJump', Math.round(F * 0.7), 180);
  place('bReload', Math.round(F * 0.6), 133);
  place('bGrab', Math.round(F * 0.6), 87);
  document.documentElement.style.setProperty('--bs', scale);
}

export const hud = {
  init() {
    $('howto').innerHTML = isTouch
      ? "<li><b>Pollice sinistro</b>: muoviti · <b>trascina a destra</b>: guarda</li><li><b>Spara</b>: tienilo premuto e trascina il dito per mirare</li><li>Tocca le <b>icone delle armi</b> in alto a destra per cambiarla · <b>⟳</b> ricarica</li><li>Spingi il joystick <b>oltre il bordo</b> per correre</li><li>Mira alla <b>testa</b>: danno doppio!</li><li>Tra un round e l'altro raccogli <b>munizioni</b> e <b>vita</b></li>"
      : "<li><b>WASD</b> muovi · <b>Mouse</b> mira · <b>Shift</b> corri · <b>Spazio</b> salta</li><li><b>Clic</b> spara · <b>1/2/3</b> o <b>rotella</b> cambia arma · <b>R</b> ricarica</li><li><b>E</b>: afferra una cassa, poi <b>clic</b> per lanciarla sui nemici</li><li>Mira alla <b>testa</b>: danno doppio! · <b>Esc</b> pausa</li><li>Tra un round e l'altro raccogli <b>munizioni</b> e <b>vita</b></li>";
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
    for (const id of ['hud', 'health', 'cross', 'weapon', 'top', 'keys', 'joy']) $(id).style.visibility = on ? '' : 'hidden';
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
    $('wSlots').innerHTML = list.map((w, i) => `<button data-w="${i}" aria-label="${w.name}">${slotLabel(i, w.icon)}</button>`).join('');
  },
  setLocked(unlocked) {
    document.querySelectorAll('#wSlots button').forEach((b, i) => {
      b.style.opacity = unlocked[i] ? '' : '0.45';
      b.textContent = slotLabel(i, unlocked[i] ? icons[i] : '🔒');
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
