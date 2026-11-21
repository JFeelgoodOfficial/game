// The hangar in the City of Light, and what is being built in it
// (world/lightcity.js; GDD 5.7.3).
//
// A vessel, behemoth in size, floating over its yard inside a frame of
// iridescent glass. Its body is hundreds of cells, cubes and longer prisms,
// each one turning through the whole spectrum at its own pace, and each one
// lived in: figures can be seen moving in every cell, and they are dancing.
// Forward of the cells a truss spine runs out to a bulb of hexagonal cells;
// aft is the drive, a hub inside two great rings. Nobody says what it is for.
//
// Everything here is seen from the gallery, never walked. The cells are two
// instanced meshes with one shader (CELL_FRAG): colour, frame, glass and the
// life inside are all drawn per fragment from a seed per instance, so the
// whole hull animates for the cost of two draw calls and one uniform.

import * as THREE from 'three';
import { tint, box, cyl, mergedMesh } from './capital.js';

// The vessel's place in the city's frame: its long axis runs along z.
export const VESSEL = { x: -430, y: 30, z: -110 };
// The box the city's towers keep out of (world/lightcity.js): [x0, x1, z0, z1].
export const HANGAR_BOX = [-900, -150, -760, 560];

const CELL = 30; // a cubic cell's edge
const NX = 5, NY = 9, NZ = 14; // deep, tall, long

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CELL_VERT = /* glsl */ `
  attribute float aSeed;
  varying vec3 vLocal; // on the unit cell, -0.5..0.5
  varying vec3 vLN; // the cell's own normal
  varying vec3 vWorld;
  varying vec3 vN;
  varying float vSeed;
  varying vec3 vSize; // the cell's size, in cubic cells
  void main() {
    vLocal = position;
    vLN = normal;
    vSeed = aSeed;
    vSize = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz)) / ${CELL.toFixed(1)};
    vec4 world = modelMatrix * instanceMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;
const CELL_FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uFlight; // 0 at rest .. 1 under way (world/lightdemo.js)
  uniform float uPhase; // how far round the spectrum flight has carried it
  uniform float uFlash; // 0..1: every cell white, at a jump
  uniform float uGiven; // 1 once the archive holds something it was given...
  uniform float uGivenSeed; // ...and this cell keeps its colours, which are not in the cycle
  uniform vec3 uGivenA;
  uniform vec3 uGivenB;
  varying vec3 vLocal;
  varying vec3 vLN;
  varying vec3 vWorld;
  varying vec3 vN;
  varying float vSeed;
  varying vec3 vSize;
  vec3 hue(float h) {
    return clamp(abs(fract(h + vec3(0.0, 0.6667, 0.3333)) * 6.0 - 3.0) - 1.0, 0.0, 1.0);
  }
  // one of the people inside: a body, a head, arms that go up
  float figure(vec2 p, float dance) {
    p.y -= 0.03 * abs(sin(dance)); // a hop
    float body = 1.0 - smoothstep(0.030, 0.042, length(vec2(p.x, max(abs(p.y) - 0.075, 0.0))));
    float head = 1.0 - smoothstep(0.026, 0.036, length(p - vec2(0.0, 0.145)));
    // arms: up and out, swinging
    float sway = 0.5 + 0.5 * sin(dance * 0.5);
    vec2 a = vec2(abs(p.x), p.y) - vec2(0.03, 0.06);
    vec2 dir = normalize(vec2(0.55 + 0.3 * sway, 0.5 + 0.5 * sway));
    float along = clamp(dot(a, dir), 0.0, 0.11);
    float arm = 1.0 - smoothstep(0.010, 0.018, length(a - dir * along));
    return max(body, max(head, arm));
  }
  void main() {
    // which face of the cell this is, and where on it (in cubic cells)
    vec3 an = abs(vLN);
    vec2 uv, size;
    if (an.x > an.y && an.x > an.z) { uv = vLocal.zy; size = vSize.zy; }
    else if (an.y > an.z) { uv = vLocal.xz; size = vSize.xz; }
    else { uv = vLocal.xy; size = vSize.xy; }
    vec2 p = uv * size; // -size/2 .. size/2
    vec2 edge = size * 0.5 - abs(p);
    float frame = 1.0 - smoothstep(0.035, 0.055, min(edge.x, edge.y));

    // its colour: all the way round the spectrum, at its own pace, from its
    // own place in it
    // Under way (uFlight) the cells stop keeping their own time: they fall in
    // with each other and the whole spectrum runs down the hull as one prism.
    float rate = 0.035 + 0.11 * fract(vSeed * 7.31);
    vec3 tintC = hue(vSeed * (1.0 - 0.8 * uFlight) + uTime * rate + uPhase + uFlight * vWorld.z * 0.0035);
    if (uGiven > 0.5 && abs(vSeed - uGivenSeed) < 1e-6) tintC = mix(uGivenA, uGivenB, 0.5 + 0.5 * sin(uTime * 0.9)) * 1.5 + 0.25;
    vec3 V = normalize(cameraPosition - vWorld);
    float facing = max(dot(normalize(vN), V), 0.0);
    // glass lit from inside: brightest in the middle of the pane
    float glow = 0.55 + 0.45 * (1.0 - smoothstep(0.0, 0.7, length(p / size) * 2.0));
    float beat = 0.86 + 0.14 * sin(uTime * (1.6 + fract(vSeed * 3.7) * 2.0) + vSeed * 40.0);
    vec3 col = tintC * glow * beat * 0.95 + vec3(1.0) * 0.10 * glow;

    // --- the room behind the glass: the eye's slant across the pane moves what
    // is deep in it, so every cell has a back wall and a floor to look into ---
    vec3 dp1 = dFdx(vWorld), dp2 = dFdy(vWorld);
    vec2 du1 = dFdx(p), du2 = dFdy(p);
    vec3 T = normalize(dp1 * du2.y - dp2 * du1.y + 1e-6), B = normalize(dp2 * du1.x - dp1 * du2.x + 1e-6);
    vec2 slant = vec2(dot(V, T), dot(V, B)) / max(facing, 0.25);
    vec2 pb = p - slant * 0.42; // where the sight line meets the back wall
    vec2 eb = size * 0.5 - abs(pb);
    float inBack = step(0.0, min(eb.x, eb.y));
    // the back wall: panels, a lit doorway in some, shelves of light in others
    vec2 wg = pb * 3.0;
    float panel = smoothstep(0.03, 0.06, min(fract(wg.x), fract(wg.y)));
    float door = step(0.62, fract(vSeed * 13.7)) * step(abs(pb.x - (fract(vSeed * 5.1) - 0.5) * size.x * 0.5), 0.09) * step(pb.y, -size.y * 0.5 + 0.34);
    vec3 back = tintC * (0.30 + 0.16 * panel) + vec3(1.0, 0.95, 0.85) * door * 0.9;
    // side walls, floor and ceiling, where the sight line leaves the back wall's frame: darker, ruled
    float along = clamp(min(edge.x, edge.y) / (abs(min(eb.x, eb.y)) + min(edge.x, edge.y) + 1e-4), 0.0, 1.0);
    vec3 sideW = tintC * (0.50 - 0.28 * along) * (0.85 + 0.15 * step(0.5, fract(along * 5.0)));
    vec3 room = mix(sideW, back, inBack);
    col = mix(room, col, 0.42); // the glass keeps its own glow over the room

    // the life in it: a few figures to a cubic cell, each on its own beat,
    // standing a little way back from the glass
    p = p - slant * 0.14;
    float people = 0.0;
    vec2 g = p / 0.34;
    vec2 gc = floor(g + 0.5);
    float who = fract(sin(dot(gc + vSeed * 31.0, vec2(12.99, 78.23))) * 43758.5);
    if (who > 0.25 && abs(p.y + 0.12) < 0.30) {
      vec2 fp = vec2((g.x - gc.x) * 0.34, p.y + 0.16 - (who - 0.6) * 0.06);
      people = figure(fp, uTime * (4.0 + who * 3.0) + who * 30.0);
    }
    // silhouettes against the light, with a rim of it round them
    col = mix(col, tintC * 0.10 + vec3(0.02), people * 0.86);
    // motes of light drifting up through it
    vec2 mg = vec2(p.x * 9.0, p.y * 9.0 - uTime * (0.5 + who));
    float mote = step(0.93, fract(sin(dot(floor(mg) + vSeed * 9.0, vec2(41.3, 17.7))) * 9731.1)) * (1.0 - smoothstep(0.1, 0.4, length(fract(mg) - 0.5)));
    col += vec3(1.0, 0.98, 0.9) * mote * 0.7 * (1.0 - people);

    // the frame it is held in, and the shine on the glass
    col = mix(col, vec3(0.05, 0.06, 0.08) + tintC * 0.06, frame);
    // lights set into the frame, every so often along it
    vec2 q = uv * size;
    float along2 = edge.x < edge.y ? q.y : q.x;
    col += vec3(1.0, 0.86, 0.6) * frame * smoothstep(0.42, 0.5, abs(fract(along2 * 4.0) - 0.5) * 2.0 - 0.55) * 1.4;
    col += vec3(1.0) * pow(1.0 - facing, 3.0) * 0.30;
    col = mix(col * (1.0 + 0.2 * uFlight), vec3(1.7), uFlash);
    gl_FragColor = vec4(col, 1.0);
  }
`;

