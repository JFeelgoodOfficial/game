// Full cockpit view on boost — the user-provided instrument-cockpit image
// (a deliberate exception to GDD 2's all-procedural rule, at the user's
// request) with the window panes cut transparent so the live scene shows
// through. Fades in while boosting; the minimal 3D cockpit hides while the
// frame is up so interiors don't double.
//
// A small translate parallax from the ship's angular velocity keeps the
// frame feeling attached to a turning ship rather than pasted on glass.

import { C } from './constants.js';
import { input } from './input.js';
import frameUrl from './assets/cockpit-frame.png';

let img = null;
let blend = 0;

export function initCockpitFrame() {
  img = document.createElement('img');
  img.src = frameUrl;
  img.alt = '';
  img.draggable = false;
  Object.assign(img.style, {
    position: 'fixed',
    inset: '0',
    width: '100%',
    height: '100%',
    objectFit: 'fill',
    pointerEvents: 'none',
    userSelect: 'none',
    opacity: '0',
    zIndex: '5', // above the canvas, below the hologram panel & menu
    willChange: 'opacity, transform',
  });
  document.body.appendChild(img);
}

// Returns the current blend (0..1) so main.js can hide the 3D cockpit.
export function updateCockpitFrame(ship, delta) {
  const target = input.boost && (input.forward || input.reverse) ? 1 : 0;
  // time-based ease so the fade speed is framerate-independent
  blend += (target - blend) * Math.min(C.FRAME_FADE * delta * 60, 1);
  if (blend < 0.005 && target === 0) blend = 0;
  img.style.opacity = blend.toFixed(3);
  // parallax: shift opposite the turn, a few px at most
  const av = ship.angularVelocity;
  const px = (-av.y * 26).toFixed(1);
  const py = (av.x * 18).toFixed(1);
  img.style.transform = `translate(${px}px, ${py}px) scale(1.04)`;
  return blend;
}
