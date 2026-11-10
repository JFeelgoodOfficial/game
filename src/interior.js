// The freighter's walkable interior (owner override of GDD 1.2 "no walking").
// Press C to stand up out of the pilot seat and walk aft: the flight deck, a
// vestibule with the Wave Collector plaque and the owner's photographs, then
// the gallery hall — the whole painting collection under a glass roof, with
// tall windows down both sides — and an observation lounge at the stern. Walk
// back to the seat and press C to fly again. (G is the separate on-foot planet
// walk in walk.js — different feature, different key.)
//
// Architecture: the interior lives in its own scene, composited over the
// lensed world by a CockpitOverlayPass that runs just BEFORE the cockpit's.
// Every opening (windows, glass roof) shows real space, and the interior
// never warps. The flight deck is not modelled here: the real cockpit rig
// (cockpit3d.js) draws over this scene against its depth, so the dashboard
// you fly is the dashboard you walk away from. This module only supplies the
// room around it — plinth, bulkheads, the seat. The whole group is posed from
// the SHIP's transform each frame, so it rides the ship exactly and
// floating-origin rebases are transparent (nothing here is origin-registered).
//
// Collision is a short list of axis-aligned boxes and a circle push-out — a
// room this size needs walls you cannot walk through, but nothing more.
//
// Scale is metres. The seated eye is the local origin (that's where camera.js
// puts the pilot), -z is the nose, the floor is at y = -1.2 and the standing
// eye at y = +0.45.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { C } from './constants.js';
import { input, moveAxes } from './input.js';
import { camera } from './camera.js';
import { sun } from './sun.js';
import { GALLERY_FILES } from './gallery.js';
import { titleOf, loadArtMid, loadArtFull, disposeArt } from './galleryArt.js';
import { WEAPONS, WEAPON_ORDER, TROPHY_WORLDS } from './arsenal.js';
import { hasWeapon, combatRecord } from './inventory.js';

export const interiorScene = new THREE.Scene();

const FLOOR_Y = -1.2;
const EYE_STAND = 0.45;
const BODY_R = 0.3; // the pilot's collision radius

// --- the plan, nose to stern (z grows aft) ---
const DECK_HW = 1.7, DECK_Z0 = -2.75, DECK_CEIL = 1.2;
const VEST_HW = 2.4, VEST_Z0 = 1.5, VEST_CEIL = 1.6;
const HALL_HW = C.FREIGHTER_HALL_W / 2;
const HALL_Z0 = VEST_Z0 + C.FREIGHTER_VEST_L;
const HALL_Z1 = HALL_Z0 + C.FREIGHTER_HALL_L;
const AFT_Z = HALL_Z1 + C.FREIGHTER_LOUNGE_L;
const ROOF_Y = FLOOR_Y + C.FREIGHTER_HALL_H;
const BAY = 5; // hall rhythm: 3 m of wall, 2 m of window
const PART_HW = 2.5, PART_TOP = 1.8; // freestanding partitions
const ART_Y = 0.5; // canvas centre height (just above the standing eye)

// player state, ship-local: pos on the floor plane, yaw 0 = facing the nose
const player = {
  pos: new THREE.Vector3(0, 0, 0),
  yaw: 0,
  pitch: 0,
};

const group = new THREE.Group();
interiorScene.add(group);

// --- materials (dim albedo on purpose: the interior renders before bloom,
// so only the light strips should ever approach the bloom threshold) ---
const MATS = {
  wall: new THREE.MeshStandardMaterial({ color: 0x424a58, roughness: 0.62, metalness: 0.35 }),
  floor: new THREE.MeshStandardMaterial({ color: 0x2e343f, roughness: 0.8, metalness: 0.3 }),
  deck: new THREE.MeshStandardMaterial({ color: 0x23272e, roughness: 0.35, metalness: 0.55 }),
  trim: new THREE.MeshStandardMaterial({ color: 0x2b313b, roughness: 0.42, metalness: 0.6 }),
  seat: new THREE.MeshStandardMaterial({ color: 0x35404e, roughness: 0.85, metalness: 0.1 }),
  // gallery walls: matte and a shade lighter, so a canvas has something to sit on
  hang: new THREE.MeshStandardMaterial({ color: 0x565b66, roughness: 0.92, metalness: 0.0 }),
  bench: new THREE.MeshStandardMaterial({ color: 0x3b2f2a, roughness: 0.7, metalness: 0.1 }),
  strip: new THREE.MeshBasicMaterial({ color: 0x7fb8c8 }), // under bloom threshold
};
const pictureFrameMat = new THREE.MeshStandardMaterial({ color: 0x1d222b, roughness: 0.5, metalness: 0.5 });

// One glass for every pane: nearly invisible face-on, a cool sheen at a
// glancing angle. Drawn after the opaque shell and never writes depth, so the
// world already in the buffer shows straight through.
const glassMat = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  side: THREE.DoubleSide,
  vertexShader: /* glsl */ `
    varying vec3 vN;
    varying vec3 vV;
    void main() {
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      vN = normalMatrix * normal;
      vV = -mv.xyz;
      gl_Position = projectionMatrix * mv;
    }
  `,
  fragmentShader: /* glsl */ `
    varying vec3 vN;
    varying vec3 vV;
    void main() {
      float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
      float a = 0.035 + 0.3 * f * f * f;
      gl_FragColor = vec4(vec3(0.42, 0.62, 0.74) * a, a);
    }
  `,
  blending: THREE.CustomBlending,
  blendSrc: THREE.OneFactor,
  blendDst: THREE.OneMinusSrcAlphaFactor,
});

// --- the owner's pictures: drop images into src/assets/pictures/ and they
// hang themselves in the frames (alphabetical); empty frames get a
// procedural placeholder ---
const pictureUrls = Object.entries(
  import.meta.glob('./assets/pictures/*.{png,jpg,jpeg,webp}', {
    eager: true,
    query: '?url',
    import: 'default',
  })
)
  .sort(([a], [b]) => (a < b ? -1 : 1))
  .map(([, url]) => url);

