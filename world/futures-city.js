// Futures: the square of a city on a perfect clock (GDD 5.7.9; Season 1,
// chapter 6).
//
// A world that sold its future. Everyone in the square is where a forecast
// put them three hundred years ago, to the second: each walks one beat,
// between a door and a place in the square, on a period of their own, and the
// whole of it is a function of one clock (`ct`). That is what makes them
// predictable in the plain sense: the board in the corner of the screen says
// who will reach where and in how long, and they do.
//
//   the board    Three people are watched being on time: stand where the
//                board says as each arrives. The fourth is forecast to sit
//                down on the south bench on the hour, and does not come.
//   the late one Everyone on schedule wears a lit band at the ankle. One woman
//                does not, and is walking the square the other way round.
//   the offer    The Keeper of Hours offers the light ship a forecast of its
//                own. Lux wants it. SIGN, or talk her down.
//   afterwards   The late one is walked back to her bench, either way.
//
// Nothing here is past known physics except the premise: that a forecast
// could be this good. A city this size is a chaotic system, and no
// measurement is fine enough to forecast one for an afternoon, let alone
// three centuries. That is the Foregone's whole claim, and the season's
// fiction.
//
// A site for the platform walker (src/capitalWalk.js), in the world, docked at
// by the freighter. `story` is the chapter's stage machine (world/futures-system.js).

import * as THREE from 'three';
import { C } from '../src/constants.js';
import { sun } from '../src/sun.js';
import { cWalk } from '../src/capitalWalk.js';
import { chapterHud } from '../src/chapterHud.js';
import { openDialogue, isDialogueOpen } from '../src/dialogue.js';
import { mulberry32 } from '../src/noise2.js';
import { uiSound, chime } from '../src/sfx.js';
import { tint, box, cyl, mergedMesh } from './capital.js';
import { buildRig, poseRig } from './aliens.js';
import { measureRig, standRig } from './rigGround.js';
import { createSceneClock, crewSay } from './sceneClock.js';
import { createCrewFollow } from './crewFollow.js';
import { FUT } from './futures-dialogue.js';

