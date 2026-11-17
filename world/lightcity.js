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
import { tint, box, cyl, mergedMesh, floorOf, buildRobot, trackRobot } from './capital.js';
import { doorFrame, doorLight, DOOR } from './farlanding.js';
import { holeDirection } from './farhole.js';

const SNAP = 1.2;
const DOOR_Z = 10; // the way back
const BALC_HW = 10;
const BRIDGE_HW = 3;
const BRIDGE_Z0 = -21, BRIDGE_Z1 = -58;
const TERR_Z = -77, TERR_R = 20;
const GROUND_Y = -420;
const SKY_R = 3600;
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
    float on = step(0.34, hash(cell + vSeed * 17.0));
    float px = max(fwidth(g.x), fwidth(g.y));
    float fine = 1.0 - smoothstep(0.3, 0.9, px); // panes merge to a sheen far off
    vec3 cyan = vec3(0.50, 0.88, 1.0), gold = vec3(1.0, 0.80, 0.42);
    vec3 lamp = mix(cyan, gold, step(0.66, hash(cell.yy + vSeed * 3.0)));
    vec3 col = glass + lamp * mix(0.2, pane * on * 0.95, fine) * (0.85 + 0.15 * sin(uTime * 0.7 + cell.y));
    // bright ribs up the corners and bands across, every few storeys
    col += cyan * (1.0 - smoothstep(0.0, 0.07, abs(fract(vFace.x * 0.9549 + 0.5) - 0.5))) * 0.5 * fine;
    col += gold * step(0.93, fract(vWorld.y * 0.0105 + vSeed)) * 0.7;
    // the crown burns, and the edges catch the sky
    col += vec3(1.0, 0.92, 0.70) * smoothstep(0.955, 1.0, vUp) * 1.3;
    col += vec3(0.50, 0.78, 1.0) * pow(1.0 - max(dot(N, V), 0.0), 3.0) * 0.5;
    col += vec3(1.0, 0.97, 0.9) * pow(sunward, 6.0) * 0.35;
    // feet lost in the light of the streets
    col = mix(col, vec3(0.45, 0.70, 1.0), (1.0 - smoothstep(0.0, 0.14, vUp)) * 0.4);
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
  uniform vec2 uA, uB; // the two round floors' centres (xz): prow, terrace
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
    vec3 col = plate + skyBase(normalize(R)) * fres * 0.5;
    // the inlay
    float d1 = dial(p - uA, 9.0), d2 = dial(p - uB, 19.0);
    float runs = line(p.x / 1.6, 0.02) * step(abs(p.x), 2.6) + line(p.x / 6.4 + 0.5, 0.006) * 0.6;
    float pulse = 0.75 + 0.25 * sin(uTime * 1.4 - length(p - uA) * 0.5);
    vec3 cyan = vec3(0.45, 0.90, 1.0), gold = vec3(1.0, 0.80, 0.42);
    col += cyan * (d1 + d2) * 0.8 * pulse + gold * runs * 0.7;
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
  const uniforms = { uTime: { value: 0 }, uHaze: { value: HAZE }, uLight: { value: lightDir } };
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
      if (r() < 0.25 + 0.75 * Math.exp(-dh / 1100)) break;
    }
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

  return { uniforms, groundU, craftU, rings, towers: n };
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
  return uniforms;
}

// ctx: { scene, hideFleet(), greet() -> the dialogue payload the greeter speaks }
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

  const litMat = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x2c2b28 });
  const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false });
  const glassMat = new THREE.MeshBasicMaterial({
    vertexColors: true, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide, fog: false,
  });
  group.add(mergedMesh(lit, litMat));
  group.add(mergedMesh(glow, glowMat));
  group.add(mergedMesh(glass, glassMat));

  // the polished floor laid over all of it (FLOOR_FRAG)
  const floorU = {
    uTime: { value: 0 }, uDir: { value: lightDir },
    uA: { value: new THREE.Vector2(0, -12) }, uB: { value: new THREE.Vector2(0, TERR_Z) },
  };
  const flat = (g, x, y, z) => g.rotateX(-Math.PI / 2).translate(x, y, z);
  const floorGeo = [
    flat(new THREE.PlaneGeometry(B * 2, 25.5), 0, 0.012, 0.75),
    flat(new THREE.CircleGeometry(B, 48), 0, 0.010, -12),
    flat(new THREE.PlaneGeometry(BRIDGE_HW * 2, BRIDGE_Z0 - BRIDGE_Z1 + 4), 0, 0.014, (BRIDGE_Z0 + BRIDGE_Z1) / 2),
    flat(new THREE.CircleGeometry(TERR_R, 64), 0, 0.010, TERR_Z),
  ];
  const floor = mergedMesh(floorGeo, new THREE.ShaderMaterial({ vertexShader: FLOOR_VERT, fragmentShader: FLOOR_FRAG, uniforms: floorU, fog: false }));
  group.add(floor);

  // the way back: the door is dark from this side, with the works' green in it
  const sheet = doorLight(0x0c3a22, 0.7);
  sheet.mesh.position.set(0, DOOR.h / 2, DOOR_Z);
  group.add(sheet.mesh);

  // --- the one who meets the pilot ---
  const robotMat = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x3a3426 });
  const rig = buildRobot(robotMat, glowMat, { body: 0xf3eede, dark: 0xc7a255, glow: 0xfff0c0 });
  const GREET = { x: 0, y: 0, z: TERR_Z - 5, face: 0 };
  rig.group.position.set(GREET.x, GREET.y, GREET.z);
  rig.group.scale.setScalar(1.3);
  group.add(rig.group);
  const greeter = { ...rig, ...GREET, seed: 2.3, look: 0 };
  colliders.push({ x: GREET.x, z: GREET.z, r: 0.9, top: Infinity });

  const city = buildCity(group, lightDir);
  const skyU = buildSky(group, lightDir);

  // what this place changes in the scene, kept to put back
  let inside = false;
  let prev = null;
  let walker = null;
  let lastZ = 0;

  const site = {
    group,
    planet: { group: { position: ZERO }, sunDir: lightDir },
    noShip: true,
    exit: { x: 0, z: DOOR_Z },
    leaveHint: 'THE DOOR BEHIND YOU LEADS BACK TO THE LANDING',
    surfaces,
    colliders,
    floorYAt: floorOf(surfaces, SNAP),
    snap: SNAP,
    pad: new THREE.Vector3(0, 0, DOOR_Z),
    spawn: new THREE.Vector3(0, 0, DOOR_Z - 5),
    spawnYaw: Math.PI, // facing -z: the view
    npcs: [{ x: GREET.x, y: 0, z: GREET.z, role: 'greeter', talk: () => ctx.greet() }],
    consoles: [],
    onChoice: () => null,
    portal: null, // 'pad' once the walker has gone back through the door
    setWalker(p) {
      if (!p) {
        walker = null;
        return;
      }
      if (walker && lastZ <= DOOR_Z && p.z > DOOR_Z && Math.abs(p.x) < DOOR.hw) site.portal = 'pad';
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
    },
    // Total and idempotent: the door, the menu and a world reset all end here.
    onLeave() {
      if (!inside) return;
      inside = false;
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
      city.groundU.uTime.value = t;
      city.craftU.uTime.value = t;
      city.craftU.uScale.value = (window.innerHeight * Q.pixelRatio * 0.5) / Math.tan((C.FOV * Math.PI) / 360);
      floorU.uTime.value = t;
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
      terrace: [0, 0, TERR_Z + 8], greeter: [0, 0, GREET.z + 2.6],
    },
    info: () => ({ towers: city.towers }),
  };
  return site;
}
