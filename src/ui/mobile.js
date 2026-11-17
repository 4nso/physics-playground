// Telefono: invito a installare il gioco sulla schermata Home e pausa quando lo si mette in verticale.
import { isTouch } from '../core/renderer.js';

const $ = (id) => document.getElementById(id);

const standalone = () => matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/** onPortrait: chiamata quando un telefono passa in verticale (per mettere in pausa). */
export function initMobile(onPortrait) {
  if (!isTouch) return;

  // In verticale su un telefono compare "Ruota il telefono" (solo CSS); qui mettiamo in pausa.
  const portrait = matchMedia('(orientation: portrait) and (max-width: 700px)');
  const check = () => { if (portrait.matches) onPortrait(); };
  if (portrait.addEventListener) portrait.addEventListener('change', check);
  else portrait.addListener(check);

  if (standalone()) return;
  const note = $('install');
  if (isIOS) {
    note.innerHTML = '📲 <b>Gioca a schermo intero</b>: in Safari tocca <b>Condividi</b> e poi <b>«Aggiungi alla schermata Home»</b>.';
    note.classList.remove('hidden');
  } else {
    note.innerHTML = '📲 <b>Gioca a schermo intero</b>: dal menu del browser scegli <b>«Installa app»</b> o <b>«Aggiungi a schermata Home»</b>.';
    note.classList.remove('hidden');
    // Chrome su Android: pulsante "Installa" vero e proprio
    addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      const btn = $('installBtn');
      note.classList.add('hidden');
      btn.classList.remove('hidden');
      btn.onclick = async () => {
        btn.classList.add('hidden');
        e.prompt();
        try { await e.userChoice; } catch (err) { /* ignora */ }
      };
    });
  }
}
