// The hollow: the inside of the megaworld, a zone at a time (GDD 5.7.5).
//
// The megaworld is a shell about an astronomical unit across, and what it took
// from the worlds it ate is in here. The oceans are kept as separate globes
// the size of moons, each under a crust of its own ice, with a halo of mist
// where that meets the vacuum: one body of water this size would fall in on
// itself and light as a star. Between them is the dark, ice adrift in it, and
// the compute lattice running down through all of it like roots.
//
// The way down is too long to fly (light takes 8 min 19 s to the centre), so
// it is flown in pieces. A zone runs from one lattice node down to the next;
// at the lower node the lattice takes the vessel as a pulse and sets it down
// at the top of the zone below (world/submersible.js does the ride). A node
// will only take the vessel once what lives in its zone is in the log, so the
// log is whole by the time it is needed, at the centre.
//
//   zone 1   the outer oceans     drifters, painted swimmers; light eaters
//   zone 2   the creature zone    glass drifters, the veil, soft bodies,
//                                 callers; light eaters and heat leeches
//
// One zone is built at a time and the last one freed. Everything in a zone is
// placed from its seed, so it is the same every visit.

import * as THREE from 'three';
import { C } from '../src/constants.js';
import { lamp, LAMP_U, LAMP_GLSL } from '../src/lamp.js';
import { createLife } from './hollowlife.js';
import { BANDS, LIFE, DESCENT } from './entryzero-dialogue.js';

// kinds whose bands a zone's lower node asks for
const ZONES = {
  1: { len: () => C.EZ_ZONE1_LEN, seed: 0x10ce01, globes: 5, roof: true, asks: ['drifter', 'painted'], leeches: false },
  2: { len: () => C.EZ_ZONE2_LEN, seed: 0x10ce02, globes: 3, roof: false, asks: ['warm', 'line', 'boned', 'caller'], leeches: true },
};
export const LAST_ZONE = 2; // (the firewall is under it: not built yet)

const NOISE_GLSL = /* glsl */ `
  float h31(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
  float vnoise(vec3 p) {
    vec3 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(h31(i), h31(i + vec3(1, 0, 0)), f.x), mix(h31(i + vec3(0, 1, 0)), h31(i + vec3(1, 1, 0)), f.x), f.y),
               mix(mix(h31(i + vec3(0, 0, 1)), h31(i + vec3(1, 0, 1)), f.x), mix(h31(i + vec3(0, 1, 1)), h31(i + vec3(1, 1, 1)), f.x), f.y), f.z);
  }
`;

// An ocean globe: one instanced sphere, the crust from outside and the
// underside of the ice from within.
const GLOBE_VERT = /* glsl */ `
  attribute float aSeed;
  varying vec3 vW;
  varying vec3 vN;
  varying vec3 vL;
  varying float vSeed;
  void main() {
    vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
    vW = w.xyz;
    vL = position;
    vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
    vSeed = aSeed;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;
const GLOBE_FRAG = /* glsl */ `
  ${LAMP_GLSL}
  ${NOISE_GLSL}
  uniform float uTime;
  varying vec3 vW;
  varying vec3 vN;
  varying vec3 vL;
  varying float vSeed;
  void main() {
    vec3 n = normalize(vL);
    vec3 q = n * 5.0 + vSeed * 31.0;
    float plates = vnoise(q) * 0.6 + vnoise(q * 2.7) * 0.4;
    // cracks: where two plates of the crust meet
    float crack = 1.0 - smoothstep(0.0, 0.035, abs(vnoise(q * 1.6 + 7.0) - 0.5));
    float albedo = 0.45 + 0.4 * plates;
    float beam = lampBeam(vW) * uLampOn * uLampLit;
    vec3 v = normalize(cameraPosition - vW);
    float face = abs(dot(normalize(vN), v));
    vec3 col;
    if (gl_FrontFacing) {
      // from the dark: ice. It gives back whatever is shone on it, and the sea
      // under it shows faintly through the cracks
      col = albedo * uLampTint * beam * 0.6;
      col += vec3(0.01, 0.09, 0.12) * crack * (0.5 + 0.5 * sin(uTime * 0.4 + vSeed * 20.0));
      col += vec3(0.012, 0.02, 0.03) * pow(1.0 - face, 3.0); // the limb, against nothing
      // infrared: liquid water is far warmer than the vacuum round it
      col += vec3(0.9, 0.3, 0.08) * (0.12 + 0.5 * crack) * lampSeen(2.0, vW);
    } else {
      // from inside: the underside of the crust, and the dark water going up to it
      col = vec3(0.0, 0.012, 0.02) + albedo * uLampTint * beam * 0.45;
      col += vec3(0.02, 0.2, 0.24) * crack * 0.25 * lampSeen(0.0, vW);
    }
    // X-ray: ice is thin to it; only how thick the crust is shows
    col = mix(col, vec3(0.8, 0.86, 1.0) * plates * 0.5 * lampBeam(vW), lampBand(4.0) * (1.0 - uAll) * uLampLit);
    gl_FragColor = vec4(col, 1.0);
  }
