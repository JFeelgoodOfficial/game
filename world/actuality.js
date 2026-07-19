/**
 * actuality.js
 *
 * Bespoke total-conversion world for the planet "actuality" — a hub-and-spoke
 * narrative space adapting "The Discourses of the Actuality" (the second half
 * of *Comfort Zone*, Chapters 1-10). A warm café hub where an NPC ("She")
 * teaches a ten-digit cipher; nine themed zones, one per digit, that the player
 * walks into; and a hidden hyper-holo-grid mirror room unlocked once all nine
 * are seen.
 *
 * This module fully replaces the stock city/crowd/wonders/creatures for this
 * world — walk.js dispatches to it on `planet.cfg.name === 'actuality'` and
 * leaves those handles null. It exposes the same host contract wavemallprime.js
 * does (group, update, dispose, resolveCollisions, groundRadiusAt,
 * nearestInteractable, interact, endInteract) plus a few actuality-only hooks
 * (anchor, initAudio, consumeTeleport, onOutcome, preRender, debug).
 *
 * Coordinate assumptions (same as wavemallprime.js / the engine):
 * - Meters. Astronaut 1.9 tall, eye 2.0. Content lives in planet.surface's
 *   UNROTATED local frame so planet spin + floating-origin rebasing carry it.
 * - Local Y is radial up; quaternion.setFromUnitVectors(yAxis, dir) orients a
 *   tangent frame, then a yaw about Y faces it.
 * - The root `group` sits at identity under planet.surface. `anchor` is a child
 *   Group carrying the landing-point tangent transform — the player is resolved
 *   into anchor-local space (walk.js playerLocalInto), so hub content and every
 *   interactable position live in that one frame.
 * - Lighting is authored here (the global sun barely reaches these interiors):
 *   local PointLights + a warm ambient + emissive materials over the 0.85 bloom
 *   threshold. Each zone crossfades its own light/palette on entry.
 *
 * No external assets: geometry from primitives, textures from CanvasTexture,
 * deterministic via mulberry32(seed). Zero per-frame allocation on hot paths.
 *
 * Dialogue text is authored in ./actuality-dialogue.js (a plain data module).
 */

import * as THREE from 'three';
import { makeStructure } from './city.js';
import * as DLG from './actuality-dialogue.js';
import { createMirrorRoom } from './actuality-mirrorroom.js';

/* ----------------------------------------------------------------------
 * Tunables — every magic number lives here.
 * ------------------------------------------------------------------- */
const AC = {
  HUB_FLOOR_HALF: 18,        // terrace half-extent (m)
  HUB_WALL_H: 3.0,           // café nook wall height
  CAFE_BACK_Z: 14.0,         // back wall plane (anchor-local +Z)
  DOME_RADIUS: 140,          // hub sky dome
  ZONE_DIST: 420,            // zones sit this far from the hub along ring bearings
  ZONE_FLOOR_HALF: 30,       // zone landing-pad half-extent
  ARCH_RING: 15,             // hub portal arches this far from the anchor
  ARCH_ARC: 2.6,             // arc (radians) the nine arches span, front of terrace
  PORTAL_R: 2.0,             // portal trigger radius
  FADE_OUT: 0.6,             // seconds to black
  FADE_IN: 1.4,              // seconds back from black (~2 s total transition)
  HOLOGRID_SECONDS: 10,      // time in the hyper-holo-grid before the loop resets
  BLOOM_THRESHOLD: 0.85,     // emissive above this blooms
  STRING_LIGHT_EMISSIVE: 1.1,
  TRIM_EMISSIVE: 0.4,        // stays under threshold (no bloom)
  TALK_REACH: 3.2,           // interaction radius (matches TALK_DIST_ACTUALITY)
  ZONE_COUNT: 9,
  STORE_KEY: 'fgsf.actuality',
  // dawn palette
  COL_GOLD: 0xf0d9b0,
  COL_CREAM: 0xf6ecd6,
  COL_WARM_LIGHT: 0xffd9a0,
  COL_WOOD: 0x6b4a30,
  COL_STONE: 0xbfae90,
};

/* ----------------------------------------------------------------------
 * Determinism + small helpers.
 * ------------------------------------------------------------------- */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

const _yAxis = new THREE.Vector3(0, 1, 0);
const _z6Local = new THREE.Vector3();   // scratch: player in zone-6 local frame
const _dbgMirror = new THREE.Vector3(); // last computed mirror-local player pos
const _zLocal = new THREE.Vector3();    // scratch: player in an arbitrary zone frame

// Full radial distance to terrain along a surface-local direction (a radius,
// not a height) — same as wavemallprime.sampleGround.
function sampleGround(planet, dirLocal) {
  if (planet.body && planet.body.groundAtLocal) {
    return (planet.radius ?? 900) + planet.body.groundAtLocal(dirLocal);
  }
  return planet.radius ?? 900;
}

// Great-circle offset: the surface-local direction `dist` m from `worldUp`
// along ring bearing `angle`. (wavemallprime.ringDir)
function ringDir(planet, worldUp, angle, dist) {
  const arbitrary = Math.abs(worldUp.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const tangentA = new THREE.Vector3().crossVectors(worldUp, arbitrary).normalize();
  const tangentB = new THREE.Vector3().crossVectors(worldUp, tangentA).normalize();
  const span = dist / (planet.radius ?? 900);
  return worldUp.clone().multiplyScalar(Math.cos(span))
    .add(tangentA.multiplyScalar(Math.cos(angle) * Math.sin(span)))
    .add(tangentB.multiplyScalar(Math.sin(angle) * Math.sin(span)))
    .normalize();
}

// Anchored tangent frame at dirLocal, yawed so local -Z looks back toward the
// hub anchor (worldUp). Returns {pos, q, qInv} in surface-local space.
// (wavemallprime.surfaceFrame)
function surfaceFrame(planet, worldUp, dirLocal) {
  const q0 = new THREE.Quaternion().setFromUnitVectors(_yAxis, dirLocal);
  const pos = dirLocal.clone().multiplyScalar(sampleGround(planet, dirLocal));
  const toCenter = worldUp.clone().multiplyScalar(sampleGround(planet, worldUp))
    .sub(pos).applyQuaternion(q0.clone().invert());
  const yaw = Math.atan2(-toCenter.x, -toCenter.z);
  const q = q0.multiply(new THREE.Quaternion().setFromAxisAngle(_yAxis, yaw));
  return { pos, q, qInv: q.clone().invert() };
}

/* ----------------------------------------------------------------------
 * CanvasTexture helpers.
 * ------------------------------------------------------------------- */
// Vertical two-stop gradient (used for the hub sky dome).
function gradientTexture(top, bottom) {
  const c = document.createElement('canvas');
  c.width = 4; c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, top);
  grad.addColorStop(1, bottom);
  g.fillStyle = grad; g.fillRect(0, 0, 4, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Subtle digit glyph stamped into a 2D canvas context (PDD §3 motif — a quiet
// reward, never labeled). Low-contrast outline so it reads as texture, not a
// sign. Caller sets composite/alpha before calling.
function drawGlyph(g, digit, cx, cy, size, color, alpha = 0.14) {
  g.save();
  g.globalAlpha = alpha;
  g.strokeStyle = color;
  g.lineWidth = Math.max(2, size * 0.09);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `bold ${size}px Georgia, serif`;
  g.strokeText(String(digit), cx, cy);
  g.restore();
}

// Tileable stone/terrazzo paving for the terrace and interior floors.
function pavingTexture(base, fleck, rng) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 240; i++) {
    g.fillStyle = i % 2 ? fleck : '#00000018';
    const r = 0.6 + rng() * 2.2;
    g.beginPath(); g.arc(rng() * 128, rng() * 128, r, 0, 6.28); g.fill();
  }
  g.strokeStyle = '#00000022'; g.lineWidth = 1.5;
  for (let k = 0; k <= 128; k += 32) { g.beginPath(); g.moveTo(0, k); g.lineTo(128, k); g.moveTo(k, 0); g.lineTo(k, 128); g.stroke(); }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// Colorful spray-art panel for Zone 1's alley (seeded blobs, arcs, tags).
function graffitiTexture(rng, glyphDigit) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#26221e'; g.fillRect(0, 0, 256, 256);
  const hues = [];
  for (let i = 0; i < 7; i++) hues.push(Math.floor(rng() * 360));
  for (let i = 0; i < 22; i++) {
    g.globalAlpha = 0.55 + rng() * 0.45;
    g.fillStyle = `hsl(${hues[i % hues.length]},80%,55%)`;
    const x = rng() * 256, y = rng() * 256;
    if (rng() < 0.5) { g.beginPath(); g.arc(x, y, 8 + rng() * 34, 0, 6.28); g.fill(); }
    else {
      g.strokeStyle = g.fillStyle; g.lineWidth = 4 + rng() * 10; g.beginPath();
      g.moveTo(x, y); g.bezierCurveTo(x + 40, y - 60, x + 90, y + 50, x + 130, y - 20); g.stroke();
    }
  }
  g.globalAlpha = 1;
  if (glyphDigit != null) drawGlyph(g, glyphDigit, 128, 128, 150, '#ffffff', 0.1);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Chalk menu board (dark slate + scrawled lines; an optional hidden glyph).
function menuBoardTexture(glyphDigit) {
  const c = document.createElement('canvas');
  c.width = 192; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#161c18'; g.fillRect(0, 0, 192, 256);
  g.strokeStyle = '#6a5a3a'; g.lineWidth = 6; g.strokeRect(6, 6, 180, 244);
  g.fillStyle = '#e8e2d0'; g.font = 'bold 22px Georgia, serif'; g.textAlign = 'center';
  g.fillText('CAFÉ', 96, 40);
  g.strokeStyle = '#cfc7b4'; g.lineWidth = 3;
  for (let i = 0; i < 7; i++) {
    const y = 74 + i * 24;
    g.beginPath(); g.moveTo(24, y); g.lineTo(24 + 60 + Math.sin(i) * 40, y); g.stroke();
    g.beginPath(); g.moveTo(150, y); g.lineTo(168, y); g.stroke();
  }
  if (glyphDigit != null) drawGlyph(g, glyphDigit, 96, 150, 150, '#ffffff', 0.16);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Lit-window facade (rows of warm/cool glowing windows) for Zone 1's city edge.
function facadeTexture(rng) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#1c1e24'; g.fillRect(0, 0, 128, 256);
  for (let y = 12; y < 248; y += 26) {
    for (let x = 12; x < 116; x += 26) {
      g.fillStyle = rng() < 0.5 ? '#ffd98a' : (rng() < 0.5 ? '#8aa6d8' : '#2a2c33');
      g.fillRect(x, y, 16, 18);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// A beautiful city seen from high above — the view down through the open black
// box (dawn sky, streets, warm-lit blocks, a river). Faces up from the bottom
// of the opening so looking in reads as "a city far below."
function cityBelowTexture() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 512;
  const g = c.getContext('2d');
  const rng = mulberry32(0xc17a);
  // Warm dawn haze the whole city sits in (you're looking straight down).
  const sky = g.createRadialGradient(256, 256, 30, 256, 256, 380);
  sky.addColorStop(0, '#ffe9bc'); sky.addColorStop(0.45, '#eabe86'); sky.addColorStop(0.8, '#a07a80'); sky.addColorStop(1, '#4a3a5a');
  g.fillStyle = sky; g.fillRect(0, 0, 512, 512);
  // Green parks scattered through the grid.
  for (let i = 0; i < 7; i++) {
    g.fillStyle = `rgba(${70 + rng() * 30},${110 + rng() * 40},${70 + rng() * 30},0.5)`;
    g.beginPath(); g.ellipse(40 + rng() * 430, 40 + rng() * 430, 20 + rng() * 34, 16 + rng() * 26, 0, 0, 6.28); g.fill();
  }
  // A broad river winding through, catching the dawn light.
  g.strokeStyle = 'rgba(120,175,215,0.8)'; g.lineWidth = 34; g.lineCap = 'round';
  g.beginPath(); g.moveTo(-20, 130); g.bezierCurveTo(160, 250, 320, 180, 540, 350); g.stroke();
  g.strokeStyle = 'rgba(210,235,255,0.35)'; g.lineWidth = 8;
  g.beginPath(); g.moveTo(-20, 130); g.bezierCurveTo(160, 250, 320, 180, 540, 350); g.stroke();
  // City blocks (top-down), taller towers casting little shadows toward the haze,
  // lit rooftops and windows — denser and brighter at the core, fading out.
  for (let bx = 20; bx < 500; bx += 30) {
    for (let by = 20; by < 500; by += 30) {
      const d = Math.hypot(bx - 256, by - 256) / 300; // 0 core → 1 edge
      if (rng() < 0.12 + d * 0.3) continue;
      const s = 12 + rng() * 12;
      const h = rng(); // tall-tower chance
      // drop shadow (as if the sun is low to the upper-left)
      g.fillStyle = `rgba(20,16,26,${0.28 * (1 - d)})`;
      g.fillRect(bx + 3, by + 3, s, s);
      const v = 60 + rng() * 60;
      g.fillStyle = `rgba(${v},${v - 6},${v + 14},${0.9 - d * 0.55})`;
      g.fillRect(bx, by, s, s);
      // lit roof cap on taller blocks
      if (h > 0.55) { g.fillStyle = `rgba(255,226,168,${0.85 - d * 0.5})`; g.fillRect(bx + s * 0.3, by + s * 0.3, s * 0.4, s * 0.4); }
      // scattered window sparkle
      if (rng() < 0.4) { g.fillStyle = `rgba(255,240,205,${0.7 - d * 0.4})`; g.fillRect(bx + 1, by + s - 3, 2, 2); }
    }
  }
  // Soft cloud wisps near the edges — you're above them.
  g.globalAlpha = 0.3; g.fillStyle = '#f6eede';
  for (let i = 0; i < 10; i++) { g.beginPath(); g.ellipse(rng() * 512, rng() * 512, 30 + rng() * 60, 12 + rng() * 18, 0, 0, 6.28); g.fill(); }
  g.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// A holographic, pixel-art seated dragon in profile (original silhouette) —
// projected in front of the sculpted dragon so the shape reads unmistakably as
// a dragon. Chunky low-res canvas (nearest-sampled) + scanlines = hologram.
function dragonHologramTexture() {
  const W = 176, H = 190;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.clearRect(0, 0, W, H);
  const poly = (pts) => { g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]); g.closePath(); g.fill(); };
  const ell = (x, y, rx, ry) => { g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, 6.28); g.fill(); };
  g.fillStyle = '#bfe6ff';
  // Seated in 3/4 profile, facing right (matching the reference pose): haunch on
  // the left, chest and one foreleg forward on the right, folded wing raised
  // behind the shoulder, long neck to a horned head, long spiked tail sweeping
  // back to the lower left.
  // Rear haunch + rump + lower belly (the seated mass).
  ell(58, 132, 40, 42);
  ell(92, 142, 30, 30);
  // Raised folded wing behind the shoulder — a tall angular sail + top claw.
  poly([[98, 112], [74, 58], [86, 34], [96, 60], [112, 52], [126, 104]]);
  poly([[86, 40], [80, 12], [94, 34]]);          // wing-finger claw at the top
  poly([[96, 104], [82, 60], [94, 92]]);          // inner wing strut (a darker fold-line reads as depth)
  // Chest + shoulder rising to the neck.
  poly([[86, 118], [116, 150], [130, 120], [126, 92], [104, 96]]);
  // Neck curving up and forward (thick at the base).
  poly([[108, 100], [122, 58], [142, 50], [150, 66], [128, 108]]);
  // Head facing right: skull, back-swept horned frill, snout + jaw.
  poly([[140, 52], [160, 48], [166, 58], [158, 68], [142, 66]]);
  poly([[158, 60], [178, 62], [172, 72], [156, 70]]); // snout
  poly([[152, 68], [170, 74], [162, 82], [150, 76]]); // jaw
  poly([[142, 52], [128, 30], [136, 42], [148, 54]]); // horns / frill
  poly([[148, 50], [138, 24], [148, 36], [154, 52]]);
  poly([[154, 52], [152, 26], [160, 40], [160, 54]]);
  // Dorsal ridge spikes from the nape over the back to the hip.
  for (const [sx, sy, s] of [[118, 96, 8], [106, 100, 10], [92, 106, 11], [78, 114, 10], [64, 122, 9], [50, 130, 8]]) poly([[sx, sy], [sx - s * 0.5, sy - s], [sx + 5, sy - 2]]);
  // Forelegs: one extended forward to a planted clawed foot, one tucked.
  poly([[120, 122], [132, 152], [144, 152], [130, 118]]);
  poly([[132, 150], [136, 178], [154, 180], [150, 156], [140, 150]]); // lower leg + foot
  for (const cx of [136, 142, 148]) poly([[cx, 178], [cx - 3, 186], [cx + 2, 184]]); // toe claws
  poly([[74, 150], [70, 176], [92, 178], [94, 152]]); // near hind foot
  // Long spiked tail sweeping down and back to the lower-left, tapering.
  poly([[34, 140], [16, 158], [4, 180], [16, 184], [30, 166], [50, 150], [60, 146]]);
  for (const [tx, ty, s] of [[56, 144, 7], [46, 150, 7], [34, 160, 6], [22, 172, 5], [12, 180, 4]]) poly([[tx, ty], [tx - s * 0.5, ty - s], [tx + 3, ty - 2]]);
  // Glowing eye.
  g.fillStyle = '#eaf6ff'; g.beginPath(); g.arc(154, 58, 2.4, 0, 6.28); g.fill();
  // Faint interior scale/fold lines (drawn as thin cutouts) add read at distance.
  g.globalCompositeOperation = 'destination-out';
  g.lineWidth = 1; g.strokeStyle = '#000';
  for (const [x0, y0, x1, y1] of [[104, 100, 120, 108], [96, 112, 118, 126], [90, 128, 116, 140]]) { g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); }
  // Scanlines for the holographic read.
  for (let y = 0; y < H; y += 3) g.fillRect(0, y, W, 1);
  g.globalCompositeOperation = 'source-over';
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter; // keep the chunky pixels
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}

// Crescent moon on transparent (full disc minus an offset disc).
function crescentTexture(flip = false) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#f0ead0';
  g.beginPath(); g.arc(64, 64, 52, 0, 6.28); g.fill();
  g.globalCompositeOperation = 'destination-out';
  g.beginPath(); g.arc(flip ? 44 : 84, 64, 50, 0, 6.28); g.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Portal sign: the digit glyph + its word, glowing warm on dark. Used on the
// hub arches (a quiet reward for players tracking the cipher).
function signTexture(digit, word) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#120c08'; g.fillRect(0, 0, 256, 128);
  g.fillStyle = '#ffdca0';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = 'bold 76px Georgia, serif';
  g.fillText(String(digit), 52, 66);
  g.font = '22px Georgia, serif';
  g.fillText(word, 156, 66);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Abstract "memory" image for Zone 5's floating frames — soft painted blobs
// over a warm ground, seeded so each frame differs.
function memoryTexture(rng) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#1a1712'; g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 14; i++) {
    const x = rng() * 128, y = rng() * 128, r = 8 + rng() * 36;
    const hue = Math.floor(20 + rng() * 60);
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, `hsla(${hue},60%,${40 + rng() * 30}%,0.8)`);
    grad.addColorStop(1, 'hsla(0,0%,0%,0)');
    g.fillStyle = grad; g.beginPath(); g.arc(x, y, r, 0, 6.28); g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Television static (Zone 7): random grey noise.
function tvStaticTexture(rng) {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 48;
  const g = c.getContext('2d');
  const img = g.createImageData(64, 48);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = (rng() * 255) | 0;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  return tex;
}

