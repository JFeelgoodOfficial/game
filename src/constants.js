// Every tunable number lives here and nowhere else (GDD 2.2).
// Section 3.4 values are starting guesses — replace by measurement via the
// tuning panel (dev builds only, see tuning.js).
//
// Exported as a mutable object so the panel can edit values live.

export const C = {
  // --- flight model (GDD 3.4) ---
  ANGULAR_DAMPING: 0.94, // per physics tick, at 60hz
  LINEAR_DAMPING: 1.0, // exactly 1.0. no drag in vacuum.
  ROLL_TORQUE: 0.03, // rad/s of roll per physics tick while a roll paddle is held
  AUTO_LEVEL: 0.02, // per tick: how hard the wings are brought level where there is a horizon (ship.levelUp)
  TORQUE_SCALE: 0.0008, // rad/s of angular velocity per pixel of mouse travel
  THRUST: 12.0, // units/s^2 along local forward
  BOOST_MULTIPLIER: 7.0, // thrust multiplier while W is held. W IS the boost —
                         // there is no separate boost key, so this is simply
                         // what the forward engine is worth. S reverses at the
                         // base THRUST above.
  CAMERA_LAG: 0.12, // slerp factor, camera toward ship rotation
  CAMERA_DRIFT: 0.03, // positional offset under acceleration
  G: 35.0, // scaled, not real. tune for play. Lowered from an initial 400:
           // at 400 a planet's pull near the surface dwarfs thrust and the
           // ship can't climb out of a close pass. Push it back up for more
           // drama, but past ~45 a dive to the floor becomes inescapable.
  GRAVITY_SOFTENING: 25.0, // min r^2 term
  SOFT_CAP_SPEED: 800.0, // thrust falls off above this

  // --- flight model, additions ---

  // --- floating origin (GDD 5.3) ---
  ORIGIN_SHIFT_THRESHOLD: 5000.0, // rebase the world when the ship drifts this far

  // --- camera ---
  FOV: 70,
  LOOK_UP_ANGLE: 1.15, // rad (~66°): head pitch at full hold-V overhead glance
  LOOK_UP_EASE: 0.1, // per-frame ease toward/away from the look-up pose
  BOOST_FOV: 13.0, // extra FOV under thrust (W/S): widens to reveal the cockpit while first-person

  // --- 3D cockpit (cockpit3d.js) + its camera zoom states (camera.js) ---
  // The camera leans forward in the seat by these ship-local offsets: a full
  // push past the console under thrust or warp (full-window view). World units.
  // The old half-way "nudge on W, dashboard stays visible" state is gone — W is
  // the boost now, so thrusting at all goes straight to the full-window view.
  COCKPIT_SCALE: 0.5, // rig scale from prototype units to world units
  // Touch layout of the six dash buttons (cockpit3d.js buildButtons), in shell
  // units. On a phone the row comes off the raked dash top and stands along the
  // console's front face, which is the bottom band of the screen, spread from
  // the left end of the face to just short of the wheel, with bigger name plates.
  // Desktop keeps the row on the dash top.
  TOUCH_DASH_X: -0.2, // row centre, pulled left because the wheel takes the right end
  TOUCH_DASH_Y: 0.24, // button centre height: on the front face (face spans -0.03..0.67)
  TOUCH_DASH_Z: 0.34, // just proud of the face (front at 0.24)
  TOUCH_DASH_PITCH: 0.5, // centre-to-centre spacing
  TOUCH_DASH_SCALE: 1.5,
  TOUCH_DASH_TILT: -0.14, // tipped back a little toward the eye above
  COCKPIT_FULL_Y: 0.06, // rise over the wheel at full-window zoom
  COCKPIT_FULL_Z: -1.25, // forward push past the console at full-window zoom
  WHEEL_DRAG_GAIN: 2.0, // touch-drag on the wheel -> mouse-equivalent steer travel
  // Held touch on the wheel steers by OFFSET, not by movement: a parked finger
  // emits no touchmove, so a delta-only wheel died against ANGULAR_DAMPING in
  // about a fifth of a second. Hold it off-center now and the turn holds.
  WHEEL_HOLD_SPAN: 0.22, // fraction of the min viewport dim = full deflection
  WHEEL_HOLD_RATE: 3000, // px/s of mouse-equivalent steer travel at full deflection
  WHEEL_HOLD_DEADZONE: 0.08,
  // The throttle lever (left of the dash): drag up for thrust, down for
  // reverse, by offset from where it was grabbed; it springs back on release.
  LEVER_SPAN: 0.16, // fraction of the min viewport dim = full throw
  LEVER_DEADZONE: 0.1,
  LEVER_THROW: 0.5, // radians the handle swings each way
  // A burn held on the lever leans the camera only this far toward the
  // full-window view, so the wheel and the lever stay in frame for the hands
  // that are on them. W on a keyboard still goes all the way.
  COCKPIT_LEVER_LEAN: 0.15,

  // --- on-foot touch sticks (touchControls.js) ---
  TOUCH_STICK_SPAN: 52, // px from the grab point to full stick deflection
  TOUCH_LOOK_RATE: 900, // px/s of mouse-equivalent look travel at full deflection
  TOUCH_RUN_THRESHOLD: 0.85, // stick magnitude past which the walker runs
  TOUCH_STICK_DEADZONE: 0.15,

  // --- warp (user mechanic): hold F for thrust x100, release to stop dead ---
  WARP_SPEED: 10000.0, // units/sec at full warp (~Saturn in a few seconds)
  WARP_RAMP: 0.08, // per-tick slew toward warp speed
  // Warp presentation. All of it is driven by the ship's actual speed as a
  // fraction of WARP_SPEED, not by the key, so it builds and dies with the burn.
  WARP_STREAK_LEN: 340.0, // world units a streak star stretches at full warp
  WARP_STREAK_FROM: 0.06, // speed fraction below which no streaks are drawn
  WARP_SMEAR: 0.018, // radial blur reach at the frame corners at full warp (uv)
  WARP_CA_BOOST: 2.5, // extra chromatic aberration at full warp, x CA_STRENGTH
  MENU_PAN_RATE: 0.02, // peak yaw rate of the title-screen pan, rad/s (about 11 degrees each way)
  WARP_KICK: 0.55, // camera trauma added when warp engages or drops out
  FOV_SPRING: 70.0, // stiffness of the FOV spring (1/s^2)
  FOV_DAMPING: 0.5, // damping ratio; below 1 the FOV overshoots, then settles
  TRAUMA_DECAY: 1.6, // camera trauma lost per second
  WARP_FOV: 26.0, // extra FOV at warp — the speed rush / star streaks
  AUTOPILOT_TURN_RATE: 1.2, // rad/s the nav auto-warp turns the ship toward a target

  // --- the planet (test mass, now with a procedural surface) ---
  // Bigger than a toy sphere so its atmosphere is a place you can fly into
  // and still climb out of: surface gravity (28) sits under boost thrust (42),
  // so thrust always frees you even from a low skim.
  TEST_MASS: 8.0e5,
  TEST_MASS_RADIUS: 1000.0,
  START_DISTANCE: 3500.0, // ship spawns this far from the planet (2500 up)
  SEA_LEVEL: 0.48, // terra's water threshold. lower = more land.
  PLANET_SPIN: 0.01, // radians/sec, slow rotation
  TERRAIN_HEIGHT: 220.0, // terra's peak displacement above sea level
  ATMO_SHELL: 1.25, // atmosphere radius, × planet radius (250 units thick)
  SKY_COLOR: 0x6ea0ff, // daytime sky the view washes to inside the atmosphere
  SKY_DENSITY: 0.6, // how thickly the atmosphere fogs the view
  // Scattering shell (src/shaders/atmosphere.frag), lengths in planet radii.
  ATMO_SCALE_HEIGHT: 0.045, // density falls by e every this much altitude
  ATMO_TAU: 0.2, // zenith optical depth in the most-scattered colour channel
  ATMO_SUN: 0.7, // sunlight intensity feeding the in-scatter (HDR)
  ATMO_MIE: 0.5, // forward-scattering haze: the glow around a low sun
  ATMO_INSIDE: 0.3, // share of the shell's effect left at ground level
  WATER_FADE_NEAR: 2.0, // planet radii from centre: sea mesh fully drawn inside this
  WATER_FADE_FAR: 3.5, // ...and gone beyond this, where the surface shader draws the sea
  CITY_LIGHTS_HDR: 2.6, // night-side town glow, above the bloom threshold
  SEA_GLINT: 5.0, // peak sun-glint intensity on open water, close up
  SKY_HAZE_DIST: 400.0, // aerial perspective: sightline distance (units) for ~63% haze on geometry
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
  // Emissive intensities, in scene-linear units where 1.0 is paper white.
  // Tone mapping happens once, in OutputPass, so anything meant to read as a
  // light SOURCE has to be written above 1.0 or it is just a pale surface and
  // the bloom threshold never sees it.
  SUN_CORE_HDR: 5.0, // photosphere at disc centre
  SUN_CORONA: 1.1, // corona brightness at the limb
  SUN_CORONA_RADII: 7.0, // half-width of the corona billboard, in sun radii
  STATION_ENV: 2.2, // how strongly station metal reflects the baked sky
  STATION_PANEL: 14.0, // hull plating cell size, world units
  STATION_GLOW_HDR: 3.2, // accent strips and beacons
  STATION_WINDOW_HDR: 1.7, // lit viewports
  STATION_EMBER_HDR: 3.0, // mining pits and cutting beams

  // --- black hole (GDD 4.5) ---
  BH_MASS: 4.0e6, // pull at 2000 u ≈ boost thrust: close passes build real speed
  BH_HORIZON: 150.0, // event horizon radius. not a hazard — falling in does nothing.
  BH_DISTANCE: 25000.0, // from the start point, off-axis, discoverable
  LENS_STRENGTH: 1.0, // weak-field deflection scale, in units of horizon radii
  DISK_INNER: 2.2, // accretion disk inner edge, × horizon radius
  DISK_OUTER: 7.0, // outer edge, × horizon radius

  // --- deep nebulae (flyable clouds you fly through — see src/deepnebula.js) ---
  // Each painting-nebula is one entry in the NEBULAE array in deepnebula.js;
  // its position, palette, counts, and mass live in that config. Only these two
  // shared knobs live here.
  NEBULA_FIELD_INTENSITY: 1.0, // global master brightness for every deep nebula (tuning-panel live)
  NEBULA_LOG_DIST: 5000.0, // default NAV contact-log distance for a deep nebula

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

  // --- the cottage: what is on the other side of the sun ---
  // Burning up AT THE SUN no longer ends the run. The flash plays out exactly
  // as the explosion always did, and then it fades up somewhere else
  // (world/cottage.js, src/cottageWalk.js). Re-entry burn at a planet still
  // kills — only the star opens the door.
  //
  // The two transitions are the same shape: ramp the flash to full white, do
  // the switch UNDER the white (which is where the cottage's build cost and
  // the world reset both hide), then fade the white out on the other side.
  ASCEND_FLASH: 0.42, // seconds of ramp to white — matches EXPLODE_TIME * 0.35
  ASCEND_FADE: 1.8, // seconds of white fading off the garden. Unhurried.
  // How long the sun sequence may hold at full white waiting for the cottage
  // before it gives up and hands back the death menu. The wait is normally a
  // frame or two; this only fires when the walk chunk cannot be fetched at all,
  // where an unbounded hold is a dead screen the player cannot escape.
  ASCEND_GIVE_UP: 12.0,
  DEPART_FLASH: 0.55, // seconds of ramp to white when you take off from the pad
  DEPART_FADE: 1.2, // seconds of white fading off Terra
  COTTAGE_WALK_SPEED: 3.2, // u/s on foot. The world is human-scale, not planet-
  COTTAGE_RUN_SPEED: 6.4, // scale — WALK_SPEED (8) crosses the garden in 6 s.
  COTTAGE_BOARD_RADIUS: 13.0, // board the ship (G) within this of the pad centre
  COTTAGE_CEILING: 2.7, // interior ceiling height — caps the indoor jump

  // --- the Sky City over Saturnia (world/skycity.js, src/skyWalk.js) ---
  SKY_WALK_SPEED: 5.0, // u/s on foot: the deck is 340 across, the garden was 90
  SKY_RUN_SPEED: 11.0,
  SKY_BOARD_RADIUS: 16.0, // board the ship (G) within this of the pad centre
  SKY_FALL_SPEED: 70.0, // terminal velocity once you are off the edge
  SKY_FALL_DEATH_Y: -45.0, // this far below the deck the fall is final
  SKY_FALL_TIME: 0.9, // seconds of watching it before the white takes over
  SKY_FALL_FLASH: 0.6, // seconds of ramp to white
  SKY_FALL_FADE: 1.4, // seconds of white fading off the start
  SKY_HOVER: 190.0, // auto-land arrives this far above the pad, then descends
  WRECK_CAPTURE: 520, // the wreck of the Reach takes the helm inside 1.25x this (src/game.js DOCKS)
  WRECK_HOVER: 150, // how far above her flight deck the approach levels out
  CHARGE_FLASH: 0.45, // seconds from the arm button to full white (world/reachtube.js)
  REACH_HOVER: 120.0, // the same, over the Indigo Reach's flight deck (world/reachship.js)
  SKY_DESCEND_TIME: 3.2, // seconds for that last vertical leg
  SKY_ARC_SPEED: 700.0, // u/s used to scale the arc's duration
  SKY_REARM_MARGIN: 300.0, // climb this far past the air shell before it re-captures

  // --- stevenlacey, the coin world (world/coinworld.js) ---
  COIN_RADIUS: 600.0,
  COIN_THICKNESS: 60.0,
  COIN_DIR_X: 0.25, COIN_DIR_Y: -0.6, COIN_DIR_Z: -0.4, // bearing from the origin (normalised on use)
  COIN_DISTANCE: 45000.0,
  COIN_TUMBLE: 0.05, // rad/s end over end
  COIN_PRECESS: 0.011, // rad/s the flip axis wanders about Y
  COIN_SETTLE_TIME: 1.5, // seconds for the tumble to run down once you are captured
  COIN_SPINUP_TIME: 4.0, // seconds to get back up to speed after you leave
  COIN_WOBBLE: 0.035, // rad: the rattle as it comes to rest
  COIN_WOBBLE_TIME: 2.4, // seconds until the rattle has died
  COIN_CAPTURE: 780.0, // capture radius from the coin's centre (1.3 radii)
  COIN_REARM_MARGIN: 300.0, // fly this far past the capture radius before it re-captures
  COIN_HOVER: 260.0, // auto-land arrives this far off the face, then closes in
  COIN_ARC_TIME: 4.5, // seconds for the leg round to the hover point
  COIN_DESCEND_TIME: 3.0, // seconds for the last leg onto the face
  COIN_PAD_X: -120.0, // where the ship rests, in face coordinates (right, up)
  COIN_PAD_Y: -40.0,
  COIN_PAD_OFF: 6.0, // hull centre this far proud of the face
  COIN_LIFT_TIME: 2.0, // seconds of scripted lift-off
  COIN_LIFT_HEIGHT: 320.0, // how far off the face that carries the ship

  // --- ship interior walk (C) — owner override of GDD 1.2 ---
  // C stands you up out of the seat; the freighter holds attitude and brakes
  // to a drift while you walk it. Named INTERIOR_* to stay distinct from the
  // on-foot planet walk below (different feature, WALK_*).
  INTERIOR_SPEED: 2.2, // u/s — interior scale is metres
  INTERIOR_RUN_SPEED: 4.4, // Shift: the hall is 30 m long
  INTERIOR_BRAKE: 0.985, // per-tick velocity hold while nobody is at the helm
  INTERIOR_MOUSE_SENS: 0.0022, // rad of head-turn per pixel, in the corridor
  INTERIOR_PITCH_MAX: 1.35, // rad, look up/down clamp while walking the ship
  INTERIOR_SPIN_CALM: 0.985, // extra per-tick angular damping while out of the seat
  SEAT_RADIUS: 0.9, // sit back down within this distance of the seat
  STAND_TIME: 0.6, // seconds, seat <-> stand camera blend

  // --- the freighter's gallery hall (interior.js) — metres ---
  FREIGHTER_VEST_L: 4.0, // vestibule between flight deck and hall
  FREIGHTER_HALL_W: 10.0,
  FREIGHTER_HALL_L: 30.0, // six 5 m bays
  FREIGHTER_HALL_H: 5.0, // floor to glass roof
  FREIGHTER_LOUNGE_L: 6.0, // stern observation lounge
  // painting textures (galleryArt.js): everything resident at ART_MID_PX on
  // the long side, the native file only for the nearest ART_FULL_MAX canvases
  ART_MID_PX: 768,
  ART_FULL_MAX: 4,
  ART_NEAR: 7.0, // full resolution is requested inside this distance
  ART_FAR: 12.0, // ...and released beyond this one
  ART_VIEW_RANGE: 3.2, // "E — VIEW" this close to the wall

  // --- mining station (Foundry Anchorage) ---
  MINE_BEAM_CYCLE: 7.0, // seconds each mining beam dwells on an excavation point

  // --- on-foot planet walk (G) ---
  // Disembark the ship (G) while flying low and slow over a rocky planet and
  // explore on foot: walk, sprint (Shift), jump (Space), swim in the ocean.
  // G again to board and fly off. Kinematic walker: feet snap to the terrain
  // height terrain.js reports (the same field the surface shader displaces),
  // so you stand on the relief you saw from orbit. Speeds are human-scale
  // (the astronaut is ~1.8 units tall), tuned from the world/ demo.
  WALK_SPEED: 8.0, // on-foot ground speed, units/sec
  WALK_RUN_SPEED: 16.0, // sprint speed while Shift is held
  WALK_WADE_SPEED: 5.0, // in knee-deep water
  WALK_SWIM_SPEED: 4.5, // swimming
  WALK_ACCEL_GROUND: 42.0, // exponential approach rate toward target velocity
  WALK_ACCEL_AIR: 9.0, // ... while airborne
  WALK_ACCEL_SWIM: 10.0, // ... while swimming
  WALK_EYE_HEIGHT: 1.72, // first-person camera height above the walker's feet.
                         // The astronaut's own eye line: the helmet tops out at
                         // ~1.8 (src/astronaut.js), so the old 2.0 floated the
                         // view above the player's own head and made everyone
                         // else in the world look short. Matches WALK_TP_EYE.
  WALK_LAND_ALTITUDE: 120.0, // max altitude above the local floor to allow disembark
  WALK_LAND_SPEED: 60.0, // max ship speed (units/sec) to allow disembark
  WALK_JUMP: 10.0, // upward speed of a jump (Space), units/sec
  WALK_GRAVITY: 24.0, // felt on-foot downward accel toward planet center, units/sec^2


  // --- on-foot water (the sea sphere sits at planet radius + 1.5) ---
  WALK_WATER_LEVEL: 1.5, // sea surface height above the base sphere (planet.js water mesh)
  WALK_SWIM_DEPTH: 1.1, // water deeper than this means swim, not wade
  WALK_WADE_DEPTH: 0.22, // deeper than this slows you to wade speed
  WALK_BUOYANCY: 0.55, // swimming, the body rides this far below the surface

  // --- diving (divable worlds only — neptunia): C while swimming submerges;
  // full 3D look-directed movement, no drowning, Space floats up, breach at
  // the surface to pop back to a float ---
  WALK_DIVE_SPEED: 6.5, // underwater swim speed, units/sec
  WALK_DIVE_ACCEL: 8.0, // syrupy 3D approach rate toward the wish velocity

  // --- snowboard (B, worlds with cfg.boardable — wyattmattoe) ---
  // Gravity-fed carving: downhill pull along the terrain gradient, strong
  // side grip vs. near-free forward glide, soft speed cap ~3x sprint. Same
  // kinematic walker underneath — a stepWalk branch like diving, not a
  // separate loop.
  BOARD_MAX_SPEED: 46.0, // soft cap, units/sec (sprint is 16)
  BOARD_TUCK_CAP: 1.18, // cap multiplier while W (tuck) is held
  BOARD_PULL: 30.0, // downhill accel per unit slope, x walkGravityScale
  BOARD_SLOPE_MAX: 1.4, // gradient magnitude clamp fed into BOARD_PULL
  BOARD_GRIP: 6.0, // /s decay of sideways (across-board) velocity
  BOARD_GLIDE_DRAG: 0.06, // /s decay of forward velocity — long flat glides
  BOARD_BRAKE_DRAG: 2.2, // extra /s forward decay while S (skid brake) held
  BOARD_ICE_SCALE: 0.35, // grip AND drag multiplier on frozen-lake ice
  BOARD_CARVE_RATE: 2.2, // rad/s heading yaw from A/D while grounded
  BOARD_CARVE_AIR: 0.9, // rad/s A/D yaw while airborne (style, weak)
  BOARD_JUMP: 11.0, // Space ollie, added on top of any terrain launch
  BOARD_SNAP: 1.6, // tight ground-follow (walk's 8.0 would glue crests)
  BOARD_LAUNCH_SPEED: 12.0, // below this ride speed, bumps never launch you
  BOARD_SKATE_SPEED: 7.0, // W hop-skate target speed on flat/uphill ground
  BOARD_SKATE_ACCEL: 10.0, // units/sec^2 of the skate push
  BOARD_IDLE_EXIT: 1.2, // secs at ~standstill on the ground -> auto unclip
  BOARD_PROBE: 2.5, // tangent offset (units) for slope central differences
  BOARD_LEAN: 0.55, // max astronaut body roll (radians) into a full carve
  BOARD_FOV_KICK: 12.0, // extra third-person FOV at full board speed
  BOARD_CAM_PULL: 0.45, // fractional extra TP cam distance at full speed

  // --- quest vehicles (src/inventory.js; deployed via the selector, I) ---
  // Motorcycle: the snowboard's carve/ballistics chassis with an engine —
  // powered on any terrain, harder grip, real brakes.
  MOTO_MAX_SPEED: 34.0, // engine-limited top speed (board coasts to 46 downhill)
  MOTO_THROTTLE: 15.0, // units/sec^2 while W is held
  MOTO_PULL: 20.0, // downhill pull per unit slope (weaker than the board's 30)
  MOTO_GRIP: 9.0, // /s sideways decay — tires bite harder than an edge
  MOTO_ROLL_DRAG: 0.4, // /s forward decay off-throttle
  MOTO_BRAKE_DRAG: 3.4, // extra /s decay while S is held
  MOTO_CARVE_RATE: 2.0, // rad/s steering yaw while grounded
  MOTO_CARVE_AIR: 0.6, // rad/s mid-air attitude yaw
  MOTO_JUMP: 7.0, // Space hop — a bike is no ollie machine
  MOTO_LAUNCH_SPEED: 14.0, // below this, crests never launch the bike
  // Jetpack: hold Space to thrust. Tuned so the penthouse (~46 u) is an easy
  // climb from the street but the fuel runs dry long before orbit; the hard
  // ceiling backstops it.
  JET_THRUST: 26.0, // upward accel while thrusting, units/sec^2
  JET_MAX_UP: 13.0, // vertical speed cap under thrust
  JET_FUEL_SECS: 7.0, // full tank of continuous thrust
  JET_REGEN_SECS: 5.0, // grounded seconds to refill from empty
  JET_CEILING: 90.0, // max height above local ground — thrust cuts out
  JET_AIR_ACCEL: 10.0, // horizontal air control while the pack is worn
  // Hang glider: opens the moment you're airborne. Sink replaces free fall;
  // W dives for speed, S flares to bleed it, A/D banks the canopy. Flying
  // slow mushes — the sink deepens as airspeed decays toward the stall.
  GLIDE_SINK: 1.7, // trim sink rate, units/sec
  GLIDE_DIVE_SINK: 7.5, // sink while diving (W)
  GLIDE_FLARE_SINK: 0.7, // sink while flaring (S)
  GLIDE_TRIM_SPEED: 15.0, // hands-off airspeed
  GLIDE_FAST: 28.0, // airspeed a full dive builds toward
  GLIDE_MIN_SPEED: 8.0, // a long flare bleeds down to this
  GLIDE_STALL_SPEED: 8.0, // below this the canopy mushes (extra sink)
  GLIDE_TURN: 1.6, // rad/s bank steering
  GLIDE_GRIP: 2.6, // /s sideways-velocity decay — the canopy tracks its nose
  // Ultralight plane: taxi with W, rotate past takeoff speed, then the
  // camera pitch flies it — look up to climb, down to dive. Energy-coupled:
  // climbing costs airspeed, diving builds it.
  PLANE_TAKEOFF_SPEED: 15.0, // ground speed needed to rotate
  PLANE_ROTATE_SPEED: 19.0, // taxi speed the throttle builds toward
  PLANE_CLIMB_INIT: 6.0, // vertical speed handed over at rotation
  PLANE_MAX_SPEED: 36.0, // full-throttle airspeed
  PLANE_TRIM_SPEED: 18.0, // idle-throttle airspeed (powered glide)
  PLANE_MAX_CLIMB: 10.0, // vertical speed cap, climbing
  PLANE_MAX_SINK: 14.0, // vertical speed cap, diving
  PLANE_STALL_SPEED: 10.0, // below this the nose drops whatever you do
  PLANE_TURN: 1.2, // rad/s bank steering
  PLANE_CEILING: 170.0, // max height above local ground — it's no spaceship

  // --- quest waypoint beacon (src/walk.js spawnBeacon) ---
  // The governor's wonder tour points you at wonders 340-850 surface units from
  // town. The old 30-unit column could not work at that range for a reason that
  // is not brightness: on a ~900-unit planet, with the eye at WALK_EYE_HEIGHT,
  // mutual visibility over the curve needs
  //   sqrt(2*R*eye) + sqrt(2*R*h) >= dist
  // so reaching the far wonder at 850 takes h >= ~346. A 30-unit column was
  // literally BELOW THE HORIZON from the plaza. Hence a shaft, not a post.
  BEACON_HEIGHT: 400.0, // clears the horizon from anywhere in town, with margin
  BEACON_BASE_R: 8.0, // shaft radius at the ground. Sized off what you actually
                      // SEE from town: the base is behind the rooftops, so the
                      // read comes from the upper shaft, and the taper below is
                      // what has to stay wide enough to be a line and not a
                      // hairline at 850 u (~6 px, vs ~2 px at the first guess).
  BEACON_TOP_R: 4.0, // ... tapering as it climbs
  BEACON_OPACITY: 0.62, // translucent enough to see the wonder through it
  BEACON_PULSE: 0.18, // +/- opacity swing of the slow pulse
  BEACON_PULSE_RATE: 3.0, // rad/sec
  BEACON_RING_R: 6.0, // ground ring at the base — the "stand here" mark you
                      // need at close range, when the shaft is overhead
  BEACON_TOUR_REACH: 48.0, // wonders carry solid central colliders (the Diamond
                           // Veil's pool is ~43 u), so "standing under it"
                           // has to complete from the plaza edge, not the centre
  BEACON_RETURN_REACH: 6.0, // the tower door is a door

  // --- on-foot third-person camera ---
  WALK_CAM_DIST: 7.6, // default orbit distance behind the astronaut
  WALK_CAM_MIN: 4.5, // scroll-wheel zoom clamp
  WALK_CAM_MAX: 13.0,
  WALK_CAM_WALL_MIN: 1.6, // closest the boom may pull in when a wall blocks it
  WALK_TP_EYE: 1.72, // orbit target height above the feet
  WALK_TP_SWIM_EYE: 1.15, // ... lowered while swimming

  // --- on-foot surface dressing (grass/trees/shrubs/rocks patch budgets) ---
  DRESS_RADIUS: 260.0, // dressing patch radius around the landing point
  DRESS_GRASS: 24000, // instanced grass blades
  DRESS_TREES: 150, // per tree variant (x3)
  DRESS_SHRUBS: 260,
  DRESS_ROCKS: 80, // per rock variant (x3)

  // --- on-foot world entities (parked ship, city, wonders, creatures) ---
  WALK_BOARD_RADIUS: 26.0, // must be this close to the parked ship to take off (G)
  PARK_OFFSET: 20.0, // parked ship sits this far behind the disembark point
  PARK_LIFT: 3.9, // ship-origin height above ground so the gear pads touch
  CITY_RADIUS: 150.0, // default city footprint radius (createCity opts.radius)
  // Permanent cities (world/cityRegistry.js): a landing within this surface
  // distance of a registry site adopts that city; farther out is a
  // wilderness landing (dressing + creatures only, no city).
  CITY_ATTACH_RANGE: 600.0,
  // Pad-targeted auto-land: arc time grows with great-circle distance to the
  // chosen pad at this cruise rate, capped so a far-side approach still
  // lands promptly.
  AUTOLAND_CRUISE: 400.0, // surface units/sec used to scale the arc duration
  AUTOLAND_MAX_TIME: 12.0, // longest assisted arc, seconds

  // --- altitude floor (GDD 5.1) ---
  // Strictly a Phase 5 mechanic, pulled forward on request so the test mass
  // reads as a planet you skim rather than one you fly through. Thickening
  // drag only — never a collision, never a hard stop, and no outward push
  // (a spring bounces; GDD 3.2). Applies to any gravity body given a radius.
  ATMOS_TOP: 250.0, // altitude above the surface where the air starts (drag begins)
  MIN_ALTITUDE: 40.0, // the floor: you skim this low but can't land (drag holds you)
  FLOOR_DRAG_POWER: 2.5, // how sharply drag ramps from ATMOS_TOP down to the floor
  FLOOR_DRAG_MAX: 0.06, // speed bled per tick at the floor (air thickening)

  // --- landing (NMS-style, all terra planets) ---
  // Slow flight lowers the effective altitude floor from MIN_ALTITUDE down to
  // TOUCHDOWN_CLEARANCE, so a gentle approach settles the ship onto the
  // ground (or the sea). Arrive sinking faster than TOUCHDOWN_MAX_SINK and
  // the air cushion bounces you instead — never a crash. G at low altitude
  // flies an assisted auto-land arc to the flattest nearby spot.
  LAND_REGIME_SPEED: 80.0, // below this speed the floor ramps down for touchdown
  TOUCHDOWN_CLEARANCE: 3.0, // resting skids height above the local ground
  TOUCHDOWN_MAX_SINK: 12.0, // radial sink faster than this bounces, not lands
  LAND_BOUNCE: 0.35, // fraction of radial speed reflected on a hard arrival
  AUTOLAND_TIME: 3.5, // seconds for the assisted G auto-land arc
  AUTOLAND_ALTITUDE: 300.0, // max altitude above the floor to start auto-land
  AUTOLAND_SPEED: 200.0, // max ship speed to start auto-land
  TAKEOFF_KICK: 8.0, // upward velocity handed back on liftoff from a landing
  // Tenretni: the governor's secret (src/tenretni.js). The patio viewpoint
  // off terra, the sizes of what arrives there, and the length of the event.
  TENRETNI_DURATION: 90.0, // seconds, wormhole opening to the sphere leaving
  TENRETNI_VIEW_DIST: 2600.0, // viewpoint distance from terra's centre
  TENRETNI_HALF_ANGLE: 0.7, // rad: sun this far left, terra this far right of the aft view
  TENRETNI_GLIDE_TIME: 5.0, // seconds the ship takes to settle at the viewpoint
  TENRETNI_WORM_DIST: 6500.0, // wormhole distance out along the aft view
  TENRETNI_WORM_RADIUS: 3400.0,
  TENRETNI_WORM_REST: 0.55, // wormhole scale once the sphere has gone
  TENRETNI_SPHERE_DIST: 4600.0, // where the sphere parks
  TENRETNI_SPHERE_RADIUS: 900.0,
  TENRETNI_TUNNEL_RADIUS: 190.0,
  TENRETNI_CITY_SPAN: 0.3, // rad: angular radius of the city on terra
  TENRETNI_QUICK_WAIT: 10.0, // seconds the worldship idles before each of the three quick worlds
  TENRETNI_SIEGE_WAIT: 240.0, // ...and before each of the last three planets
  TENRETNI_STRIKE_BIAS: 0.55, // 0 strikes terra facing the sphere, 1 facing the patio
  TENRETNI_HDR: 1.5, // emissive scale of the lights, beams and swarm
  // --- the far side: the Tenretni megaworld (src/farside.js, GDD 5.7.3) ---
  // Through the wormhole. The world is too big to be a sphere here: it is a
  // plane in the game's absolute frame, the arrival point is absolute (0,0,0),
  // and FAR_RADIUS only bends the horizon and sets the pull.
  FAR_ARRIVE_ALT: 2800.0, // the surface is absolute y = -this
  FAR_RADIUS: 8.0e6, // nominal radius: the horizon's dip, and the gravity body
  FAR_SURFACE_G: 14.0, // pull at any height (planets are ~30 at the ground: at that an idle pilot is on the roofs in seconds)
  FAR_CANOPY: 760.0, // the altitude floor rides this far above the plane: over the tallest tower
  FAR_CEIL_SOFT: 22000.0, // climbing eases off from here...
  FAR_CEIL: 30000.0, // ...and stops here, so the horizon stays inside the disc and the far plane
  FAR_DISC_RADIUS: 900000.0, // the ground mesh, under the 1e6 far plane
  FAR_TILE: 24576.0, // the towers wrap round the camera on a tile this wide (96 blocks)
  FAR_BLOCK: 256.0, // a city block (the ground shader and the tower grid share it)
  FAR_PLATE: 32.0, // hull plating, the finest pattern
  FAR_DISTRICT: 2048.0, // the big panels the blocks sit in
  FAR_TOWER_MIN: 110.0,
  FAR_TOWER_MAX: 700.0,
  FAR_CAGE_SPACING: 40000.0, // the caged stars' lattice
  FAR_CAGE_STAR_R: 2200.0,
  FAR_CAGE_RING_R: 3600.0, // the ring frames round a star
  FAR_CAGE_TUBE: 300.0,
  FAR_CAGE_HEIGHT: 7000.0, // star centre above the plane
  FAR_CAGE_PAD: 5200.0, // radius of the cleared plate a cage stands on
  FAR_CAGE_FULL: 4, // cages built in full at once...
  FAR_CAGE_LOD: 45000.0, // ...inside this range; beyond it a star is one point
  FAR_CAGE_POINTS: 256,
  FAR_CAGE_REACH: 8, // lattice cells out from the camera that are drawn at all
  FAR_STAR_HDR: 1.25,
  FAR_HAZE: 0x0b0e12,
  FAR_EXIT_SPEED: 300.0, // out of the mouth, units/sec
  FAR_ARRIVE_DX: 9000.0, // the first caged star is this far to port...
  FAR_ARRIVE_DZ: 24000.0, // ...and this far ahead of the arrival point
  FAR_WHITE_IN: 0.5, // seconds the white takes to cover the swap
  FAR_WHITE_OUT: 2.4, // ...and to clear on the far side
  FAR_FADE_IN: 1.5, // the megaworld fading up on a load or a world reset
  FAR_WORM_BACK: 2600.0, // the mouth, behind the arrival point
  FAR_WORM_CLOSE: 6.0, // seconds it takes to close
  // The black hole over the megaworld (world/farhole.js): the thing it is there
  // to mine. A sky object: a fixed direction, no parallax.
  FAR_HOLE_ELEV: 0.47, // rad above the horizon...
  FAR_HOLE_AZ: 0.2, // ...and to starboard of the arrival heading
  FAR_HOLE_SIZE: 0.18, // angular radius of the shadow, rad
  FAR_HOLE_DISC: 5.0, // the disc's outer edge, in shadow radii
  FAR_HOLE_TILT: 1.3, // the disc's inclination from face-on, rad (near edge-on)
  FAR_HOLE_ROLL: 0.24, // ...and how far it is canted from level, rad (port side low)
  FAR_HOLE_HDR: 1.0, // emissive scale of the disc
  FAR_HOLE_DIST: 500000.0, // where it is drawn (its quad's corners must stay inside the far plane)
  // The megastructures: kilometre-scale spires on a wide tile, for a skyline.
  FAR_SPIRE_TILE: 131072.0, // (they stand out to ~60 km: the skyline)
  FAR_BLOCK_TILE: 98304.0, // the distant city's blocks, out to ~45 km (world/megaworld.js)
  FAR_SPIRE_MAX: 2600.0,
  // The landing (world/farlanding.js): the one place the pilot can put down.
  FAR_LAND_OUT: 6400.0, // from the first caged star, toward the arrival point
  FAR_LAND_ALT: 1200.0, // pad above the plane: clear of the canopy floor and its drag
  FAR_LAND_CAPTURE: 640.0, // the dock's stand-in radius (captures at 1.25 of this)
  // The leash (src/farside.js leash()): the first time through, the pilot may
  // fly round the landing's caged star, up to FAR_LEASH x the cage's height and
  // out to FAR_LEASH x its plate's radius, before the Landing's beam brings
  // the ship down.
  FAR_LEASH: 1.5,
  FAR_LEASH_SLACK: 2000.0, // on the way in from the wormhole: how far back from the nearest yet the pilot may turn
  FAR_LEASH_GRACE: 4.0, // seconds past the bound (warned) before the beam pulls
  FAR_EXPLORE_TIME: 240.0, // ...and however it goes, it pulls this long after arriving
  FAR_AUTOLAND_TIME: 24.0, // ...and the longest that approach may take: it is a long way off
  FAR_LAND_HOLD: 1400.0, // inside this the fleet goes to its station overhead
  FAR_LAND_RING_R: 3200.0, // the station ring...
  FAR_LAND_RING_H: 2600.0, // ...and its height over the pad
  // The door (src/game.js): the white between the landing and the City of Light.
  FAR_DOOR_FLASH: 0.45, // seconds to full white
  FAR_DOOR_FADE: 1.3, // ...and to clear
  // --- the megaworld chapter (src/chapter.js, GDD 5.7.4) ---
  CH_FRAGMENTS_NEEDED: 5, // worlds a fragment must be taken from before the dive
  CH_ASSIGN_AFTER: 3, // holo rooms walked into before the shuttle is spoken of
  // The pilot's home, turning outside the suite (world/lightpavilion.js).
  CH_HOME_R: 17.0, // the hologram's radius
  CH_HOME_OUT: 30.0, // its centre, this far beyond the glass
  CH_HOME_UP: 4.6, // ...and this far above the suite's floor
  CH_HOME_SPIN: 0.045, // rad/sec
  CH_DIVE_RATE: 525600.0, // megaworld seconds per ship second at the horizon: a year a minute (world/divebridge.js)
  CH_DIVE_DEEPER: 60.0, // ...and this many times faster again by the end of the flood, so the dive costs years
  CH_SHUTTLE_SLOW: 0.1, // at the bottom of the tether the shuttle's clock runs this fast against the ship's
  CH_YEARS_GONE: 1024, // what the megaworld's clock reads against the ship's by the time the pilot wakes
  CH_DREAM_TIME: 50.0, // seconds the dream lasts (world/shuttle.js)
  CH_DEMO_BACK: 25.0, // seconds into the hangar demo that the ship is home again (world/lightdemo.js)
  CH_HOME_DONE: 0.93, // how much of it the archive has drawn: all but the end
  // --- Entry Zero (src/chapter.js, GDD 5.7.5) ---
  EZ_YEARS_GONE: 1048576, // 2^20: what the surface's clock reads when the crew come back up (CH_YEARS_GONE is 2^10)
  EZ_SHIP_YEARS: 1024, // ...and the light ship's own, out to the hole and back
  // The submersible (world/submersible.js): weightless, in water or in the dark between.
  EZ_SUB_THRUST: 62.0, // u/s^2 on any axis
  EZ_SUB_DRAG: 0.95, // 1/s: it comes to rest by itself (top speed is thrust / drag)
  EZ_SUB_TURN: 6.0, // how hard the mouse leans on it: rad/s of turn per radian of mouse travel
  EZ_SUB_TURN_DAMP: 3.7, // 1/s (the flight ship's 0.94 a tick)
  EZ_SUB_PITCH: 1.35, // rad: as far up or down as the nose goes
  // The lamp (src/lamp.js).
  EZ_LAMP_CONE: 0.34, // rad, half angle of the beam
  EZ_LAMP_DRAIN: 1 / 240, // of a full charge per second, lit on one band
  EZ_LAMP_ALL: 4.0, // ...times this on every band at once
  EZ_LAMP_RECHARGE: 1 / 75, // per second with the lamp off
  EZ_LAMP_EATEN: 5.0, // extra drain, times this, with a light eater at the glass
  EZ_DOSE_RATE: 1 / 90, // of a full dose per second on the X-ray band
  EZ_LOOK_TIME: 0.8, // seconds something must be held in a band before it is logged
  // The well (world/submersible.js): the shaft under the city, where the lamp is tried.
  EZ_WELL_R: 620.0, // its radius
  EZ_WELL_UP: 150.0, // the ring back up to the city, above the start
  EZ_WELL_DOWN: 700.0, // the membrane below it
  EZ_WELL_RING: 62.0, // the ring's radius
  EZ_WELL_GATE: 110.0, // the hole the membrane opens, once the lamp has been tried
  // The hollow (world/hollow.js): the way down, a zone at a time.
  EZ_ZONE1_LEN: 5200.0, // entry node to exit node: the outer oceans
  EZ_ZONE2_LEN: 6200.0, // ...and the creature zone
  EZ_ZONE3_LEN: 2800.0, // ...and the firewall's: the wall is across the middle of it
  EZ_ZONE4_LEN: 5600.0, // ...and the oldest strata, under it
  EZ_ZONE_WIDE: 2600.0, // how far off the lattice the vessel may wander
  EZ_SUB_DRAG_WATER: 1.7, // 1/s inside an ocean globe (EZ_SUB_DRAG is the dark between)
  EZ_NODE_R: 46.0, // inside this a lattice node takes the vessel, or recharges it
  EZ_NODE_CHARGE: 1 / 6, // of a full lamp per second at a node
  EZ_RIDE_TIME: 5.5, // seconds a pulse along the lattice lasts (light would take 8 min 19 s to the centre)
  // Light eaters: drawn to the lamp on any band but the one they cannot digest.
  EZ_EATER_SEES: 1100.0, // how far off a lit lamp draws them
  EZ_EATER_SPEED: 52.0, // u/s: a little slower than the vessel flat out
  EZ_EATER_DRINK: 85.0, // inside this of the beam's root they are drinking it
  EZ_EATER_FULL: 4, // this many drinking is the worst it gets
  // Heat leeches: seen only in infrared, after the cabin's warmth.
  EZ_LEECH_SEES: 1300.0,
  EZ_LEECH_SPEED: 40.0,
  EZ_LEECH_SHAKE: 47.0, // u/s: faster than this and they cannot hold on
  EZ_CABIN_DRAIN: 1 / 55, // of the cabin's warmth per second, per leech on the hull
  EZ_CABIN_WARM: 1 / 90, // ...and how fast it comes back with none
  // Radiation feeders: asleep until the X-ray band is used near them.
  EZ_FEEDER_SEES: 900.0,
  EZ_FEEDER_SPEED: 46.0,
  EZ_FEEDER_SLEEP: 6.0, // seconds without X-rays before they settle again
  EZ_FEEDER_DOSE: 3.0, // extra dose, times this, with them at the glass
  // The firewall (world/hollow.js, zone 3).
  EZ_WALL_STAND: 55.0, // as near as the vessel can get to the fire
  EZ_BURN_TIME: 7.0, // seconds of the key band held on one place to open it
  EZ_BURN_HEAL: 4.0, // ...and to close again when the lamp comes off
  EZ_HOLE_R: 95.0, // how wide the hole gets
  // The oldest strata (world/hollow.js, zone 4).
  EZ_PULL_MAX: 7.0, // u/s^2 toward the centre at the bottom of the zone: weight, coming back
  EZ_SLABS: 34, // pieces of the first worlds adrift there
  // The one on the radio band that comes closer. It hears the drive.
  EZ_CALLER_SPEED: 34.0, // u/s: about half the vessel flat out
  EZ_CALLER_HEARS: 0.15, // how hard the drive must be pushed (0..1) for it to hear
  EZ_CALLER_REACH: 170.0, // inside this it has the vessel
  EZ_CALLER_HOLD: 2.5, // ...and after this many seconds there, it has the lamp
  EZ_CALLER_LOSES: 5.0, // seconds of a silent drive before it stops coming
  // The centre (world/zeroplanet.js): the first world.
  EZ_PLANET_R: 800.0, // its radius
  EZ_PLANET_DOWN: 2400.0, // its centre, this far under where the vessel arrives
  EZ_CENTRE_PULL: 7.0, // u/s^2 toward it
  EZ_HOVER_MIN: 30.0, // as low over the ground as the hull goes
  EZ_HOVER_HOLD: 4.0, // seconds held over solid ground before the hatch can be opened
  EZ_SOLID_IN: 3.0, // seconds of every band at once for the ground to come solid
  EZ_SOLID_OUT: 2.0, // ...and to go again without it
  // On the ground (world/zeroground.js): the pool of it the vessel's light holds solid.
  EZ_POOL_R: 90.0, // how wide the pool is with a full lamp overhead
  EZ_POOL_MIN: 9.0, // ...and with none: under the hatch, and no more
  EZ_POOL_TIME: 170.0, // seconds a full lamp lasts overhead, before whoever stayed and the eaters are counted
  EZ_POOL_EATERS: 120.0, // every this many seconds the eaters double what the lamp is losing
  EZ_HAND_POWER: 0.4, // the lamp carried by hand reaches this much of what the vessel's does
  EZ_RELIC_NEAR: 16.0, // as near as a relic has to be for the lamp to read it
  EZ_CREW_SPEED: 6.5, // u/s the captains walk at: a pilot who runs leaves them behind
  // The reveal (world/zeroplanet.js): the first world as it was, shown once.
  EZ_REVEAL_HOLD: 2.0, // seconds every band is held on it, with the story whole, to begin
  EZ_REVEAL_TIME: 36.0, // how long it lasts
  EZ_REVEAL_RISE: 1.7, // how high the vessel is carried over it, in radii
  // The ascent (world/submersible.js): back up, and what the surface has become.
  EZ_RISE_AT: 1560.0, // this far over the first world, climbing, the way up begins
  EZ_ASCENT_BURN: 3.0, // seconds of every band on the underside of the firewall: it opens for them
  EZ_EMERGE_TIME: 36.0, // how long the emergence lasts
  // A million years on (src/era.js, src/farside.js).
  EZ_RITE_FIRST: 25.0, // seconds of flight over the old megaworld before the rite is first seen
  EZ_RITE_EVERY: 260.0, // ...and between one showing of it and the next
  EZ_RITE_TIME: 46.0, // how long the cages stay lit
  // The launch (world/launch.js): the light ship, out from the megaworld and into the hole.
  EZ_LAUNCH_TIME: 74.0, // how long it lasts
  EZ_LAUNCH_CROSS: 56.0, // seconds in, the horizon is crossed
  // --- the light ship as a home base (src/homebase.js, src/voyage.js, GDD 5.7.8) ---
  BASE_CAPTURE: 560.0, // the bay's beam takes the helm inside this (times ATMO_SHELL), measured from the middle of the hull
  BASE_BAY_STANDOFF: 430.0, // how far astern of the pad the run-in begins, and how far ahead of it a launch lets go
  BASE_BAY_RUN: 5.0, // seconds from the standoff in to the pad
  BASE_BAY_LIFT: 3.6, // seconds from the pad out through the forward mouth
  BASE_BAY_HW: 30.0, // the bay deck: half its width
  BASE_BAY_HL: 84.0, // ...and half its length
  BASE_BAY_ROOF: 34.0, // the underside of the hull over it
  BASE_STAR_DIST: 240000.0, // how far off a system's star is drawn
  BASE_TRAVEL_TIME: 9.0, // seconds a passage between systems is watched for, from the bridge
  BASE_DOCK_HOVER: 150.0, // a system's outpost: how high over its pad the descent begins
  BASE_FOLLOW_SPEED: 6.0, // a captain keeping up, on foot (u/s)
  BASE_FOLLOW_GAP: 2.6, // ...and how far off the pilot's shoulder they walk
  BASE_GUEST_TALK: 1.9, // how near a captain riding in the freighter is talked to (m)
};

