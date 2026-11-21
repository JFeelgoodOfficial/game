// SEALED: the owner has not played this yet. Do not open.
//
// The helm, between the horizons (GDD 5.7.7): stages bell5 and bell6.
//
// The ship is not steered through space here. It is a point on a chart of
// spacetime (world/SEALED-horizon-ship.js createChart) that goes up, which is
// later, whatever is done. A / D lean its line to port or starboard inside the
// cone that light allows. Other things falling are drawn as lines for their
// whole length, so where they will be can be seen now; a line is passed
// through unharmed in its own band (Q / E: the hull is dark to one band).
//
//   the river    what the ship does untouched: it drifts to port
//   leaning      costs drive, and time off the clock (real: inside, thrust
//                shortens proper time; the rate used here is ours, X4)
//   starboard    the roof where everything that will ever fall in afterwards
//                arrives at once (the Cauchy horizon; mass inflation). Death.
//                Nothing of the outside's future is shown: it is only energy.
//   port         the roof that meets what fell before. X5, THE LINE: no real
//                thing is known to cross either roof. The light ship crosses
//                this one, as light, in the band of the roof where it meets
//                it, and only with the helm let go.
//
// One seat, never left. The dose and the drive are shown on the lamp's
// readout (dose, and the lamp's bar for the drive).

import * as THREE from 'three';
import { C, HZ_TAU } from '../src/constants.js';
import { input, moveAxes } from '../src/input.js';
import { chapterHud } from '../src/chapterHud.js';
import { lampHud } from '../src/lampHud.js';
import { lamp, nextBand, setBand, resetLamp } from '../src/lamp.js';
import { setHum, setDread, bandClick, doseTicks, logChime } from './entryzero-audio.js';
import { createSky } from './SEALED-horizon-sky.js';
import { R, ease, bandIndex, buildShell, createCrew, makeSite, createChart, createFigure, showClocks, COLOURS } from './SEALED-horizon-ship.js';
import { S5, S6, DX2, CHART, AFTER_DEATH } from './SEALED-horizon-words.js';