function placeholderTexture(seed) {
  const cv = document.createElement('canvas');
  cv.width = 256;
  cv.height = 208;
  const ctx = cv.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, 208);
  grad.addColorStop(0, '#141a26');
  grad.addColorStop(1, '#0a0d14');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 208);
  // a scatter of stars, deterministic per frame slot
  ctx.fillStyle = '#9fb4cc';
  for (let i = 0; i < 40; i++) {
    const h = Math.sin(seed * 37.7 + i * 12.9898) * 43758.5453;
    const h2 = Math.sin(seed * 51.3 + i * 78.233) * 24634.6345;
    const x = (h - Math.floor(h)) * 256;
    const y = (h2 - Math.floor(h2)) * 170;
    ctx.globalAlpha = 0.25 + ((h * 7) % 1) * 0.6;
    ctx.fillRect(x, y, 1.5, 1.5);
  }
  ctx.globalAlpha = 1;
  ctx.strokeStyle = '#d4408f';
  ctx.lineWidth = 2;
  ctx.strokeRect(10, 10, 236, 188);
  ctx.fillStyle = '#5a6a80';
  ctx.font = '13px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('FGSF ARCHIVE — NO PHOTO', 128, 100);
  ctx.font = '10px monospace';
  ctx.fillText('add images to src/assets/pictures/', 128, 120);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

let pictureCount = 0;
// Frames whose image hasn't been fetched yet. The interior is built during
// boot, but nobody can walk it until they have launched and pressed C, so the
// photographs are loaded from an idle callback afterwards rather than in the
// middle of the loading screen.
const pendingPictures = [];
let picturesLoaded = false;

function makePicture(w, h) {
  const g = new THREE.Group();
  const frame = new THREE.Mesh(new THREE.BoxGeometry(w + 0.07, h + 0.07, 0.03), pictureFrameMat);
  g.add(frame);
  const idx = pictureCount++;
  let mat;
  if (idx < pictureUrls.length) {
    // Dark glass until the photograph arrives — a frame with nothing in it
    // reads as a frame, where a white plane would read as a bug.
    mat = new THREE.MeshBasicMaterial({ color: 0x1a1f28 });
    pendingPictures.push({ mat, url: pictureUrls[idx] });
    if (picturesLoaded) loadInteriorPictures(); // a frame built after the load
  } else {
    mat = new THREE.MeshBasicMaterial({ map: placeholderTexture(idx + 1) });
  }
  const face = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  face.position.z = 0.017;
  g.add(face);
  return g;
}

// Idempotent, and safe to call from several places (post-launch idle, and
// again when the player actually stands up) — whichever runs first wins.
export function loadInteriorPictures() {
  picturesLoaded = true;
  if (!pendingPictures.length) return;
  const loader = new THREE.TextureLoader();
  for (const { mat, url } of pendingPictures) {
    const tex = loader.load(url);
    tex.colorSpace = THREE.SRGBColorSpace;
    mat.map = tex;
    mat.color.setHex(0xffffff); // stop tinting once there's an image to show
    mat.needsUpdate = true; // null -> map is a shader change
  }
  pendingPictures.length = 0;
}

// --- the music-credit plaque (Wave Collector) — a brass-toned panel on the
// vestibule wall; E in front of it opens the About popup (credits.js) ---
const PLAQUE_X = -VEST_HW + 0.03;
const PLAQUE_Z = VEST_Z0 + 1.0;

function wrapText(ctx, text, x, y, maxW, lineH) {
  let line = '';
  for (const word of text.split(' ')) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, y);
      y += lineH;
      line = word;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, y);
  return y;
}

function makePlaque() {
  const cv = document.createElement('canvas');
  cv.width = 512;
  cv.height = 320;
  const ctx = cv.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, 320);
  grad.addColorStop(0, '#20242e');
  grad.addColorStop(1, '#12151d');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 320);
  ctx.strokeStyle = '#c8a86a';
  ctx.lineWidth = 3;
  ctx.strokeRect(12, 12, 488, 296);
  ctx.strokeStyle = 'rgba(200,168,106,0.35)';
  ctx.lineWidth = 1;
  ctx.strokeRect(20, 20, 472, 280);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#c8a86a';
  ctx.font = '600 17px monospace';
  ctx.fillText("SHIP'S SOUNDTRACK", 256, 60);
  ctx.fillStyle = '#e8d9b0';
  ctx.font = '700 34px monospace';
  ctx.fillText('WAVE COLLECTOR', 256, 106);
  ctx.fillStyle = '#aab6c8';
  ctx.font = '15px monospace';
  wrapText(
    ctx,
    'All music featured in this game is composed by Wave Collector — an ' +
      'electronic artist whose textured, sample-driven soundscapes bring ' +
      'this world to life.',
    256, 150, 440, 24
  );
  ctx.fillStyle = '#d4408f';
  ctx.font = '600 16px monospace';
  ctx.fillText('- PRESS E FOR MORE -', 256, 288);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;

  const g = new THREE.Group();
  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.41, 0.03), pictureFrameMat);
  g.add(frame);
  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(0.55, 0.34),
    new THREE.MeshBasicMaterial({ map: tex })
  );
  face.position.z = 0.017;
  g.add(face);
  return g;
}

// ---------------------------------------------------------------------------
// shell geometry: boxes by extent, merged to one mesh per material
// ---------------------------------------------------------------------------

const parts = {}; // material key -> [BufferGeometry]
function box(mat, x0, x1, y0, y1, z0, z1) {
  const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  (parts[mat] ||= []).push(g);
}
// the same box on both sides of the centreline
function boxes(mat, x0, x1, y0, y1, z0, z1) {
  box(mat, x0, x1, y0, y1, z0, z1);
  box(mat, -x1, -x0, y0, y1, z0, z1);
}

const glassParts = [];
// a pane in the plane x = const (side windows)
function paneX(x, y0, y1, z0, z1) {
  const g = new THREE.PlaneGeometry(z1 - z0, y1 - y0);
  g.rotateY(Math.PI / 2);
  g.translate(x, (y0 + y1) / 2, (z0 + z1) / 2);
  glassParts.push(g);
}
function paneZ(z, x0, x1, y0, y1) {
  const g = new THREE.PlaneGeometry(x1 - x0, y1 - y0);
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, z);
  glassParts.push(g);
}
function paneY(y, x0, x1, z0, z1) {
  const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0);
  g.rotateX(Math.PI / 2);
  g.translate((x0 + x1) / 2, y, (z0 + z1) / 2);
  glassParts.push(g);
}

// ---------------------------------------------------------------------------
// collision: axis-aligned boxes on the floor plane, [x0, x1, z0, z1] each
// ---------------------------------------------------------------------------

const solids = [];
function solid(x0, x1, z0, z1) {
  solids.push(x0, x1, z0, z1);
}
function solidPair(x0, x1, z0, z1) {
  solid(x0, x1, z0, z1);
  solid(-x1, -x0, z0, z1);
}
let solidBuf = null;

