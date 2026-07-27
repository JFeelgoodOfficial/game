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
  BOOST_MULTIPLIER: 7.0, // doubled at the user's request — boost is twice as fast
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
  LOOK_UP_ANGLE: 1.15, // rad (~66°): head pitch at full hold-V overhead glance
  LOOK_UP_EASE: 0.1, // per-frame ease toward/away from the look-up pose
  BOOST_FOV: 13.0, // extra FOV on boost: widens to reveal the cockpit while first-person

  // --- 3D cockpit (cockpit3d.js) + its camera zoom states (camera.js) ---
  // The camera leans forward in the seat by these ship-local offsets: a small
  // nudge on W (dashboard stays visible), a full push past the console on
  // boost/warp (full-window view). World units.
  COCKPIT_SCALE: 0.5, // rig scale from prototype units to world units
  COCKPIT_FWD_Z: -0.14, // forward lean while holding W
  COCKPIT_FULL_Y: 0.06, // rise over the wheel at full-window zoom
  COCKPIT_FULL_Z: -1.25, // forward push past the console at full-window zoom
  WHEEL_DRAG_GAIN: 2.0, // touch-drag on the wheel -> mouse-equivalent steer travel

  // --- warp (user mechanic): hold F for boost x100, release to stop dead ---
  WARP_SPEED: 10000.0, // units/sec at full warp (~Saturn in a few seconds)
  WARP_RAMP: 0.08, // per-tick slew toward warp speed
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

  // --- ship interior walk (C) — owner override of GDD 1.2 ---
  // C stands you up out of the seat; the ship coasts on attitude hold while
  // you walk the corridor. Movement is clamped to the interior's two rooms —
  // simple range clamps, not a collision system. Named INTERIOR_* to stay
  // distinct from the on-foot planet walk below (different feature, WALK_*).
  INTERIOR_SPEED: 1.7, // u/s — interior scale is roughly metres
  INTERIOR_MOUSE_SENS: 0.0022, // rad of head-turn per pixel, in the corridor
  INTERIOR_PITCH_MAX: 1.35, // rad, look up/down clamp while walking the ship
  INTERIOR_SPIN_CALM: 0.985, // extra per-tick angular damping while out of the seat
  SEAT_RADIUS: 0.9, // sit back down within this distance of the seat
  STAND_TIME: 0.6, // seconds, seat <-> stand camera blend

  // --- mining station (Foundry Anchorage) ---
  MINE_BEAM_CYCLE: 7.0, // seconds each mining beam dwells on an excavation point

  // --- on-foot planet walk (G) ---
  // Disembark the ship (G) while flying low and slow over a rocky planet and
  // explore on foot: walk, sprint (Shift), jump (Space), swim in the ocean.
  // G again to board and fly off. Kinematic walker: feet snap to the terrain
  // height terrain.js reports (the same field the surface shader displaces),
  // so you stand on the relief you saw from orbit. Speeds are human-scale
  // (the astronaut is ~1.9 units tall), tuned from the world/ demo.
  WALK_SPEED: 8.0, // on-foot ground speed, units/sec
  WALK_RUN_SPEED: 16.0, // sprint speed while Shift is held
  WALK_WADE_SPEED: 5.0, // in knee-deep water
  WALK_SWIM_SPEED: 4.5, // swimming
  WALK_ACCEL_GROUND: 42.0, // exponential approach rate toward target velocity
  WALK_ACCEL_AIR: 9.0, // ... while airborne
  WALK_ACCEL_SWIM: 10.0, // ... while swimming
  WALK_EYE_HEIGHT: 2.0, // first-person camera height above the walker's feet
  WALK_LAND_ALTITUDE: 120.0, // max altitude above the local floor to allow disembark
  WALK_LAND_SPEED: 60.0, // max ship speed (units/sec) to allow disembark
  WALK_JUMP: 10.0, // upward speed of a jump (Space), units/sec
  WALK_GRAVITY: 24.0, // felt on-foot downward accel toward planet center, units/sec^2

  // --- station docking + interior walk (Orbital Art Gallery) ---
  // G near the gallery's berth docks the ship; inside, the same walk controls
  // run in the station's flat local frame under gentle artificial gravity.
  // G at the airlock (or the parked ship) undocks.
  STATION_DOCK_RANGE: 300.0, // G — DOCK allowed within this of the station (measured to the nearest of its spine/tower anchors, so flying anywhere near it works)
  STATION_GRAVITY_SCALE: 0.3, // low-g inside the station (x WALK_GRAVITY)
  STATION_AIRLOCK_RADIUS: 4.0, // G — UNDOCK within this of the airlock pad
  STATION_UNDOCK_OFFSET: 60.0, // ship reappears this far off the spine
  STATION_UNDOCK_SPEED: 6.0, // gentle drift away from the station on undock
  STATION_GROUND_SNAP: 2.0, // interior step-down snap (planet's 8.0 is too coarse)
  STATION_LIFT_SPEED: 9.0, // antigrav pad: steady rise up the atrium shaft, u/s
  STATION_LIFT_EXIT_CAP: 5.0, // soft-cap residual vUp when stepping off the column

  // --- gallery atmosphere fx (shaders/particles; drive uTime once per frame,
  // zero per-frame allocation — see galleryFx in stations.js) ---
  GALLERY_DUST: 220, // floating light motes in the atrium (one Points draw)
  GALLERY_DUST_RISE: 0.02, // fraction of the shaft the motes drift up per second
  GALLERY_BEAM_SPEED: 2.6, // upward scroll rate of the antigrav beam's energy bands

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

  // --- handheld terrain manipulator (terra only — cfg.terraform) ---
  // Brush radius sits well above terra's ~16 u vertex spacing so every stamp
  // moves a visible patch of the mesh, not a sub-vertex bump.
  TFORM_RADIUS: 35.0, // brush radius, surface units
  TFORM_DELTA: 0.8, // height added/removed per stamp, units
  TFORM_RATE: 7.5, // stamps per second while the trigger is held
  TFORM_MAX_EDITS: 600, // per-planet edit budget (~27 KB in localStorage)

  // --- on-foot third-person camera ---
  WALK_CAM_DIST: 7.6, // default orbit distance behind the astronaut
  WALK_CAM_MIN: 4.5, // scroll-wheel zoom clamp
  WALK_CAM_MAX: 13.0,
  WALK_TP_EYE: 1.72, // orbit target height above the feet
  WALK_TP_SWIM_EYE: 1.15, // ... lowered while swimming

  // --- on-foot surface dressing (grass/trees/shrubs/rocks patch budgets) ---
  DRESS_RADIUS: 260.0, // dressing patch radius around the landing point
  DRESS_GRASS: 24000, // instanced grass blades
  DRESS_TREES: 150, // per tree variant (x3)
  DRESS_SHRUBS: 260,
  DRESS_ROCKS: 80, // per rock variant (x3)

  // --- on-foot world entities (parked ship, city, wonders, creatures) ---
  WALK_BOARD_RADIUS: 18.0, // must be this close to the parked ship to take off (G)
  PARK_OFFSET: 14.0, // parked ship sits this far behind the disembark point
  PARK_LIFT: 2.8, // ship-origin height above ground so the gear pads touch
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
};
