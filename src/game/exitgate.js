// Cancello EXIT e chiave (docs/DESIGN.md → "Il cimitero dietro l'EXIT (fase 15)").
// - Il cancello sta nel muro sud del luna park, in fondo al viale (parte ferma in world/zones.js).
//   Qui: le due ante (un solo InstancedMesh), il lucchetto, l'insegna EXIT al neon che sfarfalla e ronza.
// - Quando muore il boss del round 10 cade una chiave luminosa. Chi ci passa sopra la prende
//   (🗝️ nell'HUD); se va a terra la chiave cade lì. Al cancello il pulsante d'azione dice "Apri".
// - Chiave e cancello li decide chi comanda (da solo questo dispositivo, in multiplayer l'host);
//   ai client lo stato arriva nell'istantanea (vedi net/sync.js), le richieste vanno all'host.
import * as THREE from 'three';
import { scene, isTouch } from '../core/renderer.js';
import { world, RAPIER } from '../core/physics.js';
import { audioCtx, thud } from '../core/audio.js';
import { glowMat } from '../core/glow.js';
import { pad } from '../core/gamepad.js';
import { GATE } from '../world/zones.js';
import { player } from '../player/player.js';
import { hud } from '../ui/hud.js';
import { devLog } from '../core/devmode.js';

/** Rete (impostato da net/sync.js): toHost(msg) manda una richiesta all'host, toAll/sendTo come in game.js. */
export const exitNet = { toHost: null };
/**
 * Collegamenti con la partita (impostati da game/game.js, così qui non si importa game.js):
 * team() = Map dei giocatori, myId() = id locale, announce(text, s), tell(id, text, s), isHost().
 */
export const exitHooks = { team: null, myId: null, announce: null, tell: null, authority: null };

const KEY_STATES = ['none', 'ground', 'carried', 'used'];
/** Stato condiviso: deciso da chi comanda, copiato dai client. */
export const exit = {
  key: 'none',      // 'none' | 'ground' (a terra) | 'carried' (qualcuno ce l'ha) | 'used' (cancello aperto)
  kx: 0, ky: 0, kz: 0,
  holder: null,     // id del giocatore che porta la chiave
  open: false,
};

const OPEN_TIME = 2.4;     // secondi dell'animazione di apertura
const NEAR = 3.2;          // distanza dal cancello per "Apri" / "Serve una chiave"
const HOST_NEAR = 5;       // l'host è più largo (le posizioni dei client arrivano in ritardo)
const PICK = 1.4;          // distanza per raccogliere la chiave
let openK = 0;             // 0 chiuso … 1 aperto del tutto (animazione locale)
let body = null;           // collider delle ante chiuse
let pickBlock = 0;         // dopo una caduta la chiave non si raccoglie subito

/* ---------- Ante, lucchetto, insegna ---------- */
const metal = new THREE.MeshLambertMaterial({ color: 0x2c2f35, flatShading: true });
const unit = new THREE.BoxGeometry(1, 1, 1);
// pezzi di un'anta in coordinate locali: x da 0 (cerniera) a 2 (centro del varco), y da 0 in su
const LEAF = [];
{
  const W = GATE.w / 2, H = GATE.h - 0.1;
  const add = (x0, y0, x1, y1, d = 0.08) => LEAF.push([(x0 + x1) / 2, (y0 + y1) / 2, x1 - x0, y1 - y0, d]);
  add(0, 0.05, 0.12, H, 0.12);              // montante della cerniera
  add(W - 0.1, 0.05, W, H, 0.12);           // montante al centro
  for (const y of [0.25, 1.9, H - 0.25]) add(0, y - 0.05, W, y + 0.05, 0.1); // traverse
  for (let i = 1; i <= 6; i++) { const x = (i * (W - 0.1)) / 7 + 0.03; add(x - 0.025, 0.05, x + 0.025, H + (i % 2 ? 0.25 : 0.12), 0.05); }
  // punte sopra le sbarre
  for (let i = 1; i <= 6; i++) { const x = (i * (W - 0.1)) / 7 + 0.03; LEAF.push([x, H + (i % 2 ? 0.32 : 0.19), 0.1, 0.1, 0.1, true]); }
}
let bars = null, lock = null, sign = null, signMats = null, halo = null, keyObj = null;
const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), qy = new THREE.Quaternion(), v3 = new THREE.Vector3(), s3 = new THREE.Vector3();
const Y = new THREE.Vector3(0, 1, 0);
const TIP = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 4);

