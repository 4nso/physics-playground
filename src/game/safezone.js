// Zona sicura (dietro il passaggio segreto delle backrooms): cassa misteriosa e potenziatore.
// I nemici non entrano (barriera in world/safezone.js) e non inseguono chi è qui dentro (vedi teamTargets).
// La cassa: si paga, si apre, le armi girano sempre più piano e si ferma su una a caso,
// che arriva in mano a chi ha pagato. Tutti i giocatori vedono la stessa animazione.
import * as THREE from 'three';
import { scene } from '../core/renderer.js';
import { thud } from '../core/audio.js';
import { player } from '../player/player.js';
import { WEAPONS } from '../weapons/defs.js';
import { models } from '../weapons/viewmodel.js';
import { giveWeapon } from '../weapons/weapons.js';
import { impact } from '../weapons/effects.js';
import { map, inSafeZone } from '../world/map.js';
import { hud } from '../ui/hud.js';

/**
 * spin(idx, wi, buyerId): chiamato da chi decide (da solo / host) quando qualcuno paga la cassa.
 * Il gioco lo collega a startBoxSpin e lo manda ai client.
 */
export const boxHooks = { spin: null };

const SPIN = 2.8;   // secondi in cui le armi girano
const SHOW = 1.1;   // l'arma vinta resta in mostra
const CLOSE = 0.4;  // chiusura del coperchio

/* ---------- Scritte (canvas) ---------- */
function textTex(text, w, h, bg, fg, font) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.fillStyle = fg; g.font = font;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, w / 2, h / 2 + h * 0.04);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const safeSignMat = new THREE.MeshBasicMaterial({ map: textTex('🛡️ ZONA SICURA', 512, 96, '#2f6f5c', '#eafff6', 'bold 56px system-ui, sans-serif') });
const papSignMat = new THREE.MeshBasicMaterial({ map: textTex('POTENZIATORE', 512, 96, '#ff8a1f', '#3a0f5c', 'bold 62px system-ui, sans-serif') });
const qTex = textTex('?', 128, 128, '#6b3d1e', '#ffcf3a', 'bold 104px system-ui, sans-serif');
const boxMat = new THREE.MeshLambertMaterial({ color: 0x8a5a2b, flatShading: true });
const boxQMat = new THREE.MeshLambertMaterial({ map: qTex, emissive: 0x3a2a00, emissiveMap: qTex });
const trimMat = new THREE.MeshStandardMaterial({ color: 0xffcf3a, roughness: 0.4, metalness: 0.3, emissive: 0x332200 });
const glowMat = new THREE.MeshBasicMaterial({ color: 0xfff2a8, transparent: true, opacity: 0.0, depthWrite: false });

/* ---------- Costruzione (a ogni partita, dalla mappa) ---------- */
let boxes = [], signs = [], light = null, papLight = null;
const BW = 1.7, BH = 0.7, BD = 0.85;

function buildBox(b) {
  const group = new THREE.Group();
  group.position.set(b.x, b.y, b.z);
  group.rotation.y = b.yaw;
  // corpo: il "?" davanti e sopra (davanti = +z locale, verso il passaggio)
  const body = new THREE.Mesh(new THREE.BoxGeometry(BW, BH, BD), [boxMat, boxMat, boxMat, boxMat, boxQMat, boxMat]);
  body.position.y = BH / 2;
  body.castShadow = true;
  group.add(body);
  for (const x of [-BW / 2 + 0.06, BW / 2 - 0.06]) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.1, BH + 0.02, BD + 0.02), trimMat);
    band.position.set(x, BH / 2, 0);
    group.add(band);
  }
  // coperchio incernierato sul retro
  const hinge = new THREE.Group();
  hinge.position.set(0, BH, -BD / 2);
  const lid = new THREE.Mesh(new THREE.BoxGeometry(BW + 0.04, 0.12, BD + 0.04), [boxMat, boxMat, boxQMat, boxMat, boxMat, boxMat]);
  lid.position.set(0, 0.06, BD / 2);
  hinge.add(lid);
  group.add(hinge);
  // bagliore che esce dalla cassa aperta
  const glow = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.75, 1.6, 8, 1, true), glowMat);
  glow.position.y = BH + 0.8;
  group.add(glow);
  // le armi che girano: copie dei modelli in prima persona, più grandi
  const show = new THREE.Group();
  show.position.y = BH + 0.35;
  group.add(show);
  const guns = models.map((m) => {
    const ud = m.userData;
    m.userData = {}; // i dati del modello (vettori, mesh) non vanno copiati
    const c = m.clone(true);
    m.userData = ud;
    c.position.set(0, 0, 0);
    c.rotation.set(0, Math.PI / 2, 0); // di profilo verso chi guarda
    c.scale.setScalar(1.7);
    c.visible = false;
    show.add(c);
    return c;
  });
  scene.add(group);
  return { group, hinge, glow, show, guns, t: -1, wi: 0, mine: false, shown: -1, nextSwap: 0, given: false };
}

