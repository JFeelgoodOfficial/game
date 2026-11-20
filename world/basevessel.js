// The light ship, from outside, and its hangar bay (GDD 5.7.8).
//
// The ship of world/lightvessel.js, out of its yard and standing in open
// space: the same block of cells, turned so its bow is along -z (the way a
// docked freighter faces). Slung under the keel is the bay: an open deck with
// the hull for a roof, a mouth astern and a mouth ahead. The pilot's freighter
// comes in by the stern mouth, parks on the pad, and leaves by the forward
// one, so neither path needs a turn (src/game.js BAY_DOCK).
//
// The bay answers the platform contract of src/capitalWalk.js, and it is IN
// the world: the universe is not paused here, and whatever system the ship is
// in is in view past the deck's edge. The lifts up into the ship (the bridge,
// the archive) are consoles that raise `portal`; src/homebase.js maps them.
//
// The frame is the bay's own: y = 0 is the deck, the pad is in the middle,
// -z is forward. The group sits in the scene at the ship's absolute position
// (src/voyage.js re-places it every frame), so `planet` is a stand-in at zero.

import * as THREE from 'three';
import { C } from '../src/constants.js';
import { tint, box, cyl, mergedMesh, floorOf } from './capital.js';
import { buildHangar } from './lightvessel.js';
import { BASE } from './base-dialogue.js';

const SNAP = 1.2;
const ZERO = new THREE.Vector3();
const COL = { deck: 0x12171c, deckLight: 0x1d262e, trim: 0x27333d, hull: 0x0c1014 };
const GLOW = { line: 0x7fe6ff, pad: 0xffe2a0, lift: 0xbfa8ff, warn: 0xff9a5a };

