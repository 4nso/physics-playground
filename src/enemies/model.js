// Modello low-poly del nemico (blocchi) con animazione di camminata e attacco.
import * as THREE from 'three';
import { addLowFog } from '../world/lowfog.js';
import { camera } from '../core/renderer.js';
import { world, RAPIER } from '../core/physics.js';

const box = (w, h, d, oy = 0) => {
  const g = new THREE.BoxGeometry(w, h, d);
  if (oy) g.translate(0, oy, 0);
  g.userData.size = [w, h, d];
  g.userData.offsetY = oy;
  return g;
};
/* Testa "bobblehead": un ovale grande il doppio di una testa normale. La faccia (foto) copre tutta
   la metà davanti con una proiezione piatta, così da davanti si vede la foto intera, non deformata.
   Gruppi di materiali: 0 = faccia, 1 = lati, 2 = sopra. */
const HEAD_R = [0.44, 0.48, 0.4];      // semiassi (x, y, z): circa il doppio della testa di prima
const NECK_Y = 1.54;                    // collo: cima del busto
function headGeometry() {
  const g = new THREE.SphereGeometry(1, 18, 12);
  const pos = g.attributes.position, uv = g.attributes.uv, idx = g.index.array;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, 0.5 + pos.getX(i) * 0.5, 0.5 + pos.getY(i) * 0.5);
  const lists = [[], [], []];
  for (let t = 0; t < idx.length; t += 3) {
    let cy = 0, cz = 0;
    for (let k = 0; k < 3; k++) { cy += pos.getY(idx[t + k]); cz += pos.getZ(idx[t + k]); }
    cy /= 3; cz /= 3;
    const grp = cz > 0.02 ? 0 : cy > 0.45 ? 2 : 1;
    lists[grp].push(idx[t], idx[t + 1], idx[t + 2]);
  }
  g.setIndex([...lists[0], ...lists[1], ...lists[2]]);
  g.clearGroups();
  g.addGroup(0, lists[0].length, 0);
  g.addGroup(lists[0].length, lists[1].length, 1);
  g.addGroup(lists[0].length + lists[1].length, lists[2].length, 2);
  g.scale(HEAD_R[0], HEAD_R[1], HEAD_R[2]);
  g.userData.size = [HEAD_R[0] * 2, HEAD_R[1] * 2, HEAD_R[2] * 2];
  g.userData.offsetY = 0;
  return g;
}
/** Elmo del corazzato: una calotta appena più grande della testa. */
function capGeometry() {
  const g = new THREE.SphereGeometry(1, 14, 5, 0, Math.PI * 2, 0, Math.PI * 0.4);
  g.scale(HEAD_R[0] * 1.08, HEAD_R[1] * 1.08, HEAD_R[2] * 1.12);
  g.userData.size = [HEAD_R[0] * 2.1, 0.34, HEAD_R[2] * 2.2];
  g.userData.offsetY = HEAD_R[1] * 0.68;
  return g;
}
/** Le teste non crescono quanto il corpo nei nemici grossi (altrimenti sbattono contro i soffitti). */
// Il boss invece ha un testone enorme (bigHead), che si schiaccia sotto i soffitti bassi (fitHead).
const headScale = (v) => (v.bigHead || (v.scale > 1 ? Math.pow(v.scale, -0.75) : 1));
/** Altezza della cima della testa da terra per questa variante (per barra della vita e nome). */
export const topOf = (v) => v.scale * (NECK_Y + HEAD_R[1] * 2 * headScale(v));

const GEO = {
  leg: box(0.22, 0.8, 0.24, -0.4),
  arm: box(0.17, 0.7, 0.19, -0.33),
  torso: box(0.6, 0.72, 0.32),
  head: headGeometry(),
  // pezzi in più dei nemici speciali
  helmet: capGeometry(),
  chest: box(0.66, 0.5, 0.1),
  pad: box(0.3, 0.14, 0.32),
  horn: box(0.09, 0.26, 0.09),
};

