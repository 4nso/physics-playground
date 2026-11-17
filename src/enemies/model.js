// Modello low-poly del nemico (blocchi) con animazione di camminata e attacco.
import * as THREE from 'three';

const box = (w, h, d, oy = 0) => {
  const g = new THREE.BoxGeometry(w, h, d);
  if (oy) g.translate(0, oy, 0);
  g.userData.size = [w, h, d];
  g.userData.offsetY = oy;
  return g;
};
const GEO = {
  leg: box(0.22, 0.8, 0.24, -0.4),
  arm: box(0.17, 0.7, 0.19, -0.33),
  torso: box(0.6, 0.72, 0.32),
  head: box(0.46, 0.5, 0.44),
  // pezzi in più dei nemici speciali
  helmet: box(0.52, 0.14, 0.5),
  chest: box(0.66, 0.5, 0.1),
  pad: box(0.3, 0.14, 0.32),
  horn: box(0.09, 0.26, 0.09),
};

const mat = (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, flatShading: true });
export const VARIANTS = {
  base: { shirt: mat(0x4f7cc9), pants: mat(0x3b3b4a), scale: 1, speed: 1, health: 1, damage: 10, points: 100, mass: 4 },
  fast: { shirt: mat(0xd8452f), pants: mat(0x2b2b2b), scale: 0.86, speed: 1.6, health: 0.6, damage: 7, points: 150, mass: 3 },
  big: { shirt: mat(0x5d8a3a), pants: mat(0x4a3b2a), scale: 1.45, speed: 0.62, health: 3.2, damage: 22, points: 300, mass: 14 },
  // corazzato: lento e resistentissimo, con elmo e piastra sul petto (dal round 8)
  armored: { shirt: mat(0x6b7280), pants: mat(0x30343b), armor: mat(0xa9b1bc), scale: 1.2, speed: 0.55, health: 4.5, damage: 18, points: 450, mass: 12 },
  // boss: uno ogni 5 round, grande, con corna e spalline
  boss: { shirt: mat(0x4a1f5c), pants: mat(0x1d1424), armor: mat(0xd4a017), scale: 1.65, speed: 0.8, health: 14, damage: 25, points: 2500, mass: 40 },
};
/** Materiale bianco usato per un attimo quando il nemico viene colpito. */
export const HIT_MAT = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.6 });

/** Altezza del modello (scala 1), per posizionare la barra della vita. */
export const MODEL_HEIGHT = 2.1;

/**
 * Crea il modello. faceSet = { front, side, top } (materiali della testa).
 * Restituisce { group, parts, pivots } — le parti sono le mesh colpibili.
 */
export function buildEnemyModel(variant, faceSet) {
  const v = typeof variant === 'string' ? VARIANTS[variant] : variant;
  const group = new THREE.Group();
  const inner = new THREE.Group();
  inner.scale.setScalar(v.scale);
  group.add(inner);

  const mesh = (geo, m, x, y, z, parent = inner) => {
    const o = new THREE.Mesh(geo, m);
    o.position.set(x, y, z);
    o.castShadow = true;
    o.userData.baseMat = m;
    parent.add(o);
    return o;
  };
  const pivot = (x, y) => {
    const p = new THREE.Group();
    p.position.set(x, y, 0);
    inner.add(p);
    return p;
  };

  const hipL = pivot(-0.14, 0.82), hipR = pivot(0.14, 0.82);
  const shL = pivot(-0.4, 1.48), shR = pivot(0.4, 1.48);
  const legL = mesh(GEO.leg, v.pants, 0, 0, 0, hipL);
  const legR = mesh(GEO.leg, v.pants, 0, 0, 0, hipR);
  const armL = mesh(GEO.arm, v.shirt, 0, 0, 0, shL);
  const armR = mesh(GEO.arm, v.shirt, 0, 0, 0, shR);
  const torso = mesh(GEO.torso, v.shirt, 0, 1.18, 0);
  // Testa: la foto va sulla faccia davanti (+z); ordine BoxGeometry: +x, -x, +y, -y, +z, -z
  const head = new THREE.Mesh(GEO.head, [faceSet.side, faceSet.side, faceSet.top, faceSet.side, faceSet.front, faceSet.top]);
  head.position.set(0, 1.82, 0);
  head.castShadow = true;
  head.userData.head = true;
  inner.add(head);
  const parts = [legL, legR, armL, armR, torso, head];
  if (variant === 'armored' || v === VARIANTS.armored) {
    parts.push(mesh(GEO.helmet, v.armor, 0, 2.1, -0.02), mesh(GEO.chest, v.armor, 0, 1.22, 0.2));
  }
  if (variant === 'boss' || v === VARIANTS.boss) {
    const hl = mesh(GEO.horn, v.armor, -0.17, 2.18, 0), hr = mesh(GEO.horn, v.armor, 0.17, 2.18, 0);
    hl.rotation.z = 0.35; hr.rotation.z = -0.35;
    parts.push(hl, hr, mesh(GEO.pad, v.armor, -0.42, 1.55, 0), mesh(GEO.pad, v.armor, 0.42, 1.55, 0));
  }

  return {
    group, inner,
    parts,
    pivots: { hipL, hipR, shL, shR },
  };
}

/** walk: 0..1 quanto cammina; attack: 0..1 avanzamento del colpo (0 = nessun attacco). */
export function animateModel(m, phase, walk, attack) {
  const s = Math.sin(phase) * 0.7 * walk;
  m.pivots.hipL.rotation.x = s;
  m.pivots.hipR.rotation.x = -s;
  // braccia tese in avanti, che oscillano; durante l'attacco calano di colpo
  const swing = attack > 0 ? Math.sin(attack * Math.PI) * 1.4 : 0;
  m.pivots.shL.rotation.x = -1.35 + Math.sin(phase) * 0.18 * walk + swing;
  m.pivots.shR.rotation.x = -1.35 - Math.sin(phase) * 0.18 * walk + swing;
  m.inner.position.y = Math.abs(Math.cos(phase)) * 0.05 * walk;
}

export function flashModel(m, on) {
  for (const p of m.parts) {
    if (p.userData.head) continue;
    p.material = on ? HIT_MAT : p.userData.baseMat;
  }
}
