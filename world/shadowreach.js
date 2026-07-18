/**
 * shadowreach.js
 *
 * Bespoke total-conversion world for "shadowreach" — a landable planet that is
 * a literal walkable map of the dream-journey in *The Book of Shadow Work*.
 * The player does not explore an open biome; they walk one winding path through
 * seven fixed zones in narrative order: the Field, the River (Lady in White),
 * the Confession Circle, the Line, the Desert (Thinking Stone / Warrior), the
 * Round Room (the Monster / mirror-self), and the Garden (the Stranger).
 *
 * This module replaces the stock city / crowd / wonders / creatures stack
 * wholesale (see the name-check early return in src/walk.js). It follows the
 * total-conversion pattern of world/wavemallprime.js:
 *
 * Coordinate assumptions (engine conventions):
 * - Units are meters. Everything is built in planet.surface's UNROTATED local
 *   frame and parented at identity, so planet spin + floating-origin rebasing
 *   carry it along for free, and a surface-local player point equals the
 *   module-local player point (walk.js hands us exactly that).
 * - Local +Y aligns to the radial "up"; quaternion.setFromUnitVectors(yAxis,
 *   dir) then a yaw about that axis orients each prop / figure.
 * - Lighting is external (a single global sun + ambient). Per-zone mood is
 *   faked with emissive materials + a few local lights added to our own group.
 *   Sky is the planet config's skyColor/atmoColor. Bloom threshold is 0.85 —
 *   only the round-room spiral and the finale's blue tear cross it.
 *
 * Visual rule: the whole world is greyscale (black-and-white watercolor) with
 * exactly two accent colors — mask-blue on the Cloaked Figure, sprout-green on
 * the garden's final new growth.
 *
 * No external assets. Primitives + MeshStandardMaterial (+ MeshBasic for the
 * pure-black round room). Deterministic via mulberry32.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildRig, poseRig } from './aliens.js';

/* ----------------------------------------------------------------------
 * Tunables + palette + authored text — every magic value lives here.
 * ------------------------------------------------------------------- */
const SR = {
  // The two — and only two — accent colors.
  MASK_BLUE: 0x4a6fa5,
  SPROUT_GREEN: 0x4a7a5a,

  // Greyscale ramp (dark → light).
  GREY_INK: 0x1c1c1e,
  GREY_DARK: 0x3a3a3d,
  GREY_MID: 0x6b6b6f,
  GREY_LIGHT: 0xb4b4b8,
  GREY_PALE: 0xdedee2,
  GREY_WHITE: 0xf2f2f4,

  // Zone positions along the path (meters of arc from the landing anchor).
  FIELD: 0,
  LADY: 288,        // near bank — reachable before the crossing gate
  RIVER: 300,       // water band + crossing gate
  RIVER_FAR: 314,   // far bank (cloaked figure waits here)
  RIVER_CROSS: 332, // past the water — attaches the companion
  CIRCLE: 560,
  LINE_START: 820,
  GIRL: 1040,
  LINE_END: 1090,
  DESERT: 1320,
  ROOM: 1580,
  GARDEN: 1840,

  ROOM_INNER_R: 13,
  ROOM_WALL_T: 1.0,
  ROOM_H: 8,
  ROOM_DOOR_HALF: 0.17, // radians of open doorway half-angle

  FOLLOW_DIST: 3.0, // meters a companion trails behind the player
};

// Authored, fixed dialogue — never drawn from the CULTURES bank. Parenthesised
// lines are silent stage directions; the named characters speak the rest.
const TXT = {
  ladyGesture: [
    '(The lady in white looks up. She holds out a single flower.)',
    '(You take it. Her eyes are calm, and endless, and unafraid.)',
    '(You offer it back. She accepts it, and nods toward the far bank.)',
  ],
  cloakRiver: 'You came back for me.',
  cloakDesert: 'He was you, once. So were they all.',
  cloakLine: 'None of them can leave the line. Only you noticed it moves.',
  confession: [
    'MAN IN THE CIRCLE: I have to tell you what I did.',
    'His name was Peter Hivets. I let him take the blame.',
    'I watched them lead him away, and I said nothing.',
    'I told myself I would fix it tomorrow. Every tomorrow.',
    'I am telling you now because you are the only one still listening.',
    '(The circle breathes out, and is gone. No footprints remain.)',
  ],
  girl: [
    '(A girl breaks from the line and sprints straight at you, stopping short.)',
    "It's you. It's really you. I knew you'd get here.",
    "Come on — everyone's waiting in the line. But we don't have to wait.",
  ],
  warriorParable: [
    'WARRIOR: Sit. You walked a long way to find me sitting still.',
    'I carried a blade until my hands forgot every other shape.',
    'They called it mastery. I called it the only thing I knew how to be.',
    'A man once offered me gold to put it down. I laughed at him.',
    'Now I would give the gold back just to be asked one thing.',
    'Are you happy? No one has asked me that. Are you?',
  ],
  warriorEmbrace: [
    '(You kneel and put your arms around him. He is lighter than the war he carried.)',
    '(He lets go of something older than you, and is carried off as grey ash.)',
  ],
  mirror: [
    '(In the dark, a shadow uncoils from the spiral and stands to meet you.)',
    '(It steps into the single light. It is wearing your face.)',
    "It's you. It was always only you.",
  ],
  stranger: [
    'STRANGER: I am the monster you were so afraid of.',
    'I am the one who waited on the far side of the fear.',
    'I am you — the you that got all the way here.',
  ],
  toastLanding: 'THE FIELD — WALK TOWARD THE WATER',
  toastSprout: '(A green sprout breaks the pale soil.)',
  toastMask: '(The cloaked figure lifts the mask away. One blue tear.)',
  toastDissolve: '(He dissolves, and is finally at peace.)',
  toastComplete: 'THE DREAM IS COMPLETE — PRESS G TO WAKE',
  promptUnfinished: 'THE DREAM IS NOT FINISHED',
};

// Strictly linear progression. `stage` counts flags set; a flag only advances
// when it is the next one expected, so the world can never skip or rewind.
const FLAGS = [
  'flower_given', 'river_crossed', 'circle_triggered', 'line_broken',
  'warrior_embraced', 'monster_faced', 'mask_removed',
];

/* ----------------------------------------------------------------------
 * Deterministic PRNG + placement helpers (copied from wavemallprime.js —
 * these are private there; copying keeps the two conversions decoupled,
 * exactly as wavemallprime itself copied mulberry32 from aliens.js).
 * ------------------------------------------------------------------- */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashSeed(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return (h ^ (h >>> 16)) >>> 0;
}

const _yAxis = new THREE.Vector3(0, 1, 0);

// dirLocal is already in planet.surface's unrotated frame (walk.js hands us a
// surface-local up), so no world-quaternion un-rotation — applying one would
// rotate everything by the accumulated spin angle.
function orientOnSurface(obj, dirLocal, yawRad = 0) {
  const q = new THREE.Quaternion().setFromUnitVectors(_yAxis, dirLocal);
  const yawQ = new THREE.Quaternion().setFromAxisAngle(_yAxis, yawRad);
  obj.quaternion.copy(q).multiply(yawQ);
}

function sampleGround(planet, dirLocal) {
  if (planet.body && planet.body.groundAtLocal) {
    return (planet.radius ?? 900) + planet.body.groundAtLocal(dirLocal);
  }
  return planet.radius ?? 900;
}

function placeAtDir(obj, planet, dirLocal, heightOffset = 0) {
  const r = sampleGround(planet, dirLocal) + heightOffset;
  obj.position.copy(dirLocal).multiplyScalar(r);
}