// The hangar's glass: a film of every colour over something nearly clear.
const GLASS_VERT = /* glsl */ `
  varying vec3 vWorld;
  varying vec3 vN;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vN = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;
const GLASS_FRAG = /* glsl */ `
  uniform float uTime;
  varying vec3 vWorld;
  varying vec3 vN;
  void main() {
    vec3 V = normalize(cameraPosition - vWorld);
    float facing = abs(dot(normalize(vN), V));
    float film = facing * 1.2 + vWorld.y * 0.004 + (vWorld.x + vWorld.z) * 0.0016 + uTime * 0.02;
    vec3 irid = 0.5 + 0.5 * cos(6.2832 * (film + vec3(0.0, 0.33, 0.67)));
    vec3 col = mix(vec3(0.70, 0.86, 1.0), irid, 0.7) * (0.55 + 0.6 * pow(1.0 - facing, 2.0));
    gl_FragColor = vec4(col, 0.34 + 0.4 * pow(1.0 - facing, 2.0));
  }
`;

// Builds it all into `group` (the city's). Returns { tick(t), cells, and the
// parts a flight moves }.
export function buildHangar(group) {
  const root = new THREE.Group();
  root.position.set(VESSEL.x, VESSEL.y, VESSEL.z);
  group.add(root);
  const r = rng(0xbea57);
  const dummy = new THREE.Object3D();
  const uniforms = { uTime: { value: 0 }, uFlight: { value: 0 }, uPhase: { value: 0 }, uFlash: { value: 0 },
    uGiven: { value: 0 }, uGivenSeed: { value: -1 }, uGivenA: { value: new THREE.Color(1, 1, 1) }, uGivenB: { value: new THREE.Color(1, 1, 1) },
  };
  // the vessel itself, apart from the yard it is built in: it can be moved
  const vessel = new THREE.Group();
  root.add(vessel);
  const yard = new THREE.Group();
  root.add(yard);
  const cellMat = new THREE.ShaderMaterial({ vertexShader: CELL_VERT, fragmentShader: CELL_FRAG, uniforms, fog: false });

  // --- the cells: a block NX deep, NY tall, NZ long, still being added to ---
  // Some are two cells long or two tall; the upper forward corner is not
  // built yet, so the block's edge there is ragged.
  const taken = new Uint8Array(NX * NY * NZ);
  const at = (x, y, z) => x + NX * (y + NY * z);
  const list = []; // [x, y, z, sx, sy, sz]
  const unbuilt = []; // the cells of the ragged corner that are not there yet
  for (let z = 0; z < NZ; z++) {
    for (let y = 0; y < NY; y++) {
      for (let x = 0; x < NX; x++) {
        if (taken[at(x, y, z)]) continue;
        // unbuilt: toward the top at the forward (+z) end
        const raw = (y / NY) * 0.9 + (z / NZ) * 0.9 - 1.15;
        if (raw > 0 && r() < raw * 2.2) {
          unbuilt.push([x, y, z]); // (finished a million years on: finishCorner())
          continue;
        }
        if ((y === NY - 1 || z === NZ - 1 || z === 0) && r() < 0.14) continue;
        let sz = 1, sy = 1;
        const roll = r();
        if (roll < 0.20 && z + 1 < NZ && !taken[at(x, y, z + 1)]) sz = 2;
        else if (roll < 0.30 && y + 1 < NY && !taken[at(x, y + 1, z)]) sy = 2;
        taken[at(x, y, z)] = 1;
        if (sz === 2) taken[at(x, y, z + 1)] = 1;
        if (sy === 2) taken[at(x, y + 1, z)] = 1;
        list.push([x, y, z, 1, sy, sz]);
      }
    }
  }
  const GAP = 1.6;
  const cells = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), cellMat, list.length);
  const seeds = new Float32Array(list.length);
  const BZ0 = -40; // the block's forward face, along the vessel
  list.forEach(([x, y, z, sx, sy, sz], i) => {
    dummy.position.set(
      (x + sx / 2 - NX / 2) * CELL,
      (y + sy / 2 - NY / 2) * CELL,
      BZ0 - (z + sz / 2) * CELL
    );
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(sx * CELL - GAP, sy * CELL - GAP, sz * CELL - GAP);
    dummy.updateMatrix();
    cells.setMatrixAt(i, dummy.matrix);
    seeds[i] = r();
  });
  cells.geometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1));
  // one cell on the gallery's side, amidships: the one that will change
  const gi = list.findIndex(([x, y, z, , sy, sz]) => x === NX - 1 && y === 4 && z >= 3 && sy === 1 && sz === 1);
  uniforms.uGivenSeed.value = seeds[gi >= 0 ? gi : 0];
  cells.frustumCulled = false;
  vessel.add(cells);

  // --- the bow: a bulb of hexagonal cells round the end of the spine ---
  const BOW_Z = 330;
  const hexN = 54;
  const hexes = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.5, 0.5, 1, 6), cellMat, hexN);
  const hseeds = new Float32Array(hexN);
  for (let i = 0; i < hexN; i++) {
    // rings of them round the axis, fattest amidships
    const ring = Math.floor(i / 9), k = i % 9;
    const zz = BOW_Z + (ring - 2.5) * 30;
    const rad = 44 + 34 * Math.sin(((ring + 0.5) / 6) * Math.PI);
    const a = (k / 9) * Math.PI * 2 + ring * 0.35;
    dummy.position.set(Math.cos(a) * rad, Math.sin(a) * rad, zz);
    // each one's axis points out from the spine
    dummy.rotation.set(0, 0, a - Math.PI / 2);
    dummy.scale.set(29, 26, 29);
    dummy.updateMatrix();
    hexes.setMatrixAt(i, dummy.matrix);
    hseeds[i] = r();
  }
  hexes.geometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(hseeds, 1));
  hexes.frustumCulled = false;
  vessel.add(hexes);

  // --- the structure: spine, drive, and the yard it floats over ---
  const lit = [], glow = [];
  const STEEL = 0x2a3038, DARK = 0x14181e, BRASS = 0x8a6a34;
  // the spine: four longerons from the block out to the bow, ringed every bay
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    lit.push(tint(box(5, 5, BOW_Z - BZ0 + 40, sx * 20, sy * 20, (BOW_Z + BZ0) / 2), STEEL));
  }
  for (let z = BZ0 + 10; z < BOW_Z + 30; z += 30) {
    lit.push(tint(box(48, 3, 3, 0, -20, z), DARK), tint(box(48, 3, 3, 0, 20, z), DARK));
    lit.push(tint(box(3, 48, 3, -20, 0, z), DARK), tint(box(3, 48, 3, 20, 0, z), DARK));
    glow.push(tint(box(2, 2, 2, 20, 20, z), 0x9fe8ff, 1.6));
  }
  // a core of light down the middle of it
  glow.push(tint(cyl(3.2, 3.2, BOW_Z - BZ0 + 20, 0, 0, 0, 10).rotateX(Math.PI / 2).translate(0, 0, (BOW_Z + BZ0) / 2), 0xfff0c8, 1.5));
  // the drive, aft of the block: a hub, a bell, and two great rings on spokes
  const AFT = BZ0 - NZ * CELL;
  const hubZ = AFT - 70;
  lit.push(tint(cyl(46, 60, 120, 0, 0, 0, 20).rotateX(Math.PI / 2).translate(0, 0, hubZ), STEEL));
  lit.push(tint(cyl(70, 44, 60, 0, 0, 0, 20).rotateX(Math.PI / 2).translate(0, 0, hubZ - 80), DARK));
  glow.push(tint(cyl(40, 40, 3, 0, 0, 0, 24).rotateX(Math.PI / 2).translate(0, 0, hubZ - 112), 0xffb060, 1.8));
  glow.push(tint(cyl(18, 18, 4, 0, 0, 0, 24).rotateX(Math.PI / 2).translate(0, 0, hubZ - 114), 0xfff4d8, 2.2));
  // (the two rings are their own meshes: they turn, opposite ways)
  const rings = [];
  for (const [rr, zz, tube] of [[168, hubZ + 10, 9], [128, hubZ - 44, 7]]) {
    const rl = [], rg = [];
    rl.push(tint(new THREE.TorusGeometry(rr, tube, 10, 64).translate(0, 0, zz), STEEL));
    rl.push(tint(new THREE.TorusGeometry(rr - tube * 2.2, tube * 0.45, 8, 64).translate(0, 0, zz), BRASS));
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + (rr > 150 ? 0 : 0.39);
      rl.push(tint(box(4, rr - 40, 4, 0, (rr + 40) / 2, zz).rotateZ(a), DARK));
      rg.push(tint(box(3, 3, 3, 0, rr, zz + tube + 1).rotateZ(a), 0x9fe8ff, 1.8));
      // lamps along each spoke, and vanes on the rim
      for (let k = 1; k <= 3; k++) rg.push(tint(box(1.6, 1.6, 1.6, 0, 40 + ((rr - 40) * k) / 4, zz + 3).rotateZ(a), 0xffe2a0, 1.5));
      rl.push(tint(box(14, 5, tube * 2.6, 0, rr + tube, zz).rotateZ(a + 0.2), DARK));
    }
    rings.push({ lit: rl, glow: rg, dir: rr > 150 ? 1 : -1 });
  }
  // running lights down the spine, and a blister of glass on the bow: the bridge
  for (let z = BZ0 + 25; z < BOW_Z; z += 30) {
    glow.push(tint(box(1.6, 1.6, 1.6, -20, 22.5, z), 0xff8a8a, 1.6), tint(box(1.6, 1.6, 1.6, 20, -22.5, z), 0x8affb0, 1.6));
  }
  lit.push(tint(cyl(24, 30, 6, 0, 91, BOW_Z + 10, 20), STEEL));
  glow.push(tint(new THREE.TorusGeometry(22, 0.7, 6, 40).rotateX(Math.PI / 2).translate(0, 94.5, BOW_Z + 10), 0xffe2a0, 1.6));
  const litMat = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x161a20 });
  const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false });
  const flatten = (list) => list.map((g) => (g.index ? g.toNonIndexed() : g));
  vessel.add(mergedMesh(flatten(lit), litMat));
  vessel.add(mergedMesh(flatten(glow), glowMat));
  lit.length = 0;
  glow.length = 0;
  const turning = rings.map((r) => {
    const g = new THREE.Group();
    g.add(mergedMesh(flatten(r.lit), litMat), mergedMesh(flatten(r.glow), glowMat));
    vessel.add(g);
    return { g, dir: r.dir };
  });
  // the blister's glass
  const blister = new THREE.Mesh(
    new THREE.SphereGeometry(22, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xbfe6ff, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide, fog: false })
  );
  blister.position.set(0, 94, BOW_Z + 10);
  blister.renderOrder = 3;
  vessel.add(blister);
  // the wake: light thrown out behind the drive when it is under way, every colour in turn down its length
  const wake = new THREE.Mesh(
    new THREE.CylinderGeometry(30, 150, 1, 24, 24, true).rotateX(Math.PI / 2).translate(0, 0, -0.5),
    new THREE.ShaderMaterial({
      uniforms,
      vertexShader: /* glsl */ `
        varying float vAlong;
        varying vec3 vN2;
        varying vec3 vW2;
        void main() {
          vAlong = -position.z;
          vec4 w = modelMatrix * vec4(position, 1.0);
          vW2 = w.xyz;
          vN2 = normalize(mat3(modelMatrix) * normal);
          gl_Position = projectionMatrix * viewMatrix * w;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime, uFlight, uPhase;
        varying float vAlong;
        varying vec3 vN2;
        varying vec3 vW2;
        void main() {
          vec3 c = clamp(abs(fract(vAlong * 1.6 - uTime * 0.9 + uPhase + vec3(0.0, 0.6667, 0.3333)) * 6.0 - 3.0) - 1.0, 0.0, 1.0);
          float rim = pow(1.0 - abs(dot(normalize(vN2), normalize(cameraPosition - vW2))), 1.5);
          float streak = 0.6 + 0.4 * sin(vAlong * 40.0 - uTime * 14.0);
          gl_FragColor = vec4((c * 0.9 + 0.25) * (1.0 - vAlong) * (1.0 - vAlong) * (0.35 + rim) * streak * uFlight * 1.4, 1.0);
        }
      `,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false,
    })
  );
  wake.position.set(0, 0, hubZ - 112);
  wake.scale.set(1, 1, 900);
  wake.frustumCulled = false;
  vessel.add(wake);
  // the yard below: a deck of plates with work going on along its lines
  const YARD_Y = -230;
  lit.push(tint(box(420, 10, 980, 0, YARD_Y - 5, -70), DARK));
  for (let z = -520; z <= 380; z += 60) glow.push(tint(box(400, 0.6, 1.4, 0, YARD_Y + 0.4, z), 0x7fd8ff, 1.1));
  for (let x = -180; x <= 180; x += 60) glow.push(tint(box(1.4, 0.6, 960, x, YARD_Y + 0.4, -70), 0xffd890, 1.0));
  for (let i = 0; i < 46; i++) {
    const bx = (r() - 0.5) * 380, bz = -70 + (r() - 0.5) * 920, bh = 6 + r() * 26;
    lit.push(tint(box(14 + r() * 30, bh, 14 + r() * 30, bx, YARD_Y + bh / 2, bz), r() < 0.5 ? STEEL : DARK));
  }
  // four gantries standing up from the yard to the hull, with lamps at their heads
  for (const [gx, gz] of [[-190, 200], [190, 200], [-190, -380], [190, -380]]) {
    lit.push(tint(box(8, 250, 8, gx, YARD_Y + 125, gz), STEEL));
    lit.push(tint(box(Math.abs(gx) - 80, 5, 5, gx * 0.72, YARD_Y + 246, gz), STEEL));
    glow.push(tint(box(6, 6, 6, gx, YARD_Y + 254, gz), 0xfff0c8, 2.0));
  }
  // the roof frame over it all
  const ROOF_Y = 300;
  for (const z of [-620, -320, -20, 280, 520]) lit.push(tint(box(700, 14, 22, 0, ROOF_Y, z), DARK));
  for (const x of [-340, 340]) lit.push(tint(box(22, 14, 1160, x, ROOF_Y, -50), DARK));
  for (let x = -280; x <= 280; x += 70) lit.push(tint(box(3, 3, 1150, x, ROOF_Y + 8, -50), STEEL));

  yard.add(mergedMesh(flatten(lit), litMat));
  yard.add(mergedMesh(flatten(glow), glowMat));

  // --- the hangar's glass: tall leaning blades down each side, from the yard
  // to the roof, the near row framing the view from the gallery ---
  const blades = [];
  for (const side of [-1, 1]) {
    for (let i = 0; i < 6; i++) {
      const z = -600 + i * 224 + (side > 0 ? 60 : 0);
      const g = new THREE.BoxGeometry(16, ROOF_Y - YARD_Y + 30, 58);
      g.rotateZ(side * 0.11).rotateY(0.25 * side);
      g.translate(side * 330, (ROOF_Y + YARD_Y) / 2, z);
      blades.push(g);
    }
  }
  const glass = mergedMesh(blades, new THREE.ShaderMaterial({
    vertexShader: GLASS_VERT, fragmentShader: GLASS_FRAG, uniforms,
    transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false,
  }));
  glass.renderOrder = 2;
  yard.add(glass);

  // --- a million years on (GDD 5.7.5): the ship went into the hole and came
  // back, about a thousand years older by its own clock, and on the way it
  // finished itself. The corner that was never built is there now, in cells
  // unlike any of the others: not rooms taken from the archive, but the first
  // thing the Tenretni imagined. Round ones. And the yard it stands in has had
  // a million years. Built the first time it is wanted. ---
  let corner = null;
  function finishCorner() {
    if (corner) return;
    const geo = new THREE.IcosahedronGeometry(0.5, 3);
    const cu = { uTime: uniforms.uTime };
    const mat = new THREE.ShaderMaterial({
      uniforms: cu, fog: false,
      vertexShader: /* glsl */ `
        attribute float aSeed;
        varying vec3 vL;
        varying vec3 vN;
        varying vec3 vW;
        varying float vSeed;
        void main() {
          vL = position;
          vSeed = aSeed;
          vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
          vW = w.xyz;
          vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
          gl_Position = projectionMatrix * viewMatrix * w;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        varying vec3 vL;
        varying vec3 vN;
        varying vec3 vW;
        varying float vSeed;
        void main() {
          vec3 v = normalize(cameraPosition - vW);
          float face = max(dot(normalize(vN), v), 0.0);
          // no rooms, no frames: colour that moves through it like weather
          vec3 q = vL * 5.0 + vSeed * 20.0;
          float f = sin(q.x + uTime * 0.4) + sin(q.y * 1.3 - uTime * 0.31 + sin(q.z + uTime * 0.2) * 1.5) + sin(q.z * 0.8 + uTime * 0.23);
          vec3 a = 0.5 + 0.5 * cos(6.2832 * (vSeed + f * 0.11 + vec3(0.0, 0.33, 0.67)));
          vec3 col = a * (0.55 + 0.6 * face) + vec3(1.0, 0.97, 0.9) * pow(1.0 - face, 2.5) * 0.9;
          gl_FragColor = vec4(col * 1.15, 1.0);
        }
      `,
    });
    const mesh = new THREE.InstancedMesh(geo, mat, unbuilt.length);
    const cs = new Float32Array(unbuilt.length);
    unbuilt.forEach(([x, y, z], i) => {
      dummy.position.set((x + 0.5 - NX / 2) * CELL, (y + 0.5 - NY / 2) * CELL, BZ0 - (z + 0.5) * CELL);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(CELL * (0.82 + 0.3 * ((i * 0.618) % 1)));
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      cs[i] = (i * 0.7548) % 1;
    });
    geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(cs, 1));
    mesh.frustumCulled = false;
    vessel.add(mesh);
    // the yard: sagging, and what has come down off the roof lying where it fell
    const fallen = [];
    let s = 0x0fa11e;
    const rr = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < 46; i++) {
      const g = new THREE.BoxGeometry(6 + rr() * 10, 5 + rr() * 8, 60 + rr() * 170);
      g.rotateY(rr() * Math.PI).rotateZ((rr() - 0.5) * 0.5);
      g.translate((rr() - 0.5) * 380, -226 + rr() * 8, -70 + (rr() - 0.5) * 900);
      fallen.push(tint(g, rr() < 0.4 ? 0x24402a : 0x2a2f33));
    }
    const debris = mergedMesh(fallen, new THREE.MeshLambertMaterial({ vertexColors: true }));
    debris.frustumCulled = false;
    root.add(debris);
    corner = { mesh, debris, count: unbuilt.length };
  }

  return {
    // a million years on: the corner finished, the yard fallen in (`on` false: as it was)
    era(on) {
      if (on) finishCorner();
      if (!corner) return;
      corner.mesh.visible = corner.debris.visible = on;
      yard.rotation.z = on ? 0.03 : 0;
      yard.position.y = on ? -9 : 0;
    },
    corner: () => (corner && corner.mesh.visible ? corner.count : 0),
    // the middle of that corner, in the root's frame (world/eramade.js starts from it)
    cornerAt: unbuilt.reduce((v, [x, y, z]) => v.add(new THREE.Vector3((x + 0.5 - NX / 2) * CELL, (y + 0.5 - NY / 2) * CELL, BZ0 - (z + 0.5) * CELL)), new THREE.Vector3()).divideScalar(Math.max(1, unbuilt.length)),
    cells: list.length + hexN,
    // for the flight (world/lightdemo.js): the hull, the yard round it, the
    // cells' uniforms, and where the helm is, in the vessel's own frame
    root, vessel, yard, uniforms, glowMat,
    helm: new THREE.Vector3(0, 96, BOW_Z + 10),
    tick(t) {
      uniforms.uTime.value = t;
      // the drive turns over slowly at rest, and hard under way
      const spin = t * 0.12 + uniforms.uPhase.value * 9.0;
      for (const r of turning) r.g.rotation.z = spin * r.dir;
      wake.visible = uniforms.uFlight.value > 0.01;
    },
  };
}
