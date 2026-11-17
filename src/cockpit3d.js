// The flyable 3D cockpit (user redesign). A metal console under a big window,
// laid out the way the owner drew it (Nov 2026):
//
//   left     the THROTTLE lever — push up for thrust, pull down to slow and
//            reverse; it springs back to the middle when let go
//   centre   one row of six buttons: WARP, RADIO, CAMERA, STAND, LAND, NAV
//   right    the steering WHEEL, which mirrors the ship's turn and can be
//            grabbed and dragged to fly (touch)
//
// and nothing else: those are the whole of the flight controls. Built into
// cockpitScene and composited by CockpitOverlayPass, posed every frame from
// the ship transform so the camera-lag gap makes it read as a vehicle you sit
// inside.
//
// Dashboard buttons feed the same `input` flags the keyboard does: a held
// button sets a level flag while pressed, an edge button pulses it once, a
// function button calls straight into the subsystem. Pressing the real key
// lights the matching button. The lever writes `input.throttle`.
//
// Camera zoom (idle / forward / full-window) lives in camera.js; the dash
// visibility signal it exposes is dashBlend(), which the DOM panels ride the
// way they used to ride the frame image's blend.

import * as THREE from 'three';
import { C } from './constants.js';
import { input, throttleAxis } from './input.js';
import { settings } from './settings.js';
import { uiSound } from './sfx.js';
import { camera } from './camera.js';
import { cockpitScene } from './cockpit.js';
import { toggleRadioPopup } from './radioPopup.js';
import { toggleCameraBar, isCameraBarOpen } from './capture.js';
import { toggleHolo, isHoloOpen, holoPick } from './holonav.js';
import { initNavMenu, setNavMenuOpen, isNavMenuOpen, navMenuPick } from './navmenu.js';
import { isTouch } from './touchText.js';

const CYAN = 0x82f7ff,
  CYAN2 = 0xa9f7ff,
  GOLD = 0xffd75a;

// --- the rig: posed to the ship, scaled down from prototype units. `shell`
// carries the pilot-eye offset so the eye point sits at the rig origin (which
// tracks the ship, and thus the camera when zoom/drift are zero).
export const cockpitRig = new THREE.Group();
cockpitRig.scale.setScalar(C.COCKPIT_SCALE);
export const cockpitShell = new THREE.Group();
cockpitShell.position.set(0, -1.15, -2.3); // prototype eye anchor -> origin
cockpitRig.add(cockpitShell);
cockpitScene.add(cockpitRig);

let wheel, stick, coreLight, holoGlow;
let lever, leverArm, leverGlowMat; // the throttle: its base group, the swinging arm, the grip's light
let leverDrag = null; // { id, y, oy } — a pointer holding the throttle
let leverShown = 0; // eased handle position, -1..1
let buttons = [];
const flashByCode = new Map(); // KeyG/etc -> button, for keyboard flashes
let curPhase = 'menu';
let elapsed = 0;

// smoothed steering, so the wheel eases rather than jitters
let sYaw = 0,
  sPitch = 0,
  sRoll = 0;

let dom = null; // renderer canvas, for pointer -> NDC
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const pointerButtons = new Map(); // pointerId -> held button (release on up)
let wheelDrag = null; // { id, x, y }
let lastConsumed = false; // did the last pointerdown hit cockpit geometry?
let lastPointerType = 'mouse';

// ---------------------------------------------------------------------------
// geometry
// ---------------------------------------------------------------------------

function buildWindow() {
  const mat = new THREE.MeshStandardMaterial({ color: 0x2b313b, roughness: 0.45, metalness: 0.78 });
  const beamMat = new THREE.MeshStandardMaterial({ color: 0x161b22, roughness: 0.5, metalness: 0.7 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x12161c, roughness: 0.6, metalness: 0.6 });
  const g = new THREE.Group();

  // bigger window than the old design: wider and taller opening
  const fw = 4.4,
    fh = 2.6,
    fy = 1.4,
    fz = -3.0;
  function box(m, w, h, d, x, y, z, rz) {
    const me = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    me.position.set(x, y, z);
    if (rz) me.rotation.z = rz;
    g.add(me);
    return me;
  }

  // bottom sill only — no top beam or side posts, so the window is open on
  // the top and both sides for an unobstructed view.
  box(beamMat, fw + 1.0, 0.2, 0.34, 0, fy - fh / 2 - 0.1, fz);
  // No center mullion: the window is a single clean pane, unobstructed.

  // overhead cross-brace, so the hold-V glance frames space rather than void
  box(mat, fw * 0.6, 0.04, 0.04, 0, fy + fh / 2 + 0.5, fz + 0.7, 0);

  // No side walls or diagonal struts: the cockpit is open to space at the
  // edges, so leaning forward on boost/warp reveals stars rather than a
  // boxed-in cabin. Just a low floor plate under the console.
  const floor = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.2, 3.4), dark);
  floor.position.set(0, -0.15, -0.4);
  g.add(floor);
  return g;
}

