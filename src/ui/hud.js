// HUD: contatori, messaggi, mirino, schermata iniziale.
import { isTouch } from '../core/renderer.js';

const $ = (id) => document.getElementById(id);
let msgTimer = 0;
let lastTower = '', lastDom = '';

export const hud = {
  init() {
    $('howto').innerHTML = isTouch
      ? "<li><b>Pollice sinistro</b>: muoviti · <b>trascina a destra</b>: guarda</li><li><b>Lancia</b> palline o l'oggetto che tieni in mano</li><li><b>Afferra</b> casse, palle e la palla demolitrice</li><li><b>💥</b> esplosione dove miri · <b>📦</b> nuova cassa</li><li>Obiettivo: abbatti la <b>torre</b> e fai cadere tutti i <b>domino</b>!</li>"
      : "<li><b>WASD</b> muovi · <b>Mouse</b> guarda · <b>Shift</b> corri · <b>Spazio</b> salta</li><li><b>Clic</b>: lancia una pallina (o l'oggetto in mano)</li><li><b>E</b> o <b>tasto destro</b>: afferra / lascia</li><li><b>F</b> esplosione · <b>Q</b> nuova cassa · <b>R</b> ricomincia</li><li>Obiettivo: abbatti la <b>torre</b> e fai cadere tutti i <b>domino</b>!</li>";
    if (isTouch) {
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
  update(dt) {
    if (msgTimer > 0) {
      msgTimer -= dt;
      if (msgTimer <= 0) $('msg').classList.remove('show');
    }
  },
};
