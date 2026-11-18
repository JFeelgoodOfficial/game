// The bridge of the light ship, and the dive (GDD 5.7.4).
//
// Forward of the archive is a blister of glass on the ship's bow: the helm in
// the middle of it, three captains at its rail. In the hangar there is only
// the city's light outside. The pilot has the captains set a clock against one
// left behind on the megaworld, takes the helm, and the ship goes down to the
// edge of the black hole.
//
// What is outside is the scene. To port the hole fills every pane, its horizon
// a hard black edge inside a ring of fire. High to starboard the megaworld
// hangs like a moon. A wire of light runs from the ship's stern all the way
// back to it, and pulses run down the wire. As the ship settles, one number,
// DRIFT, takes everything with it: the megaworld's lights flicker faster, the
// pulses on the wire close up until they are a solid line, the megaworld's
// clock runs away, and the ship's clock goes on ticking seconds. The wire is
// the gauge. Then the archive comes down the wire: every world it holds, all
// round the glass at once.
//
// One clock `u` from the moment the helm is taken, and everything placed from
// it (pose), so arriving on a bridge that has already dived is pose(END).
// A site for src/capitalWalk.js. Frame: +y up, forward -z, port -x.

import * as THREE from 'three';
import { C, CH_TIER } from '../src/constants.js';
import { Q } from '../src/quality.js';
import { sun } from '../src/sun.js';
import { MOTION_SCALE } from '../src/motion.js';
import { uiSound, setEventRumble } from '../src/sfx.js';
import { chapterHud } from '../src/chapterHud.js';
import { tint, box, cyl, mergedMesh, floorOf } from './capital.js';
import { buildRig, poseRig } from './aliens.js';
import { standRig } from './rigGround.js';
import { buildCaptain, liveCaptain } from './captainDress.js';
import { createLayerPlanet } from './layerplanet.js';
import { createPlace } from './holoplace.js';
import { HULL_VERT, HULL_FRAG } from './lightship.js';
import { WORLDS, HOME, CAPTAINS, DIVE, RETURN } from './chapter-dialogue.js';

const R = 11; // the bridge's floor
const SNAP = 1.2;
const ZERO = new THREE.Vector3();
const HOLE = new THREE.Vector3(-1, -0.1, -0.22).normalize(); // to port, a little ahead
export const MEGA = new THREE.Vector3(0.72, 0.52, 0.42).normalize(); // high to starboard, abaft the beam
const WIRE_FROM = new THREE.Vector3(8.5, 9, 18); // where it leaves the hull
const WIRE_LEN = 2600;

// the clock: seconds from taking the helm
const T_FALL = 3, T_SETTLE = 20; // falling; down
const T_DRIFT = 28; // seconds from settling for the drift to run all the way out
const T_FLOOD = T_SETTLE + 33; // the archive begins to come down the wire
const T_END = T_FLOOD + 22; // ...and is all there is
const DEEPER = Math.log(C.CH_DIVE_DEEPER); // how many times faster again by the end of the flood (ln)
const RATE = Math.log(C.CH_DIVE_RATE); // megaworld seconds per ship second, at full drift (ln)

const COL = { floor: 0x0d1118, edge: 0x1b2430, plinth: 0x222c3a };
const GLOW = { cyan: 0x9fe8ff, gold: 0xffe2a0 };
const SEEDS = { vask: 0x51a, marrow: 0x7c3, lux: 0x2e9 }; // the Pavilion's own three (world/lightpavilion.js)

