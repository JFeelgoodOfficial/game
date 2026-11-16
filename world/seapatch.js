// ---------------------------------------------------------------------------
// The sea patch: real swell around the Indigo Reach (GDD 5.7 exception).
//
// Everywhere else in the game the sea is a smooth sphere whose waves are a
// shading trick (src/shaders/water.frag). Around Neptunia's factory ship that
// is not enough — you stand at a rail ten units above the water — so this
// swaps a disc of that sphere for displaced geometry:
//
//   - a ring grid in the ship's ANCHOR frame (+Y = the site's up, origin at
//     the planet centre), child of planet.surface so it turns with the world;
//   - a sum of Gerstner waves, generated into the shaders from the one WAVES
//     table below so the GPU surface and the CPU mirror (waveAt) cannot drift;
//   - the whole wave field advected astern at ADVECT u/s: the ship holds its
//     spot on the globe, and the sea streaming past is what says "under way";
//   - relief fading to nothing by RELIEF_END, and the patch running on as
//     exact flat sphere to RIM. The base water sphere discards a hole of
//     HOLE radius (uHole in water.frag), so the two overlap on identical
//     shading and there is no seam to blend.
//
// The sea is also FLATTENED near the ship: a 260 u hull on a 1400 u world
// would see the sphere fall 6 u away at bow and stern. Inside FLAT_IN the
// patch is a true plane through the anchor; it eases onto the sphere by
// FLAT_OUT. waveAt/swellAt include that lift, so swimmers ride it too.
//
// Uniform OBJECTS are shared by reference with the planet's water material:
// the sun swing, uTime, planetsky's underwater fog — all drive this for free.
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import { C } from '../src/constants.js';
import { Q, onQualityChange } from '../src/quality.js';
import oceanVert from '../src/shaders/ocean.vert?raw';
import oceanFrag from '../src/shaders/ocean.frag?raw';

export const SEA = {
  RIM: 700, // patch outer radius (flat units from the anchor axis)
  HOLE: 600, // the water sphere is discarded inside this
  RELIEF_START: 380,
  RELIEF_END: 560, // waves are gone by here; beyond is exact sphere
  FLAT_IN: 150, // the sea is a plane inside this...
  FLAT_OUT: 520, // ...and back on the sphere by this
  ADVECT: 8, // u/s the water streams astern (the ship's apparent speed)
  STEEP: 0.75, // Gerstner horizontal/vertical ratio: sharp crests, flat troughs
  G: 9, // "gravity" for the dispersion relation w = sqrt(g k)
  ACTIVE_FAR: 1300, // camera farther than this from the anchor: patch off
  ACTIVE_NEAR: 900, // relief is full inside this
};

// Wavelength, amplitude, heading. Heading is radians off dead ahead-to-astern
// (0 = a head sea running straight down the hull toward the stern, -Z).
// Ordered longest first: tiers and the hull pose take a prefix.
export const WAVES = [
  { L: 180, A: 2.0, a: 0.15 },
  { L: 110, A: 1.2, a: -0.38 },
  { L: 55, A: 0.6, a: 0.62 },
  { L: 30, A: 0.3, a: -0.85 },
  { L: 17, A: 0.15, a: 1.1 },
].map((w) => {
  const k = (Math.PI * 2) / w.L;
  return { ...w, k, w: Math.sqrt(SEA.G * k), dx: Math.sin(w.a), dz: -Math.cos(w.a) };
});

const f = (n) => {
  const s = Number(n).toFixed(5);
  return s.includes('.') ? s : s + '.0';
};

// GLSL statements accumulating h (height), d (horizontal shift), g (slope) and
// fold (crest pinch) for the first `count` waves at flat point p. `band`
// limits each wave to the radius its wavelength is still resolved by the mesh.
function glslWaves(count, band) {
  let out = '';
  for (let i = 0; i < count; i++) {
    const w = WAVES[i];
    const fade = band && w.L * 12 < SEA.RELIEF_END
      ? ` * (1.0 - smoothstep(${f(w.L * 6)}, ${f(w.L * 12)}, r))` : '';
    out += `  {
    float ph = ${f(w.k)} * (${f(w.dx)} * p.x + ${f(w.dz)} * (p.y + ${f(SEA.ADVECT)} * t)) - ${f(w.w)} * t;
    float a = ${f(w.A)} * amp${fade};
    float sn = sin(ph), cs = cos(ph);
    h += a * sn;
    d += vec2(${f(w.dx)}, ${f(w.dz)}) * (${f(SEA.STEEP)} * a * cs);
    g += vec2(${f(w.dx)}, ${f(w.dz)}) * (${f(w.k)} * a * cs);
    fold += ${f(w.k * SEA.STEEP)} * a * sn;
  }\n`;
  }
  return out;
}

