// Parti mobili delle giostre (ruota con le cabine, trenino delle montagne russe).
// Si creano a ogni nuova mappa; game/rides.js le mette in posizione a ogni frame con poseRide().
import { scene } from '../core/renderer.js';
import { makeWheelVisual } from './wheel.js';
import { makeTrainVisual } from './coaster.js';

const MAKERS = { wheel: makeWheelVisual, coaster: makeTrainVisual };
let visuals = [];

export function clearRideVisuals() {
  for (const v of visuals) {
    scene.remove(v.group);
    for (const g of v.geos) g.dispose();
  }
  visuals = [];
}

export function buildRideVisuals(defs) {
  clearRideVisuals();
  for (const def of defs || []) {
    const make = MAKERS[def.kind];
    if (!make) continue;
    const v = make(def);
    v.group.traverse((o) => { o.castShadow = true; });
    scene.add(v.group);
    visuals.push(v);
    def.visual = v;
  }
}

/** Mette la giostra nella posizione pos (angolo della ruota o metri percorsi dal trenino). */
export function poseRide(def, pos) {
  if (def.visual) def.visual.pose(pos);
}