function neonTex() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 96;
  const g = c.getContext('2d');
  g.fillStyle = '#141216'; g.fillRect(0, 0, 256, 96);
  g.font = '900 70px system-ui, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = '#ff2a2a'; g.shadowBlur = 18;
  g.strokeStyle = '#ff4a3a'; g.lineWidth = 7;
  g.strokeText('EXIT', 128, 52);
  g.shadowBlur = 6;
  g.fillStyle = '#ffd9d0';
  g.fillText('EXIT', 128, 52);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function haloTex() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,60,40,0.9)'); r.addColorStop(1, 'rgba(255,40,30,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function buildVisuals() {
  if (bars) return;
  bars = new THREE.InstancedMesh(unit, metal, LEAF.length * 2);
  bars.castShadow = true;
  scene.add(bars);
  // lucchetto con la catena, sul lato del luna park
  lock = new THREE.Group();
  const gold = new THREE.MeshLambertMaterial({ color: 0xc9a227, emissive: 0x2a1e00, flatShading: true });
  const chain = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.06, 0.06), metal);
  chain.position.set(0, 0, -0.02);
  const bodyM = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.32, 0.12), gold);
  bodyM.position.set(0, -0.2, -0.08);
  const shackle = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.025, 6, 10, Math.PI), metal);
  shackle.position.set(0, -0.04, -0.08);
  lock.add(chain, bodyM, shackle);
  lock.position.set(GATE.x, 1.9, GATE.z - 0.12);
  scene.add(lock);
  // insegna al neon: accesa (con bagliore) e spenta per lo sfarfallio
  const tex = neonTex();
  signMats = {
    on: glowMat(new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }), 1.9),
    off: new THREE.MeshBasicMaterial({ map: tex, color: 0x4a3a3a }),
  };
  sign = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.975), signMats.on);
  sign.position.set(GATE.x, GATE.h + 1.5, GATE.z - 0.29);
  sign.rotation.y = Math.PI; // guarda verso nord (le bancarelle)
  scene.add(sign);
  halo = new THREE.Mesh(new THREE.PlaneGeometry(5.5, 3), new THREE.MeshBasicMaterial({
    map: haloTex(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.55, fog: false,
  }));
  halo.position.set(GATE.x, GATE.h + 1.45, GATE.z - 0.32);
  halo.rotation.y = Math.PI;
  halo.renderOrder = 3;
  scene.add(halo);
  // chiave luminosa (quando è a terra): anello, asta, denti e una colonna di luce per vederla da lontano
  keyObj = new THREE.Group();
  const keyMat = glowMat(new THREE.MeshBasicMaterial({ color: 0xffd34a }), 2.2);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.05, 6, 12), keyMat);
  ring.position.y = 0.22;
  const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.42, 0.07), keyMat);
  shaft.position.y = -0.12;
  const teeth = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.06, 0.06), keyMat);
  teeth.position.set(0.08, -0.28, 0);
  const teeth2 = teeth.clone(); teeth2.position.y = -0.18; teeth2.scale.x = 0.7;
  const spin = new THREE.Group();
  spin.add(ring, shaft, teeth, teeth2);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.45, 7, 10, 1, true), new THREE.MeshBasicMaterial({
    color: 0xffd34a, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
  }));
  beam.position.y = 3.3;
  keyObj.add(spin, beam);
  keyObj.userData.spin = spin;
  keyObj.visible = false;
  scene.add(keyObj);
  poseLeaves(0);
}

/** Posa le ante: k = 0 chiuse … 1 aperte (girano verso la nicchia, cioè verso +z). */
function poseLeaves(k) {
  const a = THREE.MathUtils.smootherstep(k, 0, 1) * 1.72;
  let i = 0;
  for (const side of [-1, 1]) {
    // cerniera a sinistra (x0) o a destra (x1); l'anta destra è specchiata
    const hx = GATE.x + side * (GATE.w / 2);
    qy.setFromAxisAngle(Y, side < 0 ? -a : a);
    for (const p of LEAF) {
      const [lx, ly, w, h, d, tip] = p;
      v3.set(-side * lx, ly, 0).applyQuaternion(qy);
      v3.x += hx; v3.z += GATE.z;
      q.copy(qy);
      if (tip) q.multiply(TIP);
      m4.compose(v3, q, s3.set(w, h, d));
      bars.setMatrixAt(i++, m4);
    }
  }
  bars.instanceMatrix.needsUpdate = true;
  bars.computeBoundingSphere(); // così si disegna solo quando è inquadrato
}

