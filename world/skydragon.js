// skydragon.js
//
// The red dragon of the Sky City. Massive (about 150 long, wings 130 across),
// it comes in from the far sky every so often, circles the city for a minute
// or so and leaves again. The Lance on the tallest tower (src/skyWalk.js) can
// hit it, in which case it bursts and stays away a while.
//
// Built from primitives in the city's local frame: a chain of body segments
// that follow the head along its flight path (each one samples the path a
// little further back in time, which is all the "spine" there is), two
// flapping membrane wings, a horned head. No skeleton, no assets.

import * as THREE from 'three';

const D = {
  segments: 16,
  spacing: 0.085, // seconds of path between neighbouring segments
  orbitR: 390, // circling radius about the city's axis
  farR: 2600, // where it arrives from and leaves to
  baseY: 150,
  speed: 0.115, // rad/s round the city
  visitMin: 70, // seconds per visit
  visitAdd: 40,
  awayMin: 35, // seconds between visits
  awayAdd: 45,
  firstDelay: 10, // the first one comes soon, so nobody waits to see it
  deadTime: 60, // seconds it stays away after being shot down
  hitRadius: 24,
  burstCount: 520,
};

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createDragon(parent, opts = {}) {
  const rng = mulberry32((opts.seed ?? 1) * 31 + 7);
  const group = new THREE.Group();
  group.name = 'SkyDragon';
  group.visible = false;
  parent.add(group);

  const hide = new THREE.MeshStandardMaterial({ color: 0xb01818, roughness: 0.55, metalness: 0.15, flatShading: true });
  const belly = new THREE.MeshStandardMaterial({ color: 0xe0a040, roughness: 0.7, flatShading: true });
  const horn = new THREE.MeshStandardMaterial({ color: 0x2a1a14, roughness: 0.6 });
  const membrane = new THREE.MeshStandardMaterial({
    color: 0x8a0f12, roughness: 0.8, side: THREE.DoubleSide, flatShading: true,
    emissive: 0x3a0606, emissiveIntensity: 0.6,
  });
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffe060 });
  eyeMat.color.multiplyScalar(2);

  // --- body chain ---------------------------------------------------------
  const segs = [];
  for (let i = 0; i < D.segments; i++) {
    const u = i / (D.segments - 1);
    // thick chest, long tapering tail
    const r = i === 0 ? 7 : 3 + 8.5 * Math.sin(Math.min(u * 2.6 + 0.35, Math.PI)) * (1 - u * 0.75);
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), hide);
    body.scale.set(r, r * 0.9, r * 1.5);
    g.add(body);
    const under = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 0), belly);
    under.scale.set(r * 0.75, r * 0.5, r * 1.3);
    under.position.y = -r * 0.5;
    g.add(under);
    if (i > 0 && i % 2 === 0) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(r * 0.28, r * 1.2, 4), horn);
      spike.position.y = r * 1.1;
      g.add(spike);
    }
    group.add(g);
    segs.push({ g, r });
  }
  // tail blade
  {
    const blade = new THREE.Mesh(new THREE.ConeGeometry(5, 12, 4), hide);
    blade.rotation.x = -Math.PI / 2;
    blade.scale.x = 0.25;
    blade.position.z = -8;
    segs[D.segments - 1].g.add(blade);
  }

  // --- head (on segment 0; local -Z is behind, +Z is the snout) -------------
  const head = segs[0].g;
  {
    const snout = new THREE.Mesh(new THREE.ConeGeometry(5, 16, 5), hide);
    snout.rotation.x = Math.PI / 2;
    snout.position.set(0, -1, 11);
    const jaw = new THREE.Mesh(new THREE.ConeGeometry(3.6, 12, 4), belly);
    jaw.rotation.x = Math.PI / 2 + 0.28;
    jaw.position.set(0, -4.4, 8);
    head.add(snout, jaw);
    for (const side of [-1, 1]) {
      const h = new THREE.Mesh(new THREE.ConeGeometry(1.3, 13, 5), horn);
      h.position.set(side * 3.6, 6.5, -5);
      h.rotation.set(-0.9, 0, side * -0.25);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.9, 8, 6), eyeMat);
      eye.position.set(side * 4.3, 1.6, 5.5);
      head.add(h, eye);
    }
  }

  // --- wings (on the chest segment) -----------------------------------------
  const wings = [];
  const chest = segs[3].g;
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 6, 4, 0);
    // inner panel shoulder->elbow, outer panel elbow->tip, as two fans
    const inner = new THREE.BufferGeometry();
    inner.setAttribute('position', new THREE.Float32BufferAttribute([
      0, 0, 8, side * 30, 3, 14, side * 28, 0, -20,
      0, 0, 8, side * 28, 0, -20, 0, 0, -16,
    ], 3));
    inner.computeVertexNormals();
    pivot.add(new THREE.Mesh(inner, membrane));
    const elbow = new THREE.Group();
    elbow.position.set(side * 29, 2, 0);
    const outer = new THREE.BufferGeometry();
    outer.setAttribute('position', new THREE.Float32BufferAttribute([
      0, 1, 14, side * 36, 0, 4, side * 22, 0, -26,
      0, 1, 14, side * 22, 0, -26, 0, -2, -20,
      side * 36, 0, 4, side * 44, 0, -14, side * 22, 0, -26,
    ], 3));
    outer.computeVertexNormals();
    elbow.add(new THREE.Mesh(outer, membrane));
    // arm bones
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.5, 31, 5), hide);
    arm.rotation.z = Math.PI / 2;
    arm.position.set(side * 15, 1.5, 11);
    pivot.add(arm);
    const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.9, 38, 5), hide);
    fore.rotation.z = Math.PI / 2;
    fore.position.set(side * 18, 0.6, 9);
    elbow.add(fore);
    pivot.add(elbow);
    chest.add(pivot);
    wings.push({ pivot, elbow, side });
  }

  // --- the burst ---------------------------------------------------------------
  const burstGeo = new THREE.BufferGeometry();
  const bPos = new Float32Array(D.burstCount * 3);
  const bVel = new Float32Array(D.burstCount * 3);
  burstGeo.setAttribute('position', new THREE.BufferAttribute(bPos, 3));
  const burstMat = new THREE.PointsMaterial({
    color: 0xff7a2a, size: 9, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
  });
  burstMat.color.multiplyScalar(2.5);
  const burst = new THREE.Points(burstGeo, burstMat);
  burst.frustumCulled = false;
  burst.visible = false;
  parent.add(burst);
  const fireball = new THREE.Mesh(
    new THREE.IcosahedronGeometry(1, 2),
    new THREE.MeshBasicMaterial({ color: 0xffd080, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  fireball.material.color.multiplyScalar(3);
  fireball.visible = false;
  parent.add(fireball);
  let burstT = -1;

  // --- flight ------------------------------------------------------------------
  // state: 'away' (hidden, counting down) | 'visit' (flying)
  const st = {
    state: 'away',
    timer: D.firstDelay,
    visitLen: 0,
    age: 0, // seconds into this visit
    ang0: rng() * Math.PI * 2,
    dir: 1,
    kills: 0,
  };

  const _p = new THREE.Vector3();
  const _n = new THREE.Vector3();
  const _m = new THREE.Matrix4();
  const _up = new THREE.Vector3(0, 1, 0);

  // Head position `back` seconds ago along this visit's path.
  function pathAt(age, out) {
    const a = Math.max(age, -2);
    // ease in from the far sky, ease out to it again
    const inK = Math.min(Math.max(a / 14, 0), 1);
    const outK = Math.min(Math.max((st.visitLen - a) / 14, 0), 1);
    const near = Math.min(inK * inK * (3 - 2 * inK), outK * outK * (3 - 2 * outK));
    const r = D.farR + (D.orbitR - D.farR) * near + Math.sin(a * 0.23) * 60 * near;
    const ang = st.ang0 + st.dir * a * D.speed;
    return out.set(
      Math.cos(ang) * r,
      D.baseY + Math.sin(a * 0.31) * 55 + Math.sin(a * 0.9) * 9 + (1 - near) * 420,
      Math.sin(ang) * r
    );
  }

  function startVisit() {
    st.state = 'visit';
    st.age = 0;
    st.visitLen = D.visitMin + rng() * D.visitAdd;
    st.ang0 = rng() * Math.PI * 2;
    st.dir = rng() < 0.5 ? 1 : -1;
    group.visible = true;
  }

  function update(dt, t, near) {
    // the burst plays out whether or not the dragon is around
    if (burstT >= 0) {
      burstT += dt;
      const k = burstT / 3.2;
      for (let i = 0; i < D.burstCount * 3; i += 3) {
        bVel[i + 1] -= 26 * dt;
        bPos[i] += bVel[i] * dt;
        bPos[i + 1] += bVel[i + 1] * dt;
        bPos[i + 2] += bVel[i + 2] * dt;
      }
      burstGeo.attributes.position.needsUpdate = true;
      burstMat.opacity = Math.max(1 - k, 0);
      const f = Math.min(burstT / 0.9, 1);
      fireball.scale.setScalar(20 + 130 * f);
      fireball.material.opacity = Math.max(1 - f, 0);
      fireball.visible = f < 1;
      if (k >= 1) {
        burstT = -1;
        burst.visible = false;
      }
    }

    if (st.state === 'away') {
      st.timer -= dt;
      // Only turn up while someone is close enough to see it.
      if (st.timer <= 0 && near) startVisit();
      return;
    }
    st.age += dt;
    if (st.age >= st.visitLen) {
      st.state = 'away';
      st.timer = D.awayMin + rng() * D.awayAdd;
      group.visible = false;
      return;
    }
    for (let i = 0; i < D.segments; i++) {
      const back = i * D.spacing * 2.5; // ~9.5 u apart at circling speed
      pathAt(st.age - back, _p);
      pathAt(st.age - back + 0.05, _n);
      const s = segs[i];
      s.g.position.copy(_p);
      // body undulation, growing toward the tail
      s.g.position.y += Math.sin(t * 2.2 - i * 0.55) * (1.5 + i * 0.5);
      _m.lookAt(_n, _p, _up); // +Z toward travel
      s.g.quaternion.setFromRotationMatrix(_m);
    }
    const flap = Math.sin(t * 2.2);
    for (const w of wings) {
      w.pivot.rotation.z = w.side * (0.15 + flap * 0.55);
      w.elbow.rotation.z = w.side * (flap * 0.5 - 0.25);
    }
  }

  // Does the ray (city-local origin + unit dir) pass close enough to the body?
  const _v = new THREE.Vector3();
  function hitTest(origin, dir) {
    if (st.state !== 'visit') return false;
    for (let i = 0; i < D.segments; i += 2) {
      _v.copy(segs[i].g.position).sub(origin);
      const along = _v.dot(dir);
      if (along < 0) continue;
      const off = Math.sqrt(Math.max(_v.lengthSq() - along * along, 0));
      if (off < D.hitRadius) return true;
    }
    return false;
  }

  function explode() {
    if (st.state !== 'visit') return false;
    const c = segs[3].g.position;
    for (let i = 0; i < D.burstCount; i++) {
      const src = segs[i % D.segments].g.position;
      bPos[i * 3] = src.x;
      bPos[i * 3 + 1] = src.y;
      bPos[i * 3 + 2] = src.z;
      const a = rng() * Math.PI * 2, e = Math.acos(rng() * 2 - 1), v = 30 + rng() * 120;
      bVel[i * 3] = Math.sin(e) * Math.cos(a) * v;
      bVel[i * 3 + 1] = Math.cos(e) * v + 20;
      bVel[i * 3 + 2] = Math.sin(e) * Math.sin(a) * v;
    }
    burstGeo.attributes.position.needsUpdate = true;
    burst.visible = true;
    burstMat.opacity = 1;
    fireball.position.copy(c);
    fireball.visible = true;
    burstT = 0;
    group.visible = false;
    st.state = 'away';
    st.timer = D.deadTime;
    st.kills++;
    return true;
  }

  return {
    group,
    update,
    hitTest,
    explode,
    state: st,
    get alive() {
      return st.state === 'visit';
    },
    // chest position, city-local (for prompts, tests and the compass)
    position: segs[3].g.position,
    // bring it in now (debug / first-time showpiece)
    summon() {
      if (st.state !== 'visit') startVisit();
      st.age = 16; // already circling
    },
  };
}
