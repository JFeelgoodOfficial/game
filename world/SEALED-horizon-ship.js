// SEALED: the owner has not played this yet. Do not open.
//
// What the places of the chapter past the horizon share (GDD 5.7.7): the
// bridge as world/launch.js left it, the crew at its rail for any crew there
// is, the way a scene is played and a decision asked, the chart, the ring of
// loose lights, and a figure made of hull cells.
//
// THE CONSTANTS (src/constants.js names them blankly on purpose; this is what they are):
//   HZ_MASS the hole, in suns        HZ_M  G M / c^3, s
//   HZ_T1   (4/3) M: horizon to the end, falling     HZ_T2  pi M: the most there is
//   HZ_T3   0.5607 M: all of home ever seen           HZ_T4  the count to the roof once the spin is known (illustrative)
//   HZ_TAU  the ship's clock at the start of each stage
//   HZ_S*   scene lengths (S1..S10 as in the words file; SX a death, SX1 the death by keeping everything)
//   HZ_A1   how near the middle of the view a sighting must be   HZ_A2  seconds held to log it
//   HZ_B1   seconds of burn that give the most      HZ_B2  how long the burn is waited for
//   the chart:  C1 the river's slope  C2 light's (the cone)  C3 slope per unit of lean  C4 how fast lean follows the stick
//               C5 chart time per second  C6 where the ship came in  C7 where its old course meets the roof
//               C8 dose per width of a line crossed  C9 drive per second of lean  C10 time lost to leaning
//               C11 how near the starboard roof burns  C12 its dose per second
//               C13 the warning before the port roof  C14 hands off for this long  C15 dose per second if not
//               C16 dose at the roof in its band  C17 in the X-ray length  C18 out of its band
//   the hull:   D1 the lamp's range  D2 seconds to look someone back  D3 less per captain already back
//               D4 how fast a look sinks away  D5 the cone  D6 seconds until the cells let go  D7 before they start to drain
//               D8 how close the lights come to a pilot alone  D9 seconds to look the corner back
//   the ring:   E1 a gap's length  E2 one every this much  E3 the chart's rate there (times C5)  E4 the pull back to rest
//               E5 drive coming back per second  E6 how much the ship holds back by itself  E7 where the ring's line is
//   CH_TIER:    hzA loose lights in the ring  hzB lights from the ring  hzC hull cells  hzD cells in a figure

import * as THREE from 'three';
import { C } from '../src/constants.js';
import { sun } from '../src/sun.js';
import { chapterHud } from '../src/chapterHud.js';
import { openDialogue, isDialogueOpen } from '../src/dialogue.js';
import { floorOf, tint, box, cyl, mergedMesh, buildRobot, tenretniMat } from './capital.js';
import { poseRig } from './aliens.js';
import { standRig } from './rigGround.js';
import { buildCaptain, liveCaptain } from './captainDress.js';
import { createSceneClock, crewSay, CAPTAINS } from './sceneClock.js';
import { hush } from './entryzero-audio.js';
import { BANDS } from './entryzero-dialogue.js';
import { homeSeen } from './SEALED-horizon-sky.js';
import { RECORDS, CLOCKS, FIRST, CHART, COLOURS, SKIP } from './SEALED-horizon-words.js';

export const ZERO = new THREE.Vector3();
export const UP = new THREE.Vector3(0, 1, 0);
export const R = 9; // the bridge's radius
export const ease = (a, b, x) => {
  const f = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return f * f * (3 - 2 * f);
};
export const bandIndex = (id) => BANDS.findIndex((b) => b.id === id);

