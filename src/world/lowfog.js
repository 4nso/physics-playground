// Nebbia bassa del cimitero (fase 16): docs/DESIGN.md → "Correzioni e regole anti-campeggio", Nebbia.
// Prima c'erano due piani trasparenti sopra il prato: tagliavano lapidi e zombi con una linea dritta
// (un "semi-muro" invisibile). Ora la nebbia si calcola nello shader dei materiali, punto per punto:
//   - è più fitta vicino a terra e svanisce dolcemente salendo (niente bordo netto sugli oggetti);
//   - a banchi: l'altezza del banco cambia da un punto all'altro (rumore morbido) e si sposta pianissimo;
//   - sfuma ai bordi del cimitero e sotto terra; vicino alla telecamera è più leggera.
// Costo: poche operazioni e due letture di una texture 64×64 per pixel, solo dove la maschera del cimitero è > 0.
// In qualità Bassa è spenta (vedi core/quality.js); con il giocatore lontano dal cimitero la forza è 0.
import * as THREE from 'three';

/**
 * Rumore morbido già calcolato in una piccola texture che si ripete (64×64, griglia 16×16 interpolata):
 * nello shader basta leggerla due volte, invece di calcolare il rumore punto per punto.
 */
function noiseTexture() {
  const N = 64, G = 16, R = [];
  let seed = 1234567;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < G * G; i++) R.push(rnd());
  const at = (i, j) => R[((j + G) % G) * G + ((i + G) % G)];
  const sm = (t) => t * t * (3 - 2 * t);
  const data = new Uint8Array(N * N * 4);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const gx = (x / N) * G, gy = (y / N) * G, i = Math.floor(gx), j = Math.floor(gy), fx = sm(gx - i), fy = sm(gy - j);
    const v = (at(i, j) * (1 - fx) + at(i + 1, j) * fx) * (1 - fy) + (at(i, j + 1) * (1 - fx) + at(i + 1, j + 1) * fx) * fy;
    data.set([v * 255, v * 255, v * 255, 255], (y * N + x) * 4);
  }
  const t = new THREE.DataTexture(data, N, N);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = t.minFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

/** Uniform condivise da tutti i materiali che hanno la nebbia bassa. */
export const lowFogU = {
  lowFogTex: { value: noiseTexture() },
  lowFogK: { value: 0 },                              // forza (0 = spenta)
  lowFogCol: { value: new THREE.Color(0x9aa6b4) },    // colore (segue la luce del cielo)
  lowFogT: { value: 0 },                              // tempo (movimento lento dei banchi)
};

/** Codice GLSL della nebbia: lowFog(colore, posizioneNelMondo). */
export const LOW_FOG_GLSL = /* glsl */`
  uniform float lowFogK;
  uniform vec3 lowFogCol;
  uniform float lowFogT;
  uniform sampler2D lowFogTex;
  // la texture ha 16 "celle" di rumore per lato: 1 unità di p = una cella
  float lfNoise(vec2 p) { return texture2D(lowFogTex, p * 0.0625).r; }
  vec3 lowFog(vec3 c, vec3 w) {
    if (lowFogK <= 0.0) return c;
    // area del cimitero (x -25…45, z 108…180) con i bordi sfumati; sotto terra niente nebbia
    float m = smoothstep(-28.0, -20.0, w.x) * (1.0 - smoothstep(40.0, 48.0, w.x))
            * smoothstep(104.0, 113.0, w.z) * (1.0 - smoothstep(175.0, 183.0, w.z))
            * smoothstep(-1.4, -0.4, w.y);
    if (m <= 0.0 || w.y > 1.65) return c;  // sopra il banco più alto: niente da fare
    vec2 p = w.xz * 0.09 + vec2(lowFogT * 0.035, lowFogT * 0.02);
    float n = lfNoise(p) * 0.62 + lfNoise(p * 2.7 + vec2(-lowFogT * 0.05, 3.1)) * 0.38;
    float top = 0.25 + 1.35 * n;                       // altezza del banco in questo punto
    float h = 1.0 - smoothstep(-0.05, top, w.y);       // fitta in basso, sparisce salendo
    float near = mix(0.35, 1.0, smoothstep(2.0, 22.0, distance(cameraPosition.xz, w.xz)));
    float a = lowFogK * m * h * h * near * smoothstep(0.18, 0.62, n);
    return mix(c, lowFogCol, clamp(a, 0.0, 0.82));
  }
`;

/**
 * Aggiunge la nebbia bassa a un materiale di Three.js (Lambert, Basic...): calcola la posizione nel
 * mondo nel vertex shader (anche per gli InstancedMesh) e mescola il colore prima della nebbia normale.
 */
export function addLowFog(mat) {
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, lowFogU);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLfW;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        vec4 lfw = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          lfw = instanceMatrix * lfw;
        #endif
        vLfW = (modelMatrix * lfw).xyz;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vLfW;\n${LOW_FOG_GLSL}`)
      .replace('#include <fog_fragment>', 'gl_FragColor.rgb = lowFog(gl_FragColor.rgb, vLfW);\n#include <fog_fragment>');
  };
  mat.customProgramCacheKey = () => 'lowfog';
  return mat;
}

let enabled = true, devOff = false;
/** Qualità grafica: in Bassa la nebbia bassa è spenta. */
export function setLowFog(on) { enabled = on; if (!on) lowFogU.lowFogK.value = 0; }
/** Modalità sviluppatore (scheda Grafica): spegne la nebbia bassa per confrontare gli fps. */
export function setLowFogDev(off) { devOff = off; if (off) lowFogU.lowFogK.value = 0; }
export const lowFogOn = () => enabled && !devOff;

const BASE = new THREE.Color(0x9aa6b4);
/**
 * A ogni frame. want = 0..1 quanto la si vuole (1 vicino al cimitero), sky = colore della nebbia
 * del cielo (scene.fog.color), tint = luce del giorno (più scura di notte).
 */
export function updateLowFog(dt, want, sky, tint) {
  const u = lowFogU;
  u.lowFogT.value += dt;
  const target = enabled && !devOff ? want : 0;
  u.lowFogK.value += (target - u.lowFogK.value) * Math.min(1, dt * 2);
  if (u.lowFogK.value < 0.002) u.lowFogK.value = 0;
  u.lowFogCol.value.copy(BASE).multiply(tint).lerp(sky, 0.4);
}
