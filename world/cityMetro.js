// The city around the town (world/city.js calls this while it builds).
//
// A town used to be eight houses on a ring round a plaza and then nothing: an
// empty paved disc out to the landing pad. This fills that disc with a city.
// The old town is left exactly where it was — plaza, houses, tower, gate and
// walkway — so every home, stroll and piece of siege cover is still valid, and
// the new streets go round it:
//
//   ring road A   just outside the house ring, a full circle
//   ring road B   near the city's edge, open at the landing pad's sector
//   spokes        between the two, evenly round the compass, turned so the
//                 pad and its walkway fall in the middle of a sector
//   blocks        the sectors between the roads, packed with buildings nobody
//                 goes into: towers on terra, adobe and tank farms on rustia,
//                 chalets and gear sheds on wyattmattoe
//
// Nothing here makes a draw call of its own: it hands back geometry for the
// city's merged meshes (buildings into the town's existing wall, roof, window
// and neon buckets; roads into four lists the city turns into four meshes).
// Buildings are solid circles in `collidersLocal`, so the walker, the
// citizens, the monsters, the siege cover and rustia's mine head all keep
// clear of them without being told.
//
// It also lays out where traffic runs (world/cityTraffic.js): closed loops,
// each on a lane no other loop uses, so no junction ever needs deciding.
//
// The frame is the city's flat tangent frame. The ground under a city is
// levelled to the planet's curve (src/cityflatten.js), which in this frame is
// a dome: `gy(x, z)` is that dome, analytic, and `up(x, z)` its normal.

import * as THREE from 'three';

export const ROAD_W = 8; // two lanes
const LANE = ROAD_W / 4; // lane centre, from the road's centre line
const STEP = 2; // sample spacing along a road
const WALK_OFF = ROAD_W / 2 + 1.4; // pavement centre, from the road's centre line

// What each world's city is made of. Keyed by the style name in
// world/city.js CITY_STYLES; a style with no entry gets no metro.
export const METRO_THEMES = {
  // terra: wet asphalt under neon, hover-sedans, glass towers
  neonMetropolis: {
    spokes: 8, kind: 'towers', rowDepth: 22, lot: [13, 22],
    road: 0x0b0c13, roadFam: 'concrete', paint: 'lines', pavement: true,
    vehicle: 'sedan', hover: 0.55, cruise: [8, 13],
    bodyColors: [0xe8eaf2, 0x20222c, 0xff2fa0, 0x2fe8ff, 0xd8ff2f, 0x7a5cff],
  },
  // rustia: packed oxide dirt between amber marker posts, ore haulers
  dustOutpost: {
    spokes: 6, kind: 'adobe', rowDepth: 14, lot: [11, 18],
    road: 0x6a4630, roadFam: 'aggregate', paint: 'posts', pavement: false,
    vehicle: 'hauler', hover: 0, cruise: [5, 8],
    bodyColors: [0xb5532c, 0x8a6a48, 0xd9a441, 0x6e6a62, 0x9c3b22],
  },
  // wyattmattoe: ploughed snow with ruts, snow poles, tracked snowcats
  basecampNeon: {
    spokes: 6, kind: 'chalet', rowDepth: 16, lot: [10, 16],
    road: 0xb9c7d6, roadFam: 'stone', paint: 'poles', pavement: false,
    vehicle: 'snowcat', hover: 0, cruise: [4, 7],
    bodyColors: [0xff7a2f, 0xd8262e, 0xf4f8ff, 0x2f6fff, 0xffd23f],
  },
};

const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const Y = new THREE.Vector3(0, 1, 0);

