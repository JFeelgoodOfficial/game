// The permanent-city registry. Cities used to be "pop-up": procedurally
// seeded from wherever the ship touched down and rebuilt differently on
// every landing. Now each landable world (except the total-conversion
// story worlds) carries exactly ONE permanent flagship town defined here —
// fixed site, fixed seed, fixed landing pad — so a player who lands twice
// finds the same streets both times (the ACTUALITY_SITE principle,
// world-wide).
//
// v2 — towns of real people. Each town is ~8 named citizens, one enterable
// building per citizen, an elevator tower whose penthouse houses the
// GOVERNOR, and a landing pad just OUTSIDE the town edge with a walkway in.
// The governor gives the town's quest: a guided tour of ALL the town's
// wonders (the flagship inherited its deleted sibling cities' wonders), and
// completing the tour awards one of the four vehicles (plane, motorcycle,
// jetpack, hang glider) into the player's persistent inventory.
//
// Conventions (the same frame contract as world/wonders.js):
//   - `site` is a unit direction in planet.surface's UNROTATED local frame.
//     Sites were chosen offline against src/terrain.js (deterministic, exact
//     CPU port of the surface shaders) for dry, flat, well-separated ground —
//     never place a site above |y| ~0.88: polar cities sit on degenerate
//     tangent frames and spin in place.
//   - `pad` is the landing-pad center in CITY-LOCAL coordinates — the frame
//     createCity builds in: quaternion setFromUnitVectors(+Y, site) applied
//     to (x, 0, z), origin at site * baseRadius. padLocalDir() reproduces
//     that mapping without building the city, which is what lets the
//     auto-land arc target a pad from orbit. Pads sit OUTSIDE `radius`
//     (roughly radius + 30..45) — the walkway bridges pad to town gate.
//   - each `wonders[]` entry's `bearing`/`dist` places that wonder on the
//     tangent frame from siteFrame() (ref +Y below |y| 0.94, +X above —
//     the beginAutoLand convention). Bearings were probed for dry ground
//     (scripts/probe-pads.mjs re-runs the probe).
//
// Citizen `role` keys index world/vendor-dialogue.js when
// `dialogue: 'vendor'`; `voice` picks the per-world flavor variant of each
// tree, `vars` fills that tree's {{goods}}-class placeholders. Citizens with
// `dialogue: 'proc'` speak from seeded per-voice line banks in
// world/citizens.js. The `role: 'governor'` citizen lives in the elevator
// tower's penthouse (`home: 'penthouse'`) and speaks the quest dialogue.
// Optional `build` overrides the house kit the citizen's role implies.

import * as THREE from 'three';

const V = (x, y, z) => new THREE.Vector3(x, y, z).normalize();