const mat = (color) => new THREE.MeshLambertMaterial({ color, flatShading: true });
export const VARIANTS = {
  base: { shirt: mat(0x4f7cc9), pants: mat(0x3b3b4a), scale: 1, speed: 1, health: 1, damage: 10, points: 100, mass: 4 },
  fast: { shirt: mat(0xd8452f), pants: mat(0x2b2b2b), scale: 0.86, speed: 1.6, health: 0.6, damage: 7, points: 150, mass: 3 },
  big: { shirt: mat(0x5d8a3a), pants: mat(0x4a3b2a), scale: 1.45, speed: 0.62, health: 3.2, damage: 22, points: 300, mass: 14 },
  // corazzato: lento e resistentissimo, con elmo e piastra sul petto (dal round 8)
  armored: { shirt: mat(0x6b7280), pants: mat(0x30343b), armor: mat(0xa9b1bc), scale: 1.2, speed: 0.55, health: 4.5, damage: 18, points: 450, mass: 12 },
  // boss: uno ogni 5 round, grande, con corna e spalline
  boss: { shirt: mat(0x4a1f5c), pants: mat(0x1d1424), armor: mat(0xd4a017), scale: 1.65, speed: 0.8, health: 14, damage: 25, points: 2500, mass: 40, bigHead: 1.35 },
};
/** Materiale bianco usato per un attimo quando il nemico viene colpito. */
export const HIT_MAT = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.6 });

/** Altezza del modello (scala 1), per posizionare la barra della vita. */
export const MODEL_HEIGHT = NECK_Y + HEAD_R[1] * 2;

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
  // ruolo di ogni pezzo per la versione zombi (vedi setZombie)
  legL.userData.role = legR.userData.role = 'pants';
  armL.userData.role = armR.userData.role = 'arm';
  // le braccia (tese in avanti, sottili) non fanno ombra: quasi non si vedrebbe e sono 2 disegni in meno
  // per nemico nella mappa delle ombre (fase 12)
  armL.castShadow = armR.castShadow = false;
  const torso = mesh(GEO.torso, v.shirt, 0, 1.18, 0);
  torso.userData.role = 'shirt';
  // Testa: perno sul collo (così dondola e si schiaccia come un pupazzo), faccia davanti (+z).
  // Ogni nemico ha il suo materiale della faccia (stessa texture), per poterla colorare di rosso.
  const neck = pivot(0, NECK_Y);
  const hs = headScale(v);
  const holder = new THREE.Group();
  holder.scale.setScalar(hs);
  neck.add(holder);
  const faceMat = faceSet.front.clone();
  const head = new THREE.Mesh(GEO.head, [faceMat, faceSet.side, faceSet.top]);
  head.position.set(0, HEAD_R[1], 0);
  head.castShadow = true;
  head.userData.head = true;
  head.userData.ownMat = faceMat;
  holder.add(head);
  const parts = [legL, legR, armL, armR, torso, head];
  if (variant === 'armored' || v === VARIANTS.armored) {
    parts.push(mesh(GEO.helmet, v.armor, 0, HEAD_R[1], -0.01, holder), mesh(GEO.chest, v.armor, 0, 1.22, 0.2));
  }
  if (variant === 'boss' || v === VARIANTS.boss) {
    const hl = mesh(GEO.horn, v.armor, -0.26, HEAD_R[1] * 1.9, 0, holder), hr = mesh(GEO.horn, v.armor, 0.26, HEAD_R[1] * 1.9, 0, holder);
    hl.rotation.z = 0.45; hr.rotation.z = -0.45;
    hl.scale.setScalar(1.5); hr.scale.setScalar(1.5);
    parts.push(hl, hr, mesh(GEO.pad, v.armor, -0.42, 1.55, 0), mesh(GEO.pad, v.armor, 0.42, 1.55, 0));
  }
  // nome dell'amico sopra la testa (si vede solo da vicino; quello del boss, grande, anche da lontano)
  let tag = null, tagDist2 = 11 * 11;
  if (faceSet.tagMat) {
    tag = new THREE.Sprite(faceSet.tagMat);
    const big = v.bigHead ? 2.2 : 1;
    tag.scale.set(1.3 * big, 0.325 * big, 1);
    tag.position.y = HEAD_R[1] * 2 + 0.3 * big;
    tag.visible = false;
    holder.add(tag);
    if (v.bigHead) tagDist2 = 45 * 45;
  }

  return {
    group, inner, v, holder, hs, fitT: 0, faceSet, zombie: false,
    parts, head, faceMat, tag, tagDist2,
    pivots: { hipL, hipR, shL, shR, neck },
    squash: 0, t: Math.random() * 10,
  };
}

