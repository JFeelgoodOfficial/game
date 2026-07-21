// Five volumetric nebula morphologies for the painting nebulae. The old
// painting nebulae laid gas at the painting's pixel positions in a thin slab;
// seen from 95k-140k out every world-sized sprite clamped toward its 1px floor
// and the additive pile integrated into a smooth circular glow — a distant lit
// sphere, i.e. a planet. These builders instead give each painting a real
// nebula SHAPE — irregular lobes, embedded stars, a torn ring, a dark lane —
// so structure survives at range. The painting only supplies the COLORS (a few
// extracted palette swatches) and the NAV name; the geometry comes from the
// type.
//
// Every builder is fed a seeded rng (per-filename, so layouts are stable across
// reloads and adding a painting never moves the others) and pushes THREE.Points
// clouds into the shared deepNebulae record via makeCloud — the same interface
// the hand-made Sisters/Father use, so NAV, gravity, floating-origin and the
// per-frame update loop all keep working untouched.
//
// The anti-"planet" fix is `addVeils`: a sparse layer of very large, very faint
// sprites pinned to each type's macro-skeleton. At shell distance a 0.3R sprite
// is ~8-30px (vs 1-5px for the gas), so the nebula's silhouette and internal
// structure read from far away instead of collapsing to a dot.

import * as THREE from 'three';
import { settings } from './settings.js';
import { makeCloud } from './deepnebula.js';
import { makeGlowSprite, makeStarburstSprite } from './starburst.js';
import gasFrag from './shaders/deepnebula.frag?raw';
import dustFrag from './shaders/deepnebulaDust.frag?raw';

// --- seeded helpers (must not touch Math.random — layout has to be stable) ---

// Standard-normal sample (Box–Muller) off the seeded stream. deepnebula.js has
// a `gauss()` but it reads Math.random, which would desync reloads — hence this.
function gaussRng(rng) {
  let u = 0;
  while (u < 1e-6) u = rng();
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// Uniform point on the unit sphere, seeded, into `out`.
function randDirRng(rng, out) {
  const z = 2 * rng() - 1;
  const a = 2 * Math.PI * rng();
  const r = Math.sqrt(Math.max(0, 1 - z * z));
  return out.set(r * Math.cos(a), z, r * Math.sin(a));
}

const _up = new THREE.Vector3();

// Orthonormal basis with `axis` as its first vector; p1/p2 span the perp plane.
function basisFromAxis(axis, p1, p2) {
  const up = Math.abs(axis.y) > 0.9 ? _up.set(1, 0, 0) : _up.set(0, 1, 0);
  p1.crossVectors(axis, up).normalize();
  p2.crossVectors(axis, p1).normalize();
}

// Linear-space colour lerp between two [r,g,b] swatches.
function mixCol(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

// A palette swatch is linear RGB; the SpriteMaterial helpers want an sRGB hex
// (they follow deepnebula.js's convention of hand-picked sRGB hex tints).
function srgbHex(lin) {
  const to = (c) => Math.round(Math.pow(Math.min(1, Math.max(0, c)), 1 / 2.2) * 255);
  return (to(lin[0]) << 16) | (to(lin[1]) << 8) | to(lin[2]);
}

// The coolest (bluest) available swatch, for reflection nebulae's scattered
// starlight; falls back to primary lerped toward the highlight.
function coolTint(palette) {
  const cands = [palette.primary, palette.secondary, palette.accent];
  let best = null, bestScore = -Infinity;
  for (const c of cands) {
    const score = c[2] - 0.5 * (c[0] + c[1]); // blue minus warm
    if (score > bestScore) { bestScore = score; best = c; }
  }
  if (bestScore > 0.02) return best;
  return mixCol(palette.primary, palette.bright, 0.4);
}

// --- cloud emit + veil layer ---

// Wrap makeCloud with the painting-nebula treatment: a real bounding sphere so
// whole nebulae frustum-cull behind you (they're 24 distant bodies, unlike the
// two always-visible hand-made ones). No-op on empty input.
function emitCloud(ctx, pos, col, siz, opts) {
  if (!pos.length) return null;
  const cloud = makeCloud(ctx.record.mats, ctx.record.intensity, {
    positions: new Float32Array(pos),
    colors: new Float32Array(col),
    sizes: new Float32Array(siz),
    frag: opts.frag,
    blending: opts.blending,
    renderOrder: opts.renderOrder,
    opacity: opts.opacity,
  });
  cloud.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), ctx.R * 1.6);
  cloud.frustumCulled = true;
  ctx.record.group.add(cloud);
  return cloud;
}