const smooth = (a, b, x) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
};

// Height of the still sea above the anchor plane's origin level, at flat
// radius r: 0 on the plane, falling onto the sphere of radius rw outside.
function baseDrop(r, rw) {
  const s = smooth(SEA.FLAT_IN, SEA.FLAT_OUT, r);
  if (s === 0) return 0;
  return (Math.sqrt(Math.max(rw * rw - r * r, 0)) - rw) * s;
}

function ringGrid(tier) {
  const hi = tier === 'high' || tier === 'ultra';
  const lin = hi ? 84 : tier === 'medium' ? 56 : 36; // rings 4 .. 210, even spacing
  const geo = hi ? 44 : tier === 'medium' ? 34 : 24; // then geometric out to the rim
  const seg = hi ? 256 : tier === 'medium' ? 176 : 112;
  const radii = [];
  for (let i = 0; i <= lin; i++) radii.push(4 + (206 * i) / lin);
  const ratio = Math.pow(SEA.RIM / 210, 1 / geo);
  for (let i = 1; i <= geo; i++) radii.push(210 * Math.pow(ratio, i));
  const pos = new Float32Array(radii.length * seg * 3);
  let o = 0;
  for (let j = 0; j < radii.length; j++) {
    for (let i = 0; i < seg; i++) {
      // half-step twist on alternate rings: no radial seams to catch the eye
      const th = ((i + (j & 1) * 0.5) / seg) * Math.PI * 2;
      pos[o++] = Math.cos(th) * radii[j];
      pos[o++] = 0;
      pos[o++] = Math.sin(th) * radii[j];
    }
  }
  const idx = new Uint32Array((radii.length - 1) * seg * 6);
  o = 0;
  for (let j = 0; j < radii.length - 1; j++) {
    for (let i = 0; i < seg; i++) {
      const a = j * seg + i, b = j * seg + ((i + 1) % seg);
      const c = a + seg, e = b + seg;
      // wound so the front face looks up (+Y)
      if (j & 1) { idx[o++] = a; idx[o++] = b; idx[o++] = e; idx[o++] = a; idx[o++] = e; idx[o++] = c; }
      else { idx[o++] = a; idx[o++] = b; idx[o++] = c; idx[o++] = b; idx[o++] = e; idx[o++] = c; }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  return g;
}

const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _w = { h: 0, x: 0, z: 0 };

// `siteDir` is the unit direction of the ship's spot in planet.surface's
// object frame (a registry `site`). `hull`, when given, is the half-extents
// {halfBeam, halfLength} of a ship whose outline is cut out of the water.
export function createSeaPatch(planet, siteDir, opts = {}) {
  const rw = planet.radius + C.WALK_WATER_LEVEL;
  const wm = planet.waterMesh.material;
  const count = () => (Q.tier === 'low' ? 3 : WAVES.length);

  const anchorQ = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), siteDir);
  const uniforms = {
    // shared with the water sphere, by reference
    uSun: wm.uniforms.uSun,
    uWaterColor: wm.uniforms.uWaterColor,
    uGloss: wm.uniforms.uGloss,
    uSkyColor: wm.uniforms.uSkyColor,
    uGlint: wm.uniforms.uGlint,
    uDetail: wm.uniforms.uDetail,
    uStorm: wm.uniforms.uStorm,
    uFoamColor: wm.uniforms.uFoamColor,
    uFogColor: wm.uniforms.uFogColor,
    uFogDensity: wm.uniforms.uFogDensity,
    uTime: wm.uniforms.uTime,
    // our own
    uRw: { value: rw },
    uScale: { value: 0 }, // 0 far .. 1 near: relief eases in on approach
    uHull: { value: new THREE.Vector3(0, 0, 0) }, // halfBeam, halfLength, 1 = cut the outline
    uLocal: { value: new THREE.Matrix4().makeRotationFromQuaternion(anchorQ) },
  };
  if (opts.hull) uniforms.uHull.value.set(opts.hull.halfBeam, opts.hull.halfLength, 1);

  const consts = `
const float FLAT_IN = ${f(SEA.FLAT_IN)};
const float FLAT_OUT = ${f(SEA.FLAT_OUT)};
const float RELIEF_START = ${f(SEA.RELIEF_START)};
const float RELIEF_END = ${f(SEA.RELIEF_END)};
const float ADVECT = ${f(SEA.ADVECT)};
`;
  function makeMaterial() {
    const n = count();
    return new THREE.ShaderMaterial({
      vertexShader: oceanVert.replace('//#CONSTS', consts).replace('//#WAVES', glslWaves(n, true)),
      fragmentShader: oceanFrag.replace('//#CONSTS', consts).replace('//#WAVES', glslWaves(n, false)),
      uniforms,
      side: THREE.DoubleSide, // the sea is divable: it has an underside
    });
  }

  const mesh = new THREE.Mesh(ringGrid(Q.tier), makeMaterial());
  mesh.quaternion.copy(anchorQ);
  mesh.frustumCulled = false; // displaced in the shader
  mesh.visible = false;
  mesh.name = 'seaPatch';
  planet.surface.add(mesh);

  onQualityChange(() => {
    mesh.geometry.dispose();
    mesh.geometry = ringGrid(Q.tier);
    mesh.material.dispose();
    mesh.material = makeMaterial();
  });

  // The hole in the base water sphere: anchor direction + cos of its half-angle.
  const hole = wm.uniforms.uHole.value;
  const holeCos = Math.sqrt(1 - (SEA.HOLE / rw) ** 2);
  hole.set(siteDir.x, siteDir.y, siteDir.z, 2); // w > 1: no hole

  let scale = 0;

  // Sea surface at flat anchor-frame point (x, z), time t. Writes out.h (height
  // above the anchor origin's level, still-sea lift included) and returns it.
  // Mirrors ocean.vert: one fixed-point step undoes the Gerstner side-shift, so
  // this is the height OVER (x, z), not of the vertex that started there.
  function waveAt(x, z, t, out = _w) {
    const n = count();
    let px = x, pz = z, h = 0;
    for (let pass = 0; pass < 2; pass++) {
      const r = Math.hypot(px, pz);
      const amp = (1 - smooth(SEA.RELIEF_START, SEA.RELIEF_END, r)) * scale;
      let sx = 0, sz = 0;
      h = 0;
      if (amp > 0) {
        for (let i = 0; i < n; i++) {
          const w = WAVES[i];
          let a = w.A * amp;
          if (w.L * 12 < SEA.RELIEF_END) a *= 1 - smooth(w.L * 6, w.L * 12, r);
          const ph = w.k * (w.dx * px + w.dz * (pz + SEA.ADVECT * t)) - w.w * t;
          const cs = Math.cos(ph);
          h += a * Math.sin(ph);
          sx += w.dx * SEA.STEEP * a * cs;
          sz += w.dz * SEA.STEEP * a * cs;
        }
      }
      if (pass === 0) { px = x - sx; pz = z - sz; }
    }
    out.h = h + baseDrop(Math.hypot(x, z), rw);
    out.x = x; out.z = z;
    return out.h;
  }

  // How far the sea stands above (or below) the nominal water sphere along a
  // WORLD direction from the planet centre. 0 outside the patch or when off.
  function swellAt(worldDir) {
    if (scale <= 0) return 0;
    planet.surface.getWorldQuaternion(_q).multiply(anchorQ).invert();
    _v.copy(worldDir).applyQuaternion(_q); // anchor-frame direction
    if (_v.y <= 0) return 0;
    // flat radius where this ray meets the still sea, good to a few cm
    let x = _v.x * rw, z = _v.z * rw;
    if (x * x + z * z > SEA.RELIEF_END * SEA.RELIEF_END) return 0;
    let rho = rw;
    for (let i = 0; i < 2; i++) {
      const y = rw + waveAt(x, z, uniforms.uTime.value);
      rho = y / _v.y;
      x = _v.x * rho; z = _v.z * rho;
    }
    return Math.hypot(x, rw + waveAt(x, z, uniforms.uTime.value), z) - rw;
  }
  planet.water.swellAt = swellAt;

  function setScale(s) {
    scale = s;
    uniforms.uScale.value = s;
    mesh.visible = s > 0;
    hole.w = s > 0 ? holeCos : 2;
  }

  // Per frame, flight or foot. camWorld is the camera's world position.
  function update(camWorld) {
    planet.surface.getWorldQuaternion(_q);
    _v.copy(siteDir).applyQuaternion(_q).multiplyScalar(rw).add(planet.group.position);
    const dist = _v.distanceTo(camWorld);
    const s = planet.waterMesh.visible ? 1 - smooth(SEA.ACTIVE_NEAR, SEA.ACTIVE_FAR, dist) : 0;
    if (s !== scale) setScale(s);
  }

  return {
    mesh, uniforms, anchorQ, rw,
    update, waveAt, swellAt, setScale,
    get scale() { return scale; },
    get time() { return uniforms.uTime.value; },
  };
}