function buildConsole() {
  const mat = new THREE.MeshStandardMaterial({ color: 0x20262f, roughness: 0.4, metalness: 0.8 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x12161c, roughness: 0.55, metalness: 0.7 });
  const g = new THREE.Group();

  const dash = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.5, 1.1), mat);
  dash.position.set(0, 0.55, -0.35);
  dash.rotation.x = -0.32;
  g.add(dash);
  const face = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.7, 0.12), dark);
  face.position.set(0, 0.32, 0.18);
  g.add(face);
  // Console trim runs at ~45% so it reads as lit edging rather than a bloom
  // source — see the note on screenMat in makeButton.
  const lip = new THREE.Mesh(
    new THREE.BoxGeometry(3.4, 0.012, 0.02),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(CYAN).multiplyScalar(0.45) })
  );
  lip.position.set(0, 0.72, 0.02);
  g.add(lip);

  [-1.45, 1.45].forEach(function (x) {
    const pod = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.42, 0.9), mat);
    pod.position.set(x, 0.5, -0.15);
    pod.rotation.x = -0.28;
    g.add(pod);
    // (the pods used to carry dummy screens: the throttle stands on the left
    // one now and the wheel rises from the right)
  });

  // holo projector disc + ring + faint emitter cone at the console centre
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.46, 0.06, 48), dark);
  disc.position.set(0, 0.74, -0.25);
  g.add(disc);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.4, 0.02, 12, 48),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(CYAN).multiplyScalar(0.45) })
  );
  ring.position.set(0, 0.78, -0.25);
  ring.rotation.x = Math.PI / 2;
  g.add(ring);
  // The additive emitter cone that used to rise from the projector is gone —
  // it was pure haze over the dash. The hologram it projects still glows.

  return g;
}

const WHEEL_X = 1.42;
const LEVER_X = -1.42;

// The throttle: a gated quadrant on the left pod and a T-handled lever
// standing in it. `leverArm` swings about X at the gate; the handle forward
// (up the screen) is thrust.
function buildLever() {
  lever = new THREE.Group();
  lever.position.set(LEVER_X, 0.6, 0.52);
  lever.rotation.x = -0.32; // the rake of the dash
  const metal = new THREE.MeshStandardMaterial({ color: 0x3a4048, roughness: 0.42, metalness: 0.9 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x0c1016, roughness: 0.6, metalness: 0.5 });
  const gripMat = new THREE.MeshStandardMaterial({ color: 0x16191e, roughness: 0.85, metalness: 0.3 });
  leverGlowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(CYAN).multiplyScalar(0.5) });

  // the gate: a plate with a slot down it, two rails, and a detent at neutral
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.03, 0.62), metal);
  lever.add(plate);
  const slot = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.012, 0.5), dark);
  slot.position.y = 0.016;
  lever.add(slot);
  [-1, 1].forEach(function (s) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.05, 0.56), metal);
    rail.position.set(s * 0.085, 0.03, 0);
    lever.add(rail);
  });
  const notch = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.008, 0.012), leverGlowMat);
  notch.position.y = 0.02;
  lever.add(notch);

  leverArm = new THREE.Group();
  leverArm.position.y = -0.04; // pivot just under the plate
  lever.add(leverArm);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.028, 0.42, 14), metal);
  shaft.position.y = 0.23;
  leverArm.add(shaft);
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.05, 16), gripMat);
  collar.position.y = 0.08;
  leverArm.add(collar);
  const bar = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.3, 8, 16), gripMat);
  bar.rotation.z = Math.PI / 2;
  bar.position.y = 0.46;
  leverArm.add(bar);
  [-1, 1].forEach(function (s) {
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.052, 0.012, 16), leverGlowMat);
    cap.rotation.z = Math.PI / 2;
    cap.position.set(s * 0.2, 0.46, 0);
    leverArm.add(cap);
  });

  // fat touch target: the whole throw of the handle, facing the camera
  const hit = new THREE.Sprite(new THREE.SpriteMaterial({ visible: false, depthTest: false }));
  hit.position.set(0, 0.3, 0);
  hit.scale.set(0.62, 0.9, 1);
  lever.add(hit);
  return lever;
}

