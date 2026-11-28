// The light ship's crew deck (GDD 5.7.8): where the people aboard live.
//
// Off the bridge, through a door at its starboard aft. One straight corridor,
// and off it:
//
//   to the north   five quarters: the pilot's, the three captains', and at
//                  the east end one kept for a guest. The outer wall of each is glass from floor to
//                  ceiling, onto whatever system the ship is in (the bridge's
//                  own sky, world/basebridge.js). A bed, a desk, a seat in the
//                  window, and something of the one who lives there.
//   to the south   the dining lounge (a long table, the galley, the same
//                  glass along its far wall) and the medical bay (two beds,
//                  a scanner, the cabinets).
//
// A captain lost in a chapter keeps their quarters: the lights are down and
// one small light is left on. Nobody is moved in.
//
// The envoy (season facts `ch9.ione`, `ch13.ione`): while she is aboard her
// coat hangs in the guest quarters. Once she is not, the pilot keeps a small
// figure of her and her glass by the window, and if she is lost (`'lost'`),
// a light beside them.
//
// What can be done here is small and has no story in it: rest in the pilot's
// bed, sit down to eat, have a check-up, look round a captain's room. The one
// exception is the lifepod's passenger (world/hail-dialogue.js POD, season
// fact `med.pod`): once her beacon has been heard on the bridge she is on the
// first bed, cooled almost to death, and the pilot warms her (E, a little at
// a time) and, at thirty degrees, starts her heart. She sits up, talks, and
// is gone at the next arrival, leaving a coin on the pillow.
//
// A platform-walker site (src/capitalWalk.js), walked under the universe's
// pause like every room of the ship but the bay. Frame: +y up, the corridor
// runs along x, the quarters are at -z, the lounge and the medical bay at +z.

import * as THREE from 'three';
import { sun } from '../src/sun.js';
import { chapterHud } from '../src/chapterHud.js';
import { floorOf, tint, box, cyl, mergedMesh } from './capital.js';
import { CAPTAINS } from './chapter-dialogue.js';
import { poseRig, buildRig } from './aliens.js';
import { sitRig, standRig } from './rigGround.js';
import { POD } from './hail-dialogue.js';
import { openDialogue } from '../src/dialogue.js';
import { buildCaptain, liveCaptain } from './captainDress.js';
import { measureRig } from './rigGround.js';
import { DECK } from './base-dialogue.js';
import { VERT, SKY_FRAG, MAX_BODIES } from './basebridge.js';

const ZERO = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const H = 3.2; // floor to ceiling
const T = 0.3; // a wall's thickness
const CX0 = -22, CX1 = 33, CW = 2; // the corridor: x from CX0 to CX1, z from -CW to CW
const QZ0 = -10.4, QZ1 = -2.4; // the quarters, between the corridor and the glass
const SZ0 = 2.4, SZ1 = 12.4; // the lounge and the medical bay
const LOUNGE = { x0: -22, x1: 2 }, MED = { x0: 2.4, x1: 22 };
const BRIDGE_DOOR = { x: -20.4, z: 0 };

// who lives where, west to east: the pilot, then the captains in CAPTAINS order
const COLOUR = { pilot: 0x6fe3ff, marrow: 0xb48cff, lux: 0xff6fb4, vask: 0xff8a3c, guest: 0xd8d2ff };
const ROOMS = [{ id: 'pilot', x: -16.5 }, ...CAPTAINS.map((c, i) => ({ id: c.id, x: -5.5 + 11 * i })), { id: 'guest', x: 27.5 }];
const KEEP = { x: -18.7, z: -9.3 }; // in the pilot's quarters, by the window: what is kept of the envoy
const QHW = 5.3; // a quarter's half width (walls between them at the gaps)

const ease = (a, b, x) => {
  const k = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return k * k * (3 - 2 * k);
};

// a sign: the text on a dark plate, lit
function plate(text, col, w = 1.5, h = 0.36) {
  const cv = document.createElement('canvas');
  cv.width = 512;
  cv.height = Math.round((512 * h) / w);
  const g = cv.getContext('2d');
  g.fillStyle = '#05090d';
  g.fillRect(0, 0, cv.width, cv.height);
  g.strokeStyle = '#' + new THREE.Color(col).getHexString();
  g.lineWidth = 6;
  g.strokeRect(3, 3, cv.width - 6, cv.height - 6);
  g.fillStyle = '#eaffff';
  g.font = `${Math.round(cv.height * 0.5)}px "Courier New", monospace`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text.split('').join(' '), cv.width / 2, cv.height / 2 + 2);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, fog: false }));
}

