# stevenlacey: the coin world

## Context

A gift world for Steven and Lacey, built around the two games they are playing: Monster Sanctuary (collect monsters, team battles) and Fatal Claws (a Hollow Knight-style Metroidvania). The world is a giant coin tumbling in space. It settles when the ship arrives, the ship and player are pressed flat into 2D, and each face of the coin is a side-scrolling homage to one game. Monsters collected there live afterwards in a 2D terrarium in the ship's lounge.

Decisions already made with the owner:

- Sanctuary face uses small turn-based team battles (team of up to 3, one out at a time, next swaps in on a faint).
- One landing reaches both faces by walking around the rim; each face gates something on the other.
- Steven and Lacey appear by name only (world name, terrarium plaque). No characters.
- All 2D art is drawn in code onto canvases. Original creature designs; nothing copied from either game.

This breaks GDD §5.7 ("palette + threshold, not separate systems"). Record it there as an exception, as wyattmattoe and the Sky City were.

## Shape of the solution

stevenlacey is **not** a `CONFIGS` planet. Planet code assumes a sphere spinning about Y only (`src/planet.js:715-751`, surface-local frame math in `walk.js`), which a tumbling disc violates. It follows the **Sky City precedent** instead: a bespoke body built at boot, its own capture and auto-land in `game.js`, and its own flat walker guarded at the top of every `walk.js` export.

The camera stays the one global `PerspectiveCamera`. "2D" is a long lens (FOV about 14) looking square at the face. A true orthographic camera would mean swapping the camera held by `RenderPass`, both overlay passes and GTAO (`game.js:249, 320, 362, 366`); the long lens avoids all of that, and easing FOV 70 → 14 while dollying back is itself the "world goes flat" effect.

## New files

| File | Chunk | Purpose |
|---|---|---|
| `world/coinworld.js` | main | The coin body: thick disc (radius ~600, thickness ~60), two 1024² canvas-painted faces (Sanctuary emblem on heads, Claws emblem on tails), milled rim. `createCoinWorld()` returns `{group, update(dt,t), settle(), release(), faceToward(pos), padPose(face), radius}`. Registered with `addShiftable`. Tumbles end over end about an in-plane axis at ~0.05 rad/s with a slight precession. No gravity body. |
| `world/coin-bestiary.js` | main (small, data + draw fns) | `SPECIMENS` catalog: 10 entries `{id, name, element, hp, atk, spd, moves[2], face, draw(ctx, frame)}`. Shared by the walker, the battle and the terrarium. |
| `world/coin-levels.js` | walk (lazy) | Two ASCII tilemaps (about 300×80 tiles each) plus entity spawn tables, shrines, gates, rim doors. |
| `src/coinWalk.js` | walk (lazy) | The 2D walker. Same export shape as `src/skyWalk.js`: `coinActive, enterCoinWalk, exitCoinWalk, stepCoinWalk, updateCoinVisuals, updateCoinCamera, coinInteract, coinPromptText, nearPad, promptReturnToPad, padBearing, coinSite`. |
| `src/coinBattle.js` | walk (lazy) | Turn-based battle: state machine + a DOM/canvas overlay in the house panel style (see `world/warzone-hud.js`, `src/artView.js`). |
| `world/coin-audio.js` | walk (lazy) | Synthesised square-wave loop per face and SFX, own `AudioContext`, pattern of `world/skycity-audio.js`. Ducks the radio with `setMusicDuck` (`src/music.js:101`). |
| `src/terrarium.js` | main | Lounge tank + shared tank sim. Module shape of `src/patio.js` (`{update, refresh}` handle, given `group/MATS/solid`). |
| `src/terrariumView.js` | main | Fullscreen tank overlay, modelled on `src/artView.js`. |
| `plans/planet-stevenlacey.md` | — | Copy of this plan, with a "What was touched" table like `plans/planet-wyattmattoe.md`. |

## Existing files to modify

