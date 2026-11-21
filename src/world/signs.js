// Insegne con le scritte (arco d'ingresso, bancarelle, cartelli delle giostre).
// Le zone le elencano in ctx.signs mentre si costruisce la mappa; qui diventano pannelli con una
// texture disegnata in un canvas (una per insegna, sono poche). Si ricreano a ogni nuova mappa.
import * as THREE from 'three';
import { scene } from '../core/renderer.js';

let meshes = [];

export function clearSigns() {
  for (const m of meshes) {
    scene.remove(m);
    m.geometry.dispose();
    m.material.map.dispose();
    m.material.dispose();
  }
  meshes = [];
}

/** Disegna il testo dell'insegna: s = { text, sub, w, h, fg, bg, border } */
function drawSign(s) {
  const W = 512, H = Math.max(64, Math.round((W * s.h) / s.w));
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = s.bg || '#ffcf3a';
  g.fillRect(0, 0, W, H);
  if (s.border) {
    g.strokeStyle = s.border;
    g.lineWidth = Math.max(6, H * 0.07);
    g.strokeRect(g.lineWidth / 2, g.lineWidth / 2, W - g.lineWidth, H - g.lineWidth);
  }
  g.fillStyle = s.fg || '#c0392b';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const main = s.sub ? H * 0.5 : H * 0.62;
  let size = main;
  g.font = `900 ${size}px system-ui, sans-serif`;
  const maxW = W * 0.9;
  const tw = g.measureText(s.text).width;
  if (tw > maxW) { size *= maxW / tw; g.font = `900 ${size}px system-ui, sans-serif`; }
  g.fillText(s.text, W / 2, s.sub ? H * 0.38 : H * 0.54);
  if (s.sub) {
    let sub = H * 0.22;
    g.font = `bold ${sub}px system-ui, sans-serif`;
    const sw = g.measureText(s.sub).width;
    if (sw > maxW) { sub *= maxW / sw; g.font = `bold ${sub}px system-ui, sans-serif`; }
    g.fillStyle = s.subColor || s.fg || '#333';
    g.fillText(s.sub, W / 2, H * 0.76);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Crea le insegne. list = [{ text, sub, x, y, z, w, h, rotY, fg, bg, border }] */
export function buildSigns(list) {
  clearSigns();
  for (const s of list || []) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(s.w, s.h), new THREE.MeshBasicMaterial({ map: drawSign(s) }));
    m.position.set(s.x, s.y, s.z);
    m.rotation.y = s.rotY || 0;
    m.updateMatrix();
    m.matrixAutoUpdate = false;
    scene.add(m);
    meshes.push(m);
  }
}