/* ----------------------------------------------------------------------
 * Top-level factory — createShadowreach
 * ------------------------------------------------------------------- */
export function createShadowreach(planet, worldUp, opts = {}) {
  const rng = mulberry32(hashSeed((opts.seedKey ?? 'shadowreach')));
  const R = planet.radius ?? 900;
  const group = new THREE.Group();
  group.name = 'shadowreach';

  // Registries drained in dispose().
  const disposables = []; // geometries, materials, textures
  const localLights = []; // lights added to `group` (removed with the group)

  // ---- Path basis: one great-circle bearing from the landing anchor. --------
  const up = worldUp.clone().normalize();
  const arbitrary = Math.abs(up.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const tanA = new THREE.Vector3().crossVectors(up, arbitrary).normalize(); // bearing (+dist)
  const tanB = new THREE.Vector3().crossVectors(up, tanA).normalize();      // lateral (+x)

  // Surface-local direction `dist` meters along the bearing, offset `lateral`
  // meters sideways. Small-angle lateral offset is exact enough at these spans.
  const _pd = new THREE.Vector3();
  function pathDirInto(dist, lateral, out) {
    const span = dist / R;
    out.copy(up).multiplyScalar(Math.cos(span)).addScaledVector(tanA, Math.sin(span));
    if (lateral) out.addScaledVector(tanB, lateral / R);
    return out.normalize();
  }
  function pathDir(dist, lateral = 0) {
    return pathDirInto(dist, lateral, new THREE.Vector3());
  }

  // Inverse: surface-local point → { dist, lateral } along the path.
  const _pc = new THREE.Vector3();
  function pathCoords(p, out) {
    _pc.copy(p).normalize();
    const cu = _pc.dot(up);
    const ca = _pc.dot(tanA);
    const cb = _pc.dot(tanB);
    out.dist = Math.atan2(ca, cu) * R;
    out.lateral = Math.asin(THREE.MathUtils.clamp(cb, -1, 1)) * R;
    return out;
  }

  // A tangent frame at a path distance (local -Z faces back toward the anchor,
  // +Z toward increasing distance, +X lateral). Cached for collision math.
  function frameAt(dist) {
    const dir = pathDir(dist);
    const q0 = new THREE.Quaternion().setFromUnitVectors(_yAxis, dir);
    const pos = dir.clone().multiplyScalar(sampleGround(planet, dir));
    const backDir = pathDir(dist - 40);
    const toBack = backDir.clone().multiplyScalar(sampleGround(planet, backDir))
      .sub(pos).applyQuaternion(q0.clone().invert());
    const yaw = Math.atan2(toBack.x, toBack.z);
    const q = q0.multiply(new THREE.Quaternion().setFromAxisAngle(_yAxis, yaw));
    return { pos, q, qInv: q.clone().invert(), dir };
  }

  /* -------------------------------------------------------------------
   * Material + geometry helpers
   * ----------------------------------------------------------------- */
  function greyMat(hex, o = {}) {
    const m = new THREE.MeshStandardMaterial({
      color: hex, roughness: o.rough ?? 0.9, metalness: o.metal ?? 0.0,
    });
    if (o.emis) { m.emissive = new THREE.Color(o.emisColor ?? hex); m.emissiveIntensity = o.emis; }
    if (o.transparent) { m.transparent = true; m.opacity = o.opacity ?? 1; m.depthWrite = o.depthWrite ?? true; }
    disposables.push(m);
    return m;
  }
  function keep(geoOrTex) { disposables.push(geoOrTex); return geoOrTex; }

  // A humanoid rig recolored to greyscale. `tint` is the skin/base grey; the
  // rig's random accent (eyes/trim) is flattened to a slightly brighter grey so
  // figures stay legible at night without introducing a third color.
  function greyRig(seedKey, tint, opts = {}) {
    const rig = buildRig(hashSeed('shadowreach:' + seedKey), 'shadowreach');
    const trim = opts.trim ?? SR.GREY_MID;
    rig.materials.skinMat.color.setHex(tint);
    rig.materials.skinMat.roughness = 0.95; rig.materials.skinMat.metalness = 0.0;
    rig.materials.clothMat.color.setHex(trim);
    rig.materials.clothMat.emissive.setHex(SR.GREY_DARK);
    rig.materials.clothMat.emissiveIntensity = 0.12;
    rig.materials.eyeMat.color.setHex(SR.GREY_PALE);
    rig.materials.eyeMat.emissive.setHex(SR.GREY_LIGHT);
    rig.materials.eyeMat.emissiveIntensity = 0.18;
    return rig;
  }

  // Bend a rig into a seated pose (thighs forward, shins down) and drop it so it
  // reads as sitting on a low surface at `seatDrop` below its standing feet.
  function seatRig(rig, seatDrop = 0) {
    const j = rig.joints;
    j.legL.hip.rotation.x = -1.45; j.legR.hip.rotation.x = -1.45;
    j.legL.knee.rotation.x = 1.5; j.legR.knee.rotation.x = 1.5;
    j.torso.rotation.x = 0.12;
    rig._seatDrop = seatDrop + 0.35 * rig.params.scaleY;
  }

  // Place a rig on the ground along a surface-local direction, facing `yaw`.
  function placeRig(rig, dirLocal, yaw = 0) {
    const drop = rig._seatDrop ?? 0;
    placeAtDir(rig.group, planet, dirLocal, rig.params.groundOffset - drop);
    orientOnSurface(rig.group, dirLocal, yaw);
  }

  // Surface-local ground position (near body center) for interaction distance.
  function bodyPosAt(dist, lateral) {
    const dir = pathDir(dist, lateral);
    return dir.multiplyScalar(sampleGround(planet, dir) + 1.0);
  }

  /* -------------------------------------------------------------------
   * State machine
   * ----------------------------------------------------------------- */
  let stage = 0;
  const has = (f) => stage > FLAGS.indexOf(f);
  function advance(f) {
    if (FLAGS[stage] === f) { stage++; onStage(f); }
  }

  // Deferred narration + timed sequence steps, driven off wall-clock `t`.
  let lastT = 0;
  const toastQueue = [];
  const timers = [];
  function queueToast(text, seconds = 4.5, delay = 0) {
    toastQueue.push({ text, seconds, due: lastT + delay });
  }
  function schedule(delay, fn) { timers.push({ at: lastT + delay, fn }); }

  /* -------------------------------------------------------------------
   * Interactables + followers + effects (populated by zone builders)
   * ----------------------------------------------------------------- */
  const entities = [];   // { pos:Vector3, active(), getPayload(), onClose(), rig? }
  const followers = [];  // companion rigs trailing the player
  const dissolves = [];  // live ash/dissolve puffs
  const zoneUpdaters = []; // per-frame zone hooks: fn(t, dt, pl, sunDot)
  const colliders = [];  // { frame, structures? , special? , active? , r2 }

  function addFollower(rig, slotX) {
    rig.group.visible = true;
    followers.push({ rig, slotX, cur: new THREE.Vector3(), lastDir: new THREE.Vector3().copy(tanA), inited: false });
  }

  // An ash puff rising from a surface-local direction; a few points may carry an
  // accent tint (the cloaked figure's blue tear at the finale).
  function makeDissolve(dirLocal, colorHex, count = 220, accentHex = null, accentFrac = 0) {
    const holder = new THREE.Group();
    placeAtDir(holder, planet, dirLocal, 0);
    orientOnSurface(holder, dirLocal, 0);
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const vel = new Float32Array(count * 3);
    const cMain = new THREE.Color(colorHex);
    const cAcc = accentHex != null ? new THREE.Color(accentHex) : cMain;
    for (let i = 0; i < count; i++) {
      const a = rng() * Math.PI * 2, rr = rng() * 0.45;
      positions[i * 3] = Math.cos(a) * rr;
      positions[i * 3 + 1] = rng() * 1.9;
      positions[i * 3 + 2] = Math.sin(a) * rr;
      vel[i * 3] = (rng() - 0.5) * 0.35;
      vel[i * 3 + 1] = 0.35 + rng() * 0.7;
      vel[i * 3 + 2] = (rng() - 0.5) * 0.35;
      const c = rng() < accentFrac ? cAcc : cMain;
      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.09, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false,
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    holder.add(pts);
    group.add(holder);
    let life = 0; const DUR = 3.2;
    dissolves.push({
      update(dt) {
        life += dt;
        const p = geo.attributes.position.array;
        for (let i = 0; i < count; i++) {
          p[i * 3] += vel[i * 3] * dt;
          p[i * 3 + 1] += vel[i * 3 + 1] * dt;
          p[i * 3 + 2] += vel[i * 3 + 2] * dt;
        }
        geo.attributes.position.needsUpdate = true;
        mat.opacity = 0.95 * Math.max(0, 1 - life / DUR);
        return life < DUR;
      },
      dispose() { group.remove(holder); geo.dispose(); mat.dispose(); },
    });
  }

  /* -------------------------------------------------------------------
   * ZONE 1 — The Field
   * ----------------------------------------------------------------- */
  function buildField() {
    const g = new THREE.Group();
    // Pale grass ribbon from the landing anchor to the river.
    const blade = keep(mergeGeometries([
      new THREE.PlaneGeometry(0.06, 0.55),
      new THREE.PlaneGeometry(0.06, 0.55).rotateY(Math.PI / 2),
    ]));
    blade.translate(0, 0.27, 0);
    const grassMat = greyMat(SR.GREY_PALE, { rough: 1.0, emis: 0.06 });
    grassMat.side = THREE.DoubleSide;
    const COUNT = 4200;
    const grass = new THREE.InstancedMesh(blade, grassMat, COUNT);
    grass.frustumCulled = false;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    const dir = new THREE.Vector3(), pos = new THREE.Vector3();
    for (let i = 0; i < COUNT; i++) {
      const d = rng() * (SR.RIVER - 6);
      const lat = (rng() - 0.5) * 78;
      pathDirInto(d, lat, dir);
      pos.copy(dir).multiplyScalar(sampleGround(planet, dir));
      q.setFromUnitVectors(_yAxis, dir);
      q.multiply(_qScratch.setFromAxisAngle(_yAxis, rng() * Math.PI));
      s.set(0.8 + rng() * 0.6, 0.7 + rng() * 0.9, 1);
      m.compose(pos, q, s);
      grass.setMatrixAt(i, m);
    }
    grass.instanceMatrix.needsUpdate = true;
    g.add(grass);

    // A worn darker path strip pointing at the river.
    const strip = new THREE.Mesh(keep(new THREE.PlaneGeometry(2.4, SR.RIVER - 10)), greyMat(SR.GREY_DARK, { rough: 1.0 }));
    const f = frameAt((SR.RIVER - 10) / 2);
    strip.position.copy(f.pos).addScaledVector(f.dir, 0.05);
    strip.quaternion.copy(f.q).multiply(_qScratch.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2));
    g.add(strip);

    return { group: g };
  }

  /* -------------------------------------------------------------------
   * ZONE 2 — The River & the Lady in White
   * ----------------------------------------------------------------- */
  function buildRiver() {
    const g = new THREE.Group();
    const f = frameAt(SR.RIVER);

    // Still dark water: a wide, slightly sunken reflective band across the path.
    const water = new THREE.Mesh(
      keep(new THREE.PlaneGeometry(120, 16)),
      greyMat(SR.GREY_INK, { rough: 0.15, metal: 0.55 })
    );
    water.position.copy(f.pos).addScaledVector(f.dir, -0.35);
    water.quaternion.copy(f.q).multiply(_qScratch.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2));
    g.add(water);

    // Stepping stones across (purely visual — the ground beneath is walkable).
    const stoneGeo = keep(new THREE.CylinderGeometry(1.0, 1.1, 0.5, 7));
    const stoneMat = greyMat(SR.GREY_MID, { rough: 1.0 });
    for (let i = -3; i <= 3; i++) {
      const st = new THREE.Mesh(stoneGeo, stoneMat);
      const dir = pathDir(SR.RIVER + i * 3.2, (i % 2) * 0.6);
      placeAtDir(st, planet, dir, 0.05);
      orientOnSurface(st, dir, 0);
      g.add(st);
    }

    // The Lady in White: seated at the near bank, holding a single flower.
    const lady = greyRig('lady', SR.GREY_WHITE, { trim: SR.GREY_PALE });
    seatRig(lady, 0);
    placeRig(lady, pathDir(SR.LADY, 4), Math.PI); // faces back toward the arriving player
    g.add(lady.group);
    const flowerMat = greyMat(SR.GREY_WHITE, { emis: 0.25 });
    const flower = new THREE.Mesh(keep(new THREE.ConeGeometry(0.12, 0.3, 5)), flowerMat);
    flower.position.set(0.28, 1.0 * lady.params.scaleY, 0.2);
    lady.joints.torso.add(flower);

    entities.push({
      pos: bodyPosAt(SR.LADY, 4),
      rig: lady,
      active: () => !has('flower_given'),
      getPayload: () => ({ speaker: { name: 'The Lady in White', species: '—', cityId: '' }, lines: TXT.ladyGesture }),
      onClose: () => { flower.visible = false; advance('flower_given'); },
    });

    // The Cloaked Figure waits on the far bank until the crossing, then follows.
    const cloak = buildCloakedFigure();
    placeRig(cloak.rig, pathDir(SR.RIVER_FAR, -3), Math.PI);
    cloak.rig.group.visible = true;
    g.add(cloak.rig.group);
    cloakedFigure = cloak;

    return { group: g };
  }

  // The guarded companion: a grey rig under a cone cloak with a mask-blue plate.
  let cloakedFigure = null;
  function buildCloakedFigure() {
    const rig = greyRig('cloak', SR.GREY_DARK, { trim: SR.GREY_INK });
    const sc = rig.params.scaleY;
    // Cloak: an open cone draped from the shoulders.
    const cloakGeo = keep(new THREE.ConeGeometry(0.55 * sc, 1.6 * sc, 10, 1, true));
    const cloakMat = greyMat(SR.GREY_INK, { rough: 1.0, emis: 0.05 });
    cloakMat.side = THREE.DoubleSide;
    const cloakMesh = new THREE.Mesh(cloakGeo, cloakMat);
    cloakMesh.position.y = 1.05 * sc;
    rig.group.add(cloakMesh);
    // Mask plate over the face — the world's first accent color.
    const maskMat = new THREE.MeshStandardMaterial({
      color: SR.MASK_BLUE, emissive: new THREE.Color(SR.MASK_BLUE),
      emissiveIntensity: 0.5, roughness: 0.5, metalness: 0.1,
    });
    disposables.push(maskMat);
    const mask = new THREE.Mesh(keep(new THREE.BoxGeometry(0.2 * sc, 0.26 * sc, 0.06 * sc)), maskMat);
    rig.joints.head.add(mask);
    mask.position.set(0, 0.15 * sc, 0.13 * sc);
    return { rig, cloakMesh, mask, maskMat };
  }

  /* -------------------------------------------------------------------
   * ZONE 3 — The Confession Circle
   * ----------------------------------------------------------------- */
  let circleMesh = null;
  function buildCircle() {
    const g = new THREE.Group();
    // A huddle of dust-grey hooded figures facing inward (static impostors).
    const fig = keep(mergeGeometries([
      new THREE.ConeGeometry(0.34, 1.5, 6).translate(0, 0.75, 0),      // robed body
      new THREE.SphereGeometry(0.19, 6, 5).translate(0, 1.6, 0),        // bowed head
    ]));
    const mat = greyMat(SR.GREY_DARK, { rough: 1.0, emis: 0.05 });
    mat.transparent = true;
    const N = 26;
    const crowd = new THREE.InstancedMesh(fig, mat, N);
    crowd.frustumCulled = false;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1);
    const dir = new THREE.Vector3(), pos = new THREE.Vector3();
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      const rr = 9 + rng() * 3;
      pathDirInto(SR.CIRCLE + Math.sin(a) * rr, Math.cos(a) * rr, dir);
      pos.copy(dir).multiplyScalar(sampleGround(planet, dir));
      q.setFromUnitVectors(_yAxis, dir);
      q.multiply(_qScratch.setFromAxisAngle(_yAxis, -a + Math.PI / 2)); // face circle center
      s.setScalar(0.9 + rng() * 0.3);
      m.compose(pos, q, s);
      crowd.setMatrixAt(i, m);
    }
    crowd.instanceMatrix.needsUpdate = true;
    g.add(crowd);
    circleMesh = { mesh: crowd, mat, fade: -1 };

    zoneUpdaters.push((t, dt) => {
      if (circleMesh.fade >= 0) {
        circleMesh.fade += dt;
        mat.opacity = Math.max(0, 1 - circleMesh.fade / 2);
        if (circleMesh.fade > 2) { crowd.visible = false; circleMesh.fade = -2; }
      }
    });
    return { group: g };
  }

  /* -------------------------------------------------------------------
   * ZONE 4 — The Line
   * ----------------------------------------------------------------- */
  let lineGroup = null, lineFadeState = { t: -1, mats: [] };
  let girl = null;
  function buildLine() {
    const g = new THREE.Group();
    lineGroup = g;
    const span = SR.LINE_END - SR.LINE_START;
    const mid = (SR.LINE_START + SR.LINE_END) / 2;

    // Grey fog walls flanking the corridor.
    const fogMat = greyMat(SR.GREY_LIGHT, { rough: 1.0, transparent: true, opacity: 0.32, depthWrite: false });
    fogMat.side = THREE.DoubleSide;
    lineFadeState.mats.push(fogMat);
    for (const side of [-1, 1]) {
      const wall = new THREE.Mesh(keep(new THREE.PlaneGeometry(span + 60, 10)), fogMat);
      const f = frameAt(mid);
      wall.position.copy(f.pos).addScaledVector(f.dir, 3).addScaledVector(tanB, side * 9);
      const q = new THREE.Quaternion().setFromUnitVectors(_yAxis, f.dir);
      wall.quaternion.copy(q).multiply(_qScratch.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2))
        .multiply(_q2Scratch.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2));
      g.add(wall);
    }

    // The receding queue: silent figures spaced beside the path.
    const fig = keep(mergeGeometries([
      new THREE.CapsuleGeometry(0.22, 1.0, 3, 6).translate(0, 0.85, 0),
      new THREE.SphereGeometry(0.18, 6, 5).translate(0, 1.65, 0),
    ]));
    const qMat = greyMat(SR.GREY_MID, { rough: 1.0, emis: 0.06 });
    qMat.transparent = true;
    lineFadeState.mats.push(qMat);
    const N = 44;
    const queue = new THREE.InstancedMesh(fig, qMat, N);
    queue.frustumCulled = false;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    const dir = new THREE.Vector3(), pos = new THREE.Vector3();
    for (let i = 0; i < N; i++) {
      const d = SR.LINE_START + (i / N) * (span + 120); // recedes past the horizon
      const lat = (i % 2 === 0 ? -1 : 1) * (1.6 + rng() * 0.4);
      pathDirInto(d, lat, dir);
      pos.copy(dir).multiplyScalar(sampleGround(planet, dir) + 0.02);
      q.setFromUnitVectors(_yAxis, dir);
      s.setScalar(0.92 + rng() * 0.16);
      m.compose(pos, q, s);
      queue.setMatrixAt(i, m);
    }
    queue.instanceMatrix.needsUpdate = true;
    g.add(queue);

    // Mica shimmer far ahead — tiny emissive shards that just cross bloom.
    const micaMat = new THREE.MeshStandardMaterial({
      color: SR.GREY_WHITE, emissive: new THREE.Color(SR.GREY_WHITE), emissiveIntensity: 1.0,
    });
    disposables.push(micaMat);
    const mica = new THREE.InstancedMesh(keep(new THREE.OctahedronGeometry(0.12, 0)), micaMat, 40);
    mica.frustumCulled = false;
    for (let i = 0; i < 40; i++) {
      pathDirInto(SR.LINE_END + 40 + rng() * 120, (rng() - 0.5) * 24, dir);
      pos.copy(dir).multiplyScalar(sampleGround(planet, dir) + 0.5 + rng() * 3);
      q.setFromUnitVectors(_yAxis, dir);
      s.setScalar(0.6 + rng() * 0.8);
      m.compose(pos, q, s);
      mica.setMatrixAt(i, m);
    }
    mica.instanceMatrix.needsUpdate = true;
    g.add(mica);

    // The Girl: hidden until she sprints in and breaks the scene.
    const gr = greyRig('girl', SR.GREY_LIGHT, { trim: SR.GREY_MID });
    gr.group.visible = false;
    g.add(gr.group);
    girl = { rig: gr, state: 'hidden', dist: SR.GIRL + 34, lateral: 0 };
    entities.push({
      pos: new THREE.Vector3(), // updated live while she runs / waits
      rig: gr,
      active: () => girl.state === 'ready',
      getPayload: () => ({ speaker: { name: 'The Girl', species: '—', cityId: '' }, lines: TXT.girl }),
      onClose: () => advance('line_broken'),
      _live: true,
    });

    // Fade helper for the line vanishing after the break.
    zoneUpdaters.push((t, dt) => {
      // Girl motion.
      if (girl.state === 'sprinting') {
        girl.dist += (SR.GIRL - girl.dist) * Math.min(1, 6 * dt); // rush toward the player's mark
        const dir2 = pathDir(girl.dist, girl.lateral);
        placeRig(gr, dir2, 0);
        poseRig(gr, dt, t, 'walk', 1);
        if (Math.abs(girl.dist - SR.GIRL) < 1.2) girl.state = 'ready';
        girlEnt.pos.copy(bodyPosAt(girl.dist, girl.lateral));
      } else if (girl.state === 'ready') {
        poseRig(gr, dt, t, 'idle', 0);
      }
      if (lineFadeState.t >= 0) {
        lineFadeState.t += dt;
        const o = Math.max(0, 1 - lineFadeState.t / 2.5);
        fogMat.opacity = 0.32 * o;
        qMat.opacity = o;
        micaMat.emissiveIntensity = 1.0 * o;
        if (lineFadeState.t > 2.5) { queue.visible = false; mica.visible = false; lineFadeState.t = -2; }
      }
    });
    const girlEnt = entities[entities.length - 1];
    girl._ent = girlEnt;
    return { group: g };
  }

  /* -------------------------------------------------------------------
   * ZONE 5 — The Desert & the Thinking Stone
   * ----------------------------------------------------------------- */
  let warrior = null;
  function buildDesert() {
    const g = new THREE.Group();
    // Scorched dune domes flanking the corridor (non-walkable dressing).
    const duneMat = greyMat(SR.GREY_MID, { rough: 1.0 });
    const duneGeo = keep(new THREE.SphereGeometry(1, 12, 8));
    for (let i = 0; i < 14; i++) {
      const d = SR.DESERT - 90 + rng() * 180;
      const lat = (rng() < 0.5 ? -1 : 1) * (26 + rng() * 40);
      const dune = new THREE.Mesh(duneGeo, duneMat);
      const dir = pathDir(d, lat);
      placeAtDir(dune, planet, dir, -6);
      orientOnSurface(dune, dir, 0);
      const sc = 10 + rng() * 22;
      dune.scale.set(sc, sc * (0.32 + rng() * 0.2), sc);
      g.add(dune);
    }
    // Dark pebbles scattered on the path.
    const pebGeo = keep(new THREE.DodecahedronGeometry(0.2, 0));
    const pebMat = greyMat(SR.GREY_DARK, { rough: 1.0 });
    const peb = new THREE.InstancedMesh(pebGeo, pebMat, 120);
    peb.frustumCulled = false;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    const dir = new THREE.Vector3(), pos = new THREE.Vector3();
    for (let i = 0; i < 120; i++) {
      pathDirInto(SR.DESERT - 60 + rng() * 120, (rng() - 0.5) * 30, dir);
      pos.copy(dir).multiplyScalar(sampleGround(planet, dir) + 0.05);
      q.setFromUnitVectors(_yAxis, dir);
      s.setScalar(0.5 + rng() * 1.4);
      m.compose(pos, q, s);
      peb.setMatrixAt(i, m);
    }
    peb.instanceMatrix.needsUpdate = true;
    g.add(peb);

    // The Thinking Stone + seated Warrior.
    const stone = new THREE.Mesh(keep(new THREE.CylinderGeometry(1.3, 1.5, 1.0, 9)), greyMat(SR.GREY_LIGHT, { rough: 1.0 }));
    const stoneDir = pathDir(SR.DESERT, 0);
    placeAtDir(stone, planet, stoneDir, 0.5);
    orientOnSurface(stone, stoneDir, 0);
    g.add(stone);

    const wr = greyRig('warrior', SR.GREY_DARK, { trim: SR.GREY_INK });
    seatRig(wr, 0.6);
    placeRig(wr, pathDir(SR.DESERT, 0), Math.PI);
    g.add(wr.group);
    warrior = { rig: wr, talkedOnce: false, dir: pathDir(SR.DESERT, 0.0) };

    entities.push({
      pos: bodyPosAt(SR.DESERT, 0),
      rig: wr,
      active: () => has('line_broken') && !has('warrior_embraced'),
      getPayload: () => ({
        speaker: { name: 'The Warrior', species: '—', cityId: '' },
        lines: warrior.talkedOnce ? TXT.warriorEmbrace : TXT.warriorParable,
      }),
      onClose: () => {
        if (!warrior.talkedOnce) { warrior.talkedOnce = true; }
        else { advance('warrior_embraced'); }
      },
    });
    return { group: g };
  }

  /* -------------------------------------------------------------------
   * ZONE 6 — The Round Room (the Monster / mirror-self)
   * ----------------------------------------------------------------- */
  let roomFrame = null, roomCenterDir = null, mirror = null;
  function buildRoundRoom() {
    const g = new THREE.Group();
    roomFrame = frameAt(SR.ROOM);
    roomCenterDir = roomFrame.dir.clone();
    const innerR = SR.ROOM_INNER_R, wallT = SR.ROOM_WALL_T, H = SR.ROOM_H;

    // Pure-black shell: MeshBasic ignores all scene light, so the interior is
    // genuinely black under a daylight sun. Built from ring segments with gaps
    // at the entrance (-Z, toward the desert) and exit (+Z, toward the garden).
    const blackMat = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide });
    disposables.push(blackMat);
    const segGeos = [];
    const N = 40;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2; // a=0 → +Z (exit), a=π → -Z (entrance)
      if (angNear(a, 0, SR.ROOM_DOOR_HALF + 0.05) || angNear(a, Math.PI, SR.ROOM_DOOR_HALF + 0.05)) continue;
      const seg = new THREE.BoxGeometry((2 * Math.PI * innerR / N) * 1.15, H, wallT);
      seg.rotateY(-a);
      seg.translate(Math.sin(a) * innerR, H / 2, Math.cos(a) * innerR);
      segGeos.push(seg);
    }
    const shell = new THREE.Mesh(keep(mergeGeometries(segGeos)), blackMat);
    // Floor + roof discs.
    const floor = new THREE.Mesh(keep(new THREE.CircleGeometry(innerR + wallT, 40)), blackMat);
    floor.rotation.x = -Math.PI / 2; floor.position.y = 0.02;
    const roof = new THREE.Mesh(keep(new THREE.CircleGeometry(innerR + wallT, 40)), blackMat);
    roof.rotation.x = Math.PI / 2; roof.position.y = H;
    const shellHolder = new THREE.Group();
    shellHolder.position.copy(roomFrame.pos);
    shellHolder.quaternion.copy(roomFrame.q);
    shellHolder.add(shell, floor, roof);

    // Glowing scotch-tape spiral on the floor (emissive → blooms).
    const spiralTex = makeSpiralTexture();
    const spiralMat = new THREE.MeshStandardMaterial({
      color: 0x000000, emissive: 0xffffff, emissiveMap: spiralTex, emissiveIntensity: 1.25,
      transparent: true, alphaMap: spiralTex, depthWrite: false,
    });
    disposables.push(spiralMat);
    const spiral = new THREE.Mesh(keep(new THREE.CircleGeometry(innerR - 1.5, 48)), spiralMat);
    spiral.rotation.x = -Math.PI / 2; spiral.position.y = 0.06;
    shellHolder.add(spiral);
    g.add(shellHolder);

    // Single hard overhead light + a faint visible shaft.
    const light = new THREE.PointLight(0xffffff, 3.2, 30, 2);
    placeAtDir(light, planet, roomCenterDir, H - 0.5);
    group.add(light); localLights.push(light);
    const coneMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.05, depthWrite: false, side: THREE.DoubleSide });
    disposables.push(coneMat);
    const cone = new THREE.Mesh(keep(new THREE.ConeGeometry(3.2, H - 1, 16, 1, true)), coneMat);
    cone.position.copy(roomFrame.pos).addScaledVector(roomCenterDir, (H - 1) / 2 + 0.5);
    orientOnSurface(cone, roomCenterDir, 0);
    g.add(cone);

    // The mirror-self: begins matte black, resolves to grey as you approach.
    const mr = greyRig('mirror', 0x050505, { trim: 0x050505 });
    mr.materials.skinMat.emissive = new THREE.Color(0x000000);
    placeRig(mr, roomCenterDir, 0); // faces the entrance (theta=0), where the player enters
    g.add(mr.group);
    mirror = { rig: mr, reveal: 0 };

    entities.push({
      pos: bodyPosAt(SR.ROOM, 0),
      rig: mr,
      active: () => has('warrior_embraced') && !has('monster_faced'),
      getPayload: () => ({ speaker: { name: 'The Monster', species: '—', cityId: '' }, lines: TXT.mirror }),
      onClose: () => advance('monster_faced'),
    });

    // Round-room collision: a soft annulus with two doorway sectors. frameAt
    // yaws +Z toward the anchor, so the entrance (desert side, lower path dist)
    // sits at theta = 0 and stays open; the exit (garden side) sits at theta = pi
    // and stays sealed until the monster is faced.
    colliders.push({
      frame: roomFrame, r2: (innerR + 6) ** 2, special: 'annulus',
      innerR, wallT,
      doorOpen: (theta) =>
        angNear(theta, 0, SR.ROOM_DOOR_HALF) ||
        (angNear(theta, Math.PI, SR.ROOM_DOOR_HALF) && has('monster_faced')),
    });

    // Mirror behaviour: darkness → grey by proximity; after facing, it mimics.
    const _mp = new THREE.Vector3(), _refl = new THREE.Vector3();
    zoneUpdaters.push((t, dt, pl) => {
      const d = pl.distanceTo(mirror.rig.group.position);
      if (!has('monster_faced')) {
        const target = THREE.MathUtils.clamp(1 - (d - 3) / 12, 0, 1);
        mirror.reveal += (target - mirror.reveal) * Math.min(1, 3 * dt);
        const c = 0.02 + mirror.reveal * 0.62; // → astronaut grey
        mr.materials.skinMat.color.setRGB(c, c, c);
        mr.materials.clothMat.color.setRGB(c * 0.8, c * 0.8, c * 0.8);
        poseRig(mr, dt, t, 'idle', 0);
      } else {
        // Reflect the player across the room center in the room frame, mirror pose.
        _mp.copy(pl).sub(roomFrame.pos).applyQuaternion(roomFrame.qInv);
        _refl.set(-_mp.x, 0, -_mp.z);
        const dir2 = _refl.applyQuaternion(roomFrame.q).add(roomFrame.pos).normalize();
        placeAtDir(mr.group, planet, dir2, mr.params.groundOffset);
        faceRig(mr, dir2, pl); // face the player
        const spd = mirrorSpeed;
        poseRig(mr, dt, t, spd > 0.6 ? 'walk' : 'idle', Math.min(spd / 8, 1));
      }
    });
    return { group: g };
  }

  /* -------------------------------------------------------------------
   * ZONE 7 — The Garden (the Stranger, the ending)
   * ----------------------------------------------------------------- */
  let sprout = null, endingStarted = false;
  function buildGarden() {
    const g = new THREE.Group();
    // Warm gold light (a light, not gold materials — keeps the two-accent rule).
    const gold = new THREE.PointLight(0xffdcae, 2.4, 110, 2);
    placeAtDir(gold, planet, pathDir(SR.GARDEN, 0), 8);
    group.add(gold); localLights.push(gold);

    // Lambs-ear rosettes — pale oval leaves that read as silver.
    const leaf = keep(new THREE.SphereGeometry(0.22, 5, 4));
    const leafMat = greyMat(SR.GREY_PALE, { rough: 1.0, emis: 0.08 });
    const N = 900;
    const bed = new THREE.InstancedMesh(leaf, leafMat, N);
    bed.frustumCulled = false;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    const dir = new THREE.Vector3(), pos = new THREE.Vector3();
    for (let i = 0; i < N; i++) {
      pathDirInto(SR.GARDEN - 30 + rng() * 90, (rng() - 0.5) * 60, dir);
      pos.copy(dir).multiplyScalar(sampleGround(planet, dir) + 0.1);
      q.setFromUnitVectors(_yAxis, dir);
      s.set(1 + rng(), 0.4 + rng() * 0.3, 1 + rng());
      m.compose(pos, q, s);
      bed.setMatrixAt(i, m);
    }
    bed.instanceMatrix.needsUpdate = true;
    g.add(bed);

    // A bare grey tree with a windowpane leaning against it.
    const trunk = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.4, 0.6, 6, 7)), greyMat(SR.GREY_DARK, { rough: 1.0 }));
    const treeDir = pathDir(SR.GARDEN + 14, 8);
    placeAtDir(trunk, planet, treeDir, 3);
    orientOnSurface(trunk, treeDir, 0);
    g.add(trunk);
    const paneFrame = new THREE.Mesh(keep(new THREE.BoxGeometry(1.6, 2.2, 0.12)), greyMat(SR.GREY_MID, { rough: 0.8 }));
    const pane = new THREE.Mesh(keep(new THREE.PlaneGeometry(1.4, 2.0)), greyMat(SR.GREY_PALE, { rough: 0.1, metal: 0.3, transparent: true, opacity: 0.25 }));
    const paneDir = pathDir(SR.GARDEN + 13, 6.6);
    placeAtDir(paneFrame, planet, paneDir, 1.1);
    orientOnSurface(paneFrame, paneDir, 0.5);
    paneFrame.rotateX(0.18);
    pane.position.copy(paneFrame.position); pane.quaternion.copy(paneFrame.quaternion);
    pane.translateZ(0.08);
    g.add(paneFrame, pane);

    // The Stranger, seated by the windowpane.
    const st = greyRig('stranger', SR.GREY_PALE, { trim: SR.GREY_LIGHT });
    seatRig(st, 0);
    placeRig(st, pathDir(SR.GARDEN, 2), Math.PI);
    g.add(st.group);
    entities.push({
      pos: bodyPosAt(SR.GARDEN, 2),
      rig: st,
      active: () => has('monster_faced') && !endingStarted,
      getPayload: () => ({
        speaker: { name: 'The Stranger', species: '—', cityId: '' },
        lines: TXT.stranger,
        offer: { kind: 'codex', subject: 'The Book of Shadow Work' },
      }),
      onClose: () => startEnding(),
    });

    // The final sprout — the second and last accent color. Hidden until grown.
    const sproutMat = new THREE.MeshStandardMaterial({
      color: SR.SPROUT_GREEN, emissive: new THREE.Color(SR.SPROUT_GREEN), emissiveIntensity: 0.9, roughness: 0.7,
    });
    disposables.push(sproutMat);
    const sproutMesh = new THREE.Mesh(keep(new THREE.ConeGeometry(0.16, 0.5, 5)), sproutMat);
    const sproutDir = pathDir(SR.GARDEN - 2, 0);
    placeAtDir(sproutMesh, planet, sproutDir, 0.25);
    orientOnSurface(sproutMesh, sproutDir, 0);
    sproutMesh.scale.setScalar(0.001);
    sproutMesh.visible = false;
    g.add(sproutMesh);
    sprout = { mesh: sproutMesh, grow: -1 };

    zoneUpdaters.push((t, dt) => {
      if (sprout.grow >= 0 && sprout.grow < 1) {
        sprout.grow = Math.min(1, sprout.grow + dt / 3);
        sproutMesh.scale.setScalar(THREE.MathUtils.lerp(0.001, 1, sprout.grow));
      }
    });
    return { group: g };
  }

  // The garden's closing sequence: sprout → mask removal → dissolve → complete.
  function startEnding() {
    if (endingStarted) return;
    endingStarted = true;
    sprout.mesh.visible = true;
    sprout.grow = 0;
    queueToast(TXT.toastSprout, 4, 0.2);
    schedule(4, () => {
      // The cloaked figure removes the mask (its blue emissive blooms once).
      if (cloakedFigure) {
        cloakedFigure.maskMat.emissiveIntensity = 1.35;
        cloakedFigure.mask.position.z += 0.4 * cloakedFigure.rig.params.scaleY;
      }
      queueToast(TXT.toastMask, 4, 0);
    });
    schedule(8, () => {
      // Dissolve the cloaked figure, a few points tinted mask-blue (the tear).
      const cf = cloakedFigure;
      if (cf) {
        const dir = cf.rig.group.position.clone().normalize();
        makeDissolve(dir, SR.GREY_LIGHT, 240, SR.MASK_BLUE, 0.12);
        cf.rig.group.visible = false;
        removeFollower(cf.rig);
      }
      queueToast(TXT.toastDissolve, 4, 0);
    });
    schedule(9.2, () => {
      advance('mask_removed');
      queueToast(TXT.toastComplete, 6, 0);
    });
  }

  function removeFollower(rig) {
    const i = followers.findIndex((f) => f.rig === rig);
    if (i >= 0) followers.splice(i, 1);
  }

  /* -------------------------------------------------------------------
   * onStage — side effects fired as each flag advances
   * ----------------------------------------------------------------- */
  function onStage(f) {
    if (f === 'river_crossed') {
      if (cloakedFigure) {
        // Detach the cloaked figure from its river spot; it now trails the player.
        addFollower(cloakedFigure.rig, -2.0);
      }
      queueToast(TXT.cloakRiver, 4.5, 0.4);
    } else if (f === 'circle_triggered') {
      if (circleMesh) circleMesh.fade = 0; // begin vanishing
    } else if (f === 'line_broken') {
      girl.state = 'joined';
      addFollower(girl.rig, 2.0);
      lineFadeState.t = 0; // queue + fog fade away
    } else if (f === 'warrior_embraced') {
      const dir = warrior.rig.group.position.clone().normalize();
      makeDissolve(dir, SR.GREY_LIGHT, 200);
      warrior.rig.group.visible = false;
      queueToast(TXT.cloakDesert, 4.5, 0.3);
    } else if (f === 'monster_faced') {
      queueToast(TXT.cloakLine, 4.5, 0.4);
    }
  }

  /* -------------------------------------------------------------------
   * Triggers (proximity, fired once, in order)
   * ----------------------------------------------------------------- */
  const triggers = [
    { dist: SR.RIVER_CROSS, radius: 18, requires: 'flower_given', fired: false,
      fn: () => advance('river_crossed') },
    { dist: SR.CIRCLE, radius: 13, requires: 'river_crossed', fired: false,
      fn: () => {
        // Overheard monologue as a timed toast chain; then the circle vanishes.
        TXT.confession.forEach((line, i) => queueToast(line, 5, i * 5));
        schedule(TXT.confession.length * 5, () => advance('circle_triggered'));
      } },
    { dist: SR.GIRL, radius: 20, requires: 'circle_triggered', fired: false,
      fn: () => { girl.state = 'sprinting'; girl.rig.group.visible = true; } },
  ];

  /* -------------------------------------------------------------------
   * Ambient dream audio (wavemallprime hold-music pattern): a low wind drone
   * plus a faint sarabande motif that swells near the round room.
   * ----------------------------------------------------------------- */
  let audioCtx = null, oscA = null, oscB = null, oscMel = null, gWind = null, gMel = null, lfo = null, lfoGain = null;
  const SARABANDE = [0, 3, 5, 7, 5, 3, 2, 0]; // slow semitone offsets from A2
  let melStep = 0, melClock = 0;
  function initAudio() {
    if (audioCtx) return;
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      gWind = audioCtx.createGain(); gWind.gain.value = 0.015;
      oscA = audioCtx.createOscillator(); oscA.type = 'sine'; oscA.frequency.value = 55;
      oscB = audioCtx.createOscillator(); oscB.type = 'sine'; oscB.frequency.value = 56.5;
      lfo = audioCtx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 0.08;
      lfoGain = audioCtx.createGain(); lfoGain.gain.value = 0.008;
      lfo.connect(lfoGain).connect(gWind.gain);
      oscA.connect(gWind); oscB.connect(gWind); gWind.connect(audioCtx.destination);
      gMel = audioCtx.createGain(); gMel.gain.value = 0.0;
      oscMel = audioCtx.createOscillator(); oscMel.type = 'triangle'; oscMel.frequency.value = 110;
      oscMel.connect(gMel).connect(audioCtx.destination);
      oscA.start(); oscB.start(); lfo.start(); oscMel.start();
      if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
    } catch (e) { audioCtx = null; }
  }
  function updateAudio(dt, playerDist) {
    if (!audioCtx) return;
    // Sarabande swells with proximity to the round room.
    const near = THREE.MathUtils.clamp(1 - Math.abs(playerDist - SR.ROOM) / 140, 0, 1);
    gMel.gain.value += (near * 0.02 - gMel.gain.value) * Math.min(1, 2 * dt);
    if (near > 0.05) {
      melClock += dt;
      if (melClock > 1.4) {
        melClock = 0;
        melStep = (melStep + 1) % SARABANDE.length;
        oscMel.frequency.value = 110 * Math.pow(2, SARABANDE[melStep] / 12);
      }
    }
  }

  /* -------------------------------------------------------------------
   * Build everything
   * ----------------------------------------------------------------- */
  const zoneGroups = [
    buildField(), buildRiver(), buildCircle(), buildLine(),
    buildDesert(), buildRoundRoom(), buildGarden(),
  ];
  for (const z of zoneGroups) group.add(z.group);

  // River gate: a hard invisible wall across the water until the flower is given.
  {
    const f = frameAt(SR.RIVER);
    colliders.push({
      frame: f, r2: 60 ** 2, special: 'wall',
      // In frame-local space: block a wide band in Z (the path direction).
      halfX: 40, z0: -1.2, z1: 1.2, y0: 0, y1: 3.2,
      active: () => !has('flower_given'),
    });
  }

  /* -------------------------------------------------------------------
   * Per-frame update
   * ----------------------------------------------------------------- */
  const _pl = new THREE.Vector3();
  const _prevPl = new THREE.Vector3();
  const _coords = { dist: 0, lateral: 0 };
  const _fdir = new THREE.Vector3();
  const _ftarget = new THREE.Vector3();
  let mirrorSpeed = 0;
  let prevInit = false;

  function update(t, dt, playerPos, sunDot = 1) {
    lastT = t;
    _pl.copy(playerPos);
    if (!prevInit) { _prevPl.copy(_pl); prevInit = true; }
    const playerSpeed = _pl.distanceTo(_prevPl) / Math.max(dt, 1e-4);
    mirrorSpeed = playerSpeed;

    pathCoords(_pl, _coords);

    // Fire due timers.
    for (let i = timers.length - 1; i >= 0; i--) {
      if (t >= timers[i].at) { const fn = timers[i].fn; timers.splice(i, 1); fn(); }
    }

    // Fire proximity triggers (in order, gated on the required flag).
    for (const tr of triggers) {
      if (tr.fired) continue;
      if (tr.requires && !has(tr.requires)) continue;
      if (Math.abs(_coords.dist - tr.dist) < tr.radius && Math.abs(_coords.lateral) < 30) {
        tr.fired = true; tr.fn();
      }
    }

    // Zone hooks (girl motion, fades, mirror, sprout growth).
    for (const zu of zoneUpdaters) zu(t, dt, _pl, sunDot);

    // Companion followers trail behind the player along the path.
    updateFollowers(dt, t);

    // Live dissolves.
    for (let i = dissolves.length - 1; i >= 0; i--) {
      if (!dissolves[i].update(dt)) { dissolves[i].dispose(); dissolves.splice(i, 1); }
    }

    updateAudio(dt, _coords.dist);
    _prevPl.copy(_pl);
  }

  function updateFollowers(dt, t) {
    if (!followers.length) return;
    const targetDist = _coords.dist - SR.FOLLOW_DIST;
    for (const fo of followers) {
      pathDirInto(targetDist, _coords.lateral + fo.slotX, _fdir);
      _ftarget.copy(_fdir).multiplyScalar(sampleGround(planet, _fdir) + fo.rig.params.groundOffset);
      if (!fo.inited) { fo.cur.copy(_ftarget); fo.inited = true; }
      fo.cur.x = THREE.MathUtils.damp(fo.cur.x, _ftarget.x, 3, dt);
      fo.cur.y = THREE.MathUtils.damp(fo.cur.y, _ftarget.y, 3, dt);
      fo.cur.z = THREE.MathUtils.damp(fo.cur.z, _ftarget.z, 3, dt);
      const moving = fo.cur.distanceTo(_ftarget) > 0.4;
      fo.rig.group.position.copy(fo.cur);
      const dir = _fdir.copy(fo.cur).normalize();
      faceRig(fo.rig, dir, _pl);
      poseRig(fo.rig, dt, t, moving ? 'walk' : 'idle', moving ? 0.8 : 0);
    }
  }

  // Orient a rig upright on `dirLocal` and yaw it to face `targetSurface`.
  const _q0 = new THREE.Quaternion(), _q1 = new THREE.Quaternion(), _toL = new THREE.Vector3();
  function faceRig(rig, dirLocal, targetSurface) {
    _q0.setFromUnitVectors(_yAxis, dirLocal);
    _toL.copy(targetSurface).sub(rig.group.position).applyQuaternion(_q1.copy(_q0).invert());
    const yaw = Math.atan2(_toL.x, _toL.z);
    rig.group.quaternion.copy(_q0).multiply(_q1.setFromAxisAngle(_yAxis, yaw));
  }

  /* -------------------------------------------------------------------
   * Collision (walls-only: the whole path is walkable flat terrain, so
   * groundRadiusAt has nothing to raise and returns -1).
   * ----------------------------------------------------------------- */
  const _cl = new THREE.Vector3();
  function resolveCollisions(surfaceLocalPos, playerRadius) {
    let pushed = false;
    for (const c of colliders) {
      if (c.active && !c.active()) continue;
      if (surfaceLocalPos.distanceToSquared(c.frame.pos) > c.r2) continue;
      _cl.copy(surfaceLocalPos).sub(c.frame.pos).applyQuaternion(c.frame.qInv);
      let zonePushed = false;
      if (c.special === 'wall') {
        const feet = _cl.y;
        if (feet < c.y1 && feet + 1.7 > c.y0 &&
            Math.abs(_cl.x) < c.halfX + playerRadius &&
            _cl.z > c.z0 - playerRadius && _cl.z < c.z1 + playerRadius) {
          _cl.z = _cl.z < 0 ? c.z0 - playerRadius : c.z1 + playerRadius;
          zonePushed = true;
        }
      } else if (c.special === 'annulus') {
        const rho = Math.hypot(_cl.x, _cl.z);
        const band0 = c.innerR - playerRadius, band1 = c.innerR + c.wallT + playerRadius;
        if (rho > band0 && rho < band1) {
          const theta = Math.atan2(_cl.x, _cl.z); // 0 → +Z, π → -Z (matches shell)
          if (!c.doorOpen(theta)) {
            const inside = rho < c.innerR;
            const targetRho = inside ? band0 : band1;
            const k = targetRho / (rho || 1e-6);
            _cl.x *= k; _cl.z *= k;
            zonePushed = true;
          }
        }
      }
      if (zonePushed) {
        surfaceLocalPos.copy(_cl).applyQuaternion(c.frame.q).add(c.frame.pos);
        pushed = true;
      }
    }
    return pushed;
  }

  function groundRadiusAt() { return -1; }

  /* -------------------------------------------------------------------
   * Interaction contract (walk.js scanModule / walkInteract)
   * ----------------------------------------------------------------- */
  function nearestInteractable(playerLocal, maxDist = 2.6) {
    let best = null, bestD2 = maxDist * maxDist;
    for (const e of entities) {
      if (e.active && !e.active()) continue;
      const d2 = e.pos.distanceToSquared(playerLocal);
      if (d2 < bestD2) { best = e; bestD2 = d2; }
    }
    return best;
  }
  function interact(entity) {
    entity.talking = true;
    return entity.getPayload();
  }
  function endInteract(entity) {
    entity.talking = false;
    if (entity.onClose) entity.onClose();
  }

  function pendingToast() {
    if (toastQueue.length && toastQueue[0].due <= lastT) {
      const it = toastQueue.shift();
      return { text: it.text, seconds: it.seconds };
    }
    return null;
  }

  function canBoard() { return stage === 0 || has('mask_removed'); }
  function isComplete() { return has('mask_removed'); }
  function debugState() {
    return {
      stage, flags: FLAGS.slice(0, stage), dist: _coords.dist, lateral: _coords.lateral,
      up: [up.x, up.y, up.z], // module's frozen surface-local path anchor (for tests)
    };
  }

  // Landing narration.
  queueToast(TXT.toastLanding, 5, 0.5);

  function dispose() {
    for (const d of dissolves) d.dispose();
    dissolves.length = 0;
    for (const l of localLights) l.parent?.remove(l);
    localLights.length = 0;
    for (const d of disposables) { try { d.dispose(); } catch (e) { /* already gone */ } }
    disposables.length = 0;
    if (audioCtx) {
      try { oscA?.stop(); oscB?.stop(); oscMel?.stop(); lfo?.stop(); } catch (e) { /* noop */ }
      try { audioCtx.close(); } catch (e) { /* noop */ }
      audioCtx = null;
    }
  }

  return {
    group,
    update,
    dispose,
    nearestInteractable,
    interact,
    endInteract,
    resolveCollisions,
    groundRadiusAt,
    pendingToast,
    canBoard,
    isComplete,
    initAudio,
    debugState,
  };
}

