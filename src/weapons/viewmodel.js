// Modelli low-poly delle armi in prima persona.
// Vengono disegnati in una scena a parte, dopo il mondo e con la profondità azzerata,
// così l'arma non entra mai dentro i muri.
import * as THREE from 'three';
import { glowMat } from '../core/glow.js';
import { camera } from '../core/renderer.js';

export const weaponScene = new THREE.Scene();
weaponScene.add(new THREE.HemisphereLight(0xe4f3ff, 0x5a7a3a, 2.2));
const key = new THREE.DirectionalLight(0xfff1dc, 2.6);
key.position.set(1, 3, 2);
weaponScene.add(key);
const flashLight = new THREE.PointLight(0xffc070, 0, 2, 2);
weaponScene.add(flashLight);

/** Segue la telecamera: i figli sono posizionati in "coordinate della telecamera". */
const viewRoot = new THREE.Group();
viewRoot.matrixAutoUpdate = false;
weaponScene.add(viewRoot);

/**
 * Allinea l'arma alla telecamera di QUESTO frame. Importante: la matrice della telecamera
 * va ricalcolata prima, altrimenti l'arma usa la posizione del frame precedente e,
 * mentre ci si muove, sembra tremare.
 */
function syncToCamera() {
  camera.updateMatrixWorld();
  viewRoot.matrix.copy(camera.matrixWorld);
  viewRoot.updateMatrixWorld(true);
}

const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, flatShading: true, ...extra });
const GM = {
  metal: mat(0x3a3f48, { metalness: 0.5, roughness: 0.45 }),
  dark: mat(0x1f2228, { roughness: 0.7 }),
  wood: mat(0x8a5a2b, { roughness: 0.85 }),
  accent: mat(0xd2452f, { roughness: 0.6 }),
  olive: mat(0x5d6b4a, { roughness: 0.75 }),
  sand: mat(0xb59a6a, { roughness: 0.8 }),
  glass: mat(0x5fb6ff, { roughness: 0.2, metalness: 0.3, emissive: 0x0b2a44 }),
};
const boxGeo = new THREE.BoxGeometry(1, 1, 1);
const cylGeo = new THREE.CylinderGeometry(1, 1, 1, 6);
cylGeo.rotateX(Math.PI / 2); // asse lungo z, come le canne
const flashGeo = new THREE.OctahedronGeometry(1, 0);
const flashMat = glowMat(new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.95, depthWrite: false }), 2.6);

function part(g, geo, m, size, pos, rotX = 0) {
  const mesh = new THREE.Mesh(geo, m);
  mesh.scale.set(size[0], size[1], size[2]);
  mesh.position.set(pos[0], pos[1], pos[2]);
  mesh.rotation.x = rotX;
  g.add(mesh);
  return mesh;
}
const box = (g, m, size, pos, rotX) => part(g, boxGeo, m, size, pos, rotX);
const cyl = (g, m, r, len, pos) => part(g, cylGeo, m, [r, r, len], pos);
// parti che cambiano colore col potenziatore (strisce viola, poi viola e arancione)
let skinParts = [];
const sk = (mesh) => { skinParts.push(mesh); return mesh; };
const SKIN = [mat(0x9b4dff, { roughness: 0.4, emissive: 0x2a0a55 }), mat(0xff8a1f, { roughness: 0.4, emissive: 0x4a1c00 })];

/*
 * Tacche di mira (fase 13): una tacca posteriore (due "orecchie" con una fessura in mezzo) e un mirino
 * anteriore sottile con la punta rossa. Le cime sono tutte alla stessa altezza y, sulla linea x = 0:
 * quando si mira l'arma viene messa in (0, -y, …) senza rotazioni, così la punta del mirino finisce
 * esattamente al centro dello schermo, dentro la fessura.
 *  rearZ/rearBase, frontZ/frontBase = posizione lungo la canna e altezza della parte su cui poggiano
 *  eye = distanza dell'occhio dalla tacca posteriore mentre si mira
 */
