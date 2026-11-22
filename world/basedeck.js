// The light ship's crew deck (GDD 5.7.8): where the people aboard live.
//
// Off the bridge, through a door at its starboard aft. One straight corridor,
// and off it:
//
//   to the north   four quarters, one each: the pilot's and the three
//                  captains'. The outer wall of each is glass from floor to
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
// What can be done here is small and has no story in it: rest in the pilot's
// bed, sit down to eat, have a check-up, look round a captain's room.
//
// A platform-walker site (src/capitalWalk.js), walked under the universe's
// pause like every room of the ship but the bay. Frame: +y up, the corridor
// runs along x, the quarters are at -z, the lounge and the medical bay at +z.

import * as THREE from 'three';
import { sun } from '../src/sun.js';
import { chapterHud } from '../src/chapterHud.js';
import { floorOf, tint, box, cyl, mergedMesh } from './capital.js';
import { CAPTAINS } from './chapter-dialogue.js';
import { DECK } from './base-dialogue.js';
import { VERT, SKY_FRAG, MAX_BODIES } from './basebridge.js';

const ZERO = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const H = 3.2; // floor to ceiling
const T = 0.3; // a wall's thickness
const CX0 = -22, CX1 = 22, CW = 2; // the corridor: x from CX0 to CX1, z from -CW to CW
const QZ0 = -10.4, QZ1 = -2.4; // the quarters, between the corridor and the glass
const SZ0 = 2.4, SZ1 = 12.4; // the lounge and the medical bay
const LOUNGE = { x0: -22, x1: 2 }, MED = { x0: 2.4, x1: 22 };
const BRIDGE_DOOR = { x: -20.4, z: 0 };

// who lives where, west to east: the pilot, then the captains in CAPTAINS order
const COLOUR = { pilot: 0x6fe3ff, marrow: 0xb48cff, lux: 0xff6fb4, vask: 0xff8a3c };
const ROOMS = [{ id: 'pilot', x: -16.5 }, ...CAPTAINS.map((c, i) => ({ id: c.id, x: -5.5 + 11 * i }))];
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
//        aboard(id): the captain is on the ship (alive, not out on a trip) }
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
    const p = plate(r.id === 'pilot' ? DECK.platePilot : CAPTAINS.find((c) => c.id === r.id).short, col);
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

  const flat = (list) => list.map((g) => (g.index ? g.toNonIndexed() : g));
  group.add(mergedMesh(flat(lit), new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x1d262f })));
  group.add(mergedMesh(flat(glow), new THREE.MeshBasicMaterial({ vertexColors: true, fog: false })));

  // --- what is done here ---
  // one clock for whichever small thing is being done (rest, a meal, a scan): -1 when nothing is
  let u = -1, doing = null;
  const DO = { rest: 5.5, eat: 4.5, scan: 5.0 };
  const crewAboard = () => CAPTAINS.filter((c) => ctx.aboard(c.id));
  const lost = (id) => id !== 'pilot' && chapter && chapter.lost && chapter.lost(id);
  const named = (list) => (list.length <= 1 ? list.join('') : `${list.slice(0, -1).join(', ')} AND ${list[list.length - 1]}`);
  function start(what) {
    if (u >= 0) return null;
    doing = what;
    u = 0;
    if (what === 'scan') scanSheet.visible = true;
    return null;
  }
  function finish() {
    if (doing === 'rest') chapterHud.say(DECK.restSay, 6);
    if (doing === 'eat') {
      const who = crewAboard().map((c) => c.short);
      chapterHud.say(who.length ? DECK.eatWith.replace('{who}', named(who)) : DECK.eatAlone, 6);
    }
    if (doing === 'scan') chapterHud.say(DECK.scanSay, 6);
    chapterHud.white(0);
    scanSheet.visible = false;
    scanArch.position.x = BEDS[0].x + 1.4;
    u = -1;
    doing = null;
  }
  function look(id) {
    const c = CAPTAINS.find((x) => x.id === id);
    return { speaker: { name: c.name, species: c.species, cityId: DECK.where }, lines: lost(id) ? DECK.lostRoom.map((l) => l.replace('{NAME}', c.short)) : DECK.room[id] };
  }

  const consoles = [
    { x: BRIDGE_DOOR.x, y: 0, z: BRIDGE_DOOR.z, r: 1.6, prompt: DECK.toBridge, off: () => u >= 0, use: () => ((site.portal = 'base:bridge-deck'), null) },
    { x: ROOMS[0].x - QHW + 1.6, y: 0, z: -6.3, r: 1.5, prompt: DECK.rest, off: () => u >= 0, use: () => start('rest') },
    { x: TB.x, y: 0, z: TB.z - 1.9, r: 2.6, prompt: DECK.eat, off: () => u >= 0, use: () => start('eat') },
    { x: BEDS[0].x, y: 0, z: BEDS[0].z - 1.4, r: 1.6, prompt: DECK.scan, off: () => u >= 0, use: () => start('scan') },
    ...ROOMS.slice(1).map((r) => ({ x: r.x, y: 0, z: -4.2, r: 1.6, prompt: DECK.look, off: () => u >= 0, use: () => look(r.id) })),
  ];

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
    npcs: [],
    consoles,
    onChoice: () => null,
    portal: null,
    held: () => u >= 0,
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
      readSky();
      muster();
    },
    onLeave() {
      if (!inside) return;
      inside = false;
      group.visible = false;
      if (u >= 0) finish();
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
      if (u >= 0) {
        u += Math.min(dt, 0.1);
        const end = DO[doing];
        if (doing === 'rest') chapterHud.white(ease(0, 1.6, u) * (1 - ease(end - 1.6, end, u)));
        if (doing === 'eat') chapterHud.white(0.85 * ease(0, 1.2, u) * (1 - ease(end - 1.2, end, u)));
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
      lounge: [TB.x, 0, TB.z - 2.4], med: [BEDS[0].x - 1, 0, BEDS[0].z - 1.6],
    },
    info: () => ({ doing, u: +u.toFixed(1), lost: ROOMS.filter((r) => lost(r.id)).map((r) => r.id), star: skyU.uStarOn.value > 0, rooms: rooms.length }),
  };
  return site;
}
