// Entry Zero's submersible, and the well it is first flown in (GDD 5.7.5).
//
// The megaworld is a shell, and inside a shell nothing pulls: the vessel is
// weightless, in water or in the dark between. It is a place for the platform
// walker (src/capitalWalk.js) like the shuttle before it, with one seat that
// is never left (`held`), and the walker's own mouse look turned into a push
// on the hull: the vessel and its lamp move through a world that stays put.
//
//   W / S         ahead / astern          Space / Shift   rise / sink
//   A / D         sideways                mouse           turn (it leans, and settles)
//   Q / E         the lamp's band         L               lamp     Z   every band (later)
//
// The well is the shaft under the City of Light, where the lamp is tried
// before anything depends on it: six targets, one for each band (src/lamp.js
// says why each shows where it does). A ring above goes back up to the city.
// Below is a membrane that opens once all six have been found, and under it
// the hollow (world/hollow.js): going down through the gap, the lattice takes
// the vessel as a pulse of light and sets it down at the node it last reached.
// The same pulse brings it back to that node if the lamp dies, the dose
// fills or the cabin freezes: nothing is lost but the distance.
//
// Under the last zone the lattice ends and the vessel falls to the centre
// (world/zeroplanet.js), where every band at once is learned and the pilot
// chooses who stays at the lamp.
//
// One clock for what is said on arrival; everything else is where the hull is.

import * as THREE from 'three';
import { C, CH_TIER } from '../src/constants.js';
import { Q } from '../src/quality.js';
import { sun } from '../src/sun.js';
import { input, moveAxes } from '../src/input.js';
import { cWalk } from '../src/capitalWalk.js';
import { isDialogueOpen } from '../src/dialogue.js';
import { chapterHud } from '../src/chapterHud.js';
import { uiSound } from '../src/sfx.js';
import { lampHud } from '../src/lampHud.js';
import { lamp, LAMP_U, LAMP_GLSL, BAND, nextBand, toggleLamp, stepLamp, lampShows, lampLive, resetLamp, lampState } from '../src/lamp.js';
import { tint, box, mergedMesh, floorOf } from './capital.js';
import { setHum, bandClick, setRadio, doseTicks, logChime, hush, ezAudioState } from './entryzero-audio.js';
import { CAPTAINS } from './chapter-dialogue.js';
import { BANDS, WELL, DESCENT, DEEP } from './entryzero-dialogue.js';
import { createHollow, LAST_ZONE } from './hollow.js';
import { createCentre } from './zeroplanet.js';
import { openDialogue } from '../src/dialogue.js';
import { CENTRE, STAY } from './entryzero-dialogue.js';

const CENTRE_ZONE = LAST_ZONE + 1; // under the last zone of the hollow: the first world

const ZERO = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const LAMP_AT = new THREE.Vector3(-1.05, -0.8, 1.7); // on the hull, low and to starboard of the seat (+x is port, looking along +z)
const MOTE_BOX = 520; // the specks wrap round the vessel in a box this wide

const WORLD_VERT = /* glsl */ `
  varying vec3 vW;
  varying vec3 vN;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vW = w.xyz;
    vN = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

// The shaft's wall: the newest strata of the shell, with the compute lattice
// running down through them like roots.
const WALL_FRAG = /* glsl */ `
  ${LAMP_GLSL}
  uniform float uTime;
  varying vec3 vW;
  varying vec3 vN;
  float h11(float n) { return fract(sin(n * 127.1) * 43758.5453); }
  void main() {
    float ang = atan(vW.z, vW.x);
    float y = vW.y + 30.0 * sin(ang * 3.0) + 12.0 * sin(ang * 7.0 + 1.3);
    float layer = floor(y / 46.0);
    float f = fract(y / 46.0);
    float albedo = 0.22 + 0.4 * h11(layer);
    albedo *= 0.75 + 0.25 * smoothstep(0.0, 0.06, f); // a shadow line under each one
    // the lattice: a few lines of light that wander on the way down
    float wob = 0.5 * sin(vW.y * 0.011) + 0.22 * sin(vW.y * 0.037 + 2.0);
    float line = abs(sin(ang * 5.0 + wob));
    float root = 1.0 - smoothstep(0.0, 0.03, line);
    float run = 0.5 + 0.5 * sin(vW.y * 0.03 + uTime * 1.6);
    vec3 col = vec3(0.03, 0.42, 0.5) * root * (0.1 + 0.3 * run * run);
    // rock gives back whatever is shone on it, so a beam of any band lands here
    float beam = lampBeam(vW) * uLampOn * uLampLit;
    col += albedo * uLampTint * beam * 0.5;
    // ultraviolet: veins of something in the strata fluoresce
    float vein = step(0.86, h11(layer * 3.7 + floor(ang * 14.0)));
    col += vec3(0.45, 1.0, 0.3) * vein * (0.4 + 0.6 * f) * lampLit(1.0, vW) * 1.1;
    // infrared: the lattice is warm, and shows by itself as far as that band reaches
    col += vec3(1.0, 0.42, 0.14) * root * lampSeen(2.0, vW) * 1.3;
    // X-ray: only how dense each stratum is
    col = mix(col, vec3(0.8, 0.86, 1.0) * (0.15 + 0.85 * h11(layer + 9.0)) * lampBeam(vW), lampBand(4.0) * (1.0 - uAll) * uLampLit);
    gl_FragColor = vec4(col, 1.0);
  }