export const SKY_VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
export const SKY_FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uSpace;   // 0 in the hangar .. 1 out
  uniform vec3 uHole;     // toward the hole
  uniform float uHoleR;   // its shadow's angular radius, rad
  uniform vec3 uMega;     // toward the megaworld
  uniform float uMegaR;
  uniform float uFlick;   // how many times a second the megaworld's lights change
  uniform float uDrift;   // 0..1
  uniform float uFall;    // how fast the disc's glow dies away from the edge
  uniform float uFire;    // ...and how bright it is
  uniform float uAged;    // the megaworld a thousand years on: wrapped in a lattice of light
  varying vec3 vDir;
  float h1(float n) { return fract(sin(n) * 43758.5453); }
  float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float h3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
  float n2(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(h2(i), h2(i + vec2(1, 0)), f.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), f.x), f.y);
  }
  float fbm(vec2 p) {
    float a = 0.5, s = 0.0;
    for (int i = 0; i < 4; i++) { s += a * n2(p); p = p * 2.07 + 13.1; a *= 0.5; }
    return s;
  }
  // one strand of the lattice: a great circle about an axis, and a ring where the axis comes out
  vec3 strand(vec3 m, vec3 axis, vec3 c) {
    float k = abs(dot(m, axis));
    float line = smoothstep(0.022, 0.0, k) + 0.3 * exp(-k * 16.0);
    float ring = smoothstep(0.006, 0.0, abs((1.0 - k) - 0.014)) + 0.6 * smoothstep(0.004, 0.0, abs((1.0 - k) - 0.004));
    return c * (line + ring * 1.6);
  }
  void main() {
    vec3 d = normalize(vDir);
    // --- in the hangar: the city's light, and the white hole high up ---
    vec3 city = mix(vec3(0.80, 0.90, 1.0), vec3(0.34, 0.60, 0.96), smoothstep(-0.25, 0.8, d.y));
    city += vec3(1.0, 0.97, 0.9) * pow(max(dot(d, normalize(vec3(0.2, 0.8, -0.55))), 0.0), 24.0) * 1.6;

    // --- out: stars ---
    vec3 sp = d * 190.0;
    vec3 ci = floor(sp);
    float sh = h3(ci);
    float star = step(0.99, sh) * smoothstep(0.45, 0.0, length(fract(sp) - 0.5)) * (0.7 + 3.0 * h1(sh * 91.0));
    vec3 space = vec3(0.86, 0.92, 1.0) * star;

    // --- the hole ---
    float ang = acos(clamp(dot(d, uHole), -1.0, 1.0));
    float x = ang / uHoleR; // 1 at the edge of the shadow
    // a frame round the hole's direction, for the turn of the disc
    vec3 hx = normalize(cross(uHole, vec3(0.0, 1.0, 0.0)));
    vec3 hy = cross(hx, uHole);
    float phi = atan(dot(d, hy), dot(d, hx));
    float out1 = max(x - 1.0, 0.0);
    // light bent round it: a thin ring hard against the edge, and the disc
    // smeared out beyond that, brighter on the side that is coming at us
    float ring = exp(-out1 * out1 * 9000.0) * 2.6;
    float streak = fbm(vec2(phi * 5.0 + log(x + 0.02) * 9.0 - uTime * 0.22, x * 7.0 - uTime * 0.05));
    float fine = fbm(vec2(phi * 22.0 - uTime * 0.5, x * 30.0));
    float dop = 0.55 + 0.75 * pow(0.5 + 0.5 * cos(phi - 0.7), 1.6);
    float disc = exp(-out1 * uFall) * (0.25 + 1.5 * streak * streak + 0.5 * fine) * dop;
    vec3 fire = mix(vec3(1.0, 0.32, 0.06), vec3(1.0, 0.86, 0.62), clamp(disc * 0.6 + ring, 0.0, 1.0));
    vec3 hole = fire * (disc * 1.5 + ring) * uFire * step(1.0, x);
    // stars close to it are drawn out round the edge and thinned
    space *= smoothstep(1.0, 1.5, x);
    space = (space + hole) * smoothstep(0.994, 1.0, x); // inside: nothing

    // --- the megaworld: a moon made of machine, lit by its own cities ---
    float am = acos(clamp(dot(d, uMega), -1.0, 1.0));
    if (am < uMegaR * 1.6) {
      vec3 mx = normalize(cross(uMega, vec3(0.0, 1.0, 0.0)));
      vec3 my = cross(mx, uMega);
      vec2 q = vec2(dot(d, mx), dot(d, my)) / uMegaR;
      float rr = dot(q, q);
      // its haze, outside the limb
      space += mix(vec3(0.25, 0.9, 0.6), vec3(0.3, 0.65, 1.0) * 1.8, uAged) * exp(-max(sqrt(rr) - 1.0, 0.0) * 9.0) * 0.16 * step(1.0, rr);
      if (rr < 1.0) {
        vec3 n = vec3(q, sqrt(1.0 - rr));
        // lit from the hole's side, in the hole's colour
        vec3 L = normalize(vec3(dot(uHole, mx), dot(uHole, my), 0.45));
        float dif = max(dot(n, L), 0.0);
        // plates and seams
        vec2 g = n.xy * (10.0 / (0.55 + n.z));
        float plate = h2(floor(g));
        float seam = smoothstep(0.46, 0.5, max(abs(fract(g.x) - 0.5), abs(fract(g.y) - 0.5)));
        vec3 body = vec3(0.035, 0.05, 0.055) * (0.6 + 0.8 * plate) + vec3(1.0, 0.5, 0.2) * dif * 0.16;
        body *= 1.0 - 0.5 * seam;
        // its lights: every one changes uFlick times a second, each on its own beat
        vec2 lg = g * 4.0;
        vec2 lid = floor(lg);
        float beat = floor(uTime * uFlick + h2(lid) * 9.0);
        float on = step(0.55, h2(lid + beat * 0.137));
        // (past what the eye can follow it is a shimmer, not a blink)
        on = mix(on, 0.45 + 0.4 * h2(lid + fract(uTime) * 61.0), smoothstep(0.75, 1.0, uDrift));
        float dot1 = smoothstep(0.42, 0.1, length(fract(lg) - 0.5));
        vec3 lamp = mix(vec3(0.25, 1.0, 0.6), vec3(0.7, 1.0, 0.95), h2(lid + 3.0));
        body += lamp * on * dot1 * step(0.3, h2(lid + 7.0)) * (0.9 + 1.3 * uDrift) * (1.0 - 0.82 * uAged);
        body += vec3(0.3, 1.0, 0.7) * pow(1.0 - n.z, 3.0) * 0.35;
        if (uAged > 0.0) {
          // the lattice turns slowly with the world under it
          vec3 m = n;
          float ca = cos(uTime * 0.025), sa = sin(uTime * 0.025);
          m.xz = mat2(ca, -sa, sa, ca) * m.xz;
          vec3 cy = vec3(0.3, 0.9, 1.0), vi = vec3(0.7, 0.45, 1.0), go = vec3(1.0, 0.78, 0.3);
          // the six axes of an icosahedron: their great circles cross in triangles and fives
          vec3 web = strand(m, vec3(0.0, 0.5257, 0.8507), cy) + strand(m, vec3(0.0, 0.5257, -0.8507), vi)
                   + strand(m, vec3(0.5257, 0.8507, 0.0), cy) + strand(m, vec3(0.5257, -0.8507, 0.0), go)
                   + strand(m, vec3(0.8507, 0.0, 0.5257), vi) + strand(m, vec3(-0.8507, 0.0, 0.5257), cy);
          // and the fine threads between them
          float fine = pow(fbm(m.xy * 26.0 + m.z * 9.0), 3.0) * 1.1;
          body = body * 0.5 + (web * (0.6 + 0.25 * sin(uTime * 1.7 + m.x * 30.0)) + mix(cy, vi, fbm(m.yz * 5.0)) * fine) * uAged;
          body += vec3(0.3, 0.6, 1.0) * pow(1.0 - n.z, 2.5) * 0.5 * uAged;
        }
        space = body;
      }
    }
    gl_FragColor = vec4(mix(city, space, uSpace), 1.0);
  }
