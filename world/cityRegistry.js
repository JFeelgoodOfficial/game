// The permanent-city registry. Cities used to be "pop-up": procedurally
// seeded from wherever the ship touched down and rebuilt differently on
// every landing. Now each landable world (except the total-conversion
// story worlds) carries 2-3 PERMANENT cities defined here — fixed site,
// fixed seed, fixed landing pad — so a player who lands twice finds the
// same streets both times (the ACTUALITY_SITE principle, world-wide).
//
// Adding a city is ONE config object appended to CITIES below — walk.js
// auto-adopts the nearest entry on disembark and game.js auto-targets the
// nearest pad on auto-land, exactly like a planet CONFIGS entry.
//
// Conventions (the same frame contract as world/wonders.js):
//   - `site` is a unit direction in planet.surface's UNROTATED local frame.
//     Sites were chosen offline against src/terrain.js (deterministic, exact
//     CPU port of the surface shaders) for dry, flat, well-separated ground —
//     see the water rule below. Never place a site above |y| ~0.88: polar
//     cities sit on degenerate tangent frames and spin in place.
//   - `pad` is the landing-pad center in CITY-LOCAL coordinates — the frame
//     createCity builds in: quaternion setFromUnitVectors(+Y, site) applied
//     to (x, 0, z), origin at site * baseRadius. padLocalDir() reproduces
//     that mapping without building the city, which is what lets the
//     auto-land arc target a pad from orbit.
//   - `wonder.bearing`/`wonder.dist` place the city's unique wonder on the
//     tangent frame from siteFrame() (ref +Y below |y| 0.94, +X above —
//     the beginAutoLand convention). Bearings were probed for dry ground.
//
// The water rule (city count follows water coverage): high-water worlds get
// 2 dense neon-vertical cities (oceana, neptunia — the sea forces density);
// arid worlds spread out into 3 frontier outposts (rustia, wyattmattoe);
// temperate/frozen worlds sit between (terra, glacia — 2 each).
//
// Vendor `role` keys index world/vendor-dialogue.js; `voice` picks the
// per-world flavor variant of each tree. `vars` fills that vendor's
// {{goods}}-class placeholders so one static tree serves many mouths.

import * as THREE from 'three';

const V = (x, y, z) => new THREE.Vector3(x, y, z).normalize();