/* ---------- Collider delle ante chiuse ---------- */
function addCollider() {
  removeCollider();
  body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  world.createCollider(RAPIER.ColliderDesc.cuboid(GATE.w / 2, GATE.h / 2 + 0.2, 0.12).setTranslation(GATE.x, GATE.h / 2 + 0.2, GATE.z), body);
}
function removeCollider() {
  if (body) world.removeRigidBody(body);
  body = null;
}

/* ---------- Suoni (generati) ---------- */
let hum = null;
function startHum() {
  const ctx = audioCtx();
  if (hum || !ctx) return;
  try {
    const o = ctx.createOscillator(), o2 = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = 'sawtooth'; o.frequency.value = 120;
    o2.type = 'square'; o2.frequency.value = 240.7;
    f.type = 'lowpass'; f.frequency.value = 520;
    g.gain.value = 0;
    o.connect(f); o2.connect(f); f.connect(g).connect(ctx.destination);
    o.start(); o2.start();
    hum = { g, ctx };
  } catch (e) { hum = null; }
}
function setHum(v) {
  if (!hum) return;
  hum.g.gain.setTargetAtTime(v, hum.ctx.currentTime, 0.05);
}
function chime(notes, type = 'sine', vol = 0.18, step = 0.09) {
  const ctx = audioCtx();
  if (!ctx) return;
  try {
    const t0 = ctx.currentTime;
    notes.forEach((f, i) => {
      const t = t0 + i * step, o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f, t);
      g.gain.setValueAtTime(0.001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
      o.connect(g).connect(ctx.destination);
      o.start(t); o.stop(t + 0.75);
    });
  } catch (e) { /* audio non disponibile */ }
}
/** Cigolio del cancello che si apre. */
function creak() {
  const ctx = audioCtx();
  if (!ctx) return;
  try {
    const t = ctx.currentTime, o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(95, t);
    o.frequency.linearRampToValueAtTime(160, t + 0.8);
    o.frequency.linearRampToValueAtTime(70, t + OPEN_TIME);
    f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 6;
    g.gain.setValueAtTime(0.001, t);
    g.gain.exponentialRampToValueAtTime(0.16, t + 0.2);
    g.gain.exponentialRampToValueAtTime(0.001, t + OPEN_TIME);
    o.connect(f).connect(g).connect(ctx.destination);
    o.start(t); o.stop(t + OPEN_TIME + 0.05);
  } catch (e) { /* audio non disponibile */ }
}

/* ---------- Partita ---------- */
/** Nuova partita: cancello chiuso, nessuna chiave. */
export function resetExit() {
  buildVisuals();
  Object.assign(exit, { key: 'none', holder: null, open: false, kx: 0, ky: 0, kz: 0 });
  openK = 0;
  poseLeaves(0);
  lock.visible = true;
  keyObj.visible = false;
  addCollider();
  hud.setKey(false);
  lastNear = false;
}

const teamMap = () => (exitHooks.team ? exitHooks.team() : new Map());
const myId = () => (exitHooks.myId ? exitHooks.myId() : 'host');
const posOf = (m) => (m.local ? { x: player.pos.x, y: player.pos.y - 0.85, z: player.pos.z } : { x: m.x, y: (m.y || 0.85) - 0.85, z: m.z });
const say = (text, s = 2.6) => { if (exitHooks.announce) exitHooks.announce(text, s); else hud.flash(text, s); };
/** Messaggio a un solo giocatore (anche remoto). */
function tell(id, text, s = 2.4) {
  if (id === myId()) hud.flash(text, s);
  else if (exitHooks.tell) exitHooks.tell(id, text, s);
}

