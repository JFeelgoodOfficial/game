// Warzone — the city worlds as an always-on first-person combat zone.
//
// Every stock registry city (Terra's Meridian Crown, Rustia's Redline Claim,
// Neptunia's Indigo Reach, Wyattmattoe's Kite Saddle) is under siege by an
// armed alien raiding force. The story worlds (Shadowreach, Actuality / the
// Comfort Zone) and WaveMall Prime early-return in walk.js long before a city
// is built, so they never reach this module.
//
// The townspeople are civilians: they keep to their homes, the raiders never
// target them, and player rounds pass through them — the governor quests and
// vendor trees keep working mid-firefight. Dialogue is a ceasefire.
//
// What this module owns, all in the CITY-LOCAL flat frame (its group is a
// child of city.group, the frame walk.js's _playerLocal already lives in):
//   - war dressing: sandbag walls, jersey barriers, crate stacks, burnt-out
//     hulks and shipping containers, each a real AABB collider pushed onto
//     city.structures — so walk.js's player collision, rooftop/standing
//     surfaces and third-person boom clamp all pick them up for free — plus
//     scorch marks, rubble and smoke columns over burning wrecks;
//   - raiders: aliens.js rigs in armor with rifles, a small state machine
//     (advance -> take cover -> peek and fire in bursts), a shooter-token
//     director so at most a handful fire at once, hit volumes (head sphere +
//     body capsule) and a fall-and-sink death;
//   - ballistics: hitscan rays against every wall box (city.js makeStructure
//     rayHit), the flat town deck and the raiders, with tracers, sparks, dust,
//     ichor and bullet-hole decals;
//   - waves, player armor (CoD-style regenerating health), death and the
//     redeploy at the landing pad, ammo drops and pad resupply;
//   - the viewmodel rifle (warzone-weapon.js), the HUD (warzone-hud.js) and the
//     synthesized audio (warzone-audio.js).
//
// Contract with walk.js: update() takes the player's local eye/aim basis and
// returns aim kicks (recoil, flinch) and a respawn flag; walk.js applies them,
// because walk.js owns the walker. Nothing here touches walk/ship state.

import * as THREE from 'three';
import { makeStructure } from './city.js';
import { buildRig, poseRig } from './aliens.js';
import { createWeapon, mergeList, RIFLE } from './warzone-weapon.js';
import { createWarzoneHud } from './warzone-hud.js';
import * as sfx from './warzone-audio.js';

// The worlds whose registry city is a warzone. Kept explicit (not "any world
// with a city") so a future peaceful town is opt-out by default.
export const WARZONE_WORLDS = new Set(['terra', 'rustia', 'neptunia', 'wyattmattoe']);

const Z = {
  GRACE: 7, // seconds after landfall before the first wave moves
  LULL: 35, // breather between waves
  SPAWN_GAP: 2.2,
  SPAWN_MIN_DIST: 42,

  ENEMY_HP: 100,
  BODY_DMG: 34,
  HEAD_DMG: 110,
  FALLOFF_START: 60,
  ENEMY_RADIUS: 0.45,
  ADVANCE_SPEED: 4.6,
  COMBAT_SPEED: 4.0,
  SIGHT_RANGE: 95,
  HEAR_RANGE: 70,
  BURST_GAP: 0.12,
  ENEMY_DMG: 8,
  CORPSE_TIME: 7,

  PLAYER_HP: 100,
  REGEN_DELAY: 4.5,
  REGEN_RATE: 32,
  DEAD_TIME: 4,
  INVULN: 3,
  PAD_RESUPPLY: 15,

  PICKUP_AMMO: 45,
  PICKUP_LIFE: 45,
  PICKUP_REACH: 1.9,

  RANGE: 300,
  TRACER_SPEED: 320,
  ENEMY_TRACER_SPEED: 140,
};

