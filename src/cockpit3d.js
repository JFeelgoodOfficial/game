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
import { nextTrack, prevTrack } from './music.js';
import { toggleHolo, isHoloOpen, holoPick } from './holonav.js';
import { label } from './holoLabel.js';

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
  const lip = new THREE.Mesh(
    new THREE.BoxGeometry(3.4, 0.012, 0.02),
    new THREE.MeshBasicMaterial({ color: CYAN })
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
    new THREE.MeshBasicMaterial({ color: CYAN })
  );
  ring.position.set(0, 0.78, -0.25);
  ring.rotation.x = Math.PI / 2;
  g.add(ring);
  const cone = new THREE.Mesh(
    new THREE.CylinderGeometry(0.34, 0.04, 0.9, 40, 1, true),
    new THREE.MeshBasicMaterial({
      color: CYAN,
      transparent: true,
      opacity: 0.022,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  cone.position.set(0, 1.24, -0.25);
  cone.rotation.x = Math.PI;
  g.add(cone);

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

function makeButton(def) {
  const g = new THREE.Group();
  g.position.set(def.x, def.y, def.z);
  g.rotation.x = -0.32;
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x3b414b, roughness: 0.4, metalness: 0.92 });
  const bevelMat = new THREE.MeshStandardMaterial({ color: 0x2a2f37, roughness: 0.5, metalness: 0.85 });
  const innerMat = new THREE.MeshStandardMaterial({ color: 0x090c11, roughness: 0.55, metalness: 0.5 });
  const screenMat = new THREE.MeshBasicMaterial({ color: def.color, transparent: true, opacity: 0.14 });
  const glowMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(def.color).multiplyScalar(1.3),
    transparent: true,
    opacity: 0.16,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const W = 0.24,
    H = 0.165;

  const glow = new THREE.Mesh(new THREE.PlaneGeometry(W + 0.045, H + 0.045), glowMat);
  glow.position.z = -0.026;
  g.add(glow);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(W, H, 0.05), frameMat);
  g.add(frame);
  const bevel = new THREE.Mesh(new THREE.BoxGeometry(W - 0.028, H - 0.028, 0.045), bevelMat);
  bevel.position.z = 0.012;
  g.add(bevel);
  const inner = new THREE.Mesh(new THREE.BoxGeometry(W - 0.06, H - 0.06, 0.02), innerMat);
  inner.position.z = 0.03;
  g.add(inner);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.06, H - 0.06), screenMat);
  screen.position.z = 0.041;
  g.add(screen);

  const lab = label(def.name, def.color, 0.19);
  lab.position.set(0, 0.012, 0.05);
  g.add(lab);
  if (def.key) {
    const kl = label(def.key, CYAN2, 0.1);
    kl.position.set(0, -0.052, 0.05);
    g.add(kl);
  }
  g.userData = { def, screenMat, glowMat, baseZ: g.position.z, _flash: 0 };
  return g;
}

