// The landing: the one place on the Tenretni megaworld where the pilot can put
// down (src/farside.js; GDD 5.7.3). A pad on a mast over the roofs, a causeway,
// and at the end of it a door full of light.
//
// It answers the platform contract of src/capitalWalk.js, as the capital and
// the warships' decks do, so game.js docks on it with the code that docks at
// the Sky City and the same walker walks it. The frame is the platform's own:
// y = 0 is the deck, the pad is at +z, the door at -z (the way the walker faces
// stepping off the ship). The group sits in the scene, not under a planet, so
// `planet` is a stand-in at a shared zero.
//
// The universe is not paused here: the megaworld, the caged star and the black
// hole are all in view from the deck.
//
// The door is not a thing to press. Walking through its plane raises `portal`,
// which src/farside.js hands to game.js; the scene on the other side is
// world/lightcity.js.

import * as THREE from 'three';
import { C } from '../src/constants.js';
import { tint, box, cyl, mergedMesh, floorOf } from './capital.js';

const SNAP = 1.2;
const PAD_Z = 70;
const PAD_R = 26;
const WAY_HW = 7; // causeway half-width
const DOOR_Z = -64;
const DOOR_HW = 4.2; // half the opening
const DOOR_H = 12;
const END_Z = DOOR_Z - 7; // the deck runs on a few steps behind the door

const COL = { deck: 0x141917, deckLight: 0x202824, trim: 0x2a3832, hull: 0x0d1210 };
const GLOW = { green: 0x35ff8a, cyan: 0x5fd8ff, gold: 0xffe2a8 };
const ZERO = new THREE.Vector3();

// The light in the doorway: a sheet that breathes, brightest up the middle.
const DOOR_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const DOOR_FRAG = /* glsl */ `
  varying vec2 vUv;
  uniform float uTime;
  uniform vec3 uColor;
  uniform float uHdr;
  void main() {
    float u = vUv.x * 2.0 - 1.0;
    float rise = 0.5 + 0.5 * sin(vUv.y * 9.0 - uTime * 1.3 + sin(u * 3.0 + uTime * 0.7));
    float body = 0.72 + 0.28 * rise;
    float edge = 1.0 - smoothstep(0.82, 1.0, abs(u));
    float foot = smoothstep(0.0, 0.05, vUv.y);
    gl_FragColor = vec4(uColor * uHdr * body * (0.55 + 0.45 * edge) * foot, 1.0);
  }
`;

// A door frame at z, opening along x, as vertex-coloured boxes into `lit` and
// `glow`. Shared with world/lightcity.js (the other side of the same door).
// `face`: +1 if it is walked up to from +z, -1 from -z (which side is lit).
export function doorFrame(lit, glow, z, hull, line, face = 1) {
  const w = DOOR_HW, h = DOOR_H;
  lit.push(tint(box(1.6, h + 2.4, 1.8, -(w + 0.8), (h + 2.4) / 2, z), hull));
  lit.push(tint(box(1.6, h + 2.4, 1.8, w + 0.8, (h + 2.4) / 2, z), hull));
  lit.push(tint(box(w * 2 + 3.2, 1.6, 1.8, 0, h + 1.6, z), hull));
  // a line of light round the opening
  glow.push(tint(box(0.14, h, 0.2, -w - 0.02, h / 2, z + 0.9 * face), line, 1.6));
  glow.push(tint(box(0.14, h, 0.2, w + 0.02, h / 2, z + 0.9 * face), line, 1.6));
  glow.push(tint(box(w * 2, 0.14, 0.2, 0, h + 0.75, z + 0.9 * face), line, 1.6));
}
export const DOOR = { hw: DOOR_HW, h: DOOR_H };

// The sheet of light for a doorway. Returns { mesh, uniforms }.
export function doorLight(color, hdr) {
  const uniforms = { uTime: { value: 0 }, uColor: { value: new THREE.Color(color) }, uHdr: { value: hdr } };
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(DOOR_HW * 2, DOOR_H),
    new THREE.ShaderMaterial({ vertexShader: DOOR_VERT, fragmentShader: DOOR_FRAG, uniforms, side: THREE.DoubleSide, fog: false })
  );
  return { mesh, uniforms };
}

