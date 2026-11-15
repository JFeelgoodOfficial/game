# Sky City plan — Saturnia (IMPLEMENTED)

Built as planned, with these differences: the liftoff is a short scripted climb
(nose tips skyward) instead of a kick; the auto-land arrives above the pad and
descends vertically; the nav contact for the city was not added.


## Context
Saturnia (`src/planet.js`, `type: 'gas'`, radius 2600, 45 000 u out) is a flyby-only gas giant: the landing code (`nearestTerraFloor` in `src/walk.js`) only considers `type: 'terra'` worlds. The user wants a floating city like the three reference paintings (a disc of towers, domes and gardens on a rocky underside, docking arms on cables, thruster plumes firing down into the cloud bands, rings overhead). Requirements:
1. Approaching Saturnia, the ship auto-lands; the city is the only place it can land.
2. Step out (G) and run around the city on foot.
3. Jumping or walking off any edge = fall and die, which restarts the game in the ship at the start (`resetToStart()`), not the death menu.

## Approach
Model the walk mode on the cottage (`src/cottageWalk.js`): a flat walker with +Y up and a single height query, dispatched from `walk.js`. Unlike the cottage, the city stays in the real solar system (Saturnia below, rings, sun), so the walker keeps its state in **city-local** coordinates and converts to world every step (rebase-safe, because the city is a child of Saturnia's shiftable `planet.group`).

### 1. City mesh — new `world/skycity.js` (main bundle, always in the scene)
- `createSkyCity(planet)` → `{ group, floorYAt(x,z,feetY), colliders, pad, spawn, shipSpot, update(dt,t), dispose }`.
- Parented to `planet.group` (not the spinning `surface`, so clouds drift underneath), at `dir * (R + 320)` with `dir` biased toward the planet's `sunBase` so it is lit on arrival; group quaternion rotates +Y onto `dir`. Clouds/heat floors are far below (heat only fires < 90 u, `MIN_ALTITUDE` 40).
- Scale: deck radius ~170 u (astronaut is ~1.9 u, parked freighter ~24 u), towers 20–120 u so it reads as a silhouette from several thousand units.
- Content, procedural and merged/instanced (seeded PRNG like `world/ship.js`):
  - main deck disc (y = 0) with a stepped rim band and a jagged rock underside cone (displaced `ConeGeometry`);
  - raised central terrace (y = 6, r ≈ 45) with four ramps; central green-glass dome; spires/towers in rings (box + cylinder, emissive window strips);
  - garden patches with instanced trees;
  - four docking arms (narrow bridges, 6–8 u wide) out to small platforms past the rim, with hanging cable curves (`TubeGeometry` on catenaries);
  - landing pad on its own pier at +Z (centre ≈ (0, 0.3, 205), r 22) with lit ring;
  - 4–6 thruster pods under the rock with additive cone plumes + a point-ish glow sprite, flickering in `update`;
  - a few small hovering shuttles circling on paths (cheap boxes) for life.
- Edges are deliberately open: low decorative curbs (≤ 0.5 u, not colliders) only on parts of the rim; the arms and pad pier have no rails.
- Walkable surfaces as a list of primitives: discs `{cx,cz,r,y}`, oriented rects `{cx,cz,hw,hl,ang,y}`, ramps (rect with y lerped along length). `floorYAt` returns the highest surface ≤ `feetY + snap`, or `-Infinity` (void). Colliders: circles (towers, dome) and boxes, like the cottage's AABB list.
- Lighting: uses the existing scene `DirectionalLight` + `AmbientLight` from `src/sun.js` (stations already rely on them); add one `HemisphereLight` inside the group with gold sky / brown ground at low intensity to match the paintings.
- Created in `game.js` init after `initPlanets`, kept on a module-level `skyCity`; `skyCity.update` called per frame. LOD: hide detail children (gardens, trees, shuttles) when the camera is > 6000 u away.

### 2. Flight: forced auto-land (`src/game.js`)
- New state alongside `landState`: `skyLanding` (bool) and `skyArmed` (re-arms only once the ship is above Saturnia's atmosphere shell, `R * (C.ATMO_SHELL - 1)` + 200 margin).
- Trigger, in the `fly` physics loop: if `landState === null`, `skyArmed`, and the ship is within the atmosphere shell of Saturnia (or within ~1500 u of the pad) → `cancelAutopilot()`, set `skyArmed = false`, `beginSkyAutoLand()`. Fires at any speed, including warp (the arc takes over position directly, so no heat).
- `beginSkyAutoLand`: store start offset from planet centre and quaternion, compute pad world pos/up from `skyCity` (local → world via the group's `matrixWorld`). Duration `clamp(4 + ang*R/600, 4, 14)` where `ang` is the great-circle angle from ship to city around the planet.
- `stepAutoLand` gets a `skyLanding` branch: slerp the direction around the planet centre along the great circle, radius eased start → pad radius with a floor of `R + 250` (so a far-side approach swings around the planet, never through it), final segment drops onto the pad; quaternion slerps to upright (+Y = city up, nose along approach). Velocity = finite difference, as today. Reuse `landingUpright`.
- `stepLanded` gets a `skyLanding` branch: pin to pad world pos + up * `C.TOUCHDOWN_CLEARANCE`. W/Space lifts off with `C.TAKEOFF_KICK` along city up; `skyArmed` stays false until the ship climbs out of the shell, so it doesn't re-capture immediately.
- G handling: in `sky auto` G does nothing (no abort — it is the only landing); in `sky landed` G → `enterSkyWalk()` (new lazy wrapper), `phase = 'walk'`. Prompts: `'AUTO-LANDING · SKY CITY'`, then the existing `'G — STEP OUT · W — LIFT OFF'`.
- No isolation/spin-freeze for Saturnia (`touchdownIsolate` skipped): the whole point is the live sky.
- `resetToStart()` clears `skyLanding`, sets `skyArmed = true`.

### 3. On foot — new `src/skyWalk.js` (lazy walk chunk, cloned from `cottageWalk.js`)
- State `sWalk { active, pos(local), yaw, pitch, vel, vUp, grounded, mode, view, camDist, facingYaw, fallen, fallT }`.
- `enterSkyWalk(skyCity)`: spawn beside the pad, face the city centre, build `createParkedShip` (`world/ship.js`) on `shipSpot` inside the city group, view chooser via `walkview.js` exactly as the cottage does.
- `stepSkyWalk(dt)`: cottage controller (WASD/touch `moveAxes`, sprint, `C.WALK_JUMP`, `C.WALK_GRAVITY`, axis-separated collider push-out). Speeds `C.SKY_WALK_SPEED` 4.5 / `C.SKY_RUN_SPEED` 9 (city is bigger than the garden). No outer clamp ring. When `floorYAt` is `-Infinity` the walker keeps falling; at `pos.y < -60` (below the rock) set `fallen`, start `fallT`. Terminal velocity cap ~60 u/s.
- After each step: `ship.position = toWorld(pos)`; `ship.velocity` zero.
- Camera (`updateSkyCamera`): cottage FP/TP logic in local space, then transform position and look target to world and set `camera.up` to city up. While falling in TP, freeze the camera's position at the moment of the fall (it stops following, so you watch yourself drop toward the clouds); FP keeps following.
- Visuals: astronaut placed at world pos with world quaternion = cityQuat * yaw; `parked.update`.
- Board: G within `C.COTTAGE_BOARD_RADIUS`-style radius of the pad → `nearPad()`; `promptReturnToPad` toast.
- `skyFell()` → true once `fallT > 1.2`.
- Debug: `skySite()` (pos, grounded, nearPad, fallen, floor under feet).

### 4. Wiring
- `src/walk.js`: import `skyWalk`; add a `skyWalk.skyActive()` branch next to every `cottageWalk.cottageActive()` branch (exitWalk, toggleWalkView, stepWalk, updateWalkVisuals, walkInteract, walkPromptText, nearParkedShip, promptReturnToShip, deployVehicle → false, walkSite, walkPreRender (none), currentGravityScale, currentBoardable, shipBearing/walkBearing, updateWalkCamera, walkObjective → null). `initSkyWalk(astronaut, scene)` in init. Re-export `enterSkyWalk, skyActive, skyFell`.
- `src/walkLazy.js`: safe wrappers for those three.
- `src/game.js` walk phase:
  - boarding: if `skyActive()` → `endWalk()`, then put the ship back in `landState = 'landed'`, `skyLanding = true`, pinned to the pad, `snapCamera`.
  - new check: `if (skyFell())` → `phase = 'fallen'`, `warpT = 0`.
- New phase `'fallen'`: flash ramps over 0.6 s; at full: `endWalk()`, `resetToStart()`, `flash = 1`, `flashFade = 1.4`, `phase = 'fly'`, `showNavToast('YOU FELL FROM THE SKY CITY', 4)`. Add `'fallen'` to the flash-hold exclusions and `heatShown = 0` list.
- `__debug`: `skyCity`, `skySite`, `skyLand()` (teleport into Saturnia's shell to trigger the auto-land), `skyWalkHere()`.
- `src/nav.js` / holonav: add a "SKY CITY" contact on Saturnia if the nav body list supports sub-targets (check `getBodies`; skip if not trivial).
- `src/constants.js`: `SKY_CITY_ALT`, `SKY_WALK_SPEED`, `SKY_RUN_SPEED`, `SKY_FALL_DEATH_Y`, `SKY_FALL_TIME`, `SKY_CAPTURE_MARGIN`.
- Update the header comment in `planet.js` ("never land") and `GDD.md` with a short Sky City section.

## Files
New: `world/skycity.js`, `src/skyWalk.js`.
Edit: `src/game.js`, `src/walk.js`, `src/walkLazy.js`, `src/constants.js`, `src/planet.js` (comment only), `GDD.md`, `.claude/skills/verify/SKILL.md` (sky city debug hooks).

## Verification (headless, per the `verify` skill)
1. `npm run build` passes.
2. Playwright + swiftshader, `__debug.launch()`, wait for the walk chunk.
3. Teleport the ship to Saturnia at R + 900 on the far side from the city at 400 u/s → `landState === 'auto'`; step until `'landed'`; assert ship within 5 u of the pad and never below R + 240 during the arc; heat stays 0.
4. Press G → `phase === 'walk'`, `skyActive()`. Walk forward with `input.forward`, `walkStep`; assert grounded on deck, blocked by a tower collider, climbs the terrace ramp.
5. Teleport the walker onto a docking arm, walk off its side → falls, `phase` goes `'fallen'` → `'fly'`, ship at origin facing Terra, toast shown.
6. Re-land, step out, walk back to the pad, G → back in the cockpit `landed`; W lifts off; confirm no immediate re-capture until leaving the shell, and re-capture after flying out and back.
7. Screenshots at `quality.set('high')`: city from 3000 u (flight), from the pad on foot (TP), and mid-fall, compared against the reference paintings.
8. Regression: land on Terra and enter/leave the cottage once; no pageerrors.

## Open decisions
- Auto-land cannot be aborted (the city is the only landing). Cost: an accidental dive into Saturnia locks you into a landing of up to ~14 s.
- A fall is a reset, not a game over: no death menu, straight back to the start in the ship (same path as the black-hole respawn).

## Second pass (IMPLEMENTED)
- Saturnia is ground under a heavy cloud deck (`type: 'terra'`, `noLand`, `cloudCover`), rings widened to 1.7–3.5 R, stray clouds around/above the city.
- Inhabitants: `world/aliens.js` crowd on the main deck, E to talk.
- Dragon (`world/skydragon.js`) + the Lance on the tallest tower (lift, open gallery, E/click to fire).
- Rim Circuit raceway (`src/skyRace.js`): booth check-in, four rivals, three laps, no barriers.