`;

// The wire: a line of light from the hull to the megaworld, thin where it
// leaves and wider with distance so that it is a line all the way.
export const WIRE_VERT = /* glsl */ `
  uniform float uWide;
  varying float vAlong;
  varying float vSide;
  void main() {
    vAlong = uv.y;
    vec3 p = position;
    p.xz *= mix(0.09, 11.0, uv.y) * uWide;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vSide = abs(normalize(normalMatrix * vec3(position.x, 0.0, position.z)).z);
    gl_Position = projectionMatrix * mv;
  }
`;
export const WIRE_FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uDrift; // 0..1
  uniform float uPhase; // how far the pulses have run (the gauge: it only speeds up)
  uniform float uGain;
  varying float vAlong;
  varying float vSide;
  void main() {
    // even to the eye along its length, not along the wire
    float s = log(1.0 + vAlong * 300.0) / log(301.0);
    float n = mix(7.0, 46.0, uDrift);
    float ph = fract(s * n + uPhase);
    float pulse = smoothstep(mix(0.78, 0.35, uDrift), 1.0, ph);
    float base = 0.22 + 0.9 * uDrift * uDrift;
    vec3 col = mix(vec3(0.35, 0.95, 1.0), vec3(1.0, 1.0, 0.95), pulse * 0.7 + uDrift * 0.4);
    float a = (base + pulse * 2.4) * (0.35 + 0.65 * vSide) * uGain;
    gl_FragColor = vec4(col * a, 1.0);
  }
`;

