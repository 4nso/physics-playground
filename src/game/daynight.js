// Dal giorno alla notte con l'avanzare dei round: round 1 mattina, poi pomeriggio dorato, tramonto,
// e al round 25 notte piena con il luna park tutto illuminato.
// Cambiano: colori del cielo e della nebbia, direzione e colore del sole (di notte è la luna),
// luce degli oggetti, "luce dipinta" della mappa (le cose luminose restano accese), forza del bagliore.
// Tutto dipende solo dal numero del round: in multiplayer è uguale per tutti senza messaggi in più.
// Per provarlo: ?ora=0.8 nell'indirizzo (0 = giorno, 1 = notte) fissa l'ora.
import * as THREE from 'three';
import { hemi, sun, setSunOffset } from '../core/renderer.js';
import { skyColors, skyState, applySkyColors } from '../core/sky.js';
import { worldMat } from '../world/worldMaterial.js';
import { grade } from '../core/post.js';
import { weaponScene } from '../weapons/viewmodel.js';
import { dev } from '../core/devmode.js';
import { progress } from './difficulty.js';

const C = (h) => new THREE.Color(h);
/** Momenti della giornata: t = 0 (round 1) … 1 (round 25). */
const KEYS = [
  { t: 0, top: C(0x4f8fd6), horizon: C(0xc4dbe8), bottom: C(0xa9bcc6), sunCol: C(0xfff0d0), dir: [15, 30, 12],
    tint: C(0xffffff), hemiSky: C(0xdcecff), hemiGround: C(0x66784a), hemiI: 2.4, sunLight: C(0xffe9c8), sunI: 3.2, stars: 0, bloom: 0.55 },
  { t: 0.45, top: C(0x4f7fc4), horizon: C(0xf0d3ae), bottom: C(0xc6ab8f), sunCol: C(0xffd08a), dir: [26, 16, 10],
    tint: C(0xfff0dc), hemiSky: C(0xffe6c8), hemiGround: C(0x6a6a44), hemiI: 2.1, sunLight: C(0xffcf96), sunI: 2.8, stars: 0, bloom: 0.6 },
  { t: 0.72, top: C(0x34497f), horizon: C(0xef8a5c), bottom: C(0x7a5560), sunCol: C(0xff7a3c), dir: [30, 5, 8],
    tint: C(0xc89a90), hemiSky: C(0xc08a90), hemiGround: C(0x40354a), hemiI: 1.5, sunLight: C(0xff9a64), sunI: 1.7, stars: 0.15, bloom: 0.75 },
  { t: 1, top: C(0x050a1e), horizon: C(0x1d2850), bottom: C(0x0b0e1c), sunCol: C(0xd8e0ff), dir: [-14, 26, -18],
    tint: C(0x6670a0), hemiSky: C(0x6c7cc0), hemiGround: C(0x1c1c2c), hemiI: 1.0, sunLight: C(0xa8b8ff), sunI: 0.9, stars: 1, bloom: 0.95 },
];

const weaponLights = [];
weaponScene.traverse((o) => { if (o.isHemisphereLight || o.isDirectionalLight) weaponLights.push({ l: o, base: o.intensity }); });

const forced = (() => {
  const v = new URLSearchParams(location.search).get('ora');
  return v !== null && isFinite(+v) ? Math.max(0, Math.min(1, +v)) : null;
})();

export const daynight = { t: -1, target: 0 };
const dir = new THREE.Vector3(), d0 = new THREE.Vector3(), d1 = new THREE.Vector3();
const lerp = (a, b, k) => a + (b - a) * k;

function apply(t) {
  let i = 0;
  while (i < KEYS.length - 2 && t > KEYS[i + 1].t) i++;
  const a = KEYS[i], b = KEYS[i + 1];
  const k = THREE.MathUtils.smoothstep(t, a.t, b.t);
  skyColors.top.lerpColors(a.top, b.top, k);
  skyColors.horizon.lerpColors(a.horizon, b.horizon, k);
  skyColors.bottom.lerpColors(a.bottom, b.bottom, k);
  skyColors.sun.lerpColors(a.sunCol, b.sunCol, k);
  applySkyColors();
  skyState.stars = lerp(a.stars, b.stars, k);
  // la direzione della luce: dal sole (che scende) alla luna, passando per l'orizzonte
  d0.set(...a.dir).normalize(); d1.set(...b.dir).normalize();
  dir.copy(d0).lerp(d1, k);
  if (dir.y < 0.12) dir.y = 0.12;
  setSunOffset(dir.x, dir.y, dir.z);
  worldMat.uniforms.dayTint.value.lerpColors(a.tint, b.tint, k);
  hemi.color.lerpColors(a.hemiSky, b.hemiSky, k);
  hemi.groundColor.lerpColors(a.hemiGround, b.hemiGround, k);
  hemi.intensity = lerp(a.hemiI, b.hemiI, k);
  sun.color.lerpColors(a.sunLight, b.sunLight, k);
  sun.intensity = lerp(a.sunI, b.sunI, k);
  grade.bloom.value = lerp(a.bloom, b.bloom, k);
  const wl = lerp(1, 0.55, Math.max(0, (t - 0.5) / 0.5)); // l'arma in mano: un po' più scura di notte
  for (const w of weaponLights) w.l.intensity = w.base * wl;
}

/** A ogni frame. round = round attuale (0 nel menu). Il passaggio tra un round e l'altro dura qualche secondo. */
export function updateDayNight(dt, round) {
  daynight.target = dev.dayOverride ?? forced ?? (round > 0 ? progress(round) : 0);
  let t = daynight.t;
  if (t < 0) t = daynight.target;
  else t += Math.max(-1, Math.min(1, daynight.target - t)) * Math.min(1, dt * 0.4);
  if (Math.abs(t - daynight.t) < 1e-4) return;
  daynight.t = t;
  apply(t);
}
