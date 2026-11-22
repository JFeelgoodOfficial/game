// SEALED: the owner has not played this yet. Do not open.
//
// The helm, past the roof (GDD 5.7.7): stages bell9 and bell10, and the end
// of the chapter.
//
// X9: in the exact spinning solution the end is a ring, and the disc the ring
// spans is ordinary space: a line through it comes out on a second sheet with
// no horizon, where the same ring pushes away (it acts as a negative mass),
// and near it on that side there are closed loops in time. All of that is the
// mathematics; none of it is thought to survive in a real hole. X10: the far
// sheet as a distant part of the same universe, with stars, is the story's (in
// the exact solution it is a separate, empty region).
//
// The chart again (world/SEALED-horizon-ship.js, kind 2): the ring is an
// upright broken line, its gaps the middle of the ring. Left alone the ship
// keeps its distance. Leaning to port brings its line to the ring's: through
// a gap, it is out; onto the line, it is the last second (the tide: stretch
// along the fall and squeeze across it, 4 / (9 tau^2) per metre, which is real).
//
// The first twelve seconds of the last scene are out of order on purpose: a
// thing is said before it is seen to happen.

import * as THREE from 'three';
import { C, CH_TIER, HZ_TAU } from '../src/constants.js';
import { Q } from '../src/quality.js';
import { moveAxes } from '../src/input.js';
import { chapterHud } from '../src/chapterHud.js';
import { lampHud } from '../src/lampHud.js';
import { lamp, resetLamp } from '../src/lamp.js';
import { setHum, logChime } from './entryzero-audio.js';
import { WORLDS, HOME } from './chapter-dialogue.js';
import { createSky, AHEAD } from './SEALED-horizon-sky.js';
import { R, ease, buildShell, createCrew, makeSite, createChart, createMotes, showClocks } from './SEALED-horizon-ship.js';
import { ROOF_TAU } from './SEALED-horizon-helm.js';
import { S9, S10, DX3, KEEL, AFTER_DEATH } from './SEALED-horizon-words.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const REST = -0.35; // where the ship keeps itself, left alone
const RATE = C.HZ_C5 * C.HZ_E3;
const RING_AHEAD = new THREE.Vector3(-0.55, 0.3, -0.78).normalize();
const RING_ASTERN = new THREE.Vector3(0.8, 0.45, 0.35).normalize(); // (off the starboard quarter: clear of the archive's arc)

