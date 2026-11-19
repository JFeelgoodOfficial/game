// Three districts off the terrace of the City of Light (GDD 5.7.4).
//
// The ships' companies that stayed did not only hang bells and banners on what
// was there. Over forty generations each people built a quarter of its own,
// out from the terrace on a bridge over the rail, and then let the other two
// into it:
//
//   The Seam        Rustia's: a forge quarter set down below the terrace, its
//                   furnaces lit through their grates, ore going round on a
//                   rail, and a wall with every name that came off the ships
//   The Ninth Bell  Saturnia's: a garden raised above it, a ring walk round a
//                   well of light, eight bells on arches and a ninth, greater,
//                   that anyone may ring
//   Saturday        Wavemall Prime's: an arcade on two floors under a glass
//                   roof, shopfronts lit in pink and cyan, a moving stair, and
//                   a desk where somebody is always on shift
//
// Each has one thing in it to find, which goes in the codex. They are built
// the first time the city is entered with the light ship home, into the
// city's own walkable site: the surfaces, colliders and consoles pushed here
// are the site's live lists (world/lightcity.js).
//
// Every word is in world/chapter-dialogue.js (DISTRICTS).

import * as THREE from 'three';
import { addCodex } from '../src/journal.js';
import { chime, uiSound } from '../src/sfx.js';
import { label } from '../src/holoLabel.js';
import { tint, box, cyl, mergedMesh } from './capital.js';
import { DISTRICTS } from './chapter-dialogue.js';

const TERR = { x: 0, z: -77, r: 20 }; // world/lightcity.js
const BRIDGE_W = 5;
export const SEAM = { id: 'seam', x: -80, z: -152, r: 24, y: -4 };
export const BELL = { id: 'bell', x: 0, z: -182, r: 28, y: 3 };
export const SAT = { id: 'saturday', x: 80, z: -152, r: 22, y: 0, hx: 24, hz: 14 };
export const DISTRICT_LIST = [SEAM, BELL, SAT];
// the way each lies from the terrace's middle (unit, xz): where its bridge leaves
export const DISTRICT_DIRS = DISTRICT_LIST.map((d) => {
  const dx = d.x - TERR.x, dz = d.z - TERR.z, l = Math.hypot(dx, dz);
  return [dx / l, dz / l];
});

const RUST = 0x8a3f20, IRON = 0x23201f, EMBER = 0xff8a3a, GOLD = 0xe9c46a, PALE = 0xf1ecdf, PINK = 0xff6fae, CYAN = 0x82f7ff, STONE = 0xe9e6dd;

