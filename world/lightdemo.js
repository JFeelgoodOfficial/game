// The hangar demo (GDD 5.7.4): a Tenretni takes the light ship out.
//
// The ship goes wherever its pilot imagines. The one at the helm can only
// remember, so the ship goes to every place in the archive, one after another,
// faster and faster, in the same order every time round, and then it is back
// in its yard exactly where it began. Nothing is explained. Two lines are said.
//
// Shown, not played: the place takes the camera (src/capitalWalk.js
// platform.camera) and holds the walker still for about half a minute. It is
// one seekable clock `u`: pose(u) places everything, so leaving half way
// through (the menu, a world reset) only has to pose(0).
//
// The places it goes are not built: for the length of a jump a dome closes
// round the hull and the place is painted on the inside of it from that
// world's fragments (world/chapter-dialogue.js), ground rushing underneath.

import * as THREE from 'three';
import { C } from '../src/constants.js';
import { MOTION_SCALE } from '../src/motion.js';
import { uiSound, setEventRumble } from '../src/sfx.js';
import { chapterHud } from '../src/chapterHud.js';
import { buildRobot } from './capital.js';
import { createPlace } from './holoplace.js';
import { WORLDS, DEMO } from './chapter-dialogue.js';

const T_SURGE = 3.0; // the cells begin to fall in with each other
const T_GO = 7.0; // the first jump
const T_BACK = C.CH_DEMO_BACK; // ...and the last: home
const T_END = T_BACK + 6.5;
const DOME_R = 820;

