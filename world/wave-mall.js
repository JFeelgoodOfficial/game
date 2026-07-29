/**
 * wave-mall.js — <wave-mall> custom element.
 * A stylized Three.js interior: an 8-level interdimensional mall atrium.
 * Smooth vector-like 3D volumes; every surface texture is procedural pixel art
 * (NearestFilter, limited palettes, ordered dithering) + neon bloom.
 *
 * Department names, taglines, tenant names and accent hexes are lifted from
 * JFeelgoodOfficial/game → world/wavemallprime.js (C.DEPARTMENTS, C.COLORS).
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

/* ---------------------------------------------------------------- palette */
const P = {
  magenta: '#d4408f', hotpink: '#ff5fa8', teal: '#40d4c8', amber: '#ffb347',
  lavender: '#b6a3c9', indigo: '#241a4a', deep: '#150f30', silver: '#c8d0e0',
  gold: '#ffd88a', mint: '#9ff2d8', peach: '#ffc9a8', white: '#fdf6ff',
  night: '#0a0620', violet: '#7a4fd0',
};

const FLOOR_H = 8;
const VOID_X = 13;      // atrium half-width (open shaft)
const STORE_X = 18.5;   // storefront line — the gap to VOID_X is the promenade
const VOID_Z = 70;      // atrium half-length
const OUT_X = 34;       // outer shell half-width
const OUT_Z = 90;       // outer shell half-length

const DEPTS = [
  { name: 'HOME DECOR', tag: 'furniture · lighting · rugs · wall art · plants',
    sign: 0xff5fc8, accent: 0xffb347, room: 0xf6d9c8, carpet: 0x2a2a8c, motif: 'decor', vista: 'moons', em: 1,
    stores: ['NEBULA NEST', 'ORBIT & OAK', 'LUMEN LIVING', 'PLUSH PULSAR'] },
  { name: 'GLASTELLE', tag: 'orbital psychology · understand · harmony · ascend',
    sign: 0x7bff8a, accent: 0xff8a33, room: 0xff9a3c, carpet: 0x5c2a12, motif: 'lab', vista: 'gas', em: 0.42,
    stores: ['SYNAPSE BOOKS', 'GLASS MIND', 'THE CALM CHAMBER', 'INNER ORBIT'] },
  { name: 'ELECTRONICS DEPARTMENT', tag: 'audio · holo · compute · repair',
    sign: 0x5fd0ff, accent: 0x40b0ff, room: 0x1c6a72, carpet: 0x0e3340, motif: 'circuit', vista: 'starfield', em: 0.8,
    stores: ['NEUROSPARK', 'CIRCUIT SONG', 'WAVEFORM & CO', 'SIGNALWORKS'] },
  { name: "XAVIER'S GIFTS", tag: 'gifts · wrapping · occasions',
    sign: 0xffffff, accent: 0xc8d0e0, room: 0x8e93a8, carpet: 0x2b2f42, motif: 'gifts', vista: 'portal', em: 0.3,
    stores: ["XAVIER'S", 'THE GIFT NEXUS', 'WHITEBOX', 'KEEPSAKE COSMOS'] },
  { name: "MEN'S CASUALWEAR", tag: 'daywear · synthwear · denim',
    sign: 0xff5fa8, accent: 0xff8fd0, room: 0xf2a0c8, carpet: 0x7a2a5c, motif: 'clothes', vista: 'moons', em: 0.45,
    stores: ['LUCID DAYWEAR', 'SLYNK SYNTHWEAR', 'TEZZARO', 'ZERO-G DENIM'] },
  { name: 'RAMDA', tag: 'timepieces · numerals · curios',
    sign: 0xffd23f, accent: 0xffb347, room: 0xffc24a, carpet: 0x8a4a10, motif: 'numbers', vista: 'nebula', em: 0.42,
    stores: ['RAMDA & SONS', 'THE COUNTING HOUSE', 'GOLDEN RATIO', 'ABACUS ATTIC'] },
  { name: 'SPORTING GOODS', tag: 'zero-g gear · courts · trails',
    sign: 0x7bff8a, accent: 0x40d4c8, room: 0x1b6a58, carpet: 0x123a30, motif: 'sport', vista: 'arena', em: 0.62,
    stores: ['APEX ASCENT', 'LOW-G LEAGUE', 'VELOCITY VAULT', 'JETPACK JUNCTION'] },
  { name: 'FELUZIA', tag: 'music · merch · stagecraft',
    sign: 0xffd88a, accent: 0xb07cff, room: 0x3a2170, carpet: 0x2a1250, motif: 'stage', vista: 'crowd', em: 0.55,
    stores: ['FELUZIA LIVE', 'ENCORE', 'THE GREEN ROOM', 'AMP & ECHO'] },
];

/* ------------------------------------------------------- pixel-art helpers */
function cnv(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d');
  x.imageSmoothingEnabled = false;
  return { c, x };
}
function tex(c, rx = 1, ry = 1) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestMipmapNearestFilter;
  t.generateMipmaps = true;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  return t;
}
const hex = (n) => '#' + n.toString(16).padStart(6, '0');
function px(x, X, Y, W, H, col) { x.fillStyle = col; x.fillRect(X | 0, Y | 0, W | 0, H | 0); }
// 2x2 ordered dither between two colors (retro shading, no gradients)
function dither(x, X, Y, W, H, a, b, dense = 2) {
  px(x, X, Y, W, H, a);
  x.fillStyle = b;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    if (((i + j * dense) % 4) === 0) x.fillRect(X + i, Y + j, 1, 1);
  }
}
function pxText(x, s, cx, cy, size, col, glow = true) {
  x.font = `bold ${size}px "Courier New", monospace`;
  x.textAlign = 'center'; x.textBaseline = 'middle';
  if (glow) { x.shadowColor = col; x.shadowBlur = size * 0.5; }
  x.fillStyle = col;
  x.fillText(s, cx, cy); x.fillText(s, cx, cy);
  x.shadowBlur = 0;
}
function stars(x, W, H, n, cols = ['#ffffff', '#a9f7ff', '#ffc9ec']) {
  for (let i = 0; i < n; i++) {
    const sx = (Math.random() * W) | 0, sy = (Math.random() * H) | 0;
    px(x, sx, sy, 1, 1, cols[(Math.random() * cols.length) | 0]);
  }
}

/* -------------------------------------------------- storefront strip (tiled)
 * 3 bays × 96px, 72 tall. Tiles along the corridor. */
function storefrontStrip(d) {
  const BW = 96, W = BW * 3, H = 72;
  const { c, x } = cnv(W, H);
  const room = hex(d.room), acc = hex(d.accent), sign = hex(d.sign);
  px(x, 0, 0, W, H, P.deep);
  for (let b = 0; b < 3; b++) {
    const X = b * BW;
    // bay shell + lit interior
    dither(x, X + 3, 6, BW - 6, H - 12, room, P.deep, 3);
    px(x, X + 3, 6, BW - 6, 3, acc);                     // fascia glow line
    px(x, X + 3, H - 9, BW - 6, 3, P.silver);            // threshold
    px(x, X, 0, 3, H, P.night); px(x, X + BW - 3, 0, 3, H, P.night); // pilasters
    px(x, X + 8, 12, BW - 16, 22, P.night);              // sign panel
    px(x, X + 8, 12, BW - 16, 1, sign);
    pxText(x, d.stores[b % d.stores.length], X + BW / 2, 24, 13, sign);
    // display window
    dither(x, X + 8, 38, BW - 16, H - 50, hex(d.accent), P.night, 2);
    px(x, X + BW / 2 - 1, 38, 2, H - 50, P.night);       // mullion
    motif(x, d.motif, X + 10, 40, BW - 20, H - 54, d, b);
    // doorway on the middle bay
    if (b === 1) { px(x, X + 38, 44, 20, H - 53, P.night); px(x, X + 38, 44, 20, 2, acc); }
  }
  return tex(c);
}