`;
// ...and the mist where the crust meets vacuum: a shell a little bigger, seen
// edge-on, and brightest where the beam goes through it.
const MIST_FRAG = /* glsl */ `
  ${LAMP_GLSL}
  varying vec3 vW;
  varying vec3 vN;
  varying vec3 vL;
  varying float vSeed;
  void main() {
    vec3 v = normalize(cameraPosition - vW);
    float edge = pow(1.0 - abs(dot(normalize(vN), v)), 2.5);
    float beam = lampBeam(vW) * uLampOn * uLampLit;
    gl_FragColor = vec4((vec3(0.02, 0.035, 0.05) + uLampTint * beam * 0.5) * edge, 1.0);
  }
`;

// The lattice: tubes of light that wander down from one node to the next.
const ROOT_VERT = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vW;
  void main() {
    vUv = uv;
    vec4 w = modelMatrix * vec4(position, 1.0);
    vW = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;
const ROOT_FRAG = /* glsl */ `
  ${LAMP_GLSL}
  uniform float uTime;
  uniform float uLive; // 0: dark below this node
  varying vec2 vUv;
  varying vec3 vW;
  void main() {
    // packets going down it
    float run = pow(0.5 + 0.5 * sin(vUv.x * 90.0 - uTime * 2.4), 8.0);
    vec3 col = vec3(0.04, 0.55, 0.7) * (0.22 + 1.5 * run) * uLive + vec3(0.01, 0.03, 0.04);
    // warm: in infrared it is the brightest thing there is
    col += vec3(1.0, 0.42, 0.14) * lampSeen(2.0, vW) * (0.4 + 0.6 * uLive);
    gl_FragColor = vec4(col, 1.0);
  }
`;

// Ice adrift: one instanced shard, wrapped round the vessel in the shader.
const SHARD_VERT = /* glsl */ `
  ${LAMP_GLSL}
  attribute vec3 aOff;
  attribute vec4 aSpin; // an axis, and how big
  uniform vec3 uAt;
  uniform float uBox;
  uniform float uTime;
  varying vec3 vCol;
  mat3 rot(vec3 a, float t) {
    float c = cos(t), s = sin(t), k = 1.0 - c;
    return mat3(a.x * a.x * k + c, a.x * a.y * k + a.z * s, a.x * a.z * k - a.y * s,
                a.x * a.y * k - a.z * s, a.y * a.y * k + c, a.y * a.z * k + a.x * s,
                a.x * a.z * k + a.y * s, a.y * a.z * k - a.x * s, a.z * a.z * k + c);
  }
  void main() {
    vec3 c = aOff * uBox;
    c = mod(c - uAt + 0.5 * uBox, uBox) - 0.5 * uBox + uAt;
    vec3 axis = normalize(aSpin.xyz);
    mat3 r = rot(axis, uTime * 0.25 * (0.4 + aSpin.w) + aOff.x * 40.0);
    vec3 p = c + r * (position * (2.0 + 9.0 * aSpin.w));
    vec3 n = r * normal;
    float edge = 1.0 - smoothstep(0.4 * uBox, 0.5 * uBox, distance(c, uAt));
    float beam = lampBeam(p) * uLampOn * uLampLit;
    // a facet toward the lamp flashes
    float glint = pow(max(dot(n, normalize(uLampPos - p)), 0.0), 3.0);
    vCol = (uLampTint * beam * (0.25 + 1.6 * glint) + vec3(0.006, 0.01, 0.014)) * edge;
    gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  }
