// The shuttle, the tether, and the dream (GDD 5.7.4).
//
// The light ship can go no deeper than the edge. Under its bridge is one cell
// of itself made to go further: a cube of glass and colour with room for one,
// let down toward the hole on a tether of light. From inside it the ship is
// overhead and getting smaller, its own wire running on to the megaworld; the
// hole is no longer to one side but underneath, and its ring of fire has come
// up to stand all the way round the horizon. A third clock joins the other
// two, and it is the slowest of the three.
//
// At the bottom the cabin goes, and the pilot dreams. The archive's flood was
// memory, in order and exact. This is the pilot's own: the same worlds put
// together wrong. One world's sky over another's ground, with a third's
// lights; planets the wrong size, one of them filling half the sky and others
// going round the pilot's head; coins falling upward; the old freighter going
// by no bigger than a toy; the captains, enormous, turning over in the air,
// and their words with the order gone out of them. The tether runs up through
// all of it and does not change.
//
// What it is made of is what this pilot has seen: the worlds a fragment was
// taken from, and any the game's logs say were visited (every world, if that
// is too few to dream with).
//
// Awake again at the bottom, the ship above tries to render the planet the
// pilot's fragments make. It draws most of it and stops: the archive already
// has that one. Then there is nothing at all, and a blank canvas
// (src/drawPad.js). What is drawn there is let go into the dark as the first
// creature of a world that has never been (world/firstcreature.js), and that
// world begins round it: unfinished, in colours no fragment had, still growing.
//
// One clock `u` from the hatch, everything placed from it. Nothing here is
// walked: the place holds the pilot and takes the camera, and the mouse (or a
// thumb) still looks round. A site for src/capitalWalk.js. Frame: +y up.

import * as THREE from 'three';
import { C, CH_TIER } from '../src/constants.js';
import { Q } from '../src/quality.js';
import { sun } from '../src/sun.js';
import { MOTION_SCALE } from '../src/motion.js';
import { cWalk } from '../src/capitalWalk.js';
import { chime, uiSound, setEventRumble } from '../src/sfx.js';
import { chapterHud } from '../src/chapterHud.js';
import { floorOf } from './capital.js';
import { poseRig } from './aliens.js';
import { buildCaptain } from './captainDress.js';
import { createShip as createFreighter } from './ship.js';
import { createLayerPlanet, LAYERS } from './layerplanet.js';
import { createPlace } from './holoplace.js';
import { HULL_VERT, HULL_FRAG } from './lightship.js';
import { SKY_VERT, SKY_FRAG, WIRE_VERT, WIRE_FRAG, MEGA } from './divebridge.js';
import { createCreature, worldFrom, saveFirstEntry, loadFirstEntry } from './firstcreature.js';
import { openDrawPad, closeDrawPad, isDrawPadOpen } from '../src/drawPad.js';
import { WORLDS, HOME, DIVE, DREAM, STALL } from './chapter-dialogue.js';

const ZERO = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const HALF = 2.6; // half the cube's edge
const BOOM = 2.1; // the camera, behind the pilot's head
const BELOW = new THREE.Vector3(-0.3, -0.94, -0.12).normalize(); // the hole: underneath, a little to port
const SHIP_AT = new THREE.Vector3(0.22, 1, 0.3).normalize(); // the ship overhead, as the tether pays out

const T_DROP = 2, T_DEEP = 22; // let go; at the bottom
const T_DREAM = T_DEEP + 2; // the cabin begins to go
const T_WAKE = T_DREAM + C.CH_DREAM_TIME;
const T_END = T_WAKE + 5;
const AHEAD = new THREE.Vector3(0, 3.2, -15); // where a world is put in front of the glass
const SECONDS_GONE = C.CH_YEARS_GONE * 365 * 86400; // what the megaworld's clock reads by the time the pilot wakes
const LAYER_TIME = 2.4; // seconds the ship takes to draw one layer
const COINS = { low: 220, medium: 500, high: 800, ultra: 1000 };

