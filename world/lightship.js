// Aboard the light ship: the archive, a room at a time (GDD 5.7.4).
//
// Inside, the ship is one great hollow of cells turning through the spectrum,
// and a walk hung in the middle of it. Off the walk are round floors, one for
// each world the Tenretni took. Step onto one and the world closes round it
// (world/holoplace.js); on plinths at its far side are five things of that
// world, one for each layer a planet is made of (world/layerplanet.js): its
// sky, its ground, what was built, what lived, a light. One may be taken from
// each world, and what has been taken stacks into a planet that follows the
// pilot about. There is no clock on any of it.
//
// When three rooms have been walked into, the Archivist is waiting on the walk
// with one more thing to say (the shuttle). When enough worlds have given
// something and that has been heard, the way forward to the bridge lights.
//
// A site for src/capitalWalk.js, like the City of Light it is boarded from.
// Frame: +y up, the walk runs along z, forward is -z.

import * as THREE from 'three';
import { C } from '../src/constants.js';
import { Q } from '../src/quality.js';
import { sun } from '../src/sun.js';
import { chime, uiSound } from '../src/sfx.js';
import { label } from '../src/holoLabel.js';
import { openDialogue, isDialogueOpen } from '../src/dialogue.js';
import { chapterHud } from '../src/chapterHud.js';
import { tint, box, cyl, mergedMesh, floorOf, buildRobot, trackRobot, tenretniMat } from './capital.js';
import { createLayerPlanet, LAYERS } from './layerplanet.js';
import { createPlace } from './holoplace.js';
import { buildHoloProp, holoName } from './holoprops.js';
import { WORLDS, HOLO, ASSIGNMENT } from './chapter-dialogue.js';

const SNAP = 1.2;
const HALL_HW = 5, HALL_Z0 = 34, HALL_Z1 = -62; // the walk: aft end, forward end
const ROOM_R = 11, ROOM_X = 24; // a room's floor, and how far off the walk its centre is
const ROOM_Z = [14, -14, -42];
const PLINTH_R = 7.4; // the ring the fragments stand on
const SHOW_R = 4.9; // inside it, the ring the same five things are shown on, large and moving
const SHOW_S = 1.5, MINI_S = 0.46; // how big: the showing, and the one on the pedestal
const DOME_R = 56; // (inside the hull on every side: it is drawn over it, not through it)
const ZERO = new THREE.Vector3();

const COL = { floor: 0x0d1118, edge: 0x1b2430, plinth: 0x222c3a };
const GLOW = { cyan: 0x9fe8ff, gold: 0xffe2a0, white: 0xfff8ea };