- `src/game.js`: build the coin at boot next to `createSkyCity` (l.196); update it each frame next to `skyCity.update` (l.1978). Add `checkCoinCapture`, `beginCoinAutoLand`, `stepCoinAutoLand`, `stepCoinLanded`, `setOnCoinPad`, mirroring the sky functions at l.1021-1177 with a `coinLanding` flag. Branch on it wherever `skyLanding` is branched (G handling l.1650-1690, boarding l.1728-1753). Wire the terrarium E-prompt beside `nearPainting` (l.1577-1585, l.1932-1942) and force-close on sit (l.1569). Add `__debug.coin`.
- `src/walk.js`: add a `coinWalk.coinActive()` guard after each `skyWalk.skyActive()` guard (17 exports, l.258-2455); re-export from l.80. `src/walkLazy.js`: re-export `enterCoinWalk`, `coinActive`.
- `src/isolate.js`: `WORLD_RENDER.stevenlacey` preset (flat exposure, low bloom, no AO, no shadows). Use the cottage path (`acquireUniverse(null)` + `acquireSurface`), as `enterHeaven` does (`game.js:948-974`).
- `src/inventory.js`: `specimens` Set, loaded defensively and filtered against `SPECIMENS` exactly like `cargo`/`upgrades` (l.66-68); added to `save()` (l.80) and `inventoryState()` (l.202); `grantSpecimen(id)` returns false on a repeat and toasts once (pattern l.95-139).
- `src/interior.js`: build the tank in the lounge beside `buildLoungeWall()` (l.627), call `terrarium.refresh()` from `openGallery()` (l.550) and `terrarium.update()` from `updateInterior` only while `active`; add `nearTank()`.
- `src/touchControls.js`: a `coin` layout class beside `interior`/`combat` (l.75-79, 362-367): one stick, JUMP, CLAW, DASH, USE.
- `src/nav.js`: register the body on the chart the way stations are (l.96) with a colour in `PLANET_COLORS` (l.52). `src/constants.js`: `COIN_*` constants.
- `GDD.md` (new §5.9 + the §5.7 exception), `.claude/skills/verify/SKILL.md` (a stevenlacey section).

## Arrival and departure

1. **Approach.** The coin tumbles. Placement: a free direction at about 45,000 units, checked against the eight `CONFIGS` dirs and the station offsets.
2. **Capture.** Automatic at 1.3× radius with an armed latch, as `checkSkyCapture` does. This also stops the ship flying through the disc, since the ship has no collision. The face is chosen by which side of the coin the ship is on: `sign(dot(shipOffset, coinNormal))`.
3. **Settle.** The tumble decelerates over ~1.5 s and ends in a damped wobble, like a coin coming to rest. The ship flies a two-leg scripted arc (hover point along the face normal, then descent) to that face's pad. Toast names the face.
4. **Flatten.** At touchdown: ~1.6 s. The parked hull (`createShip`, `world/ship.js:318`) scales to near zero along the face normal, the camera pulls out to side-on while FOV eases 70 → 14, isolation is acquired once the face fills the frame, and the level and the flat ship sprite fade in. The walker starts directly; there is no separate "step out".
5. **Leaving.** G at the ship sprite runs the flatten in reverse, puts the ship in `landed` on the pad (`setOnCoinPad`), and W/Space runs a scripted lift like `stepSkyLanded`. The tumble resumes once the ship re-arms the latch.

## The 2D walker (`src/coinWalk.js`)

