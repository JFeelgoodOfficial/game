// The City of Light: what is on the other side of the door on the landing
// (world/farlanding.js; src/farside.js; GDD 5.7.3).
//
// The megaworld outside is dark, and works. This is what the work is for: a
// city made of light under a white hole, the black hole over the megaworld
// turned inside out. The pilot comes through the door onto a small balcony
// with the whole of it below, crosses a bridge to a terrace, and is met there.
// The door stays open behind: walking back through it is the way out.
//
// A self-contained place, in the cottage's manner (world/cottage.js): the
// group sits at the scene's origin, game.js pauses the universe round it
// (src/isolate.js, the `lightcity` render preset, far plane 4,000), and
// everything it changes in the scene it puts back in onLeave(), however the
// pilot leaves. It is walked with src/capitalWalk.js, as a platform with no
// ship on it (`noShip`): y = 0 is the balcony's floor, the door is at +z
// behind the arriving walker, the view and the terrace are toward -z.
//
// The city itself is seen, never walked: two instanced meshes of towers, a
// lit plane, three rings and a sky dome, all unlit shaders and all inside the
// isolated far plane. Only the balcony, the terrace and the figures take light.

import * as THREE from 'three';
import { C } from '../src/constants.js';
import { Q } from '../src/quality.js';
import { sun } from '../src/sun.js';
import { tint, box, cyl, mergedMesh, floorOf, buildRobot, trackRobot, tenretniMat } from './capital.js';
import { doorFrame, doorLight, DOOR } from './farlanding.js';
import { holeDirection } from './farhole.js';
import { buildHangar, HANGAR_BOX } from './lightvessel.js';
import { buildPavilion, PAV } from './lightpavilion.js';
import { CH_TIER } from '../src/constants.js';
import { createDemo } from './lightdemo.js';
import { createEpilogue } from './lightepilogue.js';
import { createDistricts } from './lightdistricts.js';
import { createWorldRace } from '../src/worldRace.js';
import { DEMO, CAPTAINS } from './chapter-dialogue.js';
import { chapterHud } from '../src/chapterHud.js';
import { loadFirstEntry, worldFrom } from './firstcreature.js';
import { createEntryOffer } from './entryoffer.js';
import { OFFER, LAUNCH, ERA as ERA_WORDS } from './entryzero-dialogue.js';
import { ERA } from '../src/era.js';
import { createEraCity } from './eracity.js';
import { createMade } from './eramade.js';
import { createLightLife } from './lightlife.js';

const SNAP = 1.2;
const DOOR_Z = 10; // the way back
const BALC_HW = 10;
const BRIDGE_HW = 3;
const BRIDGE_Z0 = -21, BRIDGE_Z1 = -58;
const TERR_Z = -77, TERR_R = 20;
// the gallery over the hangar: west of the terrace, along a second bridge
const GALL_X = -112, GALL_R = 16;
const SPEED = 2; // everyone here moves at twice a walk
const TRAIL = 96; // samples of the walker's path kept for the light behind them
const TRAIL_LIFE = 2.6; // seconds a sample glows
const GROUND_Y = -420;
const SKY_R = 3700;
const HAZE = new THREE.Color(0.42, 0.64, 0.96); // what distance fades to: the horizon's pale blue
const TOWERS = { low: 700, medium: 1400, high: 2200, ultra: 2600 };
const CRAFT = { low: 120, medium: 320, high: 520, ultra: 700 };
const ZERO = new THREE.Vector3();

const COL = { stone: 0xe9e6dd, stoneDark: 0xcfc9bb, gold: 0xc9a455, glass: 0xbfe0ee };
const GLOW = { gold: 0xffe2a0, white: 0xfff8ea };

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- shaders ---

// The sky without its detail: the blue, the pale horizon, and the white
// hole's glare. Shared by the dome and by everything that mirrors it (the
// floor underfoot). Needs `uniform vec3 uDir`, the direction to the hole.
const SKY_GLSL = /* glsl */ `
  vec3 skyBase(vec3 d) {
    float h = d.y;
    vec3 s = mix(vec3(0.46, 0.68, 0.98), vec3(0.14, 0.40, 0.92), smoothstep(0.0, 0.30, h));
    s = mix(s, vec3(0.03, 0.13, 0.52), smoothstep(0.20, 0.95, h));
    s = mix(s, vec3(0.50, 0.70, 0.98), 1.0 - smoothstep(-0.3, 0.02, h));
    float f = max(dot(d, uDir), 0.0);
    return s + vec3(1.0, 0.96, 0.88) * (pow(f, 40.0) * 0.5 + pow(f, 8.0) * 0.07);
  }
`;

const TOWER_VERT = /* glsl */ `
  varying float vUp; // 0 at the foot, 1 at the crown
  varying vec3 vWorld;
  varying vec3 vN;
  varying float vSeed;
  varying vec2 vFace; // across the wall, up the wall, in units of the tower
  void main() {
    vUp = position.y;
    vec4 placed = instanceMatrix * vec4(position, 1.0);
    vSeed = fract(instanceMatrix[3].x * 0.137 + instanceMatrix[3].z * 0.211);
    vN = normalize(mat3(instanceMatrix) * normal);
    vFace = vec2(atan(position.z, position.x), position.y);
    vec4 world = modelMatrix * placed;
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;
const TOWER_FRAG = /* glsl */ `
  uniform float uTime;
  uniform vec3 uHaze;
  uniform vec3 uLight; // toward the white hole
  uniform float uAged; // a thousand years on: three peoples have built here too
  uniform float uEra; // a million years on: most panes dark, and growth up the lower storeys
  varying float vUp;
  varying vec3 vWorld;
  varying vec3 vN;
  varying float vSeed;
  varying vec2 vFace;
  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  void main() {
    vec3 N = normalize(vN);
    vec3 V = normalize(cameraPosition - vWorld);
    // glass the colour of deep water, so the light in it has something to be
    // bright against; the face toward the hole takes its glare
    float sunward = max(dot(N, uLight), 0.0);
    vec3 glass = mix(vec3(0.02, 0.07, 0.22), vec3(0.05, 0.14, 0.34), vSeed) * (0.6 + 0.4 * sunward);
    // a curtain wall: storeys, bays, and every pane lit or not on its own
    vec2 g = vec2(vFace.x * (5.0 + floor(vSeed * 4.0)), vWorld.y * 0.085);
    vec2 cell = floor(g), f = fract(g);
    float pane = step(0.12, f.x) * step(0.22, f.y) * step(f.x, 0.88) * step(f.y, 0.86);
    float on = step(mix(0.34, 0.9, uEra), hash(cell + vSeed * 17.0));
    // (growth: up from the foot of each tower, higher on some than others)
    float moss = uEra * (1.0 - smoothstep(0.1, 0.35 + 0.45 * vSeed, vUp + 0.25 * hash(cell * 0.5)));
    glass = mix(glass * mix(1.0, 0.6, uEra), vec3(0.05, 0.13, 0.06) * (0.6 + 0.4 * sunward), moss * 0.8);
    float px = max(fwidth(g.x), fwidth(g.y));
    float fine = 1.0 - smoothstep(0.3, 0.9, px); // panes merge to a sheen far off
    vec3 cyan = vec3(0.50, 0.88, 1.0), gold = vec3(1.0, 0.80, 0.42);
    vec3 lamp = mix(cyan, gold, step(0.66, hash(cell.yy + vSeed * 3.0)));
    // A thousand years on, half the towers are the newcomers': Rustia's are
    // dark and rust-clad with ember in the windows, Saturnia's pale gold,
    // Wavemall Prime's lit in pink and cyan by the storey.
    float who = fract(vSeed * 9.37);
    float theirs = uAged * step(0.5, fract(vSeed * 3.71));
    vec3 rustG = vec3(0.13, 0.055, 0.03), rustL = vec3(1.0, 0.52, 0.2);
    vec3 goldG = vec3(0.26, 0.2, 0.1), goldL = vec3(1.0, 0.9, 0.62);
    vec3 neonG = vec3(0.07, 0.03, 0.13), neonL = mix(vec3(1.0, 0.35, 0.75), vec3(0.4, 0.95, 1.0), step(0.5, fract(cell.y * 0.5)));
    vec3 g2 = who < 0.333 ? rustG : who < 0.666 ? goldG : neonG;
    vec3 l2 = who < 0.333 ? rustL : who < 0.666 ? goldL : neonL;
    glass = mix(glass, g2 * (0.6 + 0.4 * sunward), theirs);
    lamp = mix(lamp, l2, theirs);
    vec3 col = glass + lamp * mix(0.2, pane * on * 0.95, fine) * (0.85 + 0.15 * sin(uTime * 0.7 + cell.y));
    // setbacks: a ledge every so often up the tower, dark above a line of light
    float ledge = fract(vUp * (4.0 + floor(vSeed * 5.0)) + vSeed);
    col *= 1.0 - 0.45 * smoothstep(0.93, 0.96, ledge) * fine;
    col += lamp * smoothstep(0.972, 0.985, ledge) * (1.0 - smoothstep(0.985, 1.0, ledge)) * 0.9;
    // a sign on some of them, part way up one face: a block of light that changes
    float sy = 0.35 + 0.4 * fract(vSeed * 5.13);
    float sign = step(0.72, fract(vSeed * 7.77)) * step(abs(vUp - sy), 0.035) * step(abs(fract(vFace.x * 0.1592 + vSeed) - 0.5), 0.07);
    vec3 signC = mix(vec3(1.0, 0.4, 0.75), vec3(0.45, 0.95, 1.0), step(0.5, fract(vSeed * 11.3)));
    signC = mix(signC, vec3(1.0, 0.8, 0.4), step(0.8, fract(vSeed * 2.9)));
    col = mix(col, signC * (0.9 + 0.5 * step(0.5, fract(uTime * 0.25 + vSeed * 9.0))) * (0.7 + 0.3 * step(0.5, fract(vFace.x * 30.0 + vUp * 300.0))), sign);
    // bright ribs up the corners and bands across, every few storeys
    col += cyan * (1.0 - smoothstep(0.0, 0.07, abs(fract(vFace.x * 0.9549 + 0.5) - 0.5))) * 0.5 * fine;
    col += gold * step(0.93, fract(vWorld.y * 0.0105 + vSeed)) * 0.7;
    // the crown burns, and the edges catch the sky
    col += vec3(1.0, 0.92, 0.70) * smoothstep(0.955, 1.0, vUp) * 1.3;
    // ...and a beacon at the very top keeps time
    col += vec3(1.0, 0.25, 0.2) * smoothstep(0.988, 1.0, vUp) * step(0.6, fract(uTime * 0.45 + vSeed * 7.0)) * 2.5;
    col += vec3(0.50, 0.78, 1.0) * pow(1.0 - max(dot(N, V), 0.0), 3.0) * 0.5;
    col += vec3(1.0, 0.97, 0.9) * pow(sunward, 6.0) * 0.35;
    // a million years on: the glass is still there, and most of what was lit on it is not
    col = mix(col, glass * 1.5 + (col - glass) * 0.28, uEra);
    // feet lost in the light of the streets
    col = mix(col, vec3(0.45, 0.70, 1.0), (1.0 - smoothstep(0.0, 0.14, vUp)) * 0.4 * (1.0 - 0.7 * uEra));
    float d = length(vWorld.xz - cameraPosition.xz);
    col = mix(col, uHaze, smoothstep(1500.0, 3500.0, d) * 0.45);
    gl_FragColor = vec4(col, 1.0);
  }
