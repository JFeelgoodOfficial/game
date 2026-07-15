// Pointer lock + keyboard state (GDD 3.3). No menus.
//
// Mouse deltas accumulate here between physics ticks; ship.js consumes
// (reads and zeroes) them, so the accumulated travel acts as one torque
// impulse regardless of how many ticks a render frame spans.

export const input = {
  locked: false,
  forward: false, // W
  reverse: false, // S
  rollLeft: false, // Q
  rollRight: false, // E
  boost: false, // Shift
  brake: false, // Space — counter-thrust, held
  mouseX: 0, // accumulated pixels since last consume
  mouseY: 0,
};

export function initInput(element) {
  element.addEventListener('click', () => {
    if (!input.locked) element.requestPointerLock();
  });

  const hint = document.getElementById('hint');
  document.addEventListener('pointerlockchange', () => {
    input.locked = document.pointerLockElement === element;
    if (hint) hint.classList.toggle('hidden', input.locked);
  });

  document.addEventListener('mousemove', (e) => {
    if (!input.locked) return;
    input.mouseX += e.movementX;
    input.mouseY += e.movementY;
  });

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
    case 'KeyE': input.rollRight = down; break;
    case 'ShiftLeft':
    case 'ShiftRight': input.boost = down; break;
    case 'Space': input.brake = down; e.preventDefault(); break;
  }
}