// The anti-planet layer: few, huge, faint additive sprites pinned to `anchors`
// (array of [x,y,z]). Brightness stays <= ~0.02 so dozens overlapping still sum
// well under the 0.85 bloom threshold. colorAt(rng, i) picks a swatch per veil.
function addVeils(ctx, anchors, opts) {
  const { rng, R, low } = ctx;
  if (!anchors.length) return;
  const count = Math.round((low ? 0.5 : 1) * opts.count);
  const jitter = opts.jitter !== undefined ? opts.jitter : R * 0.15;
  const pos = [], col = [], siz = [];
  for (let i = 0; i < count; i++) {
    const a = anchors[(rng() * anchors.length) | 0];
    pos.push(a[0] + gaussRng(rng) * jitter, a[1] + gaussRng(rng) * jitter, a[2] + gaussRng(rng) * jitter);
    const c = opts.colorAt ? opts.colorAt(rng, i) : opts.color;
    const b = opts.brightness * (0.6 + 0.8 * rng());
    col.push(c[0] * b, c[1] * b, c[2] * b);
    siz.push(R * (opts.sizeMin + opts.sizeSpan * rng()));
  }
  emitCloud(ctx, pos, col, siz, { frag: gasFrag, blending: THREE.AdditiveBlending, renderOrder: -4 });
}

// A bright, mostly-white embedded star with a cubic brightness tail — most sit
// under the bloom line, a few punch past 1.0 and glow. Written into the shared
// gas arrays (same additive frag). `tint` biases the white toward the palette.
function pushStar(pos, col, siz, rng, x, y, z, tint, R, sizeMul = 1) {
  const b = 0.5 + 0.9 * Math.pow(rng(), 3);
  pos.push(x, y, z);
  col.push(
    (0.8 + 0.2 * tint[0]) * b,
    (0.85 + 0.15 * tint[1]) * b,
    (0.9 + 0.1 * tint[2]) * b
  );
  siz.push(R * (0.008 + 0.008 * rng()) * sizeMul);
}

const _tmp = new THREE.Vector3();
const _p1 = new THREE.Vector3();
const _p2 = new THREE.Vector3();

// --- Emission: glowing gas — irregular lobes, filaments, hot stars, dust lane ---

