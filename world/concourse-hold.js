// Berth forty, lower dock: the hold of the cutter that took the fragments
// (GDD 5.7.9; Season 1, chapter 5).
//
// A small steel room. The three recorders the fragments were copied into, a
// warden, the two who did it, and one thing that is not the archive's: a
// sealed case, four hundred years old, with a forecast in it that describes
// the day it is opened.
//
// A site for the platform walker (src/capitalWalk.js), walked under the pause
// (look `dive`), reached by the door `concourse:hold` and left by
// `concourse:deck`. `S` is the system's story (world/concourse-system.js).

import * as THREE from 'three';
import { C } from '../src/constants.js';
import { sun } from '../src/sun.js';
import { chapterHud } from '../src/chapterHud.js';
import { openDialogue, isDialogueOpen } from '../src/dialogue.js';
import { uiSound } from '../src/sfx.js';
import { tint, box, cyl, mergedMesh } from './capital.js';
import { buildRig, poseRig } from './aliens.js';
import { measureRig, standRig } from './rigGround.js';
import { createSceneClock, crewSay } from './sceneClock.js';
import { createCrewFollow } from './crewFollow.js';
import { APPR } from './appraisal-dialogue.js';

const ZERO = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const HW = 9, HL = 13; // the hold: x -9..9, z -13..13
const CASE = [0, -8.5], THIEVES = [[-5.5, -2], [-5.8, 1.2]], WARDEN = [-2.6, -0.6], DOOR = [0, 11.5];
const REC = [[4.6, -4], [5.6, -1.6], [4.4, 0.8]];