`;

const GROUND_VERT = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;
const GROUND_FRAG = /* glsl */ `
  uniform float uTime;
  uniform vec3 uHaze;
  uniform vec2 uHeart; // the city's centre, xz
  varying vec3 vWorld;
  float line(float x, float w) {
    float f = abs(fract(x) - 0.5);
    float px = fwidth(x);
    return 1.0 - smoothstep(w, w + px * 1.5, f);
  }
  void main() {
    vec2 p = vWorld.xz - uHeart;
    float r = length(p);
    float a = atan(p.y, p.x);
    // avenues out from the heart, and the ring roads that cross them
    float spokes = line(a * 24.0 / 6.2832, 0.035 + 2.0 / max(r, 60.0));
    float rings = line(r / 260.0, 0.03);
    float fine = line(a * 96.0 / 6.2832, 0.02) * step(600.0, r) + line(r / 65.0, 0.03) * 0.6;
    vec3 base = mix(vec3(0.05, 0.13, 0.30), vec3(0.10, 0.24, 0.42), 0.5 + 0.5 * sin(r * 0.004 + a * 3.0));
    vec3 gold = vec3(1.0, 0.82, 0.46), cyan = vec3(0.55, 0.90, 1.0);
    float flow = 0.7 + 0.3 * sin(r * 0.03 - uTime * 1.2);
    vec3 col = base;
    col += gold * spokes * 1.4 * flow + cyan * rings * 1.2 + cyan * fine * 0.5;
    // the heart itself is white
    col += vec3(0.95, 0.97, 1.0) * exp(-r / 380.0) * 1.1;
    float d = length(vWorld.xz - cameraPosition.xz);
    col = mix(col, uHaze, smoothstep(1100.0, 3500.0, d) * 0.75);
    gl_FragColor = vec4(col, 1.0);
  }
`;

// The floor underfoot: dark polished plate that mirrors the sky, cut with
// seams and inlaid with lines of light that ring the balcony and the terrace
// and run down the bridge between them.
const FLOOR_VERT = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;
const FLOOR_FRAG = /* glsl */ `
  uniform float uTime;
  uniform vec3 uDir;
  uniform vec2 uA, uB, uC, uD, uE; // the round floors' centres (xz): prow, terrace, gallery, Pavilion, suite
  uniform float uEra; // a million years on: cracked, standing water in the low places, the inlay mostly dark
  varying vec3 vWorld;
  ${SKY_GLSL}
  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  float line(float x, float w) {
    float f = abs(fract(x) - 0.5);
    return 1.0 - smoothstep(w, w + fwidth(x) * 1.5, f);
  }
  // rings and spokes of light round a centre
  float dial(vec2 p, float R) {
    float r = length(p), a = atan(p.y, p.x);
    float rings = line(r / 2.4, 0.035) * step(r, R);
    float ticks = line(a * 36.0 / 6.2832, 0.06) * smoothstep(R * 0.55, R * 0.6, r) * step(r, R * 0.72);
    float spokes = line(a * 6.0 / 6.2832, 0.012) * step(1.5, r) * step(r, R);
    return max(rings, max(ticks, spokes));
  }
  void main() {
    vec2 p = vWorld.xz;
    vec3 V = normalize(cameraPosition - vWorld);
    // plates: each a little lighter or darker, with a seam between
    vec2 pl = p / vec2(3.2, 4.8);
    float tone = hash(floor(pl));
    float seam = 1.0 - (1.0 - line(pl.x + 0.5, 0.012)) * (1.0 - line(pl.y + 0.5, 0.012));
    vec3 plate = mix(vec3(0.05, 0.08, 0.14), vec3(0.11, 0.15, 0.23), tone) * (1.0 - 0.6 * seam);
    // the mirror: the sky straight back off the floor, strongest at a glance
    vec3 R = reflect(-V, vec3(0.0, 1.0, 0.0));
    R.xz += (tone - 0.5) * 0.03; // no two plates lie quite level
    float fres = 0.16 + 0.84 * pow(1.0 - max(V.y, 0.0), 3.0);
    // a million years on: standing water where the plates have sunk (a truer
    // mirror than the floor ever was), cracks across the rest, moss in the seams
    float n1 = hash(floor(p * 0.21)), n2 = hash(floor(p * 0.21) + vec2(1.0, 0.0)), n3 = hash(floor(p * 0.21) + vec2(0.0, 1.0)), n4 = hash(floor(p * 0.21) + vec2(1.0, 1.0));
    vec2 nf = fract(p * 0.21);
    nf = nf * nf * (3.0 - 2.0 * nf);
    float low = mix(mix(n1, n2, nf.x), mix(n3, n4, nf.x), nf.y);
    float water = uEra * smoothstep(0.56, 0.62, low);
    vec2 cp = p * 0.55 + vec2(low * 3.0, tone);
    float crack = uEra * (1.0 - water) * (1.0 - smoothstep(0.0, 0.03, abs(fract(cp.x + sin(cp.y * 1.7) * 0.35) - 0.5))) * step(0.55, hash(floor(cp.yy)));
    plate = mix(plate, vec3(0.045, 0.1, 0.05), uEra * seam * 0.8);
    plate *= 1.0 - 0.75 * crack;
    R.xz *= 1.0 - water; // (water lies level)
    fres = mix(fres, 0.35 + 0.65 * pow(1.0 - max(V.y, 0.0), 2.0), water);
    vec3 col = mix(plate, vec3(0.01, 0.025, 0.035), water) + skyBase(normalize(R)) * fres * mix(0.5, 0.85, water);
    // the inlay
    float d1 = max(dial(p - uA, 9.0), dial(p - uE, 14.0)), d2 = max(max(dial(p - uB, 19.0), dial(p - uC, 15.0)), dial(p - uD, 28.0));
    float runs = line(p.x / 1.6, 0.02) * step(abs(p.x), 2.6) * step(-21.0, p.y) + line(p.x / 6.4 + 0.5, 0.006) * 0.6;
    float pulse = 0.75 + 0.25 * sin(uTime * 1.4 - length(p - uA) * 0.5);
    vec3 cyan = vec3(0.45, 0.90, 1.0), gold = vec3(1.0, 0.80, 0.42);
    // (most of the inlay is out; what is left comes and goes)
    float left = mix(1.0, 0.16 * step(0.6, fract(tone * 7.0 + floor(uTime * 0.3) * 0.37)), uEra) * (1.0 - 0.8 * water);
    col += (cyan * (d1 + d2) * 0.8 * pulse + gold * runs * 0.7) * left;
    gl_FragColor = vec4(col, 1.0);
  }
