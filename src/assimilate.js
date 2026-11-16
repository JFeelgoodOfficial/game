// Assimilation: what the worldship does to a planet it has been brought to
// (src/tenretni.js owns the story and calls in here; same lazy chunk).
//
// The same things Tenretni did to terra, done by terra to someone else, and
// then one step further: the swarm crosses, the tube goes in, the sea comes
// out, the city takes the surface — and then the planet is taken apart and
// carried home piece by piece, and the worldship is that much bigger.
//
// Like the first event this is a SCRIPT posed from one clock `u`, in seconds.
// The swarm reuses the first event's vertex shader, whose beat times are
// written into it, so this script keeps those times:
//
//   12–26   (ice worlds only) a heat beam; the ice goes to open water
//   27–42   the swarm leaves the worldship for the planet
//   40–56   the tube reaches across; 56 it strikes
//   57–73   the sea runs up the tube; the planet dries outward from the strike
//   60–84   the city takes the surface
//   84–104  the planet comes apart: chunks stream to the worldship as what is
//           left of it shrinks to nothing; 104 it is out of space
//   104–112 the worldship grows
//
// Everything hangs off one anchor at the planet's centre (the planet's own
// group cannot hold it: the planet is scaled away underneath). Both worlds are
// parked for the duration, so the worldship's place in that frame is read
// live but does not move.

import * as THREE from 'three';
import { C } from './constants.js';
import { Q } from './quality.js';
import { addShiftable } from './origin.js';
import { setPlanetDrain, setPlanetScale, setPlanetMelt, removePlanet } from './planet.js';
import { setNavHidden, showNavToast } from './nav.js';
import { showViewToast } from './walkview.js';
import { uiSound } from './sfx.js';
import commonVert from './shaders/tenretni.vert?raw';
import swarmVert from './shaders/tenretniSwarm.vert?raw';
import swarmFrag from './shaders/tenretniSwarm.frag?raw';
import tubeFrag from './shaders/tenretniTube.frag?raw';
import hullVert from './shaders/tenretniHull.vert?raw';
import hullFrag from './shaders/tenretniHull.frag?raw';

const T_STRIKE = 56;
const T_BREAK = 84;
const T_GONE = 104;
const T_END = 112;
const SWARM_COUNT = { low: 4000, medium: 12000, high: 30000, ultra: 30000 };
const RINGS = 14;
const CHUNKS = 420;
const SPAN0 = 0.3; // rad: the city's first patch on the planet

