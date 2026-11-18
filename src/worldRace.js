// World racing (GDD 5.7.4): small worldships raced round the City of Light.
//
// From the Starter's stand on the terrace the pilot picks a world
// (RACE.worlds in world/chapter-dialogue.js) and flies it three laps of the
// course (world/racecourse.js) against the clock.
//
// A racer is held to the course: where it is is "how far round, how far
// across, how far up", and the pilot has the across and the up. The world goes
// forward on its own, faster on boost; the flying is in putting it through
// gates that are each set a little off the middle. A gate taken clean puts
// boost back; a gate missed costs seconds, not the race.
//
//   W / S   climb / dive        A / D   turn        SPACE   boost       E   leave
//   (on a phone: the left stick steers, JUMP is boost, the context button leaves)
//
// It is not walked: while a race is on, the city holds the pilot where they
// stand and the race has the camera (src/capitalWalk.js held / camera / act).
// One clock, everything placed from the racer's place on the course.

import * as THREE from 'three';
import { C } from './constants.js';
import { Q } from './quality.js';
import { input, moveAxes } from './input.js';
import { MOTION_SCALE } from './motion.js';
import { uiSound, chime, setEventRumble } from './sfx.js';
import { chapterHud } from './chapterHud.js';
import { tint, cyl, mergedMesh } from '../world/capital.js';
import { createLayerPlanet } from '../world/layerplanet.js';
import { createCourse, GATE_R, LANE } from '../world/racecourse.js';
import { createRacer } from '../world/racers.js';
import { RACE } from '../world/chapter-dialogue.js';

const KEY = 'fgsf.worldrace';
const LAPS = 3;
const BASE = 92; // units a second, a world of speed 1, no boost
const PENALTY = 2; // seconds for a gate missed
const STAND = { x: 9.5, z: -63.5 }; // the Starter's stand, on the terrace

const clock = (sec) => {
  if (!Number.isFinite(sec)) return '--:--.-';
  const m = Math.floor(sec / 60), s = sec - m * 60;
  return `${String(m).padStart(2, '0')}:${s.toFixed(1).padStart(4, '0')}`;
};

function loadBest() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    const out = {};
    if (raw && raw.best && typeof raw.best === 'object') {
      for (const w of RACE.worlds) if (Number.isFinite(raw.best[w.id]) && raw.best[w.id] > 0) out[w.id] = raw.best[w.id];
    }
    return out;
  } catch {
    return {};
  }
}

