// Curva di difficoltà: quanti nemici, quanto resistenti, quanto forti e veloci a ogni round.
// Tutto è calcolato da formule (niente tabelle a mano): la crescita è graduale fino al round 25.
// Nessuna dipendenza da altri moduli, così la può usare anche l'HUD.

/** Superato questo round la partita è vinta. */
export const MAX_ROUNDS = 25;

/** Avanzamento della partita: 0 al round 1, 1 al round MAX_ROUNDS. */
export function progress(round) {
  return Math.min(1, Math.max(0, (round - 1) / (MAX_ROUNDS - 1)));
}

/**
 * Velocità di ogni tipo di nemico (m/s): parte da `min` al round 1 e arriva a `max` al round 25.
 * Il giocatore cammina a 5,5 m/s (WALK_SPEED in player.js) e corre a 9:
 * - base: al massimo appena più lento del giocatore che cammina
 * - fast (rossi): al massimo uguali al giocatore che cammina
 * - nessuno supera mai la camminata del giocatore
 */
export const SPEEDS = {
  base: { min: 2.7, max: 5.0 },
  fast: { min: 3.8, max: 5.5 },
  big: { min: 2.0, max: 3.8 },
  armored: { min: 1.8, max: 3.3 },
  boss: { min: 2.3, max: 4.4 },
};

/** Velocità di un tipo di nemico in un round (stessa crescita graduale della difficoltà). */
export function speedFor(variant, round) {
  const s = SPEEDS[variant] || SPEEDS.base;
  const t = Math.pow(progress(round), 0.85); // sale un po' più in fretta all'inizio
  return s.min + (s.max - s.min) * t;
}

/**
 * Valori di un round. players = numero di giocatori (più giocatori = più nemici, un po' più resistenti).
 */
export function roundConfig(r, players = 1) {
  const n = Math.max(1, players);
  const k = r - 1;
  const total = Math.round((4 + r * 3 + r * r * 0.04) * (1 + 0.5 * (n - 1)));
  const bosses = r % 5 === 0 ? (r >= 20 ? 2 : 1) + (n > 2 ? 1 : 0) : 0;
  return {
    round: r,
    total,
    maxAlive: Math.min(20, Math.round((4 + r * 1.6) * (1 + 0.3 * (n - 1)))),
    interval: Math.max(0.35, (1.5 - r * 0.045) / (1 + 0.3 * (n - 1))),
    // vita di un nemico base: 45 al round 1, circa 280 al round 25
    health: 45 * (1 + 0.12 * k + 0.004 * k * k) * (1 + 0.2 * (n - 1)),
    // danno dei colpi: da ×1 al round 1 a circa ×1,9 al round 25
    damage: 1 + 0.038 * k,
    // probabilità dei tipi speciali (il resto sono base)
    fast: r >= 2 ? Math.min(0.3, 0.06 + 0.012 * r) : 0,
    big: r >= 3 ? Math.min(0.16, 0.03 + 0.007 * r) : 0,
    armored: r >= 8 ? Math.min(0.14, 0.02 + 0.006 * (r - 8)) : 0,
    // boss: uno ogni 5 round (due dal round 20), arrivano a partire da un terzo dell'ondata
    bosses,
    bossFrom: Math.floor(total * 0.3),
  };
}

/** Sceglie il tipo del prossimo nemico. spawned = quanti ne sono già comparsi in questo round. */
export function pickVariant(cfg, spawned) {
  if (cfg.bosses > 0 && spawned >= cfg.bossFrom) {
    // i boss arrivano distanziati, non tutti insieme
    const gap = Math.max(4, Math.floor((cfg.total - cfg.bossFrom) / (cfg.bosses + 1)));
    if ((spawned - cfg.bossFrom) % gap === 0) { cfg.bosses--; return 'boss'; }
  }
  const x = Math.random();
  if (x < cfg.armored) return 'armored';
  if (x < cfg.armored + cfg.big) return 'big';
  if (x < cfg.armored + cfg.big + cfg.fast) return 'fast';
  return 'base';
}
