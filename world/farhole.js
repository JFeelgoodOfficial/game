// The black hole over the Tenretni megaworld, and the time-streams that rise to
// it (src/farside.js; GDD 5.7.3). The machine world is here to mine it.
//
// It is a sky object. The whole group is re-centred on the camera every frame,
// so the hole keeps one direction in the sky with no parallax, and nothing in
// it ever has to be sorted against the world by a depth buffer that could not
// do it at this range: it is simply behind everything.
//
//   shadow    a black disc drawn straight after the starfield and before every
//             other transparent thing: it paints the stars out (at this range
//             the depth buffer cannot tell it from them), and it is still
//             depth-tested, so anything nearer stands in front of it
//   light     one additive quad: disc, lensed arc, photon ring, glow
//             (src/shaders/farHole.frag)
//   tethers   streaks of fire from the hole's lower rim down to the world all
//             along the horizon, one merged mesh: what the megaworld draws out
//   wisps     gas off the ends of the disc, looping down either side, another
//             (both: ribbonGeometry below, src/shaders/farStream.frag)
//   galaxies  a handful of spirals in the far sky, one mesh: this is not the
//             sky the pilot left
//
// And the mining itself, which is not sky: the conduits (conduit(), below;
// src/shaders/farConduit.vert/.frag). Each is a tube of iridescent glass from
// a collector on a cage, fixed in the world, up and over into the disc, with
// gold light falling down the inside of it.
//
// The game's screen-space lens pass is not used: it assumes a hole a few
// degrees across, blacks out whatever is drawn in front of it, and switches
// off when the centre leaves the view, with the disc still on screen.

import * as THREE from 'three';
import { C } from '../src/constants.js';
import commonVert from '../src/shaders/tenretni.vert?raw';
import holeFrag from '../src/shaders/farHole.frag?raw';
import streamFrag from '../src/shaders/farStream.frag?raw';
import conduitVert from '../src/shaders/farConduit.vert?raw';
import conduitFrag from '../src/shaders/farConduit.frag?raw';