// The floors, laid over the slabs: one shader, four kinds of paving (aKind),
// all of it worked out from where the fragment is, so there is no texture to
// load and no seam where one floor meets the next.
//   0  The Seam: iron tread plate in big bolted sheets, rust where feet do not go
//   1  The Ninth Bell: pale limestone flags in a running bond, worn, gold in the joints
//   2  Saturday: polished marble, rose and plum in a checker, veined, brass
//      strips between, a cyan border every fourth tile; the shopfronts in it
//   3  the bridges: long granite setts, a gold line down each edge
const TILE_VERT = /* glsl */ `
  attribute float aKind;
  varying vec3 vWorld;
  varying float vKind;
  void main() {
    vKind = aKind;
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;
const TILE_FRAG = /* glsl */ `
  uniform vec3 uLight;
  uniform float uTime;
  varying vec3 vWorld;
  varying float vKind;
  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) { v += a * noise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; }
    return v;
  }
  // a joint of half-width w (in cell units) round every cell edge, antialiased
  float joint(vec2 q, float w) {
    vec2 f = abs(fract(q) - 0.5), fw = fwidth(q) * 1.2;
    vec2 e = smoothstep(vec2(0.5 - w) - fw, vec2(0.5 - w), f);
    return max(e.x, e.y);
  }
  void main() {
    vec2 p = vWorld.xz;
    vec3 V = normalize(cameraPosition - vWorld);
    vec3 N = vec3(0.0, 1.0, 0.0);
    vec3 alb; float gloss; float rough; vec3 lineGlow = vec3(0.0);
    int kind = int(vKind + 0.5);
    if (kind == 0) {
      // tread plate: sheets 2.4 x 1.2 bolted at the corners, raised lozenges across each
      vec2 q = p / vec2(2.4, 1.2);
      float tone = hash(floor(q));
      float seam = joint(q, 0.012);
      vec2 lz = fract(p * vec2(3.2, 3.2) + vec2(floor(p.y * 3.2) * 0.5, 0.0)) - 0.5;
      lz = mat2(0.7071, -0.7071, 0.7071, 0.7071) * lz;
      float bump = smoothstep(0.1, 0.04, abs(lz.x)) * smoothstep(0.33, 0.25, abs(lz.y));
      vec2 bc = abs(fract(q) - 0.5) * vec2(2.4, 1.2) - vec2(1.08, 0.48);
      float bolt = 1.0 - smoothstep(0.035, 0.05, length(bc));
      float rust = smoothstep(0.45, 0.8, fbm(p * 0.35 + tone));
      alb = mix(vec3(0.16, 0.15, 0.15), vec3(0.24, 0.23, 0.22), tone);
      alb = mix(alb, vec3(0.36, 0.17, 0.08), rust * 0.75);
      alb *= 1.0 - 0.55 * seam;
      alb += vec3(0.08) * bump + vec3(0.12) * bolt;
      gloss = 0.35 * (1.0 - rust) + 0.3 * bump; rough = 0.25;
      // the furnaces in it
      lineGlow = vec3(1.0, 0.45, 0.15) * 0.06 * (0.8 + 0.2 * sin(uTime * 3.0 + p.x));
    } else if (kind == 1) {
      // flags: rows 1.1 deep, each row offset, stones of three lengths
      float row = floor(p.y / 1.1);
      float len = 1.3 + floor(hash(vec2(row, 3.0)) * 3.0) * 0.45;
      vec2 q = vec2(p.x / len + hash(vec2(row, 7.0)), p.y / 1.1);
      float tone = hash(floor(q) + row * 13.0);
      float seam = joint(q, 0.018);
      float wear = fbm(p * 0.6);
      float fleck = step(0.93, hash(floor(p * 18.0)));
      alb = mix(vec3(0.78, 0.75, 0.68), vec3(0.9, 0.88, 0.82), tone) * (0.88 + 0.2 * wear);
      alb = mix(alb, vec3(0.62, 0.58, 0.5), fleck * 0.5);
      alb = mix(alb, vec3(0.85, 0.66, 0.3), seam * 0.85);
      lineGlow = vec3(1.0, 0.85, 0.5) * seam * 0.25;
      gloss = 0.18 + 0.12 * (1.0 - wear); rough = 0.5;
    } else if (kind == 2) {
      // marble: a 1.6 checker, every tile veined its own way
      vec2 q = p / 1.6;
      vec2 cell = floor(q);
      float chk = mod(cell.x + cell.y, 2.0);
      float tone = hash(cell);
      vec2 vp = p * 0.9 + tone * 17.0;
      float vein = abs(sin((vp.x + vp.y * 0.6) * 2.2 + fbm(vp * 1.3) * 6.0));
      vein = pow(1.0 - vein, 9.0);
      float cloud = fbm(vp * 2.4);
      vec3 rose = mix(vec3(0.93, 0.84, 0.88), vec3(0.98, 0.93, 0.95), cloud);
      vec3 plum = mix(vec3(0.13, 0.08, 0.16), vec3(0.22, 0.13, 0.25), cloud);
      alb = mix(rose, plum, chk);
      alb = mix(alb, chk > 0.5 ? vec3(0.85, 0.7, 0.9) : vec3(0.55, 0.42, 0.5), vein * 0.7);
      float brass = joint(q, 0.022);
      alb = mix(alb, vec3(0.78, 0.6, 0.3), brass);
      // a cyan strip every fourth tile, and pink between
      vec2 q4 = p / 6.4;
      float band = joint(q4, 0.006);
      lineGlow = mix(vec3(1.0, 0.42, 0.7), vec3(0.5, 0.97, 1.0), step(0.5, mod(floor(q4.x) + floor(q4.y), 2.0))) * band * 1.4;
      gloss = 0.9; rough = 0.06;
    } else {
      // setts: 0.9 x 0.45, running bond along x
      float row = floor(p.y / 0.45);
      vec2 q = vec2(p.x / 0.9 + mod(row, 2.0) * 0.5, p.y / 0.45);
      float tone = hash(floor(q));
      float seam = joint(q, 0.04);
      float grain = noise(p * 25.0);
      alb = mix(vec3(0.5, 0.5, 0.53), vec3(0.66, 0.65, 0.66), tone) * (0.9 + 0.15 * grain);
      alb *= 1.0 - 0.45 * seam;
      gloss = 0.3; rough = 0.3;
    }
    // light: the white hole overhead, and the sky in the polish
    vec3 L = normalize(uLight);
    float diff = 0.55 + 0.55 * max(dot(N, L), 0.0);
    vec3 H = normalize(L + V);
    float spec = pow(max(dot(N, H), 0.0), mix(18.0, 240.0, 1.0 - rough)) * gloss * 1.6;
    vec3 R = reflect(-V, N);
    vec3 sky = mix(vec3(0.62, 0.76, 0.95), vec3(0.95, 0.97, 1.0), pow(max(R.y, 0.0), 0.6));
    float fres = 0.04 + 0.96 * pow(1.0 - max(V.y, 0.0), 5.0);
    vec3 col = alb * diff * vec3(1.0, 0.97, 0.92) + sky * fres * gloss * 0.6 + vec3(1.0, 0.96, 0.88) * spec + lineGlow;
    gl_FragColor = vec4(col, 1.0);
  }