/* ----------------------------------------------------------------------
 * Small module-local scratch + utilities
 * ------------------------------------------------------------------- */
const _qScratch = new THREE.Quaternion();
const _q2Scratch = new THREE.Quaternion();

// Angular proximity on a circle (both args in radians).
function angNear(a, b, tol) {
  let d = Math.abs(a - b) % (Math.PI * 2);
  if (d > Math.PI) d = Math.PI * 2 - d;
  return d < tol;
}

// A glowing Archimedean scotch-tape spiral drawn to a canvas (emissive/alpha).
function makeSpiralTexture() {
  const S = 512;
  const cnv = document.createElement('canvas');
  cnv.width = cnv.height = S;
  const ctx = cnv.getContext('2d');
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, S, S);
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  ctx.beginPath();
  const cx = S / 2, cy = S / 2;
  const turns = 5, maxR = S * 0.46;
  let first = true;
  for (let a = 0; a < turns * Math.PI * 2; a += 0.12) {
    const r = (a / (turns * Math.PI * 2)) * maxR;
    // Ragged, hand-torn tape edge.
    const jitter = 1 + Math.sin(a * 7.3) * 0.03;
    const x = cx + Math.cos(a) * r * jitter;
    const y = cy + Math.sin(a) * r * jitter;
    if (first) { ctx.moveTo(x, y); first = false; } else ctx.lineTo(x, y);
  }
  ctx.stroke();
  const tex = new THREE.CanvasTexture(cnv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}