// The hull from inside: the same cells as outside (world/lightvessel.js), as
// walls of coloured light a long way off, each keeping its own time.
export const HULL_VERT = /* glsl */ `
  varying vec3 vP;
  varying vec3 vN;
  void main() {
    vP = position;
    vN = normal;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
export const HULL_FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uDim;
  varying vec3 vP;
  varying vec3 vN;
  vec3 hue(float h) {
    return clamp(abs(fract(h + vec3(0.0, 0.6667, 0.3333)) * 6.0 - 3.0) - 1.0, 0.0, 1.0);
  }
  float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  void main() {
    vec3 an = abs(vN);
    vec2 uv = an.x > 0.5 ? vP.zy : an.y > 0.5 ? vP.xz : vP.xy;
    float face = dot(an, vec3(1.0, 2.0, 3.0)) + step(0.0, dot(vN, vec3(1.0))) * 3.0;
    vec2 g = uv / 13.0;
    vec2 id = floor(g);
    // some cells are two long
    if (h2(id + face) < 0.25) { g.x *= 0.5; id = floor(g) + 91.0; }
    vec2 f = fract(g) - 0.5;
    float seed = h2(id + face * 17.0);
    float rate = 0.03 + 0.1 * fract(seed * 7.31);
    vec3 c = hue(seed + uTime * rate);
    float glow = 0.35 + 0.65 * (1.0 - smoothstep(0.0, 0.7, length(f) * 1.7));
    float beat = 0.85 + 0.15 * sin(uTime * (1.2 + seed * 2.0) + seed * 40.0);
    float frame = smoothstep(0.44, 0.48, max(abs(f.x), abs(f.y)));
    // motes drifting up through each one
    vec2 mg = vec2(uv.x * 0.9, uv.y * 0.9 - uTime * (0.6 + seed));
    float mote = step(0.94, h2(floor(mg) + seed * 9.0)) * (1.0 - smoothstep(0.1, 0.4, length(fract(mg) - 0.5)));
    vec3 col = c * glow * beat * 0.62 + vec3(1.0, 0.97, 0.9) * mote * 0.5;
    // the people of each cell, seen from behind the glass they dance against
    vec2 pg = vec2(f.x * 5.0, (f.y + 0.34) * 5.0);
    vec2 pc = vec2(floor(pg.x + 0.5), 0.0);
    float who = h2(pc + id * 3.1 + face);
    vec2 fp = vec2(pg.x - pc.x, pg.y) * 0.2;
    fp.y -= 0.02 * abs(sin(uTime * (4.0 + who * 3.0) + who * 30.0));
    float body = 1.0 - smoothstep(0.016, 0.022, length(vec2(fp.x, max(abs(fp.y - 0.05) - 0.035, 0.0))));
    float head = 1.0 - smoothstep(0.013, 0.018, length(fp - vec2(0.0, 0.115)));
    vec2 arm = vec2(abs(fp.x), fp.y) - vec2(0.015, 0.07);
    vec2 ad = normalize(vec2(0.6, 0.5 + 0.5 * sin(uTime * (2.0 + who * 2.0) + who * 9.0)));
    float reach = 1.0 - smoothstep(0.005, 0.009, length(arm - ad * clamp(dot(arm, ad), 0.0, 0.055)));
    float people = max(body, max(head, reach)) * step(0.3, who) * step(abs(f.y + 0.3), 0.19);
    col = mix(col, c * 0.07, people * 0.85);
    col = mix(col, vec3(0.01, 0.012, 0.02), frame);
    gl_FragColor = vec4(col * uDim, 1.0);
  }
`;

