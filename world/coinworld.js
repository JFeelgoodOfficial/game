// stevenlacey — the coin world.
//
// A coin the size of a small moon, tumbling end over end in open space. It is
// not a planet (src/planet.js assumes a sphere spinning about Y, and nothing
// about this is either): like the Sky City it is a bespoke body with its own
// capture and landing in src/game.js. Fly inside its capture radius and the
// tumble runs down and settles, the way a flipped coin comes to rest, with the
// face you approached turned toward you.
//
// Each face is one half of the world. HEADS (+Y, the Sanctuary) and TAILS
// (-Y, the Claws) carry a painted emblem here; the 2D levels that live on them
// are built by the on-foot chunk when you land.
//
// Frames. The coin's local Y is its axis. On either face the 2D world's "up"
// is local -Z, and "right" is whatever makes that a right-handed view from
// outside: +X on heads, -X on tails. Walking off the right-hand end of one face
// therefore brings you onto the other with left and right exchanged, which is
// exactly what going round the rim of a real coin does.
//
// Lighting comes from the system DirectionalLight/AmbientLight (src/sun.js);
// the faces also carry their own map as a faint emissive so the dark side of
// the flip still reads as a coin rather than a hole in the stars.

import * as THREE from 'three';
import { addShiftable } from '../src/origin.js';
import { C } from '../src/constants.js';

export const HEADS = 1;
export const TAILS = -1;

// The one coin, for modules that only need to know where it is (src/nav.js).
export let coinWorld = null;

const TEX = 1024; // face texture, px
const GRID = 128; // the emblems are drawn on a 128 grid and blown up 8x

// ---- emblem painting ---------------------------------------------------------
// Chunky pixels: everything below is drawn in GRID units through px().

function makeFaceCanvas(paint) {
  const c = document.createElement('canvas');
  c.width = c.height = TEX;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  const s = TEX / GRID;
  const px = (x, y, w, h, col) => {
    g.fillStyle = col;
    g.fillRect(Math.round(x) * s, Math.round(y) * s, Math.round(w) * s, Math.round(h) * s);
  };
  // a filled disc of whole pixels
  const disc = (cx, cy, r, col) => {
    for (let y = -r; y <= r; y++) {
      const w = Math.floor(Math.sqrt(r * r - y * y));
      px(cx - w, cy + y, w * 2 + 1, 1, col);
    }
  };
  paint(g, px, disc);
  return c;
}

// Lettering round the rim, read from outside the coin. `top` runs clockwise
// over the top; `bottom` runs anticlockwise under the bottom, both upright.
function rimText(g, top, bottom, col) {
  const R = TEX * 0.435;
  g.save();
  g.translate(TEX / 2, TEX / 2);
  g.fillStyle = col;
  g.font = `bold ${Math.round(TEX * 0.058)}px 'Courier New', monospace`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const step = 0.105;
  for (let i = 0; i < top.length; i++) {
    const a = (i - (top.length - 1) / 2) * step;
    g.save();
    g.rotate(a);
    g.fillText(top[i], 0, -R);
    g.restore();
  }
  for (let i = 0; i < bottom.length; i++) {
    const a = -(i - (bottom.length - 1) / 2) * step;
    g.save();
    g.rotate(a);
    g.fillText(bottom[i], 0, R);
    g.restore();
  }
  g.restore();
}

// A small round creature: body, belly, two eyes.
function critter(px, disc, x, y, r, body, belly) {
  disc(x, y, r, body);
  disc(x, y + 1, Math.max(r - 2, 1), belly);
  px(x - 2, y - 1, 1, 2, '#1a1410');
  px(x + 2, y - 1, 1, 2, '#1a1410');
}

function paintHeads(g, px, disc) {
  const M = GRID / 2;
  disc(M, M, 63, '#8a6420'); // rim shadow
  disc(M, M, 60, '#d9a93a'); // gold
  disc(M, M, 55, '#b98a28'); // inner step
  disc(M, M, 53, '#e7bf55'); // field
  // sky wash behind the tree
  disc(M, M - 2, 40, '#f0d98a');
  // ground
  for (let y = 0; y < 10; y++) {
    const w = Math.floor(Math.sqrt(40 * 40 - (28 + y) * (28 + y)));
    px(M - w, M + 26 + y, w * 2 + 1, 1, y < 2 ? '#4f8a3a' : '#3a6a2c');
  }
  // the sanctuary tree
  px(M - 4, M + 2, 8, 26, '#6b4423');
  px(M - 2, M + 2, 2, 26, '#8a5a30');
  px(M - 9, M + 22, 5, 4, '#6b4423');
  px(M + 4, M + 22, 5, 4, '#6b4423');
  disc(M, M - 12, 20, '#2f6b3a');
  disc(M - 14, M - 4, 11, '#2f6b3a');
  disc(M + 14, M - 4, 11, '#2f6b3a');
  disc(M - 4, M - 16, 13, '#3f8a48');
  disc(M + 9, M - 9, 8, '#3f8a48');
  disc(M - 8, M - 20, 6, '#58a85a');
  // a door in the trunk, lit
  px(M - 2, M + 16, 4, 8, '#2a1a0e');
  px(M - 1, M + 18, 2, 6, '#ffd98a');
  // three keepers' monsters under the boughs: ember, moss, tide
  critter(px, disc, M - 24, M + 21, 5, '#d8552a', '#f4a35a');
  critter(px, disc, M + 24, M + 21, 5, '#3f7fd0', '#9fd0f4');
  critter(px, disc, M + 11, M + 23, 4, '#4f9a3a', '#b4e08a');
  // a moth in the canopy
  px(M - 15, M - 25, 3, 2, '#fff2c0');
  px(M - 11, M - 25, 3, 2, '#fff2c0');
  px(M - 12, M - 24, 1, 3, '#5a4020');
  rimText(g, 'STEVEN & LACEY', 'HEADS · THE SANCTUARY', '#5a3e10');
}

