// Renderer, scena, telecamera e luci.
import * as THREE from 'three';

export const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

// Niente antialiasing sul canvas: in Media e Alta l'immagine passa dagli effetti di schermo (core/post.js),
// che hanno il loro (MSAA o FXAA); un canvas con MSAA lì sarebbe solo lavoro sprecato a ogni frame.
export const renderer = new THREE.WebGLRenderer({
  antialias: false,
  powerPreference: 'high-performance',
});
// La risoluzione (pixel ratio) la decide la qualità grafica: vedi setRenderQuality() e core/quality.js.
renderer.setPixelRatio(Math.min(devicePixelRatio, isTouch ? 1.75 : 2));
// Le statistiche (chiamate di disegno, triangoli) si azzerano a ogni frame in main.js, non a ogni render.
renderer.info.autoReset = false;
renderer.setSize(innerWidth, innerHeight, false);
// Niente ombre in tempo reale: le stanze hanno la luce "dipinta" nei colori dei vertici
// (molto più leggero sui telefoni).
renderer.shadowMap.enabled = false;
document.body.prepend(renderer.domElement);
export const canvas = renderer.domElement;

export const scene = new THREE.Scene();
// Cielo e nebbia dello stesso colore: oltre la distanza di vista non si disegna niente (la nebbia lo nasconde).
// La distanza dipende dalla qualità grafica (Bassa 46 m, Media 58 m, Alta 70 m).
const SKY = 0xc4dbe8;
let viewDist = 58, fogNear = 16, skyK = 0;
scene.background = new THREE.Color(SKY);
scene.fog = new THREE.Fog(SKY, fogNear, viewDist - 3);

export const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, viewDist);
/**
 * Telecamera dell'arma in prima persona: stessa posizione della telecamera del mondo ma campo
 * visivo sempre normale, così lo zoom della mira non ingrandisce l'arma (vedi syncWeaponCamera).
 */
export const weaponCamera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.02, 10);
weaponCamera.matrixAutoUpdate = false;
weaponCamera.matrixWorldAutoUpdate = false;
export function syncWeaponCamera() {
  weaponCamera.matrixWorld.copy(camera.matrixWorld);
  weaponCamera.matrixWorldInverse.copy(camera.matrixWorldInverse);
}

/**
 * Vista "dall'alto" (k da 0 a 1): seduti in cima alle giostre la nebbia si allontana
 * e si vede tutta la mappa. La chiamano le giostre (game/rides.js).
 */
export function setSkyView(k) {
  skyK = k;
  scene.fog.near = fogNear + 30 * k;
  scene.fog.far = viewDist - 3 + 55 * k;
  camera.far = viewDist + 55 * k;
  camera.updateProjectionMatrix();
}

/**
 * Qualità grafica: pixelRatio = risoluzione, dist = distanza di vista (m),
 * maxPixels = tetto ai pixel disegnati (milioni): su schermi grandi la risoluzione scende un po'
 * invece di far crollare gli fps (il lavoro della scheda grafica cresce con i pixel).
 */
let wantPR = 1, maxPixels = Infinity;
function applyPixelRatio() {
  const [w, h] = viewSize();
  const pr = Math.min(devicePixelRatio || 1, wantPR, Math.sqrt(maxPixels * 1e6 / (w * h)));
  if (Math.abs(renderer.getPixelRatio() - pr) > 0.01) {
    renderer.setPixelRatio(pr);
    lastW = 0; // ridimensiona il canvas alla nuova risoluzione
    fitCamera();
  }
}
export function setRenderQuality(pixelRatio, dist, megapixels = Infinity) {
  wantPR = pixelRatio;
  maxPixels = megapixels;
  applyPixelRatio();
  viewDist = dist;
  fogNear = Math.round(dist * 0.28);
  setSkyView(skyK);
}
camera.rotation.order = 'YXZ';

// Dalla r155 Three.js usa intensità "fisiche": i valori del prototipo vanno moltiplicati circa per π.
// Luce per gli oggetti che si muovono (la mappa ha la luce dipinta nei vertici): cielo azzurro sopra,
// erba sotto, sole caldo. Le ombre in tempo reale si accendono solo in qualità Alta (core/quality.js).
export const hemi = new THREE.HemisphereLight(0xdcecff, 0x66784a, 2.4);
scene.add(hemi);
export const sun = new THREE.DirectionalLight(0xffe9c8, 3.2);
sun.castShadow = false;
const SM = isTouch ? 1024 : 2048;
sun.shadow.mapSize.set(SM, SM);
Object.assign(sun.shadow.camera, { left: -22, right: 22, top: 22, bottom: -22, near: 1, far: 110 });
sun.shadow.camera.updateProjectionMatrix();
sun.shadow.bias = -0.0006;
sun.shadow.normalBias = 0.02;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.shadowMap.autoUpdate = false; // la mappa delle ombre si ridisegna un frame sì e uno no (main.js)
scene.add(sun, sun.target);

/** Ombre in tempo reale (solo qualità Alta). Cambiarle fa ricompilare i materiali. */
export function setShadows(on) {
  if (renderer.shadowMap.enabled === on) return;
  renderer.shadowMap.enabled = on;
  sun.castShadow = on;
  scene.traverse((o) => { if (o.material) for (const m of [].concat(o.material)) m.needsUpdate = true; });
}

