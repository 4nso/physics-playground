// Rete peer-to-peer con PeerJS. Chi crea la stanza fa da host; gli altri si collegano a lui.
// Il server di PeerJS serve solo a "presentare" i dispositivi: i dati (posizioni, volti...)
// viaggiano direttamente tra i dispositivi.
import { Peer } from 'peerjs';

const PREFIX = 'shoot-your-friends-';
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // niente 0/O, 1/I/L: si leggono male
export const MAX_PLAYERS = 4;

export const net = {
  mode: 'solo',      // 'solo' | 'host' | 'client'
  code: '',
  myId: 'host',      // id del giocatore locale nella partita ('host' per l'host)
  mySlot: 0,
  peer: null,
  hostConn: null,    // client: connessione verso l'host
  clients: new Map(),// host: peerId → { conn, slot, id }
};

const handlers = new Map();
/** Registra una funzione per un tipo di messaggio: fn(msg, fromId) */
export function on(type, fn) { handlers.set(type, fn); }
function dispatch(msg, fromId) {
  const fn = handlers.get(msg && msg.t);
  if (fn) fn(msg, fromId);
}

/** Opzioni del server di segnalazione. Per i test: ?peer=localhost:9000 usa un server locale. */
function peerOptions() {
  const p = new URLSearchParams(location.search).get('peer');
  if (!p) return { debug: 0 };
  const [host, port] = p.split(':');
  return { host, port: +port || 9000, path: '/', secure: false, debug: 0 };
}

const randomCode = () => Array.from({ length: 5 }, () => ALPHABET[(Math.random() * ALPHABET.length) | 0]).join('');

/* ---------- Host ---------- */

/**
 * Crea una stanza. Restituisce il codice. events: { onJoin(id, slot), onLeave(id) }
 */
export function createRoom(events) {
  return new Promise((resolve, reject) => {
    let tries = 0;
    const attempt = () => {
      const code = randomCode();
      const peer = new Peer(PREFIX + code, peerOptions());
      peer.on('open', () => {
        net.mode = 'host';
        net.code = code;
        net.myId = 'host';
        net.mySlot = 0;
        net.peer = peer;
        resolve(code);
      });
      peer.on('error', (err) => {
        if (err.type === 'unavailable-id' && tries++ < 5) { peer.destroy(); attempt(); return; }
        if (net.peer !== peer) reject(err);
      });
      peer.on('connection', (conn) => acceptClient(conn, events));
    };
    attempt();
  });
}

function freeSlot() {
  const used = new Set([0, ...[...net.clients.values()].map((c) => c.slot)]);
  for (let s = 1; s < MAX_PLAYERS; s++) if (!used.has(s)) return s;
  return -1;
}

let acceptingNew = true;
/** L'host decide se accettare nuovi giocatori (non durante la partita). */
export function setAccepting(on) { acceptingNew = on; }

function acceptClient(conn, events) {
  conn.on('open', () => {
    const slot = freeSlot();
    if (slot < 0 || !acceptingNew) {
      conn.send({ t: 'refuse', why: slot < 0 ? 'La stanza è piena (massimo 4 giocatori).' : 'La partita è già iniziata.' });
      setTimeout(() => conn.close(), 500);
      return;
    }
    const id = 'p' + slot;
    net.clients.set(conn.peer, { conn, slot, id });
    conn.send({ t: 'welcome', id, slot });
    conn.on('data', (msg) => dispatch(msg, id));
    const leave = () => {
      if (!net.clients.has(conn.peer)) return;
      net.clients.delete(conn.peer);
      events.onLeave(id);
    };
    conn.on('close', leave);
    conn.on('error', leave);
    events.onJoin(id, slot);
  });
}

/** Host: manda a tutti i client (tranne exceptId). */
export function broadcast(msg, exceptId) {
  for (const c of net.clients.values()) {
    if (c.id !== exceptId && c.conn.open) c.conn.send(msg);
  }
}
/** Host: manda a un solo client. */
export function sendTo(id, msg) {
  for (const c of net.clients.values()) if (c.id === id && c.conn.open) c.conn.send(msg);
}

/* ---------- Client ---------- */

/** Entra in una stanza. events: { onClose(reason) }. Restituisce { id, slot }. */
export function joinRoom(code, events) {
  code = code.trim().toUpperCase();
  return new Promise((resolve, reject) => {
    const peer = new Peer(peerOptions());
    let done = false;
    const fail = (text) => { if (!done) { done = true; peer.destroy(); reject(new Error(text)); } };
    const timer = setTimeout(() => fail('Nessuna risposta: controlla il codice e la connessione.'), 15000);
    peer.on('error', (err) => {
      if (err.type === 'peer-unavailable') fail('Stanza non trovata: controlla il codice.');
      else if (!done) fail('Errore di connessione (' + err.type + ').');
      else events.onClose('Connessione persa.');
    });
    peer.on('open', () => {
      const conn = peer.connect(PREFIX + code, { reliable: true });
      conn.on('data', (msg) => {
        if (!done) {
          if (msg.t === 'refuse') { clearTimeout(timer); fail(msg.why); return; }
          if (msg.t === 'welcome') {
            done = true;
            clearTimeout(timer);
            net.mode = 'client';
            net.code = code;
            net.myId = msg.id;
            net.mySlot = msg.slot;
            net.peer = peer;
            net.hostConn = conn;
            resolve({ id: msg.id, slot: msg.slot });
          }
          return;
        }
        dispatch(msg, 'host');
      });
      conn.on('close', () => { if (done && net.hostConn === conn) events.onClose("L'host ha chiuso la partita."); });
    });
  });
}

/** Client: manda all'host. */
export function sendHost(msg) {
  if (net.hostConn && net.hostConn.open) net.hostConn.send(msg);
}

/** Esce dalla stanza (o la chiude, se siamo l'host). */
export function leaveRoom() {
  const peer = net.peer;
  net.hostConn = null;
  net.clients.clear();
  net.peer = null;
  net.mode = 'solo';
  net.code = '';
  net.myId = 'host';
  net.mySlot = 0;
  acceptingNew = true;
  if (peer) setTimeout(() => peer.destroy(), 200);
}
