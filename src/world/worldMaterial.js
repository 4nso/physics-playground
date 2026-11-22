// Materiali della geometria unita della mappa.
// - worldMat: colori dei vertici con la luce già "dipinta" (come prima), più:
//     · i pezzi che fanno luce diventano più luminosi del bianco quando c'è il bloom (attributo "glow");
//     · in qualità Alta riceve le ombre in tempo reale degli oggetti che si muovono (nemici, casse,
//       palloni, giostre), solo sulle facce rivolte verso il sole e solo vicino al giocatore.
// - aoMat: strisce d'ombra morbida alla base dei muri, che moltiplicano il colore del pavimento.
import * as THREE from 'three';
import { worldGlow } from '../core/glow.js';
import { sun } from '../core/renderer.js';

const sunDir = new THREE.Vector3();

export const worldMat = new THREE.ShaderMaterial({
  vertexColors: true,
  lights: true,
  fog: true,
  uniforms: THREE.UniformsUtils.merge([
    THREE.UniformsLib.lights,
    THREE.UniformsLib.fog,
    { sunDir: { value: new THREE.Vector3(0, 1, 0) }, shadowCenter: { value: new THREE.Vector3() }, shadowDark: { value: 0.55 } },
  ]),
  vertexShader: /* glsl */`
    #include <common>
    #include <fog_pars_vertex>
    #include <shadowmap_pars_vertex>
    attribute float glow;
    uniform float glowBoost;
    varying vec3 vCol;
    varying vec3 vWorld;
    void main() {
      vCol = color * (1.0 + glow * glowBoost);
      vec3 transformed = position;
      #include <project_vertex>
      vec4 worldPosition = modelMatrix * vec4(transformed, 1.0);
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
    void main() {
      vec3 c = vCol;
      #ifdef USE_SHADOWMAP
        // normale della faccia (geometria piatta): le facce già in ombra non si scuriscono di nuovo
        vec3 n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
        float facing = clamp(dot(n, sunDir) * 2.0, 0.0, 1.0);
        float fade = 1.0 - smoothstep(16.0, 21.0, length(vWorld.xz - shadowCenter.xz));
        float sh = getShadowMask();
        c *= mix(1.0, mix(shadowDark, 1.0, sh), facing * fade);
      #endif
      gl_FragColor = vec4(c, 1.0);
      #include <colorspace_fragment>
      #include <fog_fragment>
    }`,
});
worldMat.uniforms.glowBoost = worldGlow;

/** A ogni frame (solo con le ombre accese): direzione del sole e centro dell'area con le ombre. */
export function updateWorldMat(x, z) {
  sunDir.copy(sun.position).sub(sun.target.position).normalize();
  worldMat.uniforms.sunDir.value.copy(sunDir);
  worldMat.uniforms.shadowCenter.value.set(x, 0, z);
}

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