- **Frame.** A `levelGroup` child of the coin, scaled so 300 tiles span the face chord. All gameplay math is in tile units in that group's local frame (x along the face, y up, z out of the face). `ship.position` is still written every tick (walker convention, `mineWalk.js:243-256`).
- **Collision.** Tile AABB, one axis at a time, ground snap, jump on a Space edge: the mine walker's step (`mineWalk.js:268-374`) flattened to X/Y. New: one-way platform tiles and a coyote-time/jump-buffer window.
- **Rendering.** Tiles baked once into chunked `CanvasTexture` planes with `NearestFilter` (8 px per tile). Two parallax planes behind, one foreground plane in front. Entities are quads sharing one atlas texture, animated by UV offset (two frames each). No per-frame allocation (GDD §2.1).
- **Camera.** Follows with look-ahead, clamped to room bounds; `camera.up` is the coin's local Y. Mouse deltas are read and discarded every tick (`skyWalk.js:353-354`) so nothing jolts the ship at takeoff. FOV and `far` are restored on every exit path, including `abort` from collapse/menu resets.
- **Input.** A/D via `moveAxes()` (`input.js:60`), Space jump, W/S for ladders and menus, E interact. Claw and dash reuse two existing one-press flags (F and J are bound at `input.js:131-156`; confirm their flag names). T/I/vehicles are no-ops here.
- **Rim crossing.** A door at each end of a face. Walking through it swings the camera 180° round the rim in ~1.2 s and continues on the other face, mirrored.
- **Progress** persists in its own key `fgsf.stevenlacey` (precedent: `nova7.skyrace`): `{claw, dash, team[3], shrine, gates{}, boss, champion}`, with tolerant loading.

## Heads: the Sanctuary

- A starter nest beside the landing gives the first monster. Wild monsters roam; E beside one starts a battle.
- **Battle.** Team of up to 3 chosen from the collection, one out at a time. A turn is: one of two moves (a neutral strike, an element move) or a swap, which costs the turn. Elements: Ember beats Moss beats Tide beats Ember. Speed decides order. A fainted monster is replaced by the next. Win and the wild monster joins (`grantSpecimen`). Lose and you wake at the last shrine with the team healed. No levelling, no items.
- Shrines heal and let you reorder the team.
- A **champion** with a team of three stands at the far end; beating it grants its lead monster.
- A sealed grove holding two rare species needs the **dash** from the Claws face.

## Tails: the Claws

- Real-time. A shrine near the pad grants the claw (slash, three hit points, brief invulnerability on a hit). Three enemy types: a crawler, a flyer, a charger. Death returns you to the last shrine.
- The dash is a pickup mid-level, behind a platforming stretch.
- The passage to the boss is dark and opens only if you hold the Sanctuary's lantern monster.
- A boss with three telegraphed attacks. Beating it grants a tamed specimen; a second Claws specimen is found past a dash-only ledge.

Totals: 8 Sanctuary specimens + 2 Claws specimens = 10. Either face can be started first; neither gate blocks the other's opening section.

## The terrarium

- A glass tank in the lounge (free wall between window frames, or freestanding between the couches; register with `solid()`), with a brass plaque: "FOR STEVEN & LACEY" and a count "n / 10". It is there from the start, empty.
- The glass is a 512×256 `CanvasTexture` redrawn at ~15 Hz only while the interior is active (`loungeTex.needsUpdate` pattern, `interior.js:643-751`). Collected monsters wander by element: Moss on the floor, Tide in a water pocket, Ember on a warm rock. Steering is waypoint wander, as in `world/cottage-butterflies.js`.
- `stepTank(state, dt)` and `drawTank(ctx, state, w, h)` are shared with `terrariumView.js`: E at the tank opens the fullscreen version with name, element and "found on Heads/Tails" labels. Closes on E, X or tap.
- Contents refresh on stand-up, since inventory initialises after the interior (`game.js:218, 231`).

## Build order (one phase at a time, GDD §8)

1. Coin body, tumble, capture, settle, landing, lift-off. No 2D yet.
2. `coinWalk` core: level build, collision, camera, flatten in and out, rim crossing, all exit paths. Both faces as bare terrain.
3. Claws face: claw, enemies, dash, boss.
4. Bestiary, Sanctuary face, battles, shrines, champion, both cross-face gates.
5. `specimens` persistence, terrarium, terrarium view.
6. Touch layout, audio, nav chart entry, debug hooks, docs.

## Risks

