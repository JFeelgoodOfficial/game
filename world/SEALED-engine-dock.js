// SEALED: the owner has not played this yet. Do not open.
//
// Season 1, chapters 12 and 13: the gantry. An old berth on the rim of the
// engine, with the pair of black holes turning in front of it and the vessel
// of Entry Zero slung at its far end. Both chapters begin and end here.
//
// A site for the platform walker (src/capitalWalk.js), in the world, docked at
// by the freighter. `S` is the system's story (world/SEALED-engine-ship.js).

import * as THREE from 'three';
import { C } from '../src/constants.js';
import { sun } from '../src/sun.js';
import { chapterHud } from '../src/chapterHud.js';
import { openDialogue, isDialogueOpen } from '../src/dialogue.js';
import { setEventRumble } from '../src/sfx.js';
import { tint, box, cyl, mergedMesh, floorOf } from './capital.js';
import { buildRig, poseRig } from './aliens.js';
import { measureRig, standRig } from './rigGround.js';
import { createSceneClock, crewSay } from './sceneClock.js';
import { createCrewFollow } from './crewFollow.js';
import { buildBinary, strain } from './SEALED-engine-ship.js';
import { ENW } from './SEALED-engine-words.js';

const ZERO = new THREE.Vector3();
const SNAP = 1.2;
const PAD_Z = 40, PAD_R = 22, END_Z = -52, HW = 7;
const HATCH = [0, END_Z + 4], ENVOY = [4.6, END_Z + 12];
const CENTRE = new THREE.Vector3(0, -420, -4300);

