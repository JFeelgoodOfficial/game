/**
 * wyattmattoe-lifts.js — the Highline chairlift.
 *
 * A detachable-style chairlift from the basecamp pad to a top station a few
 * hundred metres up the mountain: two terminals with turning bullwheels, a
 * line of lattice-free steel towers footed on the real terrain, one closed
 * haul cable, and a loop of chairs the player (and the ambient riders in
 * wyattmattoe-riders.js) can actually sit on.
 *
 * WHERE IT GOES. The basecamp is sited relative to the landing point, so the
 * mountain around it is different on every landing. The line is therefore
 * PROBED, not authored: 24 bearings x 5 lengths are scored for height
 * difference, minus the "wrong way" slope a descending rider would have to
 * climb, long dead-flat lake crossings and cliffs, and anything that would
 * cross a keep-out disc (the permanent city, the parked ship) is thrown away.
 * The far terminal may come out above the basecamp or below it: the towns sit
 * on levelled high ground, so from a town pad the hill usually falls AWAY and
 * the basecamp terminal is the top station. Everything after the probe works
 * in low-terminal -> high-terminal terms and does not care which it was. The
 * probe is deterministic in the site, so the same landing always strings the
 * same lift.
 *
 * FRAMES. Everything is planned in planet.surface's unrotated, planet-centred
 * frame ("surface-local": that is what terrainAtLocal samples) and BUILT in
 * the basecamp anchor's frame, so vertex coordinates stay within a few hundred
 * units of the origin instead of ~1300 out, where float32 gets coarse. The
 * planet's centre in that frame is `centre`; "up" at any anchor-local point is
 * the direction away from it — the line is long enough (up to ~340 u on a
 * 1050 u world) that up tilts by ~18 degrees end to end, so every tower, chair
 * and station carries its own.
 *
 * THE RIDE is stepped from walk.js's stepWalk through wyattmattoe.stepWalker
 * (the elevator precedent in world/city.js): the cable phase advances in the
 * physics tick, so the chair and the walker pinned to it stay in exact
 * lockstep and __debug.walkStep() drives the whole ride headlessly.
 *
 * Zero per-frame allocation: all scratch lives in the closure.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const LIFT_SPEED = 7.0; // cable speed, u/s — a ~300 u line is a ~45 s ride
const HALF = 1.8; // half the gauge between the up line and the down line
const STATION_CABLE = 4.0; // cable height over the ground inside a terminal
const TOWER_MIN = 9.0; // shortest tower
const TOWER_MAX = 46.0; // tallest the clearance solver may raise one
const CLEARANCE = 6.5; // cable over terrain between towers (chairs hang 3 u)
const SEAT_DROP = 2.96; // cable -> top of the seat cushion
const SIT_DROP = SEAT_DROP + 0.5; // cable -> the walker's origin when seated
const CHAIR_SPACING = 24; // target gap between chairs along the cable
const STATION_OUT = 22; // the basecamp terminal's distance from the pad centre
const REACH = 5.5; // E range around a terminal
const PISTE_LIFT = 0.28; // the groomed run sits this far above the terrain facets

export function createWyattLifts(planet, ctx) {
  const { anchor, avoid = [] } = ctx;
  const root = new THREE.Group();
  root.name = 'wyattmattoe-lift';
  anchor.add(root);
  const owned = [];
  // Plain painted materials, built here: the walk-session registry's tiling
  // PBR steel is authored for wall-sized panels and bands badly across a
  // 0.3 u tube, and a lift is galvanised-and-paint anyway.
  const mats = {
    steel: new THREE.MeshStandardMaterial({ color: 0x8b95a3, roughness: 0.42, metalness: 0.65 }),
    timber: new THREE.MeshStandardMaterial({ color: 0x6a4a30, roughness: 0.85 }),
    accent: new THREE.MeshStandardMaterial({ color: 0xff7a1a, roughness: 0.6 }),
    snow: new THREE.MeshStandardMaterial({
      color: 0xf1f5fb, roughness: 0.93,
      // The piste is draped a hand's width over terrain it shares a depth
      // range with; the offset keeps the two from shimmering at a distance.
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    }),
  };
  owned.push(mats.steel, mats.timber, mats.accent, mats.snow);

  const radius = planet.radius ?? 1050;
  const iceR = planet.water && planet.water.frozen ? planet.water.r : 0;
  const terrain = planet.body?.terrainAtLocal ? (d) => planet.body.terrainAtLocal(d) : () => 0;
  // The walkable floor, exactly as walk.js's floorRadius: terrain, or the ice
  // sheet where a canyon lake is frozen over it.
  const floorR = (dir) => Math.max(radius + terrain(dir), iceR);

  // The ground as DRAWN. The planet's terrain is a displaced lat-long sphere
  // with ~18 u between vertices: exact at each vertex, flat facets between.
  // The analytic field the walker stands on curves inside those facets, so on
  // a rounded flank the two differ by a metre or two — nothing for a walker
  // (the camera rides with them), but a white piste draped on the analytic
  // field shows the facets poking through it in patches, and ambient riders
  // would visibly wade. So anything that is only LOOKED at — the piste, the
  // riders — sits on the facet under it instead: a ray from the planet centre
  // against the two triangles of the cell, read live from the mesh (the bake
  // is progressive, so nothing is cached).
  const sGeo = planet.surface?.geometry;
  const sPos = sGeo?.attributes?.position;
  const wSeg = sGeo?.parameters?.widthSegments ?? 0;
  const hSeg = sGeo?.parameters?.heightSegments ?? 0;
  const facets = !!(sPos && wSeg && hSeg && sPos.count === (wSeg + 1) * (hSeg + 1));
  // Distance along unit `d` from the origin to triangle (ia, ib, ic)'s plane,
  // or -1 if the hit falls outside the triangle.
  function facetHit(d, ia, ib, ic, loose) {
    const ax = sPos.getX(ia), ay = sPos.getY(ia), az = sPos.getZ(ia);
    const e1x = sPos.getX(ib) - ax, e1y = sPos.getY(ib) - ay, e1z = sPos.getZ(ib) - az;
    const e2x = sPos.getX(ic) - ax, e2y = sPos.getY(ic) - ay, e2z = sPos.getZ(ic) - az;
    // Moller-Trumbore with the ray origin at the planet centre.
    const px = d.y * e2z - d.z * e2y, py = d.z * e2x - d.x * e2z, pz = d.x * e2y - d.y * e2x;
    const det = e1x * px + e1y * py + e1z * pz;
    if (Math.abs(det) < 1e-9) return -1;
    const inv = 1 / det;
    const u = -(ax * px + ay * py + az * pz) * inv;
    const qx = -(ay * e1z - az * e1y), qy = -(az * e1x - ax * e1z), qz = -(ax * e1y - ay * e1x);
    const v = (d.x * qx + d.y * qy + d.z * qz) * inv;
    if (!loose && (u < -1e-4 || v < -1e-4 || u + v > 1.0001)) return -1;
    return (e2x * qx + e2y * qy + e2z * qz) * inv;
  }
  function drawnR(dir) {
    if (!facets) return floorR(dir);
    const fy = (Math.acos(Math.min(1, Math.max(-1, dir.y))) / Math.PI) * hSeg;
    let phi = Math.atan2(dir.z, -dir.x);
    if (phi < 0) phi += Math.PI * 2;
    const fx = (phi / (Math.PI * 2)) * wSeg;
    const iy = Math.min(hSeg - 1, Math.floor(fy));
    const ix = Math.min(wSeg - 1, Math.floor(fx));
    // SphereGeometry's cell: a = (iy, ix+1), b = (iy, ix), c = (iy+1, ix),
    // d = (iy+1, ix+1); triangles (a, b, d) and (b, c, d).
    const b = iy * (wSeg + 1) + ix;
    const a = b + 1;
    const c = b + wSeg + 1;
    const dd = c + 1;
    let r = facetHit(dir, a, b, dd, false);
    if (r < 0) r = facetHit(dir, b, c, dd, true);
    // An unbaked (still spherical) or degenerate cell: fall back to the field.
    if (!(r > radius * 0.5)) return floorR(dir);
    return Math.max(r, iceR);
  }
  // What the riders stand on: the groomed surface, not the facet beneath it.
  const pisteR = (dir) => drawnR(dir) + PISTE_LIFT;

  const anchorPos = anchor.position.clone();
  const anchorQ = anchor.quaternion.clone();
  const invQ = anchorQ.clone().invert();
  const siteDir = anchorPos.clone().normalize();
  const siteR = anchorPos.length();
  const centre = new THREE.Vector3().sub(anchorPos).applyQuaternion(invQ);
  const toLocal = (p, out) => out.copy(p).sub(anchorPos).applyQuaternion(invQ);
  const toSurf = (p, out) => out.copy(p).applyQuaternion(anchorQ).add(anchorPos);
  const upAt = (pLocal, out) => out.copy(pLocal).sub(centre).normalize();

  const _a = new THREE.Vector3();
  const _b = new THREE.Vector3();
  const _c = new THREE.Vector3();
  const _d = new THREE.Vector3();
  const _m = new THREE.Matrix4();
  const _q = new THREE.Quaternion();

  /* --- Line probe -------------------------------------------------------- */
  const ref = Math.abs(siteDir.y) < 0.94 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const e1 = new THREE.Vector3().crossVectors(siteDir, ref).normalize();
  const e2 = new THREE.Vector3().crossVectors(siteDir, e1).normalize();
  // A point `s` units of arc along the great circle leaving the site on `d`.
  const dirOn = (d, s, out) =>
    out.copy(siteDir).multiplyScalar(Math.cos(s / siteR)).addScaledVector(d, Math.sin(s / siteR));

  // Score one candidate line: `len` units of arc out from the pad on bearing
  // `d`. The far end may be ABOVE the basecamp (the lift climbs away from it)
  // or BELOW it (the basecamp is the top station and the lift drops to a
  // valley terminal) — towns on this world sit on high saddles, so at a town
  // pad the mountain is usually underneath you, not above.
  const _probe = new Float64Array(40);
  function scoreLine(d, len, useAvoid) {
    let n = 0;
    for (let s = STATION_OUT; s <= STATION_OUT + len + 0.01; s += 10) {
      dirOn(d, s, _a);
      if (useAvoid) {
        for (const av of avoid) {
          if (Math.acos(Math.min(1, _a.dot(av.dir))) * siteR < av.radius) return -Infinity;
        }
      }
      _probe[n++] = floorR(_a);
    }
    const g0 = _probe[0];
    const g1 = _probe[n - 1];
    const up = g1 >= g0;
    // The high terminal is where riders drop in: never out on lake ice. The
    // low one may be — riding out onto the frozen lake is this planet's thing.
    if (Math.max(g0, g1) <= iceR + 0.01) return -Infinity;
    let adverse = 0; // rise a DESCENDING rider would have to climb
    let ice = 0; // dead-flat lake under the line
    let maxGrade = 0;
    for (let i = 1; i < n; i++) {
      const dg = _probe[i] - _probe[i - 1];
      if (up ? dg < 0 : dg > 0) adverse += Math.abs(dg);
      if (_probe[i] <= iceR + 0.01) ice += 10;
      maxGrade = Math.max(maxGrade, Math.abs(dg) / 10);
    }
    // Climbing away from the lodge is the classic layout: favour it. A long
    // runout across the ice is a slow glide for riders and a dull stretch of
    // cable. Steepness costs throughout (so of two lines with the same drop
    // the one that takes the flank at a slant wins), and a wall past 45
    // degrees is a cliff, not a piste.
    _probe[39] = maxGrade;
    return Math.abs(g1 - g0) * (up ? 1.25 : 1)
      - 1.2 * adverse - 0.25 * Math.max(0, ice - 50)
      - 30 * maxGrade - 40 * Math.max(0, maxGrade - 1.0);
  }

  let lineD = null;
  let lineLen = 0;
  let lineBearing = 0;
  let lineMaxGrade = 0; // steepest 10 u of ground under the chosen line (rise/run)
  for (const useAvoid of [true, false]) {
    let best = -Infinity;
    for (let k = 0; k < 24; k++) {
      const b = (k / 24) * Math.PI * 2;
      _b.copy(e1).multiplyScalar(Math.cos(b)).addScaledVector(e2, Math.sin(b));
      for (const len of [140, 180, 220, 280, 340]) {
        const sc = scoreLine(_b, len, useAvoid);
        if (sc > best) {
          best = sc;
          lineD = _b.clone();
          lineLen = len;
          lineBearing = b;
          lineMaxGrade = _probe[39];
        }
      }
    }
    if (lineD) break; // the keep-outs left at least one line standing
  }
  // From here on the line is parametrised from its LOW terminal (0) to its
  // HIGH one (lineLen), whichever of the two is the one at the basecamp, so
  // "the up line", "the top station" and the riders' descent need no cases.
  const farIsHigh =
    floorR(dirOn(lineD, STATION_OUT + lineLen, _a)) >= floorR(dirOn(lineD, STATION_OUT, _b));
  const arcOf = (t) => (farIsHigh ? STATION_OUT + t : STATION_OUT + lineLen - t);
  const S0 = 0;
  const S1 = lineLen;
  // The great circle's plane normal: the lateral axis, constant along the
  // line. Signed so that lateral = up x (low -> high), a right-handed frame.
  const latSurf = new THREE.Vector3().crossVectors(siteDir, lineD).normalize()
    .multiplyScalar(farIsHigh ? 1 : -1);
  const latLocal = latSurf.clone().applyQuaternion(invQ);

  // Unit direction (surface-local) of the point `s` up the line from the low
  // terminal and `lat` units to its side. The riders' pistes are this with
  // lat != 0.
  function lineDir(s, lat, out) {
    return dirOn(lineD, arcOf(s), out).addScaledVector(latSurf, lat / siteR).normalize();
  }
  // ... and the ground there, as an anchor-local point.
  function groundLocal(s, lat, out) {
    lineDir(s, lat, out);
    return toLocal(out.multiplyScalar(floorR(out)), out);
  }

  /* --- Towers: spacing, then a clearance solve --------------------------- */
  const nTowers = Math.max(3, Math.round((lineLen - 28) / 34) + 1);
  const nodeS = [S0];
  for (let i = 0; i < nTowers; i++) nodeS.push(S0 + 14 + ((lineLen - 28) * i) / (nTowers - 1));
  nodeS.push(S1);
  const nodeG = nodeS.map((s) => floorR(lineDir(s, 0, _a)));
  const nodeH = nodeS.map((_, i) => (i === 0 || i === nodeS.length - 1 ? STATION_CABLE : TOWER_MIN));
  const last = nodeS.length - 1;
  {
    // Terrain under the line, sampled once; the solver only moves tower tops.
    const samples = [];
    for (let s = S0 + 3; s < S1 - 3; s += 3) {
      let seg = 0;
      while (seg < last - 1 && nodeS[seg + 1] < s) seg++;
      const need = floorR(lineDir(s, 0, _a)) + Math.min(CLEARANCE, STATION_CABLE + 0.35 * Math.min(s - S0, S1 - s));
      samples.push({ seg, t: (s - nodeS[seg]) / (nodeS[seg + 1] - nodeS[seg]), need });
    }
    // A cable is a straight run between sheaves, so a convex shoulder between
    // two towers pokes through it. Raise the towers either side until it
    // clears; a few passes settle it because raising a tower only ever helps
    // its neighbours.
    for (let pass = 0; pass < 40; pass++) {
      let bad = false;
      for (const sm of samples) {
        const i = sm.seg;
        const cab = (nodeG[i] + nodeH[i]) * (1 - sm.t) + (nodeG[i + 1] + nodeH[i + 1]) * sm.t;
        if (cab >= sm.need) continue;
        const def = sm.need - cab + 0.2;
        if (i > 0) nodeH[i] = Math.min(nodeH[i] + def, TOWER_MAX);
        if (i + 1 < last) nodeH[i + 1] = Math.min(nodeH[i + 1] + def, TOWER_MAX);
        bad = true;
      }
      if (!bad) break;
    }
  }

  /* --- The cable loop ---------------------------------------------------- */
  // Up the +lateral side, round the top bullwheel, down the -lateral side,
  // round the bottom one. Closed Catmull-Rom through the sheave points, then
  // flattened into an arc-length table the chairs read by linear interpolation.
  const nodeLocal = nodeS.map((s, i) =>
    toLocal(lineDir(s, 0, _a).multiplyScalar(nodeG[i] + nodeH[i]), new THREE.Vector3()));
  const fwdBottom = nodeLocal[1].clone().sub(nodeLocal[0]).normalize();
  const fwdTop = nodeLocal[last].clone().sub(nodeLocal[last - 1]).normalize();
  const loopPts = [];
  for (let i = 0; i <= last; i++) loopPts.push(nodeLocal[i].clone().addScaledVector(latLocal, HALF));
  for (let k = 1; k < 6; k++) {
    const a = (k / 6) * Math.PI;
    loopPts.push(nodeLocal[last].clone()
      .addScaledVector(latLocal, HALF * Math.cos(a)).addScaledVector(fwdTop, HALF * Math.sin(a)));
  }
  for (let i = last; i >= 0; i--) loopPts.push(nodeLocal[i].clone().addScaledVector(latLocal, -HALF));
  for (let k = 1; k < 6; k++) {
    const a = (k / 6) * Math.PI;
    loopPts.push(nodeLocal[0].clone()
      .addScaledVector(latLocal, -HALF * Math.cos(a)).addScaledVector(fwdBottom, -HALF * Math.sin(a)));
  }
  const curve = new THREE.CatmullRomCurve3(loopPts, true, 'centripetal');
  curve.arcLengthDivisions = 1500;
  const loopLen = curve.getLength();
  const M = Math.ceil(loopLen / 1.5);
  const table = new Float32Array(M * 3);
  {
    const sp = curve.getSpacedPoints(M); // M + 1 points; the last repeats the first
    for (let i = 0; i < M; i++) sp[i].toArray(table, i * 3);
  }
  const wrap = (u) => ((u % loopLen) + loopLen) % loopLen;
  // Cable point at arc length u, and (optionally) the unit tangent there.
  function cableAt(u, out, tan) {
    const f = (wrap(u) / loopLen) * M;
    const i = Math.floor(f) % M;
    const j = (i + 1) % M;
    const t = f - Math.floor(f);
    const ax = table[i * 3], ay = table[i * 3 + 1], az = table[i * 3 + 2];
    const bx = table[j * 3], by = table[j * 3 + 1], bz = table[j * 3 + 2];
    out.set(ax + (bx - ax) * t, ay + (by - ay) * t, az + (bz - az) * t);
    if (tan) tan.set(bx - ax, by - ay, bz - az).normalize();
    return out;
  }
  function uNearest(p) {
    let bi = 0;
    let bd = Infinity;
    for (let i = 0; i < M; i++) {
      const dx = table[i * 3] - p.x, dy = table[i * 3 + 1] - p.y, dz = table[i * 3 + 2] - p.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < bd) { bd = d2; bi = i; }
    }
    return (bi / M) * loopLen;
  }
  // Where a chair picks up and sets down, on each line. A couple of units
  // clear of the bullwheel so the chair is running straight when you sit.
  const U_LOAD_UP = wrap(uNearest(loopPts[0]) + 2.0);
  const U_UNLOAD_UP = wrap(uNearest(loopPts[last]) - 2.0);
  const U_LOAD_DOWN = wrap(uNearest(loopPts[last + 6]) + 2.0);
  const U_UNLOAD_DOWN = wrap(uNearest(loopPts[2 * last + 6]) - 2.0);
  // "Has this chair gone past u?" — true for the 30 u of cable after it.
  const passed = (u, mark) => wrap(u - mark) < 30;

  /* --- Geometry: cable, towers, terminals -------------------------------- */
  const cableGeo = new THREE.TubeGeometry(curve, Math.min(700, Math.ceil(loopLen / 2)), 0.05, 5, true);
  owned.push(cableGeo);
  const cable = new THREE.Mesh(cableGeo, mats.steel);
  cable.frustumCulled = false; // one long thin mesh; its sphere is the whole hill anyway
  root.add(cable);

  // A box/cylinder authored in a frame (X lateral, Y up, Z along the line) at
  // an anchor-local origin, baked into anchor-local vertices.
  const frame = (origin, up, fwd, out) => {
    _a.copy(fwd).addScaledVector(up, -fwd.dot(up)).normalize(); // Z, levelled
    _b.crossVectors(up, _a).normalize(); // X
    return out.makeBasis(_b, up, _a).setPosition(origin);
  };
  const baked = (geo, x, y, z, mat4) => {
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (g !== geo) geo.dispose();
    g.translate(x, y, z);
    g.applyMatrix4(mat4);
    return g;
  };
  const steelParts = [];
  const timberParts = [];
  const accentParts = [];
  const groundPt = new THREE.Vector3();
  const upV = new THREE.Vector3();
  const fwdV = new THREE.Vector3();
  const frameM = new THREE.Matrix4();
  for (let i = 1; i < last; i++) {
    groundLocal(nodeS[i], 0, groundPt);
    upAt(groundPt, upV);
    fwdV.copy(nodeLocal[i + 1]).sub(nodeLocal[i - 1]).normalize();
    frame(groundPt, upV, fwdV, frameM);
    const h = nodeH[i];
    // Footed 2.5 u into the slope so the downhill side never shows daylight.
    steelParts.push(baked(new THREE.CylinderGeometry(0.2, 0.36, h + 2.9, 8), 0, (h - 2.1) / 2, 0, frameM));
    steelParts.push(baked(new THREE.BoxGeometry(HALF * 2 + 1.1, 0.26, 0.32), 0, h + 0.55, 0, frameM));
    for (const sx of [-HALF, HALF]) {
      steelParts.push(baked(new THREE.BoxGeometry(0.2, 0.34, 2.0), sx, h + 0.24, 0, frameM)); // sheave train
      steelParts.push(baked(new THREE.BoxGeometry(0.1, 0.5, 0.1), sx, h + 0.5, 0, frameM)); // its hanger
    }
    accentParts.push(baked(new THREE.BoxGeometry(0.5, 0.9, 0.06), 0, 2.2, 0.36, frameM)); // tower number plate
  }

  // Terminals. `out` is the direction the line leaves the station on.
  const stations = [];
  const wheels = [];
  const wheelGeo = new THREE.CylinderGeometry(HALF, HALF, 0.2, 24);
  owned.push(wheelGeo);
  function buildStation(node, s, out) {
    groundLocal(s, 0, groundPt);
    upAt(groundPt, upV);
    frame(groundPt, upV, out, frameM);
    const y = STATION_CABLE;
    const w = HALF * 2 + 3.2;
    for (const sx of [-1, 1]) {
      steelParts.push(baked(new THREE.BoxGeometry(0.34, y + 4.2, 0.34), sx * (w / 2 - 0.2), (y - 0.6) / 2, -0.6, frameM));
    }
    steelParts.push(baked(new THREE.BoxGeometry(w, 0.3, 0.34), 0, y + 1.3, -0.6, frameM)); // portal beam
    steelParts.push(baked(new THREE.CylinderGeometry(0.14, 0.14, 1.3, 8), 0, y + 0.65, 0, frameM)); // wheel shaft
    steelParts.push(baked(new THREE.BoxGeometry(0.3, 0.3, 1.0), 0, y + 1.3, -0.25, frameM));
    timberParts.push(baked(new THREE.BoxGeometry(w + 0.8, 0.22, 5.2), 0, y + 1.62, -0.9, frameM)); // roof
    accentParts.push(baked(new THREE.BoxGeometry(w + 0.8, 0.42, 0.1), 0, y + 1.34, 1.72, frameM)); // fascia
    // Operator's hut on the outside of the up line, and two gate posts
    // marking where the chair picks you up.
    timberParts.push(baked(new THREE.BoxGeometry(1.9, 2.6, 1.9), -(w / 2 + 1.4), 0.9, -1.6, frameM));
    for (const sx of [HALF - 1.25, HALF + 1.25]) {
      accentParts.push(baked(new THREE.BoxGeometry(0.12, 1.5, 0.12), sx, 0.5, 1.6, frameM));
    }
    const wheel = new THREE.Mesh(wheelGeo, mats.steel);
    wheel.position.copy(node);
    wheel.quaternion.setFromRotationMatrix(frameM);
    wheel.castShadow = true;
    root.add(wheel);
    wheels.push(wheel);
    return { ground: groundPt.clone(), up: upV.clone() };
  }
  stations.push(buildStation(nodeLocal[0], S0, fwdBottom));
  stations.push(buildStation(nodeLocal[last], S1, _c.copy(fwdTop).negate()));

  const addMerged = (parts, mat) => {
    if (!parts.length) return;
    const geo = mergeGeometries(parts, false);
    parts.forEach((g) => g.dispose());
    owned.push(geo);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false; // spans the whole line
    root.add(mesh);
  };
  addMerged(steelParts, mats.steel);
  addMerged(timberParts, mats.timber);
  addMerged(accentParts, mats.accent);

  /* --- The piste ---------------------------------------------------------- */
  // A groomed run laid over the hill either side of the line. The terrain
  // shader colours by altitude and latitude, so a low flank reads as scree or
  // spruce however steep it is; the white ribbon is what says "ski slope" from
  // across the valley, and it is the ground the riders are seen against.
  //
  // It is cut FROM the terrain mesh rather than draped over it: every terrain
  // triangle near the line is split 4x4 and the pieces whose centre falls
  // inside the run are re-emitted a hand's width up. Each piece lies in its
  // parent facet's plane, so the run can neither float off the hill nor let a
  // ridge poke through, which a free grid does wherever a quad spans a crease.
  if (facets) {
    const SUB = 4;
    const verts = [];
    // (s, lat) of a surface-local direction, in the line's own coordinates.
    const inRun = (d) => {
      const arc = Math.atan2(d.dot(lineD), d.dot(siteDir)) * siteR;
      const sAt = farIsHigh ? arc - STATION_OUT : STATION_OUT + lineLen - arc;
      if (sAt < -12 || sAt > lineLen + 12) return false;
      const lat = Math.asin(Math.max(-1, Math.min(1, d.dot(latSurf)))) * siteR;
      // Ragged, breathing edges: wide in the middle of the run, pinched in
      // to the terminals at either end.
      const pinch = Math.max(0, Math.min(1, (sAt + 14) / 40, (lineLen + 14 - sAt) / 40));
      const half = 16 + 30 * pinch + 6 * Math.sin(sAt * 0.071) + 4 * Math.sin(sAt * 0.19 + 1.3);
      return Math.abs(lat - 5 * Math.sin(sAt * 0.043 + 0.7)) < half;
    };
    // Which lat-long cells to visit: the bounding index box of the run.
    let ix0 = Infinity, ix1 = -Infinity, iy0 = Infinity, iy1 = -Infinity;
    for (let sAt = -20; sAt <= lineLen + 20; sAt += 10) {
      for (const lat of [-62, 0, 62]) {
        lineDir(sAt, lat, _a);
        let phi = Math.atan2(_a.z, -_a.x);
        if (phi < 0) phi += Math.PI * 2;
        const ix = Math.floor((phi / (Math.PI * 2)) * wSeg);
        const iy = Math.floor((Math.acos(_a.y) / Math.PI) * hSeg);
        ix0 = Math.min(ix0, ix); ix1 = Math.max(ix1, ix);
        iy0 = Math.min(iy0, iy); iy1 = Math.max(iy1, iy);
      }
    }
    // A run straddling the sphere's seam (phi wrapping) would make this box
    // span the whole planet; skip the piste there rather than walk 74k cells.
    const tri = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    const sub = (i, j, out) => // barycentric lattice point (i, j) of the current triangle
      out.copy(tri[0]).addScaledVector(_c.subVectors(tri[1], tri[0]), i / SUB)
        .addScaledVector(_d.subVectors(tri[2], tri[0]), j / SUB);
    const p0 = new THREE.Vector3();
    const p1 = new THREE.Vector3();
    const p2 = new THREE.Vector3();
    const emit = (q0, q1, q2) => {
      _a.copy(q0).add(q1).add(q2).normalize();
      if (!inRun(_a)) return;
      for (const q of [q0, q1, q2]) {
        // Clamp to the lake ice, lift clear of the facet, go anchor-local.
        const r = Math.max(q.length(), iceR) + PISTE_LIFT;
        toLocal(_a.copy(q).setLength(r), _b);
        verts.push(_b.x, _b.y, _b.z);
      }
    };
    if (ix1 - ix0 < 60 && iy1 - iy0 < 60) {
      for (let iy = Math.max(0, iy0 - 1); iy <= Math.min(hSeg - 1, iy1 + 1); iy++) {
        for (let ix = Math.max(0, ix0 - 1); ix <= Math.min(wSeg - 1, ix1 + 1); ix++) {
          const vb = iy * (wSeg + 1) + ix;
          const va = vb + 1;
          const vc = vb + wSeg + 1;
          const vd = vc + 1;
          for (const [i0, i1, i2] of [[va, vb, vd], [vb, vc, vd]]) {
            tri[0].fromBufferAttribute(sPos, i0);
            tri[1].fromBufferAttribute(sPos, i1);
            tri[2].fromBufferAttribute(sPos, i2);
            for (let i = 0; i < SUB; i++) {
              for (let j = 0; j < SUB - i; j++) {
                emit(sub(i, j, p0), sub(i + 1, j, p1), sub(i, j + 1, p2));
                if (i + j < SUB - 1) emit(sub(i + 1, j, p0), sub(i + 1, j + 1, p1), sub(i, j + 1, p2));
              }
            }
          }
        }
      }
    }
    if (verts.length) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts), 3));
      geo.computeVertexNormals();
      owned.push(geo);
      const piste = new THREE.Mesh(geo, mats.snow);
      piste.receiveShadow = true;
      piste.name = 'piste';
      root.add(piste);
    }
  }

  /* --- Chairs ------------------------------------------------------------ */
  // Chair-local: origin at the cable grip, +Y up, +Z the direction of travel.
  const chairCount = Math.max(6, Math.round(loopLen / CHAIR_SPACING));
  const chairGap = loopLen / chairCount;
  const I = new THREE.Matrix4();
  const frameParts = [
    baked(new THREE.BoxGeometry(0.09, 2.3, 0.09), 0, -1.15, -0.3, I), // hanger arm
    baked(new THREE.BoxGeometry(0.3, 0.16, 0.5), 0, -0.02, 0, I), // grip
    baked(new THREE.BoxGeometry(2.0, 0.08, 0.08), 0, -2.3, -0.3, I), // top rail
    baked(new THREE.BoxGeometry(0.07, 0.75, 0.07), -1.0, -2.65, -0.3, I),
    baked(new THREE.BoxGeometry(0.07, 0.75, 0.07), 1.0, -2.65, -0.3, I),
    baked(new THREE.BoxGeometry(0.07, 0.07, 0.6), -1.0, -3.02, -0.02, I),
    baked(new THREE.BoxGeometry(0.07, 0.07, 0.6), 1.0, -3.02, -0.02, I),
    baked(new THREE.BoxGeometry(2.0, 0.06, 0.06), 0, -2.42, 0.3, I), // safety bar
  ];
  const chairFrameGeo = mergeGeometries(frameParts, false);
  frameParts.forEach((g) => g.dispose());
  const padParts = [
    baked(new THREE.BoxGeometry(1.94, 0.1, 0.56), 0, -SEAT_DROP - 0.05, 0, I), // seat
    baked(new THREE.BoxGeometry(1.94, 0.6, 0.08), 0, -2.62, -0.27, I), // backrest
  ];
  const chairPadGeo = mergeGeometries(padParts, false);
  padParts.forEach((g) => g.dispose());
  owned.push(chairFrameGeo, chairPadGeo);
  const chairFrames = new THREE.InstancedMesh(chairFrameGeo, mats.steel, chairCount);
  const chairPads = new THREE.InstancedMesh(chairPadGeo, mats.accent, chairCount);
  for (const im of [chairFrames, chairPads]) {
    im.castShadow = true;
    // The instances travel the whole line; a bounding sphere computed once
    // would cull chairs that have since moved into view.
    im.frustumCulled = false;
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    root.add(im);
  }
  const occupancy = new Uint8Array(chairCount); // ambient riders aboard each chair

  let phase = 0; // arc length of chair 0
  const chairU = (k) => wrap(phase + k * chairGap);
  const _cp = new THREE.Vector3();
  const _ct = new THREE.Vector3();
  const _cu = new THREE.Vector3();
  const _cr = new THREE.Vector3();
  // Chairs hang plumb under the grip whatever the cable's pitch, so the basis
  // is (right, radial up, levelled travel direction).
  function chairBasis(k) {
    cableAt(chairU(k), _cp, _ct);
    upAt(_cp, _cu);
    _ct.addScaledVector(_cu, -_ct.dot(_cu)).normalize();
    _cr.crossVectors(_cu, _ct).normalize();
  }
  function writeChairs() {
    for (let k = 0; k < chairCount; k++) {
      chairBasis(k);
      _m.makeBasis(_cr, _cu, _ct).setPosition(_cp);
      chairFrames.setMatrixAt(k, _m);
      chairPads.setMatrixAt(k, _m);
    }
    chairFrames.instanceMatrix.needsUpdate = true;
    chairPads.instanceMatrix.needsUpdate = true;
  }
  writeChairs();

  /* --- The player's ride ------------------------------------------------- */
  // 'none' | 'wait' (stood at the gate until an empty chair comes round) | 'ride'
  let state = 'none';
  let rideUp = true;
  let rideChair = -1;
  const loadSpot = [new THREE.Vector3(), new THREE.Vector3()]; // surface-local, [up line, down line]
  const dropSpot = [new THREE.Vector3(), new THREE.Vector3()]; // where each ride sets you down
  // Wait where the chair scoops you up; step off to the OUTSIDE of the line at
  // the far end, well clear of the next chair and out of E range of nothing.
  lineDir(S0 + 2.0, HALF, _a); loadSpot[0].copy(_a).multiplyScalar(floorR(_a));
  lineDir(S1 - 2.0, -HALF, _a); loadSpot[1].copy(_a).multiplyScalar(floorR(_a));
  lineDir(S1 - 1.0, HALF + 3.0, _a); dropSpot[0].copy(_a).multiplyScalar(floorR(_a));
  lineDir(S0 + 1.0, -(HALF + 3.0), _a); dropSpot[1].copy(_a).multiplyScalar(floorR(_a));

  const bottomEntity = {
    id: 'lift-bottom', name: 'Highline chairlift', prompt: 'E — RIDE THE LIFT UP',
    pos: toSurf(stations[0].ground, new THREE.Vector3()),
  };
  const topEntity = {
    id: 'lift-top', name: 'Highline top station', prompt: 'E — RIDE THE LIFT DOWN',
    pos: toSurf(stations[1].ground, new THREE.Vector3()),
  };
  // While waiting or riding the "nearest interactable" is the ride itself, so
  // E always means the lift and no NPC can steal the prompt from mid-air.
  const rideEntity = { id: 'lift-ride', name: 'Chair', prompt: 'E — HOP OFF', pos: new THREE.Vector3() };

  function nearestInteractable(playerPos, maxDist = REACH) {
    if (state !== 'none') {
      rideEntity.pos.copy(playerPos);
      rideEntity.prompt = state === 'wait' ? 'CHAIR COMING — E TO STEP BACK' : 'E — HOP OFF';
      return rideEntity;
    }
    const r2 = Math.min(maxDist, REACH) ** 2;
    const db = bottomEntity.pos.distanceToSquared(playerPos);
    const dt = topEntity.pos.distanceToSquared(playerPos);
    if (db < r2 && db <= dt) return bottomEntity;
    if (dt < r2) return topEntity;
    return null;
  }

  // E. Returns null always: the lift has nothing to say, it just goes.
  function interact(entity) {
    if (entity === rideEntity) {
      // Stepping back from the gate, or bailing out mid-line: either way the
      // walker is simply released where they are and ordinary physics (a
      // half-gravity drop, on this world) takes over.
      state = 'none';
      rideChair = -1;
    } else if (state === 'none') {
      state = 'wait';
      rideUp = entity === bottomEntity;
    }
    return null;
  }

  // Physics tick. Advances the cable; when the lift holds the walker, writes
  // their surface-local position (and the chair's travel direction) into
  // `out` and returns 2 (waiting/riding) or 3 (just set down, on the ground).
  function step(dt, out) {
    phase = wrap(phase + LIFT_SPEED * dt);
    if (state === 'none') return 0;
    const li = rideUp ? 0 : 1;
    if (state === 'wait') {
      const mark = rideUp ? U_LOAD_UP : U_LOAD_DOWN;
      for (let k = 0; k < chairCount; k++) {
        // The one tick in which an EMPTY chair crosses the gate.
        if (occupancy[k] === 0 && wrap(chairU(k) - mark) < LIFT_SPEED * dt + 1e-3) {
          rideChair = k;
          state = 'ride';
          break;
        }
      }
      if (state === 'wait') {
        out.pos.copy(loadSpot[li]);
        cableAt(mark, _cp, _ct);
        out.facing.copy(_ct).applyQuaternion(anchorQ);
        return 2;
      }
    }
    chairBasis(rideChair);
    if (passed(chairU(rideChair), rideUp ? U_UNLOAD_UP : U_UNLOAD_DOWN)) {
      state = 'none';
      rideChair = -1;
      out.pos.copy(dropSpot[li]);
      out.facing.copy(_ct).applyQuaternion(anchorQ);
      return 3;
    }
    _cp.addScaledVector(_cu, -SIT_DROP).addScaledVector(_ct, 0.06);
    toSurf(_cp, out.pos);
    out.facing.copy(_ct).applyQuaternion(anchorQ);
    return 2;
  }

  /* --- Hooks for the ambient riders -------------------------------------- */
  // A chair just leaving the bottom gate with a free seat, or -1. The player
  // has priority: nobody boards while they are stood waiting.
  function tryBoard() {
    if (state === 'wait') return -1;
    for (let k = 0; k < chairCount; k++) {
      if (k === rideChair || occupancy[k] >= 2) continue;
      if (wrap(chairU(k) - U_LOAD_UP) < 1.6) {
        occupancy[k]++;
        return k;
      }
    }
    return -1;
  }
  function leaveChair(k) {
    if (occupancy[k] > 0) occupancy[k]--;
  }
  // Seat position (anchor-local) and basis of chair k; true once it has
  // reached the top unload mark.
  function seatOf(k, pos, right, up, fwd) {
    chairBasis(k);
    pos.copy(_cp);
    right.copy(_cr);
    up.copy(_cu);
    fwd.copy(_ct);
    return passed(chairU(k), U_UNLOAD_UP);
  }

  /* --- Per-frame --------------------------------------------------------- */
  function update(t, dt) {
    writeChairs();
    // Bullwheels turn at the cable's surface speed.
    const spin = (LIFT_SPEED / HALF) * dt;
    wheels[0].rotateY(spin);
    wheels[1].rotateY(spin);
  }

  function dispose() {
    for (const o of owned) o.dispose();
    owned.length = 0;
    chairFrames.dispose();
    chairPads.dispose();
    root.clear();
    root.parent?.remove(root);
  }

  const baseLocal = stations[farIsHigh ? 0 : 1].ground; // the terminal at the pad
  return {
    root, step, update, nearestInteractable, interact, dispose,
    tryBoard, leaveChair, seatOf,
    // The line, for the riders' pistes.
    line: { S0, S1, HALF, lineDir, floorR, pisteR, toLocal, toSurf, upAt, latLocal, speed: LIFT_SPEED, seatDrop: SEAT_DROP },
    // Bearing of the basecamp's terminal in the pad's own XZ plane — the
    // basecamp stands its operator and lift queue on that side.
    padBearing: Math.atan2(baseLocal.x, baseLocal.z),
    baseIsTop: !farIsHigh,
    get state() { return state; },
    get riding() { return state === 'ride'; },
    bottomEntity,
    topEntity,
    // Headless verification.
    info() {
      return {
        state, rideUp, rideChair, baseIsTop: !farIsHigh,
        bearing: lineBearing, length: lineLen, loopLen, chairs: chairCount, towers: nTowers,
        towerHeights: nodeH.slice(1, last).map((h) => +h.toFixed(1)),
        bottomR: nodeG[0], topR: nodeG[last], rise: nodeG[last] - nodeG[0], maxGrade: lineMaxGrade,
        bottom: bottomEntity.pos.toArray(), top: topEntity.pos.toArray(),
        loadUp: loadSpot[0].toArray(), loadDown: loadSpot[1].toArray(),
        dropUp: dropSpot[0].toArray(), dropDown: dropSpot[1].toArray(),
        speed: LIFT_SPEED,
      };
    },
  };
}
