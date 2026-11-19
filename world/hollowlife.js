// What lives in the hollow, and what is after the vessel there (GDD 5.7.5).
//
// Everything here is seen in one band of the lamp and no other, and for a
// reason (src/lamp.js): the creature is made of something that answers there.
//
//   drifter   blue-green   makes its own light (luciferin), in the window water passes
//   painted   ultraviolet  skin pigment that fluoresces under UV
//   warm      infrared     glass-clear, and warmer than what is round it
//   line      H-alpha      a living veil of excited hydrogen: one emission line
//   boned     X-ray        soft tissue is thin to it, bone is not
//   caller    radio        never drawn; heard (world/entryzero-audio.js)
//   guard     H-alpha      at the firewall: made of what the wall is made of,
//                          which is why it lets them through
//
// A species is one InstancedMesh for every school of it in a zone, moved in
// the vertex shader from a seed each, so a frame costs one uniform write. For
// the log the CPU only needs to know where each school is and how big.
//
// The three threats want energy, not the hull:
//
//   light eaters   drawn to a lit lamp on any band but H-alpha, and drink the
//                  beam. Seen only as edges in the light they are eating.
//   heat leeches   seen only in infrared. They settle on the hull and take
//                  the cabin's warmth; they cannot hold on at speed.
//   radiation feeders   asleep, and dense enough to show on X-ray. The X-ray
//                  band wakes them; at the glass they throw it back, and the
//                  dose climbs faster. They settle when the band is left.
//
// Those are a handful of bodies stepped on the CPU, into preallocated arrays.

import * as THREE from 'three';
import { C } from '../src/constants.js';
import { lamp, LAMP_U, LAMP_GLSL, BAND, lampLive, bandIsBeam } from '../src/lamp.js';
import { BANDS, LIFE } from './entryzero-dialogue.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { prep, at, path, sweep, tube, fang, sac } from './sweepgeo.js';

const bandOf = (id) => BANDS.findIndex((b) => b.id === id);

