// Texture generate con un canvas e materiali condivisi.
import * as THREE from 'three';
import { renderer } from '../core/renderer.js';

export function canvasTex(w, h, draw, rep) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  if (rep) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(rep, rep);
  }
  return t;
}

const groundTex = canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#86b94f'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#7aad46'; g.fillRect(0, 0, w / 2, h / 2); g.fillRect(w / 2, h / 2, w / 2, h / 2);
  for (let i = 0; i < 700; i++) {
    g.fillStyle = `rgba(${(40 + Math.random() * 40) | 0},${(100 + Math.random() * 60) | 0},35,0.35)`;
    g.fillRect(Math.random() * w, Math.random() * h, 2, 4);
  }
}, 100);

const crateTex = canvasTex(128, 128, (g, w, h) => {
  for (let i = 0; i < 5; i++) { g.fillStyle = i % 2 ? '#a8743a' : '#bf8b48'; g.fillRect(0, (i * h) / 5, w, h / 5); }
  g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 1;
  for (let i = 1; i < 5; i++) { g.beginPath(); g.moveTo(0, (i * h) / 5); g.lineTo(w, (i * h) / 5); g.stroke(); }
  g.strokeStyle = '#6e4520'; g.lineWidth = 12; g.strokeRect(6, 6, w - 12, h - 12);
  g.lineWidth = 10; g.beginPath(); g.moveTo(12, 12); g.lineTo(w - 12, h - 12); g.stroke();
});

const drawStone = (g, w, h) => {
  g.fillStyle = '#cfc5b4'; g.fillRect(0, 0, w, h);
  g.strokeStyle = '#a99f8e'; g.lineWidth = 2;
  for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) g.strokeRect(((c * 48 + (r ? 24 : 0)) % w) - 2, r * 32 + 1, 46, 30);
};
const stoneTex = canvasTex(128, 64, drawStone);
const wallTex = canvasTex(128, 64, drawStone);
wallTex.wrapS = wallTex.wrapT = THREE.RepeatWrapping;
wallTex.repeat.set(30, 1.2);

export const M = {
  ground: new THREE.MeshStandardMaterial({ map: groundTex, roughness: 1 }),
  crate: new THREE.MeshStandardMaterial({ map: crateTex, roughness: 0.85 }),
  stone: new THREE.MeshStandardMaterial({ map: stoneTex, roughness: 0.95 }),
  wall: new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.95 }),
  ramp: new THREE.MeshStandardMaterial({ color: 0x5d8fc9, roughness: 0.6 }),
  metal: new THREE.MeshStandardMaterial({ color: 0x3b4250, roughness: 0.4, metalness: 0.6 }),
  wreck: new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.25, metalness: 0.85 }),
  rope: new THREE.MeshStandardMaterial({ color: 0x8a6b45, roughness: 1 }),
  hill: new THREE.MeshStandardMaterial({ color: 0x6f9f48, roughness: 1, flatShading: true }),
};

export const ballMats = ['#ff5a4e', '#ffb627', '#2fbf71', '#3d8bff', '#b45cff', '#ff6fb5'].map(
  (col) => new THREE.MeshStandardMaterial({
    roughness: 0.35,
    map: canvasTex(64, 32, (g, w, h) => {
      g.fillStyle = col; g.fillRect(0, 0, w, h);
      g.fillStyle = '#fff'; g.fillRect(0, h * 0.42, w, h * 0.16);
    }),
  }),
);

export const sphereGeo = new THREE.SphereGeometry(1, 24, 16);
export const unitBox = new THREE.BoxGeometry(1, 1, 1);