function buildButtons() {
  // main row of 7 across the dash top
  const main = [
    { name: 'WARP', key: 'F', color: 0x82f7ff, mode: 'hold', flag: 'warp' },
    { name: 'BOOST', key: 'SHIFT', color: 0xff6a4a, mode: 'hold', flag: 'boost' },
    { name: 'BRAKE', key: 'SPACE', color: 0xa9f7ff, mode: 'hold', flag: 'brake' },
    { name: 'NAV', key: 'N', color: 0x7dffc8, mode: 'nav' },
    { name: 'LAND', key: 'G', color: 0xffd75a, mode: 'edge', flag: 'toggleWalk', code: 'KeyG' },
    { name: 'STAND', key: 'C', color: 0xcfe6ff, mode: 'edge', flag: 'toggleInterior', code: 'KeyC' },
    { name: 'PHOTO', key: 'P', color: 0xffc9ec, mode: 'edge', flag: 'photo', code: 'KeyP' },
  ];
  const span = 2.6,
    x0 = -span / 2;
  main.forEach(function (d, i) {
    d.x = x0 + i * (span / (main.length - 1));
    d.y = 0.74;
    d.z = 0.05;
  });

  // lower tier: radio prev/next on the left pod, blank system buttons on the
  // right pod, flanking the holo projector at centre
  const aux = [
    { name: '◀', key: ',', color: 0x9fd8e8, mode: 'fn', fn: prevTrack, code: 'Comma', x: -1.12, y: 0.55, z: 0.16 },
    { name: '▶', key: '.', color: 0x9fd8e8, mode: 'fn', fn: nextTrack, code: 'Period', x: -0.82, y: 0.55, z: 0.16 },
    { name: 'SHIELDS', key: '', color: 0xbfe8ff, mode: 'blank', x: 0.82, y: 0.55, z: 0.16 },
    { name: 'COMMS', key: '', color: 0xff5aa8, mode: 'blank', x: 1.12, y: 0.55, z: 0.16 },
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

function interactive() {
  return curPhase === 'fly' && !input.locked;
}

function setPointer(e) {
  const r = dom.getBoundingClientRect();
  pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
  pointer.y = -((e.clientY - r.top) / r.height) * 2 + 1;
}

function onPointerDown(e) {
  lastConsumed = false;
  lastPointerType = e.pointerType || 'mouse';
  if (!interactive()) return;
  setPointer(e);
  raycaster.setFromCamera(pointer, camera);

  // hologram first when open: a hit (body or ENGAGE) consumes the pointer; a
  // miss deselects and falls through so the dash stays usable.
  if (isHoloOpen() && holoPick(raycaster)) {
    lastConsumed = true;
    e.preventDefault();
    return;
  }

  // steering wheel: grab and drag to fly
  if (raycaster.intersectObject(stick, true).length) {
    wheelDrag = { id: e.pointerId, x: e.clientX, y: e.clientY };
    lastConsumed = true;
    e.preventDefault();
    return;
  }

  // dashboard buttons
  for (let i = 0; i < buttons.length; i++) {
    if (raycaster.intersectObject(buttons[i], true).length) {
      pressButton(buttons[i], true);
      pointerButtons.set(e.pointerId, buttons[i]);
      lastConsumed = true;
      e.preventDefault();
      return;
    }
  }
}

function onPointerMove(e) {
  if (wheelDrag && e.pointerId === wheelDrag.id) {
    const dx = e.clientX - wheelDrag.x;
    const dy = e.clientY - wheelDrag.y;
    input.mouseX += dx * settings.sensitivity * C.WHEEL_DRAG_GAIN;
    input.mouseY += dy * settings.sensitivity * (settings.invertY ? -1 : 1) * C.WHEEL_DRAG_GAIN;
    wheelDrag.x = e.clientX;
    wheelDrag.y = e.clientY;
    e.preventDefault();
  }
}

function onPointerUp(e) {
  if (wheelDrag && e.pointerId === wheelDrag.id) wheelDrag = null;
  const b = pointerButtons.get(e.pointerId);
  if (b) {
    pressButton(b, false);
    pointerButtons.delete(e.pointerId);
  }
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

  // lights travel with the rig (children of the shell, in prototype space)
  cockpitRig.add(new THREE.AmbientLight(0x35506a, 1.6));
  const key = new THREE.PointLight(0xffe8d0, 5, 14, 2);
  key.position.set(0.6, 1.9, 1.4);
  cockpitShell.add(key);
  const rim = new THREE.PointLight(CYAN, 6, 10, 2);
  rim.position.set(-1.2, 1.2, 0.2);
  cockpitShell.add(rim);
  holoGlow = new THREE.PointLight(CYAN, 0.4, 4, 2);
  holoGlow.position.set(0, 1.35, -0.15);
  cockpitShell.add(holoGlow);

  domElement.style.touchAction = 'none';
  domElement.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);

  // keyboard flashes: the key already drives the control (input.js / radio.js);
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
  };
}