function resolveWalls(p) {
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < solidBuf.length; i += 4) {
      const x0 = solidBuf[i], x1 = solidBuf[i + 1], z0 = solidBuf[i + 2], z1 = solidBuf[i + 3];
      const cx = p.x < x0 ? x0 : p.x > x1 ? x1 : p.x;
      const cz = p.z < z0 ? z0 : p.z > z1 ? z1 : p.z;
      const dx = p.x - cx;
      const dz = p.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= BODY_R * BODY_R) continue;
      if (d2 > 1e-8) {
        const k = BODY_R / Math.sqrt(d2);
        p.x = cx + dx * k;
        p.z = cz + dz * k;
      } else {
        // centre is inside the box: leave by the nearest face
        const l = p.x - x0, r = x1 - p.x, n = p.z - z0, f = z1 - p.z;
        const m = Math.min(l, r, n, f);
        if (m === l) p.x = x0 - BODY_R;
        else if (m === r) p.x = x1 + BODY_R;
        else if (m === n) p.z = z0 - BODY_R;
        else p.z = z1 + BODY_R;
      }
    }
  }
  // belt and braces: never outside the hull, whatever the boxes say
  p.x = Math.max(-HALL_HW + BODY_R, Math.min(HALL_HW - BODY_R, p.x));
  p.z = Math.max(-0.2, Math.min(AFT_Z - BODY_R, p.z));
}

// ---------------------------------------------------------------------------
// the gallery: where each canvas hangs
// ---------------------------------------------------------------------------

// A slot is a spot on a wall: position on the wall surface, facing (ry about
// +y; 0 faces aft), and the largest canvas the spot will take. Order is the
// order you meet them walking aft, so the collection fills from the door.
function artSlots() {
  const out = [];
  const add = (x, z, ry, maxW, maxH) => out.push({ x, z, ry, maxW, maxH });
  // either side of the hall door, facing into the hall
  add(-3.05, HALL_Z0 + 0.06, 0, 2.6, 2.4);
  add(3.05, HALL_Z0 + 0.06, 0, 2.6, 2.4);
  const bays = Math.floor(C.FREIGHTER_HALL_L / BAY);
  for (let i = 0; i < bays; i++) {
    // the wall panels between the windows
    const pz = HALL_Z0 + i * BAY + 1.5;
    add(-HALL_HW + 0.01, pz, Math.PI / 2, 2.2, 2.2);
    add(HALL_HW - 0.01, pz, -Math.PI / 2, 2.2, 2.2);
    if (i === bays - 1) break;
    // the partition closing this bay: two canvases a face, except the last,
    // which carries one large piece each side
    const zc = HALL_Z0 + (i + 1) * BAY;
    if (i === bays - 2) {
      add(0, zc - 0.13, Math.PI, 3.6, 2.4);
      add(0, zc + 0.13, 0, 3.6, 2.4);
    } else {
      add(-1.25, zc - 0.13, Math.PI, 2.0, 2.3);
      add(1.25, zc - 0.13, Math.PI, 2.0, 2.3);
      add(-1.25, zc + 0.13, 0, 2.0, 2.3);
      add(1.25, zc + 0.13, 0, 2.0, 2.3);
    }
  }
  // the stern wall of the hall, facing back up it
  add(-3.2, HALL_Z1 - 0.06, Math.PI, 2.6, 2.4);
  add(3.2, HALL_Z1 - 0.06, Math.PI, 2.6, 2.4);
  return out;
}

const slots = []; // hung slots only (one per painting)
let freeSlots = []; // wall spots the collection did not fill
let frames = null; // InstancedMesh: one draw for every frame
let galleryOpen = false;
let hung = 0;
const _m4 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const X_AXIS = new THREE.Vector3(1, 0, 0);

// unit plane with v flipped: the art textures are ImageBitmaps (flipY off)
const artGeo = new THREE.PlaneGeometry(1, 1);
{
  const uv = artGeo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
}

function sizeSlot(s, aspect) {
  s.w = Math.min(s.maxW, s.maxH * aspect);
  s.h = s.w / aspect;
  s.mesh.scale.set(s.w, s.h, 1);
  _q.setFromAxisAngle(Y_AXIS, s.ry);
  _p.set(s.x + s.nx * 0.03, ART_Y, s.z + s.nz * 0.03);
  _s.set(s.w + 0.12, s.h + 0.12, 0.06);
  frames.setMatrixAt(s.index, _m4.compose(_p, _q, _s));
  frames.instanceMatrix.needsUpdate = true;
}

function buildGallery() {
  const all = artSlots();
  if (all.length < GALLERY_FILES.length) {
    console.warn(`gallery: ${GALLERY_FILES.length} paintings, ${all.length} wall spots`);
  }
  const n = Math.min(all.length, GALLERY_FILES.length);
  frames = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), pictureFrameMat, n);
  frames.frustumCulled = false; // instances span the hall
  group.add(frames);
  for (let i = 0; i < n; i++) {
    const s = all[i];
    s.index = i;
    s.nx = Math.sin(s.ry);
    s.nz = Math.cos(s.ry);
    s.file = GALLERY_FILES[i];
    s.title = titleOf(s.file);
    // Dark glass until the painting arrives; then a slight grey tint keeps a
    // white canvas under the bloom threshold.
    s.mat = new THREE.MeshBasicMaterial({ color: 0x1a1f28 });
    s.mesh = new THREE.Mesh(artGeo, s.mat);
    s.mesh.position.set(s.x + s.nx * 0.065, ART_Y, s.z + s.nz * 0.065);
    s.mesh.rotation.y = s.ry;
    s.mid = null;
    s.full = null;
    s.wantFull = false;
    s.fullPending = false;
    s.d2 = 0;
    group.add(s.mesh);
    slots.push(s);
    sizeSlot(s, Math.min(1, s.maxW / s.maxH));
  }
  freeSlots = all.slice(n);
}

function titleStrip() {
  // every title on one canvas, every label in one mesh
  const ROW = 48, W = 512, H = 2048;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext('2d');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const quads = [];
  slots.forEach((s, i) => {
    const y = i * ROW;
    ctx.fillStyle = '#14171e';
    ctx.fillRect(0, y, W, ROW);
    ctx.strokeStyle = 'rgba(200,168,106,0.7)';
    ctx.lineWidth = 2;
    ctx.strokeRect(3, y + 3, W - 6, ROW - 6);
    ctx.fillStyle = '#e8d9b0';
    ctx.font = '600 22px monospace';
    ctx.fillText(s.title.toUpperCase(), W / 2, y + ROW / 2 + 1, W - 30);
    const g = new THREE.PlaneGeometry(0.64, 0.06);
    const uv = g.attributes.uv;
    for (let k = 0; k < uv.count; k++) {
      uv.setY(k, 1 - (y + (1 - uv.getY(k)) * ROW) / H);
    }
    g.rotateY(s.ry);
    g.translate(s.x + s.nx * 0.012, ART_Y - s.maxH / 2 - 0.2, s.z + s.nz * 0.012);
    quads.push(g);
  });
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  group.add(new THREE.Mesh(mergeGeometries(quads, false), new THREE.MeshBasicMaterial({ map: tex })));
}

