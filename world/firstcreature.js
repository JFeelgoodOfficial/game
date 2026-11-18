// The first creature (GDD 5.7.4): what the pilot drew, alive.
//
// The blank canvas (src/drawPad.js) hands over strokes: lists of points in a
// square, x and y each -1..1, y up. Here each stroke becomes a ribbon of
// points of light, and a wave runs down every ribbon from one end to the
// other, so whatever was drawn, a line, a face, a scribble, a single loop, it
// swims. Nothing about the drawing is interpreted. It is only made to move.
//
// The drawing is also the first thing in the archive that was not taken
// (saveFirstEntry / loadFirstEntry: localStorage 'fgsf.firstentry'), and the
// world that is made round it takes its colours from it (worldFrom): colours
// worked out from the strokes themselves, so they are in no fragment.
//
// One draw, no per-frame allocation.

import * as THREE from 'three';

const KEY = 'fgsf.firstentry';
const MAX_POINTS = 2000; // kept in the save
const STEP = 0.011; // spacing of the lights along a stroke, in canvas units
const STRANDS = 3; // lights side by side, for a ribbon's width

const VERT = /* glsl */ `
  attribute vec2 aNormal;  // across the stroke
  attribute vec3 aData;    // along the stroke 0..1, the stroke's own seed, which strand
  uniform float uTime, uPx, uSize, uAmount, uWave;
  varying float vAlong;
  varying float vSeed;
  varying float vGlow;
  void main() {
    float along = aData.x, seed = aData.y, strand = aData.z;
    // the wave that makes it swim: down the stroke, bigger toward the tail
    float ph = along * 9.0 - uTime * (2.2 + seed * 1.4) + seed * 6.2832;
    float sway = sin(ph) * (0.035 + 0.075 * along) * uWave;
    vec3 p = vec3(position.xy + aNormal * (sway + strand * 0.012), 0.0);
    // ...and the whole body rolls a little out of its own plane
    p.z = sin(along * 5.0 - uTime * 1.6 + seed * 9.0) * 0.12 * uWave;
    // being drawn into the world: the lights arrive along each stroke in order
    float here = smoothstep(along - 0.02, along + 0.06, uAmount * 1.1);
    vec4 mv = modelViewMatrix * vec4(p * uSize, 1.0);
    gl_Position = projectionMatrix * mv;
    // a pulse of light runs the same way as the wave
    vGlow = (0.55 + 0.45 * sin(along * 22.0 - uTime * 5.0 + seed * 20.0)) * here;
    vAlong = along;
    vSeed = seed;
    gl_PointSize = clamp(uPx * uSize * (0.05 - 0.012 * abs(strand)) / max(-mv.z, 0.05), 1.5, 90.0) * step(0.002, here);
  }
`;
const FRAG = /* glsl */ `
  uniform vec3 uA, uB;
  uniform float uBright;
  uniform float uSolid; // 1 where it has to show against a bright sky: colour laid over, not added
  varying float vAlong;
  varying float vSeed;
  varying float vGlow;
  void main() {
    float r = length(gl_PointCoord * 2.0 - 1.0);
    if (r > 1.0) discard;
    float core = pow(1.0 - r, 2.4);
    vec3 c = mix(uA, uB, fract(vAlong * 0.8 + vSeed));
    vec3 lit = (c * 1.3 + vec3(1.0) * core * 0.7) * uBright;
    // (laid over a bright sky it wants depth of colour, not light)
    vec3 deep = c * c * (0.55 + 0.6 * core) * uBright;
    gl_FragColor = mix(vec4(lit * core * vGlow, 1.0), vec4(deep, clamp(pow(1.0 - r, 0.7) * (0.55 + 0.45 * vGlow) * 1.6, 0.0, 1.0)), uSolid);
  }
`;

// A number from the drawing, 0..1: the same drawing always gives the same one.
function hashOf(strokes) {
  let h = 0x811c9dc5;
  for (const s of strokes) {
    for (const p of s) {
      h = Math.imul(h ^ Math.round((p[0] + 1) * 500), 0x01000193);
      h = Math.imul(h ^ Math.round((p[1] + 1) * 500), 0x01000193);
    }
  }
  return ((h >>> 0) % 100000) / 100000;
}

