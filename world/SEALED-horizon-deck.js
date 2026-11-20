// SEALED: the owner has not played this yet. Do not open.
//
// The bridge, inside (GDD 5.7.7): the first three stages of the chapter.
//
//   bell1   the glass opens on the sky as someone falling in sees it (the
//           formulas are in world/SEALED-horizon-sky.js), and three clocks
//   bell2   the lamp, from a seat at the middle of the deck: four sightings,
//           each in its band, then every band on what is ahead
//   bell3   the count: a chart for a hole that does not spin; one burn, tried
//           by hand; then the sky is seen to turn and the chart is redrawn
//
// Physics kept to: the clocks, the size of the dark and the colours of the sky
// come from the rain-frame formulas. The burn is the real result (one short
// burn brings a faller from the (4/3) M path toward the pi M one; more only
// costs time), with a made-up curve between those two true ends (X1). The
// sightings ahead are X2, the visible turning of the sky X3.

import * as THREE from 'three';
import { C, CH_TIER, HZ_TAU } from '../src/constants.js';
import { Q } from '../src/quality.js';
import { input } from '../src/input.js';
import { cWalk } from '../src/capitalWalk.js';
import { chapterHud } from '../src/chapterHud.js';
import { lampHud } from '../src/lampHud.js';
import { lamp, nextBand, toggleLamp, resetLamp, lampLive } from '../src/lamp.js';
import { tint, cyl } from './capital.js';
import { setHum, setRadio, logChime, bandClick, doseTicks } from './entryzero-audio.js';
import { BANDS } from './entryzero-dialogue.js';
import { createSky, AHEAD, HOME_DIR, shadowAngle, homeSeen } from './SEALED-horizon-sky.js';
import { R, ease, bandIndex, buildShell, createCrew, makeSite, createChart, createMotes, showClocks, shows } from './SEALED-horizon-ship.js';
import { S1, S2, S3A, S3B, LAMP, COUNT } from './SEALED-horizon-words.js';

const TABLE = { x: 0, z: 1.6 };
const SEAT = new THREE.Vector3(0, 2.3, -1.2);
const DOOR = { x: 0, z: R - 1.6 };