`;

const kinded = (g, kind) => {
  const n = g.attributes.position.count;
  g.setAttribute('aKind', new THREE.BufferAttribute(new Float32Array(n).fill(kind), 1));
  // (the normal stays: the ambient-occlusion pass reads it, and a floor without one goes black under it)
  for (const a of Object.keys(g.attributes)) if (a !== 'position' && a !== 'normal' && a !== 'aKind') g.deleteAttribute(a);
  return g.index ? g.toNonIndexed() : g;
};
const flatDisc = (x, y, z, r, kind) => kinded(new THREE.CircleGeometry(r, 48).rotateX(-Math.PI / 2).translate(x, y, z), kind);
const flatRect = (x, y, z, w, d, kind) => kinded(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2).translate(x, y, z), kind);
// an annulus, for a floor with a hole in it
const flatRing = (x, y, z, r0, r1, kind) => kinded(new THREE.RingGeometry(r0, r1, 56, 1).rotateX(-Math.PI / 2).translate(x, y, z), kind);

// k: { group, surfaces, colliders, consoles, chapter, lightDir }
export function createDistricts(k) {
  const { surfaces, colliders, consoles } = k;
  const root = new THREE.Group();
  k.group.add(root);
  const lit = [], glow = [], glass = [], tiles = [];
  const solid = (x, z, r) => colliders.push({ x, z, r, top: Infinity });

  // a slab from A to B (it may slope), walkable
  function span(ax, ay, az, bx, by, bz, width, hex) {
    const run = Math.hypot(bx - ax, bz - az), len = Math.hypot(run, by - ay);
    const g = new THREE.BoxGeometry(len, 0.4, width);
    g.rotateZ(Math.atan2(by - ay, run)).rotateY(-Math.atan2(bz - az, bx - ax)).translate((ax + bx) / 2, (ay + by) / 2 - 0.2, (az + bz) / 2);
    lit.push(tint(g, hex));
    // its paving, laid on top
    const pv = new THREE.PlaneGeometry(len, width - 0.3).rotateX(-Math.PI / 2);
    pv.rotateZ(Math.atan2(by - ay, run)).rotateY(-Math.atan2(bz - az, bx - ax)).translate((ax + bx) / 2, (ay + by) / 2 + 0.012, (az + bz) / 2);
    tiles.push(kinded(pv, 3));
    for (const s of [-1, 1]) {
      const e = new THREE.BoxGeometry(len, 0.07, 0.14);
      e.rotateZ(Math.atan2(by - ay, run)).rotateY(-Math.atan2(bz - az, bx - ax));
      const nx = -(bz - az) / run, nz = (bx - ax) / run;
      e.translate((ax + bx) / 2 + nx * s * (width / 2 - 0.1), (ay + by) / 2 + 0.04, (az + bz) / 2 + nz * s * (width / 2 - 0.1));
      glow.push(tint(e, 0xffe2a0, 1.3));
    }
    surfaces.push({ kind: 'rect', cx: (ax + bx) / 2, cz: (az + bz) / 2, ux: (bx - ax) / run, uz: (bz - az) / run, hl: run / 2 + 0.3, hw: width / 2, yA: ay, yB: by });
  }
  // the bridge out to a district: up and over the terrace's rail, then on.
  // `land`: where it comes down, if not straight at the district's middle, and
  // `walkIn`: a level run from there to inside (Saturday's way in is its open
  // end: straight at the middle the bridge met the wall of shops)
  function bridge(d, i, hex, signCol, land, walkIn) {
    const [ux, uz] = DISTRICT_DIRS[i];
    const p0 = [TERR.x + ux * 16.2, TERR.z + uz * 16.2], p1 = [TERR.x + ux * 21.4, TERR.z + uz * 21.4];
    const reach = d.hx ? Math.min(d.hx, d.hz) : d.r;
    const p2 = land || [d.x - ux * (reach - 1.5), d.z - uz * (reach - 1.5)];
    span(p0[0], 0, p0[1], p1[0], 1.3, p1[1], BRIDGE_W, STONE);
    span(p1[0], 1.3, p1[1], p2[0], d.y, p2[1], BRIDGE_W, hex);
    if (walkIn) {
      // a round landing where the two runs meet, so the turn has floor under it
      lit.push(tint(cyl(BRIDGE_W * 0.72, BRIDGE_W * 0.72, 0.4, p2[0], d.y - 0.2, p2[1], 20), hex));
      tiles.push(flatDisc(p2[0], d.y + 0.013, p2[1], BRIDGE_W * 0.72, 3));
      surfaces.push({ kind: 'disc', cx: p2[0], cz: p2[1], r: BRIDGE_W * 0.72, y: d.y });
      span(p2[0], d.y, p2[1], walkIn[0], d.y, walkIn[1], BRIDGE_W, hex);
    }
    // a gate where it leaves, with the district's name over it
    for (const s of [-1, 1]) {
      const gx = p1[0] - uz * s * (BRIDGE_W / 2 + 0.2), gz = p1[1] + ux * s * (BRIDGE_W / 2 + 0.2);
      lit.push(tint(cyl(0.22, 0.3, 6.4, gx, 4.4, gz, 8), hex));
      glow.push(tint(cyl(0.34, 0.34, 0.3, gx, 7.7, gz, 8), signCol, 1.8));
    }
    const sign = label(DISTRICTS[d.id].name, signCol, 8);
    sign.position.set(p1[0], 8.6, p1[1]);
    root.add(sign);
  }
  // what there is to find in a district: said once, and written down
  function find(d, x, z, r, extra) {
    const f = DISTRICTS[d.id].find;
    consoles.push({
      x, y: d.y, z, r, prompt: f.prompt,
      use() {
        if (extra) extra();
        if (!found[d.id]) {
          found[d.id] = true;
          addCodex(f.codex);
        }
        return { speaker: { name: f.speaker, species: f.species, cityId: DISTRICTS[d.id].name }, lines: f.lines };
      },
    });
  }
  const found = {};

  // ===================== The Seam =====================
  {
    const d = SEAM, y = d.y;
    bridge(d, 0, IRON, '#ffb070');
    lit.push(tint(cyl(d.r, d.r - 2.5, 1.0, d.x, y - 0.5, d.z, 40), IRON));
    lit.push(tint(cyl(d.r - 8, 3, 30, d.x, y - 16, d.z, 20), 0x151312));
    surfaces.push({ kind: 'disc', cx: d.x, cz: d.z, r: d.r, y });
    // tread plate underfoot (TILE_FRAG), a lip of rust round it, and the rail the ore goes round on
    tiles.push(flatDisc(d.x, y + 0.012, d.z, d.r - 0.4, 0));
    lit.push(tint(new THREE.TorusGeometry(d.r - 0.35, 0.12, 5, 72).rotateX(Math.PI / 2).translate(d.x, y + 0.05, d.z), RUST));
    for (const rr of [15.2, 16.4]) lit.push(tint(new THREE.TorusGeometry(rr, 0.07, 5, 72).rotateX(Math.PI / 2).translate(d.x, y + 0.12, d.z), 0x55504c));
    // four furnaces round the edge: a block, a grate with the fire behind it, a stack
    for (let i = 0; i < 4; i++) {
      const a = 0.9 + i * 1.32, fx = d.x + Math.cos(a) * (d.r - 4), fz = d.z + Math.sin(a) * (d.r - 4);
      lit.push(tint(box(5.4, 6.2, 5.0, fx, y + 3.1, fz, -a), IRON));
      lit.push(tint(box(6.0, 0.5, 5.6, fx, y + 6.4, fz, -a), RUST));
      const gx = fx - Math.cos(a) * 2.55, gz = fz - Math.sin(a) * 2.55;
      glow.push(tint(box(0.1, 2.2, 2.8, gx, y + 1.9, gz, -a), EMBER, 2.2));
      for (let b = -1; b <= 1; b++) lit.push(tint(box(0.16, 2.4, 0.16, gx - Math.cos(a) * 0.08 - Math.sin(a) * b * 0.8, y + 1.9, gz - Math.sin(a) * 0.08 + Math.cos(a) * b * 0.8), IRON));
      lit.push(tint(cyl(0.7, 1.0, 13, fx, y + 12.9, fz, 10), IRON));
      glow.push(tint(cyl(0.6, 0.6, 0.25, fx, y + 19.5, fz, 10), EMBER, 1.8));
      solid(fx, fz, 3.6);
    }
    // anvils and stock about the middle
    for (const [ox, oz] of [[-3, 2], [4, -1], [0, -5]]) {
      lit.push(tint(box(1.6, 0.9, 0.8, d.x + ox, y + 0.45, d.z + oz, ox), 0x3a3634));
      lit.push(tint(box(2.0, 0.3, 0.9, d.x + ox, y + 1.05, d.z + oz, ox), 0x55504c));
      solid(d.x + ox, d.z + oz, 1.1);
    }
    // the other two peoples, here: a frame of Saturnia's bells over the floor, and a Wavemall sign that never goes off
    for (let i = 0; i < 5; i++) {
      const bx = d.x - 6 + i * 3;
      lit.push(tint(cyl(0.3, 0.75, 1.0, bx, y + 8.2, d.z + 9, 10), GOLD));
      lit.push(tint(cyl(0.03, 0.03, 1.6, bx, y + 9.5, d.z + 9, 4), GOLD));
    }
    lit.push(tint(box(14, 0.25, 0.25, d.x, y + 10.3, d.z + 9), IRON));
    for (const s of [-1, 1]) lit.push(tint(cyl(0.18, 0.24, 10.3, d.x + s * 7, y + 5.15, d.z + 9, 6), IRON));
    const neon = label(DISTRICTS.seam.sign, '#ffc9ec', 7);
    neon.position.set(d.x + 4, y + 9, d.z - 12);
    root.add(neon);
    // the wall of names, on the far side from the bridge
    const [ux, uz] = DISTRICT_DIRS[0];
    const wx = d.x + ux * (d.r - 2.2), wz = d.z + uz * (d.r - 2.2), wa = Math.atan2(-uz, ux) + Math.PI / 2;
    lit.push(tint(box(18, 6.5, 0.8, wx, y + 3.25, wz, -Math.atan2(uz, ux) + Math.PI / 2), 0x3a3634));
    for (let row = 0; row < 9; row++) {
      for (let col = 0; col < 22; col++) {
        if ((row * 7 + col * 13) % 5 === 0) continue;
        const o = (col - 10.5) * 0.76;
        glow.push(tint(box(0.5 + ((row + col) % 3) * 0.08, 0.1, 0.06, wx - uz * o - ux * 0.43, y + 0.9 + row * 0.6, wz + ux * o - uz * 0.43, wa), row % 3 === 1 ? 0xffd9a0 : EMBER, 1.1));
      }
    }
    find(d, wx - ux * 2.6, wz - uz * 2.6, 4);
  }
  // the ore carts: one mesh, going round
  const carts = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    carts.push(tint(box(2.0, 0.9, 1.3, Math.cos(a) * 15.8, 0.75, Math.sin(a) * 15.8, -a + Math.PI / 2), 0x3a3634));
    carts.push(tint(new THREE.IcosahedronGeometry(0.62, 0).translate(Math.cos(a) * 15.8, 1.35, Math.sin(a) * 15.8), i % 2 ? 0xb5532a : 0xffb060, i % 2 ? 1 : 1.6));
  }

  // ===================== The Ninth Bell =====================
  let ninth = null;
  {
    const d = BELL, y = d.y;
    bridge(d, 1, PALE, '#ffe2a0');
    lit.push(tint(cyl(d.r, d.r - 3, 1.0, d.x, y - 0.5, d.z, 56), PALE));
    lit.push(tint(cyl(d.r - 10, 4, 34, d.x, y - 18, d.z, 24), 0xcfc9bb));
    surfaces.push({ kind: 'disc', cx: d.x, cz: d.z, r: d.r, y });
    // the well of light in the middle: a low wall round it, and nothing in it but light
    const WELL = 11;
    tiles.push(flatRing(d.x, y + 0.012, d.z, WELL - 0.3, d.r - 0.4, 1));
    lit.push(tint(new THREE.TorusGeometry(WELL, 0.5, 8, 56).rotateX(Math.PI / 2).translate(d.x, y + 0.45, d.z), PALE));
    glow.push(tint(cyl(WELL - 0.4, WELL - 0.4, 0.05, d.x, y + 0.12, d.z, 48), 0x9fe8ff, 0.55));
    for (let i = 0; i < 5; i++) glow.push(tint(new THREE.TorusGeometry(2 + i * 2, 0.04, 5, 48).rotateX(Math.PI / 2).translate(d.x, y + 0.16, d.z), 0xffffff, 1.2));
    solid(d.x, d.z, WELL + 0.4);
    // eight bells on arches round the walk
    const [ux, uz] = DISTRICT_DIRS[1];
    const far = Math.atan2(uz, ux); // the side away from the bridge
    for (let i = 1; i < 9; i++) {
      const a = far + (i / 9) * Math.PI * 2, bx = d.x + Math.cos(a) * 20, bz = d.z + Math.sin(a) * 20;
      lit.push(tint(new THREE.TorusGeometry(2.6, 0.14, 6, 24, Math.PI).rotateY(-a + Math.PI / 2).translate(bx, y + 3.2, bz), GOLD));
      for (const s of [-1, 1]) lit.push(tint(cyl(0.14, 0.2, 3.2, bx - Math.sin(a) * s * 2.6, y + 1.6, bz + Math.cos(a) * s * 2.6, 6), GOLD));
      lit.push(tint(cyl(0.35, 0.95, 1.3, bx, y + 4.2, bz, 12), GOLD));
      glow.push(tint(cyl(0.14, 0.14, 0.14, bx, y + 3.45, bz, 6), 0xfff2b8, 1.6));
    }
    // a garden between them: trees of pale light, low beds
    for (let i = 0; i < 14; i++) {
      const a = i * 0.449 + 0.2, r = 14.5 + (i % 3) * 4.2;
      const tx = d.x + Math.cos(a) * r, tz = d.z + Math.sin(a) * r;
      if (Math.hypot(tx - (d.x - ux * 26), tz - (d.z - uz * 26)) < 7) continue; // the way in
      lit.push(tint(cyl(0.12, 0.2, 2.4, tx, y + 1.2, tz, 6), 0xcfc9bb));
      glow.push(tint(new THREE.ConeGeometry(1.1, 2.6, 7).translate(tx, y + 3.6, tz), i % 2 ? 0xfff2b8 : 0xbfe8ff, 0.75));
      glow.push(tint(new THREE.ConeGeometry(0.8, 1.8, 7).translate(tx, y + 4.9, tz), i % 2 ? 0xfff2b8 : 0xbfe8ff, 0.9));
      solid(tx, tz, 0.5);
    }
    // the other two, here: Rustia's braziers at the way in, Wavemall's lights strung between the arches
    for (const s of [-1, 1]) {
      const px = d.x - ux * (d.r - 3) - uz * s * 4.5, pz = d.z - uz * (d.r - 3) + ux * s * 4.5;
      lit.push(tint(cyl(0.7, 0.35, 0.9, px, y + 0.45, pz, 8), 0xb5532a));
      glow.push(tint(cyl(0.55, 0.55, 0.12, px, y + 0.92, pz, 8), EMBER, 2.0));
      solid(px, pz, 0.8);
    }
    for (let i = 0; i < 64; i++) {
      const a = (i / 64) * Math.PI * 2;
      glow.push(tint(box(0.18, 0.18, 0.18, d.x + Math.cos(a) * 20, y + 6.0 + 0.5 * Math.cos(a * 9), d.z + Math.sin(a) * 20), i % 2 ? PINK : CYAN, 1.7));
    }
    // the ninth: on a stand of its own on the far side, and it swings
    const nx = d.x + Math.cos(far) * 20, nz = d.z + Math.sin(far) * 20;
    for (const s of [-1, 1]) lit.push(tint(cyl(0.3, 0.42, 8.5, nx - Math.sin(far) * s * 3.4, y + 4.25, nz + Math.cos(far) * s * 3.4, 8), GOLD));
    lit.push(tint(box(0.5, 0.5, 7.6, nx, y + 8.6, nz, -far), GOLD));
    ninth = new THREE.Group();
    ninth.position.set(nx, y + 8.4, nz);
    ninth.rotation.y = -far;
    ninth.add(mergedMesh([
      tint(new THREE.CylinderGeometry(0.75, 2.3, 3.2, 20, 1, true).translate(0, -2.4, 0), GOLD),
      tint(new THREE.CylinderGeometry(0.75, 0.75, 0.3, 20).translate(0, -0.85, 0), GOLD),
      tint(new THREE.CylinderGeometry(0.06, 0.06, 0.9, 6).translate(0, -0.35, 0), GOLD),
    ].map((g) => (g.index ? g.toNonIndexed() : g)), new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x4a3a12, side: THREE.DoubleSide })));
    root.add(ninth);
    find(d, nx - Math.cos(far) * 3.2, nz - Math.sin(far) * 3.2, 3.6, () => {
      rung = 1;
      chime(98);
      uiSound('cheer');
    });
  }
  let rung = 0;

  // ===================== Saturday =====================
  {
    const d = SAT, y = d.y, UP = 5.2;
    const WEST = d.x - d.hx; // the open end, where the way in is
    bridge(d, 2, 0xf2a6d8, '#a9f7ff', [WEST - 7, d.z], [WEST + 1.5, d.z]);
    // the arcade lies along x; the bridge comes in at its open west end
    lit.push(tint(box(d.hx * 2, 0.8, d.hz * 2, d.x, y - 0.4, d.z), 0x2a2238));
    lit.push(tint(cyl(9, 3, 26, d.x, y - 13.8, d.z, 16), 0x1a1622));
    surfaces.push({ kind: 'rect', cx: d.x, cz: d.z, ux: 1, uz: 0, hl: d.hx, hw: d.hz, yA: y, yB: y });
    tiles.push(flatRect(d.x, y + 0.012, d.z, d.hx * 2 - 0.2, d.hz * 2 - 0.2, 2));
    // what is on the shelves: a seeded jumble, so no two shops stock the same
    let ss = 0x5a7d41;
    const rnd = () => ((ss = (Math.imul(ss, 1664525) + 1013904223) >>> 0), ss / 4294967296);
    const GOODS = [PINK, CYAN, 0xffe2a0, 0xf6f2f8, 0x8a6fd8, 0xff9a4a, 0x7dffb0, 0xffffff];
    const WALL = 0x241d30, TRIM = 0xc9a455;
    // One shop: a room open at the front behind glass, lit inside, its stock
    // on shelves, a rail or a counter. `kind`: 0 shelves, 1 a rail of clothes, 2 a counter and stools.
    function shop(sx, sz, s, base, col, kind) {
      const W = 7.0, D = 4.2, H = 4.4, front = sz - s * (D / 2), back = sz + s * (D / 2);
      lit.push(tint(box(W, H, 0.2, sx, base + H / 2, back - s * 0.1), WALL));
      for (const e of [-1, 1]) lit.push(tint(box(0.24, H, D, sx + e * (W / 2 - 0.12), base + H / 2, sz), WALL));
      lit.push(tint(box(W, 0.24, D, sx, base + H - 0.12, sz), WALL));
      // the light inside: a lit back wall, and three downlights
      glow.push(tint(box(W - 0.9, H - 1.6, 0.04, sx, base + 0.4 + (H - 1.6) / 2, back - s * 0.23), col, 0.42));
      for (const e of [-2, 0, 2]) glow.push(tint(cyl(0.24, 0.24, 0.04, sx + e, base + H - 0.26, sz, 10), 0xfff8ea, 1.7));
      if (kind === 0) {
        for (const h of [0.9, 1.7, 2.5, 3.3]) {
          lit.push(tint(box(W - 0.9, 0.06, 0.55, sx, base + h, back - s * 0.55), TRIM));
          for (let gx = -2.9; gx < 2.9;) {
            const w = 0.2 + rnd() * 0.3, t = 0.2 + rnd() * 0.42;
            lit.push(tint(box(w, t, 0.32, sx + gx + w / 2, base + h + 0.03 + t / 2, back - s * 0.55), GOODS[Math.floor(rnd() * GOODS.length)]));
            gx += w + 0.05 + rnd() * 0.12;
          }
        }
        // ...and a table of it in the window
        lit.push(tint(box(2.2, 0.75, 1.0, sx - 1.2, base + 0.375, sz - s * 0.6), TRIM));
        for (let n = 0; n < 5; n++) lit.push(tint(box(0.3, 0.25 + rnd() * 0.3, 0.3, sx - 2.0 + n * 0.4, base + 0.9, sz - s * 0.6), GOODS[Math.floor(rnd() * GOODS.length)]));
      } else if (kind === 1) {
        // a rail, things hanging from it, and a figure in the window wearing one
        lit.push(tint(box(W - 1.4, 0.06, 0.06, sx, base + 2.3, back - s * 0.8), TRIM));
        for (let n = 0; n < 11; n++) lit.push(tint(box(0.08, 1.1 + rnd() * 0.25, 0.62, sx - 2.6 + n * 0.52, base + 1.65, back - s * 0.8), GOODS[Math.floor(rnd() * GOODS.length)]));
        const mx = sx + 1.6, mz = sz - s * 0.9;
        lit.push(tint(cyl(0.32, 0.38, 0.1, mx, base + 0.05, mz, 10), TRIM));
        lit.push(tint(cyl(0.03, 0.03, 0.9, mx, base + 0.5, mz, 5), TRIM));
        lit.push(tint(cyl(0.2, 0.26, 0.9, mx, base + 1.35, mz, 10), GOODS[Math.floor(rnd() * GOODS.length)]));
        lit.push(tint(cyl(0.28, 0.18, 0.5, mx, base + 2.05, mz, 10), 0xf6f2f8));
        lit.push(tint(new THREE.SphereGeometry(0.17, 10, 8).translate(mx, base + 2.48, mz), 0xf6f2f8));
      } else {
        // a counter with a light along its front, a menu over it, stools
        lit.push(tint(box(W - 1.4, 1.05, 0.8, sx, base + 0.525, back - s * 1.4), WALL));
        glow.push(tint(box(W - 1.4, 0.05, 0.05, sx, base + 1.0, back - s * 1.82), col, 1.6));
        lit.push(tint(box(W - 1.3, 0.06, 0.9, sx, base + 1.08, back - s * 1.4), TRIM));
        glow.push(tint(box(3.6, 0.9, 0.04, sx, base + 3.0, back - s * 0.26), 0xfff2d8, 0.9));
        for (const e of [-2, -0.7, 0.6, 1.9]) {
          lit.push(tint(cyl(0.03, 0.05, 0.75, sx + e, base + 0.37, back - s * 2.15, 5), TRIM));
          lit.push(tint(cyl(0.22, 0.22, 0.07, sx + e, base + 0.78, back - s * 2.15, 10), col));
        }
        for (let n = 0; n < 4; n++) lit.push(tint(cyl(0.07, 0.06, 0.18, sx - 1.5 + n * 0.9, base + 1.2, back - s * 1.4, 8), 0xf6f2f8));
      }
      // the front: glass between a frame, a door in it, and the name lit over the top
      glass.push(tint(box(W - 0.5, H - 1.0, 0.04, sx, base + (H - 1.0) / 2 + 0.05, front + s * 0.02), 0xd8ecff));
      for (const e of [-(W / 2 - 0.2), -0.4, 0.8, W / 2 - 0.2]) lit.push(tint(box(0.09, H - 0.95, 0.09, sx + e, base + (H - 0.95) / 2, front), TRIM));
      lit.push(tint(box(W, 0.1, 0.12, sx, base + H - 0.95, front), TRIM));
      lit.push(tint(box(W, 0.06, 0.12, sx, base + 0.03, front), TRIM));
      glow.push(tint(box(1.1, 0.04, 0.05, sx + 0.2, base + 2.4, front - s * 0.05), 0xfff8ea, 1.4)); // the door's push bar
      glow.push(tint(box(W - 0.6, 0.52, 0.1, sx, base + H - 0.5, front - s * 0.03), col, 1.7));
      // a little canopy over the window, lit along its edge
      lit.push(tint(box(W - 0.2, 0.08, 0.6, sx, base + H - 1.05, front - s * 0.3), WALL));
      glow.push(tint(box(W - 0.2, 0.04, 0.04, sx, base + H - 1.1, front - s * 0.6), col, 1.2));
    }
    for (const s of [-1, 1]) {
      const sz = d.z + s * (d.hz - 2.4);
      for (let i = 0; i < 6; i++) {
        const sx = WEST + 4 + i * 7.6;
        for (const lvl of [0, 1]) {
          const c = (i + lvl + (s > 0 ? 1 : 0)) % 3;
          shop(sx, sz, s, y + lvl * UP, c === 0 ? PINK : c === 1 ? CYAN : 0xffe2a0, (i * 2 + lvl + (s > 0 ? 1 : 0)) % 3);
        }
        // the floor of the shop above, which is the lid of the one below
        lit.push(tint(box(7.0, UP - 4.4, 4.2, sx, y + 4.4 + (UP - 4.4) / 2, sz), 0x2a2238));
        // between shops, a pilaster lit up its edge
        if (i > 0) {
          const px = sx - 3.8, pz = sz - s * 2.15;
          lit.push(tint(box(0.6, UP * 2, 0.5, px, y + UP, pz), 0x1f1a2a));
          glow.push(tint(box(0.06, UP * 2 - 0.4, 0.06, px, y + UP, pz - s * 0.27), i % 2 ? PINK : CYAN, 1.5));
        }
      }
      // the upper walk along the shopfronts, its glass balustrade and a rail of light
      const wz = sz - s * 3.4;
      lit.push(tint(box(d.hx * 2, 0.3, 2.6, d.x, y + UP - 0.15, wz), 0x2a2238));
      tiles.push(flatRect(d.x, y + UP + 0.012, wz, d.hx * 2 - 0.2, 2.5, 2));
      surfaces.push({ kind: 'rect', cx: d.x, cz: wz, ux: 1, uz: 0, hl: d.hx, hw: 1.3, yA: y + UP, yB: y + UP });
      const bl = d.hx * 2 - 6, bc = d.x - 2; // (it stops short of the landing at the stair)
      glass.push(tint(box(bl, 1.0, 0.04, bc, y + UP + 0.55, sz - s * 4.62), 0xd8ecff));
      lit.push(tint(box(bl, 0.07, 0.12, bc, y + UP + 1.08, sz - s * 4.62), TRIM));
      glow.push(tint(box(bl, 0.05, 0.05, bc, y + UP - 0.32, sz - s * 4.66), s > 0 ? PINK : CYAN, 1.6));
      // ...held up on slim columns, lit at the foot
      for (let i = 1; i < 6; i++) {
        const cx = WEST + 4 + i * 7.6 - 3.8, cz = sz - s * 4.4;
        lit.push(tint(cyl(0.16, 0.2, UP - 0.3, cx, y + (UP - 0.3) / 2, cz, 10), TRIM));
        glow.push(tint(cyl(0.3, 0.3, 0.05, cx, y + 0.04, cz, 12), 0xfff2d8, 1.2));
        solid(cx, cz, 0.35);
      }
      // (the shops themselves are solid)
      for (let x = WEST + 2; x < d.x + d.hx; x += 3.2) solid(x, sz + s * 0.2, 2.0);
    }
    // the moving stair, at the far end, up to a landing that joins the two upper walks
    const ex = d.x + d.hx - 3.2;
    span(ex - 11, y, d.z, ex - 1.5, y + UP, d.z, 3.0, 0x3a3048);
    for (let i = 0; i < 10; i++) glow.push(tint(box(0.12, 0.05, 2.6, ex - 10.5 + i * 0.95, y + 0.25 + i * (UP / 10.2), d.z), i % 2 ? PINK : CYAN, 1.5));
    for (const e of [-1, 1]) {
      // its sides: glass on a lit skirt
      const run = 9.5, len = Math.hypot(run, UP), a = Math.atan2(UP, run);
      const g = new THREE.BoxGeometry(len, 1.0, 0.05).rotateZ(a).translate(ex - 6.25, y + UP / 2 + 0.75, d.z + e * 1.56);
      glass.push(tint(g, 0xd8ecff));
      const r = new THREE.BoxGeometry(len, 0.08, 0.1).rotateZ(a).translate(ex - 6.25, y + UP / 2 + 1.28, d.z + e * 1.56);
      glow.push(tint(r, 0xfff2d8, 1.3));
    }
    lit.push(tint(box(3.4, 0.3, d.hz * 2 - 9.6, ex, y + UP - 0.15, d.z), 0x2a2238));
    tiles.push(flatRect(ex, y + UP + 0.012, d.z, 3.3, d.hz * 2 - 9.7, 2));
    surfaces.push({ kind: 'rect', cx: ex, cz: d.z, ux: 0, uz: 1, hl: d.hz - 4.8, hw: 1.7, yA: y + UP, yB: y + UP });
    // a glass roof on ribs
    for (let x = WEST + 2; x <= d.x + d.hx - 2; x += 6.3) {
      lit.push(tint(new THREE.TorusGeometry(d.hz, 0.16, 6, 28, Math.PI).rotateY(Math.PI / 2).translate(x, y + 10.4, d.z), 0xc9a455));
    }
    glass.push(tint(new THREE.CylinderGeometry(d.hz - 0.05, d.hz - 0.05, d.hx * 2 - 4, 28, 1, true, 0, Math.PI).rotateZ(Math.PI / 2).translate(d.x, y + 10.4, d.z), 0xcfe8ff));
    glow.push(tint(box(d.hx * 2 - 3, 0.1, 0.1, d.x, y + 10.4 + d.hz - 0.1, d.z), 0xffffff, 1.3));
    // the way in: a portal over the open end with the arcade's name on it
    for (const e of [-1, 1]) {
      lit.push(tint(box(1.0, 10.6, 1.0, WEST + 0.5, y + 5.3, d.z + e * 9.0), 0x1f1a2a));
      glow.push(tint(box(0.08, 10.2, 0.08, WEST - 0.02, y + 5.3, d.z + e * 8.45), e > 0 ? PINK : CYAN, 1.8));
    }
    lit.push(tint(box(1.0, 1.4, 19, WEST + 0.5, y + 10.6, d.z), 0x1f1a2a));
    glow.push(tint(box(0.08, 0.08, 17, WEST - 0.02, y + 10.0, d.z), PINK, 1.8));
    glow.push(tint(box(0.08, 0.08, 17, WEST - 0.02, y + 11.2, d.z), CYAN, 1.8));
    const title = label(DISTRICTS.saturday.name, '#ffc9ec', 9);
    title.position.set(WEST - 0.6, y + 12.6, d.z);
    root.add(title);
    // the other two, here: a line of Saturnia's bells under the roof, a forge lamp from Rustia on the desk
    for (let i = 0; i < 7; i++) lit.push(tint(cyl(0.22, 0.6, 0.8, d.x - 18 + i * 6, y + 9.2, d.z, 10), GOLD));
    // banners down the middle, between the bells, in the three colours
    for (let i = 0; i < 6; i++) {
      const bx = d.x - 15 + i * 6, col = [PINK, CYAN, RUST][i % 3];
      lit.push(tint(box(0.04, 2.6, 1.6, bx, y + 7.3, d.z), col));
      glow.push(tint(box(0.06, 0.05, 1.7, bx, y + 8.62, d.z), 0xfff2d8, 1.3));
      lit.push(tint(cyl(0.015, 0.015, 1.2, bx, y + 9.3, d.z, 4), TRIM));
    }
    // the desk, in the middle of the floor
    lit.push(tint(cyl(2.0, 2.2, 1.15, d.x - 4, y + 0.58, d.z, 14), 0x3a3048));
    glow.push(tint(cyl(2.05, 2.05, 0.06, d.x - 4, y + 1.18, d.z, 14), CYAN, 1.3));
    lit.push(tint(cyl(0.18, 0.26, 0.55, d.x - 4.9, y + 1.45, d.z + 0.5, 8), IRON));
    glow.push(tint(cyl(0.2, 0.2, 0.2, d.x - 4.9, y + 1.82, d.z + 0.5, 8), EMBER, 2.0));
    solid(d.x - 4, d.z, 2.3);
    find(d, d.x - 4, d.z + 3.4, 2.8);
    // a fountain inside the way in: a basin of the same marble, water that is mostly light
    {
      const fx = WEST + 8, fz = d.z;
      lit.push(tint(cyl(2.6, 2.8, 0.7, fx, y + 0.35, fz, 28), 0xe9dde6));
      lit.push(tint(cyl(2.3, 2.3, 0.05, fx, y + 0.6, fz, 28), 0x1a4a6a));
      glow.push(tint(cyl(2.25, 2.25, 0.03, fx, y + 0.64, fz, 28), 0x9fe8ff, 0.55));
      lit.push(tint(cyl(0.3, 0.45, 1.4, fx, y + 1.0, fz, 12), 0xe9dde6));
      lit.push(tint(cyl(1.1, 0.7, 0.25, fx, y + 1.75, fz, 18), 0xe9dde6));
      for (let n = 0; n < 8; n++) {
        const a = (n / 8) * Math.PI * 2;
        glow.push(tint(new THREE.ConeGeometry(0.06, 1.2, 5).rotateZ(0.5).rotateY(-a).translate(fx + Math.cos(a) * 1.2, y + 1.6, fz + Math.sin(a) * 1.2), 0xbff4ff, 1.2));
      }
      glow.push(tint(new THREE.ConeGeometry(0.1, 1.6, 6).translate(fx, y + 2.7, fz), 0xe8fbff, 1.5));
      solid(fx, fz, 2.9);
    }
    // planters with palms, and benches facing the shops, along both sides of the aisle
    const palm = (x, z) => {
      lit.push(tint(box(1.6, 0.8, 1.6, x, y + 0.4, z), 0x2a2238));
      glow.push(tint(box(1.62, 0.04, 1.62, x, y + 0.8, z), 0xffe2a0, 0.9));
      lit.push(tint(box(1.4, 0.04, 1.4, x, y + 0.79, z), 0x2a4a2a));
      for (let n = 0; n < 5; n++) lit.push(tint(cyl(0.11 - n * 0.012, 0.13 - n * 0.012, 0.75, x + n * 0.04, y + 1.2 + n * 0.72, z, 7), 0x6b5236));
      for (let n = 0; n < 7; n++) {
        const a = (n / 7) * Math.PI * 2;
        lit.push(tint(new THREE.ConeGeometry(0.28, 2.2, 4).rotateX(Math.PI / 2 + 0.6).rotateY(-a + Math.PI / 2).translate(x + 0.2 + Math.cos(a) * 0.95, y + 4.55, z + Math.sin(a) * 0.95), n % 2 ? 0x3f8f4a : 0x2f7a3c));
      }
      solid(x, z, 1.1);
    };
    const seat = (x, z, s) => {
      lit.push(tint(box(2.4, 0.1, 0.7, x, y + 0.48, z), 0xc9a455));
      lit.push(tint(box(2.4, 0.5, 0.08, x, y + 0.78, z + s * 0.32), 0xc9a455));
      for (const e of [-1, 1]) lit.push(tint(box(0.08, 0.45, 0.6, x + e * 1.05, y + 0.22, z), IRON));
      solid(x, z, 1.0);
    };
    for (const s of [-1, 1]) {
      for (const x of [WEST + 14, d.x + 4]) palm(x, d.z + s * 6.1);
      for (const x of [WEST + 19, d.x - 1, d.x + 9]) seat(x, d.z + s * 6.1, s);
    }
    DISTRICTS.saturday.shops.forEach((text, i) => {
      const s = label(text, i % 2 ? '#ffc9ec' : '#a9f7ff', 5.5);
      s.position.set(WEST + 6 + i * 11, y + 7.4 + (i % 2) * 0.6, d.z + (i % 2 ? -1 : 1) * (d.hz - 4.7));
      root.add(s);
    });
  }

  const flat = (list) => list.map((g) => (g.index ? g.toNonIndexed() : g));
  root.add(mergedMesh(flat(lit), new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x26221f, side: THREE.DoubleSide })));
  const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false });
  root.add(mergedMesh(flat(glow), glowMat));
  const glassMesh = mergedMesh(flat(glass), new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.1, depthWrite: false, side: THREE.DoubleSide, fog: false }));
  glassMesh.renderOrder = 2;
  root.add(glassMesh);
  const tileU = { uLight: { value: (k.lightDir || new THREE.Vector3(0.3, 0.9, -0.3)).clone().normalize() }, uTime: { value: 0 } };
  root.add(mergedMesh(tiles, new THREE.ShaderMaterial({ vertexShader: TILE_VERT, fragmentShader: TILE_FRAG, uniforms: tileU, fog: false })));
  const cartRing = new THREE.Group();
  cartRing.position.set(SEAM.x, SEAM.y, SEAM.z);
  cartRing.add(mergedMesh(flat(carts), new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x3a1a0a })));
  root.add(cartRing);

  return {
    // where the city's people may be found in each (world/lightepilogue.js)
    areas: [
      { x: SEAM.x, z: SEAM.z, r: 12, y: SEAM.y },
      { x: BELL.x, z: BELL.z, ring: [13.5, 17.5], y: BELL.y },
      { x: SAT.x + 2, z: SAT.z, box: [13, 4.4], y: SAT.y },
    ],
    tick(dt, t) {
      tileU.uTime.value = t;
      cartRing.rotation.y = -t * 0.11;
      // the ninth bell swings when it has been rung, and comes to rest
      if (rung > 0.002) rung *= Math.exp(-dt * 0.45);
      if (ninth) ninth.rotation.z = Math.sin(t * 2.3) * 0.5 * rung;
    },
    state: () => ({ found: { ...found }, rung }),
  };
}
