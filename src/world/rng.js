// Numeri casuali "con seed": stesso seed = stessa sequenza (serve per avere la stessa mappa
// sull'host e sui client). Non usare Math.random() nel generatore della mappa!

/** Generatore mulberry32: restituisce un oggetto con metodi comodi. */
export function makeRng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    /** numero tra a e b */
    range: (lo, hi) => lo + (hi - lo) * next(),
    /** intero tra 0 e n-1 */
    int: (n) => Math.floor(next() * n),
    chance: (p) => next() < p,
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    },
  };
}

/** Seed casuale per una nuova partita (numero di 6 cifre, facile da leggere). */
export function randomSeed() {
  return 100000 + Math.floor(Math.random() * 900000);
}