// k: { group, camera, colliders, consoles }
export function createWorldRace(k) {
  const { group, camera } = k;
  const course = createCourse(group);
  const best = loadBest();
  const saveBest = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify({ v: 1, best }));
    } catch {
      // storage full or blocked: the time stands until the page is closed
    }
  };

  // --- the Starter's stand: a plinth, a ring of light, a small world turning over it ---
  const stand = new THREE.Group();
  group.add(stand);
  stand.add(mergedMesh([
    tint(cyl(0.9, 1.1, 1.0, STAND.x, 0.5, STAND.z, 12), 0xcfc9bb),
    tint(cyl(1.3, 1.4, 0.16, STAND.x, 0.08, STAND.z, 16), 0xe9e6dd),
  ].map((g) => (g.index ? g.toNonIndexed() : g)), new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x2c2b28 })));
  const standRing = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.05, 6, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.0, 1.7, 0.9), fog: false }));
  standRing.position.set(STAND.x, 2.0, STAND.z);
  stand.add(standRing);
  const model = createLayerPlanet(0.55, { life: 60, seg: 32, seed: 4.4 });
  model.setAll(RACE.worlds[0].layers);
  model.revealAll(1);
  model.group.position.copy(standRing.position);
  stand.add(model.group);
  k.colliders.push({ x: STAND.x, z: STAND.z, r: 1.3, top: Infinity });

  let state = 'idle'; // 'idle' | 'count' | 'run' | 'done'
  let world = null, racer = null;
  let s = 0, x = 0, y = 0, vx = 0, vy = 0, v = 0; // round the lap 0..1, across, up, and their speeds
  let lap = 0, gate = 0, time = 0, lapStart = 0, meter = 0.5, boosting = 0, T = 0, counted = -1, hudAt = 0;
  let hudText = '';
  const pos = new THREE.Vector3(), ahead = new THREE.Vector3(), right = new THREE.Vector3(), up = new THREE.Vector3();
  const cam = new THREE.Vector3(), camWant = new THREE.Vector3(), m4 = new THREE.Matrix4(), back = new THREE.Vector3();
  let camSet = false;

  function place() {
    course.at(s, x, y, pos);
    course.ahead(s, ahead);
    course.across(s, right);
    course.up(s, up);
    racer.group.position.copy(pos);
    // nose down the course, leaning into the turn and the climb
    m4.makeBasis(right, up, back.copy(ahead).negate());
    racer.group.quaternion.setFromRotationMatrix(m4);
    racer.group.rotateZ(-vx * 0.012);
    racer.group.rotateX(vy * 0.008);
  }

  function start(id) {
    const w = RACE.worlds.find((o) => o.id === id);
    if (!w) return false;
    if (racer) {
      group.remove(racer.group);
      racer.dispose();
    }
    world = w;
    racer = createRacer(w);
    group.add(racer.group);
    model.setAll(w.layers);
    s = 0;
    x = y = vx = vy = v = 0;
    lap = gate = 0;
    time = lapStart = 0;
    meter = 0.5;
    boosting = 0;
    T = 0;
    counted = -1;
    camSet = false;
    state = 'count';
    chapterHud.racing(true);
    course.show(0);
    place();
    return true;
  }

  function stop() {
    if (state === 'idle') return;
    state = 'idle';
    course.show(-1);
    if (racer) {
      group.remove(racer.group);
      racer.dispose();
      racer = null;
    }
    chapterHud.racing(false);
    chapterHud.panel(null);
    chapterHud.say(null);
    setEventRumble(0);
    if (camera && camera.fov !== C.FOV) {
      camera.fov = C.FOV;
      camera.updateProjectionMatrix();
    }
  }

  function hud() {
    const text = RACE.hud
      .replace('{lap}', Math.min(lap + 1, LAPS)).replace('{of}', LAPS)
      .replace('{gate}', gate).replace('{gates}', course.gates.length)
      .replace('{time}', clock(time)).replace('{best}', clock(best[world.id] ?? NaN))
      .replace('{boost}', '█'.repeat(Math.round(meter * 10)).padEnd(10, '░'));
    if (text !== hudText) chapterHud.panel((hudText = text));
  }

  k.consoles.push({
    x: STAND.x, y: 0, z: STAND.z, r: 3.2, prompt: RACE.prompt,
    off: () => state !== 'idle',
    use: () => ({
      speaker: RACE.marshal,
      lines: RACE.lines,
      offer: { kind: 'choice', prompt: RACE.pick, options: RACE.worlds.map((w) => ({ label: `${w.name} — ${w.note}`, outcomeTag: `race:${w.id}` })) },
    }),
  });

  return {
    running: () => state !== 'idle',
    held: () => state !== 'idle',
    quitPrompt: () => (state === 'run' || state === 'count' ? RACE.quit : null),
    // a world picked at the stand
    onChoice(tag) {
      if (typeof tag !== 'string' || !tag.startsWith('race:')) return undefined;
      start(tag.slice(5));
      return null;
    },
    stop,
    // behind the world and a little above it, looking down the course
    camera(outPos, target) {
      if (state === 'idle' || !racer) return false;
      camWant.copy(pos).addScaledVector(ahead, -(24 + 10 * boosting)).addScaledVector(up, 7.5).addScaledVector(right, -vx * 0.12);
      if (!camSet) {
        cam.copy(camWant);
        camSet = true;
      }
      outPos.copy(cam);
      target.copy(pos).addScaledVector(ahead, 40).addScaledVector(up, 2);
      return true;
    },
    tick(dt, t) {
      model.group.rotation.y = t * 0.6;
      standRing.rotation.set(Math.PI / 2 + 0.3 * Math.sin(t * 0.7), t * 0.9, 0);
      if (state === 'idle') return;
      chapterHud.tick(dt);
      const px = (window.innerHeight * Q.pixelRatio * 0.5) / Math.tan((C.FOV * Math.PI) / 360);
      T += dt;

      if (state === 'count') {
        const n = Math.min(Math.floor(T / 0.9), RACE.count.length - 1);
        if (n !== counted) {
          counted = n;
          chapterHud.say(RACE.count[n], 1.2);
          uiSound(n === RACE.count.length - 1 ? 'engage' : 'select');
        }
        if (T >= 0.9 * (RACE.count.length - 1)) {
          state = 'run';
          lapStart = 0;
        }
      }

      // --- flying ---
      const axes = moveAxes();
      const live = state === 'run';
      const wantBoost = live && input.brake && meter > 0.02;
      boosting += ((wantBoost ? 1 : 0) - boosting) * Math.min(1, dt * 5);
      if (wantBoost) meter = Math.max(0, meter - dt / 2.4);
      const top = BASE * world.speed * (1 + 0.6 * boosting * world.boost);
      v += ((live ? top : state === 'done' ? top * 0.35 : 0) - v) * Math.min(1, dt * (live ? 1.6 : 0.8));
      // grip: how fast the world takes a new heading (a heavy one slides)
      const g = 3.2 * world.grip;
      vx += ((live ? axes.strafe : 0) * 34 - vx) * Math.min(1, dt * g);
      vy += ((live ? axes.fwd : 0) * 30 - vy) * Math.min(1, dt * g);
      x += vx * dt;
      y += vy * dt;
      if (Math.abs(x) > LANE) {
        x = Math.sign(x) * LANE;
        vx = 0;
      }
      if (Math.abs(y) > LANE * 0.8) {
        y = Math.sign(y) * LANE * 0.8;
        vy = 0;
      }
      const before = s;
      s += (v * dt) / course.length;

      if (live) {
        time += dt;
        // the next gate: through it, or past it
        const gt = course.gates[gate];
        if (gt && before < gt.s && s >= gt.s) {
          if (Math.hypot(x - gt.across, y - gt.up) < GATE_R * 0.92) {
            meter = Math.min(1, meter + 0.3);
            chime(392 * Math.pow(1.0595, (gate * 2) % 12));
          } else {
            time += PENALTY;
            chapterHud.say(RACE.missed.replace('{sec}', PENALTY), 1.6);
            uiSound('toggle');
          }
          gate++;
          course.show(gate);
        }
        if (s >= 1) {
          s -= 1;
          lap++;
          const lapTime = time - lapStart;
          lapStart = time;
          gate = 0;
          if (lap >= LAPS) {
            state = 'done';
            T = 0;
            const isBest = !(best[world.id] <= time);
            if (isBest) {
              best[world.id] = Math.round(time * 10) / 10;
              saveBest();
            }
            chapterHud.say(`${RACE.finish.replace('{time}', clock(time))}${isBest ? ` — ${RACE.best}` : ''}`, 6);
            uiSound('cheer');
            course.show(course.gates.length); // every gate spent
          } else {
            chapterHud.say(RACE.lap.replace('{n}', lap + 1).replace('{of}', LAPS).replace('{time}', clock(lapTime)), 2.6);
            uiSound('engage');
            course.show(0);
          }
        }
      } else if (s >= 1) s -= 1;

      place();
      racer.tick(t, px, Math.min(v / (BASE * 1.4), 1), boosting);
      cam.lerp(camWant, Math.min(1, dt * 6));
      if (camera) {
        const fov = C.FOV + 16 * boosting * MOTION_SCALE;
        if (Math.abs(camera.fov - fov) > 0.05) {
          camera.fov = fov;
          camera.updateProjectionMatrix();
        }
      }
      setEventRumble(boosting * 0.35 * (0.4 + 0.6 * MOTION_SCALE));
      hudAt -= dt;
      if (hudAt <= 0) {
        hudAt = 0.1;
        hud();
      }
      if (state === 'done' && T > 6.5) stop();
    },
    state: () => ({ state, world: world && world.id, s, x, y, v, lap, gate, gates: course.gates.length, time, meter, best: { ...best }, length: course.length }),
    // dev: put the racer at a place on the course
    debugSet(o) {
      if (state === 'idle') return false;
      if (o.s != null) s = o.s;
      if (o.x != null) x = o.x;
      if (o.y != null) y = o.y;
      return true;
    },
  };
}