`;

// The membrane under the well: the lattice drawn tight across it.
const SEAL_FRAG = /* glsl */ `
  ${LAMP_GLSL}
  uniform float uTime;
  uniform float uOpen; // the radius of the gap in it
  varying vec3 vW;
  varying vec3 vN;
  void main() {
    if (length(vW.xz) < uOpen) discard;
    vec2 p = vW.xz / 38.0;
    // a hex weave
    vec2 q = vec2(p.x * 1.1547, p.y + p.x * 0.57735);
    vec2 f = fract(q) - 0.5;
    float cell = max(abs(f.x), max(abs(f.y), abs(f.x + f.y) * 0.7071));
    float web = smoothstep(0.42, 0.5, cell);
    float r = length(vW.xz);
    float pulse = 0.5 + 0.5 * sin(r * 0.03 - uTime * 1.2);
    vec3 col = vec3(0.04, 0.5, 0.62) * web * (0.25 + 0.55 * pulse);
    col += vec3(1.0, 0.42, 0.14) * web * lampSeen(2.0, vW);
    col += 0.12 * uLampTint * lampBeam(vW) * uLampOn * uLampLit;
    col += vec3(0.5, 1.5, 1.8) * (1.0 - smoothstep(0.0, 9.0, r - uOpen)) * step(1.0, uOpen); // the lip of the gap
    gl_FragColor = vec4(col, 1.0);
  }
