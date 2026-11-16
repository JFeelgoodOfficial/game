// ---------------------------------------------------------------------------
// Neptunia, after the charge.
//
// The governor's charge was never on a timer (world/reachtube.js). When it
// goes, the hemisphere under the Indigo Reach is gone: what is left is half an
// ocean world with a raw violet cross-section, and the other half strewn
// across the sky as rock, hanging blobs of sea, dust — and the ship, dark and
// turning slowly in the middle of it. Permanent for the save (journal quest
// 'neptunia-charge' === 'blown'; game.js re-applies it at boot).
//
// How the planet is cut: one function of direction, shared by the GPU and the
// CPU. A direction is GONE when
//     dot(dir, N) > c + jag(phi)
// with N the blast axis (the ship's site), phi the azimuth about it and jag a
// short sum of sines. The planet's surface, sea and cloud shaders discard on
// it (uShatterN/T1/T2 — see the `shattered()` helper in each); the cut face
// here is the ruled surface from the planet's centre out to exactly that rim,
// so the shell and the rock meet with no gap to see stars through.
// Everything rides planet.surface, whose spin is stopped for good.
// ---------------------------------------------------------------------------

import * as THREE from 'three';

const CUT = 0.02; // cos of the nominal cut: ~half the world
const JAG = [[0.07, 3, 1.1], [0.05, 7, 4.0], [0.035, 13, 2.2], [0.02, 23, 0.7]];
// GLSL mirror of jag(): keep in step with JAG (src/shaders/*.frag `shattered`).
const jag = (phi) => {
  let s = 0;
  for (const [a, k, p] of JAG) s += a * Math.sin(k * phi + p);
  return s;
};

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ROCK = [0x2e2258, 0x4a3688, 0x6a4eb0, 0x8f78d0, 0xcfc4ec, 0x3a2c6c];

