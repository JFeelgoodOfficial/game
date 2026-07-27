// The flyable 3D cockpit (user redesign). Replaces the old 2D instrument
// image (cockpitFrame.js) and the minimal canopy struts (cockpit.js): a
// bigger window, a metal console whose dashboard buttons map to REAL
// controls, and a steering wheel that mirrors the ship's turn and can be
// grabbed and dragged to fly (touch). Built into cockpitScene and composited
// by CockpitOverlayPass, posed every frame from the ship transform so the
// camera-lag gap makes it read as a vehicle you sit inside.
//
// Dashboard buttons feed the same `input` flags the keyboard does (the WARP
// button in menu.js is the template): a held button sets a level flag while
// pressed, an edge button pulses it once, a function button calls straight
// into the subsystem. Pressing the real key lights the matching button.
//
// Camera zoom (idle / forward / full-window) lives in camera.js; the dash
// visibility signal it exposes is dashBlend(), which the DOM panels ride the
// way they used to ride the frame image's blend.

import * as THREE from 'three';
import { C } from './constants.js';
import { input } from './input.js';
import { settings } from './settings.js';
import { camera } from './camera.js';
import { cockpitScene } from './cockpit.js';
import { toggleRadioPopup } from './radioPopup.js';
import { toggleGallery } from './capture.js';
import { toggleHolo, isHoloOpen, holoPick } from './holonav.js';
import { initNavMenu, setNavMenuOpen, isNavMenuOpen, navMenuPick } from './navmenu.js';

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
    const scr = new THREE.Mesh(
      new THREE.PlaneGeometry(0.5, 0.26),
      new THREE.MeshBasicMaterial({ color: 0x0a2a33 })
    );
    scr.position.set(x, 0.62, 0.05);
    scr.rotation.x = -0.9;
    g.add(scr);
    const grid = new THREE.Mesh(
      new THREE.PlaneGeometry(0.5, 0.26),
      new THREE.MeshBasicMaterial({ color: CYAN, transparent: true, opacity: 0.25, wireframe: true })
    );
    grid.position.copy(scr.position);
    grid.rotation.copy(scr.rotation);
    g.add(grid);
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

function buildWheel() {
  stick = new THREE.Group();
  stick.position.set(0, 0.6, 0.78);
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
function keycap(keyText, color) {
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
  // the key, bright and centered
  g.fillStyle = '#dff4f8';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = '700 ' + (keyText.length > 1 ? 46 : 66) + 'px "Courier New", ui-monospace, monospace';
  g.fillText(keyText, 64, 68);
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  return s;
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
  if (def.key) {
    const disc = new THREE.Mesh(new THREE.CircleGeometry(cR + 0.02, 32), screenMat);
    disc.position.set(0, cy, 0.041);
    g.add(disc);
    const cap = keycap(keyGlyph(def.key), def.color);
    cap.scale.set(cR * 2.4, cR * 2.4, 1);
    cap.position.set(0, cy, 0.06);
    g.add(cap);
  }

  // rectangle: a recessed plate with a thin colored border, holding the action
  // name — so it reads as a distinct labelled rectangle, not floating text.
  const labelY = def.key ? ry : 0;
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
  hit.scale.set(W + 0.12, H + 0.12, 1);
  hit.userData.hit = true;
  g.add(hit);

  g.userData = { def, screenMat, glowMat, rectMat, baseZ: g.position.z, _flash: 0 };
  return g;
}

function buildButtons() {
  // Top row: WARP on the left, STAND/CAMERA on the right, centre kept clear for
  // the wheel. CAMERA is keyless (it opens the camera pop-up, where P
  // photographs and R records) so it shows no key circle. BRAKE/LAND/NAV have
  // moved down to the right console cluster (where SHIELDS used to be).
  // BOOST is gone (W is the boost now, and thrust needs no button), so WARP
  // slides into its inner slot at -0.87 and mirrors STAND at +0.87 — the empty
  // space falls at the outer edge where the dash curves away, not beside the
  // wheel where a hole would read as a missing button.
  const main = [
    { name: 'WARP', key: 'F', color: 0x82f7ff, mode: 'hold', flag: 'warp', x: -0.87 },
    { name: 'STAND', key: 'C', color: 0xcfe6ff, mode: 'edge', flag: 'toggleInterior', code: 'KeyC', x: 0.87 },
    { name: 'CAMERA', key: '', color: 0xffc9ec, mode: 'fn', fn: toggleGallery, x: 1.3 },
  ];
  main.forEach(function (d) {
    d.y = 0.82; // lifted to seat the taller redesigned buttons on the dash
    d.z = 0.05;
  });

  // Lower tiers mirror each other across the wheel: roll thrusters + radio on
  // the bottom-left, and brake/land/nav on the bottom-right. ROLL L/R are held
  // buttons wired to the same input flags Q/E drive (ship.js reads them each
  // tick); code: makes the key press flash the matching button.
  const aux = [
    { name: 'ROLL L', key: 'Q', color: 0xb98cff, mode: 'hold', flag: 'rollLeft', code: 'KeyQ', x: -1.54, y: 0.5, z: 0.16 },
    { name: 'ROLL R', key: 'E', color: 0x8cffd1, mode: 'hold', flag: 'rollRight', code: 'KeyE', x: -1.16, y: 0.5, z: 0.16 },
    { name: 'RADIO', key: ', .', color: 0x9fd8e8, mode: 'fn', fn: toggleRadioPopup, x: -0.78, y: 0.5, z: 0.16 },
    { name: 'BRAKE', key: 'SPACE', color: 0xa9f7ff, mode: 'hold', flag: 'brake', x: 0.78, y: 0.5, z: 0.16 },
    { name: 'LAND', key: 'G', color: 0xffd75a, mode: 'edge', flag: 'toggleWalk', code: 'KeyG', x: 1.16, y: 0.5, z: 0.16 },
    { name: 'NAV', key: 'N', color: 0x7dffc8, mode: 'nav', x: 1.54, y: 0.5, z: 0.16 },
  ];

  buttons = [];
  main.concat(aux).forEach(function (d) {
    const b = makeButton(d);
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

function interactive(isTouch) {
  return curPhase === 'fly' && (isTouch || !input.locked);
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

  // steering wheel: grab and drag to fly
  if (raycaster.intersectObject(stick, true).length) {
    wheelDrag = { id, x: cx, y: cy };
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
  if (wheelDrag && id === wheelDrag.id) {
    const dx = cx - wheelDrag.x;
    const dy = cy - wheelDrag.y;
    input.mouseX += dx * settings.sensitivity * C.WHEEL_DRAG_GAIN;
    input.mouseY += dy * settings.sensitivity * (settings.invertY ? -1 : 1) * C.WHEEL_DRAG_GAIN;
    wheelDrag.x = cx;
    wheelDrag.y = cy;
    return true;
  }
  return false;
}

function endAt(id) {
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
  });
}

export function updateCockpit3d(ship, delta, phase) {
  curPhase = phase;
  const dt = Math.min(delta, 0.05);
  elapsed += dt;

  cockpitRig.position.copy(ship.position);
  cockpitRig.quaternion.copy(ship.quaternion);

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
    // screen-space centre of a button, for touch-hit verification
    screenPos(name) {
      const b = buttons.find((x) => x.userData.def.name === name);
      if (!b || !dom) return null;
      const v = b.getWorldPosition(new THREE.Vector3()).project(camera);
      const r = dom.getBoundingClientRect();
      return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
    },
  };
}
