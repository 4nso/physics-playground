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

/** Salva un volto (Blob JPEG 256×256). Restituisce l'id. */
export const addFace = (blob) => run('readwrite', (s) => s.add({ blob, added: Date.now() }));
/** Tutti i volti: [{ id, blob }] */
export const listFaces = () => run('readonly', (s) => s.getAll()).catch(() => []);
export const deleteFace = (id) => run('readwrite', (s) => s.delete(id));
export const clearFaces = () => run('readwrite', (s) => s.clear());