// How far each band of the lamp reaches, in units, by what it is shining
// through (BANDS order: blue-green, ultraviolet, infrared, H-alpha, X-ray,
// radio). Water passes blue-green best and swallows infrared within metres;
// vacuum and thin mist pass everything, and dust scatters the short
// wavelengths first, so out there the infrared goes furthest. Radio is not
// seen at all: it is heard, from a long way off (world/entryzero-audio.js).
export const EZ_REACH = {
  water: [900, 280, 70, 520, 420, 4000],
  void: [650, 480, 1500, 950, 700, 4000],
  // The mist over the first world: every band is short here, infrared shortest.
  // Every band at once reaches only as far as the shortest, which sets how low
  // the vessel has to hover.
  fog: [300, 180, 100, 260, 220, 4000],
};

// What lights the megaworld a million years on (src/era.js). Not decided:
// 'sun' is one kept, uncaged star the world goes round; 'hole' the black
// hole's disc; 'none' only what the world gives off itself.
export const EZ_LIGHT = 'sun';
// Whether the Tenretni made a ring of young planets from the shell's strata
// (world/launch.js). Not decided: off, they rest.
export const EZ_NEW_WORLDS = true;

// The example system (world/example-system.js): whether its planet is built.
// It is the one piece of the home base that makes a world after boot
// (src/planet.js buildPlanet); off, the system is its outpost alone.
export const BASE_EXAMPLE_PLANET = true;

