// SEALED: the owner has not played this yet. Do not open.
//
// The ship's back, past the roof (GDD 5.7.7): stages bell7 and bell8.
//
// X8: this is the inside of the exact spinning solution, taken at its word.
// There, past the inner horizon, r is a place again; the end is a ring that
// can be seen and gone round; and nothing that happened before fixes what
// happens next (the inner horizon is where prediction stops). A real hole is
// not thought to have any of this. The lights the ring gives off are ours:
// physics says only that it cannot say what a visible singularity would do.
//
//   bell7   the pilot crossed awake; everything else aboard is in the hull
//           as light. Every band of the lamp (Z), held on a thing from near,
//           brings it back (X7: the rule of the first world, kept). The
//           freighter first; then each captain, on one clock. A captain not
//           looked back in time is spread through the hull for good.
//   bell8   the corner of round cells, and the second decision.

import * as THREE from 'three';
import { C, CH_TIER, HZ_TAU } from '../src/constants.js';
import { Q } from '../src/quality.js';
import { input } from '../src/input.js';
import { cWalk } from '../src/capitalWalk.js';
import { chapterHud } from '../src/chapterHud.js';
import { lampHud } from '../src/lampHud.js';
import { lamp, nextBand, toggleLamp, resetLamp, lampLive } from '../src/lamp.js';
import { tint, box, mergedMesh } from './capital.js';
import { poseRig } from './aliens.js';
import { standRig } from './rigGround.js';
import { buildCaptain, liveCaptain } from './captainDress.js';
import { setHum, setRadio, logChime, bandClick } from './entryzero-audio.js';
import { CAPTAINS } from './chapter-dialogue.js';
import { createSky } from './SEALED-horizon-sky.js';
import { ease, bandIndex, facts, fits, shows, makeSite, cellUniforms, cellMaterial, createFigure, buildFirst, showClocks, COLOURS } from './SEALED-horizon-ship.js';
import { ROOF_TAU } from './SEALED-horizon-helm.js';
import { S7A, S7, S8, S8A, S8B, TONE, D2, HULL, FIRST, AFTER_DEATH } from './SEALED-horizon-words.js';

const HL = 60, HW = 18;
const SPOT = { freighter: [7, 44], lux: [10, 26], vask: [-11, 4], marrow: [8, -20] };
const CORNER = { x: -11, z: -50 };
const HATCH = { x: 7, z: -48 };
const LETTER = { marrow: 'm', lux: 'l', vask: 'v' };
const DRIFT = 5;

const LIGHTS_VERT = /* glsl */ `
  attribute vec4 aSeed;
  uniform float uTime;
  uniform vec3 uRing;
  varying vec4 vSeed;
  void main() {
    // each leaves the ring on its own line and is never seen twice the same way
    float k = fract(aSeed.x + uTime * (0.006 + 0.01 * aSeed.y));
    vec3 side = normalize(cross(uRing, vec3(aSeed.z - 0.5, aSeed.w - 0.5, aSeed.y - 0.5)) + 1e-4);
    vec3 p = uRing * (900.0 * (1.0 - k)) + side * (120.0 + 500.0 * aSeed.z) * (0.25 + k) + vec3(0.0, 30.0 * sin(uTime * 0.1 + aSeed.w * 40.0), 0.0);
    vSeed = aSeed;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = (2.0 + 5.0 * aSeed.w) * (0.5 + k);
    gl_Position = projectionMatrix * mv;
  }
`;
const LIGHTS_FRAG = /* glsl */ `
  varying vec4 vSeed;
  void main() {
    vec2 q = gl_PointCoord - 0.5;
    float r = length(q), a = atan(q.y, q.x);
    float kind = floor(vSeed.y * 8.0);
    float shape = kind < 2.0 ? smoothstep(0.5, 0.0, r) : kind < 4.0 ? smoothstep(0.08, 0.0, abs(r - 0.32)) : kind < 6.0 ? smoothstep(0.5, 0.1, r) * (0.5 + 0.5 * cos(a * (3.0 + kind))) : smoothstep(0.5, 0.0, max(abs(q.x), abs(q.y)) * 1.4);
    vec3 col = 0.55 + 0.45 * cos(6.2832 * (vSeed.x * 3.0 + vec3(0.0, 0.33, 0.67)));
    gl_FragColor = vec4(col * shape * 1.4, 1.0);
  }
`;