// --- who is aboard, and what has been done: what the lines are chosen by ---------
const _facts = {};
export function facts(chapter) {
  const crew = chapter.crew();
  const has = (id) => crew.some((c) => c.id === id);
  const c1 = chapter.hz.get('c1'), c2 = chapter.hz.get('c2');
  const fell = typeof c1 === 'number';
  const f = _facts;
  f.crew = crew.length > 0;
  f.alone = crew.length === 0;
  f.fellSaturnia = fell && c1 === 4 && has('marrow');
  f.fellWavemall = fell && c1 === 5 && has('lux');
  f.fellHome = fell && c1 === 6;
  f.fellOther = f.fellPlain = fell && !f.fellSaturnia && !f.fellWavemall && !f.fellHome;
  f.pair = has('vask') && has('marrow');
  f.vaskOnly = has('vask') && !has('marrow');
  f.marrowOnly = has('marrow') && !has('vask');
  f.luxOnly = has('lux') && !has('vask') && !has('marrow');
  f.luxMore = has('lux') && (has('vask') || has('marrow'));
  const lostHere = chapter.hz.state().lost;
  f.lostHere = lostHere.length > 0;
  f.woke = c2 === 'a';
  f.kept = c2 !== 'a';
  const who = f.lostHere ? CAPTAINS.find((c) => c.id === lostHere[0]) : null;
  f.who = who ? who.short : '';
  f.name = fell && RECORDS[c1] ? RECORDS[c1].name : '';
  return f;
}
// is this line said at all, with this crew and these facts
export function fits(chapter, line, f) {
  if (line.when && !f[line.when]) return false;
  const crew = chapter.crew();
  if (line.needs && !line.needs.every((id) => crew.some((c) => c.id === id))) return false;
  if (line.own && line.by && line.by !== 'first' && !crew.some((c) => c.id === line.by)) return false;
  return true;
}
const cap = (s) => s.charAt(0) + s.slice(1).toLowerCase();
function fill(text, f, vars) {
  if (!text || text.indexOf('{') < 0) return text;
  return text.replace(/\{(\w+)\}/g, (m, k) => {
    if (vars && k in vars) return String(vars[k]);
    if (k === 'who') return cap(f.who);
    if (k === 'WHO') return f.who;
    if (k === 'name') return cap(f.name);
    if (k === 'NAME') return f.name;
    return m;
  });
}
// One line, said: by its captain (or another, or nobody: world/sceneClock.js),
// by the first pilot, or by the ship. Returns who spoke (an id, 'first', or null).
export function sayLine(chapter, line, vars = null, sec = 6.5) {
  if (!line) return null;
  const f = facts(chapter);
  if (!fits(chapter, line, f)) return null;
  const text = fill(line.text, f, vars), solo = fill(line.solo, f, vars);
  if (line.by === 'first') {
    chapterHud.say(`${FIRST.short} — ${text}`, sec);
    return 'first';
  }
  return crewSay(chapter, { by: line.by, text, solo }, sec);
}
// would this line put anything on the screen, for the crew there is
export function shows(chapter, line) {
  if (!line || !fits(chapter, line, facts(chapter))) return false;
  return line.by == null || line.by === 'first' || chapter.crew().length > 0 || !!line.solo;
}
// A scene's lines for the crew there is: [[seconds, line], ...] in order.
export function sceneLines(chapter, list) {
  const f = facts(chapter);
  return list.filter((l) => fits(chapter, l, f)).map((l) => [l.at, l]).sort((a, b) => a[0] - b[0]);
}
// (for a test: every line of a list that would be shown to this crew, as text)
export function shownLines(chapter, list) {
  const f = facts(chapter), crew = chapter.crew();
  const out = [];
  for (const l of list) {
    if (!fits(chapter, l, f)) continue;
    if (l.by === 'first') out.push(`${FIRST.short} — ${fill(l.text, f)}`);
    else if (l.by == null) out.push(fill(l.text, f));
    else if (crew.length) out.push(`${(crew.find((c) => c.id === l.by) || crew[0]).short} — ${fill(l.text, f)}`);
    else if (l.solo) out.push(fill(l.solo, f));
  }
  return out;
}

// --- the three clocks ------------------------------------------------------------
// `tau`: the ship's seconds since the horizon. `left`: seconds, or null for no
// third clock. Home, as seen, is worked out from the ship's clock (see the sky's
// notes) and stops for good at the roof (`roofTau`).
export function showClocks(tau, left, roof = false, stopAt = null) {
  const seen = homeSeen(C.HZ_T1 - Math.min(tau, stopAt ?? tau));
  if (left == null) chapterHud.clocks(tau, seen, CLOCKS.ship, CLOCKS.home);
  else chapterHud.clocks(tau, seen, CLOCKS.ship, CLOCKS.home, Math.max(0, left), roof ? CLOCKS.roof : CLOCKS.left);
}

