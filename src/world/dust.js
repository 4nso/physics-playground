// Polvere nell'aria delle backrooms: puntini chiari che fluttuano piano attorno al giocatore.
// Una sola nuvola di punti (una chiamata di disegno), visibile solo nelle backrooms e non in qualità Bassa.
import * as THREE from 'three';
import { scene, camera } from '../core/renderer.js';

const N = 160, BOX = 14;   // puntini in un cubo di 14 m che segue la telecamera
const pos = new Float32Array(N * 3), drift = new Float32Array(N * 3);
for (let i = 0; i < N; i++) {
  for (let k = 0; k < 3; k++) {
    pos[i * 3 + k] = Math.random() * BOX;
    drift[i * 3 + k] = (Math.random() - 0.5) * 0.12;
  }
  drift[i * 3 + 1] -= 0.03; // scendono piano
}
const geo = new THREE.BufferGeometry();
const attr = new THREE.BufferAttribute(new Float32Array(N * 3), 3).setUsage(THREE.DynamicDrawUsage);
geo.setAttribute('position', attr);
const dotTex = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 16;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(8, 8, 0, 8, 8, 8);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 16, 16);
  return new THREE.CanvasTexture(c);
})();
const points = new THREE.Points(geo, new THREE.PointsMaterial({
  size: 0.05, map: dotTex, color: 0xfff4c8, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending,
}));
points.frustumCulled = false;
points.visible = false;
scene.add(points);

let enabled = true;
/** In qualità Bassa niente polvere. */
export function setDust(on) { enabled = on; }

/** A ogni frame: si vede solo nelle backrooms (x > 33). */
export function updateDust(dt) {
  const cp = camera.position;
  points.visible = enabled && cp.x > 33;
  if (!points.visible) return;
  const t = performance.now() / 1000, a = attr.array;
  for (let i = 0; i < N; i++) {
    for (let k = 0; k < 3; k++) {
      const j = i * 3 + k;
      pos[j] += drift[j] * dt + (k === 0 ? Math.sin(t * 0.5 + i) * 0.01 * dt : 0);
      // ogni puntino sta in un cubo attorno alla telecamera (quando esce rientra dall'altra parte)
      const c = k === 0 ? cp.x : k === 1 ? cp.y : cp.z;
      a[j] = c - BOX / 2 + ((((pos[j] - c) % BOX) + BOX) % BOX);
    }
  }
  attr.needsUpdate = true;
}