let pendingSight = null;
function sights(g, y, rearZ, rearBase, frontZ, frontBase, eye) {
  const gap = 0.0075, ear = 0.009, hr = y - rearBase;
  for (const sd of [-1, 1]) box(g, GM.dark, [ear, hr, 0.01], [sd * (gap / 2 + ear / 2), rearBase + hr / 2, rearZ]);
  const hf = y - frontBase, tip = Math.min(0.006, hf * 0.5);
  box(g, GM.dark, [0.0045, hf - tip, 0.006], [0, frontBase + (hf - tip) / 2, frontZ]);
  box(g, GM.accent, [0.0045, tip, 0.006], [0, y - tip / 2, frontZ]);
  pendingSight = { y, z: -eye - rearZ };
}

function finish(g, muzzlePos, base) {
  const muzzle = new THREE.Object3D();
  muzzle.position.set(...muzzlePos);
  g.add(muzzle);
  const flash = new THREE.Mesh(flashGeo, flashMat);
  flash.scale.set(0.035, 0.035, 0.08);
  flash.position.z = -0.04;
  flash.visible = false;
  muzzle.add(flash);
  g.userData = { muzzle, flash, base: new THREE.Vector3(...base), skin: skinParts.map((m) => ({ m, mat: m.material })), sight: pendingSight };
  skinParts = [];
  pendingSight = null;
  g.visible = false;
  viewRoot.add(g);
  return g;
}

function pistol() {
  const g = new THREE.Group();
  sk(box(g, GM.metal, [0.036, 0.04, 0.2], [0, 0.02, -0.05]));       // carrello
  box(g, GM.dark, [0.032, 0.026, 0.16], [0, -0.012, -0.04]);     // telaio
  box(g, GM.dark, [0.03, 0.11, 0.046], [0, -0.065, 0.035], 0.25); // impugnatura
  box(g, GM.dark, [0.008, 0.03, 0.04], [0, -0.035, -0.02]);      // grilletto
  sights(g, 0.052, 0.035, 0.04, -0.135, 0.04, 0.36);
  cyl(g, GM.dark, 0.009, 0.02, [0, 0.02, -0.155]);
  return finish(g, [0, 0.02, -0.17], [0.16, -0.155, -0.42]);
}

function shotgun() {
  const g = new THREE.Group();
  cyl(g, GM.metal, 0.016, 0.62, [0, 0.022, -0.36]);              // canna
  cyl(g, GM.dark, 0.013, 0.46, [0, -0.014, -0.29]);              // serbatoio tubolare
  sk(box(g, GM.wood, [0.048, 0.046, 0.15], [0, -0.016, -0.3]));      // pompa
  box(g, GM.dark, [0.052, 0.072, 0.19], [0, 0.004, -0.02]);      // castello
  sk(box(g, GM.wood, [0.04, 0.085, 0.26], [0, -0.035, 0.2], -0.12)); // calcio
  box(g, GM.wood, [0.034, 0.09, 0.045], [0, -0.07, 0.07], 0.35); // impugnatura
  sights(g, 0.05, -0.03, 0.04, -0.64, 0.036, 0.24);
  return finish(g, [0, 0.022, -0.68], [0.17, -0.18, -0.56]);
}

function smg() {
  const g = new THREE.Group();
  box(g, GM.dark, [0.05, 0.07, 0.28], [0, 0, -0.08]);            // corpo
  sk(box(g, GM.metal, [0.052, 0.02, 0.24], [0, 0.044, -0.08]));      // coperchio
  cyl(g, GM.metal, 0.011, 0.14, [0, 0.01, -0.29]);               // canna
  sk(box(g, GM.metal, [0.03, 0.16, 0.05], [0, -0.11, -0.12], 0.15)); // caricatore
  box(g, GM.dark, [0.035, 0.1, 0.045], [0, -0.08, 0.04], 0.25);  // impugnatura
  box(g, GM.dark, [0.02, 0.05, 0.2], [0, -0.01, 0.16]);          // calcio
  sights(g, 0.068, 0.02, 0.054, -0.19, 0.054, 0.22);
  return finish(g, [0, 0.01, -0.37], [0.16, -0.165, -0.52]);
}