// Simple black silhouette on transparent (skyline / swing set / crescent moon).
function silhouetteTexture(kind) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 512, 256);
  g.fillStyle = '#05070c';
  if (kind === 'skyline') {
    // bridge + city blocks along the bottom
    for (let x = 0; x < 512; x += 18) {
      const h = 30 + Math.abs(Math.sin(x * 0.7)) * 90;
      g.fillRect(x, 256 - h, 15, h);
    }
    g.fillRect(150, 150, 220, 10); // bridge deck
    for (let x = 150; x < 370; x += 40) g.fillRect(x, 90, 6, 70); // cables/towers
  } else if (kind === 'swing') {
    g.fillRect(120, 40, 6, 180); g.fillRect(300, 40, 6, 180);
    g.fillRect(110, 40, 200, 6);
    g.fillRect(180, 46, 4, 120); g.fillRect(250, 46, 4, 120);
    g.fillRect(172, 166, 20, 6); g.fillRect(242, 166, 20, 6);
  }
  const tex = new THREE.CanvasTexture(c);
  return tex;
}

// Per-zone metadata: digit word (for the arch sign) and a tint used for the
// pad's ambient light so each zone reads as a distinct place at a glance.
const ZONE_META = [
  { id: 'z1', word: 'MIND', tint: 0xe8b878, note: 'THE MIND, CHASING ITS OWN THOUGHTS' },
  { id: 'z2', word: 'BODY', tint: 0xd8926a, note: 'TWO SOULS DRAWN TOGETHER INTO ONE' },
  { id: 'z3', word: 'SOUL', tint: 0xd8d0b0, note: 'AN ORDINARY CAFÉ — THE SOUL IS THE EVERYDAY' },
  { id: 'z4', word: 'SELF', tint: 0xe0c090, note: 'THE FRIENDS WHO MADE YOU WHO YOU ARE' },
  { id: 'z5', word: 'ORDER', tint: 0x8890b0, note: 'YOUR MEMORIES, SET IN ORDER ALONG THE PATH' },
  { id: 'z6', word: 'LIFE', tint: 0x6a86a0, note: 'STEP DOWN INTO THE WATER — LIFE, DEATH, REBIRTH' },
  { id: 'z7', word: 'TIME', tint: 0x7088a8, note: 'SIT BY THE TV — TIME YOU WON’T REMEMBER' },
  { id: 'z8', word: 'ETERNITY', tint: 0xc88a5a, note: 'LET THE FIRE BURN DOWN UNDER AN ENDLESS SKY' },
  { id: 'z9', word: 'DEATH / REBIRTH', tint: 0x707078, note: 'THE DRAGON — LEAP INTO THE BLACK BOX TO BE REBORN' },
];

// One portal arch (two posts + a lintel + a glowing sign), built facing +Z in
// its own local frame; caller positions/yaws it.
function buildPortalArch(digit, word, geos, mats) {
  const grp = new THREE.Group();
  const postMat = new THREE.MeshStandardMaterial({ color: 0x3a2c20, roughness: 0.85 });
  mats.push(postMat);
  const box = (w, h, d, x, y, z, mat) => {
    const g = new THREE.BoxGeometry(w, h, d);
    geos.push(g);
    const m = new THREE.Mesh(g, mat); m.position.set(x, y, z); grp.add(m); return m;
  };
  box(0.4, 3.4, 0.4, -1.3, 1.7, 0, postMat);
  box(0.4, 3.4, 0.4, 1.3, 1.7, 0, postMat);
  box(3.4, 0.5, 0.4, 0, 3.55, 0, postMat);
  const signTex = signTexture(digit, word);
  const signGeo = new THREE.PlaneGeometry(2.6, 0.9);
  const signMat = new THREE.MeshBasicMaterial({ map: signTex, transparent: true });
  const sign = new THREE.Mesh(signGeo, signMat);
  sign.position.set(0, 3.55, 0.25);
  grp.add(sign);
  geos.push(signGeo); mats.push(signMat);
  grp.userData.signTex = signTex;
  return grp;
}

/* ----------------------------------------------------------------------
 * NPC figure — a small primitive humanoid with a gentle idle bob.
 * pose: 'seated' | 'standing'. All parts under one group; update(t) bobs it.
 * ------------------------------------------------------------------- */
function makeFigure(opts = {}) {
  const { seated = false, scale = 1, skin = 0xcaa583, cloth = 0x8a5a6a, seed = 1 } = opts;
  const rng = mulberry32(seed >>> 0);
  const group = new THREE.Group();
  const mats = [];
  const skinMat = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.8 });
  const clothMat = new THREE.MeshStandardMaterial({ color: cloth, roughness: 0.9 });
  mats.push(skinMat, clothMat);
  const geos = [];
  const box = (w, h, d, x, y, z, mat) => {
    const g = new THREE.BoxGeometry(w, h, d);
    geos.push(g);
    const m = new THREE.Mesh(g, mat);
    m.position.set(x, y, z);
    group.add(m);
    return m;
  };
  const hipY = seated ? 0.55 : 0.95;
  // torso
  box(0.42, 0.62, 0.26, 0, hipY + 0.45, 0, clothMat);
  // head
  const head = box(0.24, 0.28, 0.24, 0, hipY + 0.95, 0, skinMat);
  // hair cap tint
  head.material = skinMat;
  // arms
  box(0.12, 0.5, 0.14, -0.3, hipY + 0.45, 0.02, clothMat);
  box(0.12, 0.5, 0.14, 0.3, hipY + 0.45, 0.02, clothMat);
  if (seated) {
    // thighs forward, shins down
    box(0.16, 0.14, 0.5, -0.12, hipY, 0.28, clothMat);
    box(0.16, 0.14, 0.5, 0.12, hipY, 0.28, clothMat);
    box(0.15, 0.5, 0.15, -0.12, hipY - 0.3, 0.5, clothMat);
    box(0.15, 0.5, 0.15, 0.12, hipY - 0.3, 0.5, clothMat);
  } else {
    box(0.16, 0.9, 0.16, -0.12, hipY - 0.45, 0, clothMat);
    box(0.16, 0.9, 0.16, 0.12, hipY - 0.45, 0, clothMat);
  }
  group.scale.setScalar(scale);
  const phase = rng() * 6.28;
  const baseY = group.position.y;
  function update(t) {
    group.position.y = baseY + Math.sin(t * 1.4 + phase) * 0.015;
    head.rotation.y = Math.sin(t * 0.5 + phase) * 0.18;
  }
  function setOpacity(o) {
    for (const m of mats) {
      m.transparent = o < 1;
      m.opacity = o;
      m.needsUpdate = true;
    }
  }
  function dispose() {
    for (const g of geos) g.dispose();
    for (const m of mats) m.dispose();
  }
  return { group, update, setOpacity, materials: mats, dispose };
}

/* ----------------------------------------------------------------------
 * Hub — the outdoor café terrace at the landing anchor.
 * Built in anchor-local space (added under `anchor`). Returns geometry group,
 * a makeStructure for collision, lights, and the She interactable position.
 * ------------------------------------------------------------------- */
function buildHub(rng) {
  const group = new THREE.Group();
  group.name = 'actuality.hub';
  const geos = [];
  const mats = [];
  const texs = [];
  const lights = [];

  const woodMat = new THREE.MeshStandardMaterial({ color: AC.COL_WOOD, roughness: 0.85 });
  const woodDark = new THREE.MeshStandardMaterial({ color: 0x4a3524, roughness: 0.9 });
  const porcelain = new THREE.MeshStandardMaterial({ color: 0xf2ede0, roughness: 0.4 });
  mats.push(woodMat, woodDark, porcelain);

  const addBox = (w, h, d, x, y, z, mat, ry = 0) => {
    const g = new THREE.BoxGeometry(w, h, d);
    const m = new THREE.Mesh(g, mat);
    m.position.set(x, y, z); if (ry) m.rotation.y = ry;
    group.add(m);
    geos.push(g);
    return m;
  };

  // Terrace floor: a thin paved slab, top at y=0 (flush with the anchor
  // ground), extending below grade so edges never open a gap.
  const H = AC.HUB_FLOOR_HALF;
  const paveTex = pavingTexture('#cbbfa2', '#e6dcc0', rng);
  paveTex.repeat.set(9, 9); texs.push(paveTex);
  const floorMat = new THREE.MeshStandardMaterial({ map: paveTex, roughness: 0.92 });
  mats.push(floorMat);
  addBox(H * 2, 1.2, H * 2, 0, -0.6, 0, floorMat);

  // Café nook: back wall + two side returns, open toward -Z (the terrace).
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xd8c8a8, roughness: 0.9 });
  mats.push(wallMat);
  const WH = AC.HUB_WALL_H, BZ = AC.CAFE_BACK_Z;
  // Back wall, split around a central doorway gap (the sealed mirror door fills
  // it; it opens once every zone is seen — buildMirrorDoor owns the door itself).
  addBox(7.4, WH, 0.5, -6.3, WH / 2, BZ, wallMat);     // back — left of doorway
  addBox(7.4, WH, 0.5, 6.3, WH / 2, BZ, wallMat);      // back — right of doorway
  addBox(3.2, WH - 2.6, 0.5, 0, WH - (WH - 2.6) / 2, BZ, wallMat); // lintel over the doorway
  addBox(0.5, WH, 6.5, -10, WH / 2, BZ - 3.25, wallMat); // left return
  addBox(0.5, WH, 6.5, 10, WH / 2, BZ - 3.25, wallMat);  // right return
  // Awning over the nook — striped canopy over wood beams.
  const canopyMat = new THREE.MeshStandardMaterial({ color: 0xb5654d, roughness: 0.8 });
  mats.push(canopyMat);
  addBox(20.5, 0.3, 8, 0, WH + 0.2, BZ - 4, canopyMat);
  for (let i = 0; i < 5; i++) addBox(0.18, 0.4, 8, -9 + i * 4.5, WH + 0.05, BZ - 4, woodDark);
  // Counter along the back + an espresso machine + a chalk menu board.
  addBox(12, 1.1, 1.2, 0, 0.55, BZ - 1.2, woodMat);
  const steelMat = new THREE.MeshStandardMaterial({ color: 0x8a8f96, roughness: 0.5 });
  mats.push(steelMat);
  addBox(1.3, 0.9, 0.9, 3.5, 1.55, BZ - 1.2, steelMat);
  const boardTex = menuBoardTexture(0); // hidden 0 lives at the hub / café
  texs.push(boardTex);
  const boardMat = new THREE.MeshStandardMaterial({ map: boardTex, roughness: 0.9 });
  mats.push(boardMat);
  const boardGeo = new THREE.PlaneGeometry(1.5, 2.0);
  const board = new THREE.Mesh(boardGeo, boardMat);
  board.position.set(-6.5, 1.9, BZ - 0.3); board.rotation.y = Math.PI; geos.push(boardGeo);
  group.add(board);

  // Low planters ringing the terrace edge with shrubs.
  const planterMat = new THREE.MeshStandardMaterial({ color: 0x6b5138, roughness: 0.9 });
  const shrubMat = new THREE.MeshStandardMaterial({ color: 0x4a6b3a, roughness: 0.85 });
  mats.push(planterMat, shrubMat);
  const shrubGeo = new THREE.SphereGeometry(0.7, 8, 6);
  geos.push(shrubGeo);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const px = Math.sin(a) * (H - 2.2), pz = Math.cos(a) * (H - 2.2);
    if (pz > BZ - 8) continue; // don't block the café nook
    addBox(2.2, 0.7, 1.0, px, 0.35, pz, planterMat, a);
    const s = new THREE.Mesh(shrubGeo, shrubMat);
    s.position.set(px, 1.0, pz); s.scale.set(1, 0.8, 1); group.add(s);
  }

  // Tables + chairs on the terrace (chair = seat + back + legs).
  const chairAt = (x, z, ry) => {
    addBox(0.5, 0.08, 0.5, x, 0.5, z, woodDark, ry);
    const bx = x - Math.sin(ry) * 0.22, bz = z - Math.cos(ry) * 0.22;
    addBox(0.5, 0.6, 0.08, bx, 0.8, bz, woodDark, ry);
  };
  const tableAt = (x, z, withChairs = true) => {
    addBox(1.6, 0.12, 1.6, x, 0.78, z, woodMat);
    addBox(0.16, 0.78, 0.16, x, 0.39, z, woodMat);
    if (withChairs) { chairAt(x, z + 1.1, 0); chairAt(x, z - 1.1, Math.PI); }
  };
  tableAt(-6, 9);   // She's table
  tableAt(5, 8);
  tableAt(0, 3.5);
  tableAt(-8, 2);
  tableAt(8, 1);
  tableAt(4, -5);

  // The tea set on She's table (the "join me for a tea" motif): pot + 2 cups.
  const potGeo = new THREE.CylinderGeometry(0.16, 0.2, 0.24, 10);
  geos.push(potGeo);
  const pot = new THREE.Mesh(potGeo, porcelain); pot.position.set(-6, 0.96, 9); group.add(pot);
  addBox(0.28, 0.06, 0.06, -6.24, 0.96, 9, porcelain);       // spout
  const cupGeo = new THREE.CylinderGeometry(0.09, 0.07, 0.11, 8);
  geos.push(cupGeo);
  for (const [cx, cz] of [[-6.4, 9.4], [-5.6, 8.6]]) {
    const cup = new THREE.Mesh(cupGeo, porcelain); cup.position.set(cx, 0.9, cz); group.add(cup);
  }
  // A stray cup on two other tables.
  for (const [cx, cz] of [[5.2, 8.2], [0, 3.7]]) {
    const cup = new THREE.Mesh(cupGeo, porcelain); cup.position.set(cx, 0.9, cz); group.add(cup);
  }

  // Warm string lights under the awning + three hanging lanterns.
  const bulbGeo = new THREE.SphereGeometry(0.12, 8, 6);
  geos.push(bulbGeo);
  const bulbMat = new THREE.MeshStandardMaterial({
    color: AC.COL_WARM_LIGHT, emissive: AC.COL_WARM_LIGHT,
    emissiveIntensity: AC.STRING_LIGHT_EMISSIVE, roughness: 0.5,
  });
  mats.push(bulbMat);
  const bulbs = new THREE.InstancedMesh(bulbGeo, bulbMat, 10);
  const _m = new THREE.Matrix4();
  for (let i = 0; i < 10; i++) {
    const x = -9 + (i / 9) * 18;
    _m.makeTranslation(x, WH - 0.1 + Math.sin(i) * 0.05, BZ - 7.6);
    bulbs.setMatrixAt(i, _m);
  }
  bulbs.instanceMatrix.needsUpdate = true;
  group.add(bulbs);
  const lanternGeo = new THREE.BoxGeometry(0.3, 0.4, 0.3);
  geos.push(lanternGeo);
  const lanternMat = new THREE.MeshStandardMaterial({
    color: 0xffcf8a, emissive: 0xffb860, emissiveIntensity: 1.0, roughness: 0.5,
  });
  mats.push(lanternMat);
  for (const lx of [-7, 0, 7]) {
    const l = new THREE.Mesh(lanternGeo, lanternMat); l.position.set(lx, WH - 0.5, BZ - 7.4); group.add(l);
  }

  // Local lighting: warm point lights + a soft warm ambient (dawn regardless
  // of the true sun angle).
  const key = new THREE.PointLight(AC.COL_WARM_LIGHT, 1.6, 60, 2.0);
  key.position.set(0, 5, BZ - 6);
  const fill = new THREE.PointLight(0xffe6c2, 0.9, 50, 2.0);
  fill.position.set(-4, 3, 2);
  const amb = new THREE.AmbientLight(0xf0d8b0, 0.55);
  group.add(key, fill, amb);
  lights.push(key, fill, amb);

  // Sky dome — cream→gold gradient.
  const domeTex = gradientTexture('#fbf1dc', '#e9c98c');
  texs.push(domeTex);
  const domeGeo = new THREE.SphereGeometry(AC.DOME_RADIUS, 24, 16);
  const domeMat = new THREE.MeshBasicMaterial({ map: domeTex, side: THREE.BackSide, fog: false });
  const dome = new THREE.Mesh(domeGeo, domeMat);
  group.add(dome);
  geos.push(domeGeo); mats.push(domeMat);

  // The café sits in a city: a distant skyline silhouette wrapped inside the
  // dome, plus a ring of tall building blocks beyond the terrace (this is the
  // "city where his ship awaits" the player drops into from zone 9).
  const skyTex = silhouetteTexture('skyline');
  texs.push(skyTex);
  skyTex.wrapS = THREE.RepeatWrapping; skyTex.repeat.set(6, 1);
  const skyMat = new THREE.MeshBasicMaterial({ map: skyTex, transparent: true, depthWrite: false, side: THREE.BackSide });
  const skyGeo = new THREE.CylinderGeometry(110, 110, 34, 48, 1, true);
  const skyline = new THREE.Mesh(skyGeo, skyMat);
  skyline.position.y = 14; group.add(skyline);
  geos.push(skyGeo); mats.push(skyMat);
  const cityRng = mulberry32(0x0c17);
  const bldgMat = new THREE.MeshStandardMaterial({ color: 0x6a6470, roughness: 0.9 });
  mats.push(bldgMat);
  const winMat = new THREE.MeshStandardMaterial({ color: 0xffe0a0, emissive: 0xffcf80, emissiveIntensity: 0.7, roughness: 0.6 });
  mats.push(winMat);
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + 0.2;
    const rad = 44 + cityRng() * 26;
    const bx = Math.sin(a) * rad, bz = Math.cos(a) * rad;
    if (bz > AC.CAFE_BACK_Z + 4 && Math.abs(bx) < 18) continue; // keep the café view open
    const bh = 14 + cityRng() * 34;
    const bg = new THREE.BoxGeometry(6 + cityRng() * 6, bh, 6 + cityRng() * 6);
    const bm = new THREE.Mesh(bg, bldgMat); bm.position.set(bx, bh / 2, bz);
    group.add(bm); geos.push(bg);
    const lg = new THREE.BoxGeometry(0.6, bh * 0.7, 0.6); // a lit window strip
    const lm = new THREE.Mesh(lg, winMat); lm.position.set(bx, bh * 0.5, bz + 3.1 * (bz < 0 ? -1 : 1));
    group.add(lm); geos.push(lg);
  }

  // Gentle breeze: leaves drifting slowly across the terrace.
  const NL = 60;
  const leafGeo = new THREE.PlaneGeometry(0.16, 0.16);
  const leafMat = new THREE.MeshBasicMaterial({
    color: 0xe0b060, transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthWrite: false,
  });
  const leaves = new THREE.InstancedMesh(leafGeo, leafMat, NL);
  leaves.frustumCulled = false; group.add(leaves);
  geos.push(leafGeo); mats.push(leafMat);
  const lr = mulberry32(0x0eaf);
  const lbase = [];
  for (let i = 0; i < NL; i++) lbase.push({ x0: (lr() - 0.5) * H * 2, y: 0.5 + lr() * 5, z: (lr() - 0.5) * H * 2, ph: lr() * 6.28, sp: 0.3 + lr() * 0.5 });
  const _lm = new THREE.Matrix4();

  // Collision: the café nook walls (with the terrace open).
  const walls = [
    { x0: -10, x1: 10, z0: BZ - 0.25, z1: BZ + 0.25, y0: 0, y1: WH },
    { x0: -10.25, x1: -9.75, z0: BZ - 6.5, z1: BZ, y0: 0, y1: WH },
    { x0: 9.75, x1: 10.25, z0: BZ - 6.5, z1: BZ, y0: 0, y1: WH },
    { x0: -6, x1: 6, z0: BZ - 1.8, z1: BZ - 0.6, y0: 0, y1: 1.1 }, // counter
  ];
  const surfaces = [{ x0: -H, x1: H, z0: -H, z1: H, y: 0 }];
  const structure = makeStructure(0, 0, 0, surfaces, walls, H + 1);

  function update(t) {
    for (let i = 0; i < NL; i++) {
      const b = lbase[i];
      const x = b.x0 + ((t * b.sp * 3) % (H * 2 + 8)) - 4; // drift +X, wrap
      const wx = x > H ? x - (H * 2 + 8) : x;
      const y = b.y + Math.sin(t * 0.6 + b.ph) * 0.4;
      _lm.makeRotationZ(t * 0.5 + b.ph);
      _lm.setPosition(wx, y, b.z + Math.sin(t * 0.4 + b.ph) * 1.5);
      leaves.setMatrixAt(i, _lm);
    }
    leaves.instanceMatrix.needsUpdate = true;
  }

  return {
    group,
    structure,
    lights,
    update,
    shePos: new THREE.Vector3(-6, 0, 10.4),
    dispose() {
      for (const g of geos) g.dispose();
      for (const m of mats) m.dispose();
      for (const tx of texs) tx.dispose();
    },
  };
}

