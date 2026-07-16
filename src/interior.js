// The walkable ship interior (owner override of GDD 1.2 "no walking").
// Press C to stand up out of the pilot seat, walk the corridor behind the
// cockpit — framed pictures on the walls, portholes showing live space —
// and walk back to the seat to sit down and fly again. (G is the separate
// on-foot planet walk in walk.js — different feature, different key.)
//
// Architecture mirrors cockpit.js: the interior lives in its own scene,
// composited over the lensed world by a second CockpitOverlayPass, so every
// opening (portholes, aft window, canopy) shows real space and the interior
// never warps. The whole interior group is posed from the SHIP's transform
// each frame, so it rides the ship exactly and floating-origin rebases are
// transparent (nothing here is origin-registered).
//
// Movement is NOT a collision system: the player's local position is range-
// clamped to the two rooms (cockpit, corridor) plus a narrower band at the
// doorway. Three clamps, no intersection tests — GDD 1.2's spirit holds.
//
// Interior scale is roughly metres. The seated eye is the local origin
// (that's where camera.js puts the pilot), the floor is at y = -1.2, and
// the standing eye is at y = +0.45.

import * as THREE from 'three';
import { C } from './constants.js';
import { input } from './input.js';
import { camera } from './camera.js';
import { buildCanopyFrame } from './cockpit.js';

export const interiorScene = new THREE.Scene();

const FLOOR_Y = -1.2;
const CEIL_Y = 1.0;
const HALL_END = 7.0; // corridor runs z 1.0 .. 7.0 behind the seat
const EYE_STAND = 0.45;

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
const wallMat = new THREE.MeshStandardMaterial({ color: 0x424a58, roughness: 0.62, metalness: 0.35 });
const floorMat = new THREE.MeshStandardMaterial({ color: 0x2e343f, roughness: 0.8, metalness: 0.3 });
const trimMat = new THREE.MeshStandardMaterial({ color: 0x2b313b, roughness: 0.42, metalness: 0.6 });
const seatMat = new THREE.MeshStandardMaterial({ color: 0x35404e, roughness: 0.85, metalness: 0.1 });
const stripMat = new THREE.MeshBasicMaterial({ color: 0x7fb8c8 }); // under bloom threshold
const pictureFrameMat = new THREE.MeshStandardMaterial({ color: 0x1d222b, roughness: 0.5, metalness: 0.5 });

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
function makePicture(w, h) {
  const g = new THREE.Group();
  const frame = new THREE.Mesh(new THREE.BoxGeometry(w + 0.07, h + 0.07, 0.03), pictureFrameMat);
  g.add(frame);
  const idx = pictureCount++;
  let tex;
  if (idx < pictureUrls.length) {
    tex = new THREE.TextureLoader().load(pictureUrls[idx]);
    tex.colorSpace = THREE.SRGBColorSpace;
  } else {
    tex = placeholderTexture(idx + 1);
  }
  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({ map: tex })
  );
  face.position.z = 0.017;
  g.add(face);
  return g;
}

// --- geometry ---

function corridorWall() {
  // built in the XY plane — x is distance down the corridor, y is height —
  // then rotated into place. Three porthole holes at standing eye height.
  const shape = new THREE.Shape();
  shape.moveTo(0, FLOOR_Y);
  shape.lineTo(HALL_END - 1.0, FLOOR_Y);
  shape.lineTo(HALL_END - 1.0, CEIL_Y);
  shape.lineTo(0, CEIL_Y);
  shape.closePath();
  for (const cx of [1.2, 3.0, 4.8]) {
    const hole = new THREE.Path();
    hole.absarc(cx, 0.3, 0.28, 0, Math.PI * 2, true);
    shape.holes.push(hole);
  }
  return new THREE.ExtrudeGeometry(shape, { depth: 0.06, bevelEnabled: false });
}