/** Chi comanda: fa cadere la chiave in (x, y, z) dove y = piedi. */
export function dropKey(x, y, z, why = 'boss') {
  if (exit.key === 'used') return;
  Object.assign(exit, { key: 'ground', holder: null, kx: x, ky: Math.max(0, y), kz: z });
  pickBlock = why === 'boss' ? 0.4 : 1.2;
  devLog(`🗝️ Chiave a terra (${why})`);
  chime([784, 1047, 1319, 1568, 2093], 'triangle', 0.2);
  say(why === 'boss' ? '🗝️ Il boss ha lasciato cadere una chiave!<br><small>Raccoglila e portala al cancello EXIT, in fondo al viale</small>'
    : '🗝️ La chiave è caduta!<br><small>Raccoglietela e portatela al cancello EXIT</small>', 3.2);
}

/** Chi comanda: il boss del round 10 è morto. */
export function bossDied(e, round) {
  if (round !== 10 || exit.key !== 'none') return;
  const p = e.body ? e.body.translation() : e.model.group.position;
  dropKey(p.x, (p.y || 0) - (e.centerY || 1), p.z, 'boss');
}

/** Chi comanda: la chiave va a questo giocatore. */
export function giveKey(id) {
  if (exit.key === 'used') return false;
  const m = teamMap().get(id);
  if (!m) return false;
  exit.key = 'carried';
  exit.holder = id;
  chime([1319, 1760, 2093], 'sine', 0.16, 0.07);
  tell(id, '🗝️ Hai la chiave!<br><small>Portala al cancello EXIT, in fondo al viale (dopo l\'arco d\'ingresso)</small>', 3);
  for (const o of teamMap().values()) if (o.id !== id) tell(o.id, '🗝️ Un compagno ha preso la chiave', 2);
  devLog(`🗝️ Chiave a ${m.local ? 'me' : id}`);
  return true;
}

/** Chi comanda: apre il cancello. */
export function openGate(by) {
  if (exit.open) return false;
  Object.assign(exit, { open: true, key: 'used', holder: null });
  devLog(`🔓 Cancello EXIT aperto${by ? ` (${by})` : ''}`);
  say('🔓 Il cancello EXIT è aperto', 3);
  return true;
}

/** Chi comanda: un giocatore (anche remoto) chiede di aprire il cancello. Restituisce il motivo del no. */
export function serverOpen(id) {
  if (exit.open) return '';
  const m = teamMap().get(id);
  if (!m || m.down) return 'Sei a terra';
  if (exit.holder !== id) return '🔒 Serve una chiave';
  const p = posOf(m);
  if (Math.hypot(p.x - GATE.x, p.z - (GATE.z - 1)) > (m.local ? NEAR + 0.5 : HOST_NEAR)) return 'Avvicinati al cancello';
  openGate(id);
  return '';
}

/* ---------- Giocatore locale ---------- */
/** Sono vicino al cancello chiuso (dal lato del luna park)? */
function nearGate() {
  if (exit.open || !player.alive || player.seated) return false;
  const p = player.pos;
  return p.z < GATE.z && p.y < 3 && Math.hypot(p.x - GATE.x, p.z - (GATE.z - 1)) < NEAR;
}
const iHaveKey = () => exit.key === 'carried' && exit.holder === myId();

/** Pulsante d'azione touch per il cancello (o null). */
export function exitActionButton() {
  if (!nearGate()) return null;
  return iHaveKey() ? { id: 'exitOpen', icon: '🗝️', label: 'Apri', kind: 'shop' } : null;
}

/** Azione del giocatore (F, B sul controller, pulsante d'azione): true se ha fatto qualcosa. */
export function exitAction() {
  if (!nearGate()) return false;
  if (!iHaveKey()) { hud.flash('🔒 Serve una chiave', 1.6); thud(0.12, 140); return true; }
  thud(0.15, 420);
  if (exitHooks.authority && !exitHooks.authority()) {
    if (exitNet.toHost) exitNet.toHost({ t: 'exit', a: 'open' });
  } else {
    const why = serverOpen(myId());
    if (why) hud.flash(why, 1.6);
  }
  return true;
}

let lastNear = false;
function promptNear() {
  const n = nearGate();
  if (n && !lastNear) {
    if (iHaveKey()) {
      const k = pad.active ? ' <kbd>B</kbd>' : isTouch ? '' : ' <kbd>F</kbd>';
      hud.flash(`🗝️ Apri il cancello${k}`, 2.2);
    } else hud.flash('🔒 Serve una chiave', 1.8);
  }
  lastNear = n;
}