function buildWheel() {
  stick = new THREE.Group();
  stick.position.set(WHEEL_X, 0.6, 0.78); // right of the dash
  stick.rotation.x = -0.6; // laid back to face the pilot
  wheel = new THREE.Group();
  stick.add(wheel);

  const R = 0.34;
  const metal = new THREE.MeshStandardMaterial({ color: 0x3a4048, roughness: 0.42, metalness: 0.9 });
  const gripMat = new THREE.MeshStandardMaterial({ color: 0x16191e, roughness: 0.85, metalness: 0.3 });
  const hubMat = new THREE.MeshStandardMaterial({ color: 0x22272e, roughness: 0.4, metalness: 0.85 });
  const glowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(CYAN).multiplyScalar(1.3) });

  const rim = new THREE.Mesh(new THREE.TorusGeometry(R, 0.032, 18, 72), metal);
  wheel.add(rim);
  const rimIn = new THREE.Mesh(
    new THREE.TorusGeometry(R - 0.04, 0.008, 10, 64),
    new THREE.MeshBasicMaterial({ color: CYAN, transparent: true, opacity: 0.35 })
  );
  rimIn.position.z = 0.02;
  wheel.add(rimIn);

  [-1, 1].forEach(function (s) {
    const grip = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.34, 8, 16), gripMat);
    grip.position.set(s * R, 0, 0.015);
    wheel.add(grip);
  });
  [-1, 1].forEach(function (s) {
    const sp = new THREE.Mesh(new THREE.BoxGeometry(R * 0.9, 0.055, 0.05), metal);
    sp.position.set(s * R * 0.46, 0, 0);
    wheel.add(sp);
  });
  const lower = new THREE.Mesh(new THREE.BoxGeometry(0.12, R * 0.95, 0.06), metal);
  lower.position.set(0, -R * 0.5, 0);
  wheel.add(lower);
  const yoke = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.13, 0.16, 16), metal);
  yoke.position.set(0, -R - 0.02, -0.02);
  wheel.add(yoke);

  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.13, 0.09, 32), hubMat);
  hub.rotation.x = Math.PI / 2;
  hub.position.z = 0.02;
  wheel.add(hub);
  const hubRing = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.013, 12, 40), glowMat);
  hubRing.position.z = 0.075;
  wheel.add(hubRing);
  const core = new THREE.Mesh(
    new THREE.CircleGeometry(0.05, 40),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(CYAN).multiplyScalar(1.05) })
  );
  core.position.z = 0.076;
  wheel.add(core);
  coreLight = new THREE.PointLight(CYAN, 0.9, 1.0, 2);
  coreLight.position.set(0, 0, 0.2);
  wheel.add(coreLight);

  [
    [-0.2, 0],
    [0.2, 0],
    [0, -0.16],
  ].forEach(function (p) {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.02, 12), glowMat);
    b.rotation.x = Math.PI / 2;
    b.position.set(p[0], p[1], 0.04);
    wheel.add(b);
  });

  return stick;
}

// ---------------------------------------------------------------------------
// buttons
// ---------------------------------------------------------------------------

// Long keyboard keys don't fit inside the circle as words, so map them to a
// short glyph; single letters (F, Q, E, N, G, C, P…) render as-is.
function keyGlyph(key) {
  if (!key) return '';
  switch (key) {
    case 'SPACE': return '␣';
    case ', .': return '♪';
    default: return key;
  }
}

// The key "circle": a colored border ring with the activation key on it, baked
// into a single camera-facing sprite (like label()) so it stays crisp and
// readable at the dash's steep viewing angle — a 3D torus would foreshorten
// into an unreadable arc. Returns the sprite; caller positions it.
function keycap(keyText, color, icon) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d');
  const col = '#' + color.toString(16).padStart(6, '0');
  // dark disc so the letter reads against it, like the reference keycaps
  g.beginPath();
  g.arc(64, 64, 50, 0, Math.PI * 2);
  g.fillStyle = 'rgba(6,11,17,0.82)';
  g.fill();
  // colored border ring — flat, no bloom halo baked into the texture
  g.lineWidth = 7;
  g.strokeStyle = col;
  g.beginPath();
  g.arc(64, 64, 50, 0, Math.PI * 2);
  g.stroke();
  // the key, bright and centered — or, on touch, a picture of what it does
  g.fillStyle = '#dff4f8';
  if (icon) {
    drawIcon(g, icon);
  } else {
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = '700 ' + (keyText.length > 1 ? 46 : 66) + 'px "Courier New", ui-monospace, monospace';
    g.fillText(keyText, 64, 68);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  return s;
}

