// Materiali della geometria unita della mappa.
// - worldMat: colori dei vertici con la luce già "dipinta" (come prima), più:
//     · i pezzi che fanno luce diventano più luminosi del bianco quando c'è il bloom (attributo "glow");
//     · in qualità Alta riceve le ombre in tempo reale degli oggetti che si muovono (nemici, casse,
//       palloni, giostre), solo sulle facce rivolte verso il sole e solo vicino al giocatore.
// - aoMat: strisce d'ombra morbida alla base dei muri, che moltiplicano il colore del pavimento.
import * as THREE from 'three';
import { worldGlow } from '../core/glow.js';
import { sun } from '../core/renderer.js';
import { lowFogU, LOW_FOG_GLSL } from './lowfog.js';

const sunDir = new THREE.Vector3();

export const worldMat = new THREE.ShaderMaterial({
  vertexColors: true,
  lights: true,
  fog: true,
  uniforms: THREE.UniformsUtils.merge([
    THREE.UniformsLib.lights,
    THREE.UniformsLib.fog,
    { dayTint: { value: new THREE.Color(1, 1, 1) }, sunDir: { value: new THREE.Vector3(0, 1, 0) }, shadowCenter: { value: new THREE.Vector3() }, shadowDark: { value: 0.55 } },
  ]),
  vertexShader: /* glsl */`
    #include <common>
    #include <fog_pars_vertex>
    #include <shadowmap_pars_vertex>
    attribute float glow;
    uniform float glowBoost;
    uniform vec3 dayTint;
    varying vec3 vCol;
    varying vec3 vWorld;
    void main() {
      vec3 transformed = position;
      #include <project_vertex>
      vec4 worldPosition = modelMatrix * vec4(transformed, 1.0);
      // luce del giorno (più scura e blu di notte); le cose luminose restano accese.
      // Parcheggio (x < -15) e backrooms (x > 33) sono al chiuso con le loro lampade: la notte pesa meno.
      float indoor = step(worldPosition.x, -15.0) + step(33.0, worldPosition.x);
      vec3 tint = mix(dayTint, vec3(0.78, 0.8, 0.88), 0.6 * indoor);
      // sotto terra (tunnel, sala delle candele, scalinata: dietro il cancello EXIT e sotto il livello del prato)
      // la luce è quella delle lampade e delle candele, uguale di giorno e di notte
      float under = step(36.3, worldPosition.z) * step(worldPosition.y, -0.35);
      tint = mix(tint, vec3(1.0), under);
      vCol = color * mix(tint, vec3(1.0 + glow * glowBoost), min(1.0, glow * 4.0));
      vWorld = worldPosition.xyz;
      #include <shadowmap_vertex>
      #include <fog_vertex>
    }`,
  fragmentShader: /* glsl */`
    #include <common>
    #include <packing>
    #include <fog_pars_fragment>
    #include <lights_pars_begin>
    #include <shadowmap_pars_fragment>
    #include <shadowmask_pars_fragment>
    uniform vec3 sunDir;
    uniform vec3 shadowCenter;
    uniform float shadowDark;
    varying vec3 vCol;
    varying vec3 vWorld;
    ${LOW_FOG_GLSL}
    void main() {
      vec3 c = vCol;
      #ifdef USE_SHADOWMAP
        // normale della faccia (geometria piatta): le facce già in ombra non si scuriscono di nuovo
        // la mappa delle ombre si legge solo dove serve (vicino al giocatore, facce al sole):
        // altrove si salta, ed è la maggior parte dello schermo
        vec3 n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
        float k = clamp(dot(n, sunDir) * 2.0, 0.0, 1.0) * (1.0 - smoothstep(16.0, 21.0, length(vWorld.xz - shadowCenter.xz)));
        if (k > 0.0) c *= mix(1.0, mix(shadowDark, 1.0, getShadowMask()), k);
      #endif
      gl_FragColor = vec4(c, 1.0);
      #include <colorspace_fragment>
      gl_FragColor.rgb = lowFog(gl_FragColor.rgb, vWorld); // nebbia bassa del cimitero (world/lowfog.js)
      #include <fog_fragment>
    }`,
});
worldMat.uniforms.glowBoost = worldGlow;
Object.assign(worldMat.uniforms, lowFogU); // stesse uniform di tutti i materiali con la nebbia bassa

/** A ogni frame (solo con le ombre accese): direzione del sole e centro dell'area con le ombre. */
export function updateWorldMat(x, z) {
  sunDir.copy(sun.position).sub(sun.target.position).normalize();
  worldMat.uniforms.sunDir.value.copy(sunDir);
  worldMat.uniforms.shadowCenter.value.set(x, 0, z);
}

/** Acqua: onde che si muovono, riflessi chiari che brillano, un po' trasparente. */
export const waterMat = new THREE.ShaderMaterial({
  fog: true,
  transparent: true,
  depthWrite: false,
  uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { time: { value: 0 } }]),
  vertexShader: /* glsl */`
    #include <fog_pars_vertex>
    varying vec2 vXZ;
    void main() {
      vXZ = position.xz;
      vec3 transformed = position;
      #include <project_vertex>
      #include <fog_vertex>
    }`,
  fragmentShader: /* glsl */`
    #include <fog_pars_fragment>
    uniform float time, glowBoost;
    uniform vec3 dayTint;
    varying vec2 vXZ;
    void main() {
      vec2 p = vXZ;
      float w = sin(p.x * 3.1 + time * 1.7) + sin(p.y * 2.7 - time * 1.3) + sin((p.x + p.y) * 4.3 + time * 2.4) * 0.6;
      vec3 c = mix(vec3(0.03, 0.22, 0.42), vec3(0.18, 0.62, 0.8), 0.5 + w * 0.18) * dayTint;
      float hi = smoothstep(1.55, 2.3, w);
      c += vec3(0.9, 0.97, 1.0) * hi * (0.55 + glowBoost * 0.5);
      gl_FragColor = vec4(c, 0.8 + hi * 0.2);
      #include <colorspace_fragment>
      #include <fog_fragment>
    }`,
});
waterMat.uniforms.glowBoost = worldGlow;
waterMat.uniforms.dayTint = worldMat.uniforms.dayTint;

/** A ogni frame: l'acqua si muove. */
export function tickWater(t) { waterMat.uniforms.time.value = t; }

export const aoMat = new THREE.ShaderMaterial({
  vertexColors: true,
  fog: true,
  transparent: true,
  depthWrite: false,
  side: THREE.DoubleSide,
  polygonOffset: true,
  polygonOffsetFactor: -2,
  polygonOffsetUnits: -2,
  blending: THREE.CustomBlending,
  blendSrc: THREE.DstColorFactor,
  blendDst: THREE.ZeroFactor,
  uniforms: THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
  vertexShader: /* glsl */`
    #include <fog_pars_vertex>
    varying vec3 vCol;
    void main() {
      vCol = color;
      vec3 transformed = position;
      #include <project_vertex>
      #include <fog_vertex>
    }`,
  fragmentShader: /* glsl */`
    #include <fog_pars_fragment>
    varying vec3 vCol;
    void main() {
      vec3 c = vCol;
      #ifdef USE_FOG
        float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);
        c = mix(c, vec3(1.0), fogFactor); // nella nebbia l'ombra sparisce
      #endif
      gl_FragColor = vec4(c, 1.0);
      #include <colorspace_fragment>
    }`,
});
