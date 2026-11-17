// Oggetti fisici della mappa: casse e palloni sparsi nelle stanze, palla demolitrice nella piazza.
// Le posizioni le decide il generatore (stesso seed = stessi oggetti, con gli stessi id).
import { makeCrate, makeBall, makeWreck, clearObjects } from '../world/objects.js';
import { map } from '../world/map.js';
import { dropHeld } from '../player/interact.js';

export function buildLevel() {
  for (const p of map.props) {
    if (p.kind === 'crate') makeCrate(p.x, p.y, p.z, p.size);
    else makeBall(p.x, p.y, p.z, p.r, 0.6 * (p.r / 0.5) ** 2);
  }
  makeWreck();
}

export function rebuildLevel() {
  dropHeld();
  clearObjects();
  buildLevel();
}
