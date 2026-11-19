// A million years on (GDD 5.7.5): the megaworld after the Tenretni let go.
//
// One set of values, shared by reference by every material that has an older
// and a newer look, the way world/farhole.js shares its clock. (`uAged`, the
// thousand-year look of 5.7.4, is four separate uniforms set from four places;
// this is the one that is not.) src/farside.js sets them once a frame from the
// story; nothing else writes them.
//
//   ERA.value     0 as it was .. 1 a million years on: seas between the tower
//                 districts, growth over everything, most conduits dark, the
//                 cages open and empty
//   RITE.value    0..1, the yearly rite: every empty cage is lit again, as if
//                 its star were still in it, and then let go dark
//   DAY           what lights the world now. Not decided (EZ_LIGHT): one kept,
//                 uncaged star the megaworld goes round; the black hole's disc;
//                 or nothing but what the world gives off

import * as THREE from 'three';
import { EZ_LIGHT } from './constants.js';

export const ERA = { value: 0 };
export const RITE = { value: 0 };

const LIGHTS = {
  // a low sun, off to one side of the hole: long light, and a road of it on the seas
  sun: { k: 1.0, col: [1.0, 0.9, 0.74], dir: [0.62, 0.36, -0.7] },
  // the disc of the hole: dimmer, and the colour of its fire (dir is taken from the hole itself)
  hole: { k: 0.45, col: [1.0, 0.5, 0.2], dir: null },
  // no daylight: the seas and the few lit threads are all there is
  none: { k: 0.04, col: [0.5, 0.7, 1.0], dir: null },
};
const L = LIGHTS[EZ_LIGHT] || LIGHTS.sun;

export const DAY = {
  kind: LIGHTS[EZ_LIGHT] ? EZ_LIGHT : 'sun',
  k: { value: L.k }, // how strong
  col: { value: new THREE.Color(L.col[0], L.col[1], L.col[2]) },
  dir: L.dir ? new THREE.Vector3(L.dir[0], L.dir[1], L.dir[2]).normalize() : null, // null: where the hole is
};
