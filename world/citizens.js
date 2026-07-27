// The town's citizens — REAL PEOPLE. One named resident per building
// (world/cityRegistry.js citizens[] ↔ city.homes[]), rendered through
// world/people.js: full human anatomy, faces, hair, ten skin tones, garments
// tinted to the town's palette. This module replaces three older systems for
// the permanent cities — the aliens.js street crowd, the per-lobby interior
// crowds, and world/vendors.js — and absorbs the vendors' static-tree
// dialogue machinery unchanged.
//
// Frame: the citizens group is a child of city.group, so every position here
// is the city's flat local x/z space — the same frame _playerLocal uses in
// walk.js. Entities store pos as a Vector2(x, z) plus a cached y, matching
// walk.js entityDistSq's Vector2 branch; nearestInteractable adds a |Δy| gate
// so a penthouse governor is never targeted from the street below.
//
// Life: citizens mostly keep to their homes (standing at their role's anchor —
// the counter, the desk, the planter rows — where the player can walk in and
// talk), while a seeded schedule sends one or two at a time on a stroll:
// out the door, along the ring to the plaza, a loiter, and home again.
// people.js's promote/demote handles fidelity; promoted rigs head-track the
// player on their own.
//
// Dialogue:
//   - dialogue 'vendor': the hand-authored branching trees in
//     world/vendor-dialogue.js (VENDOR_TREES[role][voice]), with the same
//     menu:<cityId>:<idx>:<node>:<option> outcome flow walk.js already routes.
//   - dialogue 'proc': small per-voice line banks, seeded stable per citizen.
//   - dialogue 'governor': the penthouse quest-giver (wonder tour — the full
//     quest flow is wired through the quest module; see interactGovernor).

import * as THREE from 'three';
import { createCrowd } from './people.js';
import { VENDOR_TREES, ROLE_TITLES, ROLE_DEFAULT_VARS } from './vendor-dialogue.js';

const FACE_DIST = 6; // citizens turn to face the player inside this range
const TURN_RATE = 6; // rad/s-ish damp toward the player bearing
const STROLL_SPEED = 1.5; // u/s along the authored waypoints
const STROLL_CYCLE = 150; // seconds between one citizen's strolls
const LOITER_SECS = 45; // plaza dwell at the turn-around

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Hovering role sigil, hung over a vendor's door as shop signage.
function makeSigil(role, colorHex) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const css = `#${(colorHex ?? 0xd4408f).toString(16).padStart(6, '0')}`;
  ctx.strokeStyle = css;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(32, 32, 26, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = css;
  ctx.font = 'bold 30px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText((ROLE_TITLES[role] ?? '?').charAt(0).toUpperCase(), 32, 34);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex, transparent: true, opacity: 0.85, depthWrite: false,
  }));
  sprite.scale.setScalar(0.7);
  return sprite;
}

// Procedural small talk for 'resident' citizens, one bank per city voice.
// {{placeholders}} run through the same fill() the vendor trees use.
const PROC_LINES = {
  neon: {
    greetings: [
      'Evening, pilot. Or morning. The neon never says.',
      'You landed the long way round — everyone does, once.',
      'New face. {{cityName}} collects those.',
    ],
    observations: [
      'I do {{persona}} work, mostly. The towers keep me busy.',
      'You can see {{wonderName}} from my window. Never gets old.',
      'The valley feeds us, the sky pays us. That is the whole economy.',
    ],
    farewells: ['Mind the traffic lanes.', 'The Crown keeps your berth open.'],
  },
  frontier: {
    greetings: [
      'Water is currency and you look thirsty, stranger.',
      'You walked in off the pad? Respect.',
      'Not much moves out here that I do not hear about.',
    ],
    observations: [
      'I am the claim\'s {{persona}}. Somebody has to be.',
      '{{wonderName}} keeps its own hours. We keep ours by it.',
      'Dust gets into everything. Even the stories.',
    ],
    farewells: ['Keep your filters clean.', 'The flats are honest. Mostly.'],
  },
  tide: {
    greetings: [
      'The sonar said someone new was walking the streets.',
      'Welcome to the Reach. Mind the brine on the walkway.',
      'You surfaced at a good hour — the chimes are about to roll.',
    ],
    observations: [
      'I do the {{persona}} work down here. The abyss appreciates precision.',
      '{{wonderName}} sings on still nights. Some of us sing back.',
      'Everything in this town is either waterproof or regretted.',
    ],
    farewells: ['Stay above your crush depth.', 'The tide keeps the time.'],
  },
  alpine: {
    greetings: [
      'You picked a clear day to visit the saddle.',
      'Boots off the ice, friend — that is the only rule.',
      'New arrival! The wind mentioned you first.',
    ],
    observations: [
      'I am the {{persona}} around here. The ridge keeps me honest.',
      'When {{wonderName}} sounds, the whole cirque listens.',
      'Every window in town faces a descent. That is on purpose.',
    ],
    farewells: ['Watch the cornices.', 'Warm doorlight until you are back.'],
  },
};

