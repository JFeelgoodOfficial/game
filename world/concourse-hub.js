// The free port: the deck that is walked (GDD 5.7.9; Season 1, chapters 4 and 5).
//
// A ring station at the L4 point of a binary: sixty degrees ahead of the
// smaller star in its orbit, where the pulls of the two stars and the turn of
// the whole system balance, so that a thing put there stays there for nothing
// (a Lagrange point; L4 and L5 are the stable ones, given a heavy enough
// primary). The smaller star is a neutron star, and the port's money is mined
// from the time lost near it (world/concourse-system.js says how).
//
// What is walked is one arm of the ring: berth nine, where the freighter is;
// the dockmaster's desk; the market; a bar; the row of embassies at the far
// end; and a hatch to the lower dock. It is the same deck in every chapter that
// comes back here: who stands on it, and what can be used, is the system's to
// say (`S`), so the place changes as the season goes without being rebuilt.
//
//   chapter 4   the hail on the first step out; the dockmaster (what the money
//               is, the first job); the market's panel; the bar, and who is in it
//   chapter 5   the assessor at the berth; the alarm; the hatch to berth forty
//
// A site for the platform walker (src/capitalWalk.js), in the world, docked at
// by the freighter (src/game.js SYSTEM_DOCK).

import * as THREE from 'three';
import { C } from '../src/constants.js';
import { sun } from '../src/sun.js';
import { cWalk } from '../src/capitalWalk.js';
import { chapterHud } from '../src/chapterHud.js';
import { openDialogue, isDialogueOpen } from '../src/dialogue.js';
import { mulberry32 } from '../src/noise2.js';
import { uiSound } from '../src/sfx.js';
import { tint, box, cyl, mergedMesh } from './capital.js';
import { buildRig, poseRig } from './aliens.js';
import { measureRig, standRig } from './rigGround.js';
import { createSceneClock, crewSay } from './sceneClock.js';
import { createCrewFollow } from './crewFollow.js';
import { CONC } from './concourse-dialogue.js';
import { APPR } from './appraisal-dialogue.js';
import { SIEGE } from './siege-dialogue.js';

const ZERO = new THREE.Vector3();
const HW = 62, Z0 = -112, Z1 = 118; // the deck
const PAD = [0, 92], PAD_R = 20;
const VARN = [-30, 54];
const STALLS = [[-20, 26], [20, 18], [-20, 2], [20, -6], [-20, -22], [20, -30]];
const BAR = { door: [20, -64], x0: 24, x1: 56, z0: -78, z1: -50, seat: [41, -66], envoy: [45, -63], keep: [50, -72] };
const HATCH = [-44, -84];
const ASSESSOR = [-12, 72];
const COMPANION = new THREE.Vector3(-0.6, -0.05, -0.8).normalize(); // toward the smaller star (and the tender)

function glowTexture() {
  const n = 64, data = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const r = Math.hypot(x - n / 2 + 0.5, y - n / 2 + 0.5) / (n / 2);
    const a = Math.max(0, 1 - r);
    const i = (y * n + x) * 4;
    data[i] = data[i + 1] = data[i + 2] = 255;
    data[i + 3] = Math.round(255 * a * a * a);
  }
  const tex = new THREE.DataTexture(data, n, n);
  tex.needsUpdate = true;
  return tex;
}