export const CITIES = [
  // --- terra: Meridian Crown — dense neon capital of the golden valley ---
  {
    world: 'terra',
    id: 'terra-meridian',
    name: 'Meridian Crown',
    site: V(-0.671490, 0.721225, 0.170105),
    style: 'neonMetropolis',
    radius: 150,
    seed: 0x51a7c3e1,
    pad: { x: 92, z: -159 }, // outside the town edge, on the old approach bearing
    voice: 'neon',
    wonders: [
      { type: 'elevator', title: 'The Skyroot Elevator', bearing: 2.36, dist: 800, seed: 0x1111a001 },
      // Inherited from Goldenvale Terraces when the valley consolidated.
      { type: 'grove', title: 'The Luminous Grove', bearing: 4.90, dist: 420, seed: 0x1111a002 },
    ],
    flavor: 'First-landfall port of the golden valley — every trade route in the system threads its towers.',
    quest: {
      reward: 'plane',
      offer: [
        'The valley built the Skyroot to touch orbit, and grew the Grove to remember the ground.',
        'Walk both for me — a pilot who has stood under them flies this valley differently.',
      ],
      wonderLines: [
        'The Skyroot Elevator: our thread to the sky. Stand at its root and look up.',
        'The Luminous Grove: the valley’s oldest light. The pollen remembers everyone who passes.',
      ],
      remind: 'The tour isn’t done — the beacon knows the way. Come back when you’ve stood under them all.',
      complete: 'You’ve walked the valley’s two hearts. Take the Meridian ultralight — the sky between them is yours now.',
      thanks: 'The valley looks better from your altitude, pilot. The Crown keeps your berth open.',
    },
    citizens: [
      { name: 'Patron Axilo', role: 'governor', dialogue: 'governor', home: 'penthouse' },
      { name: 'Voss Enterin', role: 'merchant', dialogue: 'vendor', vars: { goods: 'valley amber and hull ceramic' } },
      { name: 'Loreth Una', role: 'entertainer', dialogue: 'vendor' },
      { name: 'Shi Vael', role: 'apprentice', dialogue: 'vendor' },
      { name: 'Melqor Oss', role: 'farmer', dialogue: 'vendor', vars: { crop: 'gold barley', lowCrop: 'dew lettuce' } },
      { name: 'Ithuna Ryn', role: 'gardener', dialogue: 'vendor' },
      { name: 'Senna Vireth', role: 'resident', dialogue: 'proc', persona: 'lampwright' },
      { name: 'Corvel Ash', role: 'resident', dialogue: 'proc', persona: 'route-broker' },
    ],
  },

  // --- rustia: Redline Claim — mining town under the dead orbital ring ---
  {
    world: 'rustia',
    id: 'rustia-redline',
    name: 'Redline Claim',
    site: V(-0.936373, -0.264475, -0.230776),
    style: 'dustOutpost',
    radius: 110,
    seed: 0xd92f3b69,
    pad: { x: 71, z: 125 },
    voice: 'frontier',
    wonders: [
      { type: 'ringworld', title: 'The Broken Ring', bearing: 4.71, dist: 850, seed: 0x1111a009 },
      // Inherited from Ochre Junction and Solmara when the dust roads emptied.
      { type: 'monoliths', title: 'The Silent Monoliths', bearing: 0.60, dist: 380, seed: 0x1111a007 },
      { type: 'sundial', title: 'The Colossal Sundial', bearing: 2.60, dist: 420, seed: 0x1111a008 },
    ],
    flavor: 'A mining claim under a dead orbital ring — vat domes grow dinner in the shadow of someone else’s ruin.',
    quest: {
      reward: 'motorcycle',
      offer: [
        'Three ruins keep this claim honest: the Ring that fell, the Monoliths that float, the Sundial that counts.',
        'Ride the circuit. Anyone who’s read all three shadows has earned a machine that eats dust roads.',
      ],
      wonderLines: [
        'The Broken Ring: somebody’s orbital dream, face-down in our sky. We mine its shade.',
        'The Silent Monoliths: they hang there and say nothing. Best listeners on the planet.',
        'The Colossal Sundial: the whole claim keeps time by a shadow the size of a road.',
      ],
      remind: 'Circuit’s not closed yet. Follow the beacon — the dust keeps your tracks till you’re done.',
      complete: 'Full circuit. The Claim owes you a machine — take the Redline runner and let it drink the flats.',
      thanks: 'I can hear that engine from the penthouse. Sweetest sound on Rustia.',
    },
    citizens: [
      { name: 'Baron Rynva', role: 'governor', dialogue: 'governor', home: 'penthouse' },
      { name: 'Vaqor Ith', role: 'farmer', dialogue: 'vendor', vars: { crop: 'vat greens', lowCrop: 'dust melon' } },
      { name: 'Shioss Ent', role: 'artisan', dialogue: 'vendor', vars: { craft: 'oxide-glass' } },
      { name: 'Axent Drell', role: 'merchant', dialogue: 'vendor', vars: { goods: 'water chits and filter masks' } },
      { name: 'Ossreth Kessari', role: 'scholar', dialogue: 'vendor' },
      { name: 'Unalo Va', role: 'guide', dialogue: 'vendor' },
      { name: 'Petra Holt', role: 'resident', dialogue: 'proc', persona: 'rig-medic' },
      { name: 'Joss Umbrel', role: 'resident', dialogue: 'proc', persona: 'shadow-reader' },
    ],
  },

  // --- neptunia: Indigo Reach — trench-research port against the abyss ---
  {
    world: 'neptunia',
    id: 'neptunia-indigo',
    name: 'Indigo Reach',
    site: V(-0.366274, -0.874225, -0.318707),
    style: 'abyssGlow',
    radius: 150,
    seed: 0xea404c7a,
    pad: { x: -159, z: 92 },
    voice: 'tide',
    wonders: [
      { type: 'leviathan', title: 'Ribs of the Sound-Leviathan', bearing: 0.39, dist: 360, seed: 0x1111a00a },
      // Inherited from Diamondwake when the resort folded into the Reach.
      { type: 'diamondveil', title: 'The Diamond Veil', bearing: 2.40, dist: 420, seed: 0x1111a00b },
    ],
    flavor: 'A trench-research port pressed against the abyss — sonar chimes roll through the streets like bells.',
    quest: {
      reward: 'jetpack',
      offer: [
        'Two instruments measure this ocean: the Leviathan’s ribs, and the Veil the sky rains for us.',
        'Visit both stations for the survey. Expedition kit goes to whoever files the readings.',
      ],
      wonderLines: [
        'Ribs of the Sound-Leviathan: it sang once, planet-wide. The bones still hold the chord.',
        'The Diamond Veil: the sky’s glitter, caught and hung. Listen — it rings in the current.',
      ],
      remind: 'The survey’s half-filed. The beacon carries the next station’s ping.',
      complete: 'Readings received. The expedition pack is yours — trench thermals will hold you like water.',
      thanks: 'The Reach logs your altitude with some envy, surveyor.',
    },
    citizens: [
      { name: 'Madame Ossva', role: 'governor', dialogue: 'governor', home: 'penthouse' },
      { name: 'Chironel Va', role: 'scholar', dialogue: 'vendor' },
      { name: 'Kessuna Oss', role: 'merchant', dialogue: 'vendor', vars: { goods: 'trench charts and pressure hulls' } },
      { name: 'Lova Ryn', role: 'entertainer', dialogue: 'vendor' },
      { name: 'Entith Umbroth', role: 'artisan', dialogue: 'vendor', vars: { craft: 'diamond-cutting' } },
      { name: 'Melax Shi', role: 'guide', dialogue: 'vendor' },
      { name: 'Nerine Voss', role: 'resident', dialogue: 'proc', persona: 'chime-tuner' },
      { name: 'Halden Kree', role: 'resident', dialogue: 'proc', persona: 'pressure-diver' },
    ],
  },

  // --- wyattmattoe: Kite Saddle — ridge resort strung along the saddle ---
  {
    world: 'wyattmattoe',
    id: 'wyattmattoe-kitesaddle',
    name: 'Kite Saddle',
    site: V(-0.162820, -0.210175, -0.964010),
    style: 'basecampNeon',
    radius: 110,
    seed: 0x0c626e9c,
    pad: { x: 125, z: -72 },
    voice: 'alpine',
    wonders: [
      { type: 'skyharp', title: 'The Ridge Harp', bearing: 1.96, dist: 340, seed: 0x1111a00c },
      // Inherited from Cirquehollow and Icefall Landing — the range kept them.
      { type: 'bell', title: 'The Cirque Bell', bearing: 3.60, dist: 380, seed: 0x1111a00d },
      { type: 'icefall', title: 'The Frozen Cascade', bearing: 5.20, dist: 420, seed: 0x1111a00e },
    ],
    flavor: 'A ridge resort strung along the saddle — lift cables hum overhead and every window faces a descent.',
    quest: {
      reward: 'hangglider',
      offer: [
        'The range keeps three voices: the Harp that the wind plays, the Bell the ice rings, the Cascade that froze mid-word.',
        'Hear all three. Nobody flies a kite off this saddle who hasn’t.',
      ],
      wonderLines: [
        'The Ridge Harp: two pylons, forty cables, one instrument the size of weather.',
        'The Cirque Bell: granite walls make it ring for minutes. Stand inside the sound.',
        'The Frozen Cascade: a waterfall that froze mid-leap a century back. It’s still falling, slowly.',
      ],
      remind: 'Still a voice or two you haven’t heard. The beacon’s tuned to the next one.',
      complete: 'You’ve heard the range speak. The Saddle kite is yours — the ridges will hold you up all day.',
      thanks: 'Saw a kite over the cirque this morning. Knew the wingspan.',
    },
    citizens: [
      { name: 'Marshal Uneth', role: 'governor', dialogue: 'governor', home: 'penthouse' },
      { name: 'Rethqor Va', role: 'guide', dialogue: 'vendor' },
      { name: 'Unaent Lo', role: 'merchant', dialogue: 'vendor', vars: { goods: 'wax, edges, and avalanche pingers' } },
      { name: 'Ithmel Shi', role: 'entertainer', dialogue: 'vendor' },
      { name: 'Vashi Oss', role: 'caretaker', dialogue: 'vendor' },
      { name: 'Axreth Chiron', role: 'scholar', dialogue: 'vendor' },
      { name: 'Melith Una', role: 'farmer', dialogue: 'vendor', vars: { crop: 'snow barley', lowCrop: 'scree oats' } },
      { name: 'Brama Tull', role: 'resident', dialogue: 'proc', persona: 'cable-walker' },
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

// Surface-local unit direction of ONE of a city's wonders, from that wonder's
// bearing/dist on the siteFrame tangent basis. `wonder` is an entry of
// def.wonders. Writes into `out`.
export function wonderLocalDir(planet, def, wonder, out) {
  siteFrame(def.site, _t1, _t2);
  const e = wonder.dist / (planet.radius ?? 900);
  return out
    .copy(def.site)
    .addScaledVector(_t1, Math.cos(wonder.bearing) * e)
    .addScaledVector(_t2, Math.sin(wonder.bearing) * e)
    .normalize();
}
