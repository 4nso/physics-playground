// HUD: contatori, messaggi, mirino, schermata iniziale.
import { isTouch } from '../core/renderer.js';

const $ = (id) => document.getElementById(id);
let msgTimer = 0;
let lastTower = '', lastDom = '', lastGap = -1;

export const hud = {
  init() {
    $('howto').innerHTML = isTouch
      ? "<li><b>Pollice sinistro</b>: muoviti · <b>trascina a destra</b>: guarda</li><li><b>Spara</b>: tienilo premuto e trascina il dito per mirare</li><li>Tocca il <b>pannello dell'arma</b> per cambiarla · <b>⟳</b> ricarica</li><li><b>Afferra</b> e poi <b>Spara</b> per lanciare · <b>💥</b> esplosione · <b>📦</b> cassa</li><li>Obiettivo: abbatti la <b>torre</b> e fai cadere tutti i <b>domino</b>!</li>"
      : "<li><b>WASD</b> muovi · <b>Mouse</b> mira · <b>Shift</b> corri · <b>Spazio</b> salta</li><li><b>Clic</b> spara · <b>1/2/3</b> o <b>rotella</b> cambia arma · <b>R</b> ricarica</li><li><b>E</b> o <b>tasto destro</b>: afferra, poi <b>clic</b> per lanciare</li><li><b>F</b> esplosione · <b>Q</b> nuova cassa · <b>⌫</b> ricomincia</li><li>Obiettivo: abbatti la <b>torre</b> e fai cadere tutti i <b>domino</b>!</li>";
    if (isTouch) {
      document.body.classList.add('touch');
      $('btns').style.display = 'block';
      $('keys').style.display = 'none';
    }
  },
  /** Abilita il pulsante "Gioca" quando la fisica è pronta. */
  ready(onPlay) {
    const b = $('play');
    b.disabled = false;
    b.textContent = 'Gioca';
    b.addEventListener('click', () => {
      $('start').style.display = 'none';
      onPlay();
    });
  },
  error(text) {
    const e = $('err');
    e.style.display = 'flex';
    e.textContent = text;
  },
  flash(text) {
    const m = $('msg');
    m.textContent = text;
    m.classList.add('show');
    msgTimer = 2.4;
  },
  setCounters(tk, tn, df, dn) {
    const t = `🏗️ Torre ${tk}/${tn}`, d = `🁢 Domino ${df}/${dn}`;
    if (t !== lastTower) { $('pTower').textContent = t; $('pTower').classList.toggle('done', tn > 0 && tk === tn); lastTower = t; }
    if (d !== lastDom) { $('pDom').textContent = d; $('pDom').classList.toggle('done', dn > 0 && df === dn); lastDom = d; }
  },
  setHolding(on) {
    $('bGrab').classList.toggle('on', on);
    $('cross').classList.toggle('hold', on);
    if (on) $('cross').classList.remove('can');
  },
  setCanGrab(on) {
    $('cross').classList.toggle('can', on);
  },
  buildWeaponSlots(list) {
    $('wSlots').innerHTML = list.map((w, i) => `<button data-w="${i}">${i + 1} ${w.icon}</button>`).join('');
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
  update(dt) {
    if (msgTimer > 0) {
      msgTimer -= dt;
      if (msgTimer <= 0) $('msg').classList.remove('show');
    }
  },
};
