// Gli altri giocatori, visti in partita: omini a blocchi colorati con casco e nome.
import * as THREE from 'three';
import { scene } from '../core/renderer.js';
import { buildEnemyModel, animateModel, disposeModel, topOf } from '../enemies/model.js';
import { disposeSet } from '../faces/gallery.js';

export const SLOT_COLORS = ['#ff7a45', '#2ec4b6', '#a26bff', '#ffd23f'];
const mat = (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, flatShading: true });

/** Materiali per colore (creati una volta sola). */
const looks = SLOT_COLORS.map((col) => {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = col; g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#1b2433'; g.fillRect(8, 22, 48, 18); // visiera
  g.fillStyle = 'rgba(255,255,255,.5)'; g.fillRect(12, 25, 14, 5);
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  const helmet = mat(col);
  return {
    variant: { shirt: mat(col), pants: mat(0x2b3240), scale: 0.92 },
    face: { front: new THREE.MeshStandardMaterial({ map, roughness: 0.6 }), side: helmet, top: helmet },
  };
});

function nameTag(text, color) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  const draw = (t) => {
    g.clearRect(0, 0, 256, 64);
    g.fillStyle = 'rgba(15,25,40,.7)';
    g.beginPath(); g.roundRect(4, 8, 248, 48, 24); g.fill();
    g.fillStyle = color; g.font = 'bold 28px system-ui, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(t, 128, 33);
    tex.needsUpdate = true;
  };
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false }));
  sprite.scale.set(1.4, 0.35, 1);
  draw(text);
  return { sprite, draw };
}

export const slotName = (slot) => (slot === 0 ? 'Host' : `Giocatore ${slot + 1}`);

const avatars = new Map();
/** id del giocatore → materiali del suo volto (se l'ha condiviso). Solo in memoria. */
const faces = new Map();
const names = new Map();
/** Volto e nome di un giocatore della stanza (set = null per toglierlo). */
export function setPlayerFace(id, set) {
  const old = faces.get(id);
  if (old && old !== set) disposeSet(old);
  if (set) { faces.set(id, set); names.set(id, set.name || ''); } else { faces.delete(id); names.delete(id); }
}
export function clearPlayerFaces() { for (const id of [...faces.keys()]) setPlayerFace(id, null); }
/** Nome da mostrare per un giocatore: quello del suo volto, altrimenti "Giocatore N". */
export const playerName = (id, slot) => names.get(id) || slotName(slot);

/** Aggiorna (o crea) l'avatar di un giocatore. s = { slot, x, y, z, yaw, pitch, speed, down } */
export function setAvatar(id, s) {
  let a = avatars.get(id);
  if (!a) {
    const look = looks[s.slot % looks.length];
    const pf = faces.get(id);
    // con il volto del giocatore; il nome resta nel cartellino colorato (non quello degli zombi)
    const model = buildEnemyModel(look.variant, pf ? { front: pf.front, side: pf.side, top: pf.top } : look.face);
    const tag = nameTag(playerName(id, s.slot), SLOT_COLORS[s.slot % 4]);
    tag.sprite.position.y = topOf(look.variant) + 0.3;
    model.group.add(tag.sprite);
    model.group.position.set(s.x, s.y - 0.8, s.z);
    scene.add(model.group);
    a = { model, tag, x: s.x, y: s.y, z: s.z, yaw: s.yaw, phase: 0, down: false, label: '' };
    avatars.set(id, a);
  }
  a.tx = s.x; a.ty = s.y; a.tz = s.z;
  a.tyaw = s.yaw; a.pitch = s.pitch || 0; a.speed = s.speed || 0;
  a.down = !!s.down;
  const label = a.down ? '⛑ Aiutami!' : playerName(id, s.slot);
  if (label !== a.label) { a.tag.draw(label); a.label = label; }
}

export function removeAvatar(id) {
  const a = avatars.get(id);
  if (!a) return;
  scene.remove(a.model.group);
  disposeModel(a.model);
  avatars.delete(id);
}
export function clearAvatars() { for (const id of [...avatars.keys()]) removeAvatar(id); }

export function updateAvatars(dt) {
  const f = 1 - Math.exp(-dt * 12);
  for (const a of avatars.values()) {
    if (a.tx === undefined) continue;
    a.x += (a.tx - a.x) * f; a.y += (a.ty - a.y) * f; a.z += (a.tz - a.z) * f;
    let dy = a.tyaw - a.yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    a.yaw += dy * f;
    const g = a.model.group;
    g.position.set(a.x, a.y - 0.8 + (a.down ? 0.25 : 0), a.z);
    // il modello guarda verso +z, la telecamera verso -z: ruotiamo di mezzo giro
    g.rotation.set(a.down ? -Math.PI / 2 : 0, a.yaw + Math.PI, 0, 'YXZ');
    const walk = Math.min(1, a.speed / 5.5);
    a.phase += dt * (3 + a.speed * 1.4) * walk;
    animateModel(a.model, a.phase, a.down ? 0 : walk, 0, dt);
    // braccia che puntano dove guarda (come se mirasse)
    a.model.pivots.shL.rotation.x = a.model.pivots.shR.rotation.x = -Math.PI / 2 - a.pitch;
  }
}