export function createShatter(planet, siteDir, reachShip) {
  const R = planet.radius;
  const N = siteDir.clone().normalize();
  const T1 = new THREE.Vector3().crossVectors(N, Math.abs(N.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)).normalize();
  const T2 = new THREE.Vector3().crossVectors(N, T1).normalize();
  let active = false;
  let group = null;
  let chunks = null, chunkData = null, wreckPivot = null, dust = null;
  const _o = new THREE.Object3D();
  const _v = new THREE.Vector3();
  const _q = new THREE.Quaternion();

  // Is this object-space direction in the missing half?
  function gone(dir) {
    const phi = Math.atan2(dir.dot(T2), dir.dot(T1));
    return dir.dot(N) > CUT + jag(phi);
  }

  function build() {
    const rng = mulberry32(0x5ca77e);
    group = new THREE.Group();
    group.name = 'neptuniaShatter';
    const col = new THREE.Color();
    const rockMat = new THREE.MeshStandardMaterial({
      vertexColors: true, flatShading: true, roughness: 0.82, metalness: 0.08,
      emissive: 0x160e30, emissiveIntensity: 0.55, // a violet rock that still reads on the night side
    });

    // ---- the cut face: centre -> rim, cragged ----
    {
      const SEG = 120, RINGS = 16, RO = R + 3;
      const pos = new Float32Array((SEG * RINGS + 1) * 3);
      const cols = new Float32Array((SEG * RINGS + 1) * 3);
      // lumps: a coarse random field over (ring, seg), bilinear
      const GW = 24, GH = 10;
      const field = new Float32Array(GW * GH);
      for (let i = 0; i < field.length; i++) field[i] = rng() * 2 - 1;
      const lump = (u, v) => {
        const x = u * GW, y = v * (GH - 1);
        const x0 = Math.floor(x) % GW, x1 = (x0 + 1) % GW, y0 = Math.floor(y), y1 = Math.min(y0 + 1, GH - 1);
        const fx = x - Math.floor(x), fy = y - y0;
        const a = field[y0 * GW + x0] * (1 - fx) + field[y0 * GW + x1] * fx;
        const b = field[y1 * GW + x0] * (1 - fx) + field[y1 * GW + x1] * fx;
        return a * (1 - fy) + b * fy;
      };
      // Colour runs in coherent seams (the same lump field, read a little
      // off-phase), not per-vertex confetti: strata, with pale crystal near the rim.
      const put = (idx, p, shade, u = 0, v = 0) => {
        pos[idx * 3] = p.x; pos[idx * 3 + 1] = p.y; pos[idx * 3 + 2] = p.z;
        const band = (lump((u + 0.37) % 1, v) * 0.5 + 0.5) * 0.75 + v * 0.35;
        col.set(ROCK[Math.min(ROCK.length - 2, Math.floor(band * (ROCK.length - 1)))]).multiplyScalar(shade);
        cols[idx * 3] = col.r; cols[idx * 3 + 1] = col.g; cols[idx * 3 + 2] = col.b;
      };
      // centre, dished in toward the surviving half
      put(0, _v.copy(N).multiplyScalar(-R * 0.16), 0.8);
      for (let j = 1; j <= RINGS; j++) {
        const f = j / RINGS;
        for (let i = 0; i < SEG; i++) {
          const phi = (i / SEG) * Math.PI * 2;
          const ct = CUT + jag(phi), st = Math.sqrt(1 - ct * ct);
          _v.copy(N).multiplyScalar(ct).addScaledVector(T1, Math.cos(phi) * st).addScaledVector(T2, Math.sin(phi) * st);
          _v.multiplyScalar(RO * f);
          if (j < RINGS) {
            // crags and a broad dish; both die away at the rim, which must stay exact
            const fade = 1 - f * f * f;
            const d = (-R * 0.16 * (1 - f * f) + lump(i / SEG, f) * R * 0.2 + (rng() - 0.5) * R * 0.06) * fade;
            _v.addScaledVector(N, d);
          }
          put((j - 1) * SEG + i + 1, _v, 0.6 + 0.5 * f + (rng() - 0.5) * 0.12, i / SEG, f);
        }
      }
      const idx = [];
      for (let i = 0; i < SEG; i++) idx.push(0, 1 + i, 1 + ((i + 1) % SEG));
      for (let j = 1; j < RINGS; j++) {
        for (let i = 0; i < SEG; i++) {
          const a = (j - 1) * SEG + i + 1, b = (j - 1) * SEG + ((i + 1) % SEG) + 1, c = a + SEG, e = b + SEG;
          idx.push(a, c, b, b, c, e);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
      g.setIndex(idx);
      const face = new THREE.Mesh(g.toNonIndexed(), rockMat.clone());
      face.geometry.computeVertexNormals();
      face.material.side = THREE.DoubleSide;
      g.dispose();
      group.add(face);
    }

    // ---- the other half: chunks, from one continent-sized mass down to gravel ----
    {
      const base = new THREE.IcosahedronGeometry(1, 2).toNonIndexed();
      const p = base.attributes.position;
      // knock the sphere about so no two silhouettes read as balls
      const seen = new Map();
      for (let i = 0; i < p.count; i++) {
        const key = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
        if (!seen.has(key)) seen.set(key, 0.58 + rng() * 0.7);
        const s = seen.get(key);
        p.setXYZ(i, p.getX(i) * s, p.getY(i) * s, p.getZ(i) * s);
      }
      base.computeVertexNormals();
      const white = new Float32Array(p.count * 3).fill(1);
      base.setAttribute('color', new THREE.BufferAttribute(white, 3));
      const COUNT = 360;
      chunks = new THREE.InstancedMesh(base, rockMat, COUNT);
      chunkData = [];
      for (let i = 0; i < COUNT; i++) {
        // a cone of debris opening away from the cut, densest where the half used to be
        let size, rho, spread;
        if (i === 0) { size = R * 0.5; rho = R * 1.75; spread = 0.5; } // the big one
        else if (i < 9) { size = R * (0.1 + rng() * 0.17); rho = R * (0.75 + rng() * 1.5); spread = 0.9; }
        else if (i < 70) { size = R * (0.022 + rng() * 0.06); rho = R * (0.35 + rng() * 2.1); spread = 1.1; }
        else { size = R * (0.004 + rng() * 0.02); rho = R * (0.25 + rng() * 2.6); spread = 1.25; }
        const phi = rng() * Math.PI * 2;
        const ct = Math.max(1 - Math.pow(rng(), 1.4) * spread, 0.05); // cos of the angle off the axis
        const st = Math.sqrt(1 - ct * ct);
        const pos = new THREE.Vector3().copy(N).multiplyScalar(ct).addScaledVector(T1, Math.cos(phi) * st).addScaledVector(T2, Math.sin(phi) * st).multiplyScalar(rho);
        if (i === 0) pos.copy(N).multiplyScalar(0.72).addScaledVector(T1, 0.69).multiplyScalar(rho);
        const axis = new THREE.Vector3(rng() - 0.5, rng() - 0.5, rng() - 0.5).normalize();
        const scale = new THREE.Vector3(size * (0.7 + rng() * 0.6), size * (0.6 + rng() * 0.7), size * (0.7 + rng() * 0.6));
        chunkData.push({ pos, axis, scale, spin: (0.004 + rng() * 0.03) * (size > R * 0.1 ? 0.25 : 1), phase: rng() * 6.28 });
        chunks.setColorAt(i, col.set(ROCK[Math.floor(rng() * ROCK.length)]).multiplyScalar(0.7 + rng() * 0.6));
      }
      chunks.instanceColor.needsUpdate = true;
      chunks.frustumCulled = false;
      group.add(chunks);

      // ---- what is left of the sea: blobs hanging off the larger rocks, lit from inside ----
      const seaMat = new THREE.MeshStandardMaterial({
        color: 0x1c3fb0, transparent: true, opacity: 0.62, roughness: 0.08, metalness: 0.2,
        emissive: 0x0a2a8a, emissiveIntensity: 0.6, depthWrite: false,
      });
      const blobG = new THREE.SphereGeometry(1, 20, 14);
      const jellyG = new THREE.SphereGeometry(1, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.6);
      const jellyMat = new THREE.MeshBasicMaterial();
      const jellies = new THREE.InstancedMesh(jellyG, jellyMat, 80);
      let jn = 0;
      const hues = [0x9a7cff, 0xff6ad0, 0x5af0ff, 0xffb070];
      for (let i = 9; i < 30; i++) {
        const c = chunkData[i];
        const r = Math.max(c.scale.x, c.scale.z) * (0.55 + rng() * 0.3);
        const off = new THREE.Vector3(rng() - 0.5, rng() - 0.5, rng() - 0.5).normalize().multiplyScalar(c.scale.y * 0.55);
        const blob = new THREE.Mesh(blobG, seaMat);
        blob.position.copy(c.pos).add(off);
        blob.scale.set(r, r * (0.6 + rng() * 0.3), r);
        blob.renderOrder = 2;
        group.add(blob);
        for (let k = 0; k < 4 && jn < 80; k++) {
          _o.position.copy(blob.position).add(_v.set(rng() - 0.5, rng() - 0.5, rng() - 0.5).multiplyScalar(r * 1.9));
          const s = 2.5 + rng() * 6;
          _o.scale.set(s, s, s);
          _o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), _v.set(rng() - 0.5, rng() - 0.5, rng() - 0.5).normalize());
          _o.updateMatrix();
          jellies.setMatrixAt(jn, _o.matrix);
          jellies.setColorAt(jn, col.set(hues[jn % hues.length]).multiplyScalar(1.6));
          jn++;
        }
      }
      jellies.count = jn;
      jellies.instanceMatrix.needsUpdate = true;
      if (jellies.instanceColor) jellies.instanceColor.needsUpdate = true;
      jellies.frustumCulled = false;
      group.add(jellies);
    }

    // ---- dust and afterglow in the gap ----
    {
      const n = 1100;
      const pos = new Float32Array(n * 3), cols = new Float32Array(n * 3);
      const warm = new THREE.Color(0xff9a4a), cold = new THREE.Color(0x6aa8ff), grey = new THREE.Color(0x6f6a80);
      for (let i = 0; i < n; i++) {
        const phi = rng() * 6.28, ct = 1 - Math.pow(rng(), 1.2) * 1.05, st = Math.sqrt(Math.max(1 - ct * ct, 0));
        const rho = R * (0.15 + Math.pow(rng(), 0.8) * 1.7);
        _v.copy(N).multiplyScalar(ct).addScaledVector(T1, Math.cos(phi) * st).addScaledVector(T2, Math.sin(phi) * st).multiplyScalar(rho);
        pos[i * 3] = _v.x; pos[i * 3 + 1] = _v.y; pos[i * 3 + 2] = _v.z;
        const k = rng();
        col.copy(k < 0.12 ? warm : k < 0.3 ? cold : grey).multiplyScalar(0.08 + rng() * 0.2);
        cols[i * 3] = col.r; cols[i * 3 + 1] = col.g; cols[i * 3 + 2] = col.b;
      }
      const cv = document.createElement('canvas');
      cv.width = cv.height = 64;
      const ctx = cv.getContext('2d');
      const gr = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(255,255,255,0.55)');
      gr.addColorStop(0.45, 'rgba(255,255,255,0.16)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = gr;
      ctx.fillRect(0, 0, 64, 64);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
      dust = new THREE.Points(g, new THREE.PointsMaterial({
        size: R * 0.2, map: new THREE.CanvasTexture(cv), vertexColors: true, transparent: true,
        depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
      }));
      dust.frustumCulled = false;
      dust.renderOrder = 3;
      group.add(dust);
    }

    // ---- the Reach: adrift in the middle of it ----
    wreckPivot = new THREE.Group();
    wreckPivot.position.copy(N).multiplyScalar(R * 1.12).addScaledVector(T1, -R * 0.34).addScaledVector(T2, R * 0.12);
    group.add(wreckPivot);

    planet.surface.add(group);
  }

  // Cut the planet and scatter the rest. Idempotent.
  function apply() {
    if (active) return;
    active = true;
    if (!group) build();
    group.visible = true;
    const u = planet.shatter;
    u.uShatterN.value.set(N.x, N.y, N.z, CUT);
    u.uShatterT1.value.copy(T1);
    u.uShatterT2.value.copy(T2);
    // The world stops turning: the debris has to stay where the half went.
    const ang = planet.surface.rotation.y;
    planet.cfg.spin = () => 0;
    planet.spinPhase = ang;
    planet.spinNeedsResync = false;
    planet.spinFrozen = false;
    // No floor where there is no planet: the flight floor follows the cut.
    const body = planet.body;
    const g0 = body.groundAt;
    const _d = new THREE.Vector3(), _y = new THREE.Vector3(0, 1, 0);
    body.groundAt = (worldDir) => {
      _d.copy(worldDir).applyAxisAngle(_y, -planet.surface.rotation.y);
      return gone(_d) ? -R * 0.9 : g0(worldDir);
    };
    reachShip.wreck(wreckPivot);
  }

  function update(dt, t, camWorld) {
    if (!active) return;
    // The scattering shell is a whole sphere of air; half a world does not hold one.
    if (planet.atmosphere) planet.atmosphere.visible = false;
    const far = _v.copy(camWorld).sub(planet.group.position).lengthSq() > (R * 14) * (R * 14);
    group.visible = !far;
    if (far) return;
    for (let i = 0; i < chunkData.length; i++) {
      const c = chunkData[i];
      _o.position.copy(c.pos);
      _o.scale.copy(c.scale);
      _o.quaternion.setFromAxisAngle(c.axis, c.phase + t * c.spin);
      _o.updateMatrix();
      chunks.setMatrixAt(i, _o.matrix);
    }
    chunks.instanceMatrix.needsUpdate = true;
    wreckPivot.quaternion.setFromAxisAngle(_v.set(0.3, 0.2, 0.93).normalize(), t * 0.035)
      .multiply(_q.setFromAxisAngle(_v.set(1, 0, 0), 0.9 + t * 0.012));
    dust.rotation.y = 0; // static: the cloud has stopped expanding
  }

  return { apply, update, gone, get active() { return active; }, N, T1, T2 };
}