// Touch keycap icons (user call: a phone has no W key, so the circle shows
// what the button does instead). Drawn as paths into the 128px keycap canvas,
// centred on (64, 64) inside the r=50 ring, so no font has to carry the glyph.
function drawIcon(g, name) {
  g.save();
  g.translate(64, 64);
  g.strokeStyle = '#dff4f8';
  g.lineWidth = 8;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  const tri = (pts) => {
    g.beginPath();
    g.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
    g.closePath();
    g.fill();
  };
  switch (name) {
    case 'warp': // double chevron, forward
      g.beginPath();
      g.moveTo(-22, 2); g.lineTo(0, -20); g.lineTo(22, 2);
      g.moveTo(-22, 24); g.lineTo(0, 2); g.lineTo(22, 24);
      g.stroke();
      break;
    case 'radio': // a quaver
      g.beginPath();
      g.ellipse(-8, 20, 13, 10, -0.4, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.moveTo(4, 18); g.lineTo(4, -28); g.lineTo(22, -14);
      g.stroke();
      break;
    case 'stand': // a person
      g.beginPath();
      g.arc(0, -22, 9, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.moveTo(0, -10); g.lineTo(0, 10);
      g.moveTo(-16, -2); g.lineTo(16, -2);
      g.moveTo(0, 10); g.lineTo(-12, 28);
      g.moveTo(0, 10); g.lineTo(12, 28);
      g.stroke();
      break;
    case 'camera':
      g.lineWidth = 7;
      g.strokeRect(-26, -14, 52, 36);
      g.fillRect(-10, -22, 20, 9);
      g.beginPath();
      g.arc(0, 4, 10, 0, Math.PI * 2);
      g.stroke();
      break;
    case 'land': // arrow down onto the ground
      tri([0, 16, 20, -6, -20, -6]);
      g.fillRect(-7, -28, 14, 24);
      g.fillRect(-26, 22, 52, 7);
      break;
    case 'nav': // compass star
      tri([0, -32, 9, -9, 0, 0, -9, -9]);
      g.globalAlpha = 0.55;
      tri([0, 32, 9, 9, 0, 0, -9, 9]);
      tri([32, 0, 9, 9, 0, 0, 9, -9]);
      tri([-32, 0, -9, 9, 0, 0, -9, -9]);
      g.globalAlpha = 1;
      break;
  }
  g.restore();
}

// The action-name label for a button. Unlike the shared label() (tuned for the
// hologram, with wide margins), this sizes the text to FILL the canvas width so
// the name reads large and clear on the dash. `worldW` is the sprite's width in
// button units; the caller matches it to the rectangle plate.
function nameLabel(text, color, worldW) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 120;
  const g = c.getContext('2d');
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  let fs = 96;
  do {
    g.font = '700 ' + fs + 'px "Courier New", ui-monospace, monospace';
    fs -= 4;
  } while (g.measureText(text).width > 476 && fs > 34);
  // Flat fill, no glow: additive text at full color still clears the bloom
  // threshold on its own, which is what made the labels smear on the dash.
  g.fillStyle = '#' + new THREE.Color(color).multiplyScalar(0.72).getHexString();
  g.fillText(text, 256, 62);
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  const s = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false })
  );
  s.scale.set(worldW, (worldW * 120) / 512, 1);
  return s;
}

// A dashboard button (the "colored knob", user redesign): a bordered frame
// holding a colored CIRCLE up top with the activation key on it, and a
// RECTANGLE beneath the circle with the action name. The circle's fill is the
// lit surface (screenMat) and a backing plane is the additive glow (glowMat),
// so the existing lit-state animation in updateCockpit3d drives it unchanged.
function makeButton(def) {
  const g = new THREE.Group();
  g.position.set(def.x, def.y, def.z);
  g.rotation.x = -0.32; // lie flush with the dash face, like the other console faces
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x3b414b, roughness: 0.4, metalness: 0.92 });
  const bevelMat = new THREE.MeshStandardMaterial({ color: 0x2a2f37, roughness: 0.5, metalness: 0.85 });
  const innerMat = new THREE.MeshStandardMaterial({ color: 0x090c11, roughness: 0.55, metalness: 0.5 });
  const plateMat = new THREE.MeshStandardMaterial({ color: 0x0c1016, roughness: 0.55, metalness: 0.5 });
  // screenMat is the lit surface behind the keycap; the update loop pulses its
  // opacity to "light up" the button. Deliberately NOT additive and scaled well
  // under C.BLOOM_THRESHOLD: the cockpit pass composites BEFORE the bloom pass,
  // so anything bright here blooms and washes the dash out. The wheel is the
  // only thing in this cockpit that still glows.
  const screenMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(def.color).multiplyScalar(0.55),
    transparent: true,
    opacity: 0.16,
    depthWrite: false,
  });
  // A dim colored bezel behind the frame — what used to be the additive halo.
  const glowMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(def.color).multiplyScalar(0.22),
    transparent: true,
    opacity: 0.16,
    depthWrite: false,
  });
  const W = 0.3,
    H = 0.34;
  const cy = 0.086, // circle centre (upper)
    ry = -0.094, // rectangle centre (lower)
    cR = 0.07; // circle radius

  const glow = new THREE.Mesh(new THREE.PlaneGeometry(W + 0.05, H + 0.05), glowMat);
  glow.position.z = -0.026;
  g.add(glow);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(W, H, 0.05), frameMat);
  g.add(frame);
  const bevel = new THREE.Mesh(new THREE.BoxGeometry(W - 0.03, H - 0.03, 0.045), bevelMat);
  bevel.position.z = 0.012;
  g.add(bevel);
  const inner = new THREE.Mesh(new THREE.BoxGeometry(W - 0.06, H - 0.06, 0.02), innerMat);
  inner.position.z = 0.03;
  g.add(inner);

  // circle: an additive colored glow disc that lights up (screenMat) with the
  // crisp key "circle" sprite on top. The sprite faces the camera so the ring
  // and letter stay legible at the dash's steep angle. Keyless buttons (e.g.
  // CAMERA, which opens a pop-up rather than mapping to one key) skip the
  // circle entirely and centre their label instead.
  const icon = isTouch ? def.icon : null;
  if (def.key || icon) {
    const disc = new THREE.Mesh(new THREE.CircleGeometry(cR + 0.02, 32), screenMat);
    disc.position.set(0, cy, 0.041);
    g.add(disc);
    const cap = keycap(keyGlyph(def.key), def.color, icon);
    cap.scale.set(cR * 2.4, cR * 2.4, 1);
    cap.position.set(0, cy, 0.06);
    g.add(cap);
  }

  // rectangle: a recessed plate with a thin colored border, holding the action
  // name — so it reads as a distinct labelled rectangle, not floating text.
  const labelY = def.key || icon ? ry : 0;
  // Flat colored border, and the NAV-open indicator: the update loop brightens
  // rectMat while the hologram is up, which used to be read off the additive
  // halo.
  const rectMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(def.color).multiplyScalar(0.5),
    transparent: true,
    opacity: 0.3,
    depthWrite: false,
  });
  const rectBorder = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.03, 0.12), rectMat);
  rectBorder.position.set(0, labelY, 0.028);
  g.add(rectBorder);
  const plate = new THREE.Mesh(new THREE.BoxGeometry(W - 0.05, 0.1, 0.02), plateMat);
  plate.position.set(0, labelY, 0.031);
  g.add(plate);
  const lab = nameLabel(def.name, def.color, W - 0.03);
  lab.position.set(0, labelY, 0.05);
  g.add(lab);

  // Touch hit-proxy: an invisible camera-facing sprite a bit larger than the
  // button, so a finger tap registers even though the real button is small and
  // foreshortened on the raked dash. Sprites always face the camera, giving a
  // consistent, fat-finger-friendly tap area regardless of the dash angle.
  // onPointerDown raycasts the whole group, so this is picked up automatically.
  const hit = new THREE.Sprite(new THREE.SpriteMaterial({ visible: false, depthTest: false }));
  hit.scale.set(W + 0.1, H + 0.12, 1);
  hit.userData.hit = true;
  g.add(hit);

  g.userData = { def, screenMat, glowMat, rectMat, baseZ: g.position.z, _flash: 0 };
  return g;
}