export function createHull(ctx) {
  const { chapter, memo } = ctx;
  const time = { value: 0 };
  const group = new THREE.Group();
  group.visible = false;
  ctx.scene.add(group);
  const sky = createSky();
  sky.U.uMode.value = 1;
  group.add(sky.mesh);
  const tier = CH_TIER[Q.tier];

  // the hull: cells, a rail of light down each side, the drive rings aft
  const deckU = cellUniforms(time, -0.45);
  deckU.uDim.value = 0.55;
  const deck = new THREE.Mesh(new THREE.PlaneGeometry(HW * 2, HL * 2).rotateX(-Math.PI / 2), cellMaterial(deckU));
  deck.frustumCulled = false;
  group.add(deck);
  const glow = [];
  for (const s of [-1, 1]) glow.push(tint(box(0.08, 0.08, HL * 2, s * HW, 0.9, 0), 0x7fe6ff, 1.4));
  glow.push(tint(new THREE.TorusGeometry(1.6, 0.07, 6, 36).rotateX(Math.PI / 2).translate(HATCH.x, 0.06, HATCH.z), 0xffe2a0, 1.5));
  for (const z of [HL + 6, HL + 16]) glow.push(tint(new THREE.TorusGeometry(15, 0.5, 8, 48).translate(0, 6, z), 0x7fe6ff, 1.2));
  group.add(mergedMesh(glow, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false })));
  // the corner of round cells
  const cornerMat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false });
  const NC = Math.min(90, Math.round(tier.hzC / 20));
  const corner = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.5, 2), cornerMat, NC);
  const _m = new THREE.Matrix4();
  for (let i = 0; i < NC; i++) {
    const a = i * 2.39996, r = 0.5 + 0.42 * Math.sqrt(i);
    corner.setMatrixAt(i, _m.makeTranslation(CORNER.x + Math.cos(a) * r, 0.45 + 0.9 * ((i * 7) % 5), CORNER.z + Math.sin(a) * r * 0.8));
  }
  group.add(corner);
  const first = buildFirst();
  first.group.position.set(CORNER.x + 3.2, 0, CORNER.z + 3.2);
  first.group.visible = false;
  group.add(first.group);

  // the lights the ring gives off: a cloud of them (seen), and a few that come by close (they matter)
  const NL = tier.hzB;
  const seeds = new Float32Array(NL * 4);
  let sd = 0x9e3779b9;
  const rnd = () => ((sd = (Math.imul(sd, 1664525) + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < NL * 4; i++) seeds[i] = rnd();
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NL * 3), 3));
  lg.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
  const lights = new THREE.Points(lg, new THREE.ShaderMaterial({ uniforms: { uTime: time, uRing: sky.U.uRing }, vertexShader: LIGHTS_VERT, fragmentShader: LIGHTS_FRAG, fog: false, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  lights.frustumCulled = false;
  group.add(lights);
  const drift = [];
  for (let i = 0; i < DRIFT; i++) {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.28, 1), new THREE.MeshBasicMaterial({ color: new THREE.Color().setHSL((i * 0.23) % 1, 0.8, 0.65), fog: false }));
    group.add(m);
    drift.push({ m, cx: [9, -6, 6, -9, 2][i], cz: [34, 14, -8, -30, 40][i], a: 5 + i * 1.3, w: 0.09 + i * 0.023, ph: i * 1.7 });
  }
  // the lamp, carried: its beam
  const beam = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 20, 1, true).rotateX(-Math.PI / 2).translate(0, 0, 0.5), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.12, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }));
  group.add(beam);

  // what is in the hull: the freighter, and each captain
  const things = [];
  function thing(id, c) {
    const [x, z] = SPOT[id];
    const fig = createFigure(COLOURS[id], id === 'freighter' ? Math.round(tier.hzD * 1.2) : tier.hzD, id === 'freighter' ? 1.5 : 2.0, id === 'freighter' ? 6 : 0.85);
    fig.mesh.position.set(x, 0, z);
    group.add(fig.mesh);
    const patch = new THREE.Mesh(new THREE.CircleGeometry(id === 'freighter' ? 3.4 : 1.5, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: COLOURS[id], fog: false }));
    patch.position.set(x, 0.03, z);
    group.add(patch);
    const th = { id, c, x, z, fig, patch, hold: 0, state: 'hull', rig: null, npc: null, real: null, fx: x, fz: z };
    if (c) {
      th.rig = buildCaptain(c.id);
      th.rig.group.position.set(x, 0, z);
      standRig(th.rig, 0);
      th.rig.group.visible = false;
      group.add(th.rig.group);
      th.npc = { x: 1e6, y: 0, z: 1e6, role: 'captain', talk: () => ({ speaker: { name: c.name, species: c.species, cityId: 'The hull' }, lines: HULL.talk[c.id] }) };
    } else {
      // the hangar's hatch, with the freighter's nose in it
      th.real = mergedMesh([tint(box(7, 0.25, 5, x, 0.12, z), 0x24313a), tint(box(2.2, 1.1, 3.6, x, 0.8, z), 0xc9d2da), tint(box(1.2, 0.5, 1.2, x, 1.45, z - 0.6), 0x2b6cb0)], new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x0a0d10 }));
      th.real.visible = false;
      group.add(th.real);
    }
    things.push(th);
    return th;
  }
  thing('freighter', null);
  for (const c of CAPTAINS) thing(c.id, c);
  const firstNpc = { x: 1e6, y: 0, z: 1e6, role: 'captain', h: 2.4, talk: () => ({ speaker: FIRST, lines: HULL.talk.first }) };

  let local = 0, fadeT = 0, timing = false, stolenSaid = false, lastBand = 0, afterDeath = 0;
  let phase = ''; // '' | 'listen' | 'tone' | 'wake'
  let wake = 0, queue = null, queueT = 0, queueI = 0, queueEnd = null;
  let nearSaid = 0;
  const _o = new THREE.Vector3(), _dir = new THREE.Vector3(), _to = new THREE.Vector3();
  const c2 = () => chapter.hz.get('c2');
  const n3 = () => chapter.hz.get('n3');
  const backCount = () => things.filter((t) => t.c && t.state === 'back').length;
  const open = () => things.filter((t) => t.state === 'hull').length;
  const lookTime = () => Math.max(3, C.HZ_D2 - C.HZ_D3 * backCount());

  function show(th) {
    th.fig.mesh.visible = th.state === 'hull';
    th.patch.visible = th.state === 'hull' || th.state === 'lost';
    if (th.rig) th.rig.group.visible = th.state === 'back';
    if (th.real) th.real.visible = th.state === 'back';
    if (th.npc) th.npc.x = th.npc.z = 1e6;
  }
  function bringBack(th) {
    if (th.state !== 'hull') return false;
    th.state = 'back';
    th.hold = 1;
    show(th);
    logChime();
    if (!th.c) {
      chapter.hz.set('n3', '-');
      site.st.say(HULL.freighter);
      if (open() > 0) {
        timing = true;
        fadeT = C.HZ_D6;
        queueSay([HULL.timer], 4);
      } else queueSay([], 6); // (nobody else to look for: a moment, and then the ring)
    } else {
      chapter.hz.set('n3', (n3() || '-') + LETTER[th.id]);
      const lines = [HULL.back[th.id]];
      if (open() > 0) lines.push(HULL.help[th.id]);
      queueSay(lines, 0, { n: Math.max(0, Math.floor(fadeT)) });
    }
    return true;
  }
  function lose(th) {
    th.state = 'lost';
    show(th);
    chapter.hz.lose(th.id);
    queueSay(HULL.lost, 0, { who: th.c.short.charAt(0) + th.c.short.slice(1).toLowerCase(), WHO: th.c.short });
  }
  let queueVars = null;
  function queueSay(lines, wait, vars = null, end = null) {
    queue = lines;
    queueT = wait;
    queueI = 0;
    queueVars = vars;
    queueEnd = end;
  }
  const ringCam = (pos, target, u) => {
    const w = site.st.walker();
    const wx = w ? w.x : 0, wz = w ? w.z : 0;
    const k = ease(0, 10, u);
    pos.set(wx + 5 - 2 * k, 3.2 + 1.5 * k, wz + 9);
    target.set(wx + sky.U.uRing.value.x * 60, 3 + sky.U.uRing.value.y * 60 * (0.4 + 0.6 * k), wz + sky.U.uRing.value.z * 60);
  };
  const cornerCam = (pos, target) => {
    pos.set(CORNER.x + 8, 3.4, CORNER.z + 10);
    target.set(CORNER.x, 1.8, CORNER.z);
  };
  function setCorner() {
    const v = c2();
    cornerMat.color.setRGB(0.5, 1, 0.7).multiplyScalar(v === 'a' && phase !== 'wake' ? 0.06 : v === 'b' ? 2.2 : 0.9);
    const up = v === 'a' && phase !== 'wake';
    first.group.visible = up;
    firstNpc.x = up ? first.group.position.x : 1e6;
    firstNpc.z = up ? first.group.position.z : 1e6;
  }
  function askD2() {
    chapter.hz.offer('c2', 'hz:hull');
    site.st.ask({ speaker: D2.speaker, lines: D2.lines, offer: { kind: 'choice', prompt: D2.prompt, options: D2.options } }, (tag) => {
      setRadio(false, 0);
      if (tag === 'hz:c2:a') {
        chapter.hz.decide('c2', 'a');
        phase = 'wake';
        wake = 0;
        lampHud.show(true, false, HULL.wake);
      } else {
        chapter.hz.decide('c2', 'b');
        phase = '';
        site.st.play(S8B, C.HZ_S8B, { cam: cornerCam, pose: (u) => cornerMat.color.setRGB(0.5, 1, 0.7).multiplyScalar(0.9 + 1.3 * ease(0, 6, u)), onEnd: setCorner });
      }
      setCorner();
      return null;
    });
  }
  function woken() {
    phase = '';
    lampHud.show(true, false, HULL.keys);
    setCorner();
    logChime();
    site.st.play(S8A, C.HZ_S8A, { cam: cornerCam, onEnd: setCorner });
  }
  function useCorner() {
    if (chapter.hz.pending() === 'c2') return askD2(); // (come back to it: it is only asked again)
    site.st.play(S8, C.HZ_S8, {
      cam: cornerCam,
      onEnd() {
        phase = 'listen';
        lampHud.show(true, false, HULL.listen);
      },
    });
  }

  const site = makeSite(ctx, {
    group,
    surfaces: [{ kind: 'rect', cx: 0, cz: 0, ux: 0, uz: 1, hl: HL - 0.6, hw: HW - 0.6, yA: 0, yB: 0 }],
    colliders: [{ x: CORNER.x, z: CORNER.z, r: 3.2, top: Infinity }],
    spawn: new THREE.Vector3(0, 0, 52),
    spawnYaw: Math.PI,
    npcs: [...things.filter((t) => t.npc).map((t) => t.npc), firstNpc],
    consoles: [
      { x: CORNER.x + 2.5, y: 0, z: CORNER.z + 2.5, r: 4.5, prompt: HULL.corner, off: () => !chapter.reached('hz_bell8') || c2() != null || phase !== '', use: () => (useCorner(), null) },
      { x: HATCH.x, y: 0, z: HATCH.z, r: 2.0, prompt: HULL.hatch, off: () => c2() == null || phase !== '', use: () => ((site.portal = 'hz:keel'), null) },
    ],
    light: [[-0.5, 0.6, -0.5], [1.0, 0.97, 0.9], 1.2, [0.35, 0.4, 0.55], 0.55],
    enter() {
      local = 0;
      phase = '';
      queue = null;
      timing = false;
      stolenSaid = false;
      nearSaid = 0;
      chapter.advance('hz_bell7');
      resetLamp(true);
      lamp.canAll = true;
      lastBand = lamp.band;
      input.bandPrev = input.lampToggle = false;
      lampHud.show(true, false, HULL.keys);
      // who is where: by what was saved
      const done = n3() || '', past = chapter.reached('hz_bell8');
      const aboard = chapter.crew(), lostHere = chapter.hz.state().lost;
      for (const th of things) {
        th.hold = 0;
        if (!th.c) th.state = done || past ? 'back' : 'hull';
        else if (lostHere.includes(th.id)) th.state = 'lost';
        else if (!aboard.some((c) => c.id === th.id)) th.state = 'none';
        else th.state = past || done.includes(LETTER[th.id]) ? 'back' : 'hull';
        th.fx = th.x;
        th.fz = th.z;
        if (th.rig) th.rig.group.position.set(th.x, 0, th.z);
        show(th);
      }
      if (things[0].state === 'back' && open() > 0) {
        timing = true;
        fadeT = C.HZ_D6;
      }
      setCorner();
      afterDeath = memo.died ? 1.5 : 0;
      if (!done && !past) site.st.play(S7A, C.HZ_S7A, { cam: (pos, target) => (pos.set(4, 3.2, 58), target.set(SPOT.freighter[0], 0.5, SPOT.freighter[1] - 6)) });
    },
    leave() {
      lampHud.show(false);
      setRadio(false, 0);
    },
    tick(d, t) {
      time.value = t;
      local += d;
      sky.U.uTime.value = t;
      const w = site.st.walker();
      if (w) sky.mesh.position.copy(w);
      setHum(0.15);
      showClocks(HZ_TAU[6] + local, null, false, ROOF_TAU);
      const busy = site.st.busy();
      // --- the lamp, in the hand ---
      if (input.bandPrev) nextBand(-1);
      if (input.lampToggle) toggleLamp();
      input.bandPrev = input.lampToggle = false;
      if (lamp.band !== lastBand) bandClick((lastBand = lamp.band));
      const all = !busy && input.allBands && lampLive();
      lamp.all = all;
      const cp = Math.cos(cWalk.pitch);
      _dir.set(Math.sin(cWalk.yaw) * cp, Math.sin(cWalk.pitch), Math.cos(cWalk.yaw) * cp);
      if (w) _o.set(w.x, w.y + 1.4, w.z);
      beam.visible = lampLive() && !busy;
      beam.position.copy(_o);
      beam.lookAt(_o.x + _dir.x, _o.y + _dir.y, _o.z + _dir.z);
      beam.scale.set(all ? 3.2 : 1.6, all ? 3.2 : 1.6, C.HZ_D1);
      beam.material.opacity = all ? 0.22 : 0.08;
      lampHud.update();

      // --- the lights that come by close: one in the beam takes the look ---
      const solo = chapter.crew().length === 0 ? C.HZ_D8 : 1;
      let stolen = false;
      for (const dr of drift) {
        const a = t * dr.w + dr.ph;
        dr.m.position.set(dr.cx + Math.cos(a) * dr.a * solo, 1.3 + 0.5 * Math.sin(a * 2.3), dr.cz + Math.sin(a * 1.3) * dr.a * solo);
        if (all) {
          _to.subVectors(dr.m.position, _o);
          const r = _to.length();
          if (r < C.HZ_D1 && _to.dot(_dir) / r > 0.992) stolen = true;
        }
      }
      if (stolen && !stolenSaid && !busy) {
        stolenSaid = true;
        site.st.say(HULL.stolen);
      }
      // --- what is in the hull: looked back, or let go ---
      if (timing && !busy) {
        fadeT -= d;
        if (fadeT <= 0) {
          timing = false;
          for (const th of things) if (th.state === 'hull') lose(th);
        } else if (open() === 0) timing = false;
        else if (Math.floor(fadeT) % 30 === 0 && Math.floor(fadeT + d) % 30 !== 0) chapterHud.say(HULL.left.replace('{n}', String(Math.floor(fadeT))), 3);
      }
      const drain = timing ? Math.max(0, (C.HZ_D6 - fadeT - C.HZ_D7) / (C.HZ_D6 - C.HZ_D7)) : 0;
      let walkN = 0;
      for (const th of things) {
        th.fig.U.uTime.value = t;
        if (th.state === 'hull') {
          th.fig.U.uDrain.value = th.c ? drain * 0.9 : 0;
          // (a captain is not looked for until the freighter has shown how)
          const ready = !th.c || things[0].state === 'back';
          _to.set(th.x - _o.x, 1.0 - _o.y, th.z - _o.z);
          const r = _to.length();
          const on = ready && all && !stolen && r < C.HZ_D1 && _to.dot(_dir) / Math.max(r, 1e-3) > Math.cos(C.HZ_D5);
          th.hold = Math.max(0, Math.min(1, th.hold + (on ? d / (th.c ? lookTime() : 5) : -C.HZ_D4 * d)));
          th.fig.U.uHold.value = th.hold;
          if (th.hold >= 1) bringBack(th);
        } else if (th.state === 'back' && th.rig) {
          // back, they keep with the pilot
          const g = th.rig.group.position;
          const slot = ++walkN;
          let moving = false;
          if (w && !busy) {
            const tx = w.x + (slot - 2) * 1.8, tz = w.z + 2.6;
            const dx = tx - g.x, dz = tz - g.z, dist = Math.hypot(dx, dz);
            if (dist > 1.2) {
              const step = Math.min(dist - 1.0, 4.2 * d);
              g.x += (dx / dist) * step;
              g.z += (dz / dist) * step;
              th.rig.group.rotation.y = Math.atan2(dx, dz);
              moving = true;
            }
          }
          poseRig(th.rig, d, t, moving ? 'walk' : 'idle', moving ? 0.5 : 0);
          standRig(th.rig, 0);
          liveCaptain(th.rig, d, t, site.st.speaker === th.id, 0);
          th.npc.x = g.x;
          th.npc.z = g.z;
        }
      }
      // --- everything settled: the ring is looked at ---
      if (chapter.stage() === 'hz_bell7' && !busy && !queue && things[0].state === 'back' && open() === 0) {
        site.st.play(S7, C.HZ_S7, { cam: ringCam, onEnd: () => chapter.advance('hz_bell8') });
      }
      // near one of the lights, once each
      if (!busy && !queue && chapter.reached('hz_bell8') && phase === '' && w && nearSaid < 3) {
        for (const dr of drift) {
          if (Math.hypot(dr.m.position.x - w.x, dr.m.position.z - w.z) < 3) {
            const id = ['marrow', 'vask', 'lux'][nearSaid++];
            site.st.say(HULL.near[id]);
            break;
          }
        }
      }
      // --- the corner ---
      const radio = lamp.band === bandIndex('radio') && lampLive();
      if (phase === 'listen' && radio) {
        phase = 'tone';
        const f = facts(chapter);
        queueSay(TONE.filter((l) => fits(chapter, l, f)), 1.5, null, askD2);
      }
      if (phase === 'tone' || phase === 'listen') setRadio(radio, 0.5 + 0.45 * Math.sin(t * 0.9));
      if (phase === 'wake') {
        _to.set(CORNER.x - _o.x, 1.4 - _o.y, CORNER.z - _o.z);
        const r = _to.length();
        if (all && r < C.HZ_D1 + 4 && _to.dot(_dir) / Math.max(r, 1e-3) > Math.cos(C.HZ_D5 * 1.4)) wake += d / C.HZ_D9;
        cornerMat.color.setRGB(0.5, 1, 0.7).multiplyScalar(0.9 + 2 * wake);
        if (wake >= 1) woken();
      }
      if (first.group.visible) first.head.rotation.y = 0.3 * Math.sin(t * 0.5);
      // lines said one after another, outside a scene
      if (queue && !busy) {
        queueT -= d;
        if (queueT <= 0) {
          let said = false;
          while (queueI < queue.length && !said) {
            const l = queue[queueI++];
            said = shows(chapter, l);
            site.st.say(l, queueVars);
          }
          queueT = 6.5;
          if (queueI >= queue.length && !said) queueT = 0;
          if (queueI >= queue.length) {
            const end = queueEnd;
            queue = queueEnd = null;
            if (end) end();
          }
        }
      }
      if (afterDeath > 0 && (afterDeath -= d) <= 0) {
        site.st.say(AFTER_DEATH[memo.died] || AFTER_DEATH.ring, null, 7);
        memo.died = null;
      }
    },
    info: () => ({
      place: 'hull', stage: chapter.stage(), phase, n3: n3(), c2: c2(), pending: chapter.hz.pending(), fade: timing ? +fadeT.toFixed(1) : -1, wake: +wake.toFixed(2),
      things: things.map((t) => `${t.id}:${t.state}:${t.hold.toFixed(2)}`), lost: chapter.hz.state().lost, first: first.group.visible, lights: NL,
    }),
    dbg: {
      // bring one thing back as the lamp would ('freighter' or a captain's id)
      back(id) {
        const th = things.find((x) => x.id === id);
        return th && !site.st.busy() ? bringBack(th) : false;
      },
      clock: (sec) => (timing ? ((fadeT = sec), true) : false),
      end: () => (chapter.reached('hz_bell8') && c2() == null && phase === '' && !site.st.busy() ? (useCorner(), true) : false),
      tune: () => (phase === 'listen' ? (nextBandTo(bandIndex('radio')), true) : false),
      fill: (v = 1) => (phase === 'wake' ? ((wake = v), true) : false),
      door: () => (c2() != null && phase === '' && !site.st.busy() ? ((site.portal = 'hz:keel'), true) : false),
    },
  });
  function nextBandTo(i) {
    while (lamp.band !== i) nextBand(1);
  }
  return site;
}
