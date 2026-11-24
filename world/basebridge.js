// The light ship's bridge, in open space (GDD 5.7.8).
//
// The deck the saga's last scene was played on (world/launch.js), kept: a
// round floor, a lit rail, the helm forward and an arc of the archive astern.
// The helm is the pilot's own seat: sit in it (E) and the chart is in reach;
// any move stands the pilot up again. Behind it, a chair for each captain,
// and the captains aboard sit in theirs.
// Round it now is whatever system the ship is in: the stars, that system's
// star, and its bodies as points of light where they really are. The captains
// who are aboard and not out on a trip stand at the rail and can be talked to.
//
// The helm is the chart (src/voyage.js): where the ship is, and where it can
// go. A passage is watched from here: one clock and pose(u), the stars drawn
// out into lines and let go again, the new system's star where the old one's
// was not.
//
// A platform-walker site (src/capitalWalk.js), walked under the universe's
// pause like every room of the ship but the bay.

import * as THREE from 'three';
import { C } from '../src/constants.js';
import { sun } from '../src/sun.js';
import { chapterHud } from '../src/chapterHud.js';
import { floorOf, tint, box, cyl, mergedMesh } from './capital.js';
import { poseRig } from './aliens.js';
import { standRig, sitRig } from './rigGround.js';
import { input } from '../src/input.js';
import { buildCaptain, liveCaptain } from './captainDress.js';
import { CAPTAINS } from './chapter-dialogue.js';
import { BASE } from './base-dialogue.js';

const ZERO = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const R = 9;
// where the pilot sits (at the helm) and where each captain sits (CAPTAINS order), all facing -z
const PILOT_SEAT = { x: 0, z: -R + 4.0 };
const CREW_SEATS = [{ x: -3.4, z: -R + 6.2 }, { x: 0, z: -R + 7.0 }, { x: 3.4, z: -R + 6.2 }];
export const MAX_BODIES = 8; // (the sky shader below is shared with the crew deck's windows, world/basedeck.js)
const ease = (a, b, x) => {
  const k = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return k * k * (3 - 2 * k);
};

export const VERT = /* glsl */ `
  varying vec3 vW;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vW = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;
// Stars one to a cell of the sky; the system's star as a disc and a glow; its
// bodies as small steady lights. Under way (uWarp) the stars are drawn out
// along the ship's heading and everything else is let go of.
export const SKY_FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uWarp;
  uniform vec3 uStar;
  uniform vec3 uStarCol;
  uniform float uStarOn;
  uniform vec4 uBody[${MAX_BODIES}]; // xyz: direction, w: brightness (0: none)
  uniform vec3 uBodyCol[${MAX_BODIES}];
  varying vec3 vW;
  float h31(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  void main() {
    vec3 d = normalize(vW - cameraPosition);
    // under way the sky is squeezed toward the heading (-z) and smeared along it
    vec3 s = d;
    s.z *= 1.0 + 9.0 * uWarp;
    s = normalize(s);
    vec3 cell = floor(s * 90.0);
    float star = step(0.985, h31(cell)) * (0.4 + 0.6 * h31(cell + 5.0));
    float dotv = 1.0 - smoothstep(0.0, 0.5 + 0.4 * uWarp, length(fract(s * 90.0) - 0.5));
    vec3 col = mix(vec3(1.0, 0.96, 0.9), vec3(0.7, 0.9, 1.3), uWarp) * star * dotv * (1.0 + 2.5 * uWarp);
    float rest = 1.0 - uWarp;
    float ang = acos(clamp(dot(d, uStar), -1.0, 1.0));
    col += uStarCol * uStarOn * rest * (smoothstep(0.022, 0.018, ang) * 3.0 + 0.5 * exp(-ang * 18.0) + 0.08 * exp(-ang * 3.0));
    for (int i = 0; i < ${MAX_BODIES}; i++) {
      float a = acos(clamp(dot(d, uBody[i].xyz), -1.0, 1.0));
      col += uBodyCol[i] * uBody[i].w * rest * (smoothstep(0.007, 0.004, a) * 1.6 + 0.25 * exp(-a * 90.0));
    }
    // the tunnel of the passage itself: a soft light ahead
    col += vec3(0.5, 0.75, 1.0) * uWarp * 0.9 * exp(-acos(clamp(-d.z, -1.0, 1.0)) * 3.0);
    gl_FragColor = vec4(col, 1.0);
  }
`;
const WALL_FRAG = /* glsl */ `
  uniform float uTime;
  varying vec3 vW;
  float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  void main() {
    // cells of the archive, each its own colour, breathing out of step
    vec2 g = vec2(atan(vW.x, vW.z) * 14.0, vW.y * 1.1);
    vec2 id = floor(g), f = fract(g);
    float edge = smoothstep(0.0, 0.08, f.x) * smoothstep(1.0, 0.92, f.x) * smoothstep(0.0, 0.08, f.y) * smoothstep(1.0, 0.92, f.y);
    float n = h21(id);
    vec3 hue = 0.5 + 0.5 * cos(6.2832 * (n + vec3(0.0, 0.33, 0.67)));
    float breath = 0.55 + 0.45 * sin(uTime * (0.3 + n) + n * 40.0);
    gl_FragColor = vec4(mix(vec3(0.9, 0.95, 1.0), hue, 0.6) * edge * breath * 1.1, 1.0);
  }
`;