export const ROOF_TAU = HZ_TAU[2] + C.HZ_T4; // the ship's clock at the roof
const STREAMS = CHART.streams.map((s) => ({ ...s, bandI: bandIndex(s.band) }));
const ROOF = CHART.roof.map(bandIndex);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export function createHelm(ctx) {
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
  chart.group.scale.setScalar(3.4);
  chart.group.position.set(0, 5.6, -R - 0.4);
  chart.group.rotation.x = -0.32;
  group.add(chart.group);
  // the captains, as the ship takes them: a shape of cells each
  const figs = crew.members.map((m) => {
    const f = createFigure(COLOURS[m.c.id], 320, 1.9, 0.8);
    f.mesh.position.set(m.x, 0, m.z);
    f.mesh.visible = false;
    group.add(f.mesh);
    return f;
  });

  let phase = 'fly'; // 'intro' | 'fly' | 'cross' | 'dead'
  let x = 0, t = 0, lean = 0, forced = null, auto = false, reserve = 1, dose = 0, roofLeft = 0, lastBand = 0;
  let leanT = 0, starT = 0, afterDeath = 0;
  const side = new Float32Array(STREAMS.length);
  const said = {};
  const bark = (k, vars) => {
    if (said[k]) return;
    said[k] = true;
    site.st.say(CHART.barks[k], vars);
  };
  const streamX = (s, tt) => s.x0 + s.slope * (tt - s.t0);
  const tau = () => HZ_TAU[4] + (ROOF_TAU - HZ_TAU[4]) * clamp((t - C.HZ_C6) / 1.25, 0, 1);
  const remain = () => (x + 2 - t) / C.HZ_C5; // seconds to the port roof, as it is going

  function reset() {
    x = t = C.HZ_C6;
    lean = 0;
    forced = null;
    auto = false;
    reserve = 1;
    dose = 0;
    leanT = starT = 0;
    roofLeft = C.HZ_T4 - (HZ_TAU[4] - HZ_TAU[2]);
    for (const k of Object.keys(said)) said[k] = false;
    for (let i = 0; i < STREAMS.length; i++) side[i] = Math.sign(x - streamX(STREAMS[i], t)) || 1;
    chart.reset();
    chart.ship(x, t, -C.HZ_C1);
    resetLamp(false);
    lamp.canAll = false;
    lastBand = lamp.band;
    for (const f of figs) f.mesh.visible = false;
    shell.wallU.uWhite.value = shell.wallU.uLift.value = 0;
  }
  function die() {
    phase = 'dead';
    dose = 1;
    memo.died = 'chart';
    site.st.play(DX2, C.HZ_SX, {
      pose(u) {
        shell.wallU.uWhite.value = ease(0, 5, u);
        chapterHud.white(ease(4.5, 7.5, u));
      },
      onEnd() {
        site.portal = 'hz:back';
      },
    });
  }
  // the roof: the ship is made light, the captains with it, and goes through
  function cross() {
    phase = 'cross';
    logChime();
    site.st.play(S6, C.HZ_S6, {
      pose(u) {
        shell.wallU.uLift.value = ease(0, 10, u);
        shell.railMat.color.setRGB(0.5, 1.4, 1.6).multiplyScalar(1 + 2 * ease(2, 20, u));
        sky.U.uPort.value = 1 + 3 * ease(10, 28, u);
        crew.members.forEach((m, i) => {
          const a = 5 + 3 * i;
          m.rig.group.visible = m.on && u < a;
          const f = figs[i];
          f.mesh.visible = m.on && u >= a && u < a + 9;
          f.mesh.position.y = 7 * ease(a + 2, a + 9, u);
          f.U.uDrain.value = ease(a + 4, a + 9, u);
        });
        chapterHud.white(ease(26, 29.5, u));
      },
      cam(pos, target, u) {
        const k = ease(0, 6, u);
        pos.set(-4.2 * k, 3.6 - 0.9 * k, 2.4 + 3.2 * k);
        target.set(0, 3.2 - 1.6 * k, -R + 1 + 3 * k);
      },
      onEnd() {
        chapter.hz.set('n2', Math.round(dose * 100));
        chapter.hz.survive('c1');
        site.portal = 'hz:hull';
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
    act() {
      if (phase === 'fly') nextBand(1);
    },
    prompt: () => (phase === 'fly' && remain() <= C.HZ_C13 ? CHART.hands : ''),
    enter() {
      chapter.advance('hz_bell5');
      crew.muster();
      reset();
      sky.U.uRite.value = 1;
      sky.U.uShip.value = 0;
      input.bandPrev = input.lampToggle = false;
      lampHud.show(true, false, CHART.keys);
      chapterHud.racing(true); // (a seat: the on-foot key list is not for this)
      afterDeath = memo.died ? 1.2 : 0;
      if (!memo.taught) {
        memo.taught = true;
        phase = 'intro';
        site.st.play(S5, C.HZ_S5, { onEnd: () => (phase = 'fly') });
      } else phase = 'fly';
    },
    leave() {
      lampHud.show(false);
      chapterHud.racing(false);
      setDread(0);
    },
    tick(d, tm) {
      time.value = tm;
      sky.U.uTime.value = tm;
      const w = site.st.walker();
      if (w) sky.mesh.position.copy(w);
      crew.tick(d, tm, site.st.speaker);
      for (const f of figs) f.U.uTime.value = tm;
      if (afterDeath > 0 && (afterDeath -= d) <= 0) {
        site.st.say(AFTER_DEATH[memo.died] || AFTER_DEATH.chart, null, 7);
        memo.died = null;
      }
      if (phase === 'fly') {
        if (input.bandPrev) nextBand(-1);
        input.bandPrev = input.lampToggle = false;
        const left = remain();
        // (auto, for a test: fly the ship's old course, wear each line's colour, and let go at the roof)
        let want = forced != null ? forced : moveAxes().strafe;
        if (auto) {
          const roofT = C.HZ_C7 + 2;
          const slopeOld = (C.HZ_C7 - C.HZ_C6) / (roofT - C.HZ_C6);
          const xo = C.HZ_C6 + slopeOld * (t - C.HZ_C6);
          want = left < C.HZ_C14 + 1.5 ? 0 : clamp((slopeOld + (xo - x) * 5 + C.HZ_C1) / C.HZ_C3, -1, 1);
          for (const s of STREAMS) if (t > s.t0 - 0.06 && t < s.t0 + s.len && Math.abs(x - streamX(s, t)) < 0.09) setBand(s.bandI);
          if (left < 7) setBand(ROOF[Math.floor(clamp(x + 1, 0, 0.999) * 5)]);
        }
        if (reserve <= 0) want = 0;
        lean += (want - lean) * Math.min(1, d * C.HZ_C4);
        const slope = clamp(-C.HZ_C1 + lean * C.HZ_C3, -C.HZ_C2, C.HZ_C2);
        const dc = d * C.HZ_C5, t0 = t;
        x += slope * dc;
        t += dc;
        reserve = Math.max(0, reserve - Math.abs(lean) * C.HZ_C9 * d);
        roofLeft = Math.max(0, roofLeft - d * 31 * (1 + C.HZ_C10 * lean * lean));
        if (lamp.band !== lastBand) bandClick((lastBand = lamp.band));
        // the other lines: crossed in their own band they pass through; in any other they cost dose
        for (let i = 0; i < STREAMS.length; i++) {
          const s = STREAMS[i];
          const now = Math.sign(x - streamX(s, t)) || side[i];
          if (now !== side[i] && t >= s.t0 && t0 <= s.t0 + s.len) {
            if (lamp.band === s.bandI) bark('through');
            else {
              dose += s.width * C.HZ_C8;
              bark('hit', { n: Math.round(dose * 100) });
            }
          }
          side[i] = now;
        }
        // the starboard roof
        const ds = (2 - t - x) / 1.4142;
        if (x > -0.25 && ds < C.HZ_C11) dose += C.HZ_C12 * d * (1 - ds / C.HZ_C11) * (x > 0 ? 4 : 1);
        if (lean > 0.5) {
          if ((starT += d) > 1.5) bark('starboard');
        } else starT = 0;
        if (Math.abs(lean) > 0.5 && (leanT += d) > 7) bark('lean');
        if (reserve < 0.25) bark('spent');
        if (left < 45) bark('roof');
        // the last of it: the helm is let go
        if (left <= C.HZ_C13) {
          chapter.advance('hz_bell6');
          bark('ten');
        }
        if (left <= C.HZ_C14) {
          bark('four');
          if (Math.abs(want) > 0.05) dose += C.HZ_C15 * d;
        }
        doseTicks(dose * 14, d);
        if (x > 0 && t >= 2 - x) dose = 1; // through the starboard roof: nothing does that
        else if (x <= 0 && t >= x + 2) {
          const band = ROOF[Math.floor(clamp(x + 1, 0, 0.999) * 5)];
          dose += lamp.band !== band ? C.HZ_C18 : band === bandIndex('xray') ? C.HZ_C17 : C.HZ_C16;
          if (dose < 1) cross();
        }
        if (dose >= 1 && phase === 'fly') die();
        chart.ship(x, t, slope);
      }
      // the window agrees with the chart
      const T = tau();
      sky.fall(C.HZ_T1 - T);
      const dPort = (x + 2 - t) / 1.4142, dStar = (2 - t - x) / 1.4142;
      if (phase === 'fly' || phase === 'intro') {
        sky.U.uPort.value = 1 - clamp(dPort / 0.7, 0, 1);
        sky.U.uStar.value = (1 - clamp(dStar / 0.45, 0, 1)) ** 2;
      }
      chart.U.uGlare.value = 0.02 * sky.U.uStar.value;
      setHum(0.3 + 0.6 * Math.abs(lean));
      setDread(sky.U.uStar.value);
      lamp.energy = reserve;
      lamp.dose = Math.min(1, dose);
      lampHud.update();
      showClocks(T, roofLeft, true);
    },
    info: () => ({ place: 'helm', stage: chapter.stage(), phase, x: +x.toFixed(3), t: +t.toFixed(3), lean: +lean.toFixed(2), reserve: +reserve.toFixed(2), dose: +dose.toFixed(2), band: lamp.band, remain: +remain().toFixed(1), pending: chapter.hz.pending(), crew: crew.aboard() }),
    dbg: {
      set(nx, nt) {
        x = nx;
        t = nt;
        for (let i = 0; i < STREAMS.length; i++) side[i] = Math.sign(x - streamX(STREAMS[i], t)) || 1;
        return true;
      },
      lean: (v) => ((forced = v), true),
      band: (i) => (setBand(i), true),
      dose: (v) => ((dose = v), true),
      auto: (on = true) => ((auto = on), true),
    },
  });
  return site;
}