// hangar: world/lightvessel.js buildHangar(); chapter: src/chapter.js; at: where
// the walker stands to watch, in the city's frame; showCity(on): the city
// round the hangar, put away while the ship is somewhere else.
export function createDemo(group, hangar, chapter, at, showCity) {
  const cellU = hangar.uniforms;
  const center = new THREE.Vector3().copy(hangar.root.position);
  center.z -= 115; // the middle of the hull, bow to drive

  // --- the places it goes (world/holoplace.js) ---
  const place = createPlace(DOME_R);
  const U = place.uniforms;
  const dome = place.mesh;
  dome.position.copy(center);
  group.add(dome);
  const paint = (i) => place.paint(WORLDS[i % WORLDS.length].layers, (i % WORLDS.length) * 7.31 + 1.3);

  // --- the jumps: every world in order, round and round, each sooner than the last ---
  const jumps = [];
  for (let t = T_GO, gap = 2.7; t < T_BACK - 0.2; t += gap, gap = Math.max(0.26, gap * 0.8)) jumps.push(t);

  // --- the one at the helm: on the bow, very tall, facing the way it means to go ---
  const helmMat = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x3a3426 });
  const pilot = buildRobot(helmMat, hangar.glowMat, { body: 0xf3eede, dark: 0xc7a255, glow: 0xfff0c0 });
  pilot.group.scale.setScalar(9);
  pilot.group.position.copy(hangar.helm);
  hangar.vessel.add(pilot.group);
  const dais = new THREE.Mesh(new THREE.CylinderGeometry(16, 20, 5, 6), hangar.glowMat.clone());
  dais.material.vertexColors = false;
  dais.material.color.setRGB(1.5, 1.3, 0.9);
  dais.position.copy(hangar.helm);
  dais.position.y -= 2.5;
  hangar.vessel.add(dais);

  let u = -1; // < 0: not running
  let lastJump = -1;
  let saidAt = -1;
  let phase = 0;
  let away = false; // the city is put away

  const ease = (a, b, x) => {
    const k = Math.min(Math.max((x - a) / (b - a), 0), 1);
    return k * k * (3 - 2 * k);
  };
  // which jump `x` is in (-1 before the first), and how long ago it was
  function jumpAt(x) {
    let k = -1;
    for (let i = 0; i < jumps.length; i++) if (jumps[i] <= x) k = i;
    return k;
  }

  // Everything, from the clock. x <= 0 or past the end: at rest in the yard.
  function pose(x) {
    const flying = x >= T_GO && x < T_BACK;
    const flight = ease(T_SURGE, T_GO, x) * (1 - ease(T_BACK + 0.4, T_BACK + 4, x));
    cellU.uFlight.value = x > 0 ? flight : 0;
    const k = flying ? jumpAt(x) : -1;
    const since = k >= 0 ? x - jumps[k] : x >= T_BACK ? x - T_BACK : 99;
    const hit = Math.exp(-since * 5.5);
    cellU.uFlash.value = x > 0 ? hit * 0.7 : 0;
    dome.visible = flying;
    hangar.yard.visible = !flying;
    if (flying !== away) showCity(!(away = flying));
    U.uFade.value = 0.35 + 0.65 * (1 - Math.exp(-since * 9));
    // the hull lunges at each jump and settles; at rest it is exactly where it was
    hangar.vessel.position.z = flying ? 90 * Math.exp(-since * 2.6) * MOTION_SCALE : 0;
    hangar.vessel.position.y = flying ? 6 * Math.sin(x * 1.7) * MOTION_SCALE : 0;
    return { k, hit, flight };
  }

  // The camera's path: up off the gallery, along the hull while it flies, and
  // back down behind whoever was watching.
  const _a = new THREE.Vector3(), _b = new THREE.Vector3();
  function camera(pos, target) {
    if (u < 0) return false;
    const rise = ease(0.4, 6, u), back = ease(T_BACK + 1.5, T_END - 0.3, u);
    const run = Math.max(u - T_GO, 0);
    // from just behind the walker...
    _a.set(at.x + 9, 4.2, at.z + 3);
    // ...to a slow pass down the side of the hull
    _b.set(center.x + 300 - 26 * Math.sin(u * 0.17), 34 + 62 * Math.sin(u * 0.11 + 0.4), center.z + 330 - run * 19);
    pos.copy(_a).lerp(_b, rise * (1 - back));
    _a.set(center.x, 40, center.z + 240);
    _b.set(center.x, 28, center.z + 120 - run * 9);
    target.copy(_a).lerp(_b, rise * (1 - back));
    return true;
  }

  function stop() {
    u = -1;
    lastJump = -1;
    saidAt = -1;
    pose(0);
    setEventRumble(0);
    chapterHud.clear();
  }

  return {
    // the place to stand and ask (a console in world/lightcity.js)
    console: {
      x: at.x, y: 0, z: at.z, r: 5.5, prompt: DEMO.prompt,
      off: () => chapter.stage() !== 'demo' || u >= 0,
      use() {
        u = 0;
        lastJump = -1;
        saidAt = -1;
        chapterHud.cine(true);
        uiSound('engage');
        return null;
      },
    },
    held: () => u >= 0,
    camera,
    stop,
    tick(dt, t) {
      // the helm is manned only while there is something to show
      const waiting = chapter.stage() === 'demo';
      pilot.group.visible = dais.visible = waiting || u >= 0;
      if (u < 0) return;
      u += dt;
      chapterHud.tick(dt);
      const { k, hit, flight } = pose(u);
      // flight carries the cells round the spectrum faster than time does
      phase += dt * flight * (0.25 + 0.5 * ease(T_GO, T_BACK, u));
      cellU.uPhase.value = phase;
      U.uTime.value = t;
      if (k !== lastJump && k >= 0) {
        lastJump = k;
        paint(k);
        uiSound('select');
      }
      if (lastJump >= 0 && u >= T_BACK) {
        lastJump = -1;
        uiSound('impact');
      }
      chapterHud.white(hit * 0.85);
      setEventRumble(flight * 0.6);
      for (let i = 0; i < DEMO.lines.length; i++) {
        if (i > saidAt && u >= DEMO.lines[i][0]) {
          saidAt = i;
          chapterHud.say(DEMO.lines[i][1], 5);
        }
      }
      pilot.head.rotation.y = 0.5 * Math.sin(u * 0.6) * (1 - flight);
      if (u >= T_END) {
        stop();
        chapter.advance('holo');
      }
    },
    state: () => ({ u, jumps: jumps.length, jump: lastJump, flying: dome.visible, vesselZ: hangar.vessel.position.z }),
  };
}