function buildEmission(ctx) {
  const { rng, R, palette, low } = ctx;

  // 2-4 anisotropic gaussian lobes at offset centres → a lumpy, non-circular
  // silhouette (the single biggest departure from the smooth-disc read).
  const nLobes = 2 + ((rng() * 3) | 0);
  const lobes = [];
  for (let i = 0; i < nLobes; i++) {
    const c = new THREE.Vector3();
    randDirRng(rng, c).multiplyScalar(R * 0.55 * Math.cbrt(rng()));
    const axis = new THREE.Vector3();
    randDirRng(rng, axis);
    const p1 = new THREE.Vector3(), p2 = new THREE.Vector3();
    basisFromAxis(axis, p1, p2);
    const s0 = R * (0.2 + 0.25 * rng());
    lobes.push({
      c, axis, p1, p2,
      s: [s0 * 1.6, s0, s0 * (0.7 + 0.4 * rng())], // stretched one way
      w: 0.6 + rng(),
    });
  }
  const totalW = lobes.reduce((a, l) => a + l.w, 0);

  const pos = [], col = [], siz = [];
  const GAS_N = low ? 4500 : 9000;
  for (let i = 0; i < GAS_N; i++) {
    let r = rng() * totalW, li = 0;
    while (li < lobes.length - 1 && (r -= lobes[li].w) > 0) li++;
    const L = lobes[li];
    const g0 = gaussRng(rng), g1 = gaussRng(rng), g2 = gaussRng(rng);
    _tmp.copy(L.c)
      .addScaledVector(L.axis, g0 * L.s[0])
      .addScaledVector(L.p1, g1 * L.s[1])
      .addScaledVector(L.p2, g2 * L.s[2]);
    const density = Math.exp(-0.5 * (g0 * g0 + g1 * g1 + g2 * g2) / 1.5);
    const c = mixCol(palette.secondary, palette.primary, density);
    const b = (0.03 + 0.03 * density) * (0.7 + 0.6 * rng());
    pos.push(_tmp.x, _tmp.y, _tmp.z);
    col.push(c[0] * b, c[1] * b, c[2] * b);
    siz.push(R * (0.05 + 0.06 * rng()));
  }

  // 2-4 filaments: momentum random walks seeded at lobe centres, scattered.
  const nFil = 2 + ((rng() * 3) | 0);
  const step = R * 0.2;
  const filPts = low ? 40 : 80;
  for (let f = 0; f < nFil; f++) {
    _tmp.copy(lobes[(rng() * lobes.length) | 0].c);
    const dir = new THREE.Vector3();
    randDirRng(rng, dir);
    const jd = new THREE.Vector3();
    for (let seg = 0; seg < 8; seg++) {
      randDirRng(rng, jd);
      dir.addScaledVector(jd, 0.5).normalize();
      _tmp.addScaledVector(dir, step);
      for (let p = 0; p < filPts; p++) {
        const c = mixCol(palette.accent, palette.primary, rng());
        const b = 0.03 * (0.7 + 0.6 * rng());
        pos.push(_tmp.x + gaussRng(rng) * R * 0.04, _tmp.y + gaussRng(rng) * R * 0.04, _tmp.z + gaussRng(rng) * R * 0.04);
        col.push(c[0] * b, c[1] * b, c[2] * b);
        siz.push(R * (0.04 + 0.04 * rng()));
      }
    }
  }

  // 2-4 hot stars at the densest lobe cores, each with a soft coloured halo.
  const nStars = 2 + ((rng() * 3) | 0);
  for (let s = 0; s < nStars; s++) {
    const L = lobes[(rng() * lobes.length) | 0];
    pushStar(pos, col, siz, rng, L.c.x, L.c.y, L.c.z, palette.bright, R, 1.2);
    const hb = 0.12;
    pos.push(L.c.x, L.c.y, L.c.z);
    col.push(palette.bright[0] * hb, palette.bright[1] * hb, palette.bright[2] * hb);
    siz.push(R * 0.12);
  }

  emitCloud(ctx, pos, col, siz, { frag: gasFrag, blending: THREE.AdditiveBlending, renderOrder: -3 });

  // Dust lane: resample placed gas that lies near a random plane through the
  // centre, so a dark band cuts across the glow (structure that survives range).
  const n = new THREE.Vector3();
  randDirRng(rng, n);
  const thresh = R * 0.06;
  const dp = [], dc = [], ds = [];
  for (let i = 0; i < pos.length; i += 3) {
    const x = pos[i], y = pos[i + 1], z = pos[i + 2];
    if (Math.abs(x * n.x + y * n.y + z * n.z) < thresh && rng() < 0.5) {
      dp.push(x + gaussRng(rng) * R * 0.03, y + gaussRng(rng) * R * 0.03, z + gaussRng(rng) * R * 0.03);
      dc.push(palette.dark[0], palette.dark[1], palette.dark[2]);
      ds.push(R * (0.08 + (rng() < 0.25 ? 0.12 : 0.06) * rng())); // a few big biters
    }
  }
  emitCloud(ctx, dp, dc, ds, { frag: dustFrag, blending: THREE.NormalBlending, renderOrder: -1, opacity: 0.35 });

  addVeils(ctx, lobes.map((l) => [l.c.x, l.c.y, l.c.z]), {
    count: 80, sizeMin: 0.25, sizeSpan: 0.25, brightness: 0.012, jitter: R * 0.18,
    colorAt: (rng) => (rng() < 0.5 ? palette.primary : palette.secondary),
  });
}

// --- Reflection: cool haze scattering the light of embedded stars ---

