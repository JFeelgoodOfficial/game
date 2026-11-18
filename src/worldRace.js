// World racing (GDD 5.7.4): small worldships raced round the City of Light.
//
// From the Starter's stand on the terrace the pilot picks a world
// (RACE.worlds in world/chapter-dialogue.js) and flies it three laps of the
// course (world/racecourse.js) against a grid of others: the three captains,
// each on a world from their own people, and whoever else has turned up.
//
// A racer is held to the course: where it is is "how far round, how far
// across, how far up", and its flyer has the across and the up. The world goes
// forward on its own, faster on boost; the flying is in putting it through
// gates that are each set a little off the middle, and in what the others are
// doing. A gate taken clean puts boost back; a gate missed costs seconds and
// speed. Close in behind another world and it pulls you along. Lean on one and
// the heavier of the two wins.
//
//   W / S   climb / dive        A / D   turn        SPACE   boost       E   leave
//   (on a phone: the left stick steers, JUMP is boost, the context button leaves)
//
// It is not walked: while a race is on, the city holds the pilot where they
// stand and the race has the camera (src/capitalWalk.js held / camera / act).
// Every racer, the pilot's included, is one record stepped by the same code;
// only where the stick comes from differs.

import * as THREE from 'three';
import { C, CH_TIER } from './constants.js';
import { Q } from './quality.js';
import { input, moveAxes } from './input.js';
import { MOTION_SCALE } from './motion.js';
import { uiSound, chime, setEventRumble } from './sfx.js';
import { chapterHud } from './chapterHud.js';
import { tint, cyl, mergedMesh } from '../world/capital.js';
import { createLayerPlanet } from '../world/layerplanet.js';
import { createCourse, GATE_R, LANE } from '../world/racecourse.js';
import { createRacer, RACER_R } from '../world/racers.js';
import { createRaceFx } from '../world/racefx.js';
import { RACE, CAPTAINS } from '../world/chapter-dialogue.js';

const KEY = 'fgsf.worldrace';
const LAPS = 3;
const BASE = 92; // units a second, a world of speed 1, no boost
const PENALTY = 2; // seconds for a gate missed
const DRAFT = 46; // how far behind another world its pull is felt
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

