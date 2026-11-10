// Warzone — the city worlds as an always-on first-person combat zone.
//
// Every stock registry city (Terra's Meridian Crown, Rustia's Redline Claim,
// Neptunia's Indigo Reach, Wyattmattoe's Kite Saddle) is under siege by
// monsters: things the size of trucks and buildings that come over the town
// wall in waves. The story worlds (Shadowreach, Actuality / the Comfort Zone)
// and WaveMall Prime early-return in walk.js long before a city is built, so
// they never reach this module.
//
// The townspeople are civilians: they keep to their homes, nothing targets
// them, and player rounds pass through them — the governor quests and vendor
// trees keep working mid-fight. Dialogue is a ceasefire.
//
// What this module owns, all in the CITY-LOCAL flat frame (its group is a
// child of city.group, the frame walk.js's _playerLocal already lives in):
//   - war dressing: sandbag walls, jersey barriers, crate stacks, burnt-out
//     hulks and shipping containers, each a real AABB collider pushed onto
//     city.structures — so walk.js's player collision, rooftop/standing
//     surfaces and third-person boom clamp all pick them up for free — plus
//     scorch marks, rubble and smoke columns over burning wrecks;
//   - the monsters' brains (bodies are world/monsters.js): four rigged kinds
//     and an instanced swarm, each a small state machine — approach, wind up
//     (the tell you dodge on), attack, recover — with routing round the house
//     ring through the town gate, since nothing that size fits between houses;
//   - what their attacks do: ground shockwaves that pass through walls and
//     are jumped, a charge you sidestep, a leap that lands where you stood,
//     lobbed acid that pools, dive-bombing swarmlings;
//   - ballistics for five weapons (src/arsenal.js): instant rays, pellet
//     cones, a piercing slug, arcing explosive shells that leave burning
//     ground, and chain lightning — against wall boxes (city.js makeStructure
//     rayHit), the town deck and the monsters' hit spheres, with tracers,
//     sparks, dust, ichor and bullet-hole decals;
//   - waves (a titan every fifth), player armor (regenerating), death and the
//     redeploy at the landing pad, ammo drops, weapon crates, pad resupply;
//   - the viewmodel (warzone-weapon.js), the HUD (warzone-hud.js) and the
//     synthesized audio (warzone-audio.js).
//
// Contract with walk.js: update() takes the player's local eye/aim basis and
// returns aim kicks (recoil, flinch) and a respawn flag; walk.js applies them,
// because walk.js owns the walker. shake() is camera trauma for walk.js's
// first-person camera. Nothing here touches walk/ship state.

import * as THREE from 'three';
import { makeStructure } from './city.js';
import { createMonsterKit, ARCHETYPES, SWARMLING, SKINS, CRIT } from './monsters.js';
import { createWeapon, mergeList } from './warzone-weapon.js';
import { WEAPONS, WEAPON_ORDER, weaponForWorld } from '../src/arsenal.js';
import { ownedWeapons, grantWeapon, addTrophy, noteCombat, flushRecord } from '../src/inventory.js';
import { createWarzoneHud } from './warzone-hud.js';
import * as sfx from './warzone-audio.js';

// The worlds whose registry city is a warzone. Kept explicit (not "any world
// with a city") so a future peaceful town is opt-out by default.
export const WARZONE_WORLDS = new Set(['terra', 'rustia', 'neptunia', 'wyattmattoe']);

const Z = {
  GRACE: 7, // seconds after landfall before the first wave moves
  LULL: 30, // breather between waves
  SPAWN_GAP: 3.2,
  SPAWN_MIN_DIST: 48,
  MAX_ALIVE: 6, // rigged monsters (and swarm flocks) alive at once
  CORPSE_TIME: 6,

  PLAYER_HP: 100,
  REGEN_DELAY: 4.5,
  REGEN_RATE: 32,
  DEAD_TIME: 4,
  INVULN: 3,
  PAD_RESUPPLY: 15,

  PICKUP_LIFE: 45,
  PICKUP_REACH: 1.9,

  TRACER_SPEED: 320,
};

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvasTex(size, draw) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------------------------------------------------------------------------
// Soft-particle points: per-particle size and RGBA, one draw per blend mode.
// ---------------------------------------------------------------------------
const PARTICLE_VERT = /* glsl */ `
attribute float aSize;
attribute vec4 aColor;
uniform float uScale;
varying vec4 vColor;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aSize * uScale / max(-mv.z, 0.05);
  vColor = aColor;
}`;
const PARTICLE_FRAG = /* glsl */ `
uniform float uSoft;
varying vec4 vColor;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  if (d > 1.0) discard;
  float a = pow(1.0 - d, uSoft);
  gl_FragColor = vec4(vColor.rgb, vColor.a * a);
}`;