`;

// The six targets. One instanced ball, and what each is made of decides what
// is drawn of it (src/lamp.js): `aBand` is a BANDS index.
const TARGET_VERT = /* glsl */ `
  attribute float aBand;
  varying float vBand;
  varying vec3 vW;
  varying vec3 vN;
  varying vec3 vL;
  void main() {
    vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
    vW = w.xyz;
    vL = position;
    vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
    vBand = aBand;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;
const TARGET_FRAG = /* glsl */ `
  ${LAMP_GLSL}
  uniform float uTime;
  uniform vec3 uTints[6];
  varying float vBand;
  varying vec3 vW;
  varying vec3 vN;
  varying vec3 vL;
  void main() {
    int b = int(vBand + 0.5);
    float fb = float(b);
    // infrared and H-alpha are given off; the others have to be lit
    float seen = (b == 2 || b == 3) ? lampSeen(fb, vW) : lampLit(fb, vW);
    if (b == 5 || seen < 0.004) discard; // (the radio one is never drawn)
    vec3 v = normalize(cameraPosition - vW);
    float face = abs(dot(normalize(vN), v));
    vec3 n = normalize(vL);
    vec3 t = uTints[b];
    vec3 col;
    float a;
    if (b == 0) {
      // living light: points of it, breathing
      float spots = smoothstep(0.75, 0.95, sin(n.x * 11.0 + uTime * 0.6) * sin(n.y * 13.0) * sin(n.z * 12.0 - uTime * 0.4) * 0.5 + 0.5);
      col = t * (0.2 + 2.6 * spots);
      a = 0.25 + 0.75 * spots;
    } else if (b == 1) {
      // fluorescence: a pattern that is only there under ultraviolet
      float rings = smoothstep(0.55, 0.6, abs(sin(acos(n.y) * 9.0)));
      col = mix(t * 0.5, vec3(0.75, 1.0, 0.25) * 1.15, rings);
      a = 0.5 + 0.5 * rings;
    } else if (b == 2) {
      // heat: no edge to it, brightest where there is most of it
      col = mix(vec3(1.0, 0.25, 0.05), vec3(1.0, 0.85, 0.5), face * face) * (0.5 + 1.4 * face);
      a = face * face;
    } else if (b == 3) {
      // a thin shell of glowing hydrogen: seen edge-on it is deepest
      float rim = pow(1.0 - face, 2.2);
      col = t * (0.3 + 2.8 * rim);
      a = 0.15 + 0.85 * rim;
    } else {
      // X-ray: the soft outside is thin to it, and what is dense inside is not
      float soft = pow(1.0 - face, 1.5) * 0.5;
      float bones = smoothstep(0.08, 0.02, abs(n.x)) * step(abs(n.y), 0.8) + smoothstep(0.05, 0.02, abs(fract(n.y * 3.5) - 0.5)) * step(abs(n.x), 0.55);
      col = t * (soft + 1.6 * min(bones, 1.0) * face);
      a = min(1.0, soft + bones * face);
    }
    gl_FragColor = vec4(col * seen, a * seen);
  }
`;

// Specks adrift in the shaft: what the beam is seen by. Wrapped round the
// vessel in the vertex shader, so there are always some near it.
const MOTE_VERT = /* glsl */ `
  ${LAMP_GLSL}
  uniform vec3 uAt;
  uniform float uBox;
  uniform float uScale;
  uniform float uTime;
  attribute float aSeed;
  varying float vLit;
  void main() {
    vec3 p = position * uBox;
    p.y += uTime * (0.6 + 1.2 * aSeed); // they rise, very slowly
    p = mod(p - uAt + 0.5 * uBox, uBox) - 0.5 * uBox + uAt;
    vec4 mv = viewMatrix * vec4(p, 1.0);
    float edge = 1.0 - smoothstep(0.4 * uBox, 0.5 * uBox, length(p - uAt));
    vLit = (0.012 + lampBeam(p) * uLampOn * uLampLit) * edge;
    gl_PointSize = clamp(uScale * (0.5 + aSeed) * 0.55 / max(-mv.z, 1.0), 1.0, 7.0);
    gl_Position = projectionMatrix * mv;
  }
`;
const MOTE_FRAG = /* glsl */ `
  uniform vec3 uLampTint;
  varying float vLit;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float a = 1.0 - smoothstep(0.1, 0.5, length(c));
    gl_FragColor = vec4(mix(vec3(0.5, 0.6, 0.7), uLampTint, 0.85) * vLit * a, 1.0);
  }
`;

// The beam itself, as the mist shows it: a cone of light from the lamp.
const BEAM_VERT = /* glsl */ `
  varying float vAlong;
  varying vec3 vVN;
  varying vec3 vVP;
  void main() {
    vAlong = position.z;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vVP = mv.xyz;
    vVN = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * mv;
  }
`;
const BEAM_FRAG = /* glsl */ `
  uniform vec3 uLampTint;
  uniform float uLampOn;
  uniform float uLampLit;
  varying float vAlong;
  varying vec3 vVN;
  varying vec3 vVP;
  void main() {
    float side = abs(dot(normalize(vVN), normalize(vVP)));
    float a = pow(side, 1.6) * pow(1.0 - vAlong, 1.7) * smoothstep(0.0, 0.012, vAlong);
    gl_FragColor = vec4(uLampTint * a * 0.5 * uLampOn * uLampLit, 1.0);
  }
`;

// A pulse along the lattice, from inside it: light going by.
const RIDE_FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uRide;
  varying vec3 vVP;
  varying float vAlong;
  varying vec3 vVN;
  float h(float n) { return fract(sin(n * 91.7) * 43758.5453); }
  void main() {
    float lane = floor(vVN.x * 23.0 + vVN.y * 31.0 + 40.0);
    float on = step(0.55, h(lane));
    float streak = pow(fract(vAlong * (1.0 + 2.0 * h(lane + 3.0)) + uTime * (2.0 + 5.0 * h(lane + 7.0))), 5.0);
    vec3 col = mix(vec3(0.2, 0.9, 1.2), vec3(1.4, 1.3, 1.0), h(lane + 11.0));
    gl_FragColor = vec4(col * on * streak * uRide, 1.0);
  }
`;

// ctx: { scene, camera, hideFleet(), chapter }
export function createSubmersible(ctx) {
  const { chapter } = ctx;
  const group = new THREE.Group();
  group.visible = false;
  ctx.scene.add(group);
  const R = C.EZ_WELL_R, TOP = C.EZ_WELL_UP, BOT = -C.EZ_WELL_DOWN, RING = C.EZ_WELL_RING;

  // --- the well ---
  const time = { value: 0 };
  const wallU = { ...LAMP_U, uTime: time };
  const wallMat = new THREE.ShaderMaterial({ uniforms: wallU, vertexShader: WORLD_VERT, fragmentShader: WALL_FRAG, side: THREE.BackSide, fog: false });
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(R, R, TOP - BOT, 96, 1, true), wallMat);
  wall.position.y = (TOP + BOT) / 2;
  const roofMat = new THREE.ShaderMaterial({ uniforms: wallU, vertexShader: WORLD_VERT, fragmentShader: WALL_FRAG, side: THREE.DoubleSide, fog: false });
  const roof = new THREE.Mesh(new THREE.RingGeometry(RING, R, 96, 1).rotateX(Math.PI / 2), roofMat);
  roof.position.y = TOP;
  const seal = new THREE.Mesh(
    new THREE.CircleGeometry(R, 96).rotateX(-Math.PI / 2),
    new THREE.ShaderMaterial({ uniforms: { ...LAMP_U, uTime: time, uOpen: { value: 0 } }, vertexShader: WORLD_VERT, fragmentShader: SEAL_FRAG, fog: false }),
  );
  seal.position.y = BOT;
  // the way back up: a ring of the city's light, and the light coming down through it
  const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.7, 1.55, 1.2), fog: false });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(RING, 2.4, 10, 72).rotateX(Math.PI / 2), ringMat);
  ring.position.y = TOP;
  const shaftMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.9, 0.85, 0.7), transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(RING * 0.92, RING * 1.5, 260, 40, 1, true), shaftMat);
  shaft.position.y = TOP - 130;
  shaft.renderOrder = 4;
  for (const m of [wall, roof, seal, ring, shaft]) {
    m.frustumCulled = false;
    group.add(m);
  }

  // --- the targets: on a ring a little way down, one for each band ---
  const N = BANDS.length;
  const tGeo = new THREE.IcosahedronGeometry(16, 3);
  const bands = new Float32Array(N);
  const targetAt = [];
  const tU = { ...LAMP_U, uTime: time, uTints: { value: BANDS.map((b) => new THREE.Color(b.tint)) } };
  const tMat = new THREE.ShaderMaterial({ uniforms: tU, vertexShader: TARGET_VERT, fragmentShader: TARGET_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  const targets = new THREE.InstancedMesh(tGeo, tMat, N);
  {
    const m = new THREE.Matrix4();
    for (let i = 0; i < N; i++) {
      const band = BANDS.findIndex((b) => b.id === WELL.targets[i].band);
      const a = (i / N) * Math.PI * 2 + 0.4;
      const p = new THREE.Vector3(Math.cos(a) * 250, -170 - 55 * (i % 3), Math.sin(a) * 250);
      targetAt.push({ p, band, what: WELL.targets[i].what });
      targets.setMatrixAt(i, m.makeTranslation(p.x, p.y, p.z));
      bands[i] = band;
    }
  }
  tGeo.setAttribute('aBand', new THREE.InstancedBufferAttribute(bands, 1));
  targets.frustumCulled = false;
  targets.renderOrder = 5;
  // (everything of the well in one group: it is put away below the membrane)
  const well = new THREE.Group();
  group.add(well);
  for (const m of [wall, roof, seal, ring, shaft, targets]) well.add(m);

  // --- specks ---
  const tier = CH_TIER[Q.tier] || CH_TIER.medium;
  const mN = tier.motes;
  const mPos = new Float32Array(mN * 3), mSeed = new Float32Array(mN);
  let s = 0x0e2e1;
  const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < mN; i++) {
    mPos[i * 3] = rnd();
    mPos[i * 3 + 1] = rnd();
    mPos[i * 3 + 2] = rnd();
    mSeed[i] = rnd();
  }
  const mGeo = new THREE.BufferGeometry();
  mGeo.setAttribute('position', new THREE.BufferAttribute(mPos, 3));
  mGeo.setAttribute('aSeed', new THREE.BufferAttribute(mSeed, 1));
  const at = new THREE.Vector3(0, TOP - 45, 0); // where the vessel is
  const moteU = { ...LAMP_U, uAt: { value: at }, uBox: { value: MOTE_BOX }, uScale: { value: 600 }, uTime: time };
  const motes = new THREE.Points(mGeo, new THREE.ShaderMaterial({ uniforms: moteU, vertexShader: MOTE_VERT, fragmentShader: MOTE_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  motes.frustumCulled = false;
  motes.renderOrder = 6;
  group.add(motes);

  // --- the vessel, from its one seat: a frame round the glass and a sill ---
  const hull = new THREE.Group();
  hull.rotation.order = 'YXZ';
  const DARK = 0x0d1216, EDGE = 0x1c2a31;
  const frame = [
    tint(box(3.4, 0.55, 1.1, 0, -1.2, 1.45), DARK),
    tint(box(3.4, 0.06, 0.9, 0, -0.92, 1.4), EDGE),
    tint(box(0.13, 2.9, 0.13, -1.75, 0.2, 1.75), DARK),
    tint(box(0.13, 2.9, 0.13, 1.75, 0.2, 1.75), DARK),
    tint(box(3.6, 0.13, 0.13, 0, 1.6, 1.75), DARK),
    tint(box(0.5, 0.34, 0.7, LAMP_AT.x, LAMP_AT.y - 0.1, LAMP_AT.z - 0.35), EDGE), // the lamp's housing
  ];
  hull.add(mergedMesh(frame, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false })));
  // a strip on the sill in the colour of the band the lamp is on
  const stripMat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false });
  const strip = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.035, 0.05), stripMat);
  strip.position.set(0, -0.885, 0.98);
  hull.add(strip);
  const beamGeo = new THREE.ConeGeometry(Math.tan(C.EZ_LAMP_CONE), 1, 28, 1, true).translate(0, -0.5, 0).rotateX(-Math.PI / 2);
  const beam = new THREE.Mesh(beamGeo, new THREE.ShaderMaterial({ uniforms: LAMP_U, vertexShader: BEAM_VERT, fragmentShader: BEAM_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }));
  beam.position.copy(LAMP_AT);
  beam.frustumCulled = false;
  beam.renderOrder = 7;
  hull.add(beam);
  // the pulse, round the seat: streaks down a tube the vessel is inside of
  const rideU = { uTime: time, uRide: { value: 0 } };
  const ride = new THREE.Mesh(
    new THREE.CylinderGeometry(7, 7, 1, 40, 1, true).translate(0, 0.5, 0).rotateX(Math.PI / 2).scale(1, 1, 420),
    new THREE.ShaderMaterial({ uniforms: rideU, vertexShader: BEAM_VERT, fragmentShader: RIDE_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.BackSide, fog: false }),
  );
  ride.position.z = -60;
  ride.frustumCulled = false;
  ride.renderOrder = 8;
  ride.visible = false;
  hull.add(ride);
  group.add(hull);

  // --- the body ---
  const vel = new THREE.Vector3();
  let yaw = 0, pitch = 0, avY = 0, avX = 0;
  let baseYaw = 0;
  const _f = new THREE.Vector3(), _r = new THREE.Vector3(), _w = new THREE.Vector3();
  let push = 0; // how hard it is being driven, 0..1 (the hum)
  // where it is: 0 the well, 1.. a zone of the hollow (world/hollow.js, built on the way down)
  let zone = 0;
  let hollow = null, hollowBroken = false;
  let centre = null; // world/zeroplanet.js, built with the hollow
  let env = null; // whichever of the two the vessel is in
  let choosing = false; // the pilot is being asked who stays
  let gate = 0; // the gap in the membrane, 0..1
  let shutT = 0;
  // a pulse along the lattice: one clock, and everything from it
  let rideFall = false;
  let rideT = -1, rideTo = 0, rideBack = false, rideDone = false, rideSaid = -1, rideFirst = false;
  const isOpen = () => cal === (1 << N) - 1 || chapter.reached('ez_descent');

  function step(h, fwd, strafe, lift) {
    yaw += avY * h;
    pitch = Math.min(Math.max(pitch + avX * h, -C.EZ_SUB_PITCH), C.EZ_SUB_PITCH);
    const damp = Math.exp(-C.EZ_SUB_TURN_DAMP * h);
    avY *= damp;
    avX *= damp;
    const cp = Math.cos(pitch);
    _f.set(Math.sin(yaw) * cp, Math.sin(pitch), Math.cos(yaw) * cp);
    _r.set(-Math.cos(yaw), 0, Math.sin(yaw));
    _w.set(0, 0, 0).addScaledVector(_f, fwd).addScaledVector(_r, strafe);
    _w.y += lift;
    const n = _w.length();
    if (n > 1) _w.multiplyScalar(1 / n);
    const drag = lamp.medium === 'water' ? C.EZ_SUB_DRAG_WATER : C.EZ_SUB_DRAG;
    vel.addScaledVector(_w, C.EZ_SUB_THRUST * h).multiplyScalar(Math.exp(-drag * h));
    if (zone) env.weigh(at, vel, h); // weight, where there is any
    at.addScaledVector(vel, h);
    if (zone) {
      env.bound(at, vel);
      return;
    }
    // the shaft's wall, its roof and the membrane: it slides along them
    const rr = Math.hypot(at.x, at.z), lim = R - 26;
    if (rr > lim) {
      const k = lim / rr;
      const out = (vel.x * at.x + vel.z * at.z) / rr;
      if (out > 0) {
        vel.x -= (at.x / rr) * out;
        vel.z -= (at.z / rr) * out;
      }
      at.x *= k;
      at.z *= k;
    }
    if (at.y < BOT + 14 && !(gate > 0.9 && rr < C.EZ_WELL_GATE - 12)) {
      at.y = BOT + 14;
      if (vel.y < 0) vel.y = 0;
    }
    if (at.y > TOP - 10 && rr > RING - 7) {
      at.y = TOP - 10;
      if (vel.y > 0) vel.y = 0;
    }
  }

  // --- what is said, and what has been found (this visit and any later one) ---
  let u = 0, said = -1; // the arrival's clock
  let cal = 0; // targets found, one bit each
  const hold = new Float32Array(N);
  let heardRadio = false, heardXray = false, heardLow = false, doseSaid = 0, doneAt = -1;
  const speak = (pair, sec = 6) => {
    const who = CAPTAINS.find((c) => c.id === pair[0]);
    chapterHud.say(who ? `${who.short} — ${pair[1]}` : pair[1], sec);
  };
  let lastChanged = -1, lastBand = -1;
  let radioNear = 0;

  // --- the pulse ---
  function buildHollow() {
    if (hollow || hollowBroken) return hollow;
    try {
      const k = { group, time, tier, chapter, speak, say: (text, sec) => chapterHud.say(text, sec), chime: logChime, panel: (text) => chapterHud.panel(text) };
      hollow = createHollow(k);
      centre = createCentre(k);
    } catch (err) {
      hollowBroken = true;
      console.warn('[submersible] the hollow could not be built', err);
    }
    return hollow;
  }
  // `to`: the zone to be set down in; `back`: pulled back to the node it is already under
  function startRide(to, back, fall) {
    if (rideT >= 0 || !buildHollow()) return false;
    rideT = 0;
    rideTo = to;
    rideBack = back;
    rideFall = !!fall || to === CENTRE_ZONE; // (no lattice to the centre: a fall, and nothing going by)
    rideDone = false;
    rideSaid = -1;
    rideFirst = !back && !chapter.reached('ez_descent');
    ride.visible = true;
    return true;
  }
  function land() {
    rideDone = true;
    if (rideBack) {
      env.home(at);
      resetLamp(true);
    } else {
      well.visible = false;
      if (env) env.leave();
      env = rideTo === CENTRE_ZONE ? centre : hollow;
      if (!(env === centre ? centre.enter(at) : hollow.enter(rideTo, at))) return;
      zone = rideTo;
      if (zone === CENTRE_ZONE) chapter.advance('ez_centre');
      chapter.advance('ez_descent');
      if (zone >= 3) chapter.advance('ez_firewall');
      if (zone >= 4) chapter.advance('ez_deep');
      chapter.ez.setNode(zone);
    }
    vel.set(0, 0, 0);
    avY = avX = 0;
    pitch = -0.7;
    doseSaid = Math.floor(lamp.dose * 4);
  }
  const fov = (v) => {
    if (ctx.camera.fov === v) return;
    ctx.camera.fov = v;
    ctx.camera.updateProjectionMatrix();
  };
  // everything the pulse shows, from its clock alone
  function poseRide(x) {
    const T = C.EZ_RIDE_TIME;
    const k = x < 0 ? 0 : Math.sin(Math.PI * Math.min(x / T, 1));
    rideU.uRide.value = k * (rideFall ? 0.12 : 1.6);
    chapterHud.white(rideFall ? 0 : Math.pow(k, 10) * 0.85);
    fov(C.FOV + 26 * k * k);
    ride.visible = x >= 0;
  }

  // --- the pilot's choice at the centre: who stays at the lamp ---
  function ask() {
    choosing = true;
    openDialogue({ ...CENTRE.ask, offer: CENTRE.choice }, {
      onOffer: (offer) => {
        const id = String(offer.outcomeTag || '').replace('ez:stay:', '');
        if (!chapter.ez.setStay(id)) return null;
        uiSound('engage');
        const who = CAPTAINS.find((c) => c.id === id);
        return { speaker: { name: who.name, species: who.species, cityId: CENTRE.ask.speaker.cityId }, lines: [STAY[id].line] };
      },
      onClose: () => {
        choosing = false;
        if (chapter.ez.stay()) speak(CENTRE.after, 6);
        else centre.unask(); // (left unanswered: asked again when the ground next holds)
      },
    });
  }

  let inside = false;
  let prev = null;
  const surfaces = [{ kind: 'disc', cx: 0, cz: 0, r: 1.2, y: 0 }];

  const site = {
    group,
    planet: { group: { position: ZERO }, sunDir: UP },
    noShip: true,
    hidePilot: true, // seated behind the camera
    speed: 1,
    exit: { x: 0, z: 0 },
    leaveHint: WELL.up,
    surfaces,
    colliders: [],
    floorYAt: floorOf(surfaces, 1.2),
    snap: 1.2,
    pad: new THREE.Vector3(),
    spawn: new THREE.Vector3(),
    spawnYaw: 0,
    npcs: [],
    consoles: [],
    onChoice: () => null,
    portal: null, // 'wellup' once it has risen through the ring
    held: () => true, // one seat, and it is not left
    act: () => nextBand(1), // E
    heldPrompt: () => null, // (the lamp's own readout carries the keys: src/lampHud.js)
    camera(pos, target) {
      pos.copy(at);
      const cp = Math.cos(pitch);
      target.set(at.x + Math.sin(yaw) * cp * 10, at.y + Math.sin(pitch) * 10, at.z + Math.cos(yaw) * cp * 10);
      return true;
    },
    setWalker() {},
    onEnter() {
      if (inside) return;
      inside = true;
      site.portal = null;
      group.visible = true;
      const scene = ctx.scene;
      prev = { fog: scene.fog, lightI: sun.light.intensity, ambI: sun.ambient.intensity };
      scene.fog = null;
      // nothing down here is lit by a sun: every material answers the lamp or glows
      sun.light.intensity = 0;
      sun.ambient.intensity = 0;
      ctx.hideFleet();
      // (always boarded at the top of the well: the hollow is under its floor)
      zone = 0;
      well.visible = true;
      rideT = -1;
      gate = isOpen() ? 1 : 0;
      env = null;
      choosing = false;
      lamp.canAll = chapter.reached('ez_centre'); // every band at once is learned at the centre
      at.set(0, TOP - 45, 0);
      vel.set(0, 0, 0);
      yaw = 0.6;
      pitch = -0.75; // looking down the shaft
      avY = avX = 0;
      baseYaw = cWalk.yaw;
      cWalk.pitch = 0;
      input.bandPrev = input.lampToggle = false;
      resetLamp(true);
      lamp.medium = 'void';
      lastChanged = lamp.changed;
      lastBand = lamp.band;
      hold.fill(0);
      u = 0;
      lampHud.show(true, true);
    },
    onLeave() {
      if (!inside) return;
      inside = false;
      group.visible = false;
      lampHud.show(false);
      hush();
      chapterHud.clear();
      chapterHud.white(0);
      fov(C.FOV);
      ride.visible = false;
      rideT = -1;
      if (env) env.leave();
      env = null;
      chapterHud.panel(null);
      zone = 0;
      ctx.scene.fog = prev.fog;
      sun.light.intensity = prev.lightI;
      sun.ambient.intensity = prev.ambI;
      prev = null;
    },
    tick(dt, t) {
      chapterHud.tick(dt);
      time.value = t;
      const d = Math.min(dt, 0.1);

      // --- the controls: the walker has turned the mouse into a look; take it
      // back and lean on the hull with it instead ---
      const talk = isDialogueOpen() || rideT >= 0; // (in the pulse there is nothing to steer)
      const dYaw = cWalk.yaw - baseYaw, dPitch = cWalk.pitch;
      cWalk.yaw = baseYaw;
      cWalk.pitch = 0;
      if (!talk) {
        avY += dYaw * C.EZ_SUB_TURN;
        avX += dPitch * C.EZ_SUB_TURN;
        if (input.bandPrev) nextBand(-1);
        if (input.lampToggle) toggleLamp();
      }
      input.bandPrev = input.lampToggle = false;
      const axes = moveAxes();
      const stick = input.moveX !== 0 || input.moveY !== 0; // (a pushed stick sets `sprint`: that is not Shift)
      const lift = talk ? 0 : (input.brake ? 1 : 0) - (input.sink || (input.sprint && !stick) ? 1 : 0);
      const fwd = talk ? 0 : axes.fwd, strafe = talk ? 0 : axes.strafe;
      // (while the pilot is being asked who stays, the vessel is held where it is)
      if (choosing) vel.set(0, 0, 0);
      else for (let rem = d; rem > 1e-5; rem -= 1 / 60) step(Math.min(rem, 1 / 60), fwd, strafe, lift);
      push += (Math.min(1, Math.hypot(fwd, strafe, lift)) - push) * Math.min(1, d * 4);
      setHum(rideT >= 0 ? 1 : 0.25 + 0.75 * push);
      lamp.medium = zone ? env.medium(at) : 'void';

      // --- the well: the ring above, the membrane below ---
      if (!zone) {
        // up through the ring: back to the city
        if (at.y > TOP + 6 && !site.portal) site.portal = 'wellup';
        const open = isOpen();
        if (open && gate === 0) speak(DESCENT.open, 7);
        gate = open ? Math.min(1, gate + d * 0.35) : 0;
        seal.material.uniforms.uOpen.value = C.EZ_WELL_GATE * gate * gate * (3 - 2 * gate);
        shutT = Math.max(0, shutT - d);
        if (!open && at.y < BOT + 40 && shutT <= 0) {
          shutT = 15;
          chapterHud.say(DESCENT.shut, 5);
        }
        // down through the gap: the lattice has it
        if (at.y < BOT - 12) startRide(Math.max(1, Math.min(chapter.ez.node(), CENTRE_ZONE)), false);
      }

      // --- a pulse along the lattice ---
      if (rideT >= 0) {
        rideT += d;
        if (rideFirst) {
          while (rideSaid + 1 < DESCENT.ride.length && rideT >= DESCENT.ride[rideSaid + 1][0]) {
            rideSaid++;
            speak([DESCENT.ride[rideSaid][1], DESCENT.ride[rideSaid][2]], 4);
          }
        }
        if (!rideDone && rideT >= C.EZ_RIDE_TIME / 2) land();
        if (rideT >= C.EZ_RIDE_TIME) rideT = -1;
        poseRide(rideT);
      }

      // --- the hull, and the lamp on it ---
      hull.position.copy(at);
      hull.rotation.set(-pitch, yaw, 0);
      lamp.pos.copy(LAMP_AT).applyQuaternion(hull.quaternion).add(at);
      const cp = Math.cos(pitch);
      lamp.dir.set(Math.sin(yaw) * cp, Math.sin(pitch), Math.cos(yaw) * cp);
      // every band at once: the key, or whoever is at the lamp once that has been settled
      const keeper = zone === CENTRE_ZONE && (choosing || (!!chapter.ez.stay() && lamp.on && centre.info().alt < 260));
      stepLamp(d, input.allBands || keeper);
      beam.scale.setScalar(lamp.reach * 0.75);
      stripMat.color.copy(LAMP_U.uLampTint.value).multiplyScalar(lampLive() ? 1.5 : 0.1);
      moteU.uScale.value = (window.innerHeight * Q.pixelRatio * 0.5) / Math.tan((C.FOV * Math.PI) / 360);
      if (lamp.changed !== lastChanged) {
        lastChanged = lamp.changed;
        if (lamp.band !== lastBand) {
          lastBand = lamp.band;
          bandClick(lamp.band);
          if (lamp.band === BAND.RADIO && !heardRadio) {
            heardRadio = true;
            speak(WELL.radio);
          } else if (lamp.band === BAND.XRAY && !heardXray) {
            heardXray = true;
            speak(WELL.xray);
          }
        }
      }

      // --- the radio band is an ear: louder the nearer the lamp points ---
      let near = 0;
      const live = lampLive();
      if (live && lamp.band === BAND.RADIO && zone) near = env.radioNear();
      else if (live && lamp.band === BAND.RADIO) {
        for (let i = 0; i < N; i++) {
          if (targetAt[i].band !== BAND.RADIO) continue;
          _w.subVectors(targetAt[i].p, lamp.pos).normalize();
          near = Math.max(near, (_w.dot(lamp.dir) - 0.55) / 0.45);
        }
        near = Math.max(0, near);
      }
      radioNear += (near - radioNear) * Math.min(1, d * 5);
      setRadio(live && lamp.band === BAND.RADIO, radioNear);
      // ...and the X-ray band is counted
      if (live && (lamp.all || lamp.band === BAND.XRAY)) doseTicks(6 + 30 * lamp.dose, d);
      const q = Math.floor(lamp.dose * 4);
      if (q > doseSaid && q < 4) {
        doseSaid = q;
        speak([WELL.dose[0], WELL.dose[1].replace('{n}', String(q * 25))], 4);
      }
      if (lamp.energy < 0.25 && !heardLow && lamp.on) {
        heardLow = true;
        speak(WELL.low);
      } else if (lamp.energy > 0.6) heardLow = false;

      // --- the hollow: what lives there, the log, the nodes; and being sent back ---
      if (zone && rideT < 0) {
        const ev = env.tick(d, t, at, vel.length(), push, choosing);
        if (ev === 'ride') startRide(zone + 1, false);
        else if (ev === 'fall' && startRide(CENTRE_ZONE, false, true)) speak(CENTRE.fall, 5);
        else if (ev === 'choose') ask();
        else if (ev === 'caller' && startRide(zone, true)) speak(DEEP.caught, 6);
        const why = lamp.on && lamp.energy <= 0 ? 'lamp' : lamp.dose >= 1 ? 'dose' : lamp.cabin <= 0 ? 'cabin' : null;
        if (why && !choosing && startRide(zone, true)) speak(DESCENT.back[why], 6);
      }

      // --- what the lamp finds in the well ---
      for (let i = 0; i < N && !zone; i++) {
        if (cal & (1 << i)) continue;
        const tg = targetAt[i];
        hold[i] = lampShows(tg.band, tg.p) > 0 ? hold[i] + d : 0;
        if (hold[i] >= C.EZ_LOOK_TIME) {
          cal |= 1 << i;
          logChime();
          chapterHud.say(WELL.found.replace('{band}', BANDS[tg.band].label).replace('{what}', tg.what), 7);
          if (cal === (1 << N) - 1) doneAt = u + 7.5;
        }
      }
      // --- the arrival, the first time down, and the last word ---
      u += d;
      if (!cal && !zone && !chapter.reached('ez_descent')) {
        while (said + 1 < WELL.enter.length && u >= WELL.enter[said + 1][0]) {
          said++;
          speak([WELL.enter[said][1], WELL.enter[said][2]], 6.5);
        }
      }
      if (doneAt >= 0 && u >= doneAt) {
        doneAt = -1;
        speak(WELL.done);
      }
      lampHud.update();
    },
    inside: () => inside,
    places: { seat: [0, 0, 0] },
    info: () => ({
      at: at.toArray().map((v) => +v.toFixed(1)), vel: +vel.length().toFixed(2), yaw: +yaw.toFixed(3), pitch: +pitch.toFixed(3),
      lamp: lampState(), found: cal, targets: targetAt.map((tg) => ({ band: BANDS[tg.band].id, p: tg.p.toArray() })), motes: mN,
      hud: lampHud.state(), audio: ezAudioState(),
      zone, gate: +gate.toFixed(2), ride: +rideT.toFixed(2), hollow: env ? env.info() : null, choosing,
    }),
    // dev: put the vessel somewhere, pointed somewhere (far().state().subSet)
    set(o) {
      if (o.found != null) cal = o.found; // (63: every target, so the membrane opens)
      if (o.lamp) Object.assign(lamp, o.lamp);
      if (o.at) at.fromArray(o.at);
      if (o.look) {
        _w.fromArray(o.look).sub(at).normalize();
        yaw = Math.atan2(_w.x, _w.z);
        pitch = Math.asin(_w.y);
      }
      if (Number.isFinite(o.yaw)) yaw = o.yaw;
      if (Number.isFinite(o.pitch)) pitch = o.pitch;
      vel.set(0, 0, 0);
      avY = avX = 0;
      return site.info();
    },
  };
  return site;
}
