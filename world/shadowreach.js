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
import { createActualitySky } from './actuality-sky.js';
import { createActualityMaterials } from './actuality-materials.js';
import { createCrowd } from './shadowreach-people.js';
import { Astronaut } from '../src/astronaut.js';

// The owner's paintings (repo-root /artgallery, same pipeline as the Orbital
// Art Gallery in src/stations.js). One dream-themed piece appears faintly in
// the garden's windowpane — the window "shows a memory". Asset URLs only.
const ART_ENTRIES = Object.entries(
  import.meta.glob('/artgallery/*.{png,jpg,jpeg,webp}', {
    eager: true,
    query: '?url',
    import: 'default',
  })
).sort(([a], [b]) => (a < b ? -1 : 1));
const DREAM_ART_URL =
  (ART_ENTRIES.find(([path]) => /dream/i.test(path)) ?? ART_ENTRIES[0])?.[1] ?? null;

// Owner-supplied character portraits (repo-root /shadowreach-characters). Each
// file is keyed by its stem — lady / warrior / stranger / girl / cloaked, plus
// girl-run for the girl's running frame — and, when present, is pinned to the
// front of the matching NPC as a player-facing hologram (see attachHologram).
// The folder can be empty: the glob then yields [], every lookup returns null,
// and the NPCs simply stay their 3D figures.
const CHAR_ART = Object.entries(
  import.meta.glob('/shadowreach-characters/*.{png,jpg,jpeg,webp}', {
    eager: true,
    query: '?url',
    import: 'default',
  })
).map(([path, url]) => [path.split('/').pop().replace(/\.[^.]+$/, '').toLowerCase(), url]);
// Exact stem first (so 'girl' matches girl.png, never girl-run.png), then a
// loose substring fallback for convenience.
const charArtFor = (key) =>
  (CHAR_ART.find(([stem]) => stem === key) ?? CHAR_ART.find(([stem]) => stem.includes(key)))?.[1] ?? null;

/* ----------------------------------------------------------------------
 * Tunables + palette + authored text — every magic value lives here.
 * ------------------------------------------------------------------- */
// Two factors, because there are two different things here and one number was
// doing both jobs badly.
//
// P compresses the WALK — the distance between one event and the next. At 0.1875
// the whole journey is 491 m of path where it used to be 1965, so the story
// arrives at the pace it reads at rather than making you hike between beats.
//
// Z compresses BACKDROP footprints — ground carpets, dune fields, scatter
// ranges. It cannot be P: at a quarter of the spacing, a circle carpet still
// drawn at its old radius would reach from the river to the head of the queue
// and swallow two zones whole. It cannot be 1 either. It is tuned so each
// zone's dressing fills its own gap and stops.
//
// What scales by NEITHER is everything you actually walk into and around: the
// crowd's rings, the standing stones, the round room, the river's width, the
// trigger radii. Those are places, not travel, and they keep their metres.
const P = 0.1875;
const Z = 0.32;

const SR = {
  // Signature story accents.
  MASK_BLUE: 0x4a6fa5,
  SPROUT_GREEN: 0x4a7a5a,
  ASH: 0xb4b4b8, // dissolve-puff grey

  // Zone positions along the path (meters of arc from the landing anchor).
  // The old +/-2827 m antipode cap stops being a constraint at this spacing.
  FIELD: 0,            // the Meadow spans 0-64
  LADY: 340 * P,       // 64 — riverbank, reachable before the crossing gate
  RIVER: 360 * P,      // 68 — water crossing + story gate
  // The far bank and the crossing point are PINNED to the river, not scaled.
  // The ribbon is 18 m wide and crosses at a diagonal; scaled, the far bank
  // would land 3 m past the near one, inside the water.
  RIVER_FAR: 360 * P + 13.5,  // 81 — far bank (cloaked figure waits here)
  RIVER_CROSS: 360 * P + 30,  // 98 — past the water, attaches the companion
  CIRCLE: 700 * P,     // 131 — confession circle
  LINE_START: 1000 * P, // 188 — desert queue corridor
  GIRL: 1400 * P,      // 263
  LINE_END: 1470 * P,  // 276
  DESERT: 1900 * P,    // 356 — the Wasteland eye (storm + Thinking Stone)
  ROOM: 2300 * P,      // 431 — round room (26 m inner radius: spans 404-459)
  GARDEN: 2620 * P,    // 491 — garden

  ROOM_INNER_R: 26,
  ROOM_WALL_T: 1.4,
  ROOM_H: 12,
  ROOM_DOOR_HALF: 0.09, // radians — 0.09 * 26 ~ 2.3 m half-width doorway

  FOLLOW_DIST: 4.0, // meters a companion trails behind the player

  // Per-zone sky keyframes (path dist -> preset name), continuously blended as
  // the player walks. The arc is the story's: a blue morning with a little cloud
  // in it, weather closing in zone by zone until the round room is a starlit
  // void, then dawn in the garden. See SKY_PRESETS below.
  SKY_STOPS: [
    [0, 'srMeadow'],
    [520 * P, 'srMeadow'],
    [700 * P, 'srCircle'],
    [860 * P, 'srCircle'],
    [1050 * P, 'srQueue'],
    [1500 * P, 'srQueue'],
    [1750 * P, 'srStorm'],
    [2050 * P, 'srStorm'],
    [2250 * P, 'srVoid'],
    [2400 * P, 'srVoid'],
    [2550 * P, 'srDawn'],
    [2820 * P, 'srDawn'],
  ],
};

// The queue's length is travel distance — you walk along it — so it is simply
// the gap between its two markers. 120 figures over ~88 m stand about 0.7 m
// apart, which is what a queue looks like; at the old spacing they were 4 m
// apart and read as a scattered line of posts rather than people waiting.
const QUEUE_LEN = SR.LINE_END - SR.LINE_START;

// The wasteland's cracked pan and its lava ring. Pinned rather than scaled: the
// round room's outer wall stands at 404 m and this is centred at 356, so the
// pan has to stop before it reaches the room.
const WASTE_R = 44;

/* ----------------------------------------------------------------------
 * The sky, zone by zone.
 *
 * Handed to world/actuality-sky.js through opts.presets — the same Preetham sky,
 * raymarched cloud slab, star dome, matched sun and PMREM environment bake that
 * Actuality uses, driven here as one continuous arc instead of per-zone cuts.
 *
 * Read the table down the `elevation` and `cover` columns and the whole story is
 * there: the sun starts high and climbs down to nine degrees below the horizon by
 * the round room, then comes back up; cloud thickens from a quarter to almost
 * total and thins again. `exposure` is the camera stop for each place, authored
 * per preset for the reason a photographer changes theirs — one value calibrated
 * for the meadow renders the wasteland as mud and the round room as a black
 * screen. It also has to hold a floor for this world specifically: twelve point
 * lights and thirty-odd emissives here were authored at exposure 1, so these run
 * a good deal more open than Actuality's.
 * ------------------------------------------------------------------- */
