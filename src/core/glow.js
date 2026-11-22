// Bagliore (bloom): le cose che "fanno luce" (neon, lampadine, insegne, fuoco, scie, lampo dello sparo)
// vengono disegnate più luminose del bianco. Il passaggio di bloom (core/post.js) prende solo ciò che
// supera il bianco e lo sfuma intorno. In qualità Bassa non c'è bloom: i colori restano quelli normali.
const list = [];

/** Spinta in più per i pezzi luminosi della mappa (attributo "glow" nei vertici, vedi world/worldMaterial.js). */
export const worldGlow = { value: 0 };
const WORLD_BOOST = 1.1;
let on = false;

/** Registra un materiale con colore (MeshBasicMaterial...) che deve brillare k volte di più con il bloom. */
export function glowMat(mat, k = 2.5) {
  list.push({ mat, base: mat.color.clone(), k });
  if (on) mat.color.multiplyScalar(k);
  return mat;
}

/** Toglie un materiale eliminato (insegne di una mappa vecchia). */
export function unglow(mat) {
  const i = list.findIndex((g) => g.mat === mat);
  if (i >= 0) list.splice(i, 1);
}

/** Acceso solo quando l'immagine passa dal bloom (qualità Media e Alta). */
export function setGlow(v) {
  on = v;
  worldGlow.value = v ? WORLD_BOOST : 0;
  for (const g of list) g.mat.color.copy(g.base).multiplyScalar(v ? g.k : 1);
}