const tmpV = new THREE.Vector3();

/** Altezza attuale della cima della testa da terra (per la barra della vita). */
export const modelTop = (m) => m.v.scale * (NECK_Y + HEAD_R[1] * 2 * m.holder.scale.y);

/* Testone del boss: sotto un soffitto basso (parcheggio, backrooms) si rimpicciolisce, all'aperto torna enorme. */
const upRay = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 });
const ONLY_STATIC = RAPIER.QueryFilterFlags.EXCLUDE_DYNAMIC | RAPIER.QueryFilterFlags.EXCLUDE_KINEMATIC;
/** x, feetY, z = posizione dei piedi. Da chiamare ogni frame per i modelli con bigHead. */
export function fitHead(m, x, feetY, z, dt) {
  if (!m.v.bigHead) return;
  m.fitT -= dt;
  if (m.fitT <= 0) {
    m.fitT = 0.2;
    upRay.origin.x = x; upRay.origin.y = feetY + 1; upRay.origin.z = z;
    const hit = world.castRay(upRay, 8, true, ONLY_STATIC);
    const room = hit ? hit.timeOfImpact + 1 : 99;            // spazio libero sopra i piedi
    const allowed = room - 0.12 - m.v.scale * NECK_Y;        // altezza possibile per la testa
    m.fitTarget = Math.max(0.5, Math.min(m.hs, allowed / (m.v.scale * HEAD_R[1] * 2)));
  }
  const cur = m.holder.scale.y, f = 1 - Math.exp(-dt * 6);
  m.holder.scale.setScalar(cur + ((m.fitTarget || m.hs) - cur) * f);
}

/**
 * walk: 0..1 quanto cammina; attack: 0..1 avanzamento del colpo (0 = nessun attacco).
 * dt e hp (vita 0..1) servono alla faccia che reagisce: si schiaccia quando viene colpita
 * (vedi flashModel), si allunga quando attacca, diventa rossa quando sta per morire.
 */