// --- the bridge ------------------------------------------------------------------
const VERT = /* glsl */ `
  varying vec3 vW;
  varying vec3 vL;
  void main() {
    vL = position;
    vec4 w = modelMatrix * vec4(position, 1.0);
    vW = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;
// Cells of the hull, each holding a record: its own colour, breathing out of
// step. `uGap` puts one out; `uWhite` takes them to white from the bow; `uLift`
// is the ship writing what is aboard into them.
export const CELL_FRAG = /* glsl */ `
  uniform float uTime, uGap, uWhite, uLift, uScale, uDim;
  varying vec3 vL;
  float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  void main() {
    vec2 g = uScale < 0.0 ? vL.xz * -uScale : vec2(atan(vL.x, vL.z) * 14.0, vL.y * 1.1) * uScale;
    vec2 id = floor(g), f = fract(g);
    float edge = smoothstep(0.0, 0.08, f.x) * smoothstep(1.0, 0.92, f.x) * smoothstep(0.0, 0.08, f.y) * smoothstep(1.0, 0.92, f.y);
    float n = h21(id);
    vec3 hue = 0.5 + 0.5 * cos(6.2832 * (n + vec3(0.0, 0.33, 0.67)));
    float breath = 0.55 + 0.45 * sin(uTime * (0.3 + n) + n * 40.0);
    vec3 col = mix(vec3(0.9, 0.95, 1.0), hue, 0.6) * breath * 1.1;
    col *= 1.0 - uGap * step(abs(id.x - 3.0) + abs(id.y - 2.0), 0.5);
    col = mix(col, vec3(1.6), clamp(uWhite * 2.0 - h21(id + 7.0), 0.0, 1.0));
    col *= 1.0 + 1.5 * uLift * (0.5 + 0.5 * sin(uTime * 9.0 + n * 30.0));
    gl_FragColor = vec4(col * edge * uDim, 1.0);
  }
