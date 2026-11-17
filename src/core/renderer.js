// Renderer, scena, telecamera e luci.
import * as THREE from 'three';

export const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

export const renderer = new THREE.WebGLRenderer({
  antialias: !isTouch || devicePixelRatio < 2,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(devicePixelRatio, isTouch ? 1.75 : 2));
renderer.setSize(innerWidth, innerHeight);
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
function fitCamera() {
  const aspect = innerWidth / innerHeight;
  const deg = THREE.MathUtils.radToDeg;
  const vMax = deg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(HFOV_MAX / 2)) / aspect));
  camera.aspect = aspect;
  camera.fov = Math.min(VFOV, vMax);
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
}
fitCamera();
addEventListener('resize', fitCamera);
// su iPhone le misure nuove a volte arrivano un attimo dopo la rotazione
addEventListener('orientationchange', () => setTimeout(fitCamera, 250));
