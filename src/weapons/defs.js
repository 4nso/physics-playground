// Definizioni delle armi. Tempi in secondi, angoli in radianti.
export const WEAPONS = [
  {
    id: 'pistol', name: 'Pistola', icon: '🔫',
    mag: 12, reserve: Infinity,   // colpi infiniti, ma va ricaricata
    rate: 0.24,                   // tempo minimo tra due colpi
    reload: 1.1,
    pellets: 1,
    damage: 26,                   // danno per colpo (per pallino); alla testa ×2
    unlockRound: 1,
    spread: 0.004, moveSpread: 0.02, bloom: 0.014, maxBloom: 0.05,
    impulse: 3.5,                 // spinta fisica per colpo (per pallino)
    range: 120,
    recoil: 0.03, kick: 0.045,
    sound: { cut: 2600, decay: 0.16, thump: 160, vol: 0.45 },
  },
  {
    id: 'shotgun', name: 'Fucile a pompa', icon: '💥',
    mag: 6, reserve: 24,
    rate: 0.85,
    reload: 1.9,
    pellets: 9,
    damage: 13,
    unlockRound: 1,
    spread: 0.075, moveSpread: 0.015, bloom: 0.02, maxBloom: 0.03,
    impulse: 2.2,
    range: 45,
    recoil: 0.09, kick: 0.12,
    sound: { cut: 1500, decay: 0.38, thump: 85, vol: 0.7 },
  },
  {
    id: 'smg', name: 'Mitra', icon: '⚡',
    mag: 30, reserve: 120,
    rate: 0.085,
    reload: 1.7,
    pellets: 1,
    damage: 15,
    unlockRound: 3,               // si sblocca dal round 3
    spread: 0.012, moveSpread: 0.03, bloom: 0.007, maxBloom: 0.07,
    impulse: 1.6,
    range: 100,
    recoil: 0.011, kick: 0.016,
    sound: { cut: 3400, decay: 0.1, thump: 190, vol: 0.32 },
  },
];