// k: { group, camera, colliders, consoles, way — the gap in the monument, towers — the city's instanced towers,
//      hit(pos, radius) — is a world there in the monument }
export function createWorldRace(k) {
  const { group, camera } = k;
  const course = createCourse(group, k.way || null);
  const towersCut = k.towers ? course.makeWay(k.towers) : 0;
  const fx = createRaceFx(group);
  const TERRACE = new THREE.Vector3(0, 60, -77); // over the terrace, where the finish is seen from
  const _burst = new THREE.Vector3();
  let crash = null; // the last world lost, and to what (for checks)
  let wreckedLast = false; // the pilot's last world did not come back
  let rung = 0, sparks = 0, sparkAt = 0; // laps the bells have been rung for; fireworks still to go up
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
  let field = []; // every racer; field[0] is the pilot
  let me = null;
  let time = 0, lapStart = 0, T = 0, counted = -1, hudAt = 0, bumpAt = 0, place = 0;
  let hudText = '';
  const order = []; // the field, leader first
  const ahead = new THREE.Vector3(), right = new THREE.Vector3(), up = new THREE.Vector3();
  const cam = new THREE.Vector3(), camWant = new THREE.Vector3(), m4 = new THREE.Matrix4(), back = new THREE.Vector3();
  let camSet = false;

  function put(r) {
    course.at(r.s, r.x, r.y, r.pos);
    course.ahead(r.s, ahead);
    course.across(r.s, right);
    course.up(r.s, up);
    r.mesh.group.position.copy(r.pos);
    // nose down the course, leaning into the turn and the climb
    m4.makeBasis(right, up, back.copy(ahead).negate());
    r.mesh.group.quaternion.setFromRotationMatrix(m4);
    r.mesh.group.rotateZ(-r.vx * 0.012);
    r.mesh.group.rotateX(r.vy * 0.008);
  }

  function clear() {
    for (const r of field) {
      group.remove(r.mesh.group);
      r.mesh.dispose();
    }
    field = [];
    me = null;
  }

  function start(id) {
    const mine = RACE.worlds.find((o) => o.id === id);
    if (!mine) return false;
    clear();
    // who else: the captains on their own peoples' worlds, then the others,
    // each on the next world nobody has
    const taken = new Set([mine.id]);
    const free = () => RACE.worlds.find((w) => !taken.has(w.id)) || RACE.worlds[0];
    const entries = [{ name: RACE.you, world: mine, skill: 1 }];
    const nRivals = (CH_TIER[Q.tier] || CH_TIER.medium).rivals;
    const names = [...CAPTAINS.map((c) => ({ name: c.short, want: RACE.captainWorld[c.id] })), ...RACE.others.map((name) => ({ name }))];
    for (let i = 0; i < Math.min(nRivals, names.length); i++) {
      const want = RACE.worlds.find((w) => w.id === names[i].want);
      const w = want && !taken.has(want.id) ? want : free();
      taken.add(w.id);
      entries.push({ name: names[i].name, world: w, skill: 0.93 + 0.035 * ((i * 7) % 4) });
    }
    // the grid: two abreast back from the line, the pilot in the middle of it
    const slot = entries.map((_, i) => i);
    slot.splice(Math.floor(entries.length / 2), 0, slot.shift());
    field = entries.map((e, i) => {
      const g = slot.indexOf(i);
      const mesh = createRacer(e.world, i > 0);
      group.add(mesh.group);
      return {
        name: e.name, world: e.world, skill: e.skill, mesh, ai: i > 0, seed: i * 1.73,
        s: -g * 0.0045, x: (g % 2 ? 1 : -1) * 8, y: 0, vx: 0, vy: 0, v: 0,
        lap: 0, gate: 0, meter: 0.5, boosting: 0, slow: 0, draft: 0, done: false, out: false, pos: new THREE.Vector3(),
        color: new THREE.Color(e.world.drive),
      };
    });
    me = field[0];
    model.setAll(mine.layers);
    time = lapStart = 0;
    T = 0;
    counted = -1;
    place = 0;
    camSet = false;
    rung = 0;
    sparks = 0;
    wreckedLast = false;
    fx.begin();
    state = 'count';
    chapterHud.racing(true);
    course.show(0);
    for (const r of field) put(r);
    return true;
  }

  function stop() {
    if (state === 'idle') return;
    state = 'idle';
    course.show(-1);
    fx.end();
    clear();
    chapterHud.racing(false);
    chapterHud.panel(null);
    chapterHud.say(null);
    setEventRumble(0);
    if (camera && camera.fov !== C.FOV) {
      camera.fov = C.FOV;
      camera.updateProjectionMatrix();
    }
  }

  // how far round the whole race a racer is (finishers ahead of everyone still flying)
  const progress = (r) => (r.out ? -10 + r.outAt * 0.001 : r.done ? 1000 - r.doneAt : r.lap + r.s);

  // A world has hit something. It goes up, and that is the end of it.
  function destroy(r) {
    r.out = true;
    r.outAt = time;
    r.v = r.vx = r.vy = 0;
    r.mesh.group.visible = false;
    fx.explode(r.pos, r.color);
    uiSound('impact');
    if (r === me) {
      state = 'wreck';
      T = 0;
      chapterHud.say(RACE.wrecked, 5);
      chapterHud.white(0.85);
      course.show(-1);
    } else chapterHud.say(RACE.lost.replace('{name}', r.name), 2.4);
  }
  function rank() {
    order.length = 0;
    for (const r of field) order.push(r);
    order.sort((a, b) => progress(b) - progress(a));
  }

  function hud() {
    let list = '';
    for (let i = 0; i < order.length; i++) list += `${i ? '  ' : ''}${order[i].out ? '×' : i + 1} ${order[i].name}`;
    const text = RACE.hud
      .replace('{pos}', order.indexOf(me) + 1).replace('{n}', field.length)
      .replace('{lap}', Math.min(me.lap + 1, LAPS)).replace('{of}', LAPS)
      .replace('{gate}', me.gate).replace('{gates}', course.gates.length)
      .replace('{time}', clock(time)).replace('{best}', clock(best[me.world.id] ?? NaN))
      .replace('{boost}', '█'.repeat(Math.round(me.meter * 10)).padEnd(10, '░'))
      .replace('{order}', list);
    if (text !== hudText) chapterHud.panel((hudText = text));
  }

  // One racer, one step. ax, ay: the stick (-1..1); boost: asked for.
  function step(r, ax, ay, boost, dt, live) {
    const w = r.world;
    const go = live && !r.done;
    const wantBoost = go && boost && r.meter > 0.02;
    r.boosting += ((wantBoost ? 1 : 0) - r.boosting) * Math.min(1, dt * 5);
    if (wantBoost) r.meter = Math.max(0, r.meter - dt / 2.4);
    r.slow = Math.max(0, r.slow - dt * 0.7);
    const top = BASE * w.speed * r.skill * (1 + 0.6 * r.boosting * w.boost) * (1 + 0.09 * r.draft) * (1 - 0.3 * r.slow);
    r.v += ((go ? top : r.done ? top * 0.4 : 0) - r.v) * Math.min(1, dt * (go ? 1.6 : 0.8));
    // grip: how fast the world takes a new heading (a heavy one slides)
    const g = 3.2 * w.grip;
    r.vx += ((go ? ax : 0) * 34 - r.vx) * Math.min(1, dt * g);
    r.vy += ((go ? ay : 0) * 30 - r.vy) * Math.min(1, dt * g);
    r.x += r.vx * dt;
    r.y += r.vy * dt;
    if (Math.abs(r.x) > LANE) {
      r.x = Math.sign(r.x) * LANE;
      r.vx = 0;
    }
    if (Math.abs(r.y) > LANE * 0.8) {
      r.y = Math.sign(r.y) * LANE * 0.8;
      r.vy = 0;
    }
    const before = r.s;
    r.s += (r.v * dt) / course.length;
    let event = 0; // 1 clean gate, 2 missed gate, 3 a lap, 4 the finish
    if (go) {
      const gt = course.gates[r.gate];
      if (gt && before < gt.s && r.s >= gt.s) {
        if (Math.hypot(r.x - gt.across, r.y - gt.up) < GATE_R * 0.92) {
          r.meter = Math.min(1, r.meter + 0.3);
          event = 1;
        } else {
          r.slow = 1;
          event = 2;
        }
        r.gate++;
      }
      if (r.s >= 1) {
        r.s -= 1;
        r.lap++;
        r.gate = 0;
        event = 3;
        if (r.lap >= LAPS) {
          r.done = true;
          r.doneAt = time;
          event = 4;
        }
      }
    } else if (r.s >= 1) r.s -= 1;
    return event;
  }

  // What a rival does with its stick: make for the next gate, not quite true,
  // and round anything it is about to run into.
  function think(r, t) {
    const gt = course.gates[r.gate] || course.gates[0];
    const wob = (1.02 - r.skill) * 60; // the less sure, the wider of the mark
    let tx = gt.across + Math.sin(t * 0.9 + r.seed * 5) * wob, ty = gt.up + Math.cos(t * 0.7 + r.seed * 3) * wob;
    // only close to a gate does it really commit to it; between gates it drifts back to the middle
    const toGate = ((gt.s - r.s + 1) % 1) * course.length;
    const commit = Math.min(1, 90 / Math.max(toGate, 1));
    tx *= 0.35 + 0.65 * commit;
    ty *= 0.35 + 0.65 * commit;
    r.ax = Math.max(-1, Math.min(1, (tx - r.x) / 7));
    r.ay = Math.max(-1, Math.min(1, (ty - r.y) / 7));
    // boost when there is plenty, or when the pilot is getting away
    const gap = progress(me) - progress(r);
    r.wantBoost = r.meter > 0.75 || (gap > 0.02 && r.meter > 0.25 && Math.sin(t * 0.5 + r.seed) > 0);
    // (a field that strings right out is no race: those well behind find a little more, those well ahead ease)
    r.rubber = gap > 0.06 ? 1.06 : gap < -0.06 ? 0.95 : 1;
  }

  // Worlds in each other's way: they shove, by weight, and whoever is tucked in behind another is pulled along.
  function meet(dt) {
    for (const r of field) r.draft = 0;
    let hit = false;
    for (let i = 0; i < field.length; i++) {
      for (let j = i + 1; j < field.length; j++) {
        const a = field[i], b = field[j];
        if (a.out || b.out) continue;
        let ds = (a.s - b.s) % 1;
        if (ds > 0.5) ds -= 1;
        if (ds < -0.5) ds += 1;
        const along = ds * course.length; // > 0: a is ahead of b
        const dx = a.x - b.x, dy = a.y - b.y;
        const lat = Math.hypot(dx, dy);
        // the pull: behind, close, and in line
        if (Math.abs(along) > RACER_R * 2 && Math.abs(along) < DRAFT && lat < 8) {
          const k = (1 - Math.abs(along) / DRAFT) * (1 - lat / 8);
          if (along > 0) b.draft = Math.max(b.draft, k);
          else a.draft = Math.max(a.draft, k);
        }
        const d = Math.hypot(along, lat), min = RACER_R * 2.05;
        if (d >= min || d < 1e-4) continue;
        const ma = a.world.mass || 1, mb = b.world.mass || 1, push = (min - d) / (ma + mb);
        const nx = lat > 1e-3 ? dx / lat : a.seed > b.seed ? 1 : -1, ny = lat > 1e-3 ? dy / lat : 0;
        // apart across the course, the lighter the further
        a.x += nx * push * mb;
        a.y += ny * push * mb;
        b.x -= nx * push * ma;
        b.y -= ny * push * ma;
        const rel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
        if (rel < 0) {
          a.vx -= nx * rel * (mb / (ma + mb)) * 1.6;
          a.vy -= ny * rel * (mb / (ma + mb)) * 1.6;
          b.vx += nx * rel * (ma / (ma + mb)) * 1.6;
          b.vy += ny * rel * (ma / (ma + mb)) * 1.6;
        }
        // ...and the one behind is held up by it
        (along > 0 ? b : a).v *= 1 - Math.min(0.6 * dt * 8, 0.12);
        if (a === me || b === me) hit = true;
      }
    }
    bumpAt -= dt;
    if (hit && bumpAt <= 0) {
      bumpAt = 0.45;
      uiSound('impact');
    }
    return hit;
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
    wrecked: () => wreckedLast,
    // a world picked at the stand
    onChoice(tag) {
      if (typeof tag !== 'string' || !tag.startsWith('race:')) return undefined;
      start(tag.slice(5));
      return null;
    },
    stop,
    // behind the pilot's world and a little above it, looking down the course
    camera(outPos, target) {
      if (state === 'idle' || !me) return false;
      course.ahead(me.s, ahead);
      course.up(me.s, up);
      course.across(me.s, right);
      camWant.copy(me.pos).addScaledVector(ahead, -(24 + 10 * me.boosting)).addScaledVector(up, 7.5).addScaledVector(right, -me.vx * 0.12);
      if (!camSet) {
        cam.copy(camWant);
        camSet = true;
      }
      outPos.copy(cam);
      target.copy(me.pos).addScaledVector(ahead, 40).addScaledVector(up, 2);
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
      const live = state === 'run' || state === 'done' || state === 'wreck';
      if (state === 'run') time += dt;

      // --- everyone flies ---
      const axes = moveAxes();
      for (let i = 0; i < field.length; i++) {
        const r = field[i];
        if (r.out) continue;
        let ev;
        if (r.ai) {
          think(r, t);
          const keep = r.skill;
          r.skill = keep * r.rubber;
          ev = step(r, r.ax, r.ay, r.wantBoost, dt, live);
          r.skill = keep;
        } else ev = step(r, axes.strafe, axes.fwd, input.brake, dt, state === 'run');
        if (r !== me) continue;
        // what the pilot is told about their own flying
        if (ev === 1) chime(392 * Math.pow(1.0595, (me.gate * 2) % 12));
        else if (ev === 2) {
          time += PENALTY;
          chapterHud.say(RACE.missed.replace('{sec}', PENALTY), 1.6);
          uiSound('toggle');
        }
        if (ev === 1 || ev === 2) course.show(me.gate);
        if (ev === 3) {
          chapterHud.say(RACE.lap.replace('{n}', me.lap + 1).replace('{of}', LAPS).replace('{time}', clock(time - lapStart)), 2.6);
          lapStart = time;
          uiSound('engage');
          course.show(0);
        } else if (ev === 4) {
          state = 'done';
          T = 0;
          rank();
          place = order.indexOf(me);
          const isBest = !(best[me.world.id] <= time);
          if (isBest) {
            best[me.world.id] = Math.round(time * 10) / 10;
            saveBest();
          }
          const placed = RACE.placed.replace('{place}', RACE.places[place] || `${place + 1}`).replace('{n}', field.length);
          chapterHud.say(`${RACE.finish.replace('{time}', clock(time))} — ${placed}${isBest ? ` — ${RACE.best}` : ''}`, 6.5);
          uiSound('cheer');
          sparks = 10;
          sparkAt = 0;
          course.show(course.gates.length); // every gate spent
        }
      }
      const hit = live ? meet(dt) : false;
      // anything that is not another world: the towers, and the thing across the city
      if (live) {
        for (const r of field) {
          if (r.out || r.done) continue;
          course.at(r.s, r.x, r.y, r.pos);
          const tower = course.hitTower(r.pos, RACER_R);
          if (tower || (k.hit && k.hit(r.pos, RACER_R))) {
            crash = { name: r.name, s: Math.round(r.s * 1000) / 1000, x: Math.round(r.x), y: Math.round(r.y), into: tower ? 'tower' : 'monument' };
            destroy(r);
          }
        }
      }
      rank();
      // the bells, the first time anyone starts each new lap
      const lead = order[0];
      if (lead && lead.lap > rung && lead.lap < LAPS) {
        rung = lead.lap;
        chime(196);
        if (lead !== me) uiSound('select');
      }
      // fireworks at the finish: over the terrace and round the pilot's world, one after another
      if (sparks > 0) {
        sparkAt -= dt;
        if (sparkAt <= 0) {
          sparkAt = 0.55;
          sparks--;
          // (ahead of the pilot's world, where they are looking)
          course.at(me.s + 90 / course.length, Math.sin(sparks * 2.4) * 34, 10 + (sparks % 3) * 12, _burst);
          fx.burst(_burst, field[sparks % field.length].color);
        }
      }

      for (let i = 0; i < field.length; i++) {
        const r = field[i];
        if (r.out) continue;
        put(r);
        if (live) fx.wake(i, r.pos, r.color);
        r.mesh.tick(t, px, Math.min(r.v / (BASE * 1.4), 1), Math.max(r.boosting, r.draft * 0.5));
      }
      fx.tick(dt, t, lead ? lead.pos : me.pos, px);
      cam.lerp(camWant, Math.min(1, dt * 6));
      if (camera) {
        const fov = C.FOV + (16 * me.boosting + 5 * me.draft) * MOTION_SCALE;
        if (Math.abs(camera.fov - fov) > 0.05) {
          camera.fov = fov;
          camera.updateProjectionMatrix();
        }
      }
      setEventRumble((me.boosting * 0.35 + (hit ? 0.5 : 0)) * (0.4 + 0.6 * MOTION_SCALE));
      hudAt -= dt;
      if (hudAt <= 0) {
        hudAt = 0.1;
        hud();
      }
      if (state === 'wreck') {
        chapterHud.white(Math.max(0, 0.85 - T * 1.4));
        setEventRumble(Math.max(0, 1 - T / 1.6) * (0.4 + 0.6 * MOTION_SCALE));
      }
      if (state === 'done' && T > 7) stop();
      else if (state === 'wreck' && T > 5.5) {
        stop();
        wreckedLast = true;
        chapterHud.say(RACE.again, 5);
      }
    },
    state: () => ({
      state, world: me && me.world.id, s: me ? me.s : 0, x: me ? me.x : 0, y: me ? me.y : 0, v: me ? me.v : 0,
      lap: me ? me.lap : 0, gate: me ? me.gate : 0, gates: course.gates.length, time, meter: me ? me.meter : 0, draft: me ? me.draft : 0,
      best: { ...best }, length: course.length, place, crash, via: course.sVia, towersCut, towersNear: course.towersNear(),
      field: field.map((r) => ({ name: r.name, world: r.world.id, out: r.out, at: Math.round((r.lap + r.s) * 1000) / 1000, x: Math.round(r.x * 10) / 10, y: Math.round(r.y * 10) / 10, v: Math.round(r.v), done: r.done })),
      order: order.map((r) => r.name),
    }),
    // dev: what is at a place on the course
    debugProbe(o) {
      const p = course.at(o.s, o.x || 0, o.y || 0, new THREE.Vector3());
      return { at: p.toArray().map(Math.round), tower: course.hitTower(p, RACER_R), monument: !!(k.hit && k.hit(p, RACER_R)) };
    },
    // dev: put a racer (the pilot's, or field[i]) at a place on the course
    debugSet(o) {
      if (state === 'idle') return false;
      const r = field[o.i || 0];
      if (!r) return false;
      if (o.s != null) r.s = o.s;
      if (o.x != null) r.x = o.x;
      if (o.y != null) r.y = o.y;
      if (o.lap != null) r.lap = o.lap;
      return true;
    },
  };
}