function buildReflection(ctx) {
  const { rng, R, palette, low } = ctx;
  const haze = coolTint(palette);

  // 3-6 well-separated bright stars: unequal haloes → grape-cluster, not a disc.
  const nStars = 3 + ((rng() * 4) | 0);
  const stars = [];
  let guard = 0;
  while (stars.length < nStars && guard < 300) {
    guard++;
    const p = new THREE.Vector3();
    randDirRng(rng, p).multiplyScalar(R * 0.5 * Math.cbrt(rng()));
    let ok = true;
    for (const s of stars) if (p.distanceTo(s.p) < R * 0.3) { ok = false; break; }
    if (ok) stars.push({ p, w: 0.5 + rng(), sig: R * (0.15 + 0.15 * rng()) });
  }
  const totalW = stars.reduce((a, s) => a + s.w, 0);

  const pos = [], col = [], siz = [];
  const GAS_N = low ? 3500 : 7000;
  for (let i = 0; i < GAS_N; i++) {
    let r = rng() * totalW, si = 0;
    while (si < stars.length - 1 && (r -= stars[si].w) > 0) si++;
    const S = stars[si];
    const g0 = gaussRng(rng), g1 = gaussRng(rng), g2 = gaussRng(rng);
    const d2 = g0 * g0 + g1 * g1 + g2 * g2;
    _tmp.set(S.p.x + g0 * S.sig, S.p.y + g1 * S.sig * 0.8, S.p.z + g2 * S.sig);
    const b = Math.exp(-0.35 * d2) * 0.05 * (0.7 + 0.6 * rng());
    pos.push(_tmp.x, _tmp.y, _tmp.z);
    col.push(haze[0] * b, haze[1] * b, haze[2] * b);
    siz.push(R * (0.05 + 0.05 * rng()));
  }

  // The stars themselves (blue-white), each with a soft cool halo.
  for (const S of stars) {
    pushStar(pos, col, siz, rng, S.p.x, S.p.y, S.p.z, [0.75, 0.85, 1.0], R, 1.3);
    const hb = 0.1;
    pos.push(S.p.x, S.p.y, S.p.z);
    col.push(haze[0] * hb, haze[1] * hb, haze[2] * hb);
    siz.push(R * 0.18);
  }

  // Thin bridges of haze between star pairs.
  for (let a = 0; a < stars.length; a++) {
    for (let b = a + 1; b < stars.length; b++) {
      if (rng() < 0.5) continue;
      const A = stars[a].p, B = stars[b].p;
      const nSeg = low ? 20 : 40;
      for (let t = 0; t < nSeg; t++) {
        const f = (t + 0.5) / nSeg;
        const bb = 0.02 * (0.6 + 0.6 * rng());
        pos.push(
          A.x + (B.x - A.x) * f + gaussRng(rng) * R * 0.05,
          A.y + (B.y - A.y) * f + gaussRng(rng) * R * 0.05,
          A.z + (B.z - A.z) * f + gaussRng(rng) * R * 0.05
        );
        col.push(haze[0] * bb, haze[1] * bb, haze[2] * bb);
        siz.push(R * (0.04 + 0.04 * rng()));
      }
    }
  }

  emitCloud(ctx, pos, col, siz, { frag: gasFrag, blending: THREE.AdditiveBlending, renderOrder: -3 });

  addVeils(ctx, stars.map((s) => [s.p.x, s.p.y, s.p.z]), {
    count: 60, sizeMin: 0.22, sizeSpan: 0.22, brightness: 0.01, jitter: R * 0.16, color: haze,
  });
}

// --- Dark: a light-blocking dust silhouette against a faint backdrop glow ---