// ctx: { scene, hideFleet(), chapter — src/chapter.js }
export function createDiveBridge(ctx) {
  const { chapter } = ctx;
  const group = new THREE.Group();
  group.visible = false;
  ctx.scene.add(group);
  const lit = [], glow = [];
  const surfaces = [{ kind: 'disc', cx: 0, cz: 0, r: R, y: 0 }];
  const colliders = [], consoles = [];

  // --- what is outside ---
  const skyU = {
    uTime: { value: 0 }, uSpace: { value: 0 }, uHole: { value: HOLE }, uHoleR: { value: 0.3 },
    uMega: { value: MEGA }, uMegaR: { value: 0.2 }, uFlick: { value: 0.6 }, uDrift: { value: 0 }, uFall: { value: 3 }, uFire: { value: 1 }, uAged: { value: 0 },
  };
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(3400, 64, 40),
    new THREE.ShaderMaterial({ vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, uniforms: skyU, side: THREE.BackSide, depthWrite: false, fog: false })
  );
  sky.renderOrder = -999;
  sky.frustumCulled = false;
  group.add(sky);

  // the ship behind the bridge: its cells, from outside
  const hullU = { uTime: { value: 0 }, uDim: { value: 1 } };
  const hull = new THREE.Mesh(
    new THREE.BoxGeometry(150, 100, 300),
    new THREE.ShaderMaterial({ vertexShader: HULL_VERT, fragmentShader: HULL_FRAG, uniforms: hullU, fog: false })
  );
  hull.position.set(0, -34, 21 + 150);
  group.add(hull);

  // the wire, and a soft glow round it
  const wireU = { uTime: skyU.uTime, uDrift: skyU.uDrift, uPhase: { value: 0 }, uGain: { value: 1.8 }, uWide: { value: 1 } };
  const haloU = { ...wireU, uGain: { value: 0.22 }, uWide: { value: 5 } };
  const wireGeo = new THREE.CylinderGeometry(1, 1, 1, 10, 96, true).translate(0, 0.5, 0);
  const mkWire = (uniforms) => {
    const m = new THREE.Mesh(wireGeo, new THREE.ShaderMaterial({
      vertexShader: WIRE_VERT, fragmentShader: WIRE_FRAG, uniforms,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    }));
    m.position.copy(WIRE_FROM);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), MEGA);
    m.scale.set(1, WIRE_LEN, 1);
    m.frustumCulled = false;
    m.visible = false;
    group.add(m);
    return m;
  };
  const wire = mkWire(wireU), wireHalo = mkWire(haloU);
  // the mast it leaves from
  lit.push(tint(cyl(0.25, 0.6, 9, WIRE_FROM.x, WIRE_FROM.y - 4.5, WIRE_FROM.z, 8), COL.edge));
  glow.push(tint(cyl(0.5, 0.5, 0.5, WIRE_FROM.x, WIRE_FROM.y, WIRE_FROM.z, 10), GLOW.cyan, 2.2));

  // --- the bridge: a floor, a rail of light, ribs of a glass blister ---
  lit.push(tint(cyl(R + 0.3, R - 2, 0.7, 0, -0.35, 0, 56), COL.floor));
  lit.push(tint(box(7, 0.6, 12, 0, -0.3, R + 4.5), COL.floor)); // the neck back to the ship
  surfaces.push({ kind: 'rect', cx: 0, cz: R + 1.5, ux: 0, uz: 1, hl: 3.2, hw: 2.6, yA: 0, yB: 0 });
  glow.push(tint(new THREE.TorusGeometry(R - 0.1, 0.06, 6, 80).rotateX(Math.PI / 2).translate(0, 0.05, 0), GLOW.cyan, 1.4));
  glow.push(tint(new THREE.TorusGeometry(R, 0.035, 6, 80).rotateX(Math.PI / 2).translate(0, 1.1, 0), GLOW.gold, 1.2));
  for (let i = 0; i < 6; i++) {
    lit.push(tint(new THREE.TorusGeometry(R + 0.15, 0.07, 5, 48, Math.PI).rotateY((i / 6) * Math.PI), COL.edge));
  }
  for (let i = 0; i < 8; i++) glow.push(tint(box(0.1, 0.04, R * 1.5, 0, 0.03, 0, (i / 8) * Math.PI), GLOW.cyan, 0.35));
  const pane = new THREE.Mesh(
    new THREE.SphereGeometry(R + 0.15, 48, 20, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xbfe6ff, transparent: true, opacity: 0.05, depthWrite: false, side: THREE.DoubleSide, fog: false })
  );
  pane.renderOrder = 3;
  group.add(pane);

  // the helm
  const HELM = { x: 0, z: -4.5 };
  lit.push(tint(cyl(0.9, 1.2, 1.1, HELM.x, 0.55, HELM.z, 6), COL.plinth));
  glow.push(tint(cyl(0.95, 0.95, 0.06, HELM.x, 1.13, HELM.z, 6), GLOW.gold, 1.6));
  colliders.push({ x: HELM.x, z: HELM.z, r: 1.25, top: Infinity });
  // a wheel on it, and its two grips
  lit.push(tint(new THREE.TorusGeometry(0.62, 0.05, 6, 28).rotateX(-0.9).translate(HELM.x, 1.5, HELM.z + 0.25), COL.edge));
  for (const s of [-1, 1]) glow.push(tint(cyl(0.06, 0.06, 0.22, HELM.x + s * 0.62, 1.5, HELM.z + 0.25, 6), GLOW.gold, 1.8));
  lit.push(tint(cyl(0.05, 0.05, 0.5, HELM.x, 1.3, HELM.z + 0.1, 6).rotateX(-0.2), COL.edge));
  // the hatch in the floor: the shuttle's (lit when there is somewhere deeper to go)
  const HATCH = { x: 0, z: 5 };
  const hatchMat = new THREE.MeshBasicMaterial({ color: 0x0a1016, fog: false });
  const hatch = new THREE.Mesh(new THREE.CircleGeometry(1.9, 6).rotateX(-Math.PI / 2), hatchMat);
  hatch.position.set(HATCH.x, 0.04, HATCH.z);
  group.add(hatch);
  const hatchRing = new THREE.Mesh(new THREE.TorusGeometry(2.05, 0.08, 6, 6).rotateX(Math.PI / 2), hatchMat);
  hatchRing.position.set(HATCH.x, 0.07, HATCH.z);
  group.add(hatchRing);

  // --- the captains, each at the rail with a clock in front of them ---
  const STAND = { vask: [-7.6, -2.4], marrow: [7.6, -2.4], lux: [3.4, 7.2] };
  const crew = CAPTAINS.map((c) => {
    const [x, z] = STAND[c.id] || [0, 7];
    const rig = buildCaptain(c.id);
    rig.group.position.set(x, 0, z);
    standRig(rig, 0);
    // the two at the rail look out; the one who is afraid has their back to the neck
    rig.group.rotation.y = c.takes === 'fears' ? Math.atan2(-x, -z) : Math.atan2(x, z) + Math.PI * (x < 0 ? 0.92 : 1.08);
    group.add(rig.group);
    colliders.push({ x, z, r: 0.7, top: Infinity });
    // their clock: a small ring of light that fills when it is set
    const clock = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.045, 6, 28), new THREE.MeshBasicMaterial({ color: 0x223040, fog: false }));
    clock.position.set(x * 1.12, 1.55, z * 1.12);
    clock.lookAt(0, 1.55, 0);
    group.add(clock);
    // their station: a stem, a slanted board, and a column of light that
    // climbs as the two clocks come apart
    const out = Math.hypot(x, z), ux = x / out, uz = z / out;
    lit.push(tint(cyl(0.07, 0.12, 1.0, x + ux * 1.1, 0.5, z + uz * 1.1, 6), COL.plinth));
    lit.push(tint(box(0.9, 0.06, 0.5, x + ux * 1.1, 1.05, z + uz * 1.1, Math.atan2(ux, uz)), COL.edge));
    const gauge = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1, 0.1).translate(0, 0.5, 0), new THREE.MeshBasicMaterial({ color: 0x223040, fog: false }));
    gauge.position.set(x + ux * 1.45, 1.1, z + uz * 1.45);
    group.add(gauge);
    return { c, rig, clock, gauge };
  });

  const litMat = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x0c0f14 });
  const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false });
  const flatList = (list) => list.map((g) => (g.index ? g.toNonIndexed() : g));
  group.add(mergedMesh(flatList(lit), litMat));
  group.add(mergedMesh(flatList(glow), glowMat));

  // --- the flood: every world the archive holds, round the glass at once ---
  const place = createPlace(46);
  place.mesh.material.transparent = true;
  place.mesh.material.depthWrite = false;
  place.mesh.renderOrder = -5;
  place.uniforms.uSpeed.value = 1.4;
  group.add(place.mesh);
  const visions = [...WORLDS.slice(0, (CH_TIER[Q.tier] || CH_TIER.medium).flood).map((w) => w.layers), HOME.layers].map((layers, i, all) => {
    const home = i === all.length - 1;
    const p = createLayerPlanet(home ? 4.6 : 3, { life: home ? 320 : 160, seg: 40, seed: 1.7 + i * 2.9 });
    p.setAll(layers);
    p.holo(0.25);
    p.group.visible = false;
    group.add(p.group);
    return { p, home, a: (i / (all.length - 1)) * Math.PI * 2, h: 3 + 4.5 * ((i * 0.618) % 1) };
  });
  let painted = -1;

  // --- state ---
  let mode = 'dock'; // 'dock' | 'synced' | 'dive' | 'deep'
  let u = 0; // seconds since the helm was taken
  let shipT = 0, worldT = 0; // the two clocks, seconds since they were set
  let phase = 0; // the wire's pulses
  let rise = 0; // seconds into the way home
  let talker = null, talkT = 0; // whose line is up, and for how much longer
  let said = -1;
  let inside = false;
  let prev = null;
  let walker = null;
  let hudAt = 0;

  const ease = (a, b, x) => {
    const k = Math.min(Math.max((x - a) / (b - a), 0), 1);
    return k * k * (3 - 2 * k);
  };
  const driftAt = (x) => ease(T_SETTLE, T_SETTLE + T_DRIFT, x);

  // Everything outside, from the clock.
  function pose(x) {
    const out = mode === 'dive' || mode === 'deep' || mode === 'rise';
    const down = ease(T_FALL, T_SETTLE, x);
    skyU.uSpace.value = out ? ease(0.2, 1.6, x) : 0;
    skyU.uHoleR.value = 0.34 + 0.66 * down; // (wider than a pane, and its edge still in it)
    skyU.uMegaR.value = 0.26 - 0.13 * down;
    const drift = out ? driftAt(x) : 0;
    skyU.uDrift.value = drift;
    skyU.uFlick.value = 0.6 * Math.exp(drift * 5.2);
    wire.visible = wireHalo.visible = out;
    // the light on the bridge: the city's in the hangar, the hole's out here
    const s = skyU.uSpace.value;
    sun.light.position.set(0.2 + (HOLE.x - 0.2) * s, 1 + (0.25 - 1) * s, 0.3 + (HOLE.z - 0.3) * s).normalize();
    sun.light.color.setRGB(0.9 + 0.1 * s, 0.94 - 0.36 * s, 1.0 - 0.72 * s);
    sun.light.intensity = 1.6 + 0.5 * s;
    sun.ambient.color.setRGB(0.8 - 0.45 * s, 0.85 - 0.4 * s, 1.0 - 0.2 * s);
    sun.ambient.intensity = 1.1 - 0.35 * s;
    // the flood
    const f = out && mode !== 'rise' && !chapter.reached('return') ? ease(T_FLOOD, T_END, x) : 0;
    place.mesh.visible = f > 0.002;
    place.uniforms.uAlpha.value = f * f * 0.72;
    for (const v of visions) v.p.group.visible = f > 0.002;
    return { down, drift, flood: f };
  }

  function finish() {
    mode = 'deep';
    chapter.setClocks(shipT, worldT);
    chapter.advance('shuttle');
  }

  consoles.push({
    x: HELM.x, y: 0, z: HELM.z + 1.6, r: 2.6,
    get prompt() {
      return mode === 'deep' ? RETURN.helm : mode === 'dock' ? DIVE.sync : DIVE.launch;
    },
    off: () => !(mode === 'dock' || mode === 'synced' || (mode === 'deep' && chapter.reached('return'))),
    use() {
      if (mode === 'deep') {
        // the way home: up out of the well, to a world a thousand years older
        mode = 'rise';
        rise = 0;
        chapterHud.cine(true);
        uiSound('engage');
      } else if (mode === 'dock') {
        mode = 'synced';
        shipT = worldT = 0;
        uiSound('toggle');
      } else {
        mode = 'dive';
        u = 0;
        said = -1;
        uiSound('engage');
      }
      return null;
    },
  });
  // the shuttle (world/shuttle.js): down through the hatch, once the ship can do no more
  consoles.push({
    x: HATCH.x, y: 0, z: HATCH.z, r: 2.4, prompt: DIVE.hatch,
    off: () => mode !== 'deep',
    use: () => ((site.portal = 'shuttle'), null),
  });
  consoles.push({
    x: 0, y: 0, z: R + 3.6, r: 2.2, prompt: 'E — BACK TO THE ARCHIVE',
    off: () => mode === 'dive' || mode === 'rise',
    use: () => ((site.portal = 'hall'), null),
  });

  const site = {
    group,
    planet: { group: { position: ZERO }, sunDir: new THREE.Vector3(0, 1, 0) },
    noShip: true,
    speed: 1.3,
    exit: { x: 0, z: R + 3.6 },
    leaveHint: 'THE ARCHIVE IS AFT, BEHIND YOU',
    surfaces,
    colliders,
    floorYAt: floorOf(surfaces, SNAP),
    snap: SNAP,
    pad: new THREE.Vector3(0, 0, R + 3.6),
    spawn: new THREE.Vector3(0, 0, R + 1.5),
    spawnYaw: Math.PI,
    fromShuttle: new THREE.Vector3(HATCH.x, 0, HATCH.z + 2.6), // back up the tether
    fromShuttleYaw: Math.PI,
    npcs: [],
    consoles,
    onChoice: () => null,
    portal: null,
    // falling, the pilot is at the helm: free to look, not to walk
    held: () => (mode === 'dive' && u < T_SETTLE) || mode === 'rise',
    // going home, the megaworld is the view
    camera(pos, target) {
      if (mode !== 'rise') return false;
      pos.set(-1.5, 2.3, -2.5);
      target.copy(pos).addScaledVector(MEGA, 60);
      return true;
    },
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
      ctx.hideFleet();
      // a ship that has already gone down is still down
      skyU.uAged.value = chapter.reached('stall') ? 1 : 0;
      rise = 0;
      if (chapter.home()) {
        // home again: in the hangar, with nowhere left to go
        mode = 'home';
        u = 0;
      } else if (chapter.reached('shuttle')) {
        mode = 'deep';
        u = T_END;
        const k = chapter.clocks();
        shipT = k.ship || T_END;
        worldT = k.world || T_END;
      } else {
        mode = 'dock';
        u = 0;
        shipT = worldT = 0;
      }
      phase = 0;
      pose(u);
    },
    onLeave() {
      if (!inside) return;
      inside = false;
      group.visible = false;
      setEventRumble(0);
      chapterHud.clear();
      chapterHud.clocks(null);
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
      if (talkT > 0) talkT -= dt;
      skyU.uTime.value = t;
      hullU.uTime.value = t;
      if (walker) sky.position.copy(walker);
      const px = (window.innerHeight * Q.pixelRatio * 0.5) / Math.tan((C.FOV * Math.PI) / 360);

      if (mode === 'dive') {
        u += dt;
        if (u >= T_END) finish();
      }
      const { down, drift, flood } = pose(u);
      if (mode === 'rise') {
        // the hole falls away below, the megaworld comes up to fill the glass,
        // and its lights and the wire slow to where they can be followed
        rise += dt;
        const up = ease(0, 15, rise);
        skyU.uHoleR.value = 1.0 - 0.86 * up;
        skyU.uMegaR.value = 0.13 + 1.05 * up * up;
        skyU.uDrift.value = 1 - 0.9 * up;
        skyU.uFlick.value = 0.6 * Math.exp((1 - up) * 5.2);
        chapterHud.white(ease(14.5, 17, rise));
        if (rise >= 17) {
          mode = 'home';
          chapter.setHome();
          chapterHud.cine(false);
          site.portal = 'gallery';
        }
      }

      // the clocks: set together, and then only one of them keeps to seconds
      if (mode !== 'dock' && mode !== 'home') {
        shipT += dt;
        // ...down, a minute is a year; and the ship goes on sinking through the
        // flood, so by the end of it a minute is many
        worldT += dt * (mode === 'synced' || chapter.reached('stall') ? 1 : Math.exp(RATE * drift + DEEPER * ease(T_SETTLE + T_DRIFT, T_END, u)));
        hudAt -= dt;
        if (hudAt <= 0) {
          hudAt = 0.1;
          chapterHud.clocks(shipT, worldT, DIVE.clocks.ship, DIVE.clocks.world);
        }
      }
      // the wire: its pulses only ever come faster
      phase += dt * (0.22 + 5.5 * drift * drift);
      wireU.uPhase.value = phase;

      // the captains
      for (const m of crew) {
        poseRig(m.rig, dt, t, 'idle', 0);
        standRig(m.rig, 0);
        // whoever is speaking speaks; the others turn their heads to them
        const mine = talkT > 0 && talker === m.c.id;
        let lookYaw = 0;
        if (talkT > 0 && talker && !mine) {
          for (const o of crew) {
            if (o.c.id === talker) lookYaw = Math.atan2(o.rig.group.position.x - m.rig.group.position.x, o.rig.group.position.z - m.rig.group.position.z) - m.rig.group.rotation.y;
          }
        }
        liveCaptain(m.rig, dt, t, mine, lookYaw);
        const set = mode !== 'dock';
        const k = set ? 1.2 + 0.5 * Math.sin(t * 3 + m.clock.position.x) : 0.12;
        m.clock.material.color.setRGB(0.5 * k, 1.0 * k, 1.1 * k);
        m.clock.rotation.z = set ? -shipT * 0.8 : 0;
        // the gauge: how far apart the clocks have come
        const dr = skyU.uDrift.value * skyU.uSpace.value;
        m.gauge.scale.y = 0.05 + 1.3 * dr;
        m.gauge.material.color.setRGB(0.3 + 1.6 * dr, 1.1 - 0.5 * dr, 1.2 - 0.9 * dr);
      }

      if (mode === 'dive') {
        // what is said, counted from the moment the ship is down
        const since = u - T_SETTLE;
        for (let i = 0; i < DIVE.lines.length; i++) {
          if (i > said && since >= DIVE.lines[i][0]) {
            said = i;
            const who = CAPTAINS.find((c) => c.id === DIVE.lines[i][1]);
            chapterHud.say(who ? `${who.short} — ${DIVE.lines[i][2]}` : DIVE.lines[i][2], 5.5);
            talker = who ? who.id : null;
            talkT = 2.2 + DIVE.lines[i][2].length * 0.045;
            if (i === 0) uiSound('impact');
          }
        }
      }
      const falling = mode === 'dive' ? ease(0.5, 4, u) * (1 - 0.75 * down) : 0;
      setEventRumble(mode === 'dive' || mode === 'deep' ? Math.min(1, falling * 0.8 + flood * 0.75) * (0.4 + 0.6 * MOTION_SCALE) : 0);
      if (mode !== 'rise') chapterHud.white(mode === 'dive' ? Math.max(0, 1 - u / 1.4) * 0.9 : 0);

      // the flood: the worlds come round the glass, closer and faster, and the
      // place behind them changes sooner each time
      if (flood > 0.002) {
        const beat = Math.floor(u * (1.2 + 5 * flood));
        if (beat !== painted) {
          painted = beat;
          const all = WORLDS.length + 1;
          const k = beat % all;
          place.paint(k === WORLDS.length ? HOME.layers : WORLDS[k].layers, k * 7.31 + 1.3);
        }
        place.uniforms.uTime.value = t;
        place.uniforms.uFade.value = 0.8 + 0.5 * flood;
        for (const v of visions) {
          const g = v.p.group;
          if (v.home) {
            // home comes last, dead ahead, and does not go round with the rest
            const hk = ease(0.45, 1, flood);
            g.position.set(0, 4.5, -(R + 26 - 14 * hk));
            g.scale.setScalar(0.2 + 1.1 * hk);
            v.p.revealAll(hk);
          } else {
            const a = v.a + t * (0.12 + 0.5 * flood);
            const rad = R + 22 - 15 * flood;
            g.position.set(Math.cos(a) * rad, v.h + Math.sin(t * 0.6 + v.a) * 1.2, Math.sin(a) * rad);
            g.scale.setScalar(0.3 + 1.0 * flood);
            v.p.revealAll(Math.min(1, flood * 2.2));
          }
          g.rotation.y = t * 0.3 + v.a;
          v.p.tick(t, px);
        }
      }

      // the hatch: lit once there is nothing more the ship can do
      const open = mode === 'deep';
      const hp = open ? 1.2 + 0.5 * Math.sin(t * 2.4) : 0;
      hatchMat.color.setRGB(0.04 + 1.0 * hp, 0.06 + 0.9 * hp, 0.09 + 0.6 * hp);
    },
    inside: () => inside,
    places: { helm: [HELM.x, 0, HELM.z + 1.6], hatch: [HATCH.x, 0, HATCH.z], aft: [0, 0, R + 1.5] },
    info: () => ({
      mode, rise, megaR: skyU.uMegaR.value, u, shipT, worldT, drift: skyU.uDrift.value, holeR: skyU.uHoleR.value,
      flood: place.uniforms.uAlpha.value, end: T_END, settle: T_SETTLE,
    }),
    // dev: jump the dive's clock
    seek(x) {
      if (mode !== 'dive') return false;
      u = x;
      return true;
    },
  };
  return site;
}
