// A thousand years on, in the City of Light (GDD 5.7.4, the epilogue).
//
// The ships' companies that were left behind when the light ship dived were
// taken into the city, and they stayed. Forty generations of Rustia's miners,
// Saturnia's cantors and Wavemall Prime's floor staff have lived in it
// together, and it is theirs now as much as anyone's: bells hung in the
// Pavilion's canopy, braziers of ember on the terrace, signs in pink and cyan
// along the bridges, banners in all three colours, and their descendants
// walking about under them.
//
// And across the city from the pilot's suite stands something that was not
// there before: a building as tall as anything the Tenretni ever made, in the
// shape of what the pilot drew at the bottom of the tether (the monument).
// Whatever was done in the light ship was done to everything here.
//
// The three captains are waiting in the suite. When the pilot comes up they
// see it together, say what it means, and watch the light ship leave its
// hangar again, for the hole, with a Tenretni at the helm. After that the
// three of them go wherever the pilot goes.
//
// Built by world/lightcity.js the first time the city is entered with the
// ship home. Every word is in world/chapter-dialogue.js (EPILOGUE).

import * as THREE from 'three';
import { MOTION_SCALE } from '../src/motion.js';
import { C, CH_TIER } from '../src/constants.js';
import { Q } from '../src/quality.js';
import { uiSound, setEventRumble } from '../src/sfx.js';
import { label } from '../src/holoLabel.js';
import { chapterHud } from '../src/chapterHud.js';
import { tint, box, cyl, mergedMesh } from './capital.js';
import { buildRig, poseRig } from './aliens.js';
import { measureRig, standRig, footY } from './rigGround.js';
import { buildCaptain, liveCaptain } from './captainDress.js';
import { cWalk } from '../src/capitalWalk.js';
import { SUITE, PAV } from './lightpavilion.js';
import { DISTRICT_DIRS } from './lightdistricts.js';
import { loadFirstEntry, worldFrom } from './firstcreature.js';
import { CAPTAINS, EPILOGUE } from './chapter-dialogue.js';

const VIEW = -Math.PI / 2 + 0.5; // the way the suite's seat faces (world/lightpavilion.js)
const FAR = 560; // the monument, this far from the suite
const SPAN = 310; // half its width and height
const SEEDS = { vask: 0x51a, marrow: 0x7c3, lux: 0x2e9 };
const TERR = { x: 0, z: -77, r: 15 }, GALL = { x: -112, z: -77, r: 11 }; // world/lightcity.js
const T_END = EPILOGUE.launchAt + 13;

const MON_VERT = /* glsl */ `
  attribute float aAlong;
  varying vec3 vLocal;
  varying vec3 vLN;
  varying vec3 vSize;
  varying vec3 vWorld;
  varying vec3 vN;
  varying float vAlong;
  void main() {
    vLocal = position;
    vLN = normal;
    vAlong = aAlong;
    vSize = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
    vec4 world = modelMatrix * instanceMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;
const MON_FRAG = /* glsl */ `
  uniform float uTime;
  uniform vec3 uA, uB, uLight;
  varying vec3 vLocal;
  varying vec3 vLN;
  varying vec3 vSize;
  varying vec3 vWorld;
  varying vec3 vN;
  varying float vAlong;
  float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  void main() {
    vec3 an = abs(vLN);
    vec2 uv = an.x > 0.5 ? vLocal.zy * vSize.zy : an.y > 0.5 ? vLocal.xz * vSize.xz : vLocal.xy * vSize.xy;
    // floors and bays: it is lived in, all the way along
    vec2 g = uv / vec2(5.0, 4.0);
    vec2 id = floor(g), f = fract(g);
    float pane = step(0.14, f.x) * step(0.2, f.y);
    float on = step(0.45, h2(id + floor(vAlong * 40.0)));
    vec3 body = mix(uA, uB, 0.5 + 0.5 * sin(vAlong * 6.2832 + uTime * 0.12));
    vec3 N = normalize(vN), V = normalize(cameraPosition - vWorld);
    float dif = 0.45 + 0.55 * max(dot(N, uLight), 0.0);
    vec3 col = body * body * 0.75 * dif;
    col = mix(col, body * 1.5 + 0.2, pane * on * (0.55 + 0.45 * sin(uTime * 0.6 + h2(id) * 40.0)));
    // a line of light runs along it, the way the creature swims
    col += body * 1.6 * pow(0.5 + 0.5 * sin(vAlong * 50.0 - uTime * 1.4), 12.0);
    col += vec3(1.0) * pow(1.0 - max(dot(N, V), 0.0), 3.0) * 0.35;
    gl_FragColor = vec4(col, 1.0);
  }