function rifle() {
  const g = new THREE.Group();
  box(g, GM.dark, [0.05, 0.075, 0.34], [0, 0, -0.1]);            // corpo
  box(g, GM.metal, [0.03, 0.03, 0.2], [0, 0.055, -0.08]);        // slitta
  sk(box(g, GM.sand, [0.056, 0.06, 0.2], [0, -0.004, -0.33]));       // paramano
  cyl(g, GM.metal, 0.011, 0.2, [0, 0.012, -0.5]);                // canna
  box(g, GM.metal, [0.03, 0.15, 0.06], [0, -0.1, -0.15], -0.2);  // caricatore curvo
  box(g, GM.dark, [0.035, 0.1, 0.045], [0, -0.08, 0.03], 0.25);  // impugnatura
  sk(box(g, GM.sand, [0.045, 0.09, 0.22], [0, -0.02, 0.2]));         // calcio
  sights(g, 0.085, 0.0, 0.07, -0.42, 0.026, 0.2);
  return finish(g, [0, 0.012, -0.61], [0.16, -0.17, -0.55]);
}

function sniper() {
  const g = new THREE.Group();
  box(g, GM.olive, [0.05, 0.07, 0.46], [0, 0, -0.08]);           // calciatura
  cyl(g, GM.metal, 0.012, 0.5, [0, 0.02, -0.55]);                // canna lunga
  sk(cyl(g, GM.dark, 0.026, 0.24, [0, 0.085, -0.08]));               // ottica
  cyl(g, GM.glass, 0.022, 0.01, [0, 0.085, 0.045]);              // lente
  box(g, GM.dark, [0.02, 0.04, 0.03], [0, 0.05, -0.12]);         // attacco ottica
  box(g, GM.dark, [0.035, 0.1, 0.045], [0, -0.08, 0.05], 0.25);  // impugnatura
  sk(box(g, GM.olive, [0.045, 0.11, 0.2], [0, -0.03, 0.24]));        // calcio
  sk(box(g, GM.metal, [0.03, 0.08, 0.05], [0, -0.07, -0.12]));       // caricatore
  return finish(g, [0, 0.02, -0.81], [0.15, -0.17, -0.5]);
}

function launcher() {
  const g = new THREE.Group();
  cyl(g, GM.olive, 0.045, 0.34, [0, 0.01, -0.25]);               // canna grossa
  cyl(g, GM.dark, 0.05, 0.03, [0, 0.01, -0.43]);                 // bocca
  sk(cyl(g, GM.metal, 0.06, 0.12, [0, -0.01, -0.04]));               // tamburo
  box(g, GM.dark, [0.035, 0.1, 0.045], [0, -0.09, 0.06], 0.25);  // impugnatura
  box(g, GM.dark, [0.03, 0.09, 0.04], [0, -0.07, -0.22]);        // impugnatura davanti
  sk(box(g, GM.olive, [0.04, 0.08, 0.2], [0, -0.03, 0.2]));          // calcio
  box(g, GM.accent, [0.01, 0.05, 0.01], [0, 0.075, -0.3]);       // mirino
  return finish(g, [0, 0.01, -0.45], [0.16, -0.17, -0.5]);
}