/* ----------------------------------------------------------------------
 * Flags — persisted world state (localStorage, fail-open).
 * ------------------------------------------------------------------- */
function defaultFlags() {
  return {
    metCafeWoman: false,
    visited: { z1: false, z2: false, z3: false, z4: false, z5: false, z6: false, z7: false, z8: false, z9: false },
    talkedAndreiMikey: false,
    talkedJoshuaCaitlynn: false,
    dragonGiftReceived: false,
    hyperHoloGridSeen: false,
    zeroHeard: false,
    z6VisionSeen: false,
    digitsHeard: [],
  };
}
function loadFlags() {
  const f = defaultFlags();
  try {
    const raw = localStorage.getItem(AC.STORE_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      Object.assign(f, saved);
      f.visited = { ...defaultFlags().visited, ...(saved.visited ?? {}) };
      if (!Array.isArray(f.digitsHeard)) f.digitsHeard = [];
    }
  } catch { /* session-only */ }
  return f;
}
function saveFlags(f) {
  try { localStorage.setItem(AC.STORE_KEY, JSON.stringify(f)); } catch { /* session-only */ }
}

/* ----------------------------------------------------------------------
 * Main factory.
 * ------------------------------------------------------------------- */
export function createActuality(planet, worldUp, opts = {}) {
  const seedKey = opts.seedKey ?? 'actuality';
  const rng = mulberry32(hashSeed(seedKey));

  const group = new THREE.Group();
  group.name = 'actuality';

  // Landing-point anchor frame (surface-local). All hub content + interactable
  // positions live in this frame; the player is resolved into it by walk.js.
  const anchorDir = worldUp.clone().normalize();
  const anchorPos = anchorDir.clone().multiplyScalar(sampleGround(planet, anchorDir));
  const anchorQ = new THREE.Quaternion().setFromUnitVectors(_yAxis, anchorDir);
  const anchorQInv = anchorQ.clone().invert();

  const anchor = new THREE.Group();
  anchor.name = 'actuality.anchor';
  anchor.position.copy(anchorPos);
  anchor.quaternion.copy(anchorQ);
  group.add(anchor);

  const flags = loadFlags();

  // --- Hub ---
  const hub = buildHub(rng);
  anchor.add(hub.group);

  // --- Interactables (anchor-local Vector3 positions) ---
  // Zone tag 'hub' is always active; zone interactables (added later) filter on
  // the current activeZone.
  const interactables = [];
  const she = {
    id: 'she', zone: 'hub', pos: hub.shePos.clone(),
    talking: false,
  };
  interactables.push(she);

  // She figure at her table.
  const sheFig = makeFigure({ seated: true, scale: 1, skin: 0xd8b48f, cloth: 0x9a6b7a, seed: 7 });
  sheFig.group.position.set(-6, 0, 11.2);
  sheFig.group.rotation.y = Math.PI; // face -Z, toward the terrace / player
  anchor.add(sheFig.group);
  const figures = [sheFig];

  // --- Geometry/material bins for zones + portals (disposed at teardown) ---
  const zoneGeos = [];
  const zoneMats = [];
  const zoneTextures = [];

  // --- Zones: nine landing pads on ring bearings, each with a return portal.
  // Zone content (VFX/NPCs) is added to each zone.group by later milestones.
  const zoneList = [];
  const zoneById = {};
  for (let i = 0; i < AC.ZONE_COUNT; i++) {
    const meta = ZONE_META[i];
    const dir = ringDir(planet, anchorDir, (i / AC.ZONE_COUNT) * Math.PI * 2, AC.ZONE_DIST);
    const frame = surfaceFrame(planet, anchorDir, dir);
    const zg = new THREE.Group();
    zg.name = `actuality.${meta.id}`;
    zg.position.copy(frame.pos);
    zg.quaternion.copy(frame.q);
    zg.visible = false; // only the active zone renders (visibility gating)
    group.add(zg);

    // Landing-pad floor slab (top at y=0, extends below grade). Replace-ground
    // semantics own the floor inside this footprint.
    const ZH = AC.ZONE_FLOOR_HALF;
    const slabGeo = new THREE.BoxGeometry(ZH * 2, 1.2, ZH * 2);
    const slabMat = new THREE.MeshStandardMaterial({ color: 0x2a2620, roughness: 0.95 });
    const slab = new THREE.Mesh(slabGeo, slabMat);
    slab.position.set(0, -0.6, 0);
    zg.add(slab);
    zoneGeos.push(slabGeo); zoneMats.push(slabMat);

    // A tinted ambient light so the pad reads as its own place (a stand-in
    // until M5 builds the real per-zone environment).
    const zlight = new THREE.PointLight(meta.tint, 1.1, 90, 2.0);
    zlight.position.set(0, 6, 0);
    zg.add(zlight);

    // Return portal at zone-local (0,0,14), facing back toward the pad center.
    const retArch = buildPortalArch('0', 'CAFÉ', zoneGeos, zoneMats);
    retArch.position.set(0, 0, 14);
    retArch.rotation.y = Math.PI; // face -Z (toward where the player arrives)
    zg.add(retArch);

    const rec = {
      id: meta.id, frame, group: zg, retArch,
      structure: makeStructure(0, 0, 0,
        [{ x0: -ZH, x1: ZH, z0: -ZH, z1: ZH, y: 0 }], [], ZH + 1),
      r2: (ZH + 12) ** 2,
      center: frame.pos.clone(),
      // return trigger (surface-local) + hub destination
      retCenter: new THREE.Vector3(0, 0, 14).applyQuaternion(frame.q).add(frame.pos),
      retR: AC.PORTAL_R,
      // entry destination: player arrives at zone-local (0,0,10) facing -Z
      entryDest: new THREE.Vector3(0, 0, 10).applyQuaternion(frame.q).add(frame.pos),
      entryHeading: new THREE.Vector3(0, 0, -1).applyQuaternion(frame.q).normalize(),
    };
    zoneList.push(rec);
    zoneById[meta.id] = rec;
  }

  // Helpers: transform a zone-local point into anchor-local (interactable
  // positions) or surface-local (trigger centers).
  function zoneToAnchor(rec, x, y, z) {
    return new THREE.Vector3(x, y, z).applyQuaternion(rec.frame.q).add(rec.frame.pos)
      .sub(anchorPos).applyQuaternion(anchorQInv);
  }
  function zoneToSurface(rec, x, y, z) {
    return new THREE.Vector3(x, y, z).applyQuaternion(rec.frame.q).add(rec.frame.pos);
  }

  // Zone content (NPCs + set pieces). Built here so interactable positions are
  // pre-transformed into the anchor frame the host resolves the player into.
  const zoneUpdaters = []; // per-frame zone animation callbacks
  const zoneEnterCallbacks = {}; // id -> fn, fired at teleport blackout
  // Scripted-scene state (Joshua's departure, the dragon transformation).
  let joshuaFig = null;
  let joshuaDep = null;     // { t } while Joshua walks off
  // Ambient-zone state.
  let z6Tint = null;        // blue submersion overlay for the lake
  let z6Vision = null;      // { t } rebirth vision timer (fires once)
  let z6Submerged = 0;      // seconds continuously under the lake surface
  let z7Sit = 0;            // seconds seated by the TV
  let z7Caption = null;     // { i, t } running caption sequence
  let z7CaptionEl = null;   // DOM caption element
  let z8Burn = 0;           // seconds since entering zone 8 (fire burn-down)
  let birdAnchorPos = null;  // zone-1 bird position in anchor-local (for chirp gain)
  let birdDist = 999;        // player-to-bird distance (zone-1 local), for the chirp
  let z9Fall = null;         // { t, tp } while the player falls through the black box
  let z9Holo = null;         // { mat, mat2, light } the holographic dragon projection
  let cityFallEl = null;     // DOM overlay for the fall-to-city sequence
  let cityFallUrl = null;    // data URL of the aerial-city texture
  let mirrorTimer = 0;       // seconds inside the hyper-holo-grid
  let pendingReset = false;  // host consumes this → exitWalk + resetToStart (the loop)
  let mirror = null;        // createMirrorRoom handle (hyper-holo-grid)
  let mirrorRec = null;     // its zone record
  let mirrorDoor = null;    // { mesh, mat, opened } sealed hub door
  buildDialogueZones();
  buildAmbientZones();
  buildMirrorRoom();

  // --- Hub portal arches: nine, in a front arc on the terrace, one per zone.
  const hubPortals = [];
  for (let i = 0; i < AC.ZONE_COUNT; i++) {
    const meta = ZONE_META[i];
    const t = AC.ZONE_COUNT > 1 ? i / (AC.ZONE_COUNT - 1) : 0.5;
    const ang = -AC.ARCH_ARC / 2 + t * AC.ARCH_ARC;
    const ax = Math.sin(ang) * AC.ARCH_RING;
    const az = -Math.cos(ang) * AC.ARCH_RING; // front (-Z) arc, clear of the café
    const arch = buildPortalArch(String(i + 1), meta.word, zoneGeos, zoneMats);
    arch.position.set(ax, 0, az);
    arch.rotation.y = Math.atan2(-ax, -az); // face the terrace center
    anchor.add(arch);
    hubPortals.push({
      targetZone: meta.id,
      center: new THREE.Vector3(ax, 0, az).applyQuaternion(anchorQ).add(anchorPos),
    });
  }

  // Sealed mirror-room door behind the café (registers a gated hub portal).
  buildMirrorDoor();

  // Zone→hub destination (arrive on the terrace facing the café / She).
  const hubReturnDest = new THREE.Vector3(0, 0, -6).applyQuaternion(anchorQ).add(anchorPos);
  const hubReturnHeading = new THREE.Vector3(0, 0, 1).applyQuaternion(anchorQ).normalize();

  // --- Zone / crossfade state ---
  let activeZone = 'hub';
  const fade = { phase: 'idle', t: 0, target: 'hub', dest: null, heading: null };
  const _surf = new THREE.Vector3(); // scratch: player position in surface-local
  let toastQueue = null; // {text, seconds} queued at blackout, drained by walk.js
  let deferredNote = null; // {text, at} a "what's happening" line, shown after the title

  function zoneTitle(id) {
    if (id === 'hub') return 'THE CAFÉ';
    if (id === 'mirror') return 'THE HYPER-HOLO-GRID';
    const idx = Number(id.slice(1)) - 1;
    return `${idx + 1} — ${ZONE_META[idx].word}`;
  }
  // The short subtitle that explains what a zone is about (queued a beat after
  // its title so both read cleanly through the single-line toast).
  function zoneNote(id) {
    if (id === 'hub' || id === 'mirror') return null;
    const idx = Number(id.slice(1)) - 1;
    return ZONE_META[idx].note || null;
  }

  // Drained once per queued toast by the walk.js host (shadowreach pattern).
  function pendingToast() {
    const t = toastQueue;
    toastQueue = null;
    return t;
  }

  // --- Cipher menu state ---
  let pendingDigit = null; // set via onOutcome after She's choice menu

  // --- Teleport intent queue (consumed by walk.js host) ---
  let pendingTeleport = null;

  // --- Audio bed: one AudioContext, a shared looped-noise buffer + oscillators
  // routed per zone through gains that crossfade to the active zone. Fail-open
  // (no audio if the context can't start or stays suspended without a gesture).
  let audio = null;
  function initAudio() {
    if (audio) return;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      // Deterministic 2 s noise buffer (shared by every filtered source).
      const nb = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 2), ctx.sampleRate);
      const dch = nb.getChannelData(0);
      let s = 0x1234567;
      for (let i = 0; i < dch.length; i++) { s = (s * 1103515245 + 12345) & 0x7fffffff; dch[i] = s / 0x3fffffff - 1; }
      const zoneGains = {};
      const gainFor = (id) => {
        if (!zoneGains[id]) { const g = ctx.createGain(); g.gain.value = 0; g.connect(master); zoneGains[id] = g; }
        return zoneGains[id];
      };
      const started = [];
      const noise = (type, freq, q, id, vol) => {
        const src = ctx.createBufferSource(); src.buffer = nb; src.loop = true;
        const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; if (q) f.Q.value = q;
        const v = ctx.createGain(); v.gain.value = vol;
        src.connect(f).connect(v).connect(gainFor(id)); src.start(); started.push(src);
      };
      const osc = (freq, id, vol, type = 'sine') => {
        const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq;
        const v = ctx.createGain(); v.gain.value = vol;
        o.connect(v).connect(gainFor(id)); o.start(); started.push(o);
      };
      noise('lowpass', 520, 1, 'hub', 0.22);   // café murmur
      noise('lowpass', 760, 1, 'z3', 0.22);    // daylight café
      noise('lowpass', 300, 0.8, 'z6', 0.28);  // lake water
      noise('highpass', 2400, 0.7, 'z7', 0.22); // TV static
      noise('bandpass', 820, 1.4, 'z8', 0.28); // campfire crackle
      noise('bandpass', 1400, 2.5, 'z1', 0.12); // wind through leaves
      osc(58, 'z2', 0.05);                     // body room tone
      osc(72, 'z4', 0.05);                     // self room tone
      osc(864, 'z5', 0.018); osc(869, 'z5', 0.018); // order shimmer (beating)
      osc(55, 'z9', 0.05); osc(55.6, 'z9', 0.05);   // death low resonance
      osc(110, 'mirror', 0.035); osc(110.4, 'mirror', 0.035); osc(165.2, 'mirror', 0.02); // holo-grid drone
      // Bird chirp for zone 1 (gain pulsed in audioUpdate).
      const chirp = ctx.createOscillator(); chirp.type = 'triangle'; chirp.frequency.value = 1900;
      const chirpGain = ctx.createGain(); chirpGain.gain.value = 0;
      chirp.connect(chirpGain).connect(gainFor('z1')); chirp.start(); started.push(chirp);
      audio = { ctx, master, zoneGains, started, chirp, chirpGain };
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    } catch { audio = null; }
  }

  // Crossfade zone gains toward the active zone; pulse the zone-1 bird chirp.
  function audioUpdate(t, dt) {
    if (!audio) return;
    const k = Math.min(1, dt * 2);
    for (const id in audio.zoneGains) {
      const target = id === activeZone ? 1 : 0;
      const g = audio.zoneGains[id].gain;
      g.value += (target - g.value) * k;
    }
    if (audio.chirpGain) {
      // Chirp guides you: it pulses in zone 1, louder while the bird is still
      // far ahead (calling you on), softer as you catch up to it.
      const amp = 0.018 + Math.min(1, birdDist / 40) * 0.03;
      const on = activeZone === 'z1' && Math.sin(t * 7.0) > 0.7;
      audio.chirpGain.gain.value += ((on ? amp : 0) - audio.chirpGain.gain.value) * Math.min(1, dt * 8);
    }
  }

  /* --- Host contract --- */

  // Collision zones: the hub structure in the anchor frame, plus each zone's
  // floor/walls in its own tangent frame. Same pattern as wavemallprime — far
  // zones are skipped by the per-zone distance cull.
  const zones = [{
    frame: { pos: anchorPos, q: anchorQ, qInv: anchorQInv },
    structures: [hub.structure],
    r2: (AC.HUB_FLOOR_HALF + 12) ** 2,
  }];
  for (const z of zoneList) {
    zones.push({ frame: z.frame, structures: [z.structure], r2: z.r2 });
  }
  const _rc = new THREE.Vector3();

  function resolveCollisions(surfaceLocalPos, playerRadius) {
    let pushed = false;
    for (let i = 0; i < zones.length; i++) {
      const z = zones[i];
      if (surfaceLocalPos.distanceToSquared(z.frame.pos) > z.r2) continue;
      _rc.copy(surfaceLocalPos).sub(z.frame.pos).applyQuaternion(z.frame.qInv);
      let zonePushed = false;
      for (let j = 0; j < z.structures.length; j++) {
        if (z.structures[j].resolveWalls(_rc, playerRadius)) zonePushed = true;
      }
      if (zonePushed) {
        surfaceLocalPos.copy(_rc).applyQuaternion(z.frame.q).add(z.frame.pos);
        pushed = true;
      }
    }
    return pushed;
  }

  function groundRadiusAt(surfaceLocalPos) {
    for (let i = 0; i < zones.length; i++) {
      const z = zones[i];
      if (surfaceLocalPos.distanceToSquared(z.frame.pos) > z.r2) continue;
      _rc.copy(surfaceLocalPos).sub(z.frame.pos).applyQuaternion(z.frame.qInv);
      let best = -Infinity;
      for (let j = 0; j < z.structures.length; j++) {
        const sy = z.structures[j].surfaceYAt(_rc.x, _rc.z, _rc.y);
        if (sy !== null && sy !== undefined && sy > best) best = sy;
      }
      if (best > -Infinity) {
        _rc.y = best;
        return _rc.applyQuaternion(z.frame.q).add(z.frame.pos).length();
      }
      return -1;
    }
    return -1;
  }

  function nearestInteractable(playerPos, maxDist = AC.TALK_REACH) {
    let best = null, bestD2 = maxDist * maxDist;
    for (let i = 0; i < interactables.length; i++) {
      const it = interactables[i];
      if (it.zone !== activeZone) continue; // only the active area is reachable
      const d2 = it.pos.distanceToSquared(playerPos);
      if (d2 < bestD2) { bestD2 = d2; best = it; }
    }
    return best;
  }

  // Build the DialoguePayload for an interactable, dispatching on id + flags.
  function interact(entity) {
    entity.talking = true;
    switch (entity.id) {
      case 'she': return interactShe(entity);
      case 'andreiMikey':
        if (!flags.talkedAndreiMikey) { entity.pending = 'andreiMikey'; return { speaker: DLG.ANDREI_MIKEY, lines: DLG.ANDREI_MIKEY_SCENE }; }
        return { speaker: DLG.ANDREI_MIKEY, lines: DLG.ANDREI_MIKEY_IDLE };
      case 'joshuaCaitlynn':
        if (!flags.talkedJoshuaCaitlynn) { entity.pending = 'joshuaCaitlynn'; return { speaker: DLG.JOSHUA_CAITLYNN, lines: DLG.JOSHUA_CAITLYNN_SCENE }; }
        return { speaker: DLG.JOSHUA_CAITLYNN, lines: DLG.JOSHUA_CAITLYNN_IDLE };
      case 'dragon':
        if (!flags.dragonGiftReceived) { entity.pending = 'dragon'; return { speaker: DLG.DRAGON, lines: DLG.DRAGON_BEFORE }; }
        return { speaker: DLG.DRAGON, lines: DLG.DRAGON_AFTER };
      case 'z1woman': return { speaker: DLG.Z1_WOMAN, lines: DLG.Z1_WOMAN_LINES };
      case 'grandmother': return { speaker: DLG.GRANDMOTHER, lines: DLG.GRANDMOTHER_LINES };
      default: return { speaker: DLG.SHE, lines: ['…'] };
    }
  }

  function interactShe(entity) {
    // 1) First meeting.
    if (!flags.metCafeWoman) {
      entity.pending = 'intro';
      return { speaker: DLG.SHE, lines: DLG.SHE_INTRO };
    }
    // 2) All zones seen and the tenth not yet delivered → final "0" dialogue.
    if (allZonesVisited() && !flags.zeroHeard) {
      entity.pending = 'final';
      return { speaker: DLG.SHE, lines: DLG.SHE_FINAL };
    }
    // 3) A digit was chosen last time → deliver its teaching.
    if (pendingDigit != null) {
      const d = pendingDigit;
      pendingDigit = null;
      const tea = DLG.SHE_TEA[(d - 1) % DLG.SHE_TEA.length];
      if (!flags.digitsHeard.includes(d)) { flags.digitsHeard.push(d); saveFlags(flags); }
      return { speaker: DLG.SHE, lines: [...DLG.SHE_DIGITS[d], tea] };
    }
    // 4) Otherwise greet + offer the digit menu (choice offer).
    return {
      speaker: DLG.SHE,
      lines: DLG.SHE_GREETING,
      offer: {
        kind: 'choice',
        prompt: DLG.SHE_MENU_PROMPT,
        options: DLG.SHE_MENU_OPTIONS.map((label, i) => ({
          label, outcomeTag: `actuality.digit.${i + 1}`,
        })),
      },
    };
  }

  // Host tells us which choice option resolved (walk.js applyOffer). We parse
  // the digit so the next E press delivers that teaching.
  function onOutcome(tag) {
    const m = /^actuality\.digit\.(\d)$/.exec(tag);
    if (m) pendingDigit = Number(m[1]);
  }

  function endInteract(entity) {
    if (!entity) return;
    entity.talking = false;
    // One-shot flag commits + side effects (contract: safe to call twice).
    switch (entity.pending) {
      case 'intro': flags.metCafeWoman = true; saveFlags(flags); break;
      case 'final': flags.zeroHeard = true; saveFlags(flags); break;
      case 'andreiMikey': flags.talkedAndreiMikey = true; saveFlags(flags); break;
      case 'joshuaCaitlynn':
        flags.talkedJoshuaCaitlynn = true; saveFlags(flags);
        startJoshuaDeparture();
        break;
      // The dragon's gift is the descent itself: dragonGiftReceived is set when
      // the player falls through the open box, not by talking.
    }
    entity.pending = null;
  }

  function allZonesVisited() {
    const v = flags.visited;
    return v.z1 && v.z2 && v.z3 && v.z4 && v.z5 && v.z6 && v.z7 && v.z8 && v.z9;
  }

  // Consumed once per queued teleport by the walk.js host (returns
  // {pos, heading} in surface-local space, or null).
  function consumeTeleport() {
    const t = pendingTeleport;
    pendingTeleport = null;
    return t;
  }

  // Consumed once by the walk.js host: true means the hyper-holo-grid finished
  // and the program should repeat (host does exitWalk + resetToStart).
  function consumeReset() {
    if (!pendingReset) return false;
    pendingReset = false;
    return true;
  }

  // --- Transition overlay (module-owned full-screen DOM fade) ---
  let overlayEl = null;
  function setOverlay(o) {
    if (!overlayEl) {
      if (o <= 0) return;
      overlayEl = document.createElement('div');
      overlayEl.id = 'actyFade';
      overlayEl.style.cssText =
        'position:fixed;inset:0;z-index:20;pointer-events:none;' +
        'background:#0a0704;opacity:0;';
      document.body.appendChild(overlayEl);
    }
    overlayEl.style.opacity = String(o);
  }

  // Begin a soft transition to `target` ('hub' or 'z1'..'z9').
  // Only the active zone's group renders (keeps the forward-pass light count
  // sane). Shared by the fade blackout and Zone 9's box-fall.
  function applyZoneVisibility() {
    for (let i = 0; i < zoneList.length; i++) {
      zoneList[i].group.visible = zoneList[i].id === activeZone;
    }
  }

  function startTransition(target) {
    fade.phase = 'out';
    fade.t = 0;
    fade.target = target;
    if (target === 'hub') {
      fade.dest = hubReturnDest;
      fade.heading = hubReturnHeading;
    } else {
      const z = zoneById[target];
      fade.dest = z.entryDest;
      fade.heading = z.entryHeading;
    }
  }

  function advanceFade(dt) {
    if (fade.phase === 'idle') return;
    fade.t += dt;
    if (fade.phase === 'out') {
      setOverlay(Math.min(1, fade.t / AC.FADE_OUT));
      if (fade.t >= AC.FADE_OUT) {
        // Blackout: queue the teleport + switch the active zone.
        pendingTeleport = { pos: fade.dest.clone(), heading: fade.heading.clone() };
        activeZone = fade.target;
        if (fade.target !== 'hub' && fade.target !== 'mirror') {
          flags.visited[fade.target] = true;
          saveFlags(flags);
        }
        // Only the active zone's group renders (its PointLights would otherwise
        // bloat every forward-pass shader). The swap hides inside the blackout.
        applyZoneVisibility();
        // Zone-title toast, drained by the walk.js host (shadowreach pattern);
        // its meaning follows a couple of seconds later so both lines read.
        toastQueue = { text: zoneTitle(fade.target), seconds: 2.6 };
        const note = zoneNote(fade.target);
        deferredNote = note ? { text: note, at: 3.0 } : null; // countdown in update()
        if (zoneEnterCallbacks[fade.target]) zoneEnterCallbacks[fade.target]();
        fade.phase = 'in';
        fade.t = 0;
      }
    } else if (fade.phase === 'in') {
      setOverlay(Math.max(0, 1 - fade.t / AC.FADE_IN));
      if (fade.t >= AC.FADE_IN) { fade.phase = 'idle'; setOverlay(0); }
    }
  }

  function update(t, dt, playerPos, sunDot = 1) {
    for (let i = 0; i < figures.length; i++) figures[i].update(t);
    hub.update(t); // hub breeze (always visible)
    // Per-zone animation (only the active zone runs; the rest hold still).
    for (let i = 0; i < zoneUpdaters.length; i++) zoneUpdaters[i](t, dt, playerPos);
    audioUpdate(t, dt);

    // Show a zone's meaning a beat after its title (both drain through the
    // single-line host toast, so they can't share a frame).
    if (deferredNote) {
      deferredNote.at -= dt;
      if (deferredNote.at <= 0) {
        if (!toastQueue) { toastQueue = { text: deferredNote.text, seconds: 3.6 }; deferredNote = null; }
      }
    }

    // Open the mirror door once every zone has been seen: the slab rises out of
    // the frame and a blue threshold glow reveals the passage beyond.
    if (mirrorDoor && !mirrorDoor.opened && allZonesVisited()) {
      mirrorDoor.opened = true;
    }
    if (mirrorDoor && mirrorDoor.opened && mirrorDoor.anim < 1) {
      mirrorDoor.anim = Math.min(1, mirrorDoor.anim + dt / 1.6);
      const a = mirrorDoor.anim;
      mirrorDoor.mesh.position.y = 1.55 + a * 3.2;       // slab lifts up and away
      mirrorDoor.mesh.visible = a < 0.98;
      mirrorDoor.glowMat.opacity = a * 0.7;
      mirrorDoor.doorLight.intensity = a * 1.6;
      mirrorDoor.sign.opacity = 0.85 + a * 0.15;
    }
    if (mirrorDoor && mirrorDoor.opened && mirrorDoor.anim >= 1) {
      mirrorDoor.glowMat.opacity = 0.55 + Math.sin(t * 1.6) * 0.15; // gentle pulse
    }

    // Portal triggers — checked in surface-local space (frame-agnostic). Only
    // while idle; the current activeZone decides which portals are live.
    if (fade.phase === 'idle') {
      _surf.copy(playerPos).applyQuaternion(anchorQ).add(anchorPos);
      if (activeZone === 'hub') {
        const r2 = AC.PORTAL_R * AC.PORTAL_R;
        for (let i = 0; i < hubPortals.length; i++) {
          const hp = hubPortals[i];
          if (hp.gated && !allZonesVisited()) continue; // mirror door stays sealed
          if (_surf.distanceToSquared(hp.center) < r2) {
            startTransition(hp.targetZone);
            break;
          }
        }
      } else {
        const z = zoneById[activeZone];
        if (z) {
          let ret = z.retR > 0 && _surf.distanceToSquared(z.retCenter) < z.retR * z.retR;
          if (!ret && z.extraReturns) {
            for (const er of z.extraReturns) {
              if (_surf.distanceToSquared(er.center) < er.r * er.r) { ret = true; break; }
            }
          }
          if (ret) startTransition('hub');
        }
      }
    }
    advanceFade(dt);
  }

  /* ------------------------------------------------------------------
   * Dialogue-zone content (Z3 Soul, Z4 Self, Z9 Death/Rebirth).
   * Interactable positions are pre-transformed into the anchor frame.
   * ---------------------------------------------------------------- */
  function buildDialogueZones() {
    buildZone3();
    buildZone4();
    buildZone9();
  }

  function addZoneBox(rec, w, h, d, x, y, z, color, ry = 0, rough = 0.9) {
    const g = new THREE.BoxGeometry(w, h, d);
    const m = new THREE.MeshStandardMaterial({ color, roughness: rough });
    const mesh = new THREE.Mesh(g, m);
    mesh.position.set(x, y, z); if (ry) mesh.rotation.y = ry;
    rec.group.add(mesh);
    zoneGeos.push(g); zoneMats.push(m);
    return mesh;
  }

  // Box with a caller-supplied material (already tracked in zoneMats).
  function addZoneBox2(rec, w, h, d, x, y, z, mat) {
    const g = new THREE.BoxGeometry(w, h, d);
    const mesh = new THREE.Mesh(g, mat);
    mesh.position.set(x, y, z);
    rec.group.add(mesh);
    zoneGeos.push(g);
    return mesh;
  }

  // Z3 — an enclosed, ordinary daylight coffee shop. Andrei & Mikey at the
  // window table, everyday clutter, an espresso counter and pastry case.
  function buildZone3() {
    const rec = zoneById['z3'];
    rec.group.add(new THREE.AmbientLight(0xfff4e0, 0.7));
    const fill = new THREE.PointLight(0xfff0da, 0.5, 40, 2.0);
    fill.position.set(0, 3.5, -2); rec.group.add(fill);
    // Walls + ceiling enclosing the shop (open +Z for the return arch).
    const RX = 9, RZ = 12, WH = 4.2;
    const shopMat = new THREE.MeshStandardMaterial({ color: 0xcfc3ac, roughness: 0.9, side: THREE.DoubleSide });
    zoneMats.push(shopMat);
    const wall = (w, h, x, y, z, ry) => {
      const g = new THREE.PlaneGeometry(w, h);
      const m = new THREE.Mesh(g, shopMat); m.position.set(x, y, z); m.rotation.y = ry;
      rec.group.add(m); zoneGeos.push(g);
    };
    wall(RX * 2, WH, 0, WH / 2, -RZ, 0);       // back
    wall(RZ * 2, WH, -RX, WH / 2, 0, Math.PI / 2); // left
    wall(RZ * 2, WH, RX, WH / 2, 0, Math.PI / 2);  // right
    const ceilG = new THREE.PlaneGeometry(RX * 2, RZ * 2);
    const ceil = new THREE.Mesh(ceilG, shopMat); ceil.position.set(0, WH, 0); ceil.rotation.x = Math.PI / 2;
    rec.group.add(ceil); zoneGeos.push(ceilG);
    // Two big daylight windows.
    const winGeo = new THREE.PlaneGeometry(4, 2.4);
    zoneGeos.push(winGeo);
    const winMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2d8, emissiveIntensity: 1.0, side: THREE.DoubleSide });
    zoneMats.push(winMat);
    for (const [wx, wz, wry] of [[-RX + 0.1, -4, Math.PI / 2], [3, -RZ + 0.1, 0]]) {
      const w = new THREE.Mesh(winGeo, winMat); w.position.set(wx, 2.0, wz); w.rotation.y = wry; rec.group.add(w);
    }
    // Counter, espresso machine, glass pastry case, chalk board ("3" glyph).
    addZoneBox(rec, 10, 1.1, 1.0, 0, 0.55, -10.5, AC.COL_WOOD);
    addZoneBox(rec, 1.3, 0.9, 0.8, 3, 1.55, -10.5, 0x8a8f96);
    const caseMat = new THREE.MeshStandardMaterial({ color: 0xbfe0ff, transparent: true, opacity: 0.4, roughness: 0.2 });
    zoneMats.push(caseMat);
    addZoneBox2(rec, 2.4, 0.9, 0.9, -3, 1.05, -10.4, caseMat);
    const boardTex = menuBoardTexture(3);
    zoneTextures.push(boardTex);
    const boardMat = new THREE.MeshStandardMaterial({ map: boardTex, roughness: 0.9 });
    zoneMats.push(boardMat);
    const boardGeo = new THREE.PlaneGeometry(1.4, 1.9);
    const board = new THREE.Mesh(boardGeo, boardMat); board.position.set(-6, 2.4, -11.8); rec.group.add(board);
    zoneGeos.push(boardGeo);
    // Tables + chairs (Andrei & Mikey at the window table), plus clutter.
    const chair = (x, z, ry) => { addZoneBox(rec, 0.5, 0.08, 0.5, x, 0.5, z, 0x6b4a34); addZoneBox(rec, 0.5, 0.6, 0.08, x - Math.sin(ry) * 0.22, 0.8, z - Math.cos(ry) * 0.22, 0x6b4a34); };
    const table = (x, z) => { addZoneBox(rec, 1.3, 0.1, 1.3, x, 0.78, z, AC.COL_WOOD); addZoneBox(rec, 0.14, 0.78, 0.14, x, 0.39, z, AC.COL_WOOD); };
    table(0, -4); chair(-1.3, -4, Math.PI / 2); chair(1.3, -4, -Math.PI / 2);
    table(-5, -3); table(5, -5);
    // Mugs on the tables.
    const mugGeo = new THREE.CylinderGeometry(0.08, 0.07, 0.12, 8);
    zoneGeos.push(mugGeo);
    const mugMat = new THREE.MeshStandardMaterial({ color: 0xe8e0d0, roughness: 0.5 });
    zoneMats.push(mugMat);
    for (const [mx, mz] of [[-0.3, -3.7], [0.3, -4.3], [-5, -3], [5, -5]]) {
      const mug = new THREE.Mesh(mugGeo, mugMat); mug.position.set(mx, 0.9, mz); rec.group.add(mug);
    }
    // Collision: perimeter walls, door gap on +Z.
    const wt = 0.4;
    rec.structure = makeStructure(0, 0, 0,
      [{ x0: -RX, x1: RX, z0: -RZ, z1: RZ, y: 0 }],
      [
        { x0: -RX, x1: RX, z0: -RZ - wt, z1: -RZ, y0: 0, y1: WH },
        { x0: -RX - wt, x1: -RX, z0: -RZ, z1: RZ, y0: 0, y1: WH },
        { x0: RX, x1: RX + wt, z0: -RZ, z1: RZ, y0: 0, y1: WH },
      ], RZ + 2);
    rec.r2 = (RZ + 12) ** 2;
    // Figures.
    const andrei = makeFigure({ seated: true, skin: 0xc9a074, cloth: 0x4a5a6a, seed: 31 });
    andrei.group.position.set(-1.4, 0, -4); andrei.group.rotation.y = Math.PI / 2 + 0.2;
    const mikey = makeFigure({ seated: true, skin: 0xd0a878, cloth: 0x6a4a3a, seed: 32 });
    mikey.group.position.set(1.4, 0, -4); mikey.group.rotation.y = -Math.PI / 2 - 0.2;
    rec.group.add(andrei.group, mikey.group);
    figures.push(andrei, mikey);
    interactables.push({ id: 'andreiMikey', zone: 'z3', pos: zoneToAnchor(rec, 0, 0, -2.6), talking: false });
  }

  // Z4 — a cramped dorm joined by a short corridor to a spacious warm
  // apartment. Joshua paces between the two until the scene fires.
  function buildZone4() {
    const rec = zoneById['z4'];
    // Dorm at +Z (cool, low), apartment at -Z (warm, tall), corridor between.
    const dormLight = new THREE.PointLight(0x8ea4c0, 0.6, 26, 2.0);
    dormLight.position.set(0, 2.0, 7); rec.group.add(dormLight);
    const aptLight = new THREE.PointLight(0xffcaa0, 1.1, 60, 2.0);
    aptLight.position.set(0, 3.5, -7); rec.group.add(aptLight);
    rec.group.add(new THREE.AmbientLight(0x2a2c30, 0.35));

    const dormMat = new THREE.MeshStandardMaterial({ color: 0x6a7078, roughness: 0.92, side: THREE.DoubleSide });
    const aptMat = new THREE.MeshStandardMaterial({ color: 0xcaa583, roughness: 0.9, side: THREE.DoubleSide });
    zoneMats.push(dormMat, aptMat);
    const panel = (mat, w, h, x, y, z, ry, rx = 0) => {
      const g = new THREE.PlaneGeometry(w, h);
      const m = new THREE.Mesh(g, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, 0);
      rec.group.add(m); zoneGeos.push(g);
    };
    // Dorm shell: 5m wide, 2.2m ceiling, z 4..9 (door gap on -Z toward corridor).
    const DCH = 2.2;
    panel(dormMat, 5, DCH, 0, DCH / 2, 9, 0);          // dorm back
    panel(dormMat, 5, DCH, -2.5, DCH / 2, 6.5, Math.PI / 2);
    panel(dormMat, 5, DCH, 2.5, DCH / 2, 6.5, Math.PI / 2);
    panel(dormMat, 5, 5, 0, DCH, 6.5, 0, Math.PI / 2);  // dorm ceiling
    // Corridor (z 1..4), cool→warm vertex tint via two short wall segments +
    // ceiling beams that cross into a "4" (glyph).
    panel(dormMat, 2.6, 2.6, -1.3, 1.3, 2.5, Math.PI / 2);
    panel(aptMat, 2.6, 2.6, 1.3, 1.3, 2.5, Math.PI / 2);
    addZoneBox(rec, 0.12, 0.12, 3, 0, 2.55, 2.5, 0x4a3a2a);         // beam along
    addZoneBox(rec, 2.4, 0.12, 0.12, 0, 2.55, 1.8, 0x4a3a2a);  // beam across = "4"
    // Apartment shell: 9m, 3.6m ceiling, z -12..0 (door gap on +Z).
    const ACH = 3.6;
    panel(aptMat, 9, ACH, 0, ACH / 2, -12, 0);
    panel(aptMat, 12, ACH, -4.5, ACH / 2, -6, Math.PI / 2);
    panel(aptMat, 12, ACH, 4.5, ACH / 2, -6, Math.PI / 2);
    panel(aptMat, 9, 12, 0, ACH, -6, 0, Math.PI / 2);   // apt ceiling

    // Dorm furniture.
    addZoneBox(rec, 0.9, 0.4, 2.0, -1.6, 0.3, 7, 0x9aa0a8);  // narrow bed
    addZoneBox(rec, 1.4, 0.8, 0.6, 1.6, 0.4, 8.4, 0x7a6a58); // desk
    addZoneBox(rec, 0.4, 0.4, 0.4, 1.6, 1.0, 8.4, 0x8a8f96); // clutter box
    // Apartment furniture: couch, rug, plants, big warm window.
    addZoneBox(rec, 3.2, 0.6, 1.2, -2.4, 0.4, -8, 0x8a5a6a); // couch
    addZoneBox(rec, 3.2, 0.3, 0.5, -2.4, 0.85, -8.6, 0x9a6a7a); // couch back
    addZoneBox(rec, 3.6, 0.04, 2.6, 0, 0.03, -7, 0x8a5040); // rug
    for (const [px, pz] of [[3.6, -10.5], [-3.6, -2]]) { // plants
      addZoneBox(rec, 0.5, 0.5, 0.5, px, 0.25, pz, 0x6b4a34);
      const pot = new THREE.Mesh(new THREE.SphereGeometry(0.6, 8, 6), new THREE.MeshStandardMaterial({ color: 0x3a6b3a, roughness: 0.85 }));
      pot.position.set(px, 1.0, pz); pot.scale.y = 1.3; rec.group.add(pot);
      zoneGeos.push(pot.geometry); zoneMats.push(pot.material);
    }
    const winGeo = new THREE.PlaneGeometry(4, 2.6);
    const winMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffd9a8, emissiveIntensity: 0.9, side: THREE.DoubleSide });
    const win = new THREE.Mesh(winGeo, winMat); win.position.set(0, 2.1, -11.8); rec.group.add(win);
    zoneGeos.push(winGeo); zoneMats.push(winMat);

    // Collision: dorm box + apartment box (each with a corridor door gap).
    rec.structure = makeStructure(0, 0, 0,
      [{ x0: -4.5, x1: 4.5, z0: -12, z1: 9.5, y: 0 }],
      [
        // dorm walls (gap toward -Z corridor mouth at x∈[-1.3,1.3])
        { x0: -2.5, x1: 2.5, z0: 9, z1: 9.4, y0: 0, y1: DCH },
        { x0: -2.9, x1: -2.5, z0: 4, z1: 9.4, y0: 0, y1: DCH },
        { x0: 2.5, x1: 2.9, z0: 4, z1: 9.4, y0: 0, y1: DCH },
        { x0: -2.5, x1: -1.3, z0: 4, z1: 4.4, y0: 0, y1: DCH },
        { x0: 1.3, x1: 2.5, z0: 4, z1: 4.4, y0: 0, y1: DCH },
        // apartment walls (gap toward +Z corridor mouth)
        { x0: -4.5, x1: 4.5, z0: -12.4, z1: -12, y0: 0, y1: ACH },
        { x0: -4.9, x1: -4.5, z0: -12, z1: 0, y0: 0, y1: ACH },
        { x0: 4.5, x1: 4.9, z0: -12, z1: 0, y0: 0, y1: ACH },
        { x0: -4.5, x1: -1.3, z0: 0, z1: 0.4, y0: 0, y1: ACH },
        { x0: 1.3, x1: 4.5, z0: 0, z1: 0.4, y0: 0, y1: ACH },
      ], 14);
    rec.r2 = (14 + 12) ** 2;

    // Figures.
    const caitlynn = makeFigure({ seated: true, skin: 0xe0c0a0, cloth: 0xb08090, seed: 41 });
    caitlynn.group.position.set(-2.4, 0.5, -8); caitlynn.group.rotation.y = 0.2;
    joshuaFig = makeFigure({ seated: false, skin: 0xc99a70, cloth: 0x33465a, seed: 42 });
    joshuaFig.group.position.set(0, 0, -4); joshuaFig.group.rotation.y = 0;
    rec.group.add(caitlynn.group, joshuaFig.group);
    figures.push(caitlynn, joshuaFig);
    interactables.push({ id: 'joshuaCaitlynn', zone: 'z4', pos: zoneToAnchor(rec, 0, 0, -3.5), talking: false });

    // Joshua paces the corridor (dorm ↔ apartment) until the scene fires, then
    // his scripted departure plays.
    const paceA = new THREE.Vector3(0, 0, 7), paceB = new THREE.Vector3(-2, 0, -6);
    zoneUpdaters.push((t, dt) => {
      if (activeZone !== 'z4' || !joshuaFig) return;
      if (joshuaDep) {
        joshuaDep.t += dt;
        const T = joshuaDep.t, p = Math.min(1, T / 8);
        const sx = -2, sz = -6, dx = 3, dz = 8.6; // toward the dorm door
        joshuaFig.group.position.set(sx + (dx - sx) * p, 0, sz + (dz - sz) * p);
        joshuaFig.group.rotation.y = Math.atan2(dx - sx, dz - sz);
        if (T > 8) joshuaFig.setOpacity(Math.max(0, 1 - (T - 8) / 2));
        if (T > 10.2) { joshuaFig.group.visible = false; joshuaDep = null; }
        return;
      }
      if (flags.talkedJoshuaCaitlynn) return; // stays put after the scene
      // Slow pace between the two rooms.
      const phase = (Math.sin(t * 0.25) * 0.5 + 0.5);
      joshuaFig.group.position.lerpVectors(paceA, paceB, phase);
      joshuaFig.group.rotation.y = phase > 0.5 ? Math.PI : 0;
    });
  }

  // Z9 — a monolith door opening onto a switchback shaft that descends to the
  // granite dragon's chamber.
  function buildZone9() {
    const rec = zoneById['z9'];
    // Terraced switchback landings at y = 0,-3,-6,-9,-12,-15 down to the
    // chamber, each a flat slab joined by a short ramp (along -Z).
    const surfaces = [{ x0: -30, x1: 30, z0: -6, z1: 30, y: 0 }]; // arrival
    const walls = [];
    const wallH = { y0: -17, y1: 2 };
    for (let k = 0; k < 5; k++) {
      const y = -3 * k, z0 = -6 - k * 6;
      surfaces.push({ x0: -5, x1: 5, z0: z0 - 3, z1: z0, y });                 // landing
      surfaces.push({ ramp: true, x0: -5, x1: 5, z0: z0 - 6, z1: z0 - 3, zA: z0 - 3, zB: z0 - 6, yA: y, yB: y - 3 }); // ramp down
    }
    surfaces.push({ x0: -16, x1: 16, z0: -72, z1: -36, y: -15 });             // chamber floor
    // Shaft guard walls down both sides, + chamber shell (door gap at z=-36).
    walls.push({ x0: -5.4, x1: -5.0, z0: -36, z1: -6, ...wallH });
    walls.push({ x0: 5.0, x1: 5.4, z0: -36, z1: -6, ...wallH });
    walls.push({ x0: -16, x1: 16, z0: -72, z1: -71.5, ...wallH });
    walls.push({ x0: -16, x1: -15.5, z0: -72, z1: -36, ...wallH });
    walls.push({ x0: 15.5, x1: 16, z0: -72, z1: -36, ...wallH });
    walls.push({ x0: -16, x1: -5.5, z0: -36, z1: -35.5, ...wallH });
    walls.push({ x0: 5.5, x1: 16, z0: -36, z1: -35.5, ...wallH });
    rec.structure = makeStructure(0, 0, 0, surfaces, walls, 78);
    rec.r2 = (78 + 12) ** 2;

    rec.group.add(new THREE.AmbientLight(0x3a4460, 0.95));
    // Dramatic lighting so the black granite dragon reads clearly: a cool key
    // from the front-side, a blue rim from behind, and a soft front fill. Decay
    // 1.0 so the light actually reaches the dragon across the ~14 m chamber.
    const dragonKey = new THREE.PointLight(0xcfe0ff, 26, 80, 1.0);
    dragonKey.position.set(5, -4, -52); rec.group.add(dragonKey);
    const dragonRim = new THREE.PointLight(0x7fb0ff, 20, 80, 1.0);
    dragonRim.position.set(-6, 2, -70); rec.group.add(dragonRim);
    const dragonFill = new THREE.PointLight(0x9fb8e0, 12, 70, 1.0);
    dragonFill.position.set(-1, -7, -46); rec.group.add(dragonFill);
    const dark = 0x14151a;
    // Monolith door framing the shaft mouth on the arrival platform.
    const monoMat = new THREE.MeshStandardMaterial({ color: 0x1a1c22, roughness: 0.9, emissive: 0x0a1420, emissiveIntensity: 0.2 });
    zoneMats.push(monoMat);
    addZoneBox2(rec, 1.4, 8, 1.4, -4, 4, -6, monoMat);
    addZoneBox2(rec, 1.4, 8, 1.4, 4, 4, -6, monoMat);
    addZoneBox2(rec, 10, 1.6, 1.4, 0, 8.2, -6, monoMat);
    // Landing slabs + ramp fill + emissive vein strips down the shaft walls.
    for (let k = 0; k < 5; k++) {
      const y = -3 * k, z0 = -6 - k * 6;
      addZoneBox(rec, 10, 0.4, 3, 0, y - 0.2, z0 - 1.5, dark);
      const r = addZoneBox(rec, 10, 0.3, 3.4, 0, y - 1.5, z0 - 4.5, dark);
      r.rotation.x = Math.atan2(3, 3);
    }
    const veinMat = new THREE.MeshStandardMaterial({ color: 0x2a3a4a, emissive: 0x2a5a7a, emissiveIntensity: 0.5, roughness: 0.6 });
    zoneMats.push(veinMat);
    for (let k = 0; k < 5; k++) {
      addZoneBox2(rec, 0.1, 0.1, 2.4, -5.2, -3 * k - 1, -8 - k * 6, veinMat);
      addZoneBox2(rec, 0.1, 0.1, 2.4, 5.2, -3 * k - 1, -8 - k * 6, veinMat);
    }
    // Chamber shell (matte near-black).
    addZoneBox(rec, 32, 0.6, 36, 0, -15.3, -54, dark);
    addZoneBox(rec, 32, 18, 0.6, 0, -8, -71.7, dark);
    addZoneBox(rec, 0.6, 18, 36, -15.7, -8, -54, dark);
    addZoneBox(rec, 0.6, 18, 36, 15.7, -8, -54, dark);

    // The massive black dragon, sitting upright on a low dais — horned frill,
    // shoulder spikes, folded wings, clawed forelegs, a spiked tail curling to
    // the side. Built from primitives; black with a faint sheen so the rim/key
    // lights pick out its form. Glowing eyes.
    const dragonGrp = new THREE.Group();
    dragonGrp.position.set(0, -15, -62);
    dragonGrp.scale.setScalar(1.6); // massive
    dragonGrp.rotation.y = Math.PI;  // face +Z (toward the arriving player)
    rec.group.add(dragonGrp);
    // A dais under the dragon.
    addZoneBox2(rec, 9, 1.0, 9, 0, -14.7, -62, new THREE.MeshStandardMaterial({ color: 0x0c1018, roughness: 0.5, metalness: 0.4 }));
    zoneMats.push(rec.group.children[rec.group.children.length - 1].material);

    const graniteMat = new THREE.MeshStandardMaterial({ color: 0x0c0c11, roughness: 0.42, metalness: 0.35, emissive: 0x0a1220, emissiveIntensity: 0.18 });
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0xff5522, emissive: 0xff2a08, emissiveIntensity: 2.2, roughness: 0.4 });
    zoneMats.push(graniteMat, eyeMat);
    const part = (geo, x, y, z, opt = {}) => {
      const m = new THREE.Mesh(geo, opt.mat || graniteMat);
      m.position.set(x, y, z);
      if (opt.rx) m.rotation.x = opt.rx; if (opt.ry) m.rotation.y = opt.ry; if (opt.rz) m.rotation.z = opt.rz;
      if (opt.s) m.scale.set(opt.s[0], opt.s[1], opt.s[2]);
      dragonGrp.add(m); zoneGeos.push(geo); return m;
    };
    const S = (r, seg = 12) => new THREE.SphereGeometry(r, seg, seg);
    const C = (rt, rb, h, seg = 10) => new THREE.CylinderGeometry(rt, rb, h, seg);
    const K = (r, h, seg = 8) => new THREE.ConeGeometry(r, h, seg);
    // Body mass.
    part(S(1.9), 0, 1.7, -0.6, { s: [1.25, 1.25, 1.5] });                 // haunches/hips
    part(S(1.7), 0, 1.7, 0.6, { s: [1.35, 1.2, 1.3] });                   // lower belly
    part(S(1.4), 0, 3.1, 0.7, { s: [1.35, 1.35, 1.2] });                  // chest (rising)
    // Thighs + clawed forelegs.
    for (const sx of [-1, 1]) {
      part(S(0.9), sx * 1.25, 1.2, -0.4, { s: [1, 1.3, 1.2] });           // thigh
      part(C(0.35, 0.6, 2.4), sx * 1.15, 1.6, 1.3, { rx: 0.5 });          // upper foreleg
      part(C(0.28, 0.4, 1.6), sx * 1.15, 0.55, 2.0, { rx: 0.15 });        // lower foreleg
      part(S(0.5), sx * 1.15, 0.15, 2.5, { s: [1.2, 0.6, 1.4] });         // foot
      for (const cx of [-0.35, 0, 0.35]) part(K(0.1, 0.5, 5), sx * 1.15 + cx * 0.5, 0.12, 3.0, { rx: 1.5 }); // claws
    }
    // Shoulders + big shoulder spikes.
    for (const sx of [-1, 1]) {
      part(S(0.85), sx * 1.15, 3.2, 0.6);
      part(K(0.5, 3.6, 7), sx * 1.9, 3.9, 0.3, { rz: sx * 1.1, rx: -0.4 }); // shoulder spike
    }
    // Neck (two segments, curving up) + head.
    part(C(0.85, 1.1, 2.0), 0, 4.2, 0.5, { rx: -0.35 });
    part(C(0.6, 0.85, 1.8), 0, 5.6, 0.15, { rx: -0.15 });
    const head = part(S(0.75), 0, 6.5, 0.4, { s: [1.0, 0.9, 1.35] });     // skull
    part(K(0.42, 1.4, 8), 0, 6.35, 1.35, { rx: 1.57 });                   // snout
    part(S(0.4), 0, 6.0, 1.2, { s: [1.1, 0.6, 1.0] });                    // jaw
    // Horned frill (a crown of back-swept horns).
    for (const [hx, hy, hz, hr, hl, tilt] of [[0, 7.1, -0.1, 0.16, 1.3, -0.7], [-0.45, 7.0, 0.0, 0.15, 1.2, -0.7], [0.45, 7.0, 0.0, 0.15, 1.2, -0.7], [-0.7, 6.8, 0.1, 0.13, 1.0, -0.9], [0.7, 6.8, 0.1, 0.13, 1.0, -0.9]]) {
      part(K(hr, hl, 6), hx, hy, hz, { rx: tilt, rz: hx * 0.3 });
    }
    // Glowing eyes.
    part(S(0.12, 8), -0.35, 6.5, 1.15, { mat: eyeMat });
    part(S(0.12, 8), 0.35, 6.5, 1.15, { mat: eyeMat });
    // Back ridge spikes (neck → hips).
    for (let i = 0; i < 9; i++) {
      const f = i / 8;
      const zz = 0.4 - f * 3.0, yy = 5.6 - f * 3.4, sp = 0.7 - f * 0.35;
      part(K(0.18, sp * 2, 5), 0, yy + sp, zz, { rx: -0.2 });
    }
    // Folded wings (an arm strut + a membrane, tucked against the flanks).
    for (const sx of [-1, 1]) {
      part(C(0.22, 0.4, 4.2, 6), sx * 1.7, 3.6, -0.8, { rz: sx * 0.5, rx: -0.6 }); // wing arm
      part(K(1.6, 3.6, 4), sx * 2.1, 2.6, -1.4, { rz: sx * 0.4, rx: 1.4, s: [0.4, 1, 1.2] }); // folded membrane
      for (const fz of [0, 0.5, 1]) part(C(0.1, 0.16, 3.0, 5), sx * 2.2, 3.2 - fz, -1.6 - fz * 0.4, { rz: sx * (0.5 + fz * 0.2), rx: -0.5 }); // finger struts
    }
    // Spiked tail curling out to the (dragon's) right, ending in a point.
    let tx = 0, ty = 1.0, tz = -2.0, ta = 0;
    for (let i = 0; i < 16; i++) {
      const r = 0.65 * (1 - i / 18);
      ta += 0.18; tx += Math.sin(ta) * 0.55 + 0.05; tz -= 0.35 - i * 0.008; ty += Math.max(0, (i - 9) * 0.06);
      part(S(r), tx, ty, tz);
      if (i % 2 === 0 && i < 14) part(K(r * 0.5, r * 1.8, 5), tx, ty + r, tz, { rx: -0.3 });
    }
    part(K(0.28, 1.4, 5), tx + 0.4, ty + 0.2, tz, { rz: -0.8 }); // tail barb

    // Holographic dragon projection — a pixel-art dragon cast in the air in
    // front of the sculpt (behind the box), so the silhouette reads clearly as a
    // dragon. Two crossed planes (so it holds up off-axis) + a plinth beam.
    const holoTex = dragonHologramTexture();
    zoneTextures.push(holoTex);
    const holoMat = new THREE.MeshBasicMaterial({
      map: holoTex, color: 0x9fd4ff, transparent: true, opacity: 0.82,
      depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    });
    zoneMats.push(holoMat);
    // A single profile plane facing the arriving player so the dragon silhouette
    // reads clearly (crossed planes washed out under additive blend).
    const holoGeo = new THREE.PlaneGeometry(10.5, 11.3);
    const holo = new THREE.Mesh(holoGeo, holoMat);
    holo.position.set(0, -7.6, -58.5); rec.group.add(holo);
    zoneGeos.push(holoGeo);
    // A faint projector base ring + a thin upward beam (kept subtle so it frames
    // rather than drowns the silhouette).
    const beamMat = new THREE.MeshBasicMaterial({ color: 0x4a8fd0, transparent: true, opacity: 0.07, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    zoneMats.push(beamMat);
    const beamGeo = new THREE.ConeGeometry(2.6, 11, 20, 1, true);
    const beam = new THREE.Mesh(beamGeo, beamMat); beam.position.set(0, -8.6, -58.5); rec.group.add(beam);
    zoneGeos.push(beamGeo);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x7fc0ff, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    zoneMats.push(ringMat);
    const ringGeo = new THREE.RingGeometry(1.6, 2.4, 28);
    const ring = new THREE.Mesh(ringGeo, ringMat); ring.position.set(0, -13.9, -58.5); ring.rotation.x = -Math.PI / 2; rec.group.add(ring);
    zoneGeos.push(ringGeo);
    const holoLight = new THREE.PointLight(0x7fc0ff, 1.2, 24, 2.0);
    holoLight.position.set(0, -6, -58.5); rec.group.add(holoLight);
    z9Holo = { mat: holoMat, mat2: beamMat, light: holoLight };

    // The open black box at the dragon's feet — an opening looking down onto a
    // city far below. Rim walls around a 4x4 hole; a luminous aerial-city plane
    // recessed beneath, dark shaft walls, and a warm up-glow.
    const BX = 0, BZ = -56;               // box center (zone-local)
    const boxMat = new THREE.MeshStandardMaterial({ color: 0x050506, roughness: 0.5, metalness: 0.4, emissive: 0x0a1626, emissiveIntensity: 0.25 });
    zoneMats.push(boxMat);
    // Raised open-topped box walls — a prominent black cube with a glowing
    // opening in its top looking down onto the city.
    for (const [dx, dz, w, d] of [[-2.4, 0, 0.8, 5.2], [2.4, 0, 0.8, 5.2], [0, -2.4, 5.2, 0.8], [0, 2.4, 5.2, 0.8]]) {
      addZoneBox2(rec, w, 2.0, d, BX + dx, -14.0, BZ + dz, boxMat); // rim (top ~ -13.0)
    }
    // Corner posts read the cube's edges under the rim/key light.
    const postMat = new THREE.MeshStandardMaterial({ color: 0x08080c, roughness: 0.4, metalness: 0.5, emissive: 0x0c1c30, emissiveIntensity: 0.35 });
    zoneMats.push(postMat);
    for (const cx of [-2.6, 2.6]) for (const cz of [-2.6, 2.6]) addZoneBox2(rec, 0.55, 2.3, 0.55, BX + cx, -13.85, BZ + cz, postMat);
    // A thin luminous lip framing the opening so it glows like a window.
    const lipMat = new THREE.MeshBasicMaterial({ color: 0x7fb4ff });
    zoneMats.push(lipMat);
    for (const [dx, dz, w, d] of [[-2.0, 0, 0.14, 4.0], [2.0, 0, 0.14, 4.0], [0, -2.0, 4.0, 0.14], [0, 2.0, 4.0, 0.14]]) {
      const lg = new THREE.BoxGeometry(w, 0.1, d);
      const lm = new THREE.Mesh(lg, lipMat); lm.position.set(BX + dx, -12.95, BZ + dz);
      rec.group.add(lm); zoneGeos.push(lg);
    }
    const shaftMat = new THREE.MeshStandardMaterial({ color: 0x0a0b10, roughness: 0.9, side: THREE.DoubleSide });
    zoneMats.push(shaftMat);
    for (const [dx, dz, w, d, ry] of [[-2, 0, 3.4, 0.1, 0], [2, 0, 3.4, 0.1, 0], [0, -2, 3.4, 0.1, Math.PI / 2], [0, 2, 3.4, 0.1, Math.PI / 2]]) {
      const g = new THREE.PlaneGeometry(w, 3.4);
      const m = new THREE.Mesh(g, shaftMat); m.position.set(BX + dx, -16.7, BZ + dz); m.rotation.y = ry;
      rec.group.add(m); zoneGeos.push(g);
    }
    const cityTex = cityBelowTexture();
    zoneTextures.push(cityTex);
    cityFallUrl = cityTex.image.toDataURL(); // reused by the fall overlay
    const cityMat = new THREE.MeshBasicMaterial({ map: cityTex, side: THREE.DoubleSide });
    const cityGeo = new THREE.PlaneGeometry(4.2, 4.2); // fills the opening when you look in
    const cityPlane = new THREE.Mesh(cityGeo, cityMat);
    cityPlane.position.set(BX, -18.0, BZ); cityPlane.rotation.x = -Math.PI / 2;
    rec.group.add(cityPlane); zoneGeos.push(cityGeo); zoneMats.push(cityMat);
    // A second, larger faint city layer deeper down for a sense of depth.
    const cityFar = new THREE.Mesh(new THREE.PlaneGeometry(7, 7), new THREE.MeshBasicMaterial({ map: cityTex, transparent: true, opacity: 0.5, side: THREE.DoubleSide }));
    cityFar.position.set(BX, -22.5, BZ); cityFar.rotation.x = -Math.PI / 2;
    rec.group.add(cityFar); zoneGeos.push(cityFar.geometry); zoneMats.push(cityFar.material);
    const upGlow = new THREE.PointLight(0xffd9a0, 1.6, 18, 2.0);
    upGlow.position.set(BX, -15.5, BZ); rec.group.add(upGlow);

    // Dragon dialogue (talk before you jump), placed clear of the box footprint.
    interactables.push({ id: 'dragon', zone: 'z9', pos: zoneToAnchor(rec, 0, -14, -50), talking: false });

    // Fall trigger: stepping over the box opening drops the player to the city
    // (the hub, where the ship waits). The generic top return arch stays as the
    // "didn't jump" exit.
    const FALL_DUR = 1.2, FALL_OUT = 0.5;
    zoneUpdaters.push((t, dt, playerPos) => {
      if (activeZone === 'z9') upGlow.intensity = 1.1 + Math.sin(t * 2.0) * 0.3;
      // Holographic dragon flicker — a subtle scanline shimmer + occasional blink.
      if (activeZone === 'z9' && z9Holo) {
        const base = 0.6 + Math.sin(t * 3.1) * 0.06;
        const blink = (Math.sin(t * 27.0) > 0.93) ? 0.5 : 1.0; // rare quick dropout
        z9Holo.mat.opacity = base * blink;
        z9Holo.light.intensity = 1.1 + Math.sin(t * 4.0) * 0.4;
      }
      // Arm the fall when the player stands over the opening.
      if (activeZone === 'z9' && fade.phase === 'idle' && !z9Fall) {
        _zLocal.copy(playerPos).applyQuaternion(anchorQ).add(anchorPos)
          .sub(rec.frame.pos).applyQuaternion(rec.frame.qInv);
        if (Math.abs(_zLocal.x - BX) < 2.1 && Math.abs(_zLocal.z - BZ) < 2.1) {
          z9Fall = { t: 0, tp: false };
          if (!flags.dragonGiftReceived) { flags.dragonGiftReceived = true; saveFlags(flags); }
        }
      }
      if (z9Fall) {
        z9Fall.t += dt;
        const T = z9Fall.t;
        if (T <= FALL_DUR) setCityFall(T / FALL_DUR, 1 + (T / FALL_DUR) * 1.6); // rush toward the city
        if (T > FALL_DUR && !z9Fall.tp) {
          pendingTeleport = { pos: hubReturnDest.clone(), heading: hubReturnHeading.clone() };
          activeZone = 'hub';
          applyZoneVisibility();
          z9Fall.tp = true;
        }
        if (T > FALL_DUR) setCityFall(Math.max(0, 1 - (T - FALL_DUR) / FALL_OUT), 2.6); // reveal the hub
        if (T > FALL_DUR + FALL_OUT) { setCityFall(-1); z9Fall = null; }
      }
    });
  }

  // Full-screen fall-to-city overlay (the aerial city rushing up as you drop).
  function setCityFall(opacity, zoom) {
    if (opacity < 0) {
      if (cityFallEl && cityFallEl.parentNode) cityFallEl.parentNode.removeChild(cityFallEl);
      cityFallEl = null; return;
    }
    if (!cityFallEl) {
      cityFallEl = document.createElement('div');
      cityFallEl.style.cssText =
        'position:fixed;inset:0;z-index:19;pointer-events:none;background-size:cover;' +
        'background-position:center;transition:none;' +
        (cityFallUrl ? `background-image:url(${cityFallUrl});` : 'background:#e8b980;');
      document.body.appendChild(cityFallEl);
    }
    cityFallEl.style.opacity = String(opacity);
    cityFallEl.style.transform = `scale(${zoom || 1})`;
  }

  // Joshua walks off toward the door (fires once from endInteract).
  function startJoshuaDeparture() {
    if (joshuaFig && !joshuaDep) joshuaDep = { t: 0 };
  }

  /* ------------------------------------------------------------------
   * Ambient (non-dialogue) zones: Z1 Mind, Z2 Body, Z5 Order, Z6 Life,
   * Z7 Time, Z8 Eternity. Each builds its set piece + an updater gated on
   * being the active zone.
   * ---------------------------------------------------------------- */
  function buildAmbientZones() {
    buildZone1(); buildZone2(); buildZone5(); buildZone6(); buildZone7(); buildZone8();
  }

  // Inward gradient sky dome for a zone.
  function addDome(rec, radius, topHex, botHex) {
    const tex = gradientTexture(topHex, botHex);
    const geo = new THREE.SphereGeometry(radius, 20, 14);
    const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false });
    const dome = new THREE.Mesh(geo, mat);
    rec.group.add(dome);
    zoneGeos.push(geo); zoneMats.push(mat); zoneTextures.push(tex);
    return { dome, mat, tex };
  }

  // Z1 Mind — sidewalk → alley → park → autumn forest, falling leaves, the
  // woman in the light.
  function buildZone1() {
    const rec = zoneById['z1'];
    rec.group.add(new THREE.AmbientLight(0xffcf9a, 0.5));
    addDome(rec, 90, '#4a3422', '#d8974e');

    // Sidewalk slabs + city facades at the entrance (+Z end).
    const walkMat = new THREE.MeshStandardMaterial({ color: 0x6a6660, roughness: 0.95 });
    zoneMats.push(walkMat);
    for (let z = 12; z >= 2; z -= 2) addZoneBox(rec, 6, 0.1, 2, 0, 0.05, z, walkMat);
    const facRng = mulberry32(0x1a10);
    for (const [fx, fz, fw] of [[-6, 9, 5], [6, 9, 5], [-7, 4, 4]]) {
      const facTex = facadeTexture(facRng);
      zoneTextures.push(facTex);
      const fm = new THREE.MeshStandardMaterial({ map: facTex, roughness: 0.85 });
      zoneMats.push(fm);
      const fg = new THREE.BoxGeometry(fw, 12, 4);
      const fmesh = new THREE.Mesh(fg, fm); fmesh.position.set(fx, 6, fz);
      rec.group.add(fmesh); zoneGeos.push(fg);
    }

    // Graffiti alley: colorful spray-art on both walls (z ~ -1..-8).
    for (const [gx, side] of [[-4.5, 1], [4.5, 2]]) {
      const gTex = graffitiTexture(mulberry32(0x2b00 + side), null);
      zoneTextures.push(gTex);
      gTex.repeat.set(2, 1); gTex.wrapS = THREE.RepeatWrapping;
      const gm = new THREE.MeshStandardMaterial({ map: gTex, roughness: 0.9, side: THREE.DoubleSide });
      zoneMats.push(gm);
      const gg = new THREE.PlaneGeometry(14, 6);
      const gp = new THREE.Mesh(gg, gm);
      gp.position.set(gx, 3, -4.5); gp.rotation.y = gx < 0 ? Math.PI / 2 : -Math.PI / 2;
      rec.group.add(gp); zoneGeos.push(gg);
      addZoneBox(rec, 0.5, 6, 14, gx, 3, -4.5, 0x2e2822); // wall behind the art
    }

    // Park: a grass patch, benches, and the lone "1" lamppost (glyph motif).
    addZoneBox(rec, 26, 0.06, 18, 0, 0.03, -20, 0x3f5a30); // grass
    addZoneBox(rec, 2.0, 0.4, 0.6, -6, 0.5, -20, AC.COL_WOOD);
    addZoneBox(rec, 2.0, 0.4, 0.6, 6, 0.5, -22, AC.COL_WOOD);
    addZoneBox(rec, 0.22, 6.5, 0.22, 8, 3.25, -14, 0x2a2620); // lamppost = "1"
    const lampMat = new THREE.MeshStandardMaterial({ color: 0xffe6b0, emissive: 0xffcf80, emissiveIntensity: 1.1, roughness: 0.5 });
    zoneMats.push(lampMat);
    const lampGeo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
    const lamp = new THREE.Mesh(lampGeo, lampMat); lamp.position.set(8, 6.6, -14);
    rec.group.add(lamp); zoneGeos.push(lampGeo);
    const lampLight = new THREE.PointLight(0xffcf80, 0.6, 18, 2.0);
    lampLight.position.set(8, 6.4, -14); rec.group.add(lampLight);

    // Autumn forest: denser trunks + warm canopies.
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3324, roughness: 0.95 });
    const leafMats = [0xd9772a, 0xe0a338, 0xc85a26].map((c) =>
      new THREE.MeshStandardMaterial({ color: c, roughness: 0.85 }));
    zoneMats.push(trunkMat, ...leafMats);
    const treeRng = mulberry32(0x1111);
    for (let i = 0; i < 45; i++) {
      const tx = (treeRng() - 0.5) * 30;
      const tz = -32 - treeRng() * 42;
      const th = 4 + treeRng() * 3;
      const tG = new THREE.CylinderGeometry(0.25, 0.35, th, 6);
      const tm = new THREE.Mesh(tG, trunkMat); tm.position.set(tx, th / 2, tz);
      rec.group.add(tm); zoneGeos.push(tG);
      const cG = new THREE.SphereGeometry(1.6 + treeRng(), 8, 6);
      const cm = new THREE.Mesh(cG, leafMats[i % 3]);
      cm.position.set(tx, th + 0.6, tz); cm.scale.y = 0.8;
      rec.group.add(cm); zoneGeos.push(cG);
    }

    // The woman standing in a shaft of light.
    const woman = makeFigure({ seated: false, skin: 0xe8cba0, cloth: 0xf2e6cc, seed: 11 });
    woman.group.position.set(0, 0, -58);
    rec.group.add(woman.group); figures.push(woman);
    const coneGeo = new THREE.ConeGeometry(3, 13, 16, 1, true);
    const coneMat = new THREE.MeshBasicMaterial({
      color: 0xfff2d0, transparent: true, opacity: 0.1, side: THREE.DoubleSide,
      depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const cone = new THREE.Mesh(coneGeo, coneMat);
    cone.position.set(0, 6.5, -58); rec.group.add(cone);
    zoneGeos.push(coneGeo); zoneMats.push(coneMat);
    const wlight = new THREE.PointLight(0xffe6c0, 1.4, 34, 2.0);
    wlight.position.set(0, 5, -58); rec.group.add(wlight);
    interactables.push({ id: 'z1woman', zone: 'z1', pos: zoneToAnchor(rec, 0, 0, -55), talking: false });

    // The bird — the PDD's core mechanic: it perches ahead of you and flits to
    // the next waypoint (sidewalk → alley → park → forest → the woman) each time
    // you close within ~6 m, leading you through the zone.
    const bird = new THREE.Group();
    const birdBody = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 5),
      new THREE.MeshStandardMaterial({ color: 0x2a2a30, roughness: 0.8 }));
    birdBody.scale.set(1, 0.9, 1.4);
    const wingMat = new THREE.MeshStandardMaterial({ color: 0x3a3a44, roughness: 0.8, side: THREE.DoubleSide });
    const wingGeo = new THREE.PlaneGeometry(0.4, 0.2);
    const wingL = new THREE.Mesh(wingGeo, wingMat); wingL.position.x = -0.2;
    const wingR = new THREE.Mesh(wingGeo, wingMat); wingR.position.x = 0.2;
    bird.add(birdBody, wingL, wingR);
    bird.position.set(0, 1.6, 6);
    rec.group.add(bird);
    zoneGeos.push(birdBody.geometry, wingGeo); zoneMats.push(birdBody.material, wingMat);
    const birdWays = [
      new THREE.Vector3(0, 1.6, 6), new THREE.Vector3(0, 2.0, -1),
      new THREE.Vector3(3, 2.2, -18), new THREE.Vector3(-2, 2.6, -40),
      new THREE.Vector3(0, 2.0, -54),
    ];
    let birdWp = 0;

    // Falling leaves (golden slow-motion).
    const N = 220;
    const leafGeo = new THREE.PlaneGeometry(0.22, 0.22);
    const leafMat = new THREE.MeshBasicMaterial({
      color: 0xe0902e, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false,
    });
    const leaves = new THREE.InstancedMesh(leafGeo, leafMat, N);
    leaves.frustumCulled = false;
    rec.group.add(leaves);
    zoneGeos.push(leafGeo); zoneMats.push(leafMat);
    const lr = mulberry32(0x2222);
    const base = [];
    for (let i = 0; i < N; i++) {
      base.push({ x: (lr() - 0.5) * 30, y: lr() * 22, z: -30 - lr() * 46, ph: lr() * 6.28, sp: 0.35 + lr() * 0.5 });
    }
    const _lm = new THREE.Matrix4();
    zoneUpdaters.push((t, dt, playerPos) => {
      if (activeZone !== 'z1') { birdAnchorPos = null; return; }
      // Leaves.
      for (let i = 0; i < N; i++) {
        const b = base[i];
        let y = b.y - ((t * b.sp) % 24);
        if (y < 0) y += 24;
        const x = b.x + Math.sin(t * 0.8 + b.ph) * 0.8;
        _lm.makeRotationZ(t + b.ph);
        _lm.setPosition(x, y, b.z);
        leaves.setMatrixAt(i, _lm);
      }
      leaves.instanceMatrix.needsUpdate = true;
      // Bird: player in zone-local; advance when close; ease toward the perch.
      _zLocal.copy(playerPos).applyQuaternion(anchorQ).add(anchorPos)
        .sub(rec.frame.pos).applyQuaternion(rec.frame.qInv);
      const target = birdWays[birdWp];
      if (birdWp < birdWays.length - 1 && _zLocal.distanceTo(target) < 6) birdWp++;
      const tgt = birdWays[birdWp];
      birdDist = _zLocal.distanceTo(bird.position);
      bird.position.lerp(tgt, Math.min(1, dt * 1.6));
      bird.position.y += Math.sin(t * 3) * 0.02;
      bird.rotation.y = Math.atan2(tgt.x - bird.position.x, tgt.z - bird.position.z);
      const flap = Math.sin(t * 18) * 0.9;
      wingL.rotation.z = flap; wingR.rotation.z = -flap;
      // Expose the bird's anchor-local position for the chirp proximity gain.
      if (!birdAnchorPos) birdAnchorPos = new THREE.Vector3();
      birdAnchorPos.copy(bird.position).applyQuaternion(rec.frame.q).add(rec.frame.pos)
        .sub(anchorPos).applyQuaternion(anchorQInv);
    });
  }

  // Z2 Body — a warm room whose surfaces breathe as a grid of panels extruding
  // outward around the player (the chapter's "ceiling, walls, floor shoot off
  // into extruding directions", kept abstract/tasteful).
  function buildZone2() {
    const rec = zoneById['z2'];
    rec.group.add(new THREE.AmbientLight(0x4a3020, 0.5));
    const breathLight = new THREE.PointLight(0xffb070, 0.8, 34, 2.0);
    breathLight.position.set(0, 3.2, 0); rec.group.add(breathLight);

    // "Shared reality" (Ch.2): two soul-lights — one warm rose, one amber —
    // drift apart and draw back together, merging into a single glow at the
    // room's centre ("connected as if we were one unit of creation"). Kept
    // abstract: two auras of light, no figures. The room breathes on a heartbeat.
    const soulGeo = new THREE.SphereGeometry(0.7, 16, 12);
    zoneGeos.push(soulGeo);
    const soulAMat = new THREE.MeshBasicMaterial({ color: 0xff7a9a, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false });
    const soulBMat = new THREE.MeshBasicMaterial({ color: 0xffc070, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false });
    zoneMats.push(soulAMat, soulBMat);
    const soulA = new THREE.Mesh(soulGeo, soulAMat); soulA.scale.set(1, 1.9, 1);
    const soulB = new THREE.Mesh(soulGeo, soulBMat); soulB.scale.set(1, 1.9, 1);
    rec.group.add(soulA, soulB);
    const soulLightA = new THREE.PointLight(0xff6a8a, 0.9, 16, 2.0);
    const soulLightB = new THREE.PointLight(0xffb060, 0.9, 16, 2.0);
    rec.group.add(soulLightA, soulLightB);
    const mergeMat = new THREE.MeshBasicMaterial({ color: 0xfff0e0, transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false });
    zoneMats.push(mergeMat);
    const mergeGlow = new THREE.Mesh(soulGeo, mergeMat); mergeGlow.scale.set(1.6, 2.4, 1.6); mergeGlow.position.set(0, 2.4, 0);
    rec.group.add(mergeGlow);
    const R = 12, WH = 6.5;
    const PER = 8;                         // 8×8 panels per surface
    const cell = (R * 2) / PER;
    const panelMat = new THREE.MeshStandardMaterial({ color: 0x7a4f38, roughness: 0.92, side: THREE.DoubleSide });
    // A faint "2" traced in slightly discolored panels on the back wall (glyph).
    const glyph2 = new Set(['1,1', '2,1', '3,1', '3,2', '2,3', '1,4', '1,5', '2,5', '3,5']);
    zoneMats.push(panelMat);
    // Five surfaces: back(-Z), left(-X), right(+X), ceiling(+Y), floor(y0).
    // Each panel has a base position + outward normal; the grid extrudes.
    const panelGeo = new THREE.PlaneGeometry(cell * 0.92, cell * 0.92);
    zoneGeos.push(panelGeo);
    const surfaces = [
      { n: [0, 0, 1], o: [0, WH / 2, -R], u: [1, 0, 0], v: [0, 1, 0], rot: [0, 0, 0] },        // back
      { n: [1, 0, 0], o: [-R, WH / 2, 0], u: [0, 0, 1], v: [0, 1, 0], rot: [0, Math.PI / 2, 0] }, // left
      { n: [-1, 0, 0], o: [R, WH / 2, 0], u: [0, 0, 1], v: [0, 1, 0], rot: [0, Math.PI / 2, 0] }, // right
      { n: [0, -1, 0], o: [0, WH, 0], u: [1, 0, 0], v: [0, 0, 1], rot: [Math.PI / 2, 0, 0] },    // ceiling
      { n: [0, 1, 0], o: [0, 0.02, 0], u: [1, 0, 0], v: [0, 0, 1], rot: [Math.PI / 2, 0, 0] },   // floor
    ];
    const total = surfaces.length * PER * PER;
    const panels = new THREE.InstancedMesh(panelGeo, panelMat, total);
    panels.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(total * 3), 3);
    rec.group.add(panels);
    const cells = [];
    let idx = 0;
    const _pq = new THREE.Quaternion(), _pe = new THREE.Euler();
    for (const s of surfaces) {
      _pe.set(s.rot[0], s.rot[1], s.rot[2]); _pq.setFromEuler(_pe);
      for (let iu = 0; iu < PER; iu++) {
        for (let iv = 0; iv < PER; iv++) {
          const cu = (iu - (PER - 1) / 2) * cell;
          const cv = (iv - (PER - 1) / 2) * cell;
          const bx = s.o[0] + s.u[0] * cu + s.v[0] * cv;
          const by = s.o[1] + s.u[1] * cu + s.v[1] * cv;
          const bz = s.o[2] + s.u[2] * cu + s.v[2] * cv;
          const tinted = s === surfaces[0] && glyph2.has(`${iu},${iv}`);
          cells.push({ bx, by, bz, n: s.n, q: _pq.clone(), ph: (iu + iv) * 0.4 });
          panels.instanceColor.setXYZ(idx, tinted ? 1.25 : 1, tinted ? 1.1 : 1, tinted ? 0.85 : 1);
          idx++;
        }
      }
    }
    panels.instanceColor.needsUpdate = true;
    // Collision: solid room walls at the base extents (open +Z for the return).
    const wt = 0.4;
    rec.structure = makeStructure(0, 0, 0,
      [{ x0: -R, x1: R, z0: -R, z1: R, y: 0 }],
      [
        { x0: -R, x1: R, z0: -R - wt, z1: -R, y0: 0, y1: WH },
        { x0: -R - wt, x1: -R, z0: -R, z1: R, y0: 0, y1: WH },
        { x0: R, x1: R + wt, z0: -R, z1: R, y0: 0, y1: WH },
      ], R + 2);
    rec.r2 = (R + 12) ** 2;
    const _pm = new THREE.Matrix4(), _pv = new THREE.Vector3(), _ps = new THREE.Vector3(1, 1, 1);
    zoneUpdaters.push((t) => {
      if (activeZone !== 'z2') return;
      // Heartbeat (a lub-dub every ~1.3 s) drives the breathing + the glow.
      const x = (t / 1.3) % 1;
      const g1 = ((x - 0.12) / 0.05) ** 2, g2 = ((x - 0.30) / 0.05) ** 2;
      const heart = Math.exp(-g1) + 0.6 * Math.exp(-g2);
      const breath = Math.sin(t * 0.4) * 0.5 + 0.5;
      breathLight.intensity = 0.5 + breath * 0.5 + heart * 0.4;
      // The two souls swing apart and back together (merge), on a slow cycle.
      const near = Math.sin(t * 0.28) * 0.5 + 0.5;   // 1 = together, 0 = apart
      const sep = 3.6 * (1 - near);
      const bob = Math.sin(t * 1.1) * 0.15;
      soulA.position.set(-sep, 2.4 + bob, 0.4 * (1 - near));
      soulB.position.set(sep, 2.4 - bob, -0.4 * (1 - near));
      soulLightA.position.copy(soulA.position);
      soulLightB.position.copy(soulB.position);
      const pulse = 0.45 + heart * 0.3;
      soulAMat.opacity = pulse; soulBMat.opacity = pulse;
      const merged = Math.max(0, near - 0.7) / 0.3; // ramps up as they close
      mergeMat.opacity = merged * (0.5 + heart * 0.4);
      mergeGlow.scale.setScalar(1.6 + heart * 0.3 * merged);
      // Breathing panel grid extrudes on the heartbeat.
      const amp = 0.28 + heart * 0.22;
      for (let i = 0; i < cells.length; i++) {
        const c = cells[i];
        const d = Math.sin(t * 0.4 + c.ph) * breath * amp;
        _pv.set(c.bx + c.n[0] * d, c.by + c.n[1] * d, c.bz + c.n[2] * d);
        _pm.compose(_pv, c.q, _ps);
        panels.setMatrixAt(i, _pm);
      }
      panels.instanceMatrix.needsUpdate = true;
    });
  }

  // Z5 Order — a ribbon into a void lined with floating memory frames.
  function buildZone5() {
    const rec = zoneById['z5'];
    rec.group.add(new THREE.AmbientLight(0x202028, 0.4));
    addDome(rec, 100, '#050507', '#0a0a12');
    // A 4 m ribbon walkway extending 80 m into the void.
    const ribMat = new THREE.MeshStandardMaterial({ color: 0x1a1a20, roughness: 0.9 });
    zoneMats.push(ribMat);
    addZoneBox2(rec, 4, 0.4, 88, 0, -0.2, -38, ribMat); // z from +6 to -82
    rec.structure = makeStructure(0, 0, 0,
      [{ x0: -2, x1: 2, z0: -82, z1: 6, y: 0 }], [], 90);
    rec.r2 = (90) ** 2;
    // ~20 floating frames staggered the full length; one forms the "5" glyph.
    const frames = [];
    const fr = mulberry32(0x5555);
    const glyphFrame = 9; // this frame's art is arranged as a 5
    for (let i = 0; i < 20; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const z = -4 - i * 3.8;
      const y = 1.6 + fr() * 2.4;
      const x = side * (2.6 + fr() * 1.4);
      addZoneBox(rec, 1.7, 1.3, 0.12, x, y, z, 0x2a2622);
      const imgTex = memoryTexture(fr);
      if (i === glyphFrame) { const g = imgTex.image.getContext('2d'); drawGlyph(g, 5, 64, 64, 90, '#ffffff', 0.5); imgTex.needsUpdate = true; }
      const imgGeo = new THREE.PlaneGeometry(1.4, 1.0);
      const imgMat = new THREE.MeshStandardMaterial({
        map: imgTex, emissive: 0xffffff, emissiveMap: imgTex, emissiveIntensity: 0.15,
      });
      const img = new THREE.Mesh(imgGeo, imgMat);
      img.position.set(x, y, z + 0.08 * side + (side < 0 ? 0.09 : -0.09));
      img.rotation.y = side < 0 ? 0.2 : -0.2;
      rec.group.add(img);
      zoneGeos.push(imgGeo); zoneMats.push(imgMat); zoneTextures.push(imgTex);
      frames.push({ img, mat: imgMat, anchorPos: zoneToAnchor(rec, x, y, z), baseY: y, ph: fr() * 6.28 });
    }
    // Sparse floating dust motes along the ribbon.
    const M = 70;
    const moteGeo = new THREE.PlaneGeometry(0.05, 0.05);
    const moteMat = new THREE.MeshBasicMaterial({ color: 0x9aa0c0, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending });
    const motes = new THREE.InstancedMesh(moteGeo, moteMat, M);
    motes.frustumCulled = false; rec.group.add(motes);
    zoneGeos.push(moteGeo); zoneMats.push(moteMat);
    const mr = mulberry32(0x50fe);
    const mb = [];
    for (let i = 0; i < M; i++) mb.push({ x: (mr() - 0.5) * 8, y: 0.5 + mr() * 5, z: -mr() * 80, ph: mr() * 6.28 });
    const _mm = new THREE.Matrix4();
    zoneUpdaters.push((t, dt, playerPos) => {
      if (activeZone !== 'z5') return;
      for (const f of frames) {
        f.img.position.y = f.baseY + Math.sin(t * 0.6 + f.ph) * 0.15;
        const near = f.anchorPos.distanceToSquared(playerPos) < 25; // within 5 m
        const target = near ? 1.0 : 0.15;
        f.mat.emissiveIntensity += (target - f.mat.emissiveIntensity) * Math.min(1, dt * 3);
        if (near) f.mat.map.offset.x = (f.mat.map.offset.x + dt * 0.05) % 1;
      }
      for (let i = 0; i < M; i++) {
        const b = mb[i];
        _mm.makeTranslation(b.x + Math.sin(t * 0.3 + b.ph) * 0.6, b.y + Math.sin(t * 0.2 + b.ph) * 0.4, b.z);
        motes.setMatrixAt(i, _mm);
      }
      motes.instanceMatrix.needsUpdate = true;
    });
  }

  // Z6 Life — mountain overlook at dusk with a submerged lake below.
  function buildZone6() {
    const rec = zoneById['z6'];
    rec.group.add(new THREE.AmbientLight(0x30364a, 0.5));
    const dome = addDome(rec, 95, '#141a2e', '#5a4a6a');
    // Larger skyline + bridge silhouette on the dome.
    const skyTex = silhouetteTexture('skyline');
    const skyGeo = new THREE.PlaneGeometry(90, 30);
    const skyMat = new THREE.MeshBasicMaterial({ map: skyTex, transparent: true, depthWrite: false });
    const sky = new THREE.Mesh(skyGeo, skyMat);
    sky.position.set(0, 10, -60); rec.group.add(sky);
    zoneGeos.push(skyGeo); zoneMats.push(skyMat); zoneTextures.push(skyTex);
    // Crescent moon high on the dome, and its dim flipped reflection down on the
    // lake — together they close into a "6" (glyph motif).
    const moonTex = crescentTexture(false);
    zoneTextures.push(moonTex);
    const moonMat = new THREE.MeshBasicMaterial({ map: moonTex, transparent: true, depthWrite: false });
    const moonGeo = new THREE.PlaneGeometry(7, 7);
    const moon = new THREE.Mesh(moonGeo, moonMat); moon.position.set(-8, 26, -52);
    rec.group.add(moon); zoneGeos.push(moonGeo); zoneMats.push(moonMat);
    const reflTex = crescentTexture(true);
    zoneTextures.push(reflTex);
    const reflMat = new THREE.MeshBasicMaterial({ map: reflTex, transparent: true, opacity: 0.28, depthWrite: false });
    const refl = new THREE.Mesh(moonGeo, reflMat);
    refl.position.set(-8, -1.85, -46); refl.rotation.x = -Math.PI / 2;
    rec.group.add(refl); zoneMats.push(reflMat);
    // Lonesome tree at the crag lip (up on the overlook).
    const trunkG = new THREE.CylinderGeometry(0.3, 0.4, 5, 6);
    const trunkM = new THREE.MeshStandardMaterial({ color: 0x2a2018, roughness: 0.95 });
    const trunk = new THREE.Mesh(trunkG, trunkM); trunk.position.set(9, 8.5, -10);
    rec.group.add(trunk); zoneGeos.push(trunkG); zoneMats.push(trunkM);
    const canopy = new THREE.Mesh(new THREE.SphereGeometry(2.2, 8, 6), new THREE.MeshStandardMaterial({ color: 0x243026, roughness: 0.9 }));
    canopy.position.set(9, 11.5, -10); canopy.scale.y = 0.7; rec.group.add(canopy);
    zoneGeos.push(canopy.geometry); zoneMats.push(canopy.material);

    // Crag: climb up from the arrival area to a raised overlook, then descend
    // into the lake below.
    const surfaces = [
      { x0: -30, x1: 30, z0: 6, z1: 30, y: 0 },                          // arrival
      { ramp: true, x0: -5, x1: 5, z0: -4, z1: 6, zA: 6, zB: -4, yA: 0, yB: 8 },
      { x0: -16, x1: 16, z0: -20, z1: -4, y: 8 },                        // overlook
      { ramp: true, x0: -3, x1: 3, z0: -38, z1: -20, zA: -20, zB: -38, yA: 8, yB: -6 },
      { x0: -12, x1: 12, z0: -56, z1: -38, y: -6 },                      // lake floor
    ];
    const wl = { y0: -8, y1: 10 };
    const walls = [
      { x0: -5.4, x1: -5.0, z0: -4, z1: 6, ...wl },        // climb ramp guards
      { x0: 5.0, x1: 5.4, z0: -4, z1: 6, ...wl },
      { x0: -3.4, x1: -3.0, z0: -38, z1: -20, ...wl },     // descent ramp guards
      { x0: 3.0, x1: 3.4, z0: -38, z1: -20, ...wl },
      { x0: -12, x1: 12, z0: -56, z1: -55.5, ...wl },      // lake basin
      { x0: -12, x1: -11.5, z0: -56, z1: -38, ...wl },
      { x0: 11.5, x1: 12, z0: -56, z1: -38, ...wl },
    ];
    rec.structure = makeStructure(0, 0, 0, surfaces, walls, 60);
    rec.r2 = (60 + 12) ** 2;
    // Overlook guard rail + a couple of crag rocks.
    addZoneBox(rec, 20, 0.5, 0.2, 0, 8.9, -19.8, 0x3a3028);
    for (const [rx, ry, rz] of [[-13, 8.4, -12], [13, 8.4, -14], [7, 8.3, -6]]) {
      const rk = new THREE.Mesh(new THREE.DodecahedronGeometry(1.4), new THREE.MeshStandardMaterial({ color: 0x40403c, roughness: 0.95 }));
      rk.position.set(rx, ry, rz); rk.scale.set(1, 0.7, 1);
      rec.group.add(rk); zoneGeos.push(rk.geometry); zoneMats.push(rk.material);
    }
    // Dark translucent water disc at the lake rim (y ~ -2).
    const waterGeo = new THREE.PlaneGeometry(24, 24);
    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x0a1420, transparent: true, opacity: 0.72, roughness: 0.3, side: THREE.DoubleSide,
    });
    const water = new THREE.Mesh(waterGeo, waterMat);
    water.position.set(0, -2, -46); water.rotation.x = -Math.PI / 2;
    rec.group.add(water); zoneGeos.push(waterGeo); zoneMats.push(waterMat);
    // Rebirth vision: god-ray cones + a brightening light (fires once).
    const visionGrp = new THREE.Group();
    visionGrp.position.set(0, -6, -46); visionGrp.visible = false;
    rec.group.add(visionGrp);
    const rayMat = new THREE.MeshBasicMaterial({
      color: 0xdfeaff, transparent: true, opacity: 0.0, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    zoneMats.push(rayMat);
    for (let i = 0; i < 4; i++) {
      const rg = new THREE.ConeGeometry(1.4, 12, 12, 1, true);
      const rm = new THREE.Mesh(rg, rayMat);
      rm.position.set((i - 1.5) * 2.2, 8, 0); rm.rotation.x = Math.PI;
      visionGrp.add(rm); zoneGeos.push(rg);
    }
    const visionLight = new THREE.PointLight(0xdfeaff, 0, 30, 2.0);
    visionLight.position.set(0, 8, 0); visionGrp.add(visionLight);

    // Blue submersion overlay element (created lazily).
    zoneUpdaters.push((t, dt, playerPos) => {
      if (activeZone !== 'z6') { setZ6Tint(0); return; }
      // Player zone-local y (depth below the overlook).
      _surf.copy(playerPos).applyQuaternion(anchorQ).add(anchorPos);
      _z6Local.copy(_surf).sub(rec.frame.pos).applyQuaternion(rec.frame.qInv);
      const submerged = _z6Local.y < -2.5;
      if (submerged) {
        z6Submerged += dt;
        setZ6Tint(Math.min(0.55, z6Submerged * 0.4));
        if (z6Submerged > 3 && !z6Vision && !flags.z6VisionSeen) {
          z6Vision = { t: 0 }; visionGrp.visible = true;
          if (!flags.z6VisionSeen) { flags.z6VisionSeen = true; saveFlags(flags); }
        }
      } else {
        z6Submerged = 0; setZ6Tint(0);
      }
      if (z6Vision) {
        z6Vision.t += dt;
        const k = Math.min(1, z6Vision.t / 4) * Math.max(0, 1 - (z6Vision.t - 4) / 3);
        rayMat.opacity = 0.5 * k;
        visionLight.intensity = 5 * k;
        if (z6Vision.t > 7) { z6Vision = null; visionGrp.visible = false; rayMat.opacity = 0; visionLight.intensity = 0; }
      }
    });
  }

  function setZ6Tint(o) {
    if (!z6Tint) {
      if (o <= 0) return;
      z6Tint = document.createElement('div');
      z6Tint.style.cssText = 'position:fixed;inset:0;z-index:18;pointer-events:none;background:#0a1a30;opacity:0;';
      document.body.appendChild(z6Tint);
    }
    z6Tint.style.opacity = String(o);
  }

  // Z7 Time — a dark room lit by a flickering TV; sitting near it runs the
  // "I won't remember" captions, then returns to the hub.
  function buildZone7() {
    const rec = zoneById['z7'];
    rec.group.add(new THREE.AmbientLight(0x101018, 0.35));
    addDome(rec, 60, '#04040a', '#08080f');
    // Enclose the dark room (walls + ceiling, door gap on +Z, window on +X).
    const RX = 8, RZ = 10, WH = 7.2; // room made twice as tall
    const roomMat = new THREE.MeshStandardMaterial({ color: 0x14161c, roughness: 0.95, side: THREE.DoubleSide });
    zoneMats.push(roomMat);
    const wall = (w, h, x, y, z, ry, rx = 0) => { const g = new THREE.PlaneGeometry(w, h); const m = new THREE.Mesh(g, roomMat); m.position.set(x, y, z); m.rotation.set(rx, ry, 0); rec.group.add(m); zoneGeos.push(g); };
    wall(RX * 2, WH, 0, WH / 2, -RZ, 0);
    wall(RZ * 2, WH, -RX, WH / 2, 0, Math.PI / 2);
    wall(RZ * 2, WH, RX, WH / 2, 0, Math.PI / 2);
    wall(RX * 2, RZ * 2, 0, WH, 0, 0, Math.PI / 2); // ceiling
    // TV + cabinet.
    addZoneBox(rec, 2.6, 1.8, 1.6, 0, 1.1, -8.5, 0x1a1a1e);
    const scr = tvStaticTexture(mulberry32(0x7777));
    const scrGeo = new THREE.PlaneGeometry(2.2, 1.4);
    const scrMat = new THREE.MeshStandardMaterial({ map: scr, emissive: 0xafc8ff, emissiveMap: scr, emissiveIntensity: 0.9 });
    const screen = new THREE.Mesh(scrGeo, scrMat);
    screen.position.set(0, 1.3, -7.68); rec.group.add(screen);
    zoneGeos.push(scrGeo); zoneMats.push(scrMat); zoneTextures.push(scr);
    const tvLight = new THREE.PointLight(0x8fb0ff, 0.8, 24, 2.0);
    tvLight.position.set(0, 1.5, -5.5); rec.group.add(tvLight);
    // A worn couch facing the TV.
    addZoneBox(rec, 3.0, 0.5, 1.2, 0, 0.35, -1, 0x3a3238);
    addZoneBox(rec, 3.0, 0.6, 0.3, 0, 0.7, -0.4, 0x443a40);
    // Window with the swing-set silhouette ("7" glyph), + a moonlight pool on
    // the floor beneath it.
    const swTex = silhouetteTexture('swing');
    const swGeo = new THREE.PlaneGeometry(5, 3);
    const swMat = new THREE.MeshStandardMaterial({ map: swTex, transparent: true, emissive: 0x2a3550, emissiveMap: swTex, emissiveIntensity: 0.5 });
    const window7 = new THREE.Mesh(swGeo, swMat);
    window7.position.set(RX - 0.1, 2.2, -3); window7.rotation.y = -Math.PI / 2;
    rec.group.add(window7); zoneGeos.push(swGeo); zoneMats.push(swMat); zoneTextures.push(swTex);
    const poolGeo = new THREE.PlaneGeometry(3, 4);
    const poolMat = new THREE.MeshBasicMaterial({ color: 0x2a3860, transparent: true, opacity: 0.25, depthWrite: false });
    const pool = new THREE.Mesh(poolGeo, poolMat); pool.position.set(RX - 2.5, 0.02, -3); pool.rotation.x = -Math.PI / 2;
    rec.group.add(pool); zoneGeos.push(poolGeo); zoneMats.push(poolMat);
    // Collision: perimeter walls, door gap on +Z.
    const wt = 0.4;
    rec.structure = makeStructure(0, 0, 0,
      [{ x0: -RX, x1: RX, z0: -RZ, z1: RZ, y: 0 }],
      [
        { x0: -RX, x1: RX, z0: -RZ - wt, z1: -RZ, y0: 0, y1: WH },
        { x0: -RX - wt, x1: -RX, z0: -RZ, z1: RZ, y0: 0, y1: WH },
        { x0: RX, x1: RX + wt, z0: -RZ, z1: RZ, y0: 0, y1: WH },
      ], RZ + 2);
    rec.r2 = (RZ + 12) ** 2;
    const tvPos = zoneToAnchor(rec, 0, 1, -3.5); // in front of the TV / on the couch
    let flick = 0;
    zoneUpdaters.push((t, dt, playerPos) => {
      if (activeZone !== 'z7') { z7Sit = 0; return; }
      // TV flicker.
      flick -= dt;
      if (flick <= 0) {
        scrMat.emissiveIntensity = 0.5 + (Math.sin(t * 53.0) * 0.5 + 0.5) * 0.9;
        tvLight.intensity = 0.4 + Math.abs(Math.sin(t * 47.0)) * 0.9;
        flick = 0.05;
      }
      // Sit trigger: seated in front of the TV for > 1.5 s.
      if (tvPos.distanceToSquared(playerPos) < 12) z7Sit += dt; else z7Sit = Math.max(0, z7Sit - dt);
      if (z7Sit > 1.5 && !z7Caption && fade.phase === 'idle') {
        z7Caption = { i: 0, t: 0 };
      }
      if (z7Caption) {
        z7Caption.t += dt;
        const idx = Math.floor(z7Caption.t / 1.1);
        if (idx !== z7Caption.i) { z7Caption.i = idx; }
        if (idx < DLG.Z7_FRAGMENTS.length) {
          setZ7Caption(DLG.Z7_FRAGMENTS[Math.min(idx, DLG.Z7_FRAGMENTS.length - 1)]);
        } else {
          // Sequence complete → gently return to the hub.
          setZ7Caption(null);
          z7Caption = null; z7Sit = 0;
          if (fade.phase === 'idle') startTransition('hub');
        }
      }
    });
  }

  function setZ7Caption(text) {
    if (text == null) {
      if (z7CaptionEl && z7CaptionEl.parentNode) z7CaptionEl.parentNode.removeChild(z7CaptionEl);
      z7CaptionEl = null; return;
    }
    if (!z7CaptionEl) {
      z7CaptionEl = document.createElement('div');
      z7CaptionEl.style.cssText =
        'position:fixed;left:50%;top:42%;transform:translateX(-50%);z-index:19;' +
        'pointer-events:none;color:#bfe0ff;font-family:"Courier New",monospace;' +
        'font-size:20px;letter-spacing:0.15em;text-shadow:0 0 12px rgba(140,200,255,0.7);';
      document.body.appendChild(z7CaptionEl);
    }
    z7CaptionEl.textContent = text;
  }

  // Z8 Eternity — a campfire that burns down while the clearing opens to a
  // starfield; grandmother's bedside as a quiet side room.
  function buildZone8() {
    const rec = zoneById['z8'];
    rec.group.add(new THREE.AmbientLight(0x241a12, 0.4));
    const dusk = addDome(rec, 92, '#2a1c26', '#c07a4a');
    const night = addDome(rec, 90, '#02030a', '#0a1428');
    night.mat.transparent = true; night.mat.opacity = 0; // crossfades in as the fire dies
    // A ring of dark tree silhouettes around the clearing; they fade out with
    // the burn-down to reveal the open field/starfield.
    const treeMat = new THREE.MeshBasicMaterial({ color: 0x0a0c10, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false });
    zoneMats.push(treeMat);
    const treeGeo = new THREE.PlaneGeometry(4, 10);
    zoneGeos.push(treeGeo);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const tr = new THREE.Mesh(treeGeo, treeMat);
      tr.position.set(Math.sin(a) * 26, 5, -6 + Math.cos(a) * 26);
      tr.rotation.y = -a; rec.group.add(tr);
    }
    // Two touching stone fire-rings — the lit one + a cold old one — form an "8".
    const ringMat = new THREE.MeshStandardMaterial({ color: 0x50463a, roughness: 0.95 });
    zoneMats.push(ringMat);
    const stoneGeo = new THREE.DodecahedronGeometry(0.35);
    zoneGeos.push(stoneGeo);
    for (const [rcz, n] of [[-6, 10], [-9.4, 9]]) {
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const st = new THREE.Mesh(stoneGeo, ringMat);
        st.position.set(Math.sin(a) * 1.5, 0.2, rcz + Math.cos(a) * 1.5);
        rec.group.add(st);
      }
    }
    // Sitting logs around the fire.
    for (const [lx, lz, lry] of [[-2.4, -4.4, 0.3], [2.4, -5, -0.4], [0, -8.2, 0]]) {
      addZoneBox(rec, 1.8, 0.4, 0.45, lx, 0.2, lz, 0x4a3524, lry);
    }
    // Campfire: logs + additive flame cones + embers + light.
    addZoneBox(rec, 2.4, 0.4, 0.5, 0, 0.2, -6, 0x3a2a1c);
    addZoneBox(rec, 0.5, 0.4, 2.4, 0, 0.2, -6, 0x3a2a1c);
    const flameMat = new THREE.MeshBasicMaterial({
      color: 0xffb040, transparent: true, opacity: 0.8, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    zoneMats.push(flameMat);
    const flames = [];
    for (let i = 0; i < 3; i++) {
      const fg = new THREE.ConeGeometry(0.5 - i * 0.12, 1.6 - i * 0.35, 8);
      const fm = new THREE.Mesh(fg, flameMat); fm.position.set(0, 0.8 - i * 0.15, -6);
      rec.group.add(fm); zoneGeos.push(fg); flames.push(fm);
    }
    const fireLight = new THREE.PointLight(0xff9040, 1.6, 30, 2.0);
    fireLight.position.set(0, 1.5, -6); rec.group.add(fireLight);
    // Embers.
    const N = 60;
    const eGeo = new THREE.PlaneGeometry(0.06, 0.06);
    const eMat = new THREE.MeshBasicMaterial({
      color: 0xffb050, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const embers = new THREE.InstancedMesh(eGeo, eMat, N);
    embers.frustumCulled = false; rec.group.add(embers);
    zoneGeos.push(eGeo); zoneMats.push(eMat);
    const er = mulberry32(0x8888);
    const eb = [];
    for (let i = 0; i < N; i++) eb.push({ x: (er() - 0.5) * 1.2, z: -6 + (er() - 0.5) * 1.2, ph: er() * 6.28, sp: 0.5 + er() });
    const _em = new THREE.Matrix4();
    // Grandmother's bedside side room (off to +X).
    addZoneBox(rec, 0.4, 3, 6, 12, 1.5, -4, 0x4a3e34);   // back wall
    addZoneBox(rec, 5, 3, 0.4, 15, 1.5, -7, 0x4a3e34);   // side wall
    addZoneBox(rec, 2.4, 0.5, 1.2, 15, 0.6, -4, 0x8a7060); // bed
    const candle = new THREE.PointLight(0xffcaa0, 0.7, 14, 2.0);
    candle.position.set(15, 2, -4); rec.group.add(candle);
    const gran = makeFigure({ seated: true, skin: 0xd8c0a8, cloth: 0xa0a0b0, seed: 81 });
    gran.group.position.set(15, 0.4, -4); gran.group.rotation.y = -Math.PI / 2;
    rec.group.add(gran.group); figures.push(gran);
    interactables.push({ id: 'grandmother', zone: 'z8', pos: zoneToAnchor(rec, 13.2, 0, -4), talking: false });

    // The eternal star — a bright pole star high overhead that kindles as the
    // fire dies (the finite flame giving way to the endless sky). A soft halo +
    // a hard point. The embers rise toward it: the fire becoming part of forever.
    const starGrp = new THREE.Group(); starGrp.position.set(0, 46, -30); rec.group.add(starGrp);
    const starCore = new THREE.Mesh(new THREE.SphereGeometry(0.9, 12, 12), new THREE.MeshBasicMaterial({ color: 0xfdf6e0 }));
    starGrp.add(starCore); zoneGeos.push(starCore.geometry); zoneMats.push(starCore.material);
    const starHalo = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), new THREE.MeshBasicMaterial({ color: 0xdfe8ff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    starGrp.add(starHalo); zoneGeos.push(starHalo.geometry); zoneMats.push(starHalo.material);
    const starLight = new THREE.PointLight(0xdfe8ff, 0, 120, 1.0); starGrp.add(starLight);
    // A soul-light that lifts from the bedside toward the star once the fire is
    // nearly out — grandmother passing gently into the eternal.
    const soul = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 10), new THREE.MeshBasicMaterial({ color: 0xffe6c0, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    soul.position.set(15, 1.2, -4); rec.group.add(soul);
    zoneGeos.push(soul.geometry); zoneMats.push(soul.material);
    const soulLight = new THREE.PointLight(0xffd8a8, 0, 18, 2.0); soul.add(soulLight);

    // Reset the burn-down timer each time the player enters zone 8.
    zoneEnterCallbacks['z8'] = () => { z8Burn = 0; };
    zoneUpdaters.push((t, dt) => {
      if (activeZone !== 'z8') return;
      z8Burn += dt;
      const burn = Math.max(0.12, 1 - z8Burn / 90); // 1 → embers over ~90 s
      // The eternal star kindles as the fire fades (inverse of the burn).
      const rise = 1 - burn; // 0 → 1 as the fire dies
      starHalo.material.opacity = 0.15 + rise * 0.55 + Math.sin(t * 1.3) * 0.05;
      starHalo.lookAt(0, 1.6, 6); // face the clearing
      starCore.scale.setScalar(0.7 + rise * 0.6 + Math.sin(t * 3) * 0.04);
      starLight.intensity = rise * 2.2;
      // The soul-light lifts from the bedside toward the star once the fire is low.
      if (rise > 0.5) {
        const k = Math.min(1, (rise - 0.5) / 0.45);
        soul.material.opacity = k * 0.9;
        soulLight.intensity = k * 1.4;
        soul.position.set(15 - k * 15, 1.2 + k * 42, -4 - k * 24); // arcs up to the star
      } else { soul.material.opacity = 0; soulLight.intensity = 0; soul.position.set(15, 1.2, -4); }
      for (let i = 0; i < flames.length; i++) {
        const s = burn * (0.9 + Math.sin(t * 8 + i) * 0.12);
        flames[i].scale.set(s, s + Math.sin(t * 6 + i) * 0.1, s);
      }
      fireLight.intensity = 0.3 + burn * 1.6;
      flameMat.opacity = 0.3 + burn * 0.5;
      night.mat.opacity = (1 - burn) * 0.9; // starfield fades in as the fire dies
      dusk.mat.opacity = 0.4 + burn * 0.6;
      dusk.mat.transparent = true;
      treeMat.opacity = burn * 0.95; // the surrounding trees dissolve into open field
      for (let i = 0; i < N; i++) {
        const b = eb[i];
        const y = 0.6 + ((t * b.sp + b.ph) % 4) * burn;
        _em.makeTranslation(b.x + Math.sin(t + b.ph) * 0.2, y, b.z);
        embers.setMatrixAt(i, _em);
      }
      embers.instanceMatrix.needsUpdate = true;
      eMat.opacity = 0.3 + burn * 0.6;
    });
  }

  // Hyper-holo-grid chamber, on a bearing behind the café (its own frame). The
  // door in the hub is built separately (buildMirrorDoor), after the portals.
  function buildMirrorRoom() {
    const dir = ringDir(planet, anchorDir, 0.4, 200);
    const frame = surfaceFrame(planet, anchorDir, dir);
    const zg = new THREE.Group();
    zg.name = 'actuality.mirror';
    zg.position.copy(frame.pos);
    zg.quaternion.copy(frame.q);
    zg.visible = false; // visibility gating: rendered only while active
    group.add(zg);

    mirror = createMirrorRoom({ half: 4 });
    zg.add(mirror.group);
    const H = mirror.half;

    mirrorRec = {
      id: 'mirror', frame, group: zg,
      structure: makeStructure(0, 0, 0,
        [{ x0: -H, x1: H, z0: -H, z1: H, y: 0 }], [], H + 1),
      r2: (H + 12) ** 2,
      center: frame.pos.clone(),
      retCenter: frame.pos.clone(), // unused — the mirror exits by wall-touch only
      retR: 0, // disables the center-return trigger (guarded by retR > 0)
      entryDest: new THREE.Vector3(0, 0.2, 0).applyQuaternion(frame.q).add(frame.pos),
      entryHeading: new THREE.Vector3(0, 0, 1).applyQuaternion(frame.q).normalize(),
    };
    zoneList.push(mirrorRec);
    zoneById['mirror'] = mirrorRec;

    zoneEnterCallbacks['mirror'] = () => {
      if (!flags.hyperHoloGridSeen) { flags.hyperHoloGridSeen = true; saveFlags(flags); }
      mirrorTimer = 0; // the ~5 s experience begins on entry
    };

    // Updater: drive the clone + billboard the lattice. The hyper-holo-grid is
    // the end: after ~10 s (the "0 = repeat program"), or on touching a wall,
    // the program repeats and the host resets the player to the game start.
    zoneUpdaters.push((t, dt, playerPos) => {
      if (activeZone !== 'mirror') return;
      _surf.copy(playerPos).applyQuaternion(anchorQ).add(anchorPos);
      _z6Local.copy(_surf).sub(frame.pos).applyQuaternion(frame.qInv); // player in mirror-local
      _dbgMirror.copy(_z6Local);
      mirror.update(t, dt, _z6Local, 0);
      mirrorTimer += dt;
      const wall = Math.abs(_z6Local.x) > H - 0.5 || Math.abs(_z6Local.z) > H - 0.5;
      if (!pendingReset && (mirrorTimer > AC.HOLOGRID_SECONDS || wall)) {
        pendingReset = true; // consumed by the host → exitWalk + resetToStart
      }
    });
  }

  // Sealed door behind the café; opens (and its portal arms) once every zone is
  // visited. Built after the hub portals so it can register with them.
  function buildMirrorDoor() {
    const BZ = AC.CAFE_BACK_Z;
    const grp = new THREE.Group();
    grp.position.set(0, 0, BZ - 0.28); // in the doorway gap, facing the terrace (-Z)
    anchor.add(grp);
    // A stone door frame (posts + lintel) around the 3 m opening, always visible
    // so the passage the lady mentions is easy to find from the café.
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x2a231a, roughness: 0.85, emissive: 0x1a2436, emissiveIntensity: 0.3 });
    zoneMats.push(frameMat);
    const fbox = (w, h, d, x, y, z, mat) => { const g = new THREE.BoxGeometry(w, h, d); const m = new THREE.Mesh(g, mat); m.position.set(x, y, z); grp.add(m); zoneGeos.push(g); return m; };
    fbox(0.4, 3.4, 0.5, -1.6, 1.7, 0, frameMat); // left post
    fbox(0.4, 3.4, 0.5, 1.6, 1.7, 0, frameMat);  // right post
    fbox(3.6, 0.4, 0.5, 0, 3.4, 0, frameMat);    // lintel
    // The door slab (dark while sealed; slides up out of sight when it opens).
    const doorGeo = new THREE.BoxGeometry(2.9, 3.1, 0.22);
    const doorMat = new THREE.MeshStandardMaterial({ color: 0x14110c, roughness: 0.9, emissive: 0x0a1420, emissiveIntensity: 0.25 });
    const mesh = new THREE.Mesh(doorGeo, doorMat);
    mesh.position.set(0, 1.55, -0.05); grp.add(mesh);
    zoneGeos.push(doorGeo); zoneMats.push(doorMat);
    // A luminous "0 — REPEAT" sign over the lintel (the tenth digit) so the door
    // reads as the way on even before it opens.
    const signTex = signTexture(0, 'REPEAT');
    zoneTextures.push(signTex);
    const signGeo = new THREE.PlaneGeometry(2.6, 0.9);
    const signMat = new THREE.MeshBasicMaterial({ map: signTex, transparent: true, opacity: 0.85 });
    const sign = new THREE.Mesh(signGeo, signMat);
    sign.position.set(0, 4.0, 0.1); grp.add(sign);
    zoneGeos.push(signGeo); zoneMats.push(signMat);
    // The threshold glow behind the slab — a blue-lit plane that shows once the
    // door opens, hinting the hyper-holo-grid beyond.
    const glowGeo = new THREE.PlaneGeometry(2.7, 3.0);
    const glowMat = new THREE.MeshBasicMaterial({ color: 0x6fb4ff, transparent: true, opacity: 0.0, side: THREE.DoubleSide });
    const glow = new THREE.Mesh(glowGeo, glowMat);
    glow.position.set(0, 1.55, 0.14); grp.add(glow);
    zoneGeos.push(glowGeo); zoneMats.push(glowMat);
    const doorLight = new THREE.PointLight(0x8fc0ff, 0, 8, 2.0);
    doorLight.position.set(0, 1.6, -0.6); grp.add(doorLight);
    mirrorDoor = { mesh, mat: doorMat, glowMat, doorLight, sign: signMat, opened: false, anim: 0 };
    hubPortals.push({
      targetZone: 'mirror', gated: true,
      center: new THREE.Vector3(0, 0, BZ + 0.6).applyQuaternion(anchorQ).add(anchorPos),
    });
  }

  // Pre-composer render hook: only the mirror room draws to a render target,
  // and only while the player is inside it.
  function preRender(renderer) {
    if (mirror && activeZone === 'mirror') mirror.preRender(renderer);
  }

  function debug() {
    return {
      flags: JSON.parse(JSON.stringify(flags)),
      activeZone, pendingDigit,
      fadePhase: fade.phase,
      allZonesVisited: allZonesVisited(),
      // surface-local portal centers, for headless tests to drive the trigger
      portals: hubPortals.map((p) => ({
        targetZone: p.targetZone, center: [p.center.x, p.center.y, p.center.z],
      })),
      returns: zoneList.map((z) => ({
        id: z.id, retCenter: [z.retCenter.x, z.retCenter.y, z.retCenter.z],
      })),
      npcs: interactables.map((it) => ({
        id: it.id, zone: it.zone, pos: [it.pos.x, it.pos.y, it.pos.z],
      })),
      joshuaVisible: joshuaFig ? joshuaFig.group.visible : null,
      runtime: {
        z6Submerged, z7Sit, z8Burn, z7Caption: !!z7Caption, z6Vision: !!z6Vision,
        mirrorDoorOpen: mirrorDoor ? mirrorDoor.opened : null,
        mirrorLocal: [_dbgMirror.x, _dbgMirror.y, _dbgMirror.z],
        mirrorTimer, pendingReset,
      },
    };
  }

  // Test hook: ground radius (and reference terrain radius) at a zone-local
  // point, for verifying below-grade descent.
  function probeGround(zoneId, x, y, z) {
    const rec = zoneById[zoneId];
    if (!rec) return null;
    const s = zoneToSurface(rec, x, y, z);
    return { ground: groundRadiusAt(s.clone()), surfLen: s.length() };
  }

  // Test hook: surface-local coordinates of a zone-local point (so a driver can
  // place the player at a set piece).
  function surfacePoint(zoneId, x, y, z) {
    const rec = zoneById[zoneId];
    if (!rec) return null;
    const s = zoneToSurface(rec, x, y, z);
    return [s.x, s.y, s.z];
  }

  function dispose() {
    hub.dispose();
    if (mirror) mirror.dispose();
    for (const f of figures) f.dispose();
    for (const g of zoneGeos) g.dispose();
    for (const m of zoneMats) m.dispose();
    for (const tx of zoneTextures) tx.dispose();
    // Sign textures live on arch groups' userData.
    group.traverse((o) => {
      if (o.userData && o.userData.signTex) o.userData.signTex.dispose();
    });
    anchor.traverse((o) => {
      if (o.userData && o.userData.signTex) o.userData.signTex.dispose();
    });
    if (overlayEl && overlayEl.parentNode) overlayEl.parentNode.removeChild(overlayEl);
    overlayEl = null;
    if (cityFallEl && cityFallEl.parentNode) cityFallEl.parentNode.removeChild(cityFallEl);
    cityFallEl = null;
    if (z6Tint && z6Tint.parentNode) z6Tint.parentNode.removeChild(z6Tint);
    z6Tint = null;
    if (z7CaptionEl && z7CaptionEl.parentNode) z7CaptionEl.parentNode.removeChild(z7CaptionEl);
    z7CaptionEl = null;
    if (audio) {
      try { for (const n of audio.started) { try { n.stop(); } catch { /* already stopped */ } } } catch { /* ignore */ }
      try { audio.ctx.close(); } catch { /* ignore */ }
    }
    audio = null;
  }

  return {
    group,
    anchor,
    update,
    dispose,
    initAudio,
    resolveCollisions,
    groundRadiusAt,
    nearestInteractable,
    interact,
    endInteract,
    onOutcome,
    consumeTeleport,
    consumeReset,
    pendingToast,
    preRender,
    debug,
    probeGround,
    surfacePoint,
    // exposed for future milestones / tests
    _flags: flags,
  };
}