/**
 * Tiene la luce del sole (e la sua mappa delle ombre) centrata sul giocatore.
 * Il centro viene "agganciato" alla griglia dei pixel della mappa delle ombre:
 * così i bordi delle ombre non sfarfallano mentre ci si muove.
 */
const SUN_OFFSET = new THREE.Vector3(15, 30, 12);
const sunFwd = new THREE.Vector3(), sunRight = new THREE.Vector3(), sunUp = new THREE.Vector3();
/** Direzione da cui arriva la luce (sole o luna), come spostamento dal giocatore. Cambia con l'ora del giorno. */
export function setSunOffset(x, y, z) {
  SUN_OFFSET.set(x, y, z).setLength(40);
  sunFwd.copy(SUN_OFFSET).normalize().negate();
  sunRight.crossVectors(sunFwd, new THREE.Vector3(0, 1, 0)).normalize();
  sunUp.crossVectors(sunRight, sunFwd);
}
setSunOffset(15, 30, 12);
const TEXEL = 44 / SM;
const snapped = new THREE.Vector3();
export function followSun(x, z) {
  const a = Math.round((x * sunRight.x + z * sunRight.z) / TEXEL) * TEXEL;
  const b = Math.round((x * sunUp.x + z * sunUp.z) / TEXEL) * TEXEL;
  const d = x * sunFwd.x + z * sunFwd.z;
  snapped.copy(sunRight).multiplyScalar(a).addScaledVector(sunUp, b).addScaledVector(sunFwd, d);
  sun.target.position.copy(snapped);
  sun.position.copy(snapped).add(SUN_OFFSET);
}

/**
 * Campo visivo: 70° in verticale, ma su schermi molto larghi (telefono in orizzontale)
 * limitiamo quello orizzontale a circa 100°, altrimenti l'immagine sembra "a occhio di pesce".
 */
const VFOV = 70, HFOV_MAX = 100;
/** Zoom della visuale (mirino del cecchino o mira di precisione): 1 = normale. lookScale rallenta lo sguardo quando si zooma. */
export const view = { zoom: 1, lookScale: 1 };
let baseFov = VFOV;
export function setZoom(z) {
  if (z === view.zoom) return;
  view.zoom = z;
  view.lookScale = 1 / z;
  applyFov();
}
function applyFov() {
  const r = THREE.MathUtils.degToRad(baseFov / 2);
  camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(r) / view.zoom));
  camera.updateProjectionMatrix();
  if (weaponCamera.fov !== baseFov || weaponCamera.aspect !== camera.aspect) {
    weaponCamera.fov = baseFov;
    weaponCamera.aspect = camera.aspect;
    weaponCamera.updateProjectionMatrix();
  }
}
/**
 * Misura vera dell'area di gioco. Su iPad (app dalla schermata Home, finestre di iPadOS)
 * innerHeight a volte è più bassa dello schermo e restava una striscia vuota in basso:
 * misuriamo il canvas, che con il CSS copre sempre tutto lo schermo.
 */
function viewSize() {
  const w = canvas.clientWidth || innerWidth, h = canvas.clientHeight || innerHeight;
  return [Math.max(1, Math.round(w)), Math.max(1, Math.round(h))];
}
/**
 * Difetto noto di iPhone/iPad nelle app aggiunte alla schermata Home: la pagina parte sotto la barra
 * in alto ma è più corta proprio dell'altezza di quella barra, e in basso resta una striscia vuota.
 * Lì allunghiamo l'area di gioco (variabile CSS --extra) della quantità che manca.
 */
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = () => navigator.standalone === true || matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches;
const probe = document.createElement('div');
probe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:env(safe-area-inset-top);visibility:hidden;pointer-events:none';
document.body.appendChild(probe);
function fixHomeScreenGap() {
  let extra = 0;
  if (isIOS && standalone()) {
    const top = probe.offsetHeight || 0;
    const landscape = innerWidth > innerHeight;
    const screenH = landscape ? Math.min(screen.width, screen.height) : Math.max(screen.width, screen.height);
    const missing = screenH - innerHeight; // quanto manca rispetto allo schermo intero
    if (top > 0 && missing > 1) extra = Math.min(top, missing);
  }
  document.documentElement.style.setProperty('--extra', extra + 'px');
}
let lastW = 0, lastH = 0;
function fitCamera() {
  fixHomeScreenGap();
  const [w, h] = viewSize();
  if (w === lastW && h === lastH) return;
  const resized = lastW !== 0;
  lastW = w; lastH = h;
  if (resized && maxPixels !== Infinity) applyPixelRatio(); // nuova misura: rifà il conto dei pixel
  const aspect = w / h;
  const deg = THREE.MathUtils.radToDeg;
  const vMax = deg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(HFOV_MAX / 2)) / aspect));
  camera.aspect = aspect;
  baseFov = Math.min(VFOV, vMax);
  applyFov();
  renderer.setSize(w, h, false); // false: la dimensione sullo schermo la decide il CSS (tutto lo schermo)
}
fitCamera();
addEventListener('resize', fitCamera);
if (window.visualViewport) visualViewport.addEventListener('resize', fitCamera);
if (window.ResizeObserver) new ResizeObserver(fitCamera).observe(canvas);
// su iPhone/iPad le misure nuove a volte arrivano un attimo dopo la rotazione
addEventListener('orientationchange', () => { setTimeout(fitCamera, 250); setTimeout(fitCamera, 800); });
