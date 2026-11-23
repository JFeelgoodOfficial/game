// The Siege: the helm chart, in battle (GDD 5.7.9; Season 1, chapter 10).
//
// A fleet whose every move was forecast a year ago, against a port whose every
// move was forecast with it. The one thing not on that forecast is the light
// ship, which goes where its pilot imagines. So the battle is drawn.
//
//   the chart   Each pass, the helm chart comes up (src/drawPad.js, with the
//               battle painted under the ink): the port and its outer ring,
//               the grey columns and the lines they will keep to, and, from
//               the second pass, the red circle of the flagship's guns.
//   the pass    One stroke. The light ship flies it, start to end, in
//               SIEGE_FLY seconds, and for SIEGE_WAKE seconds after it has
//               passed a place, anything grey within SIEGE_CUT of it is
//               broken: they keep to their lines, and their lines did not
//               have this in them. What is not broken reaches the ring.
//   the red     A pass drawn through the flagship's circle loses the ship.
//               The pass is drawn again.
//   the choice  Before the last pass: COVER THE LIFEBOATS (the ring is given
//               up, and most get out), or HOLD THE LINE. Lost on that last
//               pass, the pilot is back at the asking (src/season.js).
//   the event   The outer ring falls, either way (src/fixedEvents.js `siege`).
//
// Who fights beside the port is what was done earlier in the season: the
// Choir if it kept its own time (`ch7.choir`), the swarm's builders if they
// were freed (`ch8.builders`), the cable crew if the fee was split
// (`ch4.fee`). Each thins the columns in one quarter of the sky.
//
// Nothing here is a claim about physics. A ship that goes where it is
// imagined is the saga's own rule (GDD 5.7.4), kept.
//
// A site for the platform walker (src/capitalWalk.js), walked under the pause
// (look `dive`): one seat, at the chart. `S` is the system's story
// (world/concourse-system.js).

import * as THREE from 'three';
import { C, SIEGE_WAVES } from '../src/constants.js';
import { sun } from '../src/sun.js';
import { openDialogue, isDialogueOpen } from '../src/dialogue.js';
import { chapterHud } from '../src/chapterHud.js';
import { openDrawPad, closeDrawPad, isDrawPadOpen } from '../src/drawPad.js';
import { setMusicArea } from '../src/music.js';
import { uiSound, setEventRumble } from '../src/sfx.js';
import { mulberry32 } from '../src/noise2.js';
import { floorOf } from './capital.js';
import { createSceneClock, crewSay } from './sceneClock.js';
import { SIEGE } from './siege-dialogue.js';

