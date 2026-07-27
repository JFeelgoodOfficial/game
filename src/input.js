// Pointer lock + keyboard state (GDD 3.3). No menus.
//
// Mouse deltas accumulate here between physics ticks; ship.js consumes
// (reads and zeroes) them, so the accumulated travel acts as one torque
// impulse regardless of how many ticks a render frame spans.

import { settings } from './settings.js';

export const input = {
  locked: false,
  forward: false, // W
  reverse: false, // S
  rollLeft: false, // Q
  rollRight: false, // E
  left: false, // A — strafe left, walk modes only (planet on-foot + ship interior; unused in flight)
  right: false, // D — strafe right, walk modes only (planet on-foot + ship interior; unused in flight)
  sprint: false, // Shift — run on foot only. Flight has no separate boost key:
                 // W is full thrust (see ship.js), so nothing in the cockpit
                 // reads this.
  brake: false, // Space — counter-thrust in flight; jump on foot
  warp: false, // F (or the on-screen WARP button) — thrust x100, stops dead on release
  lookUp: false, // V, held — glance up through the overhead window
  toggleWalk: false, // G edge-trigger: disembark onto a planet / board. main.js reads and zeroes it.
  toggleInterior: false, // C edge-trigger: stand up in the ship / sit back down. main.js reads and zeroes it.
  toggleView: false, // T edge-trigger: first/third person while on foot. main.js reads and zeroes it.
  toggleBoard: false, // B edge-trigger: snowboard on/off (boardable worlds). walk.js consumes it.
  toggleVehicles: false, // I edge-trigger: vehicle selector on foot. game.js reads and zeroes it.
  interact: false, // E edge-trigger: talk / advance dialogue on foot. main.js reads and zeroes it.
  photo: false, // P edge-trigger: take a photo (capture.js). main.js reads and zeroes it.
  record: false, // R edge-trigger: start/stop screen recording. main.js reads and zeroes it.
  togglePause: false, // Backspace edge-trigger: pause/resume. game.js reads and zeroes it.
  mouseX: 0, // accumulated pixels since last consume
  mouseY: 0,
  // Analog walk axes, written only by the on-foot touch sticks (touchControls.js).
  // Zero means "nobody is touching the stick, the keys drive movement"; the walk
  // modules fall back to the WASD booleans in that case.
  moveX: 0, // strafe, -1 (left) .. +1 (right)
  moveY: 0, // forward, -1 (back) .. +1 (forward)
  wheel: 0, // accumulated scroll since last consume (third-person zoom)
};

// Every walker resolves its movement axes the same way, so they share this:
// the analog touch stick when it is pushed, the WASD booleans otherwise. `mag`
// is 0..1 and scales the target speed, so a half-pushed stick walks slowly —
// on the keyboard it is always 1 (a diagonal's 1.41 clamps), which is exactly
// what the normalize() in each walker already produced.
//
// Reuses one object per call, like the scratch vectors in walk.js: this runs
// inside the fixed-timestep loop.
const _axes = { fwd: 0, strafe: 0, mag: 0 };
export function moveAxes() {
  let fwd = (input.forward ? 1 : 0) - (input.reverse ? 1 : 0);
  let strafe = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  if (input.moveX !== 0 || input.moveY !== 0) {
    fwd = input.moveY;
    strafe = input.moveX;
  }
  _axes.fwd = fwd;
  _axes.strafe = strafe;
  _axes.mag = Math.min(1, Math.hypot(fwd, strafe));
  return _axes;
}

// The 3D cockpit registers a gate so a click that pressed a dashboard button,
// grabbed the wheel, or opened the nav hologram doesn't also grab pointer
// lock (which would hide the cursor the hologram needs). Returns true to skip
// the lock for this click.
let lockGate = null;
export function setPointerLockGate(fn) {
  lockGate = fn;
}

export function initInput(element) {
  element.addEventListener('click', () => {
    if (input.locked) return;
    if (lockGate && lockGate()) return;
    element.requestPointerLock();
  });

  const hint = document.getElementById('hint');
  document.addEventListener('pointerlockchange', () => {
    input.locked = document.pointerLockElement === element;
    if (hint) hint.classList.toggle('hidden', input.locked);
  });

  document.addEventListener('mousemove', (e) => {
    if (!input.locked) return;
    // sensitivity/invert applied at the source so every consumer (flight
    // torque, interior look, on-foot look) inherits them uniformly
    input.mouseX += e.movementX * settings.sensitivity;
    input.mouseY += e.movementY * settings.sensitivity * (settings.invertY ? -1 : 1);
  });

  element.addEventListener('wheel', (e) => { input.wheel += e.deltaY; }, { passive: true });

  document.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    setKey(e, true);
  });
  document.addEventListener('keyup', (e) => setKey(e, false));
}

function setKey(e, down) {
  switch (e.code) {
    case 'KeyW': input.forward = down; break;
    case 'KeyS': input.reverse = down; break;
    case 'KeyQ': input.rollLeft = down; break;
    case 'KeyE': input.rollRight = down; if (down) input.interact = true; break;
    case 'KeyA': input.left = down; break;
    case 'KeyD': input.right = down; break;
    case 'ShiftLeft':
    case 'ShiftRight': input.sprint = down; break;
    case 'Space': input.brake = down; e.preventDefault(); break;
    case 'KeyF':
    case 'KeyJ': input.warp = down; break;
    case 'KeyV': input.lookUp = down; break;
    // G and C are edge-triggered on keydown only; main.js consumes and zeroes them.
    case 'KeyG': if (down) input.toggleWalk = true; break; // disembark onto a planet
    case 'KeyC': if (down) input.toggleInterior = true; break; // stand up in the ship
    case 'KeyT': if (down) input.toggleView = true; break; // first/third person on foot
    case 'KeyB': if (down) input.toggleBoard = true; break; // snowboard on/off on foot
    case 'KeyI': if (down) input.toggleVehicles = true; break; // vehicle selector on foot
    case 'KeyP': if (down) input.photo = true; break; // take a photo
    case 'KeyR': if (down) input.record = true; break; // toggle screen recording
    case 'Backspace': if (down) input.togglePause = true; e.preventDefault(); break; // pause/resume
  }
}
