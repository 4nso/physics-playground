// Galleria volti: elenco, aggiunta dal dispositivo, eliminazione, e materiali per le teste dei nemici.
import * as THREE from 'three';
import { listFaces, addFace, deleteFace, clearFaces, setFaceTypes, setFaceName } from './store.js';
import { cropImage, cleanName, NAME_MAX } from './crop.js';
import { renderer } from '../core/renderer.js';
import { proceduralFace, edgeColor } from './procedural.js';

const $ = (id) => document.getElementById(id);
let onChange = () => {};
const urls = [];

/** Tipi di nemico che si possono scegliere per ogni volto (stessi nomi di enemies/model.js). */
export const FACE_TYPES = [
  { id: 'base', icon: '🔵', name: 'Base' },
  { id: 'fast', icon: '🔴', name: 'Veloce' },
  { id: 'big', icon: '🟢', name: 'Grosso' },
  { id: 'armored', icon: '🛡️', name: 'Corazzato' },
  { id: 'boss', icon: '👑', name: 'Boss' },
];
const typesLabel = (types) => (types && types.length ? types.map((t) => FACE_TYPES.find((x) => x.id === t)?.name).join(', ') : 'Tutti i nemici');

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
    const card = document.createElement('div');
    card.className = 'faceCard';
    let types = Array.isArray(f.types) ? [...f.types] : [];
    card.innerHTML = `<div class="face"><img alt="Volto" src="${u}"><button class="del" title="Elimina" aria-label="Elimina">✕</button></div>
      <input class="nameIn" maxlength="${NAME_MAX}" autocomplete="off" spellcheck="false" placeholder="Nome" aria-label="Nome">
      <div class="fTypes">${FACE_TYPES.map((t) => `<button data-t="${t.id}" title="${t.name}" aria-label="${t.name}">${t.icon}</button>`).join('')}</div>
      <div class="fLabel"></div>`;
    const paint = () => {
      card.querySelectorAll('[data-t]').forEach((b) => b.classList.toggle('on', types.includes(b.dataset.t)));
      card.querySelector('.fLabel').textContent = typesLabel(types);
    };
    paint();
    const nameIn = card.querySelector('.nameIn');
    nameIn.value = f.name || '';
    nameIn.onchange = async () => {
      nameIn.value = cleanName(nameIn.value);
      try { await setFaceName(f.id, nameIn.value); } catch (err) { /* archivio non disponibile */ }
    };
    nameIn.onkeydown = (e) => { if (e.key === 'Enter') nameIn.blur(); };
    card.querySelector('.del').onclick = async () => { await deleteFace(f.id); render(); };
    // tocca un simbolo: il volto va (o non va più) a quel tipo di nemico; nessuno scelto = tutti
    card.querySelector('.fTypes').onclick = async (e) => {
      const b = e.target.closest('[data-t]');
      if (!b) return;
      const t = b.dataset.t;
      types = types.includes(t) ? types.filter((x) => x !== t) : [...types, t];
      paint();
      try { await setFaceTypes(f.id, types); } catch (err) { /* archivio non disponibile */ }
    };
    grid.appendChild(card);
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
      const r = await cropImage(files[i], files.length > 1 ? `(${i + 1} di ${files.length})` : '');
      if (r) await addFace(r.blob, r.name);
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
const FACE = 512; // risoluzione della faccia sulla testa

/** Rende la foto più leggibile in gioco: un po' più luminosa e contrastata. */
function boost(c) {
  const g = c.getContext('2d', { willReadFrequently: true });
  const img = g.getImageData(0, 0, c.width, c.height), d = img.data;
  const lut = new Uint8ClampedArray(256);
  for (let i = 0; i < 256; i++) lut[i] = (i - 128) * 1.15 + 128 + 12;
  for (let i = 0; i < d.length; i += 4) { d[i] = lut[d[i]]; d[i + 1] = lut[d[i + 1]]; d[i + 2] = lut[d[i + 2]]; }
  g.putImageData(img, 0, 0);
}

/**
 * Texture della faccia: la foto in un ovale che copre tutto il davanti della testa,
 * con il bordo sfumato nel colore dei lati (così non si vede uno "spigolo").
 */
function faceTexture(photo, side) {
  const c = document.createElement('canvas');
  c.width = c.height = FACE;
  const g = c.getContext('2d');
  g.fillStyle = side;
  g.fillRect(0, 0, FACE, FACE);
  g.save();
  g.beginPath();
  g.ellipse(FACE / 2, FACE / 2, FACE * 0.47, FACE * 0.475, 0, 0, Math.PI * 2);
  g.clip();
  g.drawImage(photo, 0, 0, FACE, FACE);
  g.restore();
  g.strokeStyle = side;
  g.globalAlpha = 0.55;
  g.lineWidth = 10;
  g.beginPath();
  g.ellipse(FACE / 2, FACE / 2, FACE * 0.47, FACE * 0.475, 0, 0, Math.PI * 2);
  g.stroke();
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = renderer.capabilities.getMaxAnisotropy(); // nitida anche vista di sbieco
  return map;
}

