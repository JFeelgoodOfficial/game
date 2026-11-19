// The course the worlds are raced round (GDD 5.7.4, world racing).
//
// One closed line through the air of the City of Light: off a grid over the
// terrace, east over the Pavilion, up and round into the open sky, west above
// the hangar, down again, and back low over the three districts. It keeps to
// where nothing stands: the circle about the terrace that the city's towers
// leave clear, the sky above them, and the air over the hangar's roof.
//
// The line has a frame at every point (ahead, across, up), so a place on the
// course is "this far round, this far across, this far up", which is how the
// racers are held to it and how the gates are set a little off its middle so
// that there is something to steer for.
//
//   const course = createCourse(group);
//   course.at(s, across, up, outPos)     a place on it (s: 0..1 round the lap)
//   course.ahead(s, outDir)              the way it runs there
//   course.gates[i] { s, across, up }    in order round the lap
//   course.show(next)                    light the gates from `next` on
//
// One instanced draw for the gates, one for the line of light between them.

import * as THREE from 'three';

// Without a monument to fly through (no drawing was ever made): up into the sky and round.
const PATH = [
  [0, 42, -52], [95, 48, -40], [170, 95, -95], [200, 190, -20], [120, 330, 110], [-40, 520, 150],
  [-200, 700, 40], [-430, 620, -250], [-520, 440, -520], [-380, 390, -640], [-220, 400, -420],
  [-70, 250, -160], [-60, 62, -150], [0, 44, -186], [80, 40, -150], [62, 42, -92],
];
// With one: out over the Pavilion, down among the towers to the thing the pilot
// drew, through it, up and back over the city's heart, and home over the hangar
// and the three districts. `g`: the gap; `d`: the way through it (unit, level).
const pathVia = (g, d) => [
  [0, 42, -52], [95, 48, -40], [170, 80, -80], [240, 170, -230],
  [g.x - d.x * 230, g.y - 10, g.z - d.z * 230], [g.x - d.x * 70, g.y, g.z - d.z * 70],
  [g.x, g.y, g.z],
  [g.x + d.x * 80, g.y, g.z + d.z * 80], [g.x + d.x * 240, g.y + 60, g.z + d.z * 240],
  [g.x + d.x * 330 - d.z * 160, g.y + 240, g.z + d.z * 330 + d.x * 160],
  [60, 700, -640], [-220, 640, -560], [-430, 480, -420], [-300, 400, -250],
  [-70, 250, -160], [-60, 62, -150], [0, 44, -186], [80, 40, -150], [62, 42, -92],
];
const FRAMES = 600;
export const GATE_R = 14; // a gate's radius (11 was a needle's eye at race speed on a phone stick)
export const LANE = 24; // how far off the middle a racer can get

