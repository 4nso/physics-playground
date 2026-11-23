// Effetti di schermo (qualità Media e Alta):
//  1. la scena e l'arma si disegnano in un'immagine "HDR" (colori anche più luminosi del bianco);
//     antialiasing: in Alta MSAA a 4 campioni, in Media FXAA (bordi ammorbiditi nella composizione finale,
//     più leggero);
//  2. bloom: si prende solo ciò che supera il bianco (neon, lampadine, fuoco, sole), lo si rimpicciolisce
//     a 1/4 e lo si sfoca: diventa l'alone intorno alle luci;
//  3. composizione finale: scena + alone, colori un po' più vivi e caldi, angoli appena più scuri
//     (vignettatura), conversione nei colori dello schermo.
// In qualità Bassa niente di tutto questo: si disegna direttamente sullo schermo, come prima.
import * as THREE from 'three';
import { renderer, weaponCamera, syncWeaponCamera } from './renderer.js';
import { dev } from './devmode.js';

const tri = new THREE.BufferGeometry();
tri.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
const quad = new THREE.Mesh(tri);
quad.frustumCulled = false;
const quadScene = new THREE.Scene();
quadScene.add(quad);
const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

const VERT = /* glsl */`
  varying vec2 vUv;
  void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const pass = (fragmentShader, uniforms) => new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader, uniforms, depthTest: false, depthWrite: false });

// soglia: solo ciò che è più luminoso del bianco (con un passaggio morbido) e rimpicciolimento a 1/4
const brightMat = pass(/* glsl */`
  uniform sampler2D tSrc;
  uniform vec2 texel;
  uniform float threshold;
  varying vec2 vUv;
  vec3 pick(vec2 uv) {
    vec3 c = texture2D(tSrc, uv).rgb;
    float l = max(c.r, max(c.g, c.b));
    float k = clamp((l - threshold) / 0.6, 0.0, 1.0);
    return c * k * k;
  }
  void main() {
    vec3 c = pick(vUv + texel * vec2(-1.0, -1.0)) + pick(vUv + texel * vec2(1.0, -1.0))
           + pick(vUv + texel * vec2(-1.0, 1.0)) + pick(vUv + texel * vec2(1.0, 1.0));
    gl_FragColor = vec4(min(c * 0.25, vec3(8.0)), 1.0);
  }`, { tSrc: { value: null }, texel: { value: new THREE.Vector2() }, threshold: { value: 1.05 } });

// sfocatura gaussiana a 9 punti con 5 letture (sfruttando il filtro lineare), orizzontale o verticale
const blurMat = pass(/* glsl */`
  uniform sampler2D tSrc;
  uniform vec2 dir;
  varying vec2 vUv;
  void main() {
    vec3 c = texture2D(tSrc, vUv).rgb * 0.2270270270;
    vec2 o1 = dir * 1.3846153846, o2 = dir * 3.2307692308;
    c += (texture2D(tSrc, vUv + o1).rgb + texture2D(tSrc, vUv - o1).rgb) * 0.3162162162;
    c += (texture2D(tSrc, vUv + o2).rgb + texture2D(tSrc, vUv - o2).rgb) * 0.0702702703;
    gl_FragColor = vec4(c, 1.0);
  }`, { tSrc: { value: null }, dir: { value: new THREE.Vector2() } });

export const grade = {
  bloom: { value: 0.55 },       // forza dell'alone
  exposure: { value: 1.0 },
  saturation: { value: 1.12 },
  contrast: { value: 1.06 },
  tint: { value: new THREE.Color(1.03, 1.0, 0.96) }, // un filo più caldo
  vignette: { value: 0.22 },
};
const finalMat = pass(/* glsl */`
  uniform sampler2D tScene, tBloom;
  uniform vec2 texel;
  uniform float bloom, exposure, saturation, contrast, vignette;
  uniform vec3 tint;
  varying vec2 vUv;
  // sotto 0.8 i colori restano uguali, sopra si avvicinano al bianco senza "bruciarsi"
  vec3 softClip(vec3 c) {
    vec3 x = max(c - 0.8, 0.0);
    return min(c, vec3(0.8)) + 0.2 * (1.0 - exp(-x / 0.2));
  }
  vec3 toSRGB(vec3 c) {
    return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
  }
  float luma(vec3 c) { return dot(min(c, vec3(1.0)), vec3(0.299, 0.587, 0.114)); }
  vec3 sceneColor() {
    #ifdef FXAA
      // FXAA "leggero": cerca la direzione del bordo e media lungo il bordo
      vec3 nw = texture2D(tScene, vUv + texel * vec2(-1.0, -1.0)).rgb;
      vec3 ne = texture2D(tScene, vUv + texel * vec2(1.0, -1.0)).rgb;
      vec3 sw = texture2D(tScene, vUv + texel * vec2(-1.0, 1.0)).rgb;
      vec3 se = texture2D(tScene, vUv + texel * vec2(1.0, 1.0)).rgb;
      vec3 m = texture2D(tScene, vUv).rgb;
      float lNW = luma(nw), lNE = luma(ne), lSW = luma(sw), lSE = luma(se), lM = luma(m);
      float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE)));
      float lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
      if (lMax - lMin < max(0.04, lMax * 0.12)) return m; // niente bordo: si risparmia
      vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), (lNW + lSW) - (lNE + lSE));
      float red = max((lNW + lNE + lSW + lSE) * 0.03125, 1.0 / 128.0);
      float rcp = 1.0 / (min(abs(dir.x), abs(dir.y)) + red);
      dir = clamp(dir * rcp, -8.0, 8.0) * texel;
      vec3 a = 0.5 * (texture2D(tScene, vUv - dir * 0.1667).rgb + texture2D(tScene, vUv + dir * 0.1667).rgb);
      vec3 b = a * 0.5 + 0.25 * (texture2D(tScene, vUv - dir * 0.5).rgb + texture2D(tScene, vUv + dir * 0.5).rgb);
      float lB = luma(b);
      return (lB < lMin || lB > lMax) ? a : b;
    #else
      return texture2D(tScene, vUv).rgb;
    #endif
  }
  void main() {
    vec3 c = sceneColor() + texture2D(tBloom, vUv).rgb * bloom;
    c *= exposure * tint;
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    c = max(mix(vec3(l), c, saturation), 0.0);
    c = toSRGB(softClip(c));
    c = (c - 0.5) * contrast + 0.5;
    vec2 v = vUv - 0.5;
    c *= 1.0 - vignette * smoothstep(0.25, 0.75, dot(v, v) * 2.2);
    gl_FragColor = vec4(c, 1.0);
  }`, { tScene: { value: null }, tBloom: { value: null }, texel: { value: new THREE.Vector2() }, ...grade });

let mode = 'off';           // 'off' | 'medium' | 'high'
let rtScene = null, rtA = null, rtB = null;
let w = 0, h = 0, hdr = true;
const size = new THREE.Vector2();

function hdrSupported() {
  const ext = renderer.extensions;
  return ext.has('EXT_color_buffer_float') || ext.has('EXT_color_buffer_half_float');
}

function dispose() {
  for (const rt of [rtScene, rtA, rtB]) if (rt) rt.dispose();
  rtScene = rtA = rtB = null;
  w = h = 0;
}

function ensureTargets() {
  renderer.getDrawingBufferSize(size);
  if (size.x === w && size.y === h && rtScene) return;
  dispose();
  w = size.x; h = size.y;
  const type = hdr ? THREE.HalfFloatType : THREE.UnsignedByteType;
  rtScene = new THREE.WebGLRenderTarget(w, h, { type, samples: mode === 'high' ? 4 : 0, depthBuffer: true });
  finalMat.uniforms.texel.value.set(1 / w, 1 / h);
  const bw = Math.max(1, Math.round(w / 4)), bh = Math.max(1, Math.round(h / 4));
  rtA = new THREE.WebGLRenderTarget(bw, bh, { type, depthBuffer: false });
  rtB = new THREE.WebGLRenderTarget(bw, bh, { type, depthBuffer: false });
  brightMat.uniforms.texel.value.set(1 / w, 1 / h);
}

/** Livello degli effetti: 'off' (Bassa), 'medium', 'high' (sfocatura più larga). Restituisce true se c'è l'HDR. */
export function setPost(m) {
  mode = m;
  hdr = hdrSupported();
  // senza colori HDR il bloom non può sapere cosa "brilla": prende solo i bianchi quasi pieni
  brightMat.uniforms.threshold.value = hdr ? 1.1 : 0.92;
  dispose(); // le immagini si ricreano al prossimo frame (MSAA solo in Alta)
  const fx = m === 'medium';
  if (!!finalMat.defines.FXAA !== fx) {
    if (fx) finalMat.defines.FXAA = ''; else delete finalMat.defines.FXAA;
    finalMat.needsUpdate = true;
  }
  return m !== 'off' && hdr;
}

function draw(mat, target) {
  quad.material = mat;
  renderer.setRenderTarget(target);
  renderer.render(quadScene, quadCam);
}

/** Disegna il frame: scena, poi l'arma sopra a tutto. */
export function renderFrame(scene, weaponScene, camera) {
  camera.updateMatrixWorld();
  syncWeaponCamera();
  if (mode === 'off' || dev.noPost) {
    renderer.setRenderTarget(null);
    renderer.clear();
    renderer.render(scene, camera);
    renderer.clearDepth();
    renderer.render(weaponScene, weaponCamera);
    return;
  }
  ensureTargets();
  renderer.setRenderTarget(rtScene);
  renderer.clear();
  renderer.render(scene, camera);
  renderer.clearDepth();
  renderer.render(weaponScene, weaponCamera);

  brightMat.uniforms.tSrc.value = rtScene.texture;
  draw(brightMat, rtA);
  const passes = dev.noBloom ? 0 : mode === 'high' ? 2 : 1;
  for (let i = 0; i < passes; i++) {
    const s = i + 1;
    blurMat.uniforms.tSrc.value = rtA.texture;
    blurMat.uniforms.dir.value.set(s / rtA.width, 0);
    draw(blurMat, rtB);
    blurMat.uniforms.tSrc.value = rtB.texture;
    blurMat.uniforms.dir.value.set(0, s / rtA.height);
    draw(blurMat, rtA);
  }
  finalMat.uniforms.tScene.value = rtScene.texture;
  finalMat.uniforms.tBloom.value = rtA.texture;
  const bloom = grade.bloom.value;
  if (dev.noBloom) grade.bloom.value = 0; // modalità sviluppatore: alone spento
  draw(finalMat, null);
  grade.bloom.value = bloom;
}
