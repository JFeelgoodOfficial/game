/**
 * creatures.js — Native, non-human lifeforms per planet.
 *
 * Shares the exact interaction surface as aliens.js (createCrowd) so the host
 * treats talking to a citizen and encountering a lifeform through one code
 * path: nearestInteractable(playerPos, maxDist) / interact(creature) /
 * endInteract(creature).
 *
 * Interaction contract (see interaction.js): nearestInteractable() scans
 * active individuals ONLY with no per-call allocation; interact(creature)
 * returns a DialoguePayload and starts this recipe's talk/gesture reaction;
 * endInteract(creature) releases it when the host closes the dialogue (safe
 * to call twice / with a stale entity). Quest.marker is a THREE.Vector3 in
 * this module's group-local space. Host owns quest/codex state; this module
 * never mutates global state.
 *
 * Design north star: no faces, no single bodies, no single lifespans.
 * Recipes lean on radial symmetry, colonial bodies, light/EM communication,
 * distributed minds, and death-as-birth cosmologies.
 *
 * Coordinate frame: identical to city.js/aliens.js — everything is parented
 * to planet.surface and built in UNROTATED object space around worldUp.
 * Local +Y aligns to the radial "up" direction; groundHeight/groundAt from
 * the host resolves terrain height. Sea level and amplitude are read from
 * planet.cfg when present, with safe fallbacks.
 *
 * Performance: a small pool of fully-rigged "active" creatures animates near
 * the player (opts.maxRigs); everything else beyond C.activeRadius is drawn
 * as cheap InstancedMesh impostors (billboards / capsules / motes) that
 * promote/demote as the player moves. No per-frame allocation — all scratch
 * vectors/quaternions/matrices are module- or closure-scoped and reused.
 *
 * Gas giants (saturnia/neptunia) have no walkable surface: their recipe is
 * backdrop-only atmospheric life. nearestInteractable always returns null;
 * sustained proximity instead flips a passive onCodexDiscovery flag.
 */

import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------------
const C = {
  // Pooling / LOD
  maxRigs: 14,              // active fully-rigged creatures near the player
  activeRadius: 70,         // switch rig <-> impostor at this distance
  impostorFadeBand: 15,     // hysteresis band to avoid pop-in flicker
  poolRebalanceInterval: 0.35, // seconds between pool re-sort passes

  // Interaction
  interactRadius: 6,        // default max distance for nearestInteractable
  questChance: 0.28,        // fraction of individuals that carry a Quest

  // Palette defaults (overridable via opts.palette)
  paletteDefault: {
    magenta: 0xd4408f,
    cyan: 0x40d4c8,
    amber: 0xffb347,
    indigo: 0x2a1f4d,
  },

  // --- Terra: Tended Mat ---
  terra: {
    density: 1.0,            // stalk-node count multiplier
    stalkCount: 90,
    stalkHeight: [1.2, 3.2],
    moteCount: 140,
    moteSpeed: 0.6,
    noticeRadius: 22,        // ripple travel radius toward player
    rippleSpeed: 9,          // units/sec the "notice" pulse travels
    tenderCount: 4,          // near-humanoid tenders (subset of active pool)
    tenderHeight: 1.85,
  },

  // --- Oceana: Shoal-People ---
  oceana: {
    density: 1.0,
    bodyCount: 10,           // cohered humanoid-shaped shoals
    fishPerBody: 260,        // instanced fish forming one cohered body
    cohereHeight: 1.85,      // person-scale when cohered
    startleRadius: 4.5,
    scatterDuration: 1.4,
    reformDelay: 1.8,
    reformOffset: 3.5,
  },

  // --- Glacia: Slow Crystalline ---
  glacia: {
    density: 1.0,
    beingCount: 8,
    height: [2.4, 4.2],
    gestureDuration: 90,     // seconds for one "gesture" — geologic pace
    thoughtSpeed: 0.35,      // visible internal light crawl speed
    accretionCount: 26,      // crystal-city accretions from frozen breath
  },

  // --- Rustia: Rust Choir ---
  rustia: {
    density: 1.0,
    choirCount: 12,
    height: [1.7, 2.6],
    eyeGlowMin: 0.9,         // stays above bloom threshold even by day
    eyeGlowMax: 2.4,
    lithovoreFraction: 0.25,
    memoryTradeChance: 0.4,  // fraction of interactions offering a choice quest
  },

  // --- Cresta: Ridge Kites ---
  cresta: {
    density: 1.0,
    kiteCount: 10,
    sailSpan: [1.6, 3.2],    // wingtip-to-wingtip
    soarHeight: [6, 14],     // hover band above the anchor cairn
    groundedFraction: 0.35,  // kites resting at their cairns — the talkable ones
    glowMin: 0.5,
    glowMax: 1.6,
    tetherCutChance: 0.3,    // fraction of interactions offering the choice quest
  },

  // --- Sky Ecologies: Saturnia / Neptunia (backdrop only) ---
  sky: {
    density: 1.0,
    whaleCount: 9,
    lightningCount: 18,
    mindPatternCount: 5,
    bandRadiusRange: [420, 900], // distance band around the viewpoint
    codexProximity: 140,         // sustained-look distance for discovery
    codexDwellTime: 6,           // seconds within band to flag discovery
  },

  // --- Neptunia: dive-able ocean + kept sky whales ---
  neptunia: {
    density: 1.0,
    schoolCount: 6,          // neon fish schools in the water column
    fishPerSchool: 80,
    jellyfishCount: 24,
    whaleCount: 10,          // high-altitude balloon whales (kept sky ecology)
    whaleBand: [180, 450],   // altitude band above the sea surface
    leviathanLength: 18,     // one gentle giant patrolling the site
    codexDwellTime: 6,
  },

  // --- Generic fallback weird biology ---
  generic: {
    density: 1.0,
    count: 10,
    height: [1.0, 2.4],
    armMin: 3,
    armMax: 7,
  },

  bloomThreshold: 0.85,
};

// ---------------------------------------------------------------------------
// Deterministic PRNG
// ---------------------------------------------------------------------------
function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeedFromDir(dir, salt) {
  const x = Math.floor((dir.x * 0.5 + 0.5) * 65535);
  const y = Math.floor((dir.y * 0.5 + 0.5) * 65535);
  const z = Math.floor((dir.z * 0.5 + 0.5) * 65535);
  return ((x * 73856093) ^ (y * 19349663) ^ (z * 83492791) ^ (salt * 2654435761)) >>> 0;
}

// ---------------------------------------------------------------------------
// Shared scratch objects (never allocated per frame)
// ---------------------------------------------------------------------------
const _v0 = new THREE.Vector3();
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q0 = new THREE.Quaternion();
const _m0 = new THREE.Matrix4();
const _yAxis = new THREE.Vector3(0, 1, 0);
const _color0 = new THREE.Color();

function alignToRadial(obj3d, dirLocal) {
  _q0.setFromUnitVectors(_yAxis, dirLocal);
  obj3d.quaternion.copy(_q0);
}

// ---------------------------------------------------------------------------
// Shared dialogue / Quest scaffolding (matches aliens.js payload exactly)
// ---------------------------------------------------------------------------
// Quest: { kind: 'codex', subject }
//      | { kind: 'waypoint', targetHint, marker }
//      | { kind: 'choice', prompt, options: [{ label, outcomeTag }] }
// Dialogue: { speaker: { name, species, cityId }, lines: string[], offer?: Quest }

const NAME_SYLLABLES = ['sha', 'lom', 'vre', 'un', 'ka', 'thi', 'oor', 'zen', 'mel', 'iss', 'tuk', 'rell'];
function proceduralName(rand, syllables = 2 + Math.floor(rand() * 2)) {
  let s = '';
  for (let i = 0; i < syllables; i++) s += NAME_SYLLABLES[Math.floor(rand() * NAME_SYLLABLES.length)];
  return s[0].toUpperCase() + s.slice(1);
}

function pick(rand, arr) { return arr[Math.floor(rand() * arr.length)]; }

// Shared endInteract (contract): every recipe marks its speaker with
// `_talking = true` inside interact(); the host calls this when the dialogue
// closes. Safe to call twice or with a stale/foreign entity.
function endInteractShared(entity) {
  if (entity) entity._talking = false;
}

