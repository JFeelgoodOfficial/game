// cottage-butterflies.js — butterflies working the flower drifts.
//
// An InstancedMesh cannot articulate its instances, so a flapping butterfly
// needs its two wings as TWO InstancedMeshes — left and right — whose matrices
// are rebuilt each frame from the body's position, heading and a wing dihedral.
// That is two draw calls and ~70 matrix writes a frame for the whole flight,
// against one mesh per insect any other way.
//
// They wander between waypoints drawn through the same reject predicate the
// flowers are, so they stay over the planting instead of hovering above bare
// path. Nothing here casts a shadow: a 4 cm wing is well under one texel of the
// sun's shadow map, which is the same argument world/cottage.js makes for its
// grass tufts.
import * as THREE from 'three';

const TAU = Math.PI * 2;

/** Fore and hind lobe of one wing, hinged on x = 0, tip out along +X. */
function wingGeometry(sign) {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.bezierCurveTo(0.004 * sign, 0.018, 0.020 * sign, 0.026, 0.026 * sign, 0.012);
  s.bezierCurveTo(0.030 * sign, 0.002, 0.026 * sign, -0.004, 0.018 * sign, -0.004);
  s.bezierCurveTo(0.026 * sign, -0.010, 0.024 * sign, -0.022, 0.014 * sign, -0.022);
  s.bezierCurveTo(0.007 * sign, -0.022, 0.002 * sign, -0.012, 0, 0);
  const g = new THREE.ShapeGeometry(s, 6);
  g.rotateX(-Math.PI / 2);   // lie flat: span in X, length in Z
  return g;
}

export function createButterflies({
  count = 34, reject = null, y = [0.35, 2.1], radius = 30, inner = 3,
  rand = (a = 0, b = 1) => a + Math.random() * (b - a),
  extra = [], track = null,
} = {}) {
  const keep = (x) => { track?.(x); return x; };
  const group = new THREE.Group();

  // Colour comes from instanceColor alone — three applies that independently of
  // vertexColors, and the wing geometry has no colour attribute to read.
  const mat = keep(new THREE.MeshStandardMaterial({
    side: THREE.DoubleSide, roughness: 0.72, metalness: 0,
  }));
  const wings = [-1, 1].map((s) => {
    const m = new THREE.InstancedMesh(keep(wingGeometry(s)), mat, count + extra.length);
    m.castShadow = false;
    m.receiveShadow = false;
    m.frustumCulled = false;   // they roam; one bounding sphere would be the world
    group.add(m);
    return m;
  });

  // cabbage white, brimstone, tortoiseshell, a couple of blues
  const PALETTE = [0xf4f1e6, 0xf4f1e6, 0xf6e9a8, 0xd88a3c, 0xd88a3c, 0x7f93cf];

  const pickSpot = (cx, cz, r0, r1) => {
    for (let i = 0; i < 24; i++) {
      const a = rand(0, TAU), r = r0 + Math.pow(rand(0, 1), 0.6) * (r1 - r0);
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      if (!reject || !reject(x, z)) return new THREE.Vector2(x, z);
    }
    return new THREE.Vector2(cx, cz);
  };

  const flock = [];
  const col = new THREE.Color();
  for (let i = 0; i < count + extra.length; i++) {
    const tether = extra[i - count] || null;   // loiterers keep to one spot
    const home = tether
      ? new THREE.Vector2(tether.x, tether.z)
      : pickSpot(0, 0, inner, radius);
    const p = tether ? home.clone() : home.clone();
    flock.push({
      pos: new THREE.Vector3(p.x, rand(y[0], y[1]), p.y),
      target: pickSpot(home.x, home.y, 0, tether ? (tether.r ?? 1.2) : 6),
      home, roam: tether ? (tether.r ?? 1.2) : 6,
      ty: rand(y[0], y[1]),
      yaw: rand(0, TAU),
      speed: rand(0.5, 1.1),
      flap: rand(9, 14),
      phase: rand(0, TAU),
      rest: 0,
    });
    col.setHex(PALETTE[(rand(0, 1) * PALETTE.length) | 0]);
    wings[0].setColorAt(i, col);
    wings[1].setColorAt(i, col);
  }
  wings.forEach((w) => { if (w.instanceColor) w.instanceColor.needsUpdate = true; });

  const d = new THREE.Object3D();
  const _v = new THREE.Vector2();

  function update(dt, elapsed) {
    for (let i = 0; i < flock.length; i++) {
      const b = flock[i];
      _v.set(b.target.x - b.pos.x, b.target.y - b.pos.z);
      const dist = _v.length();
      if (dist < 0.25) {
        // pause on a flower, then pick somewhere else to be
        b.rest -= dt;
        if (b.rest <= 0) {
          b.target = pickSpot(b.home.x, b.home.y, 0, b.roam);
          b.ty = b.pos.y < 0.6 ? rand(0.6, 2.0) : rand(0.3, 1.2);
          b.rest = rand(0.4, 1.8);
        }
      } else {
        _v.multiplyScalar(b.speed * dt / dist);
        b.pos.x += _v.x;
        b.pos.z += _v.y;
        b.yaw = Math.atan2(_v.x, _v.y);
      }
      // bob toward the target height, with a flutter on top
      b.pos.y += (b.ty - b.pos.y) * Math.min(1, dt * 1.4)
        + Math.sin(elapsed * 3.1 + b.phase) * dt * 0.35;

      // wings beat harder while climbing, and glide open when settled
      const climbing = b.ty > b.pos.y + 0.05;
      const beat = Math.sin(elapsed * b.flap * (climbing ? 1.25 : 1) + b.phase);
      const open = dist < 0.25 ? 0.15 + beat * 0.08 : 0.55 + beat * 0.75;

      for (let s = 0; s < 2; s++) {
        d.position.copy(b.pos);
        d.rotation.set(0, b.yaw, (s ? -1 : 1) * open, 'YXZ');
        d.scale.setScalar(1);
        d.updateMatrix();
        wings[s].setMatrixAt(i, d.matrix);
      }
    }
    wings.forEach((w) => { w.instanceMatrix.needsUpdate = true; });
  }

  update(0.016, 0);

  function dispose() {
    wings.forEach((w) => { w.dispose(); w.geometry.dispose(); });
    mat.dispose();
  }

  return { group, update, dispose };
}

export default createButterflies;