// ctx: { sunDir: live unit vector toward the system's star, roster(): open the
// trip roster (src/homebase.js) }
export function createBaseVessel(ctx) {
  const group = new THREE.Group();
  group.visible = false;
  const HW = C.BASE_BAY_HW, HL = C.BASE_BAY_HL, ROOF = C.BASE_BAY_ROOF;

  // --- the hull: the light ship itself, over the bay ---
  const hull = buildHangar(group);
  hull.yard.visible = false; // it left its yard a long time ago
  hull.era(true); // ...finished: the corner that was never built is there
  hull.root.rotation.y = Math.PI; // bow along -z
  hull.root.position.set(0, 0, 0);
  hull.root.updateMatrixWorld(true);
  const bb = new THREE.Box3().setFromObject(hull.vessel);
  // sit the keel on the bay's roof, the hull's middle over the pad
  hull.root.position.set(-(bb.min.x + bb.max.x) / 2, ROOF - bb.min.y, -(bb.min.z + bb.max.z) / 2);
  const size = bb.getSize(new THREE.Vector3());
  // the middle of the hull, bay-local: what the dock's stand-in is centred on
  const centre = new THREE.Vector3(0, ROOF + size.y / 2, 0);
  const hullR = 0.5 * size.length();

  // --- the bay ---
  const lit = [], glow = [];
  const surfaces = [{ kind: 'rect', cx: 0, cz: 0, ux: 0, uz: 1, hl: HL, hw: HW, yA: 0, yB: 0 }];
  const colliders = [];
  lit.push(tint(box(HW * 2 + 4, 2.2, HL * 2 + 4, 0, -1.1, 0), COL.deck));
  lit.push(tint(box(HW * 2 - 8, 0.08, HL * 2 - 8, 0, 0.04, 0), COL.deckLight));
  // frames: a post either side and a beam under the keel, down the length
  for (let z = -HL + 6; z <= HL - 6; z += 26) {
    for (const s of [-1, 1]) {
      lit.push(tint(box(2.2, ROOF, 2.2, s * (HW + 0.6), ROOF / 2, z), COL.hull));
      colliders.push({ x: s * (HW + 0.6), z, r: 1.6, top: Infinity });
      glow.push(tint(box(0.3, ROOF - 4, 0.3, s * (HW - 0.6), ROOF / 2, z), GLOW.line, 1.2));
    }
    lit.push(tint(box(HW * 2 + 3.4, 2.4, 2.2, 0, ROOF - 1.2, z), COL.hull));
  }
  // a line of light down each edge, and the two mouths marked
  for (const s of [-1, 1]) glow.push(tint(box(0.24, 0.1, HL * 2 - 4, s * (HW - 2), 0.1, 0), GLOW.line, 1.4));
  glow.push(tint(box(HW * 2 - 6, 0.1, 0.5, 0, 0.1, HL - 2), GLOW.warn, 1.3)); // astern: the way in
  glow.push(tint(box(HW * 2 - 6, 0.1, 0.5, 0, 0.1, -HL + 2), GLOW.pad, 1.3)); // ahead: the way out
  // the pad
  const PAD_R = 15;
  lit.push(tint(cyl(PAD_R, PAD_R, 0.14, 0, 0.07, 0, 40), COL.deckLight));
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    glow.push(tint(box(0.7, 0.12, 0.7, Math.cos(a) * (PAD_R + 1), 0.16, Math.sin(a) * (PAD_R + 1)), GLOW.pad, 1.5));
  }
  glow.push(tint(box(0.4, 0.06, PAD_R * 1.4, 0, 0.17, 0), GLOW.pad, 1.1));

  // --- the lifts up into the ship, port side forward; the roster by the pad ---
  const consoles = [];
  const lift = (x, z, col, prompt, to) => {
    lit.push(tint(cyl(2.6, 2.9, 0.3, x, 0.15, z, 24), COL.trim));
    glow.push(tint(new THREE.TorusGeometry(2.3, 0.09, 6, 40).rotateX(Math.PI / 2).translate(x, 0.34, z), col, 1.6));
    // the shaft it rides, up to the keel
    glow.push(tint(cyl(0.12, 0.12, ROOF, x - 2.4, ROOF / 2, z, 6), col, 1.2));
    glow.push(tint(cyl(0.12, 0.12, ROOF, x + 2.4, ROOF / 2, z, 6), col, 1.2));
    consoles.push({ x, y: 0.3, z, r: 2.6, prompt, use: () => ((site.portal = to), null) });
  };
  lift(-HW + 8, -30, GLOW.line, BASE.toBridge, 'base:bridge');
  lift(-HW + 8, -18, GLOW.lift, BASE.toArchive, 'base:archive');
  // the roster: a lectern on the starboard side of the pad
  lit.push(tint(box(1.2, 1.1, 0.7, PAD_R + 5, 0.55, 6), COL.trim));
  glow.push(tint(box(1.0, 0.06, 0.5, PAD_R + 5, 1.14, 6), GLOW.lift, 1.5));
  colliders.push({ x: PAD_R + 5, z: 6, r: 0.9, top: Infinity });
  consoles.push({ x: PAD_R + 5, y: 0, z: 7.6, r: 2.2, prompt: BASE.roster, use: () => (ctx.roster(), null) });

  const litMat = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x10161c });
  const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false });
  group.add(mergedMesh(lit, litMat));
  group.add(mergedMesh(glow, glowMat));

  // a beacon astern, for finding the mouth from the air
  const beacon = new THREE.Mesh(
    new THREE.CylinderGeometry(3, 9, 600, 12, 1, true).rotateX(Math.PI / 2).translate(0, 6, HL + 300),
    new THREE.MeshBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
  );
  group.add(beacon);

  let walker = null;
  const site = {
    group,
    planet: { group: { position: ZERO }, sunDir: ctx.sunDir },
    surfaces,
    colliders,
    floorYAt: floorOf(surfaces, SNAP),
    snap: SNAP,
    pad: new THREE.Vector3(0, 0.14, 0),
    padR: PAD_R,
    spawn: new THREE.Vector3(8, 0, 9), // stepping off the freighter, starboard side
    spawnYaw: Math.PI / 2,
    fromLift: new THREE.Vector3(-HW + 12, 0, -24), // coming back down from the ship
    fromLiftYaw: -Math.PI / 2,
    leaveHint: BASE.bayLeave,
    npcs: [],
    consoles,
    onChoice: () => null,
    portal: null,
    setWalker(p) {
      walker = p || null;
    },
    onEnter() {
      site.portal = null;
    },
    inside: () => !!walker,
    // what the dock (src/game.js BAY_DOCK) flies by, all bay-local
    dock: {
      centre,
      radius: Math.max(C.BASE_CAPTURE, hullR + 120),
      hover: new THREE.Vector3(0, 0.14, C.BASE_BAY_STANDOFF), // astern of the stern mouth
      exit: new THREE.Vector3(0, 0.14, -C.BASE_BAY_STANDOFF), // clear of the forward one
    },
    hullR,
    // `cam`: the camera's world position
    update(dt, t, cam) {
      hull.tick(t);
      beacon.visible = cam.distanceToSquared(group.position) > 500 * 500;
      beacon.material.opacity = 0.14 + 0.08 * Math.sin(t * 2.1);
    },
    places: { pad: [8, 0, 9], lift: [-HW + 12, 0, -24], roster: [PAD_R + 5, 0, 7.6], stern: [0, 0, HL - 4], bow: [0, 0, -HL + 4] },
    info: () => ({ cells: hull.cells, hullR: Math.round(hullR), centre: centre.toArray().map(Math.round), radius: Math.round(site.dock.radius) }),
  };
  return site;
}