export function animateModel(m, phase, walk, attack, dt = 0, hp = 1) {
  // camminata da zombi: passo un po' strascicato (la gamba va avanti in fretta e torna indietro piano),
  // busto inclinato in avanti che ruota e ondeggia a ogni passo, braccia tese che ciondolano
  const sp = Math.sin(phase), cp = Math.cos(phase);
  const s = (sp + 0.25 * Math.sin(phase * 2)) * 0.65 * walk;
  m.pivots.hipL.rotation.x = s;
  m.pivots.hipR.rotation.x = -s;
  const swing = attack > 0 ? Math.sin(attack * Math.PI) * 1.4 : 0; // l'attacco: le braccia calano di colpo
  m.pivots.shL.rotation.x = -1.35 - sp * 0.3 * walk + swing;
  m.pivots.shR.rotation.x = -1.35 + sp * 0.3 * walk + swing;
  m.pivots.shL.rotation.z = -0.08 - Math.sin(phase * 2 + 1) * 0.05 * walk;
  m.pivots.shR.rotation.z = 0.08 + Math.sin(phase * 2 + 1) * 0.05 * walk;
  const lunge = attack > 0 ? Math.sin(attack * Math.PI) : 0;
  m.inner.rotation.x = 0.1 * walk + lunge * 0.22;      // in avanti (e di più quando colpisce)
  m.inner.rotation.y = sp * 0.12 * walk;               // il busto gira con il passo
  m.inner.rotation.z = cp * 0.06 * walk;               // e ondeggia da un piede all'altro
  m.inner.position.y = Math.abs(cp) * 0.06 * walk;
  if (m.zombie) {
    // zombi: barcolla di più, una gamba trascinata, un braccio più basso, testa piegata
    m.inner.rotation.z += Math.sin(phase * 0.5) * 0.12 * walk + 0.05;
    m.inner.rotation.x += 0.08;
    m.pivots.hipR.rotation.x *= 0.55;
    m.pivots.shL.rotation.x += 0.35 + Math.sin(phase * 0.7) * 0.15;
  }

  // testa che dondola come un pupazzo a molla
  m.t += dt;
  const neck = m.pivots.neck;
  neck.rotation.z = Math.sin(phase) * 0.13 * walk + Math.sin(m.t * 2.3) * 0.03;
  neck.rotation.x = Math.abs(Math.cos(phase)) * 0.08 * walk - (attack > 0 ? Math.sin(attack * Math.PI) * 0.35 : 0);
  if (m.zombie) { neck.rotation.z += 0.28; neck.rotation.x += 0.12; }
  // colpita: si schiaccia e torna su con un piccolo rimbalzo; attacco: si allunga
  if (m.squash > 0) m.squash = Math.max(0, m.squash - dt * 4.5);
  const q = m.squash, bounce = q > 0 ? Math.sin(q * Math.PI * 2.2) * q : 0;
  const a = attack > 0 ? Math.sin(attack * Math.PI) : 0;
  const sy = (1 - 0.32 * bounce) * (1 + 0.28 * a), sx = (1 + 0.22 * bounce) * (1 - 0.1 * a);
  neck.scale.set(sx, sy, sx);
  // quasi morto: la faccia pulsa di rosso
  if (m.faceMat) {
    if (hp < 0.3) {
      const p = 0.5 + 0.5 * Math.sin(m.t * 9);
      m.faceMat.color.setRGB(1, 0.55 - 0.3 * p, 0.5 - 0.3 * p);
      m.red = true;
    } else if (m.red) { m.faceMat.color.setRGB(1, 1, 1); m.red = false; }
  }
  if (m.tag) m.tag.visible = tmpV.copy(m.group.position).distanceToSquared(camera.position) < m.tagDist2;
}

export function flashModel(m, on) {
  if (on) m.squash = 1;
  for (const p of m.parts) {
    if (p.userData.head) continue;
    p.material = on ? HIT_MAT : p.userData.baseMat;
  }
}

/** Libera il materiale della faccia di questo modello (la texture è condivisa e resta). */
export function disposeModel(m) {
  if (m.faceMat) { m.faceMat.dispose(); m.faceMat = null; }
}

/* ---------- Versione zombi (cimitero, fase 15) ----------
 * Solo grafica e solo su questo dispositivo: chi è nel cimitero vede i nemici come zombi (pelle verdastra,
 * vestiti strappati, faccia pallida e verdastra con le occhiaie, camminata più barcollante). Nessun messaggio
 * di rete: in multiplayer ognuno decide per sé. */
export const zombieView = { on: false };
const SKIN = addLowFog(new THREE.MeshLambertMaterial({ color: 0x86a86e, flatShading: true }));
const zCloth = new Map();   // materiale normale (camicia/pantaloni) → versione strappata
const zSide = new WeakMap(); // materiale dei lati della testa → versione verdastra
const zFace = new WeakMap(); // texture della faccia → versione zombi

/** Stoffa strappata: il colore del vestito, più scuro e sporco, con strappi da cui si vede la pelle verde. */
function tornMaterial(base, tears) {
  let m = zCloth.get(base);
  if (m) return m;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const col = base.color.clone().lerp(new THREE.Color(0x4a3a28), 0.35).multiplyScalar(0.75);
  g.fillStyle = '#' + col.getHexString();
  g.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 6; i++) { // macchie
    g.fillStyle = `rgba(40,28,18,${0.25 + Math.random() * 0.3})`;
    g.beginPath(); g.ellipse(Math.random() * 64, Math.random() * 64, 4 + Math.random() * 9, 3 + Math.random() * 6, Math.random() * 3, 0, Math.PI * 2); g.fill();
  }
  g.fillStyle = '#6f945c';
  for (let i = 0; i < tears; i++) { // strappi seghettati
    const x = Math.random() * 64, y = Math.random() * 64, r = 5 + Math.random() * 8;
    g.beginPath();
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 2, rr = r * (k % 2 ? 0.45 : 1) * (0.7 + Math.random() * 0.5);
      g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.7);
    }
    g.fill();
  }
  // orlo in basso sfilacciato
  g.beginPath(); g.moveTo(0, 64);
  for (let x = 0; x <= 64; x += 4) g.lineTo(x, 58 - Math.random() * 7);
  g.lineTo(64, 64); g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  m = addLowFog(new THREE.MeshLambertMaterial({ map: t, flatShading: true }));
  zCloth.set(base, m);
  return m;
}

