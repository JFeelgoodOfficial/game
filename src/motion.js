// Photosensitivity / vestibular comfort: one factor every camera shake in the
// game multiplies by, so a user who asked for reduced motion gets a quarter of
// the rattle everywhere — hull stress, turbulence and the warp smear in flight
// (game.js, starfield.js), monster footfalls and blasts on foot (walk.js). The
// flashing heat UI is handled in CSS via the same media query.
//
// The settings panel can override the OS: 'system' follows
// prefers-reduced-motion, 'on' and 'off' force it. MOTION_SCALE is a live
// binding — importers read the current value every time they use it.

import { settings, onSettingsChange } from './settings.js';

const mq = typeof window !== 'undefined' ? window.matchMedia?.('(prefers-reduced-motion: reduce)') : null;

function compute() {
  const reduce = settings.reducedMotion === 'on' || (settings.reducedMotion === 'system' && !!mq && mq.matches);
  return reduce ? 0.25 : 1;
}

export let MOTION_SCALE = compute();

const refresh = () => {
  MOTION_SCALE = compute();
};
onSettingsChange(refresh);
mq?.addEventListener?.('change', refresh);