export function createKeel(ctx) {
  const { chapter, memo } = ctx;
  const time = { value: 0 };
  const shell = buildShell(time);
  const group = shell.group;
  group.visible = false;
  ctx.scene.add(group);
  const sky = createSky();
  group.add(sky.mesh);
  const crew = createCrew(chapter, group);
  const chart = createChart(time);
  chart.U.uKind.value = 2;
  chart.group.scale.setScalar(3.4);
  chart.group.position.set(0, 5.6, -R - 0.4);
  chart.group.rotation.x = -0.32;
  group.add(chart.group);
  const motes = createMotes(CH_TIER[Q.tier].hzA);
  motes.points.scale.setScalar(0.8);
  motes.points.position.set(0, 2.0, -R + 5.5);
  group.add(motes.points);

  let phase = 'fly'; // 'intro' | 'fly' | 'out' | 'dead'
  let x = REST, t = 0, lean = 0, forced = null, auto = false, reserve = 0.6, local = 0, afterDeath = 0;
  let wasNear = false, calledGap = -1, leansSaid = false, through = false, endTau = 0;
  const fallCol = new THREE.Color(1, 1, 1);
  const isOpen = (tt) => (((tt / C.HZ_E2) % 1) + 1) % 1 < C.HZ_E1 / C.HZ_E2;
  const freeSlope = (xx) => clamp((REST - xx) * 2, -C.HZ_E4, C.HZ_E4);
  const slopeOf = (xx, l) => clamp(freeSlope(xx) + l * C.HZ_C3, -C.HZ_C2, C.HZ_C2);
  // where the ship's line would meet the ring's if it leaned this hard from now (the time, or -1)
  function meets(l) {
    let px = x, pt = t;
    for (let i = 0; i < 400; i++) {
      px += slopeOf(px, l) * 0.004;
      pt += 0.004;
      if (px <= C.HZ_E7) return pt;
    }
    return -1;
  }
  const tau = () => HZ_TAU[8] + local;

  function reset() {
    x = REST;
    t = 0.1;
    lean = 0;
    forced = null;
    auto = false;
    reserve = 0.6;
    wasNear = leansSaid = through = false;
    calledGap = -1;
    chart.reset();
    chart.show(true);
    chart.group.visible = true;
    chart.ship(x, t, 0, t - 0.6);
    motes.U.uStretch.value = 0;
    sky.U.uMode.value = 1;
    sky.U.uFar.value = 0;
    sky.U.uPick.value = 0;
    sky.U.uFall.value.w = 0;
    sky.U.uRing.value.copy(RING_AHEAD);
    sky.U.uRingR.value = 0.22;
  }
  function die() {
    phase = 'dead';
    memo.died = 'ring';
    site.st.play(DX3, C.HZ_SX, {
      pose(u) {
        motes.U.uStretch.value = ease(0, 5, u) ** 2;
        chapterHud.white(ease(5, 7.5, u));
      },
      cam(pos, target) {
        pos.set(2.6, 3.0, -R + 9.5);
        target.set(0, 2.0, -R + 5.5);
      },
      onEnd() {
        site.portal = 'hz:back';
      },
    });
  }
  // the far side, and the end of the chapter
  function out() {
    phase = 'out';
    through = true;
    chapter.hz.survive('c2');
    chapter.advance('hz_bell10');
    lampHud.show(false);
    logChime();
    const c1 = chapter.hz.get('c1');
    const layers = typeof c1 === 'number' ? (c1 < WORLDS.length ? WORLDS[c1].layers : HOME.layers) : null;
    if (layers) fallCol.set(layers.ground.land).lerp(new THREE.Color(layers.sky.a), 0.4);
    const kept = chapter.hz.get('c2') !== 'a';
    site.st.play(S10, C.HZ_S10, {
      pose(u) {
        chart.group.visible = u < 1.5;
        // (said at 4, seen at 6: the ship goes through the middle of the ring)
        const pass = ease(5.2, 6.2, u);
        chapterHud.white(Math.exp(-(((u - 6) / 0.9) ** 2)) * 0.9);
        if (pass < 0.5) {
          sky.U.uRing.value.copy(RING_AHEAD);
          sky.U.uRingR.value = 0.3 + 1.3 * ease(0, 6, u);
          sky.U.uFar.value = 0;
        } else {
          sky.U.uRing.value.copy(RING_ASTERN);
          sky.U.uRingR.value = 1.3 * (1 - ease(6, 40, u)) ** 2 + 0.03;
          sky.U.uFar.value = ease(6, 12, u);
        }
        // the record that was put down goes by, among the others
        const g = ease(24, 30, u) * (1 - ease(36, 42, u));
        sky.U.uFall.value.set(fallCol.r, fallCol.g, fallCol.b, layers ? 1.4 * g : 0);
        const a = -1.1 + 2.2 * ease(22, 42, u);
        sky.U.uFallDir.value.set(Math.sin(a), 0.42, -Math.cos(a)).normalize();
        sky.U.uPick.value = kept ? ease(60, 66, u) : 0;
        shell.railMat.color.setRGB(0.5, 1.4, 1.6).multiplyScalar(1 + 0.8 * sky.U.uPick.value);
      },
      cam(pos, target, u) {
        const k = ease(10, 20, u) * (1 - ease(34, 46, u));
        pos.set(-3.0 + 3 * ease(40, 60, u), 2.7, 5.8);
        target.set(AHEAD.x * 60 * (1 - k) + RING_ASTERN.x * 60 * k, 6 * (1 - k) + RING_ASTERN.y * 60 * k, -60 * (1 - k) + RING_ASTERN.z * 60 * k);
      },
      onEnd() {
        chapter.hz.set('t', Math.round((endTau || HZ_TAU[9]) + C.HZ_S10));
        site.portal = ctx.openSpace();
      },
    });
  }

  const site = makeSite(ctx, {
    group,
    hidePilot: true,
    surfaces: [{ kind: 'disc', cx: 0, cz: 0, r: R - 0.5, y: 0 }],
    spawn: new THREE.Vector3(0, 0, -R + 4.4),
    spawnYaw: Math.PI,
    held: () => true,
    camera(pos, target) {
      pos.set(0, 3.6, 2.4);
      target.set(0, 5.0, -R);
      return true;
    },
    enter() {
      local = 0;
      chapter.advance('hz_bell9');
      crew.muster();
      reset();
      chapterHud.racing(true); // (a seat: the on-foot key list is not for this)
      resetLamp(true);
      lamp.canAll = false;
      afterDeath = 0;
      if (chapter.reached('hz_bell10')) return out(); // (come back to at the end: it is played from the ring)
      lampHud.show(true, false, KEEL.keys);
      if (!memo.taught9) {
        memo.taught9 = true;
        phase = 'intro';
        site.st.play(S9, C.HZ_S9, { onEnd: () => (phase = 'fly') });
      } else {
        phase = 'fly';
        afterDeath = memo.died ? 1.2 : 0;
      }
    },
    leave() {
      lampHud.show(false);
      chapterHud.racing(false);
    },
    tick(d, tm) {
      time.value = tm;
      local += d;
      sky.U.uTime.value = tm;
      motes.U.uTime.value = tm;
      const w = site.st.walker();
      if (w) sky.mesh.position.copy(w);
      crew.tick(d, tm, site.st.speaker);
      if (afterDeath > 0 && (afterDeath -= d) <= 0) {
        site.st.say(AFTER_DEATH.ring, null, 7);
        memo.died = null;
      }
      if (phase === 'fly') {
        let want = forced != null ? forced : moveAxes().strafe;
        const tFull = meets(-1);
        const gapNow = Math.floor(tFull / C.HZ_E2);
        const frac = (((tFull / C.HZ_E2) % 1) + 1) % 1, width = C.HZ_E1 / C.HZ_E2;
        const good = tFull > 0 && frac > width * 0.15 && frac < width * 0.85;
        // (auto, for a test: wait off the line, and go when a gap will be there)
        if (auto) want = good || x < C.HZ_E7 + 0.05 ? -1 : x < -0.6 ? 0.45 : -0.3;
        if (chapter.hz.get('c2') === 'a') {
          // the first pilot calls each gap as it comes into reach
          if (good && gapNow !== calledGap && x < -0.45) {
            calledGap = gapNow;
            site.st.say(KEEL.now, null, 2.5);
          }
        } else if (want < -0.1 && !good && x < -0.5) {
          // the ship itself holds back from a line it would touch
          want *= 1 - C.HZ_E6;
          if (!leansSaid) {
            leansSaid = true;
            site.st.say(KEEL.leans, null, 4);
          }
        }
        if (reserve <= 0) want = 0;
        lean += (want - lean) * Math.min(1, d * C.HZ_C4);
        const slope = slopeOf(x, lean);
        const dc = d * RATE;
        x += slope * dc;
        t += dc;
        reserve = clamp(reserve - Math.abs(lean) * C.HZ_C9 * 2 * d + C.HZ_E5 * d, 0, 1);
        if (x < -0.66) wasNear = true;
        else if (wasNear && x > -0.5) {
          wasNear = false;
          site.st.say(KEEL.miss, { n: Math.round(reserve * 100) });
        }
        sky.U.uRingR.value = 0.22 + 0.5 * clamp((REST - x) / (REST - C.HZ_E7), 0, 1);
        // the tide, as the ring's line is neared: nothing, and then everything
        motes.U.uStretch.value = 0.25 * clamp((x - C.HZ_E7) < 0.04 ? 1 - (x - C.HZ_E7) / 0.04 : 0, 0, 1);
        if (x <= C.HZ_E7) {
          endTau = tau();
          if (isOpen(t)) out();
          else die();
        }
        chart.ship(x, t, slope, t - 0.6);
        lamp.energy = reserve;
        lamp.dose = 0;
        lampHud.update();
      }
      setHum(0.25 + 0.5 * Math.abs(lean));
      showClocks(through ? (endTau || HZ_TAU[9]) + Math.max(0, site.st.u()) : tau(), null, false, ROOF_TAU);
    },
    info: () => ({ place: 'keel', stage: chapter.stage(), phase, x: +x.toFixed(3), t: +t.toFixed(3), lean: +lean.toFixed(2), reserve: +reserve.toFixed(2), open: isOpen(t), through, c2: chapter.hz.get('c2'), pending: chapter.hz.pending(), crew: crew.aboard() }),
    dbg: {
      set: (nx, nt) => ((x = nx), (t = nt ?? t), true),
      lean: (v) => ((forced = v), true),
      auto: (on = true) => ((auto = on), true),
      // put the ship's line on the ring's where it is solid (a test of the death)
      touch() {
        while (isOpen(t)) t += 0.01;
        x = C.HZ_E7 + 0.002;
        forced = -1;
        return true;
      },
    },
  });
  return site;
}