// ctx: { scene, hideFleet(), chapter — src/chapter.js }
export function createLightShip(ctx) {
  const { chapter } = ctx;
  const group = new THREE.Group();
  group.visible = false;
  ctx.scene.add(group);

  const lit = [], glow = [];
  const surfaces = [], colliders = [], consoles = [], npcs = [];

  // --- the hull, all round ---
  const hullU = { uTime: { value: 0 }, uDim: { value: 1 } };
  const hull = new THREE.Mesh(
    new THREE.BoxGeometry(230, 150, 260),
    new THREE.ShaderMaterial({ vertexShader: HULL_VERT, fragmentShader: HULL_FRAG, uniforms: hullU, side: THREE.BackSide, fog: false })
  );
  hull.position.set(0, 16, -14);
  hull.frustumCulled = false;
  group.add(hull);

  // --- the walk ---
  const hl = (HALL_Z0 - HALL_Z1) / 2, hz = (HALL_Z0 + HALL_Z1) / 2;
  lit.push(tint(box(HALL_HW * 2, 0.5, hl * 2, 0, -0.25, hz), COL.floor));
  surfaces.push({ kind: 'rect', cx: 0, cz: hz, ux: 0, uz: 1, hl, hw: HALL_HW, yA: 0, yB: 0 });
  for (const s of [-1, 1]) glow.push(tint(box(0.14, 0.06, hl * 2, s * (HALL_HW - 0.15), 0.03, hz), GLOW.cyan, 1.3));
  for (let z = HALL_Z0 - 4; z > HALL_Z1 + 2; z -= 8) glow.push(tint(box(1.6, 0.05, 0.14, 0, 0.03, z), GLOW.gold, 1.1));
  // hung from above on lines of light
  for (let z = HALL_Z0 - 6; z > HALL_Z1; z -= 14) {
    for (const s of [-1, 1]) glow.push(tint(box(0.05, 60, 0.05, s * HALL_HW, 30, z), GLOW.cyan, 0.5));
  }

  // ribs over the walk, a line of light down its roof, and chevrons in its floor pointing forward
  for (const z of [28, 21, 7, 0, -7, -21, -28, -35, -49, -56]) {
    lit.push(tint(new THREE.TorusGeometry(6.4, 0.16, 6, 28, Math.PI).translate(0, 0.2, z), COL.edge));
    glow.push(tint(new THREE.TorusGeometry(6.4, 0.035, 5, 28, Math.PI).translate(0, 0.2, z - 0.2), GLOW.cyan, 1.1));
    for (const s of [-1, 1]) lit.push(tint(cyl(0.3, 0.42, 0.5, s * 6.4, 0.2, z, 8), COL.plinth));
  }
  glow.push(tint(box(0.1, 0.06, hl * 2 - 6, 0, 6.6, hz), GLOW.white, 1.2));
  for (let z = HALL_Z0 - 8; z > HALL_Z1 + 6; z -= 8) {
    for (const s of [-1, 1]) glow.push(tint(box(1.5, 0.04, 0.12, s * 1.1, 0.032, z - 0.55, s * 0.7), GLOW.cyan, 0.8));
  }

  // --- the rooms ---
  const rooms = [];
  const flatList = (list) => list.map((g) => (g.index ? g.toNonIndexed() : g));
  WORLDS.forEach((w, i) => {
    const side = i % 2 ? 1 : -1;
    const cx = side * ROOM_X, cz = ROOM_Z[Math.floor(i / 2) % ROOM_Z.length];
    // the bridge to it, and its floor
    const bx0 = HALL_HW - 0.5, bx1 = ROOM_X - ROOM_R + 0.8;
    lit.push(tint(box(bx1 - bx0, 0.4, 4.4, side * (bx0 + bx1) / 2, -0.2, cz), COL.floor));
    surfaces.push({ kind: 'rect', cx: side * (bx0 + bx1) / 2, cz, ux: 1, uz: 0, hl: (bx1 - bx0) / 2 + 0.6, hw: 2.2, yA: 0, yB: 0 });
    for (const e of [-1, 1]) glow.push(tint(box(bx1 - bx0, 0.06, 0.12, side * (bx0 + bx1) / 2, 0.03, cz + e * 2.1), GLOW.cyan, 1.2));
    // a gate of light at the walk's edge, in that world's own sky and ground
    glow.push(tint(new THREE.TorusGeometry(3.0, 0.11, 6, 32, Math.PI).rotateY(Math.PI / 2).translate(side * (HALL_HW + 0.3), 0, cz), w.layers.sky.a, 1.5));
    glow.push(tint(new THREE.TorusGeometry(2.72, 0.05, 6, 32, Math.PI).rotateY(Math.PI / 2).translate(side * (HALL_HW + 0.3), 0, cz), w.layers.ground.land, 1.3));
    for (const e of [-1, 1]) lit.push(tint(cyl(0.2, 0.3, 0.9, side * (HALL_HW + 0.3), 0.45, cz + e * 3.0, 8), COL.plinth));
    // rings let into the room's floor
    for (const rr of [ROOM_R - 2.4, 4.2, 2.0]) glow.push(tint(new THREE.TorusGeometry(rr, 0.03, 5, 56).rotateX(Math.PI / 2).translate(cx, 0.04, cz), w.layers.sky.a, 0.7));
    lit.push(tint(cyl(ROOM_R, ROOM_R - 1.6, 0.6, cx, -0.3, cz, 56), COL.floor));
    lit.push(tint(cyl(ROOM_R - 4, 0.6, 9, cx, -5.1, cz, 24), COL.edge));
    surfaces.push({ kind: 'disc', cx, cz, r: ROOM_R, y: 0 });
    glow.push(tint(new THREE.TorusGeometry(ROOM_R - 0.2, 0.07, 6, 72).rotateX(Math.PI / 2).translate(cx, 0.05, cz), GLOW.cyan, 1.4));
    glow.push(tint(new THREE.TorusGeometry(PLINTH_R, 0.04, 6, 64).rotateX(Math.PI / 2).translate(cx, 0.04, cz), GLOW.gold, 0.8));

    const rg = new THREE.Group(); // everything of the room that is only there when it is near
    group.add(rg);
    // its name, over the bridge
    const name = label(w.name, '#a9f7ff', 7);
    name.position.set(side * (HALL_HW + 3.5), 5.2, cz);
    group.add(name);
    const note = label(w.note, '#ffc9ec', 3.6);
    note.position.set(side * (HALL_HW + 3.5), 4.1, cz);
    group.add(note);

    // the world itself, whole, overhead
    const whole = createLayerPlanet(2.7, { life: 260, seg: 48, seed: 2.1 + i * 3.3 });
    whole.group.position.set(cx, 8.2, cz);
    whole.group.rotation.z = 0.3;
    whole.setAll(w.layers);
    whole.revealAll(1);
    whole.holo(0.55);
    rg.add(whole.group);

    // its five fragments: each shown large on the floor, moving, as the thing
    // it is, and again small on the plinth it is taken from (world/holoprops.js)
    const frags = LAYERS.map((layer, k) => {
      const a = (side > 0 ? 0 : Math.PI) + (k - 2) * 0.62; // fanned round the far side
      const x = cx + Math.cos(a) * PLINTH_R, z = cz + Math.sin(a) * PLINTH_R;
      lit.push(tint(cyl(0.42, 0.6, 1.1, x, 0.55, z, 12), COL.plinth));
      lit.push(tint(cyl(0.85, 0.95, 0.16, x, 0.08, z, 12), COL.edge)); // its step
      glow.push(tint(new THREE.TorusGeometry(0.9, 0.025, 5, 28).rotateX(Math.PI / 2).translate(x, 0.17, z), w.layers[layer].col ?? w.layers[layer].a ?? w.layers[layer].land, 1.2));
      colliders.push({ x, z, r: 0.7, top: Infinity });
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.62, 0.05, 6, 32).rotateX(Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false })
      );
      ring.position.set(x, 1.14, z);
      rg.add(ring);
      const f = { layer, x, z, sx: cx + Math.cos(a) * SHOW_R, sz: cz + Math.sin(a) * SHOW_R, mini: null, ring, lift: 0, glow: 0 }; // (what stands on it is made when the room is first come near)
      // a pad of light where the large one stands
      glow.push(tint(new THREE.TorusGeometry(1.25, 0.03, 5, 36).rotateX(Math.PI / 2).translate(f.sx, 0.05, f.sz), w.layers[layer].col ?? w.layers[layer].a ?? w.layers[layer].land, 1.0));
      consoles.push({
        x, y: 0, z, r: 2.3,
        get prompt() {
          const mine = chapter.picked(w.id);
          return `${mine && mine !== layer ? HOLO.swap : HOLO.take} · ${w.layers[layer].label}`;
        },
        off: () => chapter.picked(w.id) === layer,
        use: () => take(room, f),
      });
      return f;
    });
    const room = { w, i, cx, cz, side, rg, whole, frags, near: false };
    rooms.push(room);
  });

  // One fragment's two holograms and their names. `show`: the large one on the
  // floor; `small`: the one on the plinth; `beam`: a line of light between
  // them, lit while the pilot stands at that plinth.
  function makeMini(room, f) {
    const frag = room.w.layers[f.layer];
    const col = '#' + new THREE.Color(frag.col ?? frag.a ?? frag.land).lerp(new THREE.Color(0xffffff), 0.45).getHexString();
    const show = buildHoloProp(room.w.id, f.layer, frag, room.w.layers);
    show.group.position.set(f.sx, 0.12, f.sz);
    show.group.scale.setScalar(SHOW_S);
    const small = buildHoloProp(room.w.id, f.layer, frag, room.w.layers);
    small.group.position.set(f.x, 1.3, f.z);
    small.group.scale.setScalar(MINI_S);
    const nameBig = holoName(frag.label, col, 0.52);
    nameBig.position.set(f.sx, 3.3, f.sz);
    const nameSmall = holoName(frag.label, col, 0.36);
    nameSmall.position.set(f.x, 2.75, f.z);
    const beamGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(f.x, 1.5, f.z), new THREE.Vector3(f.sx, 1.2, f.sz)]);
    const beam = new THREE.Line(beamGeo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    room.rg.add(show.group, small.group, nameBig, nameSmall, beam);
    return { show, small, nameBig, nameSmall, beam };
  }

  // --- forward: the way to the bridge, shut until the archive has been walked ---
  lit.push(tint(box(HALL_HW * 2 + 2, 9, 0.6, 0, 4.5, HALL_Z1 - 0.3), COL.edge));
  const doorMat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false });
  const door = new THREE.Mesh(new THREE.PlaneGeometry(5, 7), doorMat);
  door.position.set(0, 3.5, HALL_Z1 + 0.02);
  group.add(door);
  glow.push(tint(box(5.6, 0.2, 0.3, 0, 7.2, HALL_Z1 + 0.1), GLOW.gold, 1.4));
  for (const s of [-1, 1]) glow.push(tint(box(0.2, 7.2, 0.3, s * 2.7, 3.6, HALL_Z1 + 0.1), GLOW.gold, 1.4));

  consoles.push({
    x: 0, y: 0, z: HALL_Z1 + 2.2, r: 2.6, prompt: 'E — GO FORWARD TO THE BRIDGE',
    off: () => !chapter.reached('dive'),
    use: () => ((site.portal = 'bridge'), null),
  });

  // --- aft: the way off ---
  glow.push(tint(new THREE.TorusGeometry(2.2, 0.1, 6, 40).rotateX(Math.PI / 2).translate(0, 0.06, HALL_Z0 - 2.6), GLOW.gold, 1.6));
  consoles.push({ x: 0, y: 0, z: HALL_Z0 - 2.6, r: 2.4, prompt: 'E — LEAVE THE SHIP', use: () => ((site.portal = 'gallery'), null) });

  const litMat = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x0c0f14 });
  const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false });
  group.add(mergedMesh(flatList(lit), litMat));
  group.add(mergedMesh(flatList(glow), glowMat));

  // --- the world that closes round a room ---
  const place = createPlace(DOME_R);
  place.mesh.material.transparent = true;
  place.mesh.material.depthWrite = false;
  place.mesh.renderOrder = -5;
  place.uniforms.uSpeed.value = 0.02;
  place.uniforms.uAlpha.value = 0;
  group.add(place.mesh);
  let painted = -1;

  // --- what has been taken: a planet of the pilot's own, kept close ---
  const mine = createLayerPlanet(0.5, { life: 140, seg: 32, seed: 5.9 });
  mine.group.visible = false;
  mine.holo(0.3);
  group.add(mine.group);
  const made = { sky: null, ground: null, structures: null, life: null, light: null };
  const shown = { sky: null, ground: null, structures: null, life: null, light: null };
  const drawn = { sky: 0, ground: 0, structures: 0, life: 0, light: 0 };
  function restack() {
    chapter.compose(made);
    for (const l of LAYERS) {
      if (made[l] === shown[l]) continue;
      shown[l] = made[l];
      drawn[l] = 0; // a new layer is drawn in from nothing
      mine.set(l, made[l]);
    }
  }
  // a mote of light from the plinth to the planet when something is taken
  const mote = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false }));
  mote.visible = false;
  group.add(mote);
  const moteFrom = new THREE.Vector3();
  let moteT = -1;

  function take(room, f) {
    if (!chapter.pick(room.w.id, f.layer)) return null;
    const frag = room.w.layers[f.layer];
    chime(frag.tone);
    moteFrom.set(f.x, 2.5, f.z);
    mote.material.color.set(frag.col ?? frag.a ?? frag.land).multiplyScalar(2.2);
    moteT = 0;
    const need = Math.min(C.CH_FRAGMENTS_NEEDED, WORLDS.length);
    chapterHud.say(HOLO.count.replace('{n}', Math.min(chapter.count(), need)).replace('{need}', need), 3.5);
    checkReady();
    return null;
  }
  let readySaid = false;
  function checkReady() {
    if (!chapter.ready() || readySaid) return;
    readySaid = true;
    chapter.advance('dive');
    chapterHud.say(HOLO.ready, 6);
    uiSound('engage');
  }

  // --- the Archivist, once there is something more to say ---
  const robotMat = tenretniMat();
  const rig = buildRobot(robotMat, glowMat, undefined, 'archivist');
  rig.group.scale.setScalar(1.15);
  rig.group.visible = false;
  group.add(rig.group);
  const archivist = { ...rig, x: 0, y: 0, z: 0, face: 0, seed: 4.2, look: 0 };
  const archNpc = { x: 999, y: 0, z: 999, role: 'archivist', talk: () => ASSIGNMENT };
  const archSolid = { x: 999, z: 999, r: 0.85, top: Infinity };
  npcs.push(archNpc);
  colliders.push(archSolid);
  function standArchivist(x, z, face) {
    archivist.x = archNpc.x = archSolid.x = x;
    archivist.z = archNpc.z = archSolid.z = z;
    archivist.face = face;
    rig.group.position.set(x, 0, z);
    rig.group.rotation.y = face;
    rig.group.visible = true;
  }

  let inside = false;
  let prev = null;
  let walker = null;
  let greeted = false;

  const site = {
    group,
    planet: { group: { position: ZERO }, sunDir: new THREE.Vector3(0, 1, 0) },
    noShip: true,
    speed: 1.6,
    exit: { x: 0, z: HALL_Z0 - 2.6 },
    leaveHint: 'THE WAY OFF THE SHIP IS AFT, BEHIND YOU',
    surfaces,
    colliders,
    floorYAt: floorOf(surfaces, SNAP),
    snap: SNAP,
    pad: new THREE.Vector3(0, 0, HALL_Z0 - 2.6),
    spawn: new THREE.Vector3(0, 0, HALL_Z0 - 7),
    spawnYaw: Math.PI, // facing forward
    fromBridge: new THREE.Vector3(0, 0, HALL_Z1 + 6), // coming back aft from the bridge
    fromBridgeYaw: 0,
    npcs,
    consoles,
    onChoice: () => null,
    portal: null, // 'gallery' once the pilot has asked to leave, 'bridge' to go forward
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
      sun.light.position.set(0.2, 1, 0.3).normalize();
      sun.light.color.set(0xdfeaff);
      sun.light.intensity = 1.5;
      sun.ambient.color.set(0xc8b8ff);
      sun.ambient.intensity = 1.1;
      ctx.hideFleet();
      restack();
      for (const l of LAYERS) drawn[l] = shown[l] ? 1 : 0; // what was taken before is already there
      readySaid = chapter.reached('dive');
      if (chapter.assigned() || chapter.assignDue()) standArchivist(3.2, HALL_Z1 + 9, -0.5);
      if (!greeted && !chapter.seenCount()) {
        greeted = true;
        chapterHud.say(HOLO.enter, 7);
      }
    },
    onLeave() {
      if (!inside) return;
      inside = false;
      group.visible = false;
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
      hullU.uTime.value = t;
      if (!walker) return;
      const px = (window.innerHeight * Q.pixelRatio * 0.5) / Math.tan((C.FOV * Math.PI) / 360);

      // which room is the pilot in, or nearest to, and how far into it
      let at = null, deep = 0;
      for (const r of rooms) {
        const d = Math.hypot(walker.x - r.cx, walker.z - r.cz);
        r.d = d;
        const k = Math.min(Math.max((ROOM_R + 3.5 - d) / 5, 0), 1);
        if (k > deep) {
          deep = k;
          at = r;
        }
      }
      if (at && at.i !== painted) {
        painted = at.i;
        place.paint(at.w.layers, at.i * 7.31 + 1.3);
        place.mesh.position.set(at.cx, 0, at.cz);
      }
      const a = deep * deep * (3 - 2 * deep);
      place.uniforms.uAlpha.value = a;
      place.uniforms.uTime.value = t;
      place.mesh.visible = a > 0.003;
      if (at && at.d < ROOM_R - 0.5 && chapter.see(at.w.id) && chapter.assignDue()) {
        // the third room: by the time the pilot is back on the walk, someone is there
        standArchivist(-at.side * 2.6, at.cz, at.side > 0 ? Math.PI / 2 : -Math.PI / 2);
      }

      for (const r of rooms) {
        // a room's things are there when it is near, and only its own when its world is up
        const on = r === at ? true : a < 0.5 && r.d < 46;
        if (r.rg.visible !== on) r.rg.visible = on;
        if (!on) continue;
        r.whole.group.rotation.y = t * 0.08 + r.i;
        r.whole.tick(t, px);
        const picked = chapter.picked(r.w.id);
        const close = r === at || r.d < 24; // from the walk a room shows its world and its rings; the fragments come up as it is neared
        for (const f of r.frags) {
          const mineHere = picked === f.layer;
          f.lift += ((mineHere ? 1 : 0) - f.lift) * Math.min(1, dt * 4);
          if (close && !f.mini) f.mini = makeMini(r, f);
          if (f.mini) {
            const m = f.mini;
            m.show.group.visible = m.small.group.visible = m.nameBig.visible = m.nameSmall.visible = m.beam.visible = close;
            if (close) {
              // the one the pilot is standing at (or has taken) is lit up, and
              // a line of light joins the plinth to the thing it stands for
              const here = Math.hypot(walker.x - f.x, walker.z - f.z) < 2.6;
              f.glow += ((here || mineHere ? 1 : 0) - f.glow) * Math.min(1, dt * 5);
              m.show.tick(t);
              m.small.tick(t);
              m.show.glow(f.glow);
              m.small.glow(f.glow);
              m.show.group.scale.setScalar(SHOW_S * (1 + f.glow * 0.14));
              m.small.group.position.y = 1.3 + 0.05 * Math.sin(t * 1.3 + f.x) + f.lift * 0.35;
              m.small.group.rotation.y = t * 0.35 + f.z;
              m.small.group.scale.setScalar(MINI_S * (1 + f.lift * 0.3));
              m.nameSmall.position.y = 2.75 + f.lift * 0.4;
              m.beam.material.opacity = (here ? 0.75 : mineHere ? 0.3 : 0) * (0.8 + 0.2 * Math.sin(t * 6));
            }
          }
          const pulse = 0.75 + 0.25 * Math.sin(t * 2.2 + f.x * 3);
          if (mineHere) f.ring.material.color.setRGB(2.0, 1.7, 0.9);
          else f.ring.material.color.setRGB(0.5 * pulse, 0.95 * pulse, 1.2 * pulse);
        }
      }

      // the pilot's own planet, over one shoulder
      restack();
      let any = false;
      for (const l of LAYERS) {
        if (!shown[l]) continue;
        any = true;
        drawn[l] = Math.min(1, drawn[l] + dt * 0.8);
        mine.reveal(l, drawn[l]);
      }
      mine.group.visible = any;
      if (any) {
        const g = mine.group.position;
        const k = g.lengthSq() === 0 ? 1 : Math.min(1, dt * 5);
        g.x += (walker.x + 0.95 - g.x) * k;
        g.y += (walker.y + 2.75 + 0.07 * Math.sin(t * 1.1) - g.y) * k;
        g.z += (walker.z - g.z) * k;
        mine.group.rotation.y = t * 0.3;
        mine.tick(t, px);
      }
      if (moteT >= 0) {
        moteT += dt * 1.6;
        const k = Math.min(moteT, 1), e = k * k * (3 - 2 * k);
        mote.position.lerpVectors(moteFrom, mine.group.position, e);
        mote.position.y += Math.sin(k * Math.PI) * 1.4;
        mote.scale.setScalar(1 - 0.7 * k);
        mote.visible = k < 1;
        if (k >= 1) moteT = -1;
      }

      // the Archivist: says it once, unasked, when the pilot comes back onto the walk
      if (rig.group.visible) trackRobot(archivist, walker, dt, t);
      if (chapter.assignDue() && Math.abs(walker.x) < HALL_HW - 0.6 && !isDialogueOpen()) {
        chapter.setAssigned();
        uiSound('select');
        openDialogue(ASSIGNMENT, { onClose: checkReady });
      }

      // the door forward
      const open = chapter.reached('dive');
      const dp = open ? 0.8 + 0.2 * Math.sin(t * 1.6) : 0.1;
      doorMat.color.setRGB(open ? 1.9 * dp : 0.08, open ? 1.7 * dp : 0.14, open ? 1.3 * dp : 0.22);
    },
    inside: () => inside,
    places: {
      aft: [0, 0, HALL_Z0 - 7], door: [0, 0, HALL_Z1 + 4],
      ...Object.fromEntries(rooms.map((r) => [r.w.id, [r.cx, 0, r.cz]])),
    },
    info: () => ({
      room: painted >= 0 && place.mesh.visible ? WORLDS[painted].id : null,
      alpha: place.uniforms.uAlpha.value,
      archivist: rig.group.visible ? [archivist.x, archivist.z] : null,
      mine: LAYERS.filter((l) => shown[l]),
      frags: rooms.map((r) => r.frags.map((f) => [Math.round(f.x * 100) / 100, Math.round(f.z * 100) / 100])),
    }),
  };
  return site;
}