function buildDark(ctx) {
  const { rng, R, palette, low } = ctx;

  // Backdrop glow (mandatory: NormalBlending dust is invisible against black
  // space, so the dark shape has to sit in front of a lit background). Two
  // offset soft lobes filling ~1.2R.
  const lobeA = new THREE.Vector3();
  randDirRng(rng, lobeA).multiplyScalar(R * 0.35);
  const lobeB = lobeA.clone().multiplyScalar(-1);
  const gp = [], gc = [], gs = [];
  const GLOW_N = low ? 1800 : 3500;
  const glowCol = mixCol(palette.primary, palette.secondary, 0.5);
  for (let i = 0; i < GLOW_N; i++) {
    const c = rng() < 0.5 ? lobeA : lobeB;
    _tmp.set(c.x + gaussRng(rng) * R * 0.5, c.y + gaussRng(rng) * R * 0.5, c.z + gaussRng(rng) * R * 0.5);
    const b = 0.012 * (0.6 + 0.8 * rng());
    gp.push(_tmp.x, _tmp.y, _tmp.z);
    gc.push(glowCol[0] * b, glowCol[1] * b, glowCol[2] * b);
    gs.push(R * (0.08 + 0.12 * rng()));
  }
  emitCloud(ctx, gp, gc, gs, { frag: gasFrag, blending: THREE.AdditiveBlending, renderOrder: -3 });

  // Dust silhouette: 3-5 tendrils walked from near the centre, heavy dark sprites
  // that eat into the glow — the classic Horsehead read from far away.
  const dp = [], dc = [], ds = [];
  const nTend = 3 + ((rng() * 3) | 0);
  const tendPts = low ? 350 : 700;
  const rim = []; // rim-light anchors along the dust surface
  for (let f = 0; f < nTend; f++) {
    _tmp.set(gaussRng(rng) * R * 0.2, gaussRng(rng) * R * 0.2, gaussRng(rng) * R * 0.2);
    const dir = new THREE.Vector3();
    randDirRng(rng, dir);
    const jd = new THREE.Vector3();
    const segs = 8;
    for (let seg = 0; seg < segs; seg++) {
      randDirRng(rng, jd);
      dir.addScaledVector(jd, 0.4).normalize();
      _tmp.addScaledVector(dir, R * 0.14);
      rim.push([_tmp.x, _tmp.y, _tmp.z]);
      for (let p = 0; p < tendPts / segs; p++) {
        const spread = R * (0.05 + 0.07 * rng());
        dp.push(_tmp.x + gaussRng(rng) * spread, _tmp.y + gaussRng(rng) * spread, _tmp.z + gaussRng(rng) * spread);
        dc.push(palette.dark[0], palette.dark[1], palette.dark[2]);
        ds.push(R * (0.08 + 0.17 * rng()));
      }
    }
  }
  emitCloud(ctx, dp, dc, ds, { frag: dustFrag, blending: THREE.NormalBlending, renderOrder: -1, opacity: 0.45 });

  // Sparse rim light where the dust catches the backdrop, in the accent colour.
  const rp = [], rc = [], rs = [];
  const nRim = low ? 120 : 240;
  for (let i = 0; i < nRim; i++) {
    const a = rim[(rng() * rim.length) | 0];
    const b = 0.02 * (0.6 + 0.8 * rng());
    rp.push(a[0] + gaussRng(rng) * R * 0.06, a[1] + gaussRng(rng) * R * 0.06, a[2] + gaussRng(rng) * R * 0.06);
    rc.push(palette.accent[0] * b, palette.accent[1] * b, palette.accent[2] * b);
    rs.push(R * (0.03 + 0.03 * rng()));
  }
  emitCloud(ctx, rp, rc, rs, { frag: gasFrag, blending: THREE.AdditiveBlending, renderOrder: -2 });

  addVeils(ctx, [[lobeA.x, lobeA.y, lobeA.z], [lobeB.x, lobeB.y, lobeB.z]], {
    count: 70, sizeMin: 0.28, sizeSpan: 0.22, brightness: 0.01, jitter: R * 0.4, color: glowCol,
  });
}

// --- Planetary: a thin patchy shell around a hot dying star ---

