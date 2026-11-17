// Galleria volti: elenco, aggiunta dal dispositivo, eliminazione, e materiali per le teste dei nemici.
import * as THREE from 'three';
import { listFaces, addFace, deleteFace, clearFaces } from './store.js';
import { cropImage } from './crop.js';
import { proceduralFace, edgeColor } from './procedural.js';

const $ = (id) => document.getElementById(id);
let onChange = () => {};
const urls = [];

export async function countFaces() {
  return (await listFaces()).length;
}

async function render() {
  for (const u of urls) URL.revokeObjectURL(u);
  urls.length = 0;
  const faces = await listFaces();
  const grid = $('gGrid');
  grid.innerHTML = '';
  for (const f of faces) {
    const u = URL.createObjectURL(f.blob);
    urls.push(u);
    const item = document.createElement('div');
    item.className = 'face';
    item.innerHTML = `<img alt="Volto" src="${u}"><button title="Elimina" aria-label="Elimina">✕</button>`;
    item.querySelector('button').onclick = async () => { await deleteFace(f.id); render(); };
    grid.appendChild(item);
  }
  $('gEmpty').style.display = faces.length ? 'none' : 'block';
  $('gClear').style.display = faces.length ? '' : 'none';
  onChange(faces.length);
}

export function initGallery(changed) {
  onChange = changed;
  $('gClose').onclick = () => $('gallery').classList.add('hidden');
  $('gClear').onclick = async () => {
    if (confirm('Eliminare tutti i volti da questo dispositivo?')) { await clearFaces(); render(); }
  };
  $('gFile').onchange = async (e) => {
    const files = [...e.target.files];
    e.target.value = '';
    for (let i = 0; i < files.length; i++) {
      const blob = await cropImage(files[i], files.length > 1 ? `(${i + 1} di ${files.length})` : '');
      if (blob) await addFace(blob);
    }
    render();
  };
  render();
}

export function openGallery() {
  $('gallery').classList.remove('hidden');
  render();
}

/* ---------- Materiali per le teste ---------- */
let current = [];

function makeSet(canvas, side, top) {
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  const sideMat = new THREE.MeshStandardMaterial({ color: side, roughness: 0.9, flatShading: true });
  return {
    canvas,
    front: new THREE.MeshStandardMaterial({ map, roughness: 0.8 }),
    side: sideMat,
    top: top ? new THREE.MeshStandardMaterial({ color: top, roughness: 0.9, flatShading: true }) : sideMat,
  };
}

/**
 * Prepara i materiali delle teste: uno per ogni volto della galleria,
 * oppure 10 facce procedurali se la galleria è vuota.
 */
function disposeCurrent() {
  for (const s of current) {
    s.front.map.dispose(); s.front.dispose(); s.side.dispose();
    if (s.top !== s.side) s.top.dispose();
  }
  current = [];
}

async function setFromBlob(blob) {
  const bmp = await createImageBitmap(blob);
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  c.getContext('2d').drawImage(bmp, 0, 0, 256, 256);
  if (bmp.close) bmp.close();
  const side = edgeColor(c);
  const top = new THREE.Color(side).multiplyScalar(0.7);
  return makeSet(c, side, top);
}

export async function loadFaceMaterials() {
  disposeCurrent();
  const faces = await listFaces();
  for (const f of faces) {
    try { current.push(await setFromBlob(f.blob)); } catch (e) { /* immagine non leggibile: la saltiamo */ }
  }
  if (!current.length) {
    for (let i = 0; i < 10; i++) {
      const p = proceduralFace();
      current.push(makeSet(p.canvas, p.side, p.top));
    }
  }
  return current;
}

/**
 * Multiplayer (host): i volti della partita in formato JPEG, da mandare ai giocatori della stanza.
 * Vanno direttamente da dispositivo a dispositivo, mai a un server.
 */
export async function faceBuffers() {
  const out = [];
  for (const s of current) {
    // toDataURL è immediato (toBlob a volte viene rimandato dal browser)
    const bin = atob(s.canvas.toDataURL('image/jpeg', 0.85).split(',')[1]);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    out.push(bytes.buffer);
  }
  return out;
}

/** Multiplayer (client): crea i materiali dai volti ricevuti. Restano solo in memoria, mai salvati. */
export async function facesFromBuffers(buffers) {
  disposeCurrent();
  for (const b of buffers) {
    try { current.push(await setFromBlob(new Blob([b], { type: 'image/jpeg' }))); } catch (e) { /* saltato */ }
  }
  if (!current.length) {
    for (let i = 0; i < 10; i++) {
      const p = proceduralFace();
      current.push(makeSet(p.canvas, p.side, p.top));
    }
  }
  return current;
}