function bazooka() {
  // tubo più corto e tenuto basso a destra, sulla spalla: non deve coprire il centro dello schermo
  const g = new THREE.Group();
  cyl(g, GM.olive, 0.05, 0.62, [0, 0.03, -0.12]);                // tubo
  sk(cyl(g, GM.dark, 0.057, 0.045, [0, 0.03, -0.42]));           // anello davanti
  sk(cyl(g, GM.dark, 0.057, 0.045, [0, 0.03, 0.16]));            // anello dietro
  box(g, GM.dark, [0.032, 0.09, 0.04], [0, -0.06, -0.02], 0.2);  // impugnatura
  box(g, GM.dark, [0.028, 0.08, 0.036], [0, -0.05, -0.24]);
  box(g, GM.accent, [0.026, 0.045, 0.045], [-0.055, 0.07, -0.2]); // mirino laterale
  sk(box(g, GM.sand, [0.105, 0.018, 0.018], [0, 0.03, -0.3]));   // striscia
  return finish(g, [0, 0.03, -0.44], [0.2, -0.19, -0.36]);
}

/* ---------- Fase 12: arsenale folle ---------- */
const steel = mat(0xc9d1da, { metalness: 0.6, roughness: 0.3 });
const gold = mat(0xd4a017, { metalness: 0.5, roughness: 0.35 });
const rayGreen = glowMat(new THREE.MeshBasicMaterial({ color: 0x3dff6e }), 2.2);
const rayRed = mat(0xc8322a, { roughness: 0.5, metalness: 0.3 });

function knife() {
  const g = new THREE.Group(), k = new THREE.Group();
  k.rotation.set(0.35, 0.15, 0.2); // lama in avanti e un po' in alto
  g.add(k);
  sk(box(k, GM.dark, [0.03, 0.036, 0.11], [0, 0, 0.03]));     // manico
  sk(box(k, GM.metal, [0.06, 0.014, 0.02], [0, 0, -0.03]));   // guardia
  box(k, steel, [0.007, 0.034, 0.15], [0, 0.004, -0.115]);    // lama
  box(k, steel, [0.006, 0.018, 0.04], [0, 0.012, -0.205]);    // punta
  return finish(g, [0, 0.01, -0.22], [0.17, -0.16, -0.36]);
}

function sword() {
  const g = new THREE.Group(), k = new THREE.Group();
  k.rotation.set(0.95, 0.2, 0.35); // lama alta, inclinata verso il centro
  g.add(k);
  sk(box(k, GM.wood, [0.03, 0.03, 0.14], [0, 0, 0.07]));      // impugnatura
  box(k, gold, [0.045, 0.045, 0.035], [0, 0, 0.15]);         // pomolo
  sk(box(k, gold, [0.17, 0.022, 0.03], [0, 0, -0.01]));       // elsa
  box(k, steel, [0.012, 0.05, 0.72], [0, 0, -0.39]);          // lama
  box(k, steel, [0.01, 0.028, 0.06], [0, 0, -0.78]);          // punta
  return finish(g, [0, 0, -0.8], [0.22, -0.24, -0.42]);
}

function burstRifle() {
  const g = new THREE.Group();
  box(g, GM.metal, [0.05, 0.072, 0.3], [0, 0, -0.08]);          // corpo
  sk(box(g, GM.dark, [0.056, 0.058, 0.2], [0, -0.004, -0.3]));  // paramano
  cyl(g, GM.dark, 0.011, 0.16, [0, 0.012, -0.47]);              // canna
  sk(box(g, GM.accent, [0.054, 0.012, 0.12], [0, 0.042, -0.1])); // striscia rossa
  box(g, GM.dark, [0.03, 0.13, 0.05], [0, -0.09, -0.13], -0.1); // caricatore
  box(g, GM.dark, [0.035, 0.1, 0.045], [0, -0.08, 0.03], 0.25); // impugnatura
  sk(box(g, GM.metal, [0.045, 0.08, 0.2], [0, -0.02, 0.18]));   // calcio
  for (let i = 0; i < 3; i++) box(g, GM.accent, [0.004, 0.012, 0.012], [0.03, 0, -0.34 + i * 0.03]); // tre puntini sul fianco
  sights(g, 0.062, 0.04, 0.036, -0.38, 0.025, 0.2);
  return finish(g, [0, 0.012, -0.56], [0.16, -0.17, -0.52]);
}

