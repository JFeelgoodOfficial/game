// The Proving Ground: the example chapter (GDD 5.7.8).
//
// Not story. The smallest thing a chapter can be, so the loop every chapter
// stands on can be flown: leave the light ship's bay in the freighter, dock at
// something, walk it, land on a world, walk that, and come home to the bay.
// And so the next chapter has something to be copied from: this file is its
// world, world/example-dialogue.js its words, the entry in src/systems.js its
// place on the chart, and `serialize` / `restore` below its save record.
//
// What is here:
//   the relay   a pad on a spar, an old beacon and its log. A dock
//               (src/game.js SYSTEM_DOCK flies the approach) and a walked
//               platform (src/capitalWalk.js).
//   Cinder      one bare, landable world (constants.js BASE_EXAMPLE_PLANET),
//               made after boot by src/planet.js buildPlanet.
//
// Its stage machine, in full: 'arrived' -> 'docked' (the relay has been walked)
// -> 'logged' (its log has been read). Forward only, as every chapter's is.

import * as THREE from 'three';
import { C, BASE_EXAMPLE_PLANET } from '../src/constants.js';
import { tint, box, cyl, mergedMesh, floorOf } from './capital.js';
import { EXAMPLE } from './example-dialogue.js';
import { createCrewFollow } from './crewFollow.js';

export const EXAMPLE_STAGES = ['arrived', 'docked', 'logged'];
const SNAP = 1.2;
const ZERO = new THREE.Vector3();
const PAD_Z = 34, PAD_R = 22, WAY_HW = 4, MAST_Z = -34;
const COL = { deck: 0x3a352a, deckLight: 0x5a5244, trim: 0x6a6050, hull: 0x24211a };
const GLOW = { amber: 0xffb45a, pale: 0xfff0c8, red: 0xff5a4a };

// Cinder: a config for src/planet.js, as the home system's worlds are, with
// where it is (absolute) added. A dry world of ash and iron, no town, no sea.
const CINDER = {
  name: 'cinder',
  type: 'terra',
  pos: [-21000, -2600, -46000],
  dir: new THREE.Vector3(0, 0, -1), // (placed by src/voyage.js from `pos`, not from this)
  distance: () => 1,
  radius: () => 620,
  mass: () => 2.6e9,
  skyColor: () => new THREE.Color(0x6a5a52),
  spin: () => 0.004,
  atmoColor: new THREE.Color(0xc09a80),
  seaLevel: () => -1,
  terrainHeight: () => 46,
  shape: { ridge: 0.55, ridgeFreq: 2.4, valley: 0.35 },
  iceLat: 2,
  palette: {
    deep: new THREE.Color(0x5a4a40), shallow: new THREE.Color(0x7a6252), sand: new THREE.Color(0xa88868),
    low: new THREE.Color(0xb08a6a), mid: new THREE.Color(0x8a7264), high: new THREE.Color(0xd0c0b0),
  },
  water: null,
  clouds: false,
  dress: null,
  sunFixed: true,
  navColor: '#c79a78',
  label: EXAMPLE.planet.label,
};

