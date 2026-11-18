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

const PATH = [
  [0, 42, -52], [95, 48, -40], [170, 95, -95], [200, 190, -20], [120, 330, 110], [-40, 520, 150],
  [-200, 700, 40], [-430, 620, -250], [-520, 440, -520], [-380, 390, -640], [-220, 400, -420],
  [-70, 250, -160], [-60, 62, -150], [0, 44, -186], [80, 40, -150], [62, 42, -92],
];
const FRAMES = 600;
export const GATE_R = 11; // a gate's radius
export const LANE = 24; // how far off the middle a racer can get

export function createCourse(group) {
  const curve = new THREE.CatmullRomCurve3(PATH.map((p) => new THREE.Vector3(p[0], p[1], p[2])), true, 'centripetal');
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
  for (let i = 0; i < n; i++) {
    const s = (i + 0.5) / n;
    gates.push({ s, across: Math.sin(i * 2.4) * 12, up: Math.cos(i * 1.7) * 9 });
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
  return {
    length,
    gates,
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