export function createCitizens(planet, cityDef, city, opts = {}) {
  const group = new THREE.Group();
  group.name = 'Citizens';
  const materials = opts.materials;
  const palette = opts.palette ?? {};
  const neon = palette.neonPrimary ?? 0xd4408f;
  const roster = cityDef.citizens ?? [];
  const rng = mulberry32((cityDef.seed ^ 0xC17123E5) >>> 0);
  const ownedTextures = [];

  // Garment palette: neutrals grounded in real cloth, plus the town's two
  // accent tints pulled way down so nobody reads as a walking sign.
  const dim = (hex, k) => (Math.round(((hex >> 16) & 255) * k) << 16)
    | (Math.round(((hex >> 8) & 255) * k) << 8) | Math.round((hex & 255) * k);
  const garments = [
    0x6b6257, 0x4a5568, 0x8a7a66, 0x3d4653, 0x7a5b4a, 0x565f52,
    dim(palette.neonPrimary ?? 0xd4408f, 0.42),
    dim(palette.neonSecondaryB ?? 0xffb347, 0.5),
  ];
  const robedFraction = { tide: 0.3, neon: 0.25, frontier: 0.15, alpine: 0 }[cityDef.voice] ?? 0.2;

  // --- per-citizen entities, one per roster entry / home -------------------
  const homeByIdx = new Map();
  for (const h of city.homes ?? []) homeByIdx.set(h.idx, h);

  const citizens = [];
  for (let i = 0; i < roster.length; i++) {
    const def = roster[i];
    const home = homeByIdx.get(i) ?? null;
    const ax = home?.anchor?.x ?? (city.plazaCenters[0]?.x ?? 0) + 4 + i;
    const az = home?.anchor?.z ?? (city.plazaCenters[0]?.z ?? 0);
    const ay = home?.anchor?.y ?? city.groundLocalYAt(ax, az);
    const face = home?.anchor?.face ?? 0;
    const seeded = mulberry32((cityDef.seed ^ hashStr(def.name)) >>> 0);
    citizens.push({
      idx: i,
      name: def.name,
      role: def.role,
      dialogue: def.dialogue ?? 'proc',
      vars: def.vars ?? {},
      persona: def.persona ?? 'odd-jobs',
      home,
      penthouse: !!home?.penthouse,
      pos: new THREE.Vector2(ax, az),
      y: ay,
      face,
      heading: face,
      mode: 'home', // home | stroll | talk
      t: (i * 1.7) % 10,
      stock: 3 + Math.floor(seeded() * 22),
      strollPhase: seeded() * STROLL_CYCLE,
      path: null, // {pts:[{x,z}], leg, dist, dwell, returning}
      sigil: null,
    });
  }

  // --- realistic humans (world/people.js) ----------------------------------
  const _yUp = new THREE.Vector3(0, 1, 0);
  const crowd = createCrowd({
    count: citizens.length,
    rng,
    materials,
    maxRigs: Math.max(citizens.length, 1), // everyone articulates in a town of 8
    robedFraction,
    cloth: (r) => garments[Math.floor(r() * garments.length)],
    place: (i) => {
      const c = citizens[i];
      return {
        pos: new THREE.Vector3(c.pos.x, c.y, c.pos.y),
        quat: new THREE.Quaternion().setFromAxisAngle(_yUp, c.face),
      };
    },
  });
  group.add(crowd.group);

  // Door sigils for the vendor-tree citizens — shop signage over the doorway.
  for (const c of citizens) {
    if (c.dialogue !== 'vendor' || !c.home) continue;
    const sigil = makeSigil(c.role, neon);
    ownedTextures.push(sigil.material.map);
    sigil.position.set(c.home.doorX, city.groundLocalYAt(c.home.doorX, c.home.doorZ) + 4.1, c.home.doorZ);
    group.add(sigil);
    c.sigil = sigil;
  }

  // --- stroll paths ----------------------------------------------------------
  // Authored waypoints, no pathfinding: anchor -> door -> plaza rim (on the
  // house's own bearing) -> loiter -> reverse. Ground y comes from the town
  // deck outside the house, the floor slab inside.
  function buildPath(c) {
    const h = c.home;
    const plaza = city.plazaCenters[0] ?? { x: 0, z: 0, r: 12 };
    const bear = Math.atan2(h.z - plaza.z, h.x - plaza.x);
    const rim = {
      x: plaza.x + Math.cos(bear) * (plaza.r * 0.7),
      z: plaza.z + Math.sin(bear) * (plaza.r * 0.7),
    };
    return {
      pts: [
        { x: h.anchor.x, z: h.anchor.z },
        { x: h.doorX, z: h.doorZ },
        { x: rim.x, z: rim.z },
      ],
      leg: 0,
      dist: 0,
      dwell: 0,
      returning: false,
    };
  }

  function groundYFor(c, x, z) {
    const h = c.home;
    if (h && Math.abs(x - h.x) < h.half && Math.abs(z - h.z) < h.half) return h.floorY;
    return city.groundLocalYAt(x, z);
  }

  // Advance a strolling citizen along their path; returns false when done.
  function stepStroll(c, dt) {
    const p = c.path;
    if (!p) return false;
    if (p.dwell > 0) {
      p.dwell -= dt;
      if (p.dwell <= 0) { p.returning = true; p.leg = p.pts.length - 1; p.dist = 0; }
      return true;
    }
    const dirIdx = p.returning ? -1 : 1;
    const a = p.pts[p.leg];
    const b = p.pts[p.leg + dirIdx];
    if (!b) {
      if (p.returning) return false; // home again
      p.dwell = LOITER_SECS * (0.6 + 0.8 * ((c.strollPhase * 7919) % 1));
      return true;
    }
    const legLen = Math.hypot(b.x - a.x, b.z - a.z) || 0.001;
    p.dist += STROLL_SPEED * dt;
    if (p.dist >= legLen) {
      p.leg += dirIdx;
      p.dist = 0;
      return true;
    }
    const t = p.dist / legLen;
    const x = a.x + (b.x - a.x) * t;
    const z = a.z + (b.z - a.z) * t;
    c.pos.set(x, z);
    c.y = groundYFor(c, x, z);
    c.heading = Math.atan2(b.x - a.x, b.z - a.z);
    return true;
  }

  // --- {{placeholder}} substitution (ported from vendors.js) ----------------
  let daypart = 'daylight';
  function fill(str, c) {
    return String(str).replace(/\{\{(\w+)\}\}/g, (m, key) => {
      const ctx = {
        cityName: cityDef.name,
        worldName: planet.cfg.name,
        vendorName: c.name,
        wonderName: cityDef.wonders?.[0]?.title ?? 'the wonder',
        stock: c.stock,
        daypart,
        persona: c.persona,
        ...(ROLE_DEFAULT_VARS[c.role] ?? {}),
        ...c.vars,
      };
      if (ctx[key] === undefined) {
        if (import.meta.env?.DEV) console.warn(`citizens.js: unfilled {{${key}}} for ${c.role}`);
        return m;
      }
      return String(ctx[key]);
    });
  }

  function treeFor(c) {
    const role = VENDOR_TREES[c.role];
    if (!role) return null;
    return role[cityDef.voice] ?? role.default ?? null;
  }

  function speakerFor(c) {
    return {
      name: c.name,
      species: c.dialogue === 'governor'
        ? `Governor of ${cityDef.name}`
        : ROLE_TITLES[c.role] ?? 'Citizen',
      cityId: cityDef.name,
    };
  }

  function menuFor(c, nodeKey) {
    const tree = treeFor(c);
    const node = tree?.nodes?.[nodeKey];
    if (!node) return undefined;
    return {
      kind: 'choice',
      prompt: fill(node.prompt, c),
      options: node.options.map((o, i) => ({
        label: fill(o.label, c),
        outcomeTag: `menu:${cityDef.id}:${c.idx}:${nodeKey}:${i}`,
      })),
    };
  }

  // --- dialogue payloads by kind ---------------------------------------------
  function interactVendor(c) {
    const tree = treeFor(c);
    if (!tree) return null;
    return {
      speaker: speakerFor(c),
      lines: tree.greeting.map((l) => fill(l, c)),
      offer: menuFor(c, 'root'),
    };
  }

  function interactProc(c) {
    const bank = PROC_LINES[cityDef.voice] ?? PROC_LINES.neon;
    const r = mulberry32((cityDef.seed ^ hashStr(c.name) ^ 0x51ab) >>> 0);
    const pick = (arr) => arr[Math.floor(r() * arr.length)];
    const lines = [pick(bank.greetings), pick(bank.observations), pick(bank.farewells)]
      .map((l) => fill(l, c));
    // Residents occasionally point the codex at the town itself.
    const offer = r() < 0.25
      ? { kind: 'codex', subject: `${cityDef.name}: ${cityDef.flavor}` }
      : undefined;
    return { speaker: speakerFor(c), lines, offer };
  }

  // The governor's quest dialogue is layered on by the quest system (walk.js
  // wires setGovernorHandler once the journal/inventory stage is known). Until
  // then the governor still receives visitors.
  let governorHandler = null;
  function interactGovernor(c) {
    if (governorHandler) return governorHandler(c, { fill, speakerFor });
    const q = cityDef.quest;
    return {
      speaker: speakerFor(c),
      lines: (q?.offer ?? ['Welcome to {{cityName}}.']).map((l) => fill(l, c)),
    };
  }

  // --- interaction contract (world/interaction.js) ---------------------------
  function nearestInteractable(playerPos, maxDist = 3.2) {
    let best = null;
    let bestD = maxDist * maxDist;
    for (const c of citizens) {
      // Height gate: the governor overhead must not be targetable from the
      // street (2D distance would say they are standing beside you).
      if (Math.abs(c.y - playerPos.y) > 3) continue;
      const dx = c.pos.x - playerPos.x;
      const dz = c.pos.y - playerPos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < bestD) { bestD = d2; best = c; }
    }
    return best;
  }

  function interact(c) {
    if (!c) return null;
    c.mode = 'talk';
    if (c.dialogue === 'vendor') return interactVendor(c);
    if (c.dialogue === 'governor') return interactGovernor(c);
    return interactProc(c);
  }

  function onOutcome(tag) {
    const m = /^menu:([^:]+):(\d+):([^:]+):(\d+)$/.exec(tag ?? '');
    if (!m || m[1] !== cityDef.id) return governorHandler?.onOutcome?.(tag) ?? null;
    const c = citizens[Number(m[2])];
    const tree = treeFor(c);
    const node = tree?.nodes?.[m[3]];
    const opt = node?.options?.[Number(m[4])];
    if (!c || !opt) return null;
    return {
      speaker: speakerFor(c),
      lines: (opt.lines ?? []).map((l) => fill(l, c)),
      offer: opt.next ? menuFor(c, opt.next) : undefined,
    };
  }

  function endInteract(c) {
    if (c && c.mode === 'talk') c.mode = c.path ? 'stroll' : 'home';
  }

  // --- per-frame ---------------------------------------------------------------
  const _toPlayer = new THREE.Vector2();
  let clock = 0;
  function update(dt, playerLocal, sunDot) {
    clock += dt;
    const night = THREE.MathUtils.clamp(1 - Math.max(sunDot ?? 0, 0), 0, 1);
    daypart = (sunDot ?? 0) > 0.35 ? 'midday' : (sunDot ?? 0) > 0.05 ? 'dusk' : 'the lantern hours';

    for (const c of citizens) {
      c.t += dt;

      // Schedule: grounded, non-vendor-critical citizens stroll on a phase
      // window; the governor keeps the penthouse.
      if (!c.penthouse && c.home) {
        if (c.mode === 'home' && ((clock + c.strollPhase) % STROLL_CYCLE) < dt * 1.5) {
          c.path = buildPath(c);
          c.mode = 'stroll';
        }
        if (c.mode === 'stroll') {
          if (!stepStroll(c, dt)) {
            c.path = null;
            c.mode = 'home';
            c.pos.set(c.home.anchor.x, c.home.anchor.z);
            c.y = c.home.anchor.y;
            c.heading = c.home.anchor.face;
          }
        }
      }

      // Face the player when near or talking; otherwise face the room/path.
      _toPlayer.set(playerLocal.x - c.pos.x, playerLocal.z - c.pos.y);
      const near = _toPlayer.lengthSq() < FACE_DIST * FACE_DIST &&
        Math.abs(c.y - playerLocal.y) < 3;
      const want = (c.mode === 'talk' || (near && c.mode !== 'stroll'))
        ? Math.atan2(_toPlayer.x, _toPlayer.y)
        : c.mode === 'stroll' ? c.heading : c.face;
      let d = want - c.heading;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      c.heading += d * Math.min(1, TURN_RATE * dt);

      const moving = c.mode === 'stroll' && !c.path?.dwell;
      crowd.setPersonPose(c.idx, c.pos.x, c.y, c.pos.y, c.heading, moving ? 0.55 : 0, clock);

      if (c.sigil) {
        c.sigil.position.y += Math.sin(c.t * 1.3) * 0.002;
        c.sigil.material.opacity = 0.55 + night * 0.35;
      }
    }

    crowd.update(clock, dt, playerLocal);
  }

  function setGovernorHandler(fn) { governorHandler = fn; }

  function dispose() {
    crowd.dispose();
    for (const t of ownedTextures) t.dispose();
    group.traverse((o) => { if (o.isSprite) o.material.dispose(); });
    group.clear();
  }

  return {
    group,
    update,
    dispose,
    nearestInteractable,
    interact,
    endInteract,
    onOutcome,
    setGovernorHandler,
    citizens, // for headless verification (names, roles, modes)
    get count() { return citizens.length; },
    fill, // quest system reuses the placeholder machinery
    speakerFor,
  };
}
