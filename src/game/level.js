// Disposizione dell'arena per il combattimento: casse come coperture, palla demolitrice.
import { makeCrate, makeBall, makeWreck, clearObjects } from '../world/objects.js';
import { dropHeld } from '../player/interact.js';

export function buildLevel() {
  // Piccola piramide sul piedistallo
  for (let i = 0; i < 3; i++) makeCrate((i - 1) * 1.02, 1.5, -8);
  makeCrate(-0.51, 2.5, -8); makeCrate(0.51, 2.5, -8);
  // Gruppi di casse sparsi come coperture
  const clusters = [[-12, -14], [14, -16], [-16, 10], [-6, 18], [18, 18], [-20, -2], [8, -22]];
  for (const [x, z] of clusters) {
    makeCrate(x, 0.5, z);
    makeCrate(x + 1.05, 0.5, z + 0.2);
    makeCrate(x + 0.5, 1.5, z + 0.1);
  }
  makeCrate(-3, 0.5, 4); makeCrate(3, 0.5, 4); makeCrate(6, 0.75, 10, 1.5);
  // Palloni sulla piattaforma
  makeBall(11, 2.9, 1.4, 0.5, 0.6);
  makeBall(12.6, 2.9, 3, 0.5, 0.6);
  makeWreck();
}

export function rebuildLevel() {
  dropHeld();
  clearObjects();
  buildLevel();
}