function motif(x, kind, X, Y, W, H, d, seed) {
  const acc = hex(d.accent), s = hex(d.sign);
  const base = Y + H - 2;
  const R = (a, b, w, h, c) => px(x, X + a, base - b - h, w, h, c);
  if (kind === 'decor') {                       // mint sofas, lamp, plants
    R(2, 0, 22, 9, P.mint); R(2, 8, 22, 3, P.white); R(28, 0, 10, 6, P.mint);
    R(42, 0, 16, 4, P.white); R(46, 4, 8, 6, '#5fd0ff');            // table + display
    R(62, 0, 6, 14, '#7bff8a'); R(60, 13, 10, 5, '#3aa85c');        // plant
    R(30, 16, 3, 8, P.silver); R(26, 22, 11, 5, acc);               // hanging lamp
  } else if (kind === 'lab') {                  // test tubes, orbs, terminals
    R(2, 0, 14, 12, '#2a1a10'); R(4, 12, 10, 8, '#7bff8a');         // terminal
    for (let i = 0; i < 4; i++) { R(20 + i * 8, 0, 4, 16, P.white); R(20 + i * 8, 0, 4, 6 + i * 2, ['#7bff8a', '#ff8a33', '#5fd0ff', '#ff5fa8'][i]); }
    R(56, 2, 14, 14, '#ffd8a8'); R(59, 5, 8, 8, '#ff8a33');         // atmosphere orb
    R(54, 0, 18, 2, P.silver);
  } else if (kind === 'circuit') {              // boards, VCRs, boomboxes
    for (let i = 0; i < 6; i++) R(4 + i * 11, 18, 8, 1, '#7bff8a');
    R(2, 0, 18, 10, '#0e2a30'); R(4, 2, 14, 6, '#5fd0ff');          // monitor
    R(24, 0, 20, 7, '#243040'); R(27, 2, 5, 3, s); R(35, 2, 5, 3, s); // boombox
    R(50, 0, 20, 6, '#243040'); R(52, 6, 16, 8, '#0e2a30');
    R(66, 0, 6, 16, acc);
  } else if (kind === 'gifts') {                // floating rune-lit gift boxes
    const cols = ['#ff5fa8', '#5fd0ff', '#ffd88a', '#7bff8a'];
    for (let i = 0; i < 4; i++) { const gx = 4 + i * 17, gy = (i % 2) * 9;
      R(gx, gy, 12, 12, cols[i]); R(gx + 5, gy, 2, 12, P.white); R(gx, gy + 5, 12, 2, P.white); }
    R(4, 22, 68, 1, P.silver);
  } else if (kind === 'clothes') {              // racks + mannequins
    R(2, 12, 30, 2, P.silver);
    for (let i = 0; i < 5; i++) R(4 + i * 6, 0, 4, 12, ['#5fd0ff', '#ff5fa8', '#ffd88a', '#7bff8a', P.white][i]);
    R(38, 0, 8, 20, P.silver); R(39, 20, 6, 5, P.lavender);         // mannequin
    R(52, 4, 18, 16, '#c8b8e8'); R(54, 6, 14, 12, P.white);         // mirror
  } else if (kind === 'numbers') {              // numerology murals
    pxText(x, '7', X + 10, base - 10, 20, s); pxText(x, '3', X + 30, base - 12, 16, P.white, false);
    pxText(x, '9', X + 50, base - 9, 22, '#ff5fa8');
    R(2, 0, 68, 2, acc); R(60, 4, 12, 14, '#2a1a10'); R(62, 6, 8, 10, '#7bff8a');
  } else if (kind === 'sport') {                // balls, jerseys, courts
    R(4, 0, 12, 12, '#ff8a33'); R(4, 6, 12, 1, '#2a1a10');
    R(20, 0, 10, 10, P.white); R(22, 2, 6, 6, '#5fd0ff');
    R(34, 4, 14, 16, '#7bff8a'); R(31, 16, 20, 4, '#7bff8a');       // jersey
    R(54, 0, 16, 20, '#123a30'); R(56, 12, 12, 6, acc);
  } else {                                      // stage: trophies, banners
    R(4, 0, 10, 6, P.gold); R(6, 6, 6, 10, P.gold); R(2, 16, 14, 3, P.gold);
    R(24, 0, 12, 22, '#b07cff'); R(26, 14, 8, 6, P.gold);           // banner
    R(44, 0, 14, 5, P.white); R(46, 5, 10, 4, '#ff5fa8');           // shoe
    R(62, 0, 8, 24, P.gold);
  }
}

/* ------------------------------------------------------------ carpet, glass */
function carpetTex(d) {
  const S = 96, { c, x } = cnv(S, S);
  px(x, 0, 0, S, S, hex(d.carpet));
  dither(x, 0, 0, S, S, hex(d.carpet), P.night, 3);
  // concentric galaxy swirl in pixel arcs
  for (let r = 8; r < S * 0.75; r += 9) {
    const col = r % 18 === 8 ? P.white : hex(d.sign);
    for (let a = 0; a < 360; a += 3) {
      const rad = (a * Math.PI) / 180, rr = r + Math.sin(rad * 3) * 3;
      px(x, S / 2 + Math.cos(rad) * rr, S / 2 + Math.sin(rad) * rr * 0.9, 2, 2, col);
    }
  }
  stars(x, S, S, 70, ['#ffffff', hex(d.sign), '#a9f7ff']);
  return tex(c, 6, 24);
}

function vistaTex(d) {
  const W = 192, H = 72, { c, x } = cnv(W, H);
  const kind = d.vista;
  if (kind === 'gas') {
    for (let i = 0; i < H; i += 3) dither(x, 0, i, W, 3, i < H / 2 ? '#ff8a33' : '#ffd23f', '#8a2a10', 2 + (i % 3));
    for (let a = 0; a < 200; a++) px(x, Math.random() * W, Math.random() * H, 3, 2, '#ffd8a8');
    px(x, 30, 12, 26, 26, '#b07cff'); px(x, 34, 16, 18, 18, '#e0b8ff');
  } else if (kind === 'nebula') {
    px(x, 0, 0, W, H, P.night); stars(x, W, H, 200);
    dither(x, 40, 14, 90, 44, '#7a4fd0', P.night, 2);
    dither(x, 60, 24, 50, 24, '#d4408f', '#7a4fd0', 3);
    px(x, 96, 34, 4, 4, P.white);
  } else if (kind === 'arena') {
    px(x, 0, 0, W, H, '#123a30');
    for (let i = 0; i < 8; i++) dither(x, 0, i * 6, W, 6, i % 2 ? '#1b6a58' : '#123a30', '#0a2a20', 2);
    px(x, 20, 34, W - 40, 26, '#2a8a6a'); px(x, 20, 44, W - 40, 2, P.white);
    for (let i = 0; i < 26; i++) px(x, 22 + i * 6, 8 + (i % 3) * 5, 4, 4, ['#ffd88a', '#ff5fa8', '#5fd0ff'][i % 3]);
  } else if (kind === 'crowd') {
    px(x, 0, 0, W, H, '#2a1250');
    for (let i = 0; i < 320; i++) px(x, Math.random() * W, 10 + Math.random() * 50, 3, 4, ['#7a4fd0', '#b07cff', '#3a2170'][(Math.random() * 3) | 0]);
    for (let i = 0; i < 9; i++) px(x, 10 + i * 21, 0, 3, 12, P.gold);
  } else if (kind === 'portal') {
    px(x, 0, 0, W, H, '#0d0a18'); stars(x, W, H, 160);
    for (let r = 26; r > 2; r -= 3) {
      const col = r > 18 ? '#7a4fd0' : r > 10 ? '#b07cff' : P.white;
      for (let a = 0; a < 360; a += 4) {
        const rad = (a * Math.PI) / 180;
        px(x, W / 2 + Math.cos(rad) * r * 1.4, H / 2 + Math.sin(rad) * r, 2, 2, col);
      }
    }
  } else { // moons / starfield
    px(x, 0, 0, W, H, '#05030f'); stars(x, W, H, 240);
    const moons = [[46, 34, 15, '#c8cad8'], [88, 44, 9, '#9fa4b8'], [128, 26, 6, '#ffc9ec']];
    for (const [mx, my, mr, col] of moons) {
      for (let a = 0; a < 360; a += 2) for (let r = 0; r < mr; r += 1.5) {
        const rad = (a * Math.PI) / 180;
        px(x, mx + Math.cos(rad) * r, my + Math.sin(rad) * r, 2, 2, col);
      }
      for (let i = 0; i < mr * 2; i++) px(x, mx - mr + Math.random() * mr * 2, my - mr + Math.random() * mr * 2, 2, 2, '#7a7f95');
    }
  }
  return tex(c);
}

function signTex(label, accent, tagline) {
  const W = 512, H = 96, { c, x } = cnv(W, H);
  px(x, 0, 0, W, H, '#0d0a12');
  px(x, 0, 0, W, 4, accent); px(x, 0, H - 4, W, 4, accent);
  px(x, 0, 0, 4, H, accent); px(x, W - 4, 0, 4, H, accent);
  pxText(x, label, W / 2, 38, 40, accent);
  pxText(x, tagline.toUpperCase(), W / 2, 74, 15, P.lavender, false);
  return tex(c);
}

function entranceSignTex(name, accent) {
  const W = 384, H = 64, { c, x } = cnv(W, H);
  px(x, 0, 0, W, H, '#0d0a12');
  px(x, 0, 0, W, 3, accent); px(x, 0, H - 3, W, 3, accent);
  pxText(x, name, W / 2, 24, 26, accent);
  pxText(x, 'ENTRANCE', W / 2, 50, 13, P.lavender, false);
  return tex(c);
}

// Back wall of a department-store interior: cove light, shelving bays, motif.
function interiorTex(d) {
  const W = 160, H = 72, { c, x } = cnv(W, H);
  dither(x, 0, 0, W, H, hex(d.room), P.deep, 3);
  px(x, 0, 0, W, 4, hex(d.accent));
  px(x, 0, H - 6, W, 6, P.deep);
  for (let b = 0; b < 4; b++) {
    const X = 6 + b * 39;
    px(x, X, 14, 33, 44, P.night);
    for (let r = 0; r < 3; r++) {
      px(x, X + 2, 18 + r * 14, 29, 2, hex(d.sign));
      for (let i = 0; i < 5; i++) {
        px(x, X + 3 + i * 6, 20 + r * 14, 4, 8,
          [hex(d.accent), hex(d.sign), P.white, P.mint, P.peach][(b + i + r) % 5]);
      }
    }
  }
  motif(x, d.motif, 6, 10, 68, 58, d, 0);
  return tex(c, 2, 1);
}

