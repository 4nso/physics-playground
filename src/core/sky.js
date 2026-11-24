// Cielo a gradiente con il sole: una sfera attorno alla telecamera, disegnata per prima e dietro a tutto.
// Il colore all'orizzonte è lo stesso della nebbia: le cose lontane sfumano nel cielo senza stacchi.
// I colori sono uniform: il passo "dal giorno alla notte" li farà cambiare con i round.
import * as THREE from 'three';
import { scene, camera, sun } from './renderer.js';
import { worldGlow } from './glow.js';

export const skyState = { stars: 0 };
export const skyColors = {
  top: new THREE.Color(0x4f8fd6),
  horizon: new THREE.Color(0xc4dbe8),
  bottom: new THREE.Color(0xa9bcc6),
  sun: new THREE.Color(0xfff0d0),
};

const uniforms = {
  top: { value: skyColors.top },
  horizon: { value: skyColors.horizon },
  bottom: { value: skyColors.bottom },
  sunCol: { value: skyColors.sun },
  sunDir: { value: new THREE.Vector3(0, 1, 0) },
  stars: { value: 0 },  // 0 di giorno, 1 di notte
  glowBoost: worldGlow,
};

const sky = new THREE.Mesh(
  new THREE.SphereGeometry(5, 24, 12),
  new THREE.ShaderMaterial({
    uniforms,
    side: THREE.BackSide,
    depthTest: false,
    depthWrite: false,
    fog: false,
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main() {
        vDir = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 top, horizon, bottom, sunCol, sunDir;
      uniform float glowBoost, stars;
      varying vec3 vDir;
      float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 c = h > 0.0 ? mix(horizon, top, pow(h, 0.55)) : mix(horizon, bottom, min(1.0, -h * 4.0));
        float s = max(dot(d, sunDir), 0.0);
        c += sunCol * (pow(s, 10.0) * 0.18 + pow(s, 90.0) * 0.35);          // alone
        c = mix(c, sunCol * (1.0 + glowBoost * 1.6), smoothstep(0.9988, 0.9993, s)); // disco
        if (stars > 0.0 && h > 0.05) {
          float st = step(0.997, hash(floor(d * 400.0)));                      // stelle
          c += vec3(0.85, 0.9, 1.0) * st * stars * smoothstep(0.05, 0.3, h);
        }
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
  }),
);
sky.renderOrder = -1000;
sky.frustumCulled = false;
sky.onBeforeRender = () => { sky.position.copy(camera.position); sky.updateMatrixWorld(); };
scene.add(sky);

/** In qualità Bassa il cielo è a tinta unita (il colore dell'orizzonte): un disegno in meno. */
export function setSkyDome(on) { sky.visible = on; }

/** A ogni frame: il sole del cielo nella direzione della luce. */
const UNDER_FOG = new THREE.Color(0x0d0b0a);
let lastUnder = 0;
export function updateSky() {
  uniforms.sunDir.value.copy(sun.position).sub(sun.target.position).normalize();
  uniforms.stars.value = skyState.stars;
  // sotto terra (tunnel, sala delle candele) la nebbia è buia, non del colore del cielo
  const u = skyState.under || 0;
  if (u !== lastUnder) { lastUnder = u; applySkyColors(); }
}

/** Dopo aver cambiato skyColors: anche la nebbia e lo sfondo prendono il colore dell'orizzonte. */
export function applySkyColors() {
  scene.fog.color.copy(skyColors.horizon).lerp(UNDER_FOG, skyState.under || 0);
  scene.background.copy(skyColors.horizon);
}
applySkyColors();
