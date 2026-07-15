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
  BOOST_PULLBACK: 0.08, // tiny sink-back on boost — you stay in the seat, not pulled out
  BOOST_FOV: 13.0, // extra FOV on boost: widens to reveal the cockpit while first-person
  FRAME_FADE: 0.12, // per-frame ease of the boost cockpit image fading in/out

  // --- warp (user mechanic): hold F for boost x100, release to stop dead ---
  WARP_SPEED: 10000.0, // units/sec at full warp (~Saturn in a few seconds)
  WARP_RAMP: 0.08, // per-tick slew toward warp speed
  WARP_FOV: 26.0, // extra FOV at warp — the speed rush / star streaks

  // --- the planet (test mass, now with a procedural surface) ---
  // Bigger than a toy sphere so its atmosphere is a place you can fly into
  // and still climb out of: surface gravity (28) sits under boost thrust (42),
  // so thrust always frees you even from a low skim.
  TEST_MASS: 8.0e5,
  TEST_MASS_RADIUS: 1000.0,
  START_DISTANCE: 3500.0, // ship spawns this far from the planet (2500 up)
  SEA_LEVEL: 0.48, // terra's water threshold. lower = more land.
  PLANET_SPIN: 0.01, // radians/sec, slow rotation
  TERRAIN_HEIGHT: 70.0, // terra's peak displacement above sea level
  ATMO_SHELL: 1.25, // atmosphere radius, × planet radius (250 units thick)
  SKY_COLOR: 0x6ea0ff, // daytime sky the view washes to inside the atmosphere
  SKY_DENSITY: 0.6, // how thickly the atmosphere fogs the view
  CLOUD_COVER: 0.5, // 0 clear .. 1 overcast
  TURBULENCE: 0.16, // camera buffet inside an atmosphere, scaled by speed

  // --- the sun (now a real body you can fly into — and burn up at) ---
  SUN_DISTANCE: 150000.0, // from the system origin, along the sun direction
  SUN_RADIUS: 8000.0,
  SUN_MASS: 8.0e7, // noticeable pull on approach, escapable at range
  SUN_BURN_MULT: 2.0, // heat builds this much faster at the sun than at a planet

  // --- look (GDD 4) ---
  // The one accent color, chosen once and committed to across the whole
  // project (GDD 4.2): magenta. Nebula tint, accretion disk hot edge, any
  // future emissive accents all derive from it.
  ACCENT: 0xd4408f,
  NEBULA_INTENSITY: 1.1, // overall nebula brightness. restraint reads as expensive.
  BLOOM_THRESHOLD: 0.85, // high enough that the cockpit never blooms (GDD 4.4)
  BLOOM_STRENGTH: 0.9,
  BLOOM_RADIUS: 0.4,
  CA_STRENGTH: 2.0, // chromatic aberration, pixels of RGB split at frame corners

  // --- black hole (GDD 4.5) ---
  BH_MASS: 4.0e6, // pull at 2000 u ≈ boost thrust: close passes build real speed
  BH_HORIZON: 150.0, // event horizon radius. not a hazard — falling in does nothing.
  BH_DISTANCE: 25000.0, // from the start point, off-axis, discoverable
  LENS_STRENGTH: 1.0, // weak-field deflection scale, in units of horizon radii
  DISK_INNER: 2.2, // accretion disk inner edge, × horizon radius
  DISK_OUTER: 7.0, // outer edge, × horizon radius

  // --- horizon collapse / reset (beyond GDD 4.5) ---
  // A deliberate override of "falling in does nothing": crossing into the
  // hole stretches everything and returns you to the start (the GDD 7 loop).
  // Capture is generous — a fast pass slingshots by, so you must commit to
  // the dive, but "fly into it" shouldn't demand pixel-perfect aim.
  HORIZON_CAPTURE: 400.0, // fly within this of the BH center and you fall in
  COLLAPSE_TIME: 0.9, // seconds of stretch before the reset
  RESPAWN_TIME: 0.7, // seconds to fade back in at the start

  // --- hull overheat (user mechanic, overrides GDD 1.2 "no death") ---
  // Pressing against the altitude floor (or getting close to the sun) heats
  // the hull: 3s of HULL TEMP CRITICAL warning, then a 3s flashing-red
  // cockpit countdown, then the canopy cracks and the ship is destroyed.
  // Pull away at any point to cool off and cancel.
  HEAT_ALTITUDE: 90.0, // heat builds while lower than this above the local floor
  HEAT_WARN_TIME: 3.0, // seconds of warning before the countdown starts
  HEAT_COUNTDOWN: 3.0, // seconds of flashing 3-2-1 before destruction
  HEAT_COOL: 4.0, // seconds to fully cool once clear
  CRACK_AT: 0.75, // heat fraction where the canopy cracks (mid-countdown)
  EXPLODE_TIME: 1.2, // seconds of flash/shake before the menu

  // --- altitude floor (GDD 5.1) ---
  // Strictly a Phase 5 mechanic, pulled forward on request so the test mass
  // reads as a planet you skim rather than one you fly through. Thickening
  // drag only — never a collision, never a hard stop, and no outward push
  // (a spring bounces; GDD 3.2). Applies to any gravity body given a radius.
  ATMOS_TOP: 250.0, // altitude above the surface where the air starts (drag begins)
  MIN_ALTITUDE: 40.0, // the floor: you skim this low but can't land (drag holds you)
  FLOOR_DRAG_POWER: 2.5, // how sharply drag ramps from ATMOS_TOP down to the floor
  FLOOR_DRAG_MAX: 0.06, // speed bled per tick at the floor (air thickening)
};