function paintTails(g, px, disc) {
  const M = GRID / 2;
  disc(M, M, 63, '#1c1a26');
  disc(M, M, 60, '#4a4860'); // old silver
  disc(M, M, 55, '#2e2c3e');
  disc(M, M, 53, '#3a3850');
  disc(M, M, 40, '#23212f'); // the dark
  // cavern floor and hanging rock
  for (let y = 0; y < 12; y++) {
    const w = Math.floor(Math.sqrt(40 * 40 - (26 + y) * (26 + y)));
    px(M - w, M + 26 + y, w * 2 + 1, 1, y < 1 ? '#6a6884' : '#17161f');
  }
  for (let i = -3; i <= 3; i++) {
    const h = 6 + ((i * 7 + 21) % 9);
    px(M + i * 9 - 2, M - 38, 4, h, '#17161f');
    px(M + i * 9 - 1, M - 38 + h, 2, 3, '#17161f');
  }
  // three claw strokes, pale, falling left to right
  for (let k = -1; k <= 1; k++) {
    for (let i = 0; i < 44; i++) {
      const w = i < 6 || i > 37 ? 1 : i < 12 || i > 31 ? 2 : 3;
      px(M + 14 + k * 11 - i * 0.62, M - 26 + i, w, 1, '#eef0ff');
      if (w === 3) px(M + 13 + k * 11 - i * 0.62, M - 26 + i, 1, 1, '#9aa0d8');
    }
  }
  // the wanderer: cloak, pale mask, two horns, a lamp
  px(M - 26, M + 14, 8, 12, '#0e0d14');
  px(M - 28, M + 20, 12, 6, '#0e0d14');
  disc(M - 22, M + 11, 4, '#eef0ff');
  px(M - 26, M + 4, 2, 4, '#eef0ff');
  px(M - 20, M + 4, 2, 4, '#eef0ff');
  px(M - 24, M + 10, 1, 3, '#0e0d14');
  px(M - 21, M + 10, 1, 3, '#0e0d14');
  px(M - 15, M + 17, 3, 3, '#ffd98a');
  px(M - 14, M + 14, 1, 3, '#6a6884');
  rimText(g, 'STEVEN & LACEY', 'TAILS · THE CLAWS', '#c8c6e0');
}

// The milled edge: bright and dark reeds, repeated round the rim.
function makeRimCanvas() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#8a6a26';
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#d9b250';
  g.fillRect(0, 0, 26, 64);
  g.fillStyle = '#f2d98a';
  g.fillRect(6, 0, 8, 64);
  g.fillStyle = '#5a4416';
  g.fillRect(0, 0, 64, 5);
  g.fillRect(0, 59, 64, 5);
  return c;
}

function faceTexture(paint) {
  const t = new THREE.CanvasTexture(makeFaceCanvas(paint));
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  t.anisotropy = 4;
  return t;
}

// ---- the coin ---------------------------------------------------------------