// ctx: { scene, chapter, hideFleet(),
//        sky(): { star: Vector3 dir | null, starCol: Color, bodies: [{ dir: Vector3, col: Color, k }] }
//        aboard(id): the captain is on the bridge (alive, and not out on a trip)
//        figures(): [{ id, build() -> THREE.Group, talk(), at?: [x, z] }] others a chapter has left aboard
//        talk(captain) -> dialogue payload, chart() -> dialogue payload,
//        choose(tag) -> payload | null | { travel: id, label },  arrive(id),
//        debrief() -> a chapter's debrief waiting (src/voyage.js) | null, debriefed(key) }
export function createBaseBridge(ctx) {
  const { chapter } = ctx;
  const group = new THREE.Group();
  group.visible = false;
  ctx.scene.add(group);
  const time = { value: 0 };
  const T = C.BASE_TRAVEL_TIME;

  const skyU = {
    uTime: time, uWarp: { value: 0 }, uStar: { value: new THREE.Vector3(0, 0.3, -1).normalize() }, uStarCol: { value: new THREE.Color(1, 0.9, 0.7) }, uStarOn: { value: 0 },
    uBody: { value: Array.from({ length: MAX_BODIES }, () => new THREE.Vector4(0, 1, 0, 0)) },
    uBodyCol: { value: Array.from({ length: MAX_BODIES }, () => new THREE.Color(1, 1, 1)) },
  };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(3600, 48, 32), new THREE.ShaderMaterial({ uniforms: skyU, vertexShader: VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, fog: false, depthWrite: false }));
  sky.frustumCulled = false;
  sky.renderOrder = -5;
  group.add(sky);

  // --- the deck (as world/launch.js left it), and the ways off it ---
  const lit = [
    tint(cyl(R + 0.4, R + 0.4, 0.6, 0, -0.3, 0, 40), 0x10161b),
    tint(box(1.6, 1.1, 0.9, 0, 0.55, -R + 2.2), 0x1c262d), // the helm
  ];
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    lit.push(tint(box(0.1, 1.05, 0.1, Math.cos(a) * R, 0.52, Math.sin(a) * R), 0x24313a));
  }
  const glow = [];
  // the chart's face, on the helm
  glow.push(tint(box(1.3, 0.05, 0.6, 0, 1.13, -R + 2.2), 0x7fe6ff, 1.5));
  // --- the seats: the pilot's at the helm, and one for each captain behind it,
  // all facing forward. A seat: a base, a cushion, a back, arms, a lit edge. ---
  const seat = (x, z, col, big) => {
    const w = big ? 0.9 : 0.75;
    lit.push(tint(cyl(0.12, 0.2, 0.36, x, 0.18, z, 10), 0x24313a));
    lit.push(tint(box(w, 0.12, w * 0.95, x, 0.42, z), 0x2a3a44), tint(box(w * 0.92, 0.07, w * 0.85, x, 0.51, z - 0.02), col));
    lit.push(tint(box(w, 0.75, 0.12, x, 0.84, z + w * 0.48), 0x2a3a44));
    for (const s of [-1, 1]) lit.push(tint(box(0.08, 0.1, w * 0.8, x + s * (w / 2 + 0.02), 0.68, z), 0x24313a));
    glow.push(tint(box(w * 0.9, 0.035, 0.035, x, 1.22, z + w * 0.48 + 0.07), col, 1.6));
  };
  seat(PILOT_SEAT.x, PILOT_SEAT.z, 0xffd890, true);
  for (const [i, s] of CREW_SEATS.entries()) {
    seat(s.x, s.z, [0xb48cff, 0xff6fb4, 0xff8a3c][i] || 0x9fe8ff, false);
    // a small desk of light at each, in front
    lit.push(tint(box(0.08, 0.8, 0.08, s.x, 0.4, s.z - 0.75), 0x24313a));
    glow.push(tint(box(0.7, 0.04, 0.34, s.x, 0.82, s.z - 0.75), 0x8affc8, 1.2));
  }
  // aft: the way to the archive, under the wall; to port of it, the lift to the bay
  const AFT = { x: 0, z: R - 1.6 }, LIFT = { x: -4.6, z: R - 3.4 }, DECK_DOOR = { x: 4.6, z: R - 3.4 }; // (starboard of the archive: the crew deck, world/basedeck.js)
  glow.push(tint(new THREE.TorusGeometry(1.5, 0.07, 6, 36).rotateX(Math.PI / 2).translate(AFT.x, 0.05, AFT.z), 0xffe2a0, 1.6));
  glow.push(tint(new THREE.TorusGeometry(1.5, 0.07, 6, 36).rotateX(Math.PI / 2).translate(LIFT.x, 0.05, LIFT.z), 0x7fe6ff, 1.6));
  glow.push(tint(new THREE.TorusGeometry(1.5, 0.07, 6, 36).rotateX(Math.PI / 2).translate(DECK_DOOR.x, 0.05, DECK_DOOR.z), 0xffc27a, 1.6));
  group.add(mergedMesh(lit, new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x05080a })));
  group.add(mergedMesh(glow, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false })));
  const railMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 1.4, 1.6), fog: false });
  const rail = new THREE.Mesh(new THREE.TorusGeometry(R, 0.05, 6, 64).rotateX(Math.PI / 2), railMat);
  rail.position.y = 1.08;
  group.add(rail);
  const wall = new THREE.Mesh(
    new THREE.CylinderGeometry(R + 2.5, R + 2.5, 9, 48, 1, true, -0.62, 1.24).translate(0, 4.2, 0),
    new THREE.ShaderMaterial({ uniforms: { uTime: time }, vertexShader: VERT, fragmentShader: WALL_FRAG, side: THREE.DoubleSide, fog: false }),
  );
  wall.frustumCulled = false;
  group.add(wall);

  // --- the captains aboard ---
  const npcs = [];
  const crew = CAPTAINS.map((c, i) => {
    const rig = buildCaptain(c.id);
    const x = CREW_SEATS[i].x, z = CREW_SEATS[i].z; // in their own seats, behind the pilot's
    rig.group.position.set(x, 0, z);
    rig.group.rotation.y = Math.PI;
    standRig(rig, 0);
    rig.group.visible = false;
    group.add(rig.group);
    const npc = { x: 1e6, y: 0, z: 1e6, role: 'captain', talk: () => ctx.talk(c), h: 1.6 };
    npcs.push(npc);
    return { c, rig, npc, x, z, on: false };
  });
  const extras = [];
  function muster() {
    // anyone a chapter has left aboard (built once, where it says or along the aft rail)
    for (const f of ctx.figures ? ctx.figures() : []) {
      if (extras.some((e) => e.id === f.id)) continue;
      try {
        const g = f.build();
        const i = extras.length;
        const at = f.at || [4.6 - 1.9 * i, R - 3.2];
        g.position.set(at[0], 0, at[1]);
        group.add(g);
        npcs.push({ x: at[0], y: 0, z: at[1], role: 'figure', talk: () => f.talk() });
        extras.push({ id: f.id, g });
      } catch (err) {
        console.warn('[homebase] a figure could not be stood on the bridge', err);
        extras.push({ id: f.id, g: null });
      }
    }
    for (const m of crew) {
      m.on = ctx.aboard(m.c.id);
      m.rig.group.visible = m.on;
      m.npc.x = m.on ? m.x : 1e6;
      m.npc.z = m.on ? m.z : 1e6;
    }
  }

  // --- a chapter's debrief: the captains talk it over, then its card ---
  // One clock `du` (-1 when none), lines every DLINE seconds, then the card.
  let du = -1, deb = null, debSaid = -1;
  const DLINE = 6.2, DCARD = 7;
  const debEnd = () => (deb ? deb.lines.length * DLINE + 0.8 + DCARD : 0);
  function debSay(i) {
    const [id, text] = deb.lines[i];
    const here = crew.filter((m) => m.on);
    const by = here.find((m) => m.c.id === id) || here[i % Math.max(1, here.length)];
    chapterHud.say(by ? `${by.c.short} — ${text}` : text.toUpperCase(), DLINE - 0.3);
  }
  function debStart(d) {
    deb = d;
    du = 0;
    debSaid = -1;
    chapterHud.cine(true);
  }
  function debFinish() {
    if (!deb) return;
    if (ctx.debriefed) ctx.debriefed(deb.key);
    chapterHud.card(null);
    chapterHud.say(null);
    chapterHud.cine(false);
    deb = null;
    du = -1;
  }

  // --- the pilot's seat: sat in, the chart is in reach; any move stands the pilot up ---
  let seated = false, seatT = 0;
  const _poseOut = { x: 0, z: 0, yaw: 0, mode: 'lift' };
  function sit() {
    seated = true;
    seatT = 0;
    return null;
  }
  function standUp() {
    seated = false;
  }

  // --- the passage ---
  let u = -1, going = null, arrived = false; // its clock: -1 when the ship is at rest
  let inside = false, prev = null, walker = null;
  function readSky() {
    const s = ctx.sky();
    skyU.uStarOn.value = s.star ? 1 : 0;
    if (s.star) {
      skyU.uStar.value.copy(s.star);
      skyU.uStarCol.value.copy(s.starCol);
    }
    for (let i = 0; i < MAX_BODIES; i++) {
      const b = s.bodies[i];
      skyU.uBody.value[i].w = b ? b.k : 0;
      if (b) {
        skyU.uBody.value[i].set(b.dir.x, b.dir.y, b.dir.z, b.k);
        skyU.uBodyCol.value[i].copy(b.col);
      }
    }
  }
  // everything a passage shows, from its clock alone
  function pose(x) {
    const k = ease(0, T * 0.3, x) * (1 - ease(T * 0.62, T, x));
    skyU.uWarp.value = k;
    railMat.color.setRGB(0.5, 1.4, 1.6).multiplyScalar(1 + 1.2 * k);
  }
  function finish() {
    u = -1;
    going = null;
    pose(T + 1);
    chapterHud.cine(false);
    muster();
  }

  const surfaces = [{ kind: 'disc', cx: 0, cz: 0, r: R - 0.5, y: 0 }];
  const site = {
    group,
    planet: { group: { position: ZERO }, sunDir: UP },
    noShip: true,
    speed: 1,
    exit: { x: LIFT.x, z: LIFT.z },
    leaveHint: BASE.toBay.replace('E — ', ''),
    surfaces,
    colliders: [
      { x: 0, z: -R + 2.2, r: 1.1, top: Infinity }, // the helm's console
      { x: PILOT_SEAT.x, z: PILOT_SEAT.z, r: 0.5, top: Infinity },
      ...CREW_SEATS.map((s) => ({ x: s.x, z: s.z, r: 0.5, top: Infinity })),
    ],
    floorYAt: floorOf(surfaces, 1.2),
    snap: 1.2,
    pad: new THREE.Vector3(),
    spawn: new THREE.Vector3(LIFT.x + 1.4, 0, LIFT.z - 1.6), // off the lift
    spawnYaw: Math.PI,
    fromAft: new THREE.Vector3(AFT.x, 0, AFT.z - 2.4), // from the archive
    fromAftYaw: Math.PI,
    atHelm: new THREE.Vector3(1.3, 0, -R + 4.4), // where a chapter leaves the pilot: beside the seat
    fromDeck: new THREE.Vector3(DECK_DOOR.x - 1.4, 0, DECK_DOOR.z - 1.6), // back from the crew deck
    fromDeckYaw: Math.PI,
    atHelmYaw: Math.PI,
    npcs,
    consoles: [
      { x: PILOT_SEAT.x, y: 0, z: PILOT_SEAT.z, r: 1.7, prompt: BASE.sit, off: () => u >= 0 || seated, use: () => sit() },
      { x: AFT.x, y: 0, z: AFT.z, r: 1.7, prompt: BASE.bridgeAft, off: () => u >= 0, use: () => ((site.portal = 'base:archive'), null) },
      { x: LIFT.x, y: 0, z: LIFT.z, r: 1.7, prompt: BASE.toBay, off: () => u >= 0, use: () => ((site.portal = 'base:bay'), null) },
      { x: DECK_DOOR.x, y: 0, z: DECK_DOOR.z, r: 1.7, prompt: BASE.toDeck, off: () => u >= 0, use: () => ((site.portal = 'base:deck'), null) },
    ],
    onChoice(tag) {
      const r = ctx.choose(tag);
      if (r && r.travel) {
        going = r;
        arrived = false;
        u = 0;
        chapterHud.cine(true);
        chapterHud.say(BASE.travelSay.replace('{to}', r.label), 5);
        return null;
      }
      return r || null;
    },
    portal: null,
    held: () => u >= 0 || du >= 0 || seated,
    // sat at the helm: the pilot is shown in the seat, facing forward
    pilotPose() {
      if (!seated) return null;
      _poseOut.x = PILOT_SEAT.x;
      _poseOut.z = PILOT_SEAT.z;
      _poseOut.yaw = Math.PI;
      return _poseOut;
    },
    // a passage is watched from behind the helm, over the heads at the rail;
    // a debrief from just behind the helm, at the captains along the rail
    camera(pos, target) {
      if (du >= 0) {
        pos.set(0, 2.6, 3.4);
        target.set(0, 1.4, -R + 2.6);
        return true;
      }
      // sat at the helm, at rest: over the pilot's shoulder, the helm and the sky ahead
      if (u < 0 && seated) {
        pos.set(1.25, 2.55, PILOT_SEAT.z + 2.7);
        target.set(-0.2, 0.9, -R - 3);
        return true;
      }
      if (u < 0) return false;
      pos.set(0, 2.5, 4.6 - 1.2 * ease(0, T, u));
      target.set(0, 1.6 + 0.6 * skyU.uWarp.value, -40);
      return true;
    },
    // E skips a passage to its end (the SKIP of a scene with no talk in it)
    act() {
      if (du >= 0) {
        // the talk to its card; the card to its end
        const toCard = deb.lines.length * DLINE + 0.8;
        if (du < toCard) {
          du = toCard;
          debSaid = deb.lines.length - 1;
          chapterHud.say(null);
        } else debFinish();
        return;
      }
      if (u >= 0) return site.seek(T);
      // sat at the helm: E is the chart
      if (seated) return ctx.chart();
    },
    heldPrompt: () => (u >= 0 || du >= 0 ? 'E — SKIP' : seated ? BASE.seated : ''),
    setWalker(p) {
      walker = p || null;
    },
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
      sun.light.position.set(0.1, 0.7, 0.7).normalize(); // lit by the archive, from behind and above
      sun.light.color.setRGB(0.8, 0.9, 1.0);
      sun.light.intensity = 1.3;
      sun.ambient.color.setRGB(0.4, 0.5, 0.7);
      sun.ambient.intensity = 0.85; // (enough to see the faces of whoever is sat behind the helm)
      ctx.hideFleet();
      u = -1;
      pose(T + 1);
      readSky();
      muster();
      // back from a chapter that has ended: the captains want a word
      const d = ctx.debrief ? ctx.debrief() : null;
      if (d) debStart(d);
    },
    onLeave() {
      if (!inside) return;
      inside = false;
      group.visible = false;
      // (left in the middle of a passage, by the menu or a reset: it is made)
      if (u >= 0) {
        if (!arrived && going) ctx.arrive(going.travel);
        chapterHud.cine(false);
      }
      u = -1;
      going = null;
      seated = false;
      // (left in the middle of a debrief: it has been given)
      if (du >= 0) debFinish();
      chapterHud.clear();
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
      time.value = t;
      const d = Math.min(dt, 0.1);
      if (walker) sky.position.copy(walker);
      // any move stands the pilot up (not during a passage: that is watched from the seat)
      if (seated && u < 0) {
        seatT += d;
        const moving = input.forward || input.reverse || input.left || input.right || Math.hypot(input.moveX || 0, input.moveY || 0) > 0.35;
        if (seatT > 0.4 && moving) standUp();
      }
      if (du >= 0) {
        du += d;
        const toCard = deb.lines.length * DLINE + 0.8;
        while (debSaid + 1 < deb.lines.length && du >= 0.8 + (debSaid + 1) * DLINE) debSay(++debSaid);
        if (du >= toCard && du - d < toCard + 1e-6) {
          // (given from here: so what it unlocks is counted in where to go next)
          if (ctx.debriefed) ctx.debriefed(deb.key);
          chapterHud.card(deb.title, deb.complete, ctx.debriefNext ? ctx.debriefNext(deb) : deb.next);
        }
        if (du >= debEnd()) debFinish();
      }
      if (u >= 0) {
        u += d;
        pose(u);
        // at the middle of it, with nothing to be seen but the lines, one sky is changed for the other
        if (!arrived && u >= T * 0.5) {
          arrived = true;
          ctx.arrive(going.travel);
          readSky();
          chapterHud.say(BASE.arriveSay.replace('{to}', going.label), 6);
        }
        if (u >= T) finish();
      }
      for (const m of crew) {
        if (!m.on) continue;
        // (talking it over, they turn in toward the middle of the deck; otherwise they look out)
        // (seated, facing forward; for a debrief they stand and turn in to talk it over)
        const face = du >= 0 ? Math.atan2(-m.x, -m.z + 3) : Math.PI;
        m.rig.group.rotation.y += (face - m.rig.group.rotation.y) * Math.min(1, d * 3);
        poseRig(m.rig, d, t, 'idle', 0);
        if (du >= 0) {
          m.rig.joints.torso.rotation.x = 0;
          standRig(m.rig, 0);
        } else sitRig(m.rig, 0);
        const near = u < 0 && walker && Math.hypot(walker.x - m.x, walker.z - m.z) < 5;
        liveCaptain(m.rig, d, t, false, near ? Math.atan2(walker.x - m.x, walker.z - m.z) - m.rig.group.rotation.y : 0);
      }
    },
    inside: () => inside,
    muster,
    seated: () => seated,
    places: { seat: [PILOT_SEAT.x, 0, PILOT_SEAT.z + 0.9], crewSeats: CREW_SEATS.map((s) => [s.x, 0, s.z]), helm: [0, 0, -R + 4.4], aft: [AFT.x, 0, AFT.z - 1], lift: [LIFT.x, 0, LIFT.z], deck: [DECK_DOOR.x, 0, DECK_DOOR.z] },
    info: () => ({
      u: +u.toFixed(1), end: T, warp: +skyU.uWarp.value.toFixed(2), going: going ? going.travel : null,
      crew: crew.filter((m) => m.on).map((m) => m.c.id), figures: extras.filter((e) => e.g).map((e) => e.id), star: skyU.uStarOn.value > 0,
      bodies: skyU.uBody.value.filter((b) => b.w > 0).length,
      debrief: deb ? { key: deb.key, u: +du.toFixed(1), lines: deb.lines.length, said: debSaid } : null,
    }),
    seek(x) {
      if (u >= 0) u = Math.max(u, x);
    },
  };
  void chapter;
  return site;
}