const STREAM_VERT = /* glsl */ `
  attribute float aSeed;
  uniform vec3 uDir;
  varying vec2 vUv;
  varying float vSeed;
  varying float vAng; // angle from the hole's centre, rad
  void main() {
    vUv = uv;
    vSeed = aSeed;
    vAng = acos(clamp(dot(normalize(position), uDir), -1.0, 1.0));
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// A spiral galaxy on a quad: two arms wound on a log spiral, a warm core, and
// the disc seen at whatever tilt the quad is at.
const GALAXY_VERT = /* glsl */ `
  attribute float aSeed;
  varying vec2 vUv;
  varying float vSeed;
  void main() {
    vUv = uv;
    vSeed = aSeed;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const GALAXY_FRAG = /* glsl */ `
  varying vec2 vUv;
  varying float vSeed;
  uniform float uFade;
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
    vec2 q = vUv * 2.0 - 1.0;
    float r = length(q);
    if (r > 1.0) discard;
    float a = atan(q.y, q.x);
    // two arms: brightness where the angle matches the spiral's winding
    float wind = a * 2.0 - log(r + 0.04) * (3.6 + vSeed * 2.0) + vSeed * 20.0;
    float arms = pow(0.5 + 0.5 * cos(wind), 2.2);
    float dust = 0.55 + 0.45 * vnoise(q * 9.0 + vSeed * 30.0);
    float disc = exp(-r * 3.4) * (0.25 + 0.95 * arms * dust);
    float core = exp(-r * 13.0);
    vec3 armCol = mix(vec3(0.62, 0.70, 1.0), vec3(1.0, 0.80, 0.66), step(0.5, vSeed));
    vec3 col = armCol * disc * 0.75 + vec3(1.0, 0.90, 0.72) * core * 1.1;
    gl_FragColor = vec4(col * (1.0 - smoothstep(0.8, 1.0, r)) * uFade, 1.0);
  }
`;

// The hole's direction in the sky: up and a little to starboard of the heading
// the pilot arrives on (-z).
export function holeDirection(out) {
  const e = C.FAR_HOLE_ELEV, a = C.FAR_HOLE_AZ;
  return out.set(Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e));
}

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Ribbons in the sky group's frame (the camera is always at its origin, so
// "facing the camera" is a constant and is baked in: a ribbon's width runs
// across the line of sight). Each spec is a curve from a foot to a top through
// a bowed middle, with a width at each end and a wander:
//   { foot, mid, top: Vector3, w0, w1, wave: amplitude, turns, seed }
function ribbonGeometry(specs) {
  const SEG = 56;
  const pos = [], uv = [], seed = [], idx = [];
  const q = new THREE.Vector3(), tan = new THREE.Vector3(), side = new THREE.Vector3();
  for (const sp of specs) {
    const at = (t, out) => {
      const a = (1 - t) * (1 - t), b = 2 * t * (1 - t), c = t * t;
      out.set(a * sp.foot.x + b * sp.mid.x + c * sp.top.x, a * sp.foot.y + b * sp.mid.y + c * sp.top.y, a * sp.foot.z + b * sp.mid.z + c * sp.top.z);
      return out;
    };
    // the wander is sideways across the line of sight, and dies at both ends
    const sway = (t) => Math.sin(t * Math.PI * 2 * sp.turns + sp.seed * 40) * sp.wave * Math.sin(t * Math.PI);
    const pt = (t, out) => {
      at(t, out);
      at(Math.min(t + 0.01, 1), q);
      tan.subVectors(q, out);
      side.crossVectors(tan, out).normalize();
      return out.addScaledVector(side, sway(t));
    };
    const first = pos.length / 3;
    const a0 = new THREE.Vector3(), a1 = new THREE.Vector3();
    for (let k = 0; k <= SEG; k++) {
      const t = k / SEG;
      pt(t, a0);
      pt(Math.min(t + 0.012, 1), a1);
      tan.subVectors(a1, a0);
      if (tan.lengthSq() < 1e-6) tan.subVectors(a0, pt(t - 0.012, a1));
      side.crossVectors(tan, a0).normalize();
      const w = sp.w0 + (sp.w1 - sp.w0) * t;
      pos.push(a0.x - side.x * w, a0.y - side.y * w, a0.z - side.z * w, a0.x + side.x * w, a0.y + side.y * w, a0.z + side.z * w);
      uv.push(0, t, 1, t);
      seed.push(sp.seed, sp.seed);
      if (k < SEG) {
        const o = first + k * 2;
        idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('aSeed', new THREE.Float32BufferAttribute(seed, 1));
  geo.setIndex(idx);
  return geo;
}

// The tethers: streaks of fire from the lower rim of the hole, fanning down
// to the world all along the horizon under it. Their feet are farther off than
// the horizon ever is, so the ground hides them where the world's own curve
// says it should.
function tetherSpecs(dir) {
  const r = rng(0x71e5);
  const N = C.FAR_STREAMS;
  const holeAz = Math.atan2(dir.x, -dir.z);
  const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
  const up = new THREE.Vector3().crossVectors(right, dir).normalize();
  const D = C.FAR_HOLE_DIST;
  const rs = Math.tan(C.FAR_HOLE_SIZE) * D;
  const specs = [];
  for (let i = 0; i < N; i++) {
    const f = (i + 0.5) / N - 0.5; // -0.5 port .. 0.5 starboard
    // each leaves the rim at its own place round the lower half...
    const ra = -Math.PI / 2 + f * 2.5 + (r() - 0.5) * 0.1;
    const top = dir.clone().multiplyScalar(D * 0.985)
      .addScaledVector(right, Math.cos(ra) * rs * 1.22).addScaledVector(up, Math.sin(ra) * rs * 1.22);
    // ...and comes down on that side of the horizon
    const az = holeAz + f * 2.3 + (r() - 0.5) * 0.08;
    const fd = 840000 + r() * 60000;
    const foot = new THREE.Vector3(Math.sin(az) * fd, -fd * (0.03 + r() * 0.02), -Math.cos(az) * fd);
    // thrown outward from the rim before it falls: a fountain's arc
    const mid = foot.clone().multiplyScalar(0.42).add(top.clone().multiplyScalar(0.56))
      .addScaledVector(right, Math.cos(ra) * rs * 2.0).addScaledVector(up, rs * (0.5 + Math.sin(ra) * 0.8));
    specs.push({ foot, mid, top, w0: 5200 + r() * 3800, w1: 6200 + r() * 3000, wave: 1500 + r() * 2500, turns: 0.4 + r() * 0.5, seed: r() });
  }
  return specs;
}

// The wisps: gas pulled off the ends of the disc, looping out and down either
// side of the hole to the horizon, pale as smoke.
function wispSpecs(dir) {
  const r = rng(0x5a17);
  const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
  const up = new THREE.Vector3().crossVectors(right, dir).normalize();
  const D = C.FAR_HOLE_DIST;
  const rs = Math.tan(C.FAR_HOLE_SIZE) * D; // one shadow radius, at the hole
  const specs = [];
  for (const s of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      // from the disc's end on this side...
      const top = dir.clone().multiplyScalar(D * 0.985)
        .addScaledVector(right, s * rs * (2.4 + i * 0.9)).addScaledVector(up, rs * (s * 0.5 + (i - 1) * 0.35));
      // ...out wide, and down to the horizon well to that side
      const az = Math.atan2(dir.x, -dir.z) + s * (0.75 + i * 0.32 + r() * 0.1);
      const fd = 820000 + r() * 60000;
      const foot = new THREE.Vector3(Math.sin(az) * fd, -fd * 0.04, -Math.cos(az) * fd);
      const mid = foot.clone().multiplyScalar(0.5).add(top.clone().multiplyScalar(0.5))
        .addScaledVector(right, s * D * (0.42 + i * 0.16)).addScaledVector(up, D * (0.18 - i * 0.1));
      specs.push({ foot, mid, top, w0: 26000 + r() * 16000, w1: 9000 + r() * 5000, wave: 30000 + r() * 30000, turns: 1 + r(), seed: r() });
    }
  }
  return specs;
}

// A few spirals, placed about the sky away from the hole, each tilted its own
// way. One mesh; they lie well out past everything else.
function galaxyGeometry(dir) {
  const r = rng(0x9a1a);
  const pos = [], uv = [], seed = [], idx = [];
  const holeAz = Math.atan2(dir.x, -dir.z);
  // [azimuth from the hole, elevation, angular radius]
  const SPOTS = [
    [-0.95, 0.52, 0.060], [-0.58, 0.80, 0.036], [-1.25, 0.24, 0.050], [-0.82, 0.30, 0.030],
    [0.95, 0.72, 0.040], [1.5, 0.34, 0.055], [2.4, 0.5, 0.045], [-2.2, 0.62, 0.050], [3.0, 0.2, 0.035],
  ];
  const c = new THREE.Vector3(), ex = new THREE.Vector3(), ey = new THREE.Vector3(), n = new THREE.Vector3();
  for (const [daz, el, size] of SPOTS) {
    const az = holeAz + daz;
    const D = 880000;
    c.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).multiplyScalar(D);
    // a disc at its own tilt: two axes across the line of sight, one of them foreshortened
    n.copy(c).normalize();
    ex.set(r() - 0.5, r() - 0.5, r() - 0.5).addScaledVector(n, -1).cross(n).normalize();
    ey.crossVectors(n, ex).normalize();
    const R = Math.tan(size) * D, squash = 0.3 + r() * 0.6;
    const s0 = r();
    const o = pos.length / 3;
    for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      pos.push(c.x + ex.x * u * R + ey.x * v * R * squash, c.y + ex.y * u * R + ey.y * v * R * squash, c.z + ex.z * u * R + ey.z * v * R * squash);
      uv.push(u * 0.5 + 0.5, v * 0.5 + 0.5);
      seed.push(s0);
    }
    idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('aSeed', new THREE.Float32BufferAttribute(seed, 1));
  geo.setIndex(idx);
  return geo;
}

// Returns { group, dir, update(camera, t, fade), conduit(variant) }. `group` is to be a
// child of something at the scene's origin with no rotation.
export function buildFarHole() {
  const group = new THREE.Group();
  const dir = holeDirection(new THREE.Vector3());
  const D = C.FAR_HOLE_DIST;
  const shadowR = Math.tan(C.FAR_HOLE_SIZE) * D;
  const extent = C.FAR_HOLE_DISC * 1.1; // the quad's half-width, shadow radii

  // both face back down the line of sight, and never turn: the eye is always
  // at this group's origin
  const face = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir.clone().negate());
  // ...rolled so the disc lies level with the horizon
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(face);
  const want = new THREE.Vector3(0, 1, 0).addScaledVector(dir, -dir.y).normalize();
  const roll = Math.atan2(new THREE.Vector3().crossVectors(up, want).dot(dir.clone().negate()), up.dot(want));
  face.premultiply(new THREE.Quaternion().setFromAxisAngle(dir.clone().negate(), roll));

  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(shadowR * 1.01, 96),
    new THREE.MeshBasicMaterial({ color: 0x000000, fog: false, transparent: true, depthWrite: false })
  );
  shadow.renderOrder = -4; // after the stars (-5), before everything that glows
  shadow.position.copy(dir).multiplyScalar(D);
  shadow.quaternion.copy(face);
  shadow.frustumCulled = false;

  const holeU = {
    uTime: { value: 0 },
    uHdr: { value: C.FAR_HOLE_HDR },
    uDisc: { value: C.FAR_HOLE_DISC },
    uTilt: { value: C.FAR_HOLE_TILT },
    uRoll: { value: C.FAR_HOLE_ROLL },
    uExtent: { value: extent },
    uFade: { value: 0 },
  };
  const light = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.ShaderMaterial({
      vertexShader: commonVert,
      fragmentShader: holeFrag,
      uniforms: holeU,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  light.position.copy(dir).multiplyScalar(D * 0.995);
  light.quaternion.copy(face);
  light.scale.setScalar(shadowR * extent);
  light.frustumCulled = false;
  light.renderOrder = 2;

  const time = { value: 0 }, fadeU = { value: 0 };
  const ribbonMat = (kind, hdr) => new THREE.ShaderMaterial({
    vertexShader: STREAM_VERT,
    fragmentShader: streamFrag,
    uniforms: {
      uTime: time, uFade: fadeU, uHdr: { value: hdr }, uKind: { value: kind },
      uDir: { value: dir }, uShadow: { value: C.FAR_HOLE_SIZE },
    },
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const streams = new THREE.Mesh(ribbonGeometry(tetherSpecs(dir)), ribbonMat(0, 1.0));
  streams.frustumCulled = false;
  streams.renderOrder = 1;
  const wisps = new THREE.Mesh(ribbonGeometry(wispSpecs(dir)), ribbonMat(1, 1.0));
  wisps.frustumCulled = false;
  wisps.renderOrder = 1;

  // --- galaxies: one quad each, one draw ---
  const galaxies = new THREE.Mesh(galaxyGeometry(dir), new THREE.ShaderMaterial({
    vertexShader: GALAXY_VERT,
    fragmentShader: GALAXY_FRAG,
    uniforms: { uFade: fadeU },
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  }));
  galaxies.frustumCulled = false;
  galaxies.renderOrder = -4.5; // with the stars, before the shadow

  group.add(galaxies, shadow, light, streams, wisps);

  // --- the conduits: the mining itself ---
  // One material for all of them; the shape is made in its vertex shader from
  // the mesh's own place (a collector, on a cage) and the hole's (in the sky).
  // A handful of geometries differ only in the seed baked into them, which
  // says where on the disc each one comes from and which way it is thrown.
  const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
  const upv = new THREE.Vector3().crossVectors(right, dir).normalize();
  const conduitMat = new THREE.ShaderMaterial({
    vertexShader: conduitVert,
    fragmentShader: conduitFrag,
    uniforms: {
      uTime: time, uFade: fadeU,
      uHoleDir: { value: dir }, uHoleRight: { value: right }, uHoleUp: { value: upv },
      uHoleDist: { value: D }, uHoleR: { value: shadowR },
    },
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const conduitGeo = (seed) => {
    const ALONG = 72, ROUND = 20;
    const g = new THREE.PlaneGeometry(1, 1, ALONG, ROUND).translate(0.5, 0.5, 0);
    g.setAttribute('aSeed', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count).fill(seed), 1));
    return g;
  };
  const conduitGeos = [0.12, 0.88, 0.5, 0.3, 0.7].map(conduitGeo);

  return {
    group,
    dir,
    // A conduit, to be placed where it lands (its origin is its foot).
    // `variant` picks its place on the disc and the side it is thrown to.
    conduit(variant) {
      const m = new THREE.Mesh(conduitGeos[variant % conduitGeos.length], conduitMat);
      m.frustumCulled = false;
      m.renderOrder = 1;
      return m;
    },
    update(camera, t, fade) {
      group.position.copy(camera.position);
      holeU.uTime.value = t;
      holeU.uFade.value = fade;
      time.value = t;
      fadeU.value = fade;
    },
  };
}