// ---------------------------------------------------------------------------
// Generic active-pool / impostor manager
// Handles promotion/demotion between full rigs and instanced impostors for
// any recipe that needs person-scaled individuals near the player.
// ---------------------------------------------------------------------------
function makePopulationPool(individuals, opts) {
  // individuals: [{ id, pos: Vector3, seed, buildRig(), rigGroup|null, active:false, ... }]
  const maxRigs = opts.maxRigs ?? C.maxRigs;
  const activeRadius = opts.activeRadius ?? C.activeRadius;
  const band = C.impostorFadeBand;
  let rebalanceTimer = 0;

  function rebalance(playerPos) {
    // Sort by distance, activate nearest maxRigs within radius+band.
    for (const ind of individuals) {
      ind._distSq = _v0.copy(ind.pos).sub(playerPos).lengthSq();
    }
    individuals.sort((a, b) => a._distSq - b._distSq);
    let activated = 0;
    for (const ind of individuals) {
      const shouldActivate =
        activated < maxRigs &&
        ind._distSq < (activeRadius + band) * (activeRadius + band);
      if (shouldActivate && !ind.active) {
        ind.activate();
        activated++;
      } else if (shouldActivate) {
        activated++;
      } else if (!shouldActivate && ind.active && !ind._talking) {
        // Never deactivate a speaker mid-dialogue — the host hangs up first.
        ind.deactivate();
      }
    }
  }

  return {
    update(dt, playerPos) {
      rebalanceTimer -= dt;
      if (rebalanceTimer <= 0) {
        rebalanceTimer = C.poolRebalanceInterval;
        rebalance(playerPos);
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Recipe: TERRA — the Tended Mat
// ---------------------------------------------------------------------------
function buildTerra(planet, worldUp, opts, seed) {
  const rand = mulberry32(seed);
  const cfg = C.terra;
  const pal = opts.palette ?? C.paletteDefault;
  const group = new THREE.Group();
  group.name = 'terra-creatures';

  const stalkCount = Math.round(cfg.stalkCount * (opts.density ?? cfg.density));
  const moteCount = Math.round(cfg.moteCount * (opts.density ?? cfg.density));
  const radius = opts.radius ?? 260;

  // Stalk-nodes: sensory "trees" of the neural mat, instanced.
  const stalkGeo = new THREE.ConeGeometry(0.28, 1, 6, 1);
  const stalkMat = new THREE.MeshStandardMaterial({
    color: 0x3d6b4a, roughness: 0.7,
    emissive: new THREE.Color(pal.cyan), emissiveIntensity: 0.05,
  });
  const stalks = new THREE.InstancedMesh(stalkGeo, stalkMat, stalkCount);
  stalks.frustumCulled = false;
  const stalkData = [];
  for (let i = 0; i < stalkCount; i++) {
    const a = rand() * Math.PI * 2;
    const r = Math.sqrt(rand()) * radius;
    const px = Math.cos(a) * r, pz = Math.sin(a) * r;
    const h = THREE.MathUtils.lerp(cfg.stalkHeight[0], cfg.stalkHeight[1], rand());
    _v1.set(px, 0, pz);
    _m0.compose(_v1, _q0.identity(), _v2.set(0.8 + rand() * 0.6, h, 0.8 + rand() * 0.6));
    stalks.setMatrixAt(i, _m0);
    stalkData.push({ x: px, z: pz, h, phase: rand() * Math.PI * 2 });
  }
  stalks.instanceMatrix.needsUpdate = true;
  group.add(stalks);

  // Spore-motes: drifting points that pulse toward the player.
  const moteGeo = new THREE.IcosahedronGeometry(0.06, 0);
  const moteMat = new THREE.MeshStandardMaterial({
    color: pal.amber, emissive: new THREE.Color(pal.amber), emissiveIntensity: 0.3,
  });
  const motes = new THREE.InstancedMesh(moteGeo, moteMat, moteCount);
  motes.frustumCulled = false;
  const moteData = [];
  for (let i = 0; i < moteCount; i++) {
    const a = rand() * Math.PI * 2, r = Math.sqrt(rand()) * radius;
    moteData.push({
      x: Math.cos(a) * r, z: Math.sin(a) * r, y: 0.3 + rand() * 1.5,
      driftPhase: rand() * Math.PI * 2, driftR: 0.5 + rand() * 1.5,
    });
  }
  group.add(motes);

  // Tenders: near-humanoid figures with nerve-threads into the soil.
  const tenderCount = cfg.tenderCount;
  const tenders = [];
  for (let i = 0; i < tenderCount; i++) {
    const a = rand() * Math.PI * 2, r = 8 + rand() * (radius * 0.6);
    const tSeed = seed ^ (0x9e3779b9 * (i + 1));
    tenders.push({
      id: `tender-${i}`,
      pos: new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r),
      seed: tSeed,
      species: 'Tended Mat (tender)',
      active: false,
      rig: null,
      _phase: rand() * Math.PI * 2,
      activate() {
        if (this.rig) { this.active = true; this.rig.visible = true; return; }
        this.rig = buildTenderRig(mulberry32(this.seed), pal);
        this.rig.position.copy(this.pos);
        group.add(this.rig);
        this.active = true;
      },
      deactivate() {
        if (this.rig) this.rig.visible = false;
        this.active = false;
      },
    });
  }

  function buildTenderRig(rand2, pal2) {
    const g = new THREE.Group();
    const torso = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.22, 0.9, 4, 6),
      new THREE.MeshStandardMaterial({ color: 0x8a9b7a, roughness: 0.6 })
    );
    torso.position.y = cfg.tenderHeight * 0.55;
    g.add(torso);
    const head = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.16, 1),
      new THREE.MeshStandardMaterial({ color: 0x9db08a, roughness: 0.5 })
    );
    head.position.y = cfg.tenderHeight * 0.92;
    g.add(head);
    // Nerve-threads: thin emissive lines from spine to ground.
    const threadMat = new THREE.LineBasicMaterial({ color: pal2.cyan, transparent: true, opacity: 0.6 });
    for (let t = 0; t < 3; t++) {
      const pts = [
        new THREE.Vector3(0, cfg.tenderHeight * 0.3, 0),
        new THREE.Vector3((rand2() - 0.5) * 0.6, -0.1, (rand2() - 0.5) * 0.6),
        new THREE.Vector3((rand2() - 0.5) * 1.2, -0.05, (rand2() - 0.5) * 1.2),
      ];
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), threadMat);
      g.add(line);
    }
    return g;
  }

  const pool = makePopulationPool(tenders, opts);

  function update(dt, playerPos, sunDot) {
    const dim = Math.max(sunDot, 0);
    stalkMat.emissiveIntensity = 0.05 + (1 - dim) * 0.25;
    moteMat.emissiveIntensity = 0.3 + (1 - dim) * 0.5;

    _v0.copy(playerPos);
    const t = performance.now() * 0.001;
    for (let i = 0; i < stalkData.length; i++) {
      const d = stalkData[i];
      const dist = Math.hypot(d.x - _v0.x, d.z - _v0.z);
      const ripple = Math.max(0, 1 - Math.abs(dist - (t * cfg.rippleSpeed) % cfg.noticeRadius) / 3);
      const sway = Math.sin(t * 0.6 + d.phase) * 0.05;
      _v1.set(d.x, sway * d.h, d.z);
      const scale = (1 + ripple * 0.3);
      _m0.compose(_v1, _q0.identity(), _v2.set(scale, d.h, scale));
      stalks.setMatrixAt(i, _m0);
    }
    stalks.instanceMatrix.needsUpdate = true;

    for (let i = 0; i < moteData.length; i++) {
      const d = moteData[i];
      const ang = t * 0.4 + d.driftPhase;
      const mx = d.x + Math.cos(ang) * 0.3;
      const mz = d.z + Math.sin(ang) * 0.3;
      const distToPlayer = Math.hypot(mx - _v0.x, mz - _v0.z);
      const pulled = Math.max(0, 1 - distToPlayer / cfg.noticeRadius);
      _v1.set(mx + (_v0.x - mx) * pulled * 0.02, d.y, mz + (_v0.z - mz) * pulled * 0.02);
      const s = 1 + pulled * 1.5;
      _m0.compose(_v1, _q0.identity(), _v2.set(s, s, s));
      motes.setMatrixAt(i, _m0);
    }
    motes.instanceMatrix.needsUpdate = true;

    // Talk reaction: a tender in conversation sways gently toward attention.
    for (const td of tenders) {
      if (!td.active || !td.rig) continue;
      const want = td._talking ? Math.sin(t * 1.3 + td._phase) * 0.25 : 0;
      td.rig.rotation.y = THREE.MathUtils.damp(td.rig.rotation.y, want, 4, dt);
    }

    pool.update(dt, playerPos);
  }

  function nearestInteractable(playerPos, maxDist = C.interactRadius) {
    let best = null, bestD = maxDist * maxDist;
    for (const t of tenders) {
      if (!t.active) continue;
      const d = _v0.copy(t.pos).sub(playerPos).lengthSq();
      if (d < bestD) { bestD = d; best = t; }
    }
    return best;
  }

  function interact(creature) {
    creature._talking = true;
    const rand2 = mulberry32(creature.seed);
    const name = 'the Mat';
    const lines = [
      'We feel the weight of your steps before we hear them.',
      'We are not one voice speaking — we are one nerve, many mouths.',
      pick(rand2, [
        'We tend. We have always tended. There was no first tender.',
        'The stalks watched you arrive from three valleys away.',
        'When a tender falls, we do not mourn — we root them.',
      ]),
    ];
    const offer = rand2() < C.terra.tenderCount / 40 || rand2() < 0.3
      ? { kind: 'codex', subject: 'The Tended Mat: a planet-spanning neural organism' }
      : undefined;
    return { speaker: { name, species: 'Tended Mat (tender)', cityId: null }, lines, offer };
  }

  function dispose() {
    stalkGeo.dispose(); stalkMat.dispose();
    moteGeo.dispose(); moteMat.dispose();
    for (const t of tenders) if (t.rig) {
      t.rig.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose?.(); });
    }
    group.clear();
  }

  return { group, update, dispose, nearestInteractable, interact, endInteract: endInteractShared };
}