export const CITIES = [
  // --- terra: temperate start world, one dense capital + one garden town ---
  {
    world: 'terra',
    id: 'terra-meridian',
    name: 'Meridian Crown',
    site: V(-0.671490, 0.721225, 0.170105),
    style: 'neonMetropolis',
    radius: 150,
    seed: 0x51a7c3e1,
    pad: { x: 41, z: -71 },
    voice: 'neon',
    wonder: { type: 'elevator', title: 'The Skyroot Elevator', bearing: 2.36, dist: 800, seed: 0x1111a001 },
    flavor: 'First-landfall port of the golden valley — every trade route in the system threads its towers.',
    vendors: [
      { role: 'merchant', name: 'Voss Enterin', spot: 'plaza0', vars: { goods: 'valley amber and hull ceramic' } },
      { role: 'entertainer', name: 'Loreth Una', spot: 'plaza1' },
      { role: 'elite', name: 'Patron Axilo', spot: 'tower' },
      { role: 'apprentice', name: 'Shi Vael', spot: 'pad' },
    ],
  },
  {
    world: 'terra',
    id: 'terra-goldenvale',
    name: 'Goldenvale Terraces',
    site: V(-0.922231, -0.255575, -0.290125),
    style: 'verdantTerrace',
    radius: 130,
    seed: 0x62b8d4f2,
    pad: { x: 64, z: 64 },
    voice: 'garden',
    wonder: { type: 'grove', title: 'The Luminous Grove', bearing: 3.53, dist: 360, seed: 0x1111a002 },
    flavor: 'Breadbasket of the golden valley: terraced fields, flower markets, and slow rivers of pollen light.',
    vendors: [
      { role: 'farmer', name: 'Melqor Oss', spot: 'plaza0', vars: { crop: 'gold barley', lowCrop: 'dew lettuce' } },
      { role: 'gardener', name: 'Ithuna Ryn', spot: 'plaza1' },
      { role: 'caretaker', name: 'Rethlo Vael', spot: 'plaza2' },
    ],
  },

  // --- oceana: ocean world (seaLevel 0.62) — 2 dense reef-neon ports ---
  {
    world: 'oceana',
    id: 'oceana-coralspire',
    name: 'Coralspire',
    site: V(-0.964743, -0.244575, -0.097229),
    style: 'reefNeon',
    radius: 150,
    seed: 0x73c9e503,
    pad: { x: 0, z: -105 },
    voice: 'tide',
    wonder: { type: 'titan', title: 'The Tide Titan', bearing: 0.39, dist: 380, seed: 0x1111a003 },
    flavor: 'Aquaculture exchange of the island chains — kelp barges under towers that glisten like wet shell.',
    vendors: [
      { role: 'merchant', name: 'Unashi Drell', spot: 'plaza0', vars: { goods: 'reef pearls and salt-cured kelp' } },
      { role: 'guide', name: 'Qorent Axi', spot: 'pad' },
      { role: 'entertainer', name: 'Melva Oss', spot: 'plaza1' },
      { role: 'gardener', name: 'Ossuna Ryn', spot: 'plaza2' },
    ],
  },
  {
    world: 'oceana',
    id: 'oceana-saltlight',
    name: 'Saltlight Quay',
    site: V(-0.086565, -0.238975, -0.967159),
    style: 'tideLuminous',
    radius: 150,
    seed: 0x84daf614,
    pad: { x: -80, z: -21 },
    voice: 'tide',
    wonder: { type: 'arch', title: 'The Sea Arch', bearing: 2.75, dist: 340, seed: 0x1111a004 },
    flavor: 'A night-market shoal: canal streets, lantern rain, and the smell of brine and fried sweetroot.',
    vendors: [
      { role: 'merchant', name: 'Rynith Kess', spot: 'plaza0', vars: { goods: 'night-market lanterns and tide silk' } },
      { role: 'artisan', name: 'Entva Lo', spot: 'lobby0', vars: { craft: 'pearl-glass' } },
      { role: 'scholar', name: 'Axioss Chiron', spot: 'plaza1' },
    ],
  },

  // --- glacia: frozen sea — 2 frost settlements ---
  {
    world: 'glacia',
    id: 'glacia-palegate',
    name: 'Palegate',
    site: V(-0.140525, -0.526375, 0.838560),
    style: 'frostHaven',
    radius: 130,
    seed: 0x95ebf725,
    pad: { x: -64, z: 64 },
    voice: 'frost',
    wonder: { type: 'crystals', title: 'The Singing Crystals', bearing: 2.36, dist: 360, seed: 0x1111a005 },
    flavor: 'The caravan gate onto the frozen sea — sledge trains load under warm doorlight at the ice edge.',
    vendors: [
      { role: 'merchant', name: 'Umeth Vael', spot: 'plaza0', vars: { goods: 'sledge runners and vacuum-wool' } },
      { role: 'caretaker', name: 'Shiqor Una', spot: 'plaza1' },
      { role: 'scholar', name: 'Vaoss Reth', spot: 'lobby0' },
    ],
  },
  {
    world: 'glacia',
    id: 'glacia-hearthfall',
    name: 'Hearthfall',
    site: V(-0.942044, -0.210675, -0.261092),
    style: 'auroraHold',
    radius: 110,
    seed: 0xa6fc0836,
    pad: { x: 0, z: 60 },
    voice: 'frost',
    wonder: { type: 'geyser', title: 'The Geyser Organ', bearing: 1.96, dist: 340, seed: 0x1111a006 },
    flavor: 'A geothermal hollow where greenhouse domes steam against the aurora — the warmest place on the ice.',
    vendors: [
      { role: 'farmer', name: 'Loith Mel', spot: 'plaza0', vars: { crop: 'vent tomatoes', lowCrop: 'frost peas' } },
      { role: 'artisan', name: 'Qoruna Shi', spot: 'plaza1', vars: { craft: 'ice-carving' } },
      { role: 'entertainer', name: 'Reththi Va', spot: 'plaza2' },
    ],
  },

  // --- rustia: no water at all — 3 spread dust outposts ---
  {
    world: 'rustia',
    id: 'rustia-ochre',
    name: 'Ochre Junction',
    site: V(0.659871, 0.572175, 0.487018),
    style: 'dustOutpost',
    radius: 110,
    seed: 0xb70d1947,
    pad: { x: -38, z: 67 },
    voice: 'frontier',
    wonder: { type: 'monoliths', title: 'The Silent Monoliths', bearing: 0.39, dist: 360, seed: 0x1111a007 },
    flavor: 'Where the oxide-flat caravan tracks cross — water is currency and everyone is passing through.',
    vendors: [
      { role: 'merchant', name: 'Axent Drell', spot: 'plaza0', vars: { goods: 'water chits and filter masks' } },
      { role: 'apprentice', name: 'Melshi Lo', spot: 'pad' },
    ],
  },
  {
    world: 'rustia',
    id: 'rustia-solmara',
    name: 'Solmara',
    site: V(-0.390168, -0.349925, 0.851658),
    style: 'dustOutpost',
    radius: 110,
    seed: 0xc81e2a58,
    pad: { x: -57, z: 33 },
    voice: 'frontier',
    wonder: { type: 'sundial', title: 'The Colossal Sundial', bearing: 4.32, dist: 340, seed: 0x1111a008 },
    flavor: 'Observatory and pilgrimage town — the whole settlement keeps time by a shadow the size of a road.',
    vendors: [
      { role: 'scholar', name: 'Ossreth Kessari', spot: 'plaza0' },
      { role: 'guide', name: 'Unalo Va', spot: 'plaza1' },
      { role: 'caretaker', name: 'Ithax Qor', spot: 'plaza2' },
    ],
  },
  {
    world: 'rustia',
    id: 'rustia-redline',
    name: 'Redline Claim',
    site: V(-0.936373, -0.264475, -0.230776),
    style: 'dustOutpost',
    radius: 110,
    seed: 0xd92f3b69,
    pad: { x: 38, z: 67 },
    voice: 'frontier',
    wonder: { type: 'ringworld', title: 'The Broken Ring', bearing: 4.71, dist: 850, seed: 0x1111a009 },
    flavor: 'A mining claim under a dead orbital ring — vat domes grow dinner in the shadow of someone else\'s ruin.',
    vendors: [
      { role: 'farmer', name: 'Vaqor Ith', spot: 'plaza0', vars: { crop: 'vat greens', lowCrop: 'dust melon' } },
      { role: 'artisan', name: 'Shioss Ent', spot: 'plaza1', vars: { craft: 'oxide-glass' } },
      { role: 'elite', name: 'Baron Rynva', spot: 'tower' },
    ],
  },

  // --- neptunia: deep-ocean world (seaLevel 0.68) — 2 dense abyssal ports ---
  {
    world: 'neptunia',
    id: 'neptunia-indigo',
    name: 'Indigo Reach',
    site: V(-0.366274, -0.874225, -0.318707),
    style: 'abyssGlow',
    radius: 150,
    seed: 0xea404c7a,
    pad: { x: -78, z: 45 },
    voice: 'tide',
    wonder: { type: 'leviathan', title: 'Ribs of the Sound-Leviathan', bearing: 0.39, dist: 360, seed: 0x1111a00a },
    flavor: 'A trench-research port pressed against the abyss — sonar chimes roll through the streets like bells.',
    vendors: [
      { role: 'scholar', name: 'Chironel Va', spot: 'lobby0' },
      { role: 'merchant', name: 'Kessuna Oss', spot: 'plaza0', vars: { goods: 'trench charts and pressure hulls' } },
      { role: 'entertainer', name: 'Lova Ryn', spot: 'plaza1' },
    ],
  },
  {
    world: 'neptunia',
    id: 'neptunia-diamondwake',
    name: 'Diamondwake',
    site: V(0.734781, -0.639575, 0.225921),
    style: 'tideLuminous',
    radius: 150,
    seed: 0xfb515d8b,
    pad: { x: 80, z: 21 },
    voice: 'neon',
    wonder: { type: 'diamondveil', title: 'The Diamond Veil', bearing: 3.14, dist: 380, seed: 0x1111a00b },
    flavor: 'The resort at the edge of the diamond rain — netting fields catch the sky\'s glitter for the casinos.',
    vendors: [
      { role: 'artisan', name: 'Entith Umbroth', spot: 'lobby0', vars: { craft: 'diamond-cutting' } },
      { role: 'guide', name: 'Melax Shi', spot: 'pad' },
      { role: 'elite', name: 'Madame Ossva', spot: 'tower' },
    ],
  },

  // --- wyattmattoe: extreme alpine — 3 mountain outposts ---
  {
    world: 'wyattmattoe',
    id: 'wyattmattoe-kitesaddle',
    name: 'Kite Saddle',
    site: V(-0.162820, -0.210175, -0.964010),
    style: 'basecampNeon',
    radius: 110,
    seed: 0x0c626e9c,
    pad: { x: 62, z: -36 },
    voice: 'alpine',
    wonder: { type: 'skyharp', title: 'The Ridge Harp', bearing: 1.96, dist: 340, seed: 0x1111a00c },
    flavor: 'A ridge resort strung along the saddle — lift cables hum overhead and every window faces a descent.',
    vendors: [
      { role: 'guide', name: 'Rethqor Va', spot: 'pad' },
      { role: 'merchant', name: 'Unaent Lo', spot: 'plaza0', vars: { goods: 'wax, edges, and avalanche pingers' } },
      { role: 'entertainer', name: 'Ithmel Shi', spot: 'plaza1' },
    ],
  },
  {
    world: 'wyattmattoe',
    id: 'wyattmattoe-cirquehollow',
    name: 'Cirquehollow',
    site: V(0.312805, 0.879825, -0.357856),
    style: 'graniteCamp',
    radius: 110,
    seed: 0x1d737fad,
    pad: { x: 66, z: 0 },
    voice: 'alpine',
    wonder: { type: 'bell', title: 'The Cirque Bell', bearing: 1.96, dist: 300, seed: 0x1111a00d },
    flavor: 'A sheltered village on lake ice, ringed by granite walls — sound carries strangely here.',
    vendors: [
      { role: 'caretaker', name: 'Vashi Oss', spot: 'plaza0' },
      { role: 'apprentice', name: 'Qorlo Ent', spot: 'plaza1' },
      { role: 'farmer', name: 'Melith Una', spot: 'plaza2', vars: { crop: 'snow barley', lowCrop: 'scree oats' } },
    ],
  },
  {
    world: 'wyattmattoe',
    id: 'wyattmattoe-icefall',
    name: 'Icefall Landing',
    site: V(-0.291733, 0.874525, 0.387424),
    style: 'graniteCamp',
    radius: 110,
    seed: 0x2e8490be,
    pad: { x: 66, z: 0 },
    voice: 'alpine',
    wonder: { type: 'icefall', title: 'The Frozen Cascade', bearing: 1.57, dist: 320, seed: 0x1111a00e },
    flavor: 'A glaciology camp on a canyon-floor lake, under a waterfall that froze mid-leap a century ago.',
    vendors: [
      { role: 'scholar', name: 'Axreth Chiron', spot: 'plaza0' },
      { role: 'artisan', name: 'Ossshi Va', spot: 'plaza1', vars: { craft: 'bone-and-granite lutherie' } },
    ],
  },
];