const COIN_VERT = /* glsl */ `
  attribute vec3 aSeed;
  uniform float uTime, uPx, uAmount;
  varying float vSpin;
  varying float vFade;
  void main() {
    // a column of them round the pilot, falling the wrong way, wrapped top to bottom
    vec3 p = (aSeed - 0.5) * vec3(70.0, 80.0, 70.0);
    p.y = mod(p.y + uTime * (5.0 + 9.0 * aSeed.x) + 40.0, 80.0) - 40.0;
    p.xz += 1.5 * vec2(sin(uTime * 0.7 + aSeed.z * 20.0), cos(uTime * 0.6 + aSeed.x * 20.0));
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    vSpin = abs(sin(uTime * (2.0 + 4.0 * aSeed.y) + aSeed.z * 30.0));
    vFade = uAmount * smoothstep(40.0, 30.0, abs(p.y));
    gl_PointSize = clamp(uPx * (0.22 + 0.3 * aSeed.y) / max(-mv.z, 0.2), 1.5, 60.0) * step(0.004, vFade);
  }
`;
const COIN_FRAG = /* glsl */ `
  varying float vSpin;
  varying float vFade;
  void main() {
    vec2 q = gl_PointCoord * 2.0 - 1.0;
    q.x /= max(vSpin, 0.12); // a coin, turning
    float r = length(q);
    if (r > 1.0) discard;
    float rim = smoothstep(0.62, 0.8, r);
    vec3 c = mix(vec3(1.0, 0.82, 0.25), vec3(1.0, 0.96, 0.7), rim) * (0.7 + 0.9 * vSpin);
    gl_FragColor = vec4(c * vFade, 1.0);
  }
`;