`;

// The sky, and the white hole in it. q is the direction as seen in the
// hole's own tangent plane, in hole radii (as src/shaders/farHole.frag).
const SKY_VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const SKY_FRAG = /* glsl */ `
  uniform float uTime;
  uniform vec3 uDir, uRight, uUp;
  uniform float uSize; // tan of the hole's angular radius
  uniform float uDisc;
  uniform float uTilt;
  varying vec3 vDir;
  ${SKY_GLSL}
  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  float vnoise(vec2 x) {
    vec2 i = floor(x), f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
  }
  void main() {
    vec3 d = normalize(vDir);
    vec3 col = skyBase(d);
    // stars, by day: a scatter of sparks high in the blue
    vec2 sg = d.xz / (abs(d.y) + 0.35) * 150.0;
    float sp = hash(floor(sg));
    float tw = 0.6 + 0.4 * sin(uTime * 2.0 + sp * 400.0);
    col += vec3(0.9, 0.95, 1.0) * step(0.992, sp) * (1.0 - smoothstep(0.1, 0.42, length(fract(sg) - 0.5))) * tw * smoothstep(0.12, 0.5, d.y) * 1.4;

    float f = dot(d, uDir);
    if (f > 0.05) {
      vec2 q = vec2(dot(d, uRight), dot(d, uUp)) / f / uSize;
      float rs = length(q);
      float ang = atan(q.y, q.x);
      // light pours OUT: long shafts from the core, turning slowly
      float rays = vnoise(vec2(ang * 5.0 + uTime * 0.03, 1.0)) * 0.6 + vnoise(vec2(ang * 17.0 - uTime * 0.05, 7.0)) * 0.4;
      col += vec3(1.0, 0.97, 0.90) * pow(rays, 2.6) * exp(-max(rs - 1.0, 0.0) * 0.30) * 0.24;
      // where the other hole has a disc of fire, this one has rings of sparks:
      // lanes of light dust, wound round it and turning
      float ci = cos(uTilt);
      vec2 e = vec2(q.x, q.y / ci);
      float r = length(e);
      float ea = atan(e.y, e.x);
      float reach = uDisc * 1.05;
      float k = clamp((r - 1.3) / (reach - 1.3), 0.0, 1.0);
      float spin = uTime * 0.16 / pow(max(r, 0.8), 1.5);
      float lanes = vnoise(vec2(r * 5.0, (ea + spin) * 1.2));
      float bands = pow(0.5 + 0.5 * sin(r * 13.0 + lanes * 5.0), 5.0);
      vec2 dg = vec2(r * 70.0, (ea + spin) * 110.0);
      float dust = step(0.80, hash(floor(dg))) * (1.0 - smoothstep(0.15, 0.5, length(fract(dg) - 0.5)));
      float inBand = step(1.3, r) * step(r, reach);
      // its far half passes behind the core
      float behind = q.y > 0.0 ? 1.0 - smoothstep(1.0, 1.12, rs) : 0.0;
      float ringLight = (bands * 0.22 + dust * (0.4 + 1.6 * bands) * 1.5) * exp(-k * 1.6) * inBand * (1.0 - behind);
      // a breath of every colour in it, like light through glass
      vec3 prism = 0.75 + 0.25 * cos(6.2832 * (r * 0.35 + ea * 0.16 + vec3(0.0, 0.33, 0.67)));
      col += prism * ringLight * 0.7;
      // the core: where the black was, white past looking at
      float core = 1.0 - smoothstep(0.96, 1.04, rs);
      col = mix(col, vec3(2.4, 2.35, 2.2), core);
      col += vec3(1.0, 0.97, 0.90) * exp(-max(rs - 1.0, 0.0) * 2.2) * 0.5;
    }
    gl_FragColor = vec4(col, 1.0);
  }
`;

// Craft in the air: points on lanes at many heights, each moving at its own
// pace along x or along z and wrapping; all of it in the vertex shader.
const CRAFT_VERT = /* glsl */ `
  attribute vec3 aLane; // speed, direction (0 along x, 1 along z), phase
  uniform float uTime;
  uniform float uScale;
  varying float vFade;
  void main() {
    vec3 p = position;
    float run = mod(aLane.z + uTime * aLane.x + 3200.0, 6400.0) - 3200.0;
    if (aLane.y < 0.5) p.x = run; else p.z = run;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = clamp(uScale * 5.0 / max(-mv.z, 1.0), 1.5, 7.0);
    vFade = 1.0 - smoothstep(2200.0, 3300.0, length(p.xz));
  }
`;
const CRAFT_FRAG = /* glsl */ `
  varying float vFade;
  void main() {
    float r = length(gl_PointCoord * 2.0 - 1.0);
    if (r > 1.0) discard;
    gl_FragColor = vec4(vec3(1.0, 0.96, 0.86) * (1.0 - r * r) * 1.3 * vFade, 1.0);
  }
