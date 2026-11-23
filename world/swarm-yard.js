// The Weight of Hands: the High Yard (GDD 5.7.9; Season 1, chapter 8).
//
// An assembly yard in orbit round a dim star, with half a swarm of mirrors
// standing in the sky behind it. The yard's builders are still on shift. Their
// makers have been gone ten thousand years.
//
//   the swarm    Drawn as sky: a part-shell of mirrors round the system's star
//                (src/voyage.js draws the star), carried with the camera as the
//                star is, so the two never part. The near mirrors are seen
//                from behind, dark against the glow; the far ones face the
//                star and the eye both, and are bright.
//   the lamp     Carried by hand, as on the dusk world. Its X-ray band goes
//                through: soft matter is thin to it and dense matter is not
//                (src/lamp.js), so a builder held in the beam shows what is
//                inside it. Four of them are read that way: the one that
//                counts, the one that mended itself, the one that makes the
//                next, and the one that stopped.
//   the offers   Two buyers on one channel, once the four are read.
//   the order    At the pattern post: END THE ORDER (the builders are their
//                own; the swarm stops) or ASSIGN THE OUTPUT (the port gets a
//                star to fight with; the builders are not told). Nothing here
//                can kill the pilot, so the choice is made and survived at
//                once (src/season.js), and what follows is watched.
//
// The science. Real: a Dyson swarm is the buildable form of the idea, each
// collector on its own orbit (a rigid shell is not stable and no material
// would bear it). A star a tenth as bright as the Sun still gives off about
// 4e25 watts, a trillion times what a world like ours uses. Machines that
// build copies of themselves from what is to hand are a serious proposal (von
// Neumann's). Stretched: such machines double, so a swarm would be finished in
// decades, not half done after ten thousand years; here they build no faster
// than the standing order allows. And an X-ray picture needs a detector behind
// the thing, where this lamp shows it from the front. That builders left alone
// for a hundred centuries would come to count, mend, name and mourn is the
// story's, and no physics.
//
// A site for the platform walker (src/capitalWalk.js), in the world, docked at
// by the freighter (src/game.js SYSTEM_DOCK).

import * as THREE from 'three';
import { C } from '../src/constants.js';
import { sun } from '../src/sun.js';
import { input } from '../src/input.js';
import { cWalk } from '../src/capitalWalk.js';
import { chapterHud } from '../src/chapterHud.js';
import { lampHud } from '../src/lampHud.js';
import { lamp, LAMP_U, LAMP_GLSL, BAND, nextBand, toggleLamp, stepLamp, lampShows, lampLive, resetLamp, lampState } from '../src/lamp.js';
import { openDialogue, isDialogueOpen } from '../src/dialogue.js';
import { mulberry32 } from '../src/noise2.js';
import { uiSound, setEventRumble } from '../src/sfx.js';
import { tint, box, cyl, mergedMesh } from './capital.js';
import { BEAM_VERT, BEAM_FRAG } from './submersible.js';
import { logChime, bandClick, setHum, hush } from './entryzero-audio.js';
import { createSceneClock, crewSay } from './sceneClock.js';
import { createCrewFollow } from './crewFollow.js';
import { SWARM } from './swarm-dialogue.js';