// ---------------------------------------------------------------------------
// Bodies. Each is built once per zone from swept tubes and lathes
// (world/sweepgeo.js) and merged to one geometry. Every vertex carries `aP`:
// which part of the animal it is, and up to two numbers that part's shading
// or motion wants (how far along it, which strand). The vertex shader moves
// the parts; nothing here is touched again after it is built.
// ---------------------------------------------------------------------------
const V2 = (x, y) => new THREE.Vector2(x, y);
// `uv(x, y, z)` -> [u, v] for a vertex, or a fixed pair
function tag(g, part, uv) {
  const pa = g.attributes.position, n = pa.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const q = typeof uv === 'function' ? uv(pa.getX(i), pa.getY(i), pa.getZ(i)) : uv || [0, 0];
    a[i * 3] = part; a[i * 3 + 1] = q[0]; a[i * 3 + 2] = q[1];
  }
  g.setAttribute('aP', new THREE.BufferAttribute(a, 3));
  return g;
}
// a sheet from rows of points; `ap(r, c)` -> [part, u, v] for the point at row r, column c
function sheet(rows, ap) {
  const pos = [], aP = [];
  const put = (r, c) => { pos.push(...rows[r][c]); aP.push(...ap(r, c)); };
  for (let r = 0; r < rows.length - 1; r++) {
    for (let c = 0; c < rows[r].length - 1; c++) {
      put(r, c); put(r + 1, c); put(r, c + 1);
      put(r, c + 1); put(r + 1, c); put(r + 1, c + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aP', new THREE.Float32BufferAttribute(aP, 3));
  g.computeVertexNormals();
  return g;
}
function merged(parts) {
  const g = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return g;
}

// kind -> what the body is, and the shader branch that draws it
const KIND = { drifter: 0, painted: 1, warm: 2, line: 3, boned: 4, guard: 5 };

// A deep-sea jelly, crown toward +z (the way it swims). A bell about one unit
// across with a scalloped rim, ribbon tentacles, and its last meal inside.
function drifterGeo(rr) {
  const parts = [];
  const pts = [];
  for (let i = 0; i <= 10; i++) {
    const a = (i / 10) * Math.PI * 0.5;
    pts.push(V2(Math.max(1e-4, 0.5 * Math.sin(a)), 0.42 * Math.cos(a)));
  }
  pts.push(V2(0.45, -0.06)); // the lip, turned in
  const bell = new THREE.LatheGeometry(pts, 32);
  const pa = bell.attributes.position;
  for (let i = 0; i < pa.count; i++) {
    const y = pa.getY(i);
    if (y > 0.07) continue;
    const ang = Math.atan2(pa.getZ(i), pa.getX(i)), k = 0.5 + 0.5 * Math.cos(ang * 8);
    pa.setXYZ(i, pa.getX(i) * (1 + 0.1 * k), y - 0.07 * (1 - k), pa.getZ(i) * (1 + 0.1 * k));
  }
  bell.computeVertexNormals();
  bell.rotateX(Math.PI / 2);
  // u: 0 at the crown, 0.3 at the rim (the lights fire along it); v: round the bell
  parts.push(tag(prep(bell), 0, (x, y, z) => [0.3 * (1 - Math.max(0, z) / 0.42), Math.atan2(y, x)]));
  // tentacles: ribbons from the rim, trailing
  for (let i = 0; i < 7; i++) {
    const ang = (i / 7) * Math.PI * 2 + rr() * 0.4, len = 2.0 + rr() * 1.3;
    const cx = Math.cos(ang) * 0.43, cy = Math.sin(ang) * 0.43, wx = -Math.sin(ang) * 0.028, wy = Math.cos(ang) * 0.028;
    const rows = [];
    for (let s = 0; s <= 12; s++) {
      const z = -len * (s / 12), w = 1 - 0.7 * (s / 12);
      rows.push([[cx - wx * w, cy - wy * w, z], [cx + wx * w, cy + wy * w, z]]);
    }
    parts.push(sheet(rows, (r) => [1, 0.3 + 0.7 * (r / 12) * (len / 3.3), i]));
  }
  // the arms round the mouth: shorter, thicker
  for (let i = 0; i < 4; i++) {
    const ang = (i / 4) * Math.PI * 2 + 0.4;
    parts.push(tag(tube([[Math.cos(ang) * 0.06, Math.sin(ang) * 0.06, 0.12], [Math.cos(ang) * 0.12, Math.sin(ang) * 0.12, -0.4], [Math.cos(ang) * 0.08, Math.sin(ang) * 0.08, -1.0]],
      [0.05, 0.04, 0.008], { seg: 10, rad: 5, lump: 0.3 }), 1, (x, y, z) => [0.3 + 0.2 * Math.min(1, -z), 7 + i]));
  }
  // what it last ate, still its own shape
  parts.push(tag(at(tube([[0, 0, -0.1], [0.02, 0.01, 0], [0, 0, 0.12]], [0.02, 0.07, 0.015], { seg: 6, rad: 6, sy: 0.6 }), 0.03, 0, 0.2), 2));
  return merged(parts);
}

// An oarfish with a viperfish's mouth: three units long, nose at +z.
function paintedGeo(rr) {
  const parts = [];
  const bp = path([[0, 0, -1.5], [0, 0, -1.0], [0, 0, 0], [0, 0.02, 0.9], [0, 0, 1.32]], [0.03, 0.14, 0.2, 0.22, 0.13]);
  parts.push(tag(sweep(bp, { seg: 28, rad: 8, sx: 0.3 }), 0));
  parts.push(tag(tube([[0, 0, -1.45], [0, 0, -1.6], [0, 0, -1.78]], [0.05, 0.16, 0.24], { seg: 4, rad: 6, sx: 0.08 }), 0)); // the tail
  // a crest of spines, the first few long
  for (let i = 0; i < 16; i++) {
    const z = 1.15 - i * 0.14, u = bp.nearest('z', z);
    parts.push(tag(fang(0, bp.r(u) * 0.95, z, 0, 1, -0.45, i < 3 ? 0.75 - i * 0.12 : 0.2 + rr() * 0.16, 0.012), 1));
  }
  // the underslung jaw (on a hinge), and needle teeth in both
  parts.push(tag(tube([[0, -0.1, 0.95], [0, -0.2, 1.25], [0, -0.13, 1.5]], [0.07, 0.06, 0.02], { seg: 8, rad: 6, sx: 0.5 }), 2));
  for (let i = 0; i < 7; i++) {
    const z = 1.05 + i * 0.065, s = i % 2 ? -1 : 1;
    parts.push(tag(fang(s * 0.022, -0.17 + (z - 1.25) * (z - 1.25) * 0.6, z, 0, 1, 0.1, 0.1 + rr() * 0.12, 0.009), 2, [1, 0]));
    parts.push(tag(fang(s * -0.03, -0.07, z, 0, -1, 0.15, 0.06 + rr() * 0.1, 0.009), 3));
  }
  return merged(parts);
}

// A sea angel made of glass: a clear body and two slow wings, a hot gut and a heart.
function warmGeo() {
  const parts = [];
  parts.push(tag(tube([[0, 0, -0.9], [0, 0, -0.3], [0, 0.02, 0.35], [0, 0, 0.75]], [0.03, 0.2, 0.3, 0.2], { seg: 16, rad: 10 }), 0));
  for (const s of [-1, 1]) {
    parts.push(tag(fang(s * 0.1, 0.05, 0.72, s * 0.3, 0.2, 1, 0.22, 0.06), 0));
    parts.push(tag(tube([[s * 0.2, 0, 0.3], [s * 0.62, 0, 0.36], [s * 1.0, 0, 0.2]], [0.1, 0.25, 0.04], { seg: 10, rad: 8, sy: 0.1 }), 1));
  }
  parts.push(tag(tube([[0, 0, -0.5], [0, 0, -0.1], [0, 0.03, 0.3], [0, 0, 0.55]], [0.02, 0.08, 0.11, 0.05], { seg: 10, rad: 7, lump: 0.15 }), 2));
  parts.push(tag(at(sac(0.07, 0.1, 0.1, 2), 0, 0.06, 0.38), 3));
  return merged(parts);
}

// The veil: a curtain hung from the path of a torus knot and folded through
// itself, trailing fine filaments.
function knot(t, out) {
  const u = t * 2 * Math.PI * 2, qp = (3 / 2) * u, cs = Math.cos(qp);
  out[0] = (2 + cs) * 0.5 * Math.cos(u);
  out[1] = (2 + cs) * 0.5 * Math.sin(u);
  out[2] = Math.sin(qp) * 0.5;
  return out;
}
function lineGeo(rr) {
  const N = 360, R = 4;
  const rows = [];
  const hang = (u) => 0.4 + 0.12 * Math.sin(u * Math.PI * 2 * 9) + 0.06 * Math.sin(u * Math.PI * 2 * 23 + 1);
  for (let r = 0; r <= R; r++) rows.push([]);
  const p = [0, 0, 0];
  for (let i = 0; i <= N; i++) {
    const u = i / N;
    knot(u, p);
    for (let r = 0; r <= R; r++) {
      const v = r / R;
      rows[r].push([p[0] + 0.03 * Math.sin(u * 190 + v * 3) * v, p[1] - hang(u) * v, p[2] + 0.07 * Math.sin(u * Math.PI * 2 * 31 + v * 4) * v]);
    }
  }
  const parts = [sheet(rows, (r, c) => [0, c / N, r / R])];
  // the filaments: thousands, each a sliver
  const pos = [], aP = [];
  for (let i = 0; i < 1600; i++) {
    const u = rr();
    knot(u, p);
    const x = p[0] + (rr() - 0.5) * 0.04, y = p[1] - hang(u), z = p[2] + (rr() - 0.5) * 0.08, len = 0.2 + rr() * rr() * 0.9, w = 0.0035;
    pos.push(x - w, y, z, x + w, y, z, x, y - len, z);
    aP.push(1, u, 1, 1, u, 1, 1, u, 2);
  }
  const f = new THREE.BufferGeometry();
  f.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  f.setAttribute('aP', new THREE.Float32BufferAttribute(aP, 3));
  f.computeVertexNormals();
  parts.push(f);
  return merged(parts);
}

// A real skeleton in a soft shell: a skull with too many teeth, a spine, a
// cage of ribs, fins with finger bones like a hand.
function bonedGeo(rr) {
  const parts = [];
  parts.push(tag(tube([[0, 0, -1.4], [0, 0, -0.9], [0, 0, 0], [0, 0.02, 0.8], [0, 0, 1.38]], [0.03, 0.2, 0.42, 0.4, 0.14], { seg: 20, rad: 12, sx: 0.5 }), 0));
  parts.push(tag(tube([[0, 0.1, -1.3], [0, 0.12, 0], [0, 0.1, 0.85]], [0.012, 0.034, 0.04], { seg: 70, rad: 5, ring: 30, ringAmp: 0.7 }), 1));
  for (let i = 0; i < 10; i++) {
    const z = 0.62 - i * 0.12, k = 1 - Math.abs(i - 3) * 0.07;
    for (const s of [-1, 1]) {
      parts.push(tag(tube([[0, 0.1, z], [s * 0.14 * k, 0.03, z - 0.03], [s * 0.17 * k, -0.14 * k, z - 0.07], [s * 0.09 * k, -0.3 * k, z - 0.12]], [0.02, 0.018, 0.014, 0.004], { seg: 8, rad: 4 }), 1));
    }
    parts.push(tag(fang(0, 0.13, z, 0, 1, -0.5, 0.1 + 0.08 * k, 0.012), 1));
  }
  for (let i = 0; i < 9; i++) parts.push(tag(fang(0, 0.11, -1.25, 0, (i - 4) * 0.28, -1, 0.3 + rr() * 0.12, 0.012), 1)); // the tail's rays
  // the skull
  parts.push(tag(tube([[0, 0.08, 0.82], [0, 0.13, 1.05], [0, 0.04, 1.36]], [0.09, 0.15, 0.05], { seg: 10, rad: 8, sx: 0.72 }), 1));
  for (let i = 0; i < 14; i++) {
    const z = 0.98 + i * 0.028, s = i % 2 ? -1 : 1;
    parts.push(tag(fang(s * 0.05, -0.02, z, 0, -1, 0.1, 0.05 + rr() * 0.07, 0.009), 1));
    parts.push(tag(fang(s * 0.045, -0.15, z, 0, 1, 0.1, 0.05 + rr() * 0.07, 0.009), 2));
  }
  parts.push(tag(tube([[0, -0.1, 0.9], [0, -0.17, 1.15], [0, -0.13, 1.38]], [0.035, 0.045, 0.018], { seg: 8, rad: 6, sx: 1.4, sy: 0.5 }), 2)); // the jaw
  // the fins: five finger bones each, in two joints
  for (const s of [-1, 1]) {
    for (let f = 0; f < 5; f++) {
      const dy = -0.25 + f * 0.13, dz = -0.25 + f * 0.1;
      const mx = s * (0.24 + 0.2), my = -0.12 + dy * 0.2, mz = 0.5 + dz * 0.2;
      parts.push(tag(tube([[s * 0.22, -0.1, 0.5], [mx, my, mz]], [0.014, 0.011], { seg: 2, rad: 4 }), 3));
      parts.push(tag(fang(mx, my, mz, s * 1, dy * 2.2, dz * 2.2, 0.26, 0.011), 3));
    }
  }
  return merged(parts);
}

// A lance made of the wall's own gas: barbed behind the head, ribs of fire off the seam.
function guardGeo() {
  const parts = [];
  const bp = path([[0, 0, -2.2], [0, 0, -1.2], [0, 0, 0.6], [0, 0, 1.6], [0, 0, 2.2]], [0.01, 0.16, 0.28, 0.2, 0.004]);
  parts.push(tag(sweep(bp, { seg: 26, rad: 8 }), 0));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    parts.push(tag(fang(Math.cos(a) * 0.2, Math.sin(a) * 0.2, 1.35, Math.cos(a) * 0.6, Math.sin(a) * 0.6, -1, 0.6, 0.05), 1));
  }
  for (let i = 0; i < 15; i++) {
    const z = 1.1 - i * 0.2, r = bp.r(bp.nearest('z', z));
    for (const s of [-1, 1]) {
      parts.push(tag(tube([[0, r, z], [s * r * 0.95, r * 0.55, z - 0.08], [s * r * 1.4, -r * 0.1, z - 0.24]], [0.022, 0.018, 0.003], { seg: 6, rad: 4 }), 2));
    }
  }
  return merged(parts);
}

function bodyGeometry(kind, rr) {
  if (kind === 'drifter') return drifterGeo(rr);
  if (kind === 'painted') return paintedGeo(rr);
  if (kind === 'guard') return guardGeo();
  if (kind === 'line') return lineGeo(rr);
  if (kind === 'boned') return bonedGeo(rr);
  return warmGeo();
}

const HINGE = /* glsl */ `
  // turn the part of a body in front of a hinge about it (a jaw)
  vec3 hinge(vec3 p, vec3 h, float a) {
    p -= h;
    float c = cos(a), s = sin(a);
    p.yz = vec2(p.y * c - p.z * s, p.y * s + p.z * c);
    return p + h;
  }
`;

const LIFE_VERT = /* glsl */ `
  attribute vec3 aHome;
  attribute vec4 aSeed; // phase, how far it ranges, how fast, how big
  attribute vec3 aP;    // which part of it, and two numbers of that part's own
  uniform float uTime;
  uniform int uKind;
  uniform float uVeilYaw; // the veil: which way it has turned its face
  varying vec3 vW;
  varying vec3 vN;
  varying vec3 vL;
  varying vec3 vP;
  varying float vSeed;
  ${HINGE}
  void main() {
    float a = aSeed.x * 6.2832 + uTime * aSeed.z;
    float b = aSeed.x * 17.0 + uTime * aSeed.z * 0.61;
    vec3 c = aHome + aSeed.y * vec3(cos(a) * cos(b * 0.5), sin(b) * 0.55, sin(a) * cos(b * 0.5));
    // nose along the way it is going
    vec3 fwd = normalize(vec3(-sin(a), 0.25 * cos(b), cos(a)));
    vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), fwd));
    vec3 up = cross(fwd, right);

    // each kind moves as what it is
    vec3 p = position;
    float ph = aSeed.x * 40.0;
    float beat = 1.0;
    float sgn = aSeed.z < 0.0 ? -1.0 : 1.0;
    if (uKind == 0) {
      // the bell pulses; the tentacles trail and wave
      beat = 1.0 + 0.14 * sin(uTime * 2.2 + ph);
      if (aP.x > 0.5 && aP.x < 1.5) {
        float w = -p.z;
        p.x += sin(uTime * 1.5 + p.z * 2.2 + aP.z * 1.7 + ph) * 0.11 * w;
        p.y += cos(uTime * 1.2 + p.z * 1.9 + aP.z * 2.3 + ph) * 0.11 * w;
        p.z *= 0.86 + 0.14 * sin(uTime * 2.2 + ph - 1.2); // drawn up as the bell closes
      }
    } else if (uKind == 1) {
      // an S down the body, widest at the tail; the jaw works
      if (aP.x > 1.5 && aP.x < 2.5) p = hinge(p, vec3(0.0, -0.08, 0.98), 0.22 + 0.2 * sin(uTime * 0.9 + ph));
      p.x += sin(uTime * 2.6 + p.z * 2.1 + ph) * 0.16 * (0.25 + (1.5 - p.z) * 0.25);
    } else if (uKind == 2) {
      beat = 1.0 + 0.04 * sin(uTime * 1.1 + ph);
      // two wings, rowing slowly
      if (aP.x > 0.5 && aP.x < 1.5) {
        float d = max(0.0, abs(p.x) - 0.2);
        p.y += d * sin(uTime * 1.1 + ph) * 0.9;
        p.z -= d * cos(uTime * 1.1 + ph) * 0.4;
      }
      // the heart
      if (aP.x > 2.5) {
        vec3 hc = vec3(0.0, 0.06, 0.38);
        p = hc + (p - hc) * (1.0 + 0.45 * pow(max(0.0, sin(uTime * 4.0 + ph)), 6.0));
      }
    } else if (uKind == 3) {
      // the curtain sways from where it hangs; the filaments more
      float w = aP.z;
      p.x += sin(uTime * 0.6 + aP.y * 40.0) * 0.03 * w;
      p.z += cos(uTime * 0.5 + aP.y * 55.0) * 0.05 * w;
      // it has no nose to follow: it turns its whole face, slowly, to the vessel
      fwd = vec3(sin(uVeilYaw), 0.0, cos(uVeilYaw));
      right = vec3(cos(uVeilYaw), 0.0, -sin(uVeilYaw));
      up = vec3(0.0, 1.0, 0.0);
    } else if (uKind == 4) {
      // the jaw opens and closes slowly; the hand-fins flex
      if (aP.x > 1.5 && aP.x < 2.5) p = hinge(p, vec3(0.0, -0.1, 0.9), 0.08 + 0.34 * (0.5 + 0.5 * sin(uTime * 0.5 + ph)));
      if (aP.x > 2.5) {
        float d = max(0.0, abs(p.x) - 0.22);
        p.y += d * sin(uTime * 0.9 + ph) * 0.55;
        p.z -= d * (0.5 + 0.5 * sin(uTime * 0.9 + ph + 1.0)) * 0.5;
      }
      p.x += sin(uTime * 1.4 + p.z * 1.6 + ph) * 0.05 * (1.4 - p.z) * 0.5;
    } else {
      // a lance does not bend much
      p.x += sin(uTime * 5.0 * sgn + p.z * 1.3 + ph) * 0.06 * (2.2 - p.z) * 0.3;
    }

    vec3 lp = p * aSeed.w;
    lp.xy *= beat;
    lp.z /= beat;
    vW = c + right * lp.x + up * lp.y + fwd * lp.z;
    vN = normalize(right * normal.x + up * normal.y + fwd * normal.z);
    vL = position;
    vP = aP;
    vSeed = aSeed.x;
    gl_Position = projectionMatrix * viewMatrix * vec4(vW, 1.0);
  }
`;
const LIFE_FRAG = /* glsl */ `
  ${LAMP_GLSL}
  uniform float uTime;
  uniform int uKind;
  uniform vec3 uTint;
  varying vec3 vW;
  varying vec3 vN;
  varying vec3 vL;
  varying vec3 vP;
  varying float vSeed;
  void main() {
    vec3 v = normalize(cameraPosition - vW);
    float face = abs(dot(normalize(vN), v));
    float part = vP.x;
    vec3 col;
    float a = 1.0;
    float seen;
    if (uKind == 0) {
      // its own light is seen wherever blue-green reaches; the bell only in the beam
      float own = lampSeen(0.0, vW), lit = lampLit(0.0, vW);
      seen = max(own, lit);
      // the lights fire as a wave from the crown down to the tentacle tips
      float along = vP.y;
      float wave = pow(0.5 + 0.5 * sin(uTime * 1.6 + vSeed * 60.0 - along * 9.0), 6.0);
      vec3 flesh = vec3(0.42, 0.03, 0.06) * lit; // red-black: all but invisible
      if (part < 0.5) {
        float ring = smoothstep(0.014, 0.004, abs(along - 0.09)) + smoothstep(0.014, 0.004, abs(along - 0.19)) + smoothstep(0.02, 0.006, abs(along - 0.285));
        float dots = smoothstep(0.1, 0.8, sin(vP.z * 12.0 + vSeed * 9.0) * 0.5 + 0.5);
        col = uTint * own * ring * dots * (0.35 + 2.8 * wave) + flesh * (0.2 + 0.8 * pow(1.0 - face, 2.0));
      } else if (part < 1.5) {
        float bead = smoothstep(0.55, 0.95, sin(along * 75.0 + vP.z * 3.0));
        col = uTint * own * bead * (0.25 + 2.8 * wave) + flesh * 0.3;
      } else {
        // the outline of its last meal: there only in the beam
        col = vec3(0.55, 0.4, 0.22) * lit * (0.15 + 0.85 * pow(1.0 - face, 1.5));
      }
    } else if (uKind == 1) {
      seen = lampLit(1.0, vW);
      // yellow-green bars on violet; they bend as the body does
      float bars = smoothstep(0.45, 0.55, abs(sin(vL.z * 7.0 + vSeed * 20.0)));
      // a pink eye, and a false one near the tail, so a school seems to stare both ways
      float eye = smoothstep(0.075, 0.045, distance(vec3(abs(vL.x), vL.yz), vec3(0.06, 0.08, 1.1)))
                + smoothstep(0.11, 0.07, distance(vL.yz, vec2(0.0, -1.0)));
      col = mix(uTint * 0.35, vec3(0.8, 1.0, 0.2) * 1.2, bars) + vec3(1.0, 0.4, 0.9) * 1.6 * eye;
      if (part > 0.5 && part < 1.5) col = uTint * 0.8 + vec3(0.8, 1.0, 0.2) * 0.5; // the crest
      if (part > 2.5 || (part > 1.5 && vP.y > 0.5)) col = vec3(0.85, 1.0, 0.7) * 1.7; // the teeth fluoresce too
    } else if (uKind == 2) {
      seen = lampSeen(2.0, vW);
      // nothing in any light. In infrared: a cooler halo where the skin is, a hot gut, a heart
      float beat = pow(max(0.0, sin(uTime * 4.0 + vSeed * 40.0)), 6.0);
      if (part < 1.5) col = vec3(0.8, 0.13, 0.03) * (0.06 + 0.6 * pow(1.0 - face, 2.2));
      else if (part < 2.5) col = mix(vec3(1.0, 0.4, 0.08), vec3(1.0, 0.85, 0.5), face) * 0.95;
      else col = vec3(1.0, 0.95, 0.75) * (1.0 + 1.2 * beat);
    } else if (uKind == 3) {
      seen = lampSeen(3.0, vW);
      float u = vP.y;
      if (part < 0.5) {
        float h = vP.z;
        float fold = 0.5 + 0.5 * sin(u * 194.8 + h * 4.0);
        // a shimmer runs along it
        float run = 0.55 + 0.45 * sin(u * 88.0 - uTime * 1.1);
        float shim = pow(0.5 + 0.5 * sin(u * 18.85 - uTime * 0.7), 10.0);
        col = uTint * ((0.16 + 0.9 * fold * (1.0 - 0.6 * h) + 0.7 * smoothstep(0.08, 0.0, h)) * run + 2.2 * shim * (1.0 - 0.5 * h));
      } else {
        float h = vP.z - 1.0;
        col = uTint * 0.55 * (1.0 - h) * (0.6 + 0.4 * sin(u * 900.0 + uTime * 2.0));
      }
    } else if (uKind == 5) {
      // the wall's own gas, with a will: bright along its edges, a seam of
      // light nose to tail (the pulse runs toward the head), ribs of fire off it
      seen = lampSeen(3.0, vW);
      float rim = pow(1.0 - face, 1.6);
      float run = 0.6 + 0.4 * sin(vL.z * 9.0 - uTime * 4.0);
      if (part < 0.5) {
        float seam = smoothstep(0.07, 0.0, abs(vL.x)) * step(0.0, vL.y) * run;
        col = uTint * (0.35 + 1.8 * rim + 1.6 * seam);
        a = 0.3 + 0.7 * max(rim, seam);
      } else if (part < 1.5) {
        col = uTint * (0.6 + 1.4 * rim);
      } else {
        col = uTint * (0.35 + 1.1 * run);
      }
    } else {
      // on X-ray the flesh is a faint shadow and the bones are bright
      seen = lampLit(4.0, vW);
      if (part < 0.5) col = uTint * pow(1.0 - face, 1.5) * 0.22;
      else col = uTint * 0.85 * (0.3 + 0.7 * face);
    }
    if (seen < 0.004) discard;
    gl_FragColor = vec4(col * seen * a, 1.0);
  }
`;

// ---------------------------------------------------------------------------
// The threats: one instanced body each, placed from the CPU; the vertex
// shader works the jaws, the plates and the legs from `aState`.
// ---------------------------------------------------------------------------

// A gulper eel: a jaw that unhinges wider than its body, needle teeth, a whip of a tail.
function eaterGeo(rr) {
  const parts = [];
  parts.push(tag(tube([[0, 0, -1.6], [0, 0, -1.0], [0, 0, -0.3], [0, -0.04, 0.3], [0, 0, 0.62]], [0.008, 0.05, 0.2, 0.34, 0.3], { seg: 24, rad: 10 }), 0));
  for (const up of [1, 0]) {
    const s = up ? 1 : -1, part = up ? 1 : 2;
    const jp = path([[0, s * 0.1, 0.5], [0, s * (up ? 0.22 : 0.3), 1.1], [0, s * 0.12, up ? 1.62 : 1.7]], [0.3, up ? 0.42 : 0.46, 0.07]);
    parts.push(tag(sweep(jp, { seg: 12, rad: 10, sy: 0.2 }), part));
    for (let i = 0; i < 9; i++) {
      const u = 0.18 + i * 0.09, c = jp.at(u), r = jp.r(u);
      for (const side of [-1, 1]) parts.push(tag(fang(side * r * 0.9, c.y - s * 0.02, c.z, side * 0.1, -s, 0.05, 0.12 + rr() * 0.26, 0.018), part));
    }
  }
  return merged(parts);
}
// A flattened lamprey: a ribbed body, and a sucker disc with three rings of rasping teeth.
function leechGeo() {
  const parts = [];
  parts.push(tag(tube([[0, 0, -1.3], [0, 0, -0.7], [0, 0, 0.3], [0, 0, 0.95]], [0.04, 0.3, 0.5, 0.44], { seg: 34, rad: 12, sy: 0.38, ring: 10, ringAmp: 0.16 }), 0));
  const disc = new THREE.LatheGeometry([V2(0.02, -0.07), V2(0.2, -0.03), V2(0.4, 0.03), V2(0.52, 0), V2(0.47, -0.1)], 20);
  disc.rotateX(Math.PI / 2);
  parts.push(tag(at(prep(disc), 0, 0, 0.99, 0, 0, 0, 1, 0.5, 1), 1));
  for (const [r, n] of [[0.13, 8], [0.26, 13], [0.39, 18]]) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + r * 9;
      parts.push(tag(fang(Math.cos(a) * r, Math.sin(a) * r * 0.5, 0.98 + (r - 0.25) * 0.1, -Math.cos(a) * 0.5, -Math.sin(a) * 0.5, 1, 0.1, 0.018), 2));
    }
  }
  return merged(parts);
}
// A giant isopod in mineral armour: five overlapping plates, legs underneath.
function feederGeo() {
  const parts = [];
  const R = [0.46, 0.6, 0.66, 0.6, 0.44];
  for (let i = 0; i < 5; i++) {
    const z0 = -1 + i * 0.4 - 0.05, rows = [];
    for (let r = 0; r <= 3; r++) {
      const u = r / 3, row = [];
      const rad = R[i] * (1 + (r === 0 ? 0.09 : 0)) * (1 - 0.1 * u * (i === 4 ? 2.5 : 1)); // the back edge of each rides over the next... and the last comes to a nose
      for (let c = 0; c <= 10; c++) {
        const a = -1.85 + (c / 10) * 3.7;
        row.push([Math.sin(a) * rad, Math.cos(a) * rad * 0.62, z0 + u * 0.5]);
      }
      rows.push(row);
    }
    parts.push(sheet(rows, (r) => [i, r / 3, 0]));
  }
  parts.push(tag(tube([[0, -0.06, -0.95], [0, -0.06, 0], [0, -0.06, 0.95]], [0.2, 0.42, 0.24], { seg: 10, rad: 8, sy: 0.3 }), 6));
  for (let i = 0; i < 7; i++) {
    const z = -0.75 + i * 0.25;
    for (const s of [-1, 1]) parts.push(tag(fang(s * 0.3, -0.12, z, s * 0.7, -1, 0, 0.42, 0.035, s * -0.1, -0.05, 0), 5));
  }
  for (const s of [-1, 1]) parts.push(tag(fang(s * 0.14, 0.02, 0.98, s * 0.5, 0.1, 1, 0.5, 0.02), 6));
  return merged(parts);
}