/** Cartellino con il nome, da mettere sopra la testa (uno per volto, condiviso da tutti i nemici). */
function nameTagMaterial(name) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.font = 'bold 34px system-ui, sans-serif';
  const w = Math.min(248, g.measureText(name).width + 34);
  g.fillStyle = 'rgba(15,25,40,.72)';
  g.beginPath();
  if (g.roundRect) g.roundRect(128 - w / 2, 6, w, 52, 26); else g.rect(128 - w / 2, 6, w, 52);
  g.fill();
  g.fillStyle = '#ffd23f';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(name, 128, 33, 230);
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  return new THREE.SpriteMaterial({ map, depthWrite: false, fog: false });
}

/**
 * Materiali di una testa. src = foto quadrata originale (quella che si manda agli altri giocatori),
 * side/top = colori dei lati e della cima. La faccia non prende né nebbia né ombre: sempre leggibile.
 */
function makeSet(src, side, top, name = '') {
  const photo = document.createElement('canvas');
  photo.width = photo.height = FACE;
  photo.getContext('2d').drawImage(src, 0, 0, FACE, FACE);
  boost(photo);
  const sideMat = new THREE.MeshStandardMaterial({ color: side, roughness: 0.9, flatShading: true });
  return {
    canvas: src,
    name,
    tagMat: name ? nameTagMaterial(name) : null,
    front: new THREE.MeshBasicMaterial({ map: faceTexture(photo, side), fog: false }),
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
    if (s.tagMat) { s.tagMat.map.dispose(); s.tagMat.dispose(); }
  }
  current = [];
}

async function setFromBlob(blob, name) {
  const bmp = await createImageBitmap(blob);
  const c = document.createElement('canvas');
  c.width = c.height = FACE;
  c.getContext('2d').drawImage(bmp, 0, 0, FACE, FACE);
  if (bmp.close) bmp.close();
  const side = edgeColor(c);
  const top = new THREE.Color(side).multiplyScalar(0.7);
  return makeSet(c, side, top, cleanName(name));
}

export async function loadFaceMaterials() {
  disposeCurrent();
  const faces = await listFaces();
  for (const f of faces) {
    try {
      const set = await setFromBlob(f.blob, f.name);
      set.types = Array.isArray(f.types) ? f.types : [];
      current.push(set);
    } catch (e) { /* immagine non leggibile: la saltiamo */ }
  }
  // facce disegnate dal gioco: tutte "per tutti" se la galleria è vuota; altrimenti solo di riserva,
  // per i tipi di nemico a cui non è stato dato nessun volto
  const reserve = current.length > 0;
  for (let i = 0; i < (reserve ? 5 : 10); i++) {
    const p = proceduralFace();
    const set = makeSet(p.canvas, p.side, p.top);
    set.types = [];
    set.reserve = reserve;
    current.push(set);
  }
  return current;
}

/**
 * Sceglie il volto per un nemico del tipo `variant` (indice in sets):
 * prima i volti scelti per quel tipo, poi quelli "per tutti", poi le facce di riserva.
 */
export function pickFaceIndex(sets, variant) {
  const pick = (ok) => {
    const list = [];
    sets.forEach((s, i) => { if (ok(s)) list.push(i); });
    return list.length ? list[(Math.random() * list.length) | 0] : -1;
  };
  let i = pick((s) => !s.reserve && s.types && s.types.includes(variant));
  if (i < 0) i = pick((s) => !s.reserve && (!s.types || !s.types.length));
  if (i < 0) i = pick((s) => s.reserve);
  if (i < 0) i = (Math.random() * sets.length) | 0;
  return i;
}

/**
 * Multiplayer (host): i volti della partita in formato JPEG, con i nomi, da mandare ai giocatori
 * della stanza: [{ b: ArrayBuffer, n: nome }]. Vanno direttamente da dispositivo a dispositivo, mai a un server.
 */
export async function faceBuffers() {
  const out = [];
  for (const s of current) {
    // toDataURL è immediato (toBlob a volte viene rimandato dal browser)
    const bin = atob(s.canvas.toDataURL('image/jpeg', 0.85).split(',')[1]);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    out.push({ b: bytes.buffer, n: s.name || '' });
  }
  return out;
}

/** Multiplayer (client): crea i materiali dai volti ricevuti ({ b, n }). Restano solo in memoria, mai salvati. */
export async function facesFromBuffers(items) {
  disposeCurrent();
  for (const it of items) {
    if (!it) continue;
    try { current.push(await setFromBlob(new Blob([it.b], { type: 'image/jpeg' }), it.n)); } catch (e) { /* saltato */ }
  }
  if (!current.length) {
    for (let i = 0; i < 10; i++) {
      const p = proceduralFace();
      current.push(makeSet(p.canvas, p.side, p.top));
    }
  }
  return current;
}