const ZERO = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const AR = 700; // one chart unit, in the scene
const RING_IN = 0.16, RING_OUT = 0.3; // the port, and its outer ring (chart units)
const SEG = 8; // sections of the outer ring
const KEY = 'ch10.ring';
const QUARTER = { choir: 0, builders: 1, cable: 2 }; // which quarter of the sky each ally holds
const ease = (a, b, x) => {
  const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

// ctx: the system's. S: its story (world/concourse-system.js).
export function createSiegeHelm(ctx, S) {
  const { chapter, season, fixed } = ctx;
  const group = new THREE.Group();
  group.visible = false;
  ctx.scene.add(group);

  // --- the sky, the port, its outer ring ---
  {
    const rng = mulberry32(0x51e6e);
    const pos = new Float32Array(900 * 3);
    for (let i = 0; i < 900; i++) {
      const a = rng() * Math.PI * 2, r = 1500 + rng() * 3000;
      pos.set([Math.cos(a) * r, -900 - rng() * 1500, Math.sin(a) * r], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    group.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0x9fb4d8, size: 3, sizeAttenuation: false, fog: false })));
  }
  const port = new THREE.Mesh(new THREE.TorusGeometry(RING_IN * AR, 16, 10, 64).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.3, 1.1, 0.8), fog: false }));
  const hub = new THREE.Mesh(new THREE.SphereGeometry(26, 16, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.5, 1.3, 1.0), fog: false }));
  group.add(port, hub);
  const segs = [];
  for (let i = 0; i < SEG; i++) {
    const arc = (Math.PI * 2) / SEG;
    const m = new THREE.Mesh(new THREE.TorusGeometry(RING_OUT * AR, 11, 8, 14, arc * 0.9).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false }));
    m.rotation.y = -(i * arc + arc * 0.05);
    group.add(m);
    segs.push({ m, hp: C.SIEGE_SEG_HP, away: 0 });
  }
  const segOf = (x, z) => ((Math.floor((Math.atan2(z, x) / (Math.PI * 2)) * SEG) % SEG) + SEG) % SEG;

  // --- the grey fleet, the defence, and the lines the grey keep to ---
  const MAXE = SIEGE_WAVES.reduce((a, w) => Math.max(a, w.columns * C.SIEGE_COLUMN), 0);
  const dart = new THREE.ConeGeometry(4.5, 20, 5).rotateX(Math.PI / 2);
  const enemyMesh = new THREE.InstancedMesh(dart, new THREE.MeshBasicMaterial({ color: new THREE.Color(0.62, 0.66, 0.72), fog: false }), MAXE);
  const DEF = 40 + 36;
  const defMesh = new THREE.InstancedMesh(new THREE.OctahedronGeometry(6, 0).scale(1, 0.5, 1.6), new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false }), DEF);
  defMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(DEF * 3), 3);
  enemyMesh.frustumCulled = defMesh.frustumCulled = false;
  group.add(enemyMesh, defMesh);
  const trackGeo = new THREE.BufferGeometry();
  trackGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(16 * 6), 3));
  const tracks = new THREE.LineSegments(trackGeo, new THREE.LineBasicMaterial({ color: 0x5a6474, fog: false }));
  tracks.frustumCulled = false;
  group.add(tracks);
  const flag = new THREE.Mesh(new THREE.OctahedronGeometry(26, 0).scale(1, 0.5, 2.2), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.8, 0.84, 0.9), fog: false }));
  const zone = new THREE.Mesh(new THREE.RingGeometry(C.SIEGE_ZONE * AR - 5, C.SIEGE_ZONE * AR, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 0.2, 0.15), side: THREE.DoubleSide, fog: false }));
  group.add(flag, zone);
  // the light ship, and where it has just been
  const light = new THREE.Mesh(new THREE.OctahedronGeometry(13, 0).scale(1, 0.6, 2.6), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.4, 2.6), fog: false }));
  const WAKE_N = 48;
  const wakeGeo = new THREE.BufferGeometry();
  wakeGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(WAKE_N * 3), 3));
  const wakeLine = new THREE.Line(wakeGeo, new THREE.LineBasicMaterial({ color: 0x9fe8ff, fog: false }));
  wakeLine.frustumCulled = false;
  group.add(light, wakeLine);

  // --- state ---
  let inside = false, prev = null, scene = null;
  let wave = 0, phase = 'idle'; // 'forecast' | 'intro' | 'plan' | 'fly' | 'after' | 'ask' | 'fall'
  let enemies = [], columns = [], path = null, flyT = 0, afterT = 0, flagAt = null, wake = [];
  let allies = [], defenders = [], saidAllies = false, saidFlag = false, asking = false, askT = 0, dead = false, deathLine = null;
  let broken = 0, reached = 0, panelText = null, outcome = null;
  const later = [];
  const say = (line, sec) => crewSay(chapter, line, sec);
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler(), _c = new THREE.Color();
  const decision = () => season.get(KEY);
  const standing = () => segs.filter((s) => s.hp > 0).length;

  // who came: what was done earlier in the season
  function muster() {
    allies = [];
    if (season.get('ch7.choir') === 'free') allies.push('choir');
    if (season.get('ch8.builders') === 'freed') allies.push('builders');
    if (season.get('ch4.fee') === 'split') allies.push('cable');
    defenders = [];
    const rng = mulberry32(0xdef0);
    for (let i = 0; i < 40; i++) defenders.push({ a: rng() * Math.PI * 2, r: 0.36 + rng() * 0.12, w: 0.05 + rng() * 0.05, col: [1.2, 1.0, 0.7], on: true });
    const COL = { choir: [0.7, 1.0, 1.6], builders: [1.5, 0.8, 0.4], cable: [1.4, 1.4, 0.6] };
    for (const id of allies) for (let i = 0; i < 12; i++) defenders.push({ a: QUARTER[id] * (Math.PI / 2) + 0.2 + rng() * 1.2, r: 0.42 + rng() * 0.16, w: 0.03 + rng() * 0.04, col: COL[id], on: true, ally: id });
  }
  // a pass's columns: each on a straight line from the edge of the chart to a section of the ring
  function deploy(w) {
    const W = SIEGE_WAVES[w];
    const rng = mulberry32(0x9a70 + w * 131);
    columns = [];
    enemies = [];
    for (let k = 0; k < W.columns; k++) {
      const a = W.from + (k / W.columns) * Math.PI * 2 + (rng() - 0.5) * 0.3;
      const from = [Math.cos(a) * 1.02, Math.sin(a) * 1.02], to = [Math.cos(a + W.bend) * RING_OUT, Math.sin(a + W.bend) * RING_OUT];
      // an ally in that quarter has already thinned it
      const q = Math.floor((((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 2));
      const thin = allies.some((id) => QUARTER[id] === q) ? C.SIEGE_ALLY_THIN : 0;
      columns.push({ from, to });
      const n = Math.round(C.SIEGE_COLUMN * (1 - thin));
      for (let i = 0; i < n; i++) enemies.push({ c: k, lag: i * 0.012 + rng() * 0.006, off: (rng() - 0.5) * 0.03, alive: true, hit: false, x: from[0], z: from[1] });
    }
    flagAt = W.flag ? { from: [Math.cos(W.flag) * 0.8, Math.sin(W.flag) * 0.8], to: [Math.cos(W.flag + 0.5) * 0.46, Math.sin(W.flag + 0.5) * 0.46] } : null;
    const p = trackGeo.attributes.position;
    for (let k = 0; k < 16; k++) {
      const c = columns[k];
      p.setXYZ(k * 2, c ? c.from[0] * AR : 0, -2, c ? c.from[1] * AR : 0);
      p.setXYZ(k * 2 + 1, c ? c.to[0] * AR : 0, -2, c ? c.to[1] * AR : 0);
    }
    p.needsUpdate = true;
    broken = reached = 0;
    wake = [];
  }
  // where everything is at `u` of a pass (0..1): the grey on their lines, the flagship on its
  function place(u, d) {
    let n = 0;
    for (const e of enemies) {
      const c = columns[e.c];
      const k = Math.min(1, Math.max(0, u * 1.25 - e.lag));
      const nx = c.to[1] - c.from[1], nz = -(c.to[0] - c.from[0]);
      e.x = c.from[0] + (c.to[0] - c.from[0]) * k + nx * e.off;
      e.z = c.from[1] + (c.to[1] - c.from[1]) * k + nz * e.off;
      if (e.alive && k >= 1 && !e.hit) {
        // reached the ring: a hit on the section it was forecast to reach
        e.hit = true;
        reached++;
        const sg = segs[segOf(e.x, e.z)];
        if (decision() !== 'evac') sg.hp = Math.max(0, sg.hp - 1 / C.SIEGE_HITS);
      }
      _p.set(e.x * AR, 0, e.z * AR);
      _q.setFromEuler(_e.set(0, Math.atan2(c.to[0] - c.from[0], c.to[1] - c.from[1]), 0));
      enemyMesh.setMatrixAt(n++, _m.compose(_p, _q, _s.setScalar(e.alive && !e.hit ? 1 : 0)));
    }
    for (; n < MAXE; n++) enemyMesh.setMatrixAt(n, _m.compose(_p.set(0, -9999, 0), _q, _s.setScalar(0)));
    enemyMesh.instanceMatrix.needsUpdate = true;
    if (flagAt) {
      const fx = flagAt.from[0] + (flagAt.to[0] - flagAt.from[0]) * u, fz = flagAt.from[1] + (flagAt.to[1] - flagAt.from[1]) * u;
      flag.position.set(fx * AR, 0, fz * AR);
      zone.position.set(fx * AR, -1, fz * AR);
      flag.rotation.y = Math.atan2(flagAt.to[0] - flagAt.from[0], flagAt.to[1] - flagAt.from[1]);
    }
    flag.visible = zone.visible = !!flagAt;
    defenders.forEach((f, i) => {
      // (pulled in to cover the lifeboats, they close on the ring)
      const r = decision() === 'evac' ? RING_OUT + 0.05 : f.r;
      f.a += f.w * d;
      _p.set(Math.cos(f.a) * r * AR, 6 * Math.sin(f.a * 3 + i), Math.sin(f.a) * r * AR);
      defMesh.setMatrixAt(i, _m.compose(_p, _q.setFromEuler(_e.set(0, -f.a, 0)), _s.setScalar(f.on ? 1 : 0)));
      defMesh.setColorAt(i, _c.setRGB(f.col[0], f.col[1], f.col[2]));
    });
    for (let i = defenders.length; i < DEF; i++) defMesh.setMatrixAt(i, _m.compose(_p.set(0, -9999, 0), _q, _s.setScalar(0)));
    defMesh.instanceMatrix.needsUpdate = true;
    defMesh.instanceColor.needsUpdate = true;
    segs.forEach((sg, i) => {
      const k = sg.hp / C.SIEGE_SEG_HP;
      sg.m.material.color.setRGB(0.12 + 1.2 * k, 0.12 + 1.0 * k, 0.14 + 0.7 * k);
      sg.m.position.y = -sg.away * 260;
      sg.m.position.x = Math.cos(((i + 0.5) / SEG) * Math.PI * 2) * sg.away * 180;
      sg.m.position.z = Math.sin(((i + 0.5) / SEG) * Math.PI * 2) * sg.away * 180;
    });
  }
  // a point along the drawn pass, k 0..1 by length
  function along(k) {
    const t = Math.min(1, Math.max(0, k)) * path.len;
    let i = 1;
    while (i < path.pts.length - 1 && path.at[i] < t) i++;
    const a = path.pts[i - 1], b = path.pts[i], span = path.at[i] - path.at[i - 1] || 1;
    const f = (t - path.at[i - 1]) / span;
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
  }
  function setPath(strokes) {
    // every stroke, end to end, in the order drawn
    const pts = [];
    for (const s of strokes) for (const p of s) pts.push([p[0], -p[1]]); // (the pad's y is up; the chart's z is down the screen)
    if (pts.length < 2) return false;
    const at = [0];
    for (let i = 1; i < pts.length; i++) at.push(at[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    path = { pts, at, len: at[at.length - 1] };
    return path.len > 0.05;
  }

  // --- the chart, as the pad paints it under the ink ---
  function paintChart(g, w, h) {
    const X = (x) => (x * 0.5 + 0.5) * w, Y = (z) => (z * 0.5 + 0.5) * h, R = (r) => r * 0.5 * w;
    g.fillStyle = '#02060c';
    g.fillRect(0, 0, w, h);
    g.lineWidth = Math.max(1, w * 0.002);
    // the lines they will keep to
    g.setLineDash([w * 0.012, w * 0.012]);
    g.strokeStyle = 'rgba(150, 160, 176, 0.55)';
    for (const c of columns) {
      g.beginPath();
      g.moveTo(X(c.from[0]), Y(c.from[1]));
      g.lineTo(X(c.to[0]), Y(c.to[1]));
      g.stroke();
    }
    g.setLineDash([]);
    g.fillStyle = 'rgba(190, 198, 210, 0.9)';
    for (const c of columns) {
      // the column itself, where it stands now
      for (let i = 0; i < 9; i++) {
        const k = -i * 0.012;
        g.beginPath();
        g.arc(X(c.from[0] + (c.to[0] - c.from[0]) * k), Y(c.from[1] + (c.to[1] - c.from[1]) * k), w * 0.006, 0, Math.PI * 2);
        g.fill();
      }
    }
    if (flagAt) {
      // the flagship's guns: everywhere they will reach during the pass
      g.fillStyle = 'rgba(255, 60, 40, 0.16)';
      g.strokeStyle = 'rgba(255, 80, 60, 0.9)';
      for (let k = 0; k <= 1.001; k += 0.125) {
        g.beginPath();
        g.arc(X(flagAt.from[0] + (flagAt.to[0] - flagAt.from[0]) * k), Y(flagAt.from[1] + (flagAt.to[1] - flagAt.from[1]) * k), R(C.SIEGE_ZONE), 0, Math.PI * 2);
        g.fill();
      }
      g.beginPath();
      g.arc(X(flagAt.from[0]), Y(flagAt.from[1]), R(C.SIEGE_ZONE), 0, Math.PI * 2);
      g.stroke();
    }
    // the port and its outer ring, section by section
    g.strokeStyle = 'rgba(255, 220, 160, 0.95)';
    g.lineWidth = w * 0.006;
    g.beginPath();
    g.arc(X(0), Y(0), R(RING_IN), 0, Math.PI * 2);
    g.stroke();
    segs.forEach((sg, i) => {
      const a0 = (i / SEG) * Math.PI * 2 + 0.03, a1 = ((i + 1) / SEG) * Math.PI * 2 - 0.03;
      g.strokeStyle = sg.hp > 0 ? `rgba(255, 235, 190, ${0.35 + 0.6 * (sg.hp / C.SIEGE_SEG_HP)})` : 'rgba(90, 60, 60, 0.7)';
      g.beginPath();
      g.arc(X(0), Y(0), R(RING_OUT), a0, a1);
      g.stroke();
    });
    // the defence
    for (const f of defenders) {
      g.fillStyle = `rgb(${Math.min(255, f.col[0] * 170)}, ${Math.min(255, f.col[1] * 170)}, ${Math.min(255, f.col[2] * 170)})`;
      g.fillRect(X(Math.cos(f.a) * f.r) - w * 0.003, Y(Math.sin(f.a) * f.r) - w * 0.003, w * 0.006, w * 0.006);
    }
  }
  function plan() {
    phase = 'plan';
    deploy(wave);
    place(0, 0);
    light.visible = wakeLine.visible = false;
    openDrawPad({ ...SIEGE.pad, back: paintChart, minInk: 0.25 }, (strokes) => {
      if (!setPath(strokes)) return plan();
      phase = 'fly';
      flyT = 0;
      dead = false;
      uiSound('engage');
    });
  }

  // --- the scenes ---
  function begin(kind, clock) {
    scene = { kind, clock };
    chapterHud.panel((panelText = null));
    chapterHud.cine(true);
    clock.begin();
  }
  const introClock = createSceneClock({
    T: C.SIEGE_INTRO_T, lines: SIEGE.intro, say: (l) => say(l, 6),
    pose(u) {
      place(Math.min(0.25, u * 0.012), 0.016);
    },
    onEnd() {
      scene = null;
      chapterHud.cine(false);
      // who came, said once, before the first pass
      if (!saidAllies) {
        saidAllies = true;
        if (allies.length) for (const id of allies) later.push(SIEGE.allies[id]);
        else later.push(SIEGE.allies.none);
      }
      phase = 'ready';
    },
  });
  let fallClock = null;
  function beginFall() {
    const evac = decision() === 'evac';
    // how it went, fixed now. Given up, the ring's people are out but for the sections already dark;
    // held, they are out of the sections still standing and no others.
    const lit = standing();
    const saved = evac ? Math.max(lit, SEG - 1) : lit;
    const debtors = season.get('ch5.thieves') === 'held' ? (evac || segs[2].hp > 0 ? 'out' : 'lost') : null;
    outcome = { how: evac ? 'evacuated' : 'held', saved, of: SEG, allies: allies.length, debtors };
    const lines = [...SIEGE.fall.open, ...(evac ? SIEGE.fall.evac : SIEGE.fall.hold), ...(debtors ? [[18, SIEGE.fall.debtors[debtors]]] : []), ...SIEGE.fall.close].sort((a, b) => a[0] - b[0]);
    phase = 'fall';
    light.visible = wakeLine.visible = false;
    fallClock = createSceneClock({
      T: C.SIEGE_FALL_T, lines, say: (l) => say(l, 6.5),
      pose(u) {
        // the sections go dark in turn, and come away; the grey stop where they are
        segs.forEach((sg, i) => {
          const k = ease(3 + i * 1.4, 7 + i * 1.4, u);
          sg.hp = Math.min(sg.hp, C.SIEGE_SEG_HP * (1 - k));
          sg.away = ease(6 + i * 1.4, C.SIEGE_FALL_T, u);
        });
        place(1, 0.016);
        setEventRumble(0.5 * (1 - ease(20, C.SIEGE_FALL_T, u)));
      },
      onEnd() {
        scene = null;
        chapterHud.cine(false);
        setEventRumble(0);
        fixed.resolve('siege', outcome.how, { saved: outcome.saved, of: outcome.of, allies: outcome.allies, debtors: outcome.debtors });
        season.set('ch10.saved', outcome.saved);
        season.survive(KEY); // the choice has been lived through: it stays made
        S.adv10('done');
        site.portal = 'concourse:deck';
      },
    });
    begin('fall', fallClock);
  }

  // --- the choice, before the last pass ---
  function ask() {
    if (asking || isDialogueOpen() || scene || isDrawPadOpen()) return;
    asking = true;
    season.offer(KEY, 'siege:ask', { wave });
    const sides = SIEGE.ask.sides.filter((s) => chapter.crew().some((c) => c.id === s.by)).map((s) => `${chapter.crew().find((c) => c.id === s.by).short} — ${s.text}`);
    openDialogue({
      speaker: SIEGE.dockmaster, cine: { kind: 'comm', from: SIEGE.ask.from }, lines: [...SIEGE.ask.lines, ...sides],
      offer: { kind: 'choice', prompt: SIEGE.ask.prompt, options: [{ label: SIEGE.ask.evac, outcomeTag: 'siege:evac' }, { label: SIEGE.ask.hold, outcomeTag: 'siege:hold' }] },
    }, {
      onOffer: (offer) => {
        const option = offer.outcomeTag === 'siege:evac' ? 'evac' : offer.outcomeTag === 'siege:hold' ? 'hold' : null;
        if (!option || !decide(option)) return null;
        return { speaker: SIEGE.dockmaster, cine: { kind: 'comm', from: SIEGE.ask.from }, lines: SIEGE.chose[option] };
      },
      onClose: () => {
        asking = false;
        askT = 5; // unanswered: asked again
        if (decision()) phase = 'ready';
      },
    });
  }
  function decide(option) {
    if (phase !== 'ask' || (option !== 'evac' && option !== 'hold')) return false;
    season.offer(KEY, 'siege:ask', { wave });
    season.decide(KEY, option);
    uiSound('engage');
    return true;
  }
  // lost on the last pass: the choice is unmade, and it is asked again
  function unmake() {
    if (!decision() || season.pending()?.key !== KEY) return false;
    season.die();
    return true;
  }

  const panel = () => {
    const rows = phase === 'idle' || phase === 'forecast' || scene ? [] : [`${SIEGE.hud.wave}${Math.min(wave + 1, SIEGE_WAVES.length)} / ${SIEGE_WAVES.length}`, `${SIEGE.hud.ring}${standing()} / ${SEG}`];
    const text = rows.length ? rows.join('\n') : null;
    if (text !== panelText) chapterHud.panel((panelText = text));
  };

  const surfaces = [{ kind: 'disc', cx: 0, cz: 0, r: 1.2, y: 0 }];
  const site = {
    group,
    planet: { group: { position: ZERO }, sunDir: UP },
    noShip: true,
    hidePilot: true, // seated at the chart, behind the camera
    exit: { x: 0, z: 0 },
    leaveHint: SIEGE.pad.title,
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
    heldPrompt: () => (scene ? SIEGE.skip : null),
    camera(pos, target) {
      // over the chart, and a little round it as the battle goes
      const a = 1.2 + wave * 0.35 + (scene ? scene.clock.u() * 0.012 : flyT * 0.02);
      pos.set(Math.cos(a) * 420, 760, Math.sin(a) * 420 + 260);
      target.set(0, 0, 0);
      return true;
    },
    setWalker() {},
    onEnter() {
      if (inside) return;
      inside = true;
      site.portal = null;
      group.visible = true;
      prev = { fog: ctx.scene.fog, lightI: sun.light.intensity, ambI: sun.ambient.intensity };
      ctx.scene.fog = null;
      sun.light.intensity = 0;
      sun.ambient.intensity = 0;
      if (ctx.hideFleet) ctx.hideFleet();
      for (const sg of segs) {
        sg.hp = C.SIEGE_SEG_HP;
        sg.away = 0;
      }
      muster();
      wave = 0;
      scene = null;
      later.length = 0;
      if (deathLine) later.push({ text: deathLine, sec: 8 });
      deathLine = null;
      saidAllies = saidFlag = asking = false;
      panelText = null;
      outcome = null;
      deploy(0);
      place(0, 0);
      light.visible = wakeLine.visible = false;
      phase = 'forecast';
    },
    onLeave() {
      setMusicArea(1);
      if (!inside) return;
      inside = false;
      if (S.st10() !== 'done') unmake(); // (left before the ring fell: the choice is to be made again)
      if (scene) {
        scene.clock.stop();
        scene = null;
      }
      closeDrawPad();
      group.visible = false;
      setEventRumble(0);
      chapterHud.clear();
      chapterHud.panel(null);
      panelText = null;
      phase = 'idle';
      ctx.scene.fog = prev.fog;
      sun.light.intensity = prev.lightI;
      sun.ambient.intensity = prev.ambI;
      prev = null;
    },
    inside: () => inside,
    tick(dt) {
      if (inside) setMusicArea(0);
      chapterHud.tick(dt);
      const d = Math.min(dt, 0.1);
      const shown = !!scene; // (a frame that began in a scene ends in it)
      if (scene) scene.clock.tick(d);
      if (shown || isDrawPadOpen()) return;
      if (later.length && !isDialogueOpen() && chapterHud.state().line == null) {
        const l = later.shift();
        if (l.by !== undefined) say(l, 7);
        else chapterHud.say(l.text, l.sec || 7);
      }
      if (phase === 'forecast' && !isDialogueOpen()) {
        // the fixed event's forecast, before any of it (src/fixedEvents.js)
        phase = 'wait';
        openDialogue(fixed.forecast('siege'), { onClose: () => begin('intro', introClock) });
      } else if (phase === 'ready' && !isDialogueOpen() && later.length === 0 && chapterHud.state().line == null) {
        if (SIEGE_WAVES[wave].flag && !saidFlag) {
          saidFlag = true;
          later.push(SIEGE.flagship);
        } else plan();
      } else if (phase === 'fly') {
        flyT += d;
        const u = Math.min(1, flyT / C.SIEGE_FLY);
        const [lx, lz] = along(u);
        const [nx, nz] = along(u + 0.01);
        light.visible = wakeLine.visible = true;
        light.position.set(lx * AR, 4, lz * AR);
        light.rotation.y = Math.atan2(nx - lx, nz - lz);
        wake.push([lx, lz, flyT]);
        while (wake.length && flyT - wake[0][2] > C.SIEGE_WAKE) wake.shift();
        const wp = wakeGeo.attributes.position;
        for (let i = 0; i < WAKE_N; i++) {
          const p = wake[Math.min(wake.length - 1, Math.floor((i / (WAKE_N - 1)) * (wake.length - 1)))];
          wp.setXYZ(i, p[0] * AR, 3, p[1] * AR);
        }
        wp.needsUpdate = true;
        place(u, d);
        // what the pass breaks: anything grey near where the ship is, or has just been
        for (const e of enemies) {
          if (!e.alive || e.hit) continue;
          for (let i = wake.length - 1; i >= 0; i -= 2) {
            if (Math.hypot(e.x - wake[i][0], e.z - wake[i][1]) < C.SIEGE_CUT) {
              e.alive = false;
              broken++;
              break;
            }
          }
        }
        // the flagship's circle
        if (flagAt && !dead) {
          const fx = flagAt.from[0] + (flagAt.to[0] - flagAt.from[0]) * u, fz = flagAt.from[1] + (flagAt.to[1] - flagAt.from[1]) * u;
          if (Math.hypot(lx - fx, lz - fz) < C.SIEGE_ZONE) {
            dead = true;
            chapterHud.white(0.8);
            uiSound('impact');
          }
        }
        if (dead) {
          // lost: the pass is drawn again; on the last pass, the choice is unmade first
          light.visible = wakeLine.visible = false;
          afterT = 1.6;
          phase = 'lost';
        } else if (u >= 1) {
          chapterHud.say(SIEGE.after[Math.min(wave, SIEGE.after.length - 1)], 5);
          afterT = 3;
          phase = 'after';
        }
      } else if (phase === 'lost') {
        afterT -= d;
        chapterHud.white(Math.max(0, afterT / 1.6) * 0.8);
        if (afterT <= 0) {
          chapterHud.white(0);
          // (sections hit on this pass stay hit only if the pass is flown through)
          if (wave === SIEGE_WAVES.length - 1 && unmake()) {
            chapterHud.say(SIEGE.deathAsk, 7);
            phase = 'ask';
            askT = 4;
          } else {
            chapterHud.say(SIEGE.death, 6);
            phase = 'ready';
          }
        }
      } else if (phase === 'after') {
        afterT -= d;
        if (afterT <= 0) {
          wave++;
          if (wave >= SIEGE_WAVES.length) beginFall();
          else if (wave === SIEGE_WAVES.length - 1 && !decision()) {
            phase = 'ask';
            askT = 1.5;
            deploy(wave);
            place(0, 0);
          } else phase = 'ready';
        }
      } else if (phase === 'ask' && !asking) {
        askT -= d;
        if (askT <= 0) ask();
      }
      panel();
    },
    // lost on the last pass, and come back by the door ('siege:ask'): nothing to do but be asked
    info: () => ({
      inside, phase, wave, scene: scene ? { kind: scene.kind, u: +scene.clock.u().toFixed(2) } : null, pad: isDrawPadOpen(),
      enemies: enemies.length, alive: enemies.filter((e) => e.alive && !e.hit).length, broken, reached, ring: segs.map((s) => +s.hp.toFixed(2)), standing: standing(),
      allies, flag: flagAt, columns: columns.map((c) => ({ from: c.from.map((v) => +v.toFixed(3)), to: c.to.map((v) => +v.toFixed(3)) })), decision: decision(), outcome, panel: panelText,
    }),
    dbg: {
      skip: () => (scene ? scene.clock.skip() : false),
      decide,
      ask,
      // jump to a pass, as if the ones before had been flown
      wave(n) {
        if (!inside || scene || isDrawPadOpen()) return false;
        wave = Math.max(0, Math.min(SIEGE_WAVES.length - 1, n));
        phase = wave === SIEGE_WAVES.length - 1 && !decision() ? 'ask' : 'ready';
        askT = 0.5;
        saidFlag = true;
        return true;
      },
    },
  };
  return site;
}
