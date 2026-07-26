/**
 * actuality-materials.js
 *
 * Shared PBR material registry for the Actuality world.
 *
 * Every map here is generated procedurally on a canvas rather than loaded from
 * a texture library. That is not a stylistic preference — this session's
 * network policy only lets the container reach package registries and GitHub,
 * so the usual CC0 sources (Poly Haven, ambientCG) are unreachable. Generating
 * the maps keeps the world self-contained, keeps the repo free of a texture
 * payload, and costs about 8 ms of canvas work at load.
 *
 * The generators are built for tiling: the noise lattices wrap, and the normal
 * maps differentiate the height field with wrapped neighbours, so a map at
 * repeat(6, 6) shows no seam.
 *
 * One registry is created per world instance and shared by every consumer — the
 * nine gateways all draw with the same steel/glass materials, so the colonnade
 * is a handful of draw calls rather than nine sets. dispose() frees the lot.
 */

import * as THREE from 'three';

/* ----------------------------------------------------------------------
 * Noise + map plumbing
 * ------------------------------------------------------------------- */

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const smooth = (t) => t * t * (3 - 2 * t);
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

// Value noise on a `period`×`period` lattice, sampled to `size`×`size`. The
// lattice indexes wrap, so the result tiles exactly.
function periodicNoise(size, period, rng) {
  const lat = new Float32Array(period * period);
  for (let i = 0; i < lat.length; i++) lat[i] = rng();
  const out = new Float32Array(size * size);
  const scale = period / size;
  for (let y = 0; y < size; y++) {
    const fy = y * scale, iy = Math.floor(fy);
    const y0 = iy % period, y1 = (y0 + 1) % period, ty = smooth(fy - iy);
    for (let x = 0; x < size; x++) {
      const fx = x * scale, ix = Math.floor(fx);
      const x0 = ix % period, x1 = (x0 + 1) % period, tx = smooth(fx - ix);
      const top = lat[y0 * period + x0] + (lat[y0 * period + x1] - lat[y0 * period + x0]) * tx;
      const bot = lat[y1 * period + x0] + (lat[y1 * period + x1] - lat[y1 * period + x0]) * tx;
      out[y * size + x] = top + (bot - top) * ty;
    }
  }
  return out;
}

