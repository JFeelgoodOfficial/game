// SEALED: the owner has not played this yet. Do not open.
//
// Season 1, chapter 13: in to the core, and out again before the pair merges.
//
// The vessel of Entry Zero, flown in four parts, each one captain's to call
// (and whoever is aboard's, if that captain is not):
//
//   the lines   (Marrow sees.) Three ranks of the rival's fleet across the
//               way in. A forecast repeats, and where it repeats there is a
//               gap. The vessel is carried forward; it is steered through
//               each gap. Anywhere else on the rank is ships.
//   the waves   (Vask counts.) The pair turns many times a second now, and
//               the waves come at a count that shortens. Between the lines
//               and the core stand four struts. The vessel has to be in the
//               lee of one when each wave goes through.
//   the core    The season's last choice: DESTROY IT, or FEED IT THE ARCHIVE.
//               Then the vessel holds by the core until it is done.
//   the run     (Lux knows when.) Out the way it came, with the merger on a
//               clock and the last waves throwing the hull about.
//
// Lost at the lines or the waves, the part is flown again from its start.
// Lost after the choice, the choice is unmade and the core asks again
// (src/season.js). The merger happens either way (src/fixedEvents.js `merger`).
//
// A site for the platform walker (src/capitalWalk.js), walked under the pause
// (look `dive`), reached by `en:core` and left by `en:dock`. `S` is the
// system's story (world/SEALED-engine-ship.js).

import * as THREE from 'three';
import { C } from '../src/constants.js';
import { sun } from '../src/sun.js';
import { openDialogue, isDialogueOpen } from '../src/dialogue.js';
import { chapterHud } from '../src/chapterHud.js';
import { lampHud } from '../src/lampHud.js';
import { lamp, LAMP_U, LAMP_GLSL, stepLamp } from '../src/lamp.js';
import { setMusicArea } from '../src/music.js';
import { uiSound, setEventRumble } from '../src/sfx.js';
import { mulberry32 } from '../src/noise2.js';
import { floorOf } from './capital.js';
import { setHum, setRoar, logChime, hush } from './entryzero-audio.js';
import { createSceneClock, crewSay } from './sceneClock.js';
import { buildBinary, createVessel, strain, EN_KEY } from './SEALED-engine-ship.js';
import { ENW } from './SEALED-engine-words.js';

const ZERO = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const GAPS = [[-120, -70], [95, 105], [0, 0]]; // where each rank leaves its gap (x, y)
const N_LINES = GAPS.length, N_STRUTS = 4;
const ease = (a, b, x) => {
  const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};
const mmss = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

const VERT = /* glsl */ `
  varying vec3 vW;
  varying vec3 vN;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vW = w.xyz;
    vN = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;
// A strut of the engine: dark, lit where the beam is on it, and along one edge by the pair.
const STRUT_FRAG = /* glsl */ `
  ${LAMP_GLSL}
  varying vec3 vW;
  varying vec3 vN;
  void main() {
    vec3 n = normalize(vN);
    float rib = step(0.9, fract(vW.y / 22.0));
    vec3 metal = vec3(0.26, 0.28, 0.33) * (1.0 - 0.4 * rib);
    vec3 col = metal * 0.03 + metal * uLampTint * lampBeam(vW) * uLampOn * uLampLit * 1.3;
    col += vec3(1.0, 0.6, 0.35) * max(-n.z, 0.0) * 0.16; // the side toward the pair
    gl_FragColor = vec4(col, 1.0);
  }
`;
// The core: what all of it is wiring for.
const CORE_FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uAct;
  uniform float uKind;
  varying vec3 vW;
  varying vec3 vN;
  void main() {
    vec3 n = normalize(vN);
    vec3 v = normalize(cameraPosition - vW);
    float rim = pow(1.0 - abs(dot(n, v)), 2.0);
    float cell = step(0.5, fract(sin(dot(floor(vW.xy / 9.0), vec2(127.1, 311.7))) * 43758.5 + uTime * 0.6));
    vec3 cold = vec3(0.5, 0.75, 1.0), lance = vec3(1.0, 0.3, 0.15), fed = vec3(1.0, 0.85, 0.5);
    vec3 col = cold * (0.25 + 0.5 * cell) + cold * rim;
    col = mix(col, mix(lance, fed, uKind) * (0.6 + 0.8 * cell + rim), uAct);
    gl_FragColor = vec4(col, 1.0);
  }
`;