// ---------------------------------------------------------------------------
// Recipe: OCEANA — the Shoal-People
// ---------------------------------------------------------------------------
function buildOceana(planet, worldUp, opts, seed) {
  const rand = mulberry32(seed);
  const cfg = C.oceana;
  const pal = opts.palette ?? C.paletteDefault;
  const group = new THREE.Group();
  group.name = 'oceana-creatures';

  const bodyCount = Math.round(cfg.bodyCount * (opts.density ?? cfg.density));
  const radius = opts.radius ?? 200;

  const fishGeo = new THREE.ConeGeometry(0.03, 0.14, 4);
  const fishMat = new THREE.MeshStandardMaterial({
    color: pal.cyan, emissive: new THREE.Color(pal.cyan), emissiveIntensity: 0.15, metalness: 0.3, roughness: 0.4,
  });

  const bodies = [];
  for (let i = 0; i < bodyCount; i++) {
    const a = rand() * Math.PI * 2, r = Math.sqrt(rand()) * radius;
    const bSeed = seed ^ (0x85ebca6b * (i + 1));
    const brand = mulberry32(bSeed);
    const fish = new THREE.InstancedMesh(fishGeo, fishMat, cfg.fishPerBody);
    fish.frustumCulled = false;
    group.add(fish);
    const fishOffsets = [];
    for (let f = 0; f < cfg.fishPerBody; f++) {
      // Distribute within a humanoid silhouette: taller near center, tapering.
      const h = brand();
      const band = h < 0.15 ? 'head' : h < 0.75 ? 'torso' : 'limb';
      const yOff = h * cfg.cohereHeight;
      const rr = band === 'head' ? 0.14 : band === 'torso' ? 0.28 * (1 - (h - 0.15) / 0.6) + 0.1 : 0.15;
      const fa = brand() * Math.PI * 2;
      fishOffsets.push({
        baseX: Math.cos(fa) * rr, baseZ: Math.sin(fa) * rr, y: yOff,
        phase: brand() * Math.PI * 2, speed: 1.5 + brand() * 1.5,
      });
    }
    bodies.push({
      id: `shoal-${i}`,
      pos: new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r),
      seed: bSeed,
      species: 'Shoal-Person',
      active: true,
      state: 'cohered', // cohered | scattered | reforming
      stateTimer: 0,
      fish, fishOffsets,
      activate() { this.active = true; },
      deactivate() { this.active = false; fish.visible = false; },
    });
  }

  const pool = makePopulationPool(bodies, { ...opts, maxRigs: bodyCount });

  function update(dt, playerPos, sunDot) {
    const dim = Math.max(sunDot, 0);
    fishMat.emissiveIntensity = 0.15 + (1 - dim) * 0.35;
    const t = performance.now() * 0.001;

    for (const b of bodies) {
      if (!b.active) continue;
      const dist = _v0.copy(b.pos).sub(playerPos).length();

      // Talk reaction: a shoal in conversation holds its humanoid form —
      // approaching a speaker never startles it (startleRadius sits inside
      // interactRadius, so without this the speaker would scatter mid-line).
      if (b.state === 'cohered' && dist < cfg.startleRadius && !b._talking) {
        b.state = 'scattered';
        b.stateTimer = cfg.scatterDuration;
        b.scatterVec = _v1.set(b.pos.x - playerPos.x, 0, b.pos.z - playerPos.z).normalize().clone();
      } else if (b.state === 'scattered') {
        b.stateTimer -= dt;
        if (b.stateTimer <= 0) { b.state = 'reforming'; b.stateTimer = cfg.reformDelay; }
      } else if (b.state === 'reforming') {
        b.stateTimer -= dt;
        if (b.stateTimer <= 0) {
          b.state = 'cohered';
          b.pos.addScaledVector(b.scatterVec, cfg.reformOffset);
        }
      }

      const scatterAmt = b.state === 'cohered' ? 0 : b.state === 'scattered' ? 1 : 0.5;
      for (let f = 0; f < b.fishOffsets.length; f++) {
        const o = b.fishOffsets[f];
        const wob = Math.sin(t * o.speed + o.phase) * 0.02;
        const scatterX = scatterAmt * Math.sin(o.phase * 3 + t * 2) * 1.5;
        const scatterZ = scatterAmt * Math.cos(o.phase * 3 + t * 2) * 1.5;
        _v1.set(
          b.pos.x + o.baseX + wob + scatterX,
          o.y * (1 - scatterAmt * 0.5) + Math.sin(t + o.phase) * 0.02,
          b.pos.z + o.baseZ + wob + scatterZ
        );
        _q0.setFromAxisAngle(_yAxis, o.phase + t * o.speed);
        _m0.compose(_v1, _q0, _v2.set(1, 1, 1));
        b.fish.setMatrixAt(f, _m0);
      }
      b.fish.instanceMatrix.needsUpdate = true;
    }
    pool.update(dt, playerPos);
  }

  function nearestInteractable(playerPos, maxDist = C.interactRadius) {
    let best = null, bestD = maxDist * maxDist;
    for (const b of bodies) {
      if (!b.active || b.state !== 'cohered') continue;
      const d = _v0.copy(b.pos).sub(playerPos).lengthSq();
      if (d < bestD) { bestD = d; best = b; }
    }
    return best;
  }

  function interact(creature) {
    creature._talking = true;
    const rand2 = mulberry32(creature.seed);
    const lines = [
      'The one you spoke to a moment ago is already scattered through this water.',
      pick(rand2, [
        'We are shaped like you only to be understood by you.',
        'A thousand small deaths make one shape. Ask us later and we will be a thousand different ones.',
        'Identity is a shoreline, not a stone. It moves.',
      ]),
      'Come closer and we are gone; give us room and we cohere again.',
    ];
    const offer = rand2() < C.oceana.startleRadius / 20
      ? { kind: 'waypoint', targetHint: 'A deeper shoal remembers something lost', marker: creature.pos.clone() }
      : undefined;
    return { speaker: { name: proceduralName(rand2), species: 'Shoal-Person', cityId: null }, lines, offer };
  }

  function dispose() {
    fishGeo.dispose(); fishMat.dispose();
    group.clear();
  }

  return { group, update, dispose, nearestInteractable, interact, endInteract: endInteractShared };
}