// ctx: the system's. S: the system's story (world/concourse-system.js): stages, the purse, the market.
export function createConcourseHub(ctx, S) {
  const { chapter } = ctx;
  const group = new THREE.Group();
  const colliders = [];
  const litMat = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x10131a });
  const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false });
  {
    const lit = [], glow = [];
    const rng = mulberry32(0xc0c0);
    // the ring this arm belongs to, turning away below the deck, and its hub
    lit.push(tint(new THREE.TorusGeometry(430, 46, 12, 96).translate(0, -478, 0), 0x2a3140));
    lit.push(tint(new THREE.CylinderGeometry(60, 60, 110, 20).rotateX(Math.PI / 2).translate(0, -478, 0), 0x232a36));
    for (let i = 0; i < 6; i++) lit.push(tint(box(14, 420, 14, 0, 0, 0).translate(0, 210, 0).rotateZ((i / 6) * Math.PI * 2).translate(0, -478, 0), 0x232a36));
    // the deck
    lit.push(tint(box(HW * 2 + 6, 3, Z1 - Z0 + 6, 0, -1.5, (Z0 + Z1) / 2), 0x343c4a));
    lit.push(tint(box(14, 0.06, Z1 - Z0 - 40, 0, 0.03, (Z0 + Z1) / 2 - 10), 0x4a5364)); // the walk down the middle
    for (const s of [-1, 1]) {
      lit.push(tint(box(0.5, 1.2, Z1 - Z0, s * HW, 0.6, (Z0 + Z1) / 2), 0x4a5364));
      for (let z = Z0 + 6; z < Z1; z += 12) glow.push(tint(box(0.3, 0.3, 0.3, s * (HW - 0.4), 1.35, z), 0x9fd8ff, 1.3));
    }
    // berth nine
    lit.push(tint(cyl(PAD_R, PAD_R, 0.14, PAD[0], 0.07, PAD[1], 32), 0x4a5364));
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      glow.push(tint(box(0.7, 0.12, 0.7, PAD[0] + Math.cos(a) * (PAD_R - 0.7), 0.16, PAD[1] + Math.sin(a) * (PAD_R - 0.7)), 0xffc070, 1.5));
    }
    // the dockmaster's desk: a booth with its back to the rail
    lit.push(tint(box(9, 4.2, 0.4, VARN[0] - 1, 2.1, VARN[1] + 4.2), 0x2c3340), tint(box(0.4, 4.2, 8, VARN[0] - 5.4, 2.1, VARN[1]), 0x2c3340), tint(box(9.6, 0.3, 8.6, VARN[0] - 1, 4.3, VARN[1]), 0x3c4658));
    lit.push(tint(box(4.4, 1.0, 1.1, VARN[0] + 0.4, 0.5, VARN[1] - 1.5), 0x4a5364));
    glow.push(tint(box(4.0, 0.06, 0.8, VARN[0] + 0.4, 1.04, VARN[1] - 1.5), 0xffd9a0, 1.4), tint(box(6, 0.5, 0.1, VARN[0] - 1, 3.4, VARN[1] + 3.95), 0xffb060, 1.5));
    colliders.push({ x: VARN[0] + 0.4, z: VARN[1] - 1.5, r: 0.9, top: Infinity }); // (small: she is talked to across it)
    // the market: open stalls, each under an awning of its own colour
    const AWN = [0xc8553a, 0x3a8fc8, 0xd0a030, 0x5ab06a, 0x9a5ac8, 0xd06a9a];
    STALLS.forEach(([x, z], i) => {
      const s = Math.sign(x);
      lit.push(tint(box(7, 1.0, 4, x + s * 3, 0.5, z), 0x3c4658));
      lit.push(tint(box(8.4, 0.16, 6, x + s * 2.4, 3.4, z).rotateZ(0), AWN[i]));
      for (const dz of [-2.8, 2.8]) lit.push(tint(cyl(0.1, 0.1, 3.4, x - s * 1.4, 1.7, z + dz, 6), 0x6a7384));
      // what is for sale: crates and jars
      for (let k = 0; k < 5; k++) {
        const w = 0.5 + rng() * 0.7;
        lit.push(tint(box(w, w, w, x + s * (1.2 + rng() * 3.6), 1.0 + w / 2, z - 1.4 + rng() * 2.8), [0x8a6a4a, 0x4a7a8a, 0x8a8a5a][k % 3]));
      }
      glow.push(tint(box(0.24, 0.24, 0.24, x - s * 1.4, 3.1, z), 0xfff0c8, 1.5));
      colliders.push({ x: x + s * 3, z, r: 3.2, top: Infinity });
    });
    // the bar: three walls, a counter, a sign
    const bx = (BAR.x0 + BAR.x1) / 2, bz = (BAR.z0 + BAR.z1) / 2, bw = BAR.x1 - BAR.x0, bd = BAR.z1 - BAR.z0;
    lit.push(tint(box(bw, 5, 0.4, bx, 2.5, BAR.z0), 0x3a2c34), tint(box(bw, 5, 0.4, bx, 2.5, BAR.z1), 0x3a2c34), tint(box(0.4, 5, bd, BAR.x1, 2.5, bz), 0x3a2c34), tint(box(bw + 1, 0.3, bd + 1, bx, 5.1, bz), 0x4a3844));
    lit.push(tint(box(1.2, 1.15, bd - 8, BAR.keep[0] - 3, 0.58, bz), 0x5a4038));
    for (let k = 0; k < 5; k++) lit.push(tint(cyl(0.34, 0.3, 0.8, BAR.keep[0] - 4.7, 0.4, BAR.z0 + 6 + k * 3.4, 10), 0x6a5a50));
    for (let k = 0; k < 4; k++) {
      const tx = BAR.x0 + 5 + (k % 2) * 7, tz = BAR.z0 + 6 + Math.floor(k / 2) * 12;
      lit.push(tint(cyl(1.1, 1.1, 0.12, tx, 1.0, tz, 14), 0x5a4038), tint(cyl(0.12, 0.3, 1.0, tx, 0.5, tz, 8), 0x3a2c34));
      colliders.push({ x: tx, z: tz, r: 1.2, top: Infinity });
    }
    glow.push(tint(box(0.1, 0.9, 9, BAR.x0 - 0.3, 4.2, bz), 0xff7ac8, 1.6));
    for (let k = 0; k < 3; k++) glow.push(tint(box(1.4, 0.08, 0.5, BAR.x0 + 6 + k * 10, 4.9, bz), 0xffd8a0, 1.5)); // lamps under the roof
    for (let k = 0; k < 6; k++) glow.push(tint(box(0.18, 0.5, 0.18, BAR.x1 - 0.5, 1.6 + (k % 3) * 0.7, BAR.z0 + 5 + k * 3.2), [0x9fffd0, 0xffd27a, 0xff8a8a][k % 3], 1.3));
    // embassy row, across the end of the arm: a door and a banner for each
    const FLAG = [0x3a8fc8, 0xd0a030, 0xe8e8f0, 0x5ab06a, 0xc8553a];
    for (let i = 0; i < 5; i++) {
      const x = -44 + i * 22;
      lit.push(tint(box(18, 9, 5, x, 4.5, Z0 + 3), 0x2c3340), tint(box(3, 4.4, 0.3, x, 2.2, Z0 + 5.7), 0x1a1f28));
      glow.push(tint(box(1.6, 5.5, 0.12, x + 5.5, 5.6, Z0 + 5.7), FLAG[i], i === 2 ? 1.5 : 0.9)); // (the pale one in the middle is theirs: every scene that needs it knows which)
    }
    // the hatch to the lower dock
    lit.push(tint(cyl(2.6, 2.6, 0.5, HATCH[0], 0.25, HATCH[1], 16), 0x232a36));
    glow.push(tint(new THREE.TorusGeometry(2.3, 0.1, 6, 28).rotateX(Math.PI / 2).translate(HATCH[0], 0.55, HATCH[1]), 0xff8a5a, 1.4));
    group.add(mergedMesh(lit, litMat));
    group.add(mergedMesh(glow, glowMat));
  }
  // the smaller star: a point, and far too bright for its size
  const companion = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0xbfd8ff, map: glowTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  companion.position.copy(COMPANION).multiplyScalar(160000);
  companion.scale.setScalar(9000);
  group.add(companion);

  // --- who is on the deck ---
  const figure = (seed, x, z, yaw, k = 1) => {
    const rig = measureRig(buildRig(seed, 'concourse'));
    rig.group.scale.setScalar(k);
    rig.group.position.set(x, 0, z);
    rig.group.rotation.y = yaw;
    group.add(rig.group);
    return rig;
  };
  const varn = figure(0x7a551, VARN[0] + 0.4, VARN[1], Math.PI, 1.05);
  const keep = figure(0x0055, BAR.keep[0], BAR.keep[1], -Math.PI / 2, 0.95);
  const envoy = figure(0x10e7e, BAR.envoy[0], BAR.envoy[1], -Math.PI / 2, 1.0);
  const assessor = figure(0xa55e5, ASSESSOR[0], ASSESSOR[1], 0.4, 0.98);
  // the bar's regulars, at its tables
  const regulars = [[28, -73, 0.6], [30.4, -71, -2.2], [35, -60, 2.6], [37.6, -58.6, -1.4], [29.4, -59.4, 1.2]].map(([x, z, yaw], i) => figure(0xba20 + i * 3571, x, z, yaw, 0.88 + 0.05 * i));
  // the crowd: a hundred peoples, a dozen of them here, each on a beat of their own
  const crowd = [];
  {
    const rng = mulberry32(0xc20d);
    const N = Math.round(C.CONC_WALKERS);
    for (let i = 0; i < N; i++) {
      const a = [(rng() * 2 - 1) * 10, Z0 + 16 + rng() * (Z1 - Z0 - 60)], b = [(rng() * 2 - 1) * 10, Z0 + 16 + rng() * (Z1 - Z0 - 60)];
      crowd.push({ rig: figure(0x2000 + i * 6151, a[0], a[1], 0, 0.85 + rng() * 0.35), a, b, u: rng(), dir: 1, speed: 0.9 + rng() * 0.9, wait: rng() * 4 });
    }
  }
  const bucket = () => (S.reached4('done') ? 'after' : 'early');
  const crew = createCrewFollow({
    group, floorY: 0,
    talk: (c) => ({ speaker: { name: c.name, species: c.species, cityId: CONC.hub.city }, lines: CONC.ground[c.id][bucket()], cine: true }),
  });

  // --- state ---
  let walker = null, walkerLive = null, inside = false, prev = null;
  let hailOpen = false, said = -1, since = -1, panelText = null, scene = null, alarmT = -1, alarmOpen = false;
  const later = [];
  const say = (line, sec) => crewSay(chapter, line, sec);
  const queue = (...l) => later.push(...l.filter(Boolean));

  // the bar: walked into, once, and who was waiting in it
  const barClock = createSceneClock({
    T: C.CONC_BAR_T, lines: CONC.barScene, say: (l) => say(l, 6),
    pose() {},
    onEnd() {
      scene = null;
      chapterHud.cine(false);
      sun.ambient.intensity = 1.0;
      cWalk.pos.set(BAR.seat[0], 0, BAR.seat[1]);
      cWalk.yaw = Math.atan2(BAR.envoy[0] - BAR.seat[0], BAR.envoy[1] - BAR.seat[1]);
      openDialogue({ speaker: CONC.envoy, lines: CONC.envoyTalk, cine: true }, {
        onClose: () => {
          S.adv4('done');
          queue(CONC.barAfter);
        },
      });
    },
  });

  const npc = (at, h, talk, here) => ({ get x() { return here() ? at[0] : 1e6; }, y: 0, get z() { return here() ? at[1] : 1e6; }, h, talk });
  const speakerLines = (speaker, lines) => ({ speaker, lines, cine: true });
  const npcs = [
    // the dockmaster: what the money is, and the first job
    npc([VARN[0] + 0.4, VARN[1]], 2.7, () => {
      // chapter 10: she is calling every berth
      if (S.open10() && S.st10() !== 'done') {
        const first = S.adv10('called');
        return speakerLines(SIEGE.dockmaster, first ? SIEGE.call : SIEGE.callAgain);
      }
      const st = S.st4();
      if (st === 'docked') {
        queue(CONC.meetCrew);
        return { ...speakerLines(CONC.dockmaster, CONC.meet), offer: { kind: 'choice', prompt: CONC.meetOffer.prompt, options: [{ label: CONC.meetOffer.take, outcomeTag: 'conc:job' }, { label: CONC.meetOffer.later, outcomeTag: 'conc:later' }] } };
      }
      if (st === 'met') return speakerLines(CONC.dockmaster, CONC.meetAgain);
      if (st === 'hauled' || st === 'paid') return speakerLines(CONC.dockmaster, CONC.meetAfter);
      return speakerLines(CONC.dockmaster, CONC.meetBar);
    }, () => true),
    npc(BAR.keep, 2.6, () => speakerLines(CONC.barkeep, CONC.barkeepTalk), () => true),
    // (chapter 9, world/love.js, has her say other things here, and then takes her aboard for good)
    npc(BAR.envoy, 2.6, () => (S.love && S.love.envoyTalk(queue)) || speakerLines(CONC.envoy, CONC.envoyAgain), () => S.reached4('done') && !(S.love && S.love.envoyAway())),
    // chapter 5: the assessor, at the berth
    npc(ASSESSOR, 2.6, () => {
      if (S.st5() !== 'idle') return speakerLines(APPR.assessor, APPR.valueAgain);
      S.adv5('valued');
      queue(APPR.valueCrew);
      alarmT = C.CONC_ALARM_DELAY;
      return speakerLines(APPR.assessor, APPR.value);
    }, () => S.open5() && !S.reached5('tracked')),
    ...crew.npcs,
  ];
  const consoles = [
    ...[STALLS[1], STALLS[2]].map(([x, z]) => ({ x: x - Math.sign(x) * 2.2, y: 0, z, r: 3.2, prompt: CONC.prompts.market, off: () => !S.reached4('paid'), use: () => (S.market('hub'), null) })),
    { x: BAR.door[0], y: 0, z: BAR.door[1], r: 3.4, prompt: CONC.prompts.bar, off: () => S.st4() !== 'traded' || !!scene, use: () => (beginBar(), null) },
    // chapter 10: from the berth, straight to the light ship's helm
    { x: PAD[0] - 7, y: 0, z: PAD[1] - 20, r: 3.4, prompt: SIEGE.prompts.toHelm, off: () => S.st10() !== 'called', use: () => ((site.portal = 'siege:helm'), null) },
    { x: HATCH[0], y: 0, z: HATCH[1], r: 3.4, prompt: APPR.prompts.hatch, off: () => S.st5() !== 'tracked' && S.st5() !== 'found', use: () => ((site.portal = 'concourse:hold'), null) },
  ];
  function beginBar() {
    if (scene || S.st4() !== 'traded') return false;
    scene = { kind: 'bar', clock: barClock };
    chapterHud.panel((panelText = null));
    sun.ambient.intensity = 1.9; // (under its roof: the bar's own lamps)
    chapterHud.cine(true);
    barClock.begin();
    return true;
  }

  const site = {
    group,
    planet: { group: { position: ZERO }, sunDir: ctx.sunDir },
    surfaces: [],
    colliders,
    floorYAt: (x, z) => (Math.abs(x) < HW - 0.6 && z > Z0 + 6.4 && z < Z1 ? 0 : -Infinity),
    snap: 1.2,
    pad: new THREE.Vector3(PAD[0], 0.14, PAD[1]),
    padR: PAD_R,
    spawn: new THREE.Vector3(PAD[0] - 7, 0, PAD[1] - 14),
    fromHatch: new THREE.Vector3(HATCH[0] + 5, 0, HATCH[1] + 3),
    leaveHint: CONC.hub.leaveHint,
    npcs,
    consoles,
    portal: null,
    onChoice(tag) {
      if (tag !== 'conc:job' || !S.takeJob()) return null;
      uiSound('engage');
      return speakerLines(CONC.dockmaster, CONC.meetTaken);
    },
    mark() {
      if (scene) return null;
      const s4 = S.st4(), s5 = S.st5();
      if (s4 === 'docked') return { x: VARN[0] + 0.4, z: VARN[1] - 3.1, label: CONC.marks.varn };
      if (s4 === 'paid') return S.held() ? { x: STALLS[1][0] - 2.2, z: STALLS[1][1], label: CONC.marks.market } : null;
      if (s4 === 'traded') return { x: BAR.door[0], z: BAR.door[1], label: CONC.marks.bar };
      if (S.open10() && S.st10() === 'idle') return { x: VARN[0] + 0.4, z: VARN[1] - 3.1, label: SIEGE.marks.varn };
      if (S.st10() === 'called') return { x: PAD[0] - 7, z: PAD[1] - 20, label: SIEGE.marks.berth };
      if (S.open5() && s5 === 'idle') return { x: ASSESSOR[0], z: ASSESSOR[1], label: APPR.marks.assessor };
      if (s5 === 'tracked') return { x: HATCH[0], z: HATCH[1], label: APPR.marks.hatch };
      if (S.love && S.love.mark('hub')) return { x: BAR.door[0], z: BAR.door[1], label: S.love.mark('hub') }; // chapter 9: she is asking for him
      return null;
    },
    held: () => !!scene,
    act() {
      if (scene) scene.clock.skip();
    },
    heldPrompt: () => (scene ? CONC.skip : ''),
    camera(pos, target) {
      if (!scene) return false;
      // in through the bar's open side, toward the table at the back
      const u = Math.max(0, scene.clock.u()), k = u / C.CONC_BAR_T;
      pos.set(BAR.door[0] - 6 + 16 * k, 2.6 - 0.6 * k, BAR.door[1] + 4 - 4 * k);
      target.set(BAR.envoy[0], 1.9, BAR.envoy[1]);
      return true;
    },
    setWalker(p, live) {
      walker = p || null;
      walkerLive = p ? live || null : null;
    },
    onEnter() {
      if (inside) return;
      inside = true;
      site.portal = null;
      prev = { ambColor: sun.ambient.color.clone(), ambI: sun.ambient.intensity };
      // a lit deck: lamps on every rail, and two stars
      sun.ambient.color.setRGB(0.8, 0.82, 0.95);
      sun.ambient.intensity = 1.0;
      hailOpen = false;
      said = S.reached4('met') ? 99 : -1;
      since = S.reached4('docked') ? 0 : -1;
      scene = null;
      later.length = 0;
      panelText = null;
      alarmOpen = false;
      if (S.st5() === 'valued') alarmT = C.CONC_ALARM_DELAY * 0.5; // (left before the alarm came: it comes now)
      else alarmT = -1;
      // back up from berth forty with it settled: chapter 5 is over, bar the walk to the berth
      if (S.st5() === 'found') S.adv5('done');
      crew.set(ctx.voyage.crew());
    },
    onLeave() {
      if (!inside) return;
      inside = false;
      if (scene) {
        scene.clock.stop();
        scene = null;
      }
      crew.set([]);
      chapterHud.clear();
      chapterHud.panel(null);
      panelText = null;
      sun.ambient.color.copy(prev.ambColor);
      sun.ambient.intensity = prev.ambI;
      prev = null;
    },
    inside: () => inside,
    update() {
      envoy.group.visible = (S.st4() === 'traded' || S.reached4('done')) && !(S.love && S.love.envoyAway());
      assessor.group.visible = S.open5() && !S.reached5('tracked');
    },
    tick(dt, t) {
      chapterHud.tick(dt);
      const d = Math.min(dt, 0.1);
      if (!walker) return;
      // the crowd, and the ones who stand
      for (const m of crowd) {
        const g = m.rig.group.position;
        if (m.wait > 0) {
          m.wait -= d;
          poseRig(m.rig, d, t, 'idle', 0);
        } else {
          const len = Math.hypot(m.b[0] - m.a[0], m.b[1] - m.a[1]) || 1;
          m.u += (m.dir * m.speed * d) / len;
          if (m.u > 1 || m.u < 0) {
            m.u = Math.min(1, Math.max(0, m.u));
            m.dir = -m.dir;
            m.wait = 2 + (m.speed * 7) % 5;
          }
          g.x = m.a[0] + (m.b[0] - m.a[0]) * m.u;
          g.z = m.a[1] + (m.b[1] - m.a[1]) * m.u;
          m.rig.group.rotation.y = Math.atan2((m.b[0] - m.a[0]) * m.dir, (m.b[1] - m.a[1]) * m.dir);
          poseRig(m.rig, d, t, 'walk', 0.3);
        }
        standRig(m.rig, 0);
      }
      for (const r of [varn, keep, envoy, assessor, ...regulars]) {
        if (!r.group.visible) continue;
        poseRig(r, d, t, 'idle', 0);
        standRig(r, 0);
      }
      if (scene) {
        scene.clock.tick(d);
        return;
      }
      // --- chapter 4: the hail, before anything else here ---
      if (S.st4() === 'arrived' && !hailOpen && !isDialogueOpen()) {
        hailOpen = true;
        openDialogue({ speaker: CONC.dockmaster, cine: { kind: 'comm', from: CONC.hail.from }, lines: CONC.hail.lines }, {
          onClose: () => {
            hailOpen = false;
            S.adv4('docked');
            since = 0;
          },
        });
      }
      if (since >= 0 && !isDialogueOpen()) {
        since += d;
        while (said + 1 < CONC.arrive.length && since >= CONC.arrive[said + 1][0]) say(CONC.arrive[++said][1], 7);
      }
      // --- chapter 5: the alarm, a little after the valuation ---
      if (alarmT >= 0 && !isDialogueOpen() && !alarmOpen && S.st5() === 'valued') {
        alarmT -= d;
        if (alarmT <= 0) {
          alarmOpen = true;
          alarmT = -1;
          openDialogue({ speaker: APPR.ship, cine: { kind: 'comm', from: APPR.alarm.from }, lines: APPR.alarm.lines }, {
            onClose: () => {
              alarmOpen = false;
              S.adv5('robbed');
              queue(APPR.alarmCrew);
            },
          });
        }
      }
      if (S.love) S.love.onDeck(queue); // chapter 9: its forecast, before anything else of it
      if (later.length && !isDialogueOpen() && chapterHud.state().line == null) {
        const l = later.shift();
        if (l.by !== undefined) say(l, 7);
        else chapterHud.say(l.text, l.sec || 7);
      }
      crew.tick(dt, t, walkerLive);
      const text = S.panel('hub');
      if (text !== panelText) chapterHud.panel((panelText = text));
    },
    queue,
    places: { pad: [PAD[0] - 7, PAD[1] - 14], varn: [VARN[0] + 0.4, VARN[1] - 3.1], market: [STALLS[1][0] - 2.2, STALLS[1][1]], bar: BAR.door, envoy: BAR.envoy, assessor: ASSESSOR, hatch: HATCH },
    info: () => ({ inside, scene: scene ? { kind: scene.kind, u: +scene.clock.u().toFixed(2) } : null, envoy: envoy.group.visible, assessor: assessor.group.visible, alarm: +alarmT.toFixed(1), panel: panelText, crowd: crowd.length }),
    dbg: { bar: beginBar, skip: () => (scene ? scene.clock.skip() : false), alarm: () => ((alarmT = 0.1), true) },
  };
  return site;
}