// --- quality tiers (src/quality.js) ---
// Kept out of C on purpose: tuning.js binds C to the dev panel, and these are
// per-tier switches, not live dials. MEDIUM is the 60 fps Intel Iris Xe target
// (GDD 2.1) — the tier every budget is measured against. LOW sheds the fixed
// costs a phone or software rasteriser cannot pay; HIGH and ULTRA spend the
// headroom a discrete GPU has. `minScale` is how far the frame governor may
// drop the internal render resolution before auto mode gives up a whole tier.
// What the megaworld chapter spends per tier (GDD 5.7.4). people: the city's
// descendants; rigNear: inside this range a person is a jointed figure, beyond
// it one instance of a shared capsule (0: always the capsule); flood: worlds
// that come round the bridge in the archive flood; dream: bodies in the dream;
// lanterns: lights adrift over the city's walks; birds: the flock at the monument;
// rivals: other worlds on the grid in a race; wake: lights in each world's
// lingering wake; crowd: people at the rails while a race is on. Entry Zero
// (GDD 5.7.5): motes: specks adrift round the submersible, which the beam shows in;
// shards: ice adrift between the ocean globes; school: bodies in each group of
// creatures; eaters / leeches / feeders: how many of each are after the vessel in a zone.
export const CH_TIER = {
  low: { people: 8, rigNear: 0, flood: 3, dream: 3, lanterns: 80, birds: 40, rivals: 3, wake: 50, crowd: 60, motes: 500, shards: 150, school: 12, eaters: 6, leeches: 3, feeders: 3 },
  medium: { people: 14, rigNear: 38, flood: 6, dream: 6, lanterns: 220, birds: 110, rivals: 5, wake: 100, crowd: 150, motes: 1400, shards: 400, school: 24, eaters: 10, leeches: 4, feeders: 5 },
  high: { people: 19, rigNear: 60, flood: 6, dream: 6, lanterns: 360, birds: 180, rivals: 5, wake: 130, crowd: 240, motes: 2200, shards: 700, school: 36, eaters: 14, leeches: 5, feeders: 6 },
  ultra: { people: 19, rigNear: 90, flood: 6, dream: 6, lanterns: 480, birds: 240, rivals: 6, wake: 160, crowd: 320, motes: 3000, shards: 1000, school: 48, eaters: 18, leeches: 6, feeders: 8 },
};

