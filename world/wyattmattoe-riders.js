/**
 * wyattmattoe-riders.js — the people on the hill.
 *
 * A couple of dozen snowboarders and skiers lapping the Highline chairlift:
 * they carve down pistes either side of the lift line, glide into the bottom
 * terminal, wait for a chair, ride it to the top and drop in again. Pure
 * ambience — no collision, no dialogue, nothing the walker can touch.
 *
 * COST. Four InstancedMeshes in total (a tinted and an untinted half for each
 * of the two figures), so the whole hill is four draw calls however many
 * riders there are. The figures are rigid: a crouched pose that yaws onto its
 * line and rolls into each turn reads as riding from any distance the player
 * will see it at, and a skeleton per rider would cost a hundred draw calls to
 * say the same thing. Per frame each descending rider takes ONE terrain
 * sample (the board's own physics takes four per tick) and allocates nothing.
 *
 * A rider's line is the lift line reversed: arc position `s` runs from the top
 * terminal down to the bottom one, with a per-rider lane offset to the side
 * that opens out below the top station and closes again above the bottom one,
 * plus a sinusoidal carve. Feet are put on the terrain AS DRAWN every frame
 * (lifts.line.pisteR), so a rider can never float or wade whatever the
 * mountain does under the lane.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const JACKETS = [0xff7a1a, 0x59d8e6, 0xe8f0f8, 0xffb347, 0xff3d81, 0x8be04e, 0x9a6bff, 0xf2d21b];
const SCALE = 1.25; // a touch over life size: they are read from 100+ u away
const RUN = 0, QUEUE = 1, LIFT = 2;

// One coloured, non-indexed part. Vertex colour is what separates pants and
// skin from the jacket inside a single merged geometry.
function part(geo, hex, x, y, z, rx = 0, rz = 0) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  if (rx) g.rotateX(rx);
  if (rz) g.rotateZ(rz);
  g.translate(x, y, z);
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  const c = new THREE.Color(hex);
  for (let i = 0; i < n; i++) c.toArray(col, i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
const merged = (parts) => {
  const g = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  return g;
};
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

// Figures are authored with +Z the direction of travel and the feet at y = 0.
function boarderGeometry() {
  // Sideways stance: the board runs along Z, the chest faces +X.
  const tint = merged([
    part(box(0.3, 0.58, 0.46), 0xffffff, 0.03, 0.92, 0, 0, -0.12), // jacket
    part(box(0.11, 0.11, 0.5), 0xffffff, 0.02, 1.0, 0.45, 0.45), // leading arm
    part(box(0.11, 0.11, 0.5), 0xffffff, 0.02, 1.0, -0.45, -0.45), // trailing arm
  ]);
  const fixed = merged([
    part(box(0.3, 0.045, 1.5), 0xff7a1a, 0, 0.022, 0), // the deck
    part(box(0.17, 0.52, 0.18), 0x23272e, 0, 0.3, 0.27, -0.12),
    part(box(0.17, 0.52, 0.18), 0x23272e, 0, 0.3, -0.27, 0.12),
    part(new THREE.SphereGeometry(0.155, 8, 6), 0x2a2e36, 0.04, 1.37, 0.02), // helmet
    part(box(0.05, 0.11, 0.2), 0xffb347, 0.05, 1.38, 0.15), // goggles, looking down the line
    part(box(0.12, 0.12, 0.12), 0x15171b, 0.02, 0.88, 0.7), // mitts
    part(box(0.12, 0.12, 0.12), 0x15171b, 0.02, 0.88, -0.7),
  ]);
  return { tint, fixed };
}

function skierGeometry() {
  const tint = merged([
    part(box(0.44, 0.58, 0.26), 0xffffff, 0, 0.93, 0.1, 0.38), // jacket, tucked forward
    part(box(0.11, 0.46, 0.11), 0xffffff, 0.29, 0.92, 0.28, -0.95),
    part(box(0.11, 0.46, 0.11), 0xffffff, -0.29, 0.92, 0.28, -0.95),
  ]);
  const fixed = merged([
    part(box(0.09, 0.03, 1.7), 0x59d8e6, 0.14, 0.015, 0.1), // skis
    part(box(0.09, 0.03, 1.7), 0x59d8e6, -0.14, 0.015, 0.1),
    part(box(0.15, 0.56, 0.2), 0x23272e, 0.13, 0.33, -0.02, -0.18),
    part(box(0.15, 0.56, 0.2), 0x23272e, -0.13, 0.33, -0.02, -0.18),
    part(new THREE.SphereGeometry(0.155, 8, 6), 0x2a2e36, 0, 1.33, 0.27),
    part(box(0.2, 0.1, 0.05), 0xffb347, 0, 1.34, 0.41),
    part(box(0.025, 1.1, 0.025), 0x9aa2ad, 0.34, 0.55, -0.1, 1.0), // poles, trailing
    part(box(0.025, 1.1, 0.025), 0x9aa2ad, -0.34, 0.55, -0.1, 1.0),
  ]);
  return { tint, fixed };
}

export function createWyattRiders(lifts, ctx) {
  const { rng, count = 22 } = ctx;
  // pisteR, not the walker's analytic floor: riders are only ever looked at,
  // so they stand on the groomed surface that is actually drawn under them.
  const { S0, S1, HALF, lineDir, pisteR: floorR, toLocal, toSurf, upAt, latLocal, seatDrop } = lifts.line;
  const group = new THREE.Group();
  group.name = 'wyattmattoe-riders';
  lifts.root.add(group); // anchor-local, alongside the lift itself

  const nBoard = Math.ceil(count * 0.6);
  const nSki = count - nBoard;
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });
  const bg = boarderGeometry();
  const sg = skierGeometry();
  const meshes = [
    new THREE.InstancedMesh(bg.tint, mat, nBoard), new THREE.InstancedMesh(bg.fixed, mat, nBoard),
    new THREE.InstancedMesh(sg.tint, mat, nSki), new THREE.InstancedMesh(sg.fixed, mat, nSki),
  ];
  for (const im of meshes) {
    im.castShadow = true;
    im.frustumCulled = false; // instances roam the whole hill (see the chairs)
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    group.add(im);
  }

  // Struct-of-arrays rider state.
  const state = new Uint8Array(count);
  const s = new Float32Array(count); // arc position along the line
  const lane = new Float32Array(count); // lateral lane centre, u
  const amp = new Float32Array(count); // carve half-width
  const waveLen = new Float32Array(count); // carve wavelength
  const phi = new Float32Array(count); // carve phase
  const v0 = new Float32Array(count); // personal cruise speed
  const v = new Float32Array(count);
  const chair = new Int16Array(count).fill(-1);
  const seat = new Float32Array(count); // lateral seat offset on the chair
  const prev = new Float32Array(count * 3); // last anchor-local position
  const alt = new Float32Array(count); // ground radius under the rider (verification)
  const tintCol = new THREE.Color();

  const newLane = (i) => {
    // Pistes either side of the line, clear of the towers down the middle.
    lane[i] = (rng() < 0.5 ? -1 : 1) * (9 + rng() * 34);
    amp[i] = 3 + rng() * 5;
    waveLen[i] = 16 + rng() * 16;
    v0[i] = 6 + rng() * 3.5;
  };
  for (let i = 0; i < count; i++) {
    newLane(i);
    state[i] = RUN;
    s[i] = S0 + 12 + rng() * (S1 - S0 - 24); // scattered down the hill at spawn
    phi[i] = rng() * Math.PI * 2;
    v[i] = v0[i];
    seat[i] = i % 2 ? 0.48 : -0.48;
    prev[i * 3] = NaN; // "no previous position yet"
    const slot = i < nBoard ? i : i - nBoard;
    tintCol.set(JACKETS[Math.floor(rng() * JACKETS.length)]);
    (i < nBoard ? meshes[0] : meshes[2]).setColorAt(slot, tintCol);
  }
  meshes[0].instanceColor.needsUpdate = true;
  if (meshes[2].instanceColor) meshes[2].instanceColor.needsUpdate = true;

  const _dir = new THREE.Vector3();
  const _p = new THREE.Vector3();
  const _f = new THREE.Vector3();
  const _u = new THREE.Vector3();
  const _r = new THREE.Vector3();
  const _m = new THREE.Matrix4();
  const _scale = new THREE.Vector3(SCALE, SCALE, SCALE);
  const _q = new THREE.Quaternion();
  const smooth = (a, b, x) => THREE.MathUtils.smoothstep(x, a, b);

  function write(i) {
    // Basis from (right, up, forward) already in _r/_u/_f, position in _p.
    _m.makeBasis(_r, _u, _f);
    _q.setFromRotationMatrix(_m);
    _m.compose(_p, _q, _scale);
    const slot = i < nBoard ? i : i - nBoard;
    const a = i < nBoard ? 0 : 2;
    meshes[a].setMatrixAt(slot, _m);
    meshes[a + 1].setMatrixAt(slot, _m);
  }

  function update(t, dt) {
    const step = Math.min(dt, 0.1); // a hitched frame must not fling anyone down the hill
    for (let i = 0; i < count; i++) {
      if (state[i] === LIFT) {
        const arrived = lifts.seatOf(chair[i], _p, _r, _u, _f);
        if (arrived) {
          lifts.leaveChair(chair[i]);
          chair[i] = -1;
          state[i] = RUN;
          s[i] = S1 - 5;
          newLane(i);
          v[i] = v0[i] * 0.6;
          prev[i * 3] = NaN;
        } else {
          // Sat on the cushion, board dangling: drop the figure so its hips
          // meet the seat rather than its feet.
          _p.addScaledVector(_u, -(seatDrop + 0.5 * SCALE)).addScaledVector(_r, seat[i]);
          write(i);
          continue;
        }
      }
      if (state[i] === QUEUE) {
        const k = lifts.tryBoard();
        if (k >= 0) {
          chair[i] = k;
          state[i] = LIFT;
        }
        // Stood at the gate either way this frame (the chair takes over next).
        lineDir(S0 + 1.2, HALF + seat[i], _dir);
        alt[i] = floorR(_dir);
        toLocal(_dir.multiplyScalar(alt[i]), _p);
        upAt(_p, _u);
        _f.copy(latLocal).cross(_u).normalize(); // lateral x up = up the line
        _r.crossVectors(_u, _f).normalize();
        write(i);
        continue;
      }

      // --- descending ---
      s[i] -= v[i] * step;
      phi[i] += (v[i] * step * Math.PI * 2) / waveLen[i];
      if (s[i] <= S0 + 5) {
        state[i] = QUEUE;
        continue; // drawn at the gate from the next frame
      }
      // Lanes fan out below the top terminal and funnel back into the bottom.
      const open = smooth(S0 + 6, S0 + 55, s[i]) * (1 - smooth(S1 - 50, S1 - 6, s[i]));
      const sway = Math.sin(phi[i]);
      const lat = HALF + (lane[i] - HALF) * open + amp[i] * sway * (0.25 + 0.75 * open);
      lineDir(s[i], lat, _dir);
      const g = floorR(_dir);
      toLocal(_dir.multiplyScalar(g), _p);
      upAt(_p, _u);
      const j = i * 3;
      if (prev[j] === prev[j]) { // not NaN: there is a previous position
        _f.set(_p.x - prev[j], _p.y - prev[j + 1], _p.z - prev[j + 2]);
        const moved = _f.length();
        if (moved > 1e-4) {
          // Gravity sets the pace: faster where the hill drops away under
          // the line, bleeding off across flats and rises.
          const grade = (alt[i] - g) / moved;
          // (Down-the-line pace, that is: on a steep face riders make their
          // height in wide turns, not a straight schuss, so it stays modest
          // and they spend their time ON the hill where they can be seen.)
          const want = v0[i] * (0.6 + 0.9 * THREE.MathUtils.clamp(grade, -0.1, 0.6));
          v[i] += (want - v[i]) * Math.min(1, 1.5 * step);
          if (v[i] < 3) v[i] = 3;
          _f.multiplyScalar(1 / moved);
        } else {
          _f.copy(latLocal).cross(_u).negate().normalize();
        }
      } else {
        _f.copy(latLocal).cross(_u).negate().normalize(); // first frame: straight down the line
      }
      prev[j] = _p.x; prev[j + 1] = _p.y; prev[j + 2] = _p.z;
      alt[i] = g;
      // Lean into the turn: the turn's centre is on the opposite side to the
      // carve's displacement, so tip "up" away from it.
      _u.addScaledVector(latLocal, -sway * 0.42 * (0.25 + 0.75 * open)).normalize();
      _r.crossVectors(_u, _f).normalize();
      _f.crossVectors(_r, _u).normalize();
      write(i);
    }
    for (const im of meshes) im.instanceMatrix.needsUpdate = true;
  }

  function dispose() {
    for (const im of meshes) im.dispose();
    bg.tint.dispose(); bg.fixed.dispose(); sg.tint.dispose(); sg.fixed.dispose();
    mat.dispose();
    group.parent?.remove(group);
  }

  return {
    group, update, dispose,
    count,
    // Headless verification: where everyone is and what they are doing.
    info() {
      const out = [];
      for (let i = 0; i < count; i++) {
        out.push({
          kind: i < nBoard ? 'board' : 'ski',
          state: state[i] === RUN ? 'run' : state[i] === QUEUE ? 'queue' : 'lift',
          s: s[i], alt: alt[i], speed: v[i], chair: chair[i],
          // planet.surface-local, descending riders only (null on the lift)
          pos: state[i] === RUN && prev[i * 3] === prev[i * 3]
            ? toSurf(_p.set(prev[i * 3], prev[i * 3 + 1], prev[i * 3 + 2]), new THREE.Vector3()).toArray()
            : null,
        });
      }
      return out;
    },
  };
}