// ctx: { scene, camera, hideFleet(), chapter — src/chapter.js }
export function createShuttle(ctx) {
  const { chapter, camera } = ctx;
  const group = new THREE.Group();
  group.visible = false;
  ctx.scene.add(group);

  // --- outside: the same sky as the bridge's, with the hole underneath ---
  const skyU = {
    uTime: { value: 0 }, uSpace: { value: 1 }, uHole: { value: BELOW }, uHoleR: { value: 1.0 },
    uMega: { value: MEGA }, uMegaR: { value: 0.13 }, uFlick: { value: 110 }, uDrift: { value: 1 }, uFall: { value: 11 }, uFire: { value: 0.4 }, uAged: { value: 0 },
  };
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(3400, 64, 40),
    new THREE.ShaderMaterial({ vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, uniforms: skyU, side: THREE.BackSide, depthWrite: false, fog: false })
  );
  sky.renderOrder = -999;
  sky.frustumCulled = false;
  group.add(sky);

  // the ship, overhead
  const hullU = { uTime: { value: 0 }, uDim: { value: 1.3 } };
  const ship = new THREE.Mesh(
    new THREE.BoxGeometry(150, 100, 300),
    new THREE.ShaderMaterial({ vertexShader: HULL_VERT, fragmentShader: HULL_FRAG, uniforms: hullU, fog: false })
  );
  group.add(ship);

  // the tether up to it, and the ship's own wire on to the megaworld
  const wireGeo = new THREE.CylinderGeometry(1, 1, 1, 10, 64, true).translate(0, 0.5, 0);
  const phase = { value: 0 };
  const mkWire = (gain, wide) => {
    const m = new THREE.Mesh(wireGeo, new THREE.ShaderMaterial({
      vertexShader: WIRE_VERT, fragmentShader: WIRE_FRAG,
      uniforms: { uTime: skyU.uTime, uDrift: skyU.uDrift, uPhase: phase, uGain: { value: gain }, uWide: { value: wide } },
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    }));
    m.frustumCulled = false;
    group.add(m);
    return m;
  };
  const tether = mkWire(2.2, 0.5), tetherGlow = mkWire(0.3, 2.4);
  const wire = mkWire(1.6, 1);
  wire.quaternion.setFromUnitVectors(UP, MEGA);
  wire.scale.set(1, 2600, 1);
  tether.quaternion.setFromUnitVectors(UP, SHIP_AT);
  tetherGlow.quaternion.copy(tether.quaternion);
  tether.position.set(0, HALF, 0);
  tetherGlow.position.copy(tether.position);
  // ...and a hard line down the middle of it, in the cabin's own turning
  // colour, drawn over everything: the one thing the dream does not change
  const coreMat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false, transparent: true, depthTest: false, depthWrite: false });
  const core = new THREE.Mesh(new THREE.CylinderGeometry(1, 0.03, 1, 8, 1, true).translate(0, 0.5, 0), coreMat);
  core.position.copy(tether.position);
  core.quaternion.copy(tether.quaternion);
  core.renderOrder = 20;
  core.frustumCulled = false;
  group.add(core);

  // --- the shuttle: one cell, its edges turning through the spectrum ---
  const cabin = new THREE.Group();
  group.add(cabin);
  const edgeMat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false, transparent: true });
  const glassMat = new THREE.MeshBasicMaterial({ color: 0xbfe6ff, transparent: true, opacity: 0.06, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const cube = new THREE.Mesh(new THREE.BoxGeometry(HALF * 2, HALF * 2, HALF * 2), glassMat);
  cube.position.y = HALF;
  cube.renderOrder = 3;
  cabin.add(cube);
  for (let a = 0; a < 3; a++) {
    for (const s of [-1, 1]) {
      for (const k of [-1, 1]) {
        const size = [0.07, 0.07, 0.07];
        size[a] = HALF * 2;
        const e = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), edgeMat);
        const pos = [0, 0, 0];
        pos[(a + 1) % 3] = s * HALF;
        pos[(a + 2) % 3] = k * HALF;
        e.position.set(pos[0], pos[1] + HALF, pos[2]);
        cabin.add(e);
      }
    }
  }
  const floorMat = new THREE.MeshBasicMaterial({ color: 0x0b0f16, fog: false, transparent: true });
  const floor = new THREE.Mesh(new THREE.CircleGeometry(1.5, 6).rotateX(-Math.PI / 2), floorMat);
  floor.position.y = 0.02;
  cabin.add(floor);

  // --- the dream ---
  const dream = new THREE.Group(); // everything in it turns over together
  group.add(dream);
  const place = createPlace(60);
  place.mesh.material.transparent = true;
  place.mesh.material.depthWrite = false;
  place.mesh.renderOrder = -5;
  dream.add(place.mesh);
  // planets the wrong size: [radius at rest, how far off, how fast round, height]
  const BODIES = [[26, 62, 0.05, -8], [0.22, 1.9, 1.7, 1.9], [0.3, 2.6, -1.2, 2.5], [5, 24, 0.22, 9], [2.2, 13, -0.4, -5], [9, 40, 0.11, 16]];
  const bodies = BODIES.slice(0, (CH_TIER[Q.tier] || CH_TIER.medium).dream).map(([r, far, rate, h], i) => {
    const p = createLayerPlanet(r, { life: i === 0 ? 400 : 120, seg: i === 0 ? 64 : 32, seed: 3.1 + i * 4.7 });
    p.group.visible = false;
    dream.add(p.group);
    return { p, r, far, rate, h, a: i * 1.9 };
  });
  // coins, falling up
  const nCoins = COINS[Q.tier] || COINS.medium;
  const coinSeed = new Float32Array(nCoins * 3);
  let rs = 0x51f15e;
  const rnd = () => ((rs = (Math.imul(rs, 1664525) + 1013904223) >>> 0), rs / 4294967296);
  for (let i = 0; i < coinSeed.length; i++) coinSeed[i] = rnd();
  const coinGeo = new THREE.BufferGeometry();
  coinGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(nCoins * 3), 3));
  coinGeo.setAttribute('aSeed', new THREE.BufferAttribute(coinSeed, 3));
  const coinU = { uTime: skyU.uTime, uPx: { value: 600 }, uAmount: { value: 0 } };
  const coins = new THREE.Points(coinGeo, new THREE.ShaderMaterial({
    vertexShader: COIN_VERT, fragmentShader: COIN_FRAG, uniforms: coinU,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  }));
  coins.frustumCulled = false;
  dream.add(coins);
  // the old freighter, as a toy
  const toy = createFreighter(dream, {});
  dream.add(toy.group);
  toy.group.scale.setScalar(0.06);
  // the captains, the wrong size, adrift
  const giants = ['vask', 'marrow', 'lux'].map((id, i) => {
    const rig = buildCaptain(id);
    rig.group.scale.setScalar(5 + i * 2.5);
    dream.add(rig.group);
    return { rig, a: i * 2.1 + 0.6, far: 22 + i * 9, h: -6 + i * 7 };
  });

  // which worlds this pilot has to dream with
  const mix = { sky: null, ground: null, structures: null, life: null, light: null };
  const made = { sky: null, ground: null, structures: null, life: null, light: null };
  let known = WORLDS;
  function remember() {
    let logs = '';
    try {
      logs = `${localStorage.getItem('fgsf.navlog') || ''}${localStorage.getItem('fgsf.journal') || ''}`.toLowerCase();
    } catch {
      // no storage: every world
    }
    const got = WORLDS.filter((w) => chapter.picked(w.id) || logs.includes(w.id));
    known = got.length >= 3 ? got : WORLDS;
    chapter.compose(made);
    have = LAYERS.filter((l) => made[l]);
    mine.setAll(made);
    mine.revealAll(0);
  }
  // one wrong world: each layer from a different one of them (the pilot's own
  // fragments, where they took one, are in it more often than not)
  let cut = -1;
  function shuffle(n) {
    let s = (n + 1) * 0x9e3779b1;
    const next = () => ((s = Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) ^ (s >>> 12)), (s >>> 0) / 4294967296);
    for (const l of LAYERS) {
      const own = made[l] && next() < 0.55;
      mix[l] = own ? made[l] : next() < 0.12 ? HOME.layers[l] : known[Math.floor(next() * known.length) % known.length].layers[l];
    }
    return next;
  }

  let u = 0;
  let running = false;
  let shuttleT = 0, shipT = 0, worldT = 0;
  let said = -1;
  let hudAt = 0;
  let world0 = 0; // the megaworld's clock at the hatch
  let phaseRate = 5.5; // how fast the pulses run on the tether and the wire
  // after waking: the stall, the canvas, the birth
  let v = 0, w = 0; // seconds into the stall; into the birth
  let stallSaid = false, birthSaid = -1, pctAt = 0, pctShown = -1;
  let have = []; // the layers the pilot's fragments fill
  let creature = null; // world/firstcreature.js, once something has been drawn
  const from = new THREE.Vector3(0, 1.75, -5); // where the drawing was let go
  const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler(), _to = new THREE.Vector3();
  let inside = false;
  let prev = null;

  const ease = (a, b, x) => {
    const k = Math.min(Math.max((x - a) / (b - a), 0), 1);
    return k * k * (3 - 2 * k);
  };
  const dreamAt = (x) => ease(T_DREAM, T_DREAM + 6, x) * (1 - ease(T_WAKE - 1, T_END, x));

  // --- what the ship tries to render, and what it could not have ---
  const mine = createLayerPlanet(4, { life: 300, seg: 64, seed: 5.9 });
  mine.group.position.copy(AHEAD);
  mine.group.rotation.z = 0.25;
  mine.group.visible = false;
  group.add(mine.group);
  const born = createLayerPlanet(5, { life: 4, seg: 64, seed: 11.3 });
  born.group.position.copy(AHEAD);
  born.group.rotation.z = -0.2;
  born.group.visible = false;
  group.add(born.group);

  function hatchCreature(strokes) {
    if (creature) {
      group.remove(creature.points);
      creature.dispose();
    }
    creature = createCreature(strokes, 3);
    creature.points.renderOrder = 8;
    group.add(creature.points);
    born.setAll(worldFrom(strokes).layers);
  }
  function onDrawn(strokes) {
    hatchCreature(saveFirstEntry(strokes));
    // it leaves from where it was drawn: in front of the pilot's eyes
    const cp = Math.cos(cWalk.pitch);
    from.set(Math.sin(cWalk.yaw) * cp * 5, 1.75 + Math.sin(cWalk.pitch) * 5, Math.cos(cWalk.yaw) * cp * 5);
    w = 0;
    birthSaid = -1;
    chapter.advance('birth');
    uiSound('engage');
  }
  // nothing to be seen: the canvas is up (or should be)
  const blank = () => !running && (chapter.stage() === 'canvas' || (chapter.reached('birth') && !creature));

  // Awake at the bottom. Called every frame once the dream is over.
  function after(dt, t, px) {
    const st = chapter.stage();
    mine.group.visible = st === 'stall';
    born.group.visible = !!creature && chapter.reached('birth');
    if (creature) creature.points.visible = born.group.visible;
    if (st === 'stall') {
      // the ship draws the pilot's planet a layer at a time, and stops short
      v += dt;
      const n = Math.max(have.length, 1);
      const stopAt = n * LAYER_TIME - 0.45;
      const prog = Math.min(Math.max(v - 2, 0), stopAt);
      const stuck = v - 2 >= stopAt;
      const flick = stuck ? 0.82 + 0.18 * Math.sign(Math.sin(t * 23) + 0.3) : 1;
      for (let i = 0; i < have.length; i++) mine.reveal(have[i], Math.min(Math.max((prog - i * LAYER_TIME) / LAYER_TIME, 0), 1) * flick);
      mine.holo(stuck ? 1 : 0.15);
      mine.group.rotation.y = stuck ? mine.group.rotation.y : t * 0.1;
      mine.tick(stuck ? Math.floor(t * 4) / 4 : t, px); // stuck, it only stutters
      pctAt -= dt;
      if (pctAt <= 0 && !stallSaid && v > 2) {
        pctAt = 0.1;
        const pct = Math.floor((prog / (n * LAYER_TIME)) * 100);
        if (pct !== pctShown) chapterHud.say(`${(pctShown = pct)}%`, 1.2);
      }
      if (stuck && !stallSaid && v - 2 > stopAt + 2.2) {
        stallSaid = true;
        chapterHud.say(STALL.line, 5);
        uiSound('toggle');
      }
      if (v - 2 > stopAt + 8.5) {
        // ...and then there is nothing
        chapter.advance('canvas');
        chapterHud.say(null);
        chapterHud.clocks(null);
        cWalk.yaw = Math.PI;
        cWalk.pitch = 0.1;
      }
      return;
    }
    if (blank()) {
      if (!isDrawPadOpen()) openDrawPad(STALL.canvas, onDrawn);
      return;
    }
    if (!creature) return;
    // --- the birth ---
    w += dt;
    const g = ease(0, 16, w);
    const grown = 0.1 + 0.5 * g + Math.min(Math.max(w - 16, 0) * 0.003, 0.22); // never finished
    born.reveal('ground', grown);
    born.reveal('sky', grown * 0.75);
    born.reveal('light', ease(7, 13, w));
    born.group.rotation.y = t * 0.06;
    born.tick(t, px);
    // the creature: off the canvas, then away round its world
    const cu = creature.uniforms;
    cu.uAmount.value = ease(0, 2.6, w);
    cu.uWave.value = ease(0.8, 5, w);
    cu.uBright.value = 2.4 + 0.5 * Math.sin(t * 1.3);
    const k = ease(3, 11, w);
    const a = t * 0.33;
    _to.set(AHEAD.x + Math.cos(a) * 9, AHEAD.y + Math.sin(a * 0.7) * 2.4, AHEAD.z + Math.sin(a) * 6 + 1.5);
    creature.points.position.lerpVectors(from, _to, k);
    _q1.setFromEuler(_e.set(-Math.atan2(from.y - 1.75, Math.hypot(from.x, from.z)), Math.atan2(-from.x, -from.z), 0, 'YXZ')); // facing the pilot
    _q2.setFromEuler(_e.set(0.25 * Math.sin(a * 0.7), -a, 0.2 * Math.cos(a), 'YXZ')); // along its way
    creature.points.quaternion.slerpQuaternions(_q1, _q2, k);
    cu.uSize.value = 3 + 2.2 * k;
    creature.update(t, px);
    // everything else goes quiet round it: the wire slows, the megaworld's
    // lights can be told apart again
    const calm = ease(4, 18, w);
    skyU.uFire.value = 0.4 + 0.2 * ease(0, 8, w);
    skyU.uDrift.value = 1 - 0.8 * calm;
    skyU.uFlick.value = 110 * Math.exp(-3.6 * calm);
    phaseRate = 5.5 - 5.1 * calm;
    chapterHud.white(Math.max(0, 1 - w / 2.6));
    setEventRumble(0.3 * ease(0, 2, w) * (1 - ease(5, 13, w)) * (0.4 + 0.6 * MOTION_SCALE));
    for (let i = 0; i < STALL.birth.length; i++) {
      if (i > birthSaid && w >= STALL.birth[i][0] && w < 900) {
        birthSaid = i;
        chapterHud.say(STALL.birth[i][1], 6);
      }
    }
    if (w >= 22 && chapter.advance('return')) uiSound('select');
  }

  const _look = new THREE.Vector3();
  const consoles = [{
    x: 0, y: 0, z: 0, r: 3, prompt: 'E — BACK UP THE TETHER',
    off: () => !chapter.reached('return'),
    use: () => ((site.portal = 'hatch'), null),
  }];
  const surfaces = [{ kind: 'disc', cx: 0, cz: 0, r: 1.2, y: 0 }];

  const site = {
    group,
    planet: { group: { position: ZERO }, sunDir: UP },
    noShip: true,
    speed: 1,
    exit: { x: 0, z: 0 },
    leaveHint: 'THE TETHER GOES BACK UP TO THE SHIP',
    surfaces,
    colliders: [],
    floorYAt: floorOf(surfaces, 1.2),
    snap: 1.2,
    pad: new THREE.Vector3(0, 0, 0),
    spawn: new THREE.Vector3(0, 0, 0),
    spawnYaw: Math.PI,
    npcs: [],
    consoles,
    onChoice: () => null,
    portal: null,
    held: () => !chapter.reached('return'), // one seat, and nothing to do in it but look
    // from just behind the pilot's head, wherever they are looking
    camera(pos, target) {
      const cp = Math.cos(cWalk.pitch);
      _look.set(Math.sin(cWalk.yaw) * cp, Math.sin(cWalk.pitch), Math.cos(cWalk.yaw) * cp);
      // (over the right shoulder, so the middle of the view is the view)
      const rx = -Math.cos(cWalk.yaw) * 0.95, rz = Math.sin(cWalk.yaw) * 0.95;
      target.set(rx, 2.15, rz).addScaledVector(_look, 6);
      pos.set(rx, 2.15, rz).addScaledVector(_look, -BOOM);
      pos.y = Math.max(pos.y, 0.5);
      return true;
    },
    setWalker() {},
    onEnter() {
      if (inside) return;
      inside = true;
      site.portal = null;
      group.visible = true;
      const scene = ctx.scene;
      prev = {
        fog: scene.fog,
        lightPos: sun.light.position.clone(), lightColor: sun.light.color.clone(), lightI: sun.light.intensity,
        ambColor: sun.ambient.color.clone(), ambI: sun.ambient.intensity,
      };
      scene.fog = null;
      sun.light.position.copy(BELOW).multiplyScalar(-1).setY(-0.4).normalize(); // lit from the ring, below
      sun.light.color.setRGB(1.0, 0.6, 0.3);
      sun.light.intensity = 1.9;
      sun.ambient.color.setRGB(0.4, 0.45, 0.8);
      sun.ambient.intensity = 0.8;
      ctx.hideFleet();
      remember();
      const k = chapter.clocks();
      shipT = k.ship || 75;
      worldT = k.world || 2.5e8;
      world0 = Math.min(worldT, SECONDS_GONE);
      // a shuttle that has already been down is found at the bottom, awake
      const done = chapter.reached('stall');
      running = !done;
      u = done ? T_END : 0;
      shuttleT = 0;
      said = -1;
      cut = -1;
      v = 0;
      stallSaid = false;
      birthSaid = -1;
      phaseRate = 5.5;
      skyU.uFire.value = 0.4;
      skyU.uDrift.value = 1;
      skyU.uFlick.value = 110;
      // what was drawn before is still alive down here
      const entry = chapter.reached('birth') ? loadFirstEntry() : null;
      if (entry) hatchCreature(entry);
      w = chapter.reached('return') ? 999 : 0;
      from.set(0, 1.75, -5);
      chapter.advance('shuttle');
      if (running) uiSound('engage');
    },
    onLeave() {
      if (!inside) return;
      inside = false;
      group.visible = false;
      closeDrawPad();
      setEventRumble(0);
      chapterHud.clear();
      chapterHud.clocks(null);
      if (camera.fov !== C.FOV) {
        camera.fov = C.FOV;
        camera.updateProjectionMatrix();
      }
      ctx.scene.fog = prev.fog;
      sun.light.position.copy(prev.lightPos);
      sun.light.color.copy(prev.lightColor);
      sun.light.intensity = prev.lightI;
      sun.ambient.color.copy(prev.ambColor);
      sun.ambient.intensity = prev.ambI;
      prev = null;
    },
    tick(dt, t) {
      chapterHud.tick(dt);
      skyU.uTime.value = t;
      hullU.uTime.value = t;
      const px = (window.innerHeight * Q.pixelRatio * 0.5) / Math.tan((C.FOV * Math.PI) / 360);
      if (running) {
        u += dt;
        if (u >= T_END) {
          running = false;
          worldT = Math.max(worldT, SECONDS_GONE);
          chapter.setClocks(shipT, worldT);
          chapter.advance('stall');
        }
      }
      const down = ease(T_DROP, T_DEEP, u);
      // up there the centuries are going by: the megaworld is not what it was
      skyU.uAged.value = Math.pow(Math.min(u / T_END, 1), 2);
      const d = dreamAt(u);

      // --- the way down ---
      // the hole comes up round the horizon; the megaworld goes small
      skyU.uHoleR.value = 1.02 + 0.5 * down;
      skyU.uMegaR.value = 0.13 - 0.07 * down;
      const out = 26 + 1500 * down * down; // tether paid out
      ship.position.copy(SHIP_AT).multiplyScalar(out + 52);
      ship.position.y += HALF;
      tether.scale.set(1, out, 1);
      tetherGlow.scale.set(1, out, 1);
      // (a line all the way up, however much of it there is)
      tether.material.uniforms.uWide.value = 0.02 + out * 0.0011;
      tetherGlow.material.uniforms.uWide.value = 0.05 + out * 0.0024;
      core.scale.set(0.02 + out * 0.0028, out, 0.02 + out * 0.0028);
      coreMat.color.setHSL((t * 0.07) % 1, 1, 0.6).multiplyScalar(1.5);
      coreMat.opacity = 0.35 + 0.65 * d;
      wire.position.copy(ship.position);
      wire.position.x += 80;
      phase.value += dt * phaseRate;
      // the cube swings a little on its line
      cabin.rotation.z = 0.035 * Math.sin(t * 0.7) * (1 - down * 0.6) * MOTION_SCALE;
      cabin.rotation.x = 0.03 * Math.sin(t * 0.53 + 1) * (1 - down * 0.6) * MOTION_SCALE;
      edgeMat.color.setHSL((t * 0.07) % 1, 0.9, 0.62).multiplyScalar(1.05);
      edgeMat.opacity = 1 - d;
      glassMat.opacity = 0.06 * (1 - d);
      floorMat.opacity = 1 - d;
      // (with the canvas up there is nothing: not the hole, not the ship, not the cabin)
      const dark = blank();
      cabin.visible = d < 0.995 && !dark;
      sky.visible = ship.visible = wire.visible = tether.visible = tetherGlow.visible = core.visible = !dark;

      // --- the clocks: three now, and this one the slowest ---
      shuttleT += dt * (1 - (1 - C.CH_SHUTTLE_SLOW) * down);
      if (running) {
        shipT += dt;
        // the megaworld's runs away faster the further down: by waking it has been CH_YEARS_GONE years
        worldT = world0 + (SECONDS_GONE - world0) * Math.pow(Math.min(u / T_END, 1), 1.7);
      }
      hudAt -= dt;
      if (hudAt <= 0) {
        hudAt = 0.1;
        if (d > 0.6 || dark) chapterHud.clocks(null); // there are no clocks in it
        else chapterHud.clocks(shipT, worldT, DIVE.clocks.ship, DIVE.clocks.world, shuttleT, DIVE.clocks.shuttle);
      }
      setEventRumble(running ? Math.min(1, 0.5 * ease(0, 3, u) * (1 - down) + 0.35 * d) * (0.4 + 0.6 * MOTION_SCALE) : 0);
      chapterHud.white(running ? Math.max(0, 1 - u / 1.2) * 0.8 : 0);

      if (!running) after(dt, t, px);

      // --- the dream ---
      dream.visible = d > 0.003;
      if (!dream.visible) {
        if (camera.fov !== C.FOV) {
          camera.fov = C.FOV;
          camera.updateProjectionMatrix();
        }
        return;
      }
      const du = u - T_DREAM;
      // it changes without warning, and sooner as it goes on
      const n = Math.floor(du / 4.2 + (du * du) / 520);
      if (n !== cut) {
        cut = n;
        const next = shuffle(n);
        place.paint(mix, next() * 40);
        place.mesh.rotation.set((next() - 0.5) * 2.4, next() * 6.28, (next() - 0.5) * 2.4); // which way is down
        place.uniforms.uSpeed.value = 0.05 + next() * next() * 2.5;
        for (const b of bodies) {
          for (const l of LAYERS) {
            const src = next() < 0.5 && made[l] ? made[l] : known[Math.floor(next() * known.length) % known.length].layers[l];
            b.p.set(l, next() < 0.85 ? src : null);
          }
          b.grow = 0.4 + next() * 1.6;
          b.tilt = (next() - 0.5) * 2;
        }
        if (du > 1 && mix.life) chime(mix.life.tone * (next() < 0.5 ? 0.5 : 1));
      }
      place.uniforms.uTime.value = t;
      place.uniforms.uAlpha.value = d * 0.94;
      place.uniforms.uFade.value = 0.9 + 0.25 * Math.sin(t * 0.9);
      place.mesh.visible = true;
      // all of it turning over, slowly, about the way the pilot is not looking
      dream.rotation.set(0.22 * Math.sin(t * 0.13) * MOTION_SCALE, 0, 0.3 * Math.sin(t * 0.09 + 1) * MOTION_SCALE);
      for (const b of bodies) {
        const a = b.a + t * b.rate;
        const g = b.p.group;
        g.visible = true;
        g.position.set(Math.cos(a) * b.far, b.h + b.far * 0.12 * Math.sin(a * 0.7 + b.a), Math.sin(a) * b.far);
        g.scale.setScalar(d * (b.grow || 1));
        g.rotation.set(b.tilt || 0, t * 0.2 + b.a, 0);
        b.p.revealAll(Math.min(1, d * 1.5));
        b.p.holo(0.15);
        b.p.tick(t, px);
      }
      coinU.uPx.value = px;
      coinU.uAmount.value = d;
      toy.group.position.set(Math.cos(t * 0.5) * 3.4, 1.9 + 0.6 * Math.sin(t * 0.8), Math.sin(t * 0.5) * 3.4);
      toy.group.rotation.set(t * 0.4, -t * 0.5 + Math.PI / 2, 0.4 * Math.sin(t));
      toy.group.scale.setScalar(0.06 * d);
      toy.update(dt, t, 1);
      for (const g of giants) {
        poseRig(g.rig, dt, t, 'idle', 0);
        const a = g.a + t * 0.07;
        g.rig.group.position.set(Math.cos(a) * g.far, g.h + 3 * Math.sin(t * 0.3 + g.a), Math.sin(a) * g.far);
        g.rig.group.rotation.set(t * 0.11 + g.a, t * 0.17, t * 0.08);
        g.rig.group.visible = d > 0.3;
      }
      // the eye is not steady either
      const fov = C.FOV + d * (14 * Math.sin(t * 0.37) + 6 * Math.sin(t * 1.3)) * MOTION_SCALE;
      if (Math.abs(camera.fov - fov) > 0.05) {
        camera.fov = fov;
        camera.updateProjectionMatrix();
      }
      for (let i = 0; i < DREAM.lines.length; i++) {
        if (i > said && du >= DREAM.lines[i][0]) {
          said = i;
          chapterHud.say(DREAM.lines[i][1], 5.5);
        }
      }
    },
    inside: () => inside,
    places: { seat: [0, 0, 0] },
    info: () => ({ v, w, creature: creature ? creature.count : 0, blank: blank(), u, running, down: ease(T_DROP, T_DEEP, u), dream: dreamAt(u), cut, shuttleT, shipT, worldT, known: known.length, end: T_END, dreamAt: T_DREAM }),
    seek(x) {
      if (!running) return false;
      u = x;
      return true;
    },
  };
  return site;
}