const clamp01 = (x) => Math.min(Math.max(x, 0), 1);
const seg = (u, a, b) => clamp01((u - a) / (b - a));
const ease = (x) => x * x * (3 - 2 * x);

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ctx: { scene, terra, planets, camera, fx, sunWorld, setRumble(r),
//        grow(k, progress) — the worldship is now k times its built size,
//        done(name) — the planet is gone and the growth is finished }
export function createAssimilator(ctx) {
  const { terra, fx } = ctx;
  const Y = new THREE.Vector3(0, 1, 0);
  const anchor = new THREE.Group();
  anchor.visible = false;
  ctx.scene.add(anchor);
  addShiftable(anchor);

  let job = null; // { name, target, u, lastU, k0, k1, dirLocal, rotY }
  const W = new THREE.Vector3(); // worldship centre, anchor frame
  const N = new THREE.Vector3(); // unit, planet -> worldship
  const _a = new THREE.Vector3();
  const _b = new THREE.Vector3();
  const _q = new THREE.Quaternion();
  const _s = new THREE.Vector3();
  const _m = new THREE.Matrix4();

  // --- swarm ---
  const n = SWARM_COUNT[Q.tier] || SWARM_COUNT.medium;
  const r = rng(5150);
  const pos = new Float32Array(n * 3);
  const seed = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const z = r() * 2 - 1, th = r() * Math.PI * 2, k = Math.sqrt(1 - z * z);
    pos.set([k * Math.cos(th), k * Math.sin(th), z], i * 3);
    seed.set([r(), r(), r(), r()], i * 4);
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  sg.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
  const swarmU = {
    uT: { value: 0 },
    uSphere: { value: W },
    uRs: { value: 1 },
    uTerra: { value: new THREE.Vector3() },
    uRt: { value: 1 },
    uCity: { value: new THREE.Vector3() },
    uCitySpan: { value: 1 },
    uScale: { value: 600 },
    uSize: { value: 11 },
    uHdr: { value: C.TENRETNI_HDR },
  };
  const swarm = new THREE.Points(sg, new THREE.ShaderMaterial({
    vertexShader: swarmVert, fragmentShader: swarmFrag, uniforms: swarmU,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  swarm.frustumCulled = false;
  anchor.add(swarm);

  // --- tube ---
  const hullMat = (win) => new THREE.ShaderMaterial({
    vertexShader: hullVert, fragmentShader: hullFrag,
    uniforms: {
      uSun: { value: ctx.sunWorld }, uHdr: { value: C.TENRETNI_HDR }, uWin: { value: win },
      uTime: { value: 0 }, uGrow: { value: 1 },
    },
  });
  const tunnel = new THREE.Group();
  anchor.add(tunnel);
  const tubeU = { uTime: { value: 0 }, uLen: { value: 1 }, uFlow: { value: 0 }, uAlpha: { value: 1 } };
  const shell = new THREE.Mesh(
    new THREE.CylinderGeometry(1, 1, 1, 40, 1, true).translate(0, 0.5, 0),
    new THREE.ShaderMaterial({
      vertexShader: commonVert, fragmentShader: tubeFrag, uniforms: tubeU,
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
    })
  );
  shell.frustumCulled = false;
  tunnel.add(shell);
  const ringGeo = new THREE.TorusGeometry(1.14, 0.11, 8, 36).rotateX(Math.PI / 2);
  ringGeo.setAttribute('aRad', new THREE.InstancedBufferAttribute(new Float32Array(RINGS), 1));
  const ringMat = hullMat(0.09);
  const rings = new THREE.InstancedMesh(ringGeo, ringMat, RINGS);
  rings.frustumCulled = false;
  tunnel.add(rings);

  // --- heat beam (ice worlds) ---
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(1, 0.55, 1, 20, 1, true).translate(0, 0.5, 0),
    new THREE.MeshBasicMaterial({
      color: 0xffa040, transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
      depthWrite: false, side: THREE.DoubleSide,
    })
  );
  beam.frustumCulled = false;
  anchor.add(beam);

  // --- chunks: the planet, in pieces, on its way to the worldship ---
  const chunkGeo = new THREE.IcosahedronGeometry(1, 0);
  chunkGeo.setAttribute('aRad', new THREE.InstancedBufferAttribute(new Float32Array(CHUNKS), 1));
  const chunkMat = hullMat(0.02);
  const chunks = new THREE.InstancedMesh(chunkGeo, chunkMat, CHUNKS);
  chunks.frustumCulled = false;
  anchor.add(chunks);
  const cr = rng(8080);
  const chunkData = new Float32Array(CHUNKS * 8); // dir xyz, r01, size, depart, travel, spin
  for (let i = 0; i < CHUNKS; i++) {
    const z = cr() * 2 - 1, th = cr() * Math.PI * 2, k = Math.sqrt(1 - z * z);
    chunkData.set([
      k * Math.cos(th), k * Math.sin(th), z,
      0.3 + 0.7 * cr(), 0.035 + 0.09 * cr() * cr(),
      T_BREAK + 1 + 15 * cr(), 4.5 + 2.5 * cr(), cr() * 6.28,
    ], i * 8);
  }

  const planetScaleAt = (u) => 1 - 0.97 * ease(seg(u, T_BREAK, T_GONE));

  function frame() {
    const p = job.target;
    anchor.position.copy(p.group.position);
    W.subVectors(terra.group.position, p.group.position);
    N.copy(W).normalize();
  }

  function pose(u) {
    const p = job.target;
    const Rt = p.baseRadius ?? p.radius;
    const Rw = terra.radius;
    const sP = planetScaleAt(u);

    // heat
    const melt = job.ice ? ease(seg(u, 12, 26)) : 0;
    if (job.ice) setPlanetMelt(p, melt);
    const heat = job.ice ? Math.sin(Math.PI * seg(u, 12, 28)) : 0;
    beam.visible = heat > 0.01;
    if (beam.visible) {
      const len = Math.max(W.length() - Rw - Rt, 1);
      beam.position.copy(W).addScaledVector(N, -Rw * 0.98);
      beam.quaternion.setFromUnitVectors(Y, _a.copy(N).negate());
      const w = 260 * (0.85 + 0.15 * Math.sin(u * 23));
      beam.scale.set(w, len, w);
      beam.material.opacity = 0.5 * heat;
    }

    // swarm
    swarm.visible = u > 27 && u < 86;
    swarmU.uT.value = u;
    swarmU.uRs.value = Rw;
    swarmU.uRt.value = Rt;
    swarmU.uCity.value.copy(N).multiplyScalar(Rt);
    swarmU.uCitySpan.value = SPAN0 * Rt;

    // tube: from the worldship's hull to the strike point facing it
    const ext = Math.pow(seg(u, 40, T_STRIKE), 1.6);
    const gone = seg(u, T_BREAK, T_BREAK + 4);
    const L = Math.max(W.length() - Rw * 0.97 - Rt, 1);
    const len = L * ext;
    const rad = C.TENRETNI_TUNNEL_RADIUS * 1.3;
    tunnel.visible = ext > 0 && gone < 1;
    tunnel.position.copy(W).addScaledVector(N, -Rw * 0.97);
    tunnel.quaternion.setFromUnitVectors(Y, _a.copy(N).negate());
    shell.scale.set(rad, Math.max(len, 0.01), rad);
    tubeU.uLen.value = len;
    tubeU.uAlpha.value = 1 - gone;
    tubeU.uFlow.value = ease(seg(u, T_STRIKE + 0.5, 59)) * (1 - ease(seg(u, 72, 75)));
    for (let i = 0; i < RINGS; i++) {
      const y = ((i + 0.5) / RINGS) * L;
      if (y < len && y < L * (1 - gone)) _m.compose(_a.set(0, y, 0), _q.identity(), _s.set(rad, rad, rad));
      else _m.makeScale(0, 0, 0);
      rings.setMatrixAt(i, _m);
    }
    rings.instanceMatrix.needsUpdate = true;

    // the planet: drained, built over, then scaled away
    const drain = u >= T_STRIKE ? ease(seg(u, 57, 73)) : 0;
    const tech = u >= T_STRIKE ? ease(seg(u, 60, 72)) : 0;
    const span = SPAN0 + (Math.PI - SPAN0) * ease(seg(u, 66, T_BREAK));
    setPlanetDrain(p.cfg.name, drain, job.dirLocal, tech, span);
    if (!p.removed) setPlanetScale(p, sP);

    // chunks
    const on = u > T_BREAK && u < T_GONE + 8;
    chunks.visible = on;
    if (on) {
      for (let i = 0; i < CHUNKS; i++) {
        const o = i * 8;
        const a = (u - chunkData[o + 5]) / chunkData[o + 6];
        if (a <= 0 || a >= 1) {
          _m.makeScale(0, 0, 0);
        } else {
          const k = a * a * (3 - 2 * a);
          // from where that piece of the planet was when it let go...
          const r0 = Rt * chunkData[o + 3] * planetScaleAt(chunkData[o + 5]);
          _a.set(chunkData[o], chunkData[o + 1], chunkData[o + 2]);
          _b.copy(_a).multiplyScalar(r0);
          // ...to the worldship's near face, bowing out on the way
          _b.lerp(_s.copy(W).addScaledVector(N, -Rw * 0.9).addScaledVector(_a, Rw * 0.25), k);
          _b.addScaledVector(_a, 500 * Math.sin(Math.PI * k));
          const size = Rt * chunkData[o + 4] * (1 - k * k * 0.85);
          _q.setFromAxisAngle(_a, chunkData[o + 7] + u * 0.6);
          _m.compose(_b, _q, _s.set(size, size * 0.8, size * 1.15));
        }
        chunks.setMatrixAt(i, _m);
      }
      chunks.instanceMatrix.needsUpdate = true;
    }

    // out of space, and the worldship grows
    if (u >= T_GONE && !p.removed) {
      removePlanet(p, true);
      setNavHidden(p.group.position, true);
    }
    const g = ease(seg(u, T_GONE, T_END));
    ctx.grow(job.k0 + (job.k1 - job.k0) * g, g);
  }

  function beats(u0, u1, flying) {
    const hit = (t) => u0 < t && u1 >= t;
    const nm = job.target.cfg.name.toUpperCase();
    if (hit(13) && job.ice && flying) showViewToast(`${nm} — SURFACE TEMPERATURE RISING`, 6);
    if (hit(27)) fx.kick = 0.4;
    if (hit(T_STRIKE)) {
      fx.kick = 1;
      fx.flash = 0.5;
      uiSound('impact');
    }
    if (hit(58) && flying) showViewToast(`${nm} — OCEAN LEVEL FALLING`, 6);
    if (hit(T_BREAK)) {
      fx.kick = 0.9;
      uiSound('impact');
      if (flying) showViewToast(`${nm} — CRUST FAILING`, 6);
    }
    if (hit(T_GONE)) {
      fx.kick = 0.7;
      if (flying) showNavToast(`${nm} HAS BEEN ASSIMILATED`, 7);
    }
  }

  function rumbleAt(u) {
    return clamp01(
      0.3 * Math.sin(Math.PI * seg(u, 12, 28)) * (job.ice ? 1 : 0) +
      0.45 * seg(u, 40, T_STRIKE) * (1 - seg(u, 73, 76)) +
      0.6 * Math.sin(Math.PI * seg(u, T_BREAK, T_GONE)) +
      0.4 * Math.sin(Math.PI * seg(u, T_GONE, T_END))
    );
  }

  function end() {
    const name = job.target.cfg.name;
    anchor.visible = false;
    ctx.setRumble(0);
    job = null;
    ctx.done(name);
  }

  return {
    active: () => !!job,
    target: () => (job ? job.target.cfg.name : null),
    // Begin on `name`. k0 -> k1: the worldship's size before and after.
    start(name, k0, k1) {
      const target = ctx.planets.find((q) => q.cfg.name === name);
      if (!target || job) return false;
      // hold the planet still: the strike point must stay under the tube
      target.spinLock = target.surface.rotation.y;
      const ice = !!target.cfg.frozenSea;
      job = { name, target, u: ice ? 11 : 26, lastU: 0, k0, k1, ice, dirLocal: new THREE.Vector3() };
      job.lastU = job.u;
      frame();
      job.dirLocal.copy(N).applyAxisAngle(Y, -target.surface.rotation.y);
      anchor.visible = true;
      return true;
    },
    update(delta, t, flying) {
      if (!job) return;
      frame();
      tubeU.uTime.value = t;
      ringMat.uniforms.uTime.value = t;
      chunkMat.uniforms.uTime.value = t;
      swarmU.uScale.value = (window.innerHeight * Q.pixelRatio * 0.5) / Math.tan((ctx.camera.fov * Math.PI) / 360);
      job.u = Math.min(job.u + delta, T_END);
      pose(job.u);
      beats(job.lastU, job.u, flying);
      ctx.setRumble(rumbleAt(job.u));
      job.lastU = job.u;
      if (job.u >= T_END) end();
    },
    // Jump to the end (world reset, reload mid-way): the planet is gone.
    finishNow() {
      if (!job) return;
      frame();
      job.u = T_END;
      pose(T_END);
      end();
    },
    seek(u) {
      if (job) job.u = job.lastU = u;
    },
    state: () => (job ? { name: job.name, u: job.u } : null),
  };
}