/* ---------- A ogni frame ---------- */
let flickT = 0, flickOff = 0, t = 0;
/**
 * authority = da solo o host (decide prese e cadute della chiave), playing = partita in corso.
 */
export function updateExit(dt, authority, playing) {
  if (!bars) return;
  t += dt;
  // insegna: accesa quasi sempre, ogni tanto due o tre sfarfallii
  flickT -= dt;
  if (flickOff > 0) flickOff -= dt;
  if (flickT <= 0) {
    flickT = Math.random() < 0.25 ? 0.07 + Math.random() * 0.1 : 1.5 + Math.random() * 4;
    flickOff = Math.random() < 0.6 ? 0.04 + Math.random() * 0.08 : 0;
  }
  const lit = flickOff <= 0;
  sign.material = lit ? signMats.on : signMats.off;
  halo.visible = lit;
  // ronzio: si sente vicino al cancello
  if (playing) {
    startHum();
    const d = Math.hypot(player.pos.x - GATE.x, player.pos.z - GATE.z);
    setHum(lit ? 0.05 * Math.max(0, 1 - d / 16) : 0);
  } else setHum(0);

  // apertura animata
  const want = exit.open ? 1 : 0;
  if (openK !== want) {
    if (want === 1 && openK === 0) { removeCollider(); creak(); lock.visible = false; }
    openK = want ? Math.min(1, openK + dt / OPEN_TIME) : 0;
    poseLeaves(openK);
    if (openK === 1) thud(0.3, 70);
  }

  if (authority && playing) serverTick(dt);

  // chiave a terra
  keyObj.visible = exit.key === 'ground';
  if (keyObj.visible) {
    keyObj.position.set(exit.kx, exit.ky + 0.55 + Math.sin(t * 3) * 0.08, exit.kz);
    keyObj.userData.spin.rotation.y = t * 2.2;
  }
  hud.setKey(playing && iHaveKey());
  if (playing) promptNear(); else lastNear = false;
}

/** Chi comanda: chi raccoglie la chiave, chi la perde. */
function serverTick(dt) {
  if (exit.key === 'ground') {
    pickBlock -= dt;
    if (pickBlock > 0) return;
    for (const m of teamMap().values()) {
      if (m.down) continue;
      const p = posOf(m);
      if (Math.hypot(p.x - exit.kx, p.z - exit.kz) < (m.local ? PICK : PICK + 0.5) && Math.abs(p.y - exit.ky) < 1.8) { giveKey(m.id); return; }
    }
  } else if (exit.key === 'carried') {
    const m = teamMap().get(exit.holder);
    if (!m) { dropKey(exit.kx, exit.ky, exit.kz, 'left'); return; } // è uscito dalla partita
    const p = posOf(m);
    exit.kx = p.x; exit.ky = Math.max(0, p.y); exit.kz = p.z;
    if (m.down) dropKey(p.x, p.y, p.z, 'down');
  }
}

/* ---------- Rete ---------- */
/** Host → client: [stato, x, y, z (×100), chi la porta, aperto]. */
export function exitSnapshot() {
  return [KEY_STATES.indexOf(exit.key), Math.round(exit.kx * 100), Math.round(exit.ky * 100), Math.round(exit.kz * 100), exit.holder || 0, exit.open ? 1 : 0];
}
export function applyExitSnapshot(s) {
  if (!Array.isArray(s)) return;
  exit.key = KEY_STATES[s[0]] || 'none';
  exit.kx = s[1] / 100; exit.ky = s[2] / 100; exit.kz = s[3] / 100;
  exit.holder = s[4] || null;
  exit.open = !!s[5];
}

/* ---------- Modalità sviluppatore ---------- */
/** "Dai la chiave" (a un giocatore scelto) e "Apri il cancello EXIT": solo chi comanda. */
export function devGiveKey(id) {
  if (exit.open) { hud.flash('🛠 Il cancello è già aperto', 1.4); return; }
  giveKey(id);
}
export function devOpenGate() {
  if (!openGate('dev')) hud.flash('🛠 Il cancello è già aperto', 1.4);
}