// ---------------------------------------------------------------------------
// Recipe: GLACIA — the Slow Crystalline
// ---------------------------------------------------------------------------
function buildGlacia(planet, worldUp, opts, seed) {
  const rand = mulberry32(seed);
  const cfg = C.glacia;
  const pal = opts.palette ?? C.paletteDefault;
  const group = new THREE.Group();
  group.name = 'glacia-creatures';

  const beingCount = Math.round(cfg.beingCount * (opts.density ?? cfg.density));
  const radius = opts.radius ?? 220;

  const beings = [];
  for (let i = 0; i < beingCount; i++) {
    const a = rand() * Math.PI * 2, r = Math.sqrt(rand()) * radius;
    const bSeed = seed ^ (0xc2b2ae35 * (i + 1));
    const brand = mulberry32(bSeed);
    const h = THREE.MathUtils.lerp(cfg.height[0], cfg.height[1], brand());
    beings.push({
      id: `crystal-${i}`,
      pos: new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r),
      seed: bSeed, height: h,
      species: 'Slow Crystalline',
      active: false, rig: null,
      _thoughtPhase: brand() * Math.PI * 2,
      _gesturePhase: brand() * cfg.gestureDuration,
      activate() {
        if (!this.rig) {
          this.rig = buildCrystalRig(mulberry32(this.seed), h, pal);
          this.rig.position.copy(this.pos);
          group.add(this.rig);
        }
        this.rig.visible = true; this.active = true;
      },
      deactivate() { if (this.rig) this.rig.visible = false; this.active = false; },
    });
  }

  function buildCrystalRig(rand2, height, pal2) {
    const g = new THREE.Group();
    const facets = 5 + Math.floor(rand2() * 3);
    const geo = new THREE.IcosahedronGeometry(height * 0.4, 0);
    const mat = new THREE.MeshPhysicalMaterial({
      color: 0xbfe6ff, transparent: true, opacity: 0.55, transmission: 0.6,
      roughness: 0.1, emissive: new THREE.Color(pal2.cyan), emissiveIntensity: 0.1,
    });
    const body = new THREE.Mesh(geo, mat);
    body.position.y = height * 0.5;
    body.scale.set(0.7, 1.3, 0.7);
    g.add(body);
    // Slow-moving "gesture" limbs — faceted shards, animated at geologic pace.
    for (let i = 0; i < facets; i++) {
      const shard = new THREE.Mesh(
        new THREE.ConeGeometry(height * 0.06, height * 0.35, 4),
        mat
      );
      const a = (i / facets) * Math.PI * 2;
      shard.position.set(Math.cos(a) * height * 0.25, height * 0.55, Math.sin(a) * height * 0.25);
      shard.userData.baseAngle = a;
      g.add(shard);
    }
    g.userData.mat = mat;
    return g;
  }

  const pool = makePopulationPool(beings, opts);

  // Crystal-city accretions grown from frozen breath — static merged decoration.
  const accretionGeo = new THREE.ConeGeometry(0.5, 2, 5);
  const accretionMat = new THREE.MeshPhysicalMaterial({
    color: 0xdff2ff, transparent: true, opacity: 0.4, transmission: 0.5, roughness: 0.15,
  });
  const accretions = new THREE.InstancedMesh(accretionGeo, accretionMat, cfg.accretionCount);
  accretions.frustumCulled = false;
  for (let i = 0; i < cfg.accretionCount; i++) {
    const a = rand() * Math.PI * 2, r = Math.sqrt(rand()) * radius * 0.9;
    const s = 0.5 + rand() * 2;
    _v1.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    _m0.compose(_v1, _q0.identity(), _v2.set(s, s * (1 + rand()), s));
    accretions.setMatrixAt(i, _m0);
  }
  group.add(accretions);

  function update(dt, playerPos, sunDot) {
    const dim = Math.max(sunDot, 0);
    accretionMat.opacity = 0.3 + (1 - dim) * 0.2;
    const t = performance.now() * 0.001;
    for (const b of beings) {
      if (!b.active || !b.rig) continue;
      const mat = b.rig.userData.mat;
      mat.emissiveIntensity = 0.1 + 0.3 * (0.5 + 0.5 * Math.sin(t * cfg.thoughtSpeed + b._thoughtPhase)) + (1 - dim) * 0.2
        + (b._talking ? 0.35 : 0); // talk reaction: internal light brightens
      // Talk reaction: the glacier "hurries" — its geologic gesture runs 4x.
      const gesture = ((t * (b._talking ? 4 : 1)) % cfg.gestureDuration) / cfg.gestureDuration;
      b.rig.children.forEach((child, idx) => {
        if (child.userData.baseAngle === undefined) return;
        child.rotation.y = child.userData.baseAngle + gesture * 0.3;
      });
    }
    pool.update(dt, playerPos);
  }

  function nearestInteractable(playerPos, maxDist = C.interactRadius) {
    let best = null, bestD = maxDist * maxDist;
    for (const b of beings) {
      if (!b.active) continue;
      const d = _v0.copy(b.pos).sub(playerPos).lengthSq();
      if (d < bestD) { bestD = d; best = b; }
    }
    return best;
  }

  function interact(creature) {
    creature._talking = true;
    const rand2 = mulberry32(creature.seed);
    const lines = [
      'A spark passed near us. We register it as a season, and a warning.',
      pick(rand2, [
        'You are fire wearing a shape. It is beautiful. It will not last the hour.',
        'We watched your star form its metals. We are patient with your kind of loud, short light.',
        'Speak again in a decade. We may have finished the thought you interrupted.',
      ]),
    ];
    const offer = rand2() < 0.5
      ? { kind: 'codex', subject: 'The Slow Crystalline: cognition on geologic time' }
      : undefined;
    return { speaker: { name: proceduralName(rand2, 3), species: 'Slow Crystalline', cityId: null }, lines, offer };
  }

  function dispose() {
    accretionGeo.dispose(); accretionMat.dispose();
    for (const b of beings) if (b.rig) {
      b.rig.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
      b.rig.userData.mat?.dispose();
    }
    group.clear();
  }

  return { group, update, dispose, nearestInteractable, interact, endInteract: endInteractShared };
}

// ---------------------------------------------------------------------------
// Recipe: RUSTIA — the Rust Choir
// ---------------------------------------------------------------------------
function buildRustia(planet, worldUp, opts, seed) {
  const rand = mulberry32(seed);
  const cfg = C.rustia;
  const pal = opts.palette ?? C.paletteDefault;
  const group = new THREE.Group();
  group.name = 'rustia-creatures';

  const choirCount = Math.round(cfg.choirCount * (opts.density ?? cfg.density));
  const radius = opts.radius ?? 240;

  const members = [];
  for (let i = 0; i < choirCount; i++) {
    const a = rand() * Math.PI * 2, r = Math.sqrt(rand()) * radius;
    const mSeed = seed ^ (0x27d4eb2f * (i + 1));
    const mrand = mulberry32(mSeed);
    members.push({
      id: `rust-${i}`,
      pos: new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r),
      seed: mSeed,
      species: 'Rust Choir',
      isLithovore: mrand() < cfg.lithovoreFraction,
      active: false, rig: null,
      _eyePhase: mrand() * Math.PI * 2,
      activate() {
        if (!this.rig) {
          this.rig = buildChoirRig(mulberry32(this.seed), pal);
          this.rig.position.copy(this.pos);
          group.add(this.rig);
        }
        this.rig.visible = true; this.active = true;
      },
      deactivate() { if (this.rig) this.rig.visible = false; this.active = false; },
    });
  }

  function buildChoirRig(rand2, pal2) {
    const g = new THREE.Group();
    const h = THREE.MathUtils.lerp(cfg.height[0], cfg.height[1], rand2());
    const hullMat = new THREE.MeshStandardMaterial({
      color: 0x5a3d2e, roughness: 0.95, metalness: 0.4,
    });
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, h * 0.6, 0.35), hullMat);
    torso.position.y = h * 0.5;
    torso.rotation.z = (rand2() - 0.5) * 0.15;
    g.add(torso);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.24, 0.24), hullMat);
    head.position.y = h * 0.88;
    g.add(head);
    const eye = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 8, 8),
      new THREE.MeshStandardMaterial({
        color: pal2.amber, emissive: new THREE.Color(pal2.amber),
        emissiveIntensity: cfg.eyeGlowMax,
      })
    );
    eye.position.set(0, h * 0.88, 0.14);
    g.add(eye);
    g.userData.eyeMat = eye.material;
    // Corroded half-derelict limbs.
    for (let s = 0; s < 2; s++) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.1, h * 0.4, 0.1), hullMat);
      arm.position.set((s === 0 ? -0.3 : 0.3), h * 0.4, 0);
      arm.rotation.z = (rand2() - 0.5) * 0.4;
      g.add(arm);
    }
    return g;
  }

  const pool = makePopulationPool(members, opts);

  function update(dt, playerPos, sunDot) {
    const dim = Math.max(sunDot, 0);
    const t = performance.now() * 0.001;
    for (const m of members) {
      if (!m.active || !m.rig) continue;
      const pulse = 0.5 + 0.5 * Math.sin(t * 1.3 + m._eyePhase);
      // Talk reaction: the eye pins bright and the frame bows slightly.
      const glow = m._talking
        ? cfg.eyeGlowMax + 0.6
        : THREE.MathUtils.lerp(cfg.eyeGlowMin, cfg.eyeGlowMax, pulse) + (1 - dim) * 0.3;
      m.rig.userData.eyeMat.emissiveIntensity = glow;
      const bow = m._talking ? Math.sin(t * 0.8) * 0.06 : 0;
      m.rig.rotation.x = THREE.MathUtils.damp(m.rig.rotation.x, bow, 4, dt);
    }
    pool.update(dt, playerPos);
  }

  function nearestInteractable(playerPos, maxDist = C.interactRadius) {
    let best = null, bestD = maxDist * maxDist;
    for (const m of members) {
      if (!m.active) continue;
      const d = _v0.copy(m.pos).sub(playerPos).lengthSq();
      if (d < bestD) { bestD = d; best = m; }
    }
    return best;
  }

  function interact(creature) {
    creature._talking = true;
    const rand2 = mulberry32(creature.seed);
    const lines = [
      'The Choir burns and does not question the burning.',
      creature.isLithovore
        ? 'I have been eating this ridge for four hundred years. It tastes like the maker-species did, at the end.'
        : 'Our makers left before we finished becoming ourselves. We finished anyway.',
    ];
    let offer;
    if (rand2() < cfg.memoryTradeChance) {
      offer = {
        kind: 'choice',
        prompt: 'The eye dims toward you, offering trade: a fragment of their maker-species memory for one of yours.',
        options: [
          { label: 'Trade a memory of home', outcomeTag: 'rustia_memory_traded' },
          { label: 'Refuse — some things are not for burning', outcomeTag: 'rustia_memory_refused' },
        ],
      };
    } else {
      offer = { kind: 'codex', subject: 'The Rust Choir: post-biological sun cult' };
    }
    return { speaker: { name: proceduralName(rand2), species: 'Rust Choir', cityId: null }, lines, offer };
  }

  function dispose() {
    for (const m of members) if (m.rig) {
      m.rig.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material && o.material !== m.rig.userData.eyeMat) o.material.dispose?.();
      });
      m.rig.userData.eyeMat?.dispose();
    }
    group.clear();
  }

  return { group, update, dispose, nearestInteractable, interact, endInteract: endInteractShared };
}