export function createCoinWorld(scene) {
  const R = C.COIN_RADIUS;
  const T = C.COIN_THICKNESS;
  const group = new THREE.Group();
  group.name = 'CoinWorld';
  group.position.set(C.COIN_DIR_X, C.COIN_DIR_Y, C.COIN_DIR_Z).normalize()
    .multiplyScalar(C.COIN_DISTANCE);

  const headsTex = faceTexture(paintHeads);
  const tailsTex = faceTexture(paintTails);
  const rimTex = new THREE.CanvasTexture(makeRimCanvas());
  rimTex.colorSpace = THREE.SRGBColorSpace;
  rimTex.wrapS = THREE.RepeatWrapping;
  rimTex.repeat.set(220, 1);

  const faceMat = (map) => new THREE.MeshStandardMaterial({
    map, metalness: 0.35, roughness: 0.55,
    emissive: 0xffffff, emissiveMap: map, emissiveIntensity: 0.22,
  });
  const rimMat = new THREE.MeshStandardMaterial({
    map: rimTex, metalness: 0.7, roughness: 0.4,
    emissive: 0xffffff, emissiveMap: rimTex, emissiveIntensity: 0.12,
  });

  const rim = new THREE.Mesh(new THREE.CylinderGeometry(R, R, T, 128, 1, true), rimMat);
  group.add(rim);

  // Caps are discs rather than the cylinder's own, so each can be turned to put
  // its picture the right way up in its face frame (see the header).
  const capGeo = new THREE.CircleGeometry(R, 128);
  const heads = new THREE.Mesh(capGeo, faceMat(headsTex));
  heads.rotation.x = -Math.PI / 2; // disc +Y -> local -Z (up), normal -> +Y
  heads.position.y = T / 2;
  group.add(heads);
  const tails = new THREE.Mesh(capGeo, faceMat(tailsTex));
  tails.quaternion
    .setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI)
    .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2));
  tails.position.y = -T / 2;
  group.add(tails);

  scene.add(group);
  addShiftable(group);

  // ---- the tumble -----------------------------------------------------------
  // flip: end over end about a line through the coin's own plane. prec: that
  // line itself wanders slowly about the system's Y, so the flip never shows
  // the same face from the same bearing twice running.
  let flip = 0.6;
  let prec = 0.9;
  let rate = 1; // 0..1 share of the full tumble speed
  let settling = false;
  let settleT = 0; // seconds since settle() began
  const _qFlip = new THREE.Quaternion();
  const _qPrec = new THREE.Quaternion();
  const _qWob = new THREE.Quaternion();
  const X = new THREE.Vector3(1, 0, 0);
  const Y = new THREE.Vector3(0, 1, 0);
  const Z = new THREE.Vector3(0, 0, 1);

  function pose() {
    _qFlip.setFromAxisAngle(X, flip);
    _qPrec.setFromAxisAngle(Y, prec);
    group.quaternion.copy(_qPrec).multiply(_qFlip);
    if (settling && settleT < C.COIN_WOBBLE_TIME) {
      // coming to rest: a rattle about the other in-plane axis, dying away
      const w = C.COIN_WOBBLE * Math.exp(-settleT * 2.6) * Math.sin(settleT * 7.5);
      group.quaternion.multiply(_qWob.setFromAxisAngle(Z, w));
    }
  }

  function update(dt) {
    const target = settling ? 0 : 1;
    const k = dt / (settling ? C.COIN_SETTLE_TIME : C.COIN_SPINUP_TIME);
    rate = target > rate ? Math.min(rate + k, 1) : Math.max(rate - k, 0);
    if (settling) settleT += dt;
    if (rate > 0) {
      // ease on the way down so the last of the turn is slow, like a real coin
      const r = rate * rate;
      flip += C.COIN_TUMBLE * r * dt;
      prec += C.COIN_PRECESS * r * dt;
    }
    pose();
  }

  // The ship is inside the capture radius: run the tumble down.
  function settle() {
    if (settling) return;
    settling = true;
    settleT = 0;
  }
  // The ship has left: start turning again. `instant` for hard resets.
  function release(instant = false) {
    settling = false;
    if (instant) {
      rate = 1;
      pose();
    }
  }
  // For hooks that skip the approach: stop dead, now.
  function hold() {
    settling = true;
    settleT = C.COIN_WOBBLE_TIME;
    rate = 0;
    pose();
  }

  // ---- queries --------------------------------------------------------------
  const _n = new THREE.Vector3();
  // Which face a world position is over.
  function faceToward(worldPos) {
    _n.copy(Y).applyQuaternion(group.quaternion);
    return _n.dot(_v.subVectors(worldPos, group.position)) >= 0 ? HEADS : TAILS;
  }
  const _v = new THREE.Vector3();

  // A face's frame in world space: right and up span the 2D world, normal
  // points out of the coin toward whoever is looking at it.
  function faceFrame(face, right, up, normal) {
    right.set(face, 0, 0).applyQuaternion(group.quaternion);
    up.set(0, 0, -1).applyQuaternion(group.quaternion);
    normal.set(0, face, 0).applyQuaternion(group.quaternion);
  }

  // Offset from the coin's centre (world axes, live) of a point given in a
  // face's own coordinates: fx right, fy up, fz out of the surface.
  const _r = new THREE.Vector3();
  const _u = new THREE.Vector3();
  const _f = new THREE.Vector3();
  function faceOffset(face, fx, fy, fz, out) {
    faceFrame(face, _r, _u, _f);
    return out.set(0, 0, 0)
      .addScaledVector(_r, fx)
      .addScaledVector(_u, fy)
      .addScaledVector(_f, T / 2 + fz);
  }

  pose();
  coinWorld = {
    group, radius: R, thickness: T,
    update, settle, release, hold,
    faceToward, faceFrame, faceOffset,
    isSettled: () => settling && rate === 0 && settleT >= C.COIN_WOBBLE_TIME,
    state: () => ({ flip, prec, rate, settling, settleT }),
  };
  return coinWorld;
}