const PEST_VERT = /* glsl */ `
  ${LAMP_GLSL}
  attribute float aState; // eaters: how much it is drinking; leeches: 1 on the hull; feeders: how awake
  attribute vec3 aP;
  uniform float uTime;
  uniform int uPest; // 0 eater, 1 leech, 2 feeder
  varying vec3 vW;
  varying vec3 vN;
  varying vec3 vL;
  varying vec3 vP;
  varying float vState;
  ${HINGE}
  void main() {
    vec3 p = position, n = normal;
    vec3 origin = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
    float ph = origin.x * 0.37 + origin.z * 0.21;
    if (uPest == 0) {
      // the jaws open as it nears the beam, and wider as it drinks
      float open = uLampOn * (1.0 - smoothstep(60.0, 420.0, distance(origin, uLampPos + uLampDir * 34.0)));
      if (aP.x > 1.5) p = hinge(p, vec3(0.0, 0.0, 0.5), 0.12 + 0.95 * open + 0.2 * aState);
      else if (aP.x > 0.5) p = hinge(p, vec3(0.0, 0.0, 0.5), -0.04 - 0.5 * open);
      else p.x += sin(uTime * 3.0 + p.z * 2.4 + ph) * 0.12 * smoothstep(0.3, -1.6, p.z); // the tail whips
    } else if (uPest == 1) {
      // free, it swims like a ribbon; on the hull it lies flat and still
      p.y += sin(uTime * 3.0 + p.z * 3.0 + ph) * 0.09 * (1.0 - aState) * smoothstep(0.9, -1.3, p.z);
    } else {
      // asleep it is curled like a stone; awake it unrolls and the legs work
      if (aP.x > 4.5 && aP.x < 5.5) p.z += sin(uTime * 9.0 + p.z * 7.0 + ph) * 0.1 * aState;
      if (aP.x < 4.5) p.y += aState * 0.05 * (0.5 + 0.5 * sin(uTime * 2.4 + aP.x * 1.3 + ph)); // the plates lift
      float k = (1.0 - aState) * 2.7;
      if (k > 0.02) {
        float th = p.z * k, R = 1.0 / k, c = cos(th), s = sin(th);
        p = vec3(p.x, (R + p.y) * c - R, (R + p.y) * s);
        n = vec3(n.x, n.y * c - n.z * s, n.y * s + n.z * c);
      }
    }
    vec4 w = modelMatrix * instanceMatrix * vec4(p, 1.0);
    vW = w.xyz;
    vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * n);
    vL = position;
    vP = aP;
    vState = aState;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;
const EATER_FRAG = /* glsl */ `
  ${LAMP_GLSL}
  uniform float uTime;
  varying vec3 vW;
  varying vec3 vN;
  varying vec3 vL;
  varying vec3 vP;
  varying float vState;
  void main() {
    vec3 v = normalize(cameraPosition - vW);
    float rim = pow(1.0 - abs(dot(normalize(vN), v)), 2.0);
    // black, and only an edge of it catches the light it has come for
    float beam = lampBeam(vW) * uLampOn * uLampLit;
    vec3 col = uLampTint * rim * (0.9 * beam + 0.25 * lampRange(vW) * uLampOn);
    // ...until it is drinking. Then the light goes down its throat and fills
    // the gut, and shows its ribs from the inside.
    float flick = 0.6 + 0.4 * sin(uTime * 9.0 + vW.x);
    if (vP.x < 0.5) {
      float gut = smoothstep(0.62, 0.45, vL.z) * smoothstep(-1.0, -0.55, vL.z);
      float filled = smoothstep(0.0, 0.25, vL.z - (0.6 - vState * 1.7));
      float ribs = 0.25 + 0.75 * smoothstep(0.25, 0.6, abs(sin(vL.z * 21.0)));
      col += uLampTint * vState * gut * filled * ribs * flick * 1.3;
    } else {
      col += uLampTint * vState * flick * rim * 0.8;
    }
    gl_FragColor = vec4(col, 1.0);
  }
