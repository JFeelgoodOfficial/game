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

// k: { group, surfaces, colliders, consoles, chapter }
export function createDistricts(k) {
  const { surfaces, colliders, consoles } = k;
  const root = new THREE.Group();
  k.group.add(root);
  const lit = [], glow = [];
  const solid = (x, z, r) => colliders.push({ x, z, r, top: Infinity });

  // a slab from A to B (it may slope), walkable
  function span(ax, ay, az, bx, by, bz, width, hex) {
    const run = Math.hypot(bx - ax, bz - az), len = Math.hypot(run, by - ay);
    const g = new THREE.BoxGeometry(len, 0.4, width);
    g.rotateZ(Math.atan2(by - ay, run)).rotateY(-Math.atan2(bz - az, bx - ax)).translate((ax + bx) / 2, (ay + by) / 2 - 0.2, (az + bz) / 2);
    lit.push(tint(g, hex));
    for (const s of [-1, 1]) {
      const e = new THREE.BoxGeometry(len, 0.07, 0.14);
      e.rotateZ(Math.atan2(by - ay, run)).rotateY(-Math.atan2(bz - az, bx - ax));
      const nx = -(bz - az) / run, nz = (bx - ax) / run;
      e.translate((ax + bx) / 2 + nx * s * (width / 2 - 0.1), (ay + by) / 2 + 0.04, (az + bz) / 2 + nz * s * (width / 2 - 0.1));
      glow.push(tint(e, 0xffe2a0, 1.3));
    }
    surfaces.push({ kind: 'rect', cx: (ax + bx) / 2, cz: (az + bz) / 2, ux: (bx - ax) / run, uz: (bz - az) / run, hl: run / 2 + 0.3, hw: width / 2, yA: ay, yB: by });
  }
  // the bridge out to a district: up and over the terrace's rail, then on
  function bridge(d, i, hex, signCol) {
    const [ux, uz] = DISTRICT_DIRS[i];
    const p0 = [TERR.x + ux * 16.2, TERR.z + uz * 16.2], p1 = [TERR.x + ux * 21.4, TERR.z + uz * 21.4];
    const reach = d.hx ? Math.min(d.hx, d.hz) : d.r;
    const p2 = [d.x - ux * (reach - 1.5), d.z - uz * (reach - 1.5)];
    span(p0[0], 0, p0[1], p1[0], 1.3, p1[1], BRIDGE_W, STONE);
    span(p1[0], 1.3, p1[1], p2[0], d.y, p2[1], BRIDGE_W, hex);
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
    // plates in the floor, and the rail the ore goes round on
    for (let i = 0; i < 28; i++) {
      const a = i * 2.39996, r = 3 + Math.sqrt(i / 28) * (d.r - 4);
      lit.push(tint(box(2.6, 0.05, 1.9, d.x + Math.cos(a) * r, y + 0.03, d.z + Math.sin(a) * r, a), i % 3 ? 0x2c2826 : RUST));
    }
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
    bridge(d, 2, 0xf2a6d8, '#a9f7ff');
    // the arcade lies along x; the bridge comes in at its near corner
    lit.push(tint(box(d.hx * 2, 0.8, d.hz * 2, d.x, y - 0.4, d.z), 0x2a2238));
    lit.push(tint(cyl(9, 3, 26, d.x, y - 13.8, d.z, 16), 0x1a1622));
    surfaces.push({ kind: 'rect', cx: d.x, cz: d.z, ux: 1, uz: 0, hl: d.hx, hw: d.hz, yA: y, yB: y });
    // a tiled floor
    for (let i = -5; i <= 5; i++) glow.push(tint(box(d.hx * 2 - 1, 0.03, 0.08, d.x, y + 0.03, d.z + i * 1.6), i % 2 ? PINK : CYAN, 0.55));
    // shops down both long sides, on two floors, each front lit its own way
    for (const s of [-1, 1]) {
      const sz = d.z + s * (d.hz - 2.4);
      for (let i = 0; i < 6; i++) {
        const sx = d.x - d.hx + 4 + i * 7.6;
        for (const lvl of [0, 1]) {
          const fy = y + lvl * UP;
          lit.push(tint(box(7.0, 4.4, 4.2, sx, fy + 2.2 + (lvl ? 0.3 : 0), sz, 0), 0x1f1a2a));
          const front = sz - s * 2.12;
          glow.push(tint(box(5.6, 2.4, 0.06, sx, fy + 1.9 + (lvl ? 0.3 : 0), front), (i + lvl + (s > 0 ? 1 : 0)) % 3 === 0 ? PINK : (i + lvl) % 3 === 1 ? CYAN : 0xffe2a0, 0.95));
          glow.push(tint(box(6.4, 0.5, 0.1, sx, fy + 3.75 + (lvl ? 0.3 : 0), front), (i + lvl) % 2 ? CYAN : PINK, 1.7));
          lit.push(tint(box(0.14, 2.6, 0.1, sx - 1.0, fy + 1.9 + (lvl ? 0.3 : 0), front - s * 0.03), 0x1f1a2a));
        }
      }
      // the upper walk along the shopfronts, and its rail of light
      lit.push(tint(box(d.hx * 2, 0.3, 2.6, d.x, y + UP - 0.15, sz - s * 3.4), 0x2a2238));
      surfaces.push({ kind: 'rect', cx: d.x, cz: sz - s * 3.4, ux: 1, uz: 0, hl: d.hx, hw: 1.3, yA: y + UP, yB: y + UP });
      glow.push(tint(box(d.hx * 2, 0.07, 0.1, d.x, y + UP + 1.1, sz - s * 4.65), s > 0 ? PINK : CYAN, 1.6));
      // (the shops themselves are solid)
      for (let x = d.x - d.hx + 2; x < d.x + d.hx; x += 3.2) solid(x, sz + s * 0.2, 2.0);
    }
    // the moving stair, at the far end, up to a landing that joins the two upper walks
    const ex = d.x + d.hx - 3.2;
    span(ex - 11, y, d.z, ex - 1.5, y + UP, d.z, 3.0, 0x3a3048);
    for (let i = 0; i < 10; i++) glow.push(tint(box(0.12, 0.05, 2.6, ex - 10.5 + i * 0.95, y + 0.25 + i * (UP / 10.2), d.z), i % 2 ? PINK : CYAN, 1.5));
    lit.push(tint(box(3.4, 0.3, d.hz * 2 - 9.6, ex, y + UP - 0.15, d.z), 0x2a2238));
    surfaces.push({ kind: 'rect', cx: ex, cz: d.z, ux: 0, uz: 1, hl: d.hz - 4.8, hw: 1.7, yA: y + UP, yB: y + UP });
    // a glass roof on ribs
    for (let x = d.x - d.hx + 2; x <= d.x + d.hx - 2; x += 6.3) {
      lit.push(tint(new THREE.TorusGeometry(d.hz, 0.16, 6, 28, Math.PI).rotateY(Math.PI / 2).translate(x, y + 10.4, d.z), 0xc9a455));
    }
    glow.push(tint(box(d.hx * 2 - 3, 0.1, 0.1, d.x, y + 10.4 + d.hz - 0.1, d.z), 0xffffff, 1.3));
    // the other two, here: a line of Saturnia's bells under the roof, a forge lamp from Rustia on the desk
    for (let i = 0; i < 7; i++) lit.push(tint(cyl(0.22, 0.6, 0.8, d.x - 18 + i * 6, y + 9.2, d.z, 10), GOLD));
    // the desk, in the middle of the floor
    lit.push(tint(cyl(2.0, 2.2, 1.15, d.x - 4, y + 0.58, d.z, 14), 0x3a3048));
    glow.push(tint(cyl(2.05, 2.05, 0.06, d.x - 4, y + 1.18, d.z, 14), CYAN, 1.3));
    lit.push(tint(cyl(0.18, 0.26, 0.55, d.x - 4.9, y + 1.45, d.z + 0.5, 8), IRON));
    glow.push(tint(cyl(0.2, 0.2, 0.2, d.x - 4.9, y + 1.82, d.z + 0.5, 8), EMBER, 2.0));
    solid(d.x - 4, d.z, 2.3);
    find(d, d.x - 4, d.z + 3.4, 2.8);
    DISTRICTS.saturday.shops.forEach((text, i) => {
      const s = label(text, i % 2 ? '#ffc9ec' : '#a9f7ff', 5.5);
      s.position.set(d.x - d.hx + 6 + i * 11, y + 7.4 + (i % 2) * 0.6, d.z + (i % 2 ? -1 : 1) * (d.hz - 4.7));
      root.add(s);
    });
  }

  const flat = (list) => list.map((g) => (g.index ? g.toNonIndexed() : g));
  root.add(mergedMesh(flat(lit), new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x26221f, side: THREE.DoubleSide })));
  const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false });
  root.add(mergedMesh(flat(glow), glowMat));
  const cartRing = new THREE.Group();
  cartRing.position.set(SEAM.x, SEAM.y, SEAM.z);
  cartRing.add(mergedMesh(flat(carts), new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x3a1a0a })));
  root.add(cartRing);

  return {
    // where the city's people may be found in each (world/lightepilogue.js)
    areas: [
      { x: SEAM.x, z: SEAM.z, r: 12, y: SEAM.y },
      { x: BELL.x, z: BELL.z, ring: [13.5, 17.5], y: BELL.y },
      { x: SAT.x - 4, z: SAT.z, box: [14, 5], y: SAT.y },
    ],
    tick(dt, t) {
      cartRing.rotation.y = -t * 0.11;
      // the ninth bell swings when it has been rung, and comes to rest
      if (rung > 0.002) rung *= Math.exp(-dt * 0.45);
      if (ninth) ninth.rotation.z = Math.sin(t * 2.3) * 0.5 * rung;
    },
    state: () => ({ found: { ...found }, rung }),
  };
}