/** Una mitraglietta dell'uzi doppia, in un gruppo tutto suo (side = 1 destra, -1 sinistra). */
const UZI_X = 0.17, UZI_X_AIM = 0.1; // quando si mira le due armi si avvicinano al centro
function uziGun(g, side) {
  const k = new THREE.Group();
  k.position.x = side * UZI_X;
  g.add(k);
  sk(box(k, GM.dark, [0.042, 0.062, 0.2], [0, 0, -0.06]));     // corpo
  box(k, GM.metal, [0.044, 0.014, 0.18], [0, 0.036, -0.06]);    // coperchio
  cyl(k, GM.metal, 0.009, 0.06, [0, 0.008, -0.19]);             // canna
  box(k, GM.dark, [0.03, 0.16, 0.036], [0, -0.1, -0.02], 0.12); // impugnatura con caricatore
  sk(box(k, GM.accent, [0.012, 0.012, 0.012], [-side * 0.01, 0.05, -0.13])); // mirino
  return k;
}
function uzi() {
  const g = new THREE.Group();
  const gr = uziGun(g, 1), gl = uziGun(g, -1);
  const m = finish(g, [0, 0.008, -0.23], [0, -0.17, -0.4]);
  // ogni bocca sta nel gruppo della sua arma; le due armi sparano a turno (altMuzzle)
  const u = m.userData, m2 = new THREE.Object3D(), f2 = u.flash.clone();
  gr.add(u.muzzle);
  m2.position.copy(u.muzzle.position);
  m2.add(f2);
  gl.add(m2);
  u.muzzles = [u.muzzle, m2]; u.flashes = [u.flash, f2]; u.side = 0;
  u.guns = [gr, gl];
  return m;
}

function raygun() {
  const g = new THREE.Group();
  sk(cyl(g, rayRed, 0.034, 0.2, [0, 0.015, -0.06]));            // corpo
  cyl(g, GM.metal, 0.045, 0.05, [0, 0.015, 0.05]);              // retro
  for (let i = 0; i < 3; i++) cyl(g, rayGreen, 0.046 - i * 0.004, 0.014, [0, 0.015, -0.14 - i * 0.04]); // anelli
  sk(cyl(g, GM.metal, 0.02, 0.12, [0, 0.015, -0.22]));          // canna
  cyl(g, rayGreen, 0.024, 0.02, [0, 0.015, -0.285]);            // punta luminosa
  part(g, new THREE.IcosahedronGeometry(1, 0), rayGreen, [0.026, 0.026, 0.026], [0.038, 0.04, -0.02]); // bulbo (sul fianco: non copre le tacche)
  sights(g, 0.075, 0.05, 0.06, -0.24, 0.035, 0.24);
  box(g, GM.dark, [0.032, 0.1, 0.045], [0, -0.07, 0.03], 0.3);  // impugnatura
  sk(box(g, GM.metal, [0.008, 0.035, 0.05], [0, -0.035, -0.03])); // ponticello
  return finish(g, [0, 0.015, -0.3], [0.16, -0.16, -0.42]);
}

/** Stesso ordine di WEAPONS in defs.js. */
export const models = [pistol(), shotgun(), smg(), rifle(), sniper(), launcher(), bazooka(), knife(), sword(), burstRifle(), uzi(), raygun()];

