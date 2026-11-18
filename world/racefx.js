// What a race looks like from the city (GDD 5.7.4, world racing).
//
// Four things, all of them only there while a race is on:
//
//   wakes       every world leaves a ribbon of light in its drive's colour that
//               hangs in the sky for some seconds after it has gone by, so a
//               lap in, the course is drawn in the air in the field's colours
//   the crowd   people at the rails of the terrace, the Pavilion and the three
//               districts, who jump when the leader comes over them
//   lights      each district throws a beam of its own colour up at whoever
//               is leading, and holds it on them
//   fireworks   at the finish
//
//   const fx = createRaceFx(group);
//   fx.begin() / fx.end()
//   fx.wake(i, pos, color)          racer i is here now (call every frame)
//   fx.burst(pos, color)            a firework
//   fx.tick(dt, t, leaderPos, px)
//
// One draw for all the wakes, one for the crowd, three for the beams, one for
// the fireworks. Nothing is allocated while it runs.

import * as THREE from 'three';
import { CH_TIER } from '../src/constants.js';
import { Q } from '../src/quality.js';
import { SEAM, BELL, SAT } from './lightdistricts.js';
import { PAV } from './lightpavilion.js';

const RACERS = 8; // most worlds on a grid
const WAKE_LIFE = 7.5; // seconds a wake hangs
const WAKE_STEP = 9; // a new light every this far along
const TERR = { x: 0, z: -77 };