function signTexture(lines, w, h) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#12151d';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#c8a86a';
  ctx.lineWidth = 3;
  ctx.strokeRect(8, 8, w - 16, h - 16);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const [text, y, font, color] of lines) {
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.fillText(text, w / 2, y, w - 40);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function setSlotMap(s) {
  const tex = s.full || s.mid;
  if (s.mat.map === tex) return;
  const hadMap = !!s.mat.map;
  s.mat.map = tex;
  if (!hadMap) {
    s.mat.color.setHex(0xd2d2d2);
    s.mat.needsUpdate = true; // null -> map is a shader change
  }
}

// Every stand-up: bring the lounge wall up to date. First stand-up: fetch and
// hang the collection, door end first.
export function openGallery() {
  refreshLounge();
  if (galleryOpen) return;
  galleryOpen = true;
  titleStrip();
  for (const s of slots) {
    loadArtMid(s.file).then(
      ({ tex, aspect }) => {
        s.mid = tex;
        sizeSlot(s, aspect);
        setSlotMap(s);
        hung++;
      },
      () => {} // a missing file leaves its dark glass in the frame
    );
  }
}

// Full-resolution textures follow the pilot: the nearest few canvases get the
// native file, and it is dropped again once they have walked away.
let budgetT = 0;
function updateArtBudget(delta) {
  budgetT -= delta;
  if (budgetT > 0) return;
  budgetT = 0.4;
  const near2 = C.ART_NEAR * C.ART_NEAR;
  const far2 = C.ART_FAR * C.ART_FAR;
  for (const s of slots) {
    const dx = s.x - player.pos.x;
    const dz = s.z - player.pos.z;
    s.d2 = dx * dx + dz * dz;
    s.wantFull = false;
  }
  for (let k = 0; k < C.ART_FULL_MAX; k++) {
    let best = null;
    for (const s of slots) {
      if (!s.wantFull && s.mid && s.d2 < near2 && (!best || s.d2 < best.d2)) best = s;
    }
    if (!best) break;
    best.wantFull = true;
  }
  let held = 0;
  for (const s of slots) {
    if (s.wantFull && !s.full && !s.fullPending) {
      s.fullPending = true;
      loadArtFull(s.file).then(
        (tex) => {
          s.fullPending = false;
          if (!s.wantFull) return disposeArt(tex); // walked on while it decoded
          s.full = tex;
          setSlotMap(s);
        },
        () => { s.fullPending = false; }
      );
    }
    if (s.full && !s.wantFull && s.d2 > far2) dropFull(s);
    if (s.full) held++;
  }
  // a crowded corner can hold several inside ART_FAR: cap the total
  while (held > C.ART_FULL_MAX + 2) {
    let worst = null;
    for (const s of slots) {
      if (s.full && !s.wantFull && (!worst || s.d2 > worst.d2)) worst = s;
    }
    if (!worst) break;
    dropFull(worst);
    held--;
  }
}

function dropFull(s) {
  const tex = s.full;
  s.full = null;
  setSlotMap(s);
  disposeArt(tex);
}

// ---------------------------------------------------------------------------
// the lounge wall: what you have found and what you have killed
// ---------------------------------------------------------------------------
// On the lounge side of the hall's stern bulkhead. One canvas panel — the
// armoury list and the combat record — and above it four mounted titan skulls,
// one per warzone world, each hung only once a titan has died there. Redrawn
// from inventory.js every time the pilot stands up.

let loungeCanvas = null;
let loungeTex = null;
const skulls = []; // { world, group }

function buildLoungeWall() {
  loungeCanvas = document.createElement('canvas');
  loungeCanvas.width = 1024;
  loungeCanvas.height = 512;
  loungeTex = new THREE.CanvasTexture(loungeCanvas);
  loungeTex.colorSpace = THREE.SRGBColorSpace;
  loungeTex.anisotropy = 4;
  const panel = new THREE.Mesh(
    new THREE.PlaneGeometry(3.2, 1.6),
    new THREE.MeshBasicMaterial({ map: loungeTex, color: 0xd2d2d2 })
  );
  panel.position.set(3.2, 0.25, HALL_Z1 + 0.09);
  group.add(panel);
  const back = new THREE.Mesh(new THREE.BoxGeometry(3.34, 1.74, 0.04), pictureFrameMat);
  back.position.set(3.2, 0.25, HALL_Z1 + 0.06);
  group.add(back);

  // the skulls: a blunt head, a brow plate, two horns, eyes in the brood's colour
  const bone = new THREE.MeshStandardMaterial({ color: 0xb9ab8e, roughness: 0.75 });
  const headGeo = new THREE.SphereGeometry(0.34, 12, 9);
  const hornGeo = new THREE.ConeGeometry(0.09, 0.75, 7);
  const eyeGeo = new THREE.SphereGeometry(0.055, 8, 6);
  const boardGeo = new THREE.BoxGeometry(0.8, 1.15, 0.05);
  TROPHY_WORLDS.forEach((w, i) => {
    const g = new THREE.Group();
    const board = new THREE.Mesh(boardGeo, MATS.bench);
    board.position.z = -0.12;
    const head = new THREE.Mesh(headGeo, bone);
    head.scale.set(1, 0.85, 1.15);
    head.position.z = 0.16;
    const jaw = new THREE.Mesh(headGeo, bone);
    jaw.scale.set(0.8, 0.3, 0.9);
    jaw.position.set(0, -0.3, 0.24);
    g.add(board, head, jaw);
    const eyeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(w.tint).multiplyScalar(1.6) });
    for (const s of [-1, 1]) {
      const horn = new THREE.Mesh(hornGeo, bone);
      horn.position.set(s * 0.36, 0.3, 0.1);
      horn.rotation.z = -s * 0.75;
      const eye = new THREE.Mesh(eyeGeo, eyeMat);
      eye.position.set(s * 0.14, 0.04, 0.5);
      g.add(horn, eye);
    }
    g.position.set(-4.55 + i * 0.9, 0.55, HALL_Z1 + 0.2);
    g.visible = false;
    group.add(g);
    skulls.push({ world: w.world, group: g });
  });
  // the trophy wall's own card, under the mounts
  const card = new THREE.Mesh(
    new THREE.PlaneGeometry(2.6, 0.3),
    new THREE.MeshBasicMaterial({
      color: 0xd2d2d2,
      map: signTexture([['TITANS TAKEN — ONE MOUNT PER WORLD', 34, '600 22px monospace', '#c8a86a']], 768, 64),
    })
  );
  card.position.set(-3.2, -0.45, HALL_Z1 + 0.07);
  group.add(card);
}