// Per-world raider trim, so each siege reads as a different faction.
const FACTION = {
  terra: { trim: 0xff3b2f, bolt: 0xff4a3a, name: 'CRIMSON HOST' },
  rustia: { trim: 0xff8a1f, bolt: 0xffa040, name: 'DUSTJAW RAIDERS' },
  neptunia: { trim: 0x3df0ff, bolt: 0x60f4ff, name: 'TRENCH SWARM' },
  wyattmattoe: { trim: 0xc46bff, bolt: 0xd18cff, name: 'WHITEOUT CELL' },
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
  const faction = FACTION[def.world] ?? FACTION.terra;
  const radius = def.radius;
  const group = new THREE.Group();
  group.name = 'warzone';
  city.group.add(group);

  const ownedGeos = [];
  const ownedMats = [];
  const ownedTex = [];
  const own = (m) => { ownedMats.push(m); return m; };

  const deckY = city.groundLocalYAt(0, 0); // the levelled town disc is one height

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
    g.translate(x, deckY + s * 0.3, z);
    bin('rubble', g);
  }

  for (const [key, arr] of geoBins) {
    const merged = mergeList(arr);
    for (const g of arr) g.dispose();
    ownedGeos.push(merged);
    const mesh = new THREE.Mesh(merged, M[key]);
    group.add(mesh);
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
      g.translate(x, deckY + 0.03, z);
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
  const fires = wrecks.slice(0, 4).map((w, i) => ({ x: w.x, z: w.z, acc: 0, smokeAcc: i * 0.1 }));

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
  const ENEMY_TRACER = new THREE.Color(faction.bolt).multiplyScalar(3.5);
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

  function spawnTracer(sx, sy, sz, ex, ey, ez, enemy) {
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
    t.speed = enemy ? Z.ENEMY_TRACER_SPEED : Z.TRACER_SPEED;
    t.w = enemy ? 0.06 : 0.022;
    t.seg = enemy ? 2.2 : 3.5;
    tracers.setColorAt(i, enemy ? ENEMY_TRACER : PLAYER_TRACER);
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

  const ICHOR = new THREE.Color(faction.trim);
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
  // Raiders
  // =========================================================================
  const enemyGeo = {
    receiver: new THREE.BoxGeometry(0.09, 0.12, 0.5),
    barrel: new THREE.CylinderGeometry(0.025, 0.03, 0.42, 8).rotateX(Math.PI / 2),
    cell: new THREE.BoxGeometry(0.07, 0.16, 0.12),
    coil: new THREE.TorusGeometry(0.05, 0.012, 6, 12),
    helmet: new THREE.SphereGeometry(1, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55),
    visor: new THREE.BoxGeometry(1, 1, 1),
    plate: new THREE.BoxGeometry(1, 1, 1),
    pack: new THREE.BoxGeometry(1, 1, 1),
    pad: new THREE.SphereGeometry(1, 8, 6),
  };
  for (const k in enemyGeo) ownedGeos.push(enemyGeo[k]);
  const trim = new THREE.Color(faction.trim);
  const enemyMat = {
    gun: own(new THREE.MeshStandardMaterial({ color: 0x1b1d20, roughness: 0.45, metalness: 0.8 })),
    coil: own(new THREE.MeshStandardMaterial({ color: 0x111111, emissive: trim, emissiveIntensity: 2.2 })),
    armor: own(new THREE.MeshStandardMaterial({ color: 0x2a2e33, roughness: 0.5, metalness: 0.6 })),
    visor: own(new THREE.MeshStandardMaterial({ color: 0x050505, emissive: trim, emissiveIntensity: 2.6, roughness: 0.2 })),
  };
  const flashTex = canvasTex(64, (g, s) => {
    const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.35, 'rgba(255,255,255,0.5)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, s, s);
  });
  ownedTex.push(flashTex);
  const enemyFlashMat = own(new THREE.SpriteMaterial({
    map: flashTex, color: new THREE.Color(faction.bolt).multiplyScalar(4),
    blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
  }));

  const enemies = [];
  let enemySeed = 0;

  function dressRig(rig) {
    const s = rig.params.scaleY;
    // Hostile livery: dark armor-cloth with faction trim, burning eyes.
    rig.materials.clothMat.color.setHex(0x23272b);
    rig.materials.clothMat.emissive.copy(trim);
    rig.materials.clothMat.emissiveIntensity = 0.18;
    rig.materials.eyeMat.emissive.copy(trim);
    rig.materials.eyeMat.emissiveIntensity = 3.2;
    const j = rig.joints;
    // helmet + visor
    const helm = new THREE.Mesh(enemyGeo.helmet, enemyMat.armor);
    helm.scale.setScalar(0.2 * s);
    helm.position.y = 0.17 * s;
    j.head.add(helm);
    const visor = new THREE.Mesh(enemyGeo.visor, enemyMat.visor);
    visor.scale.set(0.24 * s, 0.05 * s, 0.05 * s);
    visor.position.set(0, 0.18 * s, 0.15 * s);
    j.head.add(visor);
    // chest plate + backpack
    const plate = new THREE.Mesh(enemyGeo.plate, enemyMat.armor);
    plate.scale.set(0.46 * s, 0.4 * s, 0.14 * s);
    plate.position.set(0, 0.32 * s, 0.14 * s);
    j.torso.add(plate);
    const pack = new THREE.Mesh(enemyGeo.pack, enemyMat.armor);
    pack.scale.set(0.38 * s, 0.42 * s, 0.2 * s);
    pack.position.set(0, 0.32 * s, -0.24 * s);
    j.torso.add(pack);
    for (const side of [-1, 1]) {
      const pad = new THREE.Mesh(enemyGeo.pad, enemyMat.armor);
      pad.scale.set(0.11 * s, 0.07 * s, 0.11 * s);
      pad.position.set(side * 0.29 * s, 0.03 * s, 0);
      j.shoulders.add(pad);
    }
    // rifle, held at the chest, pointing +Z
    const gun = new THREE.Group();
    gun.position.set(0.06 * s, -0.08 * s, 0.32 * s);
    const rec = new THREE.Mesh(enemyGeo.receiver, enemyMat.gun);
    gun.add(rec);
    const bar = new THREE.Mesh(enemyGeo.barrel, enemyMat.gun);
    bar.position.set(0, 0.02, 0.44);
    gun.add(bar);
    const cell = new THREE.Mesh(enemyGeo.cell, enemyMat.coil);
    cell.position.set(0, -0.12, 0.05);
    gun.add(cell);
    for (let i = 0; i < 2; i++) {
      const c = new THREE.Mesh(enemyGeo.coil, enemyMat.coil);
      c.position.set(0, 0.02, 0.3 + i * 0.12);
      gun.add(c);
    }
    const fl = new THREE.Sprite(enemyFlashMat);
    fl.position.set(0, 0.02, 0.7);
    fl.scale.setScalar(0.55);
    fl.visible = false;
    gun.add(fl);
    j.shoulders.add(gun);
    return { gun, flash: fl };
  }

  function spawnEnemy(x, z) {
    const seed = (def.seed + 0x9e37 * ++enemySeed) >>> 0;
    const rig = buildRig(seed, `warzone:${def.id}`);
    const kit = dressRig(rig);
    const holder = new THREE.Group();
    holder.add(rig.group);
    group.add(holder);
    const s = rig.params.scaleY;
    const e = {
      rig, holder, kit, s,
      x, z, y: city.groundLocalYAt(x, z),
      yaw: Math.atan2(-x, -z), // face town centre
      hp: Z.ENEMY_HP,
      state: 'advance', // advance | combat | dead
      tx: 0, tz: 0, // movement target
      anchor: null, // claimed cover anchor
      repathT: 0,
      perceiveT: rng() * 0.2,
      los: false,
      seeT: 0,
      blindT: 0,
      reaction: 0.45 + rng() * 0.4,
      burst: 0,
      burstT: 0,
      fireCd: 1 + rng(),
      token: false,
      crouch: 0,
      flinch: 0,
      hitFlash: 0,
      flashT: 0,
      moving: 0,
      stuckT: 0, lx: x, lz: z, detourT: 0,
      deadT: 0, fallDir: 1,
      knowX: 0, knowZ: 0,
      strafe: rng() < 0.5 ? -1 : 1,
    };
    pickAdvanceTarget(e);
    enemies.push(e);
    return e;
  }

  function removeEnemy(i) {
    const e = enemies[i];
    group.remove(e.holder);
    // The rig's own geometry and materials are per-rig; the kit's are shared.
    const kitGeos = new Set(Object.values(enemyGeo));
    e.rig.group.traverse((o) => {
      if (o.geometry && !kitGeos.has(o.geometry)) o.geometry.dispose();
    });
    for (const k in e.rig.materials) e.rig.materials[k].dispose();
    if (e.anchor) e.anchor.claim = null;
    enemies.splice(i, 1);
  }

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
      const tg = (deckY - oy) / dy;
      if (tg >= 0 && tg <= maxT && (best < 0 || tg < best)) {
        // only the levelled disc is a flat deck; beyond it the round-off
        // doesn't matter for bullets that far out
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

  function headY(e) { return e.y + (1.65 + 0.16) * e.s - e.crouch * 0.3 * e.s; }
  function headR(e) { return 0.2 * e.s; }
  function bodyTop(e) { return e.y + 1.55 * e.s - e.crouch * 0.3 * e.s; }
  function bodyBot(e) { return e.y + 0.3 * e.s; }
  function bodyR(e) { return 0.3 * e.s; }
  function eyeY(e) { return headY(e); }

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
  };

  // ---- waves -----------------------------------------------------------------
  const wave = { n: 0, phase: 'grace', t: Z.GRACE, total: 0, spawned: 0, maxAlive: 0, spawnT: 0, greeted: false };

  function aliveCount() {
    let n = 0;
    for (const e of enemies) if (e.state !== 'dead') n++;
    return n;
  }

  // Spawn ring: points just inside the town edge, nudged clear of buildings.
  const spawnRing = [];
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2;
    for (let k = 0; k < 4; k++) {
      const d = radius - 8 - k * 6;
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      let ok = true;
      for (const c of keepOut) if (Math.hypot(x - c.x, z - c.z) < c.radius + 2) { ok = false; break; }
      for (const p of placed) if (Math.hypot(x - p.x, z - p.z) < p.r + 1.5) { ok = false; break; }
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
      let score = -Math.abs(d - 70) * 0.05 - Math.max(0, inView - 0.3) * 4 + rng() * 2;
      // don't stack spawns
      for (const e of enemies) {
        if (e.state !== 'dead' && Math.hypot(e.x - p.x, e.z - p.z) < 6) score -= 3;
      }
      if (score > bestScore) { bestScore = score; best = p; }
    }
    return best ?? spawnRing[Math.floor(rng() * spawnRing.length) % spawnRing.length];
  }

  function startWave() {
    wave.n++;
    wave.phase = 'wave';
    wave.total = Math.min(6 + (wave.n - 1) * 2, 20);
    wave.maxAlive = Math.min(4 + wave.n, 9);
    wave.spawned = 0;
    wave.spawnT = 0;
    hud.showBanner(`WAVE ${wave.n}`, `${faction.name} INBOUND — ${wave.total} HOSTILES`, 3.5);
  }

  // ---- AI --------------------------------------------------------------------
  function pickAdvanceTarget(e) {
    // Converge on the player's rough position with a personal offset.
    const a = rng() * Math.PI * 2;
    const r = 8 + rng() * 14;
    e.tx = player.x + Math.cos(a) * r;
    e.tz = player.z + Math.sin(a) * r;
    clampToTown(e, 'tx', 'tz');
    e.repathT = 3.5 + rng() * 2;
  }

  function clampToTown(o, kx, kz) {
    const d = Math.hypot(o[kx], o[kz]);
    const max = radius - 5;
    if (d > max) { o[kx] *= max / d; o[kz] *= max / d; }
  }

  function pickCombatSpot(e) {
    if (e.anchor) { e.anchor.claim = null; e.anchor = null; }
    let best = null, bestScore = -Infinity;
    for (const c of coverPieces) {
      const cd = Math.hypot(c.x - e.x, c.z - e.z);
      if (cd > 40) continue;
      for (const an of c.anchors) {
        if (an.claim && an.claim !== e) continue;
        const px = player.x - an.x, pz = player.z - an.z;
        const pd = Math.hypot(px, pz);
        if (pd < 9 || pd > 55) continue;
        // Protected when the cover sits between the anchor and the player,
        // i.e. the player lies along -n from the anchor.
        const prot = -(an.nx * px + an.nz * pz) / pd;
        if (prot < 0.45) continue;
        const travel = Math.hypot(an.x - e.x, an.z - e.z);
        const score = prot * 8 - travel * 0.18 - Math.abs(pd - 24) * 0.08 + rng() * 0.6;
        if (score > bestScore) { bestScore = score; best = an; }
      }
    }
    if (best) {
      best.claim = e;
      e.anchor = best;
      e.tx = best.x;
      e.tz = best.z;
    } else {
      // Flank: orbit the player at mid range.
      const a = Math.atan2(e.z - player.z, e.x - player.x) + e.strafe * (0.5 + rng() * 0.5);
      const r = 16 + rng() * 10;
      e.tx = player.x + Math.cos(a) * r;
      e.tz = player.z + Math.sin(a) * r;
      clampToTown(e, 'tx', 'tz');
      e.strafe = -e.strafe;
    }
    e.repathT = 4 + rng() * 3;
  }

  const _pos = { x: 0, y: 0, z: 0 };
  function collideEnemy(e) {
    const R = Z.ENEMY_RADIUS;
    for (const c of keepOut) {
      const dx = e.x - c.x, dz = e.z - c.z;
      const rr = c.radius + R;
      const dd = dx * dx + dz * dz;
      if (dd < rr * rr && dd > 1e-6) {
        const d = Math.sqrt(dd);
        e.x = c.x + (dx / d) * rr;
        e.z = c.z + (dz / d) * rr;
      }
    }
    _pos.x = e.x; _pos.y = e.y; _pos.z = e.z;
    for (const st of coverStructs) st.resolveWalls(_pos, R);
    e.x = _pos.x; e.z = _pos.z;
    for (const o of enemies) {
      if (o === e || o.state === 'dead') continue;
      const dx = e.x - o.x, dz = e.z - o.z;
      const dd = dx * dx + dz * dz;
      if (dd < 1.0 && dd > 1e-6) {
        const d = Math.sqrt(dd);
        e.x += (dx / d) * (1 - d) * 0.5;
        e.z += (dz / d) * (1 - d) * 0.5;
      }
    }
    clampToTown(e, 'x', 'z');
  }

  function moveEnemy(e, speed, dt) {
    let tx = e.tx, tz = e.tz;
    if (e.detourT > 0) { tx = e.dtx; tz = e.dtz; e.detourT -= dt; }
    const dx = tx - e.x, dz = tz - e.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.5) { e.moving = Math.max(0, e.moving - dt * 4); return true; }
    const step = Math.min(speed * dt, d);
    e.x += (dx / d) * step;
    e.z += (dz / d) * step;
    collideEnemy(e);
    e.moving = Math.min(1, e.moving + dt * 4);
    // Stuck on a building: sidestep along the tangent for a moment.
    e.stuckT += dt;
    if (e.stuckT > 1.2) {
      const moved = Math.hypot(e.x - e.lx, e.z - e.lz);
      if (moved < 0.8 && e.detourT <= 0) {
        const px = -dz / d, pz = dx / d;
        e.dtx = e.x + px * 9 * e.strafe;
        e.dtz = e.z + pz * 9 * e.strafe;
        e.detourT = 1.4;
        e.strafe = -e.strafe;
      }
      e.stuckT = 0;
      e.lx = e.x; e.lz = e.z;
    }
    return false;
  }

  let shooters = 0;
  function maxShooters() { return Math.min(2 + Math.floor((wave.n + 1) / 2), 5); }

  function alertAll(x, z, range) {
    for (const e of enemies) {
      if (e.state === 'dead') continue;
      if (Math.hypot(e.x - x, e.z - z) > range) continue;
      e.knowX = player.x; e.knowZ = player.z;
      if (e.state === 'advance') { e.state = 'combat'; e.repathT = 0; }
    }
  }

  // The scratch basis of the player's view, in city-local space (set each update).
  const view = {
    ex: 0, ey: 0, ez: 0, // eye
    fx: 0, fy: 0, fz: -1, // aim
    rx: 1, ry: 0, rz: 0, // right
    ux: 0, uy: 1, uz: 0, // up
  };

  function enemyShoot(e, ceasefire) {
    const s = e.s;
    const sy = Math.sin(e.yaw), cy = Math.cos(e.yaw);
    // muzzle: shoulder height, forward along the rifle
    const mx = e.x + sy * 0.95 * s + cy * 0.06 * s;
    const my = e.y + (1.6 - e.crouch * 0.3) * s - 0.06 * s;
    const mz = e.z + cy * 0.95 * s - sy * 0.06 * s;
    e.flashT = 0.06;
    const cx = player.x, cyy = player.y + 1.25, cz = player.z;
    let dx = cx - mx, dy = cyy - my, dz = cz - mz;
    const dist = Math.hypot(dx, dy, dz);
    dx /= dist; dy /= dist; dz /= dist;

    // audio: pan by where the shot comes from relative to the view
    const tx = mx - view.ex, tz = mz - view.ez;
    const tl = Math.hypot(tx, tz) || 1;
    const pan = (tx * view.rx + tz * view.rz) / tl;
    sfx.playEnemyShot(dist, pan);

    const moving = Math.min(1, view.speed01 * 1.2);
    let p = THREE.MathUtils.clamp(0.52 - dist * 0.0075, 0.07, 0.52);
    p *= 1 - 0.4 * moving;
    p *= 1 + Math.min(wave.n - 1, 6) * 0.04;
    if (player.invuln > 0 || ceasefire) p = 0;

    if (rng() < p) {
      spawnTracer(mx, my, mz, cx, cyy, cz, true);
      damagePlayer(Math.min(Z.ENEMY_DMG + (wave.n - 1) * 0.5, 12), mx, mz);
      return;
    }
    // Miss: scatter around the player, continue into the world.
    const off = 0.7 + rng() * 1.6;
    const a = rng() * Math.PI * 2;
    // perpendicular basis to the shot
    let px = -dz, pz = dx;
    const pl = Math.hypot(px, pz) || 1;
    px /= pl; pz /= pl;
    const ax = cx + px * Math.cos(a) * off;
    const ay = cyy + Math.sin(a) * off * 0.8;
    const az = cz + pz * Math.cos(a) * off;
    let ddx = ax - mx, ddy = ay - my, ddz = az - mz;
    const dl = Math.hypot(ddx, ddy, ddz);
    ddx /= dl; ddy /= dl; ddz /= dl;
    const t = worldRay(mx, my, mz, ddx, ddy, ddz, 140);
    const end = t >= 0 ? t : 140;
    spawnTracer(mx, my, mz, mx + ddx * end, my + ddy * end, mz + ddz * end, true);
    if (t >= 0) impactFx(mx + ddx * t, my + ddy * t, mz + ddz * t, hitN.x, hitN.y, hitN.z, hitN.y > 0.9);
    // whiz if it passes near the head
    if (dl < end + 2 && off < 1.6) {
      const side = px * view.rx + pz * view.rz;
      sfx.playWhiz(Math.cos(a) * side);
    }
  }

  function updateEnemy(e, dt, t, ceasefire) {
    if (e.state === 'dead') {
      e.deadT += dt;
      const k = Math.min(1, e.deadT / 0.55);
      const ease = k * k * (3 - 2 * k);
      e.rig.group.rotation.x = -e.fallDir * ease * (Math.PI / 2);
      e.rig.group.position.y = ease * 0.22 * e.s;
      if (e.deadT > Z.CORPSE_TIME) {
        e.rig.group.position.y -= (e.deadT - Z.CORPSE_TIME) * 0.5;
      }
      e.holder.position.set(e.x, e.y, e.z);
      return;
    }

    // --- perception (staggered, ~5 Hz) ---
    e.perceiveT -= dt;
    if (e.perceiveT <= 0) {
      e.perceiveT = 0.2;
      const dx = player.x - e.x, dz = player.z - e.z;
      const d = Math.hypot(dx, dz);
      let sees = false;
      if (!player.dead && d < Z.SIGHT_RANGE) {
        const fwdDot = (Math.sin(e.yaw) * dx + Math.cos(e.yaw) * dz) / (d || 1);
        if (e.state === 'combat' || fwdDot > -0.2 || d < 14) {
          sees = clearLine(e.x, eyeY(e), e.z, player.x, player.y + 1.5, player.z);
        }
      }
      if (sees && !e.los) e.seeT = 0;
      e.los = sees;
      if (sees) {
        e.knowX = player.x; e.knowZ = player.z;
        if (e.state === 'advance') {
          e.state = 'combat';
          e.repathT = 0;
          alertAll(e.x, e.z, 30); // callout
        }
      }
    }
    if (e.los) { e.seeT += dt; e.blindT = 0; } else e.blindT += dt;

    // --- movement ---
    e.repathT -= dt;
    let speed = 0;
    if (e.state === 'advance') {
      if (e.repathT <= 0) pickAdvanceTarget(e);
      speed = Z.ADVANCE_SPEED;
    } else {
      // Reposition when the timer runs out, the player has moved off our
      // cover's protected side, or we've lost sight for a while.
      let reconsider = e.repathT <= 0 || e.blindT > 3.5;
      if (e.anchor && !reconsider) {
        const px = player.x - e.anchor.x, pz = player.z - e.anchor.z;
        const pd = Math.hypot(px, pz) || 1;
        if (-(e.anchor.nx * px + e.anchor.nz * pz) / pd < 0.25) reconsider = true;
      }
      if (reconsider && e.burst === 0) pickCombatSpot(e);
      speed = e.burst > 0 ? Z.COMBAT_SPEED * 0.35 : Z.COMBAT_SPEED;
    }
    const arrived = moveEnemy(e, speed, dt);
    e.y = city.groundLocalYAt(e.x, e.z);

    // --- facing: the player when engaged, else the travel direction ---
    let wantYaw = e.yaw;
    if (e.state === 'combat' && (e.los || e.burst > 0)) {
      wantYaw = Math.atan2(player.x - e.x, player.z - e.z);
    } else if (e.moving > 0.2) {
      wantYaw = Math.atan2(e.tx - e.x, e.tz - e.z);
    } else if (e.state === 'combat') {
      wantYaw = Math.atan2(e.knowX - e.x, e.knowZ - e.z);
    }
    let dYaw = wantYaw - e.yaw;
    dYaw = Math.atan2(Math.sin(dYaw), Math.cos(dYaw));
    e.yaw += dYaw * Math.min(1, dt * 8);

    // --- shooting ---
    e.fireCd -= dt;
    if (e.burst > 0) {
      e.burstT -= dt;
      if (!e.los || player.dead || ceasefire) {
        e.burst = 0;
      } else if (e.burstT <= 0) {
        e.burstT = Z.BURST_GAP;
        enemyShoot(e, ceasefire);
        e.burst--;
      }
      if (e.burst === 0) {
        e.fireCd = 0.9 + rng() * 1.0;
        if (e.token) { e.token = false; shooters--; }
      }
    } else if (
      e.state === 'combat' && e.los && e.seeT > e.reaction && e.fireCd <= 0 &&
      !player.dead && !ceasefire && Math.abs(dYaw) < 0.35 && shooters < maxShooters()
    ) {
      e.burst = 3 + Math.floor(rng() * 4);
      e.burstT = 0;
      e.token = true;
      shooters++;
    }

    // --- pose ---
    const atCover = e.anchor && arrived;
    const crouchWant = atCover && e.burst === 0 && e.fireCd > 0.35 ? 1 : 0;
    e.crouch += (crouchWant - e.crouch) * Math.min(1, dt * 6);
    const moving = e.moving > 0.2;
    poseRig(e.rig, dt, t, moving ? 'walk' : 'idle', moving ? 0.9 : 0);
    const j = e.rig.joints;
    // Rifle up: both arms forward to the gun. Overrides poseRig's arm swing.
    j.armR.shoulder.rotation.set(-1.35 - e.flinch * 0.3, 0, 0.15);
    j.armR.elbow.rotation.set(-0.45, 0, 0);
    j.armL.shoulder.rotation.set(-1.45 - e.flinch * 0.3, 0, -0.35);
    j.armL.elbow.rotation.set(-0.2, 0, 0);
    j.torso.rotation.x = -e.flinch * 0.35;
    if (e.crouch > 0.01) {
      const c = e.crouch;
      j.pelvis.position.y = 0.95 * e.s - c * 0.3 * e.s;
      j.legL.hip.rotation.x = THREE.MathUtils.lerp(j.legL.hip.rotation.x, -1.15, c);
      j.legR.hip.rotation.x = THREE.MathUtils.lerp(j.legR.hip.rotation.x, -0.9, c);
      j.legL.knee.rotation.x = THREE.MathUtils.lerp(j.legL.knee.rotation.x, 1.7, c);
      j.legR.knee.rotation.x = THREE.MathUtils.lerp(j.legR.knee.rotation.x, 1.5, c);
    } else {
      j.pelvis.position.y = 0.95 * e.s;
    }
    e.flinch = Math.max(0, e.flinch - dt * 5);
    e.hitFlash = Math.max(0, e.hitFlash - dt * 6);
    e.rig.materials.skinMat.emissive.setRGB(e.hitFlash, e.hitFlash * 0.9, e.hitFlash * 0.8);
    e.flashT = Math.max(0, e.flashT - dt);
    e.kit.flash.visible = e.flashT > 0;

    e.holder.position.set(e.x, e.y, e.z);
    e.holder.rotation.y = e.yaw;
  }

  function killEnemy(e, head, dirX, dirZ) {
    e.state = 'dead';
    e.deadT = 0;
    e.kit.flash.visible = false;
    if (e.token) { e.token = false; shooters--; }
    e.burst = 0;
    if (e.anchor) { e.anchor.claim = null; e.anchor = null; }
    // Fall away from the shot.
    const fwdDot = Math.sin(e.yaw) * dirX + Math.cos(e.yaw) * dirZ;
    e.fallDir = fwdDot < 0 ? 1 : -1; // shot from the front -> fall backward
    e.rig.materials.eyeMat.emissiveIntensity = 0.2;
    player.kills++;
    const pts = head ? 150 : 100;
    player.score += pts;
    hud.popScore(head ? `HEADSHOT  +${pts}` : `+${pts}`);
    if (rng() < 0.65) dropPickup(e.x, e.z);
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
        weapon.state.reserve < RIFLE.reserveMax;
      if (take) {
        const got = weapon.addReserve(Z.PICKUP_AMMO);
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

  // ---- player damage ---------------------------------------------------------
  const out = { pitchKick: 0, yawKick: 0, respawn: false };
  function damagePlayer(dmg, fromX, fromZ) {
    if (player.dead || player.invuln > 0) return;
    player.hp -= dmg;
    player.sinceHit = 0;
    sfx.playHurt();
    // direction arc relative to the view
    const tx = fromX - view.ex, tz = fromZ - view.ez;
    const fl = Math.hypot(view.fx, view.fz) || 1;
    const fx = view.fx / fl, fz = view.fz / fl;
    const ang = Math.atan2(tx * view.rx + tz * view.rz, tx * fx + tz * fz);
    hud.damageFrom(ang);
    // flinch
    out.pitchKick += 0.012 + rng() * 0.01;
    out.yawKick += (rng() - 0.5) * 0.02;
    if (player.hp <= 0) {
      player.hp = 0;
      player.dead = true;
      player.deadT = 0;
      for (const e of enemies) {
        if (e.token) { e.token = false; shooters--; }
        e.burst = 0;
      }
    }
  }

  // ---- weapon, HUD -----------------------------------------------------------
  const weapon = createWeapon();
  const hud = createWarzoneHud(def.name);

  // ---- player shots ------------------------------------------------------------
  function firePlayerShot(spreadRad) {
    // cone sample
    const u = rng(), a = rng() * Math.PI * 2;
    const r = spreadRad * Math.sqrt(u);
    const ca = Math.cos(a) * r, sa = Math.sin(a) * r;
    let dx = view.fx + view.rx * ca + view.ux * sa;
    let dy = view.fy + view.ry * ca + view.uy * sa;
    let dz = view.fz + view.rz * ca + view.uz * sa;
    const l = Math.hypot(dx, dy, dz);
    dx /= l; dy /= l; dz /= l;
    const ox = view.ex, oy = view.ey, oz = view.ez;

    let best = worldRay(ox, oy, oz, dx, dy, dz, Z.RANGE);
    const nx = hitN.x, ny = hitN.y, nz = hitN.z; // the enemy tests below never touch hitN
    let target = null, head = false;
    for (const e of enemies) {
      if (e.state === 'dead') continue;
      const maxT = best >= 0 ? best : Z.RANGE;
      const th = raySphere(ox, oy, oz, dx, dy, dz, e.x, headY(e), e.z, headR(e));
      if (th >= 0 && th < maxT) { best = th; target = e; head = true; continue; }
      const tb = rayCapsuleY(ox, oy, oz, dx, dy, dz, e.x, e.z, bodyBot(e), bodyTop(e), bodyR(e));
      if (tb >= 0 && tb < (best >= 0 ? best : Z.RANGE)) { best = tb; target = e; head = false; }
    }

    // tracer from the muzzle (right/below the eye at the hip, on axis in ADS)
    const ads = weapon.adsBlend;
    const mOff = 0.13 * (1 - ads);
    const mDown = 0.11 * (1 - ads) + 0.05 * ads;
    const mx = ox + view.fx * 0.75 + view.rx * mOff - view.ux * mDown;
    const my = oy + view.fy * 0.75 + view.ry * mOff - view.uy * mDown;
    const mz = oz + view.fz * 0.75 + view.rz * mOff - view.uz * mDown;
    const end = best >= 0 ? best : Z.RANGE;
    const hx = ox + dx * end, hy = oy + dy * end, hz = oz + dz * end;
    spawnTracer(mx, my, mz, hx, hy, hz, false);
    // muzzle smoke wisp
    smoke.emit(mx, my, mz, view.fx * 0.6, 0.4, view.fz * 0.6, 0.5, 0.05, 0.4, 0.7, 0.7, 0.7, 0.18, 1.5, -0.4);

    alertAll(player.x, player.z, Z.HEAR_RANGE);

    if (target) {
      let dmg = head ? Z.HEAD_DMG : Z.BODY_DMG;
      if (end > Z.FALLOFF_START) dmg *= 0.8;
      target.hp -= dmg;
      target.hitFlash = 1;
      target.flinch = 1;
      target.knowX = player.x; target.knowZ = player.z;
      if (target.state === 'advance') target.state = 'combat';
      // break off and reposition after taking fire, sometimes
      if (rng() < 0.4) target.repathT = Math.min(target.repathT, 0.3);
      ichorFx(hx, hy, hz, dx, dy, dz, head);
      if (target.hp <= 0) {
        killEnemy(target, head, dx, dz);
        hud.hitmarker('kill');
        sfx.playHit(true, head);
      } else {
        hud.hitmarker(head ? 'head' : 'hit');
        sfx.playHit(false, head);
      }
    } else if (best >= 0) {
      impactFx(hx, hy, hz, nx, ny, nz, ny > 0.9);
    }
  }

  // ---- ambient fires ------------------------------------------------------------
  function updateFires(dt) {
    for (const f of fires) {
      f.acc += dt;
      while (f.acc > 0.09) {
        f.acc -= 0.09;
        glow.emit(f.x + (rng() - 0.5) * 1.6, deckY + 1.1, f.z + (rng() - 0.5) * 0.8,
          (rng() - 0.5) * 0.6, 1.8 + rng() * 1.5, (rng() - 0.5) * 0.6,
          0.5 + rng() * 0.5, 0.45, 0.1, 2.4, 1.0, 0.25, 0.9, 0.8, -0.5);
      }
      f.smokeAcc += dt;
      while (f.smokeAcc > 0.22) {
        f.smokeAcc -= 0.22;
        smoke.emit(f.x + (rng() - 0.5), deckY + 1.6, f.z + (rng() - 0.5),
          0.6 + (rng() - 0.5) * 0.4, 2.2 + rng(), (rng() - 0.5) * 0.4,
          6 + rng() * 3, 1.2, 7, 0.09, 0.085, 0.08, 0.55, 0.15, -0.05);
      }
    }
  }

  // ===========================================================================
  // Frame update
  // ===========================================================================
  // env: { feet, eye, aim, right, up (city-local Vector3s), speed01, sprinting,
  //        airborne, holstered, dialogue, fire, ads, reload, lookDX, lookDY,
  //        inBuilding }
  let lastHint = null;
  function update(dt, t, env) {
    out.pitchKick = 0;
    out.yawKick = 0;
    out.respawn = false;
    dt = Math.min(dt, 0.1);

    player.x = env.feet.x; player.y = env.feet.y; player.z = env.feet.z;
    view.ex = env.eye.x; view.ey = env.eye.y; view.ez = env.eye.z;
    view.fx = env.aim.x; view.fy = env.aim.y; view.fz = env.aim.z;
    view.rx = env.right.x; view.ry = env.right.y; view.rz = env.right.z;
    view.ux = env.up.x; view.uy = env.up.y; view.uz = env.up.z;
    view.speed01 = env.speed01;

    const ceasefire = env.dialogue;

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
        // Clear anyone camping the pad.
        const pad = city.padLocal;
        for (const e of enemies) {
          if (e.state === 'dead') continue;
          if (Math.hypot(e.x - pad.x, e.z - pad.z) < 40) {
            const sp = chooseSpawn(0, 0);
            e.x = sp.x; e.z = sp.z;
            e.state = 'advance';
            pickAdvanceTarget(e);
          }
        }
      }
    } else {
      player.sinceHit += dt;
      if (player.sinceHit > Z.REGEN_DELAY && player.hp < Z.PLAYER_HP) {
        player.hp = Math.min(Z.PLAYER_HP, player.hp + Z.REGEN_RATE * dt);
      }
    }

    // --- pad resupply ---
    const pad = city.padLocal;
    if (!player.dead && Math.hypot(player.x - pad.x, player.z - pad.z) < Z.PAD_RESUPPLY &&
        weapon.state.reserve < RIFLE.reserveStart) {
      weapon.state.reserve = RIFLE.reserveStart;
      sfx.playPickup();
      hud.popScore('RESUPPLIED');
    }

    // --- weapon ---
    // Muzzle-to-wall distance for the retract pose.
    const wd = worldRay(view.ex, view.ey, view.ez, view.fx, view.fy, view.fz, 1.6);
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
    });
    if (w.shots > 0) {
      const sp = weapon.spread(env.speed01, env.airborne);
      for (let i = 0; i < w.shots; i++) firePlayerShot(sp);
    }
    out.pitchKick += w.pitchKick;
    out.yawKick += w.yawKick;

    // --- waves ---
    if (wave.phase === 'grace' || wave.phase === 'lull') {
      wave.t -= dt;
      if (wave.phase === 'grace' && wave.t > 0 && wave.t < Z.GRACE - 0.5 && !wave.greeted) {
        wave.greeted = true;
        hud.showBanner(def.name.toUpperCase(), 'UNDER SIEGE — HOLD THE TOWN', 4);
      }
      if (wave.t <= 0) startWave();
    } else if (wave.phase === 'wave') {
      wave.spawnT -= dt;
      if (wave.spawned < wave.total && aliveCount() < wave.maxAlive && wave.spawnT <= 0) {
        const fl = Math.hypot(view.fx, view.fz) || 1;
        const sp = chooseSpawn(view.fx / fl, view.fz / fl);
        if (sp) {
          spawnEnemy(sp.x, sp.z);
          wave.spawned++;
        }
        wave.spawnT = Z.SPAWN_GAP;
      }
      if (wave.spawned >= wave.total && aliveCount() === 0) {
        wave.phase = 'lull';
        wave.t = Z.LULL;
        player.score += 250 * wave.n;
        hud.showBanner('SECTOR SECURED', `+${250 * wave.n} · NEXT ASSAULT IN ${Z.LULL}s`, 4);
      }
    }

    // --- enemies ---
    for (const e of enemies) updateEnemy(e, dt, t, ceasefire || player.dead);
    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];
      if (e.state === 'dead' && e.deadT > Z.CORPSE_TIME + 3) removeEnemy(i);
    }
    if (shooters < 0) shooters = 0;

    updatePickups(dt, t);
    updateFires(dt);
    glow.update(dt);
    smoke.update(dt);
    updateTracers(dt);

    // --- HUD ---
    const alive = aliveCount();
    const remaining = wave.phase === 'wave' ? alive + (wave.total - wave.spawned) : 0;
    const lullTxt = wave.phase === 'lull' || wave.phase === 'grace'
      ? ` · NEXT WAVE ${Math.max(0, Math.ceil(wave.t))}s` : '';
    hud.setStats(
      `WAVE ${Math.max(wave.n, 1)} · <span class="hostile">HOSTILES ${remaining}</span>` +
      ` · KILLS ${player.kills} · SCORE ${player.score}${lullTxt}`
    );
    hud.setHealth(player.hp / Z.PLAYER_HP);
    hud.setAmmo(weapon.state.mag, weapon.state.reserve, RIFLE.magSize, RIFLE.name);
    let hint = null;
    if (env.holstered && !player.dead) hint = 'WEAPON STOWED';
    else if (weapon.reloading) hint = 'RELOADING';
    else if (weapon.state.mag === 0 && weapon.state.reserve === 0) hint = 'NO AMMO — GRAB DROPS OR RETURN TO THE PAD';
    else if (weapon.state.mag <= 8) hint = 'R — RELOAD';
    else if (ceasefire) hint = 'CEASEFIRE';
    if (hint !== lastHint) { hud.setHint(hint); lastHint = hint; }
    const fovRad = (env.fov * Math.PI) / 180;
    const spreadPx = (Math.tan(weapon.spread(env.speed01, env.airborne)) / Math.tan(fovRad / 2)) *
      (window.innerHeight / 2);
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
    return base + (RIFLE.adsFov - base) * e;
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
    return (sprinting ? 0.7 : 0.78) * (1 - 0.45 * ads);
  }
  function sprintAllowed(firing) {
    return !firing && !weapon.reloading && weapon.adsBlend < 0.2;
  }

  function lookScale() { return 1 - 0.35 * weapon.adsBlend; }

  function setHudVisible(on) { hud.setVisible(on); }

  function dispose() {
    for (let i = enemies.length - 1; i >= 0; i--) removeEnemy(i);
    for (const p of pickups) group.remove(p.mesh);
    pickups.length = 0;
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
    get playerDead() { return player.dead; },
    // Headless verification (walkSite().warzone.debug()).
    debug() {
      return {
        wave: wave.n, phase: wave.phase, waveT: wave.t, alive: aliveCount(),
        enemies: enemies.map((e) => ({ x: e.x, z: e.z, y: e.y, state: e.state, hp: e.hp, los: e.los })),
        hp: player.hp, dead: player.dead, kills: player.kills, score: player.score,
        mag: weapon.state.mag, reserve: weapon.state.reserve, cover: coverPieces.length,
        weapon: { holster: weapon.state.holster, ads: weapon.state.ads, sprint: weapon.state.sprint,
          retract: weapon.state.retract, reloading: weapon.state.reloading },
        player: { x: player.x, y: player.y, z: player.z },
      };
    },
    // Test hook: skip the grace period.
    forceWave() { if (wave.phase !== 'wave') { wave.t = 0; } },
  };
}