export function createEngineCore(ctx, S) {
  const { chapter, season, fixed } = ctx;
  const group = new THREE.Group();
  group.visible = false;
  ctx.scene.add(group);
  const time = { value: 0 };
  const world = new THREE.Group(); // what the waves strain
  group.add(world);
  const LINE_Z = (i) => -C.EN_G2 * (i + 1);
  const Z0 = LINE_Z(N_LINES - 1); // behind the last rank
  const STRUT = (j) => new THREE.Vector3(j % 2 ? 130 : -130, 0, Z0 - C.EN_W4 * (j + 1));
  const CORE = new THREE.Vector3(0, 0, Z0 - C.EN_W4 * (N_STRUTS + 1));
  const LEE = (j) => STRUT(j).add(new THREE.Vector3(0, 0, 46)); // the pair is beyond the core: the lee is the near side

  // --- the three ranks: ships across the way, but for the gap ---
  const PER = 150;
  const dart = new THREE.ConeGeometry(5, 26, 5).rotateX(Math.PI / 2);
  const rank = new THREE.InstancedMesh(dart, new THREE.MeshBasicMaterial({ color: new THREE.Color(0.6, 0.64, 0.7), fog: false }), PER * N_LINES);
  rank.frustumCulled = false;
  world.add(rank);
  const ships = [];
  {
    const rng = mulberry32(0xe261);
    for (let i = 0; i < N_LINES; i++) {
      let n = 0;
      for (let gx = -6; gx <= 6 && n < PER; gx++) for (let gy = -5; gy <= 5 && n < PER; gy++) {
        const x = gx * 62 + (rng() - 0.5) * 22, y = gy * 56 + (rng() - 0.5) * 22;
        if (Math.hypot(x - GAPS[i][0], y - GAPS[i][1]) < C.EN_G1 * 1.5) continue; // (the gap, and a little margin round it)
        ships.push({ i, x, y, ph: rng() * 6 });
        n++;
      }
    }
  }
  const gapRings = GAPS.map(([x, y], i) => {
    const m = new THREE.Mesh(new THREE.TorusGeometry(C.EN_G1, 1.6, 8, 40), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.3, 0.6), fog: false }));
    m.position.set(x, y, LINE_Z(i));
    world.add(m);
    return m;
  });
  // --- the struts, the core, the fleet beyond, the pair beyond that ---
  const strutMat = new THREE.ShaderMaterial({ uniforms: LAMP_U, vertexShader: VERT, fragmentShader: STRUT_FRAG, fog: false });
  for (let j = 0; j < N_STRUTS; j++) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(70, 900, 50), strutMat);
    m.position.copy(STRUT(j));
    m.frustumCulled = false;
    world.add(m);
  }
  const leeMarks = Array.from({ length: N_STRUTS }, (_, j) => {
    const m = new THREE.Mesh(new THREE.TorusGeometry(C.EN_W3, 1.2, 6, 36).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 1.3, 1.0), fog: false }));
    m.position.copy(LEE(j));
    world.add(m);
    return m;
  });
  const coreU = { uTime: time, uAct: { value: 0 }, uKind: { value: 0 } };
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(70, 2), new THREE.ShaderMaterial({ uniforms: coreU, vertexShader: VERT, fragmentShader: CORE_FRAG, fog: false }));
  core.position.copy(CORE);
  world.add(core);
  const pair = buildBinary({ r: 300, sep: 700, engine: false });
  pair.group.position.set(0, 200, CORE.z - 2600);
  pair.group.rotation.x = 0.35;
  world.add(pair.group);
  {
    // the rest of their fleet, holding its lines round the core
    const rng = mulberry32(0xf1ee7);
    const far = new THREE.InstancedMesh(dart, new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 0.43, 0.5), fog: false }), 260);
    const m = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1);
    for (let i = 0; i < 260; i++) {
      const a = rng() * Math.PI * 2, r = 600 + rng() * 1400;
      far.setMatrixAt(i, m.compose(p.set(Math.cos(a) * r, (rng() - 0.5) * 900, CORE.z + 300 + rng() * 1800), q, s));
    }
    far.frustumCulled = false;
    world.add(far);
  }
  const v = createVessel(group);

  // --- state ---
  let inside = false, prev = null, scene = null, panelText = null;
  let part = 'idle'; // 'lines' | 'waves' | 'core' | 'act' | 'run'
  let line = 0, called = -1, strutAt = -1, waveT = 0, gap = 0, saidCount = false, hopSaid = -1;
  let asking = false, askT = 0, act = 0, runT = 0, saidEarly = 0, saidCore = false, flash = 0, P = 2.2, outcome = null;
  const later = [];
  const _ext = new THREE.Vector3(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);
  const say = (l, sec) => crewSay(chapter, l, sec);
  const decision = () => season.get(EN_KEY);

  function placeRanks(t) {
    ships.forEach((sh, n) => {
      const gone = sh.i < line; // (a rank that is behind the vessel is not drawn)
      _p.set(sh.x + 5 * Math.sin(t * 0.9 + sh.ph), sh.y + 5 * Math.cos(t * 0.8 + sh.ph), gone ? 9e5 : LINE_Z(sh.i));
      rank.setMatrixAt(n, _m.compose(_p, _q, _s));
    });
    for (let n = ships.length; n < PER * N_LINES; n++) rank.setMatrixAt(n, _m.compose(_p.set(0, 0, 9e5), _q, _s));
    rank.instanceMatrix.needsUpdate = true;
    gapRings.forEach((g, i) => (g.visible = part === 'lines' && i === line));
    leeMarks.forEach((g, j) => (g.visible = part === 'waves' && j === strutAt + 1));
  }
  // where a part begins
  function startLines() {
    part = 'lines';
    line = Math.min(S.k2(), N_LINES - 1);
    called = -1;
    v.at.set(0, 0, LINE_Z(line) + C.EN_G2 * 0.92);
    v.vel.set(0, 0, 0);
    v.yaw = Math.PI;
    v.pitch = 0;
  }
  function startWaves(from = -1) {
    part = 'waves';
    line = N_LINES;
    strutAt = from;
    gap = C.EN_W1 * Math.pow(C.EN_W2, Math.max(0, from + 1));
    waveT = gap;
    if (from < 0) v.at.set(0, 0, Z0 - 60);
    else v.at.copy(LEE(from));
    v.vel.set(0, 0, 0);
    v.yaw = Math.PI;
    v.pitch = 0;
    if (!saidCount) {
      saidCount = true;
      later.push({ text: ENW.countHint, sec: 9 }, ENW.countCall);
    }
  }
  function startCore() {
    part = 'core';
    line = N_LINES;
    strutAt = N_STRUTS - 1;
    v.at.copy(CORE).z += 150;
    v.vel.set(0, 0, 0);
    v.yaw = Math.PI;
    v.pitch = 0;
    askT = 6;
    act = 0;
    runT = 0;
    coreU.uAct.value = 0;
    if (!saidCore) {
      saidCore = true;
      later.push(...ENW.coreArrive);
    }
  }
  // lost: a flash, and the part again
  function lost(cause) {
    flash = 1;
    uiSound('impact');
    chapterHud.say(ENW.death[cause], 7);
    if (part === 'lines') startLines();
    else if (part === 'waves') startWaves(strutAt);
    else {
      // after the choice: it is unmade, and the core asks again
      unmake();
      startCore();
    }
  }
  function unmake() {
    if (S.b() !== 'ex_4') return false;
    season.die();
    S.revertB('ex_3');
    setRoar(0);
    return true;
  }

  // --- the scenes ---
  function begin(kind, clock) {
    scene = { kind, clock };
    chapterHud.panel((panelText = null));
    chapterHud.cine(true);
    v.vel.set(0, 0, 0);
    clock.begin();
  }
  const openClock = createSceneClock({
    T: C.EN_S4, lines: ENW.open, say: (l) => say(l, 6),
    pose(u) {
      v.at.set(0, 40 - u * 2, C.EN_G2 * 0.9 - u * 14);
      v.yaw = Math.PI;
      v.pitch = -0.03;
    },
    onEnd() {
      scene = null;
      chapterHud.cine(false);
      startLines();
      later.push({ text: ENW.gateHint, sec: 8 });
    },
  });
  let endClock = null;
  function beginEnd() {
    const c = decision() === 'fed' ? 'fed' : 'destroyed';
    const fate = S.ione(c);
    const io = !S.envoy() ? 'none' : fate === 'aboard' ? (c === 'fed' ? 'aboardFed' : 'aboardDestroyed') : fate;
    outcome = { core: c, how: c === 'fed' ? 'curious' : 'blind', ione: fate, line: io };
    const lines = [...ENW.end.open, ...ENW.end[c], ENW.end.ione[io], ...ENW.end.close].sort((x, y) => x[0] - y[0]);
    const from = v.at.clone();
    part = 'end';
    endClock = createSceneClock({
      T: C.EN_S5, lines, say: (l) => say(l, 7),
      pose(u) {
        // carried on out, looking back at it
        v.at.copy(from).z += u * 30;
        v.look(_p.copy(pair.group.position).multiplyScalar(1));
        const merged = ease(1.5, 5, u);
        pair.pose(u * 40, 0.12 * (1 - merged), 0, merged);
        world.scale.set(1 + 0.12 * Math.sin(merged * Math.PI), 1 - 0.12 * Math.sin(merged * Math.PI), 1);
        chapterHud.white(0.7 * Math.sin(Math.min(1, ease(3.6, 6.5, u)) * Math.PI));
        coreU.uAct.value = c === 'fed' ? 1 : 1 - ease(4, 9, u);
        core.visible = c === 'fed' || u < 9;
        setRoar(1 - ease(5, 12, u));
        setEventRumble(0.9 * (1 - ease(5, 14, u)));
      },
      onEnd() {
        scene = null;
        chapterHud.cine(false);
        chapterHud.white(0);
        setRoar(0);
        setEventRumble(0);
        fixed.resolve('merger', outcome.how, { core: outcome.core, ione: outcome.ione });
        season.set('ch13.ione', outcome.ione);
        season.survive(EN_KEY); // lived through: it stays made
        S.advB('ex_5');
        site.portal = 'en:dock';
      },
    });
    begin('end', endClock);
  }

  // --- the choice ---
  function ask() {
    if (asking || isDialogueOpen() || scene || S.b() !== 'ex_3') return;
    asking = true;
    season.offer(EN_KEY, 'en:core', { stage: 'ex_3' }); // the checkpoint, as the decision is shown
    const crew = chapter.crew();
    const sides = ENW.ask.sides.filter((s) => crew.some((c) => c.id === s.by)).map((s) => `${crew.find((c) => c.id === s.by).short} — ${s.text}`);
    if (S.envoy()) sides.push(ENW.ask.envoy);
    openDialogue({
      speaker: ENW.core, cine: { kind: 'comm', from: ENW.ask.from }, lines: [...ENW.ask.lines, ...sides],
      offer: { kind: 'choice', prompt: ENW.ask.prompt, options: [{ label: ENW.ask.destroy, outcomeTag: 'en:destroy' }, { label: ENW.ask.feed, outcomeTag: 'en:feed' }] },
    }, {
      onOffer: (offer) => {
        const option = offer.outcomeTag === 'en:destroy' ? 'destroyed' : offer.outcomeTag === 'en:feed' ? 'fed' : null;
        if (!option || !decide(option)) return null;
        return { speaker: ENW.core, cine: { kind: 'comm', from: ENW.ask.from }, lines: ENW.chose[option] };
      },
      onClose: () => {
        asking = false;
        askT = 7; // unanswered: asked again
      },
    });
  }
  function decide(option) {
    if (S.b() !== 'ex_3' || (option !== 'destroyed' && option !== 'fed')) return false;
    season.offer(EN_KEY, 'en:core', { stage: 'ex_3' });
    season.decide(EN_KEY, option);
    S.advB('ex_4');
    part = 'act';
    act = 0;
    saidEarly = 0;
    coreU.uKind.value = option === 'fed' ? 1 : 0;
    uiSound('engage');
    later.push({ text: ENW.actHint, sec: 8 });
    return true;
  }
  function settle() {
    const b = S.b();
    outcome = null;
    coreU.uAct.value = 0;
    core.visible = true;
    saidCount = saidCore = false;
    if (b === 'ex_1') startLines();
    else if (b === 'ex_2') startWaves(-1);
    else if (b === 'ex_3') startCore();
    else part = 'idle';
  }

  const surfaces = [{ kind: 'disc', cx: 0, cz: 0, r: 1.2, y: 0 }];
  const site = {
    group,
    planet: { group: { position: ZERO }, sunDir: UP },
    noShip: true,
    hidePilot: true,
    exit: { x: 0, z: 0 },
    leaveHint: ENW.hud.back,
    surfaces,
    colliders: [],
    floorYAt: floorOf(surfaces, 1.2),
    snap: 1.2,
    pad: new THREE.Vector3(),
    spawn: new THREE.Vector3(),
    spawnYaw: 0,
    npcs: [],
    consoles: [],
    onChoice: () => null,
    portal: null,
    held: () => true,
    act() {
      if (scene) scene.clock.skip();
    },
    heldPrompt: () => (scene ? ENW.skip : null),
    camera: (pos, target) => v.camera(pos, target),
    setWalker() {},
    onEnter() {
      if (inside) return;
      inside = true;
      site.portal = null;
      group.visible = true;
      prev = { fog: ctx.scene.fog, lightI: sun.light.intensity, ambI: sun.ambient.intensity, lampPower: lamp.power, lampMedium: lamp.medium, lampCanAll: lamp.canAll, lampOn: lamp.on, lampBand: lamp.band };
      ctx.scene.fog = null;
      sun.light.intensity = 0;
      sun.ambient.intensity = 0;
      if (ctx.hideFleet) ctx.hideFleet();
      v.board(C.EN_L1, false);
      lampHud.show(true, true, ENW.keys);
      chapterHud.racing(true);
      scene = null;
      later.length = 0;
      panelText = null;
      asking = false;
      flash = 0;
      called = hopSaid = -1;
      settle();
      if (S.b() === 'ex_1' && S.k2() === 0) begin('open', openClock);
    },
    onLeave() {
      setMusicArea(1);
      if (!inside) return;
      inside = false;
      unmake(); // (left with the choice not lived through: it is to be made again)
      if (scene) {
        scene.clock.stop();
        scene = null;
      }
      group.visible = false;
      lampHud.show(false);
      chapterHud.racing(false);
      hush();
      setEventRumble(0);
      chapterHud.clear();
      chapterHud.white(0);
      chapterHud.panel(null);
      panelText = null;
      world.scale.set(1, 1, 1);
      part = 'idle';
      lamp.power = prev.lampPower;
      lamp.medium = prev.lampMedium;
      lamp.canAll = prev.lampCanAll;
      lamp.on = prev.lampOn;
      lamp.band = prev.lampBand;
      stepLamp(0, false);
      ctx.scene.fog = prev.fog;
      sun.light.intensity = prev.lightI;
      sun.ambient.intensity = prev.ambI;
      prev = null;
    },
    inside: () => inside,
    tick(dt, t) {
      if (inside) setMusicArea(0);
      chapterHud.tick(dt);
      time.value = t;
      const d = Math.min(dt, 0.1);
      const shown = !!scene; // (a frame that began in a scene ends in it)
      if (flash > 0) {
        flash = Math.max(0, flash - d * 1.4);
        chapterHud.white(flash * 0.8);
      }
      const k = v.helm(!shown && !isDialogueOpen());
      if (scene) scene.clock.tick(d);
      if (shown) {
        v.place(false);
        placeRanks(t);
        lampHud.update();
        return;
      }
      // the pair, many turns a second, and nearer by the minute
      const closing = part === 'run' ? 1 - runT / C.EN_C2 : 1;
      P = part === 'run' ? 0.5 + 1.7 * closing : 2.2;
      const h = strain(t, P) * C.EN_P2 * (part === 'run' ? 1.6 : 1);
      world.scale.set(1 + h, 1 - h, 1);
      pair.pose((t / P) * Math.PI * 2, 0.2 + 0.5 * closing, h);
      const talk = isDialogueOpen();
      if (later.length && !talk && chapterHud.state().line == null) {
        const l = later.shift();
        if (l && l.by !== undefined) say(l, 6);
        else if (l) chapterHud.say(l.text, l.sec || 7);
      }
      const rows = [];
      if (part === 'lines' && !talk) {
        // carried forward at the fleet's own pace; only the way across is the pilot's
        if (called < line) {
          called = line;
          later.push(ENW.gateCall[line]);
        }
        const z1 = LINE_Z(line);
        for (let rem = d; rem > 1e-5; rem -= 1 / 60) {
          const hh = Math.min(rem, 1 / 60);
          v.yaw = Math.PI;
          v.avY = 0;
          v.step(hh, { fwd: 0, strafe: k.strafe, lift: k.lift }, null);
          v.at.z -= C.EN_G3 * hh;
        }
        v.at.x = Math.max(-360, Math.min(360, v.at.x));
        v.at.y = Math.max(-280, Math.min(280, v.at.y));
        if (v.at.z <= z1) {
          if (Math.hypot(v.at.x - GAPS[line][0], v.at.y - GAPS[line][1]) > C.EN_G1) lost('wall');
          else {
            line++;
            S.passed(line);
            logChime();
            if (line >= N_LINES) {
              S.advB('ex_2');
              startWaves(-1);
            }
          }
        }
        if (part === 'lines') rows.push(`${ENW.hud.gate}${line + 1} / ${N_LINES}`);
      } else if (part === 'waves' && !talk) {
        for (let rem = d; rem > 1e-5; rem -= 1 / 60) v.step(Math.min(rem, 1 / 60), k, null);
        v.at.x = Math.max(-420, Math.min(420, v.at.x));
        v.at.y = Math.max(-300, Math.min(300, v.at.y));
        v.at.z = Math.min(Z0 - 20, Math.max(CORE.z + 90, v.at.z));
        // which strut's lee is the vessel in, if any
        let lee = -1;
        for (let j = 0; j < N_STRUTS; j++) if (v.at.distanceTo(LEE(j)) < C.EN_W3) lee = j;
        if (lee > strutAt) {
          strutAt = lee;
          if (hopSaid < lee) {
            hopSaid = lee;
            chapterHud.say(ENW.countGo[Math.min(lee, ENW.countGo.length - 1)], 5);
          }
        }
        waveT -= d;
        if (waveT <= 0) {
          // a wave: everything in the open is thrown
          setEventRumble(0.9);
          if (lee < 0) lost('wave');
          else {
            gap *= C.EN_W2;
            waveT = gap;
          }
        } else setEventRumble(Math.max(0, 0.5 - waveT * 0.25));
        if (part === 'waves' && v.at.distanceTo(CORE) < 190) {
          S.advB('ex_3');
          setEventRumble(0);
          startCore();
        }
        if (part === 'waves') rows.push(`${ENW.hud.wave}${String(Math.max(0, Math.ceil(waveT))).padStart(2, '0')}`, lee >= 0 ? ENW.hud.lee : ENW.hud.open, `${ENW.hud.hop}${Math.min(strutAt + 2, N_STRUTS)} / ${N_STRUTS}`);
      } else if (part === 'core' || part === 'act' || part === 'run') {
        if (talk) v.vel.multiplyScalar(Math.exp(-3 * d));
        else {
          // the last waves, on the way out
          _ext.set(part === 'run' ? Math.sign(h) * Math.abs(h / C.EN_P2) * C.EN_C4 : 0, part === 'run' ? -h / C.EN_P2 * C.EN_C4 * 0.5 : 0, 0);
          for (let rem = d; rem > 1e-5; rem -= 1 / 60) v.step(Math.min(rem, 1 / 60), k, _ext);
        }
        const dist = v.at.distanceTo(CORE);
        if (part !== 'run' && dist > 240) {
          // held by the core until it is done with
          v.at.sub(CORE).multiplyScalar(240 / dist).add(CORE);
          if (part === 'act' && t - saidEarly > 9) {
            saidEarly = t;
            say(ENW.early, 4);
          }
        }
        if (dist < 84) v.at.sub(CORE).multiplyScalar(84 / Math.max(dist, 1)).add(CORE);
        if (part === 'core' && !asking && !talk && later.length === 0) {
          askT -= d;
          if (askT <= 0) ask();
        }
        if (part === 'act' && !talk) {
          act = Math.min(1, act + d / C.EN_C1);
          coreU.uAct.value = act;
          setRoar(act * 0.5);
          rows.push(`${ENW.hud.act}${'█'.repeat(Math.round(act * 10)).padEnd(10, '░')}`, ENW.hud.wait);
          if (act >= 1) {
            part = 'run';
            runT = 0;
            say(ENW.now, 5);
            later.push({ text: ENW.runHint, sec: 8 });
            uiSound('engage');
          }
        } else if (part === 'run') {
          runT += d;
          setRoar(0.5 + 0.5 * (runT / C.EN_C2));
          setEventRumble(Math.abs(h / C.EN_P2) * 0.8);
          const left = C.EN_C2 - runT, clear = C.EN_C3 - dist;
          rows.push(`${ENW.hud.run}${mmss(Math.max(0, left))}`, `${ENW.hud.out}${Math.max(0, Math.round(clear))}`, ENW.hud.now);
          if (dist >= C.EN_C3) beginEnd();
          else if (left <= 0) lost('merger');
        }
      }
      setHum(0.25 + 0.75 * v.push);
      v.place(false);
      placeRanks(t);
      const text = rows.length && !scene ? rows.join('\n') : null;
      if (text !== panelText) chapterHud.panel((panelText = text));
      lampHud.update();
    },
    // (the door `en:back`: nothing is lost by it that being lost in place does not already undo)
    revive() {
      unmake();
    },
    settle,
    places: { gaps: GAPS.map(([x, y], i) => [x, y, LINE_Z(i)]), struts: Array.from({ length: N_STRUTS }, (_, j) => LEE(j).toArray()), core: CORE.toArray(), clear: C.EN_C3 },
    info: () => ({
      inside, part, at: v.at.toArray().map((x) => +x.toFixed(1)), line, strut: strutAt, wave: +waveT.toFixed(1), gap: +gap.toFixed(1), asking, act: +act.toFixed(2), run: part === 'run' ? +(C.EN_C2 - runT).toFixed(1) : null,
      dist: +v.at.distanceTo(CORE).toFixed(0), scene: scene ? { kind: scene.kind, u: +scene.clock.u().toFixed(2) } : null, decision: decision(), outcome, panel: panelText,
    }),
    dbg: {
      skip: () => (scene ? scene.clock.skip() : false),
      put(o) {
        if (o.at) v.at.fromArray(o.at);
        if (o.look) v.look(new THREE.Vector3().fromArray(o.look));
        if (Number.isFinite(o.yaw)) v.yaw = o.yaw;
        if (Number.isFinite(o.pitch)) v.pitch = o.pitch;
        v.vel.set(0, 0, 0);
        v.avY = v.avX = 0;
        return site.info();
      },
      ask,
      decide,
      // run a clock on: the next wave, the act at the core, the merger
      wave(left = 0.5) {
        if (part !== 'waves') return false;
        waveT = left;
        return true;
      },
      act(val = 0.98) {
        if (part !== 'act') return false;
        act = val;
        return true;
      },
      merger(left = 1) {
        if (part !== 'run') return false;
        runT = C.EN_C2 - left;
        return true;
      },
    },
  };
  return site;
}