const SKY_PRESETS = {
  // The meadow. Blue and lightly cloudy — high clean sun, low turbidity, cover
  // barely a quarter. This is the brightest the world ever gets, and the note
  // the ending has to answer.
  srMeadow: {
    turbidity: 1.9, rayleigh: 1.4, mie: 0.004, mieG: 0.80,
    elevation: 46, azimuth: 140,
    sunColor: 0xfff6e8, sunIntensity: 2.3,
    cloud: { cover: 0.26, altitude: 1250, thickness: 360, drift: 0.9, tint: 0xffffff, ambient: 2.8 },
    fog: { color: 0xc2daf0, density: 0.0013 },
    exposure: 0.52, envIntensity: 0.40,
  },
  // The confession circle. The sun has come down and warmed; cloud thickening.
  srCircle: {
    turbidity: 3.4, rayleigh: 1.9, mie: 0.005, mieG: 0.82,
    elevation: 24, azimuth: 168,
    sunColor: 0xffe0b4, sunIntensity: 2.1,
    cloud: { cover: 0.42, altitude: 1150, thickness: 420, drift: 0.75, tint: 0xffe8cc, ambient: 2.1 },
    fog: { color: 0xcbb191, density: 0.0026 },
    exposure: 0.56, envIntensity: 0.44,
  },
  // The desert queue. Low harsh sun through pale gold haze — bright but no
  // longer kind, which is the point of the zone.
  srQueue: {
    turbidity: 5.2, rayleigh: 2.3, mie: 0.006, mieG: 0.84,
    elevation: 14, azimuth: 196,
    sunColor: 0xffcf90, sunIntensity: 1.9,
    cloud: { cover: 0.54, altitude: 1050, thickness: 460, drift: 0.6, tint: 0xffdcb0, ambient: 1.5 },
    fog: { color: 0xd6bc8e, density: 0.0034 },
    exposure: 0.60, envIntensity: 0.48,
  },
  // The wasteland. Near-total cloud, a weak grey key barely above the horizon —
  // the sky the zone's storm discs and lightning were already drawn against.
  srStorm: {
    turbidity: 8.6, rayleigh: 3.2, mie: 0.008, mieG: 0.86,
    elevation: 5, azimuth: 224,
    sunColor: 0x97a08e, sunIntensity: 1.0,
    cloud: { cover: 0.86, altitude: 900, thickness: 620, drift: 0.45, tint: 0x5d6359, ambient: 0.45 },
    fog: { color: 0x424a40, density: 0.0052 },
    exposure: 0.80, envIntensity: 0.60,
  },
  // The round room. Sun below the horizon, stars out, rayleigh held up so the
  // sky is deep indigo rather than flat black — dark you can still read shape in.
  srVoid: {
    turbidity: 7.0, rayleigh: 2.4, mie: 0.004, mieG: 0.80,
    elevation: -9, azimuth: 248,
    sunColor: 0x9db2d8, sunIntensity: 0.55,
    cloud: { cover: 0.66, altitude: 1100, thickness: 500, drift: 0.3, tint: 0x77839c, ambient: 0.12 },
    fog: { color: 0x171a24, density: 0.0064 },
    stars: 1.0,
    exposure: 1.05, envIntensity: 0.75,
  },
  // The garden. Dawn: the sun climbing back, cloud breaking up, stars gone. The
  // brightening the whole walk has been descending away from.
  srDawn: {
    turbidity: 3.6, rayleigh: 2.6, mie: 0.005, mieG: 0.83,
    elevation: 8, azimuth: 292,
    sunColor: 0xffd2a2, sunIntensity: 2.2,
    cloud: { cover: 0.30, altitude: 1200, thickness: 380, drift: 0.55, tint: 0xffd9b8, ambient: 2.2 },
    fog: { color: 0xe2c8a2, density: 0.0022 },
    exposure: 0.66, envIntensity: 0.52,
  },
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

  // Fluttering wildlife (butterflies / moths): one InstancedMesh of two-wing
  // planes. Wings flap in the vertex shader (tips rise with |x|, body still,
  // phase from the instance origin); bodies drift on figure-8 paths around
  // scattered home points via a per-frame matrix recompose (no allocation).
  const flutters = []; // { mesh, homes }
  function makeFlutter(count, o) {
    const wing = new THREE.PlaneGeometry(0.22, 0.13);
    const geo = keep(mergeParts([
      wing.clone().translate(0.12, 0, 0),
      wing.translate(-0.12, 0, 0),
    ]));
    geo.rotateX(-Math.PI / 2); // wings lie flat, flap along local Y
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff, side: THREE.DoubleSide, roughness: 1.0,
    });
    if (o.emis) { mat.emissive = new THREE.Color(o.emisColor); mat.emissiveIntensity = o.emis; }
    const timeU = { value: 0 };
    swayUniforms.push(timeU);
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = timeU;
      shader.vertexShader = 'uniform float uTime;\n' + shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        {
          vec4 ip = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          transformed.y += abs(transformed.x) * sin(uTime * 11.0 + ip.x * 3.1 + ip.z * 2.7) * 0.9;
        }`
      );
    };
    disposables.push(mat);
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    mesh.frustumCulled = false;
    const homes = [];
    const col = new THREE.Color();
    for (let i = 0; i < count; i++) {
      homes.push({
        d: o.d0 + rng() * o.dSpan,
        lat: (rng() - 0.5) * o.latSpan,
        h: 0.8 + rng() * 2.2,
        ph: rng() * 20,
        sp: 0.3 + rng() * 0.5,
        ampD: 2 + rng() * 4,
        ampL: 2 + rng() * 4,
        yaw: rng() * Math.PI * 2,
      });
      mesh.setColorAt(i, col.setHex(o.colors[Math.floor(rng() * o.colors.length)]));
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    flutters.push({ mesh, homes });
    return mesh;
  }
  const _bM = new THREE.Matrix4(), _bQ = new THREE.Quaternion();
  const _bP = new THREE.Vector3(), _bD = new THREE.Vector3(), _bS = new THREE.Vector3(1, 1, 1);
  function updateFlutters(t) {
    for (const F of flutters) {
      const { mesh, homes } = F;
      for (let i = 0; i < homes.length; i++) {
        const b = homes[i];
        const dd = b.d + Math.sin(t * b.sp + b.ph) * b.ampD;
        const ll = b.lat + Math.sin((t * b.sp + b.ph) * 2.0) * b.ampL; // figure-8
        pathDirInto(dd, ll, _bD);
        _bP.copy(_bD).multiplyScalar(sampleGround(planet, _bD) + b.h + Math.sin(t * 1.7 + b.ph) * 0.5);
        _bQ.setFromUnitVectors(_yAxis, _bD)
          .multiply(_qScratch.setFromAxisAngle(_yAxis, b.yaw + Math.sin(t * b.sp) * 0.8));
        _bM.compose(_bP, _bQ, _bS);
        mesh.setMatrixAt(i, _bM);
      }
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  // Tile a ground texture instead of stretching one 512^2 canvas across a
  // whole 200-300 m disc: detail lands at ~`metersPerTile` scale, and
  // anisotropy keeps it sharp at the grazing angles a walker actually sees.
  function tileTex(tex, r, metersPerTile = 15) {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    const k = Math.max(1, Math.round((r * 2) / metersPerTile));
    tex.repeat.set(k, k);
    tex.anisotropy = 8; // driver clamps to hardware max
    return tex;
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

    if (o.map) tileTex(o.map, r); // fine-grain detail underfoot, not one giant blob

    // `ground` names a registry family (world/actuality-materials.js) — albedo,
    // roughness AND normal, which is what makes a floor read as ground rather
    // than as paint now that a real sun rakes across it. The registry owns the
    // core material; the skirt needs its own alphaMap and opacity, so it takes a
    // clone that this module owns and disposes.
    const groundMat = o.ground
      ? materials.make(o.ground, {
        repeat: Math.max(2, Math.round((r * 2) / 15)),
        color: o.color ?? 0xffffff,
        roughness: o.roughness ?? 1.0,
      })
      : null;

    const coreGeo = keep(drape(new THREE.RingGeometry(0.01, r * 0.8, 48, 8).rotateX(-Math.PI / 2), o.lift ?? 0.08));
    const core = new THREE.Mesh(coreGeo,
      groundMat ?? stdMat(o.map ? 0xffffff : o.color, { rough: 1.0, map: o.map }));
    core.frustumCulled = false;
    core.receiveShadow = true;

    const skirtGeo = keep(drape(new THREE.RingGeometry(r * 0.8, r, 48, 4).rotateX(-Math.PI / 2), (o.lift ?? 0.08) - 0.03));
    let skirtMat;
    if (groundMat) {
      skirtMat = groundMat.clone();
      skirtMat.transparent = true;
      skirtMat.depthWrite = false;
      disposables.push(skirtMat); // the CLONE is ours; the original is the registry's
    } else {
      skirtMat = stdMat(o.map ? 0xffffff : o.color, { rough: 1.0, map: o.map, transparent: true, depthWrite: false });
    }
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
   * The sky.
   *
   * A real one: world/actuality-sky.js, driven with this world's own preset
   * table (SKY_PRESETS above) as a continuous blend along the path. Every zone
   * boundary is a crossfade, not a cut, so the weather closes in while you walk
   * rather than switching behind your back.
   *
   * THE ANCHOR. Actuality hangs its sky off one fixed site, which it can because
   * you never leave the terrace. Here the path runs real curvature — the garden
   * sits ~31 degrees of arc from the landing point — and a sky pinned to the
   * meadow would be lying on its side by the time you reach it. So the anchor
   * rides the player: re-seated on their ground point and re-aimed at their
   * radial up every frame. The horizon stays level the whole way and the
   * authored sun elevation means the same thing in every zone.
   *
   * The renderer only reaches this module through preRender(), so update() picks
   * the blend and stashes it, and preRender() applies it. Same split as
   * world/actuality.js — the PMREM re-bake is self-throttled inside applyBlend,
   * so a continuous walk costs a bake every few seconds, not every frame.
   * ----------------------------------------------------------------- */
  const skyAnchor = new THREE.Object3D();
  group.add(skyAnchor);
  const sky = opts.scene
    ? createActualitySky(skyAnchor, opts.scene, {
      quality: opts.quality,
      presets: SKY_PRESETS,
    })
    : null;
  // Shadow camera: Actuality sizes it for a courtyard. These zones are wider,
  // and the anchor follows the player, so the box only ever has to cover what is
  // near them — but "near" here is a confession circle 28 m across with dead
  // trees beyond it.
  if (sky) sky.setShadowExtent(110, 420);

  /* -------------------------------------------------------------------
   * PBR material registry (world/actuality-materials.js).
   *
   * Procedural, generated on a canvas at load — no texture files, nothing to
   * fetch. Nine families of albedo + roughness + normal maps, memoized, so the
   * standing stones and the Thinking Stone and the round room's walls are all
   * the same handful of draw calls.
   *
   * The registry OWNS everything it returns and hands the same instance to
   * every caller that asks for the same thing. Nothing from it goes into
   * `disposables` — teardown would double-dispose — and anything that needs an
   * onBeforeCompile or a live opacity is cloned first. One dispose() at the
   * bottom of this module's own.
   * ----------------------------------------------------------------- */
  const materials = createActualityMaterials({ quality: opts.quality });

  // The blend picked by update(), drained by preRender().
  const _skyBlend = { a: SR.SKY_STOPS[0][1], b: SR.SKY_STOPS[0][1], k: 0 };
  // The ending overrides the position-driven arc: once the mask comes off, the
  // sky brightens on its own clock, so the resolution belongs to the story beat
  // and not to wherever the player happens to be standing.
  let endingSky = -1;
  const ENDING_SKY_TIME = 7.0;

  const _skyUp = new THREE.Vector3();
  function updateSky(dt, dist, playerPos) {
    if (!sky) return;
    // Anchor: the player's ground point, oriented to their radial up.
    _skyUp.copy(playerPos).normalize();
    skyAnchor.position.copy(_skyUp).multiplyScalar(sampleGround(planet, _skyUp));
    skyAnchor.quaternion.setFromUnitVectors(_yAxis, _skyUp);

    if (endingSky >= 0) {
      endingSky += dt;
      const k = THREE.MathUtils.smoothstep(
        THREE.MathUtils.clamp(endingSky / ENDING_SKY_TIME, 0, 1), 0, 1
      );
      _skyBlend.a = 'srDawn'; _skyBlend.b = 'srMeadow'; _skyBlend.k = k;
      return;
    }
    const stops = SR.SKY_STOPS;
    let i = 0;
    while (i < stops.length - 2 && stops[i + 1][0] <= dist) i++;
    const d0 = stops[i][0];
    const span = Math.max(1, stops[i + 1][0] - d0);
    _skyBlend.a = stops[i][1];
    _skyBlend.b = stops[i + 1][1];
    _skyBlend.k = THREE.MathUtils.smoothstep(
      THREE.MathUtils.clamp((dist - d0) / span, 0, 1), 0, 1
    );
  }

  // Pre-composer hook (src/walk.js walkPreRender) — the only one with a renderer.
  // The sky dome, cloud slab, star field and sun are all children of the anchor,
  // and the anchor is already sitting on the player, so their offset within it is
  // the origin.
  const _skyOrigin = new THREE.Vector3();
  function preRender(renderer) {
    if (!sky) return;
    sky.applyBlend(_skyBlend.a, _skyBlend.b, _skyBlend.k, renderer);
    sky.update(lastT, lastDt, _skyOrigin, renderer);
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
    // The story figures stand twice life-size — mythic, larger than the player.
    // Attachments (robes, pauldrons, pigtails) are group-local and scale along;
    // per-character overrides below compose on top via multiplyScalar.
    rig.group.scale.multiplyScalar(2);
    rig.params.groundOffset *= 2;
    return rig;
  }

  // Bend a rig into a seated pose (thighs forward, shins down) and drop it so it
  // reads as sitting on a low surface at `seatDrop` below its standing feet.
  function seatRig(rig, seatDrop = 0) {
    const j = rig.joints;
    j.legL.hip.rotation.x = -1.45; j.legR.hip.rotation.x = -1.45;
    j.legL.knee.rotation.x = 1.5; j.legR.knee.rotation.x = 1.5;
    j.torso.rotation.x = 0.12;
    // The proportional body-drop is in pre-scale rig units — multiply by the
    // group scale so seated figures still meet their (world-unit) seats.
    rig._seatDrop = seatDrop + 0.35 * rig.params.scaleY * rig.group.scale.y;
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
   * Character silhouettes — distinct shapes so each figure reads at a
   * glance (a robed woman, an armored warrior, a small girl, a hooded
   * traveler) rather than five recolored astronauts.
   * ----------------------------------------------------------------- */
  function meshOn(parent, geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    parent.add(m);
    return m;
  }
  // A floor-length robe/gown cone attached at the rig root (base wide at the
  // ground, apex at the waist). Hides the astronaut legs entirely.
  function addRobe(rig, hex, botR, len, o = {}) {
    const sc = rig.params.scaleY;
    const geo = keep(new THREE.ConeGeometry(botR * sc, len * sc, 12, 1, true));
    const mat = stdMat(hex, { rough: 0.9, emis: o.emis ?? 0.06, emisColor: o.emisColor ?? hex, side: THREE.DoubleSide });
    return meshOn(rig.group, geo, mat, 0, (len * 0.5) * sc + 0.05, 0);
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
  // `lastDt` rides along for preRender, which drives the sky and has no delta of
  // its own.
  let lastT = 0;
  let lastDt = 1 / 60;
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
  const eventLights = []; // marker lights that dim while the player stands in them

  // Register an event's marker light: it fades toward `floor` as the player
  // closes on the event (a bright light up close washes out the character art)
  // and comes back as they walk away. `onFade` lets a visible shaft follow.
  function addEventLight(light, dist, lat, { near = 4.5, far = 9, floor = 0.12, onFade = null } = {}) {
    eventLights.push({
      light, anchor: bodyPosAt(dist, lat), base: light.intensity,
      near, far, floor, cur: 1, onFade,
    });
  }

  function addFollower(rig, slotX) {
    rig.group.visible = true;
    followers.push({ rig, slotX, cur: new THREE.Vector3(), inited: false });
  }

  // Seated/static named NPCs come alive: heads turn to track the player when
  // near (damped, clamped), and torsos breathe. Only rigs that never run
  // poseRig are registered here, so there is exactly one writer per joint.
  const lookers = []; // { rig, activeFn? }
  function addLooker(rig, activeFn = null) { lookers.push({ rig, activeFn }); }
  const _lkP = new THREE.Vector3();
  const _lkQ = new THREE.Quaternion();
  function updateLookers(dt, t) {
    for (const L of lookers) {
      const rig = L.rig;
      if (!rig.group.visible || (L.activeFn && !L.activeFn())) continue;
      let targetYaw = 0;
      if (rig.group.position.distanceToSquared(_pl) < 81) { // within 9 m
        _lkP.copy(_pl).sub(rig.group.position)
          .applyQuaternion(_lkQ.copy(rig.group.quaternion).invert());
        targetYaw = THREE.MathUtils.clamp(Math.atan2(_lkP.x, _lkP.z), -0.8, 0.8);
      }
      rig.joints.head.rotation.y =
        THREE.MathUtils.damp(rig.joints.head.rotation.y, targetYaw, 4, dt);
      // Gentle breathing (seated pose is set once; poseRig never runs here).
      rig.joints.torso.position.y =
        0.18 * rig.params.scaleY + Math.sin(t * 1.3 + rig.params.gaitPhase) * 0.012;
    }
  }

  // Player-facing character holograms: a flat plane of the owner's own portrait
  // art pinned above the front of a built NPC, yawing to face the player. From
  // the player's view you see the real character; walking around reveals the 3D
  // figure. Keyed by filename — an NPC whose portrait hasn't been committed just
  // stays its procedural rig (charArtFor returns null and attachHologram bails).
  const holograms = []; // { key, mesh, mat, holder, rig, height, drop, activeFn, ... }
  // Load a portrait texture and, when it decodes, stash its aspect on `slot`.
  function loadPortrait(url, slot, apply) {
    new THREE.TextureLoader().load(url, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 8;
      disposables.push(tex);
      const img = tex.image;
      slot.tex = tex;
      slot.aspect = (img && img.width && img.height) ? img.width / img.height : 0.5;
      if (apply) apply();
    });
  }
  // Attach a player-facing portrait to a rig. `frameFn` (optional) returns the
  // stem of the frame to show right now — used for the Girl, who has a running
  // frame (girl-run) and an idle frame (girl). Absent → single static portrait.
  function attachHologram(rig, key, { height = 1.9, drop = 0, activeFn = null, altKey = null, frameFn = null } = {}) {
    const url = charArtFor(key);
    if (!url) return; // no art committed yet — keep the 3D figure
    const holder = new THREE.Group();
    group.add(holder);
    // Base plane is 1 tall × `height` in world units; scale.x applies the aspect.
    const geo = keep(new THREE.PlaneGeometry(1, height));
    const mat = keep(new THREE.MeshBasicMaterial({
      // Unlit so the portrait self-shows in the dark zones, but multiplied down
      // to ~0.8 so bright art (the Lady's white gown) stays under the bloom
      // threshold and reads as a solid figure instead of a glowing blob.
      color: 0xcccccc,
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      opacity: 0.96, alphaTest: 0.06,
    }));
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = 6;
    holder.add(mesh);
    const frames = { [key]: {} }; // stem -> { tex, aspect }
    const h = { key, mesh, mat, holder, rig, height, drop, activeFn, frameFn, frames, shown: null };
    holograms.push(h);
    // Show a frame: bind its texture + true aspect (idempotent per frame).
    const show = (stem) => {
      const f = frames[stem];
      if (!f || !f.tex || h.shown === stem) return;
      h.shown = stem;
      mat.map = f.tex; mat.needsUpdate = true;
      mesh.scale.x = f.aspect * height;
    };
    h.show = show;
    loadPortrait(url, frames[key], () => { if (!frameFn) show(key); });
    const altUrl = altKey && charArtFor(altKey);
    if (altUrl) { frames[altKey] = {}; loadPortrait(altUrl, frames[altKey]); }
  }

  // Yaw a holder Group upright on its local up and turn it to face the player.
  // Same two-quaternion math as faceRig, but on a bare Group (no rig joints).
  const _hq0 = new THREE.Quaternion(), _hq1 = new THREE.Quaternion();
  const _hToL = new THREE.Vector3(), _hdir = new THREE.Vector3(), _hfwd = new THREE.Vector3();
  // Hide/show a rig's visible meshes without touching group.visible, so the
  // story logic (which reads group.visible as the NPC's presence) is untouched.
  // The rig hangs entirely off group.children, so toggling those covers it all.
  function setRigMeshesShown(rig, shown) {
    for (const c of rig.group.children) c.visible = shown;
  }
  function updateHolograms(t) {
    for (const h of holograms) {
      const on = h.rig.group.visible && (!h.activeFn || h.activeFn());
      if (h.frameFn && on) h.show(h.frameFn());     // swap idle/running frame
      // The portrait renders only once its texture has decoded; until then keep
      // the 3D rig showing so the NPC is never invisible.
      const showing = on && !!h.mat.map;
      h.holder.visible = showing;
      // While the portrait is up it replaces the figure entirely — hide the rig
      // meshes so it's purely the owner's art from every angle; restore them
      // whenever the portrait is down (e.g. the finale mask-lift + dissolve).
      setRigMeshesShown(h.rig, !showing);
      if (!showing) continue;
      _hdir.copy(h.rig.group.position).normalize(); // local up at the figure
      // Anchor the portrait's feet on the actual ground under the figure (robust
      // for seated/scaled rigs, where the rig pivot isn't at ground level).
      const groundLen = sampleGround(planet, _hdir);
      h.holder.position.copy(_hdir).multiplyScalar(groundLen + h.height * 0.5 + h.drop);
      // Push the plane out toward the player, clear of the solid 3D rig, so the
      // figure's own body never occludes its portrait (tangent component only —
      // stays at the same height). This keeps the portrait pinned to the front.
      _hfwd.copy(_pl).sub(h.holder.position);
      _hfwd.addScaledVector(_hdir, -_hfwd.dot(_hdir)); // drop the vertical part
      if (_hfwd.lengthSq() > 1e-6) h.holder.position.addScaledVector(_hfwd.normalize(), 1.2);
      _hq0.setFromUnitVectors(_yAxis, _hdir);
      _hToL.copy(_pl).sub(h.holder.position).applyQuaternion(_hq1.copy(_hq0).invert());
      const yaw = Math.atan2(_hToL.x, _hToL.z);
      h.holder.quaternion.copy(_hq0).multiply(_hq1.setFromAxisAngle(_yAxis, yaw));
      h.mat.opacity = 0.94 + Math.sin(t * 2.0 + h.key.length) * 0.04; // faint shimmer
    }
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
    g.add(drapeDisc(170 * P, 150 * Z, { ground: 'groundCover', color: 0x4aa74e }));
    g.add(drapeDisc(370 * P, 60 * Z, { ground: 'groundCover', color: 0x5cbc5e }));

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
        d: nearRiver ? (250 + rng() * 200) * P : rng() * 300 * P,
        lat: (rng() < 0.5 ? -1 : 1) * (45 + rng() * 90),
        yaw: rng() * Math.PI * 2,
        s: 0.8 + rng() * 0.9,
      };
    }));

    // The winding blue river: a draped ribbon crossing the path at SR.RIVER,
    // with a scrolling streak texture for flow.
    g.add(buildRiverRibbon());

    // Butterflies drifting over the meadow.
    g.add(makeFlutter(36, {
      d0: 20, dSpan: 300, latSpan: 110,
      colors: [0xffffff, 0xffe08a, 0xffb0c8, 0x9fd8ff],
    }));

    // (The path itself is marked by the draped, sphere-conforming guide road
    // in buildGuidePath — an earlier flat "worn path" plane floated above the
    // curved ground toward its ends and has been removed.)

    // Stepping stones across the crossing (visual — the ground is walkable).
    const stoneGeo = keep(new THREE.CylinderGeometry(1.0, 1.1, 0.5, 7));
    const stoneMat = materials.make('rock', { repeat: 2, color: 0xa89c8c });
    for (let i = -3; i <= 3; i++) {
      const st = new THREE.Mesh(stoneGeo, stoneMat);
      const dir = pathDir(SR.RIVER + i * 3.2, (i % 2) * 0.6);
      placeAtDir(st, planet, dir, 0.15);
      orientOnSurface(st, dir, 0);
      g.add(st);
    }

    // The Lady in White, seated at the near bank with a single flower. A long
    // white gown + gold sash + hair bun read her as a robed woman.
    const lady = tintRig('lady', 0xf6e6d8, 0xffffff);
    const lsc = lady.params.scaleY;
    addRobe(lady, 0xffffff, 0.7, 1.7, { emis: 0.14, emisColor: 0xfff2e0 });
    meshOn(lady.group, keep(new THREE.TorusGeometry(0.26 * lsc, 0.05 * lsc, 6, 12)), stdMat(0xe8c86a, { emis: 0.2 }), 0, 1.15 * lsc, 0, Math.PI / 2); // gold sash
    meshOn(lady.joints.head, keep(new THREE.SphereGeometry(0.13 * lsc, 8, 6)), stdMat(0xd8c0a0, { rough: 1 }), 0, 0.16 * lsc, -0.12 * lsc); // hair bun
    seatRig(lady, 0);
    placeRig(lady, pathDir(SR.LADY, 4), Math.PI); // faces the arriving player
    addLooker(lady); // her head follows you; she never rises
    g.add(lady.group);
    attachHologram(lady, 'lady', { height: 3.4 }); // standing gown, feet at ground

    // (cloaked hologram attached below, once cloakedFigure is set)
    const flowerMat = stdMat(0xff5a7a, { emis: 0.4, emisColor: 0xff5a7a });
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
    // Hide the portrait once the finale starts so the mask-lift + dissolve beat
    // plays on the real 3D rig (a flat portrait would cover the climactic reveal).
    attachHologram(cloak.rig, 'cloaked',
      { height: 3.8, activeFn: () => cloak.rig.group.visible && !endingStarted });
    // (girl / warrior / stranger holograms attached at their build sites)

    return { group: g };
  }

  // River centerline in path coords: enters the meadow at lateral +95, crosses
  // the walking path exactly at SR.RIVER (u = 0.5), exits at -95.
  function riverCenter(u, out) {
    const d = SR.RIVER - 30 + u * 60;
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
    waterTex.anisotropy = 8;
    // Strong blue emissive floor so the water reads saturated blue even at
    // grazing angles (a river seen on foot is almost always edge-on).
    // DoubleSide: the ribbon's winding depends on the flow direction, so don't
    // gamble on which way the face normals land.
    const waterMat = stdMat(0xffffff, {
      rough: 0.12, metal: 0.2, map: waterTex, emis: 0.3, emisColor: 0x2470e8,
      side: THREE.DoubleSide,
    });
    // Living-water shader: vertex ripple + moving sparkle glints + a real
    // fresnel term that brightens the surface blue at grazing angles — the
    // view a walker actually has of a river.
    const waterTime = { value: 0 };
    swayUniforms.push(waterTime);
    waterMat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = waterTime;
      shader.vertexShader = 'uniform float uTime;\n' + shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        transformed += normalize(normal) * (
          sin(uv.x * 40.0 + uTime * 2.0) * 0.05 +
          sin(uv.x * 13.0 - uTime * 1.3) * 0.03
        );`
      );
      shader.fragmentShader = 'uniform float uTime;\n' + shader.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        {
          // Sparkle glints drifting against the flow. (r165 standard shader
          // exposes per-map UVs — vMapUv — rather than a generic vUv.)
          float glint = pow(max(sin(vMapUv.x * 60.0 - uTime * 3.0) *
                                sin(vMapUv.y * 14.0 + uTime * 2.0), 0.0), 8.0);
          totalEmissiveRadiance += vec3(0.55, 0.75, 1.0) * glint * 0.55;
          // Fresnel: grazing views pick up sky-blue shine.
          vec3 fvDir = normalize(vViewPosition);
          float fres = pow(1.0 - clamp(abs(dot(fvDir, normalize(vNormal))), 0.0, 1.0), 3.0);
          totalEmissiveRadiance += vec3(0.25, 0.5, 1.0) * fres * 0.55;
        }`
      );
    };
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
   * The guide corridor — the single most important navigation aid. A
   * continuous glowing path down the route's centerline, flanked by two
   * rows of lantern posts (a visible "you walk here" channel that also
   * lights the dark late zones). Split around the round room.
   * ----------------------------------------------------------------- */
  // A draped strip along lateral 0 from dStart to dEnd (sphere-conforming).
  function buildRibbon(dStart, dEnd, half, mat, lift = 0.16) {
    const steps = Math.max(2, Math.round((dEnd - dStart) / 6));
    const positions = new Float32Array((steps + 1) * 2 * 3);
    const uvs = new Float32Array((steps + 1) * 2 * 2);
    const indices = [];
    const c = new THREE.Vector3(), cA = new THREE.Vector3(), cB = new THREE.Vector3();
    const tg = new THREE.Vector3(), w = new THREE.Vector3(), e = new THREE.Vector3();
    for (let i = 0; i <= steps; i++) {
      const d = dStart + (dEnd - dStart) * (i / steps);
      pathDirInto(d, 0, c).multiplyScalar(sampleGround(planet, c) + lift);
      pathDirInto(d + 3, 0, cA); pathDirInto(d - 3, 0, cB);
      tg.subVectors(cA, cB).normalize();
      w.crossVectors(c, tg).normalize();
      for (const side of [-1, 1]) {
        e.copy(c).addScaledVector(w, side * half).normalize();
        e.multiplyScalar(sampleGround(planet, e) + lift);
        const vi = (i * 2 + (side + 1) / 2) * 3;
        positions[vi] = e.x; positions[vi + 1] = e.y; positions[vi + 2] = e.z;
        const ui = (i * 2 + (side + 1) / 2) * 2;
        uvs[ui] = (d - dStart) / 8; uvs[ui + 1] = (side + 1) / 2;
      }
      if (i < steps) {
        const a = i * 2, b = i * 2 + 1, cc = i * 2 + 2, dd = i * 2 + 3;
        indices.push(a, b, cc, b, dd, cc);
      }
    }
    const geo = keep(new THREE.BufferGeometry());
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 1.5;
    return mesh;
  }

  function buildGuidePath() {
    const g = new THREE.Group();
    const roomGap = SR.ROOM_INNER_R + 8;

    // Central glowing road (warm pale stone) — split around the round room.
    // The ribbon's UVs already tile along its length (u/8), so the texture
    // just needs RepeatWrapping; anisotropy keeps it sharp receding ahead.
    const roadTex = keep(makeMottleTexture(0xdcc7a0, 0xc9b285));
    roadTex.wrapS = roadTex.wrapT = THREE.RepeatWrapping;
    roadTex.anisotropy = 8;
    const roadMat = stdMat(0xffffff, { rough: 0.9, map: roadTex, emis: 0.3, emisColor: 0xffe2a8, side: THREE.DoubleSide });
    g.add(buildRibbon(6, SR.ROOM - roomGap, 3.2, roadMat));
    g.add(buildRibbon(SR.ROOM + roomGap, SR.GARDEN, 3.2, roadMat));

    // Lantern posts flanking the corridor, glowing orbs on top (bloom). Two
    // instanced meshes: posts (dark) + orbs (warm emissive). Skip the room.
    const postGeo = keep(new THREE.CylinderGeometry(0.07, 0.09, 2.0, 5).translate(0, 1.0, 0));
    const orbGeo = keep(new THREE.IcosahedronGeometry(0.24, 1).translate(0, 2.1, 0));
    const lampSpots = [];
    for (let d = 24; d <= SR.GARDEN - 10; d += 26) {
      if (Math.abs(d - SR.ROOM) < roomGap + 4) continue;
      // Widen the gate posts at the river so the crossing reads.
      const margin = Math.abs(d - SR.RIVER) < 24 ? 12 : 6.5;
      lampSpots.push({ d, lat: -margin }, { d, lat: margin });
    }
    const postMat = materials.make('wood', { repeat: 1, color: 0x584f42 });
    const orbMat = stdMat(0xffffff, { rough: 0.4, emis: 1.15, emisColor: 0xffcf7a });
    const placeLamp = (i) => ({ d: lampSpots[i].d, lat: lampSpots[i].lat, s: 1, h: 0 });
    g.add(scatterInstanced(postGeo, postMat, lampSpots.length, placeLamp));
    g.add(scatterInstanced(orbGeo, orbMat, lampSpots.length, placeLamp));

    return { group: g };
  }

  /* -------------------------------------------------------------------
   * ZONE 2 — The Confession Circle (dusk clearing, standing stones)
   * ----------------------------------------------------------------- */
  let circleCrowd = null;
  // Worn, sun-bleached homespun. Read together with the robed silhouette these
  // are the clothes of people who have been standing here a long time.
  const CIRCLE_CLOTH = [0x8a6f52, 0x9c8465, 0x74604a, 0xa89376, 0x6b5642, 0xb5a488];
  function buildCircle() {
    const g = new THREE.Group();

    // Dry amber clearing.
    g.add(drapeDisc(SR.CIRCLE, 32, { ground: 'aggregate', color: 0x9a6a3c }));

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
    const stones = new THREE.Mesh(stonesGeo, materials.make('stone', { repeat: 3, color: 0x4a4a52 }));
    stones.frustumCulled = false;
    const cf = frameAt(SR.CIRCLE);
    stones.position.copy(cf.pos);
    stones.quaternion.copy(cf.q);
    g.add(stones);

    // Dead trees scattered beyond the stones.
    g.add(scatterInstanced(deadTreeGeo(), materials.make('bark', { repeat: 2, color: 0x6a5a48 }), 10, () => ({
      d: SR.CIRCLE - 70 * Z + rng() * 140 * Z,
      lat: (rng() < 0.5 ? -1 : 1) * (40 + rng() * 35),
      yaw: rng() * Math.PI * 2,
      s: 0.8 + rng() * 0.8,
    })));

    // The huddled crowd — sixty people in two rings, facing in. Mostly robed:
    // this is a confession, and they are here to listen.
    const _cDir = new THREE.Vector3();
    circleCrowd = createCrowd({
      count: 60,
      rng,
      materials,
      robedFraction: 0.62,
      // Dusty umber through to bleached linen — the zone's own palette, worn.
      cloth: (r) => CIRCLE_CLOTH[Math.floor(r() * CIRCLE_CLOTH.length)],
      place: (i) => {
        const ring = i < 24 ? 0 : 1;
        const a = ((i % (ring ? 36 : 24)) / (ring ? 36 : 24)) * Math.PI * 2 + ring * 0.09;
        const rr = ring ? 18 + rng() * 4 : 12 + rng() * 3;
        pathDirInto(SR.CIRCLE + Math.sin(a) * rr, Math.cos(a) * rr, _cDir);
        const q = new THREE.Quaternion().setFromUnitVectors(_yAxis, _cDir)
          .multiply(_qScratch.setFromAxisAngle(_yAxis, -a + Math.PI / 2)); // face the centre
        return {
          pos: _cDir.clone().multiplyScalar(sampleGround(planet, _cDir)),
          quat: q,
        };
      },
    });
    g.add(circleCrowd.group);

    // Low amber dusk glow over the clearing.
    const dusk = new THREE.PointLight(0xffb060, 3.5, 100, 2);
    placeAtDir(dusk, planet, pathDir(SR.CIRCLE, 0), 10);
    g.add(dusk);
    addEventLight(dusk, SR.CIRCLE, 0);
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

    // Golden sand carpets along the corridor, warming as the queue goes on.
    g.add(drapeDisc(1080 * P, 120 * Z, { ground: 'aggregate', color: 0xd9b877 }));
    g.add(drapeDisc(1260 * P, 120 * Z, { ground: 'aggregate', color: 0xd3b070 }));
    g.add(drapeDisc(1440 * P, 120 * Z, { ground: 'aggregate', color: 0xcaa768 }));

    // Dune mounds flanking the corridor.
    const duneGeo = keep(new THREE.SphereGeometry(1, 12, 8));
    g.add(scatterInstanced(duneGeo, materials.make('aggregate', { repeat: 4, color: 0xe8c98a }), 40, () => {
      const sc = 12 + rng() * 26;
      const ySc = sc * (0.3 + rng() * 0.2);
      // Bury only the rim (the flattened sphere's half-height is ~0.3-0.5 sc,
      // so sinking more than that hides the dune entirely).
      return {
        d: SR.LINE_START - 20 + rng() * (QUEUE_LEN + 60),
        lat: (rng() < 0.5 ? -1 : 1) * (45 + rng() * 100),
        h: -ySc * 0.45,
        s: new THREE.Vector3(sc, ySc, sc),
      };
    }));

    // The queue: 120 people winding through the dunes in a serpentine, standing
    // about arm's length apart, all of them facing the way the line is going —
    // which is away from you, until the girl turns and breaks it.
    const queueLat = (d) => 40 * Math.sin(((d - SR.LINE_START) / QUEUE_LEN) * 3 * Math.PI);
    const QN = 120;
    const _qDir = new THREE.Vector3(), _qAhead = new THREE.Vector3();
    queueCrowd = createCrowd({
      count: QN,
      rng,
      materials,
      robedFraction: 0.28,
      cloth: (r) => QUEUE_CLOTH[Math.floor(r() * QUEUE_CLOTH.length)],
      place: (i) => {
        const d = SR.LINE_START + (i / QN) * QUEUE_LEN;
        const lat = queueLat(d) + (rng() - 0.5) * 1.2;
        pathDirInto(d, lat, _qDir);
        const pos = _qDir.clone().multiplyScalar(sampleGround(planet, _qDir));
        // Face up-queue: aim at where the person in front is standing, so the
        // whole line bends through the serpentine instead of staring one way.
        const dAhead = Math.min(d + 6, SR.LINE_START + QUEUE_LEN);
        pathDirInto(dAhead, queueLat(dAhead), _qAhead);
        _qAhead.multiplyScalar(sampleGround(planet, _qAhead));
        const q0 = new THREE.Quaternion().setFromUnitVectors(_yAxis, _qDir);
        _qAhead.sub(pos).applyQuaternion(_qScratch.copy(q0).invert());
        const q = q0.multiply(_qScratch.setFromAxisAngle(
          _yAxis, Math.atan2(_qAhead.x, _qAhead.z) + (rng() - 0.5) * 0.35
        ));
        return { pos, quat: q };
      },
    });
    g.add(queueCrowd.group);

    // Rope posts + sagging ropes marking the queue lane (merged buckets).
    const postParts = [], ropeParts = [];
    const prev = new THREE.Vector3(), cur = new THREE.Vector3();
    let prevSet = false;
    const cf2 = frameAt((SR.LINE_START + SR.LINE_END) / 2);
    const invQ = cf2.qInv;
    for (let d = SR.LINE_START; d <= SR.LINE_START + QUEUE_LEN; d += 9) {
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
    const postMesh = new THREE.Mesh(keep(mergeParts(postParts)), materials.make('wood', { repeat: 1.5, color: 0xb59470 }));
    const ropeMesh = new THREE.Mesh(keep(mergeParts(ropeParts)), materials.make('groundCover', { repeat: 3, color: 0xd8c49a }));
    postMesh.frustumCulled = false; ropeMesh.frustumCulled = false;
    postMesh.position.copy(cf2.pos); postMesh.quaternion.copy(cf2.q);
    ropeMesh.position.copy(cf2.pos); ropeMesh.quaternion.copy(cf2.q);
    g.add(postMesh, ropeMesh);

    // Tattered banners fluttering above the queue.
    const bannerGeo = keep(coloredGeo(new THREE.PlaneGeometry(1.1, 0.7, 1, 3).translate(0, -0.35, 0), 0xffffff));
    const bannerMat = makeSwayMaterial({ color: 0xffffff, ampX: 0.45, ampZ: 0.3, transparent: true });
    const bannerShades = [0xb85a4a, 0xd8cba8, 0x9a6a3c, 0xe0d6c0];
    const banners = scatterInstanced(bannerGeo, bannerMat, 10, (i) => {
      const d = SR.LINE_START + (0.06 + i * 0.092) * QUEUE_LEN;
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
      d: SR.LINE_END + 8 + rng() * 26,
      lat: (rng() - 0.5) * 60,
      h: 0.5 + rng() * 3,
      s: 0.6 + rng() * 0.8,
    }));
    g.add(mica);

    // The Girl: small, bright coral dress + pigtails — unmistakably a child.
    const gr = tintRig('girl', 0xf0c8a0, 0xff7a4a);
    const gsc = gr.params.scaleY;
    addRobe(gr, 0xff7a4a, 0.34, 0.75, { emis: 0.12 }); // short dress
    for (const side of [-1, 1]) {
      meshOn(gr.joints.head, keep(new THREE.SphereGeometry(0.09 * gsc, 6, 5)), stdMat(0x6b4a30, { rough: 1 }),
        side * 0.16 * gsc, 0.14 * gsc, -0.02 * gsc); // pigtails
    }
    gr.group.scale.multiplyScalar(0.72); // composes with the ×2 in tintRig
    gr.params.groundOffset *= 0.72;
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
    attachHologram(gr, 'girl', {
      height: 2.3, activeFn: () => girl.state !== 'hidden',
      altKey: 'girl-run', // running frame while she sprints in, idle when she stops
      frameFn: () => (girl.state === 'sprinting' ? 'girl-run' : 'girl'),
    });

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
      if (lineFadeRequested && fadeT < 0) { fadeT = 0; queueCrowd.startFade(2.5); }
      if (fadeT >= 0) {
        // The crowd runs its own dissolve (it has to clear the promoted rigs as
        // well as the instances); the banners and shimmer follow on the same
        // clock so the whole zone goes together.
        fadeT += dt;
        const o = Math.max(0, 1 - fadeT / 2.5);
        bannerMat.opacity = o;
        micaMat.emissiveIntensity = 1.0 * o;
        if (fadeT > 2.5) {
          mica.visible = false; banners.visible = false;
          fadeT = Infinity;
        }
      }
    });
    return { group: g };
  }
  let lineFadeRequested = false;
  let queueCrowd = null;
  // Sun-bleached: linen and undyed cotton gone pale in a desert nobody leaves.
  const QUEUE_CLOTH = [0xcbb391, 0xdcc9a8, 0xe8dcc4, 0xbfa27e, 0xd6c4a4, 0xa8916f];

  /* -------------------------------------------------------------------
   * ZONE 4 — The Wasteland (cracked black earth, giant storm, lightning)
   * ----------------------------------------------------------------- */
  let warrior = null;
  function buildWasteland() {
    const g = new THREE.Group();

    // Cracked near-black earth.
    g.add(drapeDisc(SR.DESERT, WASTE_R, { ground: 'rock', color: 0x2e2b28 }));

    // Glowing molten fissures: a second draped disc using the crack pattern as
    // an emissive/alpha map so only the cracks light up orange — big color in
    // an otherwise black zone, and it pulses like embers.
    // Same fixed-seed crack pattern AND same tiling as the ground disc (r150),
    // so the orange glow stays registered to the visible cracks.
    const crackTex = keep(tileTex(makeCrackTexture(), WASTE_R));
    const lavaMat = new THREE.MeshBasicMaterial({
      color: 0xff5a1e, map: crackTex, alphaMap: crackTex,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    disposables.push(lavaMat);
    const lavaF = frameAt(SR.DESERT);
    const lavaGeo = keep(new THREE.RingGeometry(0.01, WASTE_R, 48, 8).rotateX(-Math.PI / 2));
    // Drape it onto the terrain like the ground disc.
    {
      const baseR = lavaF.pos.length();
      const _dw = new THREE.Vector3();
      const p = lavaGeo.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), z = p.getZ(i);
        _dw.set(x, 0, z).applyQuaternion(lavaF.q).add(lavaF.pos).normalize();
        const rr = sampleGround(planet, _dw);
        p.setY(i, Math.sqrt(Math.max(rr * rr - (x * x + z * z), 0)) - baseR + 0.12);
      }
      lavaGeo.computeVertexNormals();
    }
    const lava = new THREE.Mesh(lavaGeo, lavaMat);
    lava.position.copy(lavaF.pos); lava.quaternion.copy(lavaF.q);
    lava.frustumCulled = false; lava.renderOrder = 1;
    g.add(lava);

    // Drifting embers rising from the cracks.
    const emberMat = new THREE.PointsMaterial({
      color: 0xff8a3a, size: 0.5, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    disposables.push(emberMat);
    const EMB = 300;
    const emberGeo = keep(new THREE.BufferGeometry());
    const emberPos = new Float32Array(EMB * 3);
    const emberBase = [];
    {
      const dir = new THREE.Vector3(), pos = new THREE.Vector3();
      for (let i = 0; i < EMB; i++) {
        pathDirInto(SR.DESERT - 120 * Z + rng() * 240 * Z, (rng() - 0.5) * 220 * Z, dir);
        pos.copy(dir).multiplyScalar(sampleGround(planet, dir) + rng() * 18);
        emberPos[i * 3] = pos.x; emberPos[i * 3 + 1] = pos.y; emberPos[i * 3 + 2] = pos.z;
        emberBase.push({ up: dir.clone(), phase: rng() * 20, speed: 1 + rng() * 2, span: 16 + rng() * 8, gy: sampleGround(planet, dir) });
      }
    }
    emberGeo.setAttribute('position', new THREE.BufferAttribute(emberPos, 3));
    const embers = new THREE.Points(emberGeo, emberMat);
    embers.frustumCulled = false;
    g.add(embers);

    // Dead black trees and ash-grey rock scatter.
    g.add(scatterInstanced(deadTreeGeo(), materials.make('bark', { repeat: 2, color: 0x2a2622 }), 40, () => ({
      d: SR.DESERT - 130 * Z + rng() * 260 * Z,
      lat: (rng() - 0.5) * 240 * Z,
      yaw: rng() * Math.PI * 2,
      s: 0.7 + rng() * 1.1,
    })));
    g.add(scatterInstanced(keep(new THREE.DodecahedronGeometry(0.3, 0)), materials.make('rock', { repeat: 1, color: 0x6a6664 }), 150, () => ({
      d: SR.DESERT - 120 * Z + rng() * 240 * Z,
      lat: (rng() - 0.5) * 220 * Z,
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
    // Sized to the zone, not to the sky. At 240 m the outer disc reached from
    // the confession circle to past the garden and hung a storm ceiling over the
    // entire world; the circle is supposed to be under warm dusk. 100 m spans
    // 256-456, so it closes over the tail of the queue — you walk into the
    // weather, which is the point — and stops short of the garden.
    const DISCS = [
      { r: 100, h: 70, op: 0.5, tint: 0x3a3f38, speed: 0.03 },
      { r: 80, h: 62, op: 0.65, tint: 0x2a2e28, speed: -0.05 },
      { r: 58, h: 54, op: 0.8, tint: 0x1c1e1a, speed: 0.08 },
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
    // The hanging cloud fringe that used to sit under the outer rim is gone. It
    // was thirty flattened eight-by-six spheres standing in for cloud, which was
    // the right call when the sky was a flat colour; against a raymarched deck
    // at 86% cover they read as exactly what they are — polygons — and they were
    // competing with real cloud for the same piece of sky. The swirl discs stay:
    // they draw the eye of the storm, which the sky's own weather cannot.

    // Lightning bolts: jagged Lines flashing via the creatures.js spike curve,
    // the brightest one driving a single shared ground-flash light.
    const bolts = [];
    for (let i = 0; i < 8; i++) {
      // Inside the storm's new footprint, striking down from its underside.
      const a = rng() * Math.PI * 2, rr = 14 + rng() * 62;
      const bx = Math.cos(a) * rr, bz = Math.sin(a) * rr;
      const segs = 6 + Math.floor(rng() * 3);
      const pts = [];
      for (let s2 = 0; s2 <= segs; s2++) {
        const f2 = s2 / segs;
        pts.push(new THREE.Vector3(
          bx + (rng() - 0.5) * 14 * (0.4 + f2 * 0.8),
          52 * (1 - f2),
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

    const _ep = new THREE.Vector3();
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
      // Molten cracks pulse; embers rise and loop.
      lavaMat.opacity = 0.7 + 0.3 * Math.sin(t * 1.3);
      const arr = emberGeo.attributes.position.array;
      for (let i = 0; i < EMB; i++) {
        const e = emberBase[i];
        const rise = ((t * e.speed + e.phase) % e.span);
        _ep.copy(e.up).multiplyScalar(e.gy + rise);
        arr[i * 3] = _ep.x; arr[i * 3 + 1] = _ep.y; arr[i * 3 + 2] = _ep.z;
      }
      emberGeo.attributes.position.needsUpdate = true;
    });

    // The Thinking Stone at the eye of the storm, with a dim warm keeper light
    // so the Warrior reads under the dark sky.
    const stone = new THREE.Mesh(keep(new THREE.CylinderGeometry(1.3, 1.5, 1.0, 9)), materials.make('rock', { repeat: 1.5, color: 0xd8cdb8 }));
    const stoneDir = pathDir(SR.DESERT, 0);
    placeAtDir(stone, planet, stoneDir, 0.5);
    orientOnSurface(stone, stoneDir, 0);
    g.add(stone);
    const eyeLight = new THREE.PointLight(0xffd9a8, 2.5, 50, 2);
    placeAtDir(eyeLight, planet, stoneDir, 5);
    g.add(eyeLight);
    addEventLight(eyeLight, SR.DESERT, 0); // dims beside the Warrior

    // The Warrior: crimson-and-bronze armor, boxy pauldrons, a helmet crest,
    // and a great blade planted point-down in the stone beside him.
    const wr = tintRig('warrior', 0x7a5038, 0x9c2f2f);
    const wsc = wr.params.scaleY;
    const bronze = stdMat(0xb5893a, { rough: 0.5, metal: 0.6, emis: 0.1 });
    const crimson = stdMat(0x9c2f2f, { rough: 0.6, emis: 0.12 });
    const pauldron = keep(new THREE.BoxGeometry(0.34 * wsc, 0.2 * wsc, 0.34 * wsc));
    meshOn(wr.joints.shoulders, pauldron, bronze, -0.3 * wsc, 0.02 * wsc, 0);
    meshOn(wr.joints.shoulders, pauldron, bronze, 0.3 * wsc, 0.02 * wsc, 0);
    meshOn(wr.joints.torso, keep(new THREE.BoxGeometry(0.5 * wsc, 0.5 * wsc, 0.32 * wsc)), crimson, 0, 0.28 * wsc, 0); // chest plate
    meshOn(wr.joints.head, keep(new THREE.ConeGeometry(0.07 * wsc, 0.34 * wsc, 4)), crimson, 0, 0.34 * wsc, 0, 0, Math.PI / 4); // crest
    wr.group.scale.multiplyScalar(1.15); // composes with the ×2 in tintRig
    wr.params.groundOffset *= 1.15;
    seatRig(wr, 0.6);
    placeRig(wr, pathDir(SR.DESERT, 0), Math.PI);
    addLooker(wr, () => !has('warrior_embraced'));
    g.add(wr.group);
    warrior = { rig: wr, talkedOnce: false };
    // Seated cross-legged on the raised stone; drop lifts the portrait's feet
    // from the base terrain (sampleGround) up onto the platform he sits on.
    attachHologram(wr, 'warrior', { height: 2.4, drop: 0.55, activeFn: () => !has('warrior_embraced') });

    // The planted greatsword — a strong silhouette beside the stone.
    const swordParts = [
      new THREE.BoxGeometry(0.16, 3.2, 0.05).translate(0, 1.6, 0),      // blade
      new THREE.BoxGeometry(0.7, 0.14, 0.1).translate(0, 0.15, 0),      // crossguard
      new THREE.CylinderGeometry(0.05, 0.05, 0.5, 6).translate(0, -0.2, 0), // grip
      new THREE.SphereGeometry(0.09, 6, 5).translate(0, -0.48, 0),      // pommel
    ];
    const sword = new THREE.Mesh(keep(mergeParts(swordParts)), bronze);
    const swordDir = pathDir(SR.DESERT + 2.4, 2.2);
    placeAtDir(sword, planet, swordDir, 0.9);
    orientOnSurface(sword, swordDir, 0.5);
    sword.rotation.z += 0.12;
    g.add(sword);

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
    g.add(drapeDisc(SR.ROOM, SR.ROOM_INNER_R + 8, { color: 0x17161a }));

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
    // Higher floor than the others: this is the only light in the room, and
    // the monster's material reveal still has to read. The shaft fades along.
    addEventLight(light, SR.ROOM, 0, {
      floor: 0.25,
      onFade: (f) => { coneMat.opacity = 0.03 * f; },
    });

    // The mirror-self: the player's own astronaut. It begins matte black and
    // resolves into the real suit as you approach. A fresnel rim (pale
    // grey-blue outline) makes the shadow READ in the void before it is
    // understood — fading out as the figure resolves.
    const astro = new Astronaut();
    const rimUniform = { value: 0.9 };
    const mirrorMats = [];
    {
      // astronaut.js materials are module-level and shared with the player's
      // own model — clone every one before tinting so the reveal never
      // darkens the player.
      const cloned = new Map();
      astro.group.traverse((o) => {
        if (!o.isMesh) return;
        disposables.push(o.geometry);
        let mat = cloned.get(o.material);
        if (!mat) {
          mat = o.material.clone();
          cloned.set(o.material, mat);
          disposables.push(mat);
          mirrorMats.push({
            mat,
            baseColor: mat.color.clone(),
            baseEI: mat.emissiveIntensity ?? 0,
          });
          mat.onBeforeCompile = (shader) => {
            shader.uniforms.uRim = rimUniform;
            shader.fragmentShader = 'uniform float uRim;\n' + shader.fragmentShader.replace(
              '#include <emissivemap_fragment>',
              `#include <emissivemap_fragment>
              {
                vec3 rvDir = normalize(vViewPosition);
                float rim = pow(1.0 - clamp(abs(dot(rvDir, normalize(vNormal))), 0.0, 1.0), 3.0);
                totalEmissiveRadiance += vec3(0.55, 0.62, 0.78) * rim * uRim;
              }`
            );
          };
        }
        o.material = mat;
      });
    }
    // Reveal k: 0 = pure shadow, 1 = the astronaut's true suit colors (and its
    // own emissive accents — visor glow, chest display — coming back online).
    const setReveal = (k) => {
      for (const e of mirrorMats) {
        e.mat.color.copy(e.baseColor).multiplyScalar(0.02 + 0.98 * k);
        e.mat.emissiveIntensity = e.baseEI * k;
      }
      rimUniform.value = 0.9 * (1 - k) + 0.08;
    };
    setReveal(0);
    placeAtDir(astro.group, planet, roomCenterDir, 0); // feet at y=0
    orientOnSurface(astro.group, roomCenterDir, 0); // faces the entrance
    g.add(astro.group);
    mirror = { astro, group: astro.group, reveal: 0, rimUniform };

    entities.push({
      pos: bodyPosAt(SR.ROOM, 0),
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

    // Mirror behaviour: shadow → true suit by proximity; after facing, it mimics.
    const _mp = new THREE.Vector3(), _refl = new THREE.Vector3();
    zoneUpdaters.push((t, dt, pl) => {
      const d = pl.distanceTo(mirror.group.position);
      if (!has('monster_faced')) {
        const target = THREE.MathUtils.clamp(1 - (d - 3) / 16, 0, 1);
        mirror.reveal += (target - mirror.reveal) * Math.min(1, 3 * dt);
        setReveal(mirror.reveal);
        astro.update(dt, 'idle', 0);
      } else {
        // Fully itself now — ease the last of the shadow off.
        if (mirror.reveal < 1) {
          mirror.reveal += (1 - mirror.reveal) * Math.min(1, 3 * dt);
          setReveal(mirror.reveal);
        }
        // Reflect the player across the room center in the room frame, mirror pose.
        _mp.copy(pl).sub(roomFrame.pos).applyQuaternion(roomFrame.qInv);
        _refl.set(-_mp.x, 0, -_mp.z);
        const dir2 = _refl.applyQuaternion(roomFrame.q).add(roomFrame.pos).normalize();
        placeAtDir(astro.group, planet, dir2, 0);
        faceRig(mirror, dir2, pl); // face the player (faceRig reads .group)
        const spd = mirrorSpeed;
        astro.update(dt, spd > 0.6 ? 'run' : 'idle', Math.min(spd / 8, 1));
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
    g.add(drapeDisc(SR.GARDEN, 34, { ground: 'groundCover', color: 0x357f40 }));

    // Golden-hour light over the whole garden. The garden sits past the
    // terminator (night side) — the story's "warm gold light" radiates from
    // the garden itself: two strong warm lights + emissive-lifted planting.
    const gold = new THREE.PointLight(0xffdcae, 7.0, 220, 2);
    placeAtDir(gold, planet, pathDir(SR.GARDEN, 0), 12);
    g.add(gold);
    addEventLight(gold, SR.GARDEN, 2); // dims at the Stranger's side
    // The approach light sits just clear of the round room's outer wall (459 m),
    // so it reads as warmth waiting at the far side of the door rather than as a
    // lamp burning inside the black room. The far light stays inside the
    // garden's own carpet.
    const goldApproach = new THREE.PointLight(0xffcf90, 3.5, 110, 2);
    placeAtDir(goldApproach, planet, pathDir(SR.GARDEN - 26, 0), 8);
    g.add(goldApproach);
    const goldFar = new THREE.PointLight(0xffcf90, 3.0, 110, 2);
    placeAtDir(goldFar, planet, pathDir(SR.GARDEN + 26, 20), 8);
    g.add(goldFar);

    // Deep green swaying grass with a warm emissive floor for the night side.
    const bladeGeo = makeBladeGeo(0x2a7a34, 0x7cc85e, 0.3);
    const grassMat = makeSwayMaterial({ vertexColors: true, emis: 0.2, emisColor: 0x8a7a3a });
    g.add(scatterInstanced(bladeGeo, grassMat, 6000, () => ({
      d: SR.GARDEN - 120 * Z + rng() * 220 * Z,
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
      d: SR.GARDEN - 35 * Z + rng() * 90 * Z,
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
      d: SR.GARDEN - 90 * Z + rng() * 190 * Z,
      lat: (rng() < 0.5 ? -1 : 1) * (50 + rng() * 45),
      yaw: rng() * Math.PI * 2,
      s: 0.9 + rng() * 0.8,
    })));

    // The bare tree with the windowpane leaning against it.
    const trunk = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.4, 0.6, 6, 7)), materials.make('bark', { repeat: 2.5, color: 0x8a6c50 }));
    const treeDir = pathDir(SR.GARDEN + 14, 8);
    placeAtDir(trunk, planet, treeDir, 3);
    orientOnSurface(trunk, treeDir, 0);
    g.add(trunk);
    const paneFrame = new THREE.Mesh(keep(new THREE.BoxGeometry(1.6, 2.2, 0.12)), materials.make('wood', { repeat: 1, color: 0xb0a077 }));
    // The windowpane shows a dream: one of the owner's own paintings, softly
    // self-lit so the memory reads in the night garden.
    let paneMat;
    if (DREAM_ART_URL) {
      const dreamTex = new THREE.TextureLoader().load(DREAM_ART_URL);
      dreamTex.colorSpace = THREE.SRGBColorSpace;
      dreamTex.anisotropy = 8;
      disposables.push(dreamTex);
      paneMat = stdMat(0xffffff, { rough: 0.35, map: dreamTex, transparent: true, opacity: 0.94, side: THREE.DoubleSide });
      paneMat.emissive = new THREE.Color(0xffffff);
      paneMat.emissiveMap = dreamTex;
      paneMat.emissiveIntensity = 0.42;
    } else {
      paneMat = stdMat(0xdce8f0, { rough: 0.1, metal: 0.3, transparent: true, opacity: 0.25 });
    }
    const pane = new THREE.Mesh(keep(new THREE.PlaneGeometry(1.4, 2.0)), paneMat);
    const paneDir = pathDir(SR.GARDEN + 13, 6.6);
    placeAtDir(paneFrame, planet, paneDir, 1.1);
    orientOnSurface(paneFrame, paneDir, 0.5);
    paneFrame.rotateX(0.18);
    pane.position.copy(paneFrame.position); pane.quaternion.copy(paneFrame.quaternion);
    pane.translateZ(0.08);
    g.add(paneFrame, pane);

    // The Stranger: a hooded teal-and-gold traveler with a tall staff — clearly
    // a wayfarer, not one of the garden's own.
    const st = tintRig('stranger', 0xe8d8b0, 0x2f8a8a);
    const ssc = st.params.scaleY;
    addRobe(st, 0x2f8a8a, 0.62, 1.7, { emis: 0.16, emisColor: 0x3fae9e });
    meshOn(st.joints.head, keep(new THREE.ConeGeometry(0.24 * ssc, 0.42 * ssc, 8)), stdMat(0x276f6f, { rough: 0.9, emis: 0.1 }), 0, 0.22 * ssc, -0.02 * ssc); // hood
    meshOn(st.group, keep(new THREE.TorusGeometry(0.24 * ssc, 0.045 * ssc, 6, 10)), stdMat(0xe8c86a, { emis: 0.22 }), 0, 1.12 * ssc, 0, Math.PI / 2); // gold belt
    seatRig(st, 0);
    placeRig(st, pathDir(SR.GARDEN, 2), Math.PI);
    addLooker(st, () => !endingStarted);
    g.add(st.group);
    attachHologram(st, 'stranger', { height: 3.0, activeFn: () => !endingStarted }); // seated traveler
    // The staff, leaning beside him with a glowing gold finial.
    const staff = new THREE.Mesh(keep(mergeParts([
      coloredGeo(new THREE.CylinderGeometry(0.05, 0.06, 2.6, 6).translate(0, 1.3, 0), 0x6b4a30),
      coloredGeo(new THREE.IcosahedronGeometry(0.16, 0).translate(0, 2.7, 0), 0xe8c86a),
    ])), stdMat(0xffffff, { rough: 0.7, emis: 0.25 }));
    staff.material.vertexColors = true;
    const staffDir = pathDir(SR.GARDEN + 1.4, 3.4);
    placeAtDir(staff, planet, staffDir, 0);
    orientOnSurface(staff, staffDir, 0);
    staff.rotation.z = 0.22;
    g.add(staff);
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

    // Drifting fireflies — warm and green motes that bob over the beds, so the
    // night garden shimmers with color instead of reading flat and dark.
    const fireMat = new THREE.PointsMaterial({
      size: 0.35, vertexColors: true, transparent: true, opacity: 0.9,
      depthWrite: false, blending: THREE.AdditiveBlending,
    });
    disposables.push(fireMat);
    const FN = 220;
    const fireGeo = keep(new THREE.BufferGeometry());
    const firePos = new Float32Array(FN * 3);
    const fireCol = new Float32Array(FN * 3);
    const fireBase = [];
    {
      const dir = new THREE.Vector3(), pos = new THREE.Vector3(), c = new THREE.Color();
      const hues = [0xfff0a0, 0xa8ff90, 0xffcf7a, 0xd0ffe0];
      for (let i = 0; i < FN; i++) {
        pathDirInto(SR.GARDEN - 90 * Z + rng() * 170 * Z, (rng() - 0.5) * 130, dir);
        const gy = sampleGround(planet, dir);
        pos.copy(dir).multiplyScalar(gy + 0.6 + rng() * 2.4);
        firePos[i * 3] = pos.x; firePos[i * 3 + 1] = pos.y; firePos[i * 3 + 2] = pos.z;
        c.setHex(hues[Math.floor(rng() * hues.length)]);
        fireCol[i * 3] = c.r; fireCol[i * 3 + 1] = c.g; fireCol[i * 3 + 2] = c.b;
        fireBase.push({ up: dir.clone(), gy, base: 0.6 + rng() * 2.4, amp: 0.3 + rng() * 0.6, ph: rng() * 20, sp: 0.5 + rng() });
      }
    }
    fireGeo.setAttribute('position', new THREE.BufferAttribute(firePos, 3));
    fireGeo.setAttribute('color', new THREE.BufferAttribute(fireCol, 3));
    const fireflies = new THREE.Points(fireGeo, fireMat);
    fireflies.frustumCulled = false;
    g.add(fireflies);

    // Pale glowing moths circling the night garden's lamps.
    g.add(makeFlutter(24, {
      d0: SR.GARDEN - 90 * Z, dSpan: 160 * Z, latSpan: 110,
      colors: [0xfff0c0, 0xd0ffe0, 0xffd0f0],
      emis: 0.5, emisColor: 0xfff0c0,
    }));

    const _fp = new THREE.Vector3();
    zoneUpdaters.push((t, dt) => {
      // (sprout growth is keyframed via sproutMixer in startEnding)
      const arr = fireGeo.attributes.position.array;
      for (let i = 0; i < FN; i++) {
        const f = fireBase[i];
        const h = f.gy + f.base + Math.sin(t * f.sp + f.ph) * f.amp;
        _fp.copy(f.up).multiplyScalar(h);
        arr[i * 3] = _fp.x; arr[i * 3 + 1] = _fp.y; arr[i * 3 + 2] = _fp.z;
      }
      fireGeo.attributes.position.needsUpdate = true;
      fireMat.opacity = 0.7 + 0.3 * Math.sin(t * 3);
    });
    return { group: g };
  }

  // The garden's closing sequence: sprout → mask removal → dissolve → complete.
  // The mask and sprout beats are keyframed (AnimationMixer, LoopOnce +
  // clampWhenFinished) instead of popping — the schedule() timings that gate
  // story flags are unchanged.
  let maskMixer = null, sproutMixer = null;
  function startEnding() {
    if (endingStarted) return;
    endingStarted = true;
    sprout.mesh.visible = true;
    {
      const tr = new THREE.VectorKeyframeTrack('.scale', [0, 2.4, 3.2],
        [0.001, 0.001, 0.001, 1.15, 1.15, 1.15, 1, 1, 1]);
      tr.setInterpolation(THREE.InterpolateSmooth); // overshoot bounce
      const clip = new THREE.AnimationClip('sproutGrow', 3.2, [tr]);
      sproutMixer = new THREE.AnimationMixer(sprout.mesh);
      const a = sproutMixer.clipAction(clip);
      a.loop = THREE.LoopOnce; a.clampWhenFinished = true; a.play();
    }
    queueToast(TXT.toastSprout, 4, 0.2);
    schedule(4, () => {
      // The cloaked figure lifts the mask away: it floats up off his face,
      // tumbling slowly, flaring blue once (bloom), then dimming — keyframed
      // in the mask's own head-local space so it starts exactly where it sat.
      const cf = cloakedFigure;
      if (cf) {
        const sc = cf.rig.params.scaleY;
        const p0 = cf.mask.position;
        const q0 = cf.mask.quaternion;
        const qEnd = q0.clone().multiply(
          new THREE.Quaternion().setFromEuler(new THREE.Euler(0.9, 1.4, 0.4)));
        const qMid = q0.clone().slerp(qEnd, 0.5);
        const pos = new THREE.VectorKeyframeTrack('.position', [0, 1.2, 3.5], [
          p0.x, p0.y, p0.z,
          p0.x + 0.1 * sc, p0.y + 0.8 * sc, p0.z + 0.5 * sc,
          p0.x + 0.25 * sc, p0.y + 2.2 * sc, p0.z + 1.1 * sc,
        ]);
        pos.setInterpolation(THREE.InterpolateSmooth);
        const quat = new THREE.QuaternionKeyframeTrack('.quaternion', [0, 1.7, 3.5], [
          q0.x, q0.y, q0.z, q0.w,
          qMid.x, qMid.y, qMid.z, qMid.w,
          qEnd.x, qEnd.y, qEnd.z, qEnd.w,
        ]);
        const emis = new THREE.NumberKeyframeTrack('.material.emissiveIntensity',
          [0, 0.8, 3.5], [0.5, 2.0, 0.4]);
        const clip = new THREE.AnimationClip('maskAway', 3.5, [pos, quat, emis]);
        maskMixer = new THREE.AnimationMixer(cf.mask);
        const a = maskMixer.clipAction(clip);
        a.loop = THREE.LoopOnce; a.clampWhenFinished = true; a.play();
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
      if (circleCrowd) circleCrowd.startFade(2); // begin vanishing
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
    } else if (f === 'mask_removed') {
      // The sky comes back. From here it stops answering to where the player is
      // standing and runs the garden's dawn up into the meadow's morning on its
      // own clock — the light the walk has been descending away from since the
      // first zone, returned as the story's resolution.
      endingSky = 0;
    }
  }

  /* -------------------------------------------------------------------
   * Triggers (proximity, fired once, in order)
   * ----------------------------------------------------------------- */
  // Radii tightened with the spacing. At the old 18/20 m these bands were a
  // fraction of a 225 m gap; against the 34 m between the crossing and the
  // circle they overlapped, so walking one stretch of path fired both beats on
  // consecutive frames and the pause between them disappeared.
  const triggers = [
    { dist: SR.RIVER_CROSS, radius: 8, requires: 'flower_given', fired: false,
      fn: () => advance('river_crossed') },
    { dist: SR.CIRCLE, radius: 10, requires: 'river_crossed', fired: false,
      fn: () => {
        // Overheard monologue as a timed toast chain; then the circle vanishes.
        TXT.confession.forEach((line, i) => queueToast(line, 5, i * 5));
        schedule(TXT.confession.length * 5, () => advance('circle_triggered'));
      } },
    { dist: SR.GIRL, radius: 10, requires: 'circle_triggered', fired: false,
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
    buildGuidePath(),
  ];
  for (const z of zoneGroups) group.add(z.group);

  // ---- Objective beacon: a tall glowing beam over the NEXT goal, so the
  // player always knows where to walk. Repositioned by story stage. ----
  const OBJECTIVES = [
    { d: SR.LADY, lat: 4 },     // 0: reach the Lady, take the flower
    { d: SR.RIVER_CROSS, lat: 0 }, // 1: cross the river
    { d: SR.CIRCLE, lat: 0 },   // 2: the confession circle
    { d: SR.GIRL, lat: 0 },     // 3: the line / the girl
    { d: SR.DESERT, lat: 0 },   // 4: the warrior
    { d: SR.ROOM, lat: 0 },     // 5: the round room
    { d: SR.GARDEN, lat: 2 },   // 6: the stranger
    null,                        // 7: complete — beacon off
  ];
  const beaconHolder = new THREE.Group();
  // Vertical fade: CylinderGeometry's V coordinate runs along height, so a
  // simple gradient alphaMap dissolves the column into the sky (no hard cap).
  const beamAlpha = keep(makeCanvasTex(64, (ctx, S) => {
    const grad = ctx.createLinearGradient(0, S, 0, 0);
    grad.addColorStop(0, '#fff');
    grad.addColorStop(0.55, '#9a9a9a');
    grad.addColorStop(1, '#000');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, S, S);
  }));
  const beamMat = new THREE.MeshBasicMaterial({
    color: 0x9fe8ff, transparent: true, opacity: 0.26, alphaMap: beamAlpha,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  disposables.push(beamMat);
  const beam = new THREE.Mesh(keep(new THREE.CylinderGeometry(1.5, 2.4, 48, 12, 1, true)), beamMat);
  beam.position.y = 24;
  beam.frustumCulled = false;
  beam.renderOrder = 5;
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0x9fe8ff, transparent: true, opacity: 0.5,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  disposables.push(ringMat);
  const ring = new THREE.Mesh(keep(new THREE.RingGeometry(2.6, 3.4, 24).rotateX(-Math.PI / 2)), ringMat);
  ring.position.y = 0.3;
  ring.frustumCulled = false;
  ring.renderOrder = 5;
  beaconHolder.add(beam, ring);
  group.add(beaconHolder);
  let beaconStage = -1;
  function updateBeacon(t) {
    if (beaconStage !== stage) {
      beaconStage = stage;
      const obj = OBJECTIVES[stage];
      beaconHolder.visible = !!obj;
      if (obj) {
        const dir = pathDir(obj.d, obj.lat);
        placeAtDir(beaconHolder, planet, dir, 0);
        orientOnSurface(beaconHolder, dir, 0);
      }
    }
    if (beaconHolder.visible) {
      beamMat.opacity = 0.20 + 0.10 * Math.sin(t * 2.2);
      ring.rotation.y = t * 0.6;
    }
  }

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
    lastDt = dt;
    _pl.copy(playerPos);
    if (!prevInit) { _prevPl.copy(_pl); prevInit = true; }
    mirrorSpeed = _pl.distanceTo(_prevPl) / Math.max(dt, 1e-4);

    pathCoords(_pl, _coords);
    updateSky(dt, _coords.dist, _pl);

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

    // The two crowds: idle motion, and promoting whoever the player is standing
    // among into articulated bodies.
    if (circleCrowd) circleCrowd.update(t, dt, _pl);
    if (queueCrowd) queueCrowd.update(t, dt, _pl);

    // Event lights dim out while the player stands in them (up close they wash
    // out the character art) and come back as the player leaves.
    for (const el of eventLights) {
      const d = _pl.distanceTo(el.anchor);
      const k = THREE.MathUtils.smoothstep(d, el.near, el.far);
      const f = el.floor + (1 - el.floor) * k;
      el.cur += (f - el.cur) * Math.min(1, 5 * dt);
      el.light.intensity = el.base * el.cur;
      if (el.onFade) el.onFade(el.cur);
    }

    // Move the objective beacon to the current goal.
    updateBeacon(t);

    // Living-character systems: head tracking + breathing, butterflies/moths,
    // and the keyframed ending beats (mask float-away, sprout bounce).
    updateLookers(dt, t);
    updateFlutters(t);
    if (maskMixer) maskMixer.update(dt);
    if (sproutMixer) sproutMixer.update(dt);

    // Companion followers trail behind the player along the path.
    updateFollowers(dt, t);

    // Player-facing portrait holograms (after rigs move, so we read final pos).
    updateHolograms(t);

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
  function nearestInteractable(playerLocal, maxDist = 5.2) {
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

  // Crowd state, for headless verification: how many of each crowd have been
  // promoted to articulated bodies, and whether the dissolve has finished.
  function debugCrowds() {
    return {
      circle: circleCrowd
        ? { rigs: circleCrowd.rigCount, faded: circleCrowd.faded } : null,
      queue: queueCrowd
        ? { rigs: queueCrowd.rigCount, faded: queueCrowd.faded } : null,
    };
  }

  // Fire both crowd dissolves directly, for headless verification — the story
  // route to them runs through a five-line toast chain and a dialogue close.
  function debugFadeCrowds() {
    if (circleCrowd) circleCrowd.startFade(2);
    if (queueCrowd) queueCrowd.startFade(2.5);
  }

  // Which two presets the sky is currently between, and how far. `force` starts
  // the ending brightening without playing seven flags' worth of story.
  function debugSky(force = false) {
    if (force && endingSky < 0) endingSky = 0;
    return { a: _skyBlend.a, b: _skyBlend.b, k: +_skyBlend.k.toFixed(3), ending: endingSky };
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
    // First: the sky owns scene.fog and scene.environment, which belong to the
    // root scene and outlive this module.
    if (sky) sky.dispose();
    if (circleCrowd) circleCrowd.dispose();
    if (queueCrowd) queueCrowd.dispose();
    materials.dispose(); // the registry owns its own textures and materials
    for (const d of dissolves) d.dispose();
    dissolves.length = 0;
    holograms.length = 0;
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
    preRender,
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
    debugCrowds,
    debugFadeCrowds,
    debugSky,
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