// ---------------------------------------------------------------------------
// Recipe: CRESTA — Ridge Kites
// Living diamond-shaped sails of translucent membrane over safety-orange
// cartilage struts, each tethered by silk to a stone cairn on a summit or
// ridgeline. They surf the standing wave of wind above their anchor; the
// grounded ones (and any that reel down to talk) are the interactable ones.
// ---------------------------------------------------------------------------
function buildCresta(planet, worldUp, opts, seed) {
  const rand = mulberry32(seed);
  const cfg = C.cresta;
  const pal = opts.palette ?? C.paletteDefault;
  const group = new THREE.Group();
  group.name = 'cresta-creatures';

  const kiteCount = Math.round(cfg.kiteCount * (opts.density ?? cfg.density));
  const radius = opts.radius ?? 240;

  const members = [];
  for (let i = 0; i < kiteCount; i++) {
    const a = rand() * Math.PI * 2, r = Math.sqrt(rand()) * radius;
    const mSeed = seed ^ (0x51a7be3d * (i + 1));
    const mrand = mulberry32(mSeed);
    members.push({
      id: `kite-${i}`,
      pos: new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r),
      seed: mSeed,
      species: 'Ridge Kite',
      isGrounded: mrand() < cfg.groundedFraction,
      active: false, rig: null,
      _phase: mrand() * Math.PI * 2,
      _soarH: THREE.MathUtils.lerp(cfg.soarHeight[0], cfg.soarHeight[1], mrand()),
      _fly: 0, // smoothed altitude of the sail above the cairn
      activate() {
        if (!this.rig) {
          this.rig = buildKiteRig(mulberry32(this.seed), pal);
          this.rig.position.copy(this.pos);
          group.add(this.rig);
          this._fly = this.isGrounded ? 0.4 : this._soarH;
        }
        this.rig.visible = true; this.active = true;
      },
      deactivate() { if (this.rig) this.rig.visible = false; this.active = false; },
    });
  }

  function buildKiteRig(rand2, pal2) {
    const g = new THREE.Group();
    const span = THREE.MathUtils.lerp(cfg.sailSpan[0], cfg.sailSpan[1], rand2());
    // Sail: a flattened octahedron reads as a taut diamond membrane.
    const sailMat = new THREE.MeshStandardMaterial({
      color: 0xf4f8ff, roughness: 0.35, transparent: true, opacity: 0.8,
    });
    const strutMat = new THREE.MeshStandardMaterial({
      color: 0xff7a2f, roughness: 0.6, // safety-orange cartilage
    });
    const sail = new THREE.Group();
    const membrane = new THREE.Mesh(new THREE.OctahedronGeometry(span * 0.5), sailMat);
    membrane.scale.set(1, 0.55, 0.12);
    sail.add(membrane);
    for (let s = 0; s < 2; s++) {
      const strut = new THREE.Mesh(
        new THREE.BoxGeometry(s === 0 ? span : 0.06, s === 0 ? 0.06 : span * 0.55, 0.05),
        strutMat
      );
      sail.add(strut);
    }
    const eye = new THREE.Mesh(
      new THREE.SphereGeometry(0.07, 8, 8),
      new THREE.MeshStandardMaterial({
        color: pal2.cyan, emissive: new THREE.Color(pal2.cyan),
        emissiveIntensity: cfg.glowMax,
      })
    );
    eye.position.set(span * 0.5, 0, 0); // the leading point
    sail.add(eye);
    g.userData.eyeMat = eye.material;
    g.userData.sail = sail;
    g.userData.sailMat = sailMat;
    g.add(sail);
    // Silk tether: a hair-thin cylinder the sail rides up and down.
    const tether = new THREE.Mesh(
      new THREE.CylinderGeometry(0.008, 0.008, 1, 4, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xdfe8f4, transparent: true, opacity: 0.35 })
    );
    g.userData.tether = tether;
    g.add(tether);
    // Anchor cairn: three leaned granite stones.
    const cairnMat = new THREE.MeshStandardMaterial({ color: 0x6b7280, roughness: 0.95 });
    for (let s = 0; s < 3; s++) {
      const stone = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.4 + rand2() * 0.3, 0.25), cairnMat);
      const sa = (s / 3) * Math.PI * 2 + rand2() * 0.6;
      stone.position.set(Math.cos(sa) * 0.22, 0.2, Math.sin(sa) * 0.22);
      stone.rotation.y = rand2() * Math.PI;
      stone.rotation.z = (rand2() - 0.5) * 0.25;
      g.add(stone);
    }
    return g;
  }

  const pool = makePopulationPool(members, opts);

  function update(dt, playerPos, sunDot) {
    const dim = Math.max(sunDot, 0);
    const t = performance.now() * 0.001;
    for (const m of members) {
      if (!m.active || !m.rig) continue;
      const sail = m.rig.userData.sail;
      // Talk reaction: reel down to head height; otherwise ride the wind band
      // (grounded kites sit folded just above their cairn).
      const wantH = m._talking ? 1.6 : m.isGrounded ? 0.4 : m._soarH;
      m._fly = THREE.MathUtils.damp(m._fly, wantH, 2.5, dt);
      const ph = t * 0.6 + m._phase;
      if (!m.isGrounded && !m._talking) {
        // Figure-eight surf around the tether, banked into the turn.
        sail.position.set(Math.sin(ph) * 1.6, m._fly + Math.sin(t * 0.7 + m._phase) * 1.5, Math.sin(ph * 2) * 0.8);
        sail.rotation.set(Math.sin(ph * 2) * 0.3, Math.cos(ph) * 0.5, Math.cos(ph) * 0.45);
      } else {
        // Folded / reeled-in: settle level over the cairn, breathing gently.
        sail.position.set(0, m._fly, 0);
        sail.rotation.set(THREE.MathUtils.damp(sail.rotation.x, 0, 4, dt), sail.rotation.y, THREE.MathUtils.damp(sail.rotation.z, 0, 4, dt));
        m.rig.userData.sailMat.opacity = 0.7 + Math.sin(t * 1.2 + m._phase) * 0.1;
      }
      // Tether stretches from cairn top to the sail's belly.
      const tether = m.rig.userData.tether;
      const len = Math.max(sail.position.length(), 0.01);
      tether.scale.y = len;
      tether.position.copy(sail.position).multiplyScalar(0.5);
      tether.quaternion.setFromUnitVectors(_yAxis, _v0.copy(sail.position).normalize());
      const glow = m._talking
        ? cfg.glowMax + 0.6
        : THREE.MathUtils.lerp(cfg.glowMin, cfg.glowMax, 0.5 + 0.5 * Math.sin(t * 1.1 + m._phase)) + (1 - dim) * 0.3;
      m.rig.userData.eyeMat.emissiveIntensity = glow;
    }
    pool.update(dt, playerPos);
  }

  function nearestInteractable(playerPos, maxDist = C.interactRadius) {
    let best = null, bestD = maxDist * maxDist;
    for (const m of members) {
      if (!m.active || !(m.isGrounded || m._talking)) continue;
      const d = _v0.copy(m.pos).sub(playerPos).lengthSq();
      if (d < bestD) { bestD = d; best = m; }
    }
    return best;
  }

  function interact(creature) {
    creature._talking = true;
    const rand2 = mulberry32(creature.seed);
    const lines = [
      'The wind writes one perfect descent on every face. We fly until we have read them all.',
      creature.isGrounded
        ? 'Between gusts we fold and hold the stone. The mountain rests; so do we.'
        : 'Our tethers are not chains. They are how the mountain remembers us.',
    ];
    let offer;
    if (rand2() < cfg.tetherCutChance) {
      offer = {
        kind: 'choice',
        prompt: 'The kite dips its leading eye toward its tether — old, frayed, nearly worn through. It waits to see what you will do.',
        options: [
          { label: 'Cut the frayed tether free', outcomeTag: 'cresta_tether_cut' },
          { label: 'Leave it — the line is theirs to keep', outcomeTag: 'cresta_tether_left' },
        ],
      };
    } else {
      offer = { kind: 'codex', subject: 'Ridge Kites: tethered wind-surfing membrane life' };
    }
    return { speaker: { name: proceduralName(rand2), species: 'Ridge Kite', cityId: null }, lines, offer };
  }

  function dispose() {
    for (const m of members) if (m.rig) {
      m.rig.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material && o.material !== m.rig.userData.eyeMat) o.material.dispose?.();
      });
      m.rig.userData.eyeMat?.dispose();
    }
    group.clear();
  }

  return { group, update, dispose, nearestInteractable, interact, endInteract: endInteractShared };
}