/* ---------- Animazione ---------- */
const anim = {
  current: 0,
  kick: 0,      // rinculo dell'arma mostrato (segue kickTarget in modo morbido)
  kickTarget: 0,
  draw: 0,      // 1 = appena estratta (in basso), 0 = pronta
  reload: 0,    // 0..1 avanzamento della ricarica (0 = non sta ricaricando)
  flash: 0,
  bobT: 0,
  bobAmt: 0,
  speed: 0,     // velocità del giocatore filtrata
  lookVX: 0,    // velocità di rotazione della visuale filtrata (rad/s)
  lookVY: 0,
  swayX: 0,
  swayY: 0,
  t: 0,         // tempo (respiro quando si sta fermi)
  land: 0,      // abbassamento quando si atterra da un salto
  air: false,
  run: 0,       // 0..1 quanto si sta correndo (arma più bassa e inclinata)
  swing: 0,     // fendente (coltello, spada): secondi rimasti
  swingDur: 0.3,
  swingDir: 1,
  aim: 0,       // mira di precisione: 0 = normale, 1 = arma al centro (vedi setAimAmount)
};

let hidden = false;
export function showModel(i) {
  models.forEach((m, k) => { m.visible = k === i && !hidden; });
  anim.current = i;
  anim.draw = 1;
}
/** Colori del potenziatore: livello 0 normale, 1 strisce viola, 2 viola e arancione alternate. */
export function setSkin(i, level) {
  const list = models[i].userData.skin;
  list.forEach((p, k) => { p.m.material = level === 0 ? p.mat : level === 1 ? SKIN[0] : SKIN[k % 2]; });
}
/** Nasconde l'arma (mentre si guarda nel mirino del cecchino). */
export function hideModel(on) {
  hidden = on;
  models.forEach((m, k) => { m.visible = k === anim.current && !hidden; });
}
export function kickModel(amount) {
  anim.kickTarget = Math.min(0.2, anim.kickTarget + amount);
  anim.flash = 0.05;
  const f = models[anim.current].userData.flash;
  f.rotation.z = Math.random() * Math.PI;
}
/** Fendente delle armi corpo a corpo: dur = durata (s), dir = 1 da destra a sinistra, -1 al contrario. */
export function swingModel(dur, dir) { anim.swing = anim.swingDur = dur; anim.swingDir = dir; }
/** Uzi doppia: il prossimo colpo parte dall'altra mano. */
export function altMuzzle() {
  const u = models[anim.current].userData;
  if (!u.muzzles) return;
  u.flash.visible = false;
  u.side = 1 - u.side;
  u.muzzle = u.muzzles[u.side];
  u.flash = u.flashes[u.side];
}
export function setReloadProgress(p) { anim.reload = p; }
/** Mira di precisione: p da 0 (normale) a 1 (si guarda attraverso le tacche). */
export function setAimAmount(p) { anim.aim = p; }

const tmp = new THREE.Vector3();
/** Posizione della bocca dell'arma nel mondo (per far partire le scie). */
export function muzzleWorld(out) {
  syncToCamera();
  return models[anim.current].userData.muzzle.getWorldPosition(out);
}

/**
 * speed: velocità orizzontale del giocatore; lookDX/DY: quanto ha girato la visuale.
 */
