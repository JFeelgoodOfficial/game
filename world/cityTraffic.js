// What moves on a city's streets (world/cityMetro.js lays the streets out).
//
//   vehicles     one instanced body and one instanced set of lights, driving
//                the metro's closed-loop routes. Each route has a lane to
//                itself, so the only rules are: keep your distance from the
//                one in front, and stop for anything standing in the road —
//                the pilot, or a monster (the siege goes on in these streets).
//                A vehicle held up for too long edges past, so one stubborn
//                brute cannot stop a district for good.
//   pedestrians  one instanced figure, walking the pavements.
//
// Everything is pre-sampled at build and stepped in place: no allocation in
// update(). Vehicles near the pilot are also solid — `colliders` is a fixed
// list src/walk.js pushes the walker out of, `colliderCount` long this frame.
//
// Model frame: +Z is the way a vehicle is going, +Y up, origin on the road.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// vehicles / pedestrians by quality tier
const COUNTS = { low: [10, 0], medium: [18, 16], high: [28, 24], ultra: [36, 32] };

const _c = new THREE.Color();
function paint(geo, hex) {
  const n = geo.attributes.position.count;
  const col = new Float32Array(n * 3);
  _c.set(hex);
  for (let i = 0; i < n; i++) {
    col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}
const box = (w, h, d, x, y, z, hex) => paint(new THREE.BoxGeometry(w, h, d).translate(x, y, z), hex);
const DARK = 0x14161b, GLASS = 0x1c2a38, BODY = 0xffffff; // BODY takes the instance colour

// Each kind: { body: [...], lights: [...], length, radius }.
const KINDS = {
  // terra: a low hover-sedan, nothing touching the road but its own light
  sedan() {
    return {
      length: 4.6, radius: 1.7,
      body: [
        box(1.9, 0.5, 4.4, 0, 0.45, 0, BODY),
        box(1.6, 0.42, 2.1, 0, 0.9, -0.3, GLASS),
        box(1.7, 0.16, 0.9, 0, 0.72, 1.6, BODY),
      ],
      lights: [
        box(1.5, 0.05, 3.8, 0, 0.16, 0, 0x8fe9ff), // underglow
        box(1.5, 0.1, 0.06, 0, 0.5, 2.21, 0xffffff),
        box(1.5, 0.1, 0.06, 0, 0.5, -2.21, 0xff3050),
      ],
    };
  },
  // rustia: an ore hauler, cab forward, hopper behind, six wheels
  hauler() {
    const body = [
      box(2.5, 0.5, 6.0, 0, 1.0, 0, DARK),
      box(2.3, 1.5, 1.7, 0, 2.0, 2.0, BODY),
      box(2.1, 0.6, 0.1, 0, 2.3, 2.86, GLASS),
      box(2.5, 1.5, 3.6, 0, 2.0, -1.1, BODY),
      box(2.1, 0.5, 3.2, 0, 2.9, -1.1, 0x3a2a22), // the load
    ];
    for (const z of [2.1, -0.4, -2.2]) for (const x of [-1.25, 1.25]) body.push(box(0.5, 1.1, 1.1, x, 0.55, z, DARK));
    return {
      length: 6.2, radius: 2.2, body,
      lights: [
        box(0.4, 0.3, 0.4, 0, 2.95, 2.0, 0xffb347), // beacon
        box(0.4, 0.25, 0.06, -0.8, 1.5, 2.88, 0xfff0c8),
        box(0.4, 0.25, 0.06, 0.8, 1.5, 2.88, 0xfff0c8),
        box(1.8, 0.14, 0.06, 0, 1.4, -3.02, 0xff4020),
      ],
    };
  },
  // wyattmattoe: a snowcat on two wide tracks, light bar on the roof
  snowcat() {
    return {
      length: 4.8, radius: 2.0,
      body: [
        box(0.85, 0.9, 4.8, -1.05, 0.45, 0, DARK),
        box(0.85, 0.9, 4.8, 1.05, 0.45, 0, DARK),
        box(2.3, 0.5, 4.2, 0, 1.1, 0, BODY),
        box(2.1, 1.3, 2.2, 0, 2.0, 0.7, BODY),
        box(1.9, 0.7, 0.1, 0, 2.2, 1.82, GLASS),
        box(2.0, 0.5, 1.6, 0, 1.6, -1.2, 0x5a6470), // cargo deck
        box(2.6, 0.5, 0.2, 0, 0.9, 2.5, DARK), // blade
      ],
      lights: [
        box(1.6, 0.14, 0.2, 0, 2.75, 1.2, 0xffffff),
        box(0.35, 0.2, 0.06, -0.8, 1.2, 2.12, 0xfff0c8),
        box(0.35, 0.2, 0.06, 0.8, 1.2, 2.12, 0xfff0c8),
        box(0.3, 0.3, 0.3, 0, 2.95, -0.3, 0xff7a2f), // beacon
      ],
    };
  },
};

// A polyline of [x, z] points resampled into flat arrays at even spacing, with
// the dome's height and normal at each sample.
function sample(pts, closed, metro, step = 1.5) {
  const seg = [];
  let L = 0;
  const n = pts.length;
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    seg.push(l);
    L += l;
  }
  const count = Math.max(2, Math.round(L / step));
  const ds = L / (closed ? count : count - 1);
  const x = new Float32Array(count), y = new Float32Array(count), z = new Float32Array(count);
  let si = 0, acc = 0;
  for (let i = 0; i < count; i++) {
    const s = i * ds;
    while (si < seg.length - 1 && acc + seg[si] < s) acc += seg[si++];
    const a = pts[si], b = pts[(si + 1) % n];
    const t = seg[si] > 0 ? Math.min((s - acc) / seg[si], 1) : 0;
    x[i] = a[0] + (b[0] - a[0]) * t;
    z[i] = a[1] + (b[1] - a[1]) * t;
    y[i] = metro.gy(x[i], z[i]);
  }
  return { x, y, z, count, ds, L, closed };
}