function buildButtons() {
  // Owner's layout (reference image, Nov 2026): ONE row across the middle of
  // the dash, between the throttle and the wheel, and these six are every
  // button there is. THRUST and REVERSE became the lever; ROLL and BRAKE are
  // gone from the game. `icon` is the keycap picture on touch, where key
  // letters mean nothing.
  const Y = 0.5, Z = 0.17, PITCH = 0.39, SCALE = 1.2;
  const defs = [
    { name: 'WARP', key: 'F', icon: 'warp', color: 0xff9ad5, mode: 'hold', flag: 'warp', code: 'KeyF' },
    { name: 'RADIO', key: ', .', icon: 'radio', color: 0x8cffd1, mode: 'fn', fn: toggleRadioPopup },
    { name: 'CAMERA', key: 'P', icon: 'camera', color: 0xa9f7ff, mode: 'fn', fn: toggleCameraBar, lit: isCameraBarOpen },
    { name: 'STAND', key: 'C', icon: 'stand', color: 0xcfe6ff, mode: 'edge', flag: 'toggleInterior', code: 'KeyC' },
    { name: 'LAND', key: 'G', icon: 'land', color: 0xffc9ec, mode: 'edge', flag: 'toggleWalk', code: 'KeyG' },
    { name: 'NAV', key: 'N', icon: 'nav', color: 0xffd75a, mode: 'nav' },
  ];
  buttons = [];
  defs.forEach(function (d, i) {
    d.x = (i - (defs.length - 1) / 2) * PITCH;
    d.y = Y;
    d.z = Z;
    const b = makeButton(d);
    b.scale.setScalar(SCALE);
    buttons.push(b);
    cockpitShell.add(b);
    if (d.code) flashByCode.set(d.code, b);
  });
}

function flash(b) {
  b.userData._flash = 1;
}

// A pointer/touch press on a button. `on` distinguishes press (true) from
// release (false); only hold buttons care about release.
function pressButton(b, on) {
  const d = b.userData.def;
  if (on) uiSound('toggle');
  if (d.mode === 'hold') {
    input[d.flag] = on;
    if (on) flash(b);
  } else if (on) {
    if (d.mode === 'nav') toggleHolo();
    else if (d.mode === 'edge') input[d.flag] = true;
    else if (d.mode === 'fn') d.fn();
    flash(b);
  }
}

// ---------------------------------------------------------------------------
// pointer interaction (buttons + wheel + hologram). Only live in flight and
// only when the pointer is NOT locked — while locked the mouse steers and the
// keyboard drives the dash. Touch never locks, so it always reaches here.
// ---------------------------------------------------------------------------

// Some mobile browsers only deliver ONE of touch / pointer events for a finger;
// a few also honor requestPointerLock in a way that leaves input.locked stuck
// true. Guard for both: prefer native touch when the browser has touch events,
// and never gate touch on the pointer lock (touch never mouse-looks).
const hasTouchEvents = typeof window !== 'undefined' && 'ontouchstart' in window;

// Out of the seat the dash is scenery: a tap on it while walking the ship
// must not fire WARP. game.js flips this with the stand/sit state.
let standingAway = false;
export function setCockpitStanding(v) {
  standingAway = v;
  if (v) {
    wheelDrag = null;
    dropLever();
  }
}