function createParticles(count, additive, soft) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  const size = new Float32Array(count);
  const col = new Float32Array(count * 4);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aColor', new THREE.BufferAttribute(col, 4).setUsage(THREE.DynamicDrawUsage));
  const mat = new THREE.ShaderMaterial({
    vertexShader: PARTICLE_VERT,
    fragmentShader: PARTICLE_FRAG,
    uniforms: { uScale: { value: 600 }, uSoft: { value: soft } },
    transparent: true,
    depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = additive ? 6 : 5;
  // Per-particle sim state.
  const sim = {
    vel: new Float32Array(count * 3),
    life: new Float32Array(count), // remaining
    max: new Float32Array(count),
    s0: new Float32Array(count),
    s1: new Float32Array(count),
    a0: new Float32Array(count),
    rgb: new Float32Array(count * 3),
    drag: new Float32Array(count),
    grav: new Float32Array(count),
    next: 0,
  };
  function emit(x, y, z, vx, vy, vz, life, s0, s1, r, g, b, a, drag, grav) {
    const i = sim.next;
    sim.next = (i + 1) % count;
    pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
    sim.vel[i * 3] = vx; sim.vel[i * 3 + 1] = vy; sim.vel[i * 3 + 2] = vz;
    sim.life[i] = life; sim.max[i] = life;
    sim.s0[i] = s0; sim.s1[i] = s1; sim.a0[i] = a;
    sim.rgb[i * 3] = r; sim.rgb[i * 3 + 1] = g; sim.rgb[i * 3 + 2] = b;
    sim.drag[i] = drag; sim.grav[i] = grav;
  }
  function update(dt) {
    for (let i = 0; i < count; i++) {
      if (sim.life[i] <= 0) {
        if (size[i] !== 0) { size[i] = 0; col[i * 4 + 3] = 0; }
        continue;
      }
      sim.life[i] -= dt;
      const k = 1 - Math.max(sim.life[i], 0) / sim.max[i]; // 0 -> 1
      const dr = Math.max(0, 1 - sim.drag[i] * dt);
      sim.vel[i * 3] *= dr;
      sim.vel[i * 3 + 1] = sim.vel[i * 3 + 1] * dr - sim.grav[i] * dt;
      sim.vel[i * 3 + 2] *= dr;
      pos[i * 3] += sim.vel[i * 3] * dt;
      pos[i * 3 + 1] += sim.vel[i * 3 + 1] * dt;
      pos[i * 3 + 2] += sim.vel[i * 3 + 2] * dt;
      size[i] = sim.s0[i] + (sim.s1[i] - sim.s0[i]) * k;
      col[i * 4] = sim.rgb[i * 3];
      col[i * 4 + 1] = sim.rgb[i * 3 + 1];
      col[i * 4 + 2] = sim.rgb[i * 3 + 2];
      // ease in over the first 10%, out over the rest
      col[i * 4 + 3] = sim.a0[i] * Math.min(1, k * 10) * (1 - k);
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.aSize.needsUpdate = true;
    geo.attributes.aColor.needsUpdate = true;
  }
  return { points, emit, update, geo, mat };
}

// ---------------------------------------------------------------------------
// Ray helpers (city-local). All return a distance along the unit ray or -1.
// ---------------------------------------------------------------------------
function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r) {
  const lx = ox - cx, ly = oy - cy, lz = oz - cz;
  const b = lx * dx + ly * dy + lz * dz;
  const c = lx * lx + ly * ly + lz * lz - r * r;
  const disc = b * b - c;
  if (disc < 0) return -1;
  const t = -b - Math.sqrt(disc);
  return t >= 0 ? t : -1;
}

// Ray vs vertical capsule (x,z fixed, y from y0 to y1, radius r).
function rayCapsuleY(ox, oy, oz, dx, dy, dz, cx, cz, y0, y1, r) {
  // Solve in 2D (xz) for the infinite cylinder, then clamp to the y band;
  // the end caps are approximated by spheres.
  const px = ox - cx, pz = oz - cz;
  const a = dx * dx + dz * dz;
  let best = -1;
  if (a > 1e-8) {
    const b = px * dx + pz * dz;
    const c = px * px + pz * pz - r * r;
    const disc = b * b - a * c;
    if (disc >= 0) {
      const t = (-b - Math.sqrt(disc)) / a;
      if (t >= 0) {
        const y = oy + dy * t;
        if (y >= y0 && y <= y1) best = t;
      }
    }
  }
  const tTop = raySphere(ox, oy, oz, dx, dy, dz, cx, y1, cz, r);
  if (tTop >= 0 && (best < 0 || tTop < best)) best = tTop;
  const tBot = raySphere(ox, oy, oz, dx, dy, dz, cx, y0, cz, r);
  if (tBot >= 0 && (best < 0 || tBot < best)) best = tBot;
  return best;
}

// ---------------------------------------------------------------------------

export function createWarzone(city, def, opts = {}) {
  const scene = opts.scene;
  const rng = mulberry32((def.seed ^ 0x6a09e667) >>> 0);
  const skin = SKINS[def.world] ?? SKINS.terra;
  const GLOW = new THREE.Color(skin.glow);
  const radius = def.radius;
  const group = new THREE.Group();
  group.name = 'warzone';
  city.group.add(group);

  const ownedGeos = [];
  const ownedMats = [];
  const ownedTex = [];
  const own = (m) => { ownedMats.push(m); return m; };

  // The town deck is levelled to the planet's curve, NOT to a plane: in this
  // flat city-local frame it falls away ~10 u by the edge of a 150 u town. So
  // everything is placed on gy(x, z), and each piece sets deckY to its own
  // footing before it builds.
  const gy = (x, z) => city.groundLocalYAt(x, z);
  let deckY = gy(0, 0);

  // =========================================================================
  // War dressing + cover colliders
  // =========================================================================
  const M = {
    sandbag: own(new THREE.MeshStandardMaterial({ color: 0x8d7b5a, roughness: 0.95 })),
    concrete: own(new THREE.MeshStandardMaterial({ color: 0x9a978f, roughness: 0.88 })),
    wood: own(new THREE.MeshStandardMaterial({ color: 0x7a5a36, roughness: 0.85 })),
    woodDark: own(new THREE.MeshStandardMaterial({ color: 0x4a3420, roughness: 0.9 })),
    burnt: own(new THREE.MeshStandardMaterial({ color: 0x2b2522, roughness: 0.8, metalness: 0.5 })),
    rust: own(new THREE.MeshStandardMaterial({ color: 0x5c3221, roughness: 0.75, metalness: 0.4 })),
    tire: own(new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.95 })),
    contRed: own(new THREE.MeshStandardMaterial({ color: 0x7a2a22, roughness: 0.7, metalness: 0.35 })),
    contBlue: own(new THREE.MeshStandardMaterial({ color: 0x27466b, roughness: 0.7, metalness: 0.35 })),
    contGreen: own(new THREE.MeshStandardMaterial({ color: 0x3e5232, roughness: 0.7, metalness: 0.35 })),
    rubble: own(new THREE.MeshStandardMaterial({ color: 0x7c766c, roughness: 0.95 })),
    stripe: own(new THREE.MeshStandardMaterial({ color: 0xd8b02a, roughness: 0.6 })),
  };
  const geoBins = new Map(); // matKey -> [geometry]
  const bin = (key, g) => {
    if (!geoBins.has(key)) geoBins.set(key, []);
    geoBins.get(key).push(g);
  };
  const boxAt = (key, w, h, d, x, y, z, ry = 0, rx = 0, rz = 0) => {
    const g = new THREE.BoxGeometry(w, h, d);
    if (rx) g.rotateX(rx);
    if (rz) g.rotateZ(rz);
    if (ry) g.rotateY(ry);
    g.translate(x, y, z);
    bin(key, g);
  };

  const coverPieces = []; // { x, z, hw, hd, h, anchors: [{x,z,nx,nz}] }
  const coverStructs = [];

  function addCollider(x, z, hw, hd, h, standable) {
    const walls = [{ x0: -hw, x1: hw, z0: -hd, z1: hd, y0: 0, y1: h }];
    const surfaces = standable ? [{ x0: -hw, x1: hw, z0: -hd, z1: hd, y: h }] : [];
    const st = makeStructure(x, z, deckY, surfaces, walls, Math.max(hw, hd) + 0.6);
    coverStructs.push(st);
    const off = 1.0;
    coverPieces.push({
      x, z, hw, hd, h,
      anchors: [
        { x: x + hw + off, z, nx: 1, nz: 0, claim: null },
        { x: x - hw - off, z, nx: -1, nz: 0, claim: null },
        { x, z: z + hd + off, nx: 0, nz: 1, claim: null },
        { x, z: z - hd - off, nx: 0, nz: -1, claim: null },
      ],
    });
  }

  // Pieces. `rot` is 0 or 1 (90 degrees); dims are given unrotated (x = long).
  function sandbags(x, z, rot) {
    deckY = gy(x, z);
    const L = 3.4, rows = 4, per = 6;
    const bagW = L / per, bagH = 0.25, bagD = 0.62;
    for (let r = 0; r < rows; r++) {
      const shift = r % 2 ? bagW * 0.5 : 0;
      const n = r % 2 ? per - 1 : per;
      for (let i = 0; i < n; i++) {
        const lx = -L / 2 + bagW * (i + 0.5) + shift;
        const ly = bagH * (r + 0.5) - 0.02;
        const g = new THREE.IcosahedronGeometry(1, 1);
        g.scale(bagW * 0.56, bagH * 0.62, bagD * 0.5);
        g.rotateY((rng() - 0.5) * 0.15);
        const px = rot ? 0 : lx, pz = rot ? lx : 0;
        if (rot) g.rotateY(Math.PI / 2);
        g.translate(x + px, deckY + ly, z + pz);
        bin('sandbag', g);
      }
    }
    const H = rows * bagH;
    addCollider(x, z, rot ? bagD / 2 : L / 2, rot ? L / 2 : bagD / 2, H, true);
  }
  function jersey(x, z, rot) {
    deckY = gy(x, z);
    const L = 3.0;
    const ry = rot ? Math.PI / 2 : 0;
    const put = (w, h, d, y) => {
      const g = new THREE.BoxGeometry(w, h, d);
      g.rotateY(ry);
      g.translate(x, deckY + y, z);
      bin('concrete', g);
    };
    put(L, 0.32, 0.78, 0.16);
    put(L, 0.28, 0.56, 0.46);
    put(L, 0.42, 0.34, 0.81);
    // hazard stripe near the top
    const g = new THREE.BoxGeometry(L * 0.98, 0.07, 0.35);
    g.rotateY(ry);
    g.translate(x, deckY + 0.92, z);
    bin('stripe', g);
    addCollider(x, z, rot ? 0.39 : L / 2, rot ? L / 2 : 0.39, 1.02, true);
  }
  function crates(x, z) {
    deckY = gy(x, z);
    const s = 1.3;
    const crate = (cx, cy, cz, sc) => {
      boxAt('wood', s * sc, s * sc, s * sc, cx, cy + (s * sc) / 2, cz);
      // dark battens on the faces
      const t = 0.06 * sc;
      boxAt('woodDark', s * sc + 0.02, t, s * sc + 0.02, cx, cy + t / 2, cz);
      boxAt('woodDark', s * sc + 0.02, t, s * sc + 0.02, cx, cy + s * sc - t / 2, cz);
      boxAt('woodDark', s * sc + 0.02, s * sc, t, cx, cy + (s * sc) / 2, cz, Math.PI / 4);
    };
    crate(x, deckY, z, 1);
    const extra = rng();
    let hw = s / 2, hd = s / 2;
    if (extra < 0.5) {
      crate(x, deckY + s, z, 0.85);
    }
    if (extra > 0.3) {
      crate(x + s, deckY, z, 1);
      hw = s; // two side by side, centred on x + s/2
      x += s / 2;
      addCollider(x, z, hw, hd, s, true);
      return;
    }
    addCollider(x, z, hw, hd, extra < 0.5 ? s * 1.85 : s, true);
  }
  function hulk(x, z, rot) {
    deckY = gy(x, z);
    const ry = rot ? Math.PI / 2 : 0;
    const part = (key, w, h, d, lx, y, lz) => {
      const g = new THREE.BoxGeometry(w, h, d);
      g.translate(lx, y, lz);
      g.rotateY(ry);
      g.translate(x, deckY, z);
      bin(key, g);
    };
    part('burnt', 4.3, 0.7, 1.9, 0, 0.72, 0);
    part('rust', 4.2, 0.12, 1.8, 0, 1.12, 0);
    part('burnt', 2.1, 0.62, 1.72, -0.35, 1.45, 0);
    part('rust', 0.1, 0.5, 1.6, 0.72, 1.42, 0); // windshield frame (glass long gone)
    for (const sx of [-1.35, 1.35]) {
      for (const sz of [-0.95, 0.95]) {
        const g = new THREE.CylinderGeometry(0.36, 0.36, 0.26, 12);
        g.rotateX(Math.PI / 2);
        g.translate(sx, 0.36, sz);
        g.rotateY(ry);
        g.translate(x, deckY, z);
        bin('tire', g);
      }
    }
    addCollider(x, z, rot ? 0.98 : 2.15, rot ? 2.15 : 0.98, 1.2, true);
    return { x, z };
  }
  function container(x, z, rot) {
    deckY = gy(x, z);
    const ry = rot ? Math.PI / 2 : 0;
    const key = ['contRed', 'contBlue', 'contGreen'][Math.floor(rng() * 3) % 3];
    const L = 6.0, H = 2.6, D = 2.44;
    const g = new THREE.BoxGeometry(L, H, D);
    g.translate(0, H / 2, 0);
    g.rotateY(ry);
    g.translate(x, deckY, z);
    bin(key, g);
    // corrugation ribs on the long sides
    for (let i = 0; i < 14; i++) {
      for (const s of [-1, 1]) {
        const r = new THREE.BoxGeometry(0.12, H * 0.9, 0.05);
        r.translate(-L / 2 + 0.3 + i * ((L - 0.6) / 13), H / 2, s * (D / 2 + 0.02));
        r.rotateY(ry);
        r.translate(x, deckY, z);
        bin(key, r);
      }
    }
    addCollider(x, z, rot ? D / 2 : L / 2, rot ? L / 2 : D / 2, H, true);
  }

  // Placement: rejection-sample the town annulus, clear of every building,
  // the gate-to-plaza walkway corridor and each other.
  const gate = city.gateSpot;
  const keepOut = city.collidersLocal;
  function corridorDist(x, z) {
    // distance to the segment plaza(0,0) -> gate
    const gx = gate.x, gz = gate.z;
    const len2 = gx * gx + gz * gz || 1;
    const t = THREE.MathUtils.clamp((x * gx + z * gz) / len2, 0, 1);
    return Math.hypot(x - gx * t, z - gz * t);
  }
  const placed = [];
  function freeSpot(x, z, rad) {
    if (Math.hypot(x, z) > radius - rad - 6) return false;
    if (corridorDist(x, z) < rad + 3.5) return false;
    for (const c of keepOut) {
      if (Math.hypot(x - c.x, z - c.z) < c.radius + rad + 2.4) return false;
    }
    for (const p of placed) {
      if (Math.hypot(x - p.x, z - p.z) < p.r + rad + 3.2) return false;
    }
    return true;
  }
  const KINDS = [
    { fn: sandbags, r: 1.9, w: 5 },
    { fn: jersey, r: 1.7, w: 3 },
    { fn: crates, r: 1.6, w: 3 },
    { fn: hulk, r: 2.4, w: 2 },
    { fn: container, r: 3.3, w: 1 },
  ];
  const wTotal = KINDS.reduce((a, k) => a + k.w, 0);
  const wrecks = [];
  const target = Math.round(radius * 0.22); // ~24 on a 110 town, ~33 on a 150
  for (let tries = 0; tries < 900 && placed.length < target; tries++) {
    const a = rng() * Math.PI * 2;
    const d = 18 + Math.sqrt(rng()) * (radius - 24);
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    let pick = rng() * wTotal, kind = KINDS[0];
    for (const k of KINDS) { if ((pick -= k.w) <= 0) { kind = k; break; } }
    if (!freeSpot(x, z, kind.r)) continue;
    placed.push({ x, z, r: kind.r });
    // Face the long side toward the plaza-ish: rot by which axis is radial.
    const rot = Math.abs(x) > Math.abs(z) ? 1 : 0;
    const res = kind.fn(x, z, rot);
    if (kind.fn === hulk) wrecks.push(res);
  }
  // A sandbag ring arc at the plaza rim — the classic hold point.
  for (let i = 0; i < 4; i++) {
    const a = Math.atan2(gate.z, gate.x) + Math.PI * 0.5 + i * (Math.PI / 2);
    const d = 14 + 5;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (!freeSpot(x, z, 1.9)) continue;
    placed.push({ x, z, r: 1.9 });
    sandbags(x, z, Math.abs(x) > Math.abs(z) ? 1 : 0);
  }

  // Rubble scatter: small chunks, no colliders.
  for (let i = 0; i < Math.round(radius * 0.9); i++) {
    const a = rng() * Math.PI * 2;
    const d = 10 + rng() * (radius - 14);
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (corridorDist(x, z) < 2.5) continue;
    let inside = false;
    for (const c of keepOut) if (Math.hypot(x - c.x, z - c.z) < c.radius) { inside = true; break; }
    if (inside) continue;
    const s = 0.12 + rng() * 0.32;
    const g = new THREE.DodecahedronGeometry(s, 0);
    g.scale(1, 0.55 + rng() * 0.4, 1 + rng() * 0.5);
    g.rotateY(rng() * Math.PI);
    g.translate(x, gy(x, z) + s * 0.3, z);
    bin('rubble', g);
  }

  for (const [key, arr] of geoBins) {
    const merged = mergeList(arr);
    for (const g of arr) g.dispose();
    ownedGeos.push(merged);
    const mesh = new THREE.Mesh(merged, M[key]);
    group.add(mesh);
  }
  // Asphalt streets over the levelled deck. Built on a 2.5 u grid whose
  // vertices sample the curved deck, with holes for the plaza, the walkway
  // corridor and every building footprint (their own floors stay on top).
  // Runs before the cover joins city.structures, so only real buildings cut.
  {
    const CELL = 2.5;
    const buildings = city.structures.slice();
    const inBuilding = (x, z) => {
      for (const b of buildings) {
        if (Math.abs(x - b.x) < b.halfExtent && Math.abs(z - b.z) < b.halfExtent) return true;
      }
      return false;
    };
    const pos = [], uv = [], idx = [];
    const lift = 0.04;
    for (let gx = -radius; gx < radius; gx += CELL) {
      for (let gz = -radius; gz < radius; gz += CELL) {
        const cx = gx + CELL / 2, cz = gz + CELL / 2;
        const d = Math.hypot(cx, cz);
        if (d > radius - 2 || d < 14 + 1.5) continue;
        if (corridorDist(cx, cz) < 4) continue;
        if (inBuilding(cx, cz)) continue;
        const v = pos.length / 3;
        for (const [x, z] of [[gx, gz], [gx + CELL, gz], [gx + CELL, gz + CELL], [gx, gz + CELL]]) {
          pos.push(x, gy(x, z) + lift, z);
          uv.push(x / 7, z / 7);
        }
        idx.push(v, v + 3, v + 1, v + 1, v + 3, v + 2);
      }
    }
    if (idx.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx);
      g.computeVertexNormals();
      ownedGeos.push(g);
      const tex = canvasTex(512, (c, n) => {
        const r = mulberry32((def.seed ^ 0xa5fa17) >>> 0);
        c.fillStyle = '#3b3b3d';
        c.fillRect(0, 0, n, n);
        // aggregate speckle
        for (let i = 0; i < 14000; i++) {
          const v = 40 + Math.floor(r() * 50);
          c.fillStyle = `rgba(${v},${v},${v + 2},${0.35 + r() * 0.4})`;
          c.fillRect(r() * n, r() * n, 1 + r() * 2, 1 + r() * 2);
        }
        // patched repairs and oil stains
        for (let i = 0; i < 7; i++) {
          c.fillStyle = r() < 0.5 ? 'rgba(25,25,27,0.45)' : 'rgba(70,68,64,0.3)';
          const w = 40 + r() * 120, h = 30 + r() * 90;
          c.fillRect(r() * n, r() * n, w, h);
        }
        // cracks
        c.strokeStyle = 'rgba(15,15,16,0.8)';
        c.lineWidth = 1.2;
        for (let i = 0; i < 18; i++) {
          let x = r() * n, y = r() * n;
          c.beginPath();
          c.moveTo(x, y);
          for (let k = 0; k < 8; k++) {
            x += (r() - 0.5) * 40; y += (r() - 0.5) * 40;
            c.lineTo(x, y);
          }
          c.stroke();
        }
      });
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.anisotropy = 4;
      ownedTex.push(tex);
      const mat = own(new THREE.MeshStandardMaterial({
        map: tex, roughness: 0.93, metalness: 0,
        polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
      }));
      const m = new THREE.Mesh(g, mat);
      m.receiveShadow = true;
      group.add(m);
    }
  }

  for (const st of coverStructs) city.structures.push(st);

  // Scorch marks on the deck.
  const scorchTex = canvasTex(128, (g, s) => {
    const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grad.addColorStop(0, 'rgba(8,6,5,0.95)');
    grad.addColorStop(0.45, 'rgba(20,16,12,0.7)');
    grad.addColorStop(1, 'rgba(30,24,18,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, s, s);
  });
  ownedTex.push(scorchTex);
  const scorchMat = own(new THREE.MeshBasicMaterial({
    map: scorchTex, transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    color: 0x888888,
  }));
  {
    const sg = [];
    const marks = Math.round(radius * 0.12);
    for (let i = 0; i < marks + wrecks.length; i++) {
      let x, z;
      if (i < wrecks.length) { x = wrecks[i].x; z = wrecks[i].z; }
      else {
        const a = rng() * Math.PI * 2, d = 8 + rng() * (radius - 12);
        x = Math.cos(a) * d; z = Math.sin(a) * d;
      }
      const s = i < wrecks.length ? 7 : 2.5 + rng() * 4;
      const g = new THREE.PlaneGeometry(s, s);
      g.rotateX(-Math.PI / 2);
      g.rotateY(rng() * Math.PI);
      g.translate(x, gy(x, z) + 0.07, z); // above the asphalt (+0.04)
      sg.push(g);
    }
    if (sg.length) {
      const merged = mergeList(sg);
      for (const g of sg) g.dispose();
      ownedGeos.push(merged);
      const m = new THREE.Mesh(merged, scorchMat);
      m.renderOrder = 1;
      group.add(m);
    }
  }

  // =========================================================================
  // Particles, tracers, decals
  // =========================================================================
  const glow = createParticles(420, true, 1.6); // sparks, embers, ichor, flashes
  const smoke = createParticles(320, false, 1.2); // smoke, dust
  group.add(glow.points, smoke.points);
  ownedGeos.push(glow.geo, smoke.geo);
  ownedMats.push(glow.mat, smoke.mat);

  // Fires over the wrecks: a few emitters feeding embers and a smoke column.
  const fires = wrecks.slice(0, 4).map((w, i) => ({ x: w.x, z: w.z, y: gy(w.x, w.z), acc: 0, smokeAcc: i * 0.1 }));

  const TRACERS = 48;
  const tracerGeo = new THREE.BoxGeometry(1, 1, 1);
  ownedGeos.push(tracerGeo);
  const tracerMat = own(new THREE.MeshBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0.9,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  const tracers = new THREE.InstancedMesh(tracerGeo, tracerMat, TRACERS);
  tracers.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  tracers.frustumCulled = false;
  tracers.renderOrder = 7;
  const tracerState = [];
  const PLAYER_TRACER = new THREE.Color(3.2, 2.4, 1.3);
  // each weapon's rounds in its own colour (the carbine keeps the warm default)
  const TRACER_COLORS = {};
  for (const id of WEAPON_ORDER) {
    TRACER_COLORS[id] = id === 'carbine' ? PLAYER_TRACER : new THREE.Color(WEAPONS[id].tint).multiplyScalar(3.4);
  }
  for (let i = 0; i < TRACERS; i++) {
    tracerState.push({
      on: false, sx: 0, sy: 0, sz: 0, dx: 0, dy: 0, dz: 0, len: 0, d: 0, speed: 0, w: 0.02,
    });
    tracers.setColorAt(i, PLAYER_TRACER);
  }
  group.add(tracers);
  let tracerNext = 0;
  const _m4 = new THREE.Matrix4();
  const _q = new THREE.Quaternion();
  const _v = new THREE.Vector3();
  const _v2 = new THREE.Vector3();
  const _s = new THREE.Vector3();
  const _zAxis = new THREE.Vector3(0, 0, 1);
  const _zero = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < TRACERS; i++) tracers.setMatrixAt(i, _zero);

  // W: the arsenal entry of the weapon that fired (colour and width).
  function spawnTracer(sx, sy, sz, ex, ey, ez, _unused, W) {
    const i = tracerNext;
    tracerNext = (i + 1) % TRACERS;
    const t = tracerState[i];
    const dx = ex - sx, dy = ey - sy, dz = ez - sz;
    const len = Math.hypot(dx, dy, dz);
    if (len < 0.5) return;
    t.on = true;
    t.sx = sx; t.sy = sy; t.sz = sz;
    t.dx = dx / len; t.dy = dy / len; t.dz = dz / len;
    t.len = len; t.d = 0;
    const pierce = W.ballistic === 'pierce';
    t.speed = pierce ? Z.TRACER_SPEED * 3 : Z.TRACER_SPEED;
    t.w = W.tracerWidth;
    t.seg = pierce ? 40 : 3.5;
    tracers.setColorAt(i, TRACER_COLORS[W.id] ?? PLAYER_TRACER);
    tracers.instanceColor.needsUpdate = true;
  }

  function updateTracers(dt) {
    let any = false;
    for (let i = 0; i < TRACERS; i++) {
      const t = tracerState[i];
      if (!t.on) continue;
      any = true;
      t.d += t.speed * dt;
      const head = Math.min(t.d, t.len);
      const tail = Math.max(0, t.d - t.seg);
      if (tail >= t.len) {
        t.on = false;
        tracers.setMatrixAt(i, _zero);
        continue;
      }
      const mid = (head + tail) * 0.5;
      _v.set(t.sx + t.dx * mid, t.sy + t.dy * mid, t.sz + t.dz * mid);
      _v2.set(t.dx, t.dy, t.dz);
      _q.setFromUnitVectors(_zAxis, _v2);
      _s.set(t.w, t.w, Math.max(0.01, head - tail));
      _m4.compose(_v, _q, _s);
      tracers.setMatrixAt(i, _m4);
    }
    if (any) tracers.instanceMatrix.needsUpdate = true;
  }

  // Bullet holes.
  const DECALS = 96;
  const holeTex = canvasTex(64, (g, s) => {
    const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grad.addColorStop(0, 'rgba(0,0,0,1)');
    grad.addColorStop(0.22, 'rgba(10,8,6,0.95)');
    grad.addColorStop(0.4, 'rgba(40,34,28,0.55)');
    grad.addColorStop(1, 'rgba(60,50,40,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, s, s);
  });
  ownedTex.push(holeTex);
  const holeGeo = new THREE.PlaneGeometry(0.2, 0.2);
  ownedGeos.push(holeGeo);
  const holeMat = own(new THREE.MeshBasicMaterial({
    map: holeTex, transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
  }));
  const holes = new THREE.InstancedMesh(holeGeo, holeMat, DECALS);
  holes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  holes.frustumCulled = false;
  holes.renderOrder = 2;
  for (let i = 0; i < DECALS; i++) holes.setMatrixAt(i, _zero);
  group.add(holes);
  let holeNext = 0;
  function addHole(x, y, z, nx, ny, nz) {
    _v2.set(nx, ny, nz);
    _q.setFromUnitVectors(_zAxis, _v2);
    _v.set(x + nx * 0.012, y + ny * 0.012, z + nz * 0.012);
    const sc = 0.8 + rng() * 0.5;
    _s.set(sc, sc, sc);
    _m4.compose(_v, _q, _s);
    holes.setMatrixAt(holeNext, _m4);
    holeNext = (holeNext + 1) % DECALS;
    holes.instanceMatrix.needsUpdate = true;
  }

  function impactFx(x, y, z, nx, ny, nz, ground) {
    // sparks
    const n = ground ? 3 : 7;
    for (let i = 0; i < n; i++) {
      const sp = 3 + rng() * 6;
      glow.emit(x, y, z,
        (nx + (rng() - 0.5) * 1.6) * sp, (ny + rng() * 0.8) * sp, (nz + (rng() - 0.5) * 1.6) * sp,
        0.18 + rng() * 0.2, 0.06, 0.02, 2.6, 1.7, 0.7, 1, 2.5, 14);
    }
    // dust puff
    const dr = ground ? 0.55 : 0.5, dg = ground ? 0.47 : 0.48, db = ground ? 0.38 : 0.46;
    for (let i = 0; i < 3; i++) {
      smoke.emit(x + nx * 0.1, y + ny * 0.1, z + nz * 0.1,
        nx * 1.2 + (rng() - 0.5), ny * 1.2 + 0.5 + rng() * 0.4, nz * 1.2 + (rng() - 0.5),
        0.7 + rng() * 0.5, 0.25, 1.2, dr, dg, db, 0.55, 2.2, -0.3);
    }
    addHole(x, y, z, nx, ny, nz);
  }

  const ICHOR = GLOW;
  function ichorFx(x, y, z, dx, dy, dz, big) {
    const n = big ? 14 : 7;
    for (let i = 0; i < n; i++) {
      const sp = 1.5 + rng() * 3.5;
      glow.emit(x, y, z,
        (dx + (rng() - 0.5) * 1.4) * sp, (dy + rng() * 0.6) * sp, (dz + (rng() - 0.5) * 1.4) * sp,
        0.25 + rng() * 0.3, big ? 0.14 : 0.09, 0.03,
        ICHOR.r * 2.2, ICHOR.g * 2.2, ICHOR.b * 2.2, 0.9, 3, 9);
    }
    smoke.emit(x, y, z, dx * 0.6, 0.3, dz * 0.6, 0.6, 0.2, 0.7, 0.08, 0.07, 0.07, 0.6, 2, 0);
  }

  // =========================================================================
  // Monsters
  // =========================================================================
  const kit = createMonsterKit(skin);
  const monsters = []; // the rigged ones: brute, spitter, stalker, titan
  let monsterSeed = 0;

  // ---- shared world queries ------------------------------------------------
  const _n = new THREE.Vector3();
  const hitN = new THREE.Vector3();
  // Nearest solid along a ray: walls (incl. cover) and the town deck.
  // Returns distance (or -1) and leaves the normal in hitN.
  function worldRay(ox, oy, oz, dx, dy, dz, maxT) {
    let best = -1;
    const structs = city.structures;
    for (let i = 0; i < structs.length; i++) {
      const st = structs[i];
      if (!st.rayHit) continue;
      const t = st.rayHit(ox, oy, oz, dx, dy, dz, best >= 0 ? best : maxT, _n);
      if (t >= 0 && (best < 0 || t < best)) { best = t; hitN.copy(_n); }
    }
    if (dy < -1e-4) {
      // Ground: the deck height under the hit point, refined a few times
      // (the deck curves, so one plane intersection lands short or long).
      let tg = (gy(ox, oz) - oy) / dy;
      for (let k = 0; k < 3 && tg > 0; k++) {
        tg = (gy(ox + dx * tg, oz + dz * tg) - oy) / dy;
      }
      if (tg >= 0 && tg <= maxT && (best < 0 || tg < best)) {
        best = tg;
        hitN.set(0, 1, 0);
      }
    }
    return best;
  }
  function clearLine(ax, ay, az, bx, by, bz) {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-3) return true;
    const t = worldRay(ax, ay, az, dx / len, dy / len, dz / len, len - 0.2);
    return t < 0;
  }

  // ---- player state ---------------------------------------------------------
  const player = {
    hp: Z.PLAYER_HP,
    sinceHit: 99,
    dead: false,
    deadT: 0,
    invuln: Z.INVULN,
    kills: 0,
    score: 0,
    x: 0, y: 0, z: 0, // feet
    vx: 0, vz: 0, // smoothed ground velocity, for leading shots
    airborne: false,
  };

  // The scratch basis of the player's view, in city-local space (set each update).
  const view = {
    ex: 0, ey: 0, ez: 0, // eye
    fx: 0, fy: 0, fz: -1, // aim
    rx: 1, ry: 0, rz: 0, // right
    ux: 0, uy: 1, uz: 0, // up
    speed01: 0,
  };
  // stereo pan of a city-local point, from the view's right vector
  function panOf(x, z) {
    const tx = x - view.ex, tz = z - view.ez;
    const tl = Math.hypot(tx, tz) || 1;
    return (tx * view.rx + tz * view.rz) / tl;
  }
  function distToView(x, y, z) {
    return Math.hypot(x - view.ex, y - view.ey, z - view.ez);
  }

  // Camera trauma, 0..1. Big things landing near you add to it; walk.js reads
  // it through shake() and rattles the first-person camera.
  let trauma = 0;
  function addShake(amount, x, z) {
    const d = Math.hypot(x - player.x, z - player.z);
    trauma = Math.min(1, trauma + amount / (1 + d * 0.06));
  }

  // ---- the town's shape, for routing -----------------------------------------
  // Houses stand shoulder to shoulder on a ring with one gap, the gate. Nothing
  // the size of a brute fits between two houses, so a monster on the wrong side
  // of the ring walks round to the gate rather than grinding against a wall.
  let ringR = 0, ringHalf = 0;
  {
    let n = 0;
    for (const c of keepOut) {
      const d = Math.hypot(c.x, c.z);
      if (d < 26) continue; // the tower, by the plaza
      ringR += d;
      ringHalf = Math.max(ringHalf, c.radius);
      n++;
    }
    ringR = n ? ringR / n : 0;
  }
  const gateAng = Math.atan2(gate.z, gate.x);
  const _wp = { x: 0, z: 0 };
  // Where a monster of radius R at (x, z) should head to reach (tx, tz).
  function route(x, z, tx, tz, R) {
    _wp.x = tx; _wp.z = tz;
    if (!ringR) return _wp;
    const d = Math.hypot(x, z), td = Math.hypot(tx, tz);
    const inside = d < ringR, tInside = td < ringR;
    if (inside === tInside) return _wp;
    const lane = inside
      ? Math.max(6, ringR - ringHalf - R - 2)
      : Math.min(radius - 6, ringR + ringHalf + R + 2);
    const a = Math.atan2(z, x);
    let da = gateAng - a;
    while (da > Math.PI) da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;
    if (Math.abs(da) > 0.3) {
      // walk the lane toward the gate bearing
      const na = a + Math.sign(da) * Math.min(Math.abs(da), 0.45);
      _wp.x = Math.cos(na) * lane;
      _wp.z = Math.sin(na) * lane;
    } else {
      // at the gate: straight through to the other side
      const through = inside
        ? Math.min(radius - 6, ringR + ringHalf + R + 4)
        : Math.max(6, ringR - ringHalf - R - 4);
      _wp.x = Math.cos(gateAng) * through;
      _wp.z = Math.sin(gateAng) * through;
    }
    return _wp;
  }

  // ---- waves -----------------------------------------------------------------
  const wave = { n: 0, phase: 'grace', t: Z.GRACE, queue: [], spawned: 0, maxAlive: 0, spawnT: 0, greeted: false, boss: null };

  function aliveCount() {
    let n = 0;
    for (const m of monsters) if (m.state !== 'dead') n++;
    return n + Math.ceil(flyersAlive() / SWARMLING.flock);
  }

  // Spawn ring: points just inside the town edge, nudged clear of buildings.
  const spawnRing = [];
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2;
    for (let k = 0; k < 4; k++) {
      const d = radius - 8 - k * 6;
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      let ok = true;
      for (const c of keepOut) if (Math.hypot(x - c.x, z - c.z) < c.radius + 4) { ok = false; break; }
      if (ok) { spawnRing.push({ x, z }); break; }
    }
  }

  function chooseSpawn(aimX, aimZ) {
    let best = null, bestScore = -Infinity;
    for (const p of spawnRing) {
      const dx = p.x - player.x, dz = p.z - player.z;
      const d = Math.hypot(dx, dz);
      if (d < Z.SPAWN_MIN_DIST) continue;
      const inView = (dx * aimX + dz * aimZ) / (d || 1);
      let score = -Math.abs(d - 75) * 0.05 - Math.max(0, inView - 0.3) * 4 + rng() * 2;
      // don't stack spawns
      for (const m of monsters) {
        if (m.state !== 'dead' && Math.hypot(m.x - p.x, m.z - p.z) < 10) score -= 3;
      }
      if (score > bestScore) { bestScore = score; best = p; }
    }
    return best ?? spawnRing[Math.floor(rng() * spawnRing.length) % spawnRing.length];
  }

  // What comes over the wall in wave n. Early waves teach one thing at a time.
  function waveRoster(n) {
    if (n % 5 === 0) {
      // the titan, and something to keep you moving while you shoot it
      return ['titan', 'swarm', 'spitter', 'swarm', 'brute'].slice(0, 2 + Math.min(3, n / 5));
    }
    const pool = n === 1 ? ['brute']
      : n === 2 ? ['brute', 'swarm']
      : n === 3 ? ['brute', 'spitter', 'swarm']
      : ['brute', 'spitter', 'stalker', 'swarm'];
    const total = Math.min(3 + n, 12);
    const out = [];
    for (let i = 0; i < total; i++) out.push(pool[Math.floor(rng() * pool.length) % pool.length]);
    if (n >= 4) out[0] = 'stalker'; // always at least one once they are in play
    return out;
  }

  function startWave() {
    wave.n++;
    wave.phase = 'wave';
    wave.queue = waveRoster(wave.n);
    wave.maxAlive = Math.min(2 + Math.floor(wave.n / 2), Z.MAX_ALIVE);
    wave.spawned = 0;
    wave.spawnT = 0;
    noteCombat(0, wave.n);
    if (wave.n % 5 === 0) {
      hud.showBanner('IT IS HERE', `${skin.name} — A TITAN IS AT THE GATE`, 5);
    } else {
      hud.showBanner(`WAVE ${wave.n}`, `${skin.name} — ${wave.queue.length} INBOUND`, 3.5);
    }
  }

  // ---- spawning ----------------------------------------------------------------
  function spawnMonster(type, x, z) {
    const A = ARCHETYPES[type];
    const m = kit.make(type, (def.seed * 0.001 + ++monsterSeed * 1.7) % 6.28);
    m.A = A;
    m.holder = new THREE.Group();
    m.holder.add(m.root);
    group.add(m.holder);
    m.x = x; m.z = z; m.y = gy(x, z);
    m.yaw = Math.atan2(-x, -z); // face town centre
    // later waves hit harder and take more killing
    const tough = 1 + Math.min(wave.n, 12) * 0.06;
    m.hpMax = A.hp * tough;
    m.hp = m.hpMax;
    m.state = 'approach'; // approach | tele | attack | recover | dead
    m.stT = 0; m.stDur = 0;
    m.air = 0; // height above the ground (stalker leap)
    m.cd = 1.5 + rng() * 1.5; // primary attack cooldown
    m.cd2 = 3 + rng() * 2; // secondary
    m.tx = x; m.tz = z;
    m.perceiveT = rng() * 0.2;
    m.los = false;
    m.strafe = rng() < 0.5 ? -1 : 1;
    m.stuckT = 0; m.lx = x; m.lz = z; m.detourT = 0; m.dtx = 0; m.dtz = 0;
    m.deadT = 0;
    m.stepSign = 1;
    m.ax = 0; m.az = 0; // attack scratch: charge direction / leap start
    m.bx = 0; m.bz = 0; // leap target
    m.hitOnce = false;
    m.combo = 0;
    m.burnT = 0; // seconds of plasma burn remaining
    m.boss = type === 'titan';
    monsters.push(m);
    if (m.boss) wave.boss = m;
    sfx.playRoar(A.size, distToView(x, m.y, z), panOf(x, z));
    return m;
  }

  function removeMonster(i) {
    const m = monsters[i];
    group.remove(m.holder);
    kit.free(m);
    if (wave.boss === m) wave.boss = null;
    monsters.splice(i, 1);
  }

  // ---- hit volumes -----------------------------------------------------------
  // A part's centre in city-local space -> _pc.
  const _pc = { x: 0, y: 0, z: 0, r: 0 };
  function partAt(m, p) {
    const sy = Math.sin(m.yaw), cy = Math.cos(m.yaw);
    _pc.x = m.x + sy * p[2] + cy * p[0];
    _pc.z = m.z + cy * p[2] - sy * p[0];
    _pc.y = m.y + m.air + p[1];
    _pc.r = p[3];
    return _pc;
  }
  // Nearest part of a monster along a ray: returns t (or -1), part index in rayPart.
  let rayPart = 0;
  function rayMonster(m, ox, oy, oz, dx, dy, dz, maxT) {
    let best = -1;
    const parts = m.A.parts;
    for (let i = 0; i < parts.length; i++) {
      const c = partAt(m, parts[i]);
      const t = raySphere(ox, oy, oz, dx, dy, dz, c.x, c.y, c.z, c.r);
      if (t >= 0 && t < maxT && (best < 0 || t < best)) { best = t; rayPart = i; }
    }
    return best;
  }
  // A monster's centre of mass (for splash, chains, aim assist) -> _pc.
  function coreOf(m) { return partAt(m, m.A.parts[0]); }

  // ---- movement ---------------------------------------------------------------
  // Monsters may leave the town proper: the landing pad sits outside the wall,
  // and a pad nothing can reach would be a place to stand and shoot forever.
  const roamR = city.outerRadius ?? radius;
  function clampToTown(o, kx, kz, margin = 5) {
    const d = Math.hypot(o[kx], o[kz]);
    const max = roamR - margin;
    if (d > max) { o[kx] *= max / d; o[kz] *= max / d; }
  }

  function collideMonster(m) {
    const R = m.A.radius;
    for (const c of keepOut) {
      const dx = m.x - c.x, dz = m.z - c.z;
      const rr = c.radius + R * 0.6; // a big body shoulders past a corner
      const dd = dx * dx + dz * dz;
      if (dd < rr * rr && dd > 1e-6) {
        const d = Math.sqrt(dd);
        m.x = c.x + (dx / d) * rr;
        m.z = c.z + (dz / d) * rr;
      }
    }
    for (const o of monsters) {
      if (o === m || o.state === 'dead') continue;
      const dx = m.x - o.x, dz = m.z - o.z;
      const rr = (R + o.A.radius) * 0.85;
      const dd = dx * dx + dz * dz;
      if (dd < rr * rr && dd > 1e-6) {
        const d = Math.sqrt(dd);
        // the lighter one gives way
        const k = (rr - d) * (o.A.radius >= R ? 0.8 : 0.2);
        m.x += (dx / d) * k;
        m.z += (dz / d) * k;
      }
    }
    clampToTown(m, 'x', 'z', 3);
  }

  // Walk toward (tx, tz) by way of the gate if need be. Returns true on arrival.
  function moveMonster(m, tx, tz, speed, dt, face = true) {
    if (m.detourT > 0) { tx = m.dtx; tz = m.dtz; m.detourT -= dt; }
    else { const w = route(m.x, m.z, tx, tz, m.A.radius); tx = w.x; tz = w.z; }
    const dx = tx - m.x, dz = tz - m.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.6) { m.moving = Math.max(0, m.moving - dt * 3); return true; }
    const step = Math.min(speed * dt, d);
    const px = m.x, pz = m.z;
    m.x += (dx / d) * step;
    m.z += (dz / d) * step;
    collideMonster(m);
    m.y = gy(m.x, m.z);
    const moved = Math.hypot(m.x - px, m.z - pz);
    m.phase += moved * m.A.gait;
    m.moving = Math.min(1, m.moving + dt * 3);
    if (face) turnToward(m, Math.atan2(dx, dz), dt, 3.2);
    // Stuck on a building: sidestep along the tangent for a moment.
    m.stuckT += dt;
    if (m.stuckT > 1.2) {
      if (Math.hypot(m.x - m.lx, m.z - m.lz) < speed * 0.25 && m.detourT <= 0) {
        const nx = -dz / d, nz = dx / d;
        m.dtx = m.x + nx * 14 * m.strafe;
        m.dtz = m.z + nz * 14 * m.strafe;
        m.detourT = 1.6;
        m.strafe = -m.strafe;
      }
      m.stuckT = 0;
      m.lx = m.x; m.lz = m.z;
    }
    return false;
  }

  // Close on the player but stop short of standing on them: a body that size
  // has no business occupying the camera.
  function closeIn(m, hold, d, toPlayer, dt) {
    if (d > hold) return moveMonster(m, player.x, player.z, m.A.speed, dt);
    m.moving = Math.max(0, m.moving - dt * 3);
    turnToward(m, toPlayer, dt, 3.2);
    return true;
  }

  function turnToward(m, want, dt, rate) {
    let dy = want - m.yaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    m.yaw += THREE.MathUtils.clamp(dy, -rate * dt, rate * dt);
  }

  function setState(m, state, dur = 0, attack = m.attack) {
    m.state = state;
    m.stT = 0;
    m.stDur = dur;
    m.attack = attack;
    if (state !== 'tele') m.tele = 0;
  }

  // ---- what an attack does ------------------------------------------------------
  // A ring of dust racing outward along the ground from (x, z).
  function shockRing(x, y, z, r, big) {
    const n = big ? 40 : 22;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rng() * 0.2;
      const sp = r * (1.6 + rng() * 0.5);
      smoke.emit(x + Math.cos(a) * 1.2, y + 0.3, z + Math.sin(a) * 1.2,
        Math.cos(a) * sp, 0.8 + rng(), Math.sin(a) * sp,
        0.9 + rng() * 0.5, big ? 1.4 : 0.8, big ? 4.5 : 2.6, 0.5, 0.45, 0.38, 0.6, 2.4, -0.2);
    }
    for (let i = 0; i < (big ? 18 : 9); i++) {
      const a = rng() * Math.PI * 2, sp = 4 + rng() * 9;
      glow.emit(x, y + 0.4, z, Math.cos(a) * sp, 3 + rng() * 6, Math.sin(a) * sp,
        0.4 + rng() * 0.4, 0.16, 0.03, GLOW.r * 2, GLOW.g * 2, GLOW.b * 2, 1, 1.5, 12);
    }
  }

  // Ground shock: hurts the player inside `r` unless they are off the ground.
  // It passes through walls — that is the point of it.
  function shockwave(m, r, dmg, big) {
    shockRing(m.x, m.y, m.z, r, big);
    sfx.playStomp(big ? 1 : 0.6, distToView(m.x, m.y, m.z), panOf(m.x, m.z));
    addShake(big ? 1.4 : 0.8, m.x, m.z);
    if (passive) return;
    const d = Math.hypot(player.x - m.x, player.y - m.y, player.z - m.z);
    if (d > r || player.airborne) return;
    damagePlayer(dmg * (1 - 0.5 * d / r), m.x, m.z);
  }

  let passive = false; // dialogue ceasefire, or the player is down

  // ---- brains ------------------------------------------------------------------
  function updateMonster(m, dt, t) {
    const A = m.A;
    m.strike = Math.max(0, m.strike - dt * 3.2);
    m.flinch = Math.max(0, m.flinch - dt * 5);
    m.hitFlash = Math.max(0, m.hitFlash - dt * 7);

    if (m.state === 'dead') {
      m.deadT += dt;
      m.deadK = Math.min(1, m.deadT / (m.boss ? 2.4 : 0.9));
      if (m.boss && m.deadT < 2.4 && rng() < dt * 14) {
        const c = partAt(m, A.parts[Math.floor(rng() * A.parts.length) % A.parts.length]);
        ichorFx(c.x, c.y, c.z, rng() - 0.5, 0.6, rng() - 0.5, true);
      }
      // sink into the ground once the body has lain there a while
      const sink = Math.max(0, m.deadT - Z.CORPSE_TIME);
      m.holder.position.set(m.x, m.y + m.air - sink * (m.boss ? 2.5 : 1.2), m.z);
      kit.pose(m, t);
      return;
    }

    // plasma burn: damage over time, set by a patch (below)
    if (m.burnT > 0) {
      m.burnT -= dt;
      if (rng() < dt * 12) {
        const c = coreOf(m);
        glow.emit(c.x + (rng() - 0.5) * c.r, c.y, c.z + (rng() - 0.5) * c.r, 0, 2 + rng() * 2, 0,
          0.4, 0.3, 0.05, 2.6, 0.9, 1.8, 0.9, 1, -1);
      }
    }

    const dx = player.x - m.x, dz = player.z - m.z;
    const d = Math.hypot(dx, dz);
    const dyP = player.y - m.y;
    const toPlayer = Math.atan2(dx, dz);
    m.cd -= dt;
    m.cd2 -= dt;

    m.perceiveT -= dt;
    if (m.perceiveT <= 0) {
      m.perceiveT = 0.2;
      m.los = clearLine(m.x, m.y + A.eyeY, m.z, player.x, player.y + 1.2, player.z);
    }

    if (passive && m.state !== 'attack') {
      // ceasefire: stand and breathe
      m.moving = Math.max(0, m.moving - dt * 3);
      if (m.state === 'tele') setState(m, 'approach');
    } else if (m.state === 'tele') {
      m.stT += dt;
      m.tele = Math.min(1, m.stT / m.stDur);
      m.moving = Math.max(0, m.moving - dt * 4);
      turnToward(m, toPlayer, dt, m.attack === 'charge' ? 4 : 2.2);
      if (m.stT >= m.stDur) beginAttack(m, d, dx, dz);
    } else if (m.state === 'attack') {
      m.stT += dt;
      runAttack(m, dt, d, dyP);
    } else if (m.state === 'recover') {
      m.stT += dt;
      m.moving = Math.max(0, m.moving - dt * 3);
      if (m.stT >= m.stDur) setState(m, 'approach');
    } else {
      // approach: close in (or, for the spitter, hold a range) and pick an attack
      if (m.type === 'brute') {
        closeIn(m, A.radius + 1.6, d, toPlayer, dt);
        if (d < A.slamRange && m.cd <= 0) {
          setState(m, 'tele', A.slamTele, 'slam');
        } else if (m.los && d > A.chargeMin && d < A.chargeMax && Math.abs(dyP) < 4 && m.cd2 <= 0) {
          setState(m, 'tele', A.chargeTele, 'charge');
          sfx.playRoar(A.size, distToView(m.x, m.y, m.z), panOf(m.x, m.z));
        }
      } else if (m.type === 'spitter') {
        if (d < A.keepMin) {
          // back away, still facing you
          moveMonster(m, m.x - (dx / (d || 1)) * 10, m.z - (dz / (d || 1)) * 10, A.speed, dt, false);
          turnToward(m, toPlayer, dt, 3);
        } else if (d > A.keepMax || !m.los) {
          moveMonster(m, player.x, player.z, A.speed, dt);
        } else {
          // in the band: sidle
          moveMonster(m, m.x - (dz / d) * 8 * m.strafe, m.z + (dx / d) * 8 * m.strafe, A.speed * 0.45, dt, false);
          turnToward(m, toPlayer, dt, 3);
          if (rng() < dt * 0.3) m.strafe = -m.strafe;
        }
        if (m.cd <= 0 && d < 62 && (m.los || d < A.keepMax)) setState(m, 'tele', A.spitTele, 'spit');
      } else if (m.type === 'stalker') {
        closeIn(m, 2.6, d, toPlayer, dt);
        if (d < A.swipeRange * 0.8 && dyP < 9 && m.cd <= 0) {
          setState(m, 'tele', A.swipeTele, 'swipe');
          m.combo = 1;
        } else if (d > A.leapMin && d < A.leapMax && m.cd2 <= 0) {
          setState(m, 'tele', A.leapTele, 'leap');
          sfx.playRoar(A.size, distToView(m.x, m.y, m.z), panOf(m.x, m.z));
        }
      } else if (m.type === 'titan') {
        closeIn(m, 7, d, toPlayer, dt);
        if (d < A.stompRange && m.cd <= 0) {
          setState(m, 'tele', A.stompTele, 'stomp');
          sfx.playRoar(1, distToView(m.x, m.y, m.z), panOf(m.x, m.z));
        } else if (d > A.volleyMin && m.cd2 <= 0) {
          setState(m, 'tele', A.volleyTele, 'volley');
        }
      }
    }

    // Footfalls: the ground tells you how big it is before you see it.
    if (m.moving > 0.3 && A.size >= 0.4) {
      const s = Math.sin(m.phase) >= 0 ? 1 : -1;
      if (s !== m.stepSign) {
        m.stepSign = s;
        const dist = distToView(m.x, m.y, m.z);
        if (dist < 140) sfx.playStomp(A.size * 0.8, dist, panOf(m.x, m.z));
        addShake(A.size * A.size * 0.5, m.x, m.z);
        if (A.size >= 0.5) {
          for (let i = 0; i < 3; i++) {
            smoke.emit(m.x + (rng() - 0.5) * A.radius * 2, m.y + 0.2, m.z + (rng() - 0.5) * A.radius * 2,
              (rng() - 0.5) * 2, 0.6 + rng(), (rng() - 0.5) * 2, 0.9, 0.5, 2.2 * A.size + 0.6, 0.5, 0.45, 0.38, 0.45, 2, -0.2);
          }
        }
      }
    }

    m.holder.position.set(m.x, m.y + m.air, m.z);
    m.holder.rotation.y = m.yaw;
    kit.pose(m, t);
  }

  // The wind-up is over: commit.
  function beginAttack(m, d, dx, dz) {
    const A = m.A;
    m.tele = 0;
    m.hitOnce = false;
    if (m.attack === 'slam') {
      m.strike = 1;
      shockwave(m, A.slamRadius, A.slamDmg, false);
      m.cd = 2.6;
      setState(m, 'recover', 1.3);
    } else if (m.attack === 'charge') {
      m.ax = dx / (d || 1); m.az = dz / (d || 1);
      m.cd2 = 5;
      setState(m, 'attack', 2.6);
    } else if (m.attack === 'spit') {
      m.strike = 1;
      const c = partAt(m, [0, 3.85, 1.9, 0, 0]);
      lobGlob(c.x, c.y, c.z, player.x, player.y + 0.4, player.z, A, 0.6);
      sfx.playSpit(distToView(c.x, c.y, c.z), panOf(c.x, c.z));
      m.cd = A.spitCd * (0.8 + rng() * 0.5);
      setState(m, 'recover', 0.55);
    } else if (m.attack === 'swipe') {
      m.strike = 1;
      const reach = Math.hypot(player.x - m.x, player.z - m.z);
      if (!passive && reach < A.swipeRange && player.y - m.y < 9) damagePlayer(A.swipeDmg, m.x, m.z);
      if (m.combo > 0) {
        m.combo--;
        setState(m, 'tele', A.swipeTele * 0.8, 'swipe'); // the second scythe
      } else {
        m.cd = 1.8;
        setState(m, 'recover', 0.8);
      }
    } else if (m.attack === 'leap') {
      // land on the player, or as near as a building allows
      m.ax = m.x; m.az = m.z;
      m.bx = player.x + player.vx * 0.5; m.bz = player.z + player.vz * 0.5;
      for (const c of keepOut) {
        const ex = m.bx - c.x, ez = m.bz - c.z;
        const rr = c.radius + A.radius;
        const dd = Math.hypot(ex, ez);
        if (dd < rr) { m.bx = c.x + (ex / (dd || 1)) * rr; m.bz = c.z + (ez / (dd || 1)) * rr; }
      }
      clampToTown(m, 'bx', 'bz', 4);
      m.cd2 = 5.5;
      setState(m, 'attack', A.leapTime);
    } else if (m.attack === 'stomp') {
      m.strike = 1;
      shockwave(m, A.stompRadius, A.stompDmg, true);
      m.cd = 3.6;
      setState(m, 'recover', 1.7);
    } else if (m.attack === 'volley') {
      m.strike = 1;
      const c = partAt(m, [0, 15.4, 2.6, 0, 0]);
      for (let i = 0; i < A.volleyCount; i++) {
        const a = rng() * Math.PI * 2, off = i === 0 ? 0 : 3 + rng() * 5;
        lobGlob(c.x, c.y, c.z, player.x + Math.cos(a) * off, player.y + 0.4, player.z + Math.sin(a) * off, A, i === 0 ? 0.7 : 0.2);
      }
      sfx.playSpit(distToView(c.x, c.y, c.z), panOf(c.x, c.z));
      m.cd2 = A.volleyCd;
      setState(m, 'recover', 1.0);
    }
  }

  // Attacks that take time: the brute's charge, the stalker's leap.
  function runAttack(m, dt, d, dyP) {
    const A = m.A;
    if (m.attack === 'charge') {
      // a little steering, so a sidestep has to be a real one
      const want = Math.atan2(player.x - m.x, player.z - m.z);
      turnToward(m, want, dt, 0.55);
      m.ax = Math.sin(m.yaw); m.az = Math.cos(m.yaw);
      const px = m.x, pz = m.z;
      m.x += m.ax * A.chargeSpeed * dt;
      m.z += m.az * A.chargeSpeed * dt;
      collideMonster(m);
      m.y = gy(m.x, m.z);
      const moved = Math.hypot(m.x - px, m.z - pz);
      m.phase += moved * A.gait * 1.3;
      m.moving = 1;
      if (!m.hitOnce && !passive && d < A.radius + 1.3 && Math.abs(dyP) < 3.2) {
        m.hitOnce = true;
        damagePlayer(A.chargeDmg, m.x, m.z);
        addShake(0.9, m.x, m.z);
      }
      // ran into something solid: it stuns itself
      if (moved < A.chargeSpeed * dt * 0.35) {
        shockRing(m.x, m.y, m.z, 4, false);
        sfx.playStomp(0.7, distToView(m.x, m.y, m.z), panOf(m.x, m.z));
        addShake(0.6, m.x, m.z);
        setState(m, 'recover', 2.2);
      } else if (m.stT >= m.stDur) {
        setState(m, 'recover', 0.9);
      }
    } else if (m.attack === 'leap') {
      const k = Math.min(1, m.stT / m.stDur);
      m.x = m.ax + (m.bx - m.ax) * k;
      m.z = m.az + (m.bz - m.az) * k;
      m.y = gy(m.x, m.z);
      m.air = 4 * k * (1 - k) * A.leapHeight * (skin.leap ?? 1);
      m.moving = 0;
      if (k >= 1) {
        m.air = 0;
        m.strike = 1;
        shockRing(m.x, m.y, m.z, A.landRadius, false);
        sfx.playStomp(0.75, distToView(m.x, m.y, m.z), panOf(m.x, m.z));
        addShake(1.0, m.x, m.z);
        const dd = Math.hypot(player.x - m.x, player.y - m.y, player.z - m.z);
        if (!passive && dd < A.landRadius) damagePlayer(A.landDmg * (1 - 0.4 * dd / A.landRadius), m.x, m.z);
        setState(m, 'recover', 0.9);
      }
    } else {
      setState(m, 'approach');
    }
  }

  // ---- the swarm ----------------------------------------------------------------
  const FLYERS = 36;
  const swarmMesh = kit.swarmMeshes(FLYERS);
  group.add(swarmMesh.bodies, swarmMesh.wings);
  const flyers = [];
  function flyersAlive() {
    let n = 0;
    for (const f of flyers) if (f.state !== 'dead') n++;
    return n;
  }
  function spawnSwarm(x, z) {
    const y0 = gy(x, z) + SWARMLING.orbitY;
    for (let i = 0; i < SWARMLING.flock && flyers.length < FLYERS; i++) {
      flyers.push({
        x: x + (rng() - 0.5) * 6, y: y0 + rng() * 3, z: z + (rng() - 0.5) * 6,
        vx: 0, vy: 0, vz: 0, hp: SWARMLING.hp,
        state: 'orbit', // orbit | tele | dive | climb | dead
        t: 2 + rng() * 4, ang: rng() * Math.PI * 2, dir: rng() < 0.5 ? -1 : 1,
        yaw: 0, pitch: 0, flap: rng() * 6, deadT: 0, bit: false,
      });
    }
    sfx.playShriek(distToView(x, y0, z), panOf(x, z));
  }
  function updateFlyers(dt, t) {
    const S = SWARMLING;
    let divers = 0;
    for (const f of flyers) if (f.state === 'tele' || f.state === 'dive') divers++;
    let n = 0;
    for (let i = flyers.length - 1; i >= 0; i--) {
      const f = flyers[i];
      if (f.state === 'dead') {
        f.deadT += dt;
        f.vy -= 18 * dt;
        f.x += f.vx * dt; f.y += f.vy * dt; f.z += f.vz * dt;
        if (f.deadT > 1.2 || f.y < gy(f.x, f.z)) { flyers.splice(i, 1); continue; }
      } else {
        let tx, ty, tz, speed = S.cruise;
        const hx = player.x, hy = player.y + 1.4, hz = player.z;
        if (f.state === 'orbit' || f.state === 'climb') {
          f.ang += f.dir * dt * 0.75;
          tx = hx + Math.cos(f.ang) * S.orbitR;
          tz = hz + Math.sin(f.ang) * S.orbitR;
          ty = Math.max(gy(tx, tz), player.y) + S.orbitY + Math.sin(t * 1.3 + f.flap) * 1.5;
          f.t -= dt;
          if (f.state === 'climb' && f.y > ty - 2) f.state = 'orbit';
          if (f.state === 'orbit' && f.t <= 0 && !passive && divers < 3) {
            f.state = 'tele';
            f.t = S.diveTele;
            divers++;
            sfx.playShriek(distToView(f.x, f.y, f.z), panOf(f.x, f.z));
          }
        } else if (f.state === 'tele') {
          tx = f.x; ty = f.y + 1.5; tz = f.z; speed = 2; // hang, and rear back
          f.t -= dt;
          if (f.t <= 0) { f.state = 'dive'; f.t = 2.2; f.bit = false; }
        } else {
          tx = hx; ty = hy; tz = hz; speed = S.diveSpeed;
          f.t -= dt;
          const dd = Math.hypot(hx - f.x, hy - f.y, hz - f.z);
          if (!f.bit && dd < S.biteReach) {
            f.bit = true;
            if (!passive) damagePlayer(S.biteDmg, f.x, f.z);
          }
          if (f.bit || f.t <= 0 || dd < 0.8) { f.state = 'climb'; f.t = 3 + rng() * 4; }
        }
        // steer: accelerate toward the target velocity
        let dx = tx - f.x, dy = ty - f.y, dz = tz - f.z;
        const dl = Math.hypot(dx, dy, dz) || 1;
        const k = Math.min(1, dt * (f.state === 'dive' ? 5 : 2.4));
        f.vx += ((dx / dl) * speed - f.vx) * k;
        f.vy += ((dy / dl) * speed - f.vy) * k;
        f.vz += ((dz / dl) * speed - f.vz) * k;
        f.x += f.vx * dt; f.y += f.vy * dt; f.z += f.vz * dt;
        const floor = gy(f.x, f.z) + 0.6;
        if (f.y < floor) { f.y = floor; f.vy = Math.abs(f.vy) * 0.3; }
      }
      // instance: nose along the velocity, wings flapping by a flipped scale
      const sp = Math.hypot(f.vx, f.vz);
      f.yaw = Math.atan2(f.vx, f.vz);
      f.pitch = -Math.atan2(f.vy, sp || 1e-3);
      f.flap += dt * (f.state === 'dive' ? 34 : 22);
      _v.set(f.x, f.y, f.z);
      _eul.set(f.pitch, f.yaw, f.state === 'dead' ? f.deadT * 9 : 0, 'YXZ');
      _q.setFromEuler(_eul);
      _s.set(1, 1, 1);
      swarmMesh.bodies.setMatrixAt(n, _m4.compose(_v, _q, _s));
      _s.set(1, f.state === 'dead' ? 0.2 : Math.sin(f.flap) * 1.2, 1);
      swarmMesh.wings.setMatrixAt(n, _m4.compose(_v, _q, _s));
      n++;
    }
    swarmMesh.bodies.count = n;
    swarmMesh.wings.count = n;
    if (n) {
      swarmMesh.bodies.instanceMatrix.needsUpdate = true;
      swarmMesh.wings.instanceMatrix.needsUpdate = true;
    }
  }
  const _eul = new THREE.Euler();

  // ---- shells, globs and what they leave behind -----------------------------------
  // One pool for everything that flies in an arc: the plasma launcher's shells
  // and the acid the spitter and titan throw.
  const SHELLS = 24;
  const shellGeo = new THREE.SphereGeometry(1, 8, 6);
  ownedGeos.push(shellGeo);
  const shellMat = own(new THREE.MeshBasicMaterial({ color: 0xffffff }));
  const shellMesh = new THREE.InstancedMesh(shellGeo, shellMat, SHELLS);
  shellMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  shellMesh.frustumCulled = false;
  const shells = [];
  for (let i = 0; i < SHELLS; i++) {
    shells.push({ on: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, g: 0, life: 0, acid: false, src: null, r: 0.2 });
    shellMesh.setMatrixAt(i, _zero);
    shellMesh.setColorAt(i, GLOW);
  }
  group.add(shellMesh);
  const PLASMA = new THREE.Color(WEAPONS.plasma.tint);
  const _hot = new THREE.Color();
  function freeShell() {
    for (const s of shells) if (!s.on) return s;
    return shells[0]; // pool exhausted: recycle the oldest slot
  }
  function launchShell(x, y, z, vx, vy, vz, g, acid, src) {
    const s = freeShell();
    s.on = true;
    s.x = x; s.y = y; s.z = z; s.vx = vx; s.vy = vy; s.vz = vz;
    s.g = g; s.life = 6; s.acid = acid; s.src = src;
    s.r = acid ? 0.42 : 0.24;
    shellMesh.setColorAt(shells.indexOf(s), _hot.copy(acid ? GLOW : PLASMA).multiplyScalar(3));
    shellMesh.instanceColor.needsUpdate = true;
  }
  // A lobbed glob from (x,y,z) onto (tx,ty,tz), leading the player by `lead`.
  function lobGlob(x, y, z, tx, ty, tz, A, lead) {
    const D = Math.hypot(tx - x, tz - z);
    const T = THREE.MathUtils.clamp(D / (A.globSpeed * 0.8), 0.7, 2.8);
    tx += player.vx * T * lead; tz += player.vz * T * lead;
    launchShell(x, y, z, (tx - x) / T, (ty - y + 0.5 * A.globGravity * T * T) / T, (tz - z) / T, A.globGravity, true, A);
  }

  // Burning / corroding ground. hostile patches hurt the player, the rest
  // hurt monsters.
  const PATCHES = 14;
  const patchGeo = new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2);
  ownedGeos.push(patchGeo);
  const patchTex = canvasTex(64, (g, s) => {
    const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grad.addColorStop(0, 'rgba(255,255,255,0.9)');
    grad.addColorStop(0.6, 'rgba(255,255,255,0.45)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, s, s);
  });
  ownedTex.push(patchTex);
  const patchMat = own(new THREE.MeshBasicMaterial({
    map: patchTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
  }));
  const patchMesh = new THREE.InstancedMesh(patchGeo, patchMat, PATCHES);
  patchMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  patchMesh.frustumCulled = false;
  patchMesh.renderOrder = 3;
  const patches = [];
  for (let i = 0; i < PATCHES; i++) {
    patches.push({ on: false, x: 0, y: 0, z: 0, r: 0, life: 0, life0: 1, dps: 0, hostile: false, acc: 0 });
    patchMesh.setMatrixAt(i, _zero);
    patchMesh.setColorAt(i, GLOW);
  }
  group.add(patchMesh);
  function addPatch(x, y, z, r, life, dps, hostile) {
    let p = patches.find((q) => !q.on);
    if (!p) p = patches.reduce((a, b) => (a.life < b.life ? a : b));
    p.on = true;
    p.x = x; p.y = y; p.z = z; p.r = r; p.life = life; p.life0 = life; p.dps = dps; p.hostile = hostile;
    patchMesh.setColorAt(patches.indexOf(p), _hot.copy(hostile ? GLOW : PLASMA).multiplyScalar(1.6));
    patchMesh.instanceColor.needsUpdate = true;
  }
  function updatePatches(dt) {
    let any = false;
    for (let i = 0; i < PATCHES; i++) {
      const p = patches[i];
      if (!p.on) continue;
      any = true;
      p.life -= dt;
      if (p.life <= 0) { p.on = false; patchMesh.setMatrixAt(i, _zero); continue; }
      const fade = Math.min(1, p.life / 0.8) * Math.min(1, (p.life0 - p.life) / 0.25);
      _v.set(p.x, p.y + 0.06, p.z);
      _q.identity();
      _s.setScalar(p.r * (0.55 + 0.45 * fade));
      patchMesh.setMatrixAt(i, _m4.compose(_v, _q, _s));
      p.acc += dt;
      if (p.acc > 0.12) {
        p.acc = 0;
        const a = rng() * Math.PI * 2, rr = Math.sqrt(rng()) * p.r;
        const c = p.hostile ? GLOW : PLASMA;
        glow.emit(p.x + Math.cos(a) * rr, p.y + 0.15, p.z + Math.sin(a) * rr, 0, 1.2 + rng() * 1.6, 0,
          0.5 + rng() * 0.4, 0.26, 0.04, c.r * 2.2, c.g * 2.2, c.b * 2.2, 0.85, 0.6, -0.6);
      }
      if (p.hostile) {
        if (!passive && Math.hypot(player.x - p.x, player.z - p.z) < p.r && Math.abs(player.y - p.y) < 1.6) {
          damagePlayer(p.dps * dt, p.x, p.z, true);
        }
      } else {
        for (const m of monsters) {
          if (m.state === 'dead' || m.air > 2) continue;
          if (Math.hypot(m.x - p.x, m.z - p.z) < p.r + m.A.radius * 0.6) {
            m.burnT = 0.6;
            hurtMonster(m, p.dps * dt, false, 0, 1, 0, true);
          }
        }
      }
    }
    if (any) patchMesh.instanceMatrix.needsUpdate = true;
  }

  // A blast at a point. `W` is the weapon (player shells) or null for acid.
  function explode(x, y, z, s) {
    const dist = distToView(x, y, z);
    if (s.acid) {
      const A = s.src;
      sfx.playSplat(dist, panOf(x, z));
      for (let i = 0; i < 16; i++) {
        const a = rng() * Math.PI * 2, sp = 2 + rng() * 6;
        glow.emit(x, y + 0.2, z, Math.cos(a) * sp, 2 + rng() * 5, Math.sin(a) * sp,
          0.4 + rng() * 0.4, 0.22, 0.04, GLOW.r * 2.4, GLOW.g * 2.4, GLOW.b * 2.4, 0.95, 2, 12);
      }
      const d = Math.hypot(player.x - x, player.y + 1 - y, player.z - z);
      if (!passive && d < A.globRadius) damagePlayer(A.globDmg * (1 - 0.6 * d / A.globRadius), x, z);
      addPatch(x, gy(x, z), z, A.poolRadius, A.poolTime, A.poolDps, true);
      return;
    }
    const W = s.src;
    const P = W.proj;
    sfx.playExplosion(dist, panOf(x, z), 1);
    addShake(0.7, x, z);
    for (let i = 0; i < 30; i++) {
      const a = rng() * Math.PI * 2, e = rng() * Math.PI * 0.5, sp = 5 + rng() * 14;
      glow.emit(x, y + 0.3, z, Math.cos(a) * Math.cos(e) * sp, Math.sin(e) * sp, Math.sin(a) * Math.cos(e) * sp,
        0.35 + rng() * 0.5, 0.5, 0.05, PLASMA.r * 3, PLASMA.g * 3, PLASMA.b * 3, 1, 2.5, 6);
    }
    glow.emit(x, y + 0.6, z, 0, 0.5, 0, 0.22, 2.5, 7, 3, 2.4, 2.8, 0.9, 0, 0); // the flash
    for (let i = 0; i < 8; i++) {
      smoke.emit(x + (rng() - 0.5) * 2, y + 0.5, z + (rng() - 0.5) * 2, (rng() - 0.5) * 3, 1.5 + rng() * 2, (rng() - 0.5) * 3,
        1.4 + rng(), 1.2, 5, 0.12, 0.1, 0.13, 0.55, 1.2, -0.2);
    }
    let hitAny = false, killed = false;
    for (const m of monsters) {
      if (m.state === 'dead') continue;
      // nearest part surface to the blast
      let near = Infinity;
      for (const p of m.A.parts) {
        const c = partAt(m, p);
        near = Math.min(near, Math.hypot(c.x - x, c.y - y, c.z - z) - c.r);
      }
      if (near > P.splash) continue;
      hitAny = true;
      const k = 1 - 0.75 * Math.max(0, near) / P.splash;
      const c = coreOf(m);
      if (hurtMonster(m, W.dmg * k, false, c.x - x, 0.4, c.z - z, true)) killed = true;
    }
    for (const f of flyers) {
      if (f.state === 'dead') continue;
      if (Math.hypot(f.x - x, f.y - y, f.z - z) < P.splash) { hitAny = true; if (hurtFlyer(f, W.dmg, f.x - x, f.z - z)) killed = true; }
    }
    if (hitAny) { hud.hitmarker(killed ? 'kill' : 'hit'); sfx.playHit(killed, false); }
    // your own blast: stand back
    const pd = Math.hypot(player.x - x, player.y + 1 - y, player.z - z);
    if (pd < P.splash * 0.6) damagePlayer(30 * (1 - pd / (P.splash * 0.6)), x, z);
    addPatch(x, gy(x, z), z, P.burnRadius, P.burnTime, P.burnDps, false);
    alertNoise();
  }

  function updateShells(dt) {
    let any = false;
    for (let i = 0; i < SHELLS; i++) {
      const s = shells[i];
      if (!s.on) continue;
      any = true;
      s.life -= dt;
      s.vy -= s.g * dt;
      const sx = s.vx * dt, sy = s.vy * dt, sz = s.vz * dt;
      const len = Math.hypot(sx, sy, sz) || 1e-6;
      const dx = sx / len, dy = sy / len, dz = sz / len;
      let t = worldRay(s.x, s.y, s.z, dx, dy, dz, len);
      // the player's shells also burst on a body; acid bursts on the ground or on you
      if (!s.acid) {
        for (const m of monsters) {
          if (m.state === 'dead') continue;
          const tm = rayMonster(m, s.x, s.y, s.z, dx, dy, dz, t >= 0 ? t : len);
          if (tm >= 0) t = tm;
        }
        for (const f of flyers) {
          if (f.state === 'dead') continue;
          const tf = raySphere(s.x, s.y, s.z, dx, dy, dz, f.x, f.y, f.z, SWARMLING.radius + 0.3);
          if (tf >= 0 && tf <= (t >= 0 ? t : len)) t = tf;
        }
      } else {
        const tp = raySphere(s.x, s.y, s.z, dx, dy, dz, player.x, player.y + 1, player.z, 0.9);
        if (tp >= 0 && tp <= (t >= 0 ? t : len)) t = tp;
      }
      if (t >= 0 || s.life <= 0) {
        const k = t >= 0 ? t : 0;
        s.on = false;
        shellMesh.setMatrixAt(i, _zero);
        explode(s.x + dx * k, s.y + dy * k, s.z + dz * k, s);
        continue;
      }
      s.x += sx; s.y += sy; s.z += sz;
      _v.set(s.x, s.y, s.z);
      _q.identity();
      _s.setScalar(s.r);
      shellMesh.setMatrixAt(i, _m4.compose(_v, _q, _s));
      const c = s.acid ? GLOW : PLASMA;
      glow.emit(s.x, s.y, s.z, (rng() - 0.5), (rng() - 0.5), (rng() - 0.5),
        0.28, s.r * 2.2, 0.03, c.r * 2.4, c.g * 2.4, c.b * 2.4, 0.9, 1, 0);
    }
    if (any) shellMesh.instanceMatrix.needsUpdate = true;
  }

  // ---- taking damage ---------------------------------------------------------------
  // Returns true if this killed it. `quiet` skips the ichor burst (burn ticks).
  function hurtMonster(m, dmg, crit, dx, dy, dz, quiet) {
    if (m.state === 'dead') return false;
    m.hp -= dmg;
    if (!quiet) {
      m.hitFlash = 1;
      m.flinch = Math.min(1, m.flinch + dmg / (m.hpMax * 0.08));
    }
    if (m.hp > 0) return false;
    m.state = 'dead';
    m.deadT = 0;
    m.air = 0;
    m.tele = 0;
    m.moving = 0;
    player.kills++;
    noteCombat(1, wave.n);
    const pts = m.A.score * (crit ? 1.25 : 1);
    player.score += pts;
    hud.popScore(m.boss ? `TITAN DOWN  +${pts}` : crit ? `WEAK POINT  +${pts}` : `+${pts}`);
    const c = coreOf(m);
    for (let i = 0; i < (m.boss ? 5 : 2); i++) ichorFx(c.x, c.y, c.z, dx, 0.5, dz, true);
    sfx.playSplat(distToView(c.x, c.y, c.z), panOf(c.x, c.z));
    sfx.playRoar(m.A.size, distToView(c.x, c.y, c.z), panOf(c.x, c.z));
    if (m.boss) {
      addTrophy(def.world);
      addShake(1.6, m.x, m.z);
      dropWeaponCrate(m.x, m.z, null);
      hud.showBanner('TITAN SLAIN', 'A TROPHY HANGS IN YOUR SHIP\'S LOUNGE', 5);
    } else if (rng() < 0.75) {
      dropPickup(m.x, m.z);
    }
    return true;
  }
  function hurtFlyer(f, dmg, dx, dz) {
    if (f.state === 'dead') return false;
    f.hp -= dmg;
    if (f.hp > 0) return false;
    f.state = 'dead';
    f.deadT = 0;
    f.vx += dx * 3; f.vz += dz * 3; f.vy = 2;
    player.kills++;
    noteCombat(1, wave.n);
    player.score += SWARMLING.score;
    ichorFx(f.x, f.y, f.z, dx, 0.4, dz, false);
    if (rng() < 0.12) dropPickup(f.x, f.z);
    return true;
  }

  // Nearest thing a ray hits, bodies only. Fills `hit`; returns t or -1.
  // `skip` is a monster or flyer to ignore (a chain's previous link).
  const hit = { m: null, f: null, part: 0 };
  function rayBodies(ox, oy, oz, dx, dy, dz, maxT, skip) {
    let best = -1;
    hit.m = null; hit.f = null;
    for (const m of monsters) {
      if (m.state === 'dead' || m === skip) continue;
      const t = rayMonster(m, ox, oy, oz, dx, dy, dz, best >= 0 ? best : maxT);
      if (t >= 0) { best = t; hit.m = m; hit.f = null; hit.part = rayPart; }
    }
    for (const f of flyers) {
      if (f.state === 'dead' || f === skip) continue;
      const t = raySphere(ox, oy, oz, dx, dy, dz, f.x, f.y, f.z, SWARMLING.radius);
      if (t >= 0 && t < (best >= 0 ? best : maxT)) { best = t; hit.f = f; hit.m = null; }
    }
    return best;
  }

  // Gunfire carries: everything out there turns toward it. (Monsters always
  // know where you are; this only shortens a spitter's patience.)
  function alertNoise() {
    for (const m of monsters) if (m.state !== 'dead') m.cd = Math.min(m.cd, 1.2);
  }

  // ---- pickups ---------------------------------------------------------------
  const pickGeo = new THREE.BoxGeometry(0.5, 0.3, 0.32);
  const pickBand = new THREE.BoxGeometry(0.52, 0.06, 0.34);
  ownedGeos.push(pickGeo, pickBand);
  const pickMat = own(new THREE.MeshStandardMaterial({ color: 0x3d4a2c, roughness: 0.7 }));
  const pickGlow = own(new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xffd23f, emissiveIntensity: 2.2 }));
  const pickups = [];
  function dropPickup(x, z) {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(pickGeo, pickMat));
    g.add(new THREE.Mesh(pickBand, pickGlow));
    group.add(g);
    pickups.push({ x, z, y: city.groundLocalYAt(x, z), life: Z.PICKUP_LIFE, mesh: g });
  }
  function updatePickups(dt, t) {
    for (let i = pickups.length - 1; i >= 0; i--) {
      const p = pickups[i];
      p.life -= dt;
      const d = Math.hypot(p.x - player.x, p.z - player.z);
      const take = !player.dead && d < Z.PICKUP_REACH && Math.abs(player.y - p.y) < 2.5 &&
        weapon.state.reserve < weapon.def.reserveMax;
      if (take) {
        const got = weapon.addPickup();
        sfx.playPickup();
        hud.popScore(`+${got} AMMO`);
      }
      if (take || p.life <= 0) {
        group.remove(p.mesh);
        pickups.splice(i, 1);
        continue;
      }
      p.mesh.position.set(p.x, p.y + 0.35 + Math.sin(t * 3 + i) * 0.08, p.z);
      p.mesh.rotation.y = t * 1.5 + i;
      p.mesh.visible = p.life > 6 || Math.sin(t * 18) > 0; // blink before expiring
    }
  }

  // ---- weapon gunCrates -----------------------------------------------------------
  // A long case with a lit band in the weapon's colour and a beam over it you
  // can see from across town. One sits in every warzone town (its world's
  // weapon); a dead titan drops another holding something you don't have yet.
  const gunCrateGeo = new THREE.BoxGeometry(1.5, 0.5, 0.6);
  const gunCrateBand = new THREE.BoxGeometry(1.54, 0.1, 0.64);
  const gunBeamGeo = new THREE.CylinderGeometry(0.16, 0.16, 26, 8, 1, true).translate(0, 13, 0);
  ownedGeos.push(gunCrateGeo, gunCrateBand, gunBeamGeo);
  const gunCrateMat = own(new THREE.MeshStandardMaterial({ color: 0x23272e, roughness: 0.5, metalness: 0.6 }));
  const gunCrates = [];
  // id null = pick the first weapon the player doesn't own (or a full restock).
  function dropWeaponCrate(x, z, id) {
    if (!id) {
      id = WEAPON_ORDER.find((w) => !weapon.owned.has(w)) ?? null;
    }
    const tint = new THREE.Color(id ? WEAPONS[id].tint : 0xffd23f);
    const bandMat = new THREE.MeshBasicMaterial({ color: tint.clone().multiplyScalar(2.4) });
    const beamMat = new THREE.MeshBasicMaterial({
      color: tint, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending,
      depthWrite: false, side: THREE.DoubleSide,
    });
    const g = new THREE.Group();
    g.add(new THREE.Mesh(gunCrateGeo, gunCrateMat), new THREE.Mesh(gunCrateBand, bandMat), new THREE.Mesh(gunBeamGeo, beamMat));
    g.position.set(x, gy(x, z) + 0.3, z);
    group.add(g);
    gunCrates.push({ x, z, y: gy(x, z), id, mesh: g, bandMat, beamMat });
  }
  function updateCrates(t) {
    for (let i = gunCrates.length - 1; i >= 0; i--) {
      const c = gunCrates[i];
      c.mesh.rotation.y = t * 0.6;
      c.beamMat.opacity = 0.22 + Math.sin(t * 2.2) * 0.08;
      if (player.dead) continue;
      if (Math.hypot(c.x - player.x, c.z - player.z) > 2.4 || Math.abs(player.y - c.y) > 3) continue;
      if (c.id) {
        const fresh = grantWeapon(c.id); // persists; toasts the first time
        weapon.grant(c.id);
        hud.showBanner(WEAPONS[c.id].name, fresh ? WEAPONS[c.id].blurb : 'RESTOCKED', 5);
      } else {
        weapon.refill();
        hud.popScore('ALL WEAPONS RESTOCKED');
      }
      sfx.playPickup();
      group.remove(c.mesh);
      c.bandMat.dispose();
      c.beamMat.dispose();
      gunCrates.splice(i, 1);
    }
  }

  // ---- player damage ---------------------------------------------------------
  const out = { pitchKick: 0, yawKick: 0, respawn: false };
  // `tick` marks damage-over-time (acid underfoot): no flinch, no thud per frame.
  function damagePlayer(dmg, fromX, fromZ, tick) {
    if (player.dead || player.invuln > 0) return;
    player.hp -= dmg;
    player.sinceHit = 0;
    if (!tick) {
      sfx.playHurt();
      // direction arc relative to the view
      const tx = fromX - view.ex, tz = fromZ - view.ez;
      const fl = Math.hypot(view.fx, view.fz) || 1;
      const fx = view.fx / fl, fz = view.fz / fl;
      const ang = Math.atan2(tx * view.rx + tz * view.rz, tx * fx + tz * fz);
      hud.damageFrom(ang);
      // flinch, heavier for a heavier blow
      const k = Math.min(3, dmg / 12);
      out.pitchKick += (0.012 + rng() * 0.01) * k;
      out.yawKick += (rng() - 0.5) * 0.02 * k;
      trauma = Math.min(1, trauma + dmg / 90);
    }
    if (player.hp <= 0) {
      player.hp = 0;
      player.dead = true;
      player.deadT = 0;
    }
  }

  // ---- weapon, HUD -----------------------------------------------------------
  const weapon = createWeapon(ownedWeapons());
  const hud = createWarzoneHud(def.name);

  // The town's own crate: this world's weapon, out in the open by the plaza,
  // on the far side from the gate so you have to cross the town for it.
  {
    const id = weaponForWorld(def.world);
    if (id) {
      const a = gateAng + Math.PI + (rng() - 0.5) * 1.2;
      let cx = Math.cos(a) * 9, cz = Math.sin(a) * 9;
      for (const c of keepOut) {
        const dx = cx - c.x, dz = cz - c.z, dd = Math.hypot(dx, dz), rr = c.radius + 2.5;
        if (dd < rr) { cx = c.x + (dx / (dd || 1)) * rr; cz = c.z + (dz / (dd || 1)) * rr; }
      }
      dropWeaponCrate(cx, cz, id);
    }
  }

  // ---- lightning -----------------------------------------------------------------
  // Short-lived jagged segments for the arc caster: a few boxes per link,
  // re-jittered every time they are drawn.
  const BOLTS = 48;
  const boltMat = own(new THREE.MeshBasicMaterial({
    color: new THREE.Color(WEAPONS.arc.tint).multiplyScalar(3.2), transparent: true, opacity: 0.95,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  const boltMesh = new THREE.InstancedMesh(tracerGeo, boltMat, BOLTS);
  boltMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  boltMesh.frustumCulled = false;
  boltMesh.renderOrder = 7;
  for (let i = 0; i < BOLTS; i++) boltMesh.setMatrixAt(i, _zero);
  group.add(boltMesh);
  let boltN = 0, boltLife = 0;
  function addBolt(ax, ay, az, bx, by, bz, w) {
    const segs = 4;
    let px = ax, py = ay, pz = az;
    const len = Math.hypot(bx - ax, by - ay, bz - az);
    const j = Math.min(0.9, len * 0.07);
    for (let i = 1; i <= segs && boltN < BOLTS; i++) {
      const k = i / segs;
      const end = i === segs;
      const qx = ax + (bx - ax) * k + (end ? 0 : (rng() - 0.5) * 2 * j);
      const qy = ay + (by - ay) * k + (end ? 0 : (rng() - 0.5) * 2 * j);
      const qz = az + (bz - az) * k + (end ? 0 : (rng() - 0.5) * 2 * j);
      _v2.set(qx - px, qy - py, qz - pz);
      const l = _v2.length();
      if (l > 1e-4) {
        _q.setFromUnitVectors(_zAxis, _v2.multiplyScalar(1 / l));
        _v.set((px + qx) / 2, (py + qy) / 2, (pz + qz) / 2);
        _s.set(w, w, l);
        boltMesh.setMatrixAt(boltN++, _m4.compose(_v, _q, _s));
      }
      px = qx; py = qy; pz = qz;
    }
    boltLife = 0.06;
    boltMesh.instanceMatrix.needsUpdate = true;
  }
  function updateBolts(dt) {
    if (boltLife <= 0) return;
    boltLife -= dt;
    if (boltLife <= 0) {
      for (let i = 0; i < boltN; i++) boltMesh.setMatrixAt(i, _zero);
      boltN = 0;
      boltMesh.instanceMatrix.needsUpdate = true;
    }
  }

  // ---- player shots ------------------------------------------------------------
  const aim = { dx: 0, dy: 0, dz: -1 };
  const muzzle = { x: 0, y: 0, z: 0 };
  // A direction inside a cone of half-angle `spreadRad` around the view axis.
  function coneDir(spreadRad) {
    const u = rng(), a = rng() * Math.PI * 2;
    const r = spreadRad * Math.sqrt(u);
    const ca = Math.cos(a) * r, sa = Math.sin(a) * r;
    const dx = view.fx + view.rx * ca + view.ux * sa;
    const dy = view.fy + view.ry * ca + view.uy * sa;
    const dz = view.fz + view.rz * ca + view.uz * sa;
    const l = Math.hypot(dx, dy, dz);
    aim.dx = dx / l; aim.dy = dy / l; aim.dz = dz / l;
  }
  // The muzzle in city-local space (right/below the eye at the hip, on axis in ADS).
  function muzzlePos() {
    const ads = weapon.adsBlend;
    const fwd = -weapon.muzzleZ;
    const mOff = 0.13 * (1 - ads);
    const mDown = 0.11 * (1 - ads) + 0.05 * ads;
    muzzle.x = view.ex + view.fx * fwd + view.rx * mOff - view.ux * mDown;
    muzzle.y = view.ey + view.fy * fwd + view.ry * mOff - view.uy * mDown;
    muzzle.z = view.ez + view.fz * fwd + view.rz * mOff - view.uz * mDown;
  }

  // Hit feedback is gathered over one trigger pull (nine pellets, a pierce
  // through three bodies) and reported once.
  const fb = { hit: false, crit: false, kill: false };
  // Apply one ray's worth of damage to whatever `hit` holds, at distance t.
  function applyHit(W, power, t, mulExtra) {
    const hx = view.ex + aim.dx * t, hy = view.ey + aim.dy * t, hz = view.ez + aim.dz * t;
    let dmg = W.dmg * power * mulExtra;
    if (t > W.falloffStart) dmg *= W.falloffMul;
    fb.hit = true;
    if (hit.m) {
      const mult = hit.m.A.parts[hit.part][4];
      const crit = mult === CRIT;
      dmg *= crit ? W.crit : mult;
      if (crit) fb.crit = true;
      ichorFx(hx, hy, hz, aim.dx, aim.dy, aim.dz, crit);
      if (hurtMonster(hit.m, dmg, crit, aim.dx, aim.dy, aim.dz, false)) fb.kill = true;
    } else if (hit.f) {
      if (hurtFlyer(hit.f, dmg, aim.dx, aim.dz)) fb.kill = true;
    }
  }

  // One round from the weapon in hand. power 0..1 (the lance's charge).
  function firePlayerShot(spreadRad, power) {
    const W = weapon.def;
    muzzlePos();
    const ox = view.ex, oy = view.ey, oz = view.ez;
    fb.hit = fb.crit = fb.kill = false;

    if (W.ballistic === 'projectile') {
      coneDir(spreadRad);
      const P = W.proj;
      launchShell(muzzle.x, muzzle.y, muzzle.z,
        aim.dx * P.speed, aim.dy * P.speed + 2.2, aim.dz * P.speed, P.gravity, false, W);
      smoke.emit(muzzle.x, muzzle.y, muzzle.z, view.fx, 0.5, view.fz, 0.7, 0.12, 0.9, 0.6, 0.5, 0.6, 0.3, 1.5, -0.3);
      alertNoise();
      return;
    }

    const rays = W.ballistic === 'pellets' ? W.pellets : 1;
    for (let r = 0; r < rays; r++) {
      coneDir(spreadRad + (W.ballistic === 'pellets' ? W.pelletSpread : 0));
      const wt = worldRay(ox, oy, oz, aim.dx, aim.dy, aim.dz, W.range);
      const nx = hitN.x, ny = hitN.y, nz = hitN.z; // the body tests below never touch hitN
      const wallT = wt >= 0 ? wt : W.range;
      let end = wallT;

      if (W.ballistic === 'pierce') {
        // every body on the line, out to the first wall
        for (const m of monsters) {
          if (m.state === 'dead') continue;
          const t = rayMonster(m, ox, oy, oz, aim.dx, aim.dy, aim.dz, wallT);
          if (t < 0) continue;
          hit.m = m; hit.f = null; hit.part = rayPart;
          applyHit(W, power, t, 1);
        }
        for (const f of flyers) {
          if (f.state === 'dead') continue;
          const t = raySphere(ox, oy, oz, aim.dx, aim.dy, aim.dz, f.x, f.y, f.z, SWARMLING.radius + 0.25);
          if (t < 0 || t > wallT) continue;
          hit.f = f; hit.m = null;
          applyHit(W, power, t, 1);
        }
        // the slug's wake: a hot core and a line of fading light
        spawnTracer(muzzle.x, muzzle.y, muzzle.z, ox + aim.dx * end, oy + aim.dy * end, oz + aim.dz * end, false, W);
        const c = TRACER_COLORS.lance;
        for (let d = 2; d < Math.min(end, 110); d += 2.2) {
          glow.emit(ox + aim.dx * d, oy + aim.dy * d - 0.05, oz + aim.dz * d, 0, 0.15, 0,
            0.35 + power * 0.4, 0.16 + 0.14 * power, 0.02, c.r, c.g, c.b, 0.9, 0, 0);
        }
        if (wt >= 0) impactFx(ox + aim.dx * end, oy + aim.dy * end, oz + aim.dz * end, nx, ny, nz, ny > 0.9);
        addShake(0.25 * power, player.x, player.z);
        continue;
      }

      const bt = rayBodies(ox, oy, oz, aim.dx, aim.dy, aim.dz, wallT, null);
      if (bt >= 0) end = bt;
      const hx = ox + aim.dx * end, hy = oy + aim.dy * end, hz = oz + aim.dz * end;

      if (W.ballistic === 'chain') {
        addBolt(muzzle.x, muzzle.y, muzzle.z, hx, hy, hz, 0.05);
        if (bt >= 0) {
          applyHit(W, power, bt, 1);
          // jump on: nearest other living thing within reach, a few times over
          let from = hit.m ?? hit.f;
          let fx = hx, fy = hy, fz = hz, fall = W.chain.falloff;
          const done = [from];
          for (let h = 0; h < W.chain.hops; h++) {
            let best = null, bestD = W.chain.range, bx = 0, by = 0, bz = 0, isF = false;
            for (const m of monsters) {
              if (m.state === 'dead' || done.includes(m)) continue;
              const c = coreOf(m);
              const d = Math.hypot(c.x - fx, c.y - fy, c.z - fz) - c.r;
              if (d < bestD) { bestD = d; best = m; bx = c.x; by = c.y; bz = c.z; isF = false; }
            }
            for (const f of flyers) {
              if (f.state === 'dead' || done.includes(f)) continue;
              const d = Math.hypot(f.x - fx, f.y - fy, f.z - fz);
              if (d < bestD) { bestD = d; best = f; bx = f.x; by = f.y; bz = f.z; isF = true; }
            }
            if (!best) break;
            addBolt(fx, fy, fz, bx, by, bz, 0.04);
            if (isF) { if (hurtFlyer(best, W.dmg * fall, bx - fx, bz - fz)) fb.kill = true; }
            else if (hurtMonster(best, W.dmg * fall, false, bx - fx, 0, bz - fz, false)) fb.kill = true;
            done.push(best);
            fx = bx; fy = by; fz = bz;
            fall *= W.chain.falloff;
          }
        } else if (wt >= 0) {
          glow.emit(hx, hy, hz, nx * 2, ny * 2 + 1, nz * 2, 0.2, 0.2, 0.03, 2, 1.6, 3, 1, 2, 6);
        }
        continue;
      }

      // hitscan and pellets
      spawnTracer(muzzle.x, muzzle.y, muzzle.z, hx, hy, hz, false, W);
      if (bt >= 0) applyHit(W, power, bt, 1);
      else if (wt >= 0) impactFx(hx, hy, hz, nx, ny, nz, ny > 0.9);
    }

    // muzzle smoke wisp
    smoke.emit(muzzle.x, muzzle.y, muzzle.z, view.fx * 0.6, 0.4, view.fz * 0.6, 0.5, 0.05, 0.4, 0.7, 0.7, 0.7, 0.18, 1.5, -0.4);
    alertNoise();
    if (fb.hit) {
      hud.hitmarker(fb.kill ? 'kill' : fb.crit ? 'head' : 'hit');
      sfx.playHit(fb.kill, fb.crit);
    }
  }

  // ---- ambient fires ------------------------------------------------------------
  function updateFires(dt) {
    for (const f of fires) {
      f.acc += dt;
      while (f.acc > 0.09) {
        f.acc -= 0.09;
        glow.emit(f.x + (rng() - 0.5) * 1.6, f.y + 1.1, f.z + (rng() - 0.5) * 0.8,
          (rng() - 0.5) * 0.6, 1.8 + rng() * 1.5, (rng() - 0.5) * 0.6,
          0.5 + rng() * 0.5, 0.45, 0.1, 2.4, 1.0, 0.25, 0.9, 0.8, -0.5);
      }
      f.smokeAcc += dt;
      while (f.smokeAcc > 0.22) {
        f.smokeAcc -= 0.22;
        smoke.emit(f.x + (rng() - 0.5), f.y + 1.6, f.z + (rng() - 0.5),
          0.6 + (rng() - 0.5) * 0.4, 2.2 + rng(), (rng() - 0.5) * 0.4,
          6 + rng() * 3, 1.2, 7, 0.09, 0.085, 0.08, 0.55, 0.15, -0.05);
      }
    }
  }

  // Touch aim assist: a gentle pull toward the nearest visible monster whose
  // centre sits inside a small cone around the crosshair. Never snaps; the
  // pull fades to nothing at the cone's edge, so the thumb stays in charge.
  const ASSIST_CONE = 0.14; // radians (~8 degrees)
  function aimAssist(dt) {
    let bestErr = ASSIST_CONE, found = false;
    let bYaw = 0, bPitch = 0;
    const consider = (x, y, z) => {
      const tx = x - view.ex, ty = y - view.ey, tz = z - view.ez;
      const d = Math.hypot(tx, ty, tz);
      if (d < 1 || d > 110) return;
      const fwd = (tx * view.fx + ty * view.fy + tz * view.fz) / d;
      if (fwd <= 0) return;
      const yawE = Math.atan2((tx * view.rx + ty * view.ry + tz * view.rz) / d, fwd);
      const pitchE = Math.atan2((tx * view.ux + ty * view.uy + tz * view.uz) / d, fwd);
      const err = Math.hypot(yawE, pitchE);
      if (err < bestErr) { bestErr = err; found = true; bYaw = yawE; bPitch = pitchE; }
    };
    for (const m of monsters) {
      if (m.state === 'dead' || !m.los) continue;
      const c = coreOf(m);
      consider(c.x, c.y, c.z);
    }
    for (const f of flyers) if (f.state !== 'dead') consider(f.x, f.y, f.z);
    if (!found) return;
    const k = Math.min(1, dt * 6) * 0.55 * (1 - bestErr / ASSIST_CONE);
    // walk.js turns the heading LEFT for a positive yaw kick.
    out.yawKick -= bYaw * k;
    out.pitchKick += bPitch * k;
  }

  // ===========================================================================
  // Frame update
  // ===========================================================================
  // env: { feet, eye, aim, right, up (city-local Vector3s), speed01, sprinting,
  //        airborne, holstered, dialogue, fire, ads, reload, lookDX, lookDY,
  //        inBuilding, switchSlot (1-5 or 0), cycle (-1/0/+1) }
  let lastHint = null;
  let stripKey = '';
  function update(dt, t, env) {
    out.pitchKick = 0;
    out.yawKick = 0;
    out.respawn = false;
    dt = Math.min(dt, 0.1);

    if (dt > 0) {
      const k = Math.min(1, dt * 6);
      player.vx += ((env.feet.x - player.x) / dt - player.vx) * k;
      player.vz += ((env.feet.z - player.z) / dt - player.vz) * k;
      // a respawn teleports the feet: don't read that as a sprint
      if (Math.hypot(player.vx, player.vz) > 40) { player.vx = 0; player.vz = 0; }
    }
    player.x = env.feet.x; player.y = env.feet.y; player.z = env.feet.z;
    player.airborne = env.airborne;
    view.ex = env.eye.x; view.ey = env.eye.y; view.ez = env.eye.z;
    view.fx = env.aim.x; view.fy = env.aim.y; view.fz = env.aim.z;
    view.rx = env.right.x; view.ry = env.right.y; view.rz = env.right.z;
    view.ux = env.up.x; view.uy = env.up.y; view.uz = env.up.z;
    view.speed01 = env.speed01;

    const ceasefire = env.dialogue;
    passive = ceasefire || player.dead;
    trauma = Math.max(0, trauma - dt * 1.6);

    // --- player life ---
    player.invuln = Math.max(0, player.invuln - dt);
    if (player.dead) {
      player.deadT += dt;
      const left = Math.max(0, Math.ceil(Z.DEAD_TIME - player.deadT));
      hud.setDead(true, `REDEPLOYING AT THE LANDING PAD IN ${left}`);
      if (player.deadT >= Z.DEAD_TIME) {
        player.dead = false;
        player.hp = Z.PLAYER_HP;
        player.invuln = Z.INVULN;
        player.sinceHit = 99;
        weapon.refill();
        hud.setDead(false);
        out.respawn = true;
        // Clear anything camping the pad.
        const pad = city.padLocal;
        for (const m of monsters) {
          if (m.state === 'dead') continue;
          if (Math.hypot(m.x - pad.x, m.z - pad.z) < 55) {
            const sp = chooseSpawn(0, 0);
            m.x = sp.x; m.z = sp.z; m.y = gy(sp.x, sp.z);
            m.air = 0;
            setState(m, 'approach');
          }
        }
        for (const p of patches) p.life = Math.min(p.life, 0.01);
      }
    } else {
      player.sinceHit += dt;
      if (player.sinceHit > Z.REGEN_DELAY && player.hp < Z.PLAYER_HP) {
        player.hp = Math.min(Z.PLAYER_HP, player.hp + Z.REGEN_RATE * dt);
      }
    }

    // --- pad resupply ---
    const pad = city.padLocal;
    if (!player.dead && Math.hypot(player.x - pad.x, player.z - pad.z) < Z.PAD_RESUPPLY && weapon.resupply()) {
      sfx.playPickup();
      hud.popScore('RESUPPLIED');
    }

    // --- weapon ---
    // Muzzle-to-wall distance for the retract pose.
    const wd = worldRay(view.ex, view.ey, view.ez, view.fx, view.fy, view.fz, 1.6);
    const slot = env.switchSlot | 0;
    const w = weapon.update(dt, {
      fire: env.fire && !player.dead && !ceasefire,
      ads: env.ads && !player.dead,
      reload: env.reload,
      sprinting: env.sprinting,
      move01: env.speed01,
      airborne: env.airborne,
      holstered: env.holstered || player.dead,
      blocked: ceasefire,
      lookDX: env.lookDX,
      lookDY: env.lookDY,
      wallDist: wd >= 0 ? wd : 9,
      switchTo: !ceasefire && slot >= 1 && slot <= WEAPON_ORDER.length ? WEAPON_ORDER[slot - 1] : null,
      cycle: ceasefire ? 0 : env.cycle | 0,
    });
    if (w.shots > 0) {
      const sp = weapon.spread(env.speed01, env.airborne);
      for (let i = 0; i < w.shots; i++) firePlayerShot(sp, w.power);
    }
    out.pitchKick += w.pitchKick;
    out.yawKick += w.yawKick;
    if (env.assist && !player.dead && !ceasefire && (env.fire || env.ads)) aimAssist(dt);

    // --- waves ---
    if (wave.phase === 'grace' || wave.phase === 'lull') {
      wave.t -= dt;
      if (wave.phase === 'grace' && wave.t > 0 && wave.t < Z.GRACE - 0.5 && !wave.greeted) {
        wave.greeted = true;
        hud.showBanner(def.name.toUpperCase(), 'SOMETHING IS COMING OVER THE WALL', 4);
      }
      if (wave.t <= 0) startWave();
    } else if (wave.phase === 'wave') {
      wave.spawnT -= dt;
      if (wave.spawned < wave.queue.length && aliveCount() < wave.maxAlive && wave.spawnT <= 0) {
        const type = wave.queue[wave.spawned];
        let sp;
        if (type === 'titan') {
          // through the gate: the only gap it fits
          sp = { x: Math.cos(gateAng) * (radius - 10), z: Math.sin(gateAng) * (radius - 10) };
          if (Math.hypot(sp.x - player.x, sp.z - player.z) < 45) {
            sp = { x: -sp.x, z: -sp.z };
          }
        } else {
          const fl = Math.hypot(view.fx, view.fz) || 1;
          sp = chooseSpawn(view.fx / fl, view.fz / fl);
        }
        if (type === 'swarm') spawnSwarm(sp.x, sp.z);
        else spawnMonster(type, sp.x, sp.z);
        wave.spawned++;
        wave.spawnT = Z.SPAWN_GAP;
      }
      if (wave.spawned >= wave.queue.length && aliveCount() === 0) {
        wave.phase = 'lull';
        wave.t = Z.LULL;
        player.score += 250 * wave.n;
        hud.showBanner('THE WALL HOLDS', `+${250 * wave.n} · NEXT WAVE IN ${Z.LULL}s`, 4);
      }
    }

    // --- monsters ---
    for (const m of monsters) updateMonster(m, dt, t);
    for (let i = monsters.length - 1; i >= 0; i--) {
      const m = monsters[i];
      if (m.state === 'dead' && m.deadT > Z.CORPSE_TIME + (m.boss ? 8 : 4)) removeMonster(i);
    }
    updateFlyers(dt, t);
    updateShells(dt);
    updatePatches(dt);
    updateBolts(dt);

    updatePickups(dt, t);
    updateCrates(t);
    updateFires(dt);
    glow.update(dt);
    smoke.update(dt);
    updateTracers(dt);

    // --- HUD ---
    const W = weapon.def;
    const remaining = wave.phase === 'wave' ? aliveCount() + (wave.queue.length - wave.spawned) : 0;
    const lullTxt = wave.phase === 'lull' || wave.phase === 'grace'
      ? ` · NEXT WAVE ${Math.max(0, Math.ceil(wave.t))}s` : '';
    hud.setStats(
      `WAVE ${Math.max(wave.n, 1)} · <span class="hostile">HOSTILES ${remaining}</span>` +
      ` · KILLS ${player.kills} · SCORE ${player.score}${lullTxt}`
    );
    hud.setHealth(player.hp / Z.PLAYER_HP);
    hud.setAmmo(weapon.state.mag, weapon.state.reserve, W.magSize, W.name);
    hud.setCharge(W.mode === 'charge' ? weapon.charge : -1);
    hud.setBoss(wave.boss && wave.boss.state !== 'dead' ? wave.boss.hp / wave.boss.hpMax : -1);
    // the weapon strip only changes when a weapon is found or drawn
    const key = W.id + ':' + weapon.owned.size;
    if (key !== stripKey) {
      stripKey = key;
      hud.setWeapons(WEAPON_ORDER.map((id) => ({
        slot: WEAPONS[id].slot, name: WEAPONS[id].name, owned: weapon.owned.has(id), active: id === W.id,
      })));
    }
    let hint = null;
    if (env.holstered && !player.dead) hint = 'WEAPON STOWED';
    else if (weapon.reloading) hint = 'RELOADING';
    else if (weapon.state.mag === 0 && weapon.state.reserve === 0) hint = 'NO AMMO — SWITCH, GRAB DROPS OR RETURN TO THE PAD';
    else if (weapon.state.mag <= Math.floor(W.magSize * 0.27)) hint = 'R — RELOAD';
    else if (ceasefire) hint = 'CEASEFIRE';
    else if (W.mode === 'charge' && weapon.charge <= 0) hint = 'HOLD TO CHARGE';
    if (hint !== lastHint) { hud.setHint(hint); lastHint = hint; }
    const fovRad = (env.fov * Math.PI) / 180;
    const cone = weapon.spread(env.speed01, env.airborne) + (W.ballistic === 'pellets' ? W.pelletSpread : 0);
    const spreadPx = (Math.tan(cone) / Math.tan(fovRad / 2)) * (window.innerHeight / 2);
    hud.setCrosshair(spreadPx, weapon.adsBlend < 0.5 && weapon.state.sprint < 0.4 && !env.holstered && !player.dead);
    hud.update(dt);

    // particle size scale: framebuffer pixels per unit at depth 1
    const scale = (window.innerHeight * Math.min(window.devicePixelRatio, 2)) / (2 * Math.tan(fovRad / 2));
    glow.mat.uniforms.uScale.value = scale;
    smoke.mat.uniforms.uScale.value = scale;

    return out;
  }

  // The FP camera FOV with the sights eased in.
  function fov(base) {
    const a = weapon.adsBlend;
    const e = a * a * (3 - 2 * a);
    return base + (weapon.def.adsFov - base) * e;
  }

  function syncCamera(camera, t) {
    weapon.sync(camera, t);
  }
  function setViewLight(sunDir, day) {
    weapon.setLight(sunDir, day, scene?.environment ?? null);
  }
  function renderViewmodel(renderer) {
    weapon.render(renderer);
  }

  // Walk speed multiplier: combat pace, slower in sights, no sprinting while
  // firing or reloading.
  function moveScale(sprinting) {
    const ads = weapon.adsBlend;
    return (sprinting ? 0.82 : 0.8) * (1 - 0.45 * ads);
  }
  function sprintAllowed(firing) {
    return !firing && !weapon.reloading && weapon.adsBlend < 0.2;
  }

  function lookScale() { return 1 - 0.35 * weapon.adsBlend; }

  function setHudVisible(on) { hud.setVisible(on); }

  function dispose() {
    flushRecord(); // best wave + lifetime kills, for the lounge wall
    for (let i = monsters.length - 1; i >= 0; i--) removeMonster(i);
    flyers.length = 0;
    for (const p of pickups) group.remove(p.mesh);
    pickups.length = 0;
    for (const c of gunCrates) { c.bandMat.dispose(); c.beamMat.dispose(); }
    gunCrates.length = 0;
    // Pull our cover colliders back off the city.
    for (const st of coverStructs) {
      const i = city.structures.indexOf(st);
      if (i >= 0) city.structures.splice(i, 1);
    }
    city.group.remove(group);
    group.clear();
    for (const g of ownedGeos) g.dispose();
    for (const m of ownedMats) m.dispose();
    for (const tx of ownedTex) tx.dispose();
    tracers.dispose();
    holes.dispose();
    shellMesh.dispose();
    patchMesh.dispose();
    boltMesh.dispose();
    swarmMesh.dispose();
    kit.dispose();
    weapon.dispose();
    hud.dispose();
    sfx.disposeAudio();
  }

  return {
    group,
    update,
    fov,
    syncCamera,
    setViewLight,
    renderViewmodel,
    moveScale,
    sprintAllowed,
    lookScale,
    setHudVisible,
    dispose,
    // 0..1 camera trauma for walk.js's first-person shake.
    shake() { return trauma; },
    get playerDead() { return player.dead; },
    // Headless verification (walkSite().warzone.debug()).
    debug() {
      return {
        wave: wave.n, phase: wave.phase, waveT: wave.t, alive: aliveCount(),
        queue: wave.queue.slice(wave.spawned),
        enemies: monsters.map((m) => ({
          type: m.type, x: m.x, z: m.z, y: m.y, air: m.air, state: m.state, attack: m.attack,
          hp: m.hp, hpMax: m.hpMax, los: m.los, radius: m.A.radius,
        })),
        flyers: flyers.map((f) => ({ x: f.x, y: f.y, z: f.z, state: f.state, hp: f.hp })),
        shells: shells.filter((s) => s.on).length,
        patches: patches.filter((p) => p.on).map((p) => ({ x: p.x, z: p.z, r: p.r, hostile: p.hostile })),
        crates: gunCrates.map((c) => ({ x: c.x, z: c.z, id: c.id })),
        hp: player.hp, dead: player.dead, kills: player.kills, score: player.score, trauma,
        mag: weapon.state.mag, reserve: weapon.state.reserve, cover: coverPieces.length,
        ring: { r: ringR, half: ringHalf, gate: gateAng },
        colliders: keepOut.map((c) => ({ x: c.x, z: c.z, radius: c.radius })),
        weapon: { id: weapon.def.id, owned: [...weapon.owned], charge: weapon.charge,
          holster: weapon.state.holster, ads: weapon.state.ads, sprint: weapon.state.sprint,
          retract: weapon.state.retract, reloading: weapon.state.reloading },
        player: { x: player.x, y: player.y, z: player.z },
        aim: { x: view.fx, y: view.fy, z: view.fz },
      };
    },
    // Test hooks.
    forceWave() { if (wave.phase !== 'wave') { wave.t = 0; } },
    forceBoss() { wave.n = 4; wave.phase = 'lull'; wave.t = 0; },
    spawn(type, x, z) { return type === 'swarm' ? spawnSwarm(x, z) : spawnMonster(type, x, z); },
    giveWeapon(id) { weapon.grant(id); },
    switchWeapon(id) { return weapon.switchTo(id); },
    clear() { for (const m of monsters) m.hp = 0, hurtMonster(m, 1, false, 0, 0, 1, true); for (const f of flyers) hurtFlyer(f, 999, 0, 1); },
  };
}