export function createDeck(ctx) {
  const { chapter } = ctx;
  const time = { value: 0 };
  const shell = buildShell(time, [tint(cyl(1.25, 1.0, 0.95, TABLE.x, 0.47, TABLE.z, 20), 0x1c262d)]);
  const group = shell.group;
  group.visible = false;
  ctx.scene.add(group);
  const sky = createSky();
  group.add(sky.mesh);
  const crew = createCrew(chapter, group);
  const chart = createChart(time);
  chart.group.rotation.x = -Math.PI / 2;
  chart.group.scale.setScalar(1.0);
  chart.group.position.set(TABLE.x, 0.97, TABLE.z + 0.1);
  chart.show(false);
  group.add(chart.group);
  const motes = createMotes(CH_TIER[Q.tier].hzMotes);
  motes.points.scale.setScalar(0.9);
  motes.points.position.set(TABLE.x, 1.7, TABLE.z);
  group.add(motes.points);
  const glow = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.07, 6, 36).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffe2a0, fog: false }));
  glow.position.set(DOOR.x, 0.05, DOOR.z);
  group.add(glow);

  // the sightings: where each is in the sky, and the band it shows in
  const sights = LAMP.sights.map((s, i) => {
    const dir = new THREE.Vector3();
    if (s.id === 'home') dir.copy(HOME_DIR);
    else if (s.id === 'belt') dir.set(0.8, 0.45, -0.55).normalize();
    else if (s.id === 'gas') dir.set(-0.85, 0.5, 0.4).normalize();
    else dir.copy(AHEAD);
    sky.U.uMarkCol.value[i].set(BANDS[bandIndex(s.band)].tint);
    return { ...s, dir, bandI: bandIndex(s.band), held: 0 };
  });
  const ALL = (1 << sights.length) - 1;

  let local = 0; // seconds in this place, for the clocks
  let seat = false, yaw = 0, pitch = 0.8, baseYaw = 0, allHeld = 0, lastBand = -1;
  let phase = ''; // '' | 'burn' | 'after'
  let burn = 0, burned = false, burnWait = 0, left = C.HZ_FALL, afterT = 0, afterStep = 0;
  let turned = false, turning = false, swirl = 0;
  let queue = null, queueT = 0, queueI = 0; // lines said one after another after a sighting
  const aim = new THREE.Vector3();
  const stageI = () => (chapter.reached('hz_bell3') ? 2 : chapter.reached('hz_bell2') ? 1 : 0);
  const tau = () => HZ_TAU[stageI()] + local;
  const n1 = () => chapter.hz.get('n1') || 0;

  function glass(k) {
    sky.U.uOpen.value = k;
    shell.railMat.color.setRGB(0.5, 1.4, 1.6).multiplyScalar(0.6 + 0.4 * k);
  }
  function tableKind(morph) {
    chart.U.uKind.value = 1;
    chart.U.uMorph.value = morph;
    chart.U.uLit.value = morph;
  }
  const leftAt = (b) => {
    const k = (b - C.HZ_BURN_BEST) / C.HZ_BURN_BEST;
    return C.HZ_FALL + (C.HZ_MOST - C.HZ_FALL) * Math.max(-0.4, 1 - k * k);
  };

  // --- bell1 ---
  function playS1() {
    site.st.play(S1, C.HZ_S1, {
      pose(u) {
        glass(ease(0, 6, u));
      },
      cam(pos, target, u) {
        const fwd = ease(12, 20, u), down = ease(37, 41, u) * (1 - ease(46, 50, u));
        pos.set(-3.6 + 3.6 * fwd, 2.7, 5.2 + 1.2 * fwd);
        target.set(HOME_DIR.x * 60 * (1 - fwd) + AHEAD.x * 60 * fwd, (HOME_DIR.y * 60 * (1 - fwd) + (2 + 16 * fwd) * fwd) * (1 - down) + 1.7 * down, (HOME_DIR.z * 60 * (1 - fwd) - 60 * fwd) * (1 - down) + TABLE.z * down);
      },
      onEnd() {
        glass(1);
        chapter.advance('hz_bell2');
      },
    });
  }
  // --- bell2 ---
  function takeSeat() {
    seat = true;
    site.hidePilot = true;
    yaw = 0.2;
    pitch = 0.75; // looking astern and up, at home
    baseYaw = cWalk.yaw;
    cWalk.pitch = 0;
    resetLamp(true);
    lamp.canAll = n1() === ALL;
    lastBand = lamp.band;
    input.bandPrev = input.lampToggle = false;
    lampHud.show(true, false, lamp.canAll ? LAMP.all : LAMP.keys);
    chapterHud.racing(true); // (a seat: the on-foot key list is not for this)
  }
  function leaveSeat() {
    seat = false;
    site.hidePilot = false;
    lampHud.show(false);
    chapterHud.racing(false);
    setRadio(false, 0);
    for (let i = 0; i < sights.length; i++) sky.U.uMark.value[i].w = 0;
  }
  function logSight(i) {
    const bit = 1 << i;
    if (n1() & bit) return false;
    chapter.hz.set('n1', n1() | bit);
    logChime();
    chapterHud.say(sights[i].log, 5);
    queue = sights[i].say;
    queueT = 5;
    queueI = 0;
    if (sights[i].id === 'home') sky.U.uRite.value = 1;
    if (n1() === ALL) {
      lamp.canAll = true;
      lampHud.show(true, false, LAMP.all);
    }
    return true;
  }
  function playS2() {
    queue = null;
    site.st.play(S2, C.HZ_S2, {
      pose(u) {
        sky.U.uShip.value = ease(0, 5, u);
      },
      cam(pos, target, u) {
        const back = ease(24, 30, u);
        pos.set(2.4 * back, 2.3 + 0.4 * back, SEAT.z + 6.5 * back);
        target.set(AHEAD.x * 80, AHEAD.y * 80 * (1 - back) + 1.6 * back, -80 * (1 - back) + (-R + 4.4) * back);
      },
      onEnd() {
        sky.U.uShip.value = 1;
        leaveSeat();
        chapter.advance('hz_bell3');
      },
    });
  }
  // --- bell3 ---
  function playS3() {
    chart.U.uKind.value = 0;
    chart.U.uMorph.value = 0;
    chart.U.uLit.value = 0;
    site.st.play(S3A, C.HZ_S3A, {
      cam: tableCam,
      onEnd() {
        phase = 'burn';
        burn = 0;
        burned = false;
        burnWait = 0;
        left = C.HZ_FALL;
      },
    });
  }
  function tableCam(pos, target) {
    pos.set(TABLE.x + 0.4, 3.3, TABLE.z + 2.6);
    target.set(TABLE.x, 0.9, TABLE.z - 0.2);
  }
  function endBurn(b) {
    burn = b;
    left = leftAt(b);
    phase = 'after';
    afterT = 0;
    afterStep = 0;
    const k = (left - C.HZ_FALL) / (C.HZ_MOST - C.HZ_FALL);
    site.st.say(b < 0.2 ? COUNT.none : b > C.HZ_BURN_BEST && k < 0.8 ? COUNT.long : COUNT.best, null, 8);
  }
  function playS3B() {
    phase = '';
    turning = true;
    site.st.play(S3B, C.HZ_S3B, {
      pose(u) {
        tableKind(ease(9, 17, u));
      },
      cam(pos, target, u) {
        if (u < 8) {
          pos.set(0, 2.5, 5.5);
          target.set(30, 22, -50);
        } else tableCam(pos, target);
      },
      onEnd() {
        tableKind(1);
        turned = true;
        chapter.hz.set('n4', Math.round(left));
      },
    });
  }

  const site = makeSite(ctx, {
    group,
    surfaces: [{ kind: 'disc', cx: 0, cz: 0, r: R - 0.5, y: 0 }],
    colliders: [{ x: 0, z: -R + 2.2, r: 1.1, top: Infinity }, { x: TABLE.x, z: TABLE.z, r: 1.35, top: Infinity }],
    spawn: new THREE.Vector3(0, 0, -R + 4.4),
    spawnYaw: Math.PI,
    consoles: [
      { x: 0, y: 0, z: -R + 3.6, r: 2.0, prompt: LAMP.use, off: () => seat || chapter.stage() !== 'hz_bell2', use: () => (takeSeat(), null) },
      { x: TABLE.x, y: 0, z: TABLE.z, r: 2.4, prompt: COUNT.use, off: () => chapter.stage() !== 'hz_bell3' || turned || phase !== '', use: () => (playS3(), null) },
      { x: DOOR.x, y: 0, z: DOOR.z, r: 1.7, prompt: COUNT.below, off: () => !turned, use: () => ((site.portal = 'hz:hall'), null) },
    ],
    held: () => seat || phase !== '',
    camera(pos, target) {
      if (seat) {
        pos.copy(SEAT);
        target.copy(SEAT).addScaledVector(aim, 10);
        return true;
      }
      if (phase !== '') {
        tableCam(pos, target);
        return true;
      }
      return false;
    },
    act() {
      if (seat) nextBand(1);
    },
    prompt: () => (phase === 'burn' ? COUNT.burn : ''),
    enter() {
      local = 0;
      seat = false;
      phase = '';
      queue = null;
      turning = false;
      site.hidePilot = false;
      crew.muster();
      sky.fall(C.HZ_FALL - tau());
      sky.U.uRite.value = n1() & 1 ? 1 : 0;
      sky.U.uShip.value = chapter.reached('hz_bell3') ? 1 : 0;
      sky.U.uPort.value = sky.U.uStar.value = 0;
      turned = chapter.hz.get('n4') != null;
      tableKind(turned ? 1 : 0);
      chart.U.uKind.value = turned ? 1 : 0;
      glow.visible = turned;
      if (!chapter.reached('hz_bell1')) chapter.advance('hz_bell1');
      if (chapter.stage() === 'hz_bell1') {
        glass(0);
        playS1();
      } else glass(1);
    },
    leave() {
      if (seat) leaveSeat();
      phase = '';
    },
    tick(d, t) {
      time.value = t;
      local += d;
      const w = site.st.walker();
      if (w) sky.mesh.position.copy(w);
      const T = tau();
      sky.fall(C.HZ_FALL - T);
      if (turned || turning) swirl += d * 0.03; // (X3: the dragging is real; seeing it this easily is not)
      sky.U.uSwirl.value = swirl;
      sky.U.uTime.value = t;
      motes.U.uTime.value = t;
      glow.visible = turned;
      setHum(0.3);
      // the clocks: from the moment they are spoken of
      if (chapter.reached('hz_bell2') || site.st.u() >= 24) {
        if (turned) showClocks(T, C.HZ_TO_ROOF - (T - HZ_TAU[2]), true);
        else showClocks(T, (phase !== '' || turning ? left : chapter.hz.get('n4') ?? C.HZ_FALL) - T);
      }
      crew.tick(d, t, site.st.speaker);

      if (seat && !site.st.busy()) {
        // the walker has turned the mouse into a look: take it for the lamp's aim
        yaw += cWalk.yaw - baseYaw;
        pitch = Math.max(-1.2, Math.min(1.45, pitch - cWalk.pitch));
        cWalk.yaw = baseYaw;
        cWalk.pitch = 0;
        if (input.bandPrev) nextBand(-1);
        if (input.lampToggle) toggleLamp();
        input.bandPrev = input.lampToggle = false;
        if (lamp.band !== lastBand) bandClick((lastBand = lamp.band));
        const cp = Math.cos(pitch);
        aim.set(Math.sin(yaw) * cp, Math.sin(pitch), Math.cos(yaw) * cp);
        const live = lampLive();
        const done = n1();
        let radioNear = 0;
        for (let i = 0; i < sights.length; i++) {
          const s = sights[i];
          const inBand = live && lamp.band === s.bandI;
          const near = Math.acos(Math.min(1, aim.dot(s.dir)));
          sky.U.uMark.value[i].set(s.dir.x, s.dir.y, s.dir.z, done & (1 << i) ? 0.35 : inBand ? 1 : 0.12);
          if (s.band === 'radio' && inBand) radioNear = Math.max(0, 1 - near / 1.2);
          if (inBand && near < C.HZ_AIM && !(done & (1 << i))) {
            s.held += d;
            if (s.held >= C.HZ_SIGHT_TIME) logSight(i);
          } else s.held = 0;
        }
        setRadio(live && lamp.band === bandIndex('radio'), radioNear);
        // (the X-ray band costs dose, as it always did; nothing here is killed by it)
        if (live && lamp.band === bandIndex('xray')) {
          lamp.dose = Math.min(0.9, lamp.dose + d * 0.03);
          doseTicks(6, d);
        }
        // every band, on what is ahead
        if (done === ALL && input.allBands && live && Math.acos(Math.min(1, aim.dot(AHEAD))) < C.HZ_AIM * 1.5) {
          allHeld += d;
          if (allHeld > 1.5) {
            allHeld = 0;
            playS2();
          }
        } else allHeld = 0;
        lampHud.update();
      }
      // what is said after a sighting, a line at a time
      if (queue && !site.st.busy()) {
        queueT -= d;
        if (queueT <= 0) {
          let said = false;
          while (queueI < queue.length && !said) {
            const l = queue[queueI++];
            said = shows(chapter, l);
            site.st.say(l);
          }
          queueT = 6.5;
          if (queueI >= queue.length) queue = null;
        }
      }
      if (phase === 'burn') {
        burnWait += d;
        if (input.brake) {
          burn += d;
          burned = true;
          left = leftAt(burn);
          setHum(1);
        } else if (burned) endBurn(burn);
        else if (burnWait > C.HZ_BURN_WAIT) endBurn(0);
        else if (burnWait > 12 && burnWait - d <= 12) site.st.say(COUNT.nudge);
        if (burn > C.HZ_BURN_BEST * 3) endBurn(burn);
      } else if (phase === 'after') {
        afterT += d;
        if (afterStep === 0 && afterT > 7.5) {
          afterStep = 1;
          if (site.st.say(COUNT.fight, null, 7) === null) afterT = 14;
        }
        if (afterStep === 1 && afterT > 14.5) playS3B();
      }
    },
    info: () => ({
      place: 'deck', stage: chapter.stage(), seat, phase, n1: n1(), burn: +burn.toFixed(2), left: Math.round(left), turned,
      shadowDeg: +(shadowAngle(C.HZ_FALL - tau()) * 57.2958).toFixed(1), shadowAtHorizon: +(shadowAngle(C.HZ_FALL) * 57.2958).toFixed(2),
      homeStop: Math.round(homeSeen(0)), crew: crew.aboard(), open: +sky.U.uOpen.value.toFixed(2),
    }),
    dbg: {
      lamp: () => (chapter.stage() === 'hz_bell2' && !seat ? (takeSeat(), true) : false),
      // aim the lamp at a sighting, in its band (the hold is then played out by the place)
      aim(i) {
        const s = sights[i];
        if (!seat || !s) return false;
        yaw = Math.atan2(s.dir.x, s.dir.z);
        pitch = Math.asin(s.dir.y);
        while (lamp.band !== s.bandI) nextBand(1);
        return true;
      },
      count: () => (chapter.stage() === 'hz_bell3' && !turned && phase === '' && !site.st.busy() ? (playS3(), true) : false),
      burn: (b) => (phase === 'burn' ? (endBurn(b), true) : false),
      door: () => (turned ? ((site.portal = 'hz:hall'), true) : false),
    },
  });
  return site;
}