`;
export const cellUniforms = (time, scale = 1) => ({ uTime: time, uGap: { value: 0 }, uWhite: { value: 0 }, uLift: { value: 0 }, uScale: { value: scale }, uDim: { value: 1 } });
export const cellMaterial = (U, side = THREE.DoubleSide) => new THREE.ShaderMaterial({ uniforms: U, vertexShader: VERT, fragmentShader: CELL_FRAG, side, fog: false });

// The deck, the rail, the helm, and the archive's arc astern.
export function buildShell(time, extra = []) {
  const group = new THREE.Group();
  const lit = [
    tint(cyl(R + 0.4, R + 0.4, 0.6, 0, -0.3, 0, 40), 0x10161b),
    tint(box(1.6, 1.1, 0.9, 0, 0.55, -R + 2.2), 0x1c262d), // the helm
    ...extra,
  ];
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    lit.push(tint(box(0.1, 1.05, 0.1, Math.cos(a) * R, 0.52, Math.sin(a) * R), 0x24313a));
  }
  group.add(mergedMesh(lit, new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x05080a })));
  const railMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 1.4, 1.6), fog: false });
  const rail = new THREE.Mesh(new THREE.TorusGeometry(R, 0.05, 6, 64).rotateX(Math.PI / 2), railMat);
  rail.position.y = 1.08;
  group.add(rail);
  const wallU = cellUniforms(time);
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(R + 2.5, R + 2.5, 9, 48, 1, true, -0.62, 1.24).translate(0, 4.2, 0), cellMaterial(wallU));
  wall.frustumCulled = false;
  group.add(wall);
  return { group, railMat, wallU };
}

// The first pilot, as a figure: a Tenretni (world/capital.js).
export function buildFirst() {
  const r = buildRobot(tenretniMat(), new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }));
  r.group.scale.setScalar(0.72);
  return r;
}

// The captains who are aboard, at the forward rail; and the first pilot with
// them once it has been looked back.
export function createCrew(chapter, group) {
  const members = CAPTAINS.map((c, i) => {
    const rig = buildCaptain(c.id);
    const a = -Math.PI / 2 + (i - 1) * 0.5;
    const x = Math.cos(a) * (R - 2.2), z = Math.sin(a) * (R - 2.2);
    rig.group.position.set(x, 0, z);
    rig.group.rotation.y = Math.PI;
    standRig(rig, 0);
    rig.group.visible = false;
    group.add(rig.group);
    return { c, rig, x, z, on: false };
  });
  let first = null;
  return {
    members,
    muster(show = true) {
      const crew = chapter.crew();
      for (const m of members) {
        m.on = show && crew.some((c) => c.id === m.c.id);
        m.rig.group.visible = m.on;
      }
      const woke = show && chapter.hz.get('c2') === 'a';
      if (woke && !first) {
        first = buildFirst();
        first.group.position.set(3.4, 0, -R + 4.6);
        first.group.rotation.y = Math.PI;
        group.add(first.group);
      }
      if (first) first.group.visible = woke;
    },
    hide() {
      for (const m of members) m.rig.group.visible = false;
      if (first) first.group.visible = false;
    },
    tick(d, t, speaker) {
      for (const m of members) {
        if (!m.rig.group.visible) continue;
        poseRig(m.rig, d, t, 'idle', 0);
        standRig(m.rig, 0);
        liveCaptain(m.rig, d, t, speaker === m.c.id, 0);
      }
      if (first && first.group.visible) first.head.rotation.y = 0.25 * Math.sin(t * 0.4);
    },
    aboard: () => members.filter((m) => m.on).map((m) => m.c.id),
  };
}

// --- a place of the chapter: what every one of them is ------------------------------
// The walker's site (src/capitalWalk.js) with the parts that never differ: the
// scene's light taken and put back, one scene at a time on one clock with E to
// skip it, and a decision that is asked again until it is answered.
//
// o: { group, surfaces, colliders, spawn, spawnYaw, hidePilot, light: [dir, colour, k, ambient colour, k],
//      enter(), leave(), tick(d, t), held(), camera(pos, target), act(), prompt(), info() }
export function makeSite(ctx, o) {
  const { chapter } = ctx;
  let inside = false, prev = null, walker = null, walkerRef = null;
  let sc = null, scCam = null, scEnd = null, ended = false;
  let asking = null, askT = 0;
  const st = {
    speaker: null, speakT: 0,
    // play a scene: def.lines, for T seconds. opts: { pose(u), cam(pos, target, u), onEnd(), holds: [seconds], onStop(i), from }
    play(def, T, opts = {}) {
      scCam = opts.cam || null;
      scEnd = opts.onEnd || null;
      ended = false;
      sc = createSceneClock({
        T, lines: sceneLines(chapter, def.lines), stops: opts.holds || [], pose: opts.pose || (() => {}),
        say: (line) => {
          st.speaker = sayLine(chapter, line);
          st.speakT = 5;
        },
        onStop: opts.onStop,
        onEnd: () => {
          ended = true;
        },
      });
      sc.begin(opts.from || 0);
      chapterHud.cine(true);
    },
    say(line, vars, sec) {
      const who = sayLine(chapter, line, vars, sec);
      st.speaker = who;
      st.speakT = 5;
      return who;
    },
    // lines said one after another outside a scene (their `at` is the gap from the first)
    busy: () => !!sc,
    u: () => (sc ? sc.u() : -1),
    release: () => sc && sc.release(),
    skip() {
      if (!sc) return false;
      chapterHud.say(null);
      return sc.skip();
    },
    seek: (u) => sc && sc.seek(u),
    stop() {
      if (sc) sc.stop();
      sc = null;
      scEnd = null;
      chapterHud.cine(false);
    },
    // A decision: shown as a scene of its own, and shown again if it is closed without a pick.
    ask(payload, pick) {
      asking = { payload: { ...payload, cine: true }, pick };
      askT = 0;
      open();
    },
    asking: () => !!asking,
    walker: () => walker,
    walkerRef: () => walkerRef,
    inside: () => inside,
  };
  function open() {
    const a = asking;
    openDialogue(a.payload, {
      onOffer: (offer) => {
        if (offer.kind !== 'choice') return null;
        asking = null;
        return a.pick(offer.outcomeTag) || null;
      },
    });
  }
  const light = o.light || [[0.1, 0.7, 0.7], [0.8, 0.9, 1.0], 1.3, [0.4, 0.5, 0.7], 0.5];
  const site = {
    group: o.group,
    planet: { group: { position: ZERO }, sunDir: UP },
    noShip: true,
    hidePilot: !!o.hidePilot,
    speed: 1,
    exit: { x: 0, z: 0 },
    leaveHint: '',
    surfaces: o.surfaces,
    colliders: o.colliders || [],
    floorYAt: floorOf(o.surfaces, 1.2),
    snap: 1.2,
    pad: new THREE.Vector3(),
    spawn: o.spawn,
    spawnYaw: o.spawnYaw ?? Math.PI,
    npcs: o.npcs || [],
    consoles: o.consoles || [],
    onChoice: () => null,
    portal: null,
    held: () => !!sc || (o.held ? o.held() : false),
    camera(pos, target) {
      if (sc && scCam) return scCam(pos, target, sc.u()) !== false;
      return o.camera ? o.camera(pos, target) : false;
    },
    act() {
      if (sc) st.skip();
      else if (o.act) o.act();
    },
    heldPrompt: () => (sc ? (sc.stopped() >= 0 ? '' : SKIP) : o.prompt ? o.prompt() : ''),
    setWalker(p, w) {
      walker = p || null;
      walkerRef = w || null;
    },
    onEnter() {
      if (inside) return;
      inside = true;
      site.portal = null;
      o.group.visible = true;
      const scene = ctx.scene;
      prev = {
        fog: scene.fog,
        lightPos: sun.light.position.clone(), lightColor: sun.light.color.clone(), lightI: sun.light.intensity,
        ambColor: sun.ambient.color.clone(), ambI: sun.ambient.intensity,
      };
      scene.fog = null;
      sun.light.position.set(light[0][0], light[0][1], light[0][2]).normalize();
      sun.light.color.setRGB(light[1][0], light[1][1], light[1][2]);
      sun.light.intensity = light[2];
      sun.ambient.color.setRGB(light[3][0], light[3][1], light[3][2]);
      sun.ambient.intensity = light[4];
      ctx.hideFleet();
      asking = null;
      o.enter();
    },
    onLeave() {
      if (!inside) return;
      inside = false;
      o.group.visible = false;
      st.stop();
      asking = null;
      if (o.leave) o.leave();
      hush();
      chapterHud.clear();
      chapterHud.clocks(null);
      chapterHud.panel(null);
      ctx.scene.fog = prev.fog;
      sun.light.position.copy(prev.lightPos);
      sun.light.color.copy(prev.lightColor);
      sun.light.intensity = prev.lightI;
      sun.ambient.color.copy(prev.ambColor);
      sun.ambient.intensity = prev.ambI;
      prev = null;
    },
    tick(dt, t) {
      chapterHud.tick(dt);
      const d = Math.min(dt, 0.1);
      if (st.speakT > 0 && (st.speakT -= d) <= 0) st.speaker = null;
      if (sc) {
        if (!isDialogueOpen()) chapterHud.cine(true);
        sc.tick(d);
        if (ended) {
          const done = scEnd;
          sc = null;
          scEnd = null;
          ended = false;
          chapterHud.cine(false);
          if (done) done();
        }
      }
      // a decision waits for the player: closed without a pick, it is asked again
      if (asking && !isDialogueOpen() && (askT += d) > 0.7) {
        askT = 0;
        open();
      }
      o.tick(d, t);
    },
    inside: () => inside,
    info: () => ({ scene: sc ? +sc.u().toFixed(1) : -1, held: sc ? sc.stopped() : -1, asking: !!asking, portal: site.portal, ...(o.info ? o.info() : {}) }),
    // (debug) the scene on its way, or straight to its end
    seek: (u) => st.seek(u),
    skip: () => st.skip(),
    dbg: o.dbg || {},
  };
  site.st = st;
  return site;
}

// --- the chart -------------------------------------------------------------------
// The region between a spinning hole's two horizons, as a Penrose diagram: up
// is later, light goes at 45 degrees, and the region is a diamond with corners
// at (0,0), (1,1), (-1,1), (0,2). The two lower edges are the outer horizon
// (the ship came in across the right one); the two upper edges are the inner
// horizon: the "roofs". That much is the real diagram of the exact solution.
//
// X4, ours: the "river" (what a ship that does nothing does) as one constant
// slope; where the other lines are; the roof's colours and their meaning.
//
//   kind 0   a hole that does not spin: every line ends on the line across the top
//   kind 1   one that does: the diamond, its two roofs
//   kind 2   past the port roof: the ring as a broken upright line (X9: the
//            ring of the exact solution can be passed through its middle)
const CHART_VERT = /* glsl */ `
  uniform float uScroll;
  varying vec2 vC;
  void main() {
    vC = vec2(position.x, position.y + 1.05 + uScroll);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const NS = CHART.streams.length;
const CHART_FRAG = /* glsl */ `
  uniform float uTime, uKind, uMorph, uRiver, uRingX, uGap, uEvery, uGlare, uOldX, uEntry, uLit;
  uniform vec4 uS[${NS}]; // x0, t0, slope, length
  uniform vec4 uSC[${NS}]; // colour, width
  uniform vec3 uRoof[5];
  varying vec2 vC;
  float seg(vec2 p, vec2 a, vec2 b) {
    vec2 pa = p - a, ba = b - a;
    return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0));
  }
  float ln(float d, float w) { return smoothstep(w, 0.0, d); }
  void main() {
    vec2 p = vC;
    float x = p.x, t = p.y;
    vec3 col = vec3(0.012, 0.02, 0.03);
    // light: the 45-degree grid
    float grid = ln(abs(fract((x + t) * 5.0) - 0.5), 0.02) + ln(abs(fract((x - t) * 5.0) - 0.5), 0.02);
    // --- a hole that does not spin ---
    float in0 = step(abs(x), t) * step(t, 1.0);
    vec3 c0 = vec3(0.1, 0.3, 0.4) * grid * in0 * 0.5;
    c0 += vec3(0.4, 0.9, 1.0) * (ln(seg(p, vec2(0.0), vec2(1.0, 1.0)), 0.012) + ln(seg(p, vec2(0.0), vec2(-1.0, 1.0)), 0.012));
    float zig = 1.0 + 0.025 * (abs(fract(x * 14.0) - 0.5) * 4.0 - 1.0);
    c0 += vec3(1.3, 0.35, 0.3) * ln(abs(t - zig), 0.014) * step(abs(x), 1.0);
    // --- one that spins: the diamond ---
    float in1 = step(abs(x), t) * step(t, 2.0 - abs(x));
    vec3 c1 = vec3(0.1, 0.3, 0.4) * grid * in1 * 0.5;
    c1 += vec3(0.1, 0.35, 0.3) * ln(abs(fract((x + uRiver * t) * 6.0) - 0.5), 0.03) * in1 * 0.5; // the river
    c1 += vec3(0.4, 0.9, 1.0) * (ln(seg(p, vec2(0.0), vec2(1.0, 1.0)), 0.012) + ln(seg(p, vec2(0.0), vec2(-1.0, 1.0)), 0.012));
    // the port roof, in the five bands of what fell before; the starboard roof, white
    float s = clamp(x + 1.0, 0.0, 0.999);
    int ri = int(floor(s * 5.0));
    vec3 rc = ri == 0 ? uRoof[0] : ri == 1 ? uRoof[1] : ri == 2 ? uRoof[2] : ri == 3 ? uRoof[3] : uRoof[4];
    c1 += rc * ln(seg(p, vec2(-1.0, 1.0), vec2(0.0, 2.0)), 0.03) * 1.6;
    c1 += vec3(1.5, 1.5, 1.7) * ln(seg(p, vec2(1.0, 1.0), vec2(0.0, 2.0)), 0.03 + uGlare) * (0.8 + 0.4 * sin(uTime * 21.0 + t * 60.0));
    // the other things falling, for their whole length
    for (int i = 0; i < ${NS}; i++) {
      vec2 a = uS[i].xy, b = a + vec2(uS[i].z, 1.0) * uS[i].w;
      c1 += uSC[i].rgb * ln(seg(p, a, b), 0.012 + uSC[i].w * 0.06) * 1.3 * uLit;
    }
    // the ship's old course: faint, broken
    vec2 oa = vec2(uEntry), ob = vec2(uOldX, uOldX + 2.0);
    c1 += vec3(0.6, 0.7, 0.8) * ln(seg(p, oa, ob), 0.008) * step(0.5, fract(t * 24.0)) * 0.7 * uLit;
    // --- past the roof ---
    float open = step(fract(t / uEvery), uGap / uEvery); // 1 in a gap
    vec3 c2 = vec3(0.08, 0.2, 0.3) * grid * 0.4;
    c2 += vec3(1.4, 1.3, 1.1) * ln(abs(x - uRingX), 0.016) * (1.0 - open);
    c2 += vec3(0.3, 1.2, 0.7) * ln(abs(x - uRingX), 0.03) * open * 0.6;
    col += uKind < 1.5 ? mix(c0, c1, uMorph) : c2;
    // the edge of the table
    col *= smoothstep(1.15, 1.05, abs(x));
    gl_FragColor = vec4(col, 1.0);
  }
`;
const LINE_N = 640;
export function createChart(time) {
  const group = new THREE.Group();
  const U = {
    uTime: time, uKind: { value: 1 }, uMorph: { value: 1 }, uScroll: { value: 0 }, uRiver: { value: C.HZ_C1 }, uRingX: { value: C.HZ_E7 },
    uGap: { value: C.HZ_E1 }, uEvery: { value: C.HZ_E2 }, uGlare: { value: 0 }, uOldX: { value: C.HZ_C7 }, uEntry: { value: C.HZ_C6 }, uLit: { value: 1 },
    uS: { value: CHART.streams.map((s) => new THREE.Vector4(s.x0, s.t0, s.slope, s.len)) },
    uSC: { value: CHART.streams.map((s) => { const c = new THREE.Color(BANDS[bandIndex(s.band)].tint); return new THREE.Vector4(c.r, c.g, c.b, s.width); }) },
    uRoof: { value: CHART.roof.map((id) => new THREE.Color(BANDS[bandIndex(id)].tint)) },
  };
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 2.3), new THREE.ShaderMaterial({ uniforms: U, vertexShader: CHART_VERT, fragmentShader: CHART_FRAG, fog: false, side: THREE.DoubleSide }));
  plane.frustumCulled = false;
  group.add(plane);
  // what moves: the ship's own line, the cone, where the present lean leads, and the ship
  const over = new THREE.Group();
  group.add(over);
  const mk = (n, color, opacity) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    geo.setDrawRange(0, 0);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity, fog: false, depthTest: false }));
    line.frustumCulled = false;
    line.renderOrder = 5;
    over.add(line);
    return line;
  };
  const own = mk(LINE_N, 0xffffff, 1), cone = mk(3, 0x7fe6ff, 0.8), lead = mk(2, 0xffe2a0, 0.9);
  const dot = new THREE.Mesh(new THREE.CircleGeometry(0.022, 16), new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false, depthTest: false }));
  dot.renderOrder = 6;
  over.add(dot);
  let n = 0, lastT = -1;
  const put = (line, i, x, t) => {
    const a = line.geometry.attributes.position.array;
    a[i * 3] = x;
    a[i * 3 + 1] = t - 1.05;
    a[i * 3 + 2] = 0.004;
  };
  return {
    group, U,
    reset() {
      n = 0;
      lastT = -1;
      own.geometry.setDrawRange(0, 0);
    },
    show(on) {
      over.visible = on;
    },
    // the ship at (x, t), leaning so that its line has this slope
    ship(x, t, slope, scroll = 0) {
      U.uScroll.value = scroll;
      over.position.y = -scroll;
      if (n < LINE_N && t - lastT >= 0.004) {
        put(own, n++, x, t);
        lastT = t;
        own.geometry.setDrawRange(0, n);
        own.geometry.attributes.position.needsUpdate = true;
      }
      put(cone, 0, x - C.HZ_C2 * 0.45, t + 0.45);
      put(cone, 1, x, t);
      put(cone, 2, x + C.HZ_C2 * 0.45, t + 0.45);
      cone.geometry.setDrawRange(0, 3);
      cone.geometry.attributes.position.needsUpdate = true;
      put(lead, 0, x, t);
      put(lead, 1, x + slope * 0.6, t + 0.6);
      lead.geometry.setDrawRange(0, 2);
      lead.geometry.attributes.position.needsUpdate = true;
      dot.position.set(x, t - 1.05, 0.006);
    },
  };
}

