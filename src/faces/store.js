// Archivio dei volti nel browser (IndexedDB). Le foto non lasciano mai il dispositivo.
const DB = 'physics-playground', STORE = 'faces';
let dbPromise = null;

function open() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function run(mode, fn) {
  return open().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req && req.result);
    tx.onerror = () => reject(tx.error);
  }));
}

/** Salva un volto (Blob JPEG 512×512) con il nome dell'amico. Restituisce l'id. */
export const addFace = (blob, name = '') => run('readwrite', (s) => s.add({ blob, name, added: Date.now() }));
/** Tutti i volti: [{ id, blob, name?, types? }] */
export const listFaces = () => run('readonly', (s) => s.getAll()).catch(() => []);
export const deleteFace = (id) => run('readwrite', (s) => s.delete(id));
/** Tipi di nemico a cui va questo volto (es. ['boss']). Vuoto = tutti i nemici. */
export const setFaceTypes = (id, types) => run('readwrite', (s) => {
  const req = s.get(id);
  req.onsuccess = () => { if (req.result) s.put({ ...req.result, types }); };
  return req;
});
/** Nome dell'amico per questo volto (es. "Marco"). */
export const setFaceName = (id, name) => run('readwrite', (s) => {
  const req = s.get(id);
  req.onsuccess = () => { if (req.result) s.put({ ...req.result, name }); };
  return req;
});
export const clearFaces = () => run('readwrite', (s) => s.clear());
