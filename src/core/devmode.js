// Modalità sviluppatore (docs/DESIGN.md → "Modalità sviluppatore (fase 14)").
// Questo file è minuscolo e sempre caricato: contiene solo gli interruttori che il gioco legge.
// Il pannello vero (src/dev/) si scarica soltanto quando la modalità si attiva (import dinamico).
// Solo chi fa da host (o gioca da solo) può usarla: i client non la vedono.

export const dev = {
  on: false,        // modalità attiva su questo dispositivo
  panelOpen: false, // pannello aperto (il mouse è libero ma il gioco non va in pausa)
  freeze: false,    // nemici e comparse fermi (il mondo continua)
  god: false,       // il giocatore locale non subisce danni
  infAmmo: false,   // la riserva non cala mai
  noReload: false,  // il caricatore non cala mai (niente ricarica)
  fly: false,       // volo libero, attraversa i muri
  speedMul: 1,      // velocità di movimento ×1 / ×2 / ×4
  timeScale: 1,     // velocità del tempo ×0,25 … ×2
  rigBox: -1,       // cassa misteriosa truccata: prossima arma (-1 = a caso)
  stallOpen: false, // bancarella delle munizioni aperta anche prima del round 10
  dayOverride: null, // ora del giorno scelta a mano (0 giorno … 1 notte), null = segue i round
  seed: 0,          // seed della prossima mappa scelto dal pannello (0 = normale)
  noPost: false,    // scheda Grafica: effetti di schermo spenti (si disegna come in qualità Bassa)
  noBloom: false,   // scheda Grafica: niente alone intorno alle luci
};

/** Collegamenti impostati dal pannello quando è caricato: tick(dt) a ogni frame. */
export const devHooks = { tick: null, toggle: null };

let loading = null;
/** Accende o spegne la modalità. Restituisce una promessa (il pannello si scarica la prima volta). */
export async function setDevMode(on) {
  if (!on) {
    if (devHooks.shutdown) devHooks.shutdown();
    dev.on = false;
    return;
  }
  if (!loading) loading = import('../dev/panel.js');
  const m = await loading;
  dev.on = true;
  m.startDev();
}

/** `?dev` nell'indirizzo: la modalità parte subito. */
export const devFromUrl = /[?&]dev\b/.test(location.search);

/* ---------- Registro per la scheda Diagnosi ----------
 * Sempre attivo (costa pochissimo): così "Copia stato" ha anche gli errori successi prima di
 * accendere la modalità sviluppatore. Solo in memoria, mai inviato da nessuna parte. */
const MAX_LOG = 40;
export const devLogs = { events: [], errors: [] };
const stamp = () => new Date().toTimeString().slice(0, 8);
function push(list, text) {
  list.push(`${stamp()} ${String(text).slice(0, 300)}`);
  if (list.length > MAX_LOG) list.shift();
}
/** Un evento della partita (round, acquisti, fine partita…). */
export function devLog(text) { push(devLogs.events, text); }
function noteError(text) { push(devLogs.errors, text); push(devLogs.events, '❌ ' + text); }
addEventListener('error', (e) => noteError(`${e.message || 'errore'}${e.filename ? ` (${e.filename.split('/').pop()}:${e.lineno})` : ''}`));
addEventListener('unhandledrejection', (e) => noteError(`promessa: ${e.reason && e.reason.message ? e.reason.message : e.reason}`));
const origError = console.error.bind(console);
console.error = (...a) => {
  try { noteError(a.map((x) => (x && x.message) || String(x)).join(' ')); } catch (err) { /* ignora */ }
  origError(...a);
};