/** Lati e cima della testa: lo stesso colore, ma pallido e verdastro. */
function greenSide(mat) {
  let m = zSide.get(mat);
  if (!m) {
    m = mat.clone();
    m.color = mat.color.clone().lerp(new THREE.Color(0x8fae7a), 0.6);
    zSide.set(mat, m);
  }
  return m;
}

/** La foto con il filtro zombi: pallida e verdastra, occhiaie scure, qualche crepa. Si calcola una volta per volto. */
function zombieFace(map) {
  let t = zFace.get(map);
  if (t) return t;
  const src = map.image, W = src.width, H = src.height;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.drawImage(src, 0, 0);
  const img = g.getImageData(0, 0, W, H), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const l = d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11;
    const r = l * 0.65 + d[i] * 0.35, gg = l * 0.65 + d[i + 1] * 0.35, b = l * 0.65 + d[i + 2] * 0.35;
    d[i] = Math.min(255, r * 0.84 + 22);
    d[i + 1] = Math.min(255, gg * 0.96 + 34);
    d[i + 2] = Math.min(255, b * 0.78 + 16);
  }
  g.putImageData(img, 0, 0);
  g.globalCompositeOperation = 'multiply';
  for (const ex of [0.36, 0.64]) {
    const x = ex * W, y = 0.43 * H, r = 0.12 * W;
    const gr = g.createRadialGradient(x, y + r * 0.15, r * 0.15, x, y + r * 0.15, r);
    gr.addColorStop(0, 'rgba(70,35,80,0.95)'); gr.addColorStop(0.6, 'rgba(110,70,110,0.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(x - r, y - r, r * 2, r * 2.3);
  }
  g.globalCompositeOperation = 'source-over';
  g.strokeStyle = 'rgba(60,40,40,0.55)';
  g.lineWidth = W / 180;
  for (let k = 0; k < 3; k++) { // crepe
    let x = W * (0.2 + Math.random() * 0.6), y = H * (0.15 + Math.random() * 0.25);
    g.beginPath(); g.moveTo(x, y);
    for (let s = 0; s < 5; s++) { x += (Math.random() - 0.5) * W * 0.06; y += H * 0.03; g.lineTo(x, y); }
    g.stroke();
  }
  t = new THREE.CanvasTexture(c);
  t.colorSpace = map.colorSpace;
  t.anisotropy = map.anisotropy;
  zFace.set(map, t);
  return t;
}

/** Mette o toglie la versione zombi di un modello (i materiali sono condivisi: costa pochissimo). */
export function setZombie(m, on) {
  m.zombie = on;
  for (const p of m.parts) {
    const role = p.userData.role;
    if (!role) continue;
    if (!p.userData.normalMat) p.userData.normalMat = p.userData.baseMat;
    const n = p.userData.normalMat;
    const z = role === 'arm' ? SKIN : tornMaterial(n, role === 'shirt' ? 5 : 3);
    const flashing = p.material !== p.userData.baseMat;
    p.userData.baseMat = on ? z : n;
    if (!flashing) p.material = p.userData.baseMat;
  }
  const fs = m.faceSet;
  if (fs && m.head) {
    m.head.material = on ? [m.faceMat, greenSide(fs.side), greenSide(fs.top)] : [m.faceMat, fs.side, fs.top];
    if (m.faceMat && fs.front.map && fs.front.map.image) m.faceMat.map = on ? zombieFace(fs.front.map) : fs.front.map;
  }
}
