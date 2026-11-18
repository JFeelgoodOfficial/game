// The Pavilion and the pilot's home, in the City of Light
// (world/lightcity.js; GDD 5.7.3).
//
// East of the terrace a bridge runs to the Pavilion: a round floor under a
// canopy of glass on slender columns, where the captains of the three fleets
// that came through the wormhole are gathered. Every ship's company has been
// given somewhere to live; a Tenretni steward is there to say so, and to show
// the pilot the lift.
//
// The lift goes to the pilot's own place: a suite at the top of one of the
// tallest towers in the city, glass from floor to ceiling all the way round.
// Everything can be seen from it: the white hole, the heart of the city, the
// hangar and what is being built in it, the Pavilion far below.
//
// Builders only, into the city's own lists (the caller merges and owns them).
// The lift is not a ride: asking moves the walker (the platform walker hands
// the site its position vector, and the site may write to it).

import * as THREE from 'three';
import { tint, box, cyl, buildRobot, trackRobot } from './capital.js';
import { buildRig, poseRig } from './aliens.js';
import { C } from '../src/constants.js';
import { Q } from '../src/quality.js';
import { createLayerPlanet } from './layerplanet.js';
import { HOME } from './chapter-dialogue.js';

export const PAV = { x: 92, z: -77, r: 30 };
// the suite: its floor's centre, in the city's frame
export const SUITE = { x: 176, y: 300, z: -176, r: 15 };
const SUITE_H = 8.6; // floor to ceiling
const GROUND_Y = -420;

const COL = { stone: 0xe9e6dd, stoneDark: 0xcfc9bb, gold: 0xc9a455, steel: 0x33404f, cloth: 0xd9d2c2, wood: 0x8a6f4c, bed: 0xf4f1ea, blue: 0x3e6a9a };
const GLOW = { gold: 0xffe2a0, white: 0xfff8ea, cyan: 0x9fe8ff };

// What the captains say, once they have been shown where they are to live.
// (A first draft, like the Keeper's greeting: the owner's to rewrite.)
const CAPTAINS = [
  {
    name: 'Shift-Captain Orrin Vask', species: 'Rustia', seed: 0x51a, at: [-9, -8], face: 0.9,
    lines: [
      'They gave every hand a room with a window. Thirty years below decks, and I have a window.',
      'I asked what it costs. The tall one said it had not thought of that.',
      'I will sleep with my boots on a while yet. But I will sleep.',
    ],
  },
  {
    name: 'Cantor Ilse Marrow', species: 'Saturnia', seed: 0x7c3, at: [9, -8], face: -0.9,
    lines: [
      'We rang every bell when we were shown our halls. The sound carries differently here. Further.',
      'Our world is gone and we are housed. I do not yet know what to call that.',
      'Go up and see yours, pilot. They say it looks out on everything.',
    ],
  },
  {
    name: 'Floor Manager Brandi Lux', species: 'Wavemall Prime', seed: 0x2e9, at: [0, 10], face: Math.PI,
    lines: [
      'Pilot! They comped the WHOLE fleet. Suites. Skyline views. No checkout time.',
      'I asked for the catch. There is always a catch. The concierge just looked at me.',
      'Yours is the tall one. Take the lift. Tell me if the minibar is real.',
    ],
  },
];
const STEWARD = {
  speaker: { name: 'The Steward', species: 'Tenretni', cityId: 'The City of Light' },
  lines: [
    'Every ship’s company has been given rooms. There are more rooms than people. There always were.',
    'Yours is at the top of the tower behind me. Its walls are glass, all the way round.',
    'You wanted to see everything. We thought you should be able to.',
    'The lift is here. It goes up when it is asked.',
  ],
};