// ---------------------------------------------------------------------------
// Lookups and frame helpers. All planet lookups go by cfg.name (the stations.js
// lesson: raw CONFIGS indices strand content when a planet is inserted).
// ---------------------------------------------------------------------------

export function citiesForWorld(worldName) {
  return CITIES.filter((c) => c.world === worldName);
}

const _localDir = new THREE.Vector3();
const _yAxis = new THREE.Vector3(0, 1, 0);

// Nearest registry city to a WORLD-space direction from the planet center.
// Returns { def, angRad } or null for worlds with no registry entries.
export function nearestCity(planet, worldDir) {
  const list = citiesForWorld(planet.cfg.name);
  if (!list.length) return null;
  const rotY = planet.surface?.rotation?.y ?? 0;
  _localDir.copy(worldDir).applyAxisAngle(_yAxis, -rotY).normalize();
  let best = null;
  let bestDot = -Infinity;
  for (const def of list) {
    const d = def.site.dot(_localDir);
    if (d > bestDot) { bestDot = d; best = def; }
  }
  return { def: best, angRad: Math.acos(THREE.MathUtils.clamp(bestDot, -1, 1)) };
}

// Deterministic tangent frame at a site dir — the beginAutoLand convention
// (ref +Y below |y| 0.94, +X above), shared with the offline site probe so
// registry bearings mean the same thing everywhere.
export function siteFrame(siteDir, outT1, outT2) {
  const ref = Math.abs(siteDir.y) < 0.94 ? outT1.set(0, 1, 0) : outT1.set(1, 0, 0);
  outT1.crossVectors(siteDir, ref).normalize();
  outT2.crossVectors(siteDir, outT1).normalize();
  return outT1;
}