// ctx: { rng, theme, palette, metroRadius, townEdge, gateBearing, pad {x, z},
//        gate {x, z}, groundRadius, baseRadius, sink, isWet(x, z),
//        buckets { wall, roof, warm, trim }, collidersLocal, low }
export function buildMetro(ctx) {
  const { rng, theme, palette, metroRadius, gateBearing, pad, gate, buckets, collidersLocal } = ctx;
  const Rg = ctx.groundRadius, R0 = ctx.baseRadius;

  // the dome the city stands on, and its normal
  const gy = (x, z) => Math.sqrt(Math.max(Rg * Rg - x * x - z * z, 0)) - R0 - ctx.sink;
  const up = (x, z, out) => out.set(x, R0, z).normalize();

  const rA = ctx.townEdge + ROAD_W / 2 + 3;
  const rB = metroRadius - ROAD_W / 2 - 6;
  const N = theme.spokes;
  const sector = (Math.PI * 2) / N;
  // spoke i runs out along a0 + i * sector; the pad's sector is the last one
  const a0 = gateBearing + sector / 2;
  const hasB = rB - rA > 26;

  const roadGeos = [], markGeos = [], sideGeos = [], rutGeos = [];
  const roads = []; // centre lines, for roadDist: { kind: 'ring' | 'arc' | 'spoke', ... }

  // --- geometry helpers ------------------------------------------------------

  // A flat ribbon along a polyline of [x, z] points, `w` wide, shifted `off`
  // to the left of travel, `lift` above the dome. Indexed, with normals.
  function ribbon(pts, w, off, lift, closed) {
    const n = pts.length;
    const pos = new Float32Array(n * 2 * 3), nor = new Float32Array(n * 2 * 3), uv = new Float32Array(n * 2 * 2);
    const idx = [];
    let run = 0;
    for (let i = 0; i < n; i++) {
      const p = pts[i];
      const a = pts[closed ? (i - 1 + n) % n : Math.max(i - 1, 0)];
      const b = pts[closed ? (i + 1) % n : Math.min(i + 1, n - 1)];
      let tx = b[0] - a[0], tz = b[1] - a[1];
      const tl = Math.hypot(tx, tz) || 1;
      tx /= tl; tz /= tl;
      const lx = tz, lz = -tx; // left of travel
      if (i) run += Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]);
      for (let s = 0; s < 2; s++) {
        const o = off + (s ? -w / 2 : w / 2);
        const x = p[0] + lx * o, z = p[1] + lz * o;
        const k = (i * 2 + s) * 3;
        pos[k] = x; pos[k + 1] = gy(x, z) + lift; pos[k + 2] = z;
        up(x, z, _v);
        nor[k] = _v.x; nor[k + 1] = _v.y; nor[k + 2] = _v.z;
        uv[(i * 2 + s) * 2] = s; uv[(i * 2 + s) * 2 + 1] = run / w;
      }
      if (i < n - 1 || closed) {
        const i0 = i * 2, i1 = ((i + 1) % n) * 2;
        idx.push(i0, i0 + 1, i1, i0 + 1, i1 + 1, i1);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    return g;
  }

  const arcPts = (r, from, to) => {
    const n = Math.max(4, Math.ceil((Math.abs(to - from) * r) / STEP));
    const out = [];
    for (let i = 0; i <= n; i++) {
      const a = from + ((to - from) * i) / n;
      out.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    return out;
  };
  const ringPts = (r) => {
    const n = Math.ceil((Math.PI * 2 * r) / STEP);
    const out = [];
    for (let i = 0; i < n; i++) out.push([Math.cos((i / n) * Math.PI * 2) * r, Math.sin((i / n) * Math.PI * 2) * r]);
    return out;
  };
  const linePts = (a, r0, r1) => {
    const n = Math.max(2, Math.ceil(Math.abs(r1 - r0) / STEP));
    const out = [];
    for (let i = 0; i <= n; i++) {
      const r = r0 + ((r1 - r0) * i) / n;
      out.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    return out;
  };
  // a slice of a polyline between two distances along it
  const slice = (pts, i0, i1) => pts.slice(i0, i1 + 1);

  // A building part into a bucket: `geo` is built standing on the origin,
  // facing +Z; it is turned to `yaw`, stood along the dome's normal and put
  // down at (x, z), sunk a little so no daylight shows under a corner.
  function place(bucket, geo, x, z, yaw) {
    geo.rotateY(yaw);
    geo.applyQuaternion(_q.setFromUnitVectors(Y, up(x, z, _v)));
    geo.translate(x, gy(x, z), z);
    bucket.push(geo);
  }
  const boxOn = (w, h, d, y0 = 0, ox = 0, oz = 0) => new THREE.BoxGeometry(w, h, d).translate(ox, y0 + h / 2, oz);

  // --- roads -----------------------------------------------------------------

  function lay(pts, closed) {
    roadGeos.push(ribbon(pts, ROAD_W, 0, 0.07, closed));
    if (theme.pavement) {
      for (const s of [-1, 1]) sideGeos.push(ribbon(pts, 2.4, s * WALK_OFF, 0.12, closed));
    }
    if (theme.paint === 'lines') {
      // neon edge lines, and a dashed centre line
      for (const s of [-1, 1]) markGeos.push(ribbon(pts, 0.16, s * (ROAD_W / 2 - 0.35), 0.1, closed));
      for (let i = 0; i + 2 < pts.length; i += 4) markGeos.push(ribbon(slice(pts, i, i + 2), 0.22, 0, 0.1, false));
    } else {
      // wheel ruts, darker than the road, and markers down the verges
      for (const s of [-1, 1]) {
        for (const o of [LANE - 0.9, LANE + 0.9]) rutGeos.push(ribbon(pts, 0.5, s * o, 0.09, closed));
      }
      const tall = theme.paint === 'poles';
      for (let i = 0; i < pts.length; i += 7) {
        const p = pts[i], q = pts[Math.min(i + 1, pts.length - 1)];
        let tx = q[0] - p[0], tz = q[1] - p[1];
        const tl = Math.hypot(tx, tz) || 1;
        tx /= tl; tz /= tl;
        const s = (i / 7) & 1 ? 1 : -1;
        const x = p[0] + tz * s * (ROAD_W / 2 + 0.7), z = p[1] - tx * s * (ROAD_W / 2 + 0.7);
        const post = tall ? boxOn(0.14, 2.6, 0.14) : boxOn(0.3, 0.9, 0.3);
        place(markGeos, post, x, z, 0);
      }
    }
  }

  const ringA = ringPts(rA);
  lay(ringA, true);
  roads.push({ kind: 'ring', r: rA });
  const spokes = [];
  let arcB = null;
  if (hasB) {
    // B: from spoke 0 round to spoke N-1 (the pad's sector is left open)
    arcB = arcPts(rB, a0, a0 + sector * (N - 1));
    lay(arcB, false);
    roads.push({ kind: 'arc', r: rB, from: a0, span: sector * (N - 1) });
    for (let i = 0; i < N; i++) {
      const a = a0 + i * sector;
      lay(linePts(a, rA, rB), false);
      spokes.push(a);
      roads.push({ kind: 'spoke', a, r0: rA, r1: rB });
    }
  }

  // Distance from (x, z) to the nearest road's centre line.
  function roadDist(x, z) {
    const d = Math.hypot(x, z);
    let a = Math.atan2(z, x);
    let best = Math.abs(d - rA);
    for (const r of roads) {
      if (r.kind === 'arc') {
        let t = (((a - r.from) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
        if (t <= r.span) best = Math.min(best, Math.abs(d - r.r));
        else {
          // past an end: distance to the nearer end point
          t = t - r.span < Math.PI * 2 - t ? r.from + r.span : r.from;
          best = Math.min(best, Math.hypot(x - Math.cos(t) * r.r, z - Math.sin(t) * r.r));
        }
      } else if (r.kind === 'spoke') {
        const cx = Math.cos(r.a), cz = Math.sin(r.a);
        const al = Math.min(Math.max(x * cx + z * cz, r.r0), r.r1);
        best = Math.min(best, Math.hypot(x - cx * al, z - cz * al));
      }
    }
    return best;
  }

  // --- traffic routes --------------------------------------------------------
  // Each is a closed loop of [x, z] points with a lane to itself:
  //   - ring A's inner lane, all the way round;
  //   - one circuit per sector that has B on its far side: out a spoke, along
  //     B's inner lane, in the next spoke, back along A's outer lane.
  // Neighbouring circuits meet a spoke going opposite ways, one lane each.
  const routes = [];
  routes.push(ringPts(rA - LANE));
  if (hasB) {
    for (let i = 0; i < N - 1; i++) {
      const s0 = a0 + i * sector, s1 = s0 + sector;
      const pts = [];
      const lane = (a, r, side) => [Math.cos(a) * r - Math.sin(a) * side * LANE, Math.sin(a) * r + Math.cos(a) * side * LANE];
      const push = (p) => pts.push(p);
      const rIn = rA + LANE, rOut = rB - LANE;
      const da = LANE / rIn, db = LANE / rOut; // the lane's own angle off the spoke
      // out spoke i, on the sector's side of it
      for (let r = rIn + 3; r <= rOut - 3; r += STEP) push(lane(s0, r, 1));
      // along B, toward spoke i+1
      for (const p of arcPts(rOut, s0 + db + 3 / rOut, s1 - db - 3 / rOut)) push(p);
      // in spoke i+1, on the sector's side of it
      for (let r = rOut - 3; r >= rIn + 3; r -= STEP) push(lane(s1, r, -1));
      // back along A's outer lane
      for (const p of arcPts(rIn, s1 - da - 3 / rIn, s0 + da + 3 / rIn)) push(p);
      routes.push(pts);
    }
  }

  // Pavements people walk: A's inner side (a loop), B's outer side (there and back).
  const walks = [{ pts: ringPts(rA - WALK_OFF), closed: true }];
  if (hasB) walks.push({ pts: arcPts(rB + WALK_OFF, a0 + 0.05, a0 + sector * (N - 1) - 0.05), closed: false });

  // --- blocks ----------------------------------------------------------------

  // keep clear: the pad, the gate, and the walkway from pad to gate to plaza
  const segDist = (x, z, ax, az, bx, bz) => {
    const dx = bx - ax, dz = bz - az;
    const t = Math.min(Math.max(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1), 0), 1);
    return Math.hypot(x - ax - dx * t, z - az - dz * t);
  };
  const reserved = (x, z, rad) =>
    Math.hypot(x - pad.x, z - pad.z) < 30 + rad ||
    segDist(x, z, pad.x, pad.z, gate.x, gate.z) < 15 + rad ||
    segDist(x, z, gate.x, gate.z, 0, 0) < 13 + rad ||
    ctx.isWet(x, z);

  let buildings = 0;
  const BUILD = { towers: tower, adobe: adobe, chalet: chalet }[theme.kind];

  function block(x, z, yaw, w, d) {
    const rad = Math.hypot(w, d) * 0.5;
    if (reserved(x, z, rad * 0.8)) return;
    const h = BUILD(x, z, yaw, w, d);
    collidersLocal.push({ x, z, radius: rad * 0.8, height: h });
    buildings++;
  }

  // terra: a tower with ribbon windows, sometimes stepped back, under a neon crown
  function tower(x, z, yaw, w, d) {
    const tall = rng() < 0.3;
    const h = tall ? 46 + rng() * 26 : 18 + rng() * 22;
    place(buckets.wall, boxOn(w, h + 1.5, d, -1.5), x, z, yaw);
    const floors = ctx.low ? 2 : Math.max(2, Math.floor(h / 7));
    for (let i = 0; i < floors; i++) {
      place(buckets.warm, boxOn(w + 0.12, 1.5, d + 0.12, 3.2 + (i * (h - 6)) / floors), x, z, yaw);
    }
    let top = h;
    if (tall && w > 15) {
      const h2 = 10 + rng() * 12;
      place(buckets.wall, boxOn(w * 0.6, h2, d * 0.6, h), x, z, yaw);
      place(buckets.warm, boxOn(w * 0.6 + 0.12, 1.3, d * 0.6 + 0.12, h + h2 * 0.5), x, z, yaw);
      place(buckets.trim, boxOn(w * 0.6 + 0.3, 0.35, d * 0.6 + 0.3, h + h2), x, z, yaw);
      top = h + h2;
      if (rng() < 0.6) place(buckets.trim, boxOn(0.25, 9 + rng() * 8, 0.25, top), x, z, yaw); // mast
    }
    place(buckets.roof, boxOn(w + 0.6, 0.5, d + 0.6, h), x, z, yaw);
    place(buckets.trim, boxOn(w + 0.4, 0.3, d + 0.4, h - 0.9), x, z, yaw); // the crown
    return top;
  }

  // rustia: adobe blocks with deep-set lit openings; every few lots a silo or
  // a pair of tanks instead
  function adobe(x, z, yaw, w, d) {
    const roll = rng();
    if (roll < 0.2) {
      const r = Math.min(w, d) * 0.36, h = 12 + rng() * 9;
      place(buckets.wall, new THREE.CylinderGeometry(r, r, h + 1.5, 14).translate(0, h / 2 - 0.75, 0), x, z, yaw);
      place(buckets.roof, new THREE.ConeGeometry(r + 0.3, 3.2, 14).translate(0, h + 1.6, 0), x, z, yaw);
      place(buckets.trim, boxOn(0.35, 0.35, 0.35, h + 3.2), x, z, yaw); // beacon
      place(buckets.roof, boxOn(1.1, h * 0.9, 1.1, 0, r + 0.8, 0), x, z, yaw); // ladder cage
      return h + 3;
    }
    if (roll < 0.34) {
      const r = Math.min(w * 0.24, d * 0.4);
      for (const s of [-1, 1]) {
        place(buckets.roof, new THREE.CylinderGeometry(r, r, 7, 16).translate(s * (r + 0.7), 2.5, 0), x, z, yaw);
        place(buckets.warm, new THREE.CylinderGeometry(r + 0.06, r + 0.06, 0.3, 16).translate(s * (r + 0.7), 5.4, 0), x, z, yaw);
      }
      place(buckets.wall, boxOn(w * 0.9, 1.0, 0.8, -0.4, 0, d * 0.42), x, z, yaw); // bund wall
      return 6;
    }
    const h = 6 + rng() * 9;
    place(buckets.wall, boxOn(w, h + 1.5, d, -1.5), x, z, yaw);
    place(buckets.roof, boxOn(w + 0.8, 0.5, d + 0.8, h), x, z, yaw); // parapet line
    if (rng() < 0.5) place(buckets.wall, boxOn(w * 0.5, 4, d * 0.55, h, w * 0.2, 0), x, z, yaw); // upper room
    const floors = ctx.low ? 1 : Math.max(1, Math.floor(h / 5));
    for (let i = 0; i < floors; i++) {
      // openings on the two long faces: short lit slots, not ribbons
      for (let k = -1; k <= 1; k++) {
        place(buckets.warm, boxOn(1.6, 1.5, d + 0.14, 2.2 + i * 4.6, k * w * 0.3, 0), x, z, yaw);
      }
    }
    if (rng() < 0.35) place(buckets.trim, boxOn(w * 0.5, 0.25, 0.25, h + 0.7, 0, d * 0.5), x, z, yaw); // shop sign
    return h;
  }

  // wyattmattoe: timber chalets under steep roofs, and long low gear sheds
  function chalet(x, z, yaw, w, d) {
    const shed = rng() < 0.28;
    const h = shed ? 4.5 : 6 + rng() * 5;
    place(buckets.wall, boxOn(w, h + 1.5, d, -1.5), x, z, yaw);
    // the roof: a three-sided cylinder is a prism, ridge along the building's length
    const rise = shed ? 2.2 : 4.5 + rng() * 2.5;
    const half = d / 2 + 1.1;
    const roof = new THREE.CylinderGeometry(1, 1, w + 1.6, 3, 1).rotateZ(Math.PI / 2).rotateX(-Math.PI / 2);
    // unit prism: apex at +Y 1, base corners at y -0.5, z ±0.866 → scale to fit
    roof.scale(1, rise / 1.5, half / 0.866).translate(0, h + rise / 3, 0);
    place(buckets.roof, roof, x, z, yaw);
    if (!shed) {
      for (const s of [-1, 1]) {
        place(buckets.warm, boxOn(w * 0.62, 1.5, 0.14, 2.3, 0, s * (d / 2 + 0.02)), x, z, yaw);
        if (h > 8) place(buckets.warm, boxOn(w * 0.4, 1.2, 0.14, 6.2, 0, s * (d / 2 + 0.02)), x, z, yaw);
      }
      place(buckets.roof, boxOn(1.1, 3.2, 1.1, h + rise * 0.3, w * 0.28, 0), x, z, yaw); // chimney
    } else {
      place(buckets.warm, boxOn(0.14, 2.6, d * 0.5, 0.4, w / 2 + 0.02, 0), x, z, yaw); // lit doorway
    }
    place(buckets.trim, boxOn(w + 1.7, 0.16, 0.16, h + 0.15, 0, half - 0.1), x, z, yaw); // eave light
    return h + rise;
  }

  // pack each sector's band with rows of lots
  if (hasB) {
    const inner = rA + ROAD_W / 2 + 5, outer = rB - ROAD_W / 2 - 5;
    const depth = Math.min(theme.rowDepth, outer - inner);
    const rows = Math.max(1, Math.floor((outer - inner + 5) / (depth + 5)));
    const pitch = rows > 1 ? (outer - inner - depth) / (rows - 1) : 0;
    for (let i = 0; i < N; i++) {
      const s0 = a0 + i * sector;
      for (let row = 0; row < rows; row++) {
        const rc = inner + depth / 2 + row * pitch;
        const margin = (ROAD_W / 2 + 5) / rc;
        let a = s0 + margin;
        const end = s0 + sector - margin;
        while (a < end) {
          const w = theme.lot[0] + rng() * (theme.lot[1] - theme.lot[0]);
          const half = w / 2 / rc;
          if (a + half * 2 > end) break;
          a += half;
          const d = depth * (0.72 + rng() * 0.28);
          // face the ring roads: the building's long face is along the street
          block(Math.cos(a) * rc, Math.sin(a) * rc, Math.PI / 2 - a, w, d);
          a += half + (3.5 + rng() * 3) / rc;
        }
      }
    }
  }

  return {
    rA, rB: hasB ? rB : null, spokes, roads, roadDist, routes, walks, gy, up,
    roadGeos, markGeos, sideGeos, rutGeos, buildings,
  };
}
