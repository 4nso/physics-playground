// Modelli low-poly delle armi in prima persona.
// Vengono disegnati in una scena a parte, dopo il mondo e con la profondità azzerata,
// così l'arma non entra mai dentro i muri.
import * as THREE from 'three';
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
};
const boxGeo = new THREE.BoxGeometry(1, 1, 1);
const cylGeo = new THREE.CylinderGeometry(1, 1, 1, 6);
cylGeo.rotateX(Math.PI / 2); // asse lungo z, come le canne
const flashGeo = new THREE.OctahedronGeometry(1, 0);
const flashMat = new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.95, depthWrite: false });

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

function finish(g, muzzlePos, base) {
  const muzzle = new THREE.Object3D();
  muzzle.position.set(...muzzlePos);
  g.add(muzzle);
  const flash = new THREE.Mesh(flashGeo, flashMat);
  flash.scale.set(0.035, 0.035, 0.08);
  flash.position.z = -0.04;
  flash.visible = false;
  muzzle.add(flash);
  g.userData = { muzzle, flash, base: new THREE.Vector3(...base) };
  g.visible = false;
  viewRoot.add(g);
  return g;
}

function pistol() {
  const g = new THREE.Group();
  box(g, GM.metal, [0.036, 0.04, 0.2], [0, 0.02, -0.05]);       // carrello
  box(g, GM.dark, [0.032, 0.026, 0.16], [0, -0.012, -0.04]);     // telaio
  box(g, GM.dark, [0.03, 0.11, 0.046], [0, -0.065, 0.035], 0.25); // impugnatura
  box(g, GM.dark, [0.008, 0.03, 0.04], [0, -0.035, -0.02]);      // grilletto
  box(g, GM.accent, [0.01, 0.012, 0.012], [0, 0.046, -0.14]);    // mirino
  cyl(g, GM.dark, 0.009, 0.02, [0, 0.02, -0.155]);
  return finish(g, [0, 0.02, -0.17], [0.16, -0.155, -0.42]);
}

function shotgun() {
  const g = new THREE.Group();
  cyl(g, GM.metal, 0.016, 0.62, [0, 0.022, -0.36]);              // canna
  cyl(g, GM.dark, 0.013, 0.46, [0, -0.014, -0.29]);              // serbatoio tubolare
  box(g, GM.wood, [0.048, 0.046, 0.15], [0, -0.016, -0.3]);      // pompa
  box(g, GM.dark, [0.052, 0.072, 0.19], [0, 0.004, -0.02]);      // castello
  box(g, GM.wood, [0.04, 0.085, 0.26], [0, -0.035, 0.2], -0.12); // calcio
  box(g, GM.wood, [0.034, 0.09, 0.045], [0, -0.07, 0.07], 0.35); // impugnatura
  box(g, GM.accent, [0.008, 0.01, 0.01], [0, 0.043, -0.65]);     // mirino
  return finish(g, [0, 0.022, -0.68], [0.17, -0.18, -0.56]);
}

function smg() {
  const g = new THREE.Group();
  box(g, GM.dark, [0.05, 0.07, 0.28], [0, 0, -0.08]);            // corpo
  box(g, GM.metal, [0.052, 0.02, 0.24], [0, 0.044, -0.08]);      // coperchio
  cyl(g, GM.metal, 0.011, 0.14, [0, 0.01, -0.29]);               // canna
  box(g, GM.metal, [0.03, 0.16, 0.05], [0, -0.11, -0.12], 0.15); // caricatore
  box(g, GM.dark, [0.035, 0.1, 0.045], [0, -0.08, 0.04], 0.25);  // impugnatura
  box(g, GM.dark, [0.02, 0.05, 0.2], [0, -0.01, 0.16]);          // calcio
  box(g, GM.accent, [0.03, 0.02, 0.03], [0, 0.064, 0.0]);        // tacca di mira
  return finish(g, [0, 0.01, -0.37], [0.16, -0.165, -0.52]);
}

export const models = [pistol(), shotgun(), smg()];

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
};

export function showModel(i) {
  models.forEach((m, k) => { m.visible = k === i; });
  anim.current = i;
  anim.draw = 1;
}
export function kickModel(amount) {
  anim.kickTarget = Math.min(0.2, anim.kickTarget + amount);
  anim.flash = 0.05;
  const f = models[anim.current].userData.flash;
  f.rotation.z = Math.random() * Math.PI;
}
export function setReloadProgress(p) { anim.reload = p; }

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
  }

  const r = anim.reload > 0 ? Math.sin(anim.reload * Math.PI) : 0;
  const d = anim.draw * anim.draw;
  m.position.set(
    u.base.x + Math.sin(anim.bobT) * 0.008 * anim.bobAmt + anim.swayX * 0.5,
    u.base.y - (1 - Math.cos(anim.bobT * 2)) * 0.004 * anim.bobAmt - d * 0.3 - r * 0.07 + anim.swayY * 0.5,
    u.base.z + anim.kick * 0.4,
  );
  m.rotation.set(anim.kick * 0.9 - r * 0.5 - d * 0.6, anim.swayX * 1.5, r * 0.6);

  u.flash.visible = anim.flash > 0;
  flashLight.intensity = anim.flash > 0 ? 3 : 0;

  syncToCamera();
  if (u.flash.visible) flashLight.position.copy(u.muzzle.getWorldPosition(tmp));
}