`;
const SHARD_FRAG = /* glsl */ `
  varying vec3 vCol;
  void main() { gl_FragColor = vec4(vCol, 1.0); }
`;

// The shell's inner face, over the first zone: strata, newest at the top.
const ROOF_FRAG = /* glsl */ `
  ${NOISE_GLSL}
  uniform float uTime;
  varying vec2 vUv;
  varying vec3 vW;
  void main() {
    float r = length(vW.xz);
    float ring = fract(r / 260.0 + 0.2 * vnoise(vec3(vW.xz * 0.002, 0.0)));
    float layer = floor(r / 260.0);
    vec3 col = vec3(0.012, 0.014, 0.017) * (0.5 + h31(vec3(layer, 1.0, 2.0))) * smoothstep(0.0, 0.06, ring);
    // the lattice comes through it here, and spreads
    float a = atan(vW.z, vW.x);
    float vein = 1.0 - smoothstep(0.0, 0.02 + 30.0 / max(r, 60.0) * 0.02, abs(sin(a * 6.0 + 0.4 * sin(r * 0.004))));
    col += vec3(0.03, 0.4, 0.5) * vein * (0.5 + 0.5 * sin(r * 0.02 - uTime * 1.5)) * exp(-r / 2600.0);
    gl_FragColor = vec4(col * (1.0 - smoothstep(5200.0, 7000.0, r)), 1.0);
  }
