// Il livello "parco giochi" del prototipo: torre di casse, domino ad arco, obiettivi.
import { objects, makeCrate, makeBall, makeDomino, makeWreck, clearObjects } from '../world/objects.js';
import { resetPlayer } from '../player/player.js';
import { dropHeld } from '../player/interact.js';
import { hud } from '../ui/hud.js';

let tower = [], dominos = [];
let towerDone = false, domDone = false;

export function buildLevel() {
  // Torre a piramide (9 + 4 + 1 casse)
  tower = [];
  for (let L = 0; L < 3; L++) {
    const n = 3 - L;
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++)
        tower.push(makeCrate((i - (n - 1) / 2) * 1.02, 1.5 + L * 1.0, -8 + (j - (n - 1) / 2) * 1.02));
  }
  // Domino ad arco
  dominos = [];
  const N = 22, cx = -11, cz = -2, R = 6;
  for (let k = 0; k < N; k++) {
    const a = -1.0 + k * 0.125;
    dominos.push(makeDomino(cx + R * Math.cos(a), cz + R * Math.sin(a), -a - Math.PI / 2, k, N));
  }
  // Palloni sulla piattaforma
  for (let i = 0; i < 4; i++) makeBall(11 + (i % 2) * 1.6, 2.9 + Math.floor(i / 2) * 0.2, 1.4 + Math.floor(i / 2) * 1.6, 0.5, 0.6);
  // Casse sparse vicino alla partenza
  makeCrate(-3, 0.5, 4); makeCrate(3, 0.5, 4); makeCrate(3, 1.5, 4); makeCrate(-6, 0.4, 9, 0.8); makeCrate(6, 0.75, 10, 1.5);
  makeWreck();
  towerDone = domDone = false;
}

export function resetAll() {
  dropHeld();
  clearObjects();
  buildLevel();
  resetPlayer();
  hud.flash('Si ricomincia!');
}

/** Conta casse cadute e domino abbattuti, e festeggia quando è tutto giù. */
export function updateObjectives() {
  let tk = 0;
  for (const o of tower) if (!objects.includes(o) || o.body.translation().y < 1.0) tk++;
  let df = 0;
  for (const o of dominos) {
    if (!objects.includes(o)) { df++; continue; }
    const q = o.body.rotation();
    const upY = 1 - 2 * (q.x * q.x + q.z * q.z);
    if (upY < 0.75) df++;
  }
  hud.setCounters(tk, tower.length, df, dominos.length);
  if (!towerDone && tk === tower.length) { towerDone = true; hud.flash('🎉 Torre abbattuta!'); }
  if (!domDone && df === dominos.length) { domDone = true; hud.flash('🎉 Tutti i domino giù!'); }
}