const ZERO = new THREE.Vector3();
const KEY = 'ch8.builders';
const HW = 72, Z0 = -64, Z1 = 100; // the deck
const PAD = [0, 72], PAD_R = 20;
const FRAME = [0, -40], FRAME_R = 24; // the mirror being assembled
const POST = [38, 38];
const OLD = [-50, -36], CRADLE = [46, -10];
const NAMED = ['hauler', 'welder', 'maker', 'old'];
const ease = (a, b, x) => {
  const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

const SHELL_VERT = /* glsl */ `
  attribute vec3 color;
  uniform float uTime;
  uniform float uGo;
  uniform float uPhase;
  varying vec3 vW;
  varying vec3 vN;
  varying vec3 vColor;
  void main() {
    vec3 p = position;
    // six legs, walking: each swings from where it joins the body
    float leg = clamp((1.9 - p.y) / 1.9, 0.0, 1.0);
    float side = sign(p.x) * (mod(floor(p.z + 2.6), 2.0) * 2.0 - 1.0);
    p.z += side * sin(uTime * 4.0 + uPhase) * leg * 0.5 * uGo;
    p.y += sin(uTime * 8.0 + uPhase) * 0.04 * uGo * (1.0 - leg);
    vec4 w = modelMatrix * vec4(p, 1.0);
    vW = w.xyz;
    vN = normalize(mat3(modelMatrix) * normal);
    vColor = color;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;
// A builder's casing: metal in a dim star's light, and nearly nothing to the X-ray band.
const SHELL_FRAG = /* glsl */ `
  ${LAMP_GLSL}
  uniform vec3 uSun;
  uniform float uDull;
  uniform float uYard;
  varying vec3 vW;
  varying vec3 vN;
  varying vec3 vColor;
  void main() {
    vec3 n = normalize(vN);
    vec3 v = normalize(cameraPosition - vW);
    float lit = 0.5 * uYard + 0.95 * max(dot(n, uSun), 0.0) + 0.12 * max(n.y, 0.0);
    vec3 base = min(vColor, vec3(1.0));
    vec3 glow = max(vColor - 1.0, 0.0) * (1.0 - uDull); // (its eye bar and its lamps are its own light)
    vec3 col = mix(base, vec3(dot(base, vec3(0.33))) * 0.6, uDull) * lit * vec3(1.0, 0.82, 0.62) + glow;
    col += base * uLampTint * lampLit(0.0, vW) * 0.8; // the blue-green beam lights it as it would anything
    // in the X-ray band the casing is thin: it goes to a ghost of its own edges
    float x = lampLit(4.0, vW);
    float rim = pow(1.0 - abs(dot(n, v)), 2.0);
    col = mix(col, vec3(0.7, 0.8, 1.0) * (0.03 + 0.22 * rim), x * 0.92);
    gl_FragColor = vec4(col, 1.0);
  }
`;
const IN_VERT = /* glsl */ `
  attribute vec3 color;
  varying vec3 vW;
  varying vec3 vN;
  varying vec3 vColor;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vW = w.xyz;
    vN = normalize(mat3(modelMatrix) * normal);
    vColor = color;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;
// What is inside one: dense, so the X-ray band shows it, through the casing and anything else.
const IN_FRAG = /* glsl */ `
  ${LAMP_GLSL}
  uniform float uRead;
  varying vec3 vW;
  varying vec3 vN;
  varying vec3 vColor;
  void main() {
    vec3 n = normalize(vN);
    vec3 v = normalize(cameraPosition - vW);
    // (thicker along the line of sight at an edge: an X-ray's own shading)
    float thick = 0.45 + 0.55 * pow(1.0 - abs(dot(n, v)), 1.5);
    float a = max(lampLit(4.0, vW), uRead * 0.16) * thick;
    if (a < 0.008) discard;
    gl_FragColor = vec4(vec3(0.82, 0.9, 1.0) * vColor * a, 1.0);
  }
`;
// The swarm, as sky. Each mirror faces the star: seen from behind it is a dark
// plate, seen from the star's side it is the brightest thing in view.
const SKY_VERT = /* glsl */ `
  attribute float aSeed;
  varying float vFace;
  varying float vSeed;
  void main() {
    vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
    vec3 n = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * vec3(0.0, 0.0, 1.0)); // toward the star
    vFace = dot(n, normalize(cameraPosition - w.xyz));
    vSeed = aSeed;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;
const SKY_FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uPower;
  uniform vec3 uStar;
  varying float vFace;
  varying float vSeed;
  void main() {
    float lit = smoothstep(0.0, 0.25, vFace);
    float glint = pow(max(0.0, sin(uTime * (0.2 + vSeed * 0.5) + vSeed * 40.0)), 24.0);
    vec3 col = uStar * (0.02 + lit * (0.75 + 0.6 * vSeed) * uPower) + vec3(1.0, 0.95, 0.85) * glint * lit * 1.2 * uPower;
    gl_FragColor = vec4(col, 1.0);
  }
`;

// One builder's casing, facing +z, feet at the origin. Colour past 1 is its own light.
function shellGeometry() {
  const p = [];
  p.push(tint(box(3.0, 1.8, 4.4, 0, 2.5, 0), 0x6a5a40), tint(box(2.2, 0.9, 2.4, 0, 3.75, -0.6), 0x54482f));
  p.push(tint(box(1.7, 0.28, 0.2, 0, 2.95, 2.26), 0xffc060, 2.4)); // the eye bar
  p.push(tint(box(0.4, 0.4, 3.2, 1.2, 3.25, 2.6), 0x8a7650), tint(box(0.7, 0.7, 0.5, 1.2, 3.25, 4.3), 0x3a3226)); // the arm, and its tool
  for (const sx of [-1.75, 1.75]) for (const sz of [-1.6, 0, 1.6]) {
    p.push(tint(cyl(0.13, 0.2, 2.5, sx, 1.25, sz, 6), 0x3a3226), tint(box(0.6, 0.14, 0.8, sx, 0.07, sz), 0x54482f));
  }
  const g = mergedMesh(p, null).geometry;
  g.computeBoundingSphere();
  return g;
}
// What is inside each of the four that are read (and, small, inside the rest).
function insideGeometry(kind) {
  const p = [];
  const bone = (g) => p.push(tint(g, 0x8a8a8a)); // the frame every one of them has
  bone(box(0.16, 0.16, 4.0, 0, 2.5, 0));
  for (const z of [-1.6, 0, 1.6]) bone(box(3.0, 0.12, 0.12, 0, 2.3, z));
  if (kind === 'hauler') {
    // the spool: a turn of wire for every shift, wound so tight it reads as solid
    p.push(tint(new THREE.CylinderGeometry(0.16, 0.16, 3.4, 8).rotateX(Math.PI / 2).translate(0, 2.9, 0), 0xffffff));
    for (let i = 0; i < 17; i++) p.push(tint(new THREE.TorusGeometry(0.34 + 0.34 * Math.sin((i / 16) * Math.PI), 0.07, 5, 18).translate(0, 2.9, -1.52 + i * 0.19), 0xffffff, 1.5));
  } else if (kind === 'welder') {
    // the mend: a knot in the arm, bound round three ways, that no pattern has
    p.push(tint(new THREE.SphereGeometry(0.34, 6, 4).translate(1.2, 3.25, 2.2), 0xffffff, 1.6));
    for (let i = 0; i < 3; i++) p.push(tint(new THREE.TorusGeometry(0.46, 0.06, 5, 14).rotateX(i * 1.1).rotateY(i * 0.8).translate(1.2, 3.25, 2.2), 0xffffff, 1.4));
    bone(box(0.12, 0.12, 3.0, 1.2, 3.25, 2.6));
  } else if (kind === 'maker') {
    // the next one, half made, and the mark cut into it
    p.push(tint(box(0.9, 0.55, 1.3, 0, 2.6, 0.2), 0xd0d0d0));
    for (const sx of [-0.55, 0.55]) for (const sz of [-0.3, 0.6]) p.push(tint(cyl(0.05, 0.06, 0.7, sx, 2.1, sz, 5), 0xb0b0b0));
    p.push(tint(new THREE.TorusGeometry(0.3, 0.05, 5, 16, 5.0).translate(0, 2.6, 0.9), 0xffffff, 1.8));
    p.push(tint(new THREE.TorusGeometry(0.62, 0.045, 5, 20).rotateX(Math.PI / 2).translate(0, 2.2, 0.2), 0x9a9a9a));
  } else if (kind === 'old') {
    // what the others left in it: one piece from each, none of them its own
    p.push(tint(new THREE.SphereGeometry(0.3, 6, 4).translate(-0.7, 2.8, 0.9), 0xffffff, 1.4), tint(box(0.5, 0.5, 0.5, 0.6, 2.9, 0.3).rotateY(0.5), 0xe0e0e0, 1.3));
    p.push(tint(new THREE.TorusGeometry(0.3, 0.07, 5, 14).rotateX(1.1).translate(0.1, 2.7, -0.8), 0xffffff, 1.5), tint(new THREE.ConeGeometry(0.24, 0.6, 6).translate(-0.6, 2.9, -0.4), 0xd8d8d8, 1.3));
    p.push(tint(cyl(0.14, 0.14, 0.7, 0.75, 2.75, -1.1, 6), 0xf0f0f0, 1.3), tint(new THREE.TorusGeometry(0.34, 0.07, 5, 18).translate(0, 2.9, 1.5), 0xffffff, 1.6)); // (...and a turn of the Hauler's wire)
  } else p.push(tint(new THREE.TorusGeometry(0.4, 0.06, 5, 14).translate(0, 2.9, 0), 0xb0b0b0));
  return mergedMesh(p, null).geometry;
}

// ctx: the system's (world/swarm-system.js): { scene, camera, chapter, voyage, sunDir, season }
// story: { stage(), reached(s), advance(s), seen(), see(i) }: the chapter's stage machine and what has been read
export function createSwarmYard(ctx, story) {
  const { chapter, season } = ctx;
  const group = new THREE.Group();
  const time = { value: 0 };
  const yardU = { value: 1 }; // how much of the yard's own light there is
  const colliders = [];
  const litMat = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x2c261c });
  const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false });
  const workGlow = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }); // lamps that are on only while there is work
  {
    const lit = [], glow = [], work = [];
    const rng = mulberry32(0x5a71);
    // the deck, on a keel of truss
    lit.push(tint(box(HW * 2 + 6, 3, Z1 - Z0 + 6, 0, -1.5, (Z0 + Z1) / 2), 0x3a342a));
    lit.push(tint(box(8, 30, Z1 - Z0 + 60, 0, -18, (Z0 + Z1) / 2), 0x2a261e));
    for (let z = Z0; z <= Z1; z += 20) lit.push(tint(box(HW * 2 + 40, 2, 2.4, 0, -8, z), 0x2a261e));
    for (const s of [-1, 1]) {
      lit.push(tint(box(0.5, 1.2, Z1 - Z0, s * HW, 0.6, (Z0 + Z1) / 2), 0x54482f));
      for (let z = Z0 + 8; z < Z1; z += 14) work.push(tint(box(0.3, 0.3, 0.3, s * (HW - 0.4), 1.35, z), 0xffc070, 1.3));
    }
    // the pad
    lit.push(tint(cyl(PAD_R, PAD_R, 0.14, PAD[0], 0.07, PAD[1], 32), 0x54482f));
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      glow.push(tint(box(0.7, 0.12, 0.7, PAD[0] + Math.cos(a) * (PAD_R - 0.7), 0.16, PAD[1] + Math.sin(a) * (PAD_R - 0.7)), 0xffb060, 1.5));
    }
    // the mirror being put together: a six-sided frame stood on its edge, a third of its cells in
    lit.push(tint(new THREE.TorusGeometry(FRAME_R, 0.9, 6, 6).rotateZ(Math.PI / 6).translate(FRAME[0], FRAME_R + 1.4, FRAME[1]), 0x6a5a40));
    for (const sx of [-1, 1]) {
      lit.push(tint(box(1.6, 3.2, 3.2, FRAME[0] + sx * 13, 1.6, FRAME[1]), 0x3a3226));
      colliders.push({ x: FRAME[0] + sx * 13, z: FRAME[1], r: 2.4, top: Infinity });
    }
    for (let q = -3; q <= 3; q++) for (let r = -3; r <= 3; r++) {
      const x = (q + r * 0.5) * 6.2, y = r * 5.4;
      if (Math.hypot(x, y) > FRAME_R - 4.5 || rng() > 0.36 + (y < 0 ? 0.4 : 0)) continue; // (filled from the bottom up)
      glow.push(tint(new THREE.CircleGeometry(3.0, 6).translate(FRAME[0] + x, FRAME_R + 1.4 + y, FRAME[1] - 0.2), 0xcaa060, 0.42 + rng() * 0.2));
    }
    // gantries, either side of it
    for (const sx of [-1, 1]) {
      const x = sx * 34;
      lit.push(tint(box(1.4, 40, 1.4, x, 20, FRAME[1] - 8), 0x3a3226), tint(box(1.0, 1.0, 22, x, 39, FRAME[1] + 2), 0x3a3226));
      work.push(tint(box(0.5, 0.5, 0.5, x, 38.2, FRAME[1] + 12.5), 0xfff0c8, 1.6));
      colliders.push({ x, z: FRAME[1] - 8, r: 1.3, top: Infinity });
    }
    // stock: struts and plate, stacked and squared
    for (const [x, z] of [[-40, 34], [-46, 34], [-40, 26], [52, 30], [52, 22]]) {
      const h = 1.2 + Math.floor(rng() * 3) * 0.9;
      lit.push(tint(box(4.4, h, 6, x, h / 2, z), 0x5a4a34));
      colliders.push({ x, z, r: 3.4, top: Infinity });
    }
    // the pattern post: where the makers left the order
    lit.push(tint(cyl(1.6, 2.0, 0.6, POST[0], 0.3, POST[1], 8), 0x3a3226), tint(cyl(0.5, 0.7, 3.4, POST[0], 2.3, POST[1], 8), 0x54482f));
    glow.push(tint(box(1.5, 1.0, 0.16, POST[0], 4.4, POST[1]), 0xfff0c8, 1.5), tint(new THREE.TorusGeometry(1.8, 0.07, 5, 28).rotateX(Math.PI / 2).translate(POST[0], 0.66, POST[1]), 0xffc070, 1.4));
    colliders.push({ x: POST[0], z: POST[1], r: 1.2, top: Infinity });
    // the Maker's cradle, and the place the Old Hand stopped: the others have set lamps round it
    lit.push(tint(cyl(5.2, 5.6, 0.4, CRADLE[0], 0.2, CRADLE[1], 20), 0x3a3226));
    work.push(tint(new THREE.TorusGeometry(5.0, 0.08, 5, 36).rotateX(Math.PI / 2).translate(CRADLE[0], 0.46, CRADLE[1]), 0xffc070, 1.3));
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      glow.push(tint(box(0.26, 0.5, 0.26, OLD[0] + Math.cos(a) * 6.4, 0.25, OLD[1] + Math.sin(a) * 6.4), 0xffe0b0, 1.5));
    }
    group.add(mergedMesh(lit, litMat));
    group.add(mergedMesh(glow, glowMat));
    group.add(mergedMesh(work, workGlow));
  }

  // --- the builders ---
  const shellGeo = shellGeometry();
  const inMat = (read) => new THREE.ShaderMaterial({ uniforms: { ...LAMP_U, uRead: read }, vertexShader: IN_VERT, fragmentShader: IN_FRAG, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, fog: false });
  const builders = [];
  function builder(id, at, yaw, k, path, kind) {
    const u = { ...LAMP_U, uTime: time, uGo: { value: 0 }, uPhase: { value: builders.length * 1.7 }, uSun: { value: ctx.sunDir }, uDull: { value: 0 }, uYard: yardU };
    const g = new THREE.Group();
    const shell = new THREE.Mesh(shellGeo, new THREE.ShaderMaterial({ uniforms: u, vertexShader: SHELL_VERT, fragmentShader: SHELL_FRAG, fog: false }));
    const read = { value: 0 };
    const inside = new THREE.Mesh(insideGeometry(kind || id), inMat(read));
    inside.renderOrder = 6;
    shell.frustumCulled = inside.frustumCulled = false;
    g.add(shell, inside);
    g.scale.setScalar(k);
    g.position.set(at[0], 0, at[1]);
    g.rotation.y = yaw;
    group.add(g);
    const b = { id, g, u, read, k, at: [at[0], at[1]], yaw, path, pu: 0, dir: 1, wait: 0, hold: 0, work: 1 };
    builders.push(b);
    return b;
  }
  const hauler = builder('hauler', [-36, 30], 0, 1.25, [[-36, 30], [-12, -26]]);
  const welder = builder('welder', [9, -31], Math.PI, 1.1, [[9, -31], [-9, -31]]);
  const maker = builder('maker', CRADLE, -Math.PI / 2, 1.45, null);
  const old = builder('old', OLD, 0.7, 1.3, null);
  old.g.rotation.z = 0.2; // it went down on one side, and was left as it lay
  old.g.position.y = -0.5;
  old.u.uDull.value = 1;
  old.work = 0;
  colliders.push({ x: CRADLE[0], z: CRADLE[1], r: 3.6, top: Infinity }, { x: OLD[0], z: OLD[1], r: 3.4, top: Infinity });
  {
    const rng = mulberry32(0xb11d);
    const N = Math.max(0, Math.round(C.SWARM_BUILDERS));
    for (let i = 0; i < N; i++) {
      const a = [(rng() * 2 - 1) * (HW - 12), Z0 + 10 + rng() * 60], b = [(rng() * 2 - 1) * (HW - 12), Z0 + 10 + rng() * 60];
      const m = builder(`b${i}`, a, 0, 0.8 + rng() * 0.35, [a, b], 'plain');
      m.pu = rng();
      m.wait = rng() * 5;
    }
  }
  const named = NAMED.map((id) => builders.find((b) => b.id === id));
  // the strut the Hauler carries, and the Welder's arc
  const strut = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 9), new THREE.MeshLambertMaterial({ color: 0x8a7650 }));
  strut.position.set(0, 4.6, 0.6);
  hauler.g.add(strut);
  const arc = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 2.6, 3.2), fog: false }));
  group.add(arc);
  // what one of them starts to make, when there is no order: not a mirror
  const newThing = new THREE.Group();
  {
    const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.3, 0.8), fog: false });
    for (let i = 0; i < 5; i++) {
      const s = new THREE.Mesh(new THREE.TorusGeometry(1.2 + i * 0.5, 0.07, 5, 5 + i), m);
      s.position.y = 1 + i * 1.1;
      s.rotation.set(Math.PI / 2 + i * 0.3, i * 0.9, 0);
      newThing.add(s);
    }
  }
  newThing.position.set(OLD[0] + 9, 0, OLD[1] + 5);
  newThing.scale.setScalar(0.001);
  group.add(newThing);

  // --- the swarm, in the sky ---
  const sky = new THREE.Group();
  const skyU = { uTime: time, uPower: { value: 1 }, uStar: { value: new THREE.Color(1.0, 0.62, 0.3) } };
  const turn = new THREE.Group(); // (the whole swarm goes round, slowly)
  sky.add(turn);
  {
    const N = Math.max(100, Math.round(C.SWARM_MIRRORS));
    const geo = new THREE.CircleGeometry(1, 6);
    const seeds = new Float32Array(N);
    const mesh = new THREE.InstancedMesh(geo, new THREE.ShaderMaterial({ uniforms: skyU, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.DoubleSide, fog: false }), N);
    const rng = mulberry32(0x5a2a);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), zAxis = new THREE.Vector3(0, 0, 1), n = new THREE.Vector3();
    let i = 0, guard = 0;
    while (i < N && guard++ < N * 40) {
      // mirrors in rings, as orbits are; built from one side round, with a ragged leading edge
      const lat = (Math.floor(rng() * 26) - 12.5) * 0.105 + (rng() - 0.5) * 0.012;
      const lon = rng() * Math.PI * 2;
      const built = 3.5 + 0.9 * Math.sin(lat * 7.0) + 0.5 * Math.sin(lat * 23.0); // how far round this ring has got
      if (lon > built && rng() > 0.04) continue;
      const cl = Math.cos(lat);
      p.set(Math.cos(lon) * cl, Math.sin(lat), Math.sin(lon) * cl).multiplyScalar(C.SWARM_SHELL_R * (0.985 + rng() * 0.03));
      n.copy(p).normalize().negate();
      m.compose(p, q.setFromUnitVectors(zAxis, n), s.setScalar(C.SWARM_SHELL_R * (0.017 + rng() * 0.009)));
      mesh.setMatrixAt(i, m);
      seeds[i] = rng();
      i++;
    }
    mesh.count = i;
    geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1));
    mesh.frustumCulled = false;
    turn.add(mesh);
  }
  turn.rotation.set(0.5, 0, 0.3);
  // the light sent on, if the output is assigned: one line out of the swarm, to the port's relay
  const sendMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.8, 0.5), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const send = new THREE.Mesh(new THREE.CylinderGeometry(C.SWARM_SHELL_R * 0.012, C.SWARM_SHELL_R * 0.03, C.SWARM_SHELL_R * 9, 12, 1, true).translate(0, C.SWARM_SHELL_R * 4.5, 0), sendMat);
  send.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(-0.75, 0.2, 0.63).normalize());
  send.frustumCulled = false;
  sky.add(send);
  group.add(sky);

  // --- the lamp in the pilot's hand ---
  const hand = new THREE.Group();
  hand.rotation.order = 'YXZ';
  const beam = new THREE.Mesh(
    new THREE.ConeGeometry(Math.tan(C.EZ_LAMP_CONE), 1, 24, 1, true).translate(0, -0.5, 0).rotateX(-Math.PI / 2),
    new THREE.ShaderMaterial({ uniforms: LAMP_U, vertexShader: BEAM_VERT, fragmentShader: BEAM_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }),
  );
  beam.frustumCulled = false;
  beam.renderOrder = 7;
  hand.add(beam);
  hand.visible = false;
  group.add(hand);

  const bucket = () => (story.reached('decided') ? 'after' : story.reached('read') ? 'read' : 'early');
  const crew = createCrewFollow({
    group, floorY: 0,
    talk: (c) => ({ speaker: { name: c.name, species: c.species, cityId: SWARM.yard.city }, lines: SWARM.ground[c.id][bucket()], cine: true }),
  });

  // --- state ---
  let walker = null, walkerLive = null, inside = false, prev = null;
  let scene = null, panelText = null, lampOn = false, lastChanged = -1, lastBand = -1, hintT = 0, nearT = 0;
  let offerT = -1, offerOpen = false, ending = null; // (ending: the choice just made, its scene still to begin)
  let stopK = 0, sendK = 0, madeK = 0; // what the yard shows of how it went: stopped, sending, making
  const later = [];
  const _w = new THREE.Vector3();
  const say = (line, sec) => crewSay(chapter, line, sec);
  const decision = () => season.get(KEY);
  const readN = () => NAMED.filter((id, i) => story.seen() & (1 << i)).length;

  // the yard as it stands for how the chapter went (a visit after the end, or a jump)
  function settle() {
    const d = story.reached('decided') ? decision() : null;
    stopK = d === 'freed' ? 1 : 0;
    sendK = d === 'contracted' ? 1 : 0;
    madeK = d === 'freed' ? 1 : 0;
    named.forEach((b, i) => {
      b.read.value = story.seen() & (1 << i) ? 1 : 0;
      b.hold = 0;
    });
    for (const b of builders) {
      if (b === old) continue;
      b.g.position.set(b.at[0], 0, b.at[1]);
      b.g.rotation.y = b.yaw;
      b.pu = b.path && b !== hauler && b !== welder ? b.pu : 0;
    }
    if (d === 'freed') {
      // they have gone to where the Old Hand is, and the Welder to what it is making
      builders.forEach((b, i) => {
        if (b === old || b === maker) return;
        const a = (i / builders.length) * Math.PI * 2;
        const r = b === welder ? 0 : 13 + (i % 3) * 3.5;
        const x = b === welder ? newThing.position.x - 3.4 : OLD[0] + Math.cos(a) * r, z = b === welder ? newThing.position.z : OLD[1] + Math.sin(a) * r;
        b.g.position.set(Math.min(HW - 6, Math.max(-HW + 6, x)), 0, Math.min(Z1 - 6, Math.max(Z0 + 6, z)));
        b.g.rotation.y = Math.atan2((b === welder ? newThing.position.x : OLD[0]) - b.g.position.x, (b === welder ? newThing.position.z : OLD[1]) - b.g.position.z);
      });
    }
    show();
  }
  // everything that is drawn from the three numbers above
  function show() {
    const work = 1 - stopK;
    workGlow.color.setScalar(0.08 + 0.92 * work);
    yardU.value = 0.62 + 0.38 * work;
    skyU.uPower.value = 1 + 0.7 * sendK;
    sendMat.opacity = 0.2 * sendK;
    newThing.scale.setScalar(Math.max(0.001, madeK));
    for (const b of builders) if (b !== old) b.work = work;
  }
  function stepBuilders(d, t) {
    for (const b of builders) {
      if (!b.path || b.work <= 0.02 || stopK > 0.98) {
        b.u.uGo.value = 0;
        continue;
      }
      if (b.wait > 0) {
        b.wait -= d;
        b.u.uGo.value = 0;
        continue;
      }
      const [a, c] = b.path;
      const len = Math.hypot(c[0] - a[0], c[1] - a[1]) || 1;
      b.pu += (b.dir * C.SWARM_PACE * b.work * d) / len;
      if (b.pu >= 1 || b.pu <= 0) {
        b.pu = Math.min(1, Math.max(0, b.pu));
        b.dir = -b.dir;
        b.wait = b === welder ? 5 : 3;
      }
      b.g.position.x = a[0] + (c[0] - a[0]) * b.pu;
      b.g.position.z = a[1] + (c[1] - a[1]) * b.pu;
      const yaw = Math.atan2((c[0] - a[0]) * b.dir, (c[1] - a[1]) * b.dir);
      b.g.rotation.y = b === welder ? Math.PI : yaw; // (the Welder keeps its face to the frame)
      b.u.uGo.value = b.work;
    }
    // the arc: where the Welder is welding (at the frame, while it stands; at the new thing, after)
    const making = madeK > 0.02;
    const on = making ? madeK < 1 || Math.sin(t * 0.7) > 0.2 : welder.wait > 0 && welder.work > 0.5;
    arc.visible = on && Math.sin(t * 43) > -0.3;
    if (making) arc.position.copy(newThing.position).setY(1.4 + 4 * madeK);
    else arc.position.set(welder.g.position.x, 4.2, welder.g.position.z - 4.6);
    arc.scale.setScalar(0.6 + 0.6 * Math.abs(Math.sin(t * 61)));
    strut.visible = stopK < 0.5;
    newThing.rotation.y = t * 0.12;
  }

  // --- the scenes: one clock each, and everything placed from it ---
  function begin(kind, clock) {
    scene = { kind, clock };
    hand.visible = false;
    chapterHud.panel((panelText = null));
    chapterHud.cine(true);
    clock.begin();
  }
  function endScene() {
    scene = null;
    hand.visible = lampOn;
    chapterHud.cine(false);
  }
  const arriveClock = createSceneClock({
    T: C.SWARM_ARRIVE_T, lines: SWARM.arrive, say: (l) => say(l, 6.5),
    pose() {},
    onEnd() {
      endScene();
      story.advance('docked');
      lampUp();
      later.push(SWARM.first, { text: SWARM.hud.lamp, sec: 10 });
    },
  });
  // what the four add up to: every band off but the one that goes through, and all four in it at once
  const readClock = createSceneClock({
    T: C.SWARM_READ_T, lines: SWARM.understood, say: (l) => say(l, 6.5),
    pose() {},
    onEnd() {
      endScene();
      lamp.power = C.SWARM_LAMP_POWER;
      story.advance('read');
      offerT = C.SWARM_OFFER_DELAY;
      logChime();
    },
  });
  let endClock = null;
  function beginEnd(option) {
    const freed = option === 'freed';
    endClock = createSceneClock({
      T: C.SWARM_END_T, lines: freed ? SWARM.freed : SWARM.contracted, say: (l) => say(l, 7),
      pose(u) {
        if (freed) {
          stopK = ease(2, 7, u);
          madeK = ease(15, C.SWARM_END_T - 2, u);
          // the Welder leaves the frame, and goes to the one that stopped
          const k = ease(11, 17, u);
          welder.g.position.set(welder.at[0] + (newThing.position.x - 3.4 - welder.at[0]) * k, 0, welder.at[1] + (newThing.position.z - welder.at[1]) * k);
          welder.g.rotation.y = k > 0.02 && k < 0.98 ? Math.atan2(newThing.position.x - welder.at[0], newThing.position.z - welder.at[1]) : k >= 0.98 ? Math.PI / 2 : Math.PI;
          welder.u.uGo.value = k > 0.02 && k < 0.98 ? 1 : 0;
          setEventRumble(0.3 * (1 - stopK));
        } else {
          sendK = ease(3, 10, u);
          setEventRumble(0.25 * sendK * (1 - ease(12, 18, u)));
        }
        show();
      },
      onEnd() {
        endScene();
        setEventRumble(0);
        story.advance('done');
        settle();
      },
    });
    begin('end', endClock);
  }

  // --- the lamp ---
  function lampUp() {
    if (lampOn) return;
    lampOn = true;
    resetLamp(true);
    lamp.medium = 'void';
    lamp.power = C.SWARM_LAMP_POWER;
    lamp.lineBeam = false;
    lastChanged = lamp.changed;
    lastBand = lamp.band;
    input.bandPrev = input.lampToggle = false;
    lampHud.show(true, false, SWARM.keys);
    hand.visible = !scene;
  }
  function lampDown() {
    if (!lampOn) return;
    lampOn = false;
    lampHud.show(false);
    hand.visible = false;
    lamp.on = false;
    stepLamp(0, false);
  }
  const at = (b, y) => _w.set(b.g.position.x, y * b.k, b.g.position.z).add(group.position); // (the shaders, and lampShows, are asked about world points)

  function read(i) {
    if (story.seen() & (1 << i)) return false;
    const b = named[i];
    story.see(i);
    b.read.value = 1;
    logChime();
    chapterHud.say(`${SWARM.builders[b.id]}. ${SWARM.reads[b.id].find}`, 8);
    later.push(SWARM.reads[b.id].line);
    return true;
  }
  function beginRead() {
    if (scene || story.stage() !== 'docked') return false;
    lamp.on = true;
    for (let k = 0; k < 6 && lamp.band !== BAND.XRAY; k++) nextBand(1);
    lamp.power = 40; // (for the length of the scene, the whole yard is in reach of it)
    begin('read', readClock);
    return true;
  }
  // --- the work order ---
  function decide(option) {
    if (story.stage() !== 'offered' || (option !== 'freed' && option !== 'contracted')) return false;
    // nothing here can kill the pilot: offered, made and lived through in one step
    season.offer(KEY, 'swarm:post', { stage: 'offered' });
    season.decide(KEY, option);
    season.survive(KEY);
    story.advance('decided');
    lampDown();
    uiSound('engage');
    ending = option;
    return true;
  }
  function order() {
    season.offer(KEY, 'swarm:post', { stage: 'offered' }); // the checkpoint, as the decision is shown
    const here = chapter.crew();
    const sides = SWARM.decide.sides.filter((s) => here.some((c) => c.id === s.by)).map((s) => `${here.find((c) => c.id === s.by).short} — ${s.text}`);
    return {
      speaker: SWARM.post, cine: true, lines: [...sides, ...SWARM.decide.lines],
      offer: { kind: 'choice', prompt: SWARM.decide.prompt, options: [{ label: SWARM.decide.free, outcomeTag: 'swarm:free' }, { label: SWARM.decide.contract, outcomeTag: 'swarm:contract' }] },
    };
  }

  function panel() {
    const st = story.stage();
    const rows = [];
    if (st === 'docked') rows.push(`${SWARM.hud.read}${readN()} / ${NAMED.length}`);
    else if (st === 'offered') rows.push(SWARM.hud.post);
    else if (st === 'done') rows.push(SWARM.hud.done);
    const text = rows.length && !scene ? rows.join('\n') : null;
    if (text !== panelText) chapterHud.panel((panelText = text));
  }

  const site = {
    group,
    planet: { group: { position: ZERO }, sunDir: ctx.sunDir },
    surfaces: [],
    colliders,
    floorYAt: (x, z) => (Math.abs(x) < HW - 0.6 && z > Z0 + 0.6 && z < Z1 ? 0 : -Infinity),
    snap: 1.2,
    pad: new THREE.Vector3(PAD[0], 0.14, PAD[1]),
    padR: PAD_R,
    spawn: new THREE.Vector3(PAD[0] - 7, 0, PAD[1] - 14),
    atPost: new THREE.Vector3(POST[0] - 3.2, 0, POST[1] + 0.6),
    leaveHint: SWARM.yard.leaveHint,
    npcs: crew.npcs,
    consoles: [{ x: POST[0] - 2.4, y: 0, z: POST[1], r: 3.2, prompt: SWARM.prompts.post, off: () => story.stage() !== 'offered' || !!scene, use: order }],
    portal: null,
    onChoice(tag) {
      const option = tag === 'swarm:free' ? 'freed' : tag === 'swarm:contract' ? 'contracted' : null;
      if (!option || !decide(option)) return null;
      return { speaker: SWARM.post, lines: option === 'freed' ? SWARM.freedReply : SWARM.contractReply, cine: true };
    },
    mark: () => (!scene && story.stage() === 'offered' ? { x: POST[0] - 2.4, z: POST[1], label: SWARM.marks.post } : null),
    held: () => !!scene,
    act() {
      if (scene) scene.clock.skip();
    },
    heldPrompt: () => (scene ? SWARM.skip : ''),
    camera(pos, target) {
      if (!scene) return false;
      const u = Math.max(0, scene.clock.u());
      const s = ctx.sunDir;
      if (scene.kind === 'arrive') {
        // from the pad: up at the swarm, then down the length of the yard
        const k = ease(16, C.SWARM_ARRIVE_T, u);
        pos.set(-6 + u * 0.12, 5 + u * 0.1, PAD[1] - 6);
        target.set(pos.x + s.x * 100 * (1 - k) + (FRAME[0] - pos.x) * k, pos.y + s.y * 100 * (1 - k) + (14 - pos.y) * k, pos.z + s.z * 100 * (1 - k) + (FRAME[1] - pos.z) * k);
      } else if (scene.kind === 'read') {
        // round the four of them, high enough to have them all in the one beam
        const a = 0.9 + u * 0.03;
        pos.set(Math.sin(a) * 96, 36 + u * 0.3, 8 + Math.cos(a) * 96);
        target.set(-4, 2, -14);
      } else if (decision() === 'freed') {
        pos.set(12 - u * 0.5, 9 + u * 0.12, 26 - u * 0.5);
        target.set(OLD[0] + 22 - 16 * ease(10, 18, u), 3, OLD[1] + 6);
      } else {
        const k = ease(11, 17, u);
        pos.set(-14 + u * 0.2, 6 + u * 0.1, PAD[1] - 20);
        target.set(pos.x + s.x * 100 * (1 - k) + (hauler.g.position.x - pos.x) * k, pos.y + s.y * 100 * (1 - k) + (3 - pos.y) * k, pos.z + s.z * 100 * (1 - k) + (hauler.g.position.z - pos.z) * k);
      }
      return true;
    },
    setWalker(p, live) {
      walker = p || null;
      walkerLive = p ? live || null : null;
    },
    onEnter() {
      if (inside) return;
      inside = true;
      site.portal = null;
      prev = {
        ambColor: sun.ambient.color.clone(), ambI: sun.ambient.intensity, lightColor: sun.light.color.clone(), lightI: sun.light.intensity,
        lampPower: lamp.power, lampMedium: lamp.medium, lampCanAll: lamp.canAll, lampOn: lamp.on, lampBand: lamp.band,
      };
      // a dim star, and the yard's own lamps
      sun.light.color.setRGB(1.0, 0.72, 0.48);
      sun.light.intensity = 1.5;
      sun.ambient.color.setRGB(0.75, 0.66, 0.6);
      sun.ambient.intensity = 1.25;
      scene = null;
      later.length = 0;
      panelText = null;
      hintT = nearT = 0;
      offerOpen = false;
      ending = null;
      offerT = story.stage() === 'read' ? 2.5 : -1; // (left before the offers came: they come now)
      // left with the end still being watched: it has happened
      if (story.stage() === 'decided') story.advance('done');
      settle();
      lampOn = false;
      if (story.reached('docked') && !story.reached('decided')) lampUp();
      crew.set(ctx.voyage.crew());
      if (story.stage() === 'arrived') begin('arrive', arriveClock);
    },
    onLeave() {
      if (!inside) return;
      inside = false;
      if (scene) {
        scene.clock.stop();
        endScene();
      }
      if (story.stage() === 'decided') story.advance('done');
      settle();
      crew.set([]);
      lampHud.show(false);
      lampOn = false;
      hand.visible = false;
      hush();
      setEventRumble(0);
      chapterHud.clear();
      chapterHud.panel(null);
      panelText = null;
      lamp.power = prev.lampPower;
      lamp.medium = prev.lampMedium;
      lamp.canAll = prev.lampCanAll;
      lamp.on = prev.lampOn;
      lamp.band = prev.lampBand;
      stepLamp(0, false);
      sun.ambient.color.copy(prev.ambColor);
      sun.ambient.intensity = prev.ambI;
      sun.light.color.copy(prev.lightColor);
      sun.light.intensity = prev.lightI;
      prev = null;
    },
    inside: () => inside,
    // Every frame the system is mounted (src/voyage.js), walked or not.
    update(dt, t, cam) {
      const d = Math.min(dt, 0.1);
      time.value = t;
      // the swarm stays round the star, which stays with the eye (src/voyage.js places the star the same way)
      if (cam && cam.isVector3) sky.position.copy(cam).sub(group.position).addScaledVector(ctx.sunDir, C.SWARM_SHELL_DIST);
      turn.rotation.y = t * 0.004;
      stepBuilders(d, t);
    },
    // Every frame it is walked.
    tick(dt, t) {
      chapterHud.tick(dt);
      const d = Math.min(dt, 0.1);
      if (!walker) return;
      const st = story.stage();
      setHum(0.18 * (1 - stopK));
      if (scene) {
        if (scene.kind === 'read') {
          // one beam, from above, with all four of them in it
          lamp.pos.set(-2, 230, -14).add(group.position);
          lamp.dir.set(0, -1, -0.01).normalize();
          stepLamp(0, false);
        }
        scene.clock.tick(d);
        lampHud.update();
        return; // (a frame that began in a scene ends in it, even if the scene ended on it)
      }
      if (later.length && !isDialogueOpen() && chapterHud.state().line == null) {
        const l = later.shift();
        if (l.by !== undefined) say(l, 8);
        else chapterHud.say(l.text, l.sec || 7);
      }
      // --- the lamp in the hand ---
      if (lampOn) {
        if (input.bandPrev) nextBand(1);
        if (input.lampToggle) toggleLamp();
        input.bandPrev = input.lampToggle = false;
        const cp = Math.cos(cWalk.pitch);
        lamp.dir.set(Math.sin(cWalk.yaw) * cp, Math.sin(cWalk.pitch), Math.cos(cWalk.yaw) * cp);
        hand.position.set(cWalk.pos.x, cWalk.pos.y + 1.35, cWalk.pos.z).addScaledVector(lamp.dir, 0.5);
        lamp.pos.copy(hand.position).add(group.position);
        lamp.energy = 1;
        lamp.dose = 0; // (a hand lamp, at this range, on casings built for a star's glare)
        stepLamp(0, false);
        hand.rotation.set(-cWalk.pitch, cWalk.yaw, 0);
        beam.scale.setScalar(lamp.reach * 0.75);
        if (lamp.changed !== lastChanged) {
          lastChanged = lamp.changed;
          if (lamp.band !== lastBand) bandClick((lastBand = lamp.band));
        }
      }
      // --- reading them: the band that goes through, held on one from near enough ---
      if (st === 'docked' && lampOn && !isDialogueOpen()) {
        let far = false;
        named.forEach((b, i) => {
          if (story.seen() & (1 << i)) return;
          const hit = lampShows(BAND.XRAY, at(b, 2.6)) > 0;
          const near = Math.hypot(cWalk.pos.x - b.g.position.x, cWalk.pos.z - b.g.position.z) < C.SWARM_READ_RANGE;
          if (hit && !near) far = true;
          b.hold = hit && near ? b.hold + d : 0;
          if (b.hold >= C.SWARM_READ_TIME) read(i);
        });
        nearT = far ? nearT + d : 0;
        if (nearT > 2.5) {
          nearT = -8;
          chapterHud.say(SWARM.hud.near, 5);
        }
        hintT += d;
        if (hintT > 45) {
          hintT = 0;
          chapterHud.say(SWARM.hud.lamp, 8);
        }
        // all four, and what was said about the last of them has been said
        if (readN() === NAMED.length && !later.length && chapterHud.state().line == null) {
          beginRead();
          return;
        }
      }
      // --- the two offers, a little after ---
      if (st === 'read' && offerT >= 0 && !offerOpen && !isDialogueOpen()) {
        offerT -= d;
        if (offerT <= 0) {
          offerOpen = true;
          offerT = -1;
          openDialogue({ speaker: SWARM.buyers, cine: { kind: 'comm', from: SWARM.offers.from }, lines: SWARM.offers.lines }, {
            onClose: () => {
              offerOpen = false;
              story.advance('offered');
              later.push(SWARM.nobody);
            },
          });
        }
      }
      // --- the order has been amended: what happens then ---
      if (ending && !isDialogueOpen()) {
        const option = ending;
        ending = null;
        beginEnd(option);
        return;
      }
      crew.tick(dt, t, walkerLive);
      panel();
      if (lampOn) lampHud.update();
    },
    settle() {
      settle();
      if (!inside) return;
      if (story.reached('docked') && !story.reached('decided')) lampUp();
      else lampDown();
      offerT = story.stage() === 'read' ? 2.5 : -1;
    },
    places: { pad: [PAD[0] - 7, PAD[1] - 14], post: [POST[0] - 3.2, POST[1] + 0.6], frame: FRAME, old: OLD, cradle: CRADLE },
    info: () => ({
      inside, scene: scene ? { kind: scene.kind, u: +scene.clock.u().toFixed(2) } : null, lamp: lampOn ? lampState() : null,
      read: readN(), seen: story.seen(), offer: +offerT.toFixed(1), panel: panelText,
      builders: named.map((b, i) => ({ id: b.id, at: [+b.g.position.x.toFixed(1), +b.g.position.z.toFixed(1)], y: +(2.6 * b.k).toFixed(2), read: !!(story.seen() & (1 << i)), hold: +b.hold.toFixed(2) })),
      crowd: builders.length, stopped: +stopK.toFixed(2), sending: +sendK.toFixed(2), made: +madeK.toFixed(2), mirrors: turn.children[0].count,
    }),
    // dev (world/swarm-system.js hands these to __debug)
    dbg: {
      seek: (u) => (scene ? (scene.clock.seek(u), true) : false),
      skip: () => (scene ? scene.clock.skip() : false),
      read: (i) => (story.stage() === 'docked' ? read(i) : false),
      understood: beginRead,
      offers() {
        if (story.stage() !== 'read') return false;
        offerT = 0.1;
        return true;
      },
      decide,
    },
  };
  return site;
}