export function setupSafeZones() {
  for (const b of boxes) scene.remove(b.group);
  for (const s of signs) scene.remove(s);
  boxes = map.boxes.map(buildBox);
  signs = [];
  const geo = new THREE.PlaneGeometry(2.6, 0.5);
  for (const s of map.safeSigns) {
    const m = new THREE.Mesh(geo, safeSignMat);
    m.position.set(s.x, s.y, s.z);
    m.rotation.y = s.yaw;
    scene.add(m);
    signs.push(m);
  }
  for (const u of map.upgraders) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.34), papSignMat);
    // sul bordo davanti della macchina, appena sopra
    m.position.set(u.x - Math.sin(u.yaw) * 0.13, 2.68, u.z - Math.cos(u.yaw) * 0.13);
    m.rotation.y = u.yaw;
    scene.add(m);
    signs.push(m);
  }
  if (!light) {
    light = new THREE.PointLight(0xffd860, 0, 6, 2);
    papLight = new THREE.PointLight(0xb45cff, 0, 7, 2);
    scene.add(light, papLight);
  }
  light.intensity = papLight.intensity = 0;
  wasSafe = false;
}

/* ---------- Cassa misteriosa ---------- */
/** true mentre la cassa idx sta girando (non si può pagare di nuovo). */
export function boxBusy(idx) {
  const b = boxes[idx];
  return !!b && b.t >= 0;
}

/** Fa partire l'animazione. wi = arma che uscirà; mine = true se l'ha pagata questo giocatore. */
export function startBoxSpin(idx, wi, mine) {
  const b = boxes[idx];
  if (!b) return;
  b.t = 0; b.wi = wi; b.mine = mine; b.given = false; b.nextSwap = 0.35; b.shown = -1;
  thud(0.3, 330);
}

function showGun(b, i) {
  if (b.shown >= 0) b.guns[b.shown].visible = false;
  b.shown = i;
  if (i >= 0) b.guns[i].visible = true;
}

function updateBox(b, dt) {
  if (b.t < 0) return;
  b.t += dt;
  const t = b.t;
  // coperchio: si apre all'inizio, si chiude alla fine
  const open = t < SPIN + SHOW ? Math.min(1, t / 0.35) : Math.max(0, 1 - (t - SPIN - SHOW) / CLOSE);
  b.hinge.rotation.x = -1.9 * open;
  glowMat.opacity = 0.35 * open;
  light.position.set(b.group.position.x, b.group.position.y + 1.2, b.group.position.z);
  light.intensity = 6 * open;
  // armi che salgono e girano, cambiando sempre più piano
  b.show.position.y = BH + 0.35 + Math.min(1, t / 0.6) * 0.5 + Math.sin(t * 3) * 0.04;
  b.show.rotation.y = t < SPIN ? t * 2.2 : b.show.rotation.y * 0.9;
  if (t < SPIN) {
    if (t >= b.nextSwap) {
      let i;
      do { i = (Math.random() * WEAPONS.length) | 0; } while (i === b.shown && WEAPONS.length > 1);
      showGun(b, i);
      b.nextSwap = t + 0.06 + 0.32 * (t / SPIN) ** 2; // rallenta verso la fine
      thud(0.06, 700 + Math.random() * 300);
    }
  } else if (!b.given) {
    b.given = true;
    showGun(b, b.wi);
    thud(0.35, 880);
    impact(new THREE.Vector3(b.group.position.x, b.group.position.y + 1.3, b.group.position.z), UP, 'metal', 22);
    if (b.mine) {
      const replaced = giveWeapon(b.wi);
      const w = WEAPONS[b.wi];
      hud.flash(`🎁 ${w.icon} ${w.name}!` + (replaced ? `<br><small>Hai lasciato: ${replaced}</small>` : ''), 2.2);
    }
  }
  if (t > SPIN + SHOW) showGun(b, -1);
  if (t > SPIN + SHOW + CLOSE) { b.t = -1; light.intensity = 0; glowMat.opacity = 0; }
}
const UP = new THREE.Vector3(0, 1, 0);

/* ---------- Potenziatore ---------- */
let papT = 0, papIdx = 0;
/** Effetto del potenziatore (luce viola che pulsa, scintille, suono che sale). */
export function upgraderFx(idx) {
  papIdx = idx;
  papT = 1.2;
  const u = map.upgraders[idx];
  if (!u) return;
  for (let k = 0; k < 5; k++) setTimeout(() => thud(0.12, 300 + k * 160), k * 90);
  impact(new THREE.Vector3(u.x, 1.6, u.z), UP, 'enemy', 26);
}

/* ---------- A ogni frame ---------- */
let wasSafe = false;
export function updateSafeZones(dt, playing) {
  for (const b of boxes) updateBox(b, dt);
  if (papT > 0) {
    papT -= dt;
    const u = map.upgraders[papIdx];
    if (u) papLight.position.set(u.x, 1.8, u.z);
    papLight.intensity = Math.max(0, papT) * 10 * (0.6 + 0.4 * Math.sin(papT * 30));
  }
  // messaggio quando si entra nella zona sicura
  const safe = playing && player.alive && inSafeZone(player.pos.x, player.pos.z);
  if (safe && !wasSafe) hud.flash('🛡️ Zona sicura<br><small>Qui i nemici non entrano</small>', 2.4);
  wasSafe = safe;
}