export function initInterior() {
  // ---- cockpit room (only ever seen while standing; the seated view is
  // cockpit.js + the PNG frame) ----
  group.add(buildCanopyFrame(trimMat));

  // pilot seat at the local origin
  const cushion = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.13, 0.5), seatMat);
  cushion.position.set(0, -0.62, 0);
  const backrest = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.7, 0.11), seatMat);
  backrest.position.set(0, -0.26, 0.28);
  backrest.rotation.x = 0.12;
  const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.13, 0.5, 8), trimMat);
  pedestal.position.set(0, -0.95, 0);
  group.add(cushion, backrest, pedestal);

  // dash + console under the canopy
  const dash = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.1, 0.4), trimMat);
  dash.position.set(0, -0.5, -0.95);
  const consoleBox = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.55, 0.5), wallMat);
  consoleBox.position.set(0, -0.92, -0.9);
  group.add(dash, consoleBox);

  // cockpit shell: floor, side walls, rear ceiling
  const cFloor = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.06, 2.0), floorMat);
  cFloor.position.set(0, FLOOR_Y - 0.03, 0.1);
  group.add(cFloor);
  for (const s of [-1, 1]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(0.08, CEIL_Y - FLOOR_Y, 1.8), wallMat);
    wall.position.set(s * 1.02, (CEIL_Y + FLOOR_Y) / 2, 0.15);
    group.add(wall);
  }
  const cCeil = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.06, 1.0), wallMat);
  cCeil.position.set(0, CEIL_Y + 0.03, 0.55);
  group.add(cCeil);

  // rear cockpit wall with the doorway into the corridor (three boxes —
  // holes that touch an edge can't be Shape holes, and boxes are cheaper)
  const doorW = 0.4; // half-width of the doorway
  for (const s of [-1, 1]) {
    const panel = new THREE.Mesh(
      new THREE.BoxGeometry(1.06 - doorW, CEIL_Y - FLOOR_Y, 0.08),
      wallMat
    );
    panel.position.set(s * (doorW + (1.06 - doorW) / 2), (CEIL_Y + FLOOR_Y) / 2, 1.0);
    group.add(panel);
  }
  const header = new THREE.Mesh(new THREE.BoxGeometry(doorW * 2, CEIL_Y - 0.7, 0.08), wallMat);
  header.position.set(0, (CEIL_Y + 0.7) / 2, 1.0);
  group.add(header);
  // doorway trim
  for (const s of [-1, 1]) {
    const jamb = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.7 - FLOOR_Y, 0.12), trimMat);
    jamb.position.set(s * doorW, (0.7 + FLOOR_Y) / 2, 1.0);
    group.add(jamb);
  }

  // ---- the corridor: z 1.0 .. 7.0 ----
  const hFloor = new THREE.Mesh(new THREE.BoxGeometry(1.52, 0.06, 6.1), floorMat);
  hFloor.position.set(0, FLOOR_Y - 0.03, 4.0);
  const hCeil = new THREE.Mesh(new THREE.BoxGeometry(1.52, 0.06, 6.1), wallMat);
  hCeil.position.set(0, CEIL_Y + 0.03, 4.0);
  group.add(hFloor, hCeil);

  // ceiling light strips — the only emissive surfaces in here. One over the
  // cockpit too, so the room reads while standing.
  for (const z of [0.3, 2.2, 4.0, 5.8]) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.02, 0.9), stripMat);
    strip.position.set(0, CEIL_Y - 0.005, z);
    group.add(strip);
  }

  // walls with porthole cutouts (space shows through the holes)
  const wallGeo = corridorWall();
  const left = new THREE.Mesh(wallGeo, wallMat);
  left.rotation.y = -Math.PI / 2; // local +x -> +z, extrusion -> -x
  left.position.set(-0.7, 0, 1.0);
  const right = new THREE.Mesh(wallGeo, wallMat);
  right.rotation.y = Math.PI / 2; // local +x -> -z, extrusion -> +x
  right.position.set(0.7, 0, 7.0);
  group.add(left, right);

  // porthole rims
  for (const z of [2.2, 4.0, 5.8]) {
    for (const s of [-1, 1]) {
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.29, 0.035, 8, 24), trimMat);
      rim.position.set(s * 0.7, 0.3, z);
      rim.rotation.y = Math.PI / 2;
      group.add(rim);
    }
  }

  // aft end cap with the big rear window
  const capShape = new THREE.Shape();
  capShape.moveTo(-0.78, FLOOR_Y);
  capShape.lineTo(0.78, FLOOR_Y);
  capShape.lineTo(0.78, CEIL_Y);
  capShape.lineTo(-0.78, CEIL_Y);
  capShape.closePath();
  const winHole = new THREE.Path();
  winHole.moveTo(-0.45, -0.2);
  winHole.lineTo(0.45, -0.2);
  winHole.lineTo(0.45, 0.62);
  winHole.lineTo(-0.45, 0.62);
  winHole.closePath();
  capShape.holes.push(winHole);
  const cap = new THREE.Mesh(
    new THREE.ExtrudeGeometry(capShape, { depth: 0.06, bevelEnabled: false }),
    wallMat
  );
  cap.position.set(0, 0, HALL_END);
  group.add(cap);
  // window frame trim
  const winTrimW = new THREE.BoxGeometry(0.98, 0.05, 0.1);
  const winTrimH = new THREE.BoxGeometry(0.05, 0.9, 0.1);
  for (const [geo, x, y] of [
    [winTrimW, 0, -0.2],
    [winTrimW, 0, 0.62],
    [winTrimH, -0.45, 0.21],
    [winTrimH, 0.45, 0.21],
  ]) {
    const t = new THREE.Mesh(geo, trimMat);
    t.position.set(x, y, HALL_END);
    group.add(t);
  }

  // ---- the pictures ----
  // four in the corridor between the portholes, one in the cockpit
  const spots = [
    { x: -0.67, z: 3.1, ry: Math.PI / 2 },
    { x: -0.67, z: 4.9, ry: Math.PI / 2 },
    { x: 0.67, z: 3.1, ry: -Math.PI / 2 },
    { x: 0.67, z: 4.9, ry: -Math.PI / 2 },
  ];
  for (const s of spots) {
    const pic = makePicture(0.5, 0.4);
    pic.position.set(s.x, 0.35, s.z);
    pic.rotation.y = s.ry;
    group.add(pic);
  }
  const cockpitPic = makePicture(0.44, 0.36);
  cockpitPic.position.set(-0.72, 0.15, 0.95);
  cockpitPic.rotation.y = Math.PI;
  group.add(cockpitPic);

  // ---- lights ----
  const cockpitLight = new THREE.PointLight(0xffe8d0, 4.5, 7.0, 1.6);
  cockpitLight.position.set(0.3, 0.4, 0.1);
  const hallLight = new THREE.PointLight(0xffe8d0, 3.5, 9.0, 1.6);
  hallLight.position.set(0, 0.5, 4.0);
  const aftLight = new THREE.PointLight(0x86c5d8, 2.2, 5.0, 1.6);
  aftLight.position.set(0, 0.3, 6.2);
  group.add(cockpitLight, hallLight, aftLight);
  interiorScene.add(new THREE.AmbientLight(0x3a4258, 2.2));

  initPrompt();
}