export function refreshLounge() {
  if (!loungeCanvas) return;
  const rec = combatRecord();
  const ctx = loungeCanvas.getContext('2d');
  const W = 1024, H = 512;
  ctx.fillStyle = '#12151d';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#c8a86a';
  ctx.lineWidth = 3;
  ctx.strokeRect(10, 10, W - 20, H - 20);
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#c8a86a';
  ctx.font = '600 22px monospace';
  ctx.fillText("SHIP'S ARMOURY", 40, 48);
  ctx.textAlign = 'right';
  ctx.fillText('COMBAT RECORD', W - 40, 48);
  WEAPON_ORDER.forEach((id, i) => {
    const w = WEAPONS[id];
    const y = 104 + i * 62;
    const own = hasWeapon(id);
    const tint = '#' + w.tint.toString(16).padStart(6, '0');
    ctx.fillStyle = own ? tint : '#2a2f3a';
    ctx.fillRect(40, y - 18, 10, 36);
    ctx.textAlign = 'left';
    ctx.fillStyle = own ? '#e8d9b0' : '#4a5160';
    ctx.font = '600 22px monospace';
    ctx.fillText(own ? w.name : 'NOT YET FOUND', 66, y - 8);
    ctx.fillStyle = own ? '#aab6c8' : '#3d4350';
    ctx.font = '14px monospace';
    ctx.fillText(
      own ? w.blurb : `a crate waits in the town on ${(w.world || '').toUpperCase()}`,
      66, y + 16, 560
    );
  });
  ctx.textAlign = 'right';
  const stat = (label, value, y) => {
    ctx.fillStyle = '#aab6c8';
    ctx.font = '15px monospace';
    ctx.fillText(label, W - 40, y);
    ctx.fillStyle = '#e8d9b0';
    ctx.font = '700 44px monospace';
    ctx.fillText(String(value), W - 40, y + 40);
  };
  stat('BEST WAVE HELD', rec.bestWave, 104);
  stat('MONSTERS KILLED', rec.kills, 214);
  let titans = 0;
  for (const k in rec.trophies) titans += rec.trophies[k];
  stat('TITANS SLAIN', titans, 324);
  ctx.fillStyle = '#d4408f';
  ctx.font = '14px monospace';
  ctx.fillText('LAND AT A TOWN ON TERRA, RUSTIA, NEPTUNIA OR WYATTMATTOE', W - 40, 470);
  loungeTex.needsUpdate = true;
  for (const s of skulls) s.group.visible = (rec.trophies[s.world] || 0) > 0;
}

// ---------------------------------------------------------------------------
// build
// ---------------------------------------------------------------------------