// `sunDir`: the live unit vector toward the light (src/farside.js keeps it).
export function createFarLanding(sunDir) {
  const group = new THREE.Group();
  group.visible = false;
  const lit = [], glow = [];
  const surfaces = [];
  const colliders = [];

  // --- the pad ---
  lit.push(tint(cyl(PAD_R + 3, PAD_R + 5, 2.4, 0, -1.2, PAD_Z, 40), COL.deck));
  lit.push(tint(cyl(PAD_R, PAD_R, 0.14, 0, 0.07, PAD_Z, 40), COL.deckLight));
  surfaces.push({ kind: 'disc', cx: 0, cz: PAD_Z, r: PAD_R + 2.4, y: 0.14 });
  // landing lights round the rim, and a cross to set down on
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    glow.push(tint(box(0.8, 0.12, 0.8, Math.cos(a) * (PAD_R + 1), 0.16, PAD_Z + Math.sin(a) * (PAD_R + 1)), GLOW.green, 1.5));
  }
  glow.push(tint(box(PAD_R * 1.1, 0.06, 0.5, 0, 0.17, PAD_Z), GLOW.green, 1.1));
  glow.push(tint(box(0.5, 0.06, PAD_R * 1.1, 0, 0.17, PAD_Z), GLOW.green, 1.1));

  // --- the causeway to the door ---
  const z0 = PAD_Z - PAD_R + 2, z1 = END_Z;
  const len = z0 - z1;
  lit.push(tint(box(WAY_HW * 2 + 1.6, 1.8, len, 0, -0.9 + 0.14, (z0 + z1) / 2), COL.deck));
  lit.push(tint(box(WAY_HW * 2 - 3, 0.1, len, 0, 0.19, (z0 + z1) / 2), COL.deckLight));
  surfaces.push({ kind: 'rect', cx: 0, cz: (z0 + z1) / 2, ux: 0, uz: 1, hl: len / 2, hw: WAY_HW, yA: 0.14, yB: 0.14 });
  // a line of light down each edge, and low posts carrying it
  for (const s of [-1, 1]) {
    glow.push(tint(box(0.16, 0.1, len, s * (WAY_HW - 0.4), 0.2, (z0 + z1) / 2), GLOW.green, 1.4));
    for (let z = z0 - 8; z > DOOR_Z + 6; z -= 12) {
      lit.push(tint(box(0.5, 2.2, 0.5, s * (WAY_HW + 0.5), 1.1, z), COL.trim));
      glow.push(tint(box(0.3, 0.3, 0.3, s * (WAY_HW + 0.5), 2.35, z), GLOW.cyan, 1.5));
    }
  }

  // --- the door ---
  doorFrame(lit, glow, DOOR_Z, COL.hull, GLOW.gold);
  // the frame's posts stop the walker; the wings either side close the deck
  for (const s of [-1, 1]) {
    colliders.push({ x: s * (DOOR_HW + 0.8), z: DOOR_Z, r: 0.9, top: Infinity });
    lit.push(tint(box(WAY_HW - DOOR_HW - 1.2, 5, 0.8, s * (DOOR_HW + 1.6 + (WAY_HW - DOOR_HW - 1.2) / 2), 2.5, DOOR_Z), COL.trim));
    for (let x = DOOR_HW + 2.2; x < WAY_HW + 0.4; x += 1.1) colliders.push({ x: s * x, z: DOOR_Z, r: 0.7, top: Infinity });
  }
  const sheet = doorLight(0xffe2a6, 1.35);
  sheet.mesh.position.set(0, DOOR_H / 2, DOOR_Z);
  group.add(sheet.mesh);
  // the light it throws down the deck toward the pad
  const spill = new THREE.Mesh(
    new THREE.PlaneGeometry(DOOR_HW * 2 + 2, 26).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xffe6b0, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  spill.position.set(0, 0.26, DOOR_Z + 13.5);
  group.add(spill);

  // --- under it all: the mast down to the roofs ---
  const mast = C.FAR_LAND_ALT;
  lit.push(tint(cyl(26, 44, 60, 0, -32, 6, 10), COL.hull));
  lit.push(tint(cyl(16, 30, mast, 0, -60 - mast / 2, 6, 8), COL.hull));
  for (let i = 0; i < 6; i++) glow.push(tint(cyl(18 + i * 1.6, 18 + i * 1.6, 1.4, 0, -90 - i * 170, 6, 8), GLOW.green, 1.3));
  // struts from the mast head out under the pad and the door
  for (const z of [PAD_Z, DOOR_Z + 10]) {
    lit.push(tint(box(5, 5, Math.abs(z - 6) + 8, 0, -6, (z + 6) / 2), COL.hull));
  }

  const litMat = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x151d19 });
  const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  glowMat.color.setScalar(0.8);
  group.add(mergedMesh(lit, litMat));
  group.add(mergedMesh(glow, glowMat));

  // a beacon over the pad, for finding it from the air
  const beacon = new THREE.Mesh(
    new THREE.CylinderGeometry(2.2, 5, 900, 12, 1, true).translate(0, 450, PAD_Z),
    new THREE.MeshBasicMaterial({
      color: 0x8fffd0, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    })
  );
  group.add(beacon);

  let lastZ = PAD_Z;
  let walking = false;
  const site = {
    group,
    planet: { group: { position: ZERO }, sunDir },
    surfaces,
    colliders,
    floorYAt: floorOf(surfaces, SNAP),
    snap: SNAP,
    pad: new THREE.Vector3(0, 0.14, PAD_Z),
    padR: PAD_R,
    spawn: new THREE.Vector3(9, 0.14, PAD_Z - 8),
    npcs: [],
    consoles: [],
    onChoice: () => null,
    portal: null, // 'city' once the walker has gone through the door
    // where the walker stands coming back out of it, and which way
    doorOut: new THREE.Vector3(0, 0.14, DOOR_Z + 5),
    doorYaw: 0, // facing +z: the pad, the ship
    setWalker(p) {
      if (!p) {
        walking = false;
        return;
      }
      // through the door's plane, inward, between the posts
      if (walking && lastZ >= DOOR_Z && p.z < DOOR_Z && Math.abs(p.x) < DOOR_HW) site.portal = 'city';
      lastZ = p.z;
      walking = true;
    },
    // `cam`: the camera's world position.
    update(dt, t, cam) {
      sheet.uniforms.uTime.value = t;
      spill.material.opacity = 0.13 + 0.05 * Math.sin(t * 1.3);
      const far2 = cam.distanceToSquared(group.position);
      beacon.visible = far2 > 400 * 400;
      beacon.material.opacity = 0.2 + 0.14 * Math.sin(t * 2.4);
    },
    places: { pad: [9, 0.14, PAD_Z - 8], way: [0, 0.14, 0], door: [0, 0.14, DOOR_Z + 2], through: [0, 0.14, DOOR_Z - 2] },
  };
  return site;
}