// ---- the walk controller ----

const _fwd2 = { x: 0, z: 0 };
const _eye = new THREE.Vector3();
const _standPos = new THREE.Vector3();
const _standQuat = new THREE.Quaternion();
const _yawQ = new THREE.Quaternion();
const _pitchQ = new THREE.Quaternion();
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const X_AXIS = new THREE.Vector3(1, 0, 0);

// Not a collision system: three range clamps keep the player inside the
// cockpit room, the corridor, and the doorway band between them.
function clampToInterior(p) {
  p.z = Math.max(-0.2, Math.min(HALL_END - 0.38, p.z));
  if (p.z < 1.0) {
    p.x = Math.max(-0.8, Math.min(0.8, p.x));
  } else {
    p.x = Math.max(-0.52, Math.min(0.52, p.x));
  }
  if (p.z > 0.8 && p.z < 1.2) {
    p.x = Math.max(-0.34, Math.min(0.34, p.x));
  }
}

// Pose the interior on the ship every frame (same trick as updateCockpit).
export function updateInterior(ship) {
  group.position.copy(ship.position);
  group.quaternion.copy(ship.quaternion);
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

    const fwd = (input.forward ? 1 : 0) - (input.reverse ? 1 : 0);
    const strafe = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    if (fwd !== 0 || strafe !== 0) {
      const sy = Math.sin(player.yaw);
      const cy = Math.cos(player.yaw);
      // yaw 0 faces -z (the nose); forward/right rotated by yaw
      _fwd2.x = -sy * fwd + cy * strafe;
      _fwd2.z = -cy * fwd - sy * strafe;
      const len = Math.hypot(_fwd2.x, _fwd2.z);
      const step = (C.INTERIOR_SPEED * delta * blend) / len;
      player.pos.x += _fwd2.x * step;
      player.pos.z += _fwd2.z * step;
      clampToInterior(player.pos);
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

export function resetPlayer() {
  player.pos.set(0, 0, 0);
  player.yaw = 0;
  player.pitch = 0;
}

export function playerState() {
  return player;
}

// ---- the G prompt (one DOM element, opacity-toggled) ----

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