export function createEngineDock(ctx, S) {
  const { chapter, fixed } = ctx;
  const group = new THREE.Group();
  const surfaces = [], colliders = [];
  {
    const lit = [], glow = [];
    lit.push(tint(cyl(PAD_R + 2, PAD_R + 4, 2, 0, -1, PAD_Z, 32), 0x2a2e36), tint(cyl(PAD_R, PAD_R, 0.14, 0, 0.07, PAD_Z, 32), 0x444b58));
    surfaces.push({ kind: 'disc', cx: 0, cz: PAD_Z, r: PAD_R + 1.6, y: 0.14 });
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      glow.push(tint(box(0.8, 0.12, 0.8, Math.cos(a) * (PAD_R + 0.6), 0.16, PAD_Z + Math.sin(a) * (PAD_R + 0.6)), 0xffb070, 1.5));
    }
    const z0 = PAD_Z - PAD_R + 2, z1 = END_Z;
    lit.push(tint(box(HW * 2 + 1, 1.4, z0 - z1, 0, -0.56, (z0 + z1) / 2), 0x2a2e36));
    surfaces.push({ kind: 'rect', cx: 0, cz: (z0 + z1) / 2, ux: 0, uz: 1, hl: (z0 - z1) / 2, hw: HW, yA: 0.14, yB: 0.14 });
    for (const s of [-1, 1]) {
      lit.push(tint(box(0.3, 1.1, z0 - z1, s * HW, 0.7, (z0 + z1) / 2), 0x444b58));
      for (let z = z1 + 4; z < z0; z += 9) glow.push(tint(box(0.2, 0.2, 0.2, s * (HW - 0.2), 1.3, z), 0x9fd8ff, 1.3));
    }
    // old ribs under it: this was built by other hands than the rest
    for (let z = z1; z < z0; z += 12) lit.push(tint(box(HW * 2 + 6, 0.8, 1.2, 0, -1.6, z), 0x3a3430));
    // the davit, and the vessel on it
    lit.push(tint(cyl(0.4, 0.5, 9, -3.4, 4.5, END_Z + 1, 8), 0x444b58), tint(box(7, 0.5, 0.5, 0, 8.8, END_Z + 1), 0x444b58));
    lit.push(tint(new THREE.CapsuleGeometry(1.7, 3.6, 4, 12).rotateX(Math.PI / 2).translate(0, 3.2, END_Z - 3.4), 0x18222c));
    glow.push(tint(new THREE.SphereGeometry(0.5, 10, 8).translate(0, 3.2, END_Z - 6.6), 0xeaffff, 1.6));
    lit.push(tint(box(1.5, 1.1, 0.8, HATCH[0] + 3.4, 0.7, HATCH[1] - 1), 0x39424e));
    glow.push(tint(box(1.2, 0.06, 0.6, HATCH[0] + 3.4, 1.28, HATCH[1] - 1), 0x9fe8ff, 1.5));
    colliders.push({ x: HATCH[0] + 3.4, z: HATCH[1] - 1, r: 1.0, top: Infinity }, { x: -3.4, z: END_Z + 1, r: 0.8, top: Infinity });
    group.add(mergedMesh(lit, new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x15171c })));
    group.add(mergedMesh(glow, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false })));
  }
  // the pair, in front of the gantry, and the machine round them
  const pair = buildBinary({ r: 240, sep: 950, engine: true });
  pair.group.position.copy(CENTRE);
  pair.group.rotation.x = 0.16;
  group.add(pair.group);

  // her, if chapter 9 left her aboard
  const envoy = measureRig(buildRig(0x10e7e, 'concourse'));
  envoy.group.position.set(ENVOY[0], 0.14, ENVOY[1]);
  envoy.group.rotation.y = Math.PI;
  group.add(envoy.group);
  const crew = createCrewFollow({ group, floorY: 0.14, talk: ctx.crewTalk });

  let walker = null, walkerLive = null, inside = false, prev = null, scene = null, panelText = null, forecastOpen = false, saidGone = false;
  const later = [];
  const say = (line, sec) => crewSay(chapter, line, sec);
  const arriveClock = createSceneClock({
    T: C.EN_S1, lines: ENW.arrive, say: (l) => say(l, 6.5),
    pose() {},
    onEnd() {
      scene = null;
      chapterHud.cine(false);
      S.advA('en_1');
      if (!S.envoy() && !saidGone) {
        saidGone = true;
        later.push({ text: ENW.envoyGone, sec: 8 });
      }
    },
  });
  const P = () => (S.a() === 'en_5' ? 2.2 : C.EN_P1); // the turn: sixteen seconds, and later, nothing like

  const site = {
    group,
    planet: { group: { position: ZERO }, sunDir: ctx.sunDir },
    surfaces,
    colliders,
    floorYAt: floorOf(surfaces, SNAP),
    snap: SNAP,
    pad: new THREE.Vector3(0, 0.14, PAD_Z),
    padR: PAD_R,
    spawn: new THREE.Vector3(6, 0.14, PAD_Z - 9),
    fromVessel: new THREE.Vector3(0, 0.14, HATCH[1] + 5),
    leaveHint: ENW.dock.leaveHint,
    npcs: [
      {
        get x() { return S.envoy() && !S.reachedB('ex_5') ? ENVOY[0] : 1e6; }, y: 0.14, get z() { return S.envoy() && !S.reachedB('ex_5') ? ENVOY[1] : 1e6; }, h: 2.6,
        talk: () => ({ speaker: ENW.envoy, lines: S.reachedA('en_4') ? [ENW.envoyHere[1]] : ENW.envoyHere, cine: true }),
      },
      ...crew.npcs,
    ],
    consoles: [
      { x: HATCH[0] + 3.4, y: 0.14, z: HATCH[1] + 0.8, r: 2.8, prompt: ENW.dock.board12, off: () => !!scene || S.a() === 'en_0' || S.reachedA('en_4'), use: () => ((site.portal = 'en:reach'), null) },
      { x: HATCH[0] + 3.4, y: 0.14, z: HATCH[1] + 0.8, r: 2.8, prompt: ENW.dock.board13, off: () => !!scene || !S.reachedB('ex_1') || S.reachedB('ex_5'), use: () => ((site.portal = 'en:core'), null) },
    ],
    portal: null,
    onChoice: () => null,
    mark() {
      if (scene) return null;
      const want = (S.a() !== 'en_0' && !S.reachedA('en_4')) || (S.reachedB('ex_1') && !S.reachedB('ex_5'));
      return want ? { x: HATCH[0] + 3.4, z: HATCH[1] + 0.8, label: 'VESSEL' } : null;
    },
    held: () => !!scene,
    act() {
      if (scene) scene.clock.skip();
    },
    heldPrompt: () => (scene ? ENW.skip : ''),
    camera(pos, target) {
      if (!scene) return false;
      const u = Math.max(0, scene.clock.u());
      // off to one side of the gantry, so the pair is not behind the davit
      pos.set(26 - u * 0.2, 7 + u * 0.12, PAD_Z - 4 - u * 0.5);
      target.set(4, -3, -80);
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
      prev = { fog: ctx.scene.fog, lightColor: sun.light.color.clone(), lightI: sun.light.intensity, ambColor: sun.ambient.color.clone(), ambI: sun.ambient.intensity };
      // no star: what lights the gantry is what is falling in
      sun.light.color.setRGB(1.0, 0.72, 0.5);
      sun.light.intensity = 0.9;
      sun.ambient.color.setRGB(0.75, 0.7, 0.8);
      sun.ambient.intensity = 0.7;
      scene = null;
      later.length = 0;
      panelText = null;
      forecastOpen = false;
      // back out of the vessel with a part of it done
      if (S.a() === 'en_4') S.advA('en_5');
      if (S.b() === 'ex_5') S.advB('ex_6');
      crew.set(ctx.voyage.crew());
      if (S.a() === 'en_0') {
        scene = { clock: arriveClock };
        chapterHud.cine(true);
        arriveClock.begin();
      }
    },
    onLeave() {
      if (!inside) return;
      inside = false;
      if (scene) {
        scene.clock.stop();
        scene = null;
        S.advA('en_1'); // (left in the middle of it: it has been seen)
      }
      crew.set([]);
      setEventRumble(0);
      chapterHud.clear();
      chapterHud.panel(null);
      panelText = null;
      ctx.scene.fog = prev.fog;
      sun.light.color.copy(prev.lightColor);
      sun.light.intensity = prev.lightI;
      sun.ambient.color.copy(prev.ambColor);
      sun.ambient.intensity = prev.ambI;
      prev = null;
    },
    inside: () => inside,
    update(dt, t) {
      const p = P();
      const merged = S.reachedB('ex_5') ? 1 : 0;
      pair.pose((t / p) * Math.PI * 2, S.a() === 'en_5' ? 0.5 : 1, merged ? 0 : strain(t, p) * C.EN_P2, merged);
      envoy.group.visible = !!S.envoy() && !S.reachedB('ex_5');
    },
    tick(dt, t) {
      chapterHud.tick(dt);
      const d = Math.min(dt, 0.1);
      if (!walker) return;
      const shown = !!scene; // (a frame that began in a scene ends in it)
      if (envoy.group.visible) {
        poseRig(envoy, d, t, 'idle', 0);
        standRig(envoy, 0.14);
      }
      // the wave is felt in the deck
      if (!S.reachedB('ex_5')) setEventRumble(Math.abs(strain(t, P())) * 0.5);
      if (scene) scene.clock.tick(d);
      if (shown) return;
      // chapter 13: the merger's forecast, before any of it (src/fixedEvents.js)
      if (S.open13() && S.b() === 'ex_0' && !forecastOpen && !isDialogueOpen()) {
        forecastOpen = true;
        openDialogue(fixed.forecast('merger'), {
          onClose: () => {
            forecastOpen = false;
            S.advB('ex_1');
          },
        });
      }
      if (later.length && !isDialogueOpen() && chapterHud.state().line == null) {
        const l = later.shift();
        if (l.by !== undefined) say(l, 7);
        else chapterHud.say(l.text, l.sec || 7);
      }
      crew.tick(dt, t, walkerLive);
      const a = S.a(), b = S.b();
      const text = b === 'ex_6' || (a === 'en_5' && !S.open13()) ? ENW.hud.done : (a !== 'en_0' && !S.reachedA('en_4')) || (S.reachedB('ex_1') && !S.reachedB('ex_5')) ? ENW.hud.board : null;
      if (text !== panelText) chapterHud.panel((panelText = text));
    },
    pair: { centre: CENTRE, keep: 2700 },
    places: { pad: [6, PAD_Z - 9], hatch: [HATCH[0] + 3.4, HATCH[1] + 2.4], envoy: [ENVOY[0] - 2.2, ENVOY[1] + 1.6] },
    info: () => ({ inside, scene: scene ? { kind: 'arrive', u: +scene.clock.u().toFixed(2) } : null, envoy: envoy.group.visible, panel: panelText }),
    dbg: { skip: () => (scene ? scene.clock.skip() : false) },
  };
  return site;
}