export function initInterior() {
  const F = FLOOR_Y;

  // ---- flight deck: the room around the real cockpit rig ----
  box('floor', -DECK_HW - 0.1, DECK_HW + 0.1, F - 0.06, F, DECK_Z0 - 0.1, VEST_Z0);
  // plinth under the rig's floor plate (the plate's underside is at -0.7)
  box('deck', -1.25, 1.25, F, -0.7, -2.2, -0.52);
  solid(-1.3, 1.3, DECK_Z0, -0.5);
  // nose bulkhead, framing the rig's window
  box('wall', -DECK_HW - 0.1, DECK_HW + 0.1, F, -0.6, DECK_Z0 - 0.1, DECK_Z0);
  box('wall', -DECK_HW - 0.1, DECK_HW + 0.1, 0.9, DECK_CEIL + 0.08, DECK_Z0 - 0.1, DECK_Z0);
  boxes('wall', 1.2, DECK_HW + 0.1, -0.6, 0.9, DECK_Z0 - 0.1, DECK_Z0);
  solid(-3, 3, DECK_Z0 - 1, DECK_Z0);
  // side walls with a long window each
  boxes('wall', DECK_HW, DECK_HW + 0.1, F, -0.35, DECK_Z0, VEST_Z0);
  boxes('wall', DECK_HW, DECK_HW + 0.1, 0.85, DECK_CEIL, DECK_Z0, VEST_Z0);
  boxes('wall', DECK_HW, DECK_HW + 0.1, -0.35, 0.85, DECK_Z0, -2.3);
  boxes('wall', DECK_HW, DECK_HW + 0.1, -0.35, 0.85, 0.3, VEST_Z0);
  paneX(-DECK_HW - 0.05, -0.35, 0.85, -2.3, 0.3);
  paneX(DECK_HW + 0.05, -0.35, 0.85, -2.3, 0.3);
  solidPair(DECK_HW, DECK_HW + 1.3, DECK_Z0, VEST_Z0);
  // ceiling with a skylight over the console
  box('wall', -DECK_HW - 0.1, DECK_HW + 0.1, DECK_CEIL, DECK_CEIL + 0.08, DECK_Z0, -2.3);
  box('wall', -DECK_HW - 0.1, DECK_HW + 0.1, DECK_CEIL, DECK_CEIL + 0.08, -0.5, VEST_Z0);
  boxes('wall', 1.0, DECK_HW + 0.1, DECK_CEIL, DECK_CEIL + 0.08, -2.3, -0.5);
  paneY(DECK_CEIL + 0.04, -1.0, 1.0, -2.3, -0.5);
  box('strip', -0.05, 0.05, DECK_CEIL - 0.02, DECK_CEIL, 0.1, 1.0);

  // pilot seat at the local origin
  const cushion = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.13, 0.5), MATS.seat);
  cushion.position.set(0, -0.62, 0);
  const backrest = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.7, 0.11), MATS.seat);
  backrest.position.set(0, -0.26, 0.28);
  backrest.rotation.x = 0.12;
  const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.13, 0.5, 8), MATS.trim);
  pedestal.position.set(0, -0.95, 0);
  group.add(cushion, backrest, pedestal);

  // ---- vestibule ----
  const VC = VEST_CEIL;
  box('floor', -VEST_HW - 0.1, VEST_HW + 0.1, F - 0.06, F, VEST_Z0, HALL_Z0);
  box('wall', -VEST_HW - 0.1, VEST_HW + 0.1, VC, VC + 0.08, VEST_Z0, HALL_Z0);
  // bulkhead + doorway from the flight deck
  boxes('wall', 0.6, VEST_HW + 0.1, F, VC + 0.08, VEST_Z0 - 0.05, VEST_Z0 + 0.05);
  box('wall', -0.6, 0.6, 0.9, VC + 0.08, VEST_Z0 - 0.05, VEST_Z0 + 0.05);
  boxes('trim', 0.56, 0.62, F, 0.9, VEST_Z0 - 0.08, VEST_Z0 + 0.08);
  box('trim', -0.62, 0.62, 0.88, 0.94, VEST_Z0 - 0.08, VEST_Z0 + 0.08);
  solidPair(0.6, VEST_HW + 1, VEST_Z0 - 0.12, VEST_Z0 + 0.12);
  // side walls, one window each toward the hall end
  boxes('wall', VEST_HW, VEST_HW + 0.1, F, -0.2, VEST_Z0, HALL_Z0);
  boxes('wall', VEST_HW, VEST_HW + 0.1, 0.9, VC, VEST_Z0, HALL_Z0);
  boxes('wall', VEST_HW, VEST_HW + 0.1, -0.2, 0.9, VEST_Z0, HALL_Z0 - 1.4);
  boxes('wall', VEST_HW, VEST_HW + 0.1, -0.2, 0.9, HALL_Z0 - 0.4, HALL_Z0);
  paneX(-VEST_HW - 0.05, -0.2, 0.9, HALL_Z0 - 1.4, HALL_Z0 - 0.4);
  paneX(VEST_HW + 0.05, -0.2, 0.9, HALL_Z0 - 1.4, HALL_Z0 - 0.4);
  solidPair(VEST_HW, VEST_HW + 1.3, VEST_Z0, HALL_Z0);
  for (const z of [VEST_Z0 + 1.0, VEST_Z0 + 2.9]) {
    box('strip', -0.06, 0.06, VC - 0.02, VC, z - 0.5, z + 0.5);
  }

  // ---- gallery hall + lounge shell ----
  const HW = HALL_HW;
  box('floor', -HW - 0.1, HW + 0.1, F - 0.06, F, HALL_Z0, AFT_Z + 0.1);
  // a darker runner down each aisle, to walk the collection by
  boxes('deck', PART_HW + 0.5, PART_HW + 2.0, F, F + 0.005, HALL_Z0 + 0.4, HALL_Z1 - 0.4);
  // forward bulkhead + the hall door
  boxes('hang', 1.1, HW + 0.1, F, ROOF_Y, HALL_Z0 - 0.05, HALL_Z0 + 0.05);
  box('hang', -1.1, 1.1, 1.3, ROOF_Y, HALL_Z0 - 0.05, HALL_Z0 + 0.05);
  boxes('trim', 1.04, 1.12, F, 1.3, HALL_Z0 - 0.08, HALL_Z0 + 0.08);
  box('trim', -1.12, 1.12, 1.28, 1.36, HALL_Z0 - 0.08, HALL_Z0 + 0.08);
  solidPair(1.1, HW + 1, HALL_Z0 - 0.12, HALL_Z0 + 0.12);
  // side walls: sill, header, and a 3 m panel then a 2 m window, six times
  boxes('wall', HW, HW + 0.1, F, -0.8, HALL_Z0, HALL_Z1);
  boxes('wall', HW, HW + 0.1, 3.2, ROOF_Y, HALL_Z0, HALL_Z1);
  const bays = Math.floor(C.FREIGHTER_HALL_L / BAY);
  for (let i = 0; i < bays; i++) {
    const z = HALL_Z0 + i * BAY;
    boxes('hang', HW, HW + 0.1, -0.8, 3.2, z, z + 3);
    paneX(-HW - 0.05, -0.8, 3.2, z + 3, z + BAY);
    paneX(HW + 0.05, -0.8, 3.2, z + 3, z + BAY);
    boxes('trim', HW - 0.02, HW + 0.12, -0.8, 3.2, z + 2.96, z + 3.04);
    boxes('trim', HW - 0.02, HW + 0.12, -0.8, 3.2, z + BAY - 0.04, z + BAY + 0.04);
  }
  solidPair(HW, HW + 1.3, HALL_Z0, AFT_Z);
  // partitions, each with a picture light along its head, and a bench per bay
  for (let i = 0; i < bays - 1; i++) {
    const zc = HALL_Z0 + (i + 1) * BAY;
    box('hang', -PART_HW, PART_HW, F, PART_TOP, zc - 0.12, zc + 0.12);
    box('trim', -PART_HW - 0.03, PART_HW + 0.03, PART_TOP, PART_TOP + 0.05, zc - 0.2, zc + 0.2);
    box('strip', -PART_HW + 0.2, PART_HW - 0.2, PART_TOP - 0.012, PART_TOP, zc - 0.19, zc - 0.13);
    box('strip', -PART_HW + 0.2, PART_HW - 0.2, PART_TOP - 0.012, PART_TOP, zc + 0.13, zc + 0.19);
    solid(-PART_HW, PART_HW, zc - 0.12, zc + 0.12);
  }
  for (let i = 0; i < bays; i++) {
    const zc = HALL_Z0 + i * BAY + BAY / 2;
    box('bench', -0.9, 0.9, F + 0.34, F + 0.46, zc - 0.25, zc + 0.25);
    boxes('trim', 0.7, 0.8, F, F + 0.34, zc - 0.2, zc + 0.2);
    solid(-0.9, 0.9, zc - 0.25, zc + 0.25);
  }
  // stern bulkhead of the hall + the lounge door
  boxes('hang', 1.4, HW + 0.1, F, ROOF_Y, HALL_Z1 - 0.05, HALL_Z1 + 0.05);
  box('hang', -1.4, 1.4, 1.8, ROOF_Y, HALL_Z1 - 0.05, HALL_Z1 + 0.05);
  boxes('trim', 1.34, 1.42, F, 1.8, HALL_Z1 - 0.08, HALL_Z1 + 0.08);
  box('trim', -1.42, 1.42, 1.78, 1.86, HALL_Z1 - 0.08, HALL_Z1 + 0.08);
  solidPair(1.4, HW + 1, HALL_Z1 - 0.12, HALL_Z1 + 0.12);

  // ---- observation lounge ----
  boxes('wall', HW, HW + 0.1, F, -0.6, HALL_Z1, AFT_Z);
  boxes('wall', HW, HW + 0.1, 3.0, ROOF_Y, HALL_Z1, AFT_Z);
  boxes('wall', HW, HW + 0.1, -0.6, 3.0, HALL_Z1, HALL_Z1 + 0.8);
  boxes('wall', HW, HW + 0.1, -0.6, 3.0, AFT_Z - 0.8, AFT_Z);
  paneX(-HW - 0.05, -0.6, 3.0, HALL_Z1 + 0.8, AFT_Z - 0.8);
  paneX(HW + 0.05, -0.6, 3.0, HALL_Z1 + 0.8, AFT_Z - 0.8);
  // the stern window, wall to wall
  box('wall', -HW - 0.1, HW + 0.1, F, -0.7, AFT_Z, AFT_Z + 0.1);
  box('wall', -HW - 0.1, HW + 0.1, 3.1, ROOF_Y, AFT_Z, AFT_Z + 0.1);
  boxes('wall', 4.2, HW + 0.1, -0.7, 3.1, AFT_Z, AFT_Z + 0.1);
  boxes('trim', 1.36, 1.44, -0.7, 3.1, AFT_Z - 0.03, AFT_Z + 0.1);
  paneZ(AFT_Z + 0.05, -4.2, 4.2, -0.7, 3.1);
  solid(-HW - 1, HW + 1, AFT_Z, AFT_Z + 1);
  // two couches facing the view
  for (const sx of [-1, 1]) {
    const x = sx * 2.1;
    box('bench', x - 1.3, x + 1.3, F + 0.3, F + 0.45, AFT_Z - 3.0, AFT_Z - 2.3);
    box('bench', x - 1.3, x + 1.3, F + 0.45, F + 0.95, AFT_Z - 3.15, AFT_Z - 3.0);
    box('trim', x - 1.3, x + 1.3, F, F + 0.3, AFT_Z - 3.1, AFT_Z - 2.4);
    solid(x - 1.3, x + 1.3, AFT_Z - 3.15, AFT_Z - 2.3);
  }

  // ---- the glass roof over hall and lounge: ribs, purlins, one pane ----
  for (let z = HALL_Z0; z <= AFT_Z + 0.01; z += 2.5) {
    box('trim', -HW, HW, ROOF_Y - 0.08, ROOF_Y + 0.08, z - 0.07, z + 0.07);
  }
  for (const x of [-HW + 0.06, -HW / 3, HW / 3, HW - 0.06]) {
    box('trim', x - 0.06, x + 0.06, ROOF_Y - 0.05, ROOF_Y + 0.1, HALL_Z0, AFT_Z);
  }
  paneY(ROOF_Y + 0.04, -HW, HW, HALL_Z0, AFT_Z);

  // ---- merge: one mesh per material, one for all the glass ----
  for (const key of Object.keys(parts)) {
    group.add(new THREE.Mesh(mergeGeometries(parts[key], false), MATS[key]));
    for (const g of parts[key]) g.dispose();
  }
  const glass = new THREE.Mesh(mergeGeometries(glassParts, false), glassMat);
  glass.renderOrder = 2;
  group.add(glass);
  for (const g of glassParts) g.dispose();
  solidBuf = new Float32Array(solids);

  // ---- the owner's photographs + the Wave Collector plaque (vestibule) ----
  const photoSpots = [
    { x: -1.5, z: VEST_Z0 + 0.07, ry: 0 },
    { x: 1.5, z: VEST_Z0 + 0.07, ry: 0 },
    { x: VEST_HW - 0.03, z: VEST_Z0 + 0.9, ry: -Math.PI / 2 },
    { x: VEST_HW - 0.03, z: VEST_Z0 + 1.9, ry: -Math.PI / 2 },
    { x: -VEST_HW + 0.03, z: VEST_Z0 + 2.1, ry: Math.PI / 2 },
  ];
  for (const s of photoSpots) {
    const pic = makePicture(0.62, 0.5);
    pic.position.set(s.x, 0.4, s.z);
    pic.rotation.y = s.ry;
    group.add(pic);
  }
  const plaque = makePlaque();
  plaque.position.set(PLAQUE_X, 0.38, PLAQUE_Z);
  plaque.rotation.y = Math.PI / 2;
  plaque.scale.setScalar(1.5);
  group.add(plaque);

  // signs: over the hall door, and the collection card on the stern wall
  const doorSign = new THREE.Mesh(
    new THREE.PlaneGeometry(1.5, 0.19),
    new THREE.MeshBasicMaterial({
      map: signTexture([['G A L L E R Y', 34, '600 30px monospace', '#c8a86a']], 512, 64),
    })
  );
  doorSign.position.set(0, 1.45, HALL_Z0 - 0.06);
  doorSign.rotation.y = Math.PI;
  group.add(doorSign);

  buildLoungeWall();
  buildGallery();
  if (freeSlots.length) {
    const s = freeSlots[0];
    const card = new THREE.Mesh(
      new THREE.PlaneGeometry(1.8, 1.2),
      new THREE.MeshBasicMaterial({
        color: 0xd2d2d2,
        map: signTexture(
          [
            ['THE FEELGOOD COLLECTION', 110, '700 34px monospace', '#e8d9b0'],
            [`${slots.length} WORKS BY JFEELGOOD`, 170, '600 20px monospace', '#c8a86a'],
            ['carried aboard, hung under open sky', 236, '17px monospace', '#aab6c8'],
            ['E IN FRONT OF A CANVAS FOR A CLOSER LOOK', 300, '15px monospace', '#d4408f'],
          ],
          640, 420
        ),
      })
    );
    card.position.set(s.x, ART_Y + 0.1, s.z + Math.cos(s.ry) * 0.02);
    card.rotation.y = s.ry;
    group.add(card);
  }

  // ---- lights: six points, held constant so no program ever recompiles ----
  const lamp = (color, intensity, range, x, y, z) => {
    const l = new THREE.PointLight(color, intensity, range, 1.6);
    l.position.set(x, y, z);
    group.add(l);
  };
  lamp(0xffe8d0, 4.5, 7.0, 0.3, 0.5, 0.3);
  lamp(0xffe8d0, 7.0, 9.0, 0, 1.0, VEST_Z0 + 2.0);
  // over bay centres, never over a partition (which would light only its top)
  for (let i = 0; i < 3; i++) {
    lamp(0xfff0dc, 46, 26, 0, 3.0, HALL_Z0 + BAY / 2 + i * 2 * BAY);
  }
  lamp(0x86c5d8, 14, 14, 0, 2.4, AFT_Z - 3.5);
  interiorScene.add(new THREE.AmbientLight(0x3a4258, 2.8));
  // the real sun, through the glass
  sunLight = new THREE.DirectionalLight(0xfff2de, 1.6);
  interiorScene.add(sunLight, sunLight.target);

  initPrompt();
}

