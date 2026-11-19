// The City of Light a million years on (GDD 5.7.5): what has grown over it.
//
// The towers, the floor and the light ship change in their own shaders and
// builders (uEra; world/lightcity.js, world/lightvessel.js). This is the rest:
// vines hanging from the rails and the bridges, and clumps of growth where the
// floors meet their edges. Two instanced meshes, placed once from a seed, and
// nothing to do per frame.

import * as THREE from 'three';

// where there is an edge to hang from: [x0, z0, x1, z1] runs, in the city's frame
const RUNS = [
  [-10, 13, -10, -12], [10, 13, 10, -12], // the balcony's rails
  [-3, -22, -3, -57], [3, -22, 3, -57], // the bridge
  [-18, -74, -96, -74], [-18, -80, -96, -80], // ...and the one to the gallery
];
// ...and the round floors: [cx, cz, r]
const ROUNDS = [[0, -12, 10], [0, -77, 20], [-112, -77, 16]];

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

// k: { group }
export function createEraCity(k) {
  const root = new THREE.Group();
  root.visible = false;
  k.group.add(root);
  const r = rng(0xe2ac17);
  const spots = [];
  for (const [x0, z0, x1, z1] of RUNS) {
    const n = Math.round(Math.hypot(x1 - x0, z1 - z0) / 1.1);
    for (let i = 0; i < n; i++) {
      if (r() < 0.35) continue; // (in swags, not a fringe)
      const f = (i + r()) / n;
      spots.push([x0 + (x1 - x0) * f, z0 + (z1 - z0) * f]);
    }
  }
  for (const [cx, cz, rad] of ROUNDS) {
    const n = Math.round(rad * 4.2);
    for (let i = 0; i < n; i++) {
      if (r() < 0.4) continue;
      const a = ((i + r()) / n) * Math.PI * 2;
      spots.push([cx + Math.cos(a) * rad, cz + Math.sin(a) * rad]);
    }
  }
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), e = new THREE.Euler();
  // vines: hanging from the top of the rail, down past the floor's edge
  const vines = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.05, 0.015, 1, 5).translate(0, -0.5, 0),
    new THREE.MeshLambertMaterial({ color: 0x2f6b33 }),
    spots.length,
  );
  // clumps: on the floor, against the edge
  const clumps = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshLambertMaterial({ color: 0x3c7a36, flatShading: true }), spots.length);
  spots.forEach(([x, z], i) => {
    const len = 1.2 + 5.5 * r() * r();
    vines.setMatrixAt(i, m.compose(p.set(x, 1.1, z), q.setFromEuler(e.set((r() - 0.5) * 0.25, r() * 6.28, (r() - 0.5) * 0.25)), s.set(1 + r(), len, 1 + r())));
    const big = r() < 0.3 ? 0.5 + 0.9 * r() : 0;
    clumps.setMatrixAt(i, m.compose(p.set(x * 0.985, 0.1, z + (r() - 0.5) * 0.6), q.setFromEuler(e.set(r(), r() * 6.28, r())), s.set(big, big * (0.45 + 0.4 * r()), big)));
  });
  vines.frustumCulled = clumps.frustumCulled = false;
  root.add(vines, clumps);
  return {
    show(on) {
      root.visible = on;
    },
    state: () => ({ vines: spots.length, shown: root.visible }),
  };
}