// --- the ring of loose lights -------------------------------------------------------
// Things let go in a falling ship drift apart along the fall and together
// across it (the tide). `stretch` 0 is a ring; 1 is two lines.
export function createMotes(n) {
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    pos[i * 3] = Math.cos(a);
    pos[i * 3 + 1] = 0.04 * Math.sin(i * 12.9898);
    pos[i * 3 + 2] = Math.sin(a);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const U = { uStretch: { value: 0 }, uTime: { value: 0 } };
  const pts = new THREE.Points(geo, new THREE.ShaderMaterial({
    uniforms: U, fog: false, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      uniform float uStretch, uTime;
      void main() {
        vec3 p = position;
        p.z *= 1.0 + 9.0 * uStretch;
        p.x *= 1.0 - 0.9 * uStretch;
        p.y += 0.03 * sin(uTime * 0.7 + position.x * 9.0);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = clamp(22.0 / -mv.z, 1.5, 7.0);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      void main() {
        float d = length(gl_PointCoord - 0.5);
        gl_FragColor = vec4(vec3(0.7, 1.0, 1.1) * smoothstep(0.5, 0.0, d) * 0.8, 1.0);
      }`,
  }));
  pts.frustumCulled = false;
  return { points: pts, U };
}

// --- something written into the hull: a shape made of its cells ----------------------
// `hold` 0..1 closes the cells into the thing itself; `drain` 0..1 lets them go
// from the bottom up. One draw; the cells are moved in the vertex shader.
export function createFigure(color, n, h, w) {
  const geo = new THREE.BoxGeometry(0.09, 0.09, 0.09);
  const U = { uTime: { value: 0 }, uHold: { value: 0 }, uDrain: { value: 0 }, uH: { value: h }, uCol: { value: new THREE.Color(color) } };
  const mesh = new THREE.InstancedMesh(geo, new THREE.ShaderMaterial({
    uniforms: U, fog: false,
    vertexShader: /* glsl */ `
      uniform float uTime, uHold, uDrain, uH;
      varying float vK;
      void main() {
        vec3 c = instanceMatrix[3].xyz;
        float seed = fract(sin(dot(c, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
        float gone = step(c.y, uDrain * uH) + step(1.0 - uHold * 1.02, seed * 0.98 - 0.02);
        vec3 p = position * (1.0 - 0.5 * uHold) * (1.0 - clamp(gone, 0.0, 1.0));
        c.xz *= 1.0 + 0.25 * (1.0 - uHold) * sin(uTime * 1.3 + seed * 30.0);
        c.y += 0.05 * sin(uTime * 2.0 + seed * 50.0);
        vK = 0.6 + 0.4 * sin(uTime * (1.0 + seed * 2.0) + seed * 40.0);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(c + p, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uCol;
      varying float vK;
      void main() { gl_FragColor = vec4(uCol * vK * 1.5, 1.0); }`,
  }), n);
  const m = new THREE.Matrix4();
  let s = 0x2545f491 ^ color;
  const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < n; i++) {
    const y = rnd() * h, a = rnd() * Math.PI * 2;
    const taper = y > h * 0.82 ? 0.45 : y > h * 0.5 ? 1 : 0.7; // a head, shoulders, legs
    const r = Math.sqrt(rnd()) * w * 0.5 * taper;
    mesh.setMatrixAt(i, m.makeTranslation(Math.cos(a) * r, y, Math.sin(a) * r * 0.6));
  }
  mesh.frustumCulled = false;
  return { mesh, U };
}
export { COLOURS };

// --- what the chapter leaves on the home base (src/horizon.js effects()) -------------
// The record that was put down is a holodeck program gone dark; the first
// pilot, if it was looked back, stands on the bridge; a captain kept in the
// hull is a lit mark in their colours; and each captain has more to say.
import { AFTER } from './SEALED-horizon-words.js';
export function effectsOf(chapter) {
  const c1 = chapter.hz.get('c1'), c2 = chapter.hz.get('c2');
  const rec = typeof c1 === 'number' ? RECORDS[c1] : null;
  const talk = {};
  for (const c of chapter.crew()) {
    const a = AFTER.talk[c.id];
    if (!a) continue;
    const more = rec && a[rec.id] ? a[rec.id] : a.other;
    talk[c.id] = more ? [...a.any, more] : a.any.slice();
  }
  return {
    rooms: rec ? { [rec.room]: false } : {},
    figures: c2 === 'a' ? [{ id: 'first', build: () => buildFirst().group, talk: () => ({ speaker: FIRST, lines: AFTER.first }), at: [3.4, -4.4] }] : [],
    marks: chapter.hz.state().lost.map((id) => ({ id, color: COLOURS[id] })),
    talk,
  };
}

// (for a test) every scene's lines as this crew would be shown them: { scene: [text, ...] }
import * as WORDS from './SEALED-horizon-words.js';
export function auditLines(chapter) {
  const out = {};
  const take = (name, list) => {
    out[name] = shownLines(chapter, list);
  };
  for (const k of ['S1', 'S2', 'S3A', 'S3B', 'S4', 'S4B', 'DX1', 'S5', 'S6', 'DX2', 'S7A', 'S7', 'S8', 'S8A', 'S8B', 'S9', 'DX3', 'S10']) take(k, WORDS[k].lines);
  take('TONE', WORDS.TONE);
  take('LAMP', WORDS.LAMP.sights.flatMap((s) => s.say));
  take('COUNT', [WORDS.COUNT.nudge, WORDS.COUNT.best, WORDS.COUNT.long, WORDS.COUNT.none, WORDS.COUNT.fight]);
  take('BARKS', Object.values(WORDS.CHART.barks));
  take('HULL', [WORDS.HULL.freighter, WORDS.HULL.timer, WORDS.HULL.stolen, ...Object.values(WORDS.HULL.back), ...Object.values(WORDS.HULL.help), ...WORDS.HULL.lost, ...Object.values(WORDS.HULL.near)]);
  take('KEEL', [WORDS.KEEL.now, WORDS.KEEL.leans, WORDS.KEEL.miss]);
  take('DEATH', Object.values(WORDS.AFTER_DEATH));
  WORDS.HALL.look.forEach((alts, i) => {
    const f = facts(chapter);
    const l = alts.find((x) => fits(chapter, x, f) && (chapter.crew().length || x.solo));
    out[`LOOK${i}`] = l ? shownLines(chapter, [l]) : [];
  });
  return out;
}