`;
const LEECH_FRAG = /* glsl */ `
  ${LAMP_GLSL}
  uniform float uTime;
  varying vec3 vW;
  varying vec3 vN;
  varying vec3 vL;
  varying vec3 vP;
  varying float vState;
  void main() {
    // nothing in any light. In infrared: the warmth it has taken
    float seen = lampSeen(2.0, vW);
    if (seen < 0.004) discard;
    vec3 v = normalize(cameraPosition - vW);
    float face = abs(dot(normalize(vN), v));
    // cold, a dull red shape; feeding, it heats to yellow
    vec3 col = mix(vec3(0.7, 0.08, 0.02), vec3(1.0, 0.75, 0.3), vState) * (0.3 + 0.9 * face) * (0.8 + 0.2 * sin(uTime * 5.0 + vW.y));
    if (vP.x > 1.5) col *= 1.7; // the teeth
    else if (vP.x > 0.5) col *= 0.45 + 0.4 * sin(length(vL.xy * vec2(1.0, 2.0)) * 48.0 - uTime * 3.0 * vState); // the disc, working
    gl_FragColor = vec4(col * seen, 1.0);
  }
`;

const FEEDER_FRAG = /* glsl */ `
  ${LAMP_GLSL}
  uniform float uTime;
  varying vec3 vW;
  varying vec3 vN;
  varying vec3 vL;
  varying vec3 vP;
  varying float vState;
  void main() {
    // dense: X-rays stop in it, so on that band it is a hard bright shape.
    // Awake, it gives some back: blue-white, leaking from between the plates.
    vec3 v = normalize(cameraPosition - vW);
    float face = abs(dot(normalize(vN), v));
    float x = lampLit(4.0, vW);
    vec3 col = vec3(0.85, 0.9, 1.0) * x * (0.35 + 0.9 * face);
    float seam = vP.x < 4.5 ? smoothstep(0.2, 0.0, min(vP.y, 1.0 - vP.y)) : (vP.x > 5.5 ? 0.5 : 0.15);
    col += vec3(0.6, 0.75, 1.0) * vState * (seam + 0.3 * pow(1.0 - face, 2.0)) * (0.25 + 0.6 * lampBeam(vW) * uLampOn) * (0.7 + 0.3 * sin(uTime * 11.0 + vW.z));
    if (dot(col, vec3(1.0)) < 0.004) discard;
    gl_FragColor = vec4(col, 1.0);
  }