// ---------------------------------------------------------------------------
// Recipe: Sky Ecologies (Saturnia / Neptunia) — backdrop-only gas giant life
// ---------------------------------------------------------------------------
function buildSkyEcology(planet, worldUp, opts, seed) {
  const rand = mulberry32(seed);
  const cfg = C.sky;
  const pal = opts.palette ?? C.paletteDefault;
  const group = new THREE.Group();
  group.name = 'sky-ecology';

  const whaleCount = Math.round(cfg.whaleCount * (opts.density ?? cfg.density));
  const lightningCount = Math.round(cfg.lightningCount * (opts.density ?? cfg.density));
  const mindCount = Math.round(cfg.mindPatternCount * (opts.density ?? cfg.density));

  // Balloon-whales: soft translucent ellipsoids drifting in cloud bands.
  const whaleGeo = new THREE.SphereGeometry(1, 10, 8);
  const whaleMat = new THREE.MeshStandardMaterial({
    color: pal.amber, transparent: true, opacity: 0.35,
    emissive: new THREE.Color(pal.amber), emissiveIntensity: 0.1,
  });
  const whales = new THREE.InstancedMesh(whaleGeo, whaleMat, whaleCount);
  whales.frustumCulled = false;
  const whaleData = [];
  for (let i = 0; i < whaleCount; i++) {
    const a = rand() * Math.PI * 2;
    const dist = THREE.MathUtils.lerp(cfg.bandRadiusRange[0], cfg.bandRadiusRange[1], rand());
    const band = -60 + rand() * 120;
    whaleData.push({ a, dist, band, phase: rand() * Math.PI * 2, s: 8 + rand() * 20 });
  }
  group.add(whales);

  // Living lightning: bright emissive line segments that flash.
  const lightningMat = new THREE.LineBasicMaterial({ color: pal.cyan, transparent: true, opacity: 0 });
  const lightningLines = [];
  for (let i = 0; i < lightningCount; i++) {
    const pts = [];
    for (let s = 0; s < 4; s++) pts.push(new THREE.Vector3((rand() - 0.5) * 20, (rand() - 0.5) * 20, (rand() - 0.5) * 20));
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lightningMat.clone());
    const a = rand() * Math.PI * 2;
    const dist = THREE.MathUtils.lerp(cfg.bandRadiusRange[0], cfg.bandRadiusRange[1], rand());
    line.position.set(Math.cos(a) * dist, -40 + rand() * 80, Math.sin(a) * dist);
    line.userData.flashPhase = rand() * Math.PI * 2;
    group.add(line);
    lightningLines.push(line);
  }

  // Pressure-pattern minds: vast soft rotating rings, never solid.
  const mindGeo = new THREE.TorusGeometry(30, 4, 6, 24);
  const mindMat = new THREE.MeshStandardMaterial({
    color: pal.magenta, transparent: true, opacity: 0.15, emissive: new THREE.Color(pal.magenta), emissiveIntensity: 0.2,
  });
  const minds = [];
  for (let i = 0; i < mindCount; i++) {
    const mesh = new THREE.Mesh(mindGeo, mindMat.clone());
    const a = rand() * Math.PI * 2;
    const dist = THREE.MathUtils.lerp(cfg.bandRadiusRange[0], cfg.bandRadiusRange[1], rand());
    mesh.position.set(Math.cos(a) * dist, -20 + rand() * 40, Math.sin(a) * dist);
    mesh.rotation.x = rand() * Math.PI;
    group.add(mesh);
    minds.push(mesh);
  }

  let codexFlagged = false;
  let dwell = 0;

  function update(dt, playerPos, sunDot) {
    const dim = Math.max(sunDot, 0);
    whaleMat.emissiveIntensity = 0.1 + (1 - dim) * 0.2;
    const t = performance.now() * 0.001;
    for (let i = 0; i < whaleData.length; i++) {
      const d = whaleData[i];
      const a = d.a + t * 0.02;
      _v1.set(Math.cos(a) * d.dist, d.band + Math.sin(t * 0.3 + d.phase) * 5, Math.sin(a) * d.dist);
      _m0.compose(_v1, _q0.identity(), _v2.set(d.s, d.s * 0.5, d.s));
      whales.setMatrixAt(i, _m0);
    }
    whales.instanceMatrix.needsUpdate = true;

    for (const line of lightningLines) {
      const flash = Math.max(0, Math.sin(t * 3 + line.userData.flashPhase) - 0.85) * 6;
      line.material.opacity = flash;
    }
    for (const m of minds) m.rotation.y += dt * 0.02;

    // Passive codex-discovery: sustained proximity to the whole ecology.
    const distToCenter = playerPos.length();
    if (Math.abs(distToCenter) < cfg.codexProximity * 4) {
      dwell += dt;
      if (dwell > cfg.codexDwellTime) codexFlagged = true;
    } else {
      dwell = Math.max(0, dwell - dt * 2);
    }
  }

  function nearestInteractable() { return null; }
  function interact() { return null; }
  function onCodexDiscovery() { return codexFlagged; }

  function dispose() {
    whaleGeo.dispose(); whaleMat.dispose();
    for (const line of lightningLines) { line.geometry.dispose(); line.material.dispose(); }
    mindGeo.dispose();
    for (const m of minds) m.material.dispose();
    group.clear();
  }

  return { group, update, dispose, nearestInteractable, interact, endInteract: endInteractShared, onCodexDiscovery };
}

