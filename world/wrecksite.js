// The wreck of the Indigo Reach, walked.
//
// After the charge (world/shatter.js) the factory ship drifts in the debris,
// dark. This is the platform src/capitalWalk.js walks when the pilot sets down
// on her flight deck: the hull's own decks, stairs and bulkheads
// (world/reachship.js `structure`, hull-local, which is the wreck pivot's
// frame), no crew, one thing worth the trip. The Crown Seal hangs over the
// captain's chair on the bridge, lit, exactly as Madame Ossva left it
// (src/crownErrand.js).
//
// Nothing here is lit by a sun. Stepping out puts the sun and the ambient
// light out (the submersible's way, world/submersible.js) and hands the pilot
// a flashlight: one real SpotLight carried at the eye, L to switch. The hull
// is MeshStandardMaterial throughout, so it answers the beam as it is.

import * as THREE from 'three';
import { input } from '../src/input.js';
import { sun } from '../src/sun.js';
import { relicWaiting, sealTaken } from '../src/crownErrand.js';
import { showViewToast } from '../src/walkview.js';

const LAMP_ON = 260; // candela: physical units (three r165), falling off by the square
const EYE = 1.62;
const SEAM = [[0.5, 0], [-0.5, 0], [0, 0.5], [0, -0.5]];
const AMBIENT = 0.05; // of the usual: enough to keep a silhouette, not to see by

export function createWreckSite({ reachShip, shatter, planet, scene }) {
  const structure = reachShip.structure;
  const pad = reachShip.pad.clone();
  const chair = { x: 0, y: 20, z: -27.4 };
  const SPEAKER = { name: 'THE CROWN SEAL', species: 'wreck of the Indigo Reach', cityId: 'Indigo Reach' };

  // The flashlight. Made once and left in the scene: it is switched by
  // `visible` only when the walk begins and ends (one program rebuild each,
  // on a cut), and by intensity while it is carried.
  const lamp = new THREE.SpotLight(0xfff1d8, 0, 85, 0.56, 0.6, 1.35);
  lamp.visible = false;
  lamp.target.visible = false;
  scene.add(lamp, lamp.target);
  let lampOn = true;
  let prev = null;
  let inside = false;
  // The walker (src/capitalWalk.js hands it over through setWalker every step:
  // importing it here would drag the whole lazy walk chunk into the boot bundle).
  let cWalk = null;

  const _eye = new THREE.Vector3();
  const _fwd = new THREE.Vector3();
  const _origin = new THREE.Vector3();
  const toWorld = (local, out) => {
    const g = shatter.wreckPivot;
    _origin.copy(g.position).add(planet.group.position);
    return out.copy(local).applyQuaternion(g.quaternion).add(_origin);
  };
  function aimLamp() {
    if (!cWalk) return;
    const cp = Math.cos(cWalk.pitch);
    _fwd.set(Math.sin(cWalk.yaw) * cp, Math.sin(cWalk.pitch), Math.cos(cWalk.yaw) * cp);
    _eye.set(cWalk.pos.x, cWalk.pos.y + EYE, cWalk.pos.z);
    toWorld(_eye, lamp.position);
    _eye.addScaledVector(_fwd, 12);
    toWorld(_eye, lamp.target.position);
    lamp.target.updateMatrixWorld();
    lamp.intensity = lampOn ? LAMP_ON : 0;
  }

  const site = {
    get group() { return shatter.wreckPivot; },
    planet,
    pad,
    spawn: new THREE.Vector3(0, pad.y, pad.z + 21), // clear of the freighter's nose, facing the house
    snap: 0.7,
    colliders: [],
    npcs: [],
    // The deck plates were laid for a walker that falls (src/walk.js), and
    // leave hand-width seams between a stair landing and the deck beside it.
    // This walker refuses any step with no floor under it, so a seam would be
    // a wall: where there is no plate at this level, take the one half a pace away.
    floorYAt(x, z, y) {
      const f = structure.surfaceYAt(x, z, y);
      // (a seam over a lower deck reads as that deck, a storey down: the same case)
      if (f == null || f < y - 1.2) {
        for (let i = 0; i < 4; i++) {
          const g = structure.surfaceYAt(x + SEAM[i][0], z + SEAM[i][1], y);
          if (g != null && g >= y - 1.2) return g;
        }
      }
      return f ?? -Infinity;
    },
    resolveWalls: (p, r) => structure.resolveWalls(p, r),
    // roofed volumes for the third-person camera, lowest ceiling first: the
    // lookup has no floor test, and the house stacks three rooms on one plan
    rooms: reachShip.rooms
      .map((r) => ({ x0: r.x0, x1: r.x1, z0: r.z0, z1: r.z1, ceil: r.y1 }))
      .sort((a, b) => a.ceil - b.ceil),
    consoles: [{
      x: chair.x, y: chair.y, z: chair.z, r: 3.4,
      prompt: 'E — TAKE THE CROWN SEAL',
      off: () => !relicWaiting(),
      use() {
        if (!sealTaken()) return null;
        reachShip.setRelicVisible(false);
        return {
          speaker: SPEAKER,
          lines: [
            'It is warm, and it is not marked. A world came apart round it.',
            'Patron Axilo is waiting for this in Meridian Crown.',
          ],
        };
      },
    }],
    onChoice: () => null,
    setWalker(pos, walker) { cWalk = pos ? walker : null; },
    leaveHint: 'G — BOARD (AT YOUR SHIP)',
    places: { pad: [0, pad.y, pad.z + 21], bridge: [chair.x, chair.y, chair.z], stairs: [0, pad.y, -62] },
    onEnter() {
      if (inside) return;
      inside = true;
      prev = { lightI: sun.light.intensity, ambI: sun.ambient.intensity };
      sun.light.intensity = 0;
      sun.ambient.intensity = prev.ambI * AMBIENT;
      lampOn = true;
      lamp.visible = true;
      aimLamp();
      showViewToast('THE WRECK OF THE INDIGO REACH — L · FLASHLIGHT', 7);
    },
    onLeave() {
      if (!inside) return;
      inside = false;
      sun.light.intensity = prev.lightI;
      sun.ambient.intensity = prev.ambI;
      prev = null;
      lamp.visible = false;
      lamp.intensity = 0;
    },
    tick(dt, t) {
      if (input.lampToggle) {
        lampOn = !lampOn;
        showViewToast(lampOn ? 'FLASHLIGHT ON' : 'FLASHLIGHT OFF', 2);
      }
      input.lampToggle = false;
      aimLamp();
      reachShip.relic.rotation.y = t * 0.7;
      reachShip.relic.position.y = 21.7 + Math.sin(t * 1.3) * 0.08;
    },
    // dev/verification (__debug.wreckState)
    state: () => ({
      inside, lampOn, lampI: lamp.intensity, lampVisible: lamp.visible,
      sunI: sun.light.intensity, ambI: sun.ambient.intensity,
      relic: reachShip.relic.visible, held: shatter.held,
      q: shatter.wreckPivot ? shatter.wreckPivot.quaternion.toArray() : null,
    }),
  };
  return site;
}