// Let go of the throttle: it springs back, and the engine with it.
function dropLever() {
  leverDrag = null;
  input.throttle = 0;
}

function interactive(isTouch) {
  return curPhase === 'fly' && !standingAway && (isTouch || !input.locked);
}

function setPointer(cx, cy) {
  const r = dom.getBoundingClientRect();
  pointer.x = ((cx - r.left) / r.width) * 2 - 1;
  pointer.y = -((cy - r.top) / r.height) * 2 + 1;
}

// Shared press/move/release core, fed by BOTH pointer events (mouse/pen) and
// native touch events. Android WebGL canvases don't always emit pointer events
// for touch, so we drive touch through touchstart/move/end directly and let the
// pointer path handle mouse/pen only. `id` is a pointerId or a touch identifier.
// Returns true if the press landed on cockpit geometry (so callers can
// preventDefault / suppress the pointer-lock click).
function beginAt(id, cx, cy, type) {
  lastConsumed = false;
  lastPointerType = type;
  if (!interactive(type === 'touch')) return false;
  setPointer(cx, cy);
  raycaster.setFromCamera(pointer, camera);

  // hologram first when open: a hit (body or ENGAGE) consumes the pointer; a
  // miss deselects and falls through so the dash stays usable.
  if (isHoloOpen() && holoPick(raycaster)) {
    lastConsumed = true;
    return true;
  }

  // destination menu: sits above the NAV button, so it must win over the wheel
  // (whose screen-space bounds reach up into the same area).
  if (isNavMenuOpen() && navMenuPick(raycaster)) {
    lastConsumed = true;
    return true;
  }

  // throttle: grab it and hold it off-centre. `oy` is where it was grabbed.
  if (raycaster.intersectObject(lever, true).length) {
    leverDrag = { id, y: cy, oy: cy };
    uiSound('toggle');
    lastConsumed = true;
    return true;
  }

  // steering wheel: grab and drag to fly. `ox/oy` is the grab point, kept so a
  // held finger can steer by offset (see updateCockpit3d); mouse still steers
  // by delta off `x/y`.
  if (raycaster.intersectObject(stick, true).length) {
    wheelDrag = { id, x: cx, y: cy, ox: cx, oy: cy, touch: type === 'touch' };
    lastConsumed = true;
    return true;
  }

  // dashboard buttons: raycast them all and take the NEAREST hit, so a tap that
  // lands where two enlarged touch proxies overlap goes to the closest button.
  const hits = raycaster.intersectObjects(buttons, true);
  if (hits.length) {
    let o = hits[0].object;
    while (o && buttons.indexOf(o) === -1) o = o.parent;
    if (o) {
      pressButton(o, true);
      pointerButtons.set(id, o);
      lastConsumed = true;
      return true;
    }
  }
  return false;
}

function moveAt(id, cx, cy) {
  if (leverDrag && id === leverDrag.id) {
    leverDrag.y = cy;
    return true;
  }
  if (!wheelDrag || id !== wheelDrag.id) return false;
  // Touch only records where the finger IS — updateCockpit3d turns the offset
  // from the grab point into a continuous steer rate, so holding the wheel over
  // keeps the turn going. A mouse has no such problem (it emits a move for every
  // pixel), so it keeps the delta feel it has always had.
  if (wheelDrag.touch) {
    wheelDrag.x = cx;
    wheelDrag.y = cy;
    return true;
  }
  const dx = cx - wheelDrag.x;
  const dy = cy - wheelDrag.y;
  input.mouseX += dx * settings.sensitivity * C.WHEEL_DRAG_GAIN;
  input.mouseY += dy * settings.sensitivity * (settings.invertY ? -1 : 1) * C.WHEEL_DRAG_GAIN;
  wheelDrag.x = cx;
  wheelDrag.y = cy;
  return true;
}

function endAt(id) {
  if (leverDrag && id === leverDrag.id) dropLever();
  if (wheelDrag && id === wheelDrag.id) wheelDrag = null;
  const b = pointerButtons.get(id);
  if (b) {
    pressButton(b, false);
    pointerButtons.delete(id);
  }
}

// --- mouse / pen via pointer events. If the browser also has touch events, let
// the touch path own touch (avoids double-handling); otherwise handle touch
// here too, so devices that ONLY emit pointer events for touch still work. ---
function ignoreTouchPointer(e) {
  return e.pointerType === 'touch' && hasTouchEvents;
}
function onPointerDown(e) {
  if (ignoreTouchPointer(e)) return;
  if (beginAt(e.pointerId, e.clientX, e.clientY, e.pointerType || 'mouse')) e.preventDefault();
}

function onPointerMove(e) {
  if (ignoreTouchPointer(e)) return;
  if (moveAt(e.pointerId, e.clientX, e.clientY)) e.preventDefault();
}

function onPointerUp(e) {
  if (ignoreTouchPointer(e)) return;
  endAt(e.pointerId);
}

