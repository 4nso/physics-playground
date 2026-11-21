// "Il tuo volto" nella stanza multiplayer: un selfie o una foto dalla galleria per il proprio personaggio.
// Il giocatore sceglie se condividerlo con la stanza e se può diventare la faccia degli zombi.
// Senza consenso il volto resta solo su questo dispositivo. Si ricorda solo in questo browser (localStorage).
import { cropImage, cleanName } from './crop.js';
import { listFaces } from './store.js';

const $ = (id) => document.getElementById(id);
const KEY = 'syf-myface';
const me = { url: '', name: '', share: true, zombie: false };
let onChange = () => {};

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(me)); } catch (e) { /* storage pieno o non disponibile */ }
}
function load() {
  try { Object.assign(me, JSON.parse(localStorage.getItem(KEY)) || {}); } catch (e) { /* niente */ }
}

const blobToUrl = (blob) => new Promise((resolve) => {
  const r = new FileReader();
  r.onload = () => resolve(r.result);
  r.onerror = () => resolve('');
  r.readAsDataURL(blob);
});

function urlToBuffer(url) {
  const bin = atob(url.split(',')[1] || '');
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

/** Quello da mandare alla stanza: { b: ArrayBuffer JPEG, n: nome, z: può fare lo zombi } o null. */
export function myFacePayload() {
  if (!me.url || !me.share) return null;
  return { b: urlToBuffer(me.url), n: me.name, z: !!me.zombie };
}
/** Nome scelto dal giocatore (anche se non condivide il volto, resta sul suo dispositivo). */
export const myName = () => me.name;

function render() {
  const has = !!me.url;
  $('meImg').src = has ? me.url : '';
  $('meImg').style.display = has ? '' : 'none';
  $('meNoImg').style.display = has ? 'none' : '';
  $('meName').textContent = has ? me.name || 'Senza nome' : 'Nessun volto: avrai un casco colorato';
  $('meDel').style.display = has ? '' : 'none';
  $('meShare').checked = me.share;
  $('meZombie').checked = me.share && me.zombie;
  $('meZombie').disabled = !me.share;
  $('meConsent').style.display = has ? '' : 'none';
}

function changed() { save(); render(); onChange(); }

async function setFromBlob(blob, name) {
  const url = await blobToUrl(blob);
  if (!url) return;
  me.url = url;
  me.name = cleanName(name) || me.name;
  changed();
}

/** Elenco dei volti della galleria tra cui scegliere. */
async function openPicker() {
  const box = $('mePick');
  if (!box.classList.contains('hidden')) { box.classList.add('hidden'); return; }
  const faces = await listFaces();
  box.innerHTML = '';
  if (!faces.length) {
    box.textContent = 'La galleria è vuota: aggiungi prima le foto dal menu principale.';
  }
  for (const f of faces) {
    const b = document.createElement('button');
    b.type = 'button';
    const img = document.createElement('img');
    const u = URL.createObjectURL(f.blob);
    img.src = u;
    img.onload = () => URL.revokeObjectURL(u);
    img.alt = f.name || 'Volto';
    b.appendChild(img);
    if (f.name) { const s = document.createElement('span'); s.textContent = f.name; b.appendChild(s); }
    b.onclick = async () => { box.classList.add('hidden'); await setFromBlob(f.blob, f.name || ''); };
    box.appendChild(b);
  }
  box.classList.remove('hidden');
}

/** changedFn = chiamata quando cambia il volto o il consenso (per avvisare la stanza). */
export function initMyFace(changedFn) {
  onChange = changedFn;
  load();
  $('meSelfie').onchange = async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const r = await cropImage(file, '', me.name);
    if (r) await setFromBlob(r.blob, r.name);
  };
  $('meFromGal').onclick = openPicker;
  $('meDel').onclick = () => { me.url = ''; changed(); };
  $('meShare').onchange = () => { me.share = $('meShare').checked; if (!me.share) me.zombie = false; changed(); };
  $('meZombie').onchange = () => { me.zombie = $('meZombie').checked; changed(); };
  render();
}

/** Ridisegna la sezione (ad esempio quando si apre la stanza). */
export function showMyFace() { $('mePick').classList.add('hidden'); render(); }
