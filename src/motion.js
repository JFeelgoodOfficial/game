// Photosensitivity / vestibular comfort: one factor every camera shake in the
// game multiplies by, so a user who asked the OS for reduced motion gets a
// quarter of the rattle everywhere — hull stress and turbulence in flight
// (game.js), monster footfalls and blasts on foot (walk.js). The flashing
// heat UI is handled in CSS via the same media query.
export const MOTION_SCALE =
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    ? 0.25
    : 1;