// --- touch: native touch events, so it works even where the canvas emits no
// pointer events for touch (some Android browsers/WebViews). Touch ids namespace
// with a prefix so they never collide with mouse pointerIds in the shared maps.
function tid(t) {
  return 'touch:' + t.identifier;
}

function onTouchStart(e) {
  let consumed = false;
  for (const t of e.changedTouches) {
    if (beginAt(tid(t), t.clientX, t.clientY, 'touch')) consumed = true;
  }
  // Prevent the browser's compatibility mouse/click (which would try to grab
  // pointer lock) and any scroll/zoom while interacting with the dash.
  if (consumed || interactive(true)) e.preventDefault();
}

function onTouchMove(e) {
  let moved = false;
  for (const t of e.changedTouches) {
    if (moveAt(tid(t), t.clientX, t.clientY)) moved = true;
  }
  if (moved) e.preventDefault();
}

function onTouchEnd(e) {
  for (const t of e.changedTouches) endAt(tid(t));
}

// Consulted by input.js before it grabs pointer lock: skip the lock when the
// press landed on cockpit geometry, when the hologram is open (the cursor is
// needed to pick a destination), or for touch (which never mouse-looks).
export function cockpitPointerGate() {
  return lastConsumed || isHoloOpen() || lastPointerType === 'touch';
}

export function initCockpit3d(domElement) {
  dom = domElement; // for pointer -> NDC in setPointer
  cockpitShell.add(buildWindow());
  cockpitShell.add(buildConsole());
  cockpitShell.add(buildWheel());
  cockpitShell.add(buildLever());
  buildButtons();
  initNavMenu(cockpitShell);

  // lights travel with the rig (children of the shell, in prototype space)
  cockpitRig.add(new THREE.AmbientLight(0x35506a, 1.6));
  const key = new THREE.PointLight(0xffe8d0, 5, 14, 2);
  key.position.set(0.6, 1.9, 1.4);
  cockpitShell.add(key);
  // Dimmed from 6: this was the cyan wash over the whole cabin.
  const rim = new THREE.PointLight(CYAN, 2, 10, 2);
  rim.position.set(-1.2, 1.2, 0.2);
  cockpitShell.add(rim);
  holoGlow = new THREE.PointLight(CYAN, 0.4, 4, 2);
  holoGlow.position.set(0, 1.35, -0.15);
  cockpitShell.add(holoGlow);

  domElement.style.touchAction = 'none';
  // mouse / pen
  domElement.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);
  // touch (native): the reliable path on mobile, where the canvas may emit no
  // pointer events for touch. passive:false so we can preventDefault the
  // compatibility click (pointer-lock grab) and page scroll/zoom.
  domElement.addEventListener('touchstart', onTouchStart, { passive: false });
  domElement.addEventListener('touchmove', onTouchMove, { passive: false });
  window.addEventListener('touchend', onTouchEnd);
  window.addEventListener('touchcancel', onTouchEnd);

  // keyboard flashes: the key already drives the control (input.js / radioPopup.js);
  // this only lights the matching dash button so touch and keys look alike.
  window.addEventListener('keydown', function (e) {
    if (e.repeat) return;
    const b = flashByCode.get(e.code);
    if (b) flash(b);
    else if (e.code === 'KeyP') flash(buttons[2]); // P takes the photo the CAMERA bar offers
  });
}

// Wheel-hold deflection -1..1 with a dead zone at the centre.
function holdAxis(v) {
  const u = Math.max(-1, Math.min(1, v));
  return Math.abs(u) < C.WHEEL_HOLD_DEADZONE ? 0 : u;
}