export function createRaceFx(group) {
  const tier = CH_TIER[Q.tier] || CH_TIER.medium;
  const root = new THREE.Group();
  root.visible = false;
  group.add(root);

  // --- wakes ---
  const PER = tier.wake;
  const N = RACERS * PER;
  const wPos = new THREE.BufferAttribute(new Float32Array(N * 3), 3);
  const wCol = new THREE.BufferAttribute(new Float32Array(N * 3), 3);
  const wAge = new THREE.BufferAttribute(new Float32Array(N).fill(1), 1);
  for (const a of [wPos, wCol, wAge]) a.setUsage(THREE.DynamicDrawUsage);
  const wGeo = new THREE.BufferGeometry();
  wGeo.setAttribute('position', wPos);
  wGeo.setAttribute('color', wCol);
  wGeo.setAttribute('aAge', wAge);
  const wakeU = { uPx: { value: 600 } };
  const wakes = new THREE.Points(wGeo, new THREE.ShaderMaterial({
    uniforms: wakeU,
    vertexShader: /* glsl */ `
      attribute float aAge; // 0 new .. 1 gone
      attribute vec3 color;
      uniform float uPx;
      varying float vAge;
      varying vec3 vCol;
      void main() {
        vAge = aAge;
        vCol = color;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        // it spreads as it ages
        gl_PointSize = aAge >= 1.0 ? 0.0 : clamp(uPx * (3.2 + 7.0 * aAge) / max(-mv.z, 1.0), 1.5, 150.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying float vAge;
      varying vec3 vCol;
      void main() {
        float r = length(gl_PointCoord * 2.0 - 1.0);
        if (r > 1.0 || vAge >= 1.0) discard;
        float k = pow(1.0 - r, 2.0) * (1.0 - vAge) * (1.0 - vAge);
        gl_FragColor = vec4((vCol * 1.5 + 0.2 * (1.0 - vAge)) * k * 0.55, 1.0);
      }
    `,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  }));
  wakes.frustumCulled = false;
  root.add(wakes);
  const head = new Int32Array(RACERS); // where each racer's next light goes
  const lastX = new Float32Array(RACERS), lastY = new Float32Array(RACERS), lastZ = new Float32Array(RACERS);

  // --- the crowd: capsules at the rails, in the three peoples' colours ---
  const C_N = tier.crowd;
  const crowd = new THREE.InstancedMesh(
    new THREE.CapsuleGeometry(0.26, 1.05, 3, 8).translate(0, 0.8, 0),
    new THREE.MeshLambertMaterial({ emissive: 0x24201c }),
    Math.max(C_N, 1)
  );
  const cx = new Float32Array(C_N), cy = new Float32Array(C_N), cz = new Float32Array(C_N), cs = new Float32Array(C_N);
  const PAL = [0xb5532a, 0xe9c46a, 0xff6fae, 0x82f7ff, 0xf1ecdf, 0x8a3f20];
  let rs = 0x51ce5;
  const rnd = () => ((rs = (Math.imul(rs, 1664525) + 1013904223) >>> 0), rs / 4294967296);
  // where they stand: [centre x, z, floor y, ring radius, share of the crowd, from angle, to angle]
  const STANDS = [
    [TERR.x, TERR.z, 0, 18.4, 0.3, 0.25, Math.PI - 0.25],
    [PAV.x, PAV.z, 0, 27.5, 0.2, 0.6, Math.PI - 0.6],
    [SEAM.x, SEAM.z, SEAM.y, SEAM.r - 6.5, 0.16, 0, Math.PI * 2],
    [BELL.x, BELL.z, BELL.y, BELL.r - 1.6, 0.18, 0, Math.PI * 2],
    [SAT.x, SAT.z, SAT.y, 9, 0.16, 0, Math.PI * 2],
  ];
  const col = new THREE.Color();
  let ci = 0;
  for (const [sx, sz, sy, sr, share, a0, a1] of STANDS) {
    const n = Math.min(Math.round(C_N * share), C_N - ci);
    for (let i = 0; i < n; i++, ci++) {
      const a = a0 + rnd() * (a1 - a0), r = sr - rnd() * 1.6;
      cx[ci] = sx + Math.cos(a) * r;
      cz[ci] = sz + Math.sin(a) * r;
      cy[ci] = sy;
      cs[ci] = rnd();
      crowd.setColorAt(ci, col.set(PAL[Math.floor(rnd() * PAL.length)]));
    }
  }
  const used = ci;
  crowd.count = used;
  // ...and what each of them is holding up: a light, which is what a crowd looks like from the air
  const lPos = new Float32Array(used * 3), lCol = new Float32Array(used * 3), lSeed = new Float32Array(used);
  for (let i = 0; i < used; i++) {
    lPos[i * 3] = cx[i];
    lPos[i * 3 + 1] = cy[i] + 2.3;
    lPos[i * 3 + 2] = cz[i];
    col.set(PAL[Math.floor(rnd() * 4)]);
    lCol[i * 3] = col.r;
    lCol[i * 3 + 1] = col.g;
    lCol[i * 3 + 2] = col.b;
    lSeed[i] = cs[i];
  }
  const lGeo = new THREE.BufferGeometry();
  lGeo.setAttribute('position', new THREE.BufferAttribute(lPos, 3));
  lGeo.setAttribute('color', new THREE.BufferAttribute(lCol, 3));
  lGeo.setAttribute('aSeed', new THREE.BufferAttribute(lSeed, 1));
  const lightU = { uTime: { value: 0 }, uPx: { value: 600 }, uLeader: { value: new THREE.Vector3() } };
  const lights = new THREE.Points(lGeo, new THREE.ShaderMaterial({
    uniforms: lightU,
    vertexShader: /* glsl */ `
      attribute vec3 color;
      attribute float aSeed;
      uniform float uTime, uPx;
      uniform vec3 uLeader;
      varying vec3 vCol;
      varying float vK;
      void main() {
        float near = max(0.0, 1.0 - distance(position.xz, uLeader.xz) / 170.0);
        // waved, and waved harder when the leader is overhead
        vec3 p = position + vec3(sin(uTime * (4.0 + aSeed * 3.0) + aSeed * 40.0), abs(sin(uTime * (5.0 + aSeed * 3.0) + aSeed * 40.0)), 0.0) * (0.15 + 0.7 * near);
        vCol = color;
        vK = 0.55 + 0.45 * sin(uTime * (6.0 + aSeed * 5.0) + aSeed * 90.0) + near;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = clamp(uPx * (0.9 + 0.9 * near) / max(-mv.z, 1.0), 2.0, 30.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vCol;
      varying float vK;
      void main() {
        float r = length(gl_PointCoord * 2.0 - 1.0);
        if (r > 1.0) discard;
        gl_FragColor = vec4((vCol * 1.8 + 0.3) * pow(1.0 - r, 1.2) * vK, 1.0);
      }
    `,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  }));
  lights.frustumCulled = false;
  root.add(lights);
  crowd.frustumCulled = false;
  root.add(crowd);
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);

  // --- the districts' lights ---
  const beamGeo = new THREE.CylinderGeometry(1.6, 0.5, 1, 10, 1, true).translate(0, 0.5, 0);
  const beams = [[SEAM, 0xff8a3a], [BELL, 0xffe2a0], [SAT, 0xff6fc4]].map(([d, hex]) => {
    const m = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(0.5), transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    m.position.set(d.x, d.y + 9, d.z);
    m.frustumCulled = false;
    root.add(m);
    return m;
  });
  const _d = new THREE.Vector3(), _aim = new THREE.Vector3(0, 300, 0);

  // --- fireworks ---
  const F_PER = 90, F_N = 6;
  const fSeed = new Float32Array(F_N * F_PER * 3);
  for (let i = 0; i < fSeed.length; i++) fSeed[i] = rnd();
  const fAt = new Float32Array(F_N * F_PER * 3), fCol = new Float32Array(F_N * F_PER * 3), fT0 = new Float32Array(F_N * F_PER).fill(-100);
  const fGeo = new THREE.BufferGeometry();
  fGeo.setAttribute('position', new THREE.BufferAttribute(fAt, 3));
  fGeo.setAttribute('aSeed', new THREE.BufferAttribute(fSeed, 3));
  fGeo.setAttribute('color', new THREE.BufferAttribute(fCol, 3));
  fGeo.setAttribute('aT0', new THREE.BufferAttribute(fT0, 1));
  const fireU = { uTime: { value: 0 }, uPx: { value: 600 } };
  const fire = new THREE.Points(fGeo, new THREE.ShaderMaterial({
    uniforms: fireU,
    vertexShader: /* glsl */ `
      attribute vec3 aSeed;
      attribute vec3 color;
      attribute float aT0;
      uniform float uTime, uPx;
      varying float vK;
      varying vec3 vCol;
      void main() {
        float a = uTime - aT0; // seconds since it went up
        vK = clamp(1.0 - a / 3.4, 0.0, 1.0) * step(0.0, a);
        vCol = color;
        // out in every direction, slowing, and falling a little
        float th = aSeed.x * 6.2832, ph = acos(aSeed.y * 2.0 - 1.0);
        vec3 dir = vec3(sin(ph) * cos(th), cos(ph), sin(ph) * sin(th));
        float out1 = (1.0 - exp(-a * 1.8)) * (34.0 + 26.0 * aSeed.z);
        vec3 p = position + dir * out1 - vec3(0.0, a * a * 3.0, 0.0);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = vK <= 0.0 ? 0.0 : clamp(uPx * (2.4 + 2.4 * aSeed.z) * vK / max(-mv.z, 1.0), 2.0, 70.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying float vK;
      varying vec3 vCol;
      void main() {
        float r = length(gl_PointCoord * 2.0 - 1.0);
        if (r > 1.0 || vK <= 0.0) discard;
        gl_FragColor = vec4((vCol * 1.6 + 0.4) * pow(1.0 - r, 1.5) * vK * 1.6, 1.0);
      }
    `,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  }));
  fire.frustumCulled = false;
  root.add(fire);
  let nextBurst = 0, now = 0;

  return {
    begin() {
      root.visible = true;
      wAge.array.fill(1);
      wAge.needsUpdate = true;
      head.fill(0);
      lastX.fill(1e9);
      fT0.fill(-100);
      fGeo.attributes.aT0.needsUpdate = true;
    },
    end() {
      root.visible = false;
    },
    // racer i is at `pos`: leave a light there if it has come far enough
    wake(i, pos, color) {
      if (i >= RACERS) return;
      const dx = pos.x - lastX[i], dy = pos.y - lastY[i], dz = pos.z - lastZ[i];
      if (dx * dx + dy * dy + dz * dz < WAKE_STEP * WAKE_STEP) return;
      lastX[i] = pos.x;
      lastY[i] = pos.y;
      lastZ[i] = pos.z;
      const o = i * PER + head[i];
      head[i] = (head[i] + 1) % PER;
      wPos.array[o * 3] = pos.x;
      wPos.array[o * 3 + 1] = pos.y;
      wPos.array[o * 3 + 2] = pos.z;
      wCol.array[o * 3] = color.r;
      wCol.array[o * 3 + 1] = color.g;
      wCol.array[o * 3 + 2] = color.b;
      wAge.array[o] = 0;
      wPos.needsUpdate = wCol.needsUpdate = true;
    },
    burst(pos, color) {
      const b = nextBurst;
      nextBurst = (nextBurst + 1) % F_N;
      for (let i = b * F_PER; i < (b + 1) * F_PER; i++) {
        fAt[i * 3] = pos.x;
        fAt[i * 3 + 1] = pos.y;
        fAt[i * 3 + 2] = pos.z;
        fCol[i * 3] = color.r;
        fCol[i * 3 + 1] = color.g;
        fCol[i * 3 + 2] = color.b;
        fT0[i] = now;
      }
      fGeo.attributes.position.needsUpdate = fGeo.attributes.color.needsUpdate = fGeo.attributes.aT0.needsUpdate = true;
    },
    tick(dt, t, leader, px) {
      if (!root.visible) return;
      now = t;
      fireU.uTime.value = t;
      fireU.uPx.value = wakeU.uPx.value = lightU.uPx.value = px;
      lightU.uTime.value = t;
      lightU.uLeader.value.copy(leader);
      const A = wAge.array, k = dt / WAKE_LIFE;
      for (let i = 0; i < N; i++) if (A[i] < 1) A[i] = Math.min(1, A[i] + k);
      wAge.needsUpdate = true;
      // the crowd: on their feet, and off them when the leader is overhead
      for (let i = 0; i < used; i++) {
        const dx = leader.x - cx[i], dz = leader.z - cz[i];
        const near = Math.max(0, 1 - Math.hypot(dx, dz) / 150);
        const hop = Math.abs(Math.sin(t * (5 + cs[i] * 3) + cs[i] * 40)) * (0.06 + 0.5 * near * near);
        _q.setFromAxisAngle(_up, Math.atan2(dx, dz));
        crowd.setMatrixAt(i, _m.compose(_p.set(cx[i], cy[i] + hop, cz[i]), _q, _s.setScalar(0.85 + cs[i] * 0.3)));
      }
      crowd.instanceMatrix.needsUpdate = true;
      // the lights: each district's, held on the leader (it lags a little, as a hand on a lamp does)
      _aim.lerp(leader, Math.min(1, dt * 3));
      for (const b of beams) {
        _d.copy(_aim).sub(b.position);
        const len = _d.length();
        b.quaternion.setFromUnitVectors(_up, _d.multiplyScalar(1 / Math.max(len, 1e-3)));
        b.scale.set(1 + len * 0.005, len, 1 + len * 0.005);
      }
    },
  };
}