`;

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

// k: { group, time, tier, chapter, speak(pair, sec), say(text, sec), chime() }
export function createHollow(k) {
  const root = new THREE.Group();
  root.visible = false;
  k.group.add(root);
  const shardAt = { value: new THREE.Vector3() };
  let zone = 0;
  let cfg = null;
  let life = null;
  let made = []; // meshes of the zone that is built
  const globes = []; // { c: Vector3, r }
  const entry = new THREE.Vector3(), exit = new THREE.Vector3();
  const rootU = { ...LAMP_U, uTime: k.time, uLive: { value: 1 } };
  const lowerU = { ...LAMP_U, uTime: k.time, uLive: { value: 1 } }; // the last stretch, past the lower node
  let exitMat = null;
  let u = 0, said = -1, saidWater = false, askT = 0;
  let saidEaters = false, hintEaters = false, drinkT = 0;
  let saidCold = false, hintCold = false, runCold = false, tempSaid = 0;
  let inWater = false;
  const _v = new THREE.Vector3();

  const add = (m) => {
    m.frustumCulled = false;
    root.add(m);
    made.push(m);
    return m;
  };
  function free() {
    if (life) life.dispose();
    life = null;
    for (const m of made) {
      root.remove(m);
      m.geometry.dispose();
      m.material.dispose();
    }
    made = [];
    globes.length = 0;
  }

  function build(z) {
    free();
    zone = z;
    cfg = ZONES[z];
    const rnd = rng(cfg.seed);
    const len = cfg.len();
    entry.set(0, 0, 0);
    exit.set((rnd() - 0.5) * 900, -len, (rnd() - 0.5) * 900);

    // --- the globes: down the way, off to one side or another of it ---
    const gN = cfg.globes;
    const gGeo = new THREE.IcosahedronGeometry(1, 5);
    const gSeed = new Float32Array(gN);
    const gMat = new THREE.ShaderMaterial({ uniforms: { ...LAMP_U, uTime: k.time }, vertexShader: GLOBE_VERT, fragmentShader: GLOBE_FRAG, side: THREE.DoubleSide, fog: false });
    const gMesh = new THREE.InstancedMesh(gGeo, gMat, gN);
    const mGeo = new THREE.IcosahedronGeometry(1, 4);
    const mMesh = new THREE.InstancedMesh(mGeo, new THREE.ShaderMaterial({ uniforms: LAMP_U, vertexShader: GLOBE_VERT, fragmentShader: MIST_FRAG, side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }), gN);
    const m4 = new THREE.Matrix4(), q0 = new THREE.Quaternion(), sc = new THREE.Vector3();
    for (let i = 0; i < gN; i++) {
      const f = (i + 0.7) / (gN + 0.4);
      const r = 380 + 420 * rnd();
      const a = rnd() * Math.PI * 2;
      // the first one is close to the way, so nobody misses that these can be entered
      const off = i === 0 ? r * 0.75 : r + 250 + 900 * rnd();
      const c = new THREE.Vector3().lerpVectors(entry, exit, f);
      c.x += Math.cos(a) * off;
      c.z += Math.sin(a) * off;
      globes.push({ c, r });
      gMesh.setMatrixAt(i, m4.compose(c, q0, sc.setScalar(r)));
      mMesh.setMatrixAt(i, m4.compose(c, q0, sc.setScalar(r * 1.09)));
      gSeed[i] = rnd();
    }
    gGeo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(gSeed, 1));
    mGeo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(gSeed, 1));
    add(gMesh);
    mMesh.renderOrder = 3;
    add(mMesh);

    // --- the lattice: three roots from node to node, bending round the globes ---
    const tubes = [];
    for (let j = 0; j < 3; j++) {
      const pts = [entry.clone().setY(entry.y + (cfg.roof ? 520 : 900))];
      pts.push(entry.clone());
      const steps = 7;
      for (let s = 1; s < steps; s++) {
        const p = new THREE.Vector3().lerpVectors(entry, exit, s / steps);
        const a = j * 2.1 + s * 0.9 + rnd() * 0.6;
        const w = 90 + 170 * rnd();
        p.x += Math.cos(a) * w;
        p.z += Math.sin(a) * w;
        // pushed out of any globe it would have gone through
        for (const g of globes) {
          const d = p.distanceTo(g.c);
          if (d < g.r + 60) p.sub(g.c).multiplyScalar((g.r + 60) / Math.max(d, 1)).add(g.c);
        }
        pts.push(p);
      }
      pts.push(exit.clone());
      tubes.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 220, 5 - j, 6, false));
    }
    for (const g of tubes) add(new THREE.Mesh(g, new THREE.ShaderMaterial({ uniforms: rootU, vertexShader: ROOT_VERT, fragmentShader: ROOT_FRAG, fog: false })));
    // ...and on down from the lower node, toward the zone below
    const below = new THREE.CatmullRomCurve3([exit.clone(), exit.clone().add(new THREE.Vector3(120, -700, -90)), exit.clone().add(new THREE.Vector3(-60, -1700, 140))]);
    lowerU.uLive.value = z < LAST_ZONE ? 1 : 0;
    add(new THREE.Mesh(new THREE.TubeGeometry(below, 60, 5, 6, false), new THREE.ShaderMaterial({ uniforms: lowerU, vertexShader: ROOT_VERT, fragmentShader: ROOT_FRAG, fog: false })));

    // --- the two nodes ---
    const knot = new THREE.IcosahedronGeometry(26, 1);
    const upper = add(new THREE.Mesh(knot, new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 1.6, 1.9), wireframe: true, fog: false })));
    upper.position.copy(entry);
    exitMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.8, 1.0, 0.3), wireframe: true, fog: false });
    const lower = add(new THREE.Mesh(knot.clone(), exitMat));
    lower.position.copy(exit);
    upper.userData.spin = lower.userData.spin = true;

    // --- ice adrift ---
    const sN = k.tier.shards;
    const sGeo = new THREE.TetrahedronGeometry(1, 0);
    const off = new Float32Array(sN * 3), spin = new Float32Array(sN * 4);
    for (let i = 0; i < sN; i++) {
      off[i * 3] = rnd();
      off[i * 3 + 1] = rnd();
      off[i * 3 + 2] = rnd();
      spin[i * 4] = rnd() - 0.5;
      spin[i * 4 + 1] = rnd() - 0.5;
      spin[i * 4 + 2] = rnd() - 0.5 + 0.01;
      spin[i * 4 + 3] = rnd() * rnd();
    }
    sGeo.setAttribute('aOff', new THREE.InstancedBufferAttribute(off, 3));
    sGeo.setAttribute('aSpin', new THREE.InstancedBufferAttribute(spin, 4));
    add(new THREE.InstancedMesh(sGeo, new THREE.ShaderMaterial({ uniforms: { ...LAMP_U, uAt: shardAt, uBox: { value: 1500 }, uTime: k.time }, vertexShader: SHARD_VERT, fragmentShader: SHARD_FRAG, fog: false }), sN));

    // --- the shell's inner face, where the well came through it ---
    if (cfg.roof) {
      const roof = add(new THREE.Mesh(new THREE.CircleGeometry(7000, 72).rotateX(Math.PI / 2), new THREE.ShaderMaterial({ uniforms: { uTime: k.time }, vertexShader: ROOT_VERT, fragmentShader: ROOF_FRAG, fog: false })));
      roof.position.y = 520;
    }

    // --- what lives here ---
    const schools = [], callers = [], eaterAt = [], leechAt = [];
    const mid = (f, side, a) => {
      const p = new THREE.Vector3().lerpVectors(entry, exit, f);
      p.x += Math.cos(a) * side;
      p.z += Math.sin(a) * side;
      return p;
    };
    if (z === 1) {
      // in the water: drifters in the first globes, painted swimmers in the later ones
      for (let i = 0; i < gN; i++) {
        const g = globes[i];
        const at = g.c.clone().add(new THREE.Vector3((rnd() - 0.5) * g.r * 0.5, (rnd() - 0.5) * g.r * 0.5, (rnd() - 0.5) * g.r * 0.5));
        schools.push(i % 2 === 0 ? { kind: 'drifter', at, range: g.r * 0.42, size: 5 } : { kind: 'painted', at, range: g.r * 0.4, size: 6 });
      }
      eaterAt.push(mid(0.45, 380, 1.0), mid(0.8, 300, 4.0));
    } else {
      // in the dark: heat with nothing round it, and the veil
      schools.push({ kind: 'warm', at: mid(0.16, 260, 0.7), range: 150, size: 9 });
      schools.push({ kind: 'warm', at: mid(0.62, 340, 3.6), range: 170, size: 10 });
      schools.push({ kind: 'line', at: mid(0.4, 520, 2.2), range: 260, size: 110 });
      // in the water: the ones with something inside them
      for (let i = 0; i < gN; i++) schools.push({ kind: 'boned', at: globes[i].c.clone(), range: globes[i].r * 0.45, size: 8 });
      // a long way off, in no direction the lattice goes
      callers.push(mid(0.3, 3400, 5.2), mid(0.75, 3800, 1.4).setY(-len * 0.75 - 1500));
      eaterAt.push(mid(0.3, 300, 4.4), mid(0.88, 320, 0.3));
      leechAt.push(mid(0.25, 420, 2.9), mid(0.55, 380, 5.8), mid(0.8, 440, 1.2));
    }
    life = createLife({ group: root, time: k.time, tier: k.tier, schools, callers, eaters: eaterAt, leeches: cfg.leeches ? leechAt : [], seed: cfg.seed + 17 });
    u = 0;
    said = k.chapter.ez.node() > z || life.groups.every((g) => k.chapter.ez.logged(g.band)) ? 99 : -1; // (been through here before: nothing to say)
    askT = 0;
  }

  // the bands this zone's lower node still wants, as labels (or '' for none)
  function missing() {
    let out = '';
    for (const kind of cfg.asks) {
      const b = BANDS.findIndex((x) => x.id === LIFE[kind].band);
      if (!k.chapter.ez.logged(b)) out += (out ? ', ' : '') + BANDS[b].label;
    }
    return out;
  }

  return {
    // Build zone `z` and put the vessel at its upper node. Returns false if there is no such zone.
    enter(z, at) {
      if (!ZONES[z]) return false;
      build(z);
      root.visible = true;
      at.copy(entry);
      at.y -= 80;
      saidWater = k.chapter.reached('ez_descent') && k.chapter.ez.node() > 1;
      return true;
    },
    leave() {
      root.visible = false;
      free();
      zone = 0;
    },
    zone: () => zone,
    upper: entry,
    // what the vessel is in, there
    medium(at) {
      for (let i = 0; i < globes.length; i++) if (at.distanceTo(globes[i].c) < globes[i].r) return 'water';
      return 'void';
    },
    // Keep it near the way down (it slides along the limit).
    bound(at, vel) {
      const len = cfg.len();
      const f = Math.min(1, Math.max(0, -at.y / len));
      const ax = exit.x * f, az = exit.z * f;
      const dx = at.x - ax, dz = at.z - az, d = Math.hypot(dx, dz);
      if (d > C.EZ_ZONE_WIDE) {
        const kx = dx / d, kz = dz / d;
        const out = vel.x * kx + vel.z * kz;
        if (out > 0) {
          vel.x -= kx * out;
          vel.z -= kz * out;
        }
        at.x = ax + kx * C.EZ_ZONE_WIDE;
        at.z = az + kz * C.EZ_ZONE_WIDE;
      }
      const top = cfg.roof ? 470 : 800;
      if (at.y > top) {
        at.y = top;
        if (vel.y > 0) vel.y = 0;
      }
      if (at.y < -len - 500) {
        at.y = -len - 500;
        if (vel.y < 0) vel.y = 0;
      }
    },
    // Once a frame. Returns 'ride' when the lower node takes the vessel.
    tick(dt, t, at, speed) {
      shardAt.value.copy(at);
      for (const m of made) if (m.userData.spin) m.rotation.set(t * 0.3, t * 0.41, 0);
      const water = lamp.medium === 'water';
      if (water && !inWater && !saidWater) {
        saidWater = true;
        k.speak(DESCENT.water);
      }
      inWater = water;
      life.step(dt, t, at, speed);

      // --- the log ---
      for (const g of life.groups) {
        if (k.chapter.ez.logged(g.band)) continue;
        g.hold = life.shows(g) ? g.hold + dt : 0;
        if (g.hold >= C.EZ_LOOK_TIME && k.chapter.ez.log(g.band)) {
          k.chime();
          k.say(DESCENT.logged.replace('{what}', LIFE[g.kind].what), 8);
        }
      }

      // --- what is said: arriving, and the first time each thing goes wrong ---
      u += dt;
      const lines = DESCENT.zone[zone] || [];
      while (said + 1 < lines.length && u >= lines[said + 1][0]) {
        said++;
        k.speak([lines[said][1], lines[said][2]], 6.5);
      }
      const dr = life.drinking();
      if (dr > 0.5) {
        drinkT += dt;
        if (!saidEaters) {
          saidEaters = true;
          k.speak(DESCENT.eaters);
        } else if (!hintEaters && drinkT > 14) {
          hintEaters = true;
          k.speak(DESCENT.eatersHint);
        }
      }
      if (life.attached()) {
        if (!saidCold && lamp.cabin < 0.9) {
          saidCold = true;
          k.speak(DESCENT.cold);
        } else if (!hintCold && lamp.cabin < 0.78) {
          hintCold = true;
          k.speak(DESCENT.coldHint);
        } else if (!runCold && lamp.cabin < 0.62) {
          runCold = true;
          k.speak(DESCENT.coldRun);
        }
      }
      const q = Math.floor((1 - lamp.cabin) * 4);
      if (q > tempSaid && q < 4) {
        tempSaid = q;
        k.speak([DESCENT.temp[0], DESCENT.temp[1].replace('{n}', String(Math.round(21 - 28 * (1 - lamp.cabin))))], 4);
      } else if (lamp.cabin > 0.98) tempSaid = 0;

      // --- the nodes: the upper one feeds the lamp, the lower one is the way on ---
      if (at.distanceTo(entry) < C.EZ_NODE_R * 2) lamp.energy = Math.min(1, lamp.energy + C.EZ_NODE_CHARGE * dt);
      const need = missing();
      const open = !need && zone < LAST_ZONE;
      exitMat.color.setRGB(open ? 0.5 : 1.8, open ? 1.6 : need ? 1.0 : 0.25, open ? 1.9 : need ? 0.3 : 0.2);
      rootU.uLive.value = 1;
      askT = Math.max(0, askT - dt);
      if (at.distanceTo(exit) < C.EZ_NODE_R) {
        lamp.energy = Math.min(1, lamp.energy + C.EZ_NODE_CHARGE * dt);
        if (open) return 'ride';
        if (askT <= 0) {
          askT = 14;
          k.speak(need ? [DESCENT.need[0], DESCENT.need[1].replace('{bands}', need)] : DESCENT.dark, 7);
        }
      }
      return null;
    },
    radioNear: () => (life ? life.radioNear() : 0),
    info: () => (zone ? {
      zone, entry: entry.toArray().map(Math.round), exit: exit.toArray().map(Math.round),
      globes: globes.map((g) => ({ c: g.c.toArray().map(Math.round), r: Math.round(g.r) })),
      need: missing(), life: life.info(), meshes: made.length,
    } : null),
  };
}