export function updateViewModel(dt, speed, grounded, lookDX, lookDY) {
  const m = models[anim.current], u = m.userData;
  if (dt > 0) {
    // Tutto passa da filtri "morbidi": i tocchi e il mouse arrivano a scatti irregolari,
    // e usarli direttamente farebbe vibrare l'arma.
    const f = (rate) => 1 - Math.exp(-dt * rate);
    anim.kickTarget *= Math.exp(-dt * 12);
    anim.kick += (anim.kickTarget - anim.kick) * f(35);
    anim.draw = Math.max(0, anim.draw - dt / 0.3);
    anim.flash -= dt;
    anim.speed += ((grounded ? speed : 0) - anim.speed) * f(6);
    anim.bobAmt = Math.min(1, anim.speed / 5.5);
    anim.bobT += dt * (5 + anim.speed * 0.8);
    anim.lookVX += (lookDX / dt - anim.lookVX) * f(8);
    anim.lookVY += (lookDY / dt - anim.lookVY) * f(8);
    const tx = Math.max(-0.025, Math.min(0.025, anim.lookVX * 0.006));
    const ty = Math.max(-0.025, Math.min(0.025, anim.lookVY * 0.006));
    anim.swayX += (tx - anim.swayX) * f(10);
    anim.swayY += (ty - anim.swayY) * f(10);
    anim.t += dt;
    if (!grounded) anim.air = true;
    else if (anim.air) { anim.air = false; anim.land = 1; }
    anim.land = Math.max(0, anim.land - dt * 4);
    anim.run += ((anim.speed > 7 ? 1 : 0) - anim.run) * f(6);
    anim.swing = Math.max(0, anim.swing - dt);
  }

  const r = anim.reload > 0 ? Math.sin(anim.reload * Math.PI) : 0;
  const d = anim.draw * anim.draw;
  const aim = anim.aim * anim.aim * (3 - 2 * anim.aim); // transizione morbida
  const calm = 1 - 0.85 * aim; // mirando l'arma ondeggia molto meno
  // respiro da fermi (sparisce camminando), atterraggio che spinge giù, corsa: arma bassa e inclinata
  const still = 1 - anim.bobAmt;
  const breath = Math.sin(anim.t * 1.7) * 0.0022 * still * calm;
  const land = Math.sin(anim.land * Math.PI) * 0.03 * calm;
  const run = anim.run * (1 - r);
  const bob = anim.bobAmt * calm;
  m.position.set(
    u.base.x + Math.sin(anim.bobT) * 0.009 * bob + anim.swayX * 0.5 * calm + run * 0.025,
    u.base.y - (1 - Math.cos(anim.bobT * 2)) * 0.005 * bob - d * 0.3 - r * 0.07 + anim.swayY * 0.5 * calm + breath - land - run * 0.03,
    u.base.z + anim.kick * 0.4 + run * 0.02,
  );
  m.rotation.set(
    anim.kick * 0.9 - r * 0.5 - d * 0.6 - land * 1.2 + breath * 2 - run * 0.15,
    anim.swayX * 1.5 + run * 0.35,
    r * 0.6 + Math.sin(anim.bobT) * 0.02 * anim.bobAmt + run * 0.25,
  );

  if (anim.swing > 0) {
    // fendente: l'arma attraversa lo schermo in diagonale, con la punta in avanti a metà colpo
    const p = 1 - anim.swing / anim.swingDur, env = Math.sin(p * Math.PI);
    const ease = p * p * (3 - 2 * p), sweep = anim.swingDir * (0.9 - 1.8 * ease);
    m.rotation.y += sweep * env * 1.1;
    m.rotation.z += -sweep * env * 0.7;
    m.rotation.x += -0.55 * env;
    m.position.x += -sweep * env * 0.14 - 0.06 * env;
    m.position.z += -0.08 * env;
  }

  if (aim > 0) {
    if (u.sight) {
      // tacche allineate al centro: posizione fissa davanti all'occhio, niente rotazioni (solo un po' di rinculo)
      tmp.set(0, -u.sight.y, u.sight.z + anim.kick * 0.25);
      m.position.lerp(tmp, aim);
      m.rotation.set(m.rotation.x + (anim.kick * 0.25 - m.rotation.x) * aim, m.rotation.y * (1 - aim), m.rotation.z * (1 - aim));
    } else {
      // mira "leggera" (uzi doppia): le armi salgono un po' e si avvicinano al centro
      m.position.y += 0.025 * aim;
      m.position.z -= 0.02 * aim;
    }
  }
  if (u.guns) {
    const x = UZI_X + (UZI_X_AIM - UZI_X) * aim;
    u.guns[0].position.x = x; u.guns[1].position.x = -x;
  }

  u.flash.visible = anim.flash > 0;
  flashLight.intensity = anim.flash > 0 ? 3 : 0;

  syncToCamera();
  if (u.flash.visible) flashLight.position.copy(u.muzzle.getWorldPosition(tmp));
}