// `k`: the city's kit { group, lit, glow, glass, surfaces, colliders, rail(ax, az, bx, bz),
//      npcs, consoles, glowMat, chapter — src/chapter.js, or none }. Returns { tick(dt, t, walker), rooms, floors, setWalker(p) }.
export function buildPavilion(k) {
  const { lit, glow, glass, surfaces, colliders, rail, npcs, consoles } = k;
  const P = PAV, S = SUITE;
  let walker = null; // the walker's own position vector, live (the lift writes to it)

  // --- the bridge east from the terrace ---
  const bx0 = 18, bx1 = P.x - P.r + 2;
  lit.push(tint(box(bx1 - bx0, 0.7, 6.6, (bx0 + bx1) / 2, -0.35, P.z), COL.stone));
  surfaces.push({ kind: 'rect', cx: (bx0 + bx1) / 2, cz: P.z, ux: 1, uz: 0, hl: (bx1 - bx0) / 2 + 2, hw: 3, yA: 0, yB: 0 });
  rail(bx0, P.z - 3, bx1, P.z - 3);
  rail(bx0, P.z + 3, bx1, P.z + 3);
  glow.push(tint(box(bx1 - bx0, 0.05, 0.3, (bx0 + bx1) / 2, 0.03, P.z), GLOW.gold, 0.9));

  // --- the Pavilion: floor, columns, canopy ---
  lit.push(tint(cyl(P.r + 0.8, P.r + 0.8, 1.2, P.x, -0.6, P.z, 56), COL.stone));
  lit.push(tint(cyl(P.r - 8, 4, 26, P.x, -14.2, P.z, 28), COL.stoneDark));
  surfaces.push({ kind: 'disc', cx: P.x, cz: P.z, r: P.r, y: 0 });
  for (let i = 0; i < 48; i++) {
    const a0 = (i / 48) * Math.PI * 2, a1 = ((i + 1) / 48) * Math.PI * 2;
    const x0 = P.x + Math.cos(a0) * P.r, z0 = P.z + Math.sin(a0) * P.r, x1 = P.x + Math.cos(a1) * P.r, z1 = P.z + Math.sin(a1) * P.r;
    if (Math.abs((z0 + z1) / 2 - P.z) < 3.8 && (x0 + x1) / 2 < P.x) continue; // the bridge
    rail(x0, z0, x1, z1);
  }
  const COLS = 12, CH = 15;
  for (let i = 0; i < COLS; i++) {
    const a = ((i + 0.5) / COLS) * Math.PI * 2;
    const x = P.x + Math.cos(a) * (P.r - 3), z = P.z + Math.sin(a) * (P.r - 3);
    lit.push(tint(cyl(0.38, 0.6, CH, x, CH / 2, z, 10), COL.stone));
    lit.push(tint(cyl(0.9, 0.42, 0.9, x, CH - 0.45, z, 10), COL.gold));
    glow.push(tint(cyl(0.5, 0.5, 0.12, x, 0.1, z, 10), GLOW.gold, 1.4));
    colliders.push({ x, z, r: 0.6, top: Infinity });
  }
  // the canopy: a ring on the columns, ribs up to a crown, glass between
  lit.push(tint(new THREE.TorusGeometry(P.r - 3, 0.55, 8, 64).rotateX(Math.PI / 2).translate(P.x, CH, P.z), COL.gold));
  for (let i = 0; i < COLS; i++) {
    const a = ((i + 0.5) / COLS) * Math.PI * 2;
    const len = Math.hypot(P.r - 3 - 3, 7);
    const g = new THREE.BoxGeometry(len, 0.3, 0.3);
    g.rotateZ(Math.atan2(7, -(P.r - 6))).translate((P.r - 3 + 3) / 2, CH + 3.5, 0).rotateY(-a).translate(P.x, 0, P.z);
    lit.push(tint(g, COL.gold));
  }
  lit.push(tint(cyl(3.2, 3.2, 0.5, P.x, CH + 7, P.z, 20), COL.gold));
  glow.push(tint(cyl(1.6, 1.6, 0.3, P.x, CH + 6.7, P.z, 20), GLOW.white, 1.6));
  glass.push(tint(new THREE.ConeGeometry(P.r - 3, 7, 48, 1, true).translate(P.x, CH + 3.5, P.z), 0xbfe0ee));
  // the table they stand round, and the light over it: the megaworld, small
  lit.push(tint(cyl(4.2, 3.4, 1.0, P.x, 0.5, P.z, 28), COL.stoneDark));
  glow.push(tint(cyl(3.6, 3.6, 0.06, P.x, 1.04, P.z, 28), GLOW.cyan, 0.9));
  colliders.push({ x: P.x, z: P.z, r: 4.3, top: Infinity });
  const orb = new THREE.Mesh(new THREE.SphereGeometry(1.1, 20, 14), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.3, 0.8), fog: false }));
  orb.position.set(P.x, 3.2, P.z);
  k.group.add(orb);
  const halo = new THREE.Mesh(new THREE.TorusGeometry(2.0, 0.05, 6, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.9, 1.3, 1.6), fog: false }));
  halo.position.copy(orb.position);
  k.group.add(halo);

  // --- the captains: one from each fleet, round the table ---
  const rigs = [];
  for (const c of CAPTAINS) {
    const rig = buildRig(c.seed, 'fleet');
    const x = P.x + c.at[0], z = P.z + c.at[1];
    rig.group.position.set(x, rig.params.groundOffset || 0, z);
    rig.group.rotation.y = c.face;
    k.group.add(rig.group);
    rigs.push(rig);
    colliders.push({ x, z, r: 0.7, top: Infinity });
    npcs.push({ x, y: 0, z, role: 'captain', talk: () => ({ speaker: { name: c.name, species: c.species, cityId: 'The Pavilion' }, lines: c.lines }) });
  }
  // --- the steward, by the lift ---
  const LIFT = { x: P.x + P.r - 7, z: P.z }; // the Pavilion's east side
  const robotMat = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x3a3426 });
  const rig = buildRobot(robotMat, k.glowMat, { body: 0xf3eede, dark: 0xc7a255, glow: 0xfff0c0 });
  const ST = { x: LIFT.x - 1.5, y: 0, z: LIFT.z - 5.5, face: -Math.PI / 2 };
  rig.group.position.set(ST.x, 0, ST.z);
  rig.group.rotation.y = ST.face;
  k.group.add(rig.group);
  const steward = { ...rig, ...ST, seed: 5.1, look: 0 };
  colliders.push({ x: ST.x, z: ST.z, r: 0.75, top: Infinity });
  npcs.push({ x: ST.x, y: 0, z: ST.z, role: 'steward', talk: () => STEWARD });

  // --- the lift: a ring of light in each floor ---
  const liftPad = (x, y, z) => {
    glow.push(tint(new THREE.TorusGeometry(2.3, 0.12, 6, 40).rotateX(Math.PI / 2).translate(x, y + 0.08, z), GLOW.cyan, 1.8));
    glow.push(tint(cyl(1.9, 1.9, 0.04, x, y + 0.04, z, 32), GLOW.cyan, 0.5));
  };
  liftPad(LIFT.x, 0, LIFT.z);
  const SL = { x: S.x, z: S.z + 9 }; // where it arrives in the suite
  liftPad(SL.x, S.y, SL.z);
  const ride = (x, y, z) => {
    if (walker) walker.set(x, y, z);
    return null;
  };
  consoles.push({ x: LIFT.x, y: 0, z: LIFT.z, r: 2.6, prompt: 'E — RIDE THE LIFT UP TO YOUR SUITE', use: () => ride(SL.x, S.y, SL.z - 2.8) });
  consoles.push({ x: SL.x, y: S.y, z: SL.z, r: 2.4, prompt: 'E — RIDE THE LIFT DOWN TO THE PAVILION', use: () => ride(LIFT.x - 3.2, 0, LIFT.z) });

  // --- the tower, and the suite at the top of it ---
  const shaftH = S.y - GROUND_Y;
  lit.push(tint(cyl(8, 13, shaftH, S.x, GROUND_Y + shaftH / 2, S.z, 16), COL.steel));
  for (let y = GROUND_Y + 40; y < S.y - 20; y += 44) glow.push(tint(cyl(8.6 + ((S.y - y) / shaftH) * 5, 8.6 + ((S.y - y) / shaftH) * 5, 1.2, S.x, y, S.z, 16), y % 88 < 44 ? GLOW.cyan : GLOW.gold, 1.2));
  lit.push(tint(cyl(S.r + 1.2, 8.5, 9, S.x, S.y - 5, S.z, 32), COL.steel)); // the flare under the floor
  lit.push(tint(cyl(S.r + 1, S.r + 1, 1, S.x, S.y - 0.5, S.z, 40), COL.stone)); // floor
  lit.push(tint(cyl(S.r + 1.4, S.r + 1.4, 0.7, S.x, S.y + SUITE_H + 0.35, S.z, 40), COL.stone)); // ceiling
  glow.push(tint(new THREE.TorusGeometry(S.r + 1.2, 0.1, 6, 64).rotateX(Math.PI / 2).translate(S.x, S.y + SUITE_H - 0.1, S.z), GLOW.gold, 1.5));
  lit.push(tint(cyl(0.5, 5, 46, S.x, S.y + SUITE_H + 23.7, S.z, 12), COL.steel)); // the spire over it
  glow.push(tint(cyl(0.7, 0.7, 1.4, S.x, S.y + SUITE_H + 47, S.z, 10), GLOW.white, 2.2));
  // glass from floor to ceiling, in thin frames
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2;
    lit.push(tint(box(0.14, SUITE_H, 0.14, S.x + Math.cos(a) * (S.r + 0.6), S.y + SUITE_H / 2, S.z + Math.sin(a) * (S.r + 0.6)), COL.gold));
  }
  const pane = new THREE.Mesh(
    new THREE.CylinderGeometry(S.r + 0.6, S.r + 0.6, SUITE_H, 64, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xcfe8ff, transparent: true, opacity: 0.07, depthWrite: false, side: THREE.DoubleSide, fog: false })
  );
  pane.position.set(S.x, S.y + SUITE_H / 2, S.z);
  pane.renderOrder = 3;
  k.group.add(pane);
  surfaces.push({ kind: 'disc', cx: S.x, cz: S.z, r: S.r, y: S.y });

  // --- what is in it: somewhere to sleep, to sit, to work, all facing out ---
  const put = (g, hex) => lit.push(tint(g, hex));
  const solid = (x, z, r) => colliders.push({ x: S.x + x, z: S.z + z, r, top: Infinity });
  const at = (w, h, d, x, y, z, hex, rot = 0) => put(box(w, h, d, S.x + x, S.y + y, S.z + z, rot), hex);
  // the bed, on the west side, its head to the middle of the room
  at(4.6, 0.5, 6.4, -8.2, 0.55, -1.5, COL.wood, 0.5);
  at(4.2, 0.5, 6.0, -8.2, 1.05, -1.5, COL.bed, 0.5);
  at(3.6, 0.3, 1.2, -6.9, 1.4, -3.8, COL.cloth, 0.5);
  at(4.2, 0.2, 2.6, -9.1, 1.36, 0.2, COL.blue, 0.5);
  solid(-8.8, -0.2, 2.6);
  solid(-7.4, -3.0, 2.2);
  // a curved seat looking at the heart of the city, and a low table
  for (let i = -1; i <= 1; i++) {
    const a = -Math.PI / 2 + i * 0.42 + 0.5;
    const x = Math.cos(a) * 8.6, z = Math.sin(a) * 8.6;
    at(3.6, 0.9, 1.5, x, 0.45, z, COL.cloth, -a + Math.PI / 2);
    at(3.6, 1.0, 0.4, x * 0.92, 1.1, z * 0.92, COL.cloth, -a + Math.PI / 2);
    solid(x, z, 1.5);
  }
  put(cyl(1.5, 1.5, 0.12, S.x + 3.2, S.y + 0.85, S.z - 10.6, 20), COL.wood);
  put(cyl(0.2, 0.5, 0.8, S.x + 3.2, S.y + 0.4, S.z - 10.6, 10), COL.gold);
  // a desk and a chair on the east side
  at(4.4, 0.14, 1.8, 10.6, 1.5, 2.5, COL.wood, 1.25);
  at(0.2, 1.5, 0.2, 9.9, 0.75, 0.9, COL.gold);
  at(0.2, 1.5, 0.2, 11.3, 0.75, 4.1, COL.gold);
  at(1.3, 0.9, 1.3, 8.6, 0.45, 3.3, COL.cloth, 1.25);
  solid(10.6, 2.5, 2.2);
  solid(8.6, 3.3, 0.8);
  // a lamp or two, a rug of light, a light in the ceiling
  for (const [x, z] of [[-4.2, 6.5], [6.5, -5.5]]) {
    put(cyl(0.07, 0.3, 3.4, S.x + x, S.y + 1.7, S.z + z, 8), COL.gold);
    glow.push(tint(cyl(0.5, 0.36, 0.7, S.x + x, S.y + 3.6, S.z + z, 12), GLOW.white, 1.6));
    solid(x, z, 0.35);
  }
  glow.push(tint(new THREE.TorusGeometry(5.2, 0.07, 6, 56).rotateX(Math.PI / 2).translate(S.x, S.y + 0.06, S.z - 1), GLOW.gold, 1.3));
  glow.push(tint(cyl(2.4, 2.4, 0.08, S.x, S.y + SUITE_H - 0.06, S.z, 28), GLOW.white, 1.3));

  // --- what waits in it (GDD 5.7.4): the pilot's own world, turning outside
  // the glass in front of the seat, drawn by the archive and all but finished;
  // and the one who has come to say what it would cost ---
  const HA = -Math.PI / 2 + 0.5; // the way the seat faces
  const hx = Math.cos(HA), hz = Math.sin(HA);
  const home = createLayerPlanet(C.CH_HOME_R, { life: 500, seed: 8.3 });
  home.group.position.set(S.x + hx * (S.r + C.CH_HOME_OUT), S.y + C.CH_HOME_UP, S.z + hz * (S.r + C.CH_HOME_OUT));
  home.group.rotation.z = 0.3;
  home.setAll(HOME.layers);
  home.holo(1);
  k.group.add(home.group);
  // the lines of light it is being drawn with, from the floor of the city up
  const beamMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.25, 0.75, 1.0), transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(C.CH_HOME_R * 0.9, 1.5, 150, 40, 1, true).translate(0, -75 - C.CH_HOME_R * 0.55, 0), beamMat);
  beam.position.copy(home.group.position);
  beam.renderOrder = 6;
  k.group.add(beam);

  const VA = HA - 0.95; // off to one side of the seat, by the glass
  const VS = { x: S.x + Math.cos(VA) * 11.6, y: S.y, z: S.z + Math.sin(VA) * 11.6 };
  VS.face = Math.atan2(home.group.position.x - VS.x, home.group.position.z - VS.z); // it is looking at it
  const vrig = buildRobot(robotMat, k.glowMat, { body: 0xf3eede, dark: 0xc7a255, glow: 0xfff0c0 });
  vrig.group.position.set(VS.x, VS.y, VS.z);
  vrig.group.rotation.y = VS.face;
  vrig.group.scale.setScalar(1.15);
  k.group.add(vrig.group);
  const visitor = { ...vrig, ...VS, seed: 9.4, look: 0 };
  colliders.push({ x: VS.x, z: VS.z, r: 0.85, top: Infinity });
  const chapter = k.chapter || null;
  if (chapter) npcs.push({ x: VS.x, y: VS.y, z: VS.z, role: 'visitor', talk: () => chapter.visitorTalk() });
  let lifeT = 0;

  return {
    // the floors the city's polished-floor shader is laid over: [geometry builder args]
    floors: [
      ['rect', (bx0 + bx1) / 2, 0.014, P.z, bx1 - bx0 + 4, 6],
      ['disc', P.x, 0.010, P.z, P.r],
      ['disc', S.x, S.y + 0.010, S.z, S.r + 0.9],
    ],
    // the suite, as a room: the third-person camera stays under its ceiling
    rooms: [{ x0: S.x - S.r - 0.5, x1: S.x + S.r + 0.5, z0: S.z - S.r - 0.5, z1: S.z + S.r + 0.5, ceil: S.y + SUITE_H }],
    setWalker(p) {
      walker = p;
    },
    inSuite: () => !!walker && walker.y > S.y - 2,
    tick(dt, t) {
      for (const r of rigs) poseRig(r, dt, t, 'idle', 0);
      trackRobot(steward, walker, dt, t);
      // the one in the suite watches whoever is in it with them, and nobody else
      trackRobot(visitor, walker && walker.y > S.y - 2 ? walker : null, dt, t);
      // home: every layer is there but the end of each. The ground and the sky
      // stop short of the pole and the line they are drawn with never gets
      // there; the life comes and goes, because that part will not hold.
      const done = C.CH_HOME_DONE + 0.012 * Math.sin(t * 0.31);
      home.reveal('ground', done);
      home.reveal('sky', done - 0.04);
      home.reveal('structures', done - 0.02);
      home.reveal('light', 0.8 + 0.2 * Math.sin(t * 0.5));
      lifeT = 0.5 + 0.5 * Math.sin(t * 0.23);
      home.reveal('life', 0.25 + 0.6 * lifeT * lifeT);
      home.group.rotation.y = t * C.CH_HOME_SPIN;
      home.tick(t, (window.innerHeight * Q.pixelRatio * 0.5) / Math.tan((C.FOV * Math.PI) / 360));
      beamMat.opacity = 0.09 + 0.03 * Math.sin(t * 1.7);
      orb.position.y = 3.2 + 0.18 * Math.sin(t * 0.9);
      halo.position.y = orb.position.y;
      halo.rotation.set(Math.PI / 2 + 0.5 * Math.sin(t * 0.4), t * 0.5, 0);
    },
    places: {
      pavilion: [P.x - 12, 0, P.z], lift: [LIFT.x - 3.2, 0, LIFT.z], suite: [SL.x, S.y, SL.z - 2.8],
      steward: [ST.x - 2.6, 0, ST.z], visitor: [VS.x - Math.cos(VA) * 2.6, S.y, VS.z - Math.sin(VA) * 2.6], captain: [P.x + CAPTAINS[0].at[0] + 2.2, 0, P.z + CAPTAINS[0].at[1] + 1.4],
    },
  };
}