const ZERO = new THREE.Vector3();
const RP = 84; // the square
const PAD = [0, 124], PAD_R = 20;
const KEEPER = [0, 10];
const STATIONS = [[0, -58], [58, 0], [-58, 0], [0, 58]]; // north lamp, east table, west step, south bench
const N_CIT = 16;
const LATE = 3; // which of them is Derry Lome
const KEY = 'ch6.signed';
const mmss = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export function createFuturesCity(ctx, story) {
  const { chapter, season, fixed } = ctx;
  const group = new THREE.Group();
  const colliders = [{ x: 0, z: 0, r: 5.4, top: Infinity }];
  const litMat = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x141210 });
  const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false });
  const hourLamps = [];
  {
    const lit = [], glow = [];
    const rng = mulberry32(0xf0706);
    // the ground under it all, the square, the way from the pad
    lit.push(tint(cyl(260, 260, 4, 0, -2.1, 20, 48), 0x6a6458), tint(cyl(RP, RP, 0.12, 0, 0.0, 0, 64), 0xb8ae98));
    lit.push(tint(box(14, 0.12, PAD[1] - RP + 6, 0, 0.0, (PAD[1] + RP) / 2 - 3), 0xb8ae98), tint(cyl(PAD_R, PAD_R, 0.14, PAD[0], 0.02, PAD[1], 32), 0x8a8474));
    // rings in the paving, one for each quarter of the hour
    for (const r of [20, 40, 60, 80]) lit.push(tint(new THREE.TorusGeometry(r, 0.18, 4, 96).rotateX(Math.PI / 2).translate(0, 0.08, 0), 0x7a7262));
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      glow.push(tint(box(0.7, 0.12, 0.7, PAD[0] + Math.cos(a) * (PAD_R - 0.7), 0.16, PAD[1] + Math.sin(a) * (PAD_R - 0.7)), 0xfff0c8, 1.4));
    }
    // the clock: a tower, four faces, and twelve lamps round its foot that light in turn
    lit.push(tint(cyl(3.4, 4.6, 34, 0, 17, 0, 12), 0xd8ceb8), tint(cyl(5.2, 3.4, 3, 0, 35.5, 0, 12), 0xc8b890), tint(new THREE.ConeGeometry(4.2, 9, 12).translate(0, 41.5, 0), 0x8a7a5a));
    for (let i = 0; i < 4; i++) glow.push(tint(new THREE.CircleGeometry(2.3, 24).translate(0, 30, 3.6).rotateY((i / 4) * Math.PI * 2), 0xfff4d8, 1.3));
    // what the four are forecast at: a lamp, a table, a step, a bench
    lit.push(tint(cyl(0.16, 0.22, 5, STATIONS[0][0], 2.5, STATIONS[0][1], 8), 0x5a5448));
    lit.push(tint(cyl(1.6, 1.6, 0.14, STATIONS[1][0], 1.0, STATIONS[1][1], 16), 0x8a6a4a), tint(cyl(0.16, 0.4, 1.0, STATIONS[1][0], 0.5, STATIONS[1][1], 8), 0x5a5448));
    lit.push(tint(box(5, 0.5, 2.4, STATIONS[2][0], 0.25, STATIONS[2][1]), 0x9a9080), tint(cyl(0.5, 0.6, 1.4, STATIONS[2][0] - 2, 1.2, STATIONS[2][1], 10), 0xc8a040));
    lit.push(tint(box(4.4, 0.5, 1.3, STATIONS[3][0] + 6, 0.5, STATIONS[3][1]), 0x8a6a4a), tint(box(4.4, 1.0, 0.2, STATIONS[3][0] + 6, 1.1, STATIONS[3][1] + 0.6), 0x8a6a4a));
    colliders.push({ x: STATIONS[1][0], z: STATIONS[1][1], r: 1.7, top: Infinity }, { x: STATIONS[3][0] + 6, z: STATIONS[3][1], r: 1.6, top: Infinity });
    // the city round the square: every house the same height, every door the same distance apart
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2, r = RP + 16;
      if (Math.abs(Math.sin(a)) < 0.2 && Math.cos(a) < 0) continue;
      if (Math.abs(a - Math.PI / 2) < 0.18) continue; // the way in from the pad
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      lit.push(tint(box(11, 14, 14, 0, 7, 0).rotateY(-a).translate(x, 0, z), [0xe0d6c0, 0xd8cab0, 0xe6dccc][i % 3]));
      lit.push(tint(box(11.4, 2.2, 14.4, 0, 15, 0).rotateY(-a).translate(x, 0, z), 0xa8685a));
      glow.push(tint(box(0.2, 1.4, 1.0, -5.6, 5, 0).rotateY(-a).translate(x, 0, z), 0xffe0a0, 1.0));
    }
    for (let i = 0; i < 26; i++) {
      const a = rng() * Math.PI * 2, r = RP + 40 + rng() * 120;
      if (Math.abs(a - Math.PI / 2) < 0.3 && r < 150) continue;
      const h = 12 + rng() * 14;
      lit.push(tint(box(14, h, 14, Math.cos(a) * r, h / 2, Math.sin(a) * r + 20), 0xd0c6b0));
    }
    group.add(mergedMesh(lit, litMat));
    group.add(mergedMesh(glow, glowMat));
  }
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), new THREE.MeshBasicMaterial({ color: 0x4a4436, fog: false }));
    m.position.set(Math.sin(a) * 7.4, 1.6, -Math.cos(a) * 7.4);
    group.add(m);
    hourLamps.push(m);
  }
  const northLamp = new THREE.Mesh(new THREE.SphereGeometry(0.6, 10, 8), new THREE.MeshBasicMaterial({ color: 0x4a4436, fog: false }));
  northLamp.position.set(STATIONS[0][0], 5.3, STATIONS[0][1]);
  group.add(northLamp);

  // --- the people: one beat each, all of it from the clock ---
  const figure = (seed, k) => {
    const rig = measureRig(buildRig(seed, 'futures'));
    rig.group.scale.setScalar(k);
    group.add(rig.group);
    return rig;
  };
  const ringGeo = new THREE.TorusGeometry(0.34, 0.05, 5, 16).rotateX(Math.PI / 2);
  const citizens = [];
  {
    const rng = mulberry32(0x0c10c);
    for (let i = 0; i < N_CIT; i++) {
      const a = (i / N_CIT) * Math.PI * 2 + 0.2;
      const home = [Math.cos(a) * (RP - 6), Math.sin(a) * (RP - 6)];
      const to = i < 4 ? STATIONS[i] : [Math.cos(a + 1.9) * (18 + rng() * 44), Math.sin(a + 1.9) * (18 + rng() * 44)];
      const c = { i, rig: figure(0x6000 + i * 4099, 0.9 + rng() * 0.2), home, to, P: i < 3 ? [44, 52, 60][i] : 36 + Math.floor(rng() * 6) * 6, off: i < 3 ? 0 : Math.floor(rng() * 40), x: 0, z: 0, yaw: 0, moving: false, band: null };
      if (i !== LATE) {
        c.band = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 1.6, 0.9), fog: false }));
        c.band.position.y = 0.16;
        c.rig.group.add(c.band);
      }
      citizens.push(c);
    }
  }
  const keeper = figure(0x4e33, 1.06);
  keeper.group.position.set(KEEPER[0], 0, KEEPER[1]);
  const wardens = [figure(0x3a71, 1.1), figure(0x3a72, 1.08)];
  for (const w of wardens) w.group.visible = false;
  const derry = citizens[LATE];
  const bucket = () => (story.reached('found') ? 'after' : 'early');
  const crew = createCrewFollow({
    group, floorY: 0,
    talk: (c) => ({ speaker: { name: c.name, species: c.species, cityId: FUT.city.name }, lines: FUT.ground[c.id][bucket()], cine: true }),
  });

  // --- state ---
  let ct = 0; // the city's clock (seconds): everyone's place is a function of it
  let walker = null, walkerLive = null, inside = false, prev = null;
  let scene = null, snapD = null, pending = null; // a scene to begin once nobody is being talked to
  let forecastOpen = false, said = -1, since = -1, panelText = null;
  let seen = 0, hourT = -1, lastPhase = [0, 0, 0], hinted = false;
  const later = [];
  const say = (line, sec) => crewSay(chapter, line, sec);
  const luxAboard = () => chapter.crew().some((c) => c.id === 'lux');

  // where citizen c is at clock t: out to their place, a while there, back, a while at their door
  function place(c, t) {
    if (c === derry && !story.reached('done')) {
      // the late one: round the square the other way, at her own pace
      const a = 2.2 - t * 0.03;
      c.x = Math.cos(a) * 66;
      c.z = Math.sin(a) * 66;
      c.yaw = Math.atan2(Math.sin(a), -Math.cos(a));
      c.moving = true;
      return;
    }
    if (c === derry) {
      c.x = STATIONS[3][0] + 6;
      c.z = STATIONS[3][1] - 1.2;
      c.yaw = Math.PI;
      c.moving = false;
      return;
    }
    const ph = (((t + c.off) / c.P) % 1 + 1) % 1;
    const k = ph < 0.35 ? ph / 0.35 : ph < 0.5 ? 1 : ph < 0.85 ? 1 - (ph - 0.5) / 0.35 : 0;
    c.x = c.home[0] + (c.to[0] - c.home[0]) * k;
    c.z = c.home[1] + (c.to[1] - c.home[1]) * k;
    c.moving = ph < 0.35 || (ph >= 0.5 && ph < 0.85);
    const out = ph < 0.5 ? 1 : -1;
    c.yaw = Math.atan2((c.to[0] - c.home[0]) * out, (c.to[1] - c.home[1]) * out);
  }
  const untilArrive = (c) => {
    const ph = (((ct + c.off) / c.P) % 1 + 1) % 1;
    return ((0.35 - ph + 1) % 1) * c.P;
  };
  function poseAll(d, t, live) {
    for (const c of citizens) {
      place(c, ct);
      c.rig.group.position.x = c.x;
      c.rig.group.position.z = c.z;
      c.rig.group.rotation.y = c.yaw;
      if (live) {
        poseRig(c.rig, d, t, c.moving ? 'walk' : 'idle', 0.25);
        standRig(c.rig, 0);
      }
    }
  }

  // --- the scenes ---
  function begin(kind, clock) {
    scene = { kind, clock };
    chapterHud.panel((panelText = null));
    chapterHud.cine(true);
    clock.begin();
  }
  // the hour: every one of them moves on the same tick
  const hourClock = createSceneClock({
    T: C.FUT_CLOCK_T, lines: FUT.clock, say: (l) => say(l, 6),
    pose(u) {
      // (for the length of it everyone is set to step off together)
      for (const c of citizens) {
        if (c === derry) continue;
        const k = Math.min(1, Math.max(0, (u - 2) / 9));
        c.rig.group.position.x = c.home[0] + (c.to[0] - c.home[0]) * k;
        c.rig.group.position.z = c.home[1] + (c.to[1] - c.home[1]) * k;
        c.rig.group.rotation.y = Math.atan2(c.to[0] - c.home[0], c.to[1] - c.home[1]);
        c.moving = k > 0 && k < 1;
      }
      if (u > 2 && u < 2.2) chime(196);
    },
    onEnd() {
      scene = null;
      chapterHud.cine(false);
      story.advance('welcomed');
    },
  });
  // the correction: two wardens, at the pace of the clock
  const fixClock = createSceneClock({
    T: C.FUT_FIX_T, lines: FUT.correction, say: (l) => say(l, 6),
    pose(u) {
      const k1 = Math.min(1, u / 7), k2 = Math.min(1, Math.max(0, (u - 8) / (C.FUT_FIX_T - 9)));
      const bx = STATIONS[3][0] + 6, bz = STATIONS[3][1] - 1.2;
      const dx = snapD[0] + (bx - snapD[0]) * k2, dz = snapD[1] + (bz - snapD[1]) * k2;
      derry.rig.group.position.set(dx, derry.rig.group.position.y, dz);
      derry.rig.group.rotation.y = k2 > 0 && k2 < 1 ? Math.atan2(bx - snapD[0], bz - snapD[1]) : derry.rig.group.rotation.y;
      derry.moving = k2 > 0 && k2 < 1;
      wardens.forEach((w, i) => {
        w.group.visible = true;
        const s = i ? 1.6 : -1.6;
        const wx = KEEPER[0] + (snapD[0] + s - KEEPER[0]) * k1 + (dx - snapD[0]) * (k2 > 0 ? 1 : 0), wz = KEEPER[1] + (snapD[1] - KEEPER[1]) * k1 + (dz - snapD[1]) * (k2 > 0 ? 1 : 0);
        w.group.position.x = wx;
        w.group.position.z = wz;
        w.group.rotation.y = Math.atan2((k2 > 0 ? bx : snapD[0]) - wx, (k2 > 0 ? bz : snapD[1]) - wz);
      });
    },
    onEnd() {
      scene = null;
      chapterHud.cine(false);
      for (const w of wardens) w.group.visible = false;
      story.advance('done');
    },
  });

  // --- the Keeper of Hours ---
  const lines = (speaker, l) => ({ speaker, lines: l, cine: true });
  function keeperTalk() {
    const st = story.stage();
    if (st === 'forecast') {
      pending = 'hour';
      return lines(FUT.keeper, FUT.welcome);
    }
    if (st === 'welcomed' || st === 'predicted') return lines(FUT.keeper, FUT.welcomeAgain);
    if (st === 'missed') return lines(FUT.keeper, FUT.keeperMissed);
    if (st === 'found') {
      season.offer(KEY, 'futures:ask', { stage: 'found' }); // the checkpoint, as the decision is shown
      later.push(FUT.offerCrew);
      const lux = luxAboard();
      return { ...lines(FUT.keeper, FUT.offer), offer: { kind: 'choice', prompt: FUT.sign.prompt, options: [{ label: lux ? FUT.sign.yes : FUT.sign.yesSolo, outcomeTag: 'fut:sign' }, { label: lux ? FUT.sign.no : FUT.sign.noSolo, outcomeTag: 'fut:refuse' }] } };
    }
    return lines(FUT.keeper, FUT.keeperAfter);
  }
  function decide(option) {
    if (story.stage() !== 'found' || (option !== 'signed' && option !== 'refused')) return false;
    season.offer(KEY, 'futures:ask', { stage: 'found' });
    season.decide(KEY, option === 'signed');
    season.survive(KEY); // (nothing here can kill: the choice is lived through as it is made)
    fixed.resolve('flood', option === 'signed' ? 'bound' : 'free', { signed: option === 'signed' });
    story.advance('decided');
    uiSound('engage');
    later.length = 0;
    later.push(FUT.signCrew[option]);
    pending = 'fix';
    return true;
  }

  const site = {
    group,
    planet: { group: { position: ZERO }, sunDir: ctx.sunDir },
    surfaces: [],
    colliders,
    floorYAt: (x, z) => (x * x + z * z < RP * RP || (Math.abs(x) < 7 && z > 0 && z < PAD[1]) || Math.hypot(x - PAD[0], z - PAD[1]) < PAD_R + 1.5 ? 0 : -Infinity),
    snap: 1.2,
    pad: new THREE.Vector3(PAD[0], 0.14, PAD[1]),
    padR: PAD_R,
    spawn: new THREE.Vector3(PAD[0] - 6, 0, PAD[1] - 14),
    leaveHint: FUT.city.leaveHint,
    npcs: [
      { x: KEEPER[0], y: 0, z: KEEPER[1], h: 2.8, talk: keeperTalk },
      {
        get x() { return derry.x; }, y: 0, get z() { return derry.z; }, h: 2.5,
        talk() {
          if (!story.reached('missed')) return lines(FUT.citizen, [FUT.foundAgain[0]]);
          if (story.stage() !== 'missed') return lines(FUT.late, FUT.foundAgain);
          story.advance('found');
          later.push(FUT.foundCrew);
          return lines(FUT.late, FUT.found);
        },
      },
      ...crew.npcs,
    ],
    consoles: [],
    portal: null,
    onChoice(tag) {
      const option = tag === 'fut:sign' ? 'signed' : tag === 'fut:refuse' ? 'refused' : null;
      if (!option || !decide(option)) return null;
      return lines(FUT.keeper, option === 'signed' ? FUT.signed : FUT.refused);
    },
    mark() {
      if (scene) return null;
      const st = story.stage();
      if (st === 'forecast' || st === 'found') return { x: KEEPER[0], z: KEEPER[1] + 3, label: FUT.marks.keeper };
      if (st === 'welcomed') return { x: STATIONS[seen][0], z: STATIONS[seen][1], label: FUT.marks.spot };
      if (st === 'predicted') return { x: STATIONS[3][0], z: STATIONS[3][1], label: FUT.marks.spot };
      return null;
    },
    held: () => !!scene,
    act() {
      if (scene) scene.clock.skip();
    },
    heldPrompt: () => (scene ? FUT.skip : ''),
    camera(pos, target) {
      if (!scene) return false;
      const u = Math.max(0, scene.clock.u());
      if (scene.kind === 'hour') {
        // up the clock's side, and round, with the whole square under it
        const a = 1.2 + u * 0.05;
        pos.set(Math.cos(a) * 60, 30 + u * 0.5, Math.sin(a) * 60 + 30);
        target.set(0, 4, 0);
      } else {
        pos.set(snapD[0] * 0.4 + 14, 5, snapD[1] * 0.4 + 30);
        target.set(derry.rig.group.position.x, 1.6, derry.rig.group.position.z);
      }
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
      sun.ambient.color.setRGB(1.0, 0.95, 0.85); // an even, shadowless afternoon: it is always this afternoon
      sun.ambient.intensity = 1.0;
      forecastOpen = false;
      said = story.reached('welcomed') ? 99 : -1;
      since = story.reached('forecast') ? 0 : -1;
      scene = null;
      pending = story.stage() === 'decided' ? 'fix' : null; // (left before she was walked back: it is seen now)
      later.length = 0;
      panelText = null;
      seen = story.reached('predicted') ? 3 : 0;
      hourT = story.stage() === 'predicted' ? C.FUT_HOUR_WAIT : -1;
      hinted = false;
      crew.set(ctx.voyage.crew());
    },
    onLeave() {
      if (!inside) return;
      inside = false;
      if (scene) {
        scene.clock.stop();
        scene = null;
      }
      for (const w of wardens) w.group.visible = false;
      crew.set([]);
      chapterHud.clear();
      chapterHud.panel(null);
      panelText = null;
      sun.ambient.color.copy(prev.ambColor);
      sun.ambient.intensity = prev.ambI;
      prev = null;
    },
    inside: () => inside,
    // every frame the system is mounted: the clock, and everyone on it
    update(dt, t) {
      const d = Math.min(dt, 0.1);
      if (!scene) ct += d;
      const h = Math.floor(ct / 5) % 12;
      hourLamps.forEach((m, i) => m.material.color.setHex(i === h ? 0xfff0b0 : 0x4a4436));
      const lampPh = (((ct + citizens[0].off) / citizens[0].P) % 1 + 1) % 1;
      northLamp.material.color.setHex(lampPh >= 0.35 && lampPh < 0.85 ? 0xfff0b0 : 0x4a4436);
      if (!scene) poseAll(d, t, inside);
      if (derry.band) derry.band.visible = true;
    },
    tick(dt, t) {
      chapterHud.tick(dt);
      const d = Math.min(dt, 0.1);
      if (!walker) return;
      const st = story.stage();
      const shown = !!scene; // (a frame that began in a scene ends in it)
      const kn = Math.hypot(walker.x - KEEPER[0], walker.z - KEEPER[1]) < 10;
      keeper.group.rotation.y = kn ? Math.atan2(walker.x - KEEPER[0], walker.z - KEEPER[1]) : 0;
      poseRig(keeper, d, t, 'idle', 0);
      standRig(keeper, 0);
      if (scene) {
        scene.clock.tick(d);
        for (const c of citizens) {
          poseRig(c.rig, d, t, c.moving ? 'walk' : 'idle', 0.25);
          standRig(c.rig, 0);
        }
        for (const w of wardens) {
          if (!w.group.visible) continue;
          poseRig(w, d, t, 'walk', 0.2);
          standRig(w, 0);
        }
      }
      if (shown) return;

      // --- the forecast: before anything else is done here (src/fixedEvents.js) ---
      if (st === 'arrived' && !forecastOpen && !isDialogueOpen()) {
        forecastOpen = true;
        openDialogue(fixed.forecast('flood'), {
          onClose: () => {
            forecastOpen = false;
            story.advance('forecast');
            since = 0;
          },
        });
      }
      if (since >= 0 && !isDialogueOpen()) {
        since += d;
        while (said + 1 < FUT.arrive.length && since >= FUT.arrive[said + 1][0]) say(FUT.arrive[++said][1], 7);
      }
      if (pending && !isDialogueOpen() && later.length === 0 && chapterHud.state().line == null) {
        const p = pending;
        pending = null;
        if (p === 'hour') begin('hour', hourClock);
        else {
          snapD = [derry.x, derry.z];
          begin('fix', fixClock);
        }
        return;
      }
      if (later.length && !isDialogueOpen() && chapterHud.state().line == null) {
        const l = later.shift();
        if (l.by !== undefined) say(l, 7);
        else chapterHud.say(l.text, l.sec || 7);
      }

      // --- the board: three on time, to the second ---
      if (st === 'welcomed' && seen < 3 && !isDialogueOpen()) {
        const c = citizens[seen];
        const ph = (((ct + c.off) / c.P) % 1 + 1) % 1;
        if (lastPhase[seen] < 0.35 && ph >= 0.35) {
          if (Math.hypot(walker.x - c.to[0], walker.z - c.to[1]) < C.FUT_WATCH_R) {
            chime(262 + seen * 66);
            chapterHud.say(FUT.onTime[seen], 5);
            seen++;
            if (seen === 3) {
              story.advance('predicted');
              hourT = C.FUT_HOUR_WAIT;
            }
          } else chapterHud.say(FUT.missedIt, 5);
        }
        if (seen < 3) lastPhase[seen] = (((ct + citizens[seen].off) / citizens[seen].P) % 1 + 1) % 1;
      }
      // --- the fourth: the hour, the south bench, and nobody ---
      if (st === 'predicted' && hourT >= 0 && !isDialogueOpen()) {
        hourT -= d;
        if (hourT <= 0) {
          hourT = -1;
          chime(196);
          story.advance('missed');
          chapterHud.say(FUT.nobody, 6);
          later.push(FUT.missed, { text: FUT.findHint, sec: 10 });
        }
      }
      crew.tick(dt, t, walkerLive);

      // --- what the corner of the screen says ---
      const rows = [];
      if (st === 'forecast') rows.push(FUT.hud.keeper);
      else if (st === 'welcomed') {
        const b = FUT.board[seen];
        rows.push(`${FUT.hud.next}${b.who} · ${b.where}${FUT.hud.in}${mmss(untilArrive(citizens[seen]))}`, `${FUT.hud.seen}${seen} / 3`, FUT.hud.stand);
      } else if (st === 'predicted') rows.push(`${FUT.hud.next}${FUT.board[3].who} · ${FUT.board[3].where}${FUT.hud.in}${mmss(Math.max(0, hourT))}`, `${FUT.hud.seen}3 / 3`);
      else if (st === 'missed') rows.push(`${FUT.hud.late}${FUT.board[3].who}`, FUT.hud.find);
      else if (st === 'found') rows.push(FUT.hud.back);
      else if (st === 'done') rows.push(FUT.hud.done);
      const text = rows.length ? rows.join('\n') : null;
      if (text !== panelText) chapterHud.panel((panelText = text));
    },
    askAt: () => ({ spawn: new THREE.Vector3(KEEPER[0] + 2.4, 0, KEEPER[1] + 3), yaw: Math.PI }),
    places: { pad: [PAD[0] - 6, PAD[1] - 14], keeper: [KEEPER[0] + 1.6, KEEPER[1] + 2.6], stations: STATIONS },
    info: () => ({
      inside, ct: +ct.toFixed(1), seen, hour: +hourT.toFixed(1), scene: scene ? { kind: scene.kind, u: +scene.clock.u().toFixed(2) } : null, pending,
      next: seen < 3 ? { who: seen, at: citizens[seen].to, in: +untilArrive(citizens[seen]).toFixed(1) } : null,
      late: [+derry.x.toFixed(1), +derry.z.toFixed(1)], citizens: citizens.map((c) => [+c.x.toFixed(1), +c.z.toFixed(1)]), panel: panelText,
    }),
    dbg: {
      skip: () => (scene ? scene.clock.skip() : false),
      decide,
      // run the city's clock on to just before the next of the watched three arrives
      nearly(sec = 1.5) {
        if (seen >= 3) return false;
        ct += Math.max(0, untilArrive(citizens[seen]) - sec);
        lastPhase[seen] = (((ct + citizens[seen].off) / citizens[seen].P) % 1 + 1) % 1;
        return true;
      },
      hour(left = 1) {
        if (hourT < 0) return false;
        hourT = left;
        return true;
      },
    },
  };
  return site;
}