`;

// k: { group, chapter, hangar, lightDir, pavilion, floorYAt(), npcs (the site's own list), colliders }
export function createEpilogue(k) {
  const { group, chapter, hangar, lightDir } = k;
  const S = SUITE;
  const dir = new THREE.Vector3(Math.cos(VIEW), 0, Math.sin(VIEW));
  const side = new THREE.Vector3(-dir.z, 0, dir.x);
  const root = new THREE.Group();
  group.add(root);

  // --- the monument: the drawing, a third of a mile high ---
  const center = new THREE.Vector3(S.x + dir.x * FAR, S.y + 40, S.z + dir.z * FAR);
  const entry = loadFirstEntry();
  const up0 = new THREE.Vector3(0, 1, 0);
  const monU = { uTime: { value: 0 }, uA: { value: new THREE.Color(0.4, 0.9, 1) }, uB: { value: new THREE.Color(1, 0.7, 0.4) }, uLight: { value: lightDir } };
  let monument = null;
  let way = null; // { point, dir, room }: a gap in it to fly through (src/worldRace.js), if it has one
  if (entry) {
    const w = worldFrom(entry);
    monU.uA.value.copy(w.a);
    monU.uB.value.copy(w.b);
    // the strokes, stepped out into straight runs
    const runs = [];
    let total = 0;
    for (const s of entry) for (let i = 1; i < s.length; i++) total += Math.hypot(s[i][0] - s[i - 1][0], s[i][1] - s[i - 1][1]);
    let walked = 0;
    for (const s of entry) {
      let ax = s[0][0], ay = s[0][1], acc = 0;
      for (let i = 1; i < s.length; i++) {
        acc += Math.hypot(s[i][0] - s[i - 1][0], s[i][1] - s[i - 1][1]);
        const last = i === s.length - 1;
        if (acc >= 0.035 || last) {
          const len = Math.hypot(s[i][0] - ax, s[i][1] - ay);
          if (len > 1e-4) runs.push([ax, ay, s[i][0], s[i][1], (walked + acc * 0.5) / Math.max(total, 1e-4)]);
          walked += acc;
          acc = 0;
          ax = s[i][0];
          ay = s[i][1];
        }
      }
    }
    // A way through it: the place in the drawing furthest from any line, and
    // for choice one that lines go round (the inside of a loop), so that a
    // world can be flown through the thing and not past it.
    {
      const near = (px, py) => {
        let best = 9;
        for (const r of runs) {
          const ex = r[2] - r[0], ey = r[3] - r[1], l2 = ex * ex + ey * ey || 1e-9;
          const t = Math.max(0, Math.min(1, ((px - r[0]) * ex + (py - r[1]) * ey) / l2));
          const d = Math.hypot(px - r[0] - ex * t, py - r[1] - ey * t);
          if (d < best) best = d;
        }
        return best;
      };
      // closed in: lines within reach in most directions
      const ringed = (px, py) => {
        let hits = 0;
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * Math.PI * 2;
          for (let s = 0.06; s <= 0.9; s += 0.06) {
            if (near(px + Math.cos(a) * s, py + Math.sin(a) * s) < 0.04) {
              hits++;
              break;
            }
          }
        }
        return hits;
      };
      let bx0 = 1, bx1 = -1, by0 = 1, by1 = -1;
      for (const r of runs) {
        bx0 = Math.min(bx0, r[0], r[2]);
        bx1 = Math.max(bx1, r[0], r[2]);
        by0 = Math.min(by0, r[1], r[3]);
        by1 = Math.max(by1, r[1], r[3]);
      }
      let best = null;
      for (let gy = 0; gy <= 24; gy++) {
        for (let gx = 0; gx <= 24; gx++) {
          const px = bx0 + ((bx1 - bx0) * gx) / 24, py = by0 + ((by1 - by0) * gy) / 24;
          const room = near(px, py);
          if (room < 0.07) continue; // (a world and its lane need this much)
          const score = room + (ringed(px, py) >= 6 ? 1 : 0);
          if (!best || score > best.score) best = { px, py, room, score };
        }
      }
      if (best) {
        way = {
          point: center.clone().addScaledVector(side, best.px * SPAN).addScaledVector(up0, best.py * SPAN),
          dir: dir.clone(),
          room: best.room * SPAN - 15, // clear air round the middle of the gap
          ringed: best.score >= 1,
        };
      }
    }
    const n = Math.min(runs.length, 1200);
    monument = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.ShaderMaterial({ vertexShader: MON_VERT, fragmentShader: MON_FRAG, uniforms: monU, fog: false }), Math.max(n, 1));
    const along = new Float32Array(Math.max(n, 1));
    const m4 = new THREE.Matrix4(), bx = new THREE.Vector3(), by = new THREE.Vector3(), pos = new THREE.Vector3(), scl = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < n; i++) {
      const [x0, y0, x1, y1, a] = runs[i];
      // the drawing's plane faces the suite: its x runs along `side`, its y up
      bx.copy(side).multiplyScalar(x1 - x0).addScaledVector(up, y1 - y0);
      const len = bx.length() * SPAN;
      bx.normalize();
      by.crossVectors(dir, bx).normalize();
      m4.makeBasis(bx, by, dir);
      q.setFromRotationMatrix(m4);
      pos.copy(center).addScaledVector(side, ((x0 + x1) / 2) * SPAN).addScaledVector(up, ((y0 + y1) / 2) * SPAN);
      scl.set(len + 16, 30, 46);
      m4.compose(pos, q, scl);
      monument.setMatrixAt(i, m4);
      along[i] = a;
    }
    monument.geometry.setAttribute('aAlong', new THREE.InstancedBufferAttribute(along, 1));
    monument.frustumCulled = false;
    root.add(monument);
    // what holds it up: piers from the city's floor to the lowest of it, and a
    // second, darker course of the same shape set back behind the first, so
    // that it has a depth to it
    const back = new THREE.InstancedMesh(monument.geometry, monument.material, Math.max(n, 1));
    for (let i = 0; i < n; i++) {
      monument.getMatrixAt(i, m4);
      m4.decompose(pos, q, scl);
      pos.addScaledVector(dir, 58);
      scl.set(scl.x * 0.96, 20, 54);
      back.setMatrixAt(i, m4.compose(pos, q, scl));
    }
    back.frustumCulled = false;
    root.add(back);
    const piers = [];
    const lows = runs.slice(0, n).map((r) => [(r[0] + r[2]) / 2, Math.min(r[1], r[3])]).sort((p1, p2) => p1[1] - p2[1]);
    const used = [];
    for (const [x, y] of lows) {
      if (used.length >= 7) break;
      if (used.some((ux) => Math.abs(ux - x) < 0.22)) continue; // spread along it
      used.push(x);
      const top = center.y + y * SPAN, foot = -420;
      const g = new THREE.BoxGeometry(14, top - foot, 14).translate(0, (top + foot) / 2, 0);
      g.rotateY(Math.atan2(side.x, side.z)).translate(center.x + side.x * x * SPAN + dir.x * 29, 0, center.z + side.z * x * SPAN + dir.z * 29);
      piers.push(tint(g, 0x39424f));
      const cap = new THREE.BoxGeometry(22, 5, 22).translate(center.x + side.x * x * SPAN + dir.x * 29, top - 2, center.z + side.z * x * SPAN + dir.z * 29);
      piers.push(tint(cap, 0xc9a455));
    }
    if (piers.length) root.add(mergedMesh(piers.map((g) => (g.index ? g.toNonIndexed() : g)), new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x20242c })));
  }

  // --- the flock that has made the thing its own: lights that circle it ---
  const nBirds = (CH_TIER[Q.tier] || CH_TIER.medium).birds;
  const birdSeed = new Float32Array(nBirds * 3);
  let bs = 0x33c0de;
  for (let i = 0; i < birdSeed.length; i++) birdSeed[i] = ((bs = (Math.imul(bs, 1664525) + 1013904223) >>> 0), bs / 4294967296);
  const birdGeo = new THREE.BufferGeometry();
  birdGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(nBirds * 3), 3));
  birdGeo.setAttribute('aSeed', new THREE.BufferAttribute(birdSeed, 3));
  const birdU = { uTime: monU.uTime, uPx: { value: 600 }, uA: monU.uA, uB: monU.uB };
  const birds = new THREE.Points(birdGeo, new THREE.ShaderMaterial({
    uniforms: birdU,
    vertexShader: /* glsl */ `
      attribute vec3 aSeed;
      uniform float uTime, uPx;
      varying float vSeed;
      void main() {
        // each on a ring of its own round the middle of the thing, the rings tilted every way
        float a = aSeed.x * 6.2832 + uTime * (0.10 + 0.16 * aSeed.y) * (aSeed.z < 0.5 ? 1.0 : -1.0);
        float r = 90.0 + 240.0 * aSeed.y;
        vec3 p = vec3(cos(a) * r, sin(a * 2.0 + aSeed.z * 6.0) * 30.0, sin(a) * r);
        float tilt = (aSeed.z - 0.5) * 2.2;
        p = vec3(p.x, p.y * cos(tilt) - p.z * sin(tilt), p.y * sin(tilt) + p.z * cos(tilt));
        vSeed = aSeed.x;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = clamp(uPx * (2.2 + 2.0 * aSeed.z) * (0.75 + 0.25 * sin(uTime * 9.0 + aSeed.x * 60.0)) / max(-mv.z, 1.0), 1.5, 26.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uA, uB;
      varying float vSeed;
      void main() {
        float r = length(gl_PointCoord * 2.0 - 1.0);
        if (r > 1.0) discard;
        gl_FragColor = vec4(mix(uA, uB, vSeed) * mix(uA, uB, vSeed) * 1.1, pow(1.0 - r, 0.8));
      }
    `,
    transparent: true, depthWrite: false, fog: false,
  }));
  birds.position.copy(center);
  birds.frustumCulled = false;
  root.add(birds);

  // --- what forty generations of three peoples have done with the place ---
  const lit = [], glow = [];
  const RUST = 0xb5532a, EMBER = 0xff8a3a, GOLD = 0xe9c46a, PINK = 0xff6fae, CYAN = 0x82f7ff;
  // Saturnia: bells in the Pavilion's canopy, a ring of them
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const x = PAV.x + Math.cos(a) * 19, z = PAV.z + Math.sin(a) * 19, h = 11 + (i % 3) * 0.9;
    lit.push(tint(cyl(0.03, 0.03, 15 - h, x, (15 + h) / 2, z, 4), GOLD));
    lit.push(tint(cyl(0.35, 0.95, 1.3, x, h - 0.65, z, 14), GOLD));
    glow.push(tint(cyl(0.16, 0.16, 0.16, x, h - 1.3, z, 8), 0xfff2b8, 1.6));
  }
  // Rustia: braziers of ember round the terrace, and ore set into its floor
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + 0.31;
    const x = TERR.x + Math.cos(a) * 17.2, z = TERR.z + Math.sin(a) * 17.2;
    if (Math.abs(z - TERR.z) < 4.5 || (Math.abs(x) < 4.5 && z > TERR.z)) continue; // the bridges
    if (DISTRICT_DIRS.some(([ux, uz]) => Math.cos(a) * ux + Math.sin(a) * uz > 0.95)) continue; // ...and the three new ones
    lit.push(tint(cyl(0.7, 0.35, 0.9, x, 0.45, z, 8), RUST));
    glow.push(tint(cyl(0.55, 0.55, 0.12, x, 0.92, z, 8), EMBER, 2.0));
    k.colliders.push({ x, z, r: 0.8, top: Infinity });
  }
  for (let i = 0; i < 16; i++) glow.push(tint(box(0.5, 0.04, 0.5, TERR.x + Math.cos(i * 2.4) * (4 + (i % 5) * 2.2), 0.035, TERR.z + Math.sin(i * 2.4) * (4 + (i % 5) * 2.2), i), EMBER, 0.9));
  // Wavemall Prime: lines of light strung over the bridges, pink and cyan
  for (const [x0, x1] of [[20, PAV.x - PAV.r], [GALL.x + GALL.r + 2, -20]]) {
    for (let x = x0 + 2; x < x1; x += 2.2) {
      const sag = 4.2 + 0.9 * Math.cos(((x - x0) / (x1 - x0)) * Math.PI * 2);
      glow.push(tint(box(0.22, 0.22, 0.22, x, sag, TERR.z - 2.9), Math.round(x) % 2 ? PINK : CYAN, 1.8));
      glow.push(tint(box(0.22, 0.22, 0.22, x, sag, TERR.z + 2.9), Math.round(x) % 2 ? CYAN : PINK, 1.8));
    }
  }
  // banners in all three colours, on masts round the terrace and the Pavilion
  const BAN = [RUST, GOLD, PINK];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + 0.2;
    for (const [c, r] of [[TERR, 18.6], [PAV, 28]]) {
      const x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r;
      if (Math.abs(z - c.z) < 5) continue;
      lit.push(tint(cyl(0.07, 0.1, 9, x, 4.5, z, 6), 0xc9a455));
      lit.push(tint(box(0.06, 4.6, 1.5, x, 6.3, z + 0.85, -a), BAN[i % 3]));
    }
  }
  const flat = (list) => list.map((g) => (g.index ? g.toNonIndexed() : g));
  root.add(mergedMesh(flat(lit), new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x2a2620, side: THREE.DoubleSide })));
  root.add(mergedMesh(flat(glow), new THREE.MeshBasicMaterial({ vertexColors: true, fog: false })));
  // signs, in the names their ships had
  EPILOGUE.signs.forEach((text, i) => {
    const s = label(text, i % 2 ? '#ffc9ec' : '#a9f7ff', 9);
    const onEast = i % 2 === 0;
    s.position.set(onEast ? 26 + i * 7 : -30 - i * 9, 7.2 + (i % 3) * 0.5, TERR.z);
    root.add(s);
  });

  // --- the people of the city: descendants of all three, about their day ---
  // (the districts first, so that every tier has somebody in each: world/lightdistricts.js)
  const DIST = k.areas || [];
  const AREAS = [...DIST, TERR, TERR, TERR, TERR, TERR, PAV, PAV, PAV, PAV, PAV, PAV, GALL, GALL, ...DIST];
  let rs = 0x7e2a11;
  const rnd = () => ((rs = (Math.imul(rs, 1664525) + 1013904223) >>> 0), rs / 4294967296);
  const spot = (c, o, from) => {
    if (c.ring) {
      // a walk round something: the next place is a little way on round it, not across
      const a = from ? Math.atan2(from.z - c.z, from.x - c.x) + (rnd() - 0.5) * 1.3 : rnd() * Math.PI * 2;
      const r = c.ring[0] + rnd() * (c.ring[1] - c.ring[0]);
      o.x = c.x + Math.cos(a) * r;
      o.z = c.z + Math.sin(a) * r;
      return o;
    }
    if (c.box) {
      o.x = c.x + (rnd() * 2 - 1) * c.box[0];
      o.z = c.z + (rnd() * 2 - 1) * c.box[1];
      return o;
    }
    const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * (c === PAV ? 24 : c.r) + (c === PAV ? 5 : 0);
    o.x = c.x + Math.cos(a) * Math.min(r, c === PAV ? 25 : c.r);
    o.z = c.z + Math.sin(a) * Math.min(r, c === PAV ? 25 : c.r);
    return o;
  };
  const tier = CH_TIER[Q.tier] || CH_TIER.medium;
  const people = AREAS.slice(0, tier.people).map((area, i) => {
    const rig = measureRig(buildRig(0x1000 + i * 977, 'fleet'));
    const p = spot(area, { x: 0, z: 0 });
    rig.group.position.set(p.x, area.y || 0, p.z);
    rig.group.scale.setScalar(0.85 + rnd() * 0.3);
    standRig(rig, area.y || 0);
    root.add(rig.group);
    return { rig, area, to: spot(area, { x: 0, z: 0 }), wait: rnd() * 5, speed: 1.6 + rnd() * 1.4 };
  });
  // far off, a person is one instance of a capsule in their own colours: a
  // jointed figure is seventeen draws, and from across the terrace nobody can
  // tell the difference
  const far = new THREE.InstancedMesh(
    new THREE.CapsuleGeometry(0.27, 1.15, 3, 8).translate(0, 0.85, 0),
    new THREE.MeshLambertMaterial({ emissive: 0x1c1a17 }),
    Math.max(people.length, 1)
  );
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), _p = new THREE.Vector3();
  people.forEach((p, i) => far.setColorAt(i, p.rig.materials.clothMat.color));
  far.frustumCulled = false;
  root.add(far);

  // --- the captains ---
  k.pavilion.hideCaptains(); // they are not at the Pavilion's table any more
  const WINDOW = [[-3.2, 0.2], [0.2, -0.4], [3.4, 0.3]]; // across the glass, a little apart
  const crew = CAPTAINS.map((c, i) => {
    const rig = buildCaptain(c.id);
    const x = S.x + dir.x * 11.5 + side.x * WINDOW[i][0] + dir.x * WINDOW[i][1];
    const z = S.z + dir.z * 11.5 + side.z * WINDOW[i][0] + dir.z * WINDOW[i][1];
    rig.group.position.set(x, S.y, z);
    standRig(rig, S.y);
    root.add(rig.group);
    const npc = { x, y: S.y, z, role: 'captain', talk: () => ({ speaker: { name: c.name, species: c.species, cityId: 'The City of Light' }, lines: EPILOGUE.talk[c.id] || [] }) };
    k.npcs.push(npc);
    return { c, rig, npc, yaw: Math.atan2(dir.x, dir.z), want: Math.atan2(dir.x, dir.z), slot: (i / CAPTAINS.length) * Math.PI * 2 + 0.6, moving: false, floor: S.y, pace: 0 };
  });
  const turn = (m, yaw, dt, rate = 3) => {
    let d = yaw - m.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    m.yaw += d * Math.min(1, dt * rate);
    m.rig.group.rotation.y = m.yaw;
  };

  // --- the light ship, leaving ---
  const trail = new THREE.Mesh(
    new THREE.CylinderGeometry(1, 1, 1, 10, 1, true).translate(0, 0.5, 0),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.5, 1.3), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })
  );
  trail.position.copy(hangar.root.position);
  trail.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), lightDir);
  trail.frustumCulled = false;
  root.add(trail);
  const qRest = new THREE.Quaternion(), qGo = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), lightDir);
  function shipAt(x) {
    // x: seconds since it let go (< 0: in its yard; gone for good once the story says so)
    if (x < 0) {
      const gone = chapter.epilogue();
      hangar.vessel.visible = !gone;
      hangar.vessel.position.set(0, 0, 0);
      hangar.vessel.quaternion.copy(qRest);
      hangar.uniforms.uFlight.value = 0;
      trail.material.opacity = 0;
      return;
    }
    const lift = Math.min(x / 4, 1), go = Math.max(x - 3.5, 0);
    const far = 60 * lift * lift + go * go * go * 14; // slowly, and then not
    hangar.vessel.visible = far < 3300;
    hangar.vessel.position.copy(lightDir).multiplyScalar(far);
    hangar.vessel.quaternion.slerpQuaternions(qRest, qGo, Math.min(x / 3.5, 1) ** 2);
    hangar.uniforms.uFlight.value = Math.min(x / 2.5, 1);
    trail.scale.set(8 + go * 5, Math.min(far, 3300), 8 + go * 5);
    trail.material.opacity = Math.min(go * 0.5, 0.75) * Math.max(0, 1 - (x - 9) / 4);
  }

  let talker = null, talkT = 0; // whose line is up, and for how much longer
  // where each stands about the pilot: to either side and one ahead, never
  // behind, where the camera is [angle from the way the pilot faces, how far]
  const SLOTS = [[-1.35, 2.7], [1.35, 2.7], [0.25, 4.4]];
  let u = -1; // the scene's clock; < 0 when it is not playing
  let said = -1;
  const _a = new THREE.Vector3(), _b = new THREE.Vector3();
  const ease = (a, b, x) => {
    const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
    return t * t * (3 - 2 * t);
  };

  function finish() {
    u = -1;
    chapter.setEpilogue();
    chapterHud.cine(false);
    setEventRumble(0);
    shipAt(-1);
  }

  return {
    built: !!monument,
    way,
    held: () => u >= 0,
    // In the suite: over the pilot's shoulder at the three of them and what is
    // beyond the glass; then round to the west for the ship.
    camera(pos, target) {
      if (u < 0) return false;
      const turnTo = ease(EPILOGUE.launchAt - 2.5, EPILOGUE.launchAt + 1, u);
      _a.set(S.x + dir.x * 3 + side.x * (4.5 - u * 0.1), S.y + 2.5, S.z + dir.z * 3 + side.z * (4.5 - u * 0.1));
      _b.set(S.x - 10.5, S.y + 3.4, S.z + 2.5);
      pos.lerpVectors(_a, _b, turnTo);
      _a.copy(center).setY(S.y + 30);
      _b.copy(hangar.root.position).add(hangar.vessel.position);
      target.lerpVectors(_a, _b, turnTo);
      return true;
    },
    stop() {
      if (u >= 0) {
        u = -1;
        chapterHud.clear();
        setEventRumble(0);
      }
      shipAt(-1);
    },
    tick(dt, t, walker) {
      monU.uTime.value = t;
      birdU.uPx.value = (window.innerHeight * Q.pixelRatio * 0.5) / Math.tan((C.FOV * Math.PI) / 360);
      // the scene starts itself when the pilot comes up into the suite
      if (u < 0 && !chapter.epilogue() && walker && walker.y > S.y - 2 && Math.hypot(walker.x - S.x, walker.z - S.z) < S.r) {
        u = 0;
        said = -1;
        chapterHud.cine(true);
        uiSound('select');
      }
      if (u >= 0) {
        u += dt;
        for (let i = 0; i < EPILOGUE.lines.length; i++) {
          if (i > said && u >= EPILOGUE.lines[i][0]) {
            said = i;
            const who = CAPTAINS.find((c) => c.id === EPILOGUE.lines[i][1]);
            chapterHud.say(who ? `${who.short} — ${EPILOGUE.lines[i][2]}` : EPILOGUE.lines[i][2], 6);
            talker = who ? who.id : null;
            talkT = 2.2 + EPILOGUE.lines[i][2].length * 0.045; // about as long as it takes to say
          }
        }
        const since = u - EPILOGUE.launchAt;
        if (since >= 0 && since - dt < 0) uiSound('engage');
        shipAt(since);
        setEventRumble(since > 0 ? Math.min(since / 4, 1) * Math.max(0, 1 - (since - 6) / 5) * 0.6 * (0.4 + 0.6 * MOTION_SCALE) : 0);
        if (u >= T_END) finish();
      }

      // the captains: at the glass until it is over, then wherever the pilot goes
      const looking = u >= EPILOGUE.lookAt[0] && u < EPILOGUE.lookAt[1];
      const west = u >= EPILOGUE.launchAt - 1;
      for (let i = 0; i < crew.length; i++) {
        const m = crew[i];
        const g = m.rig.group.position;
        m.moving = false;
        if (!chapter.epilogue()) {
          // at each other, in the pause; at the ship, when it goes; else out at the thing
          const other = crew[(i + 1) % crew.length].rig.group.position;
          m.want = looking ? Math.atan2(other.x - g.x, other.z - g.z)
            : west && u >= 0 ? Math.atan2(hangar.root.position.x - g.x, hangar.root.position.z - g.z)
            : Math.atan2(dir.x, dir.z);
          turn(m, m.want, dt, 2.2);
        } else if (walker) {
          // a place of their own round the pilot, a few steps off
          const a = cWalk.facingYaw + SLOTS[i % SLOTS.length][0], r = SLOTS[i % SLOTS.length][1];
          let tx = walker.x + Math.sin(a) * r, tz = walker.z + Math.cos(a) * r;
          if (k.floorYAt(tx, tz, walker.y + 0.6) === -Infinity) {
            // no floor there (a bridge is narrow): fall in behind instead
            tx = walker.x;
            tz = walker.z;
          }
          const dx = tx - g.x, dz = tz - g.z, d = Math.hypot(dx, dz);
          m.pace = 0;
          if (d > 70 || Math.abs(walker.y - m.floor) > 6) {
            // (the lift: they arrive with the pilot)
            g.x = tx;
            g.z = tz;
            m.floor = walker.y;
          } else if (d > 0.9) {
            const speed = d > 12 ? 24 : d > 5 ? 14 : 7; // they keep up with a run
            const step = Math.min(d - 0.6, speed * dt);
            g.x += (dx / d) * step;
            g.z += (dz / d) * step;
            m.moving = true;
            m.pace = Math.min(step / Math.max(dt, 1e-4) / 14, 1); // legs as fast as the ground goes by
            turn(m, Math.atan2(dx, dz), dt, 8);
          } else turn(m, Math.atan2(walker.x - g.x, walker.z - g.z), dt, 2);
          // the floor under their own feet, not the pilot's
          const under = k.floorYAt(g.x, g.z, m.floor + 0.8);
          if (under > -Infinity) m.floor = under;
        }
        m.npc.x = g.x;
        m.npc.z = g.z;
        m.npc.y = m.floor;
        poseRig(m.rig, dt, t, m.moving ? 'walk' : 'idle', m.pace);
        standRig(m.rig, m.floor);
        // the face: speaking if the line is theirs; looking at whoever is
        // speaking, or else (once they are following) at the pilot
        const mine = talkT > 0 && talker === m.c.id;
        let lookYaw = 0;
        const at = talkT > 0 && talker && !mine ? crew.find((o) => o.c.id === talker) : null;
        if (at) lookYaw = Math.atan2(at.rig.group.position.x - g.x, at.rig.group.position.z - g.z) - m.yaw;
        else if (chapter.epilogue() && walker && !m.moving) lookYaw = Math.atan2(walker.x - g.x, walker.z - g.z) - m.yaw;
        liveCaptain(m.rig, dt, t, mine, lookYaw);
      }
      if (talkT > 0) talkT -= dt;

      // the people of the city, about their day
      for (let i = 0; i < people.length; i++) {
        const p = people[i];
        const g = p.rig.group.position;
        let walking = false;
        if (p.wait > 0) p.wait -= dt;
        else {
          const dx = p.to.x - g.x, dz = p.to.z - g.z, d = Math.hypot(dx, dz);
          if (d < 0.4) {
            spot(p.area, p.to, g);
            p.wait = 1.5 + ((p.to.x * 7.3) % 1 + 1) * 3;
          } else {
            g.x += (dx / d) * p.speed * dt;
            g.z += (dz / d) * p.speed * dt;
            p.rig.group.rotation.y = Math.atan2(dx, dz);
            walking = true;
          }
        }
        // near the pilot, the figure; far off, the capsule
        const fy = p.area.y || 0;
        const near = !!walker && tier.rigNear > 0 && Math.abs(walker.y - fy) < 8 && Math.hypot(g.x - walker.x, g.z - walker.z) < tier.rigNear;
        p.rig.group.visible = near;
        if (near) {
          poseRig(p.rig, dt, t, walking ? 'walk' : 'idle', walking ? 0.6 : 0);
          standRig(p.rig, fy);
          _s.setScalar(0);
        } else _s.setScalar(p.rig.group.scale.x);
        _q.setFromAxisAngle(_up, p.rig.group.rotation.y);
        far.setMatrixAt(i, _m.compose(_p.set(g.x, fy, g.z), _q, _s));
      }
      far.instanceMatrix.needsUpdate = true;
    },
    state: () => ({ way: way ? { at: way.point.toArray().map(Math.round), room: Math.round(way.room), ringed: way.ringed } : null, u, end: T_END, runs: monument ? monument.count : 0, people: people.length, crew: crew.map((m) => m.rig.group.position.toArray().map(Math.round)),
      // how far each captain's lower foot is off the floor it stands on
      feet: crew.map((m) => Math.round((footY(m.rig) - m.floor) * 1000) / 1000),
      peopleFeet: people.map((p) => Math.round(footY(p.rig) * 1000) / 1000),
      // ...and the same thing measured from the drawn geometry, as a check on the sum
      feetDrawn: crew.map((m) => Math.round((new THREE.Box3().setFromObject(m.rig.group).min.y - m.floor) * 1000) / 1000), ship: hangar.vessel.visible }),
  };
}
