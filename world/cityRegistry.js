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
// Hosted towns: an entry with `host` is not a createCity layout at all. Its
// town lives on a permanent structure built at boot that answers the same
// contract (neptunia: `host: 'reachShip'`, the factory ship in
// world/reachship.js — its `pad` is the ship's flight deck). Such entries set
// `noFlatten` (src/cityflatten.js must not bake an island under them) and may
// carry `charge`, a second governor errand offered once the tour is done.
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
    metro: { radius: 215 }, // the city round the town (world/cityMetro.js); inside the levelled disc
    seed: 0x51a7c3e1,
    pad: { x: 116, z: -161 }, // outside the town edge (probed dry, scripts/probe-pads.mjs)
    voice: 'neon',
    wonders: [
      { type: 'elevator', title: 'The Skyroot Elevator', bearing: 2.36, dist: 800, seed: 0x1111a001 },
      // Inherited from Goldenvale Terraces when the valley consolidated.
      { type: 'grove', title: 'The Luminous Grove', bearing: 5.38, dist: 420, seed: 0x1111a002 },
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
    // The pilot's own tower (world/city.js buildTower `home`): taller than the
    // governor's, a suite on top with a bed.
    homeTower: { top: 66, speed: 4.4 },
    // The Crown errand (src/crownErrand.js owns the stages; these are his words).
    errand: {
      welcome: [
        'Pilot. Welcome home. Meridian Crown kept your berth, and more than a berth.',
        'The tall tower across the plaza is yours. The suite at the top has a bed that does not move. Stay a while.',
        'One small thing first. I ordered a chair from the WaveMall Flagship, and they will not ship it past their own doors.',
        'Fetch it for me. Ask for Maribel. And while you are there, pick out something for your own rooms.',
      ],
      welcomeLate: [
        'Pilot. Welcome home. The tall tower across the plaza is yours, and the suite at the top.',
        'You have been to Neptunia already, I hear. Then you know the Indigo Reach.',
        'Its governor held the Crown Seal, this city’s founding seal, lent out long ago and never returned. Bring it home.',
      ],
      remind: 'The errand stands, pilot.',
      debrief: [
        'The chair. And two worlds that answer when Terra calls.',
        'The mall I expected. Saturnia swore against this valley before you were born, and you raced them out of it.',
        'You did very well. Get some rest; your suite is waiting. In the morning I have a new assignment for you.',
      ],
      restRemind: 'Sleep first, pilot. The tall tower. I will not brief a tired flyer.',
      mission: [
        'You slept. Good. Now the hard one.',
        'Madame Ossva, on the Indigo Reach over Neptunia, holds the Crown Seal: this city’s founding seal, lent out long ago and never returned.',
        'She will give it up for one thing. Her mining project needs a pilot to ride the riser to the sea floor and arm a charge.',
        'Help her with it, and bring the Seal home.',
      ],
      deliver: [
        'The Seal. Unmarked. A world broke around it and it did not notice.',
        'Keep it in your suite, pilot, where the plaza can see its light. The Crown is in your debt.',
      ],
      after: 'The Seal burns in your window every night. The valley sleeps better for it.',
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
    metro: { radius: 162 },
    seed: 0xd92f3b69,
    pad: { x: 69, z: 122 }, // probed dry (scripts/probe-pads.mjs)
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
    // The Emberdeep: the mine under the claim, and the cathedral in it
    // (world/minehead.js, world/embermine.js, src/mineWalk.js). A town with a
    // `mine` block gets a headframe by the walkway; the governor's lines here
    // are layered onto the tour dialogue by walk.js governorInteract.
    mine: {
      name: 'Emberdeep No. 1',
      // one aside appended to his usual lines until the patio is fitted...
      // ...while the cage is chained (until Neptunia breaks, crownErrand.js)...
      sealed: 'The Emberdeep is chained, pilot. The seam went cold, and I do not send a cage down a cold seam. It would take something shaking this whole system to wake it.',
      reopened: 'You felt it? Something broke, out past the ring, and the seam is glowing again. I have had the chain off the cage since morning.',
      hint: 'And if you ever ride the cage down the Emberdeep — the headframe by the pad road — bring me up a piece of ember ore. I miss the glow up here.',
      // ...the hand-over, carrying ore...
      deliver: [
        'Is that — give it here. Ember ore, straight off the live seam. Still warm. Forty years and it still does this to me.',
        'You went all the way down. You saw what they carved. Most pilots never leave the pad.',
        'A ship that carries this deserves somewhere to stand and look at the sky it came through. My fitters are cutting a door in your stern as we speak.',
        'An aft patio, open to everything. Stand up from your seat, walk to the back of the lounge, and step outside.',
      ],
      // ...and the aside afterwards.
      after: 'How is the patio? I keep your ore on the desk. It lights the whole room after dark.',
      // The secret (src/tenretni.js): offered at the end of the hand-over, and
      // again on later visits until the pilot says yes.
      secret: {
        prompt: 'Do you want to know a secret?',
        yesLabel: 'Yes. Tell me.',
        noLabel: 'No. Keep it.',
        yes: [
          'Then listen, and do not repeat it on the pad. My deep arrays have been hearing something for a year. Counting. Getting closer.',
          'It is coming for Terra. The blue one. I have told the Crown and they laughed down the line at me.',
          'Go to your ship. Press NAV, find Terra, and let the autopilot take you. Then walk out onto that new patio and watch the sky.',
          'I would rather somebody saw it who will remember what the oceans looked like.',
        ],
        no: 'Wise, maybe. Some things are lighter not carried. Ask me again if the sky ever makes you curious.',
      },
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
    // Over an even abyssal plain 205 u down (scripts/probe-pads.mjs): the
    // ship's tube runs the whole way to the seabed here.
    site: V(-0.933589, -0.142217, 0.328917),
    noFlatten: true, // all-ocean world: nothing to level, and levelling would bake an island
    host: 'reachShip', // the town IS the factory ship (world/reachship.js), not a createCity layout
    style: 'abyssGlow',
    radius: 150,
    seed: 0xea404c7a,
    pad: { x: 0, z: -100 }, // the flight deck over the stern (reachship.js HULL.PAD)
    voice: 'tide',
    wonders: [
      // Both stand in the open sea off the ship now: a swim (or, later, a
      // jetpack hop) from the boarding ladders.
      { type: 'leviathan', title: 'Ribs of the Sound-Leviathan', bearing: 0.39, dist: 210, seed: 0x1111a00a },
      // Inherited from Diamondwake when the resort folded into the Reach.
      { type: 'diamondveil', title: 'The Diamond Veil', bearing: 3.6, dist: 250, seed: 0x1111a00b },
    ],
    flavor: 'A factory ship under way on the abyss, a derrick amidships and a riser to the floor — sonar chimes roll down her decks like bells.',
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
    // The governor's second errand, offered once the survey is filed
    // (src/walk.js governorInteract; world/reachtube.js holds the lift and the
    // console). Quest id 'neptunia-charge': undefined -> 'go' -> 'blown'.
    charge: {
      offer: [
        'You filed the survey, so I will tell you what the survey was for.',
        'The Reach does not fish. The riser amidships runs two hundred fathoms to the floor, and at its foot we have seated a charge in the bedrock.',
        'It will open the crust and let the deep out. That is this ship’s whole errand, and it wants one thing more: a hand to arm it.',
        'Ride the lift down. Find the charge. Arm it for detonation, then come back up and tell me it is ready. We fire from the bridge, once you are clear.',
      ],
      // To the pilot Patron Axilo sent (the Crown errand, src/crownErrand.js):
      // she says what the lift is, why it is sealed and what he gets for it,
      // survey or no survey.
      errandOffer: [
        'Axilo’s pilot. I know why he sent you. The Crown Seal sits on my bridge, behind this chair, and it has sat there since before he was Patron.',
        'He may have it back. But the Reach does not fish. The riser amidships runs two hundred fathoms to the floor, and at its foot we have seated a mining charge in the bedrock.',
        'It will open the crust and let the deep out, and it wants one thing more: a hand to arm it. The riser lift is sealed on my order. Say yes and I unseal it for you.',
        'Ride it down, arm the charge, come back up and tell me it is ready. Then the Seal leaves with you.',
      ],
      surveyFirst: 'Tell me about the survey first.',
      prompt: 'Go down the riser?',
      accept: 'I’ll arm it.',
      decline: 'Not yet.',
      go: [
        'The lift is unsealed for you. Midships, under the derrick.',
        'You will have company on the way down. The glass is thick. Look as long as you like.',
      ],
      remind: 'The charge is not armed until you arm it. The lift waits under the derrick, unsealed. Come and tell me when it is ready, and the Seal is yours.',
      objective: 'RIDE THE RISER DOWN — ARM THE CHARGE — REPORT TO THE GOVERNOR',
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
    metro: { radius: 162 },
    seed: 0x0c626e9c,
    pad: { x: 121, z: -70 }, // probed dry (scripts/probe-pads.mjs)
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

  // --- wavemall prime: the WaveMall flagship ---------------------------------
  // Not a town: this world is ONE BUILDING (world/wavemallprime.js), and the
  // walk.js spawn branch early-returns for it, so nothing here ever builds a
  // city. The entry exists for the three things the registry alone provides:
  // a PERMANENT landing pad for the auto-land arc to target, the pad pin that
  // keeps the parked ship on it, and the terrain levelling (src/cityflatten.js)
  // that makes the mall's flat floor slabs sit honestly on the ground.
  // `pad` is mall-local by construction — the module anchors on the same
  // setFromUnitVectors(+Y, site) frame padLocalDir() maps through, with no
  // extra yaw, so pad {x, z} and the mall's own coordinates are the same
  // numbers. The mall faces +Z; the pad is out in front of the doors with the
  // lit causeway climbing back to them.
  {
    world: 'wavemall prime',
    id: 'wavemall-flagship',
    name: 'WaveMall Flagship',
    site: V(0.412000, 0.335000, -0.847000),
    style: 'neonMetropolis', // unused (no city is built) — kept valid
    radius: 240,             // flat core reaches past the plaza and the pad
    seed: 0x7a5ec0de,
    pad: { x: 0, z: 170 },   // mall-local, on the building's +Z axis
    voice: 'neon',
    wonders: [],             // the module places its own five landmarks
    citizens: [],            // the module brings its own crowds
    flavor: 'Eight levels of department store under one roof, and a queue that has never once been answered.',
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
