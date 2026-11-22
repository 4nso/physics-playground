// Fori dei proiettili e bruciature delle esplosioni sui muri e sui pavimenti.
// Tutti in una sola mesh "a istanze" (una chiamata di disegno): piccoli quadrati appoggiati alla
// superficie che scuriscono ciò che c'è sotto (si moltiplicano con il colore, come le ombre morbide).
// Dopo un po' sbiadiscono e il posto si riusa. Solo sul mondo fisso (non su casse e nemici).
import * as THREE from 'three';
import { scene } from '../core/renderer.js';

const MAX = 120;
const LIFE = { hole: 14, burn: 25 };   // secondi prima di sparire
const FADE = 3;                        // secondi per sbiadire

const geo = new THREE.PlaneGeometry(1, 1);
const mat = new THREE.ShaderMaterial({
  fog: true,
  transparent: true,
  depthWrite: false,
  polygonOffset: true,
  polygonOffsetFactor: -4,
  polygonOffsetUnits: -4,
  blending: THREE.CustomBlending,
  blendSrc: THREE.DstColorFactor,
  blendDst: THREE.ZeroFactor,
  uniforms: THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
  vertexShader: /* glsl */`
    #include <fog_pars_vertex>
    attribute vec2 info;      // x = forza (1 → 0 mentre sbiadisce), y = tipo (0 foro, 1 bruciatura)
    varying vec2 vUv;
    varying vec2 vInfo;
    void main() {
      vUv = uv;
      vInfo = info;
      vec3 transformed = position;
      vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(transformed, 1.0);
      gl_Position = projectionMatrix * mvPosition;
      #include <fog_vertex>
    }`,
  fragmentShader: /* glsl */`
    #include <fog_pars_fragment>
    varying vec2 vUv;
    varying vec2 vInfo;
    void main() {
      vec2 p = vUv - 0.5;
      float r = length(p) * 2.0;
      float dark;
      if (vInfo.y < 0.5) {
        // foro: centro nero, alone scuro intorno
        dark = 0.92 * (1.0 - smoothstep(0.22, 0.32, r)) + 0.35 * (1.0 - smoothstep(0.3, 1.0, r));
      } else {
        // bruciatura: macchia irregolare, più scura al centro
        float a = atan(p.y, p.x);
        float edge = 0.75 + 0.18 * sin(a * 5.0 + vInfo.y * 3.0) + 0.08 * sin(a * 11.0);
        float n = 0.88 + 0.12 * sin(p.x * 23.0 + vInfo.y * 7.0) * sin(p.y * 19.0 - vInfo.y * 5.0);
        dark = 0.78 * (1.0 - smoothstep(edge * 0.3, edge, r)) * n;
      }
      float k = 1.0 - min(1.0, dark) * vInfo.x;
      vec3 c = vec3(k);
      #ifdef USE_FOG
        c = mix(c, vec3(1.0), smoothstep(fogNear, fogFar, vFogDepth));
      #endif
      gl_FragColor = vec4(c, 1.0);
    }`,
});

const mesh = new THREE.InstancedMesh(geo, mat, MAX);
const info = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 2), 2);
info.setUsage(THREE.DynamicDrawUsage);
geo.setAttribute('info', info);
mesh.count = 0;
mesh.frustumCulled = false;
mesh.renderOrder = 3;
scene.add(mesh);

const items = [];   // { age, life, kind }
let next = 0;
const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), qs = new THREE.Quaternion();
const pos = new THREE.Vector3(), scl = new THREE.Vector3(), Z = new THREE.Vector3(0, 0, 1);

/** Aggiunge un foro ('hole') o una bruciatura ('burn') nel punto, appoggiato alla superficie con questa normale. */
export function addDecal(point, normal, kind = 'hole', size) {
  const s = size || (kind === 'hole' ? 0.16 + Math.random() * 0.05 : 2.5);
  const i = next;
  next = (next + 1) % MAX;
  q.setFromUnitVectors(Z, normal);
  qs.setFromAxisAngle(Z, Math.random() * Math.PI * 2);
  q.multiply(qs);
  pos.copy(point).addScaledVector(normal, 0.012);
  m4.compose(pos, q, scl.set(s, s, s));
  mesh.setMatrixAt(i, m4);
  mesh.instanceMatrix.needsUpdate = true;
  items[i] = { age: 0, life: LIFE[kind], kind: kind === 'hole' ? 0 : 1 + Math.random() * 0.9 };
  mesh.count = Math.max(mesh.count, i + 1);
}

/** A ogni frame: invecchiano e sbiadiscono. */
export function updateDecals(dt) {
  if (!mesh.count) return;
  const a = info.array;
  for (let i = 0; i < mesh.count; i++) {
    const it = items[i];
    if (!it) continue;
    it.age += dt;
    a[i * 2] = Math.max(0, Math.min(1, (it.life - it.age) / FADE));
    a[i * 2 + 1] = it.kind;
  }
  info.needsUpdate = true;
}

/** Nuova mappa: via tutto. */
export function clearDecals() {
  items.length = 0;
  next = 0;
  mesh.count = 0;
}
