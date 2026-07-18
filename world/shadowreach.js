/**
 * shadowreach.js
 *
 * Bespoke total-conversion world for "shadowreach" — a landable planet that is
 * a literal walkable map of the dream-journey in *The Book of Shadow Work*.
 * The player does not explore an open biome; they walk one winding path through
 * large, city-district-scale story zones in narrative order: the Meadow & the
 * River (Lady in White), the Confession Circle, the Line (a queue through the
 * desert), the Wasteland (Thinking Stone / Warrior beneath a giant storm), the
 * Round Room (the Monster / mirror-self), and the Garden (the Stranger).
 *
 * This module replaces the stock city / crowd / wonders / creatures stack
 * wholesale (see the name-check early return in src/walk.js). It follows the
 * total-conversion pattern of world/wavemallprime.js.
 *
 * Coordinate assumptions (engine conventions):
 * - Units are meters. Everything is built in planet.surface's UNROTATED local
 *   frame and parented at identity, so planet spin + floating-origin rebasing
 *   carry it along for free, and a surface-local player point equals the
 *   module-local player point (walk.js hands us exactly that).
 * - Local +Y aligns to the radial "up"; quaternion.setFromUnitVectors(yAxis,
 *   dir) then a yaw about that axis orients each prop / figure.
 * - Path distance is atan2-based: only valid on (-piR, piR] = +/-2827 m for
 *   R = 900. The Garden at 2620 is the hard cap — never place past ~2740.
 * - Lighting is external (a single global sun + ambient) plus a few local
 *   lights owned by the zones. Sky mood is per-zone: cfg.skyColor() is read
 *   every frame by the skyfog pass, so this module installs a dynamic closure
 *   that lerps the sky through each zone's color as the player walks (the
 *   original closure is restored in dispose()).
 * - Bloom threshold is 0.85 — the round-room spiral, lightning flashes, and
 *   the finale's blue tear cross it; everything else stays below.
 *
 * Art direction: each zone carries its own vivid palette true to its story
 * moment — bright green meadow with flowing blue water, dusk-amber confession
 * circle, golden desert queue, storm-wracked black wasteland, void-black round
 * room, warm gold garden. The Cloaked Figure's mask-blue and the garden
 * sprout's green remain the story's signature accents.
 *
 * No external assets. Primitives + MeshStandardMaterial (+ MeshBasic for the
 * pure-black round room), CanvasTexture only. Deterministic via mulberry32.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildRig, poseRig } from './aliens.js';

/* ----------------------------------------------------------------------
 * Tunables + palette + authored text — every magic value lives here.
 * ------------------------------------------------------------------- */
