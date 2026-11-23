// SEALED: the owner has not played this yet. Do not open.
//
// Where Season 1's chapters 12 and 13 are, for the chapter registry
// (src/systems.js). Data, and the way in to the rest (world/SEALED-engine-ship.js).
import { createEngineSystem } from './SEALED-engine-ship.js';
import { ENW } from './SEALED-engine-words.js';

export const ENGINE_PLACE = {
  label: ENW.label,
  star: null, // (nothing here shines but what is falling in)
  nebula: 0.1,
  fleet: false,
  create: createEngineSystem,
};
