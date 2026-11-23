// The Pulsar Choir: the hall (GDD 5.7.9; Season 1, chapter 7).
//
// A nave of stone ribs open to the sky, every rib cut to one length, with a
// great rose at its far end that frames the star the whole of it is tuned to.
// The star is a millisecond pulsar: a neutron star turning hundreds of times a
// second, each turn a pulse of radio, steadier than any clock that has been
// built. The people here count their hours by it, date their law by it and
// cast their bells to it.
//
//   the note     A pulse every few milliseconds is not heard as beats. Put
//                through a speaker it is a pitch: 300 turns a second is a note
//                a little above middle D. That is real, and it is how the
//                lamp's radio band gives it here: on that band, from the
//                listening ring before the altar, pointed at the star through the rose, the star is a note in the ear and
//                a bar on the screen.
//   the glitch   Forty days ago the star sped up, all at once: a glitch. The
//                crust and the superfluid inside a neutron star turn at
//                slightly different rates, and now and then they lock and the
//                crust is spun up between one pulse and the next. Real. The
//                bells, cast to the old note, are flat of the new one.
//   the stand    The cantor's stand, in the middle of the nave. The choir
//                sings the old hymn and stops where the star's note used to
//                go; the pilot sings it back on the three bells (1, 2, 3) and
//                puts the star's note as it now is (4, which needs the lamp
//                on the radio band) in the gap. Three verses, longer each
//                time (CHOIR_PHRASES). It is not mended. The step is sung.
//   the choice   An actuary by the altar has a table of every glitch to come.
//                The First Voice asks the pilot whether to take it.
//
// The science, and where it is stretched. Real: millisecond pulsars and their
// use as clocks; glitches; a fast pulsar heard as a pitch. Stretched, for the
// ear: a real glitch changes the spin by a part in a million or less (and in
// millisecond pulsars they are rarer and smaller still), which no ear could
// tell; here the step is about a semitone, so that it can be sung. And a beam
// sweeping three hundred times a second cannot be seen to sweep: it is drawn
// as the steady smear it would be.
//
// Nothing here can kill the pilot. A site for the platform walker
// (src/capitalWalk.js), in the world, docked at by the freighter (src/game.js
// SYSTEM_DOCK). `story` is the system's stage machine (world/choir-system.js).

import * as THREE from 'three';
import { C, CHOIR_PHRASES, CHOIR_NOTES } from '../src/constants.js';
import { sun } from '../src/sun.js';
import { input } from '../src/input.js';
import { cWalk } from '../src/capitalWalk.js';
import { chapterHud } from '../src/chapterHud.js';
import { lampHud } from '../src/lampHud.js';
import { lamp, LAMP_U, BAND, nextBand, toggleLamp, stepLamp, lampLive, resetLamp, lampState } from '../src/lamp.js';
import { isDialogueOpen } from '../src/dialogue.js';
import { mulberry32 } from '../src/noise2.js';
import { uiSound, chime } from '../src/sfx.js';
import { tint, box, cyl, mergedMesh, floorOf } from './capital.js';
import { buildRig, poseRig } from './aliens.js';
import { measureRig, standRig } from './rigGround.js';
import { BEAM_VERT, BEAM_FRAG } from './submersible.js';
import { logChime, bandClick, setRadio, hush } from './entryzero-audio.js';
import { createSceneClock, crewSay } from './sceneClock.js';
import { createCrewFollow } from './crewFollow.js';
import { CHOIR } from './choir-dialogue.js';