export const TIERS = {
  low: { pixelRatio: 1.0, bloom: false, aa: 'none', minScale: 0.6 },
  medium: { pixelRatio: 1.5, bloom: true, aa: 'fxaa', minScale: 0.7 },
  high: { pixelRatio: 2.0, bloom: true, aa: 'smaa', minScale: 0.7 },
  ultra: { pixelRatio: 2.0, bloom: true, aa: 'smaa', minScale: 0.85 },
};
export const TIER_ORDER = ['low', 'medium', 'high', 'ultra'];

// Frame governor: holds the frame rate by stepping the composer's internal
// resolution through SCALES, one step per decision window.
export const GOVERNOR = {
  SCALES: [1.0, 0.85, 0.7, 0.6],
  WINDOW: 60, // frames averaged per decision
  SLOW: 1 / 50, // mean frame time above this steps the scale down
  FAST: 1 / 57, // mean frame time below this counts toward stepping back up
  UP_WINDOWS: 5, // consecutive fast windows before a step up
  UP_WINDOWS_MAX: 60, // back-off ceiling after a step up that did not hold
  RELAPSE_WINDOWS: 3, // a step down this soon after a step up doubles the wait
  TIER_DROP_WINDOWS: 2, // slow windows at minScale before auto drops a tier
  IGNORE_ABOVE: 0.5, // seconds; a frame this long is a stall, not a sample
};