`;

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

// k: { group, time, tier, schools: [{ kind, at: Vector3, range, size }], callers: [Vector3],
//      eaters: [Vector3] (their haunts), leeches: [Vector3], feeders: [Vector3], seed,
//      hull? (the vessel's own frame: +z forward, the glass at about z 1.7) }
// Returns the zone's life: step it, ask it what the lamp is on, dispose it.
export function createLife(k) {
  const made = [];
  const groups = []; // what the log can find: { kind, band, at, radius, hold }
  const rnd = rng(k.seed);
  // (the shapes draw on a roll of their own: `rnd` places things, and how many
  // times it is drawn must not change with how a body is built)
  const shape = rng((k.seed ^ 0x5ea11fe) >>> 0);
  let veil = null; // the one veil, if this zone has it: what the CPU needs to turn its face

  // --- the creatures ---
  const byKind = {};
  for (const sc of k.schools) (byKind[sc.kind] = byKind[sc.kind] || []).push(sc);
  for (const kind of Object.keys(byKind)) {
    const list = byKind[kind];
    const per = kind === 'line' ? 1 : kind === 'guard' ? Math.ceil(k.tier.school / 2) : k.tier.school; // (the veil is one animal, and a big one)
    const n = list.length * per;
    const geo = bodyGeometry(kind, shape);
    const home = new Float32Array(n * 3), seed = new Float32Array(n * 4);
    for (let j = 0; j < list.length; j++) {
      const sc = list[j];
      for (let i = 0; i < per; i++) {
        const o = j * per + i;
        home[o * 3] = sc.at.x + (rnd() - 0.5) * sc.range * 0.5;
        home[o * 3 + 1] = sc.at.y + (rnd() - 0.5) * sc.range * 0.5;
        home[o * 3 + 2] = sc.at.z + (rnd() - 0.5) * sc.range * 0.5;
        seed[o * 4] = rnd();
        seed[o * 4 + 1] = kind === 'line' ? sc.range * 0.3 : sc.range * (0.25 + 0.5 * rnd());
        seed[o * 4 + 2] = (kind === 'line' ? 0.03 : kind === 'guard' ? 0.22 + 0.2 * rnd() : 0.08 + 0.14 * rnd()) * (rnd() < 0.5 ? -1 : 1);
        seed[o * 4 + 3] = sc.size * (kind === 'line' ? 1 : 0.6 + 0.8 * rnd());
        // the guards patrol in pairs: every second one keeps station on the one before
        if (kind === 'guard' && i % 2 === 1) {
          for (let q = 0; q < 3; q++) home[o * 3 + q] = home[(o - 1) * 3 + q] + (q === 1 ? seed[(o - 1) * 4 + 3] * 0.9 : 0);
          seed[o * 4] = seed[(o - 1) * 4] + 0.0012;
          seed[o * 4 + 1] = seed[(o - 1) * 4 + 1];
          seed[o * 4 + 2] = seed[(o - 1) * 4 + 2];
        }
        if (kind === 'line') veil = { home: new THREE.Vector3(home[o * 3], home[o * 3 + 1], home[o * 3 + 2]), ph: seed[o * 4], range: seed[o * 4 + 1], speed: seed[o * 4 + 2], yaw: 0, u: null };
      }
      groups.push({ kind, band: bandOf(LIFE[kind].band), at: sc.at, radius: sc.range + sc.size, hold: 0 });
    }
    geo.setAttribute('aHome', new THREE.InstancedBufferAttribute(home, 3));
    geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 4));
    const band = bandOf(LIFE[kind].band);
    const mat = new THREE.ShaderMaterial({
      uniforms: { ...LAMP_U, uTime: k.time, uKind: { value: KIND[kind] }, uTint: { value: new THREE.Color(BANDS[band].tint) }, uVeilYaw: { value: 0 } },
      vertexShader: LIFE_VERT, fragmentShader: LIFE_FRAG,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    });
    if (kind === 'line' && veil) veil.u = mat.uniforms.uVeilYaw;
    const mesh = new THREE.InstancedMesh(geo, mat, n);
    mesh.frustumCulled = false;
    mesh.renderOrder = 5;
    k.group.add(mesh);
    made.push(mesh);
  }
  // the callers: a place and a size, and nothing to draw
  for (const p of k.callers) groups.push({ kind: 'caller', band: BAND.RADIO, at: p, radius: 400, hold: 0 });

  // --- the pests ---
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _v = new THREE.Vector3(), _t = new THREE.Vector3(), _e = new THREE.Euler();
  function pests(homes, count, build, frag, scale, which) {
    if (!homes.length || !count) return null;
    const geo = build(shape);
    const state = new Float32Array(count);
    geo.setAttribute('aState', new THREE.InstancedBufferAttribute(state, 1).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.ShaderMaterial({ uniforms: { ...LAMP_U, uTime: k.time, uPest: { value: which } }, vertexShader: PEST_VERT, fragmentShader: frag, fog: false });
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    k.group.add(mesh);
    made.push(mesh);
    const bodies = [];
    for (let i = 0; i < count; i++) {
      const h = homes[i % homes.length];
      const home = new THREE.Vector3(h.x + (rnd() - 0.5) * 420, h.y + (rnd() - 0.5) * 420, h.z + (rnd() - 0.5) * 420);
      bodies.push({ home, p: home.clone(), v: new THREE.Vector3(), seed: rnd() * 100, on: 0, size: scale * (0.7 + 0.6 * rnd()), slot: new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize() });
    }
    return { mesh, state, bodies };
  }
  const eaters = pests(k.eaters, k.tier.eaters, eaterGeo, EATER_FRAG, 7, 0);
  const leeches = pests(k.leeches, k.tier.leeches, leechGeo, LEECH_FRAG, 3.2, 1);
  const feeders = pests(k.feeders || [], k.tier.feeders, feederGeo, FEEDER_FRAG, 5, 2);

  // toward `to` at up to `speed`, easing: into b.v / b.p
  function seek(b, to, speed, dt) {
    _v.subVectors(to, b.p);
    const d = _v.length();
    if (d > 1e-3) _v.multiplyScalar(Math.min(speed, d * 1.5) / d);
    b.v.lerp(_v, Math.min(1, dt * 1.6));
    b.p.addScaledVector(b.v, dt);
    return d;
  }
  function write(set, i, b, t) {
    _e.set(Math.sin(t * 0.7 + b.seed) * 0.5, Math.atan2(b.v.x, b.v.z), Math.sin(t * 0.5 + b.seed * 2) * 0.4);
    set.mesh.setMatrixAt(i, _m.compose(b.p, _q.setFromEuler(_e), _s.setScalar(b.size)));
  }
  // One leech on the hull is drawn where the pilot cannot miss it: its disc
  // flat against the glass, seen from the inside. Only where it is drawn:
  // `b.p`, and everything that is counted, stay as they were.
  const _glass = new THREE.Vector3(), _turn = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI), _roll = new THREE.Quaternion(), _zAxis = new THREE.Vector3(0, 0, 1);
  function writeOnGlass(set, i, b) {
    const size = Math.min(b.size, 2.6) * 0.42; // (so the disc is the size of a face, not of the window)
    _glass.set(0.7 - (b.seed % 1) * 0.5, 0.42 - ((b.seed * 7) % 1) * 0.3, 1.74 + size * 0.99).applyQuaternion(k.hull.quaternion).add(k.hull.position);
    _q.copy(k.hull.quaternion).multiply(_turn).multiply(_roll.setFromAxisAngle(_zAxis, b.seed));
    set.mesh.setMatrixAt(i, _m.compose(_glass, _q, _s.setScalar(size)));
  }

  let drinking = 0, attached = 0, feeding = 0, awake = 0;

  return {
    groups,
    // Once a frame. `at`: the vessel; `speed`: how fast it is going.
    step(dt, t, at, speed) {
      drinking = 0;
      if (eaters) {
        // any lit band draws them, except the one line they cannot digest
        const bait = lampLive() && (lamp.all || (bandIsBeam(lamp.band) && lamp.band !== BAND.HALPHA));
        _t.copy(lamp.pos).addScaledVector(lamp.dir, 34); // where the beam is thickest
        for (let i = 0; i < eaters.bodies.length; i++) {
          const b = eaters.bodies[i];
          const drawn = bait && b.p.distanceTo(lamp.pos) < C.EZ_EATER_SEES;
          let d;
          if (drawn) {
            _v.copy(_t).addScaledVector(b.slot, 22); // each to its own place in it
            d = seek(b, _v, C.EZ_EATER_SPEED, dt);
          } else {
            _v.copy(b.home);
            _v.x += Math.sin(t * 0.2 + b.seed) * 90;
            _v.y += Math.sin(t * 0.17 + b.seed * 1.7) * 60;
            _v.z += Math.cos(t * 0.23 + b.seed) * 90;
            seek(b, _v, C.EZ_EATER_SPEED * 0.4, dt);
            d = Infinity;
          }
          const want = drawn && d < C.EZ_EATER_DRINK ? 1 : 0;
          b.on += (want - b.on) * Math.min(1, dt * 2);
          drinking += b.on;
          eaters.state[i] = b.on;
          write(eaters, i, b, t);
        }
        eaters.mesh.instanceMatrix.needsUpdate = true;
        eaters.mesh.geometry.attributes.aState.needsUpdate = true;
      }
      lamp.eaters = Math.min(1, drinking / C.EZ_EATER_FULL);

      // the veil turns, slowly, toward the vessel (where it is: the shader's own sum)
      if (veil) {
        const a = veil.ph * 6.2832 + t * veil.speed, b2 = veil.ph * 17 + t * veil.speed * 0.61;
        const want = Math.atan2(at.x - (veil.home.x + veil.range * Math.cos(a) * Math.cos(b2 * 0.5)), at.z - (veil.home.z + veil.range * Math.sin(a) * Math.cos(b2 * 0.5)));
        const d = Math.atan2(Math.sin(want - veil.yaw), Math.cos(want - veil.yaw));
        veil.yaw += Math.max(-0.12 * dt, Math.min(0.12 * dt, d));
        veil.u.value = veil.yaw;
      }

      attached = 0;
      let onGlass = false;
      if (leeches) {
        for (let i = 0; i < leeches.bodies.length; i++) {
          const b = leeches.bodies[i];
          const d0 = b.p.distanceTo(at);
          if (b.on > 0.5) {
            // on the hull: carried along, until the water tears it off
            b.grip = speed > C.EZ_LEECH_SHAKE ? (b.grip || 0) + dt : 0;
            if (b.grip > 1.2) {
              b.on = 0;
              b.grip = 0;
              b.v.copy(b.slot).multiplyScalar(30);
            } else {
              b.p.copy(at).addScaledVector(b.slot, 4.2);
              attached++;
            }
          } else if (d0 < C.EZ_LEECH_SEES && speed < C.EZ_LEECH_SHAKE) {
            _v.copy(at).addScaledVector(b.slot, 4.2);
            if (seek(b, _v, C.EZ_LEECH_SPEED, dt) < 3) b.on = 1;
          } else {
            _v.copy(b.home);
            _v.y += Math.sin(t * 0.15 + b.seed) * 80;
            seek(b, _v, C.EZ_LEECH_SPEED * 0.4, dt);
          }
          leeches.state[i] = b.on;
          if (k.hull && b.on > 0.5 && !onGlass) {
            onGlass = true;
            writeOnGlass(leeches, i, b);
          } else write(leeches, i, b, t);
        }
        leeches.mesh.instanceMatrix.needsUpdate = true;
        leeches.mesh.geometry.attributes.aState.needsUpdate = true;
      }
      feeding = 0;
      if (feeders) {
        // X-rays in reach wake them; without any they settle after a while
        const xray = lampLive() && (lamp.all || lamp.band === BAND.XRAY);
        let near = false;
        for (let i = 0; i < feeders.bodies.length && !near; i++) near = feeders.bodies[i].p.distanceTo(lamp.pos) < C.EZ_FEEDER_SEES;
        awake = xray && near ? C.EZ_FEEDER_SLEEP : Math.max(0, awake - dt);
        _t.copy(lamp.pos).addScaledVector(lamp.dir, 26);
        for (let i = 0; i < feeders.bodies.length; i++) {
          const b = feeders.bodies[i];
          let d = Infinity;
          if (awake > 0) {
            _v.copy(_t).addScaledVector(b.slot, 20);
            d = seek(b, _v, C.EZ_FEEDER_SPEED, dt);
          } else seek(b, b.home, C.EZ_FEEDER_SPEED * 0.5, dt);
          const want = awake > 0 ? (d < 70 ? 1 : 0.4) : 0;
          b.on += (want - b.on) * Math.min(1, dt * 2);
          if (b.on > 0.7) feeding++;
          feeders.state[i] = b.on;
          write(feeders, i, b, t);
        }
        feeders.mesh.instanceMatrix.needsUpdate = true;
        feeders.mesh.geometry.attributes.aState.needsUpdate = true;
      }
      lamp.feeders = Math.min(1, feeding / 3);

      lamp.cabin = attached
        ? Math.max(0, lamp.cabin - C.EZ_CABIN_DRAIN * attached * dt)
        : Math.min(1, lamp.cabin + C.EZ_CABIN_WARM * dt);
    },
    // Is the lamp, as it is now, on this group? (The shaders' test, for a
    // school with some size to it.)
    shows(g) {
      if (!lampLive() || !(lamp.all || lamp.band === g.band)) return false;
      _v.subVectors(g.at, lamp.pos);
      const d = _v.length();
      if (g.band !== BAND.RADIO && d - g.radius > lamp.reach) return false;
      if (d < g.radius) return true; // in among them
      const ang = Math.acos(Math.min(1, _v.dot(lamp.dir) / d));
      const slack = Math.atan2(g.radius, d);
      if (g.band === BAND.RADIO) return ang < 0.32;
      return ang < (bandIsBeam(g.band) ? C.EZ_LAMP_CONE : 1.0) + slack;
    },
    // how nearly the lamp points at a caller, 0..1 (the radio band's sound)
    radioNear() {
      let near = 0;
      for (const g of groups) {
        if (g.band !== BAND.RADIO) continue;
        _v.subVectors(g.at, lamp.pos).normalize();
        near = Math.max(near, (_v.dot(lamp.dir) - 0.55) / 0.45);
      }
      return near;
    },
    drinking: () => drinking,
    attached: () => attached,
    feeding: () => feeding,
    dispose() {
      for (const m of made) {
        k.group.remove(m);
        m.geometry.dispose();
        m.material.dispose();
      }
    },
    info: () => ({
      groups: groups.map((g) => ({ kind: g.kind, band: BANDS[g.band].id, at: g.at.toArray().map(Math.round), radius: Math.round(g.radius) })),
      eaters: eaters ? eaters.bodies.length : 0, leeches: leeches ? leeches.bodies.length : 0, feeders: feeders ? feeders.bodies.length : 0,
      drinking: +drinking.toFixed(2), attached, feeding, awake: +awake.toFixed(1),
      feederAt: feeders ? feeders.bodies[0].p.toArray().map(Math.round) : null,
      eaterAt: eaters ? eaters.bodies[0].p.toArray().map(Math.round) : null,
      leechAt: leeches ? leeches.bodies[0].p.toArray().map(Math.round) : null,
    }),
  };
}