const SR = {
  // Signature story accents.
  MASK_BLUE: 0x4a6fa5,
  SPROUT_GREEN: 0x4a7a5a,
  ASH: 0xb4b4b8, // dissolve-puff grey

  // Zone positions along the path (meters of arc from the landing anchor).
  // HARD CAP: pathCoords wraps at +/-2827 m (planet antipode) — keep all
  // placement below ~2740.
  FIELD: 0,          // the Meadow spans 0-400
  LADY: 340,         // riverbank — reachable before the crossing gate
  RIVER: 360,        // water crossing + story gate
  RIVER_FAR: 378,    // far bank (cloaked figure waits here)
  RIVER_CROSS: 400,  // past the water — attaches the companion
  CIRCLE: 700,       // confession circle (footprint ~610-790)
  LINE_START: 1000,  // desert queue corridor 1000-1470
  GIRL: 1400,
  LINE_END: 1470,
  DESERT: 1900,      // the Wasteland eye (storm + Thinking Stone)
  ROOM: 2300,        // round room
  GARDEN: 2620,      // garden (antipode margin ~110 m)

  ROOM_INNER_R: 26,
  ROOM_WALL_T: 1.4,
  ROOM_H: 12,
  ROOM_DOOR_HALF: 0.09, // radians — 0.09 * 26 ~ 2.3 m half-width doorway

  FOLLOW_DIST: 3.0, // meters a companion trails behind the player

  // Per-zone sky keyframes (path dist -> hex). Piecewise-lerped each frame.
  SKY_BANDS: [
    [0, 0x7ec8ff],    // meadow: bright blue
    [520, 0x7ec8ff],
    [700, 0xd8934a],  // confession circle: dusk ochre
    [860, 0xd8934a],
    [1050, 0xf2e3b8], // desert line: harsh pale gold
    [1500, 0xf2e3b8],
    [1750, 0x4a5248], // wasteland: storm green-grey
    [2050, 0x4a5248],
    [2250, 0x23222c], // round room: near-black indigo
    [2400, 0x23222c],
    [2550, 0xd8a86a], // garden: deep warm amber (night side — lamps carry it)
    [2820, 0xd8a86a],
  ],
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
  toastLanding: 'THE MEADOW — WALK TOWARD THE WATER',
  toastSprout: '(A green sprout breaks the dark soil.)',
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
  const swayUniforms = []; // shared {value:t} uniforms for wind-sway materials
  const scrollers = [];    // { map, speed } — scrolling water textures

  // ---- Path basis: one great-circle bearing from the landing anchor. --------
  const up = worldUp.clone().normalize();
  const arbitrary = Math.abs(up.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const tanA = new THREE.Vector3().crossVectors(up, arbitrary).normalize(); // bearing (+dist)
  const tanB = new THREE.Vector3().crossVectors(up, tanA).normalize();      // lateral (+x)

  // Surface-local direction `dist` meters along the bearing, offset `lateral`
  // meters sideways. Small-angle lateral offset is exact enough at these spans.
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
  function stdMat(hex, o = {}) {
    const m = new THREE.MeshStandardMaterial({
      color: hex, roughness: o.rough ?? 0.9, metalness: o.metal ?? 0.0,
    });
    if (o.map) m.map = o.map;
    if (o.emis) { m.emissive = new THREE.Color(o.emisColor ?? hex); m.emissiveIntensity = o.emis; }
    if (o.transparent) { m.transparent = true; m.opacity = o.opacity ?? 1; m.depthWrite = o.depthWrite ?? true; }
    if (o.side) m.side = o.side;
    disposables.push(m);
    return m;
  }
  function keep(geoOrTex) { disposables.push(geoOrTex); return geoOrTex; }

  // De-index (when needed) and merge parts into one BufferGeometry — the
  // wavemallprime addMerged discipline, so mixed indexed/non-indexed parts
  // (cylinders + icosahedra) merge cleanly.
  function mergeParts(geos) {
    const flat = geos.map((g) => {
      if (!g.index) return g;
      const ni = g.toNonIndexed();
      g.dispose();
      return ni;
    });
    const merged = mergeGeometries(flat, false);
    for (const g of flat) g.dispose();
    return merged;
  }

  // Bake a flat vertex color onto a geometry so differently-colored parts can
  // merge into one draw call (material uses vertexColors: true).
  function coloredGeo(geo, hex) {
    const c = new THREE.Color(hex);
    const n = geo.attributes.position.count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
    geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    return geo;
  }

  // Wind-sway material (ported from src/dressing.js createGrass): standard PBR
  // material whose vertices bend in the wind, phase-seeded per instance from
  // the instanceMatrix origin so a whole field never syncs. Only valid on
  // InstancedMesh. Bend grows with height^2 so roots stay planted.
  function makeSwayMaterial(o = {}) {
    const m = new THREE.MeshStandardMaterial({
      color: o.color ?? 0xffffff, roughness: 1.0, metalness: 0.0,
      side: THREE.DoubleSide, vertexColors: o.vertexColors ?? false,
    });
    if (o.emis) { m.emissive = new THREE.Color(o.emisColor ?? 0xffffff); m.emissiveIntensity = o.emis; }
    if (o.transparent) { m.transparent = true; m.opacity = o.opacity ?? 1; }
    const timeUniform = { value: 0 };
    const ax = (o.ampX ?? 0.16).toFixed(3), az = (o.ampZ ?? 0.09).toFixed(3);
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = timeUniform;
      shader.vertexShader = 'uniform float uTime;\n' + shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        {
          vec4 ip = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          float sway = sin(uTime * 1.7 + ip.x * 0.32 + ip.z * 0.41) * 0.6
                     + sin(uTime * 3.3 + ip.x * 0.83 - ip.z * 0.52) * 0.25;
          float bend = transformed.y * transformed.y;
          transformed.x += sway * ${ax} * bend;
          transformed.z += sway * ${az} * bend;
        }`
      );
    };
    disposables.push(m);
    swayUniforms.push(timeUniform);
    return m;
  }

  // A tapered grass blade with a baked root→tip color gradient (dressing.js
  // blade recipe). Used by the meadow and garden with different tints.
  function makeBladeGeo(rootHex, tipHex, w = 0.26, h = 1) {
    const geo = new THREE.PlaneGeometry(w, h, 1, 3);
    geo.translate(0, h / 2, 0);
    const p = geo.attributes.position;
    const root = new THREE.Color(rootHex), tip = new THREE.Color(tipHex), c = new THREE.Color();
    const colors = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i) / h;
      p.setX(i, p.getX(i) * (1 - y * 0.85));
      c.copy(root).lerp(tip, y);
      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return keep(geo);
  }

  // Scatter `count` instances along the path via placeFn(i) ->
  // { d, lat, yaw?, s? (scalar or Vector3), h? (height offset), color? }.
  function scatterInstanced(geo, mat, count, placeFn) {
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    mesh.frustumCulled = false;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1);
    const dir = new THREE.Vector3(), pos = new THREE.Vector3(), col = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const p = placeFn(i);
      pathDirInto(p.d, p.lat, dir);
      pos.copy(dir).multiplyScalar(sampleGround(planet, dir) + (p.h ?? 0));
      q.setFromUnitVectors(_yAxis, dir);
      if (p.yaw) q.multiply(_qScratch.setFromAxisAngle(_yAxis, p.yaw));
      if (typeof p.s === 'number') s.setScalar(p.s);
      else if (p.s) s.copy(p.s);
      else s.setScalar(1);
      m.compose(pos, q, s);
      mesh.setMatrixAt(i, m);
      if (p.color != null) mesh.setColorAt(i, col.setHex(p.color));
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    return mesh;
  }

  // Large colored ground carpet draped onto the sphere (wavemallprime drape:
  // a naive flat disc floats ~d^2/2R at the rim — ~12 m for a 300 m span — so
  // every vertex is pushed to the exact terrain radius). Opaque core disc plus
  // a transparent skirt ring whose radial alphaMap fades into raw terrain.
  function drapeDisc(dist, r, o = {}) {
    const f = frameAt(dist);
    const baseR = f.pos.length();
    const _dw = new THREE.Vector3();
    const groundY = (x, z) => {
      _dw.set(x, 0, z).applyQuaternion(f.q).add(f.pos).normalize();
      const rr = sampleGround(planet, _dw);
      return Math.sqrt(Math.max(rr * rr - (x * x + z * z), 0)) - baseR;
    };
    const drape = (geo, lift) => {
      const p = geo.attributes.position;
      for (let i = 0; i < p.count; i++) p.setY(i, groundY(p.getX(i), p.getZ(i)) + lift);
      geo.computeVertexNormals();
      return geo;
    };
    const holder = new THREE.Group();
    holder.position.copy(f.pos);
    holder.quaternion.copy(f.q);

    const coreGeo = keep(drape(new THREE.RingGeometry(0.01, r * 0.8, 48, 8).rotateX(-Math.PI / 2), o.lift ?? 0.08));
    const core = new THREE.Mesh(coreGeo, stdMat(o.map ? 0xffffff : o.color, { rough: 1.0, map: o.map }));
    core.frustumCulled = false;

    const skirtGeo = keep(drape(new THREE.RingGeometry(r * 0.8, r, 48, 4).rotateX(-Math.PI / 2), (o.lift ?? 0.08) - 0.03));
    const skirtMat = stdMat(o.map ? 0xffffff : o.color, { rough: 1.0, map: o.map, transparent: true, depthWrite: false });
    skirtMat.alphaMap = sharedRadialAlpha();
    const skirt = new THREE.Mesh(skirtGeo, skirtMat);
    skirt.frustumCulled = false;
    skirt.renderOrder = 1;

    holder.add(core, skirt);
    return holder;
  }

  // Shared radial-fade alphaMap for all drape skirts (rings always span
  // 0.8r → r, so one gradient — opaque until 80% of the UV radius — fits all).
  let _radialAlpha = null;
  function sharedRadialAlpha() {
    if (_radialAlpha) return _radialAlpha;
    _radialAlpha = keep(makeCanvasTex(256, (ctx, S) => {
      const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
      g.addColorStop(0, '#fff');
      g.addColorStop(0.8, '#fff');
      g.addColorStop(1, '#000');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, S, S);
    }));
    return _radialAlpha;
  }

  /* -------------------------------------------------------------------
   * Dynamic per-zone sky — cfg.skyColor() is read EVERY FRAME by the
   * skyfog pass (src/game.js), so installing a closure here retints the
   * sky live as the player walks. Restored first thing in dispose().
   * ----------------------------------------------------------------- */
  const _skyCur = new THREE.Color(SR.SKY_BANDS[0][1]);
  const _skyTarget = new THREE.Color();
  const _skyNext = new THREE.Color();
  const origSkyColor = planet.cfg.skyColor;
  planet.cfg.skyColor = () => _skyCur.getHex();
  function updateSky(dt, dist) {
    const bands = SR.SKY_BANDS;
    let i = 0;
    while (i < bands.length - 2 && bands[i + 1][0] <= dist) i++;
    const d0 = bands[i][0];
    const span = Math.max(1, bands[i + 1][0] - d0);
    const k = THREE.MathUtils.smoothstep(THREE.MathUtils.clamp((dist - d0) / span, 0, 1), 0, 1);
    _skyTarget.setHex(bands[i][1]).lerp(_skyNext.setHex(bands[i + 1][1]), k);
    _skyCur.lerp(_skyTarget, Math.min(1, 1.5 * dt));
  }

  /* -------------------------------------------------------------------
   * Named NPC rigs — aliens.js humanoids retinted to the story's palette.
   * ----------------------------------------------------------------- */
  function tintRig(seedKey, skinHex, trimHex) {
    const rig = buildRig(hashSeed('shadowreach:' + seedKey), 'shadowreach');
    rig.materials.skinMat.color.setHex(skinHex);
    rig.materials.skinMat.roughness = 0.95; rig.materials.skinMat.metalness = 0.0;
    rig.materials.clothMat.color.setHex(trimHex);
    rig.materials.clothMat.emissive.setHex(trimHex);
    rig.materials.clothMat.emissiveIntensity = 0.1;
    rig.materials.eyeMat.color.setHex(0xdedee2);
    rig.materials.eyeMat.emissive.setHex(0xb4b4b8);
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
  const colliders = [];  // { frame, special, active?, r2, ... }

  function addFollower(rig, slotX) {
    rig.group.visible = true;
    followers.push({ rig, slotX, cur: new THREE.Vector3(), inited: false });
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
   * ZONE 1 — The Meadow & the River (bright green, flowing blue water)
   * ----------------------------------------------------------------- */
  function buildMeadow() {
    const g = new THREE.Group();

    // Vivid green ground carpets under the grass.
    g.add(drapeDisc(170, 150, { map: keep(makeMottleTexture(0x3fae4a, 0x2d8a38)) }));
    g.add(drapeDisc(370, 60, { map: keep(makeMottleTexture(0x53b856, 0x3fae4a)) }));

    // Swaying grass — dressing.js blade with a rich green gradient. Bright
    // root→tip colors + a warm emissive floor keep backfaces from going black.
    const bladeGeo = makeBladeGeo(0x2f8a3a, 0xa2e455, 0.3);
    const grassMat = makeSwayMaterial({ vertexColors: true, emis: 0.16, emisColor: 0x4fae52 });
    const grass = scatterInstanced(bladeGeo, grassMat, 12000, () => ({
      d: rng() * (SR.RIVER - 8),
      lat: (rng() - 0.5) * 120,
      yaw: rng() * Math.PI,
      s: 0.5 + rng() * 0.6,
    }));
    g.add(grass);

    // Wildflowers: stem + head merged, two species.
    const flowerGeo = (headHex) => keep(mergeParts([
      coloredGeo(new THREE.CylinderGeometry(0.02, 0.03, 0.5, 4).translate(0, 0.25, 0), 0x2d7a34),
      coloredGeo(new THREE.IcosahedronGeometry(0.13, 0).translate(0, 0.58, 0), headHex),
    ]));
    const flowerMatA = makeSwayMaterial({ vertexColors: true, ampX: 0.06, ampZ: 0.04, emis: 0.12 });
    const flowerMatB = makeSwayMaterial({ vertexColors: true, ampX: 0.06, ampZ: 0.04, emis: 0.12 });
    g.add(scatterInstanced(flowerGeo(0xf5f0d8), flowerMatA, 1200, () => ({
      d: rng() * (SR.RIVER - 12), lat: (rng() - 0.5) * 140, yaw: rng() * Math.PI, s: 0.8 + rng() * 0.7,
    })));
    g.add(scatterInstanced(flowerGeo(0x5a8fd8), flowerMatB, 800, () => ({
      d: rng() * (SR.RIVER - 12), lat: (rng() - 0.5) * 140, yaw: rng() * Math.PI, s: 0.8 + rng() * 0.7,
    })));

    // White-blossom trees ringing the meadow.
    const treeGeo = keep(mergeParts([
      coloredGeo(new THREE.CylinderGeometry(0.25, 0.45, 3.4, 6).translate(0, 1.7, 0), 0x6b4a36),
      coloredGeo(new THREE.IcosahedronGeometry(1.6, 1).translate(0, 4.2, 0), 0xf7e4ee),
      coloredGeo(new THREE.IcosahedronGeometry(1.2, 1).translate(1.1, 3.6, 0.3), 0xfdf3f8),
      coloredGeo(new THREE.IcosahedronGeometry(1.1, 1).translate(-1.0, 3.7, -0.4), 0xf3d9e6),
    ]));
    const treeMat = stdMat(0xffffff, { rough: 0.95, emis: 0.06 });
    treeMat.vertexColors = true;
    g.add(scatterInstanced(treeGeo, treeMat, 28, () => {
      const nearRiver = rng() < 0.35;
      return {
        d: nearRiver ? 250 + rng() * 200 : rng() * 300,
        lat: (rng() < 0.5 ? -1 : 1) * (45 + rng() * 90),
        yaw: rng() * Math.PI * 2,
        s: 0.8 + rng() * 0.9,
      };
    }));

    // The winding blue river: a draped ribbon crossing the path at SR.RIVER,
    // with a scrolling streak texture for flow.
    g.add(buildRiverRibbon());

    // Worn path strip pointing at the water.
    const strip = new THREE.Mesh(keep(new THREE.PlaneGeometry(2.6, SR.RIVER - 20)), stdMat(0x8a6f4d, { rough: 1.0 }));
    const f = frameAt((SR.RIVER - 20) / 2);
    strip.position.copy(f.pos).addScaledVector(f.dir, 0.14);
    strip.quaternion.copy(f.q).multiply(_qScratch.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2));
    strip.renderOrder = 1;
    g.add(strip);

    // Stepping stones across the crossing (visual — the ground is walkable).
    const stoneGeo = keep(new THREE.CylinderGeometry(1.0, 1.1, 0.5, 7));
    const stoneMat = stdMat(0x8f857a, { rough: 1.0 });
    for (let i = -3; i <= 3; i++) {
      const st = new THREE.Mesh(stoneGeo, stoneMat);
      const dir = pathDir(SR.RIVER + i * 3.2, (i % 2) * 0.6);
      placeAtDir(st, planet, dir, 0.15);
      orientOnSurface(st, dir, 0);
      g.add(st);
    }

    // The Lady in White, seated at the near bank with a single flower.
    const lady = tintRig('lady', 0xf2f2f4, 0xdedee2);
    seatRig(lady, 0);
    placeRig(lady, pathDir(SR.LADY, 4), Math.PI); // faces the arriving player
    g.add(lady.group);
    const flowerMat = stdMat(0xfff4f8, { emis: 0.25 });
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

  // River centerline in path coords: enters the meadow at lateral +95, crosses
  // the walking path exactly at SR.RIVER (u = 0.5), exits at -95.
  function riverCenter(u, out) {
    const d = SR.RIVER - 200 + u * 400;
    const lat = 95 * Math.cos(Math.PI * u) + 14 * Math.sin(2 * Math.PI * u);
    return pathDirInto(d, lat, out);
  }
  function buildRiverRibbon() {
    const N = 140, HALF = 9;
    const positions = new Float32Array((N + 1) * 2 * 3);
    const uvs = new Float32Array((N + 1) * 2 * 2);
    const indices = [];
    const c = new THREE.Vector3(), cA = new THREE.Vector3(), cB = new THREE.Vector3();
    const t = new THREE.Vector3(), w = new THREE.Vector3(), e = new THREE.Vector3();
    for (let i = 0; i <= N; i++) {
      const u = i / N;
      riverCenter(u, c).multiplyScalar(sampleGround(planet, c) + 0.2);
      riverCenter(Math.min(1, u + 0.005), cA);
      riverCenter(Math.max(0, u - 0.005), cB);
      t.subVectors(cA, cB).normalize();
      w.crossVectors(c, t).normalize(); // c (radial) x tangent = width dir
      for (const side of [-1, 1]) {
        e.copy(c).addScaledVector(w, side * HALF).normalize();
        e.multiplyScalar(sampleGround(planet, e) + 0.2);
        const vi = (i * 2 + (side + 1) / 2) * 3;
        positions[vi] = e.x; positions[vi + 1] = e.y; positions[vi + 2] = e.z;
        const ui = (i * 2 + (side + 1) / 2) * 2;
        uvs[ui] = u * 26; uvs[ui + 1] = (side + 1) / 2;
      }
      if (i < N) {
        const a = i * 2, b = i * 2 + 1, cc = i * 2 + 2, dd = i * 2 + 3;
        indices.push(a, b, cc, b, dd, cc);
      }
    }
    const geo = keep(new THREE.BufferGeometry());
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    const waterTex = keep(makeWaterTexture());
    // Strong blue emissive floor so the water reads saturated blue even at
    // grazing angles (a river seen on foot is almost always edge-on).
    // DoubleSide: the ribbon's winding depends on the flow direction, so don't
    // gamble on which way the face normals land.
    const waterMat = stdMat(0xffffff, {
      rough: 0.12, metal: 0.2, map: waterTex, emis: 0.3, emisColor: 0x2470e8,
      side: THREE.DoubleSide,
    });
    scrollers.push({ map: waterTex, speed: 0.07 });
    const mesh = new THREE.Mesh(geo, waterMat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 2;
    return mesh;
  }

  // The guarded companion: a dark rig under a cone cloak with a mask-blue plate.
  let cloakedFigure = null;
  function buildCloakedFigure() {
    const rig = tintRig('cloak', 0x2a2a30, 0x1c1c1e);
    const sc = rig.params.scaleY;
    const cloakGeo = keep(new THREE.ConeGeometry(0.55 * sc, 1.6 * sc, 10, 1, true));
    const cloakMat = stdMat(0x1c1c1e, { rough: 1.0, emis: 0.05, side: THREE.DoubleSide });
    const cloakMesh = new THREE.Mesh(cloakGeo, cloakMat);
    cloakMesh.position.y = 1.05 * sc;
    rig.group.add(cloakMesh);
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
   * ZONE 2 — The Confession Circle (dusk clearing, standing stones)
   * ----------------------------------------------------------------- */
  let circleMesh = null;
  function buildCircle() {
    const g = new THREE.Group();

    // Dry amber clearing.
    g.add(drapeDisc(SR.CIRCLE, 85, { map: keep(makeMottleTexture(0x9a6a3c, 0x7d5430)) }));

    // Ring of dark standing stones around the huddle.
    const stoneParts = [];
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      const h = 4 + rng() * 3;
      const geo = new THREE.CylinderGeometry(0.5 + rng() * 0.3, 0.9 + rng() * 0.4, h, 5);
      geo.translate(Math.sin(a) * 28, h / 2, Math.cos(a) * 28);
      geo.rotateY(rng() * Math.PI);
      stoneParts.push(geo);
    }
    const stonesGeo = keep(mergeParts(stoneParts));
    const stones = new THREE.Mesh(stonesGeo, stdMat(0x2b2b30, { rough: 1.0 }));
    stones.frustumCulled = false;
    const cf = frameAt(SR.CIRCLE);
    stones.position.copy(cf.pos);
    stones.quaternion.copy(cf.q);
    g.add(stones);

    // Dead trees scattered beyond the stones.
    g.add(scatterInstanced(deadTreeGeo(), stdMat(0x3a3028, { rough: 1.0 }), 10, () => ({
      d: SR.CIRCLE - 70 + rng() * 140,
      lat: (rng() < 0.5 ? -1 : 1) * (40 + rng() * 35),
      yaw: rng() * Math.PI * 2,
      s: 0.8 + rng() * 0.8,
    })));

    // The huddled crowd — two rings of dusty-umber hooded figures facing in.
    const fig = keep(mergeParts([
      new THREE.ConeGeometry(0.34, 1.5, 6).translate(0, 0.75, 0),
      new THREE.SphereGeometry(0.19, 6, 5).translate(0, 1.6, 0),
    ]));
    const mat = stdMat(0x8a6f52, { rough: 1.0, emis: 0.12 });
    mat.transparent = true;
    const N = 60;
    const crowd = new THREE.InstancedMesh(fig, mat, N);
    crowd.frustumCulled = false;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1);
    const dir = new THREE.Vector3(), pos = new THREE.Vector3();
    for (let i = 0; i < N; i++) {
      const ring = i < 24 ? 0 : 1;
      const a = ((i % (ring ? 36 : 24)) / (ring ? 36 : 24)) * Math.PI * 2 + ring * 0.09;
      const rr = ring ? 18 + rng() * 4 : 12 + rng() * 3;
      pathDirInto(SR.CIRCLE + Math.sin(a) * rr, Math.cos(a) * rr, dir);
      pos.copy(dir).multiplyScalar(sampleGround(planet, dir) + 0.1);
      q.setFromUnitVectors(_yAxis, dir);
      q.multiply(_qScratch.setFromAxisAngle(_yAxis, -a + Math.PI / 2)); // face circle center
      s.setScalar(0.9 + rng() * 0.3);
      m.compose(pos, q, s);
      crowd.setMatrixAt(i, m);
    }
    crowd.instanceMatrix.needsUpdate = true;
    g.add(crowd);
    circleMesh = { mesh: crowd, mat, fade: -1 };

    // Low amber dusk glow over the clearing.
    const dusk = new THREE.PointLight(0xffb060, 3.5, 100, 2);
    placeAtDir(dusk, planet, pathDir(SR.CIRCLE, 0), 10);
    g.add(dusk);

    zoneUpdaters.push((t, dt) => {
      if (circleMesh.fade >= 0) {
        circleMesh.fade += dt;
        mat.opacity = Math.max(0, 1 - circleMesh.fade / 2);
        if (circleMesh.fade > 2) { crowd.visible = false; circleMesh.fade = -2; }
      }
    });
    return { group: g };
  }

  // A bare branched dead tree (shared by the circle and the wasteland).
  let _deadTreeGeo = null;
  function deadTreeGeo() {
    if (_deadTreeGeo) return _deadTreeGeo;
    const parts = [new THREE.CylinderGeometry(0.18, 0.34, 4.2, 5).translate(0, 2.1, 0)];
    for (let i = 0; i < 4; i++) {
      const b = new THREE.CylinderGeometry(0.05, 0.12, 2.2, 4);
      b.translate(0, 1.1, 0);
      b.rotateZ(0.5 + rng() * 0.7);
      b.rotateY((i / 4) * Math.PI * 2 + rng());
      b.translate(0, 2.6 + rng() * 1.2, 0);
      parts.push(b);
    }
    _deadTreeGeo = keep(mergeParts(parts));
    return _deadTreeGeo;
  }

  /* -------------------------------------------------------------------
   * ZONE 3 — The Line (a queue of people through golden desert)
   * ----------------------------------------------------------------- */
  let girl = null;
  function buildLine() {
    const g = new THREE.Group();

    // Golden sand carpets along the corridor.
    const sandTex = keep(makeMottleTexture(0xd9b25f, 0xc39c4e));
    g.add(drapeDisc(1080, 120, { map: sandTex }));
    g.add(drapeDisc(1260, 120, { map: sandTex }));
    g.add(drapeDisc(1440, 120, { map: sandTex }));

    // Dune mounds flanking the corridor.
    const duneGeo = keep(new THREE.SphereGeometry(1, 12, 8));
    g.add(scatterInstanced(duneGeo, stdMat(0xd9b25f, { rough: 1.0 }), 40, () => {
      const sc = 12 + rng() * 26;
      const ySc = sc * (0.3 + rng() * 0.2);
      // Bury only the rim (the flattened sphere's half-height is ~0.3-0.5 sc,
      // so sinking more than that hides the dune entirely).
      return {
        d: SR.LINE_START - 80 + rng() * 700,
        lat: (rng() < 0.5 ? -1 : 1) * (45 + rng() * 100),
        h: -ySc * 0.45,
        s: new THREE.Vector3(sc, ySc, sc),
      };
    }));

    // The queue: ~120 sun-bleached figures winding through the dunes in a
    // serpentine, receding far past where the girl breaks the scene.
    const queueLat = (d) => 40 * Math.sin(((d - SR.LINE_START) / 650) * 3 * Math.PI);
    const fig = keep(mergeParts([
      new THREE.CapsuleGeometry(0.22, 1.0, 3, 6).translate(0, 0.85, 0),
      new THREE.SphereGeometry(0.18, 6, 5).translate(0, 1.65, 0),
    ]));
    const qMat = stdMat(0xffffff, { rough: 1.0, emis: 0.05, emisColor: 0xcbb391 });
    qMat.transparent = true;
    const QN = 120;
    const tanShades = [0xcbb391, 0xdcc9a8, 0xe8dcc4, 0xbfa27e];
    const queue = scatterInstanced(fig, qMat, QN, (i) => {
      const d = SR.LINE_START + (i / QN) * 650; // 1000 → 1650, past the break
      return {
        d,
        lat: queueLat(d) + (rng() - 0.5) * 1.2,
        yaw: rng() * 0.4 - 0.2,
        s: 0.92 + rng() * 0.16,
        h: 0.02,
        color: tanShades[Math.floor(rng() * tanShades.length)],
      };
    });
    g.add(queue);

    // Rope posts + sagging ropes marking the queue lane (merged buckets).
    const postParts = [], ropeParts = [];
    const prev = new THREE.Vector3(), cur = new THREE.Vector3();
    let prevSet = false;
    const cf2 = frameAt((SR.LINE_START + SR.LINE_END) / 2);
    const invQ = cf2.qInv;
    for (let d = SR.LINE_START; d <= SR.LINE_START + 640; d += 12) {
      const dir = pathDir(d, queueLat(d) + 2.4);
      cur.copy(dir).multiplyScalar(sampleGround(planet, dir));
      // Frame-local coordinates so one merged mesh carries the whole run.
      const local = cur.clone().sub(cf2.pos).applyQuaternion(invQ);
      const post = new THREE.CylinderGeometry(0.05, 0.07, 1.2, 5);
      post.translate(local.x, local.y + 0.6, local.z);
      postParts.push(post);
      const knob = new THREE.SphereGeometry(0.09, 5, 4);
      knob.translate(local.x, local.y + 1.25, local.z);
      postParts.push(knob);
      if (prevSet) {
        const pl = prev.clone().sub(cf2.pos).applyQuaternion(invQ);
        const mid = pl.clone().add(local).multiplyScalar(0.5);
        const span = pl.distanceTo(local);
        const rope = new THREE.CylinderGeometry(0.022, 0.022, span, 4);
        rope.rotateZ(Math.PI / 2);
        const yaw = Math.atan2(local.z - pl.z, local.x - pl.x);
        rope.rotateY(-yaw);
        rope.translate(mid.x, mid.y + 1.08, mid.z); // slight sag below knobs
        ropeParts.push(rope);
      }
      prev.copy(cur);
      prevSet = true;
    }
    const postMesh = new THREE.Mesh(keep(mergeParts(postParts)), stdMat(0x8a7050, { rough: 1.0 }));
    const ropeMesh = new THREE.Mesh(keep(mergeParts(ropeParts)), stdMat(0xc9b184, { rough: 1.0 }));
    postMesh.frustumCulled = false; ropeMesh.frustumCulled = false;
    postMesh.position.copy(cf2.pos); postMesh.quaternion.copy(cf2.q);
    ropeMesh.position.copy(cf2.pos); ropeMesh.quaternion.copy(cf2.q);
    g.add(postMesh, ropeMesh);

    // Tattered banners fluttering above the queue.
    const bannerGeo = keep(coloredGeo(new THREE.PlaneGeometry(1.1, 0.7, 1, 3).translate(0, -0.35, 0), 0xffffff));
    const bannerMat = makeSwayMaterial({ color: 0xffffff, ampX: 0.45, ampZ: 0.3, transparent: true });
    const bannerShades = [0xb85a4a, 0xd8cba8, 0x9a6a3c, 0xe0d6c0];
    const banners = scatterInstanced(bannerGeo, bannerMat, 10, (i) => {
      const d = SR.LINE_START + 40 + i * 60;
      return {
        d, lat: queueLat(d) + 2.4, h: 2.4, yaw: rng() * Math.PI,
        s: 0.8 + rng() * 0.5, color: bannerShades[i % bannerShades.length],
      };
    });
    g.add(banners);

    // Mica shimmer far ahead — warm emissive shards just over the bloom line.
    const micaMat = new THREE.MeshStandardMaterial({
      color: 0xfff2d8, emissive: new THREE.Color(0xfff2d8), emissiveIntensity: 1.0,
    });
    disposables.push(micaMat);
    const mica = scatterInstanced(keep(new THREE.OctahedronGeometry(0.12, 0)), micaMat, 40, () => ({
      d: SR.LINE_END + 60 + rng() * 160,
      lat: (rng() - 0.5) * 60,
      h: 0.5 + rng() * 3,
      s: 0.6 + rng() * 0.8,
    }));
    g.add(mica);

    // The Girl: hidden until she sprints in and breaks the scene.
    const gr = tintRig('girl', 0xd8b48f, 0x9a7350);
    gr.group.visible = false;
    g.add(gr.group);
    girl = { rig: gr, state: 'hidden', dist: SR.GIRL + 34, lateral: 0 };
    const girlEnt = {
      pos: new THREE.Vector3(), // updated live while she runs / waits
      rig: gr,
      active: () => girl.state === 'ready',
      getPayload: () => ({ speaker: { name: 'The Girl', species: '—', cityId: '' }, lines: TXT.girl }),
      onClose: () => advance('line_broken'),
      _live: true,
    };
    entities.push(girlEnt);
    girl._ent = girlEnt;

    // Girl motion + the line vanishing after the break.
    let fadeT = -1;
    zoneUpdaters.push((t, dt) => {
      if (girl.state === 'sprinting') {
        girl.dist += (SR.GIRL - girl.dist) * Math.min(1, 6 * dt);
        const dir2 = pathDir(girl.dist, girl.lateral);
        placeRig(gr, dir2, 0);
        poseRig(gr, dt, t, 'walk', 1);
        if (Math.abs(girl.dist - SR.GIRL) < 1.2) girl.state = 'ready';
        girlEnt.pos.copy(bodyPosAt(girl.dist, girl.lateral));
      } else if (girl.state === 'ready') {
        poseRig(gr, dt, t, 'idle', 0);
      }
      if (lineFadeRequested && fadeT < 0) fadeT = 0;
      if (fadeT >= 0) {
        fadeT += dt;
        const o = Math.max(0, 1 - fadeT / 2.5);
        qMat.opacity = o;
        bannerMat.opacity = o;
        micaMat.emissiveIntensity = 1.0 * o;
        if (fadeT > 2.5) {
          queue.visible = false; mica.visible = false; banners.visible = false;
          fadeT = Infinity;
        }
      }
    });
    return { group: g };
  }
  let lineFadeRequested = false;

  /* -------------------------------------------------------------------
   * ZONE 4 — The Wasteland (cracked black earth, giant storm, lightning)
   * ----------------------------------------------------------------- */
  let warrior = null;
  function buildWasteland() {
    const g = new THREE.Group();

    // Cracked near-black earth.
    g.add(drapeDisc(SR.DESERT, 150, { map: keep(makeCrackTexture()) }));

    // Dead black trees and ash-grey rock scatter.
    g.add(scatterInstanced(deadTreeGeo(), stdMat(0x141210, { rough: 1.0 }), 40, () => ({
      d: SR.DESERT - 130 + rng() * 260,
      lat: (rng() - 0.5) * 240,
      yaw: rng() * Math.PI * 2,
      s: 0.7 + rng() * 1.1,
    })));
    g.add(scatterInstanced(keep(new THREE.DodecahedronGeometry(0.3, 0)), stdMat(0x4a4644, { rough: 1.0 }), 150, () => ({
      d: SR.DESERT - 120 + rng() * 240,
      lat: (rng() - 0.5) * 220,
      h: 0.05,
      yaw: rng() * Math.PI,
      s: 0.5 + rng() * 1.6,
    })));

    // ---- The storm: three counter-layered swirl discs + hanging fringe. ----
    const eyeDir = pathDir(SR.DESERT, 0);
    const stormHolder = new THREE.Group();
    placeAtDir(stormHolder, planet, eyeDir, 0);
    orientOnSurface(stormHolder, eyeDir, 0);
    const swirlTex = keep(makeSwirlTexture());
    const DISCS = [
      { r: 240, h: 90, op: 0.5, tint: 0x3a3f38, speed: 0.03 },
      { r: 190, h: 80, op: 0.65, tint: 0x2a2e28, speed: -0.05 },
      { r: 140, h: 70, op: 0.8, tint: 0x1c1e1a, speed: 0.08 },
    ];
    const discMeshes = [];
    for (const d of DISCS) {
      const mat = new THREE.MeshBasicMaterial({
        color: d.tint, map: swirlTex, alphaMap: swirlTex,
        transparent: true, opacity: d.op, depthWrite: false, side: THREE.DoubleSide,
      });
      disposables.push(mat);
      const disc = new THREE.Mesh(keep(new THREE.CircleGeometry(d.r, 48).rotateX(-Math.PI / 2)), mat);
      disc.position.y = d.h;
      disc.renderOrder = 3;
      disc.frustumCulled = false;
      stormHolder.add(disc);
      discMeshes.push({ mesh: disc, speed: d.speed });
    }
    // Hanging cloud fringe under the outer rim.
    const fringeMat = stdMat(0x23261f, { rough: 1.0, transparent: true, opacity: 0.85, depthWrite: false });
    const fringeGeo = keep(new THREE.SphereGeometry(1, 8, 6));
    const fringe = new THREE.InstancedMesh(fringeGeo, fringeMat, 30);
    fringe.frustumCulled = false;
    {
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3();
      for (let i = 0; i < 30; i++) {
        const a = rng() * Math.PI * 2, rr = 120 + rng() * 80;
        const sc = 14 + rng() * 18;
        s.set(sc, sc * 0.35, sc);
        m.compose(new THREE.Vector3(Math.cos(a) * rr, 55 + rng() * 15, Math.sin(a) * rr), q.identity(), s);
        fringe.setMatrixAt(i, m);
      }
      fringe.instanceMatrix.needsUpdate = true;
    }
    fringe.renderOrder = 3;
    stormHolder.add(fringe);

    // Lightning bolts: jagged Lines flashing via the creatures.js spike curve,
    // the brightest one driving a single shared ground-flash light.
    const bolts = [];
    for (let i = 0; i < 8; i++) {
      const a = rng() * Math.PI * 2, rr = 20 + rng() * 100;
      const bx = Math.cos(a) * rr, bz = Math.sin(a) * rr;
      const segs = 6 + Math.floor(rng() * 3);
      const pts = [];
      for (let s2 = 0; s2 <= segs; s2++) {
        const f2 = s2 / segs;
        pts.push(new THREE.Vector3(
          bx + (rng() - 0.5) * 14 * (0.4 + f2 * 0.8),
          66 * (1 - f2),
          bz + (rng() - 0.5) * 14 * (0.4 + f2 * 0.8)
        ));
      }
      const gLine = keep(new THREE.BufferGeometry().setFromPoints(pts));
      const mLine = new THREE.LineBasicMaterial({ color: 0xcfe4ff, transparent: true, opacity: 0 });
      disposables.push(mLine);
      const line = new THREE.Line(gLine, mLine);
      line.frustumCulled = false;
      stormHolder.add(line);
      bolts.push({ mat: mLine, phase: rng() * Math.PI * 2, speed: 2.2 + rng() * 1.6, mid: new THREE.Vector3(bx, 30, bz) });
    }
    const stormLight = new THREE.PointLight(0xdce8ff, 0, 140, 2);
    stormHolder.add(stormLight);
    g.add(stormHolder);

    zoneUpdaters.push((t, dt) => {
      for (const d of discMeshes) d.mesh.rotation.y += dt * d.speed;
      let best = 0, bestBolt = null;
      for (const b of bolts) {
        const flash = Math.min(1, Math.max(0, Math.sin(t * b.speed + b.phase) - 0.93) * 14);
        b.mat.opacity = flash;
        if (flash > best) { best = flash; bestBolt = b; }
      }
      stormLight.intensity = best * 25;
      if (bestBolt) stormLight.position.copy(bestBolt.mid);
    });

    // The Thinking Stone at the eye of the storm, with a dim warm keeper light
    // so the Warrior reads under the dark sky.
    const stone = new THREE.Mesh(keep(new THREE.CylinderGeometry(1.3, 1.5, 1.0, 9)), stdMat(0xcac0ae, { rough: 1.0 }));
    const stoneDir = pathDir(SR.DESERT, 0);
    placeAtDir(stone, planet, stoneDir, 0.5);
    orientOnSurface(stone, stoneDir, 0);
    g.add(stone);
    const eyeLight = new THREE.PointLight(0xffd9a8, 2.5, 50, 2);
    placeAtDir(eyeLight, planet, stoneDir, 5);
    g.add(eyeLight);

    const wr = tintRig('warrior', 0x5a4636, 0x2e241c);
    seatRig(wr, 0.6);
    placeRig(wr, pathDir(SR.DESERT, 0), Math.PI);
    g.add(wr.group);
    warrior = { rig: wr, talkedOnce: false };

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
   * ZONE 5 — The Round Room (the Monster / mirror-self)
   * ----------------------------------------------------------------- */
  let roomFrame = null, roomCenterDir = null, mirror = null;
  function buildRoundRoom() {
    const g = new THREE.Group();
    roomFrame = frameAt(SR.ROOM);
    roomCenterDir = roomFrame.dir.clone();
    const innerR = SR.ROOM_INNER_R, wallT = SR.ROOM_WALL_T, H = SR.ROOM_H;

    // Dark approach apron blending the wasteland into the void.
    g.add(drapeDisc(SR.ROOM, 60, { color: 0x17161a }));

    // Pure-black shell: MeshBasic ignores all scene light, so the interior is
    // genuinely black under a daylight sun. Ring segments leave doorway gaps
    // at the entrance (theta=0, wasteland side) and exit (theta=pi, garden).
    const blackMat = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide });
    disposables.push(blackMat);
    const segGeos = [];
    const N = 64;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      if (angNear(a, 0, SR.ROOM_DOOR_HALF + 0.03) || angNear(a, Math.PI, SR.ROOM_DOOR_HALF + 0.03)) continue;
      const seg = new THREE.BoxGeometry((2 * Math.PI * innerR / N) * 1.15, H, wallT);
      seg.rotateY(-a);
      seg.translate(Math.sin(a) * innerR, H / 2, Math.cos(a) * innerR);
      segGeos.push(seg);
    }
    // Monumental exterior: eight leaning fins + a crown spike, same black.
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + 0.35;
      if (angNear(a, 0, 0.3) || angNear(a, Math.PI, 0.3)) continue; // clear the doorways
      const fin = new THREE.BoxGeometry(2.6, 42, 5);
      fin.rotateZ(0.16);
      fin.rotateY(-a);
      fin.translate(Math.sin(a) * (innerR + 4), 19, Math.cos(a) * (innerR + 4));
      segGeos.push(fin);
    }
    const spike = new THREE.CylinderGeometry(0.6, 3.2, 55, 6);
    spike.translate(0, H + 26, 0);
    segGeos.push(spike);

    const shell = new THREE.Mesh(keep(mergeParts(segGeos)), blackMat);
    shell.frustumCulled = false;
    const floor = new THREE.Mesh(keep(new THREE.CircleGeometry(innerR + wallT, 48)), blackMat);
    floor.rotation.x = -Math.PI / 2; floor.position.y = 0.02;
    const roof = new THREE.Mesh(keep(new THREE.CircleGeometry(innerR + wallT, 48)), blackMat);
    roof.rotation.x = Math.PI / 2; roof.position.y = H;
    const shellHolder = new THREE.Group();
    shellHolder.position.copy(roomFrame.pos);
    shellHolder.quaternion.copy(roomFrame.q);
    shellHolder.add(shell, floor, roof);

    // Glowing scotch-tape spiral on the floor (emissive → blooms). At the v2
    // room scale the spiral must stay a thin line, not a floor-lamp — keep the
    // intensity just over the 0.85 bloom threshold.
    const spiralTex = keep(makeSpiralTexture(6));
    const spiralMat = new THREE.MeshStandardMaterial({
      color: 0x000000, emissive: 0xffffff, emissiveMap: spiralTex, emissiveIntensity: 0.95,
      transparent: true, alphaMap: spiralTex, depthWrite: false,
    });
    disposables.push(spiralMat);
    const spiral = new THREE.Mesh(keep(new THREE.CircleGeometry(innerR - 6, 56)), spiralMat);
    spiral.rotation.x = -Math.PI / 2; spiral.position.y = 0.06;
    spiral.renderOrder = 4;
    shellHolder.add(spiral);
    g.add(shellHolder);

    // Single hard overhead light + a faint visible shaft.
    const light = new THREE.PointLight(0xffffff, 3.5, 40, 2);
    placeAtDir(light, planet, roomCenterDir, H - 0.5);
    g.add(light);
    const coneMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.03, depthWrite: false, side: THREE.DoubleSide });
    disposables.push(coneMat);
    const cone = new THREE.Mesh(keep(new THREE.ConeGeometry(5.5, H - 2, 16, 1, true)), coneMat);
    cone.position.copy(roomFrame.pos).addScaledVector(roomCenterDir, (H - 2) / 2 + 1);
    orientOnSurface(cone, roomCenterDir, 0);
    cone.renderOrder = 4;
    g.add(cone);

    // The mirror-self: begins matte black, resolves as you approach.
    const mr = tintRig('mirror', 0x050505, 0x050505);
    mr.materials.skinMat.emissive = new THREE.Color(0x000000);
    placeRig(mr, roomCenterDir, 0); // faces the entrance, where the player enters
    g.add(mr.group);
    mirror = { rig: mr, reveal: 0 };

    entities.push({
      pos: bodyPosAt(SR.ROOM, 0),
      rig: mr,
      active: () => has('warrior_embraced') && !has('monster_faced'),
      getPayload: () => ({ speaker: { name: 'The Monster', species: '—', cityId: '' }, lines: TXT.mirror }),
      onClose: () => advance('monster_faced'),
    });

    // Round-room collision: an annulus with two doorway sectors. frameAt yaws
    // +Z toward the anchor, so the entrance (wasteland side, lower path dist)
    // sits at theta = 0 and stays open; the exit (garden side) at theta = pi
    // stays sealed until the monster is faced.
    colliders.push({
      frame: roomFrame, r2: (innerR + 10) ** 2, special: 'annulus',
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
        const target = THREE.MathUtils.clamp(1 - (d - 3) / 16, 0, 1);
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
   * ZONE 6 — The Garden (lush gold-lit paradise, the ending)
   * ----------------------------------------------------------------- */
  let sprout = null, endingStarted = false;
  function buildGarden() {
    const g = new THREE.Group();

    // Deep green garden floor. Scatter is biased -120..+100 in dist to keep an
    // antipode margin (hard cap ~2740).
    g.add(drapeDisc(SR.GARDEN, 110, { map: keep(makeMottleTexture(0x2f7a3a, 0x246330)) }));

    // Golden-hour light over the whole garden. The garden sits past the
    // terminator (night side) — the story's "warm gold light" radiates from
    // the garden itself: two strong warm lights + emissive-lifted planting.
    const gold = new THREE.PointLight(0xffdcae, 7.0, 220, 2);
    placeAtDir(gold, planet, pathDir(SR.GARDEN, 0), 12);
    g.add(gold);
    const goldApproach = new THREE.PointLight(0xffcf90, 3.5, 110, 2);
    placeAtDir(goldApproach, planet, pathDir(SR.GARDEN - 70, 0), 8);
    g.add(goldApproach);
    const goldFar = new THREE.PointLight(0xffcf90, 3.0, 110, 2);
    placeAtDir(goldFar, planet, pathDir(SR.GARDEN + 55, 20), 8);
    g.add(goldFar);

    // Deep green swaying grass with a warm emissive floor for the night side.
    const bladeGeo = makeBladeGeo(0x2a7a34, 0x7cc85e, 0.3);
    const grassMat = makeSwayMaterial({ vertexColors: true, emis: 0.2, emisColor: 0x8a7a3a });
    g.add(scatterInstanced(bladeGeo, grassMat, 6000, () => ({
      d: SR.GARDEN - 120 + rng() * 220,
      lat: (rng() - 0.5) * 110,
      yaw: rng() * Math.PI,
      s: 0.5 + rng() * 0.6,
    })));

    // Flower beds in arcs — four species.
    const bedGeo = (headHex) => keep(mergeParts([
      coloredGeo(new THREE.CylinderGeometry(0.02, 0.03, 0.5, 4).translate(0, 0.25, 0), 0x1d5c26),
      coloredGeo(new THREE.IcosahedronGeometry(0.14, 0).translate(0, 0.58, 0), headHex),
    ]));
    const species = [0xd04a5a, 0x8a5ac2, 0xe08a3c, 0xf2ead8];
    species.forEach((hex, k) => {
      const mat = makeSwayMaterial({ vertexColors: true, ampX: 0.06, ampZ: 0.04, emis: 0.2, emisColor: hex });
      const arcBase = (k / species.length) * Math.PI * 2;
      g.add(scatterInstanced(bedGeo(hex), mat, 500, () => {
        const a = arcBase + rng() * (Math.PI / 2);
        const rr = 18 + rng() * 55;
        return {
          d: SR.GARDEN - 10 + Math.sin(a) * rr * 0.9,
          lat: Math.cos(a) * rr,
          yaw: rng() * Math.PI,
          s: 0.8 + rng() * 0.6,
        };
      }));
    });

    // Silver-sage lambs-ear bed around the story props.
    const leaf = keep(new THREE.SphereGeometry(0.22, 5, 4));
    const leafMat = stdMat(0x9eb39a, { rough: 1.0, emis: 0.15 });
    g.add(scatterInstanced(leaf, leafMat, 1200, () => ({
      d: SR.GARDEN - 35 + rng() * 90,
      lat: (rng() - 0.5) * 70,
      h: 0.1,
      s: new THREE.Vector3(1 + rng(), 0.4 + rng() * 0.3, 1 + rng()),
    })));

    // Blossom trees on the perimeter (reuse the meadow species, warmer tint).
    const treeGeo = keep(mergeParts([
      coloredGeo(new THREE.CylinderGeometry(0.25, 0.45, 3.4, 6).translate(0, 1.7, 0), 0x6b4a36),
      coloredGeo(new THREE.IcosahedronGeometry(1.6, 1).translate(0, 4.2, 0), 0xf7e0c8),
      coloredGeo(new THREE.IcosahedronGeometry(1.2, 1).translate(1.1, 3.6, 0.3), 0xfae8d4),
      coloredGeo(new THREE.IcosahedronGeometry(1.1, 1).translate(-1.0, 3.7, -0.4), 0xf3d4b8),
    ]));
    const treeMat = stdMat(0xffffff, { rough: 0.95, emis: 0.08 });
    treeMat.vertexColors = true;
    g.add(scatterInstanced(treeGeo, treeMat, 16, () => ({
      d: SR.GARDEN - 90 + rng() * 190,
      lat: (rng() < 0.5 ? -1 : 1) * (50 + rng() * 45),
      yaw: rng() * Math.PI * 2,
      s: 0.9 + rng() * 0.8,
    })));

    // The bare tree with the windowpane leaning against it.
    const trunk = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.4, 0.6, 6, 7)), stdMat(0x5a4634, { rough: 1.0 }));
    const treeDir = pathDir(SR.GARDEN + 14, 8);
    placeAtDir(trunk, planet, treeDir, 3);
    orientOnSurface(trunk, treeDir, 0);
    g.add(trunk);
    const paneFrame = new THREE.Mesh(keep(new THREE.BoxGeometry(1.6, 2.2, 0.12)), stdMat(0x8a7a5c, { rough: 0.8 }));
    const pane = new THREE.Mesh(keep(new THREE.PlaneGeometry(1.4, 2.0)), stdMat(0xdce8f0, { rough: 0.1, metal: 0.3, transparent: true, opacity: 0.25 }));
    const paneDir = pathDir(SR.GARDEN + 13, 6.6);
    placeAtDir(paneFrame, planet, paneDir, 1.1);
    orientOnSurface(paneFrame, paneDir, 0.5);
    paneFrame.rotateX(0.18);
    pane.position.copy(paneFrame.position); pane.quaternion.copy(paneFrame.quaternion);
    pane.translateZ(0.08);
    g.add(paneFrame, pane);

    // The Stranger, seated by the windowpane.
    const st = tintRig('stranger', 0xe8d8b0, 0xc9b184);
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

    // The final sprout — the story's green, now emissive enough to bloom.
    const sproutMat = new THREE.MeshStandardMaterial({
      color: SR.SPROUT_GREEN, emissive: new THREE.Color(SR.SPROUT_GREEN), emissiveIntensity: 1.1, roughness: 0.7,
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
        makeDissolve(dir, SR.ASH, 240, SR.MASK_BLUE, 0.12);
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
      lineFadeRequested = true; // queue + banners + shimmer fade away
    } else if (f === 'warrior_embraced') {
      const dir = warrior.rig.group.position.clone().normalize();
      makeDissolve(dir, SR.ASH, 200);
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
    { dist: SR.CIRCLE, radius: 20, requires: 'river_crossed', fired: false,
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
    buildMeadow(), buildCircle(), buildLine(),
    buildWasteland(), buildRoundRoom(), buildGarden(),
  ];
  for (const z of zoneGroups) group.add(z.group);

  // River gate: a hard invisible wall across the crossing until the flower is
  // given (wide enough that wading around means leaving the story corridor).
  {
    const f = frameAt(SR.RIVER);
    colliders.push({
      frame: f, r2: 110 ** 2, special: 'wall',
      halfX: 90, z0: -3, z1: 3, y0: 0, y1: 3.2,
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
    mirrorSpeed = _pl.distanceTo(_prevPl) / Math.max(dt, 1e-4);

    pathCoords(_pl, _coords);
    updateSky(dt, _coords.dist);

    // Wind + water animation (uniform/offset writes only).
    for (const u of swayUniforms) u.value = t;
    for (const s of scrollers) s.map.offset.x = -(t * s.speed) % 1;

    // Fire due timers.
    for (let i = timers.length - 1; i >= 0; i--) {
      if (t >= timers[i].at) { const fn = timers[i].fn; timers.splice(i, 1); fn(); }
    }

    // Fire proximity triggers (in order, gated on the required flag).
    for (const tr of triggers) {
      if (tr.fired) continue;
      if (tr.requires && !has(tr.requires)) continue;
      if (Math.abs(_coords.dist - tr.dist) < tr.radius && Math.abs(_coords.lateral) < 60) {
        tr.fired = true; tr.fn();
      }
    }

    // Zone hooks (girl motion, fades, storm, mirror, sprout growth).
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
  const marks = {
    LADY: SR.LADY, RIVER: SR.RIVER, RIVER_CROSS: SR.RIVER_CROSS,
    CIRCLE: SR.CIRCLE, GIRL: SR.GIRL, DESERT: SR.DESERT,
    ROOM: SR.ROOM, ROOM_INNER_R: SR.ROOM_INNER_R, GARDEN: SR.GARDEN,
  };
  function debugState() {
    return {
      stage, flags: FLAGS.slice(0, stage), dist: _coords.dist, lateral: _coords.lateral,
      up: [up.x, up.y, up.z], // module's frozen surface-local path anchor (for tests)
      marks,
    };
  }

  // Landing narration.
  queueToast(TXT.toastLanding, 5, 0.5);

  function dispose() {
    // Restore the planet's own sky closure FIRST — the skyfog pass keeps
    // calling cfg.skyColor() after we're gone.
    planet.cfg.skyColor = origSkyColor;
    for (const d of dissolves) d.dispose();
    dissolves.length = 0;
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

// Angular proximity on a circle (both args in radians).
function angNear(a, b, tol) {
  let d = Math.abs(a - b) % (Math.PI * 2);
  if (d > Math.PI) d = Math.PI * 2 - d;
  return d < tol;
}

/* ----------------------------------------------------------------------
 * Canvas texture kit — all procedural, 512^2, sRGB.
 * ------------------------------------------------------------------- */
function makeCanvasTex(size, drawFn) {
  const cnv = document.createElement('canvas');
  cnv.width = cnv.height = size;
  const ctx = cnv.getContext('2d');
  drawFn(ctx, size);
  const tex = new THREE.CanvasTexture(cnv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

// A glowing Archimedean scotch-tape spiral (round-room floor emissive/alpha).
function makeSpiralTexture(turns = 5) {
  return makeCanvasTex(512, (ctx, S) => {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, S, S);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.beginPath();
    const cx = S / 2, cy = S / 2, maxR = S * 0.46;
    let first = true;
    for (let a = 0; a < turns * Math.PI * 2; a += 0.12) {
      const r = (a / (turns * Math.PI * 2)) * maxR;
      const jitter = 1 + Math.sin(a * 7.3) * 0.03; // ragged tape edge
      const x = cx + Math.cos(a) * r * jitter;
      const y = cy + Math.sin(a) * r * jitter;
      if (first) { ctx.moveTo(x, y); first = false; } else ctx.lineTo(x, y);
    }
    ctx.stroke();
  });
}

// Soft multi-arm cloud swirl for the storm discs (map + alphaMap: bright =
// dense cloud, black = clear). Dot-cluster arms read as churning vapor.
function makeSwirlTexture() {
  return makeCanvasTex(512, (ctx, S) => {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, S, S);
    const cx = S / 2, cy = S / 2;
    const seeded = mulberry32Local(1213);
    for (let arm = 0; arm < 4; arm++) {
      const armOff = (arm / 4) * Math.PI * 2;
      for (let a = 0.3; a < Math.PI * 3; a += 0.02) {
        const r = (a / (Math.PI * 3)) * S * 0.47;
        const x = cx + Math.cos(a + armOff + r * 0.006) * r;
        const y = cy + Math.sin(a + armOff + r * 0.006) * r;
        const fall = 1 - r / (S * 0.5);
        ctx.globalAlpha = 0.05 + 0.16 * fall;
        const g = Math.floor(120 + seeded() * 100);
        ctx.fillStyle = `rgb(${g},${g},${g})`;
        ctx.beginPath();
        ctx.arc(x + (seeded() - 0.5) * 26, y + (seeded() - 0.5) * 26, 8 + seeded() * 16, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Dense bright core (the eye wall).
    const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, S * 0.2);
    core.addColorStop(0, 'rgba(210,210,210,0.9)');
    core.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = 1;
    ctx.fillStyle = core;
    ctx.fillRect(0, 0, S, S);
  });
}

// Streaky flowing-water texture (tiles along the flow axis).
function makeWaterTexture() {
  const tex = makeCanvasTex(512, (ctx, S) => {
    ctx.fillStyle = '#1e6fd8'; ctx.fillRect(0, 0, S, S);
    const seeded = mulberry32Local(517);
    for (let i = 0; i < 70; i++) {
      const y = seeded() * S;
      const len = 40 + seeded() * 180;
      const x = seeded() * S;
      ctx.globalAlpha = 0.1 + seeded() * 0.2;
      ctx.strokeStyle = seeded() < 0.7 ? '#bfe0ff' : '#0e4aa8';
      ctx.lineWidth = 1.5 + seeded() * 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + len / 2, y + (seeded() - 0.5) * 8, x + len, y);
      ctx.stroke();
    }
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// Cracked dark earth for the wasteland (color baked in; material color white).
function makeCrackTexture() {
  return makeCanvasTex(512, (ctx, S) => {
    ctx.fillStyle = '#2e2a26'; ctx.fillRect(0, 0, S, S);
    const seeded = mulberry32Local(99);
    // Subtle blotches.
    for (let i = 0; i < 120; i++) {
      ctx.globalAlpha = 0.08;
      ctx.fillStyle = seeded() < 0.5 ? '#1e1b18' : '#3a352f';
      ctx.beginPath();
      ctx.arc(seeded() * S, seeded() * S, 10 + seeded() * 40, 0, Math.PI * 2);
      ctx.fill();
    }
    // Branching crack random-walks.
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = '#4a423a';
    ctx.lineWidth = 2;
    const walk = (x, y, ang, steps, depth) => {
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let s = 0; s < steps; s++) {
        ang += (seeded() - 0.5) * 0.9;
        x += Math.cos(ang) * 12;
        y += Math.sin(ang) * 12;
        ctx.lineTo(x, y);
        if (depth > 0 && seeded() < 0.12) walkLater.push([x, y, ang + (seeded() < 0.5 ? 1 : -1) * 0.9, Math.floor(steps / 2), depth - 1]);
      }
      ctx.stroke();
    };
    const walkLater = [];
    for (let i = 0; i < 22; i++) walkLater.push([seeded() * S, seeded() * S, seeded() * Math.PI * 2, 14 + Math.floor(seeded() * 14), 2]);
    while (walkLater.length) { const a = walkLater.shift(); walk(...a); }
  });
}

// Blotchy two-tone ground mottle (base color baked in; material color white).
function makeMottleTexture(baseHex, spotHex) {
  const base = '#' + baseHex.toString(16).padStart(6, '0');
  const spot = '#' + spotHex.toString(16).padStart(6, '0');
  return makeCanvasTex(512, (ctx, S) => {
    ctx.fillStyle = base; ctx.fillRect(0, 0, S, S);
    const seeded = mulberry32Local(baseHex ^ spotHex);
    for (let i = 0; i < 300; i++) {
      ctx.globalAlpha = 0.05 + seeded() * 0.12;
      ctx.fillStyle = spot;
      ctx.beginPath();
      ctx.arc(seeded() * S, seeded() * S, 8 + seeded() * 34, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

// Module-local deterministic rng for texture drawing (independent of the
// factory's rng so texture look never shifts story placement).
function mulberry32Local(seed) {
  let a = seed >>> 0;
  return function rand() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