- The battle system is the largest single piece; it is kept to two moves, three elements and no levelling to stay buildable.
- Game feel (jump arc, hit feedback, battle pacing) can't be judged headlessly at 15-20 fps. It needs a play session by the owner after phases 3 and 4.
- `coin-bestiary.js` and the terrarium load in the main chunk. Keep the draw functions compact and check the build output size.

## Verification

Per `.claude/skills/verify/SKILL.md` (dev server, headless Chromium with SwiftShader, `window.__debug`, `waitForFunction` only):

- `npm run build` passes after each phase.
- `__debug.coin.approach(face)` → capture fires, tumble settles, ship lands on the pad; screenshot from space of both faces.
- `__debug.coin.enter(face)` → `coinSite()` reports the walker active, FOV 14, isolation acquired. `walkStep(n)` with held inputs: walk, jump, land on a one-way platform, cross the rim and confirm the face flips.
- Scripted battle through `__debug.coin.battle(...)`: win grants a specimen once, repeat returns false, a loss returns to the shrine.
- `walkExit()` from each face and from mid-battle; re-enter; no `pageerror`; `renderState()` shows FOV, `far`, fog and exposure back to flight values. Repeat the exit through a forced collapse reset.
- Reload the page: `__debug.inventory().specimens` and `fgsf.stevenlacey` survive. Load a save with no `specimens` field and with an unknown id; both load clean.
- `__debug.interior.stand()` → tank shows the right count; E opens the view; sitting closes it. Screenshot at 960×540.
- Touch: emulate a phone in landscape and confirm the `coin` layout appears only in the 2D mode.

## As built

All six phases are implemented. Where the build departs from the plan above:

- **One canvas, not planes and an atlas.** The 2D world is drawn each frame onto a single small canvas (272 px tall, width following the window) that textures one quad standing off the coin's face. Tiles, creatures, HUD and battles are all canvas drawing. Nothing in the render pipeline is reconfigured.
- **No render isolation.** The quad fills the long-lens view, so the universe is simply hidden behind it. `src/isolate.js` is untouched. `game.js` lowers bloom and the colour split while the 2D mode is up, since both are re-derived every frame.
- **Battles draw in the same canvas** rather than in a DOM overlay.
- **Rim crossing is a flip of the picture** (the quad turns edge-on and comes back showing the other face), not a camera orbit. There is one rim door per face, at the ship's end.
- **The two pads are back to back** through the coin, so the ship is at the left end of heads and the right end of tails.
- **Levels are 140 x 36 tiles**, built from rectangle fills in `world/coin-levels.js`.
- **Sound is effects only** (`world/coin-audio.js`); the ship's radio keeps playing.
- **Dash passes through hits**, and the walker has five hit points on tails, after the warden proved too hard in testing.
- The on-foot controls panel is hidden in 2D; the keys are shown inside the picture for the first seconds instead.

### What was touched

| File | Change |
|---|---|
| `world/coinworld.js` | new: the coin, its tumble, face frames |
| `world/coin-bestiary.js` | new: ten creatures, element triangle, pixel drawing |
| `world/coin-levels.js` | new: both levels |
| `world/coin-audio.js` | new: sound effects |
| `src/coinWalk.js` | new: the 2D walker, both faces, enemies, warden, transitions |
| `src/coinBattle.js` | new: turn-based battles |
| `src/terrarium.js`, `src/terrariumView.js` | new: lounge tank and close-up |
| `src/game.js` | capture, landing, lift-off, step out, boarding, terrarium E-key, bloom in 2D, `__debug.coin` |
| `src/walk.js`, `src/walkLazy.js` | `coinActive()` guards and re-exports |
| `src/inventory.js` | `specimens`, `grantSpecimen` |
| `src/interior.js` | builds, refreshes and updates the tank; `nearTank()` |
| `src/controls.js`, `src/touchControls.js`, `src/input.js` | hint panel off in 2D; `coin` touch layout; `coinDash` |
| `src/nav.js`, `src/constants.js` | chart entry; `COIN_*` |

### Not verified by a person

Jump feel, battle pacing and the warden fight were only exercised by scripts under software rendering. They need a play session.
