# Planet plan — wyattmattoe (IMPLEMENTED)

**wyattmattoe** — the snowboarder's and bush-pilot's planet: a world of
record-setting alpine terrain. The tallest relief in the system, knife-edge
ridgelines, halfpipe glacial drainages, and deep carved canyons floored with
frozen lakes you can fly the ship down at full tilt — or ride out onto after
a descent.

This plan was executed in full; it stays in the repo as the design record.

## 1. Theme summary

- **Name:** `wyattmattoe` (owner-named; lowercase like every other dispatch
  key — the UI uppercases it for display).
- **Mood/palette:** powder white, granite gray, spruce blue-green, glacier
  teal, safety orange.
- **Water:** frozen lakes pooled in canyon floors (`seaLevel 0.42` +
  `frozenSea`).
- **Terrain:** the most extreme in the system — `terrainHeight 280` (terra is
  220), `shape { ridge: 0.58, ridgeFreq: 2.7, valley: 0.18 }`.
- **Gravity:** floaty on foot (`walkGravityScale 0.5`) for big airs; flight
  untouched.
- **Snowboarding:** a real mechanic — see §8. Gated by `boardable: true`.
- **Planes:** the existing ship IS the canyon plane. The altitude floor
  already terrain-follows (gravity.js); crest-to-canyon relief far exceeds
  the 40-unit cruise floor, so you dive below the ridgelines and thread the
  drainages; the frozen lakes read as flight corridors, and the `arch`
  wonder is a gate to fly through.
- **City:** `basecampNeon` — low-rise resort lodges, safety-orange /
  glacier-cyan neon, ad billboards on (aprés-ski energy).
- **Life:** Ridge Kites — tethered living sail-gliders that surf the wind
  above summit cairns; the grounded ones talk.
- **Culture:** new `linechasers` bank (line-obsessed riders and pilots),
  pinned in `cultureForCity`; `questBias: 'waypoint'`.
- **Orbit:** mid system, 35,000 units, bearing `(-0.82, 0.4, 0.15)`.

## 2. What was touched

| File | Change |
|---|---|
| `src/planet.js` | `wyattmattoe` CONFIGS entry (appended last — station anchors and style cycling unaffected) |
| `src/nav.js` | `PLANET_COLORS.wyattmattoe = '#f4f8ff'` |
| `world/city.js` | `basecampNeon` CITY_STYLES preset |
| `src/walk.js` | `CITY_STYLE_BY_WORLD` + `WONDER_TYPES` entries; the whole snowboard mode (§8) |
| `world/creatures.js` | `C.wyattmattoe` tunables, `buildWyattmattoe` (Ridge Kites), dispatcher case |
| `world/aliens.js` | `linechasers` CULTURES bank + `CULTURE_BY_CITY` pin (the hash-pick pool excludes pinned banks so every other city keeps its culture) |
| `src/constants.js` | `BOARD_*` tuning block |
| `src/input.js` | `toggleBoard` + `KeyB` |
| `src/game.js` | pause swallow + end-of-frame zero for `toggleBoard` |
| `src/controls.js` | `B — SNOWBOARD` walk-hint line (boardable worlds only) |
| `src/walkLazy.js` | `currentBoardable` pass-through |
| `src/astronaut.js` | `'board'` pose mode, `bodyYaw`/`headYaw` channels, deck mesh |
| `GDD.md` | §5.7 recorded exception |

## 8. Snowboard mode (the one net-new system)

`walk.boarding`, a branch inside `stepWalk` exactly like `walk.diving` — not
a separate loop. B toggles on solid ground (`cfg.boardable` worlds); B again,
open water, or ~1.2 s at a standstill steps off. All tunables live in the
`BOARD_*` block of constants.js.

- **Horizontal:** no wish velocity. Terrain gradient from four `floorRadius`
  central-difference probes (the frozen sheet reads slope 0); downhill pull
  `BOARD_PULL × walkGravityScale × slope` (clamped `BOARD_SLOPE_MAX`);
  anisotropic friction on the board axes — near-free forward glide
  (`BOARD_GLIDE_DRAG`, plus `BOARD_BRAKE_DRAG` on S) vs strong side grip
  (`BOARD_GRIP`) that swings velocity onto the nose line; both scaled by
  `BOARD_ICE_SCALE` on lake ice. A/D carves the heading
  (`BOARD_CARVE_RATE` grounded, `BOARD_CARVE_AIR` airborne); W hop-skates
  below `BOARD_SKATE_SPEED` and tucks the cap up `BOARD_TUCK_CAP` at speed.
  Soft cap `BOARD_MAX_SPEED` (~3× sprint).
- **Vertical:** while grounded the terrain hands the walker a radial rate;
  a crest launches the ride when the ballistic continuation of that rate
  clears the dropping face (speed gate `BOARD_LAUNCH_SPEED`, stick window
  `BOARD_SNAP`) — no keypress, the convexity throws you. Space ollies
  (`BOARD_JUMP`) on top of whatever the lip gave. Landing keeps tangent
  momentum; the ride continues.
- **Pose:** astronaut `'board'` mode — sideways stance (bodyYaw/headYaw),
  speed-deepening crouch, arms out, `bodyRoll = carve × BOARD_LEAN`; the
  magenta deck parents to the travel frame so it holds the line under the
  turned rider.
- **Camera:** third-person orbit eases out `BOARD_CAM_PULL` and FOV widens
  `BOARD_FOV_KICK` with ride speed. First person unchanged.
- **Perf:** four extra CPU terrain samples per 60 Hz tick, zero per-frame
  allocation, one extra mesh, no new render passes.

## 9. Verification (all passed, headless)

- Config: wyattmattoe orbits at 35,000, radius 1050, frozen sea, boardable.
- Gate: B is inert on terra.
- Ride: downhill run reaches 20–24+ u/s with crude 1 Hz steering (sprint is
  16), never exceeds the cap; carve rotates the heading ~63°/0.5 s and grip
  closes velocity-vs-heading from 42° to 11°.
- Ollie: 1.8 s of air at half gravity, 100% of momentum kept, ride continues.
- Crest launches: at ~34 u/s across ridgelines, every 8 s run collected
  3.3–5.7 s of natural airtime, no Space pressed.
- Ice: riding onto a frozen lake stays grounded (no swim), glides with slow
  decay; braking to a stop auto-exits to walking.
- Site: basecampNeon city + crowd spawn, citizens speak `linechasers` lines,
  Ridge Kites (`wyattmattoe-creatures`) spawn and the grounded ones interact.
- Teardown: repeated land/exit cycles with zero page errors.