// Promenade paving in front of the shops
function tileTex() {
  const S = 64, { c, x } = cnv(S, S);
  px(x, 0, 0, S, S, '#b7a9cc');
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      px(x, i * 16 + 1, j * 16 + 1, 14, 14,
        ['#cabde0', '#bfb1d6', '#d2c6e6', '#c3b6dc'][(i + j) % 4]);
    }
  }
  stars(x, S, S, 26, ['#e8dff6', '#a493c0']);
  return tex(c, 3, 40);
}

// Exterior facade: pastel bands, pixel windows, neon coping
function facadeTex() {
  const W = 192, H = 96, { c, x } = cnv(W, H);
  dither(x, 0, 0, W, H, '#c9b8e0', '#7a4fd0', 3);
  for (let b = 0; b < 5; b++) {
    const y0 = 8 + b * 17;
    px(x, 0, y0, W, 3, ['#ff5fc8', '#40d4c8', '#ffd88a', '#b07cff', '#7bff8a'][b]);
    for (let i = 0; i < 22; i++) {
      px(x, 6 + i * 8, y0 + 6, 5, 7, i % 3 ? '#2a1250' : '#ffd8f0');
    }
  }
  px(x, 0, 0, W, 5, '#fdf6ff');
  stars(x, W, H, 40, ['#ffffff', '#ffc9ec']);
  return tex(c);
}

function bigSignTex() {
  const W = 640, H = 160, { c, x } = cnv(W, H);
  px(x, 0, 0, W, H, '#12081c');
  px(x, 0, 0, W, 6, '#ff5fc8'); px(x, 0, H - 6, W, 6, '#ff5fc8');
  px(x, 0, 0, 6, H, '#ff5fc8'); px(x, W - 6, 0, 6, H, '#ff5fc8');
  pxText(x, 'Wave Mall\u2122', W / 2, 62, 66, '#ff5fc8');
  pxText(x, 'INTERDIMENSIONAL RETAIL \u00b7 8 LEVELS \u00b7 ALWAYS OPEN', W / 2, 124, 22, '#a9f7ff', false);
  return tex(c);
}

function plazaTex() {
  const S = 96, { c, x } = cnv(S, S);
  dither(x, 0, 0, S, S, '#3a2a5c', '#1b1636', 3);
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      px(x, i * 24 + 2, j * 24 + 2, 20, 20, (i + j) % 2 ? '#4a3670' : '#3d2c60');
    }
  }
  stars(x, S, S, 60, ['#b6a3c9', '#ffc9ec', '#a9f7ff']);
  return tex(c, 24, 24);
}

function escalatorTex() {
  const S = 64, { c, x } = cnv(S, S);
  px(x, 0, 0, S, S, '#3a4560');
  for (let i = 0; i < 8; i++) {
    px(x, 0, i * 8, S, 5, '#5a6a90');
    px(x, 0, i * 8 + 5, S, 1, '#a9f7ff');
    for (let j = 0; j < 8; j++) px(x, j * 8 + 3, i * 8 + 1, 2, 3, '#8fa0c0');
  }
  return tex(c, 1, 6);
}

function ceilingTex(d) {
  const W = 128, H = 128, { c, x } = cnv(W, H);
  dither(x, 0, 0, W, H, '#1b1636', P.night, 3);
  px(x, 8, 0, 6, H, hex(d.accent));
  px(x, 60, 0, 4, H, P.white);
  px(x, 110, 0, 6, H, hex(d.sign));
  return tex(c, 3, 12);
}

/* ---------------------------------------------------------- portal material */
const PORTAL_FRAG = `
uniform float u_time; uniform vec3 u_a; uniform vec3 u_b; varying vec2 vUv;
float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5); }
void main(){
  vec2 p = (vUv - 0.5) * 2.0;
  float r = length(p);
  float a = atan(p.y, p.x);
  float sw = sin(a * 3.0 + u_time * 1.4 - r * 9.0) * 0.5 + 0.5;
  float ring = smoothstep(1.0, 0.72, r) * smoothstep(0.0, 0.25, r);
  vec3 col = mix(u_b, u_a, sw * ring);
  col += vec3(1.0) * pow(1.0 - abs(r - 0.82) * 6.0, 4.0);
  float core = smoothstep(0.34, 0.0, r);
  col = mix(col, vec3(0.02, 0.0, 0.06), core);
  // pixel-snap the output so the portal reads as a sprite
  col = floor(col * 12.0) / 12.0;
  float alpha = smoothstep(1.0, 0.9, r);
  if (h(floor(vUv * 64.0)) < 0.04) col += 0.25;
  gl_FragColor = vec4(col, alpha);
}`;
const PORTAL_VERT = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;

/* ================================================================ element */
class WaveMall extends HTMLElement {
  static get observedAttributes() { return ['floor', 'pixelation', 'bloom', 'tour']; }

  constructor() {
    super();
    this._floor = 0; this._pixelation = 0.5; this._bloom = 0.6; this._tour = false;
    this._anim = [];
  }

  set floor(v) { this._floor = Math.max(-1, Math.min(7, Math.round(+v))); this._retarget(); }
  get floor() { return this._floor; }
  set pixelation(v) { this._pixelation = Math.max(0, Math.min(1, +v)); this._applyDpr(); }
  set bloom(v) { this._bloom = +v; if (this.bloomPass) this.bloomPass.strength = this._bloom; }
  set tour(v) { this._tour = v === true || v === 'true'; }

  attributeChangedCallback(n, _o, v) { if (v !== null) this[n] = v; }

  connectedCallback() {
    this._alive = true;
    if (this._built) { this._start(); return; }
    this._built = true;
    this.style.display = 'block';
    this.style.position = this.style.position || 'absolute';
    this.style.inset = '0';
    this.style.overflow = 'hidden';
    this._build();
  }

  disconnectedCallback() {
    this._alive = false;
    this.renderer?.setAnimationLoop(null);
    // React can detach/reattach the same node during a remount; only tear down
    // GPU resources once we are certain the element is gone for good.
    setTimeout(() => { if (!this._alive && !this.isConnected) this._dispose(); }, 400);
  }

  /* -------------------------------------------------------------- scaffold */
  _build() {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0620);
    scene.fog = new THREE.FogExp2(0x1a1040, 0.0072);
    this.scene = scene;