const _quat = new THREE.Quaternion();
const _off = new THREE.Vector3();

// Base deck radius at a site: analytic ground, clamped so a wet/icy site
// rides the sea exactly like the city deck does (city.js baseRadius rule).
function siteBaseRadius(planet, siteDir) {
  const ground = planet.body?.groundAtLocal ? planet.body.groundAtLocal(siteDir) : 0;
  let r = (planet.radius ?? 900) + ground;
  if (planet.water?.r && r < planet.water.r + 0.4) r = planet.water.r + 0.4;
  return r;
}

// Surface-local unit direction of a city's landing-pad center — reproduces
// createCity's local frame (quaternion +Y -> site, origin site * baseRadius)
// without building the city, so the auto-land arc can target a pad from
// orbit. Writes into `out` and returns it.
export function padLocalDir(planet, def, out) {
  const baseR = siteBaseRadius(planet, def.site);
  _quat.setFromUnitVectors(_yAxis, def.site);
  _off.set(def.pad.x, 0, def.pad.z).applyQuaternion(_quat);
  return out.copy(def.site).multiplyScalar(baseR).add(_off).normalize();
}

const _t1 = new THREE.Vector3();
const _t2 = new THREE.Vector3();

// Surface-local unit direction of a city's wonder site, from the registry
// bearing/dist on the siteFrame tangent basis. Writes into `out`.
export function wonderLocalDir(planet, def, out) {
  siteFrame(def.site, _t1, _t2);
  const e = def.wonder.dist / (planet.radius ?? 900);
  return out
    .copy(def.site)
    .addScaledVector(_t1, Math.cos(def.wonder.bearing) * e)
    .addScaledVector(_t2, Math.sin(def.wonder.bearing) * e)
    .normalize();
}