function buildPlanetary(ctx) {
  const { rng, R, palette, low, record } = ctx;
  const Rs = R * (0.55 + 0.2 * rng());
  const squashAxis = new THREE.Vector3();
  randDirRng(rng, squashAxis);
  const squash = 0.55 + 0.3 * rng(); // shell compressed along the axis → ellipse
  const bipolar = rng() < 0.35;
  // Low-frequency patchiness so the ring isn't a perfect annulus.
  const k1 = new THREE.Vector3(); randDirRng(rng, k1);
  const k2 = new THREE.Vector3(); randDirRng(rng, k2);
  const ph1 = rng() * 6.283, ph2 = rng() * 6.283;

  const pos = [], col = [], siz = [];
  const N = low ? 3500 : 7000;
  const dir = new THREE.Vector3();
  let placed = 0, tries = 0;
  while (placed < N && tries < N * 8) {
    tries++;
    randDirRng(rng, dir);
    const w = 0.45 + 0.55 * Math.sin(dir.dot(k1) * 2 + ph1) * Math.sin(dir.dot(k2) * 2 + ph2);
    if (rng() > w) continue;
    const off = gaussRng(rng);
    let rad = Rs * (1 + off * 0.06);
    if (bipolar) rad *= 0.6 + 0.8 * Math.abs(dir.dot(squashAxis));
    _tmp.copy(dir).multiplyScalar(rad);
    const comp = _tmp.dot(squashAxis) * (1 - squash);
    _tmp.addScaledVector(squashAxis, -comp);
    const t = Math.min(1, Math.max(0, 0.5 + off * 0.35)); // inner→outer
    const c = mixCol(palette.bright, palette.primary, t);
    const b = 0.045 * (0.7 + 0.6 * rng());
    pos.push(_tmp.x, _tmp.y, _tmp.z);
    col.push(c[0] * b, c[1] * b, c[2] * b);
    siz.push(R * (0.05 + 0.05 * rng()));
    placed++;
  }

  // Faint interior haze so the hole isn't dead black.
  const hazeN = low ? 300 : 600;
  for (let i = 0; i < hazeN; i++) {
    randDirRng(rng, dir).multiplyScalar(Rs * 0.7 * Math.cbrt(rng()));
    const b = 0.01 * (0.6 + 0.8 * rng());
    pos.push(dir.x, dir.y, dir.z);
    col.push(palette.secondary[0] * b, palette.secondary[1] * b, palette.secondary[2] * b);
    siz.push(R * (0.05 + 0.05 * rng()));
  }

  // A couple of hot point-stars at the centre (bloom via the cubic tail).
  for (let i = 0; i < 2; i++) pushStar(pos, col, siz, rng, 0, 0, 0, palette.bright, R, 1.4);

  emitCloud(ctx, pos, col, siz, { frag: gasFrag, blending: THREE.AdditiveBlending, renderOrder: -3 });

  // The central star: a soft halo sprite (+ occasional flare) that fades on
  // fly-through via the record's existing coreFade path (updateDeepNebula).
  const hex = srgbHex(palette.bright);
  const glow = makeGlowSprite(hex, R * 0.09, 0.5);
  record.group.add(glow);
  const fade = [{ mat: glow.material, base: glow.material.opacity }];
  if (rng() < 0.5) {
    const flare = makeStarburstSprite(hex, R * 0.13, 0.9);
    record.group.add(flare);
    fade.push({ mat: flare.material, base: flare.material.opacity });
  }
  record.coreFade = fade;
  record.fadeStart = R * 0.8;
  record.fadeEnd = R * 0.42;

  addVeils(ctx, ringAnchors(rng, Rs, squashAxis, squash, 24), {
    count: 60, sizeMin: 0.22, sizeSpan: 0.2, brightness: 0.011, jitter: R * 0.1,
    colorAt: (rng) => (rng() < 0.5 ? palette.bright : palette.primary),
  });
}

// Anchors spread around a (squashed) ring, so planetary veils read as an annulus.
function ringAnchors(rng, Rs, squashAxis, squash, n) {
  basisFromAxis(squashAxis, _p1, _p2);
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rng() * 0.2;
    _tmp.set(0, 0, 0).addScaledVector(_p1, Math.cos(a) * Rs).addScaledVector(_p2, Math.sin(a) * Rs);
    out.push([_tmp.x, _tmp.y, _tmp.z]);
  }
  return out;
}

// --- Supernova Remnant: a torn, shredded, stretched expanding shell ---