// Summed octaves of periodicNoise, normalised to 0..1. `base` is the lattice
// period of the first octave and doubles each time, so every octave tiles.
function fbm(size, base, octaves, rng) {
  const out = new Float32Array(size * size);
  let amp = 1, total = 0, period = base;
  for (let o = 0; o < octaves && period <= size; o++) {
    const n = periodicNoise(size, period, rng);
    for (let i = 0; i < out.length; i++) out[i] += n[i] * amp;
    total += amp; amp *= 0.5; period *= 2;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

// A 1-D wrapping noise band, for grain that runs in one direction (brushed
// metal, stone bedding). Returns `size` samples.
function periodicNoise1D(size, period, rng) {
  const lat = new Float32Array(period);
  for (let i = 0; i < period; i++) lat[i] = rng();
  const out = new Float32Array(size);
  const scale = period / size;
  for (let i = 0; i < size; i++) {
    const f = i * scale, k = Math.floor(f);
    const a = lat[k % period], b = lat[(k + 1) % period];
    out[i] = a + (b - a) * smooth(f - k);
  }
  return out;
}

function newCanvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

function finishTexture(canvas, { srgb = false, repeat = 1 } = {}) {
  const tex = new THREE.CanvasTexture(canvas);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.anisotropy = 8;
  return tex;
}

// Pack an RGB writer over a size×size image and hand back a texture.
function buildTexture(size, srgb, repeat, write) {
  const c = newCanvas(size);
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  write(img.data, size);
  g.putImageData(img, 0, 0);
  return finishTexture(c, { srgb, repeat });
}

// Tangent-space normal map from a height field, differentiated with wrapped
// neighbours so the map tiles. Green is +Y (the OpenGL convention three uses).
function normalTexture(height, size, strength, repeat) {
  return buildTexture(size, false, repeat, (data) => {
    for (let y = 0; y < size; y++) {
      const yUp = ((y - 1 + size) % size) * size;
      const yDn = ((y + 1) % size) * size;
      const yc = y * size;
      for (let x = 0; x < size; x++) {
        const l = height[yc + ((x - 1 + size) % size)];
        const r = height[yc + ((x + 1) % size)];
        const u = height[yUp + x];
        const d = height[yDn + x];
        let nx = (l - r) * strength;
        let ny = (d - u) * strength;
        const len = Math.hypot(nx, ny, 1);
        nx /= len; ny /= len;
        const i = (yc + x) * 4;
        data[i] = (nx * 0.5 + 0.5) * 255;
        data[i + 1] = (ny * 0.5 + 0.5) * 255;
        data[i + 2] = (1 / len) * 255;
        data[i + 3] = 255;
      }
    }
  });
}

// Greyscale map (roughness / metalness / AO) straight from a 0..1 field.
function scalarTexture(field, size, lo, hi, repeat) {
  return buildTexture(size, false, repeat, (data) => {
    for (let i = 0; i < field.length; i++) {
      const v = (clamp01(lo + (hi - lo) * field[i]) * 255) | 0;
      const j = i * 4;
      data[j] = data[j + 1] = data[j + 2] = v;
      data[j + 3] = 255;
    }
  });
}

/* ----------------------------------------------------------------------
 * Registry
 * ------------------------------------------------------------------- */

/**
 * @param opts { quality: 'high'|'low' }
 * @returns a registry of shared materials + dispose()
 */
export function createActualityMaterials(opts = {}) {
  const size = opts.quality === 'low' ? 128 : 256;
  const textures = [];
  const materials = [];
  const keep = (t) => { textures.push(t); return t; };
  const own = (m) => { materials.push(m); return m; };

  /* --- Blackened steel -------------------------------------------------
   * Hot-blackened mild steel: near-black, faintly warm where the finish has
   * worn thin, with a directional brush grain. The grain runs along X in
   * texture space, which lands vertically on the gateway columns (their UVs
   * put V up the post) — the way a drawn section actually looks. */
  const steel = (() => {
    const rng = mulberry32(0x51ee1);
    const patina = fbm(size, 4, 4, rng);          // broad worn/darkened blotches
    const grime = fbm(size, 16, 3, rng);          // finer soot in the grain
    const streak = periodicNoise1D(size, 96, rng); // brush lines
    const micro = periodicNoise1D(size, size / 2, rng);

    const height = new Float32Array(size * size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = y * size + x;
        height[i] = streak[y] * 0.55 + micro[y] * 0.2 + patina[i] * 0.25;
      }
    }

    const map = buildTexture(size, true, 1, (data) => {
      for (let y = 0; y < size; y++) {
        // Keep the grain quiet. On a base this dark a swing of more than a few
        // levels stops reading as a brushed finish and starts reading as
        // painted-on stripes.
        const s = (streak[y] - 0.5) * 5 + (micro[y] - 0.5) * 3;
        for (let x = 0; x < size; x++) {
          const i = y * size + x;
          const wear = Math.pow(patina[i], 3);      // rare, so the warm tone is a hint
          const soot = grime[i] * 10;
          const j = i * 4;
          data[j] = clamp01((20 + s + soot + wear * 46) / 255) * 255;
          data[j + 1] = clamp01((22 + s + soot + wear * 32) / 255) * 255;
          data[j + 2] = clamp01((27 + s + soot + wear * 20) / 255) * 255;
          data[j + 3] = 255;
        }
      }
    });

    const rough = new Float32Array(size * size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = y * size + x;
        rough[i] = clamp01(patina[i] * 0.62 + streak[y] * 0.14 + grime[i] * 0.24);
      }
    }

    return {
      map: keep(map),
      roughnessMap: keep(scalarTexture(rough, size, 0.26, 0.72, 1)),
      normalMap: keep(normalTexture(height, size, size * 0.10, 1)),
    };
  })();

  /* --- Concrete: plinths, landing pad, walkway ----------------------- */
  const concrete = (() => {
    const rng = mulberry32(0xc047c);
    const mottle = fbm(size, 3, 5, rng);
    const aggregate = fbm(size, 32, 2, rng);
    const speck = new Float32Array(size * size);
    for (let i = 0; i < speck.length; i++) speck[i] = rng() < 0.05 ? rng() : 0;

    const height = new Float32Array(size * size);
    for (let i = 0; i < height.length; i++) {
      height[i] = mottle[i] * 0.35 + aggregate[i] * 0.5 - speck[i] * 0.55;
    }

    const map = buildTexture(size, true, 1, (data) => {
      for (let i = 0; i < mottle.length; i++) {
        const v = (mottle[i] - 0.5) * 26 + (aggregate[i] - 0.5) * 14 - speck[i] * 34;
        const j = i * 4;
        data[j] = clamp01((113 + v) / 255) * 255;
        data[j + 1] = clamp01((109 + v) / 255) * 255;
        data[j + 2] = clamp01((102 + v * 0.9) / 255) * 255;
        data[j + 3] = 255;
      }
    });

    const rough = new Float32Array(size * size);
    for (let i = 0; i < rough.length; i++) {
      rough[i] = clamp01(0.35 + mottle[i] * 0.4 + aggregate[i] * 0.25);
    }

    return {
      map: keep(map),
      roughnessMap: keep(scalarTexture(rough, size, 0.78, 0.99, 1)),
      normalMap: keep(normalTexture(height, size, size * 0.06, 1)),
    };
  })();

  /* --- Limestone: parapet, copings ---------------------------------- */
  const stone = (() => {
    const rng = mulberry32(0x5407e);
    const grain = fbm(size, 5, 5, rng);
    const bed = periodicNoise1D(size, 8, rng); // horizontal bedding planes
    const pits = new Float32Array(size * size);
    for (let i = 0; i < pits.length; i++) pits[i] = rng() < 0.03 ? rng() : 0;

    const height = new Float32Array(size * size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = y * size + x;
        height[i] = grain[i] * 0.6 + bed[y] * 0.35 - pits[i] * 0.6;
      }
    }

    const map = buildTexture(size, true, 1, (data) => {
      for (let y = 0; y < size; y++) {
        const b = (bed[y] - 0.5) * 12;
        for (let x = 0; x < size; x++) {
          const i = y * size + x;
          const v = (grain[i] - 0.5) * 30 + b - pits[i] * 30;
          const j = i * 4;
          data[j] = clamp01((172 + v) / 255) * 255;
          data[j + 1] = clamp01((159 + v) / 255) * 255;
          data[j + 2] = clamp01((138 + v * 0.85) / 255) * 255;
          data[j + 3] = 255;
        }
      }
    });

    const rough = new Float32Array(size * size);
    for (let i = 0; i < rough.length; i++) rough[i] = clamp01(grain[i] * 0.7 + pits[i]);

    return {
      map: keep(map),
      roughnessMap: keep(scalarTexture(rough, size, 0.74, 0.96, 1)),
      normalMap: keep(normalTexture(height, size, size * 0.07, 1)),
    };
  })();

  /* --- Materials ----------------------------------------------------- */

  // Repeats are per-consumer, so each caller clones the shared maps rather
  // than mutating them. Clones share the same GPU upload; only the transform
  // differs, which is exactly what we want.
  function tiled(maps, repeat) {
    const out = {};
    for (const k of Object.keys(maps)) {
      const t = maps[k].clone();
      t.needsUpdate = true;
      t.repeat.set(repeat, repeat);
      out[k] = keep(t);
    }
    return out;
  }

  const steelMat = own(new THREE.MeshStandardMaterial({
    ...steel,
    color: 0xffffff,
    metalness: 0.92,
    roughness: 1.0,            // scaled by roughnessMap
    normalScale: new THREE.Vector2(0.7, 0.7),
    envMapIntensity: 0.9,
  }));

  // The same steel, brighter and smoother, for small machined parts (mullions,
  // sill plates) that should catch a highlight against the matte columns.
  const steelBrightMat = own(new THREE.MeshStandardMaterial({
    ...tiled(steel, 3),
    color: 0xb9bec6,
    metalness: 0.95,
    roughness: 0.72,
    normalScale: new THREE.Vector2(0.4, 0.4),
    envMapIntensity: 1.15,
  }));

  const concreteMat = own(new THREE.MeshStandardMaterial({
    ...tiled(concrete, 2),
    roughness: 1.0,
    metalness: 0.0,
    normalScale: new THREE.Vector2(0.8, 0.8),
  }));

  const padMat = own(new THREE.MeshStandardMaterial({
    ...tiled(concrete, 6),
    color: 0xa8a49c,
    roughness: 1.0,
    metalness: 0.0,
    normalScale: new THREE.Vector2(0.9, 0.9),
  }));

  const stoneMat = own(new THREE.MeshStandardMaterial({
    ...tiled(stone, 4),
    roughness: 1.0,
    metalness: 0.0,
    normalScale: new THREE.Vector2(0.85, 0.85),
  }));

  const copingMat = own(new THREE.MeshStandardMaterial({
    ...tiled(stone, 2),
    color: 0xc8bda8,
    roughness: 1.0,
    metalness: 0.0,
    normalScale: new THREE.Vector2(0.6, 0.6),
  }));

  /* --- Zone-tinted glass --------------------------------------------
   * Two layers make a convincing pane cheaply: a near-clear reflective sheet
   * that picks up the sky's environment map, and a dim tinted scrim behind it
   * carrying the zone colour. Transmission is deliberately avoided — nine
   * gateways in frame would each want their own transmission pass. */
  const glassCache = new Map();
  function glassFor(tint) {
    const key = tint >>> 0;
    let g = glassCache.get(key);
    if (g) return g;
    const pane = own(new THREE.MeshStandardMaterial({
      color: 0xdfe8f2,
      metalness: 0.1,
      roughness: 0.06,
      transparent: true,
      opacity: 0.17,
      envMapIntensity: 2.2,
      depthWrite: false,
      side: THREE.DoubleSide,
    }));
    const scrim = own(new THREE.MeshBasicMaterial({
      color: tint,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    }));
    g = { pane, scrim };
    glassCache.set(key, g);
    return g;
  }

  /* --- Etched nameplate ---------------------------------------------
   * Blackened steel plate, numeral and word cut into it: a dark groove offset
   * up-left and a bright burr offset down-right around a mid-tone fill reads
   * as engraving under almost any light direction. */
  function plateTexture(digit, word, tint) {
    const W = 512, H = 160;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#23262b');
    bg.addColorStop(0.5, '#16181c');
    bg.addColorStop(1, '#0e1013');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    // Brushed grain across the plate.
    const rng = mulberry32(0x91a7e + digit.charCodeAt(0));
    g.globalAlpha = 0.10;
    for (let i = 0; i < 220; i++) {
      const y = rng() * H;
      g.strokeStyle = rng() < 0.5 ? '#000000' : '#8b93a0';
      g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke();
    }
    g.globalAlpha = 1;
    // Bevelled border.
    g.strokeStyle = '#3d434c'; g.lineWidth = 3;
    g.strokeRect(7, 7, W - 14, H - 14);
    g.strokeStyle = '#05060a'; g.lineWidth = 2;
    g.strokeRect(11, 11, W - 22, H - 22);

    const tintCss = '#' + (tint >>> 0).toString(16).padStart(6, '0');
    const engrave = (text, font, x, y, fill) => {
      g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = '#05070a'; g.fillText(text, x - 2, y - 2);   // cut shadow
      g.fillStyle = '#6f7883'; g.fillText(text, x + 2, y + 2);   // burr highlight
      g.fillStyle = fill; g.fillText(text, x, y);
    };
    engrave(digit, 'bold 104px Georgia, serif', 74, H / 2, tintCss);
    // Divider rule between numeral and word.
    g.fillStyle = '#39404a'; g.fillRect(132, 34, 2, H - 68);
    const long = word.length > 9;
    engrave(word, `${long ? 30 : 40}px Georgia, serif`, 330, H / 2, '#cbbfa2');
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    return keep(tex);
  }

  return {
    steel: steelMat,
    steelBright: steelBrightMat,
    concrete: concreteMat,
    pad: padMat,
    stone: stoneMat,
    coping: copingMat,
    glassFor,
    plateTexture,
    // Raw map sets, for callers that want their own repeat/tint.
    maps: { steel, concrete, stone },
    tiled,
    dispose() {
      for (const t of textures) t.dispose();
      for (const m of materials) m.dispose();
      textures.length = 0;
      materials.length = 0;
      glassCache.clear();
    },
  };
}