let sunLight = null;

// ---- the walk controller ----

const _fwd2 = { x: 0, z: 0 };
const _eye = new THREE.Vector3();
const _standPos = new THREE.Vector3();
const _standQuat = new THREE.Quaternion();
const _yawQ = new THREE.Quaternion();
const _pitchQ = new THREE.Quaternion();

// Pose the interior on the ship every frame (same trick as the cockpit rig).
// `active` is true while the pilot is out of the seat.
export function updateInterior(ship, delta = 0, active = false) {
  group.position.copy(ship.position);
  group.quaternion.copy(ship.quaternion);
  if (!active) return;
  if (sun.group) {
    _p.subVectors(sun.group.position, ship.position).normalize();
    sunLight.position.copy(ship.position).addScaledVector(_p, 50);
    sunLight.target.position.copy(ship.position);
  }
  if (galleryOpen) updateArtBudget(delta);
}

// Blend the camera from the seated pose (already written by updateCamera
// this frame) toward the standing/walking pose. ownsMouse is true once the
// ship's controls have disengaged — exactly one consumer of the mouse.
export function updateInteriorCamera(ship, delta, blend, ownsMouse) {
  if (blend <= 0) return;

  if (ownsMouse) {
    player.yaw -= input.mouseX * C.INTERIOR_MOUSE_SENS;
    player.pitch -= input.mouseY * C.INTERIOR_MOUSE_SENS;
    player.pitch = Math.max(-C.INTERIOR_PITCH_MAX, Math.min(C.INTERIOR_PITCH_MAX, player.pitch));
    input.mouseX = 0;
    input.mouseY = 0;

    const ax = moveAxes();
    if (ax.mag > 0) {
      const sy = Math.sin(player.yaw);
      const cy = Math.cos(player.yaw);
      // yaw 0 faces -z (the nose); forward/right rotated by yaw
      _fwd2.x = -sy * ax.fwd + cy * ax.strafe;
      _fwd2.z = -cy * ax.fwd - sy * ax.strafe;
      const len = Math.hypot(_fwd2.x, _fwd2.z);
      const speed = input.sprint ? C.INTERIOR_RUN_SPEED : C.INTERIOR_SPEED;
      const step = (speed * ax.mag * delta * blend) / len;
      player.pos.x += _fwd2.x * step;
      player.pos.z += _fwd2.z * step;
      resolveWalls(player.pos);
    }
  }

  // standing pose in world space: ship transform ∘ player pose
  _eye.set(player.pos.x, EYE_STAND, player.pos.z);
  _standPos.copy(_eye).applyQuaternion(ship.quaternion).add(ship.position);
  _yawQ.setFromAxisAngle(Y_AXIS, player.yaw);
  _pitchQ.setFromAxisAngle(X_AXIS, player.pitch);
  _standQuat.copy(ship.quaternion).multiply(_yawQ).multiply(_pitchQ);

  const s = blend * blend * (3 - 2 * blend); // smoothstep the rise
  camera.position.lerp(_standPos, s);
  camera.quaternion.slerp(_standQuat, s);
  // walking has no boost FOV: pull back to base while out of the seat
  camera.fov += (C.FOV - camera.fov) * s;
  camera.updateProjectionMatrix();
}

