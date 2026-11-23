// Modalità sviluppatore, scheda Diagnosi: riassunto dello stato in testo ("Copia stato"),
// da incollare a Claude per segnalare un bug. Niente volti, niente nomi degli amici: solo numeri.
import { dev, devLogs } from '../core/devmode.js';
import { isTouch } from '../core/renderer.js';
import { pad } from '../core/gamepad.js';
import { quality, LEVEL_NAMES } from '../core/quality.js';
import { settings } from '../ui/settings.js';
import { map, zoneAt } from '../world/map.js';
import { player } from '../player/player.js';
import { enemies } from '../enemies/enemies.js';
import { game, team, localMember } from '../game/game.js';
import { rides } from '../game/rides.js';
import { WEAPONS } from '../weapons/defs.js';
import { ownedWeapons, currentWeaponIndex, weaponLevel, ammoOf } from '../weapons/weapons.js';
import { net } from '../net/net.js';

/* global __APP_VERSION__ */
export const VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'sviluppo';
const f1 = (v) => (Math.round(v * 10) / 10).toFixed(1);
const num = (v) => (v === Infinity ? '∞' : v);

/** Il testo di "Copia stato". */
export function stateText() {
  const me = localMember();
  const p = player.pos;
  const zone = zoneAt(p.x);
  const flags = ['freeze', 'god', 'infAmmo', 'noReload', 'fly', 'stallOpen', 'noPost', 'noBloom'].filter((k) => dev[k]);
  if (dev.speedMul !== 1) flags.push(`velocità ×${dev.speedMul}`);
  if (dev.timeScale !== 1) flags.push(`tempo ×${dev.timeScale}`);
  if (dev.dayOverride !== null) flags.push(`ora ${dev.dayOverride}`);
  if (dev.rigBox >= 0) flags.push(`cassa → ${WEAPONS[dev.rigBox].id}`);
  const lines = [
    `Shoot Your Friends – stato del ${new Date().toLocaleString('it-IT')}`,
    `Versione: ${VERSION}`,
    `Indirizzo: ${location.pathname}${location.search}`,
    `Dispositivo: ${navigator.userAgent}`,
    `Schermo: ${innerWidth}×${innerHeight} @${devicePixelRatio} · ${isTouch ? 'touch' : 'mouse'}${pad.connected ? ` · controller ${pad.name || 'sì'}${pad.active ? ' (in uso)' : ''}` : ''}`,
    `Rete: ${net.mode}${net.code ? ` (stanza ${net.code})` : ''} · giocatori ${team.size}`,
    `Partita: ${game.state}/${game.phase} · round ${game.round} · punti ${game.score} · uccisioni ${game.kills} · nemici ${enemies.length} (+${game.toSpawn || 0} da far comparire) · mappa ${map.seed}${game.devUsed ? ' · partita di test' : ''}`,
    `Giocatore: x ${f1(p.x)} y ${f1(p.y)} z ${f1(p.z)} · direzione ${f1(player.yaw)} · zona ${zone ? zone.name : '?'} · vita ${me ? Math.round(me.health) : '?'}/${me ? me.maxHealth || 100 : '?'}${player.alive ? '' : ' · a terra'}${player.seated ? ' · seduto su una giostra' : ''} · soldi ${me ? me.money || 0 : 0}`,
    `Armi: ${ownedWeapons().map((wi) => { const a = ammoOf(wi); return `${WEAPONS[wi].id}${weaponLevel(wi) ? '★' + weaponLevel(wi) : ''} ${a.mag}/${num(a.reserve)}${wi === currentWeaponIndex() ? ' (in mano)' : ''}`; }).join(', ')}`,
    `Giostre: ${rides.map((r) => `${r.def.kind} ${r.state} v${r.level}`).join(', ') || '-'}`,
    `Grafica: ${quality.setting === 'auto' ? 'automatica → ' : ''}${LEVEL_NAMES[quality.level]} · ${quality.fps} fps · risoluzione ${Math.round(quality.res * 100)}%`,
    `Impostazioni: ${JSON.stringify(settings)}`,
    `Sviluppatore: ${dev.on ? 'attiva' : 'spenta'}${flags.length ? ' · ' + flags.join(', ') : ''}`,
    '',
    `Ultimi errori (${devLogs.errors.length}):`,
    ...(devLogs.errors.length ? devLogs.errors.slice(-10) : ['nessuno']),
    '',
    'Ultimi eventi:',
    ...devLogs.events.slice(-20),
  ];
  return lines.join('\n');
}

/** Copia negli appunti. Restituisce true se ci è riuscito. */
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    // riserva (browser vecchi o senza permesso): selezione di un campo di testo nascosto
    const t = document.createElement('textarea');
    t.value = text;
    t.style.cssText = 'position:fixed;left:-9999px;top:0';
    document.body.appendChild(t);
    t.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (err) { /* niente */ }
    t.remove();
    return ok;
  }
}
