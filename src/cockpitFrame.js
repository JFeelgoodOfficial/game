// The instrument cockpit — the user-provided image (a deliberate exception
// to GDD 2's all-procedural rule, at the user's request) with the window
// panes cut transparent so the live scene shows through. This is the
// DEFAULT view now: it's up at idle and normal flight so the dashboard
// (radio, NAV, WARP) is visible and clickable, and it fades OUT under
// boost/warp for the clear forward-window view — inverted from the original
// behaviour at the user's request. The minimal 3D cockpit hides while the
// frame is up so interiors don't double.
//
// A small translate parallax from the ship's angular velocity keeps the
// frame feeling attached to a turning ship rather than pasted on glass.

import { C } from './constants.js';
import { input } from './input.js';
import frameUrl from './assets/cockpit-frame.png';
import yokeUrl from './assets/yoke.png';

let img = null;
let yoke = null;
let blend = 0;
// smoothed steering, so the yoke eases rather than jitters
let sYaw = 0, sPitch = 0, sRoll = 0;

function makeLayer(url, z) {
  const el = document.createElement('img');
  el.src = url;
  el.alt = '';
  el.draggable = false;
  Object.assign(el.style, {
    position: 'fixed',
    inset: '0',
    width: '100%',
    height: '100%',
    objectFit: 'fill',
    pointerEvents: 'none',
    userSelect: 'none',
    opacity: '0',
    zIndex: String(z),
    willChange: 'opacity, transform',
  });
  document.body.appendChild(el);
  return el;
}

export function initCockpitFrame() {
  img = makeLayer(frameUrl, 5); // frame: above canvas, below hologram & menu
  yoke = makeLayer(yokeUrl, 6); // the moving yoke sits over the frame
  yoke.style.transformOrigin = '50% 86%'; // pivot at the column base
}

// Returns the current blend (0..1) so main.js can hide the 3D cockpit.
// `active` is false on the menu, where the scene idles as a clean backdrop.
export function updateCockpitFrame(ship, delta, active) {
  // The frame also drops while glancing up (V): the PNG is a forward view
  // and would pin the eye while the camera pitches at the overhead window.
  const speedView =
    input.warp || (input.boost && (input.forward || input.reverse)) || input.lookUp;
  const target = active && !speedView ? 1 : 0;
  // time-based ease so the fade speed is framerate-independent
  blend += (target - blend) * Math.min(C.FRAME_FADE * delta * 60, 1);
  if (blend < 0.005 && target === 0) blend = 0;
  const o = blend.toFixed(3);
  img.style.opacity = o;
  yoke.style.opacity = o;

  // parallax: whole frame shifts opposite the turn, a few px
  const av = ship.angularVelocity;
  const px = -av.y * 26;
  const py = av.x * 18;
  img.style.transform = `translate(${px.toFixed(1)}px, ${py.toFixed(1)}px) scale(1.04)`;

  // yoke follows the ship's actual steering: rotate with yaw+roll, rock with
  // pitch. Smoothed and clamped so it reads as a hand on the controls.
  sYaw += (av.y - sYaw) * 0.2;
  sPitch += (av.x - sPitch) * 0.2;
  sRoll += (av.z - sRoll) * 0.2;
  const clamp = (v, m) => Math.max(-m, Math.min(m, v));
  const rot = clamp(-sYaw * 900 - sRoll * 700, 15); // degrees
  const ty = py + clamp(sPitch * 700, 12);
  yoke.style.transform =
    `translate(${px.toFixed(1)}px, ${ty.toFixed(1)}px) scale(1.06) rotate(${rot.toFixed(2)}deg)`;

  return blend;
}