function buildRemnant(ctx) {
  const { rng, R, palette, low } = ctx;
  const Rs = R * (0.75 + 0.25 * rng());
  const stretchAxis = new THREE.Vector3();
  randDirRng(rng, stretchAxis);
  const stretch = 1.15 + 0.35 * rng();
  // Three multiplied sine fields shred the shell into ragged patches.
  const ks = [], fs = [], phs = [];
  for (let i = 0; i < 3; i++) {
    const k = new THREE.Vector3(); randDirRng(rng, k);
    ks.push(k); fs.push(2 + rng() * 3); phs.push(rng() * 6.283);
  }
  const shellW = (dir) => {
    let w = 1;
    for (let i = 0; i < 3; i++) w *= Math.pow(0.5 + 0.5 * Math.sin(fs[i] * dir.dot(ks[i]) + phs[i]), 1.5);
    return w;
  };

  const pos = [], col = [], siz = [];
  const N = low ? 4000 : 8000;
  const dir = new THREE.Vector3();
  const shellAnchors = [];
  let placed = 0, tries = 0;
  while (placed < N && tries < N * 10) {
    tries++;
    randDirRng(rng, dir);
    if (rng() > shellW(dir)) continue;
    const rad = Rs * (1 + gaussRng(rng) * 0.05);
    _tmp.copy(dir).multiplyScalar(rad);
    const comp = _tmp.dot(stretchAxis) * (stretch - 1);
    _tmp.addScaledVector(stretchAxis, comp);
    const c = mixCol(palette.primary, palette.accent, rng());
    const b = 0.04 * (0.7 + 0.6 * rng());
    pos.push(_tmp.x, _tmp.y, _tmp.z);
    col.push(c[0] * b, c[1] * b, c[2] * b);
    siz.push(R * (0.04 + 0.05 * rng()));
    if (placed % 80 === 0) shellAnchors.push([_tmp.x, _tmp.y, _tmp.z]);
    placed++;
  }

  // 6-10 sharp filament arcs walked along the shell surface — wisps that read
  // as streaks even when the shell half-collapses at range.
  const nArc = 6 + ((rng() * 5) | 0);
  const arcPts = low ? 30 : 60;
  for (let a = 0; a < nArc; a++) {
    randDirRng(rng, dir);
    const tangent = new THREE.Vector3();
    basisFromAxis(dir, _p1, _p2);
    tangent.copy(_p1);
    for (let t = 0; t < arcPts; t++) {
      dir.addScaledVector(tangent, 0.06).normalize();
      const rad = Rs * (1 + gaussRng(rng) * 0.02);
      _tmp.copy(dir).multiplyScalar(rad);
      const comp = _tmp.dot(stretchAxis) * (stretch - 1);
      _tmp.addScaledVector(stretchAxis, comp);
      const c = rng() < 0.5 ? palette.accent : palette.bright;
      const b = 0.05 * (0.6 + 0.6 * rng());
      pos.push(_tmp.x + gaussRng(rng) * R * 0.015, _tmp.y + gaussRng(rng) * R * 0.015, _tmp.z + gaussRng(rng) * R * 0.015);
      col.push(c[0] * b, c[1] * b, c[2] * b);
      siz.push(R * (0.03 + 0.03 * rng()));
    }
  }

  // 3-5 faint radial spokes from the interior out through the shell.
  const nSpoke = 3 + ((rng() * 3) | 0);
  for (let s = 0; s < nSpoke; s++) {
    randDirRng(rng, dir);
    const spokePts = low ? 20 : 40;
    for (let t = 0; t < spokePts; t++) {
      const rad = Rs * (0.2 + 0.9 * (t / spokePts));
      _tmp.copy(dir).multiplyScalar(rad);
      const comp = _tmp.dot(stretchAxis) * (stretch - 1);
      _tmp.addScaledVector(stretchAxis, comp);
      const b = 0.02 * (0.6 + 0.6 * rng());
      pos.push(_tmp.x + gaussRng(rng) * R * 0.02, _tmp.y + gaussRng(rng) * R * 0.02, _tmp.z + gaussRng(rng) * R * 0.02);
      col.push(palette.secondary[0] * b, palette.secondary[1] * b, palette.secondary[2] * b);
      siz.push(R * (0.03 + 0.03 * rng()));
    }
  }

  // Optional tiny blue-white pulsar at the centre.
  if (rng() < 0.6) pushStar(pos, col, siz, rng, 0, 0, 0, [0.7, 0.85, 1.0], R, 1.2);

  emitCloud(ctx, pos, col, siz, { frag: gasFrag, blending: THREE.AdditiveBlending, renderOrder: -3 });

  addVeils(ctx, shellAnchors.length ? shellAnchors : [[0, 0, 0]], {
    count: 90, sizeMin: 0.2, sizeSpan: 0.18, brightness: 0.01, jitter: R * 0.08,
    colorAt: (rng) => (rng() < 0.5 ? palette.primary : palette.accent),
  });
}

export const NEBULA_BUILDERS = {
  emission: buildEmission,
  reflection: buildReflection,
  dark: buildDark,
  planetary: buildPlanetary,
  remnant: buildRemnant,
};

// Build the clouds for one painting nebula. `type` is one of NEBULA_BUILDERS'
// keys; rng is the per-painting seeded stream; palette is from extractPalette.
export function buildNebulaOfType(type, { record, radius, rng, palette }) {
  const ctx = { record, R: radius, rng, palette, low: settings.quality === 'low' };
  (NEBULA_BUILDERS[type] || buildEmission)(ctx);
}
