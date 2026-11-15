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
  hitRadius: 16,
  burstCount: 1600,
  dieTime: 6.5, // seconds the death plays out before the sky is empty again
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

  // --- the death -----------------------------------------------------------------
  // Hit by the Lance, it does not vanish: it detonates down its length, head to
  // tail, and comes apart. Five layers, all additive except the wreckage:
  //   - a white flash and a light that throws the city into hard relief,
  //   - a chain of fireballs, one per body segment, running tailward,
  //   - two shock rings racing outward,
  //   - a storm of embers (hot white -> gold -> red as they cool and fall),
  //   - the body itself, each segment hurled out and tumbling down on fire.
  const burstGeo = new THREE.BufferGeometry();
  const bPos = new Float32Array(D.burstCount * 3);
  const bVel = new Float32Array(D.burstCount * 3);
  const bCol = new Float32Array(D.burstCount * 3);
  const bHeat = new Float32Array(D.burstCount); // each ember's own cooling rate
  const bBorn = new Float32Array(D.burstCount); // when it leaves the body (chain delay)
  burstGeo.setAttribute('position', new THREE.BufferAttribute(bPos, 3));
  burstGeo.setAttribute('color', new THREE.BufferAttribute(bCol, 3));
  const burstMat = new THREE.PointsMaterial({
    size: 7, vertexColors: true, transparent: true, opacity: 1,
    blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
  });
  const burst = new THREE.Points(burstGeo, burstMat);
  burst.frustumCulled = false;
  burst.visible = false;
  parent.add(burst);

  const fireGeo = new THREE.IcosahedronGeometry(1, 2);
  const fireballs = [];
  for (let i = 0; i < D.segments; i++) {
    const m = new THREE.Mesh(fireGeo, new THREE.MeshBasicMaterial({
      color: 0xffb060, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    m.visible = false;
    parent.add(m);
    fireballs.push({ m, at: 0, size: 1 });
  }
  const flashBall = new THREE.Mesh(fireGeo, new THREE.MeshBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  flashBall.material.color.multiplyScalar(2.5);
  flashBall.visible = false;
  parent.add(flashBall);
  const rings = [];
  for (let i = 0; i < 2; i++) {
    const m = new THREE.Mesh(
      new THREE.RingGeometry(0.86, 1, 64),
      new THREE.MeshBasicMaterial({
        color: 0xffd9a0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
        depthWrite: false, side: THREE.DoubleSide,
      })
    );
    m.material.color.multiplyScalar(1.4);
    m.visible = false;
    parent.add(m);
    rings.push(m);
  }
  const blast = new THREE.PointLight(0xffb070, 0, 0, 0.6);
  parent.add(blast);
  // wreckage state, one per body segment
  const wreck = segs.map(() => ({ v: new THREE.Vector3(), w: new THREE.Vector3(), at: 0 }));
  const charred = new THREE.MeshStandardMaterial({
    color: 0x1a0a08, roughness: 1, emissive: 0xff5a10, emissiveIntensity: 2.5, flatShading: true,
  });
  let dieT = -1; // >= 0 while the death is playing
  const dieAt = new THREE.Vector3();

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
    if (dieT >= 0) {
      stepDeath(dt);
      return;
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

  function stepDeath(dt) {
    dieT += dt;
    // flash + light: instant, then a long warm decay
    const fl = Math.exp(-dieT * 9);
    flashBall.scale.setScalar(30 + dieT * 160);
    flashBall.material.opacity = fl;
    flashBall.visible = fl > 0.01;
    blast.intensity = (Math.exp(-dieT * 1.6) * 9 + fl * 30) * 4;
    // shock rings
    for (let i = 0; i < rings.length; i++) {
      const t = dieT - i * 0.22;
      const m = rings[i];
      m.visible = t > 0 && t < 2.2;
      if (!m.visible) continue;
      const k = t / 2.2;
      m.scale.setScalar(30 + 900 * (1 - (1 - k) * (1 - k)));
      m.material.opacity = (1 - k) * (1 - k);
    }
    // the chain of fireballs
    for (const f of fireballs) {
      const t = dieT - f.at;
      if (t < 0 || t > 1.5) { f.m.visible = false; continue; }
      const k = t / 1.5;
      f.m.visible = true;
      f.m.scale.setScalar(f.size * (0.2 + 0.85 * Math.sqrt(k)));
      f.m.material.opacity = 0.75 * (1 - k) * (1 - k);
      // white-hot heart cooling through gold to a red husk
      f.m.material.color.setRGB(2.2 * (1 - k * 0.3), 1.5 * (1 - k) * (1 - k) + 0.22, 1.0 * Math.pow(1 - k, 4));
    }
    // wreckage: thrown out, tumbling, burning down to black as it falls
    for (let i = 0; i < segs.length; i++) {
      const w = wreck[i];
      if (dieT < w.at) continue;
      const g = segs[i].g;
      w.v.y -= 32 * dt;
      w.v.multiplyScalar(1 - 0.25 * dt);
      g.position.addScaledVector(w.v, dt);
      g.rotation.x += w.w.x * dt;
      g.rotation.y += w.w.y * dt;
      g.rotation.z += w.w.z * dt;
    }
    charred.emissiveIntensity = 2.8 * Math.exp(-dieT * 0.5) * (0.75 + 0.25 * Math.sin(dieT * 31));
    // embers
    const drag = 1 - 0.55 * dt;
    for (let i = 0; i < D.burstCount; i++) {
      const j = i * 3;
      const age = dieT - bBorn[i];
      if (age < 0) continue;
      bVel[j] *= drag; bVel[j + 2] *= drag;
      bVel[j + 1] = bVel[j + 1] * drag - 22 * dt;
      bPos[j] += bVel[j] * dt;
      bPos[j + 1] += bVel[j + 1] * dt;
      bPos[j + 2] += bVel[j + 2] * dt;
      const heat = Math.max(1 - age * bHeat[i], 0);
      bCol[j] = 2.2 * Math.sqrt(heat);
      bCol[j + 1] = 1.5 * heat * heat;
      bCol[j + 2] = 0.9 * Math.pow(heat, 5);
    }
    burstGeo.attributes.position.needsUpdate = true;
    burstGeo.attributes.color.needsUpdate = true;

    if (dieT >= D.dieTime) {
      dieT = -1;
      burst.visible = false;
      group.visible = false;
      blast.intensity = 0;
      for (const f of fireballs) f.m.visible = false;
      for (const m of rings) m.visible = false;
      flashBall.visible = false;
      // put the body back together for the next visit
      for (const s of segs) {
        s.g.rotation.set(0, 0, 0);
        s.g.traverse((o) => { if (o.userData.alive) o.material = o.userData.alive; });
      }
    }
  }

  // Does the ray (city-local origin + unit dir) pass close enough to the body?
  // Every segment is tested against its own girth plus `slack`.
  const _v = new THREE.Vector3();
  function hitTest(origin, dir, slack = D.hitRadius) {
    if (st.state !== 'visit') return false;
    for (let i = 0; i < D.segments; i++) {
      _v.copy(segs[i].g.position).sub(origin);
      const along = _v.dot(dir);
      if (along < 0) continue;
      const off = Math.sqrt(Math.max(_v.lengthSq() - along * along, 0));
      if (off < slack + segs[i].r) return true;
    }
    return false;
  }

  function explode() {
    if (st.state !== 'visit') return false;
    dieAt.copy(segs[3].g.position);
    const back = new THREE.Vector3().subVectors(segs[D.segments - 1].g.position, segs[0].g.position).normalize();
    // the chain runs head to tail over about a second
    for (let i = 0; i < D.segments; i++) {
      const at = 0.05 + i * 0.07;
      const f = fireballs[i];
      f.at = at;
      f.size = 26 + segs[i].r * 5.5;
      f.m.position.copy(segs[i].g.position);
      const w = wreck[i];
      w.at = at;
      w.v.set(rng() - 0.5, rng() * 0.9 + 0.1, rng() - 0.5).normalize().multiplyScalar(40 + rng() * 85)
        .addScaledVector(back, -45); // keeps some of its flight
      w.w.set(rng() - 0.5, rng() - 0.5, rng() - 0.5).multiplyScalar(7);
      segs[i].g.traverse((o) => {
        if (!o.isMesh || o.material === eyeMat) return;
        o.userData.alive = o.userData.alive || o.material;
        o.material = charred;
      });
    }
    for (let i = 0; i < D.burstCount; i++) {
      const si = i % D.segments;
      const src = segs[si].g.position;
      const j = i * 3;
      bPos[j] = src.x; bPos[j + 1] = src.y; bPos[j + 2] = src.z;
      const a = rng() * Math.PI * 2, e = Math.acos(rng() * 2 - 1);
      const v = (i % 5 === 0 ? 230 : 110) * Math.pow(rng(), 0.6) + 16; // a fifth are fast streamers
      bVel[j] = Math.sin(e) * Math.cos(a) * v;
      bVel[j + 1] = Math.cos(e) * v + 26;
      bVel[j + 2] = Math.sin(e) * Math.sin(a) * v;
      bHeat[i] = 0.16 + rng() * 0.3;
      bBorn[i] = 0.05 + si * 0.07;
      bCol[j] = bCol[j + 1] = bCol[j + 2] = 0;
    }
    burstGeo.attributes.position.needsUpdate = true;
    burst.visible = true;
    flashBall.position.copy(dieAt);
    blast.position.copy(dieAt);
    rings[0].position.copy(dieAt);
    rings[0].rotation.set(-Math.PI / 2, 0, 0);
    rings[1].position.copy(dieAt);
    rings[1].rotation.set(0, rng() * 3, 0.5);
    dieT = 0;
    st.state = 'away'; // no longer a target; the body stays visible as wreckage
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
    get dying() {
      return dieT >= 0;
    },
    deathPos: dieAt,
    // chest position, city-local (for prompts, tests and the compass)
    position: segs[3].g.position,
    // bring it in now (debug / first-time showpiece)
    summon() {
      if (st.state !== 'visit') startVisit();
      st.age = 16; // already circling
    },
  };
}