// ctx: { scene, chapter, hideFleet(), sky() (as the bridge's),
//        aboard(id): the captain is on the ship (alive, not out on a trip),
//        fact(key), setFact(key, value): the season's facts (src/season.js) }
export function createBaseDeck(ctx) {
  const { chapter } = ctx;
  const group = new THREE.Group();
  group.visible = false;
  ctx.scene.add(group);
  const time = { value: 0 };

  // --- the sky through the glass ---
  const skyU = {
    uTime: time, uWarp: { value: 0 }, uStar: { value: new THREE.Vector3(0, 0.3, -1).normalize() }, uStarCol: { value: new THREE.Color(1, 0.9, 0.7) }, uStarOn: { value: 0 },
    uBody: { value: Array.from({ length: MAX_BODIES }, () => new THREE.Vector4(0, 1, 0, 0)) },
    uBodyCol: { value: Array.from({ length: MAX_BODIES }, () => new THREE.Color(1, 1, 1)) },
  };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(3600, 48, 32), new THREE.ShaderMaterial({ uniforms: skyU, vertexShader: VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, fog: false, depthWrite: false }));
  sky.frustumCulled = false;
  sky.renderOrder = -5;
  group.add(sky);

  const lit = [], glow = [];
  const WALL = 0x46525e, TRIM = 0x1d252d, FLOOR = 0x2b3640, SOFT = 0xd9dde2, WOOD = 0x5a4634, STEEL = 0x3a4550;
  const surfaces = [], colliders = [], rooms = [];
  const floorRect = (x0, x1, z0, z1) => surfaces.push({ kind: 'rect', cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, ux: 1, uz: 0, hl: (x1 - x0) / 2, hw: (z1 - z0) / 2, yA: 0, yB: 0 });
  const room = (x0, x1, z0, z1) => {
    floorRect(x0, x1, z0, z1);
    rooms.push({ x0, x1, z0, z1, ceil: H });
    lit.push(tint(box(x1 - x0, 0.2, z1 - z0, (x0 + x1) / 2, -0.1, (z0 + z1) / 2), FLOOR));
    lit.push(tint(box(x1 - x0, 0.2, z1 - z0, (x0 + x1) / 2, H + 0.1, (z0 + z1) / 2), TRIM));
  };
  // a wall along x at z, from x0 to x1, with doorways [a, b] cut in it (a lintel over each)
  const wallX = (z, x0, x1, gaps = []) => {
    let at = x0;
    for (const [a, b] of [...gaps, [x1, x1]]) {
      if (a > at) lit.push(tint(box(a - at, H, T, (at + a) / 2, H / 2, z), WALL));
      if (b > a) lit.push(tint(box(b - a, H - 2.4, T, (a + b) / 2, 2.4 + (H - 2.4) / 2, z), WALL));
      at = b;
    }
  };
  const wallZ = (x, z0, z1) => lit.push(tint(box(T, H, z1 - z0, x, H / 2, (z0 + z1) / 2), WALL));
  // a doorway's own patch of floor, joining two rooms through the wall at z
  const doorway = (x, z, half) => floorRect(x - half, x + half, z - 0.5, z + 0.5);
  // glass from floor to ceiling along x at z, with mullions
  const glassMat = new THREE.MeshBasicMaterial({ color: 0x9fdcff, transparent: true, opacity: 0.035, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const glassX = (z, x0, x1) => {
    const g = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, H), glassMat);
    g.position.set((x0 + x1) / 2, H / 2, z);
    g.renderOrder = 3;
    group.add(g);
    for (let x = x0; x <= x1 + 0.01; x += (x1 - x0) / Math.max(1, Math.round((x1 - x0) / 3.4))) lit.push(tint(box(0.12, H, 0.16, x, H / 2, z), TRIM));
    lit.push(tint(box(x1 - x0, 0.14, 0.2, (x0 + x1) / 2, 0.07, z), TRIM), tint(box(x1 - x0, 0.14, 0.2, (x0 + x1) / 2, H - 0.07, z), TRIM));
  };

  const flatG = (list) => list.map((g) => (g.index ? g.toNonIndexed() : g));

  // --- the corridor ---
  room(CX0, CX1, -CW, CW);
  wallZ(CX0, -CW, CW);
  // its east end is glass too: the corridor looks out at the end
  {
    const g = new THREE.Mesh(new THREE.PlaneGeometry(CW * 2, H), glassMat);
    g.rotation.y = Math.PI / 2;
    g.position.set(CX1, H / 2, 0);
    g.renderOrder = 3;
    group.add(g);
    lit.push(tint(box(0.2, 0.14, CW * 2, CX1, 0.07, 0), TRIM), tint(box(0.2, 0.14, CW * 2, CX1, H - 0.07, 0), TRIM));
  }
  for (let x = CX0 + 2; x < CX1; x += 4) glow.push(tint(box(2.2, 0.04, 0.3, x, H - 0.02, 0), 0xfff1d8, 1.4)); // lights overhead
  glow.push(tint(box(CX1 - CX0, 0.02, 0.08, 0, 0.012, -CW + 0.25), 0x7fe6ff, 1.1), tint(box(CX1 - CX0, 0.02, 0.08, 0, 0.012, CW - 0.25), 0x7fe6ff, 1.1));
  // the door back to the bridge, at the west end
  glow.push(tint(new THREE.TorusGeometry(1.2, 0.07, 6, 36).rotateX(Math.PI / 2).translate(BRIDGE_DOOR.x, 0.05, BRIDGE_DOOR.z), 0xffe2a0, 1.6));
  glow.push(tint(box(0.1, 2.4, 1.6, CX0 + 0.2, 1.2, 0), 0xffe2a0, 0.5));
  {
    const p = plate(DECK.plateBridge, 0xffe2a0, 1.6, 0.34);
    p.rotation.y = Math.PI / 2;
    p.position.set(CX0 + 0.17, 2.65, 0);
    group.add(p);
  }

  // --- the quarters ---
  wallX(-CW - 0.2, CX0, CX1, ROOMS.map((r) => [r.x - 0.9, r.x + 0.9]));
  const roomGlow = {}; // per room: its own lights (put down for one who is lost), and the light left on
  for (const r of ROOMS) {
    const x0 = r.x - QHW, x1 = r.x + QHW, col = COLOUR[r.id];
    room(x0, x1, QZ0, QZ1);
    doorway(r.x, -CW - 0.2, 0.85);
    glassX(QZ0, x0, x1);
    // the bed, head to the window
    lit.push(tint(box(2.3, 0.45, 3.3, x0 + 1.6, 0.25, -8.3), TRIM));
    lit.push(tint(box(2.1, 0.22, 3.1, x0 + 1.6, 0.58, -8.3), SOFT));
    lit.push(tint(box(2.15, 0.12, 2.0, x0 + 1.6, 0.74, -7.7), col));
    lit.push(tint(box(1.5, 0.18, 0.55, x0 + 1.6, 0.78, -9.45), 0xf2f4f7));
    colliders.push({ x: x0 + 1.6, z: -9.0, r: 1.15, top: Infinity }, { x: x0 + 1.6, z: -7.4, r: 1.15, top: Infinity });
    // a seat in the window
    lit.push(tint(box(4.4, 0.45, 0.9, r.x + 1.6, 0.22, QZ0 + 0.6), TRIM), tint(box(4.2, 0.12, 0.8, r.x + 1.6, 0.5, QZ0 + 0.6), col));
    // the desk on the other wall, a chair, a rug
    lit.push(tint(box(1.0, 0.07, 2.4, x1 - 0.7, 0.76, -5.2), WOOD));
    for (const dz of [-1.0, 1.0]) lit.push(tint(box(0.08, 0.74, 0.08, x1 - 0.35, 0.37, -5.2 + dz), TRIM), tint(box(0.08, 0.74, 0.08, x1 - 1.05, 0.37, -5.2 + dz), TRIM));
    lit.push(tint(box(0.6, 0.08, 0.6, x1 - 1.6, 0.46, -5.2), STEEL), tint(box(0.08, 0.6, 0.6, x1 - 1.9, 0.76, -5.2), STEEL));
    colliders.push({ x: x1 - 0.8, z: -5.2, r: 1.0, top: Infinity });
    lit.push(tint(box(3.4, 0.02, 2.6, r.x + 0.4, 0.011, -5.6), new THREE.Color(col).multiplyScalar(0.35).getHex()));
    // a lit frame round the door, in the room's colour, and a stripe of it round the room
    glow.push(tint(box(0.08, 2.4, 0.08, r.x - 0.95, 1.2, -CW - 0.02), col, 1.5), tint(box(0.08, 2.4, 0.08, r.x + 0.95, 1.2, -CW - 0.02), col, 1.5), tint(box(1.98, 0.08, 0.08, r.x, 2.42, -CW - 0.02), col, 1.5));
    glow.push(tint(box(0.03, 0.05, QZ1 - QZ0 - 0.3, x0 + 0.17, 1.05, (QZ0 + QZ1) / 2), col, 0.9), tint(box(0.03, 0.05, QZ1 - QZ0 - 0.3, x1 - 0.17, 1.05, (QZ0 + QZ1) / 2), col, 0.9));
    // the sign by the door, on the corridor side
    const p = plate(r.id === 'pilot' ? DECK.platePilot : r.id === 'guest' ? DECK.plateGuest : CAPTAINS.find((c) => c.id === r.id).short, col);
    p.position.set(r.x + 1.75, 1.75, -CW - 0.04);
    group.add(p);
    // the room's own light: overhead, the desk lamp, and its one thing
    const own = [];
    own.push(tint(box(2.6, 0.04, 0.5, r.x, H - 0.02, -6.4), 0xfff1d8, 1.2));
    own.push(tint(new THREE.SphereGeometry(0.14, 10, 8).translate(x1 - 0.7, 1.15, -6.1), 0xffe2a0, 2.0));
    own.push(tint(cyl(0.02, 0.02, 0.35, x1 - 0.7, 0.95, -6.1, 6), 0x222222, 1));
    const desk = [x1 - 0.7, 0.8, -4.7];
    if (r.id === 'pilot') {
      // a model of the freighter on the desk, and a chart of where it has been on the wall
      own.push(tint(box(0.5, 0.12, 0.22, desk[0], desk[1] + 0.06, desk[2]), 0xcfd6dc, 1), tint(new THREE.ConeGeometry(0.11, 0.25, 8).rotateZ(-Math.PI / 2).translate(desk[0] + 0.37, desk[1] + 0.06, desk[2]), 0x6fe3ff, 1.4));
      own.push(tint(box(0.05, 1.1, 1.8, x1 - 0.03, 1.8, -5.2), 0x0b2a3a, 1.6));
      for (let i = 0; i < 9; i++) own.push(tint(box(0.06, 0.05, 0.05, x1 - 0.06, 1.4 + ((i * 0.37) % 0.8), -6 + ((i * 0.61) % 1.6)), 0x9fe8ff, 2.2));
    } else if (r.id === 'marrow') {
      // a stand of tuning bells by the window
      own.push(tint(box(0.05, 1.3, 0.05, r.x - 2.2, 0.65, -9.4), STEEL, 1));
      for (let i = 0; i < 5; i++) own.push(tint(cyl(0.07, 0.11, 0.5 - i * 0.06, r.x - 2.2 + (i - 2) * 0.22, 1.0, -9.25, 10), 0xb48cff, 1.8));
    } else if (r.id === 'lux') {
      // plants everywhere, and more lamps than anyone needs
      for (let i = 0; i < 6; i++) {
        const px = r.x - 3 + ((i * 1.37) % 5.6), pz = -9.6 + ((i * 0.83) % 1.2) * (i % 2 ? 1 : 0) + (i > 2 ? 3.4 : 0);
        own.push(tint(cyl(0.22, 0.17, 0.35, px, 0.17, pz, 10), 0x3a2a24, 1), tint(new THREE.ConeGeometry(0.3, 0.9, 7).translate(px, 0.8, pz), 0x3fb06a, 1.1));
      }
      for (let i = 0; i < 7; i++) own.push(tint(new THREE.SphereGeometry(0.07, 8, 6).translate(r.x - 3 + i, 2.6 - (i % 3) * 0.2, -9.9), 0xffb3d9, 2.4));
    } else if (r.id === 'vask') {
      // a piece of ore from home on a plinth, still warm
      own.push(tint(box(0.5, 0.8, 0.5, r.x - 2.2, 0.4, -9.3), STEEL, 1), tint(new THREE.OctahedronGeometry(0.32, 0).translate(r.x - 2.2, 1.1, -9.3), 0xff8a3c, 2.2));
    } else if (r.id === 'guest') {
      // made up for whoever comes: towels folded on the bed, a lamp on the sill, a stand for a coat
      own.push(tint(box(0.6, 0.12, 0.45, x0 + 1.2, 0.86, -7.2), 0xd8d2ff, 1), tint(box(0.6, 0.1, 0.45, x0 + 2.0, 0.85, -7.2), 0xf2f4f7, 1));
      own.push(tint(cyl(0.12, 0.16, 0.3, r.x - 1.6, 0.66, QZ0 + 0.6, 10), STEEL, 1), tint(new THREE.SphereGeometry(0.16, 10, 8).translate(r.x - 1.6, 0.98, QZ0 + 0.6), 0xe9e4ff, 1.8));
      own.push(tint(cyl(0.025, 0.025, 1.9, r.x - 2.6, 0.95, -4.0, 6), STEEL, 1), tint(cyl(0.25, 0.28, 0.05, r.x - 2.6, 0.03, -4.0, 12), STEEL, 1), tint(box(0.6, 0.04, 0.04, r.x - 2.6, 1.85, -4.0), STEEL, 1));
    }
    const ownMesh = mergedMesh(own.map((g) => (g.index ? g.toNonIndexed() : g)), new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }));
    group.add(ownMesh);
    // the one light left on, for a captain who is not coming back
    const candle = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.25, 0.7), fog: false }));
    candle.position.set(r.x + 1.6, 0.66, QZ0 + 0.6);
    candle.visible = false;
    group.add(candle);
    roomGlow[r.id] = { own: ownMesh, candle };
  }
  // the walls between the quarters, and at the ends
  wallZ(ROOMS[0].x - QHW - T / 2, QZ0, QZ1);
  for (let i = 0; i < ROOMS.length - 1; i++) wallZ((ROOMS[i].x + ROOMS[i + 1].x) / 2, QZ0, QZ1);
  wallZ(ROOMS[ROOMS.length - 1].x + QHW + T / 2, QZ0, QZ1);

  // --- the envoy's ---
  // her coat on the stand in the guest quarters, while she is aboard
  const gx = ROOMS[ROOMS.length - 1].x - 2.6;
  const coat = mergedMesh(flatG([
    tint(cyl(0.2, 0.34, 1.5, gx, 1.02, -4.0, 14), 0x262a36), tint(cyl(0.12, 0.2, 0.1, gx, 1.8, -4.0, 14), 0x262a36),
    tint(box(0.012, 1.4, 0.012, gx, 1.05, -4.0 + 0.27), 0xcfd8ff, 1.6),
  ]), new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }));
  coat.visible = false;
  group.add(coat);
  // ...and once she is gone, in the pilot's quarters by the window: a plinth, a small figure of her, her glass
  const keep = new THREE.Group();
  keep.visible = false;
  group.add(keep);
  keep.add(mergedMesh(flatG([
    tint(box(0.55, 0.9, 0.55, KEEP.x, 0.45, KEEP.z), STEEL), tint(box(0.6, 0.04, 0.6, KEEP.x, 0.92, KEEP.z), TRIM),
  ]), new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x1d262f })));
  const glassG = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.038, 0.11, 14), new THREE.MeshBasicMaterial({ color: 0xbfe6ff, transparent: true, opacity: 0.35, depthWrite: false, fog: false }));
  glassG.position.set(KEEP.x + 0.16, 0.995, KEEP.z + 0.1);
  const drink = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.034, 0.06, 14), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.3, 0.75, 0.3), fog: false }));
  drink.position.set(KEEP.x + 0.16, 0.97, KEEP.z + 0.1);
  keep.add(drink, glassG);
  const her = measureRig(buildCaptain('ione'));
  her.group.scale.setScalar(0.17);
  her.group.position.set(KEEP.x - 0.08, 0.94, KEEP.z);
  her.group.rotation.y = 0.35; // turned a little to the room
  poseRig(her, 0.016, 0, 'idle', 0);
  keep.add(her.group);
  const keepLight = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.25, 0.7), fog: false }));
  keepLight.position.set(KEEP.x + 0.18, 0.99, KEEP.z - 0.16);
  keepLight.visible = false;
  keep.add(keepLight);
  colliders.push({ x: KEEP.x, z: KEEP.z, r: 0.45, top: Infinity });
  const envoy = () => {
    const now = ctx.fact ? ctx.fact('ch13.ione') : null;
    if (now) return now; // 'aboard' | 'gone' | 'lost'
    return ctx.fact && ctx.fact('ch9.ione') === 'stayed' ? 'aboard' : null;
  };

  // --- the dining lounge ---
  const LD = [-14, -6], MD = 9; // doorways off the corridor
  wallX(CW + 0.2, CX0, CX1, [...LD.map((x) => [x - 1.2, x + 1.2]), [MD - 1, MD + 1]]);
  room(LOUNGE.x0, LOUNGE.x1, SZ0, SZ1);
  for (const x of LD) doorway(x, CW + 0.2, 1.1);
  const frame = (x, half, col) => glow.push(tint(box(0.08, 2.4, 0.08, x - half, 1.2, CW + 0.02), col, 1.5), tint(box(0.08, 2.4, 0.08, x + half, 1.2, CW + 0.02), col, 1.5), tint(box(half * 2 + 0.08, 0.08, 0.08, x, 2.42, CW + 0.02), col, 1.5));
  for (const x of LD) frame(x, 1.25, 0xffe2a0);
  frame(MD, 1.05, 0x7dffc0);
  glassX(SZ1, LOUNGE.x0, LOUNGE.x1);
  wallZ(LOUNGE.x0, SZ0, SZ1);
  wallZ((LOUNGE.x1 + MED.x0) / 2, SZ0, SZ1);
  // the long table, eight chairs, and what is on it
  const TB = { x: -10, z: 8, l: 9 };
  lit.push(tint(box(TB.l, 0.1, 1.9, TB.x, 0.78, TB.z), WOOD));
  for (const dx of [-TB.l / 2 + 0.4, TB.l / 2 - 0.4]) for (const dz of [-0.7, 0.7]) lit.push(tint(box(0.1, 0.74, 0.1, TB.x + dx, 0.37, TB.z + dz), TRIM));
  for (let i = 0; i < 4; i++) {
    const x = TB.x - 3.3 + i * 2.2;
    for (const s of [-1, 1]) {
      lit.push(tint(box(0.55, 0.08, 0.55, x, 0.46, TB.z + s * 1.35), STEEL), tint(box(0.55, 0.6, 0.08, x, 0.76, TB.z + s * 1.62), STEEL));
      glow.push(tint(cyl(0.22, 0.22, 0.02, x, 0.84, TB.z + s * 0.55, 16), 0xf4f4f0, 1.0));
      glow.push(tint(new THREE.SphereGeometry(0.07, 8, 6).translate(x + 0.05, 0.89, TB.z + s * 0.55), [0xff9a5c, 0x8fe07a, 0xffd36f, 0xd78cff][(i + (s > 0 ? 1 : 0)) % 4], 1.4));
    }
  }
  for (let i = 0; i < 3; i++) {
    glow.push(tint(new THREE.SphereGeometry(0.2, 12, 10).translate(TB.x - 3 + i * 3, 2.4, TB.z), 0xffe7c2, 1.8));
    lit.push(tint(cyl(0.015, 0.015, H - 2.6, TB.x - 3 + i * 3, 2.6 + (H - 2.6) / 2, TB.z, 4), TRIM));
  }
  for (let k = -1.5; k <= 1.5; k += 1) colliders.push({ x: TB.x + k * 2.6, z: TB.z, r: 1.25, top: Infinity });
  // the galley along the west wall, with stools
  lit.push(tint(box(1.1, 0.95, 6.5, LOUNGE.x0 + 0.75, 0.47, 7.2), TRIM), tint(box(1.2, 0.06, 6.6, LOUNGE.x0 + 0.75, 0.98, 7.2), SOFT));
  glow.push(tint(box(0.05, 0.6, 5.8, LOUNGE.x0 + 0.17, 1.9, 7.2), 0xffe2a0, 0.9));
  for (let i = 0; i < 3; i++) lit.push(tint(cyl(0.22, 0.22, 0.08, LOUNGE.x0 + 1.9, 0.7, 5.3 + i * 1.9, 12), STEEL), tint(cyl(0.04, 0.04, 0.66, LOUNGE.x0 + 1.9, 0.33, 5.3 + i * 1.9, 6), TRIM));
  for (let z = 4.6; z <= 9.8; z += 1.3) colliders.push({ x: LOUNGE.x0 + 0.75, z, r: 0.75, top: Infinity });
  // a long low sofa in the window, to the east of the table
  lit.push(tint(box(6, 0.42, 1.0, -1.6, 0.21, SZ1 - 0.75), TRIM), tint(box(5.8, 0.16, 0.9, -1.6, 0.5, SZ1 - 0.75), 0x2f5a6b));
  for (let x = LOUNGE.x0 + 2; x < LOUNGE.x1; x += 4) glow.push(tint(box(2.2, 0.04, 0.3, x, H - 0.02, 4.0), 0xfff1d8, 1.2));
  {
    const p = plate(DECK.plateLounge, 0xffe2a0, 2.2, 0.36);
    p.position.set(-10, 2.75, CW + 0.04);
    p.rotation.y = Math.PI;
    group.add(p);
  }

  // --- the medical bay ---
  room(MED.x0, MED.x1, SZ0, SZ1);
  doorway(MD, CW + 0.2, 0.9);
  wallX(SZ1, MED.x0, MED.x1);
  wallZ(MED.x1, SZ0, SZ1);
  const BEDS = [{ x: 18.4, z: 6.0 }, { x: 18.4, z: 10.0 }];
  for (const b of BEDS) {
    lit.push(tint(box(3.2, 0.7, 1.3, b.x, 0.35, b.z), STEEL), tint(box(3.0, 0.12, 1.15, b.x, 0.76, b.z), SOFT), tint(box(0.6, 0.12, 0.9, b.x + 1.1, 0.86, b.z), 0xf2f4f7));
    glow.push(tint(box(3.0, 0.03, 0.05, b.x, 0.71, b.z - 0.62), 0x7dffc0, 1.4), tint(box(3.0, 0.03, 0.05, b.x, 0.71, b.z + 0.62), 0x7dffc0, 1.4));
    colliders.push({ x: b.x - 0.9, z: b.z, r: 0.85, top: Infinity }, { x: b.x + 0.9, z: b.z, r: 0.85, top: Infinity });
  }
  // the cabinets along the north wall, each with its light
  for (let i = 0; i < 4; i++) {
    const x = MED.x0 + 2.2 + i * 2.3;
    if (Math.abs(x - MD) < 1.4) continue;
    lit.push(tint(box(1.9, 2.1, 0.55, x, 1.05, SZ0 + 0.35), 0xe8ecef));
    glow.push(tint(box(0.36, 0.1, 0.02, x, 1.6, SZ0 + 0.64), 0x7dffc0, 1.8), tint(box(0.1, 0.36, 0.02, x, 1.6, SZ0 + 0.64), 0x7dffc0, 1.8));
    colliders.push({ x, z: SZ0 + 0.35, r: 0.8, top: Infinity });
  }
  // a tank of something blue and glowing, for what a bed cannot do
  lit.push(tint(cyl(0.75, 0.85, 0.3, MED.x0 + 2.2, 0.15, SZ1 - 1.6, 20), STEEL), tint(cyl(0.75, 0.85, 0.3, MED.x0 + 2.2, 2.65, SZ1 - 1.6, 20), STEEL));
  glow.push(tint(cyl(0.6, 0.6, 2.2, MED.x0 + 2.2, 1.4, SZ1 - 1.6, 20), 0x58d7ff, 0.75));
  colliders.push({ x: MED.x0 + 2.2, z: SZ1 - 1.6, r: 0.95, top: Infinity });
  for (let x = MED.x0 + 2; x < MED.x1; x += 4) glow.push(tint(box(2.2, 0.04, 0.4, x, H - 0.02, 7.4), 0xeafff6, 1.5));
  {
    const p = plate(DECK.plateMed, 0x7dffc0, 2.0, 0.36);
    p.position.set(MD, 2.75, CW + 0.04);
    p.rotation.y = Math.PI;
    group.add(p);
  }
  // the scanner: an arch over the first bed that runs its length
  const scanArch = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.06, 8, 32, Math.PI).rotateY(Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.6, 1.8, 1.3), fog: false }));
  scanArch.position.set(BEDS[0].x + 1.4, 0.8, BEDS[0].z);
  group.add(scanArch);
  const scanSheet = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.9).rotateY(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x7dffc0, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false }));
  scanSheet.position.copy(scanArch.position);
  scanSheet.visible = false;
  group.add(scanSheet);

  // --- the lifepod's passenger, on the first bed (`med.pod`: 'aboard' cold, 'woke' sat up, 'gone') ---
  const BED = BEDS[0];
  const pod = () => (ctx.fact ? ctx.fact('med.pod') : null);
  let patient = null, patientCold = [], lying = 0; // lying: 1 on her back, 0 sat on the bed's edge
  const _ice = new THREE.Color(0xbfe4ff);
  function getPatient() {
    if (patient) return patient;
    patient = measureRig(buildRig(0x7e0d0, 'concourse'));
    // (her own materials, to frost and thaw without touching anyone else's)
    patient.group.traverse((o) => {
      if (!o.isMesh || !o.material || Array.isArray(o.material)) return;
      o.material = o.material.clone();
      if (o.material.color) patientCold.push({ m: o.material, c: o.material.color.clone() });
    });
    patient.group.visible = false;
    group.add(patient.group);
    standRig(patient, 0);
    patient.foot = patient.group.position.y; // origin to the soles, standing
    return patient;
  }
  function frost(k) {
    for (const p of patientCold) p.m.color.copy(p.c).lerp(_ice, 0.55 * k);
  }
  // on her back, head to the pillow (+x); or sat on the edge, facing the corridor
  function layPatient(t) {
    const p = getPatient();
    p.group.visible = true;
    if (lying > 0.5) {
      p.group.rotation.set(-Math.PI / 2, -Math.PI / 2, 0, 'YXZ');
      p.group.position.set(BED.x - 1.35 + p.foot, 0.92, BED.z);
    } else {
      p.group.rotation.set(0, Math.PI, 0, 'XYZ');
      p.group.position.set(BED.x - 0.2, 0, BED.z - 0.35);
      poseRig(p, 0.016, t, 'idle', 0);
      sitRig(p, 0.36);
    }
  }
  const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.015, 20), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.3, 0.6), fog: false }));
  coin.position.set(BED.x + 1.1, 0.94, BED.z);
  coin.visible = false;
  group.add(coin);
  // the revival: one record while it is being done (null when it is not)
  // rv: { temp, flow, phase: 'warm' | 'vf' | 'charge' | 'ready' | 'beat' | 'wake', t, warn, said }
  let rv = null;
  const R_START = 19, R_SHOCK = 30, R_WAKE = 33.5;

  const flat = (list) => list.map((g) => (g.index ? g.toNonIndexed() : g));
  group.add(mergedMesh(flat(lit), new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x1d262f })));
  group.add(mergedMesh(flat(glow), new THREE.MeshBasicMaterial({ vertexColors: true, fog: false })));

  // --- what is done here ---
  // one clock for whichever small thing is being done (rest, a meal, a scan): -1 when nothing is
  let u = -1, doing = null;
  const DO = { rest: 5.5, eat: 15, scan: 5.0, revive: Infinity };

  // --- a meal, shown: the pilot and whoever is aboard, sat at the table ---
  // Chairs are [x, z, yaw]: the near side faces the window (+z), the far side faces back.
  const CHAIR = (i, s) => [TB.x - 3.3 + i * 2.2, TB.z + s * 1.25, s < 0 ? 0 : Math.PI];
  const PILOT_CHAIR = CHAIR(1, -1);
  const CREW_CHAIRS = { marrow: CHAIR(1, 1), lux: CHAIR(2, -1), vask: CHAIR(2, 1) };
  const diners = CAPTAINS.map((c) => {
    const rig = buildCaptain(c.id);
    rig.group.visible = false;
    group.add(rig.group);
    return { c, rig, at: CREW_CHAIRS[c.id] || CHAIR(3, 1), on: false };
  });
  let talk = []; // [[seconds, captain id, line]] for this meal
  // A later chapter's guest aboard (src/voyage.js `aboard('deck')`, ctx.guest): { active(), consoles(), enter(site),
  // leave(), tick(dt, t, walker), dinner(hereIds) -> { rig, T, lines: [[seconds, who, text]], done() -> a door | null } | null }.
  // With no guest nothing here changes.
  let guest = null, guestConsoles = [], meal = null;
  const GUEST_CHAIR = CHAIR(0, 1);
  let talkSaid = -1;
  const _pilotPose = { x: PILOT_CHAIR[0], z: PILOT_CHAIR[1], y: 0, yaw: PILOT_CHAIR[2], mode: 'lift' };
  function sitDown() {
    const here = crewAboard();
    for (const m of diners) {
      m.on = here.includes(m.c);
      m.rig.group.visible = m.on;
      m.rig.group.position.set(m.at[0], 0, m.at[1]);
      m.rig.group.rotation.y = m.at[2];
    }
    // two things said across the table, by two of whoever is there
    const pool = here.flatMap((c) => (DECK.dinner[c.id] || []).map((l) => [c.id, l]));
    const pick = [];
    while (pool.length && pick.length < 2) {
      const k = Math.floor(Math.random() * pool.length);
      const [id, l] = pool.splice(k, 1)[0];
      if (pick.some((p) => p[0] === id) && pool.some((p) => !pick.some((q) => q[0] === p[0]))) continue;
      pick.push([id, l]);
    }
    talk = pick.map(([id, l], i) => [2.2 + i * 5.4, id, l]);
    // a guest's meal: they sit down too, the talk is theirs, and it runs as long as they say
    meal = guest && guest.dinner ? guest.dinner(here.map((c) => c.id)) : null;
    if (meal) {
      group.add(meal.rig.group);
      meal.rig.group.position.set(GUEST_CHAIR[0], 0, GUEST_CHAIR[1]);
      meal.rig.group.rotation.y = GUEST_CHAIR[2];
      talk = meal.lines;
      DO.eat = meal.T;
    }
    talkSaid = -1;
    chapterHud.cine(true);
  }
  function standUpFromTable() {
    for (const m of diners) m.rig.group.visible = m.on = false;
    chapterHud.cine(false);
  }
  const crewAboard = () => CAPTAINS.filter((c) => ctx.aboard(c.id));
  // the rig of whoever at the table is saying a line just now (a captain, or the guest), or null
  const _head = new THREE.Vector3();
  function speakingRig() {
    if (talkSaid < 0 || u - talk[talkSaid][0] >= 4.2) return null;
    const id = talk[talkSaid][1];
    const m = diners.find((x) => x.on && x.c.id === id);
    if (m) return m.rig;
    return id && meal && meal.rig && meal.rig.joints ? meal.rig : null;
  }
  const lost = (id) => id !== 'pilot' && id !== 'guest' && chapter && chapter.lost && chapter.lost(id);
  const named = (list) => (list.length <= 1 ? list.join('') : `${list.slice(0, -1).join(', ')} AND ${list[list.length - 1]}`);
  function start(what) {
    if (u >= 0) return null;
    doing = what;
    u = 0;
    if (what === 'scan') scanSheet.visible = true;
    if (what === 'eat') sitDown();
    return null;
  }
  function finish() {
    if (doing === 'rest') chapterHud.say(DECK.restSay, 6);
    if (doing === 'eat') {
      standUpFromTable();
      const who = crewAboard().map((c) => c.short);
      if (meal) {
        group.remove(meal.rig.group);
        DO.eat = 15;
        const to = meal.done();
        meal = null;
        if (to && inside) site.portal = to;
      } else chapterHud.say(who.length ? DECK.eatWith.replace('{who}', named(who)) : DECK.eatAlone, 6);
    }
    if (doing === 'scan') chapterHud.say(DECK.scanSay, 6);
    if (doing === 'revive') {
      chapterHud.panel(null);
      chapterHud.cine(false);
      // (left before her heart was going: she is as cold as she was, for next time)
      if (rv && rv.phase !== 'wake') {
        lying = 1;
        frost(1);
      }
      rv = null;
    }
    chapterHud.white(0);
    scanSheet.visible = false;
    scanArch.position.x = BEDS[0].x + 1.4;
    u = -1;
    doing = null;
  }
  function look(id) {
    if (id === 'guest') return { speaker: { name: DECK.plateGuest, species: '', cityId: DECK.where }, lines: envoy() === 'aboard' ? DECK.guestHers : DECK.guestRoom };
    const c = CAPTAINS.find((x) => x.id === id);
    return { speaker: { name: c.name, species: c.species, cityId: DECK.where }, lines: lost(id) ? DECK.lostRoom.map((l) => l.replace('{NAME}', c.short)) : DECK.room[id] };
  }

  const consoles = [
    { x: BRIDGE_DOOR.x, y: 0, z: BRIDGE_DOOR.z, r: 1.6, prompt: DECK.toBridge, off: () => u >= 0, use: () => ((site.portal = 'base:bridge-deck'), null) },
    { x: ROOMS[0].x - QHW + 1.6, y: 0, z: -6.3, r: 1.5, prompt: DECK.rest, off: () => u >= 0, use: () => start('rest') },
    { x: TB.x, y: 0, z: TB.z - 1.9, r: 2.6, prompt: DECK.eat, off: () => u >= 0, use: () => start('eat') },
    { x: BEDS[0].x, y: 0, z: BEDS[0].z - 1.4, r: 1.6, prompt: DECK.scan, off: () => u >= 0 || pod() === 'aboard' || pod() === 'woke', use: () => start('scan') },
    { x: BED.x, y: 0, z: BED.z - 1.4, r: 1.6, prompt: POD.prompt, off: () => u >= 0 || pod() !== 'aboard', use: () => ({ speaker: POD.patient, lines: POD.look, offer: { kind: 'choice', prompt: POD.begin, options: [{ label: POD.go, outcomeTag: 'med:warm' }, { label: POD.wait, outcomeTag: 'med:wait' }] } }) },
    { x: BED.x + 1.1, y: 0, z: BED.z - 1.3, r: 1.0, prompt: POD.pillowPrompt, off: () => u >= 0 || pod() !== 'gone', use: () => ({ speaker: { name: 'The first bed', species: '', cityId: DECK.where }, lines: POD.pillow }) },
    ...ROOMS.slice(1).map((r) => ({ x: r.x, y: 0, z: -4.2, r: 1.6, prompt: DECK.look, off: () => u >= 0, use: () => look(r.id) })),
    { x: KEEP.x, y: 0, z: KEEP.z + 1.1, r: 1.0, prompt: DECK.keepPrompt, off: () => u >= 0 || !keep.visible, use: () => ({ speaker: { name: DECK.keepName, species: '', cityId: DECK.where }, lines: envoy() === 'lost' ? DECK.keepLost : DECK.keepGone }) },
  ];

  // awake, sat on the bed's edge: talked to like anyone (the camera on her)
  const patientNpc = { x: 1e6, y: 0, z: 1e6, h: 1.35, role: 'patient', talk: () => ({ speaker: POD.patient, lines: POD.after }) };
  function placePatient(t = 0) {
    const st = pod();
    coin.visible = st === 'gone';
    if (st !== 'aboard' && st !== 'woke') {
      if (patient) patient.group.visible = false;
      patientNpc.x = patientNpc.z = 1e6;
      return;
    }
    if (!rv) lying = st === 'aboard' ? 1 : 0;
    frost(st === 'aboard' ? 1 : 0);
    layPatient(t);
    const awake = st === 'woke' && !rv;
    patientNpc.x = awake ? BED.x - 0.2 : 1e6;
    patientNpc.z = awake ? BED.z - 0.35 : 1e6;
  }
  function startRevive() {
    if (u >= 0 || pod() !== 'aboard') return;
    doing = 'revive';
    u = 0;
    rv = { temp: R_START, flow: 0, phase: 'warm', t: 0, warn: 0, said: false };
    chapterHud.cine(true);
    chapterHud.say(POD.say.start, 5);
    scanSheet.visible = true;
    scanArch.position.x = BED.x + 0.2;
    scanSheet.position.x = scanArch.position.x;
  }
  function reviveAct() {
    if (!rv) return;
    if (rv.phase === 'warm') rv.flow += 0.34;
    else if (rv.phase === 'ready') {
      rv.phase = 'beat';
      rv.t = 0;
      chapterHud.white(0.85);
      chapterHud.say(POD.say.shocked, 5);
    }
  }
  const bars = (k) => '■'.repeat(Math.round(k * 10)) + '□'.repeat(10 - Math.round(k * 10));
  function reviveTick(d, t) {
    rv.t += d;
    if (rv.phase === 'warm') {
      rv.flow -= rv.flow * 0.55 * d;
      rv.temp += rv.flow * 0.9 * d;
      rv.warn = Math.max(0, rv.warn - d);
      if (rv.flow > 1.15) {
        // afterdrop: too fast, and the cold blood of the limbs comes back to the core
        rv.temp = Math.max(R_START, rv.temp - 1.2);
        rv.flow = 0.15;
        rv.warn = 2.5;
        chapterHud.say(POD.say.afterdrop, 5);
      }
      // one word from the bridge, from whoever is aboard
      if (!rv.said && rv.t > 4) {
        rv.said = true;
        const here = CAPTAINS.filter((c) => ctx.aboard(c.id) && POD.intercom[c.id]);
        if (here.length) chapterHud.say(POD.intercom[here[Math.floor(Math.random() * here.length)].id], 6);
      }
      if (rv.temp >= R_SHOCK) {
        rv.temp = R_SHOCK;
        rv.phase = 'vf';
        rv.t = 0;
        chapterHud.say(POD.say.thirty, 6);
      }
    } else if (rv.phase === 'vf' && rv.t > 1.2) {
      rv.phase = 'charge';
      rv.t = 0;
    } else if (rv.phase === 'charge' && rv.t > 1.6) {
      rv.phase = 'ready';
    } else if (rv.phase === 'beat') {
      chapterHud.white(0.85 * (1 - ease(0, 0.6, rv.t)));
      rv.temp = Math.min(R_WAKE, rv.temp + d * 0.9);
      if (rv.t > 4.2) {
        rv.phase = 'wake';
        if (ctx.setFact) ctx.setFact('med.pod', 'woke');
        scanSheet.visible = false;
        chapterHud.panel(null);
        chapterHud.cine(false);
        lying = 0;
        layPatient(t);
        rv.t = 0;
        openDialogue({ speaker: POD.patient, lines: POD.woke, cine: true }, { onClose: () => { if (doing === 'revive') finish(); placePatient(t); } });
      }
    }
    // the cold leaves her as she warms; the shock jolts her
    frost(1 - ease(R_START, R_WAKE, rv.temp));
    if (patient && lying > 0.5) {
      const jolt = rv.phase === 'beat' ? Math.max(0, 1 - rv.t * 4) : 0;
      patient.group.position.y = 0.92 + 0.08 * jolt;
    }
    if (rv.phase !== 'wake') {
      const band = rv.flow < 0.25 ? POD.slow : rv.flow <= 0.85 ? POD.good : POD.fast;
      const heart = rv.phase === 'warm' ? POD.none : rv.phase === 'beat' ? POD.sinus : POD.vf;
      chapterHud.panel(`${POD.core} ${rv.temp.toFixed(1)} °C\n${POD.rate} ${bars(Math.min(1, rv.flow / 1.15))} ${rv.phase === 'warm' ? band : ''}\n${POD.heart} ${heart}`);
    }
    scanSheet.material.opacity = 0.14 * (0.6 + 0.4 * Math.sin(t * (rv.phase === 'beat' ? 7 : 3)));
  }

  let inside = false, prev = null, walker = null;
  function readSky() {
    const s = ctx.sky();
    skyU.uStarOn.value = s.star ? 1 : 0;
    if (s.star) {
      skyU.uStar.value.copy(s.star);
      skyU.uStarCol.value.copy(s.starCol);
    }
    for (let i = 0; i < MAX_BODIES; i++) {
      const b = s.bodies[i];
      skyU.uBody.value[i].w = b ? b.k : 0;
      if (b) {
        skyU.uBody.value[i].set(b.dir.x, b.dir.y, b.dir.z, b.k);
        skyU.uBodyCol.value[i].copy(b.col);
      }
    }
  }
  // the quarters of whoever was lost: lights down, one left on
  function muster() {
    for (const r of ROOMS) {
      const gone = lost(r.id);
      roomGlow[r.id].own.visible = !gone;
      roomGlow[r.id].candle.visible = gone;
    }
    const e = envoy();
    coat.visible = e === 'aboard';
    keep.visible = e === 'gone' || e === 'lost';
    keepLight.visible = e === 'lost';
  }

  const site = {
    group,
    planet: { group: { position: ZERO }, sunDir: UP },
    noShip: true,
    speed: 1,
    exit: { x: BRIDGE_DOOR.x, z: BRIDGE_DOOR.z },
    leaveHint: DECK.toBridge.replace('E — ', ''),
    surfaces,
    colliders,
    rooms,
    floorYAt: floorOf(surfaces, 1.2),
    snap: 1.2,
    pad: new THREE.Vector3(),
    spawn: new THREE.Vector3(BRIDGE_DOOR.x + 2.2, 0, 0), // in from the bridge, facing down the corridor
    spawnYaw: Math.PI / 2,
    npcs: [patientNpc],
    consoles,
    onChoice(tag) {
      if (tag === 'med:warm') startRevive();
      return null;
    },
    portal: null,
    held: () => u >= 0,
    // at the table: the pilot is shown in their chair
    pilotPose: () => (doing === 'eat' ? _pilotPose : null),
    // ...and the meal is watched: slowly round the table from the corridor side, the window and the stars beyond
    camera(pos, target) {
      if (doing === 'revive') {
        if (rv && rv.phase === 'wake') {
          // close on her, sat up on the bed's edge
          pos.set(BED.x - 1.6, 1.55, BED.z - 2.3);
          target.set(BED.x - 0.2, 1.1, BED.z - 0.35);
        } else {
          // from the foot of the bed, over her, the scanner's light
          pos.set(BED.x - 2.9, 2.55, BED.z - 2.2);
          target.set(BED.x + 0.2, 0.85, BED.z);
        }
        return true;
      }
      if (doing !== 'eat') return false;
      // whoever is speaking across the table, while they say it
      const sp = speakingRig();
      if (sp) {
        sp.group.updateMatrixWorld(true);
        group.worldToLocal(sp.joints.head.getWorldPosition(_head));
        // over the pilot's shoulder: whoever is talking turns to the pilot's chair to say it
        let dx = PILOT_CHAIR[0] - _head.x, dz = PILOT_CHAIR[1] - _head.z;
        const l = Math.hypot(dx, dz) || 1;
        dx /= l;
        dz /= l;
        pos.set(PILOT_CHAIR[0] + dx * 0.9 + dz * 0.45, 1.75, PILOT_CHAIR[1] + dz * 0.9 - dx * 0.45);
        target.set(_head.x, _head.y - 0.05, _head.z);
        return true;
      }
      const a = Math.PI + 0.55 - 0.7 * ease(0, DO.eat, u);
      pos.set(TB.x - 0.6 + Math.sin(a) * 4.6, 2.05, TB.z + Math.cos(a) * 4.6);
      target.set(TB.x - 0.6, 0.95, TB.z + 0.2);
      return true;
    },
    // E: the meal is over (a small thing; nothing is missed)
    act() {
      if (doing === 'eat') u = Math.max(u, DO.eat - 0.6);
      if (doing === 'revive') reviveAct();
    },
    heldPrompt: () => (doing === 'eat' ? 'E — SKIP' : doing === 'revive' && rv ? (rv.phase === 'warm' ? POD.tap : rv.phase === 'ready' ? POD.shockKey : rv.phase === 'charge' || rv.phase === 'vf' ? POD.charging : '') : ''),
    setWalker(p) {
      walker = p || null;
    },
    onEnter() {
      if (inside) return;
      inside = true;
      site.portal = null;
      group.visible = true;
      const scene = ctx.scene;
      prev = {
        fog: scene.fog,
        lightPos: sun.light.position.clone(), lightColor: sun.light.color.clone(), lightI: sun.light.intensity,
        ambColor: sun.ambient.color.clone(), ambI: sun.ambient.intensity,
      };
      scene.fog = null;
      // lit from overhead, warm, like a place people live
      sun.light.position.set(0.2, 1, 0.3).normalize();
      sun.light.color.setRGB(1.0, 0.94, 0.85);
      sun.light.intensity = 1.6;
      sun.ambient.color.setRGB(0.6, 0.65, 0.75);
      sun.ambient.intensity = 1.05;
      ctx.hideFleet();
      u = -1;
      doing = null;
      guest = ctx.guest ? ctx.guest() : null;
      if (guest && !guest.active()) guest = null;
      if (guest) {
        guest.enter(site);
        guestConsoles = guest.consoles();
        consoles.unshift(...guestConsoles);
      }
      readSky();
      muster();
      placePatient(0);
    },
    onLeave() {
      if (!inside) return;
      inside = false;
      group.visible = false;
      if (u >= 0) finish();
      if (guest) {
        consoles.splice(0, guestConsoles.length);
        guest.leave();
        guest = null;
        guestConsoles = [];
      }
      chapterHud.clear();
      ctx.scene.fog = prev.fog;
      sun.light.position.copy(prev.lightPos);
      sun.light.color.copy(prev.lightColor);
      sun.light.intensity = prev.lightI;
      sun.ambient.color.copy(prev.ambColor);
      sun.ambient.intensity = prev.ambI;
      prev = null;
    },
    tick(dt, t) {
      chapterHud.tick(dt);
      time.value = t;
      if (walker) sky.position.copy(walker);
      // sat up and getting her strength back
      if (patient && patient.group.visible && lying < 0.5 && !(rv && rv.phase !== 'wake')) {
        poseRig(patient, Math.min(dt, 0.1), t, 'idle', 0);
        sitRig(patient, 0.36);
      }
      if (u >= 0) {
        u += Math.min(dt, 0.1);
        const end = DO[doing];
        if (doing === 'rest') chapterHud.white(ease(0, 1.6, u) * (1 - ease(end - 1.6, end, u)));
        if (doing === 'eat') {
          // a short fade in and out round it
          chapterHud.white(0.9 * (1 - ease(0, 0.9, u)) + 0.9 * ease(end - 0.8, end, u));
          while (talkSaid + 1 < talk.length && u >= talk[talkSaid + 1][0]) {
            const [, id, l] = talk[++talkSaid];
            const c = CAPTAINS.find((x) => x.id === id);
            chapterHud.say(c ? `${c.short} — ${l}` : id ? `${id} — ${l}` : l, 5); // (a guest's line names its own speaker)
          }
          const d = Math.min(dt, 0.1);
          if (meal && meal.rig.joints) { // (a guest's meal may seat nobody: an empty group, nothing to pose)
            poseRig(meal.rig, d, t, 'idle', 0);
            sitRig(meal.rig, 0);
          }
          const speaking = talkSaid >= 0 && u - talk[talkSaid][0] < 4 ? talk[talkSaid][1] : null;
          for (const m of diners) {
            if (!m.on) continue;
            poseRig(m.rig, d, t, 'idle', 0);
            // eating: a hand to the mouth now and then, out of step with the others
            const k = Math.max(0, Math.sin(t * 1.3 + m.rig.params.gaitPhase * 3));
            m.rig.joints.armR.shoulder.rotation.x = -0.5 - 0.6 * k;
            m.rig.joints.armR.elbow.rotation.x = -0.9 - 0.9 * k;
            m.rig.joints.armL.shoulder.rotation.x = -0.45;
            m.rig.joints.armL.elbow.rotation.x = -0.8;
            sitRig(m.rig, 0);
            // whoever is talking looks round the table; the others look at them
            const sp = speaking && diners.find((x) => x.c.id === speaking);
            const look = sp && sp !== m ? Math.atan2(sp.at[0] - m.at[0], sp.at[1] - m.at[1]) - m.at[2] : sp === m ? Math.atan2(PILOT_CHAIR[0] - m.at[0], PILOT_CHAIR[1] - m.at[1]) - m.at[2] : 0;
            liveCaptain(m.rig, d, t, speaking === m.c.id, look);
          }
        }
        if (doing === 'revive' && rv && rv.phase !== 'wake') reviveTick(Math.min(dt, 0.1), t);
        if (doing === 'scan') {
          const k = ease(0.3, end - 0.6, u);
          scanArch.position.x = BEDS[0].x + 1.4 - 2.8 * k;
          scanSheet.position.x = scanArch.position.x;
          scanSheet.material.opacity = 0.18 * (0.6 + 0.4 * Math.sin(t * 9));
        }
        if (u >= end) finish();
      }
    },
    inside: () => inside,
    muster,
    places: {
      bridgeDoor: [BRIDGE_DOOR.x, 0, BRIDGE_DOOR.z],
      quarters: Object.fromEntries(ROOMS.map((r) => [r.id, [r.x, 0, -6.4]])),
      lounge: [TB.x, 0, TB.z - 2.4], med: [BEDS[0].x - 1, 0, BEDS[0].z - 1.6], keepsake: [KEEP.x, 0, KEEP.z + 1.1],
    },
    info: () => ({ pod: pod(), revive: rv ? { phase: rv.phase, temp: +rv.temp.toFixed(1), flow: +rv.flow.toFixed(2) } : null, envoy: envoy(), keep: keep.visible, coat: coat.visible, doing, u: +u.toFixed(1), lost: ROOMS.filter((r) => lost(r.id)).map((r) => r.id), star: skyU.uStarOn.value > 0, rooms: rooms.length }),
  };
  return site;
}