`;

// --- the city, seen from the balcony ---

function buildCity(group, lightDir) {
  const r = rng(0xc17e);
  const dummy = new THREE.Object3D();
  // the heart: ahead of the balcony and under the hole
  const heart = new THREE.Vector2(lightDir.x, lightDir.z).normalize().multiplyScalar(1250);
  const n = TOWERS[Q.tier] || TOWERS.medium;
  const nSpire = Math.round(n * 0.62), nSlab = n - nSpire;
  const uniforms = { uTime: { value: 0 }, uHaze: { value: HAZE }, uLight: { value: lightDir }, uAged: { value: 0 }, uEra: ERA };
  const mat = new THREE.ShaderMaterial({ vertexShader: TOWER_VERT, fragmentShader: TOWER_FRAG, uniforms, fog: false });
  const spires = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.34, 1, 1, 6).translate(0, 0.5, 0), mat, nSpire);
  const slabs = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), mat, nSlab);
  const place = (mesh, i, slab) => {
    // more of them, and taller, toward the heart; none under the balcony
    let x = 0, z = 0, dh = 0;
    for (let tries = 0; tries < 8; tries++) {
      const rad = 240 + Math.pow(r(), 0.7) * 2950;
      const a = r() * Math.PI * 2;
      x = Math.cos(a) * rad;
      z = Math.sin(a) * rad - 40;
      dh = Math.hypot(x - heart.x, z - heart.y);
      // (and none in the hangar, where something else stands)
      if (x > HANGAR_BOX[0] && x < HANGAR_BOX[1] && z > HANGAR_BOX[2] && z < HANGAR_BOX[3]) continue;
      if (r() < 0.25 + 0.75 * Math.exp(-dh / 1100)) break;
    }
    if (x > HANGAR_BOX[0] && x < HANGAR_BOX[1] && z > HANGAR_BOX[2] && z < HANGAR_BOX[3]) x = HANGAR_BOX[1] + 400 + r() * 900;
    const tall = Math.exp(-dh / 900);
    const h = (120 + 620 * r() * r()) * (0.55 + 1.5 * tall) * (slab ? 0.7 : 1);
    const w = slab ? 26 + r() * 46 : 16 + r() * 30;
    dummy.position.set(x, GROUND_Y, z);
    dummy.rotation.set(0, r() * Math.PI, 0);
    dummy.scale.set(w, h, slab ? w * (0.5 + r() * 0.7) : w);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  };
  for (let i = 0; i < nSpire; i++) place(spires, i, false);
  for (let i = 0; i < nSlab; i++) place(slabs, i, true);
  // one great spire at the heart, the tallest thing there is
  dummy.position.set(heart.x, GROUND_Y, heart.y);
  dummy.rotation.set(0, 0, 0);
  dummy.scale.set(70, 1500, 70);
  dummy.updateMatrix();
  spires.setMatrixAt(0, dummy.matrix);
  for (const m of [spires, slabs]) {
    m.frustumCulled = false;
    m.instanceMatrix.needsUpdate = true;
    group.add(m);
  }

  const groundU = { uTime: { value: 0 }, uHaze: { value: HAZE }, uHeart: { value: heart } };
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(SKY_R, 96).rotateX(-Math.PI / 2),
    new THREE.ShaderMaterial({ vertexShader: GROUND_VERT, fragmentShader: GROUND_FRAG, uniforms: groundU, fog: false })
  );
  ground.position.y = GROUND_Y;
  ground.frustumCulled = false;
  group.add(ground);

  // three rings turning over the heart
  const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.5, 1.6, 1.8), fog: false });
  const rings = [];
  for (let i = 0; i < 3; i++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(330 + i * 150, 5 + i * 1.5, 8, 96), ringMat);
    ring.position.set(heart.x, GROUND_Y + 760 + i * 130, heart.y);
    ring.frustumCulled = false;
    rings.push(ring);
    group.add(ring);
  }
  // craft in the air
  const nc = CRAFT[Q.tier] || CRAFT.medium;
  const cpos = new Float32Array(nc * 3), clane = new Float32Array(nc * 3);
  for (let i = 0; i < nc; i++) {
    // on a few dozen lanes, so they read as traffic and not as snow
    const lane = Math.floor(r() * 26);
    const alongZ = lane % 2;
    const off = ((lane * 197) % 4400) - 2200, h = GROUND_Y + 260 + ((lane * 71) % 9) * 95;
    cpos[i * 3] = alongZ ? off + (r() - 0.5) * 30 : 0;
    cpos[i * 3 + 1] = h + (r() - 0.5) * 16;
    cpos[i * 3 + 2] = alongZ ? 0 : off - 600 + (r() - 0.5) * 30;
    clane[i * 3] = (55 + r() * 60) * (lane % 4 < 2 ? 1 : -1);
    clane[i * 3 + 1] = alongZ;
    clane[i * 3 + 2] = r() * 6400;
  }
  const cgeo = new THREE.BufferGeometry();
  cgeo.setAttribute('position', new THREE.BufferAttribute(cpos, 3));
  cgeo.setAttribute('aLane', new THREE.BufferAttribute(clane, 3));
  const craftU = { uTime: { value: 0 }, uScale: { value: 600 } };
  const craft = new THREE.Points(cgeo, new THREE.ShaderMaterial({
    vertexShader: CRAFT_VERT, fragmentShader: CRAFT_FRAG, uniforms: craftU,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  }));
  craft.frustumCulled = false;
  group.add(craft);

  return { uniforms, groundU, craftU, rings, towers: n, parts: [spires, slabs, ground, craft, ...rings] };
}

function buildSky(group, lightDir) {
  const right = new THREE.Vector3().crossVectors(lightDir, new THREE.Vector3(0, 1, 0)).normalize();
  const up = new THREE.Vector3().crossVectors(right, lightDir).normalize();
  const uniforms = {
    uTime: { value: 0 },
    uDir: { value: lightDir }, uRight: { value: right }, uUp: { value: up },
    uSize: { value: Math.tan(C.FAR_HOLE_SIZE) },
    uDisc: { value: C.FAR_HOLE_DISC },
    uTilt: { value: C.FAR_HOLE_TILT },
  };
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(SKY_R, 48, 32),
    new THREE.ShaderMaterial({
      vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, uniforms, side: THREE.BackSide, depthWrite: false, fog: false,
    })
  );
  dome.renderOrder = -999;
  dome.frustumCulled = false;
  group.add(dome);
  return { uniforms, dome };
}

// ctx: { scene, hideFleet(), greet() -> the dialogue payload the greeter speaks,
//        chapter — src/chapter.js: the story after the suite }
export function createLightCity(ctx) {
  const group = new THREE.Group();
  group.visible = false;
  ctx.scene.add(group);
  // the white hole hangs where the black one does: the same sky, inside out
  const lightDir = holeDirection(new THREE.Vector3());

  const lit = [], glow = [], glass = [];
  const surfaces = [];
  const colliders = [];
  const rect = (x0, x1, z0, z1) => surfaces.push({
    kind: 'rect', cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, ux: 0, uz: 1, hl: (z1 - z0) / 2, hw: (x1 - x0) / 2, yA: 0, yB: 0,
  });
  // a low glass rail from A to B with a line of gold along its top
  const rail = (ax, az, bx, bz) => {
    const len = Math.hypot(bx - ax, bz - az);
    const rot = Math.atan2(bx - ax, bz - az);
    glass.push(tint(box(0.08, 1.05, len, (ax + bx) / 2, 0.58, (az + bz) / 2, rot), COL.glass));
    glow.push(tint(box(0.12, 0.07, len, (ax + bx) / 2, 1.13, (az + bz) / 2, rot), GLOW.gold, 1.5));
    lit.push(tint(cyl(0.06, 0.08, 1.16, ax, 0.58, az, 6), COL.gold)); // a post where each run begins
  };

  // --- the balcony: a floor, a prow, a rail ---
  const B = BALC_HW;
  lit.push(tint(box(B * 2 + 1, 1.2, 26, 0, -0.6, 0.5), COL.stone));
  lit.push(tint(cyl(B + 0.5, B + 0.5, 1.2, 0, -0.6, -12, 40), COL.stone));
  lit.push(tint(cyl(B - 3, 2, 14, 0, -8.2, -8, 24), COL.stoneDark)); // the corbel it stands on
  rect(-B, B, -12, 13.5);
  surfaces.push({ kind: 'disc', cx: 0, cz: -12, r: B, y: 0 });
  // a ring of light set in the floor
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    glow.push(tint(box(1.05, 0.05, 0.16, Math.cos(a) * (B - 2.2), 0.03, -12 + Math.sin(a) * (B - 2.2), -a + Math.PI / 2), GLOW.gold, 1.3));
  }
  rail(-B, 13.5, -B, -12);
  rail(B, 13.5, B, -12);
  for (let i = 0; i < 16; i++) {
    // the prow's rail, with a gap where the bridge leaves
    const a0 = Math.PI + (i / 16) * Math.PI, a1 = Math.PI + ((i + 1) / 16) * Math.PI;
    const x0 = Math.cos(a0) * B, z0 = -12 + Math.sin(a0) * B, x1 = Math.cos(a1) * B, z1 = -12 + Math.sin(a1) * B;
    if (Math.abs((x0 + x1) / 2) < BRIDGE_HW + 0.6) continue;
    rail(x0, z0, x1, z1);
  }
  // the door back, in the wall behind
  lit.push(tint(box(B * 2 + 1, 16, 1.2, 0, 8, DOOR_Z + 4.2), COL.stone));
  doorFrame(lit, glow, DOOR_Z, COL.stoneDark, GLOW.gold, -1);
  for (const s of [-1, 1]) {
    colliders.push({ x: s * (DOOR.hw + 0.8), z: DOOR_Z, r: 0.9, top: Infinity });
    lit.push(tint(box(B - DOOR.hw - 1.6, 16, 1.0, s * (DOOR.hw + 1.6 + (B - DOOR.hw - 1.6) / 2), 8, DOOR_Z), COL.stone));
    for (let x = DOOR.hw + 2.2; x < B + 0.4; x += 1.1) colliders.push({ x: s * x, z: DOOR_Z, r: 0.7, top: Infinity });
  }

  // --- the bridge ---
  const bl = BRIDGE_Z0 - BRIDGE_Z1 + 4;
  lit.push(tint(box(BRIDGE_HW * 2 + 0.6, 0.7, bl, 0, -0.35, (BRIDGE_Z0 + BRIDGE_Z1) / 2), COL.stone));
  rect(-BRIDGE_HW, BRIDGE_HW, BRIDGE_Z1 - 2, BRIDGE_Z0 + 2);
  rail(-BRIDGE_HW, BRIDGE_Z0 + 1, -BRIDGE_HW, BRIDGE_Z1 - 1);
  rail(BRIDGE_HW, BRIDGE_Z0 + 1, BRIDGE_HW, BRIDGE_Z1 - 1);
  glow.push(tint(box(0.3, 0.05, bl, 0, 0.03, (BRIDGE_Z0 + BRIDGE_Z1) / 2), GLOW.gold, 0.9));

  // --- the terrace ---
  lit.push(tint(cyl(TERR_R + 0.6, TERR_R + 0.6, 1.2, 0, -0.6, TERR_Z, 48), COL.stone));
  lit.push(tint(cyl(TERR_R - 5, 3, 22, 0, -12.2, TERR_Z, 24), COL.stoneDark));
  surfaces.push({ kind: 'disc', cx: 0, cz: TERR_Z, r: TERR_R, y: 0 });
  for (let i = 0; i < 72; i++) {
    const a = (i / 72) * Math.PI * 2;
    for (const rr of [TERR_R - 3, TERR_R - 11]) {
      glow.push(tint(box(rr * 0.09, 0.05, 0.16, Math.cos(a) * rr, 0.03, TERR_Z + Math.sin(a) * rr, -a + Math.PI / 2), GLOW.gold, 1.3));
    }
  }
  for (let i = 0; i < 40; i++) {
    const a0 = (i / 40) * Math.PI * 2, a1 = ((i + 1) / 40) * Math.PI * 2;
    const x0 = Math.cos(a0) * TERR_R, z0 = TERR_Z + Math.sin(a0) * TERR_R, x1 = Math.cos(a1) * TERR_R, z1 = TERR_Z + Math.sin(a1) * TERR_R;
    if (Math.abs((x0 + x1) / 2) < BRIDGE_HW + 0.8 && (z0 + z1) / 2 > TERR_Z) continue; // where the bridge arrives
    if (Math.abs((z0 + z1) / 2 - TERR_Z) < BRIDGE_HW + 0.8) continue; // ...and the ones to the gallery and the Pavilion leave
    rail(x0, z0, x1, z1);
  }
  // four slender lamps round it
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    const x = Math.cos(a) * (TERR_R - 2.5), z = TERR_Z + Math.sin(a) * (TERR_R - 2.5);
    lit.push(tint(cyl(0.12, 0.2, 5, x, 2.5, z, 8), COL.gold));
    glow.push(tint(cyl(0.5, 0.5, 0.5, x, 5.2, z, 12), GLOW.white, 1.8));
    colliders.push({ x, z, r: 0.4, top: Infinity });
  }

  // --- the gallery: a second bridge west from the terrace to a round floor
  // hung out over the hangar (world/lightvessel.js) ---
  const gx0 = GALL_X + GALL_R - 2, gx1 = -TERR_R + 2; // the bridge's two ends
  lit.push(tint(box(gx1 - gx0, 0.7, BRIDGE_HW * 2 + 0.6, (gx0 + gx1) / 2, -0.35, TERR_Z), COL.stone));
  surfaces.push({ kind: 'rect', cx: (gx0 + gx1) / 2, cz: TERR_Z, ux: 1, uz: 0, hl: (gx1 - gx0) / 2 + 2, hw: BRIDGE_HW, yA: 0, yB: 0 });
  rail(gx0, TERR_Z - BRIDGE_HW, gx1, TERR_Z - BRIDGE_HW);
  rail(gx0, TERR_Z + BRIDGE_HW, gx1, TERR_Z + BRIDGE_HW);
  glow.push(tint(box(gx1 - gx0, 0.05, 0.3, (gx0 + gx1) / 2, 0.03, TERR_Z), GLOW.gold, 0.9));
  lit.push(tint(cyl(GALL_R + 0.6, GALL_R + 0.6, 1.2, GALL_X, -0.6, TERR_Z, 40), COL.stone));
  lit.push(tint(cyl(GALL_R - 4, 2.5, 18, GALL_X, -10.2, TERR_Z, 20), COL.stoneDark));
  surfaces.push({ kind: 'disc', cx: GALL_X, cz: TERR_Z, r: GALL_R, y: 0 });
  for (let i = 0; i < 32; i++) {
    const a0 = (i / 32) * Math.PI * 2, a1 = ((i + 1) / 32) * Math.PI * 2;
    const x0 = GALL_X + Math.cos(a0) * GALL_R, z0 = TERR_Z + Math.sin(a0) * GALL_R;
    const x1 = GALL_X + Math.cos(a1) * GALL_R, z1 = TERR_Z + Math.sin(a1) * GALL_R;
    if (Math.abs((z0 + z1) / 2 - TERR_Z) < BRIDGE_HW + 0.8 && (x0 + x1) / 2 > GALL_X) continue; // the bridge
    rail(x0, z0, x1, z1);
  }

  // --- what people sit on, and stand under ---
  const bench = (x, z, face) => {
    lit.push(tint(box(2.3, 0.12, 0.72, x, 0.5, z, face), COL.stone));
    lit.push(tint(box(2.3, 0.5, 0.1, x - Math.cos(face) * 0 + Math.sin(face) * -0.31, 0.78, z + Math.cos(face) * -0.31, face), COL.stone));
    for (const e of [-0.9, 0.9]) lit.push(tint(box(0.12, 0.5, 0.6, x + Math.cos(face) * e, 0.25, z - Math.sin(face) * e, face), COL.stoneDark));
    glow.push(tint(box(2.1, 0.03, 0.06, x + Math.sin(face) * 0.36, 0.08, z + Math.cos(face) * 0.36, face), GLOW.gold, 1.0));
    colliders.push({ x, z, r: 1.0, top: Infinity });
  };
  const planter = (x, z, r) => {
    lit.push(tint(cyl(r, r * 0.7, 0.7, x, 0.35, z, 14), COL.stoneDark));
    lit.push(tint(cyl(r * 0.92, r * 0.92, 0.06, x, 0.7, z, 14), 0x2a5a48));
    // what grows in it is light
    for (let i = 0; i < 7; i++) {
      const a = i * 2.4, rr = r * 0.6 * ((i % 3) / 2);
      glow.push(tint(new THREE.ConeGeometry(0.1, 0.7 + (i % 4) * 0.35, 5).translate(x + Math.cos(a) * rr, 1.05 + (i % 4) * 0.17, z + Math.sin(a) * rr), i % 2 ? 0x7dffc0 : 0x9fe8ff, 1.3));
    }
    colliders.push({ x, z, r: r + 0.15, top: Infinity });
  };
  const standard = (x, z) => {
    lit.push(tint(cyl(0.07, 0.11, 4.2, x, 2.1, z, 6), COL.gold));
    lit.push(tint(cyl(0.4, 0.07, 0.25, x, 4.25, z, 8), COL.gold));
    glow.push(tint(cyl(0.3, 0.3, 0.3, x, 4.5, z, 10), GLOW.white, 1.9));
  };
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.52;
    if (Math.abs(Math.sin(a)) < 0.3 || (Math.abs(Math.cos(a)) < 0.3 && Math.sin(a) > 0)) continue; // not across a bridge
    if (Math.sin(a) < -0.6) continue; // ...nor where the districts' bridges will leave
    bench(Math.cos(a) * 13.5, TERR_Z + Math.sin(a) * 13.5, -a + Math.PI / 2);
  }
  for (const a of [0.62, 2.52, 3.76, 5.66]) planter(Math.cos(a) * 8.6, TERR_Z + Math.sin(a) * 8.6, 1.15);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    bench(PAV.x + Math.cos(a) * 20.5, PAV.z + Math.sin(a) * 20.5, -a + Math.PI / 2);
  }
  for (const a of [0.9, 2.2, 4.1, 5.4]) planter(PAV.x + Math.cos(a) * 14, PAV.z + Math.sin(a) * 14, 1.3);
  for (const a of [1.4, 4.9]) bench(GALL_X + Math.cos(a) * 9, TERR_Z + Math.sin(a) * 9, -a + Math.PI / 2);
  planter(GALL_X + 6, TERR_Z - 8, 1.0);
  // lamp standards down the long bridge and out along the two side ones
  for (let z = BRIDGE_Z0 - 4; z > BRIDGE_Z1; z -= 9) for (const s of [-1, 1]) standard(s * (BRIDGE_HW + 0.05), z);
  for (let x = TERR_R + 6; x < PAV.x - PAV.r - 2; x += 10) for (const s of [-1, 1]) standard(x, TERR_Z + s * (BRIDGE_HW + 0.05));
  for (let x = -TERR_R - 6; x > GALL_X + GALL_R + 2; x -= 10) for (const s of [-1, 1]) standard(x, TERR_Z + s * (BRIDGE_HW + 0.05));

  const litMat = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x2c2b28 });
  const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false });
  // --- the Pavilion, the lift and the pilot's suite (world/lightpavilion.js) ---
  const npcs = [], consoles = [];
  const pavilion = buildPavilion({ group, lit, glow, glass, surfaces, colliders, rail, npcs, consoles, glowMat, chapter: ctx.chapter });
  // (geometry from more than one module: unindexed, so it all merges)
  const flatList = (list) => list.map((g) => (g.index ? g.toNonIndexed() : g));
  const glassMat = new THREE.MeshBasicMaterial({
    vertexColors: true, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide, fog: false,
  });
  group.add(mergedMesh(flatList(lit), litMat));
  group.add(mergedMesh(flatList(glow), glowMat));
  group.add(mergedMesh(flatList(glass), glassMat));

  // the polished floor laid over all of it (FLOOR_FRAG)
  const floorU = {
    uEra: ERA,
    uTime: { value: 0 }, uDir: { value: lightDir },
    uA: { value: new THREE.Vector2(0, -12) }, uB: { value: new THREE.Vector2(0, TERR_Z) },
    uC: { value: new THREE.Vector2(GALL_X, TERR_Z) },
    uD: { value: new THREE.Vector2(pavilion.floors[1][1], pavilion.floors[1][3]) },
    uE: { value: new THREE.Vector2(pavilion.floors[2][1], pavilion.floors[2][3]) },
  };
  const flat = (g, x, y, z) => g.rotateX(-Math.PI / 2).translate(x, y, z);
  const floorGeo = [
    flat(new THREE.PlaneGeometry(B * 2, 25.5), 0, 0.012, 0.75),
    flat(new THREE.CircleGeometry(B, 48), 0, 0.010, -12),
    flat(new THREE.PlaneGeometry(BRIDGE_HW * 2, BRIDGE_Z0 - BRIDGE_Z1 + 4), 0, 0.014, (BRIDGE_Z0 + BRIDGE_Z1) / 2),
    flat(new THREE.CircleGeometry(TERR_R, 64), 0, 0.010, TERR_Z),
    flat(new THREE.PlaneGeometry(-TERR_R + 2 - (GALL_X + GALL_R - 2) + 4, BRIDGE_HW * 2), (GALL_X + GALL_R - TERR_R) / 2, 0.014, TERR_Z),
    flat(new THREE.CircleGeometry(GALL_R, 48), GALL_X, 0.010, TERR_Z),
    ...pavilion.floors.map(([kind, x, y, z, a, b]) =>
      flat(kind === 'disc' ? new THREE.CircleGeometry(a, 56) : new THREE.PlaneGeometry(a, b), x, y, z)),
  ];
  const floor = mergedMesh(floorGeo, new THREE.ShaderMaterial({ vertexShader: FLOOR_VERT, fragmentShader: FLOOR_FRAG, uniforms: floorU, fog: false }));
  group.add(floor);

  // the way back: the door is dark from this side, with the works' green in it
  const sheet = doorLight(0x0c3a22, 0.7);
  sheet.mesh.position.set(0, DOOR.h / 2, DOOR_Z);
  group.add(sheet.mesh);

  // --- the one who meets the pilot ---
  const robotMat = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x3a3426 });
  const rig = buildRobot(tenretniMat(), glowMat);
  const GREET = { x: 0, y: 0, z: TERR_Z - 5, face: 0 };
  rig.group.position.set(GREET.x, GREET.y, GREET.z);
  rig.group.scale.setScalar(1.3);
  group.add(rig.group);
  const greeter = { ...rig, ...GREET, seed: 2.3, look: 0 };
  colliders.push({ x: GREET.x, z: GREET.z, r: 0.9, top: Infinity });

  const city = buildCity(group, lightDir);
  const hangar = buildHangar(group);
  // the three peoples on the walks, and their craft in the air (world/lightlife.js)
  let life = null;
  try {
    life = createLightLife({ group, colliders });
  } catch (err) {
    console.warn('[lightcity] the city could not be lived in', err);
  }
  // ...and the first thing the pilot is shown of it (world/lightdemo.js): asked
  // for at the gallery's far rail, where the whole hull is in view
  const demo = ctx.chapter ? createDemo(group, hangar, ctx.chapter, { x: GALL_X - GALL_R + 4, z: TERR_Z }, (on) => {
    // while the ship is away the city is not what is round it
    for (const m of city.parts) m.visible = on;
  }) : null;
  if (demo) consoles.push(demo.console);
  // ...and, once that has been watched, the way aboard (world/lightship.js)
  const BOARD = { x: GALL_X - GALL_R + 4, z: TERR_Z };
  if (ctx.chapter) {
    consoles.push({
      x: BOARD.x, y: 0, z: BOARD.z, r: 5.5, prompt: DEMO.board,
      off: () => !ctx.chapter.reached('holo') || (demo && demo.held()) || ctx.chapter.epilogue() || (!!epi && epi.held()),
      use: () => ((site.portal = 'ship'), null),
    });
  }

  // ...and a million years on, with the ship back: the same place, and the
  // last thing the pilot is asked (world/launch.js, GDD 5.7.5)
  if (ctx.chapter) {
    consoles.push({
      x: BOARD.x, y: 0, z: BOARD.z, r: 5.5, prompt: LAUNCH.board,
      off: () => !ctx.chapter.reached('ez_era'),
      use: () => ctx.chapter.launchTalk(),
    });
  }

  // --- the light the walker leaves behind: sparks wound round the path just
  // walked, three strands of them, fading as they open out ---
  const hist = []; // a ring of { x, y, z, dx, dz, t }
  for (let i = 0; i < TRAIL; i++) hist.push({ x: 0, y: 0, z: 0, dx: 0, dz: 1, t: -1e9 });
  let histAt = 0;
  const STRANDS = 4;
  const trailPos = new THREE.BufferAttribute(new Float32Array(TRAIL * STRANDS * 3), 3);
  const trailAge = new THREE.BufferAttribute(new Float32Array(TRAIL * STRANDS), 1);
  trailPos.setUsage(THREE.DynamicDrawUsage);
  trailAge.setUsage(THREE.DynamicDrawUsage);
  const trailGeo = new THREE.BufferGeometry();
  trailGeo.setAttribute('position', trailPos);
  trailGeo.setAttribute('aAge', trailAge);
  const trailU = { uScale: { value: 600 } };
  const trail = new THREE.Points(trailGeo, new THREE.ShaderMaterial({
    uniforms: trailU,
    vertexShader: /* glsl */ `
      attribute float aAge; // 0 new .. 1 gone
      uniform float uScale;
      varying float vAge;
      void main() {
        vAge = aAge;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = aAge >= 1.0 ? 0.0 : clamp(uScale * (0.42 - 0.2 * aAge) / max(-mv.z, 0.5), 1.5, 60.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying float vAge;
      void main() {
        float r = length(gl_PointCoord * 2.0 - 1.0);
        if (r > 1.0 || vAge >= 1.0) discard;
        // white where it is new, through gold, to the blue of the sky as it goes
        vec3 c = mix(vec3(1.0, 0.90, 0.62), vec3(1.0, 0.62, 0.18), smoothstep(0.0, 0.35, vAge));
        c = mix(c, vec3(0.35, 0.70, 1.0), smoothstep(0.4, 1.0, vAge));
        gl_FragColor = vec4(c * pow(1.0 - r, 2.2) * (1.0 - vAge) * 2.0, 1.0);
      }
    `,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  }));
  trail.frustumCulled = false;
  group.add(trail);
  function stepTrail(t) {
    if (walker) {
      const last = hist[(histAt + TRAIL - 1) % TRAIL];
      const dx = walker.x - last.x, dz = walker.z - last.z;
      const d = Math.hypot(dx, dz);
      // a new sample every short step; standing still leaves nothing
      if (d > 0.5) {
        const h = hist[histAt];
        h.x = walker.x;
        h.y = walker.y;
        h.z = walker.z;
        h.dx = d < 20 ? dx / d : 0; // (a jump through a door is not a stride)
        h.dz = d < 20 ? dz / d : 1;
        h.t = d < 20 ? t : -1e9;
        histAt = (histAt + 1) % TRAIL;
      }
    }
    const P = trailPos.array, A = trailAge.array;
    for (let i = 0; i < TRAIL; i++) {
      const h = hist[i];
      const age = (t - h.t) / TRAIL_LIFE;
      for (let k = 0; k < STRANDS; k++) {
        const o = i * STRANDS + k;
        if (age >= 1 || age < 0) {
          A[o] = 1;
          continue;
        }
        // round the line of the stride, opening out and turning as it ages
        const ang = age * 8 + (k * Math.PI * 2) / STRANDS + h.t * 5;
        const rad = 0.45 + age * 1.5;
        const side = Math.cos(ang) * rad, up = Math.sin(ang) * rad;
        P[o * 3] = h.x - h.dz * side;
        P[o * 3 + 1] = h.y + 1.1 + up * 0.8 + age * 0.9;
        P[o * 3 + 2] = h.z + h.dx * side;
        A[o] = age;
      }
    }
    trailPos.needsUpdate = true;
    trailAge.needsUpdate = true;
    trailU.uScale.value = (window.innerHeight * Q.pixelRatio * 0.5) / Math.tan((C.FOV * Math.PI) / 360);
  }
  // --- lanterns adrift over the walks: let go from somewhere below, rising, never in a hurry ---
  const nLan = (CH_TIER[Q.tier] || CH_TIER.medium).lanterns;
  const lanSeed = new Float32Array(nLan * 3);
  let ls = 0x1a27e2;
  for (let i = 0; i < lanSeed.length; i++) lanSeed[i] = ((ls = (Math.imul(ls, 1664525) + 1013904223) >>> 0), ls / 4294967296);
  const lanGeo = new THREE.BufferGeometry();
  lanGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(nLan * 3), 3));
  lanGeo.setAttribute('aSeed', new THREE.BufferAttribute(lanSeed, 3));
  const lanU = { uTime: { value: 0 }, uScale: { value: 600 } };
  const lanterns = new THREE.Points(lanGeo, new THREE.ShaderMaterial({
    uniforms: lanU,
    vertexShader: /* glsl */ `
      attribute vec3 aSeed;
      uniform float uTime, uScale;
      varying float vSeed;
      varying float vFade;
      void main() {
        vec3 p = vec3(-150.0 + aSeed.x * 300.0, 0.0, -150.0 + aSeed.z * 180.0);
        float h = mod(aSeed.y * 90.0 + uTime * (0.7 + 1.1 * aSeed.x), 90.0);
        p.y = -12.0 + h;
        p.xz += 2.5 * vec2(sin(uTime * 0.3 + aSeed.y * 30.0), cos(uTime * 0.23 + aSeed.x * 30.0));
        vSeed = aSeed.y;
        vFade = smoothstep(0.0, 8.0, h) * smoothstep(90.0, 70.0, h);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = clamp(uScale * (0.42 + 0.3 * aSeed.z) / max(-mv.z, 0.5), 1.5, 44.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      varying float vSeed;
      varying float vFade;
      void main() {
        vec2 q = gl_PointCoord * 2.0 - 1.0;
        float r = length(q * vec2(1.25, 1.0));
        if (r > 1.0) discard;
        vec3 c = mix(vec3(1.0, 0.62, 0.25), vec3(1.0, 0.86, 0.55), vSeed);
        float flick = 0.8 + 0.2 * sin(uTime * (3.0 + vSeed * 4.0) + vSeed * 50.0);
        gl_FragColor = vec4(c * pow(1.0 - r, 1.3) * 1.5 * flick * vFade, 1.0);
      }
    `,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  }));
  lanterns.frustumCulled = false;
  group.add(lanterns);

  const sky = buildSky(group, lightDir);
  const skyU = sky.uniforms;

  // a thousand years on (world/lightepilogue.js): built the first time the
  // city is entered with the light ship home
  let epi = null;
  let districts = null; // world/lightdistricts.js, built with it
  let race = null; // src/worldRace.js: the worlds raced round the city, once the story is told
  let offer = null; // world/entryoffer.js: the Archivist at the rail, once the ship has been seen off
  // a million years on (GDD 5.7.5): the city of 5.7.4 is not come back to. Its
  // districts and its racing are not built, or are put out of use if they were.
  let grown = null; // world/eracity.js
  let eraSaid = false;
  const eraNow = () => !!ctx.chapter && ctx.chapter.reached('ez_era');
  // --- what the light ship made (world/eramade.js), and the showing of it: the
  // first time the pilot walks out onto the gallery a million years on, the
  // camera goes out over the yard to the new vessel, up the strands that hold
  // it, and stops on the corner they come from. Until then the compass points
  // at the gallery and not at the door. ---
  let made = null, showU = -1, showSaid = -1;
  const SHOW = { vessel: 5, strands: 10.5, end: 15.5 };
  const MARK = { x: GALL_X, z: TERR_Z, label: ERA_WORDS.made.mark };
  const madeDue = () => !!made && eraNow() && ctx.chapter.stage() === 'ez_era' && !ctx.chapter.ez.madeSeen();
  const sm = (a, b, x) => {
    const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return k * k * (3 - 2 * k);
  };
  const _sp = new THREE.Vector3(), _st = new THREE.Vector3(), _sq = new THREE.Vector3();
  function showCamera(pos, target) {
    if (showU < 0 || !made) return false;
    const u = showU, o = hangar.root.position;
    // the vessel, from out over the yard, closing on it a little
    const d = u / SHOW.end;
    pos.set(made.at.x + 62 - 22 * d * 3, made.at.y + 24, made.at.z - 58 - 22 * d * 3);
    target.set(made.at.x, made.at.y + 14, made.at.z);
    // up the strands, from the vessel's end to the ship's
    const k2 = sm(SHOW.vessel - 0.8, SHOW.vessel + 0.8, u);
    if (k2 > 0) {
      const s = 0.97 - 0.91 * sm(SHOW.vessel, SHOW.strands, u);
      made.curve.getPointAt(s, _sp);
      made.curve.getPointAt(Math.max(0, s - 0.1), _st);
      pos.lerp(_sq.set(_sp.x + 58, _sp.y + 22, _sp.z + 30), k2);
      target.lerp(_st, k2);
    }
    // ...and the corner they come from
    const k3 = sm(SHOW.strands - 1, SHOW.strands + 1, u);
    if (k3 > 0) {
      const drift = (u - SHOW.strands) * 3;
      pos.lerp(_sq.set(made.corner.x + 150 - drift, made.corner.y + 74, made.corner.z - 64 + drift), k3);
      target.lerp(made.corner, k3);
    }
    pos.add(o);
    target.add(o);
    return true;
  }
  function showStop(seen) {
    if (showU < 0) return;
    showU = -1;
    chapterHud.cine(false);
    if (seen) ctx.chapter.ez.seeMade();
  }
  function showTick(dt) {
    if (showU < 0) {
      if (walker && madeDue() && Math.hypot(walker.x - GALL_X, walker.z - TERR_Z) < GALL_R - 2 && !site.held()) {
        showU = 0;
        showSaid = -1;
        chapterHud.cine(true);
      }
      return;
    }
    showU += dt;
    const lines = ERA_WORDS.made.lines;
    while (showSaid + 1 < lines.length && showU >= lines[showSaid + 1][0]) {
      showSaid++;
      // (a captain who was lost says nothing: one of the others has the line)
      const lost = (id) => ctx.chapter.ez.isLost(id);
      const by = CAPTAINS.find((c) => c.id === lines[showSaid][1] && !lost(c.id)) || CAPTAINS.find((c) => !lost(c.id));
      chapterHud.say(`${by ? by.short + ' — ' : ''}${lines[showSaid][2]}`, 4.6);
    }
    if (showU >= SHOW.end) showStop(true);
  }
  const retire = (from) => {
    for (let i = from; i < consoles.length; i++) {
      const c = consoles[i], was = c.off;
      c.off = () => eraNow() || (was ? was() : false);
    }
  };
  // Entry Zero's offer, the first frame it can be made (the suite scene may end mid-visit)
  const openOffer = () => {
    const ch = ctx.chapter;
    if (offer || !ch || !ch.ezOpen() || (epi && epi.held())) return;
    try {
      offer = createEntryOffer({ group, robotMat, glowMat, npcs: site.npcs, colliders, consoles, chapter: ch, at: { x: -6.5, z: -5 }, wall: { x: -24, y: 7.2, z: -5 }, vessel: { x: 13.6, z: -4 }, board: () => (site.portal = 'well') });
      pavilion.hideVisitor();
      if (ch.before('ez_offer')) chapterHud.say(OFFER.found, 8);
    } catch (err) {
      console.warn('[lightcity] the offer could not be built', err);
      offer = { tick() {}, reset() {}, state: () => null };
    }
  };

  // what this place changes in the scene, kept to put back
  let inside = false;
  let prev = null;
  let walker = null;
  let lastZ = 0;

  const site = {
    group,
    planet: { group: { position: ZERO }, sunDir: lightDir },
    noShip: true,
    speed: SPEED,
    exit: { x: 0, z: DOOR_Z },
    leaveHint: 'THE DOOR BEHIND YOU LEADS BACK TO THE LANDING',
    surfaces,
    colliders,
    floorYAt: floorOf(surfaces, SNAP),
    snap: SNAP,
    pad: new THREE.Vector3(0, 0, DOOR_Z),
    spawn: new THREE.Vector3(0, 0, DOOR_Z - 5),
    spawnYaw: Math.PI, // facing -z: the view
    fromShip: new THREE.Vector3(GALL_X - GALL_R + 7, 0, TERR_Z), // stepping back off the light ship
    fromShipYaw: Math.PI / 2, // facing the terrace
    npcs: [{ x: GREET.x, y: 0, z: GREET.z, role: 'greeter', talk: () => ctx.greet() }, ...npcs],
    consoles,
    rooms: pavilion.rooms,
    held: () => showU >= 0 || (!!demo && demo.held()) || (!!epi && epi.held()) || (!!race && race.held()),
    mark: () => (madeDue() ? MARK : null),
    act: () => race && race.running() && race.stop(),
    heldPrompt: () => (race ? race.quitPrompt() : null),
    camera: (pos, target) => showCamera(pos, target) || (!!demo && demo.camera(pos, target)) || (!!epi && epi.camera(pos, target)) || (!!race && race.camera(pos, target)),
    onChoice: (tag) => {
      if (tag === 'ez:launch') {
        site.portal = 'launch'; // aboard, and away: there is no way back from this
        return null;
      }
      const r = race ? race.onChoice(tag) : undefined;
      return r !== undefined ? r : ctx.chapter ? ctx.chapter.onChoice(tag) : null;
    },
    portal: null, // 'pad' once the walker has gone back through the door
    // back up the well in the submersible (world/submersible.js): at the east rail
    fromWell: new THREE.Vector3(7.5, 0, -4),
    fromWellYaw: -Math.PI / 2,
    setWalker(p) {
      pavilion.setWalker(p);
      if (!p) {
        walker = null;
        return;
      }
      if (walker && lastZ <= DOOR_Z && p.z > DOOR_Z && Math.abs(p.x) < DOOR.hw && p.y < 5) site.portal = 'pad';
      lastZ = p.z;
      walker = p;
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
      // the game's one sun and its ambient, borrowed for the stay (no light is
      // added or removed, so no lit material has to be rebuilt at the door)
      sun.light.position.copy(lightDir);
      sun.light.color.set(0xfff4dc);
      sun.light.intensity = 2.0;
      sun.ambient.color.set(0xdfe8ff);
      sun.ambient.intensity = 1.3;
      ctx.hideFleet();
      // back from the hole: what the two clocks came to, and one cell of the
      // ship in colours the archive never held
      const ch = ctx.chapter;
      if (ch && ch.home()) {
        if (!districts && !eraNow()) {
          try {
            const n0 = consoles.length;
            districts = createDistricts({ group, surfaces, colliders, consoles, chapter: ch, lightDir });
            retire(n0);
          } catch (err) {
            console.warn('[lightcity] the districts could not be built', err);
          }
        }
        if (!epi) {
          try {
            epi = createEpilogue({ group, chapter: ch, hangar, lightDir, pavilion, floorYAt: site.floorYAt, npcs: site.npcs, colliders, areas: districts ? districts.areas : [] });
          } catch (err) {
            console.warn('[lightcity] the epilogue could not be built', err);
          }
        }
        if (!race && ch.epilogue() && !eraNow()) {
          try {
            const n0 = consoles.length;
            race = createWorldRace({ group, camera: ctx.camera, colliders, consoles, way: epi ? epi.way : null, towers: city.parts.slice(0, 2), hit: epi ? epi.hit : null });
            retire(n0);
          } catch (err) {
            console.warn('[lightcity] the race could not be built', err);
          }
        }
        if (epi) epi.stop(); // (puts the light ship where the story has it)
        if (offer) {
          offer.reset();
          if (ch.before('ez_offer')) chapterHud.say(OFFER.found, 8);
        }
        openOffer();
        // a million years on
        const era = eraNow();
        ERA.value = era ? 1 : 0;
        hangar.era(era);
        if (era && !made) {
          try {
            made = createMade(hangar);
          } catch (err) {
            console.warn('[lightcity] what the ship made could not be built', err);
          }
        }
        if (made) made.show(era);
        if (era) {
          if (epi) epi.era();
          if (!grown) {
            try {
              grown = createEraCity({ group });
            } catch (err) {
              console.warn('[lightcity] the growth could not be built', err);
            }
          }
          if (!eraSaid && ch.stage() === 'ez_era') {
            eraSaid = true;
            chapterHud.say(ch.eraLine(), 12);
          }
        }
        if (grown) grown.show(era);
        if (!ch.reached('done')) chapterHud.say(ch.returnLine(), 9);
        const entry = loadFirstEntry();
        if (entry) {
          const w = worldFrom(entry);
          hangar.uniforms.uGivenA.value.copy(w.a);
          hangar.uniforms.uGivenB.value.copy(w.b);
          hangar.uniforms.uGiven.value = 1;
        }
      }
    },
    // Total and idempotent: the door, the menu and a world reset all end here.
    onLeave() {
      if (!inside) return;
      inside = false;
      showStop(false);
      if (demo) demo.stop();
      if (epi) epi.stop();
      if (race) race.stop();
      group.visible = false;
      ctx.scene.fog = prev.fog;
      sun.light.position.copy(prev.lightPos);
      sun.light.color.copy(prev.lightColor);
      sun.light.intensity = prev.lightI;
      sun.ambient.color.copy(prev.ambColor);
      sun.ambient.intensity = prev.ambI;
      prev = null;
    },
    tick(dt, t) {
      city.uniforms.uTime.value = t;
      city.uniforms.uAged.value = ctx.chapter && ctx.chapter.home() ? 1 : 0;
      lanU.uTime.value = t;
      lanU.uScale.value = (window.innerHeight * Q.pixelRatio * 0.5) / Math.tan((C.FOV * Math.PI) / 360);
      city.groundU.uTime.value = t;
      city.craftU.uTime.value = t;
      city.craftU.uScale.value = (window.innerHeight * Q.pixelRatio * 0.5) / Math.tan((C.FOV * Math.PI) / 360);
      floorU.uTime.value = t;
      hangar.tick(t);
      if (made) made.tick(t);
      showTick(dt);
      chapterHud.tick(dt);
      if (epi) epi.tick(dt, t, walker);
      if (districts) districts.tick(dt, t);
      if (life) life.tick(dt, t, walker, ERA.value > 0.5);
      // (the race is offered the visit after the suite scene has played)
      if (!race && ctx.chapter && ctx.chapter.epilogue() && epi && !epi.held() && !eraNow()) {
        try {
          const n0 = consoles.length;
          race = createWorldRace({ group, camera: ctx.camera, colliders, consoles, way: epi ? epi.way : null, towers: city.parts.slice(0, 2), hit: epi ? epi.hit : null });
          retire(n0);
        } catch (err) {
          console.warn('[lightcity] the race could not be built', err);
          race = { held: () => false, running: () => false, camera: () => false, onChoice: () => undefined, tick() {}, stop() {}, quitPrompt: () => null, state: () => null };
        }
      }
      if (race) race.tick(dt, t);
      if (!offer) openOffer();
      if (offer) offer.tick(dt, t, walker);
      if (demo) demo.tick(dt, t);
      pavilion.tick(dt, t);
      // the sky goes where the eye goes: from the suite, half a kilometre up, it
      // would otherwise be cut by the far plane on the far side of the city
      if (walker) sky.dome.position.copy(walker);
      stepTrail(t);
      skyU.uTime.value = t;
      sheet.uniforms.uTime.value = t;
      for (let i = 0; i < city.rings.length; i++) {
        city.rings[i].rotation.set(Math.PI / 2 + 0.35 * Math.sin(t * 0.07 + i * 2.1), t * (0.05 + i * 0.02), 0.3 * Math.cos(t * 0.05 + i));
      }
      trackRobot(greeter, walker, dt, t);
    },
    inside: () => inside,
    places: {
      door: [0, 0, DOOR_Z - 2], back: [0, 0, DOOR_Z + 2], balcony: [0, 0, -16], bridge: [0, 0, -40],
      terrace: [0, 0, TERR_Z + 8], greeter: [0, 0, GREET.z + 2.6], gallery: [GALL_X, 0, TERR_Z],
      ...pavilion.places,
    },
    info: () => ({ life: life ? life.state() : null, towers: city.towers, cells: hangar.cells, demo: demo ? demo.state() : null, districts: districts ? districts.state() : null, race: race ? race.state() : null, raceSet: race ? race.debugSet : null, raceProbe: race ? race.debugProbe : null, epi: epi ? epi.state() : null, offer: offer ? offer.state() : null, era: ERA.value, grown: grown ? grown.state() : null, corner: hangar.corner(), ship: hangar.vessel.visible, made: made ? { ...made.state(), due: madeDue(), show: +showU.toFixed(2) } : null }),
  };
  return site;
}