export function nearSeat() {
  return player.pos.x * player.pos.x + player.pos.z * player.pos.z <
    C.SEAT_RADIUS * C.SEAT_RADIUS;
}

// Standing close enough to the vestibule plaque to read it (E prompt).
export function nearPlaque() {
  const dx = player.pos.x - PLAQUE_X;
  const dz = player.pos.z - PLAQUE_Z;
  return dx * dx + dz * dz < 1.5 * 1.5;
}

// The canvas the pilot is standing at and looking toward, or null. Returns
// the slot itself ({ file, title }) — not a copy; this runs every frame.
export function nearPainting() {
  // view direction on the floor plane (yaw 0 faces -z)
  const vx = -Math.sin(player.yaw);
  const vz = -Math.cos(player.yaw);
  let best = null;
  let bestD = Infinity;
  for (const s of slots) {
    if (!s.mid) continue;
    const dx = player.pos.x - s.x;
    const dz = player.pos.z - s.z;
    const out = dx * s.nx + dz * s.nz; // distance off the wall
    if (out < 0.2 || out > C.ART_VIEW_RANGE) continue;
    const side = Math.abs(dx * s.nz - dz * s.nx);
    if (side > s.w / 2 + 0.3) continue;
    if (vx * s.nx + vz * s.nz > -0.55) continue; // not facing it
    if (out < bestD) {
      bestD = out;
      best = s;
    }
  }
  return best;
}

export function resetPlayer() {
  player.pos.set(0, 0, 0);
  player.yaw = 0;
  player.pitch = 0;
}

export function playerState() {
  return player;
}

// For headless verification (game.js __debug.interior.info).
export function interiorInfo() {
  let fullRes = 0;
  for (const s of slots) if (s.full) fullRes++;
  return {
    slots: slots.length,
    paintings: GALLERY_FILES.length,
    hung,
    fullRes,
    solids: solidBuf.length / 4,
    bounds: { halfWidth: HALL_HW, aft: AFT_Z, hall: [HALL_Z0, HALL_Z1] },
    plaque: { x: PLAQUE_X, z: PLAQUE_Z },
    art: slots.map((s) => ({ x: s.x, z: s.z, ry: s.ry, title: s.title, w: s.w, h: s.h })),
  };
}

// Teleport-safe placement for headless checks: writes then resolves walls.
export function placePlayer(x, z, yaw = player.yaw) {
  player.pos.x = x;
  player.pos.z = z;
  player.yaw = yaw;
  resolveWalls(player.pos);
  return player;
}

// ---- the prompt line (one DOM element, opacity-toggled) ----

let promptEl = null;
let promptShown = null; // cache to avoid DOM churn

function initPrompt() {
  promptEl = document.createElement('div');
  Object.assign(promptEl.style, {
    position: 'fixed',
    left: '50%',
    bottom: '16%',
    transform: 'translateX(-50%)',
    color: '#9fd8e8',
    font: '13px monospace',
    letterSpacing: '0.35em',
    textShadow: '0 0 8px rgba(130, 247, 255, 0.6)',
    opacity: '0',
    transition: 'opacity 0.4s',
    pointerEvents: 'none',
    userSelect: 'none',
    whiteSpace: 'nowrap',
    zIndex: '8',
  });
  document.body.appendChild(promptEl);
}

export function setPrompt(text) {
  if (text === promptShown) return;
  promptShown = text;
  if (text) promptEl.textContent = text;
  promptEl.style.opacity = text ? '1' : '0';
}