    const camera = new THREE.PerspectiveCamera(62, 16 / 9, 0.5, 900);
    camera.position.set(0, 6.5, 58);
    this.camera = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.66;
    renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;image-rendering:pixelated';
    this.appendChild(renderer.domElement);
    this.renderer = renderer;

    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.02).texture;
    scene.environmentIntensity = 0.35;
    pmrem.dispose();

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = 0.06;
    controls.minDistance = 4; controls.maxDistance = 160;
    controls.maxPolarAngle = Math.PI * 0.86;
    controls.target.set(0, 5, 0);
    this.controls = controls;

    scene.add(new THREE.HemisphereLight(0xc9b8ff, 0x2a1250, 0.7));
    scene.add(new THREE.AmbientLight(0xb6a3c9, 0.5));
    const key = new THREE.DirectionalLight(0xffd8f0, 0.5);
    key.position.set(30, 90, 40); scene.add(key);
    for (let i = 0; i < 3; i++) {
      for (const sx of [-1, 1]) {
        const l = new THREE.PointLight(sx > 0 ? 0x40d4c8 : 0xd4408f, 70, 120, 2);
        l.position.set(sx * 9, 10 + i * 22, -46 + i * 46);
        this.scene.add(l);
      }
    }

    this._buildMall();
    this._buildStage();
    this._buildExterior();
    this._buildAtriumFX();

    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(1280, 720), this._bloom, 0.5, 1.15);
    composer.addPass(bloom); composer.addPass(new OutputPass());
    this.composer = composer; this.bloomPass = bloom;

    this._ro = new ResizeObserver(() => this._resize());
    this._ro.observe(this);
    this._resize(); this._applyDpr(); this._retarget(true);

    this._rate = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0.15 : 1;
    // Freeze harness: ?mallseek=N renders one deterministic frame at N seconds.
    const seek = new URLSearchParams(location.search).get('mallseek');
    if (seek !== null) { this._frame(parseFloat(seek) || 0); window.__ready = true; return; }
    this._clock = new THREE.Clock();
    this._start();
  }

  _start() {
    if (!this.renderer || !this._clock) return;
    this.renderer.setAnimationLoop(() => {
      const t = this._clock.getElapsedTime() * this._rate;
      this._frame(Number.isFinite(t) ? t : 0);
    });
  }

  /* ------------------------------------------------------------ the levels */
  _buildMall() {
    const root = new THREE.Group();
    this.scene.add(root);
    this.root = root;
    this.floorAnchors = [];

    const terrazzo = new THREE.MeshStandardMaterial({ color: 0x9a94a8, roughness: 0.22, metalness: 0.55 });
    const shell = new THREE.MeshStandardMaterial({ color: 0x2b2350, roughness: 0.7, metalness: 0.15, side: THREE.DoubleSide });

    // outer shell (walls behind the shops + top cap) — keeps light and fog in
    const shellGeo = [];
    root.add(new THREE.Mesh(new THREE.PlaneGeometry(OUT_Z * 2, FLOOR_H * 8 + 14), shell).translateX(-OUT_X).rotateY(Math.PI / 2));
    const rightShell = new THREE.Mesh(new THREE.PlaneGeometry(OUT_Z * 2, FLOOR_H * 8 + 14), shell);
    rightShell.position.x = OUT_X; rightShell.rotation.y = -Math.PI / 2;
    rightShell.position.y = FLOOR_H * 4; root.add(rightShell);
    root.children[0].position.y = FLOOR_H * 4;
    void shellGeo;

    const esc = escalatorTex();
    this.escTex = esc;

    DEPTS.forEach((d, i) => {
      const y = i * FLOOR_H;
      const g = new THREE.Group(); g.position.y = y; root.add(g);
      const acc = new THREE.Color(d.accent), sgn = new THREE.Color(d.sign);

      // --- slabs (two side decks + two end bridges) ---
      const sideW = OUT_X - VOID_X;
      for (const sx of [-1, 1]) {
        const deck = new THREE.Mesh(new THREE.BoxGeometry(sideW, 0.8, OUT_Z * 2), terrazzo);
        deck.position.set(sx * (VOID_X + sideW / 2), -0.4, 0); g.add(deck);
        // promenade paving running the full length of the shopfronts
        const pave = this._tex(d, 'tile', () => tileTex()).clone();
        pave.needsUpdate = true;
        const prom = new THREE.Mesh(new THREE.PlaneGeometry(STORE_X - VOID_X, OUT_Z * 2),
          new THREE.MeshStandardMaterial({ map: pave, roughness: 0.62, metalness: 0.12 }));
        prom.rotation.x = -Math.PI / 2;
        prom.position.set(sx * (VOID_X + (STORE_X - VOID_X) / 2), 0.03, 0); g.add(prom);
        const guide = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, OUT_Z * 2 - 4),
          new THREE.MeshStandardMaterial({ color: sgn, emissive: sgn, emissiveIntensity: 0.7 * (d.em ?? 1) }));
        guide.position.set(sx * (VOID_X + 2.4), 0.08, 0); g.add(guide);
      }
      for (const sz of [-1, 1]) {
        const br = new THREE.Mesh(new THREE.BoxGeometry(VOID_X * 2, 0.8, OUT_Z - VOID_Z), terrazzo);
        br.position.set(0, -0.4, sz * (VOID_Z + (OUT_Z - VOID_Z) / 2)); g.add(br);
      }

      // --- storefronts: four walk-in bays per side, side by side all the way down
      const BAYS = [-60, 0, 60], BAY_W = 60, DOOR = 26;
      const stripBase = this._tex(d, 'strip', () => storefrontStrip(d));
      const partyMat = new THREE.MeshStandardMaterial({ color: d.room, roughness: 0.72 });
      for (const sx of [-1, 1]) {
        const segs = [];
        for (const bz of BAYS) {
          segs.push([bz - BAY_W / 2, bz - DOOR / 2]);
          segs.push([bz + DOOR / 2, bz + BAY_W / 2]);
        }
        for (const [z0, z1] of segs) {
          const L = z1 - z0;
          const map = stripBase.clone(); map.needsUpdate = true;
          map.repeat.set(L / 15, 1);
          map.offset.x = (z0 + OUT_Z) / 15;
          const wall = new THREE.Mesh(new THREE.PlaneGeometry(L, 6.6),
            new THREE.MeshStandardMaterial({
              map, emissiveMap: map, emissive: 0xffffff, emissiveIntensity: 0.5 * (d.em ?? 1),
              roughness: 0.42, metalness: 0.2, side: THREE.DoubleSide,
            }));
          wall.position.set(sx * STORE_X, 3.3, (z0 + z1) / 2);
          wall.rotation.y = sx > 0 ? -Math.PI / 2 : Math.PI / 2;   // face the atrium
          g.add(wall);
        }
        for (let k = 0; k <= BAYS.length; k++) {
          const div = new THREE.Mesh(new THREE.BoxGeometry(OUT_X - STORE_X, 6.6, 0.5), partyMat);
          div.position.set(sx * (STORE_X + (OUT_X - STORE_X) / 2), 3.3, -OUT_Z + k * BAY_W);
          g.add(div);
        }
        for (const bz of BAYS) this._addStore(g, d, sx, bz, DOOR, BAY_W);
        // neon fascia + floor wash
        const fascia = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.5, OUT_Z * 2),
          new THREE.MeshStandardMaterial({ color: acc, emissive: acc, emissiveIntensity: 1.0 * (d.em ?? 1), roughness: 0.4 }));
        fascia.position.set(sx * (STORE_X - 0.3), 6.9, 0); g.add(fascia);
        const kick = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.14, OUT_Z * 2),
          new THREE.MeshStandardMaterial({ color: sgn, emissive: sgn, emissiveIntensity: 0.8 * (d.em ?? 1) }));
        kick.position.set(sx * (STORE_X - 0.25), 0.18, 0); g.add(kick);

        // glass balcony rail at the void edge — segmented so every escalator
        // landing reads as an open gate in the balustrade
        const gaps = [];
        if (i < 7) { const dr = i % 2 ? 1 : -1; gaps.push(dr * (15 + sx * 5) - dr * 10.1); }
        if (i > 0) { const dr = (i - 1) % 2 ? 1 : -1; gaps.push(dr * (15 + sx * 5) + dr * 10.1); }
        gaps.sort((a, b) => a - b);
        const runs = [];
        let z0 = -VOID_Z;
        for (const gz of gaps) {
          if (gz - 4.6 > z0) runs.push([z0, gz - 4.6]);
          z0 = Math.max(z0, gz + 4.6);
        }
        if (z0 < VOID_Z) runs.push([z0, VOID_Z]);
        for (const [a, b] of runs) {
          const L = b - a, zc2 = (a + b) / 2;
          const glass = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.15, L),
            new THREE.MeshStandardMaterial({
              color: 0x9ff2d8, transparent: true, opacity: 0.16, roughness: 0.05,
              metalness: 0,
            }));
          glass.position.set(sx * (VOID_X - 0.06), 0.75, zc2); g.add(glass);
          const rail = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.16, L),
            new THREE.MeshStandardMaterial({ color: sgn, emissive: sgn, emissiveIntensity: 1.0 * (d.em ?? 1) }));
          rail.position.set(sx * (VOID_X - 0.06), 1.4, zc2); g.add(rail);
          // newel post capping each run end
          for (const e of [a, b]) {
            const post = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.55, 0.3),
              new THREE.MeshStandardMaterial({ color: 0xe4dff2, roughness: 0.3, metalness: 0.5 }));
            post.position.set(sx * (VOID_X - 0.06), 0.78, e); g.add(post);
          }
        }
      }

      // --- ceiling over the shop decks ---
      const ceilMat = new THREE.MeshStandardMaterial({
        map: this._tex(d, 'ceil', () => ceilingTex(d)), emissive: 0xffffff, roughness: 0.6, metalness: 0.1, side: THREE.DoubleSide,
      });
      ceilMat.emissiveMap = ceilMat.map; ceilMat.emissiveIntensity = 0.28;
      for (const sx of [-1, 1]) {
        const ceil = new THREE.Mesh(new THREE.PlaneGeometry(OUT_X - VOID_X, OUT_Z * 2), ceilMat);
        ceil.rotation.x = Math.PI / 2;
        ceil.position.set(sx * (VOID_X + (OUT_X - VOID_X) / 2), FLOOR_H - 0.9, 0); g.add(ceil);
      }

      // --- end vistas (giant windows) ---
      const vista = new THREE.MeshBasicMaterial({ map: this._tex(d, 'vista', () => vistaTex(d)) });
      for (const sz of [-1, 1]) {
        const w = new THREE.Mesh(new THREE.PlaneGeometry(24, 6), vista);
        w.position.set(0, 3.4, sz * (OUT_Z - 0.4));
        w.rotation.y = sz > 0 ? Math.PI : 0; g.add(w);
        const frame = new THREE.Mesh(new THREE.BoxGeometry(25.4, 7.4, 0.5),
          new THREE.MeshStandardMaterial({ color: 0x1b1636, emissive: acc, emissiveIntensity: 0.5 }));
        frame.position.set(0, 3.4, sz * (OUT_Z + 0.3)); g.add(frame);
      }

      // --- hanging department marquees over the atrium ---
      const signMat = new THREE.MeshBasicMaterial({
        map: signTex(d.name, hex(d.sign), d.tag), transparent: true, side: THREE.FrontSide,
      });
      for (const sz of [-1, 1]) {
        const holder = new THREE.Group();
        for (const face of [0, Math.PI]) {
          const sign = new THREE.Mesh(new THREE.PlaneGeometry(17, 3.2), signMat);
          sign.position.y = -1.9; sign.position.z = face ? -0.06 : 0.06;
          sign.rotation.y = face; holder.add(sign);
        }
        for (const hx of [-7, 7]) {
          const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.8),
            new THREE.MeshStandardMaterial({ color: 0x8fa0c0, metalness: 0.8, roughness: 0.3 }));
          wire.position.set(hx, -0.9, 0); holder.add(wire);
        }
        holder.position.set(0, FLOOR_H - 0.7, sz * 26); g.add(holder);
        this._anim.push({ o: holder, k: 'sway', p: Math.random() * 6.28, a: 0.035 });
      }

      // --- hanging lamps down the corridor ---
      for (let k = 0; k < 5; k++) {
        const z = -60 + k * 30;
        for (const sx of [-1, 1]) {
          const lamp = new THREE.Group();
          const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.8),
            new THREE.MeshBasicMaterial({ color: 0x6a7a9a }));
          cord.position.y = -0.9; lamp.add(cord);
          const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.75, 0.6),
            new THREE.MeshStandardMaterial({ color: sgn, emissive: sgn, emissiveIntensity: 0.85 * (d.em ?? 1), transparent: true, opacity: 0.9 }));
          bulb.position.y = -2.2; lamp.add(bulb);
          lamp.position.set(sx * (VOID_X + 4.5), FLOOR_H - 1.1, z);
          g.add(lamp);
          this._anim.push({ o: lamp, k: 'sway', p: k + (sx > 0 ? 1.7 : 0), a: 0.06 });
        }
      }

      // --- portals: dimensional doorways punched into the shopfront line ---
      if (i === 3 || i === 5 || i === 7 || i === 1) {
        for (const sx of [-1, 1]) {
          const mat = new THREE.ShaderMaterial({
            vertexShader: PORTAL_VERT, fragmentShader: PORTAL_FRAG, transparent: true,
            uniforms: { u_time: { value: 0 }, u_a: { value: new THREE.Color(0xb07cff) }, u_b: { value: new THREE.Color(0x2a1250) } },
          });
          const po = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 5.4), mat);
          po.position.set(sx * (STORE_X - 0.35), 2.9, i % 2 ? -18 : 18);
          po.rotation.y = sx > 0 ? -Math.PI / 2 : Math.PI / 2;
          g.add(po);
          this._anim.push({ o: po, k: 'portal' });
          const halo = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.16, 8, 24),
            new THREE.MeshStandardMaterial({ color: 0xb07cff, emissive: 0xb07cff, emissiveIntensity: 1.5 }));
          halo.position.copy(po.position); halo.rotation.y = po.rotation.y;
          halo.scale.set(0.75, 1.05, 1); g.add(halo);
        }
      }

      // --- escalators crossing the atrium up to the next level ---
      if (i < 7) {
        for (const sx of [-1, 1]) {
          const dz = 15, ang = Math.atan2(FLOOR_H, dz), len = Math.hypot(FLOOR_H, dz);
          const dir = i % 2 ? 1 : -1;
          const grp = new THREE.Group();
          const stepMat = new THREE.MeshStandardMaterial({
            map: esc.clone(), roughness: 0.5, metalness: 0.6, emissive: 0x2a3a5a, emissiveIntensity: 0.4,
          });
          stepMat.map.repeat.set(1, 6); stepMat.map.needsUpdate = true;
          const tread = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.5, len), stepMat);
          grp.add(tread);
          this._anim.push({ o: stepMat.map, k: 'scroll', s: 0.35 * dir });
          for (const bx of [-2.5, 2.5]) {
            const bal = new THREE.Mesh(new THREE.BoxGeometry(0.28, 1.5, len),
              new THREE.MeshStandardMaterial({ color: 0x9ff2d8, transparent: true, opacity: 0.2, roughness: 0.05 }));
            bal.position.set(bx, 0.9, 0); grp.add(bal);
            const cap = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, len),
              new THREE.MeshStandardMaterial({ color: 0xa9f7ff, emissive: 0xa9f7ff, emissiveIntensity: 1.1 }));
            cap.position.set(bx, 1.7, 0); grp.add(cap);
          }
          grp.rotation.x = -ang * dir;
          const zc = dir * (15 + sx * 5);
          grp.position.set(sx * 7.5, FLOOR_H / 2, zc);
          g.add(grp);
          // landings: bridge each end back to the shop deck so the run connects
          const zBot = zc - dir * (dz / 2 + 2.6), zTop = zc + dir * (dz / 2 + 2.6);
          for (const [ly, lz] of [[-0.4, zBot], [FLOOR_H - 0.4, zTop]]) {
            const land = new THREE.Mesh(new THREE.BoxGeometry(9.5, 0.8, 6.6), terrazzo);
            land.position.set(sx * 8.6, ly, lz); g.add(land);
            const edge = new THREE.Mesh(new THREE.BoxGeometry(9.5, 0.14, 0.24),
              new THREE.MeshStandardMaterial({ color: 0xa9f7ff, emissive: 0xa9f7ff, emissiveIntensity: 0.9 }));
            edge.position.set(sx * 8.6, ly + 0.48, lz + dir * (ly < 0 ? 3.3 : -3.3)); g.add(edge);
          }
        }
      }

      this.floorAnchors.push({ y, dept: d });
    });

    // ground level below floor 0 + reflective terrazzo concourse
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x6f6a82, roughness: 0.12, metalness: 0.8 });
    const concourse = new THREE.Mesh(new THREE.PlaneGeometry(VOID_X * 2, OUT_Z * 2), floorMat);
    concourse.rotation.x = -Math.PI / 2; concourse.position.y = 0.01; root.add(concourse);
    const inlay = new THREE.Mesh(new THREE.PlaneGeometry(VOID_X * 2 - 2, OUT_Z * 2 - 4),
      new THREE.MeshStandardMaterial({ map: this._tex(DEPTS[0], 'carpet', () => carpetTex(DEPTS[0])).clone(), roughness: 0.3, metalness: 0.45, transparent: true, opacity: 0.85 }));
    inlay.rotation.x = -Math.PI / 2; inlay.position.y = 0.04; root.add(inlay);
  }

  /* -------------------------------------------- texture cache (per dept) */
  _tex(d, kind, make) {
    this._tc = this._tc || new Map();
    const k = d.name + '|' + kind;
    if (!this._tc.has(k)) this._tc.set(k, make());
    return this._tc.get(k);
  }

  /* ------------------------------- one department store: entrance + interior
   * Local frame: +x = deeper into the store, +z = along the corridor. */
  _addStore(g, d, sx, ez, gap, wz = 13) {
    const acc = new THREE.Color(d.accent), sgn = new THREE.Color(d.sign);
    const EM = d.em ?? 1;   // per-department interior emissive trim (pale rooms clip fast)
    const s = new THREE.Group();
    s.position.set(sx * (STORE_X + 7.5), 0, ez);
    s.rotation.y = sx > 0 ? 0 : Math.PI;
    g.add(s);

    // Static, non-glowing pieces are merged into one mesh per bay (draw calls).
    const matte = [];
    const bake = (base, sc, pos, col) => {
      const geo = base.clone();
      geo.applyMatrix4(new THREE.Matrix4().compose(
        new THREE.Vector3(pos[0], pos[1], pos[2]), new THREE.Quaternion(),
        new THREE.Vector3(sc[0], sc[1], sc[2])));
      const c = new THREE.Color(col);
      const n = geo.attributes.position.count, arr = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
      geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
      geo.deleteAttribute('uv');
      matte.push(geo);
    };
    const UNIT = WaveMall._ub || (WaveMall._ub = new THREE.BoxGeometry(1, 1, 1));

    // entrance jambs + header + name sign
    for (const j of [-1, 1]) bake(UNIT, [1.1, 6.6, 1.7], [-7.7, 3.3, j * (gap / 2 + 0.85)], 0xe4dff2);
    bake(UNIT, [1.1, 1.5, gap + 3.4], [-7.7, 5.85, 0], 0x120e22);
    const nameSign = new THREE.Mesh(new THREE.PlaneGeometry(13, 1.45),
      new THREE.MeshBasicMaterial({
        map: this._tex(d, 'ent' + ez, () => entranceSignTex(
          d.stores[(ez < -30 ? 0 : ez < 30 ? 1 : 2) % d.stores.length], hex(d.sign))),
        transparent: true,
      }));
    nameSign.position.set(-8.3, 5.85, 0); nameSign.rotation.y = -Math.PI / 2; s.add(nameSign);
    const sill = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.16, gap),
      new THREE.MeshStandardMaterial({ color: sgn, emissive: sgn, emissiveIntensity: 0.9 * EM }));
    sill.position.set(-7.6, 0.1, 0); s.add(sill);

    // open glass doors either side of the walk-through gap
    for (const j of [-1, 1]) {
      const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.12, 5.0, 4.4),
        new THREE.MeshStandardMaterial({
          color: 0x9ff2d8, transparent: true, opacity: 0.2,
          roughness: 0.05, metalness: 0,
        }));
      leaf.position.set(-7.2, 2.6, j * (gap / 2 - 2.4)); s.add(leaf);
    }

    // interior shell: carpet, back wall, ceiling coves
    const floorTex = this._tex(d, 'carpet', () => carpetTex(d)).clone();
    floorTex.repeat.set(2, wz / 10); floorTex.needsUpdate = true;
    const carpet = new THREE.Mesh(new THREE.PlaneGeometry(15, wz - 1),
      new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.6, metalness: 0.1 }));
    carpet.rotation.x = -Math.PI / 2; carpet.position.set(0.4, 0.06, 0); s.add(carpet);

    const iTex = this._tex(d, 'interior', () => interiorTex(d)).clone();
    iTex.repeat.set(wz / 26, 1); iTex.needsUpdate = true;
    const back = new THREE.Mesh(new THREE.PlaneGeometry(wz - 1, 6.4),
      new THREE.MeshStandardMaterial({
        map: iTex,
        emissiveMap: iTex,
        emissive: 0xffffff, emissiveIntensity: 0.7 * EM, roughness: 0.6,
      }));
    back.position.set(7.6, 3.2, 0); back.rotation.y = -Math.PI / 2; s.add(back);

    const sideMat = new THREE.MeshStandardMaterial({ color: d.room, roughness: 0.7 });
    for (const j of [-1, 1]) {
      const side = new THREE.Mesh(new THREE.PlaneGeometry(15, 6.4), sideMat);
      side.position.set(0.4, 3.2, j * (wz / 2 - 0.4)); side.rotation.y = j > 0 ? Math.PI : 0; s.add(side);
    }
    const coveGeo = [];
    for (const cz of [-wz * 0.36, -wz * 0.12, wz * 0.12, wz * 0.36]) {
      const cg = new THREE.BoxGeometry(12, 0.16, 0.5);
      cg.translate(1, 6.3, cz); cg.deleteAttribute('uv'); coveGeo.push(cg);
    }
    const coves = new THREE.Mesh(mergeGeometries(coveGeo),
      new THREE.MeshStandardMaterial({ color: 0xfff4ff, emissive: 0xfff4ff, emissiveIntensity: 1.2 * EM }));
    s.add(coves);
    const lit = new THREE.Mesh(new THREE.PlaneGeometry(13, wz - 2),
      new THREE.MeshStandardMaterial({
        color: 0xf6eeff, emissive: 0xf6eeff, emissiveIntensity: 0.4 * EM, side: THREE.FrontSide,
      }));
    lit.rotation.x = Math.PI / 2; lit.position.set(1, 6.4, 0); s.add(lit);

    // fixtures — themed per department, walk-in showroom scale
    const UB = WaveMall._ub || (WaveMall._ub = new THREE.BoxGeometry(1, 1, 1));
    const UC = WaveMall._uc || (WaveMall._uc = new THREE.CylinderGeometry(0.5, 0.5, 1, 12));
    const US = WaveMall._us || (WaveMall._us = new THREE.SphereGeometry(0.5, 12, 10));
    const MINT = 0x9ff2d8, WHT = 0xfdf6ff, SIL = 0xc8d0e0, GOLD = 0xffd88a, DARK = 0x241a3a;
    let zOff = 0;
    const put = (k, sz, p, col, em = 0.22, spin) => {
      // dim, static props get baked into the merged mesh; glowing/animated ones stay live
      if (!spin && em < 0.45 && k === 'b') {
        bake(UNIT, sz, [p[0], p[1], p[2] + zOff], col);
        return null;
      }
      const m = new THREE.Mesh(k === 'c' ? UC : k === 's' ? US : UB,
        new THREE.MeshStandardMaterial({
          color: col, emissive: col, emissiveIntensity: em * EM, roughness: 0.35, metalness: 0.28,
        }));
      m.scale.set(sz[0], sz[1], sz[2]);
      m.position.set(p[0], p[1], p[2] + zOff);
      s.add(m);
      if (spin) this._anim.push({ o: m, k: 'spin', s: spin });
      return m;
    };

    for (zOff of [-wz * 0.26, wz * 0.06]) {
    switch (d.motif) {
      case 'decor':
        put('b', [5.2, 1.0, 2.2], [3.4, 0.5, -4.4], MINT, 0.3);
        put('b', [5.2, 1.1, 0.6], [3.4, 1.2, -5.4], MINT, 0.3);
        put('b', [2.0, 0.9, 2.0], [-0.6, 0.45, 3.4], MINT, 0.3);
        put('b', [2.0, 0.9, 2.0], [2.6, 0.45, 5.2], MINT, 0.3);
        put('b', [2.8, 0.5, 1.8], [1.4, 0.45, 0.6], WHT, 0.2);
        put('b', [1.3, 0.9, 0.12], [1.4, 1.2, 0.6], 0x5fd0ff, 0.9);
        put('c', [0.18, 3.2, 0.18], [6.2, 1.6, 4.8], SIL, 0.1);
        put('s', [1.3, 1.0, 1.3], [6.2, 3.3, 4.8], d.sign, 0.9);
        put('b', [1.6, 1.2, 1.4], [-6.4, 0.6, -5.2], 0x3aa85c, 0.3);
        put('b', [1.2, 2.0, 1.2], [-6.4, 1.8, -5.2], 0x7bff8a, 0.35);
        break;
      case 'lab':
        for (let t = 0; t < 4; t++) {
          put('c', [0.8, 3.4, 0.8], [5.4, 1.7, -4.8 + t * 3.1],
            [0x7bff8a, 0xff8a33, 0x5fd0ff, 0xff5fa8][t], 0.75);
        }
        put('b', [3.2, 1.0, 1.7], [-1.4, 0.5, -4.6], DARK, 0.1);
        put('b', [2.4, 1.3, 0.12], [-1.4, 1.7, -4.6], 0x7bff8a, 1.0);
        put('s', [2.6, 2.6, 2.6], [1.8, 2.8, 3.8], d.accent, 0.7, 0.25);
        put('c', [1.8, 3.0, 1.8], [6.0, 1.5, 4.6], SIL, 0.15);
        put('b', [2.0, 0.5, 2.0], [1.8, 0.25, 3.8], SIL, 0.2);
        break;
      case 'circuit':
        for (let t = 0; t < 6; t++) {
          put('b', [0.16, 1.1, 1.7], [6.8, 1.6 + (t % 3) * 1.5, -4.6 + Math.floor(t / 3) * 6.4],
            0x5fd0ff, 0.9);
        }
        put('b', [4.2, 1.0, 1.8], [-1.2, 0.5, -4.4], SIL, 0.15);
        put('b', [2.0, 0.9, 0.9], [-1.2, 1.4, -4.4], DARK, 0.15);
        put('b', [2.4, 0.25, 1.4], [1.6, 1.1, 3.6], 0x40b0ff, 0.8);
        put('b', [2.6, 1.0, 1.8], [1.6, 0.5, 3.6], DARK, 0.1);
        put('b', [0.4, 3.2, 6.0], [6.4, 1.6, 0], DARK, 0.1);
        break;
      case 'gifts':
        for (let t = 0; t < 6; t++) {
          put('b', [1.2, 1.2, 1.2],
            [-2 + (t % 3) * 3.4, 2.2 + (t % 2) * 1.4, -4.4 + Math.floor(t / 3) * 8],
            [0xff5fa8, 0x5fd0ff, GOLD, 0x7bff8a, WHT, 0xb07cff][t], 0.55, 0.35);
        }
        for (const pz of [-4.4, 0, 4.4]) put('c', [1.4, 1.1, 1.4], [4.6, 0.55, pz], WHT, 0.3);
        put('b', [0.2, 2.6, 4.4], [6.8, 3.0, 0], 0x2a1250, 0.55);
        break;
      case 'clothes':
        for (const rz of [-4.4, 4.4]) {
          put('b', [4.4, 0.14, 0.14], [-0.6, 2.0, rz], SIL, 0.2);
          for (let t = 0; t < 5; t++) {
            put('b', [0.5, 1.5, 0.9], [-2.4 + t * 0.9, 1.2, rz],
              [0x5fd0ff, 0xff5fa8, GOLD, 0x7bff8a, WHT][t], 0.35);
          }
        }
        for (const mz of [-1.4, 1.8]) {
          put('c', [0.8, 1.7, 0.8], [4.4, 0.85, mz], SIL, 0.25);
          put('s', [0.6, 0.6, 0.6], [4.4, 1.95, mz], SIL, 0.25);
        }
        put('b', [0.16, 3.4, 2.6], [6.9, 2.0, -4.2], 0xd8cdf0, 0.45);
        put('b', [3.2, 0.5, 1.2], [1.6, 0.4, 0], WHT, 0.2);
        break;
      case 'numbers':
        for (let t = 0; t < 5; t++) {
          put('b', [0.9, 1.4 + t * 0.5, 0.9], [-1 + t * 2.2, (1.4 + t * 0.5) / 2, 4.4],
            t % 2 ? GOLD : d.accent, 0.6);
        }
        for (const dz of [-5.0, -1.4]) {
          put('b', [3.0, 1.0, 1.6], [-1.6, 0.5, dz], DARK, 0.1);
          put('b', [2.2, 1.2, 0.12], [-1.6, 1.6, dz], 0x7bff8a, 0.95);
        }
        put('b', [0.2, 2.6, 4.2], [6.8, 3.0, -2], GOLD, 0.5);
        put('c', [1.2, 1.0, 1.2], [4.8, 0.5, -4.6], WHT, 0.25);
        break;
      case 'sport':
        put('b', [2.6, 0.8, 2.6], [-1.2, 0.4, -4.4], DARK, 0.12);
        for (let t = 0; t < 3; t++) {
          put('s', [1.1, 1.1, 1.1], [-2 + t * 0.9, 1.1, -4.4 + (t % 2) * 0.7],
            [0xff8a33, WHT, 0x40d4c8][t], 0.4, t === 1 ? 0.4 : 0);
        }
        for (let t = 0; t < 4; t++) {
          put('b', [0.16, 1.9, 1.5], [6.8, 2.6, -4.6 + t * 3.1],
            [0x7bff8a, WHT, 0x40d4c8, GOLD][t], 0.5);
        }
        put('b', [3.4, 0.5, 1.2], [1.8, 0.4, 4.6], SIL, 0.2);
        put('b', [0.2, 1.7, 2.6], [5.6, 4.2, 3.0], WHT, 0.4);
        put('c', [1.5, 0.14, 1.5], [4.4, 3.4, 3.0], 0xff8a33, 0.7);
        break;
      default: // stage
        for (const az of [-4.6, 4.6]) {
          put('b', [2.2, 2.4, 1.6], [-1.0, 1.2, az], DARK, 0.12);
          put('b', [1.6, 0.5, 0.2], [-1.0, 1.9, az - 0.85], d.accent, 0.7);
        }
        for (let t = 0; t < 3; t++) {
          put('c', [1.2, 1.1, 1.2], [4.6, 0.55, -4.4 + t * 4.4], 0x2a1250, 0.15);
          put('s', [0.9, 1.1, 0.9], [4.6, 1.6, -4.4 + t * 4.4], GOLD, 0.6);
        }
        put('s', [1.8, 1.8, 1.8], [1.6, 4.4, 0], SIL, 0.65, 0.6);
        put('b', [0.6, 2.6, 1.0], [6.6, 1.3, -3.4], 0xb07cff, 0.4);
        break;
    }
    }
    void acc;
    if (matte.length) {
      s.add(new THREE.Mesh(mergeGeometries(matte),
        new THREE.MeshStandardMaterial({
          vertexColors: true, roughness: 0.4, metalness: 0.25,
          emissive: 0xffffff, emissiveIntensity: 0.06 * EM,
        })));
    }
  }

  /* --------------------------------------- the plaza + grand entrance outside */
  _buildExterior() {
    const g = new THREE.Group(); this.root.add(g);
    const FZ = 96;                       // facade plane
    const H = FLOOR_H * 8 + 10;          // building height

    // plaza deck + approach carpet
    const plaza = new THREE.Mesh(new THREE.PlaneGeometry(420, 300),
      new THREE.MeshStandardMaterial({ map: plazaTex(), roughness: 0.5, metalness: 0.3 }));
    plaza.rotation.x = -Math.PI / 2; plaza.position.set(0, -0.85, FZ + 150); g.add(plaza);
    const runner = new THREE.Mesh(new THREE.PlaneGeometry(16, 120),
      new THREE.MeshStandardMaterial({ color: 0xd4408f, emissive: 0xd4408f, emissiveIntensity: 0.4, roughness: 0.7 }));
    runner.rotation.x = -Math.PI / 2; runner.position.set(0, -0.8, FZ + 62); g.add(runner);

    // facade: two piers + lintel around a 26-wide, 14-tall entrance
    const fTex = facadeTex();
    const fMat = new THREE.MeshStandardMaterial({
      map: fTex, emissiveMap: fTex, emissive: 0xffffff, emissiveIntensity: 0.22,
      roughness: 0.55, metalness: 0.2,
    });
    const pier = (w, h, xc, yc) => {
      const t = fTex.clone(); t.repeat.set(w / 34, h / 34); t.needsUpdate = true;
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 2.5),
        new THREE.MeshStandardMaterial({
          map: t, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: 0.22,
          roughness: 0.55, metalness: 0.2,
        }));
      m.position.set(xc, yc, FZ); g.add(m);
    };
    pier(23, H, -35.5, H / 2);
    pier(23, H, 35.5, H / 2);
    pier(48, H - 15, 0, 15 + (H - 15) / 2);
    void fMat;

    // entrance canopy + columns
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(52, 1.6, 16),
      new THREE.MeshStandardMaterial({ color: 0x2a1250, roughness: 0.4, metalness: 0.5 }));
    canopy.position.set(0, 15.5, FZ + 8); g.add(canopy);
    const rimMat = new THREE.MeshStandardMaterial({ color: 0x40d4c8, emissive: 0x40d4c8, emissiveIntensity: 1.4 });
    for (const [w, dz] of [[52, 0.2], [52, 15.8]]) {
      const rim = new THREE.Mesh(new THREE.BoxGeometry(w, 0.5, 0.5), rimMat);
      rim.position.set(0, 14.6, FZ + dz); g.add(rim);
    }
    for (let i = 0; i < 4; i++) {
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 15, 10),
        new THREE.MeshStandardMaterial({ color: 0xe4dff2, roughness: 0.25, metalness: 0.6 }));
      col.position.set(-22 + i * 14.6, 7.5, FZ + 14.5); g.add(col);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.15, 0.6, 10),
        new THREE.MeshStandardMaterial({ color: 0xff5fc8, emissive: 0xff5fc8, emissiveIntensity: 1.2 }));
      band.position.set(-22 + i * 14.6, 11.5, FZ + 14.5); g.add(band);
      this._anim.push({ o: band, k: 'spin', s: 0.5 });
    }

    // the big neon sign + halo rings
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(58, 14.5),
      new THREE.MeshBasicMaterial({ map: bigSignTex(), transparent: true }));
    sign.position.set(0, 26, FZ + 1.6); g.add(sign);
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(9 + i * 3.4, 0.32, 8, 36),
        new THREE.MeshStandardMaterial({
          color: [0xff5fc8, 0x40d4c8, 0xffd88a][i], emissive: [0xff5fc8, 0x40d4c8, 0xffd88a][i],
          emissiveIntensity: 1.3,
        }));
      ring.position.set(0, 38, FZ + 2); ring.rotation.x = 0.35 + i * 0.1; g.add(ring);
      this._anim.push({ o: ring, k: 'spin', s: i % 2 ? 0.3 : -0.22 });
    }

    // entrance portal glow inside the opening (pixel swirl, not a bloom bomb)
    const dTex = vistaTex(DEPTS[3]);
    dTex.repeat.set(1, 1); dTex.needsUpdate = true;
    const door = new THREE.Mesh(new THREE.PlaneGeometry(25, 13.6),
      new THREE.MeshBasicMaterial({ map: dTex }));
    door.position.set(0, 7, FZ - 0.4); g.add(door);
    const dGlow = new THREE.Mesh(new THREE.BoxGeometry(26.5, 0.5, 0.5),
      new THREE.MeshStandardMaterial({ color: 0xff5fc8, emissive: 0xff5fc8, emissiveIntensity: 1.3 }));
    dGlow.position.set(0, 14.1, FZ - 0.2); g.add(dGlow);

    // planters with pixel palms, bollards, and sweeping searchlights
    for (let i = 0; i < 6; i++) {
      const sxp = i < 3 ? -1 : 1, k = i % 3;
      const pz = FZ + 26 + k * 26;
      const box = new THREE.Mesh(new THREE.BoxGeometry(6, 2.2, 6),
        new THREE.MeshStandardMaterial({ color: 0x4a3670, roughness: 0.6 }));
      box.position.set(sxp * 26, 0.25, pz); g.add(box);
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 7, 8),
        new THREE.MeshStandardMaterial({ color: 0x6a4a30, roughness: 0.7 }));
      trunk.position.set(sxp * 26, 4.8, pz); g.add(trunk);
      for (let f = 0; f < 5; f++) {
        const frond = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.4, 1.0),
          new THREE.MeshStandardMaterial({ color: 0x7bff8a, emissive: 0x7bff8a, emissiveIntensity: 0.35 }));
        frond.position.set(sxp * 26, 8.4, pz);
        frond.rotation.y = (f / 5) * Math.PI * 2; frond.rotation.z = 0.28;
        frond.translateX(1.7); g.add(frond);
      }
      const beam = new THREE.Group();
      const cone = new THREE.Mesh(new THREE.ConeGeometry(2.2, 60, 12, 1, true),
        new THREE.MeshBasicMaterial({
          color: [0xff5fc8, 0x40d4c8, 0xffd88a][k], transparent: true, opacity: 0.07,
          blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.FrontSide,
        }));
      cone.position.y = 30; beam.add(cone);
      beam.position.set(sxp * 34, 1, pz);
      beam.rotation.z = sxp * -0.5;
      g.add(beam);
      this._anim.push({ o: beam, k: 'sway', p: i * 1.4, a: 0.45 });
    }
    for (let i = 0; i < 14; i++) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 1.6, 8),
        new THREE.MeshStandardMaterial({ color: 0xa9f7ff, emissive: 0xa9f7ff, emissiveIntensity: 1.1 }));
      b.position.set((i % 2 ? 1 : -1) * 9.6, 0, FZ + 14 + Math.floor(i / 2) * 15); g.add(b);
    }

    // roof crown: pixel-neon crenellations
    for (let i = 0; i < 11; i++) {
      const cr = new THREE.Mesh(new THREE.BoxGeometry(5, 3.4, 3),
        new THREE.MeshStandardMaterial({
          color: i % 2 ? 0xb07cff : 0x40d4c8, emissive: i % 2 ? 0xb07cff : 0x40d4c8,
          emissiveIntensity: 0.9,
        }));
      cr.position.set(-45 + i * 9, H + 1.5, FZ - 1); g.add(cr);
    }
  }

  /* ------------------------------------------- Feluzia finale (top level) */  _buildStage() {
    const y = 7 * FLOOR_H;
    const g = new THREE.Group(); g.position.set(0, y, -52); this.root.add(g);

    const deck = new THREE.Mesh(new THREE.BoxGeometry(24, 1.4, 22),
      new THREE.MeshStandardMaterial({ color: 0x3a2170, roughness: 0.25, metalness: 0.7 }));
    deck.position.y = 0.7; g.add(deck);
    const lip = new THREE.Mesh(new THREE.BoxGeometry(24.6, 0.22, 22.6),
      new THREE.MeshStandardMaterial({ color: 0xffd88a, emissive: 0xffd88a, emissiveIntensity: 1.2 }));
    lip.position.y = 1.45; g.add(lip);

    // crowd backdrop
    const back = new THREE.Mesh(new THREE.PlaneGeometry(26, 10),
      new THREE.MeshBasicMaterial({ map: this._tex(DEPTS[7], 'vista', () => vistaTex(DEPTS[7])).clone() }));
    back.position.set(0, 6, -11.4); g.add(back);

    // gold banners
    for (let i = 0; i < 7; i++) {
      const ban = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 4.4),
        new THREE.MeshStandardMaterial({
          color: i % 2 ? 0xffd88a : 0xb07cff, emissive: i % 2 ? 0xffd88a : 0xb07cff,
          emissiveIntensity: 0.5, side: THREE.DoubleSide,
        }));
      ban.position.set(-9 + i * 3, 5.4, -9.2); g.add(ban);
      this._anim.push({ o: ban, k: 'sway', p: i, a: 0.05 });
    }

    // trophies + floating outfits
    for (let i = 0; i < 6; i++) {
      const t = new THREE.Group();
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.28, 1.1, 10),
        new THREE.MeshStandardMaterial({ color: 0xffd88a, metalness: 1, roughness: 0.16, emissive: 0x6a4a10, emissiveIntensity: 0.5 }));
      cup.position.y = 1.1; t.add(cup);
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 0.9),
        new THREE.MeshStandardMaterial({ color: 0x2a1250, roughness: 0.5 }));
      base.position.y = 0.35; t.add(base);
      t.position.set(-9.5 + i * 3.8, 1.5, 6.5); g.add(t);
    }
    for (let i = 0; i < 5; i++) {
      const shoe = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.5, 0.7),
        new THREE.MeshStandardMaterial({ color: 0xff5fa8, emissive: 0xff5fa8, emissiveIntensity: 0.55, roughness: 0.3 }));
      shoe.position.set(-7 + i * 3.5, 4 + (i % 2), 1); g.add(shoe);
      this._anim.push({ o: shoe, k: 'spin', s: 0.5 });
    }

    // spotlights sweeping the stage
    const beam = new THREE.MeshBasicMaterial({
      color: 0xffd8f0, transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending,
      depthWrite: false, side: THREE.FrontSide,
    });
    for (let i = 0; i < 6; i++) {
      const holder = new THREE.Group();
      const cone = new THREE.Mesh(new THREE.ConeGeometry(1.1, 7, 10, 1, true), beam);
      cone.position.y = -3.5; holder.add(cone);
      holder.position.set(-8 + i * 3.2, 8, -6 + (i % 2) * 3);
      holder.rotation.z = (i - 2.5) * 0.1;
      g.add(holder);
      this._anim.push({ o: holder, k: 'sway', p: i * 1.3, a: 0.3 });
    }
  }

  /* ----------------------------------------------- atrium light + particles */
  _buildAtriumFX() {
    const top = FLOOR_H * 8;
    // skylight cap
    const sky = new THREE.Mesh(new THREE.PlaneGeometry(VOID_X * 2, OUT_Z * 2),
      new THREE.MeshBasicMaterial({ map: vistaTex(DEPTS[0]) }));
    sky.rotation.x = Math.PI / 2; sky.position.y = top + 6; this.root.add(sky);

    // volumetric shafts
    const shaftMat = new THREE.MeshBasicMaterial({
      color: 0xffc9ec, transparent: true, opacity: 0.018, blending: THREE.AdditiveBlending,
      depthWrite: false, side: THREE.FrontSide,
    });
    for (let i = 0; i < 4; i++) {
      const s = new THREE.Mesh(new THREE.ConeGeometry(7, top + 4, 12, 1, true), shaftMat);
      s.position.set((i % 2 ? 1 : -1) * 6, (top + 4) / 2, -54 + i * 34);
      s.rotation.x = Math.PI; this.root.add(s);
    }

    // central portal column: stacked glowing rings
    for (let i = 0; i < 9; i++) {
      const r = new THREE.Mesh(new THREE.TorusGeometry(4.2 + (i % 3) * 0.5, 0.14, 8, 40),
        new THREE.MeshStandardMaterial({
          color: i % 2 ? 0xd4408f : 0x40d4c8, emissive: i % 2 ? 0xd4408f : 0x40d4c8,
          emissiveIntensity: 1.3, transparent: true, opacity: 0.85,
        }));
      r.rotation.x = Math.PI / 2; r.position.set(0, 2 + i * FLOOR_H, 0);
      this.root.add(r);
      this._anim.push({ o: r, k: 'spin', s: (i % 2 ? 0.18 : -0.13) });
    }

    // floating motes / confetti
    const N = 900, pos = new Float32Array(N * 3), col = new Float32Array(N * 3), sz = new Float32Array(N);
    const cols = [new THREE.Color(0xd4408f), new THREE.Color(0x40d4c8), new THREE.Color(0xffd88a), new THREE.Color(0xb6a3c9)];
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (Math.random() - 0.5) * VOID_X * 2.2;
      pos[i * 3 + 1] = Math.random() * (top + 4);
      pos[i * 3 + 2] = (Math.random() - 0.5) * OUT_Z * 2;
      const c = cols[(Math.random() * cols.length) | 0];
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      sz[i] = 0.12 + Math.random() * 0.26;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('asize', new THREE.BufferAttribute(sz, 1));
    const pmat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { u_time: { value: 0 }, u_top: { value: top + 4 } },
      vertexShader: `
        attribute float asize; varying vec3 vC; uniform float u_time; uniform float u_top;
        void main(){
          vC = color;
          vec3 p = position;
          p.y = mod(p.y + u_time * 0.6, u_top);
          p.x += sin(u_time * 0.5 + position.z * 0.2) * 1.2;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = asize * (260.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying vec3 vC;
        void main(){
          vec2 q = floor(gl_PointCoord * 6.0) / 6.0 - 0.5;   // chunky pixel sprite
          if (length(q) > 0.42) discard;
          gl_FragColor = vec4(vC, 0.9);
        }`,
      vertexColors: true,
    });
    const pts = new THREE.Points(geo, pmat);
    this.root.add(pts);
    this.motes = pmat;
  }

  /* ------------------------------------------------------------ frame/state */
  _frame(t) {
    let dt = t - (Number.isFinite(this._last) ? this._last : t);
    if (!Number.isFinite(dt)) dt = 0;
    dt = Math.max(0, Math.min(0.05, dt));
    this._last = t;
    for (const a of this._anim) {
      if (a.k === 'sway') a.o.rotation.z = Math.sin(t * 0.7 + a.p) * a.a;
      else if (a.k === 'spin') a.o.rotation.z += a.s * dt;
      else if (a.k === 'scroll') a.o.offset.y = (a.o.offset.y + a.s * dt) % 1;
      else if (a.k === 'portal') a.o.material.uniforms.u_time.value = t;
    }
    if (this.motes) this.motes.uniforms.u_time.value = t;
    // camera glide toward the selected level
    if (this._goal) {
      const k = 1 - Math.exp(-3.0 * Math.max(dt, 0.016));
      this.controls.target.lerp(this._goal.target, k);
      if (this._snapPos) {
        this.camera.position.lerp(this._goal.pos, k);
        if (this.camera.position.distanceTo(this._goal.pos) < 0.8) this._snapPos = false;
      }
    }
    if (this._tour) this.controls.target.z = Math.sin(t * 0.08) * 26;
    this.controls.update();
    this.composer.render();
  }

  _retarget(instant) {
    const y = this._floor * FLOOR_H;
    // Every level is viewed from the same (+z) end so all signage reads forward.
    // The Feluzia finale sits at the far end, so its level gets a closer seat.
    if (this._floor < 0) {          // the plaza: outside, facing the grand entrance
      this._goal = {
        target: new THREE.Vector3(0, 14, 96),
        pos: new THREE.Vector3(0, 15, 210),
      };
      this._snapPos = true;
      this.dispatchEvent(new CustomEvent('floorchange', { detail: { floor: -1 }, bubbles: true }));
      return;
    }
    const top = this._floor === 7;
    this._goal = {
      target: new THREE.Vector3(0, y + (top ? 4.2 : 3.0), top ? -34 : 20),
      pos: new THREE.Vector3(0, y + (top ? 5.4 : 3.6), top ? 6 : 58),
    };
    this._snapPos = true;
    if (instant) {
      this.camera.position.copy(this._goal.pos);
      this.controls.target.copy(this._goal.target);
      this._snapPos = false;
    }
    this.dispatchEvent(new CustomEvent('floorchange', { detail: { floor: this._floor }, bubbles: true }));
  }

  _applyDpr() {
    if (!this.renderer) return;
    const lo = 0.26, hi = Math.min(devicePixelRatio, 2);
    this.renderer.setPixelRatio(hi + (lo - hi) * this._pixelation);
    this.renderer.domElement.style.imageRendering = this._pixelation > 0.15 ? 'pixelated' : 'auto';
    this._resize();
  }

  _resize() {
    const w = this.clientWidth || 1280, h = this.clientHeight || 720;
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    this.composer?.setSize(w, h);
  }

  _dispose() {
    this.renderer?.setAnimationLoop(null);
    this._ro?.disconnect();
    this.scene?.traverse((o) => {
      o.geometry?.dispose?.();
      const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const m of mats) {
        for (const k in m) { const v = m[k]; if (v && v.isTexture) v.dispose(); }
        m.dispose();
      }
    });
    this.composer?.dispose?.();
    this.renderer?.dispose();
    this.renderer?.forceContextLoss?.();
  }
}

if (!customElements.get('wave-mall')) customElements.define('wave-mall', WaveMall);
window.WaveMallDepartments = DEPTS;