// ctx: { scene, camera, chapter, voyage, sunDir, save(), crewTalk(captain) }
export function createExampleSystem(ctx) {
  let stage = 'arrived';
  const at = (s) => EXAMPLE_STAGES.indexOf(s);
  function advance(to) {
    if (at(to) <= at(stage)) return false;
    stage = to;
    ctx.save();
    return true;
  }

  // --- the relay ---
  const group = new THREE.Group();
  const lit = [], glow = [];
  const surfaces = [], colliders = [];
  lit.push(tint(cyl(PAD_R + 2, PAD_R + 4, 2, 0, -1, PAD_Z, 32), COL.deck));
  lit.push(tint(cyl(PAD_R, PAD_R, 0.14, 0, 0.07, PAD_Z, 32), COL.deckLight));
  surfaces.push({ kind: 'disc', cx: 0, cz: PAD_Z, r: PAD_R + 1.6, y: 0.14 });
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    glow.push(tint(box(0.8, 0.12, 0.8, Math.cos(a) * (PAD_R + 0.6), 0.16, PAD_Z + Math.sin(a) * (PAD_R + 0.6)), GLOW.amber, 1.5));
  }
  // the walk from the pad to the beacon's foot
  const z0 = PAD_Z - PAD_R + 2, z1 = MAST_Z - 5;
  lit.push(tint(box(WAY_HW * 2 + 1, 1.4, z0 - z1, 0, -0.56, (z0 + z1) / 2), COL.deck));
  surfaces.push({ kind: 'rect', cx: 0, cz: (z0 + z1) / 2, ux: 0, uz: 1, hl: (z0 - z1) / 2, hw: WAY_HW, yA: 0.14, yB: 0.14 });
  for (const s of [-1, 1]) glow.push(tint(box(0.14, 0.08, z0 - z1, s * (WAY_HW - 0.3), 0.2, (z0 + z1) / 2), GLOW.amber, 1.2));
  // the beacon: a mast, a lamp at its head, and the log at its foot
  lit.push(tint(cyl(0.9, 1.5, 46, 0, 23, MAST_Z - 2.6, 10), COL.hull));
  lit.push(tint(box(1.6, 1.1, 0.8, 0, 0.7, MAST_Z), COL.trim));
  glow.push(tint(box(1.3, 0.06, 0.6, 0, 1.28, MAST_Z), GLOW.pale, 1.5));
  colliders.push({ x: 0, z: MAST_Z, r: 1.0, top: Infinity }, { x: 0, z: MAST_Z - 2.6, r: 1.6, top: Infinity });
  // dishes that have not turned in a long time
  for (const [x, y, r] of [[-5, 30, 4.5], [6, 38, 3.2]]) {
    lit.push(tint(new THREE.SphereGeometry(r, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2.4).rotateX(-Math.PI / 2.6).translate(x, y, MAST_Z - 2.6), COL.trim));
    lit.push(tint(box(Math.abs(x), 0.5, 0.5, x / 2, y, MAST_Z - 2.6), COL.hull));
  }
  // the spar everything hangs on
  lit.push(tint(box(3, 3, z0 - z1 + PAD_R * 2, 0, -3, (PAD_Z + PAD_R + z1) / 2), COL.hull));
  const litMat = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x17130d });
  const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false });
  group.add(mergedMesh(lit, litMat));
  group.add(mergedMesh(glow, glowMat));
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(1.4, 12, 8), new THREE.MeshBasicMaterial({ color: GLOW.red, fog: false }));
  lamp.position.set(0, 47, MAST_Z - 2.6);
  group.add(lamp);

  // whoever came along in the freighter follows the pilot round the relay
  const crew = createCrewFollow({ group, floorY: 0.14, talk: ctx.crewTalk });

  let walker = null, walkerLive = null;
  const site = {
    group,
    planet: { group: { position: ZERO }, sunDir: ctx.sunDir },
    surfaces,
    colliders,
    floorYAt: floorOf(surfaces, SNAP),
    snap: SNAP,
    pad: new THREE.Vector3(0, 0.14, PAD_Z),
    padR: PAD_R,
    spawn: new THREE.Vector3(8, 0.14, PAD_Z - 7),
    leaveHint: EXAMPLE.relay.leaveHint,
    npcs: crew.npcs,
    consoles: [{
      x: 0, y: 0.14, z: MAST_Z + 2.2, r: 2.4, prompt: EXAMPLE.relay.logPrompt,
      use() {
        const first = advance('logged');
        return { speaker: EXAMPLE.relay.speaker, lines: first ? EXAMPLE.relay.first : EXAMPLE.relay.again };
      },
    }],
    onChoice: () => null,
    portal: null,
    setWalker(p, live) {
      walker = p || null;
      walkerLive = p ? live || null : null;
    },
    onEnter() {
      advance('docked');
      crew.set(ctx.voyage.crew());
    },
    onLeave() {
      crew.set([]);
    },
    inside: () => !!walker,
    update(dt, t) {
      if (walker) crew.tick(dt, t, walkerLive);
      lamp.material.color.setHex(GLOW.red).multiplyScalar(0.5 + 1.5 * Math.max(0, Math.sin(t * 2.2)));
    },
    places: { pad: [8, 0.14, PAD_Z - 7], log: [0, 0.14, MAST_Z + 2.2] },
  };

  return {
    docks: [{
      id: 'relay', label: EXAMPLE.relay.label, pos: [16000, 900, -9000], site, radius: 420, hover: C.BASE_DOCK_HOVER,
      approach: EXAMPLE.relay.approach, welcome: EXAMPLE.relay.welcome, dockLabel: EXAMPLE.relay.dockLabel, color: '#ffb45a',
    }],
    planets: BASE_EXAMPLE_PLANET ? [CINDER] : [],
    talk: (captainId) => EXAMPLE.talk[captainId] || null,
    // the record: only once something has happened here
    serialize: () => (stage === 'arrived' ? undefined : { stage }),
    restore(raw) {
      if (raw && EXAMPLE_STAGES.includes(raw.stage)) stage = raw.stage;
    },
    state: () => ({ stage, relay: site.places, crew: crew.state() }),
    // dev: jump its stage, either way
    go(s) {
      if (!EXAMPLE_STAGES.includes(s)) return false;
      stage = s;
      ctx.save();
      return true;
    },
  };
}