// `via`: { point, dir } from the monument (world/lightepilogue.js `way`), or nothing.
export function createCourse(group, via) {
  const path = via ? pathVia(via.point, via.dir) : PATH;
  const curve = new THREE.CatmullRomCurve3(path.map((p) => new THREE.Vector3(p[0], p[1], p[2])), true, 'centripetal');
  curve.arcLengthDivisions = 800;
  const length = curve.getLength();
  // a frame at every step round it: ahead, and then across and up from the
  // world's own up, so the course never rolls and "up" on the stick is up
  const P = [], T = [], X = [], U = [];
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < FRAMES; i++) {
    const u = i / FRAMES;
    const p = curve.getPointAt(u), t = curve.getTangentAt(u).normalize();
    const x = new THREE.Vector3().crossVectors(t, up).normalize();
    P.push(p);
    T.push(t);
    X.push(x);
    U.push(new THREE.Vector3().crossVectors(x, t).normalize());
  }
  const _a = new THREE.Vector3(), _b = new THREE.Vector3();
  const lerp = (arr, s, out) => {
    const f = (((s % 1) + 1) % 1) * FRAMES, i = Math.floor(f) % FRAMES, k = f - Math.floor(f);
    return out.copy(arr[i]).lerp(arr[(i + 1) % FRAMES], k);
  };
  function at(s, across, upBy, out) {
    lerp(P, s, out);
    out.addScaledVector(lerp(X, s, _a).normalize(), across);
    return out.addScaledVector(lerp(U, s, _b).normalize(), upBy);
  }

  // gates: one every hundred-odd units, each set off the middle its own way
  const n = Math.round(length / 115);
  const gates = [];
  // where on the lap the monument is: gates near it are set dead centre, because the gap is where it is
  let sVia = -1;
  if (via) {
    let bestD = Infinity;
    for (let i = 0; i < FRAMES; i++) {
      const d = P[i].distanceToSquared(via.point);
      if (d < bestD) {
        bestD = d;
        sVia = i / FRAMES;
      }
    }
  }
  for (let i = 0; i < n; i++) {
    const s = (i + 0.5) / n;
    let off = 1;
    if (sVia >= 0) {
      let d = Math.abs(s - sVia);
      d = Math.min(d, 1 - d) * length;
      off = Math.min(Math.max((d - 90) / 160, 0), 1);
    }
    gates.push({ s, across: Math.sin(i * 2.4) * 20 * off, up: Math.cos(i * 1.7) * 12 * off });
  }
  const ring = new THREE.InstancedMesh(new THREE.TorusGeometry(GATE_R, 0.55, 8, 40), new THREE.MeshBasicMaterial({ fog: false, toneMapped: false }), n);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), pos = new THREE.Vector3(), z = new THREE.Vector3(0, 0, 1), dir = new THREE.Vector3();
  gates.forEach((g, i) => {
    at(g.s, g.across, g.up, pos);
    q.setFromUnitVectors(z, lerp(T, g.s, dir).normalize());
    ring.setMatrixAt(i, m4.compose(pos, q, one));
  });
  ring.frustumCulled = false;
  ring.visible = false;
  group.add(ring);
  // the middle of the course, as a line of small lights
  const dots = new Float32Array(FRAMES * 3);
  for (let i = 0; i < FRAMES; i++) P[i].toArray(dots, i * 3);
  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute('position', new THREE.BufferAttribute(dots, 3));
  const line = new THREE.Points(lineGeo, new THREE.PointsMaterial({ color: 0x9fe8ff, size: 2.2, sizeAttenuation: true, transparent: true, opacity: 0.7, depthWrite: false, fog: false }));
  line.frustumCulled = false;
  line.visible = false;
  group.add(line);

  const colNext = new THREE.Color(2.2, 1.9, 0.9), colSoon = new THREE.Color(0.5, 1.3, 1.6), colDone = new THREE.Color(0.12, 0.2, 0.26);
  let shown = -2;
  // The towers make way, but only just: any that stands in the middle of the
  // course (where the gates are) is cut down to pass under it. One that
  // stands at the course's edge is left, and is there to be flown round.
  // `meshes`: the city's instanced towers, spires first then slabs (feet at
  // their own y). Those near enough to matter are remembered for hitTower().
  const near = []; // x, z, radius at the foot, foot y, top y, taper (how much narrower at the top, 0..1)
  function makeWay(meshes) {
    const m = new THREE.Matrix4(), p = new THREE.Vector3(), qq = new THREE.Quaternion(), sc = new THREE.Vector3();
    let cut = 0;
    near.length = 0;
    meshes.forEach((mesh, mi) => {
      const spire = mi === 0; // a spire is a cone of radius 1 at the foot and 0.34 at the top; a slab is a unit box
      for (let i = 0; i < mesh.count; i++) {
        mesh.getMatrixAt(i, m);
        m.decompose(p, qq, sc);
        const rad = spire ? Math.max(sc.x, sc.z) : Math.max(sc.x, sc.z) * 0.55;
        // (clear of the gates, which stand up to 20 off the middle: a world can still
        // meet a tower only by going past the outermost of them, toward it)
        const clear = 27 + rad, far = LANE + rad + 10;
        let top = p.y + sc.y, close = false;
        for (let k = 0; k < FRAMES; k += 2) {
          const c = P[k], dx = c.x - p.x, dz = c.z - p.z, d2 = dx * dx + dz * dz;
          if (d2 > far * far) continue;
          close = true;
          if (d2 < clear * clear) top = Math.min(top, c.y - 22);
        }
        if (top < p.y + sc.y - 0.5) {
          sc.y = Math.max(top - p.y, 12);
          mesh.setMatrixAt(i, m.compose(p, qq, sc));
          cut++;
        }
        if (close) near.push(p.x, p.z, rad, p.y, p.y + sc.y, spire ? 0.66 : 0);
      }
      mesh.instanceMatrix.needsUpdate = true;
    });
    return cut;
  }
  // Is a world of radius `rad` at `p` in a tower?
  function hitTower(p, rad) {
    for (let i = 0; i < near.length; i += 6) {
      if (p.y - rad > near[i + 4]) continue;
      const dx = p.x - near[i], dz = p.z - near[i + 1];
      const up01 = Math.min(Math.max((p.y - near[i + 3]) / Math.max(near[i + 4] - near[i + 3], 1), 0), 1);
      const r = near[i + 2] * (1 - near[i + 5] * up01) + rad * 0.8;
      if (dx * dx + dz * dz < r * r) return true;
    }
    return false;
  }

  return {
    length,
    gates,
    sVia,
    makeWay,
    hitTower,
    towersNear: () => near.length / 6,
    at,
    ahead: (s, out) => lerp(T, s, out).normalize(),
    across: (s, out) => lerp(X, s, out).normalize(),
    up: (s, out) => lerp(U, s, out).normalize(),
    // light the gates: `next` is the one to make for (in this lap), earlier ones are spent
    show(next) {
      const on = next >= 0;
      ring.visible = line.visible = on;
      if (!on || next === shown) {
        shown = on ? shown : -2;
        return;
      }
      shown = next;
      for (let i = 0; i < n; i++) ring.setColorAt(i, i === next ? colNext : i > next ? colSoon : colDone);
      ring.instanceColor.needsUpdate = true;
    },
  };
}