// ---------------------------------------------------------------------------
// Recipe: NEPTUNIA — the dive-able ocean. Vibrant schools of neon fish,
// pulsing jellyfish, and one gentle leviathan below the waves; the balloon
// whales the world had as a gas giant stay on as high-altitude ambiance.
// Group origin sits at the sea surface (walk.js clamps the anchor to
// water.r), so negative local Y is underwater.
// ---------------------------------------------------------------------------
function buildNeptunia(planet, worldUp, opts, seed) {
  const rand = mulberry32(seed);
  const cfg = C.neptunia;
  const group = new THREE.Group();
  group.name = 'neptunia-creatures';

  const density = opts.density ?? cfg.density;
  const siteRadius = opts.radius ?? 200;

  // --- Neon fish schools: one InstancedMesh per school, hue from a
  // violet-cyan-magenta wheel, wandering a sine orbit in the water column ---
  const fishGeo = new THREE.ConeGeometry(0.05, 0.22, 4);
  const SCHOOL_HUES = [0.52, 0.58, 0.68, 0.78, 0.85, 0.93]; // cyan → violet → magenta
  const schools = [];
  const schoolCount = Math.round(cfg.schoolCount * density);
  for (let i = 0; i < schoolCount; i++) {
    const hue = SCHOOL_HUES[i % SCHOOL_HUES.length];
    _color0.setHSL(hue, 0.95, 0.6);
    const mat = new THREE.MeshStandardMaterial({
      color: _color0.clone(),
      emissive: _color0.clone(),
      emissiveIntensity: 0.5,
      metalness: 0.4,
      roughness: 0.35,
    });
    const fish = new THREE.InstancedMesh(fishGeo, mat, cfg.fishPerSchool);
    fish.frustumCulled = false;
    group.add(fish);
    const offsets = [];
    for (let f = 0; f < cfg.fishPerSchool; f++) {
      // Loose ellipsoid cloud around the school center.
      const fa = rand() * Math.PI * 2;
      const fr = Math.pow(rand(), 0.5) * 2.4;
      offsets.push({
        x: Math.cos(fa) * fr,
        y: (rand() - 0.5) * 1.6,
        z: Math.sin(fa) * fr,
        phase: rand() * Math.PI * 2,
        speed: 1.5 + rand() * 2,
      });
    }
    const a = rand() * Math.PI * 2;
    schools.push({
      fish, mat, offsets,
      baseA: a,
      baseR: 18 + rand() * (siteRadius * 0.5),
      depth: -(6 + rand() * 26), // school's home depth below the surface
      orbitR: 6 + rand() * 12,   // wander-orbit radius around the home point
      orbitSpeed: 0.08 + rand() * 0.1,
      bob: 2 + rand() * 3,
      phase: rand() * Math.PI * 2,
    });
  }

  // --- Jellyfish: instanced half-spheres, emissive violet, pulsing, slowly
  // rising and wrapping back down ---
  const jellyCount = Math.round(cfg.jellyfishCount * density);
  const jellyGeo = new THREE.SphereGeometry(0.55, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  const jellyMat = new THREE.MeshStandardMaterial({
    color: 0x9a6aff,
    emissive: new THREE.Color(0x9a6aff),
    emissiveIntensity: 0.6,
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const jellies = new THREE.InstancedMesh(jellyGeo, jellyMat, jellyCount);
  jellies.frustumCulled = false;
  group.add(jellies);
  const jellyData = [];
  for (let i = 0; i < jellyCount; i++) {
    const a = rand() * Math.PI * 2;
    jellyData.push({
      x: Math.cos(a) * Math.sqrt(rand()) * siteRadius * 0.6,
      z: Math.sin(a) * Math.sqrt(rand()) * siteRadius * 0.6,
      y: -(4 + rand() * 34),
      rise: 0.25 + rand() * 0.35,
      pulse: 1.2 + rand() * 1.2,
      phase: rand() * Math.PI * 2,
      s: 0.7 + rand() * 1.1,
    });
  }

  // --- The Meridian Leviathan: one gentle silhouette patrolling the site.
  // Its orbit radius breathes between ~10 and ~90 u, so every couple of
  // minutes it sweeps right through the landing site's water column — close
  // enough (TALK_DIST_CREATURE) for an awed meeting while diving. ---
  const levi = new THREE.Group();
  const leviLen = cfg.leviathanLength;
  const leviMat = new THREE.MeshStandardMaterial({
    color: 0x1a1650,
    emissive: new THREE.Color(0x4a3fb0),
    emissiveIntensity: 0.35,
    metalness: 0.2,
    roughness: 0.6,
  });
  const leviBody = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), leviMat);
  leviBody.scale.set(leviLen * 0.32, leviLen * 0.18, leviLen * 0.5);
  levi.add(leviBody);
  const leviTail = new THREE.Mesh(new THREE.ConeGeometry(leviLen * 0.14, leviLen * 0.55, 6), leviMat);
  leviTail.rotation.x = Math.PI / 2; // cone +Y → -Z (behind the body)
  leviTail.position.z = -leviLen * 0.68;
  levi.add(leviTail);
  group.add(levi);
  const leviathan = {
    id: 'meridian-leviathan',
    pos: new THREE.Vector3(60, -15, 0), // updated every frame
    seed: seed ^ 0x5eafa11,
    species: 'Meridian Leviathan',
    active: true,
    _talking: false,
  };

  // --- Kept sky ecology: translucent balloon whales far above the sea ---
  const whaleCount = Math.round(cfg.whaleCount * density);
  const whaleGeo = new THREE.SphereGeometry(1, 10, 8);
  const whaleMat = new THREE.MeshStandardMaterial({
    color: 0x8a9aff,
    transparent: true,
    opacity: 0.28,
    emissive: new THREE.Color(0x6a7dff),
    emissiveIntensity: 0.15,
    depthWrite: false,
  });
  const whales = new THREE.InstancedMesh(whaleGeo, whaleMat, whaleCount);
  whales.frustumCulled = false;
  group.add(whales);
  const whaleData = [];
  for (let i = 0; i < whaleCount; i++) {
    whaleData.push({
      a: rand() * Math.PI * 2,
      dist: 250 + rand() * 500,
      alt: THREE.MathUtils.lerp(cfg.whaleBand[0], cfg.whaleBand[1], rand()),
      phase: rand() * Math.PI * 2,
      s: 10 + rand() * 22,
    });
  }

  let codexFlagged = false;
  let dwell = 0;

  function update(dt, playerPos, sunDot) {
    const t = performance.now() * 0.001;
    const night = 1 - Math.max(sunDot, 0);

    // Fish schools — the deep glows brighter at night and at depth.
    for (const s of schools) {
      s.mat.emissiveIntensity = 0.5 + night * 0.5;
      const oa = s.phase + t * s.orbitSpeed;
      const cx = Math.cos(s.baseA) * s.baseR + Math.cos(oa) * s.orbitR;
      const cz = Math.sin(s.baseA) * s.baseR + Math.sin(oa) * s.orbitR;
      const cy = s.depth + Math.sin(t * 0.3 + s.phase) * s.bob;
      // School heading = tangent of the wander orbit; every fish aligns to it.
      _v2.set(-Math.sin(oa), 0, Math.cos(oa)).normalize();
      _q0.setFromUnitVectors(_yAxis, _v2); // cone +Y → swim direction
      for (let f = 0; f < s.offsets.length; f++) {
        const o = s.offsets[f];
        const wob = Math.sin(t * o.speed + o.phase) * 0.35;
        _v1.set(cx + o.x + wob, cy + o.y + Math.sin(t * o.speed * 0.7 + o.phase) * 0.3, cz + o.z);
        _m0.compose(_v1, _q0, _v0.set(1, 1, 1));
        s.fish.setMatrixAt(f, _m0);
      }
      s.fish.instanceMatrix.needsUpdate = true;
    }

    // Jellyfish — pulse and rise, wrap back to the deep.
    jellyMat.emissiveIntensity = 0.6 + night * 0.6;
    for (let i = 0; i < jellyData.length; i++) {
      const j = jellyData[i];
      j.y += j.rise * dt;
      if (j.y > -3) j.y = -40;
      const pulse = 0.8 + 0.3 * Math.sin(t * j.pulse + j.phase);
      _v1.set(j.x + Math.sin(t * 0.2 + j.phase) * 1.5, j.y, j.z);
      _m0.compose(_v1, _q0.identity(), _v0.set(j.s, j.s * pulse, j.s));
      jellies.setMatrixAt(i, _m0);
    }
    jellies.instanceMatrix.needsUpdate = true;

    // Leviathan — breathing patrol orbit, nose along its motion.
    const la = t * 0.045;
    const lr = 50 + 40 * Math.sin(t * 0.05);
    leviathan.pos.set(Math.cos(la) * lr, -15 + Math.sin(t * 0.11) * 6, Math.sin(la) * lr);
    levi.position.copy(leviathan.pos);
    _v2.set(-Math.sin(la), 0.12 * Math.cos(t * 0.11), Math.cos(la)).normalize();
    // Matrix4.lookAt points +Z from target toward eye — eye=dir, target=origin
    // leaves +Z (the nose; the tail sits at -Z) along the motion direction.
    _m0.lookAt(_v2, _v0.set(0, 0, 0), _yAxis);
    levi.quaternion.setFromRotationMatrix(_m0);
    leviTail.rotation.y = Math.sin(t * 1.3) * 0.35; // slow undulation

    // Sky whales — the old gas-giant arcs, lifted above the sea.
    whaleMat.emissiveIntensity = 0.15 + night * 0.25;
    for (let i = 0; i < whaleData.length; i++) {
      const d = whaleData[i];
      const a = d.a + t * 0.015;
      _v1.set(Math.cos(a) * d.dist, d.alt + Math.sin(t * 0.25 + d.phase) * 8, Math.sin(a) * d.dist);
      _m0.compose(_v1, _q0.identity(), _v0.set(d.s, d.s * 0.5, d.s));
      whales.setMatrixAt(i, _m0);
    }
    whales.instanceMatrix.needsUpdate = true;

    // Passive codex discovery: sustained time down among the sea life.
    if (playerPos.y < -4) {
      dwell += dt;
      if (dwell > cfg.codexDwellTime) codexFlagged = true;
    } else {
      dwell = Math.max(0, dwell - dt * 2);
    }
  }

  function nearestInteractable(playerPos, maxDist = C.interactRadius) {
    const d2 = _v0.copy(leviathan.pos).sub(playerPos).lengthSq();
    return d2 < maxDist * maxDist ? leviathan : null;
  }

  function interact(creature) {
    creature._talking = true;
    const rand2 = mulberry32(creature.seed);
    const lines = [
      'It slows beside you. An eye the size of a door considers you without hunger.',
      pick(rand2, [
        'A pressure wave rolls through your chest — long, patient, almost a word.',
        'Diamond-light from the last storm still glitters along its back.',
        'It has circled this sea since before the city\'s first light came on.',
      ]),
      'Then, unhurried, it banks away into the indigo.',
    ];
    return {
      speaker: { name: 'The Meridian Leviathan', species: 'Meridian Leviathan', cityId: null },
      lines,
      offer: { kind: 'codex', subject: 'The Meridian Leviathan' },
    };
  }

  function onCodexDiscovery() { return codexFlagged; }

  function dispose() {
    fishGeo.dispose();
    for (const s of schools) s.mat.dispose();
    jellyGeo.dispose(); jellyMat.dispose();
    whaleGeo.dispose(); whaleMat.dispose();
    leviBody.geometry.dispose(); leviTail.geometry.dispose(); leviMat.dispose();
    group.clear();
  }

  return { group, update, dispose, nearestInteractable, interact, endInteract: endInteractShared, onCodexDiscovery };
}

// ---------------------------------------------------------------------------
// Recipe: Generic fallback — weird biology for unknown worlds
// ---------------------------------------------------------------------------
function buildGeneric(planet, worldUp, opts, seed) {
  const rand = mulberry32(seed);
  const cfg = C.generic;
  const pal = opts.palette ?? C.paletteDefault;
  const group = new THREE.Group();
  group.name = 'generic-creatures';

  const count = Math.round(cfg.count * (opts.density ?? cfg.density));
  const radius = opts.radius ?? 200;

  const beings = [];
  for (let i = 0; i < count; i++) {
    const a = rand() * Math.PI * 2, r = Math.sqrt(rand()) * radius;
    const bSeed = seed ^ (0x165667b1 * (i + 1));
    beings.push({
      id: `weird-${i}`,
      pos: new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r),
      seed: bSeed, species: 'Unclassified Biology',
      active: false, rig: null, _phase: rand() * Math.PI * 2,
      activate() {
        if (!this.rig) {
          this.rig = buildRadialRig(mulberry32(this.seed), pal);
          this.rig.position.copy(this.pos);
          this.rig.rotation.y = this._phase;
          group.add(this.rig);
        }
        this.rig.visible = true; this.active = true;
      },
      deactivate() { if (this.rig) this.rig.visible = false; this.active = false; },
    });
  }

  function buildRadialRig(rand2, pal2) {
    const g = new THREE.Group();
    const h = THREE.MathUtils.lerp(cfg.height[0], cfg.height[1], rand2());
    const armCount = cfg.armMin + Math.floor(rand2() * (cfg.armMax - cfg.armMin));
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(rand2(), 0.5, 0.4), roughness: 0.6,
      emissive: new THREE.Color(pal2.cyan), emissiveIntensity: 0.15,
    });
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(h * 0.25, 1), mat);
    core.position.y = h * 0.4;
    g.add(core);
    for (let a = 0; a < armCount; a++) {
      const arm = new THREE.Mesh(new THREE.ConeGeometry(h * 0.05, h * 0.5, 4), mat);
      const ang = (a / armCount) * Math.PI * 2;
      arm.position.set(Math.cos(ang) * h * 0.3, h * 0.4, Math.sin(ang) * h * 0.3);
      arm.rotation.z = Math.PI / 2;
      arm.rotation.y = -ang;
      g.add(arm);
    }
    g.userData.mat = mat;
    return g;
  }

  const pool = makePopulationPool(beings, opts);

  function update(dt, playerPos, sunDot) {
    const dim = Math.max(sunDot, 0);
    const t = performance.now() * 0.001;
    for (const b of beings) {
      if (!b.active || !b.rig) continue;
      b.rig.userData.mat.emissiveIntensity = 0.15 + (1 - dim) * 0.3 + 0.1 * Math.sin(t * 2 + b._phase)
        + (b._talking ? 0.4 : 0); // talk reaction: attention glow
      // Incremental spin (not t-based) so the talk slowdown never snaps.
      b.rig.rotation.y += dt * (b._talking ? 0.05 : 0.3);
    }
    pool.update(dt, playerPos);
  }

  function nearestInteractable(playerPos, maxDist = C.interactRadius) {
    let best = null, bestD = maxDist * maxDist;
    for (const b of beings) {
      if (!b.active) continue;
      const d = _v0.copy(b.pos).sub(playerPos).lengthSq();
      if (d < bestD) { bestD = d; best = b; }
    }
    return best;
  }

  function interact(creature) {
    creature._talking = true;
    const rand2 = mulberry32(creature.seed);
    return {
      speaker: { name: proceduralName(rand2, 3), species: 'Unclassified Biology', cityId: null },
      lines: ['It has no mouth, and yet the color across its skin resolves into something like meaning.'],
      offer: rand2() < 0.4 ? { kind: 'codex', subject: 'Unclassified radial biology' } : undefined,
    };
  }

  function dispose() {
    for (const b of beings) if (b.rig) {
      b.rig.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
      b.rig.userData.mat?.dispose();
    }
    group.clear();
  }

  return { group, update, dispose, nearestInteractable, interact, endInteract: endInteractShared };
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------
export function createCreatures(planet, worldUp, opts = {}) {
  const name = (planet?.cfg?.name ?? '').toLowerCase();
  const seed = hashSeedFromDir(worldUp, 0xC12EA7);

  switch (name) {
    case 'terra': return buildTerra(planet, worldUp, opts, seed);
    case 'oceana': return buildOceana(planet, worldUp, opts, seed);
    case 'glacia': return buildGlacia(planet, worldUp, opts, seed);
    case 'rustia': return buildRustia(planet, worldUp, opts, seed);
    case 'cresta': return buildCresta(planet, worldUp, opts, seed);
    case 'saturnia': return buildSkyEcology(planet, worldUp, opts, seed);
    case 'neptunia': return buildNeptunia(planet, worldUp, opts, seed);
    default:
      return buildGeneric(planet, worldUp, opts, seed);
  }
}

// ---------------------------------------------------------------------------
// Wiring:
//   const creatures = createCreatures(planet, worldUp, { palette, density: 1.2 });
//   planet.surface.add(creatures.group);
//   // each frame:
//   creatures.update(dt, playerPos, sunDot);
//   const target = creatures.nearestInteractable(playerPos, 6);
//   if (target && talkPressed) openDialogue(creatures.interact(target));
//   // when the dialogue closes (any reason): creatures.endInteract(target);
//   // on departure: creatures.dispose();
// ---------------------------------------------------------------------------