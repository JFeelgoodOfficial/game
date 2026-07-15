// Every tunable number lives here and nowhere else (GDD 2.2).
// Section 3.4 values are starting guesses — replace by measurement via the
// tuning panel (dev builds only, see tuning.js).
//
// Exported as a mutable object so the panel can edit values live.

export const C = {
  // --- flight model (GDD 3.4) ---
  ANGULAR_DAMPING: 0.94, // per physics tick, at 60hz
  LINEAR_DAMPING: 1.0, // exactly 1.0. no drag in vacuum.
  TORQUE_SCALE: 0.0008, // rad/s of angular velocity per pixel of mouse travel
  THRUST: 12.0, // units/s^2 along local forward
  BOOST_MULTIPLIER: 3.5,
  CAMERA_LAG: 0.12, // slerp factor, camera toward ship rotation
  CAMERA_DRIFT: 0.03, // positional offset under acceleration
  G: 35.0, // scaled, not real. tune for play. Lowered from an initial 400:
           // at 400 a planet's pull near the surface dwarfs thrust and the
           // ship can't climb out of a close pass. Push it back up for more
           // drama, but past ~45 a dive to the floor becomes inescapable.
  GRAVITY_SOFTENING: 25.0, // min r^2 term
  SOFT_CAP_SPEED: 800.0, // thrust falls off above this

  // --- flight model, additions ---
  ROLL_TORQUE: 0.03, // rad/s of angular velocity added per tick while Q/E held

  // --- floating origin (GDD 5.3) ---
  ORIGIN_SHIFT_THRESHOLD: 5000.0, // rebase the world when the ship drifts this far

  // --- camera ---
  FOV: 70,

  // --- phase 1 test scene ---
  TEST_MASS: 5.0e5, // orbital speed at start distance ≈ 108 u/s, under the soft cap
  TEST_MASS_RADIUS: 200.0,
  START_DISTANCE: 1500.0, // ship spawns this far from the test mass

  // --- altitude floor (GDD 5.1) ---
  // Strictly a Phase 5 mechanic, pulled forward on request so the test mass
  // reads as a planet you skim rather than one you fly through. Enforced by
  // thickening drag + an outward cushion near the surface — never a collision,
  // never a hard stop (GDD 5.1, 8). Applies to any gravity body given a radius.
  MIN_ALTITUDE: 500.0, // altitude above the surface where the floor begins to bite
  FLOOR_DRAG_POWER: 3.0, // how sharply the floor ramps toward the surface. higher = harder.
  FLOOR_DRAG_MAX: 0.08, // light isotropic speed bleed at the surface (air thickening)
  FLOOR_PUSH: 260.0, // outward cushion accel at the surface — sets the skim height
};
