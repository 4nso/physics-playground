// Renderer, scena, telecamera e luci.
import * as THREE from 'three';

export const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

export const renderer = new THREE.WebGLRenderer({
  antialias: !isTouch || devicePixelRatio < 2,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(devicePixelRatio, isTouch ? 1.75 : 2));
renderer.setSize(innerWidth, innerHeight, false);
// Niente ombre in tempo reale: le stanze hanno la luce "dipinta" nei colori dei vertici
// (molto più leggero sui telefoni).
renderer.shadowMap.enabled = false;
document.body.prepend(renderer.domElement);
export const canvas = renderer.domElement;

export const scene = new THREE.Scene();
// Cielo e nebbia dello stesso colore: oltre ~55 m non si disegna niente (la nebbia lo nasconde).
const SKY = 0xc4dbe8;
export const VIEW_DIST = 58;
scene.background = new THREE.Color(SKY);
scene.fog = new THREE.Fog(SKY, 16, VIEW_DIST - 3);

export const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, VIEW_DIST);
camera.rotation.order = 'YXZ';

// Dalla r155 Three.js usa intensità "fisiche": i valori del prototipo vanno moltiplicati circa per π.
scene.add(new THREE.HemisphereLight(0xe4f3ff, 0x5a7a3a, 2.5));
export const sun = new THREE.DirectionalLight(0xfff1dc, 3.0);
sun.castShadow = false;
const SM = isTouch ? 1024 : 2048;
sun.shadow.mapSize.set(SM, SM);
Object.assign(sun.shadow.camera, { left: -22, right: 22, top: 22, bottom: -22, near: 1, far: 90 });
sun.shadow.camera.updateProjectionMatrix();
sun.shadow.bias = -0.0006;
scene.add(sun, sun.target);

/**
 * Tiene la luce del sole (e la sua mappa delle ombre) centrata sul giocatore.
 * Il centro viene "agganciato" alla griglia dei pixel della mappa delle ombre:
 * così i bordi delle ombre non sfarfallano mentre ci si muove.
 */
const SUN_OFFSET = new THREE.Vector3(15, 30, 12);
const sunFwd = SUN_OFFSET.clone().normalize().negate();
const sunRight = new THREE.Vector3().crossVectors(sunFwd, new THREE.Vector3(0, 1, 0)).normalize();
const sunUp = new THREE.Vector3().crossVectors(sunRight, sunFwd);
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
/** Zoom della visuale (mirino del cecchino): 1 = normale. lookScale rallenta lo sguardo quando si zooma. */
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
  lastW = w; lastH = h;
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
