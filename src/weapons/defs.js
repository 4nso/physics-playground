// Definizioni delle armi. Tempi in secondi, angoli in radianti.
// L'ordine conta: in multiplayer le armi viaggiano come numero (indice in questa lista).
// price = prezzo nel negozio · ammoPrice = ricarica completa delle munizioni di un'arma che hai già.
// Munizioni di riserva raddoppiate nella fase 12.
// Le armi con `projectile` sparano un proiettile vero (granata, razzo) invece di un raggio istantaneo.
export const WEAPONS = [
  {
    id: 'pistol', name: 'Pistola', icon: '🔫',
    price: 500, ammoPrice: 0,
    mag: 12, reserve: Infinity,   // colpi infiniti, ma va ricaricata
    rate: 0.24,                   // tempo minimo tra due colpi
    reload: 1.1,
    pellets: 1,
    damage: 26,                   // danno per colpo (per pallino); alla testa ×2
    spread: 0.004, moveSpread: 0.02, bloom: 0.014, maxBloom: 0.05,
    impulse: 3.5,                 // spinta fisica per colpo (per pallino)
    range: 120,
    recoil: 0.03, kick: 0.045,
    sound: { cut: 2600, decay: 0.16, thump: 160, vol: 0.45 },
  },
  {
    id: 'shotgun', name: 'Fucile a pompa', icon: '💥',
    price: 1500, ammoPrice: 500,
    mag: 6, reserve: 60,
    rate: 0.85,
    reload: 1.9,
    pellets: 9,
    damage: 15,
    spread: 0.075, moveSpread: 0.015, bloom: 0.02, maxBloom: 0.03,
    impulse: 2.6,
    range: 45,
    recoil: 0.09, kick: 0.12,
    sound: { cut: 1500, decay: 0.38, thump: 85, vol: 0.7 },
  },
  {
    id: 'smg', name: 'Mitra', icon: '⚡',
    price: 1000, ammoPrice: 400,
    mag: 30, reserve: 300,
    rate: 0.085,
    reload: 1.7,
    pellets: 1,
    damage: 15,
    spread: 0.012, moveSpread: 0.03, bloom: 0.007, maxBloom: 0.07,
    impulse: 1.6,
    range: 100,
    recoil: 0.011, kick: 0.016,
    sound: { cut: 3400, decay: 0.1, thump: 190, vol: 0.32 },
  },
  {
    id: 'rifle', name: "Fucile d'assalto", icon: '🎯',
    price: 3000, ammoPrice: 800,
    mag: 30, reserve: 300,
    rate: 0.11,
    reload: 2.0,
    pellets: 1,
    damage: 34,
    spread: 0.004, moveSpread: 0.025, bloom: 0.004, maxBloom: 0.03,
    impulse: 2.4,
    range: 140,
    recoil: 0.016, kick: 0.022,
    sound: { cut: 2900, decay: 0.15, thump: 130, vol: 0.42 },
  },
  {
    id: 'sniper', name: 'Fucile da cecchino', icon: '🔭',
    price: 4000, ammoPrice: 900,
    mag: 5, reserve: 50,
    rate: 1.15,
    reload: 2.6,
    pellets: 1,
    damage: 260,
    headMul: 2.5,                 // alla testa ×2,5
    spread: 0.035,                // senza mirino è impreciso…
    zoomSpread: 0,                // …con il mirino è perfetto
    zoom: 3.2,                    // ingrandimento del mirino
    moveSpread: 0.05, bloom: 0, maxBloom: 0,
    impulse: 10,
    range: 220,
    recoil: 0.09, kick: 0.13,
    sound: { cut: 2200, decay: 0.45, thump: 70, vol: 0.75 },
  },
  {
    id: 'launcher', name: 'Lanciagranate', icon: '💣',
    price: 6000, ammoPrice: 1200,
    mag: 6, reserve: 48,
    rate: 0.7,
    reload: 2.6,
    pellets: 1,
    damage: 230,                  // danno al centro dell'esplosione
    spread: 0.006, moveSpread: 0.02, bloom: 0, maxBloom: 0,
    impulse: 14,
    range: 0,
    recoil: 0.06, kick: 0.1,
    // granata: vola a parabola, rimbalza, esplode sui nemici o dopo la miccia
    projectile: { kind: 'grenade', speed: 24, gravity: 14, bounce: 0.45, fuse: 1.8, radius: 3.6 },
    sound: { cut: 700, decay: 0.25, thump: 90, vol: 0.55 },
  },
  {
    id: 'bazooka', name: 'Bazooka', icon: '🚀',
    price: 9000, ammoPrice: 1500,
    mag: 1, reserve: 16,
    rate: 0.9,
    reload: 2.4,
    pellets: 1,
    damage: 520,
    spread: 0.003, moveSpread: 0.015, bloom: 0, maxBloom: 0,
    impulse: 26,
    range: 0,
    recoil: 0.1, kick: 0.16,
    // razzo: va dritto e veloce, esplode appena tocca qualcosa
    projectile: { kind: 'rocket', speed: 38, gravity: 0, bounce: 0, fuse: 4, radius: 5 },
    sound: { cut: 900, decay: 0.5, thump: 60, vol: 0.7 },
  },
];

/** Armi con cui si parte: pistola e mitra. Si possono tenere al massimo MAX_SLOTS armi. */
export const START_WEAPONS = ['pistol', 'smg'];
export const MAX_SLOTS = 3;
export const weaponIndex = (id) => WEAPONS.findIndex((w) => w.id === id);

/** Potenziamenti base del negozio: un prezzo per ogni livello. */
export const UPGRADES = {
  hp: { name: 'Vita massima +25', icon: '❤️', prices: [2500, 4000] },
  reload: { name: 'Ricarica veloce', icon: '⏱️', prices: [2000, 3500], mul: [1, 0.8, 0.65] },
};

/**
 * Potenziatore della zona sicura: 2 livelli per arma.
 * Ogni livello moltiplica danno, caricatore (e scorta) e velocità di sparo.
 */
export const PAP = {
  prices: [5000, 9000],
  damage: [1, 1.7, 2.6],
  mag: [1, 1.5, 2],
  rate: [1, 0.85, 0.72],    // tempo tra i colpi (più basso = spara più veloce)
};
/** Cura completa nel negozio: vita al massimo, una volta per round (fase 12). */
export const HEAL_PRICE = 2000;
/** Bancarella delle munizioni: apre al round `round`, riempie tutte le armi in mano (fase 12). */
export const AMMO_STALL = { price: 4500, round: 10 };
/** Prezzo della cassa misteriosa (fisso). */
export const BOX_PRICE = 950;

const statCache = new Map();
/** Valori dell'arma wi al livello di potenziamento `level` (0 = normale). */
export function weaponStats(wi, level = 0) {
  const key = wi * 10 + level;
  let s = statCache.get(key);
  if (!s) {
    const w = WEAPONS[wi];
    s = level ? {
      ...w,
      level,
      name: `${w.name} ${'★'.repeat(level)}`,
      damage: w.damage * PAP.damage[level],
      mag: Math.max(w.mag + 1, Math.round(w.mag * PAP.mag[level])),
      reserve: w.reserve === Infinity ? Infinity : Math.round(w.reserve * PAP.mag[level]),
      rate: w.rate * PAP.rate[level],
    } : { ...w, level: 0 };
    statCache.set(key, s);
  }
  return s;
}