const ZERO = new THREE.Vector3();
const SNAP = 1.2;
const KEY = 'ch7.choir';
const HW = 30; // the nave: x -30..30
const Z_DOOR = 112, Z_APSE = -166;
const COURT = [0, 150], COURT_R = 30, PAD_R = 20;
const STAND = [0, -20], ALTAR = [0, -132], ELDEST = [0, -122], ACTUARY = [10, -126], LISTEN = [0, -98];
const ROSE = new THREE.Vector3(0, 34, -190), ROSE_R = 26;
const RIB_H = 60, RIB_R = 28;
const BELLS = [{ z: -40, k: 1.35 }, { z: -64, k: 1.05 }, { z: -88, k: 0.8 }];
// toward the star: low over the far end, so that from the west door it stands in the middle of the
// rose, and from the listening ring it is still inside it
const STAR_DIR = new THREE.Vector3(0, ROSE.y - 5, ROSE.z - (COURT[1] - 14)).normalize();
const ease = (a, b, x) => {
  const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

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

// ctx: the system's. story: { stage(), reached(s), advance(s) }
export function createChoirHall(ctx, story) {
  const { chapter, season } = ctx;
  const group = new THREE.Group();
  const surfaces = [], colliders = [];
  const litMat = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x0e1016 });
  const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false });
  {
    const lit = [], glow = [];
    // the forecourt, and the floor of the nave
    lit.push(tint(cyl(COURT_R, COURT_R + 2, 2, COURT[0], -1, COURT[1], 36), 0x343640), tint(cyl(PAD_R, PAD_R, 0.14, COURT[0], 0.07, COURT[1], 32), 0x4c4f5c));
    surfaces.push({ kind: 'disc', cx: COURT[0], cz: COURT[1], r: COURT_R - 0.6, y: 0 });
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      glow.push(tint(box(0.7, 0.12, 0.7, COURT[0] + Math.cos(a) * (PAD_R - 0.7), 0.16, COURT[1] + Math.sin(a) * (PAD_R - 0.7)), 0xcfe0ff, 1.4));
    }
    const zc = (Z_DOOR + 14 + Z_APSE) / 2, zl = (Z_DOOR + 14 - Z_APSE) / 2;
    lit.push(tint(box(HW * 2 + 4, 2, zl * 2, 0, -1, zc), 0x2c2e38));
    surfaces.push({ kind: 'rect', cx: 0, cz: zc, ux: 0, uz: 1, hl: zl - 0.6, hw: HW - 0.6, yA: 0, yB: 0 });
    lit.push(tint(box(9, 0.06, zl * 2 - 20, 0, 0.03, zc), 0x41444f)); // the aisle
    for (const s of [-1, 1]) glow.push(tint(box(0.12, 0.06, zl * 2 - 20, s * 4.6, 0.07, zc), 0x9fc8ff, 1.1));
    // the ribs: every one the same, bay after bay, and the ridge they meet at
    let n = 0;
    for (let z = Z_DOOR - 8; z >= Z_APSE + 6; z -= 21) {
      for (const s of [-1, 1]) {
        lit.push(tint(cyl(1.3, 1.9, RIB_H, s * RIB_R, RIB_H / 2, z, 10), 0x4a4d5a));
        lit.push(tint(cyl(2.6, 2.6, 1.2, s * RIB_R, 0.6, z, 10), 0x5a5d6a));
        colliders.push({ x: s * RIB_R, z, r: 2.2, top: Infinity });
        // a string of light up each: the star's note, held in the stone
        glow.push(tint(box(0.12, RIB_H - 6, 0.12, s * (RIB_R - 1.5), RIB_H / 2 + 1, z), 0x7fb0ff, 0.9));
      }
      lit.push(tint(new THREE.TorusGeometry(RIB_R, 0.95, 6, 22, Math.PI).translate(0, RIB_H, z), 0x4a4d5a));
      n++;
    }
    lit.push(tint(box(1.6, 1.6, zl * 2 - 30, 0, RIB_H + RIB_R - 0.4, zc), 0x3c3f4b));
    for (const s of [-1, 1]) lit.push(tint(box(1.0, 1.0, zl * 2 - 30, s * RIB_R, RIB_H, zc), 0x3c3f4b));
    // the rose: a ring that frames the star, and the spokes that hold it
    lit.push(tint(new THREE.TorusGeometry(ROSE_R, 1.5, 8, 48).translate(ROSE.x, ROSE.y, ROSE.z), 0x5a5d6a));
    lit.push(tint(new THREE.TorusGeometry(ROSE_R * 0.42, 0.6, 6, 32).translate(ROSE.x, ROSE.y, ROSE.z), 0x5a5d6a));
    for (let i = 0; i < 12; i++) lit.push(tint(box(0.5, ROSE_R * 0.58, 0.5, 0, ROSE_R * 0.71, 0).rotateZ((i / 12) * Math.PI * 2).translate(ROSE.x, ROSE.y, ROSE.z), 0x4a4d5a));
    for (const s of [-1, 1]) lit.push(tint(cyl(1.6, 2.4, ROSE.y - ROSE_R + 4, s * 16, (ROSE.y - ROSE_R + 4) / 2, ROSE.z, 10), 0x4a4d5a));
    // the altar, the listening floor under the rose, the cantor's stand
    lit.push(tint(box(9, 1.6, 3.4, ALTAR[0], 0.8, ALTAR[1] - 4.5), 0x5a5d6a));
    colliders.push({ x: ALTAR[0] - 2.4, z: ALTAR[1] - 4.5, r: 2.2, top: Infinity }, { x: ALTAR[0] + 2.4, z: ALTAR[1] - 4.5, r: 2.2, top: Infinity });
    glow.push(tint(new THREE.TorusGeometry(12, 0.12, 6, 48).rotateX(Math.PI / 2).translate(LISTEN[0], 0.08, LISTEN[1]), 0xbfe0ff, 1.3));
    glow.push(tint(new THREE.TorusGeometry(4, 0.08, 6, 32).rotateX(Math.PI / 2).translate(LISTEN[0], 0.08, LISTEN[1]), 0xbfe0ff, 1.3));
    lit.push(tint(cyl(3.4, 3.8, 0.5, STAND[0], 0.25, STAND[1], 20), 0x5a5d6a), tint(box(1.3, 1.3, 0.7, STAND[0], 1.15, STAND[1] - 2.2), 0x4a4d5a));
    glow.push(tint(box(1.1, 0.06, 0.5, STAND[0], 1.83, STAND[1] - 2.2), 0xfff0c8, 1.4));
    surfaces.push({ kind: 'disc', cx: STAND[0], cz: STAND[1], r: 3.4, y: 0.5 });
    colliders.push({ x: STAND[0], z: STAND[1] - 2.2, r: 0.9, top: Infinity });
    group.add(mergedMesh(lit, litMat));
    group.add(mergedMesh(glow, glowMat));
    void n;
  }
  // the rose's own light: brighter the better the lamp has the star
  const roseGlow = new THREE.Mesh(new THREE.TorusGeometry(ROSE_R - 2.2, 0.5, 6, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 0.6, 1.0), fog: false }));
  roseGlow.position.copy(ROSE);
  group.add(roseGlow);
  // the star, and its beam as the eye would have it: too fast to sweep, so a steady smear both ways
  const tex = glowTexture();
  const star = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0xcfe0ff, map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  star.position.copy(ROSE).addScaledVector(STAR_DIR, 150000);
  star.scale.setScalar(7000);
  group.add(star);
  const beamMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.35, 0.55, 1.0), transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const beams = new THREE.Group();
  for (const s of [-1, 1]) beams.add(new THREE.Mesh(new THREE.ConeGeometry(2600, 60000, 20, 1, true).translate(0, -30000, 0).rotateZ(s > 0 ? 0 : Math.PI), beamMat));
  beams.position.copy(star.position);
  beams.rotation.set(0.5, 0, 0.9);
  group.add(beams);
  // the forecast's table, on the altar, if it was taken
  const table = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.12, 1.5), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.5, 1.45, 1.3), fog: false }));
  table.position.set(ALTAR[0], 1.68, ALTAR[1] - 4.5);
  group.add(table);

  // --- the bells: three, hung from the ridge over the nave ---
  const bellMat = () => new THREE.MeshLambertMaterial({ color: 0x9a7a44, emissive: 0x000000, side: THREE.DoubleSide });
  const bells = BELLS.map((b, i) => {
    const pivot = new THREE.Group();
    pivot.position.set(0, RIB_H + RIB_R - 1.5, b.z);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(1.6 * b.k, 4.2 * b.k, 7 * b.k, 18, 1, true).translate(0, -22 - 3.5 * b.k, 0), bellMat());
    const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 22, 5).translate(0, -11, 0), new THREE.MeshBasicMaterial({ color: 0x3c3f4b, fog: false }));
    pivot.add(body, rope);
    group.add(pivot);
    return { pivot, body, swing: 0, ring: 0, ph: i * 1.3 };
  });
  function ringBell(i, loud = 1) {
    const b = bells[i];
    if (!b) return;
    b.ring = 1;
    b.swing = Math.max(b.swing, 0.6 * loud);
  }

  // --- the choir, in ranks down both sides; the First Voice; the actuary ---
  const figure = (seed, x, z, yaw, k = 1) => {
    const rig = measureRig(buildRig(seed, 'choir'));
    rig.group.scale.setScalar(k);
    rig.group.position.set(x, 0, z);
    rig.group.rotation.y = yaw;
    group.add(rig.group);
    return rig;
  };
  const singers = [];
  {
    const rng = mulberry32(0xc401);
    const N = Math.round(C.CHOIR_SINGERS);
    for (let i = 0; i < N; i++) {
      const s = i % 2 ? 1 : -1, row = Math.floor(i / 2);
      const x = s * (12 + (row % 2) * 6 + rng() * 1.5), z = 44 - row * (150 / Math.ceil(N / 2)) + rng() * 3;
      singers.push({ rig: figure(0x5000 + i * 4099, x, z, -s * Math.PI / 2, 0.86 + rng() * 0.3), x, z });
      colliders.push({ x, z, r: 0.6, top: Infinity });
    }
  }
  const eldest = figure(0xe1de5, ELDEST[0], ELDEST[1], 0, 1.12);
  const actuary = figure(0xac70a, ACTUARY[0], ACTUARY[1], -0.5, 1.0);
  colliders.push({ x: ACTUARY[0], z: ACTUARY[1], r: 0.6, top: Infinity });

  // --- the lamp in the pilot's hand ---
  const hand = new THREE.Group();
  hand.rotation.order = 'YXZ';
  const beam = new THREE.Mesh(
    new THREE.ConeGeometry(Math.tan(C.EZ_LAMP_CONE), 1, 24, 1, true).translate(0, -0.5, 0).rotateX(-Math.PI / 2),
    new THREE.ShaderMaterial({ uniforms: LAMP_U, vertexShader: BEAM_VERT, fragmentShader: BEAM_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }),
  );
  beam.frustumCulled = false;
  beam.renderOrder = 7;
  hand.add(beam);
  hand.visible = false;
  group.add(hand);

  const bucket = () => (story.reached('decided') ? 'after' : story.reached('met') ? 'mid' : 'early');
  const crew = createCrewFollow({
    group, floorY: 0,
    talk: (c) => ({ speaker: { name: c.name, species: c.species, cityId: CHOIR.hall.city }, lines: CHOIR.ground[c.id][bucket()], cine: true }),
  });

  // --- the pads (touch; a keyboard has 1 to 4) ---
  let pads = null;
  function buildPads() {
    if (pads) return;
    const style = document.createElement('style');
    style.textContent = `
#choirPads { position: fixed; left: 50%; bottom: 24vh; transform: translateX(-50%); display: none; gap: 1vw; z-index: 61; font-family: 'Courier New', monospace; }
#choirPads.on { display: flex; }
#choirPads button { width: clamp(70px, 12vw, 132px); padding: 0.9em 0; background: rgba(4, 10, 22, 0.6); border: 1px solid rgba(159, 200, 255, 0.5); color: #cfe0ff; letter-spacing: 0.14em; font: inherit; font-size: clamp(10px, 1.3vw, 15px); border-radius: 6px; }
#choirPads button.star { border-color: rgba(255, 240, 200, 0.7); color: #fff0c8; }
#choirPads button.lit { background: rgba(159, 200, 255, 0.55); color: #04121c; box-shadow: 0 0 22px rgba(159, 200, 255, 0.8); }
#choirPads button.gap { box-shadow: 0 0 18px rgba(255, 240, 200, 0.7) inset; }
#choirPads button.mine.lit { background: rgba(255, 210, 122, 0.6); box-shadow: 0 0 22px rgba(255, 210, 122, 0.8); }
body.ch-cine #choirPads { display: none !important; }`;
    document.head.appendChild(style);
    const root = document.createElement('div');
    root.id = 'choirPads';
    const btn = CHOIR.pads.map((label, i) => {
      const b = document.createElement('button');
      b.textContent = `${i + 1} · ${label}`;
      if (i === 3) b.classList.add('star');
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        press(i);
      });
      root.appendChild(b);
      return b;
    });
    document.body.appendChild(root);
    pads = { root, btn, lit: -1, t: 0 };
  }
  function lightPad(i, mine, gap) {
    if (!pads) return;
    pads.btn.forEach((b, j) => {
      b.classList.toggle('lit', j === i && !gap);
      b.classList.toggle('gap', j === i && !!gap);
      b.classList.toggle('mine', !!mine);
    });
    pads.lit = i;
    pads.t = 0.4;
  }
  const onKey = (e) => {
    const m = /^Digit([1-4])$/.exec(e.code);
    if (m) press(Number(m[1]) - 1);
  };

  // --- state ---
  let walker = null, walkerLive = null, inside = false, prev = null;
  let scene = null, panelText = null, lampOn = false, lastChanged = -1, lastBand = -1;
  let signal = 0, hearT = 0, hintT = 0, atStand = false, taught = false, tolled = -1;
  let tone = null; // { round, phase: 'gap' | 'play' | 'input', i, t, got }
  const later = [];
  const say = (line, sec) => crewSay(chapter, line, sec);
  const queue = (...l) => later.push(...l.filter(Boolean));
  const choice = () => season.get(KEY);
  const radioOn = () => lampOn && lampLive() && lamp.band === BAND.RADIO;

  // --- the scenes: one clock each ---
  function begin(kind, clock) {
    scene = { kind, clock };
    hand.visible = false;
    tolled = -1;
    chapterHud.panel((panelText = null));
    if (pads) pads.root.classList.remove('on');
    chapterHud.cine(true);
    clock.begin();
  }
  function endScene() {
    scene = null;
    hand.visible = lampOn;
    chapterHud.cine(false);
  }
  // the hour, begun and not finished
  const arriveClock = createSceneClock({
    T: C.CHOIR_ARRIVE_T, lines: CHOIR.arrive, say: (l) => say(l, 5.5),
    pose(u) {
      const k = ease(11.5, 12.5, u) * (1 - ease(16.2, 17.2, u));
      for (const b of bells) b.swing = Math.max(b.swing, 0.5 * k);
    },
    onEnd() {
      endScene();
      story.advance('docked');
      lampUp();
    },
  });
  // the hall takes the hymn up
  const chorusClock = createSceneClock({
    T: C.CHOIR_CHORUS_T, lines: CHOIR.chorus, say: (l) => say(l, 7),
    pose(u) {
      const k = ease(0, 3, u);
      for (const b of bells) b.swing = Math.max(b.swing, 0.75 * k);
      roseGlow.material.color.setRGB(0.4 + 1.4 * k, 0.6 + 1.2 * k, 1.0 + 1.0 * k);
    },
    onEnd() {
      endScene();
      story.advance('sung');
      logChime();
    },
  });
  // what was chosen, in the hall
  const answerClock = createSceneClock({
    T: C.CHOIR_ANSWER_T, lines: [], say: (l) => say(l, 6),
    pose(u) {
      if (choice() === 'free') for (const b of bells) b.swing = Math.max(b.swing, 0.7 * ease(0.5, 3, u));
    },
    onEnd() {
      endScene();
      story.advance('done');
    },
  });
  function beginAnswer() {
    if (scene || story.stage() !== 'decided') return false;
    const o = choice() === 'forecast' ? CHOIR.forecast : CHOIR.free;
    scene = { kind: 'answer', clock: answerClock, lines: o.scene, said: -1 };
    hand.visible = false;
    tolled = -1;
    chapterHud.panel((panelText = null));
    chapterHud.cine(true);
    answerClock.begin();
    return true;
  }

  // --- the lamp ---
  function lampUp() {
    if (lampOn) return;
    lampOn = true;
    resetLamp(true);
    lamp.medium = 'void';
    lamp.power = C.CHOIR_LAMP_POWER;
    lamp.lineBeam = false;
    lastChanged = lamp.changed;
    lastBand = lamp.band;
    input.bandPrev = input.lampToggle = false;
    lampHud.show(true, false, CHOIR.keys);
    hand.visible = true;
  }

  // --- the stand: the hymn, sung back ---
  function press(i) {
    if (!inside || scene || isDialogueOpen() || i < 0 || i > 3 || !atStand) return;
    if (i === 3 && !radioOn()) {
      // the star's note is the lamp's to give: it is not there off the radio band
      chapterHud.say(CHOIR.hud.starPad, 4);
      return;
    }
    chime(CHOIR_NOTES[i]);
    if (i < 3) ringBell(i, 0.6);
    lightPad(i, true, false);
    if (!tone || tone.phase !== 'input') return;
    const phrase = CHOIR_PHRASES[tone.round];
    if (phrase[tone.got] !== i) {
      tone.phase = 'gap';
      tone.t = 1.5;
      tone.got = 0;
      chapterHud.say(CHOIR.wrong, 4);
      return;
    }
    tone.got++;
    if (tone.got < phrase.length) return;
    chapterHud.say(CHOIR.right[tone.round], 4.5);
    logChime();
    tone.round++;
    tone.got = 0;
    if (tone.round >= CHOIR_PHRASES.length) {
      tone = null;
      atStand = false;
      begin('chorus', chorusClock);
      return;
    }
    tone.phase = 'gap';
    tone.t = 2.4;
  }
  function stepTone(d) {
    if (tone.phase === 'gap') {
      tone.t -= d;
      if (tone.t <= 0) {
        tone.phase = 'play';
        tone.i = -1;
        tone.t = 0;
      }
    } else if (tone.phase === 'play') {
      tone.t -= d;
      if (tone.t <= 0) {
        tone.i++;
        const phrase = CHOIR_PHRASES[tone.round];
        if (tone.i >= phrase.length) {
          tone.phase = 'input';
          tone.got = 0;
        } else {
          const n = phrase[tone.i];
          if (n < 3) {
            chime(CHOIR_NOTES[n]);
            ringBell(n);
            lightPad(n, false, false);
          } else lightPad(3, false, true); // (where the star's note went: nothing is sung)
          tone.t = C.CHOIR_NOTE_TIME;
        }
      }
    }
  }
  function takeStand() {
    if (story.stage() !== 'heard' || scene) return false;
    atStand = true;
    uiSound('engage');
    if (!taught) {
      taught = true;
      queue(...CHOIR.teach);
    }
    if (!tone) tone = { round: 0, phase: 'gap', i: -1, t: taught ? 7 : 2, got: 0 };
    return true;
  }

  // --- the First Voice, and the actuary ---
  function decide(option) {
    if (story.stage() !== 'sung' || (option !== 'free' && option !== 'forecast')) return false;
    // (nothing here can kill: offered, made and survived in one step)
    season.offer(KEY, 'choir:nave', { stage: 'sung' });
    season.decide(KEY, option);
    season.survive(KEY);
    story.advance('decided');
    table.visible = option === 'forecast';
    uiSound('engage');
    queue((option === 'free' ? CHOIR.free : CHOIR.forecast).crew);
    return true;
  }
  const lines = (speaker, l) => ({ speaker, lines: l, cine: true });
  function eldestTalk() {
    const st = story.stage();
    if (st === 'docked') {
      story.advance('met');
      queue(CHOIR.meetCrew);
      return lines(CHOIR.eldest, CHOIR.meet);
    }
    if (st === 'met' || st === 'heard') return lines(CHOIR.eldest, st === 'met' ? CHOIR.meetAgain : [CHOIR.standHint]);
    if (st === 'sung') {
      season.offer(KEY, 'choir:nave', { stage: 'sung' }); // the checkpoint, as the decision is shown
      return {
        ...lines(CHOIR.eldest, CHOIR.decide.lines),
        offer: { kind: 'choice', prompt: CHOIR.decide.prompt, options: [{ label: CHOIR.decide.free, outcomeTag: 'choir:free' }, { label: CHOIR.decide.forecast, outcomeTag: 'choir:forecast' }] },
      };
    }
    return lines(CHOIR.eldest, CHOIR.after);
  }
  const actuaryTalk = () => lines(CHOIR.actuary, story.reached('decided') ? CHOIR.actuaryAfter[choice() === 'forecast' ? 'forecast' : 'free'] : CHOIR.actuaryTalk);

  function panel() {
    const st = story.stage();
    const rows = [];
    if (st === 'docked') rows.push(CHOIR.hud.eldest);
    else if (st === 'met') rows.push(CHOIR.hud.listen, radioOn() ? CHOIR.hud.signal + '█'.repeat(Math.round(signal * 10)).padEnd(10, '░') : CHOIR.hud.noRadio);
    else if (st === 'heard') {
      if (!tone) rows.push(CHOIR.hud.stand);
      else if (!atStand) rows.push(CHOIR.hud.back);
      else rows.push(tone.phase === 'input' ? CHOIR.hud.yours : CHOIR.hud.hear, `${CHOIR.hud.hymn}${tone.round} / ${CHOIR_PHRASES.length}`);
    } else if (st === 'sung') rows.push(CHOIR.hud.ask);
    else if (st === 'done') rows.push(CHOIR.hud.done);
    const text = rows.length && !scene ? rows.join('\n') : null;
    if (text !== panelText) chapterHud.panel((panelText = text));
  }

  const site = {
    group,
    planet: { group: { position: ZERO }, sunDir: ctx.sunDir },
    surfaces,
    colliders,
    floorYAt: floorOf(surfaces, SNAP),
    snap: SNAP,
    pad: new THREE.Vector3(COURT[0], 0.14, COURT[1]),
    padR: PAD_R,
    spawn: new THREE.Vector3(COURT[0] - 8, 0, COURT[1] - 15),
    atStand: new THREE.Vector3(STAND[0], 0.5, STAND[1] + 1),
    leaveHint: CHOIR.hall.leaveHint,
    npcs: [
      { x: ELDEST[0], y: 0, z: ELDEST[1], h: 2.9, talk: eldestTalk },
      { get x() { return actuary.group.visible ? ACTUARY[0] : 1e6; }, y: 0, get z() { return actuary.group.visible ? ACTUARY[1] : 1e6; }, h: 2.6, talk: actuaryTalk },
      ...crew.npcs,
    ],
    consoles: [{ x: STAND[0], y: 0.5, z: STAND[1] + 0.6, r: 3.2, prompt: CHOIR.prompts.stand, off: () => story.stage() !== 'heard' || atStand || !!scene, use: () => (takeStand(), null) }],
    portal: null,
    onChoice(tag) {
      const option = tag === 'choir:free' ? 'free' : tag === 'choir:forecast' ? 'forecast' : null;
      if (!option || !decide(option)) return null;
      return lines(CHOIR.eldest, (option === 'free' ? CHOIR.free : CHOIR.forecast).lines);
    },
    mark() {
      if (scene) return null;
      const st = story.stage();
      if (st === 'docked' || st === 'sung') return { x: ELDEST[0], z: ELDEST[1] + 3, label: CHOIR.marks.eldest };
      if (st === 'met') return { x: LISTEN[0], z: LISTEN[1], label: CHOIR.marks.rose };
      if (st === 'heard' && !atStand) return { x: STAND[0], z: STAND[1], label: CHOIR.marks.stand };
      return null;
    },
    held: () => !!scene,
    act() {
      if (scene) scene.clock.skip();
    },
    heldPrompt: () => (scene ? CHOIR.skip : ''),
    camera(pos, target) {
      if (!scene) return false;
      const u = Math.max(0, scene.clock.u());
      if (scene.kind === 'arrive') {
        // in from the forecourt, down the length of the nave to the rose
        pos.set(0, 5 + u * 0.35, COURT[1] - 14 - u * 2.6);
        target.set(0, 30 + u * 0.4, ROSE.z);
      } else if (scene.kind === 'chorus') {
        // up from the stand, past the bells, to the rose and the star in it
        pos.set(6 - u * 0.2, 4 + u * 1.5, STAND[1] + 16 - u * 2.2);
        target.set(0, ROSE.y - 6 + u * 0.3, ROSE.z);
      } else {
        pos.set(-9 + u * 0.25, 4.6, ALTAR[1] + 22 - u * 0.5);
        target.set(ALTAR[0], 2.2 + (choice() === 'free' ? u * 2.4 : 0), ALTAR[1] - 4.5 - (choice() === 'free' ? u * 1.5 : 0));
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
      prev = {
        ambColor: sun.ambient.color.clone(), ambI: sun.ambient.intensity,
        lampPower: lamp.power, lampMedium: lamp.medium, lampCanAll: lamp.canAll, lampOn: lamp.on, lampBand: lamp.band,
      };
      // starlight through the ribs, and the strings of light in the stone
      sun.ambient.color.setRGB(0.72, 0.8, 1.0);
      sun.ambient.intensity = 0.95;
      scene = null;
      later.length = 0;
      panelText = null;
      signal = 0;
      hearT = 0;
      hintT = 0;
      atStand = false;
      taught = false;
      tone = null;
      table.visible = story.reached('decided') && choice() === 'forecast';
      roseGlow.material.color.setRGB(0.4, 0.6, 1.0);
      lampOn = false;
      if (story.reached('docked')) lampUp();
      buildPads();
      document.addEventListener('keydown', onKey);
      crew.set(ctx.voyage.crew());
      // (left with the choice made and the hall not yet seen to answer it: it answers now)
      if (story.stage() === 'decided') beginAnswer();
    },
    onLeave() {
      if (!inside) return;
      inside = false;
      if (scene) {
        scene.clock.stop();
        endScene();
      }
      crew.set([]);
      document.removeEventListener('keydown', onKey);
      if (pads) pads.root.classList.remove('on');
      lampHud.show(false);
      lampOn = false;
      hand.visible = false;
      hush();
      chapterHud.clear();
      chapterHud.panel(null);
      panelText = null;
      tone = null;
      atStand = false;
      lamp.power = prev.lampPower;
      lamp.medium = prev.lampMedium;
      lamp.canAll = prev.lampCanAll;
      lamp.on = prev.lampOn;
      lamp.band = prev.lampBand;
      stepLamp(0, false);
      sun.ambient.color.copy(prev.ambColor);
      sun.ambient.intensity = prev.ambI;
      prev = null;
    },
    inside: () => inside,
    // every frame the system is mounted: the bells, the star
    update(dt, t) {
      const d = Math.min(dt, 0.1);
      for (const b of bells) {
        b.swing = Math.max(0, b.swing - d * 0.22);
        b.ring = Math.max(0, b.ring - d * 1.6);
        b.pivot.rotation.x = Math.sin(t * 2.3 + b.ph) * 0.42 * b.swing;
        b.body.material.emissive.setRGB(0.5 * b.ring, 0.38 * b.ring, 0.16 * b.ring);
      }
      star.material.opacity = 0.85 + 0.15 * Math.sin(t * 37); // (a flicker: all an eye gets of three hundred turns a second)
      actuary.group.visible = !story.reached('done') || choice() === 'forecast'; // (he stays to hear the answer; told no, he goes)
    },
    tick(dt, t) {
      chapterHud.tick(dt);
      const d = Math.min(dt, 0.1);
      if (!walker) return;
      const st = story.stage();
      const px = cWalk.pos.x, pz = cWalk.pos.z;
      const singing = !!scene && scene.kind !== 'arrive' && !(scene.kind === 'answer' && choice() === 'forecast');
      for (let i = 0; i < singers.length; i++) {
        const s = singers[i];
        poseRig(s.rig, d, t, singing ? 'talk' : 'idle', 0);
        standRig(s.rig, 0);
      }
      for (const r of [eldest, actuary]) {
        if (!r.group.visible) continue;
        poseRig(r, d, t, 'idle', 0);
        standRig(r, 0);
      }
      eldest.group.rotation.y = Math.hypot(px - ELDEST[0], pz - ELDEST[1]) < 10 ? Math.atan2(px - ELDEST[0], pz - ELDEST[1]) : 0;

      // --- a scene has the screen ---
      if (scene) {
        const u = Math.max(0, scene.clock.u());
        // what is rung in it (sound belongs to the frame, not to the pose)
        if (scene.kind === 'arrive') {
          const k = Math.floor((u - 12) / 0.75);
          if (u >= 12 && u < 16.2 && k > tolled) {
            tolled = k;
            chime(CHOIR_NOTES[k % 3]);
            ringBell(k % 3);
          }
        } else if (scene.kind === 'chorus' || (scene.kind === 'answer' && choice() === 'free')) {
          const k = Math.floor(u / 0.62);
          if (u > 0.6 && k > tolled) {
            tolled = k;
            const seq = [0, 2, 3, 1, 0, 3, 2, 1];
            const n = seq[k % seq.length];
            chime(CHOIR_NOTES[n]);
            if (n < 3) ringBell(n);
          }
        }
        if (scene.kind === 'answer') while (scene.said + 1 < scene.lines.length && u >= scene.lines[scene.said + 1][0]) say(scene.lines[++scene.said][1], 6);
        setRadio(false, 0);
        scene.clock.tick(d);
        return; // (a frame that began in a scene ends in it: `st` above is stale once the scene has ended)
      }

      // --- arriving: the hour that is not finished ---
      if (st === 'arrived' && !isDialogueOpen()) {
        begin('arrive', arriveClock);
        return;
      }
      if (later.length && !isDialogueOpen() && chapterHud.state().line == null) {
        const l = later.shift();
        if (l.by !== undefined) say(l, 8);
        else chapterHud.say(l.text, l.sec || 7);
      }

      // --- the lamp in the hand ---
      if (lampOn) {
        if (input.bandPrev) nextBand(1);
        if (input.lampToggle) toggleLamp();
        input.bandPrev = input.lampToggle = false;
        const cp = Math.cos(cWalk.pitch);
        lamp.dir.set(Math.sin(cWalk.yaw) * cp, Math.sin(cWalk.pitch), Math.cos(cWalk.yaw) * cp);
        hand.position.set(px, cWalk.pos.y + 1.35, pz).addScaledVector(lamp.dir, 0.5);
        lamp.pos.copy(hand.position).add(group.position);
        lamp.energy = 1;
        stepLamp(0, false);
        hand.rotation.set(-cWalk.pitch, cWalk.yaw, 0);
        beam.scale.setScalar(lamp.reach * 0.75);
        if (lamp.changed !== lastChanged) {
          lastChanged = lamp.changed;
          if (lamp.band !== lastBand) bandClick((lastBand = lamp.band));
        }
      }
      // --- the radio band is an ear: the star is a note along the way the lamp points ---
      const radio = radioOn();
      const along = Math.max(0, lamp.dir.dot(STAR_DIR));
      const prox = Math.max(0, 1 - Math.hypot(px - LISTEN[0], pz - LISTEN[1]) / 170);
      const near = Math.pow(along, 14) * (0.4 + 0.6 * prox);
      signal += ((radio ? near : 0) - signal) * Math.min(1, d * 5);
      setRadio(radio, signal);
      if (!story.reached('sung')) roseGlow.material.color.setRGB(0.4 + 1.2 * signal, 0.6 + 1.0 * signal, 1.0 + 0.8 * signal);

      // --- under the rose: the star, heard ---
      if (st === 'met') {
        const under = Math.hypot(px - LISTEN[0], pz - LISTEN[1]) < C.CHOIR_LISTEN_R;
        hearT = under && radio && signal > 0.6 ? hearT + d : 0;
        hintT += d;
        if (hearT >= C.CHOIR_HEAR_TIME && !isDialogueOpen()) {
          story.advance('heard');
          logChime();
          queue(...CHOIR.heard, { text: CHOIR.standHint, sec: 9 });
        }
      }
      // --- the stand ---
      if (st === 'heard' && tone) {
        if (atStand && Math.hypot(px - STAND[0], pz - STAND[1]) > C.CHOIR_STAND_R) {
          // stepped away from it: the hymn waits, and begins the verse again
          atStand = false;
          tone.phase = 'gap';
          tone.t = 1.5;
          tone.got = 0;
        }
        if (atStand && !isDialogueOpen() && later.length === 0) stepTone(d);
      }
      if (pads) {
        pads.root.classList.toggle('on', atStand && !!tone);
        if (pads.lit >= 0 && (pads.t -= d) <= 0) lightPad(-1, false, false);
      }
      // --- what was chosen, once the First Voice has finished saying so ---
      if (st === 'decided' && !isDialogueOpen() && later.length === 0 && chapterHud.state().line == null) {
        beginAnswer();
        return;
      }
      crew.tick(dt, t, walkerLive);
      panel();
      if (lampOn) lampHud.update();
    },
    starDir: STAR_DIR,
    places: { pad: [COURT[0] - 8, COURT[1] - 15], eldest: [ELDEST[0] + 2.2, ELDEST[1] + 2.4], actuary: [ACTUARY[0] - 1.6, ACTUARY[1] + 2.6], rose: LISTEN, stand: [STAND[0], STAND[1] + 0.6] },
    info: () => ({
      inside, scene: scene ? { kind: scene.kind, u: +scene.clock.u().toFixed(2) } : null, lamp: lampOn ? lampState() : null, signal: +signal.toFixed(3), hear: +hearT.toFixed(2),
      atStand, tone: tone ? { round: tone.round, phase: tone.phase, got: tone.got, want: CHOIR_PHRASES[tone.round] } : null,
      table: table.visible, actuary: actuary.group.visible, bells: bells.map((b) => +b.swing.toFixed(2)), panel: panelText, pads: !!pads && pads.root.classList.contains('on'),
      starDir: STAR_DIR.toArray().map((v) => +v.toFixed(3)),
    }),
    dbg: {
      seek: (u) => (scene ? (scene.clock.seek(u), true) : false),
      skip: () => (scene ? scene.clock.skip() : false),
      band(id) {
        const want = BAND[String(id).toUpperCase()];
        for (let i = 0; i < 6 && lamp.band !== want; i++) nextBand(1);
        return lamp.band === want;
      },
      // look at the star from wherever the walker is
      aim() {
        cWalk.yaw = Math.atan2(STAR_DIR.x, STAR_DIR.z);
        cWalk.pitch = Math.asin(STAR_DIR.y);
        return [cWalk.yaw, cWalk.pitch];
      },
      stand: takeStand,
      press,
      decide,
    },
  };
  return site;
}