export function updateCockpit3d(ship, delta, phase) {
  curPhase = phase;
  const dt = Math.min(delta, 0.05);
  elapsed += dt;

  cockpitRig.position.copy(ship.position);
  cockpitRig.quaternion.copy(ship.quaternion);

  // A parked finger emits no touchmove, so a delta-only wheel felt sticky: the
  // turn died against ANGULAR_DAMPING in about a fifth of a second and the wheel
  // sprang back to center while you were still holding it. Re-apply the offset
  // from the grab point every frame instead — hold the wheel over and the ship
  // keeps turning, at a rate set by how far over you are holding it.
  if (wheelDrag && wheelDrag.touch) {
    if (curPhase !== 'fly') {
      wheelDrag = null; // a drag can't survive a landing
    } else {
      // the canvas fills the window, so its size is the window's — no layout
      // read (getBoundingClientRect) and no closure per frame
      const span = Math.min(window.innerWidth, window.innerHeight) * C.WHEEL_HOLD_SPAN;
      const rate = C.WHEEL_HOLD_RATE * dt * settings.sensitivity;
      input.mouseX += holdAxis((wheelDrag.x - wheelDrag.ox) / span) * rate;
      input.mouseY +=
        holdAxis((wheelDrag.y - wheelDrag.oy) / span) * rate * (settings.invertY ? -1 : 1);
    }
  }

  // On a squarer screen (a tablet) the two hand controls sit at the very edges
  // of the frame: draw them in a little so there is something to take hold of.
  const narrow = Math.max(0, Math.min(1, (1.65 - window.innerWidth / window.innerHeight) / 0.35));
  stick.position.x = WHEEL_X - 0.12 * narrow;
  lever.position.x = LEVER_X + 0.1 * narrow;

  // The throttle. A held pointer sets it by how far it is from where it took
  // hold (up the screen is thrust), every frame, so a parked finger keeps the
  // burn going; anything that ends flight lets go of it.
  if (leverDrag) {
    if (curPhase !== 'fly') dropLever();
    else {
      const span = Math.min(window.innerWidth, window.innerHeight) * C.LEVER_SPAN;
      const v = Math.max(-1, Math.min(1, (leverDrag.oy - leverDrag.y) / span));
      input.throttle = Math.abs(v) < C.LEVER_DEADZONE ? 0 : v;
    }
  }
  // the handle shows the throttle whoever set it: the lever, or W and S
  const thr = curPhase === 'fly' && !standingAway ? throttleAxis() : 0;
  leverShown += (thr - leverShown) * Math.min(dt * 14, 1);
  leverArm.rotation.x = -leverShown * C.LEVER_THROW;
  leverGlowMat.color.set(thr < 0 ? 0xffb05a : CYAN).multiplyScalar(0.45 + Math.abs(leverShown) * 0.75);

  // wheel mirrors the ship's actual turn: rotate with yaw+roll, rock with
  // pitch (same smoothing the old yoke used)
  const av = ship.angularVelocity;
  sYaw += (av.y - sYaw) * 0.2;
  sPitch += (av.x - sPitch) * 0.2;
  sRoll += (av.z - sRoll) * 0.2;
  const clamp = (v, m) => Math.max(-m, Math.min(m, v));
  const targetZ = clamp(-sYaw * 3.0 - sRoll * 2.2, 0.9);
  wheel.rotation.z += (targetZ - wheel.rotation.z) * Math.min(dt * 7, 1);
  stick.rotation.x = -0.6 + clamp(sPitch * 1.5, 0.25);
  coreLight.intensity = 0.8 + Math.sin(elapsed * 3) * 0.25 + (input.warp ? 1 : 0) * 1.4;
  holoGlow.intensity = (isHoloOpen() ? 4 : 0.4) + Math.sin(elapsed * 4) * 0.5;
  // The destination menu rides the hologram: NAV (button or N) raises both.
  setNavMenuOpen(isHoloOpen());

  // button lit state: held buttons track their input flag, NAV tracks the
  // hologram, everything else only flashes on press
  for (let i = 0; i < buttons.length; i++) {
    const b = buttons[i];
    const u = b.userData,
      d = u.def;
    let active = 0;
    if (d.mode === 'hold') active = input[d.flag] ? 1 : 0;
    else if (d.mode === 'nav') active = isHoloOpen() ? 1 : 0;
    else if (d.lit) active = d.lit() ? 1 : 0; // CAMERA stays lit while its bar is up
    if (u._flash > 0) {
      active = Math.max(active, u._flash);
      u._flash = Math.max(0, u._flash - dt * 2.5);
    }
    u.screenMat.opacity += (0.14 + active * 0.72 - u.screenMat.opacity) * Math.min(dt * 8, 1);
    u.glowMat.opacity += (0.16 + active * 0.7 - u.glowMat.opacity) * Math.min(dt * 8, 1);
    u.rectMat.opacity += (0.3 + active * 0.45 - u.rectMat.opacity) * Math.min(dt * 8, 1);
    b.position.z += (u.baseZ - active * 0.016 - b.position.z) * Math.min(dt * 10, 1);
  }
}

// dev/verification handle
export function cockpitDebug() {
  return {
    buttonNames: () => buttons.map((b) => b.userData.def.name),
    press(name, on = true) {
      const b = buttons.find((x) => x.userData.def.name === name);
      if (b) pressButton(b, on);
      return !!b;
    },
    litOf(name) {
      const b = buttons.find((x) => x.userData.def.name === name);
      return b ? b.userData.screenMat.opacity : null;
    },
    wheelRot: () => (wheel ? wheel.rotation.z : 0),
    // the throttle: what it is set to, whether a pointer holds it, where the
    // handle is drawn; setLever(v) holds it at v as a finger would (null lets go)
    lever: () => ({ value: input.throttle, held: !!leverDrag, shown: leverShown }),
    setLever(v) {
      if (v === null || v === undefined) return dropLever();
      const span = Math.min(window.innerWidth, window.innerHeight) * C.LEVER_SPAN;
      leverDrag = { id: 'debug', oy: 0, y: -v * span };
    },
    // screen-space centre of a button ('LEVER' and 'WHEEL' too), for touch-hit
    // verification
    screenPos(name) {
      const b =
        name === 'LEVER' ? leverArm.children[2] : name === 'WHEEL' ? wheel : buttons.find((x) => x.userData.def.name === name);
      if (!b || !dom) return null;
      const v = b.getWorldPosition(new THREE.Vector3()).project(camera);
      const r = dom.getBoundingClientRect();
      return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
    },
  };
}