// opts: { metro (from buildMetro), theme, quality, rng, baseRadius,
//         bodyMat, lightMat, pedMat }
export function createTraffic(opts) {
  const { metro, theme, rng } = opts;
  const [nVeh, nPed] = COUNTS[opts.quality] ?? COUNTS.medium;
  const group = new THREE.Group();
  group.name = 'traffic';

  const routes = metro.routes.map((p) => sample(p, true, metro));
  const walks = metro.walks.map((w) => sample(w.pts, w.closed, metro, 1.2));

  // --- vehicles --------------------------------------------------------------
  const kind = KINDS[theme.vehicle]();
  const bodyGeo = mergeGeometries(kind.body, false);
  const lightGeo = mergeGeometries(kind.lights, false);
  for (const g of kind.body) g.dispose();
  for (const g of kind.lights) g.dispose();
  const bodies = new THREE.InstancedMesh(bodyGeo, opts.bodyMat, nVeh);
  const lights = new THREE.InstancedMesh(lightGeo, opts.lightMat, nVeh);
  bodies.frustumCulled = lights.frustumCulled = false;
  bodies.castShadow = true;
  group.add(bodies, lights);

  // share vehicles out by route length; a route's vehicles are contiguous and
  // in order round the loop, and stay in that order (nothing overtakes)
  const vRoute = new Uint8Array(nVeh), vNext = new Int16Array(nVeh);
  const vS = new Float32Array(nVeh), vV = new Float32Array(nVeh), vCruise = new Float32Array(nVeh);
  const vWait = new Float32Array(nVeh), vPass = new Float32Array(nVeh), vPhase = new Float32Array(nVeh);
  const vX = new Float32Array(nVeh), vZ = new Float32Array(nVeh);
  {
    const total = routes.reduce((a, r) => a + r.L, 0);
    const GAP = kind.length + 7; // a loop never holds more than fit on it
    let i = 0;
    routes.forEach((r, ri) => {
      let n = ri === routes.length - 1 ? nVeh - i : Math.round((nVeh * r.L) / total);
      n = Math.min(n, nVeh - i, Math.floor(r.L / GAP));
      const first = i;
      for (let k = 0; k < n; k++, i++) {
        vRoute[i] = ri;
        vS[i] = ((k + rng() * 0.5) / n) * r.L;
        vCruise[i] = theme.cruise[0] + rng() * (theme.cruise[1] - theme.cruise[0]);
        vV[i] = vCruise[i];
        vPhase[i] = rng() * 6.283;
        vNext[i] = k === n - 1 ? first : i + 1;
        _c.set(theme.bodyColors[Math.floor(rng() * theme.bodyColors.length)]);
        bodies.setColorAt(i, _c);
      }
    });
    bodies.count = lights.count = i;
    if (bodies.instanceColor) bodies.instanceColor.needsUpdate = true;
  }
  const vehicles = bodies.count;

  // --- pedestrians -----------------------------------------------------------
  let peds = null;
  const pWalk = new Uint8Array(nPed), pDir = new Int8Array(nPed);
  const pS = new Float32Array(nPed), pV = new Float32Array(nPed), pSide = new Float32Array(nPed), pPhase = new Float32Array(nPed);
  if (nPed > 0) {
    const fig = mergeGeometries([
      paint(new THREE.CapsuleGeometry(0.27, 0.62, 4, 8).translate(0, 1.12, 0), BODY),
      paint(new THREE.SphereGeometry(0.21, 10, 8).translate(0, 1.82, 0), 0xcdb8a4),
      paint(new THREE.BoxGeometry(0.4, 0.62, 0.26).translate(0, 0.31, 0), 0x2a2d36),
    ], false);
    peds = new THREE.InstancedMesh(fig, opts.pedMat, nPed);
    peds.frustumCulled = false;
    peds.castShadow = true;
    group.add(peds);
    const coats = [0xd8dce6, 0x3a4050, 0x8a5a44, 0x4a6a8a, 0x9a8a5a, 0x6a4a7a, ...theme.bodyColors];
    for (let i = 0; i < nPed; i++) {
      pWalk[i] = walks.length > 1 && i % 3 === 0 ? 1 : 0;
      pDir[i] = rng() < 0.5 ? 1 : -1;
      pS[i] = rng() * walks[pWalk[i]].L;
      pV[i] = 1.2 + rng() * 0.8;
      pSide[i] = (rng() - 0.5) * 1.4;
      pPhase[i] = rng() * 6.283;
      _c.set(coats[Math.floor(rng() * coats.length)]);
      peds.setColorAt(i, _c);
    }
    if (peds.instanceColor) peds.instanceColor.needsUpdate = true;
  }

  // --- stepping --------------------------------------------------------------
  const _m = new THREE.Matrix4();
  const _p = new THREE.Vector3(), _f = new THREE.Vector3(), _u = new THREE.Vector3(), _r = new THREE.Vector3();
  const MAXCOL = 6;
  const colliders = [];
  for (let i = 0; i < MAXCOL; i++) colliders.push({ x: 0, z: 0, radius: kind.radius });
  let colliderCount = 0;
  const AHEAD = 9, HALF = 2.3; // the box a driver watches

  // where `s` along a sampled path is: writes _p (position) and _f (heading)
  function at(path, s) {
    const u = s / path.ds;
    let i = Math.floor(u);
    const t = u - i;
    const n = path.count;
    let j;
    if (path.closed) {
      i = ((i % n) + n) % n;
      j = (i + 1) % n;
    } else {
      i = Math.min(Math.max(i, 0), n - 2);
      j = i + 1;
    }
    _p.set(path.x[i] + (path.x[j] - path.x[i]) * t, path.y[i] + (path.y[j] - path.y[i]) * t, path.z[i] + (path.z[j] - path.z[i]) * t);
    _f.set(path.x[j] - path.x[i], path.y[j] - path.y[i], path.z[j] - path.z[i]).normalize();
  }
  // is (x, z) in the box ahead of the vehicle at _p heading _f?
  function inPath(x, z, extra, reach) {
    const dx = x - _p.x, dz = z - _p.z;
    const along = dx * _f.x + dz * _f.z;
    if (along < 0.5 || along > reach + extra) return false;
    return Math.abs(dx * _f.z - dz * _f.x) < HALF + extra;
  }

  // `player`: the walker in the city's frame, or null. `hazards`: { n, x, z, r }
  // typed arrays of things standing about (the siege's monsters), or null.
  function update(dt, t, player, hazards) {
    colliderCount = 0;
    for (let i = 0; i < vehicles; i++) {
      const R = routes[vRoute[i]];
      at(R, vS[i]);
      // the one in front
      let gap = vS[vNext[i]] - vS[i];
      if (gap <= 0) gap += R.L;
      let stop = vNext[i] !== i && gap < kind.length + 4.5;
      let held = false;
      if (!stop && vPass[i] <= 0) {
        const reach = AHEAD + vV[i] * 0.5;
        if (player && inPath(player.x, player.z, 0.4, reach)) held = true;
        if (!held && hazards) {
          for (let k = 0; k < hazards.n; k++) {
            if (inPath(hazards.x[k], hazards.z[k], hazards.r[k], reach)) {
              held = true;
              break;
            }
          }
        }
      }
      if (vPass[i] > 0) vPass[i] -= dt;
      const want = stop || held ? 0 : vPass[i] > 0 ? vCruise[i] * 0.4 : vCruise[i];
      const dv = want - vV[i];
      vV[i] += dv > 0 ? Math.min(dv, 5 * dt) : Math.max(dv, -16 * dt);
      if (held && vV[i] < 0.05) {
        vWait[i] += dt;
        if (vWait[i] > 6) {
          vWait[i] = 0;
          vPass[i] = 3; // edge past whatever it is
        }
      } else if (!held) vWait[i] = 0;
      vS[i] = (vS[i] + vV[i] * dt) % R.L;

      at(R, vS[i]);
      vX[i] = _p.x;
      vZ[i] = _p.z;
      metro.up(_p.x, _p.z, _u);
      _r.crossVectors(_u, _f).normalize();
      _f.crossVectors(_r, _u);
      if (theme.hover) _p.addScaledVector(_u, theme.hover + Math.sin(t * 2.1 + vPhase[i]) * 0.07);
      _m.makeBasis(_r, _u, _f).setPosition(_p);
      bodies.setMatrixAt(i, _m);
      lights.setMatrixAt(i, _m);

      if (player && colliderCount < MAXCOL) {
        const dx = _p.x - player.x, dz = _p.z - player.z;
        if (dx * dx + dz * dz < 900) {
          const c = colliders[colliderCount++];
          c.x = _p.x;
          c.z = _p.z;
        }
      }
    }
    bodies.instanceMatrix.needsUpdate = true;
    lights.instanceMatrix.needsUpdate = true;

    if (peds) {
      for (let i = 0; i < nPed; i++) {
        const W = walks[pWalk[i]];
        // stop short of the pilot rather than walk through them
        let v = pV[i];
        at(W, pS[i]);
        if (player) {
          const dx = player.x - _p.x, dz = player.z - _p.z;
          if (dx * dx + dz * dz < 2.6 && (dx * _f.x + dz * _f.z) * pDir[i] > 0) v = 0;
        }
        pS[i] += v * dt * pDir[i];
        if (W.closed) pS[i] = ((pS[i] % W.L) + W.L) % W.L;
        else if (pS[i] > W.L - 1 || pS[i] < 1) {
          pS[i] = Math.min(Math.max(pS[i], 1), W.L - 1);
          pDir[i] = -pDir[i]; // the end of the pavement: turn round
        }
        at(W, pS[i]);
        if (pDir[i] < 0) _f.negate();
        metro.up(_p.x, _p.z, _u);
        _r.crossVectors(_u, _f).normalize();
        _f.crossVectors(_r, _u);
        _p.addScaledVector(_r, pSide[i]);
        // a walk: a small rise twice a stride
        _p.addScaledVector(_u, 0.13 + (v > 0 ? Math.abs(Math.sin(t * 5.2 * pV[i] * 0.6 + pPhase[i])) * 0.07 : 0));
        _m.makeBasis(_r, _u, _f).setPosition(_p);
        peds.setMatrixAt(i, _m);
      }
      peds.instanceMatrix.needsUpdate = true;
    }
  }
  update(0, 0, null, null); // matrices valid before the first frame

  return {
    group,
    update,
    colliders,
    get colliderCount() { return colliderCount; },
    // headless verification (walkSite().city.traffic.info())
    info() {
      const v = [];
      for (let i = 0; i < vehicles; i++) v.push({ x: vX[i], z: vZ[i], v: vV[i], route: vRoute[i], s: vS[i] });
      return { vehicles, peds: nPed, routes: routes.length, routeLengths: routes.map((r) => Math.round(r.L)), list: v };
    },
    dispose() {
      bodyGeo.dispose();
      lightGeo.dispose();
      if (peds) peds.geometry.dispose();
      bodies.dispose();
      lights.dispose();
      if (peds) peds.dispose();
    },
  };
}