export function createConcourseHold(ctx, S) {
  const { chapter } = ctx;
  const group = new THREE.Group();
  group.visible = false;
  ctx.scene.add(group);
  const colliders = [];
  {
    const lit = [], glow = [];
    lit.push(tint(box(HW * 2, 0.4, HL * 2, 0, -0.2, 0), 0x2a2e36), tint(box(HW * 2, 0.4, HL * 2, 0, 5.2, 0), 0x1c1f26));
    for (const s of [-1, 1]) lit.push(tint(box(0.4, 5.4, HL * 2, s * HW, 2.5, 0), 0x232730), tint(box(HW * 2, 5.4, 0.4, 0, 2.5, s * HL), 0x232730));
    for (let z = -HL + 2; z < HL; z += 4) for (const s of [-1, 1]) lit.push(tint(box(0.3, 5.2, 0.5, s * (HW - 0.3), 2.5, z), 0x343a46)); // ribs
    for (let z = -8; z <= 8; z += 8) glow.push(tint(box(1.6, 0.08, 0.5, 0, 4.95, z), 0xffe0b0, 1.3));
    // crates the fragments were to leave in
    for (const [x, z, w] of [[5.4, -6.2, 2.0], [6.2, 3.4, 1.6], [4.2, 5.2, 1.3], [-6.4, 6, 1.8]]) {
      lit.push(tint(box(w, w, w, x, w / 2, z), 0x5a4a3a));
      colliders.push({ x, z, r: w * 0.7, top: Infinity });
    }
    // the bench the two of them are sat on
    lit.push(tint(box(1.3, 0.6, 6, -6.6, 0.3, -0.4), 0x3a3f4a));
    // the case, on a crate of its own
    lit.push(tint(box(2.2, 1.0, 1.6, CASE[0], 0.5, CASE[1] - 1.6), 0x5a4a3a), tint(box(1.3, 0.34, 0.9, CASE[0], 1.17, CASE[1] - 1.6), 0xd8d4c8));
    glow.push(tint(box(1.34, 0.05, 0.1, CASE[0], 1.2, CASE[1] - 1.14), 0xf4f0e4, 1.2)); // its seal
    colliders.push({ x: CASE[0], z: CASE[1] - 1.6, r: 1.3, top: Infinity });
    lit.push(tint(cyl(0.9, 0.9, 0.2, DOOR[0], 0.1, DOOR[1], 14), 0x343a46));
    glow.push(tint(new THREE.TorusGeometry(0.8, 0.06, 6, 24).rotateX(Math.PI / 2).translate(DOOR[0], 0.24, DOOR[1]), 0xff8a5a, 1.4));
    group.add(mergedMesh(lit, new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x0c0d10 })));
    group.add(mergedMesh(glow, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false })));
  }
  // the recorders: one fragment's worth of light in each
  const recs = REC.map(([x, z], i) => {
    const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.34, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color().setHSL(0.5 + i * 0.13, 0.7, 0.62), fog: false }));
    m.position.set(x, 1.5 + i * 0.25, z);
    group.add(m);
    return m;
  });
  const figure = (seed, x, z, yaw, k) => {
    const rig = measureRig(buildRig(seed, 'concourse'));
    rig.group.scale.setScalar(k);
    rig.group.position.set(x, 0, z);
    rig.group.rotation.y = yaw;
    group.add(rig.group);
    return rig;
  };
  const figs = [figure(0x71e1, THIEVES[0][0], THIEVES[0][1], Math.PI / 2, 0.92), figure(0x71e2, THIEVES[1][0], THIEVES[1][1], Math.PI / 2, 0.86), figure(0xa2de, WARDEN[0], WARDEN[1], -Math.PI / 2, 1.08)];
  const crew = createCrewFollow({ group, floorY: 0, talk: ctx.crewTalk });

  let walker = null, walkerLive = null, inside = false, prev = null, scene = null, panelText = null, opened = false;
  const later = [];
  const say = (line, sec) => crewSay(chapter, line, sec);
  const holdClock = createSceneClock({
    T: C.CONC_HOLD_T, lines: APPR.hold, say: (l) => say(l, 6),
    pose() {},
    onEnd() {
      scene = null;
      chapterHud.cine(false);
    },
  });
  // the forecast: who it names is whoever is aboard, by the names they have
  function sealed() {
    const names = chapter.crew().map((c) => c.name.toUpperCase());
    const crewLine = names.length ? APPR.sealed.crewSome.replace('{crew}', names.join(', ')) : APPR.sealed.crewNone;
    return { speaker: APPR.sealed.speaker, cine: { kind: 'comm', from: APPR.sealed.from }, lines: APPR.sealed.lines.map((l) => l.replace('{crewLine}', crewLine)) };
  }
  const thiefTalk = () => {
    if (S.reached5('found')) return { speaker: APPR.thief, lines: APPR.thiefAgain, cine: true };
    if (!opened) return { speaker: APPR.thief, lines: [APPR.thieves[0]], cine: true };
    S.offerJudge();
    return { speaker: APPR.thief, lines: APPR.thieves, cine: true, offer: { kind: 'choice', prompt: APPR.judge.prompt, options: [{ label: APPR.judge.hold, outcomeTag: 'appr:hold' }, { label: APPR.judge.free, outcomeTag: 'appr:free' }] } };
  };

  const site = {
    group,
    planet: { group: { position: ZERO }, sunDir: UP },
    noShip: true,
    exit: { x: DOOR[0], z: DOOR[1] },
    leaveHint: APPR.hud.out,
    surfaces: [],
    colliders,
    floorYAt: (x, z) => (Math.abs(x) < HW - 0.7 && Math.abs(z) < HL - 0.7 ? 0 : -Infinity),
    snap: 1.2,
    pad: new THREE.Vector3(),
    spawn: new THREE.Vector3(DOOR[0], 0, DOOR[1] - 2.5),
    spawnYaw: Math.PI,
    npcs: [
      ...THIEVES.map(([x, z]) => ({ x, y: 0, z, h: 2.3, talk: thiefTalk })),
      { x: WARDEN[0], y: 0, z: WARDEN[1], h: 2.8, talk: () => ({ speaker: APPR.warden, lines: [APPR.thieves[2]], cine: true }) },
      ...crew.npcs,
    ],
    consoles: [
      {
        x: CASE[0], y: 0, z: CASE[1], r: 2.6, prompt: APPR.prompts.case, off: () => opened || !!scene,
        use() {
          opened = true;
          S.sawSealed();
          uiSound('engage');
          later.push(APPR.sealedCrew);
          return sealed();
        },
      },
      { x: DOOR[0], y: 0, z: DOOR[1], r: 2.2, prompt: APPR.prompts.out, off: () => !S.reached5('found'), use: () => ((site.portal = 'concourse:deck'), null) },
    ],
    portal: null,
    onChoice(tag) {
      const option = tag === 'appr:hold' ? 'held' : tag === 'appr:free' ? 'freed' : null;
      if (!option || !S.judge(option)) return null;
      uiSound('engage');
      later.push(APPR.judgeCrew[option === 'held' ? 'hold' : 'free']);
      return { speaker: option === 'held' ? APPR.warden : APPR.thief, lines: option === 'held' ? APPR.held : APPR.freed, cine: true };
    },
    mark: () => (scene ? null : !opened ? { x: CASE[0], z: CASE[1], label: APPR.hud.case } : null),
    held: () => !!scene,
    act() {
      if (scene) scene.clock.skip();
    },
    heldPrompt: () => (scene ? APPR.skip : ''),
    camera(pos, target) {
      if (!scene) return false;
      const u = Math.max(0, scene.clock.u()), k = u / C.CONC_HOLD_T;
      // along the hold from the door: the recorders, then round to the case at the far end
      pos.set(-2 + 3 * k, 2.4, 9 - 9 * k);
      target.set(4.6 - 4.6 * Math.max(0, (k - 0.55) / 0.45), 1.4, -3 - 5 * Math.max(0, (k - 0.55) / 0.45));
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
      group.visible = true;
      prev = { fog: ctx.scene.fog, lightPos: sun.light.position.clone(), lightColor: sun.light.color.clone(), lightI: sun.light.intensity, ambColor: sun.ambient.color.clone(), ambI: sun.ambient.intensity };
      ctx.scene.fog = null;
      sun.light.position.set(0.2, 1, 0.3).normalize();
      sun.light.color.setRGB(1.0, 0.9, 0.78);
      sun.light.intensity = 1.0;
      sun.ambient.color.setRGB(0.8, 0.74, 0.7);
      sun.ambient.intensity = 0.85;
      later.length = 0;
      panelText = null;
      opened = S.sealedSeen();
      // the two of them are here until it is settled; taken up, or gone, after
      const here = !S.reached5('found');
      figs[0].group.visible = figs[1].group.visible = here;
      figs[2].group.visible = here;
      crew.set(ctx.voyage.crew());
      scene = null;
      if (!opened) {
        scene = { kind: 'hold', clock: holdClock };
        chapterHud.cine(true);
        holdClock.begin();
      }
    },
    onLeave() {
      if (!inside) return;
      inside = false;
      if (scene) {
        scene.clock.stop();
        scene = null;
      }
      group.visible = false;
      crew.set([]);
      chapterHud.clear();
      chapterHud.panel(null);
      panelText = null;
      ctx.scene.fog = prev.fog;
      sun.light.position.copy(prev.lightPos);
      sun.light.color.copy(prev.lightColor);
      sun.light.intensity = prev.lightI;
      sun.ambient.color.copy(prev.ambColor);
      sun.ambient.intensity = prev.ambI;
      prev = null;
    },
    inside: () => inside,
    tick(dt, t) {
      chapterHud.tick(dt);
      const d = Math.min(dt, 0.1);
      recs.forEach((m, i) => {
        m.rotation.y = t * (0.8 + i * 0.3);
        m.position.y = 1.5 + i * 0.25 + 0.08 * Math.sin(t * 1.4 + i);
      });
      if (!walker) return;
      for (const r of figs) {
        if (!r.group.visible) continue;
        poseRig(r, d, t, 'idle', 0);
        standRig(r, 0);
      }
      if (scene) {
        scene.clock.tick(d);
        return;
      }
      if (later.length && !isDialogueOpen() && chapterHud.state().line == null) say(later.shift(), 7);
      crew.tick(dt, t, walkerLive);
      const text = S.reached5('found') ? APPR.hud.out : opened ? null : APPR.hud.case;
      if (text !== panelText) chapterHud.panel((panelText = text));
    },
    places: { door: [DOOR[0], DOOR[1] - 2.5], case: CASE, thief: [THIEVES[0][0] + 2.4, THIEVES[0][1]] },
    info: () => ({ inside, opened, scene: scene ? { kind: scene.kind, u: +scene.clock.u().toFixed(2) } : null, panel: panelText, thieves: figs[0].group.visible }),
    dbg: { skip: () => (scene ? scene.clock.skip() : false), sealed: () => sealed().lines },
  };
  return site;
}
