// Modalità sviluppatore, scheda Mondo: cose da vedere sopra la mappa (anche attraverso i muri).
//  - muro segreto: un riquadro verde e un raggio alto sul pannello finto delle backrooms
//  - punti di comparsa: colonnine rosse dove sono comparsi gli ultimi nemici
//  - percorsi dei nemici: la strada che ogni nemico sta per fare (campi di navigazione)
//  - collisioni: i contorni dei corpi fisici (Rapier) intorno al giocatore
import * as THREE from 'three';
import { scene } from '../core/renderer.js';
import { world } from '../core/physics.js';
import { map } from '../world/map.js';
import { nav, nodeAt, fields } from '../world/nav.js';
import { enemies, recentSpawns } from '../enemies/enemies.js';
import { player } from '../player/player.js';

export const overlay = { secret: false, spawns: false, paths: false, colliders: false };

const seeThrough = (color, opacity) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthTest: false, depthWrite: false, fog: false });
const lineMat = (color) => new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9, depthTest: false, depthWrite: false, fog: false });

/* ---------- Muro segreto ---------- */
let secret = null, secretSeed = -1;
function showSecret(on) {
  if (on && (!secret || secretSeed !== map.seed)) {
    if (secret) scene.remove(secret);
    secret = new THREE.Group();
    const x = map.bounds.maxX, z = map.secretZ;
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.5, 2.6, 1.8), seeThrough(0x3cff8a, 0.5));
    panel.position.set(x, 1.3, z);
    const beam = new THREE.Mesh(new THREE.BoxGeometry(0.2, 30, 0.2), seeThrough(0x3cff8a, 0.35));
    beam.position.set(x, 15, z);
    secret.add(panel, beam);
    secret.traverse((o) => { o.renderOrder = 999; });
    secretSeed = map.seed;
  }
  if (secret) { if (on) scene.add(secret); else scene.remove(secret); }
}

/* ---------- Punti di comparsa ---------- */
const pillarGeo = new THREE.CylinderGeometry(0.25, 0.25, 4, 6).translate(0, 2, 0);
const pillarMat = seeThrough(0xff4a3d, 0.55);
const pillars = [];
function updateSpawns(on) {
  for (let i = 0; i < 30; i++) {
    const s = on ? recentSpawns[i] : null;
    let m = pillars[i];
    if (!s) { if (m) m.visible = false; continue; }
    if (!m) { m = pillars[i] = new THREE.Mesh(pillarGeo, pillarMat); m.renderOrder = 998; scene.add(m); }
    m.visible = true;
    m.position.set(s.x, s.y, s.z);
    // i più vecchi più sottili
    const k = 0.4 + 0.6 * ((i + 1) / recentSpawns.length);
    m.scale.set(k, 1, k);
  }
}

/* ---------- Percorsi dei nemici ---------- */
const MAX_SEG = 20 * 30;
const pathPos = new Float32Array(MAX_SEG * 6);
const pathGeo = new THREE.BufferGeometry();
pathGeo.setAttribute('position', new THREE.BufferAttribute(pathPos, 3));
const paths = new THREE.LineSegments(pathGeo, lineMat(0xffd23a));
paths.frustumCulled = false;
paths.renderOrder = 998;
function updatePaths(on) {
  if (!on) { if (paths.parent) scene.remove(paths); return; }
  if (!paths.parent) scene.add(paths);
  let k = 0;
  for (const e of enemies) {
    if (k >= MAX_SEG) break;
    const g = e.model.group.position;
    let n = nodeAt(g.x, g.y, g.z, true);
    for (let s = 0; s < 30 && n >= 0 && k < MAX_SEG; s++) {
      // il campo (giocatore) più vicino lungo i percorsi, come fa il nemico
      let best = null, bd = Infinity;
      for (const f of fields) if (f.dist[n] < bd) { bd = f.dist[n]; best = f; }
      if (!best) break;
      const w = best.next[n];
      if (w < 0 || w === n) break;
      pathPos.set([nav.x[n], nav.y[n] + 0.25, nav.z[n], nav.x[w], nav.y[w] + 0.25, nav.z[w]], k * 6);
      k++;
      n = w;
    }
  }
  pathGeo.setDrawRange(0, k * 2);
  pathGeo.attributes.position.needsUpdate = true;
}

/* ---------- Collisioni (contorni dei corpi fisici vicini) ---------- */
const COLL_R = 22; // metri intorno al giocatore: tutta la mappa sarebbe troppo pesante da disegnare
let coll = null;
function updateColliders(on) {
  if (coll) { scene.remove(coll); coll.geometry.dispose(); coll = null; }
  if (!on) return;
  const { vertices: v, colors: c } = world.debugRender();
  const px = player.pos.x, pz = player.pos.z, R2 = COLL_R * COLL_R;
  const pos = [], col = [];
  for (let i = 0; i < v.length; i += 6) {
    const mx = (v[i] + v[i + 3]) / 2 - px, mz = (v[i + 2] + v[i + 5]) / 2 - pz;
    if (mx * mx + mz * mz > R2) continue;
    pos.push(v[i], v[i + 1], v[i + 2], v[i + 3], v[i + 4], v[i + 5]);
    const j = (i / 3) * 4;
    col.push(c[j], c[j + 1], c[j + 2], c[j + 4], c[j + 5], c[j + 6]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  coll = new THREE.LineSegments(g, collMat);
  coll.frustumCulled = false;
  coll.renderOrder = 997;
  scene.add(coll);
}
const collMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.8, depthTest: false, depthWrite: false, fog: false });

/* ---------- Ogni frame (dal pannello) ---------- */
let tSlow = 0, tColl = 0;
export function updateOverlays(dt) {
  showSecret(overlay.secret);
  tSlow -= dt; tColl -= dt;
  if (tSlow <= 0) { tSlow = 0.2; updateSpawns(overlay.spawns); updatePaths(overlay.paths); }
  if (tColl <= 0 && (overlay.colliders || coll)) { tColl = 0.5; updateColliders(overlay.colliders); }
}

/** Spegne tutto (modalità sviluppatore spenta). */
export function clearOverlays() {
  for (const k in overlay) overlay[k] = false;
  showSecret(false);
  updateSpawns(false);
  updatePaths(false);
  updateColliders(false);
}