// The world that begins with this drawing (world/layerplanet.js layers). Its
// colours come from the drawing, so no two pilots' worlds are the same and
// none of them is in the archive. It has no structures: nothing is built yet.
export function worldFrom(strokes) {
  const h = hashOf(strokes);
  const col = (dh, s, l) => new THREE.Color().setHSL((h + dh) % 1, s, l);
  return {
    hue: h,
    layers: {
      sky: { a: col(0, 0.85, 0.66), b: col(0.07, 0.55, 0.92), bands: 0.2 + 0.6 * ((h * 7) % 1) },
      ground: { sea: col(0.52, 0.75, 0.2), land: col(0.36, 0.7, 0.52), high: col(0.18, 0.85, 0.8), scale: 1.3 + 1.6 * ((h * 13) % 1), level: 0.5 },
      structures: null,
      life: null, // the creature is its life
      light: { col: col(0.62, 0.95, 0.72), kind: 1 },
    },
    a: col(0.62, 1.0, 0.68),
    b: col(0.12, 1.0, 0.7),
  };
}

// strokes -> { points, update(t, px), set(amount, wave, bright), dispose() }
// `solid`: for a bright place (see uSolid).
export function createCreature(strokes, size = 3, solid = false) {
  const pos = [], nor = [], dat = [];
  strokes.forEach((s, si) => {
    if (!s.length) return;
    // total length, then lights laid along it at an even spacing
    let total = 0;
    for (let i = 1; i < s.length; i++) total += Math.hypot(s[i][0] - s[i - 1][0], s[i][1] - s[i - 1][1]);
    const seed = ((si * 0.618) % 1) * 0.9 + 0.05;
    const n = Math.max(2, Math.min(700, Math.ceil(total / STEP)));
    let seg = 1, walked = 0;
    for (let k = 0; k < n; k++) {
      const want = total * (k / (n - 1));
      let len = seg < s.length ? Math.hypot(s[seg][0] - s[seg - 1][0], s[seg][1] - s[seg - 1][1]) : 0;
      while (seg < s.length - 1 && walked + len < want) {
        walked += len;
        seg++;
        len = Math.hypot(s[seg][0] - s[seg - 1][0], s[seg][1] - s[seg - 1][1]);
      }
      const a = s[Math.max(seg - 1, 0)], b = s[Math.min(seg, s.length - 1)];
      const f = len > 1e-6 ? Math.min(Math.max((want - walked) / len, 0), 1) : 0;
      const x = a[0] + (b[0] - a[0]) * f, y = a[1] + (b[1] - a[1]) * f;
      let tx = b[0] - a[0], ty = b[1] - a[1];
      const tl = Math.hypot(tx, ty) || 1;
      tx /= tl;
      ty /= tl;
      for (let j = 0; j < STRANDS; j++) {
        pos.push(x, y, 0);
        nor.push(-ty, tx);
        dat.push(n > 1 ? k / (n - 1) : 0, seed, j - (STRANDS - 1) / 2);
      }
    }
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  geo.setAttribute('aNormal', new THREE.BufferAttribute(new Float32Array(nor), 2));
  geo.setAttribute('aData', new THREE.BufferAttribute(new Float32Array(dat), 3));
  const w = worldFrom(strokes);
  const uniforms = {
    uTime: { value: 0 }, uPx: { value: 600 }, uSize: { value: size }, uAmount: { value: 1 }, uWave: { value: 1 },
    uA: { value: w.a }, uB: { value: w.b }, uBright: { value: 1 }, uSolid: { value: solid ? 1 : 0 },
  };
  const points = new THREE.Points(geo, new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG, uniforms,
    transparent: true, blending: solid ? THREE.NormalBlending : THREE.AdditiveBlending, depthWrite: false, fog: false,
  }));
  points.frustumCulled = false;
  return {
    points,
    uniforms,
    count: pos.length / 3,
    update(t, px) {
      uniforms.uTime.value = t;
      uniforms.uPx.value = px;
    },
    dispose() {
      geo.dispose();
      points.material.dispose();
    },
  };
}

// --- the entry itself ---------------------------------------------------------
const clean = (strokes) => {
  const out = [];
  let left = MAX_POINTS;
  if (!Array.isArray(strokes)) return out;
  for (const s of strokes) {
    if (!Array.isArray(s) || left <= 0) continue;
    const keep = [];
    for (const p of s) {
      if (left <= 0) break;
      if (!Array.isArray(p) || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) continue;
      keep.push([Math.round(Math.max(-1, Math.min(1, p[0])) * 1000) / 1000, Math.round(Math.max(-1, Math.min(1, p[1])) * 1000) / 1000]);
      left--;
    }
    if (keep.length) out.push(keep);
  }
  return out;
};

let kept = null; // this session's, if storage is refused

export function saveFirstEntry(strokes) {
  kept = clean(strokes);
  try {
    localStorage.setItem(KEY, JSON.stringify({ v: 1, strokes: kept }));
  } catch {
    // storage full or blocked: it is still there until the page is closed
  }
  return kept;
}

export function loadFirstEntry() {
  if (kept) return kept;
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    const s = clean(raw?.strokes);
    if (s.length) kept = s;
  } catch {
    // unreadable: there is no entry
  }
  return kept;
}
