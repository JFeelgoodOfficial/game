---
name: verify
description: Build, launch, and drive Feelgood Space Flight headlessly to verify changes at runtime.
---

# Verifying Feelgood Space Flight

## Build & launch
- `npm install` then `npm run dev` (vite, http://localhost:5173). `npm run build` for a bundle check.
- Headless: Playwright chromium at `/opt/pw-browsers/chromium` with
  `args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox']`. Expect ~15-20 fps (software GL).

## Dev handle
Dev builds expose `window.__debug` (src/game.js). Wait for
`window.__debug && window.__debug.walk !== undefined && window.__debug.walkSite`
(the walk module is a lazy chunk), then `__debug.launch()` to skip the menu.

Useful members: `planets`, `ship`, `input` (set `input.forward = true` to walk),
`walkHere()` (land on nearest terra floor under the ship), `walkStep(n)`
(synchronous 60 Hz ticks), `walkExit()`, `walkSite()` → `{ city, parked,
citizens, wonders, dressing, wavemall, interiorCrowds, beaconInfo }`, `fps()`,
`cityInfo(world)` / `cityCount`, `journal()` / `inventory()` (quest stages +
owned vehicles), `deployVehicle(id)` / `stowVehicle()` / `vehicleState()`.

Towns v2: `city.homes` maps each citizen (roster index) to their building —
`homes[i].anchor` is where the resident stands; `city.elevator` exposes the
tower cab (`{state, cabY, cabSpot, interact({kind:'cab'})}` — the ride is
stepped from stepWalk, so `walkStep` drives it). The governor's wonder-tour
beacon chain advances in the rAF update, NOT stepWalk — after teleporting to
a beacon, yield real time (`waitForTimeout`) and re-check `journal().quests`.
Headless rAF can throttle to ~1 frame/sec under swiftshader: wait on state
with `waitForFunction`, never fixed short timeouts.

The city round the town (terra, rustia, wyattmattoe; world/cityMetro.js and
cityTraffic.js): `walkSite().city` adds `metroRadius`, `metro` (`rA`, `rB`,
`buildings`, `routes`, `roads`), `roadDist(x, z)` and `traffic`
(`info()` → `{vehicles, peds, routes, routeLengths, list: [{x, z, v, route, s}]}`,
`colliders`, `colliderCount`). Counts by tier, vehicles/pedestrians: low 10/0,
medium 18/16, high 28/24, ultra 36/32 (SwiftShader is low: call
`quality.set('medium')` BEFORE landing to see pedestrians). Every vehicle must
have `roadDist < 2.6` and move between frames. To test braking, wait on
`requestAnimationFrame` until a vehicle has moved (so you know its heading),
put the walker 7 ahead of it (`city.group.localToWorld` a city-local point
into `ship.position`, then `walkStep(2)`), wait 40 frames: its `v` reads 0.
Buildings are circles at the tail of `city.collidersLocal`; standing inside
one must be pushed out. Screenshots at medium take over 30 s here: pass
`timeout: 150000`. For a view the walker cannot reach, wrap
`renderer.render` and set `camera` from city-local points just before it.

Land on a specific planet: set `ship.position` to
`planet.body.position + dir * (planet.radius + 20)` for any unit `dir`, zero
`ship.velocity`, call `walkHere()`. Press key `3` once to dismiss the
first-person/third-person chooser overlay.

## Quality tiers, camera poses, coaching
SwiftShader auto-detects as LOW (no bloom, no AA, fresnel air shell), so force
a tier before judging a look: `__debug.quality.set('low'|'medium'|'high'|'ultra')`,
`quality.auto()`, `quality.report()` → `{gpu, mode, tier, scale, pixelRatio,
bloom, aa}`, `quality.buffer()` → composer vs canvas size, and
`quality.feed(ms, n)` pushes n synthetic frame times through the governor
(60 slow frames = one step down in render scale). Headless frame times say
nothing about real GPUs: tier budgets need hardware.

`__debug.pose(name, distR = 3, side = 0)` parks the ship looking at `sun`,
`station`, or any planet name from `distR` radii; `side` 0 lit face, 1
terminator, 2 night. Set `__debug.hideCockpit = true` for a clear view and
`__debug.paused = true` to hold it. `__debug.stationList` is the stations
array. `__debug.coach()` → `{step, total, visible, text}`; set
`localStorage['nova7.coach'] = '6'` before load to skip the first-flight
coaching in screenshots.

## Landing
Every landable world captures the ship like the Sky City: crossing inside
`radius * 1.25` starts the auto-land to the town pad (or flat ground where
there is no town) with no key. Put the ship at `radius * 1.25 + 40` above a
planet moving in and wait for `skyState().landState` `'auto'` then `'landed'`;
the ship's direction from the planet must match `cityInfo(world)[0].padWorldDir`.
`planet.landArmed` is the latch: false from capture until the ship is 300
clear of the air, so holding `w` to lift off must reach free flight without
being recaptured. Set `planet.landArmed = true` before a second test on the
same world. The autopilot stops at 4 radii, outside the air, so NAV alone
does not land.

## The dash
Wheel on the right, throttle lever on the left, one row of six buttons and no
others. `__debug.cockpit` → `buttonNames()` (must be exactly WARP, RADIO,
CAMERA, STAND, LAND, NAV in that order), `press(name, on)`, `litOf(name)`,
`wheelRot()`, `screenPos(name)` (also `'LEVER'` and `'WHEEL'`), `lever()` →
`{value, held, shown}`, `setLever(v)` holds the throttle at v (-1..1) as a
finger would and `setLever(null)` lets go (it must read 0 on the next frame).
The throttle is `input.throttle`; W and S are the same lever at full throw.
There is no flight brake: Space must leave the speed alone in flight, and must
still jump on foot. Roll is `[` and `]` (`input.rollLeft/rollRight`) and two
paddles either side of the CODEX disc, which are not row buttons:
`cockpit.rollNames()` → `['ROLL L', 'ROLL R']`, `cockpit.screenPos('ROLL R')`;
holding one drives `ship.angularVelocity.z` (left positive) and it must read
false again on release. Q and E must still leave it alone. Over the megaworld
`ship.levelUp` is (0, 1, 0) and a banked ship left alone comes level in about
ten seconds; everywhere else it is null. Lift-off from a pad is throttle up (`setLever(1)` or W). Touch:
a context with `hasTouch: true`, then CDP `Input.dispatchTouchEvent` at
`screenPos('LEVER')` and a touchMove 80 px up or down; check the wheel is
still on screen while the lever is held. Look at 16:9, 4:3 and a phone shape.

The disc at the centre of the dash is the CODEX button (also K, and the on-foot
≡ panel). It is not in `buttonNames()`: `cockpit.pressCodex()`,
`cockpit.screenPos('CODEX')`, `cockpit.codexLit()`. `__debug.codex` →
`open(tab)`, `close()`, `isOpen()`, `data()` → `{next, done, people, lore,
places}`, `text()`. Objectives are derived from `journal().quests` on open, so
seed `localStorage['fgsf.journal']` BEFORE load to test one. On touch the NAV
destination list is a DOM panel (`#navList`, `.nl-tab`, `.nl-row`), not the 3D
one; desktop keeps the 3D panel.

## Cinematic talks
A dialogue payload with `cine` is shown by src/cineTalk.js: bars, camera on
the speaker, big subtitles, the walker held. `__debug.cine` → `active()`,
`kind()` (`talk` | `comm`), `shot()`, `text()` → `{speaker, line, options,
from}`, `advance()`, `skip()` (stops at a choice, never picks), `pick(i)`.
Story beats use `cineOnce(key)` (saved in `fgsf.cineSeen`), so a second visit
is the plain panel: clear that key to see a scene again. Governor: land at the
town, stand 2 to the -x side of the governor (`promptText()` must read
`E — TALK`; the elevator button is nearer on the other side), key `e`. Holding
`w` during a scene must not move `ship.position`. Fleet hail: seed
`fgsf.journal` quests `{tenretni: 'ship'}` and `fgsf.tenretni`
`{at: 'wyattmattoe', eaten: ['wyattmattoe'], size: 1.5}` before load; about 3 s
into flight a `comm` scene opens, `journal().quests.fleets` becomes 0, and it
counts up as channels open. Warship captain: `vesselDock(id)`,
`vesselStepOut()`, then scan `capital.place()` round `places.bridge` until
`capital.focus === 'talk'`.

## Flight audio and lighting
`__debug.sfx.state()` → `{built, running, active, warpLevel, uiCount, duck, uiGain}`; the context only
exists after a real key or pointer press (`page.mouse.click` / `keyboard.down`).
`__debug.sun.group.position` and each planet's `sunBase` / `sunDir` let you
check a planet is lit from its bearing to the sun (zero angle unless
`cfg.sunFixed`).

## Freighter interior (C in flight)
`__debug.interior`: `stand()` / `sit()`, `blend()` (1 = fully standing),
`passes()` (both overlay passes on while standing, `clearDepth:false`),
`info()` → `{slots, paintings, hung, fullRes, solids, bounds, plaque, art[]}`,
`place(x, z, yaw)` (teleport + wall push-out, ship-local metres: -z nose, the
hall runs z 5.5..35.5, lounge to 41.5), `nearPainting()` → title or null.
Paintings fetch on the first stand; wait on `info().hung`.

## Emberdeep mine + aft patio (Rustia quest line)
Rustia's town (Redline Claim) has a mine head beside the pad walkway:
`walkSite().minehead` → `{spot, cage, door (city-local), rot, module, structure}`.
Teleport the surface walker into the cage (`minehead.spot`), run a few
`walkFrames`, and `promptText()` reads `E — RIDE THE CAGE DOWN`; key `e` (or
`minehead.module.interact()`) starts the descent. Underground, `walkSite().mine`
(null on the surface) → `{mWalk, mine, info, places, lights, fog, place(x, z),
canStand(x, z), finishRide(), promptText(), interact()}`. `mWalk.pos` is
MINE-LOCAL (+Y up, cage landing at the origin, the workings along +Z):
`mWalk.ride` is `'down' | 'up' | null`, `cageY` 120 → 0, `gate` 0..1; the ride
is stepped in the physics tick, so `walkStep` drives it (about 11.5 s each way —
`finishRide()` skips to the last centimetre). `place()` returns false for a spot
that is not standable (rock, a column, a pew), which is the cheap way to probe
collision; `places` names the rooms (`station, tunnel, stope, ore, narthex,
naveWest, naveMid, aisle, chapel, chancel, column`). Set `mWalk.yaw` (0 = +Z,
down the nave) / `mWalk.pitch` / `mWalk.view` for screenshots. The surface is
NOT stepped while underground: `walkSite().warzone.debug()` is frozen, the
planet's `group.visible` is false, and `G` only toasts.
`__debug.renderState()` now also returns `exposure`, `bloom {threshold,
strength}` and `fog {density, color}`: underground they read 0.9 / 0.95 / 0.7 /
0.0095; after the ride up they must equal the surface's values again, and after
a `walkExit()` from underground they must equal flight's (1 / 0.85 / 0.9 / null).
A floating-origin rebase underfoot can be simulated with
`ship.position.set(0, 0, 0); walkStep(1)` — the mine group must move by the
same amount and `mWalk.pos` must not change.

Quest state: ore pickup is `E` within 2.3 m of `mine.orePos` (the crate in the
stope) → `__debug.inventory().cargo` gains `emberOre` and
`journal().quests['rustia-emberdeep']` goes `found` → `ore`. Leaving: stand in
the cage (`place(0, 0)`), `e`, then `walkStep` until `walkSite().mine` is null —
the walker is back at `minehead.spot` on the planet. The governor
(`citizens.citizens.find(c => c.dialogue === 'governor')`, standing at the
penthouse `city.homes[].anchor`) takes the ore on `E`: `inventory().upgrades`
gains `patio`, `cargo` empties, the journal stage becomes `done`. Both persist
in `localStorage['fgsf.inventory']` (`cargo`, `upgrades` arrays — seed that key
before load to test the patio without playing the quest).

Patio: `__debug.interior.info().patio` → `{owned, door, deck: [z0, z1],
aftLimit, onDeck}`. Without the upgrade `place(0, 44)` is pushed back to
z = 41.2 (the stern window); with it the doorway at |x| < 1.36, z = 41.5 is
open and the deck runs to z = 49.1 (walker limit 48.8, |x| ≤ 4.7). Furniture on
the deck is solid (table on the centre line at z ≈ 46.5, loungers at x = ±2.3):
walk aft along x ≈ 1.2 to reach the rail. For a view, `pose(name)` then turn the
ship 180° about its own Y (the patio faces AFT) before `stand()`; yaw `Math.PI`
looks aft. The interior only walks on real frames (`updateInteriorCamera`), so
hold `input.forward` across a `waitForTimeout`, not `walkStep`.

Screenshots at `quality.set('high')` take 30-60 s each under SwiftShader at
1280x720 — use a 960x540 viewport and a long `page.setDefaultTimeout`. Do not
edit source while a headless run is in flight: Vite's reload drops `__debug`.

## Warzone (towns on terra / rustia / wyattmattoe)
The combat loop runs at render rate, not in `stepWalk`: drive it with
`__debug.walkFrames(n, dt = 1/30)` (each frame also runs two physics ticks).
`walkSite().warzone` exposes `debug()` → `{wave, phase, queue, enemies[{type,
state, attack, hp, hpMax, x, z, air, radius}], flyers, shells, patches, crates,
weapon{id, owned, charge}, colliders, ring, player, aim, hp, dead, trauma}`,
plus test hooks `forceWave()`, `forceBoss()` (next wave is the titan),
`spawn(type, x, z)` (`brute|spitter|stalker|titan|swarm`, city-local),
`clear()`, `giveWeapon(id)`, `switchWeapon(id)` (`carbine|scatter|lance|
plasma|arc`). To fire: `input.locked = true; input.fire = true`, step frames,
release. Spawn along `debug().aim` from `debug().player` to put a target under
the crosshair. Weapons found from crates persist in `__debug.inventory()`
(`weapons`, `trophies`, `record`); `giveWeapon` is session-only.

## wyattmattoe resort (lifts, riders, storm + aurora)
`walkSite().wyattmattoe` exposes `lifts`, `riders`, `storm` (world/wyattmattoe-*.js).
Everything positional is in planet.surface's frame (see "Surface-child frames").
The lift and the storm clock are stepped from `stepWalk`, so `walkStep(n)`
drives a whole ride or a whole storm synchronously; riders and all visuals
advance in the render update (`walkFrames`). Sky/fog values are only written
in the pre-render hook: after changing the weather, yield real frames
(`__debug.paused = true` + `waitForTimeout`) before reading `scene.fog` or pixels.
- `lifts.info()` → `{state: none|wait|ride, rideUp, baseIsTop, length, rise,
  maxGrade, towers, towerHeights, chairs, loopLen, bottom, top, loadUp,
  loadDown, dropUp, dropDown, speed}`. The line is probed per landing; at the
  Kite Saddle pad `baseIsTop` is true (the basecamp terminal is the top, the
  lift drops 85 u to the lake). Put the walker within 5.5 u of `bottom` / `top`
  and `promptText()` reads `E — RIDE THE LIFT UP` / `DOWN`; key `e` (or
  `wyattmattoe.interact(lifts.bottomEntity | lifts.topEntity)`) starts it.
  While riding `walk.mode === 'lift'`, `walk.grounded` is false and the prompt
  is `E — HOP OFF`; the ride ends grounded at `dropUp` / `dropDown`.
- `riders.info()` → per rider `{kind: board|ski, state: run|queue|lift, s, alt,
  speed, chair, pos}` (`s` falls from `lifts.info().length` to 0 on a run;
  `pos` is null on the chair).
- `storm.trigger(seconds?)` starts a storm now, `storm.triggerAurora(seconds?)`
  cuts to the aurora, `storm.clear()` clears the sky. `storm.debug()` →
  `{phase: calm|storm|aurora, clock, span, storm, aurora, windSpeed,
  nextStormIn, snowVisible, domeVisible, auroraVisible, weather}`.
  `walkSite().planetSky.debugSky().weather` is null on every other world.
- The town there is a warzone: monsters will kill a walker left standing for
  a minute of `walkFrames`. Call `walkSite().warzone.clear()` now and then in
  long scripted sequences. The day is ~700 s long, so long sequences also
  drift into night; nudge `planet.spinPhase` to re-time the sun.

## Sky City (Saturnia)
`__debug.skyCity` is the world/skycity.js instance (`group`, `pad`, `spawn`,
`colliders`, `surfaces`, `floorYAt(x, z, feetY)` — all CITY-LOCAL: +Y up, deck
top y = 0, terrace y = 6, pad off the +Z edge). `skyApproach(side = 1, speed)`
drops the ship into Saturnia's air shell (1 = far side from the city) so the
forced auto-land fires on the next tick; `skyDock()` puts it on the pad landed;
`skyStepOut()` or key `g` goes on foot. `skyState()` → `{landState, skyLanding,
skyArmed, autoT, phase, flash}`. On foot, `walkSite().sky` → `{sWalk, parked,
nearPad, floor, place(x, y, z)}`; `sWalk.pos` is city-local and `walkStep`
drives it. Walking past any edge falls: `sWalk.falling`, then the white rises
(render rate, needs real frames) and the game resets to the start in `fly`.
After a liftoff `skyArmed` stays false until the ship is 300 u past the shell.

City features: `skyCity.dragon` (`summon()`, `alive`, `position` city-local,
`hitTest(origin, dir)`, `explode()`, `state.kills`; it only starts a visit
while the camera is within 5000 u). `skyCity.lance` → `{bottom, top, room,
turret}`; place the walker on `lance.bottom` and press `e` to ride up
(`sWalk.inRoom`), set `sWalk.yaw/pitch` at the dragon and call
`walkSite().sky.fireLance()` (debug shot along the look, generous aim). The real
flow: place the walker within 4 u of `lance.room`, `e` seats you (`sWalk.gunning`);
`sWalk.yaw/pitch` are the aim, `gunYaw/gunPitch` the barrel (slews at 0.8 rad/s);
`walkSite().sky.pullTrigger()` starts the 0.55 s charge, the beam fires down the
bore; `dragon.dying` is true for 6.5 s after a hit. `g` leaves the seat.
A car off the track sets `cars[i].rescue` (`fall|hook|tow|lower|shop`) and ends
in `skyCity.shop.bays[i]`; the player's race then ends on foot at the booth.
Track v2: `skyCity.track` → `{n, pts[{x,y,z,tx,tz,sy,curv,gap,fast}], top,
length}`; `skyCity.trackAt(x, z, y)` → `{i, lateral, y}` or null (gaps are
air). Cars carry `y, vy, air, kx, kz` (jump + collision shove); `race.bumps`
counts contacts, `race.rival/won/engineWon/level` describe the card. A bot
needs to slow for the two 90-degree corners (see curvature) and hold 36+ into
the jumps. Standing: `localStorage['nova7.skyrace']` = `{wins, races}`;
`skyCity.refreshPoster()` repaints the poster.
`walkSite().sky.audio` → `{built, running, plays, drone, level}` for
world/skycity-audio.js (`plays` counts one-shots; `drone` is the rotor gain).
`skyCity.booth` + `e` starts a race: `walkSite().sky.race` → `{active, phase:
grid|go|done|fell, cars[], place}`, `cars[0]` is the player (`x, z, heading,
speed, lap, i, out`); drive with `input.forward/left/right` and `walkStep`.
`skyCity.track.pts[i]` is the centre line at bearing i degrees. `walkSite().sky`
is a snapshot: re-read it for `focus` / `nearPad` after moving.
`walkSite().sky.crowd` is the aliens.js crowd (rigs promote within 26 u).

## Surface-child frames
Landing-site content is parented to `planet.surface` in its UNROTATED frame.
To convert world → surface-local: subtract `planet.body.position`, then
`applyAxisAngle(+Y, -planet.surface.rotation.y)`. Module content (city group,
wavemall's `mall.anchorPos` / `anchorQ` / `anchorQInv`) is placed in that frame.

Wavemall prime is one building on a fixed registry site. Mall-local
coordinates: +Y up, the facade faces +Z, level `i`'s floor is at `y = i * 12`,
the atrium void is `|x| < 13`, the promenades run `13 < |x| < 18.5`, and the
landing pad is at `(0, 170)`. Round-trip a mall-local point with
`p.applyQuaternion(mall.anchorQ).add(mall.anchorPos)` (then the surface→world
rotation above). `walkSite().wavemall` exposes `floors` (8 entries, each
`{level, dept, group, invQuat, floorY, rects}` — one crowd per level lives in
that frame), `pad`, `crowd` (the plaza), `wonders`, and `segmentHit`.
`interiorCrowds` is one bounded crowd per level, indexed level 0..7.

## Gotcha: frame-phase teleport artifact (harness-only)
`updatePlanets` advances `surface.rotation.y` after `stepWalk` within a frame.
A teleport computed in one `page.evaluate` using `surface.rotation.y`, followed
by real rAF frames, lands offset by one frame's spin — under headless
throttling (1-2 s frames) that's 5-20 m of apparent displacement and fake
jitter in samplers. NOT a game bug. Do teleport + `walkStep(n)` + position
reads inside a SINGLE `evaluate` for exact results; treat cross-evaluate
position deltas as approximate.

## Worth driving
- Walk physics: teleport + `walkStep`, read back position (walls block, floors
  lift, `walk.grounded`).
- NPC interaction: crowds scan in the module's local frame — call
  `m.update(dt, playerLocalVec, 1)` a few times with the player nearby before
  `m.nearestInteractable(playerLocal, r)`; `m.interact(e)` returns the dialogue
  payload, then `m.endInteract(e)`. Town citizens (`walkSite().citizens`)
  y-gate their scan: put the query point within 3 u of the citizen's floor.
- Teardown: `walkExit()` then re-land; watch for pageerrors.
- Terra regression after wavemall changes (and vice versa): the walk.js spawn
  branch forks on `planet.cfg.name === 'wavemall prime'`.


## stevenlacey (the coin world)
`__debug.coin`: `world` (the coin: `hold()`, `release()`, `faceFrame`), `state()` →
`{landState, coinLanding, coinFace, coinArmed, coinLiftT, phase, flip, rate, settling}`,
`approach(face)` (1 heads, -1 tails: drops the ship outside the capture radius, closing),
`dock(face)` (parked on the face), `enter(face)` (straight into the 2D world).

In 2D, `__debug.walkSite().coin` → `{mode ('in'|'play'|'flip'|'out'|'gone'), face, landFace, save,
team, player, focus, prompt, battle, teamMenu, boss, level, ents}` plus test hooks:
`put(x, y)` (tiles; y is the feet row, 30 on the main floor), `press()` (an E press),
`give('claw'|'dash'|<specimen id>)`, `setTeam(ids)`, `heal()`, `battleWith(id|'champion')`,
`endBattle('win'|'lose'|'run')`. Drive it with `walkStep(n)` and `input.left/right/brake/
sprint/warp`; wait for `mode === 'play'` after `enter()` (the fold-in takes about 2 s of
sim time). E is ignored for 0.4 s after a battle or a pickup, so step ~30 ticks first.
Leaving: put the walker by `level.pad`, press `g`, wait for `coin.state().phase === 'fly'`.

The terrarium: `__debug.interior.stand()`, then
`interior.place(-2.4, 1.5 + C.FREIGHTER_VEST_L + C.FREIGHTER_HALL_L + 2.0, Math.PI / 2)`;
`interior.nearTank()` and `interior.tankView()` report the prompt and the close-up. Seed
`localStorage['fgsf.inventory'] = '{"specimens":["sprout","puddle"]}'` before load to fill it.

## Indigo Reach (Neptunia)
Neptunia is all ocean and `noLand`; `walkHere()` does nothing there. The ship
(`__debug.reachShip`, world/reachship.js) is built at boot. Its ANCHOR frame is
static (+Z the bow, y = 0 the still sea, origin amidships); the hull rides the
swell inside it (`reachShip.pose` → `{heave, pitch, roll}`).

- `reachView(dist, height, bearing, sunny = true)` parks the camera looking at
  the ship and pauses. It freezes the planet's spin; `paused = false` to resume.
- `reachApproach(side = 0 | 1, speed)` → capture next tick → wait on
  `reachState().landState === 'auto'` then `'landed'`. `reachDock()` skips the
  flight. Key `g` steps out (an ordinary town walk: `walkSite().city` is the
  ship), `g` near the freighter boards back onto the pad, `w` lifts off.
  `reachState()` → `{landState, skyLanding, armed, dock, phase, frozen}`.
- `reachStepOut()` goes straight onto the flight deck. `reachPlace(x, y, z)`
  teleports the walker to an anchor-frame point. Decks: flight 13 (pad at
  0, -100), main 10, mess 15, bridge 20, hold 5. Governor: (0, 20, -26) —
  stand within 3.2 to get `E — TALK`.
- `reachSea` is the wave patch: `scale` (0 off .. 1), `waveAt(x, z, time)` is
  the sea height the walker swims on. Swimmers must read `swimming: true` about
  0.55 under that height.
- The charge: `reachQuest('neptunia-indigo', 'done')` finishes the tour,
  `reachCharge('go')` unseals the lift, `reachCharge()` clears it.
  `reachShip.tube` → `{state: {mode, cabY}, habY, spots, module}`; mode is
  `top | down | bottom | up`, stepped from stepWalk, about 24 s each way.
  `reachBlow()` presses the arm button: wait on `shatter.active`, the phase
  goes `explode` then the death menu. `shatterView(distR, az, lift)` frames
  both halves. The state persists in `localStorage` (journal quests): always
  finish a run with `reachCharge()` so the next boot is not already broken.
- After touching src/shaders/{surface,water,cloud}.frag re-run the Sky City
  steps and walk a Terra town: all planets share those shaders.

## The Crown errand (GDD 5.7.6)

Stage is `journal().quests['terra-errand']`; `__debug.errand(stage)` sets it,
`errand()` reads it (saved: seed `fgsf.journal` / `fgsf.inventory` before load
rather than leaving a stage behind). Cargo ids `crownFurniture`, `raceCar`,
`crownSeal`; the chosen suite piece is `inventory().decor`.

- **Terra.** `walkSite().city.homeTower` is the pilot's tower (`topY` 66,
  `bedSpot`, `propIds()` for what stands in the suite; `city.elevator.propIds()`
  for Axilo's penthouse). Stand at `bedSpot` on the suite floor: prompt
  `E — SLEEP`. `walkSite().sleep()` then `walkStep(200)`; `sleepState().sunDot`
  rises to about 0.25. Axilo is `city.homes.find(h => h.penthouse).anchor`;
  stand 2 in front of him along `face`.
- **WaveMall.** Maribel is `interiorCrowds[0].citizens[0]` (floor-0 frame);
  `walkSite().mallPicks.spots` lists the six pieces `{id, level, x, y, z}` in
  their floor's frame. Prompts `E — TAKE THE …` only at stage `pick` with no
  piece owned.
- **Sky City.** `walkSite().sky.cantor.spot` is the High Cantor. At stage
  `race` the booth prompt reads `E — RACE VEX HALCYON`; to force a win set
  `race.cars[0].done = true; finishT = 1` with the others not done, `walkStep(5)`.
- **The wreck** (needs `reachBlow()` or a `blown` save): `wreckApproach()` →
  `skyState().landState` `'auto'` then `'landed'`; `wreckDock()` skips the
  flight; `wreckStepOut()`; `wreckState()` → `{inside, lampOn, lampI, sunI,
  ambI, relic, held, q}`. `q` must not change while `held`. `walkSite().capital
  .places` has `pad`, `stairs`, `bridge`. The walked route is flight deck →
  side ramp (x 17) → main deck → outboard stair (x 20, z -54 to -27) → tier-2
  walkway aft to z -54 → stair up (x 16) → round the rail's end at z -32 →
  aft door (x 0, z -34). Press `l` for the lamp.

## Tenretni (the governor's secret)
`__debug.tenretni` → `{loaded, load(), arrive(), start(), seek(u), state()}`.
The chunk only loads when `journal().quests.tenretni` is `armed` or `done`:
seed `localStorage['fgsf.journal'] = {"codex":[],"outcomes":[],"quests":{"tenretni":"armed"}}`
and `fgsf.inventory = {"upgrades":["patio"]}` before load. `arrive()` stands in
for the NAV warp to terra (`navMenu.tap('terra')` is the real route); wait for
`state().state === 'wait'` (ship pinned 2600 from terra), then
`interior.stand()` + `interior.place(1.2, 48.5, Math.PI)` starts the script
(`'play'`). `seek(u)` jumps the 90 s clock (beats at 6, 20, 36, 50, 66, 82);
set `__debug.paused = true` after a couple of seconds to hold a frame for a
screenshot. At `u = 90` the stage becomes `done`, `state().drain` is 1 and
`noLand` true; a reload must come back in the same state. Poll with
`page.evaluate` in a loop rather than `waitForFunction` — rAF polling starves
under SwiftShader while on foot.

Act two and the worldship: `seek(u)` runs to 165 (bore open by 150, capital at
160); `state()` adds `held, at, sailing, bore, spinLock, capital, terraPos`.
Seed `quests.tenretni = 'done'` plus `fgsf.tenretni = {"city":[0.956,0.174,-0.236]}`
to watch act two start by itself, or `'ship'` with
`{"city":[...],"bore":[-0.18,-0.17,-0.97],"rotY":0.046,"at":"terra"}` to start
from the finished ship. `__debug.capitalDock()` parks on the capital's pad,
`capitalStepOut()` walks; a real capture is: put the ship ~1900 from terra's
centre moving inward and wait for `skyState().landState === 'landed'`
(`skyState().dock` says `'capital'` or `'sky'`). On foot,
`walkSite().capital` → `{cWalk, place(x,y,z), focus, prompt(), floor, interact}`;
places: plaza (0,0,30), command dais (0,3,-67), navigation console (79.5,0,0),
pad (10,0,91). `tenretni.story()` returns the dialogue source; `tenretni.sail(name)`
starts a voyage without the console (`'wyattmattoe' | 'neptunia'`), about 42 s.

Assimilation (stage `ship`): arriving from `tenretni.sail(name)` starts it by
itself. `state()` adds `eaten[], size, radius, eatingNow {name, u}, removed[]`.
`tenretni.eat(u)` seeks its clock (beats: melt 12–26 on wyattmattoe only, swarm
27, strike 56, drain to 73, break-up 84–104, growth to 112). Afterwards the
planet is in `removed`, absent from `navMenu.rows('planets')`, and
`planets[0].radius` is 1500 then 2250. Do NOT call `__debug.launch()` mid-way:
a world reset finishes the assimilation instantly. Park the test ship well
clear before a voyage (`ship.position.y += 40000`) or the capital's dock will
capture it as the worldship sails past.

Holodeck and clock: seed `fgsf.tenretni` with `eaten: ['neptunia','wyattmattoe']`,
`size: 2.25` and the `holodeck` upgrade is granted at load. `__debug.holodeck` →
`{active(), start(id), end(), programs(), panel(), near(), spot()}` (note:
`__debug.holo` is the navigation hologram). The room: `interior.stand()`, then
`interior.place(spot.x, spot.z, -Math.PI / 2)` puts you at the panel; key `e`
opens it, a digit runs a program, `g` ends it. After a program the ship's
absolute position (`originOffset + ship.position`) must equal what it was, and
`tenretni.state().removed` must list the world again. Programs build real
worlds: allow 10 s+ and long screenshot timeouts. `tenretni.clock(sec)` sets
the idle clock: a large value makes the next meal start at once, a large
negative one holds it off. `state()` adds `clock, next, exiting, ended`.

Fleets: exist from the first seconds of free flight on any save
(src/fleetHost.js), before the Tenretni chunk is loaded: `tenretni.fleets()` is
the live object either way. `fleets().warState()` → `{on, k, center}`: on a
fresh game `k` rises to 1 and all nine warships fly passes round `center` with
fighter swarms in each other's colours; with `quests.tenretni` `done` or `ship`
it is 0 and they are on guard orbits. Only the three flagships (`state()[i].lead`:
`rustia:w0`, `saturnia:w0`, `wavemall prime:w0`) are on the chart
(`navMenu.rows('fleets')` is exactly three rows), can be docked on, give a
channel, and cannot be destroyed (`destroy(id)` returns false; an old save's
`lost` entry for one is ignored). Before Tenretni a flagship's captain says
that people's `VOICE.war` lines (world/fleet-dialogue.js) and offers nothing.
The story adopts the fleets once `eaten` has any entry. `tenretni.state().fleets` →
`[{id, alive, kind, pos}]` (ids like `rustia:w0`, `saturnia:f1`,
`wavemall prime:w2`); `tenretni.fleets()` is the live object (`ships[].group`,
`destroy(id)`, `alive(faction)`). `navMenu.rows('fleets')` lists them and
`navMenu.tap(id)` flies there (stops ~2.4 hull radii out). Freighters move
~200 u/s: frame them quickly or pause.

Boarding: put the ship ~900 above a fleet ship (along its own +Y) moving in;
wait for `skyState().landState === 'landed'` with `dock: 'vessel'`
(`__debug.vesselDock(id)` skips the flight, `vesselStepOut()` skips G). On foot
it is `walkSite().capital` again; `fleets().ships[i].site.places` →
`{pad, bridge, gun}`. Captain: stand at `bridge` +7 in x, key `e` through the
lines, `1` opens the channel (`tenretni.comms()`). Gun: stand at `gun`, `e`
seats you (`capital.gun.active`), set `gun.yaw/aimYaw/pitch/aimPitch` to the
target's bearing in the ship's own frame, `e` fires; the target's `alive`
goes false and its id is in `fgsf.tenretni.lost`. `g` stands down.

The boarding kit is a pad, a glazed companionway and an enclosed bridge:
`walkSite().capital.rooms` → `[{x0,x1,z0,z1,ceil}]` (companionway, bridge) and
`.places` in the ship's own frame. Holding `input.forward` from `places.bridge`
at any yaw must leave `cWalk.pos` inside a room (no wall colliders: the floor
rects stop short of the glass). Fleet poses are set by `fleets().place(t)` at
the top of the frame, so `camera.position` taken into `ship.group` local space
must not move while standing still. Flicker check: two screenshots 0.7 s apart
from `places.pad` in first person, lower half identical.

The ending: `tenretni.setComms(true)` opens all three channels; put the ship
within 9000 of terra's surface and `tenretni.end().state()` → `{v, done, ready,
missing, star}` reads `ready: true` and the CALL THE FLEETS button shows; key
`h` calls. `tenretni.end().seek(u)` jumps the script (ring by 20, volley
30–34, star at 34, falls from 38, black hole 62, done 74). Afterwards
`planets.every(p => p.removed)`, `sun.group.visible === false`, the black hole
is at the sun's position, and a reload or `launch()` must come back the same.
The run is destructive to the save: use a fresh browser context.

The rally and the far side: after 74 `end().state()` adds `rally`
(`'cheer'` → `'offer'` → `'go'`), `rallyT` and `worm` (the wormhole's position
once opened). `end().skipRally()` jumps the cheer's lines (about 40 s, and the
clock only runs while flying); at `'offer'` the second button shows and key
`h` (or `end().together()`) starts the last act: `navMenu.rows('planets')`
gains THE WORMHOLE, every surviving ship (freighters too) forms on the pilot
(`fleets().following()`), and the autopilot stops about 4100 from the mouth.
Hold `w` to fly in, or put `ship.position` on `end().state().worm`
(`__debug.farArrive()` skips the flight): `skyState().phase` goes `'collapse'`
→ `'respawn'` → `'fly'` with NO page reload (set a `window.__sentinel` first
and count `framenavigated`). Then `tenretni.state().ended === 'far'`, the saved
`fgsf.tenretni.end` is `'far'`, `blackhole.gone` is true, and
`navMenu.rows('planets')` is only CAGED STAR.

`tenretni.far().state()` → `{active, fade, altitude, groundY, cell, cages:
[{cell, abs, dist}], points, lite, blocks, towers, wormhole, bodyRadius,
leash, beam}`. `lite` is how many distant cages are drawn as instanced cages
(not points); `blocks` the distant city's instance count (tier-dependent).
The leash (first visit, until the Landing has had the helm): `leash` →
`{r, h, bound, out, zoneR: 7800, zoneTop: 22500, best, outT, exploreT}`,
`r`/`h` the ship's horizontal distance from the landing's star (cell 21,21)
and height over the plane. Put the ship 5 km from that star 9 km up: `out`
false and no landing. Move it to r 9.5 km (or h 23.5 km): the toast reads
`THE BEAM IS TIGHTENING…`, and 4 s later `skyState().landState` is `'auto'`
with `dock: 'landing'` and `beam` true, then `'landed'` with `beam` false.
From the arrival point, backing ~3 km further from the star than it has been
pulls the same way; 1.4 km does not. `FAR_EXPLORE_TIME` (240 s) pulls anyway. `tenretni` is a
snapshot object: read `tenretni.state().loaded`, not `tenretni.loaded`. Checks
that must hold: `launch()` and `page.reload()` both come back to the far side
at the arrival point with the fleet in formation and no ending button; a cage's
`abs` does not change across a floating-origin rebase; idle flight settles at
`FAR_CANOPY` + ~50 with heat 0; a warp dive never goes under; a climb stops by
`FAR_CEIL`; the old mouth position does nothing; a holodeck program hides the
megaworld and puts the ship back where it was. Seed `end: 'far'` (with
`quests.tenretni: 'ship'` and a non-empty `eaten`) to boot straight into it.
SwiftShader starts at LOW: `quality.set('medium')` before judging the look
(towers follow the tier live). Screenshots at medium take a minute.

The landing and the City of Light: `far().state()` adds `landing {abs, dist}`,
`station`, `inCity`. `__debug.farLanding` → `approach()` (puts the ship over
the pad; the dock then flies it down: wait for `skyState().landState ===
'landed'` with `dock: 'landing'`), `dock()` (parks on the pad at once),
`stepOut()`, `door('city' | 'pad')` (runs the door's white without the walk),
`state()` → `{doorT, doorTo, dock, platform, isolated, far}`. On foot it is
`walkSite().capital` again (`place(x, y, z)`, `cWalk.yaw`; set
`localStorage['sf-walk-view'] = 'tp'` before load to skip the view chooser).
Landing frame: pad (0, 0.14, 70), door plane z = -64, facing -z is yaw π. City
frame: door plane z = 10 behind the arrival, balcony about (0, 0, -15), terrace
(0, 0, -77), greeter at (0, 0, -82). To walk a door for real, `place` 5 short
of its plane facing it and set `input.forward = true`; the flag is raised from
the per-frame visuals, so wait real time, not `walkStep`. Checks: landed, the
fleet is `stationed()` on a ring ~3,200 out and ~2,600 up with none lost; on
the platform `isolated.active` is false; in the city it is true with
`camera.far` 4000 and every fleet hull hidden; E at the greeter opens
`#dlgPanel`, saves `fgsf.tenretni.met` and adds the codex entry (an open
dialogue holds the walker still: X closes it); back through the door restores
`camera.far` 1e6, `sun.light.intensity` 2.4 and `sun.ambient.intensity` 0.8;
`launch()` from inside the city must restore the same. More of the city
frame: gallery (-112, 0, -77), Pavilion centre (92, 0, -77), its lift pad
(115, 0, -77), the suite's floor (176, 300, -176) with its pad at (176, 300,
-167). E on a lift pad moves `cWalk.pos` to the other floor
(`walkSite().capital.prompt()` reads the pad's prompt; `.floor` reads 300 in
the suite). Walking pace in the city is 10 u/s (twice the usual 5).

The world race is one plain circuit (`world/racecourse.js` `circuit()`): two
laps, about 21 gates of radius 20, no more than ~35° of turn in any 100 units.
Start it at the Starter's stand: `capital.place(9.5, 0, -61)`, `e` until
`#dlgPanel` shows WHICH WORLD?, then a digit. Hands off, the help alone clears
the gates (`race.missed` stays 0). `raceSet({ s: 0.985, lap: 1 })` jumps to the
finish.

The light ship's rooms (`world/holoprops.js`): each fragment is a moving
hologram of the thing, built twice: out in the world the room projects (the
sky's is the room's whole sky, the light hangs in it, ground, structures and
life stand 13 to 27 beyond the room's middle past their own plinths: `SHOW` in
world/lightship.js) and small on its plinth, each with a name sprite. From
`place(cx - side * 8.5, 0, cz)` facing the far side with `cWalk.pitch = 0.22` a
screenshot must show the five named things; standing within 2.6 of a plinth
lights its pair and draws a line between them.

Out in a room's world the things are solid and lit (Lambert, no outlines), with
two or three more of each further off; only the plinth copies are holograms.

Story branches (src/chapter.js): `chapter().side()` is whose part the pilot
took in the Pavilion (`vask` | `marrow` | `lux`, saved as `ch.side`). At stage
`suite`, E on any Pavilion captain (Vask stands at about (83, 0, -85)) runs
their lines and then asks WHO IS RIGHT?; a digit settles it, and after that
each captain says `ARGUMENT.after[side][id]`. `chapter().diveLines(base)`,
`keeperTalk()`, the Entry Zero accept and `revealAfter()` each carry a line
for the side. The picks: `chapter().carried()`, `carriedLine('marrow' | 'lux')`,
`racer()` (the world they make: the Starter's first option, YOURS), and once
`home` is set `far().state().taken` is the number of them standing round the
City of Light (seed `picks` and `home`, then look west from `place(-8, 0, -77)`).

The Last Seam: on a new game, about 55 game seconds after the war is at full
strength, `rustia:w1` is destroyed and a comm scene from Vask opens
(`fgsf.warloss` = '1', codex `The Last Seam`). `tenretni.warLoss(2)` brings it
on in two seconds; `warLoss()` reads `{in, done}`. On any save where the war is
over that ship is already gone, so the fleets number eight warships.

The radio is silent inside the megaworld: `__debug.radio.area()` → `{area, to}`
reads `to: 0` while `far().state().inSub` or `onGround`, 1 otherwise, and the
radio popup says NO SIGNAL DOWN HERE.

The CODEX has an objective at every stage past the wormhole
(`codex.data().next[0]`): seed a stage and check it is not empty.

City life (`world/lightlife.js`): `far().state().life` → `{people, figures,
walking, at, lanes, craft, craftAt}`. Saturday's way in is its west end: from
`place(46, 0, -152)` facing +x (`cWalk.yaw` ≈ π/2) with `input.forward`, the
walker reaches x > 58 at y 0. The race state adds `missed` (the pilot's missed
gates). GTAO (`__debug.ao`) reads normals: a ShaderMaterial floor whose
geometry has no `normal` attribute renders black under it.

The megaworld chapter (GDD 5.7.4): `tenretni.state().chapter` → `{stage, home,
picks, seen, assigned, clock}`; `__debug.tenretni.chapter().go(stage)` jumps the
story (`suite`, `demo`, `holo`, `dive`, `shuttle`, `stall`, `canvas`, `birth`,
`return`, `done`). Seed `ch: {stage, picks, seen, assigned, clock: [ship,
world], home}` inside `fgsf.tenretni` to boot at a scene, and `fgsf.firstentry`
`{v: 1, strokes: [[[x, y], …], …]}` for a drawing. From inside the city,
`farLanding.door('ship' | 'bridge' | 'shuttle' | 'gallery' | 'hall' | 'hatch')`
hops between the chapter's places. `far().state()` adds `demo`, `inShip`,
`ship`, `onBridge`, `dive`, `diveSeek(sec)`, `inShuttle`, `shuttle`,
`shuttleSeek(sec)`. Frames: suite hologram toward (0.48, -0.88) from the
suite's centre, the Archivist at about (172, 300, -184); the demo and boarding
console at the gallery (-124, 0, -77); aboard, rooms at x ±24, z 14 / -14 / -42
with the bridge door at z -62; on the bridge the helm console at (0, 0, -2.9)
and the hatch at (0, 0, 5). The dive's clock: settle at 20 s, flood from 53 s,
end at 75 s. The shuttle's: bottom at 22 s, dream 24–74 s, awake at 79 s.
The canvas is DOM (`#chPad`): draw with `page.mouse` on its canvas, or
`(await import('/src/drawPad.js')).drawPadDebug.stroke(points)` / `.done()`.
The subtitle line is `#chHud .line.show`, the clocks `#chHud .clocks.show`.
Under SwiftShader the city runs at about 4 fps, so anything timed in game
seconds takes two to three times as long in real time: wait on state, never
on a timeout.

Entry Zero (GDD 5.7.5): the stages after `done` are `ez_offer`, `ez_descent`,
`ez_firewall`, `ez_deep`, `ez_centre`, `ez_relics`, `ez_reveal`, `ez_ascent`,
`ez_era`, `ez_launch`, `ez_beyond`; `chapter().go(stage)` takes them, and
`chapter().ezOpen()` reads true once `done` and `epilogue` hold and the pilot
has settled in: `chapter().settling()` → `{raced, slept, sites, need: 4, due}`
(`markRaced()`, `markSlept()`, `markSite('seam' | 'bell' | 'saturday' |
'monument')` set them; a finished world race sets `raced` and `monument`, the
three district finds set theirs, the suite bed's `E — SLEEP` sets `slept`).
A save at `ez_offer` or later is open regardless. Seed
`ch.ez = {log, frags, stay, lost, node, clock}` (`log`: one bit per lamp band,
63 is all six; `frags`: one bit per relic, 7 is all three; `stay`: a captain
id; `lost`: captain ids). `chapter().state().ez` reads it back. The story
chunk only loads with `fgsf.journal` `quests.tenretni` `'armed'` or `'done'`:
seed that too, `__debug.launch()`, then wait for `tenretni.chapter()` to be
non-null. The offer (`world/entryoffer.js`): with `done` and `epilogue` seeded,
entering the city says `OFFER.found` on `#chHud .line`, and
`walkSite().capital` → `place(-5.3, 0, -4.9)` puts the walker beside the
Archivist at (-6.5, 0, -5) on the balcony (the three captains follow the
pilot and take the E prompt from any further off). E opens the offer; `e`
three times then `1` accepts: stage `ez_offer`, codex `Entry Zero`. The wall
is 330 cells beyond the west rail, the dark one at column 19, row 5
(`far().state()` city `info().offer`).

The submersible and the well (`world/submersible.js`, `src/lamp.js`): with
`ez_offer` seeded, the console at (10, 0, -4) on the balcony reads `E — BOARD
THE VESSEL`; `interact()` there, or `farLanding.door('well')` from inside the
city, hops under the white (`'wellup'` hops back). Then `far().state()` has
`inSub`, `sub` → `{at, vel, yaw, pitch, lamp: {band, on, all, energy, dose,
cabin, medium, reach}, found, targets: [{band, p}], motes, hud, audio}` and
`subSet({at, look, yaw, pitch})`, which puts the vessel somewhere pointed
somewhere. `farLanding.state().far` reads 9000 in the well and 4000 back in
the city. Keys: `e` / `q` step the band (`sub.lamp.band`), `l` is the lamp;
`input.forward` / `left` / `right` / `brake` (rise) / `sprint` (sink) drive
it. To find a target, `subSet` the vessel to 0.55 of the target's x and z,
30 above it, `look` at its `p`, step to its band and wait for its bit in
`sub.found` (0.8 game seconds; the line is `CALIBRATED — …`). The radio
target is never drawn: `sub.audio.radio.near` goes to 1 as the lamp points
at it. Rising through the ring (`subSet({at: [0, 120, 0]})`, `input.brake`)
returns to the city at (7.5, 0, -4) with `#ezHud` hidden.

The hollow (`world/hollow.js`, `world/hollowlife.js`): the membrane under the
well opens (`sub.gate` → 1) once every target is found (`subSet({found: 63})`)
or the stage is `ez_descent` already. `subSet({at: [0, -720, 0]})` then starts
the lattice pulse (`sub.ride` ≥ 0 for 5.5 game seconds, -1 when over) into
zone `max(1, ez.node)`: `sub.zone`, stage `ez_descent`, `ez.node` saved.
`sub.hollow` → `{zone, entry, exit, globes: [{c, r}], need, life: {groups:
[{kind, band, at, radius}], eaters, leeches, drinking, attached, eaterAt,
leechAt}}`. To log a group, `subSet` the vessel `radius + 40` to one side of
its `at`, `look` at it, step to its band, and wait for the band's bit in
`chapter().state().ez.log` (line `LOGGED — …`); a caller (radio) is logged
from anywhere by `look`ing at it. Zone 1 asks for blue-green and ultraviolet
(log 3), zone 2 for the other four (log 63). At `hollow.exit` with bands
missing Vask names them; with none missing the pulse takes the vessel down a
zone, and under zone 2 the lattice is dark. Do not `subSet` further than 2,600
from the line between the nodes: the zone's limit moves the vessel back.
Eaters: lamp on a beam band 150 from `eaterAt` → `life.drinking` climbs and
the lamp drains about five times faster; on H-alpha they leave. Leeches (zone
2): sit still 60 from `leechAt` → `life.attached` > 0 and `lamp.cabin` falls;
`input.forward` until `sub.vel` > 47 shakes them off. `subSet({lamp: {energy:
0.002}})` (or `dose: 1`, `cabin: 0`) sends the vessel back to the upper node
with a fresh lamp and the log kept. The whole descent takes about ten minutes
of real time under SwiftShader: run it in the background, and never edit a
source file while it runs.

The firewall (zone 3, stage `ez_firewall` on arrival; seed `ez: {log: 63,
node: 3}` with stage `ez_descent` to ride straight to it): `sub.hollow.wall`
→ `{y, burn, hole: [x, z, radius], passed}`. The hull stops 55 above `y`
(`subSet` 75 above, `input.sprint`, wait for `sub.at[1] - y` < 56). On
blue-green `burn` stays 0. On H-alpha, 240 above and pitched -1.3 at the
sheet, `burn` reaches 1 in 7 game seconds (lines from Marrow, then Lux);
stepping to another band takes it back to 0 in 4 (`It closed`). With `burn`
at 1, `subSet` 80 above `hole` and sink: `passed` goes true, the hole shuts,
and the hull is held 55 below. `subSet({lamp: {dose: 1}})` pulls the vessel
back above a whole wall. Guards: `life.groups` are three `guard` schools at
the wall; looking at one on H-alpha gives Vask's line. Radiation feeders
(zone 2): 120 from `life.feederAt`, `life.feeding` stays 0 until the X-ray
band is on, then reaches 2 or more and the dose climbs about four times as
fast; off that band they settle within 6 game seconds.

The oldest strata (zone 4, stage `ez_deep` on arrival; seed `ez: {log: 63,
node: 4}` with stage `ez_firewall`): `sub.hollow` adds `slabs` (34), `slabAt`
(the first three: `{c, h}` centre and half extents), `pull` (u/s² down at the
vessel; 0 at the top, 7 at the bottom) and `caller` → `{at, dist, coming,
hold}`. Weight: `subSet` four fifths of the way to `hollow.exit`, hands off,
and `sub.at[1]` falls. Rock: `subSet({at: slab.c})` and the vessel is put
back outside it within a frame; 330 above a slab, `look`ing at it on X-ray,
gives Lux's line after 1.5 game seconds. The listener: `caller.coming` is
false until the drive is pushed (`input.brake` or any thrust), then it closes
at 34 u/s on where it last heard the vessel; 5 game seconds of no thrust and
`coming` goes false again. On the radio band `sub.audio.radio.near` is higher
`look`ing at `caller.at` than away from it, and `sub.audio.dread` rises
inside 1,300. `subSet` the vessel 60 from `caller.at` with `input.forward`
held: after 2.5 game seconds the pulse takes it back to the node (Vask: `It
has the lamp`). At `hollow.exit` Marrow says the lattice stops there.

The centre (`world/zeroplanet.js`, zone 5, stage `ez_centre`; seed `ez: {log:
63, node: 5}` with stage `ez_centre` to arrive there from the well): from zone
4, `subSet` 380 below `hollow.exit` and sink, and the vessel falls (`sub.ride`,
no streaks, Lux's line). There `sub.lamp.canAll` is true, `lamp.medium` is
`fog`, and `sub.hollow` → `{zone: 5, centre, r, alt, seen, solid, hold, reach,
asked, stay, life}`. Each band draws one thing about the planet from any
distance (`subSet` 900 above its top, `look` at `centre`). Every band:
`page.keyboard.down('z')`; `lamp.all` true, `lamp.reach` 100, `seen` → 1
(Lux: `It's only there while we look at it`). Not solid, the planet can be
flown into (`alt` negative). `subSet({at: [0, centre[1] + r + 85, 0], pitch:
-1.35})` with Z down: `solid` → 1 in 3 game seconds, `#chHud .panel` reads the
altitude, and the hull cannot go under 30. Held there 4 game seconds,
`sub.choosing` goes true and `#dlgPanel` asks who stays: `e` twice, then `1`
`2` or `3` (Vask, Marrow, Lux) saves `ez.stay`; `x` instead leaves it unasked
and it is asked again the next time the ground holds (the vessel sinks while
the light is off: `subSet` it back first, and `subSet({lamp: {energy: 1}})`).
While being asked the vessel is held still and the light kept on. After the
choice the lamp stays on every band without the key while `alt` < 260; `l`
turns it off and `solid` falls to 0 in 2 game seconds. Light eaters reach a
lit lamp over the top in about 20 game seconds and only take the ground when
`lamp.eaters` reads 1.

The relics (`world/zeroground.js`, stage `ez_relics` on arrival): with
`ez.stay` saved, the next time the ground holds for 4 game seconds the
question is the hatch (`e`, then `1`), and the hop `'ground'` puts the walker
on the ground (`'groundup'` hops back; `far().state()` adds `onGround`,
`ground`, `groundSet`). `ground` → `{light, pool, clock, hauling, relics:
[{id, band, at, found}], crew: [{id, at, dying}], lamp, stay, lost}`. `light`
runs 1 → 0 in about two minutes and `pool` 90 → 9 with it. On foot `q` steps
the band and `l` is the lamp (`ground.lamp`). To find a relic, `capital.place`
the walker 9 short of its `at` facing it (`cWalk.yaw = atan2(x, z)`,
`cWalk.pitch = -0.12`), step to its band, and wait for its bit in `ez.frags`
(writing 1, hearth 2, buried 4; line `FOUND — …`). The pilot cannot leave the
pool: `place(0, 0, 300)` comes back at `pool - 0.8`. The crew are the two
captains who did not stay and are not lost. To lose one:
`groundSet({light: 0.45})`, then `groundSet({crew: {id, at: [pool + 4, 0]}})`;
the id joins `ez.lost` (saved) and the keeper says so. `groundSet({light:
0.004})` hauls everyone up after 2.6 game seconds: back aboard at zone 5, 80
over the ground, already solid, with a fresh lamp. A second descent has one
fewer in `crew` and `light` 1 again. `interact()` at the hatch (0, 1) goes up
the tether.

The reveal (`world/zeroplanet.js`, stage `ez_reveal` when it ends; seed `ez:
{log: 63, node: 5, stay, frags: 7}` with stage `ez_relics`): aboard at the
centre with every fragment found, the hatch is not asked about again, and a
captain says to show it everything. With the ground solid, Z down for 2 game
seconds starts it: `sub.hollow.reveal` counts 0 → 36 (-1 when not playing),
`body.ch-cine` is set, the vessel is carried from where it was to 1.7 radii
up looking straight down (`hollow.alt`), `hollow.shown` reaches 1 by 9 s and
`hollow.lights` falls 1 → 0 between 22 and 31 s. The lines are `REVEAL.lines`
at 0, 7, 14 and 22 s on `#chHud .line`; no dose call or `ground went` line
may come during it. At the end: stage `ez_reveal`, codex `What Was Feared`,
Vask's closing line, bars out. Afterwards `hollow.shown` follows the lamp:
toward 1 with every band on the planet, toward 0 with the lamp off. Poll it
(`reveal` every half second) rather than sleeping: it takes several minutes
of real time under SwiftShader.

The ascent and the emergence (stage `ez_ascent` through the firewall, `ez_era`
at the end; seed `ez: {log: 63, node: 5, stay, frags: 7}` with stage
`ez_reveal`): at the centre, `subSet` 1,500 over the planet's top and rise
(`input.brake`); past 1,560 a fall-style `sub.ride` sets the vessel down in
zone 3 under the wall (`hollow.wall.rising` and `passed` true, 420 below
`wall.y`). The hull is held 55 under it. One band leaves `wall.burn` at 0;
Z down, 230 below and pitched +1.3, takes it to 1 in 3 game seconds (Marrow's
line). `subSet` 70 under `wall.hole` and rise: stage `ez_ascent`, and
`sub.emerge` counts 0 → 36 with `body.ch-cine` set. Poll it: by 2.5 s
`sub.audio.weather.rain` is above 0 with the view still dark; the vessel is
on the surface (`sub.at[1]` about 1.5) by 4 s; `sub.pitch` is level until 13
s and 0.95 by 23 s; `#chHud .clocks` shows `US` and `SURFACE 1048576Y …` from
17 s; five lines. At the end: stage `ez_era`, the hop back to the city, bars
and clocks gone. Boarding with stage `ez_ascent` saved starts the emergence
at once (`sub.emerge` 0); with `ez_era` it is the well again.

The megaworld a million years on (`src/era.js`, stage `ez_era`; seed it and
stay in flight, no need to dock): `far().state()` adds `era` (1), `rite`
(0..1), `riteT` (seconds into the rite, -1 between), `day` (the `EZ_LIGHT`
in force) and `riteNow()`; `light` reads the day's direction (0.62, 0.36,
-0.7 for `'sun'`), not the nearest star's. From the arrival point: the cages
have no star, glow or conduit up to the hole, a bright disc stands where
`light` points, and the ground is daylit. For the ground itself, lift the ship
9,000 and pitch it down (`ship.quaternion.setFromAxisAngle({x: 1, y: 0, z: 0},
-1.1)`, twice, a few seconds apart): islands of green with pale shores, sea
between, towers standing in both, no specks of light on the land, one conduit
in six still lit. `riteNow()`: `rite` reaches 1 in 7 game seconds, every cage
to the horizon is lit, `#chHud .line` says so, and after 46 game seconds
`riteT` is -1 and they are dark. Unprompted it first comes 25 game seconds
into a flight, then every 260. With stage `done` seeded `era` reads 0 and the
world is as 5.7.4 left it: compare a screenshot. `EZ_LIGHT` is a constant in
`src/constants.js`: `'hole'` and `'none'` need the file edited and a reload.

The City of Light a million years on (stage `ez_era`; seed `ez: {…, lost:
['marrow'], clock: 2460}` to see a captain missing): on coming through the
door `#chHud .line` gives the three clocks (`THE LIGHT SHIP WAS GONE 1,024
YEARS. HERE IT HAS BEEN 1,048,576 YEARS. YOU WERE GONE 41 MINUTES.`), once a
session. `far().state()`: `districts` and `race` are null (not built), and
`epi` has `ship: true`, `people` as before, and `crew` of three positions of
which a lost captain's stays where it was (hidden; the other two follow the
pilot). Among `capital.consoles` there is no race stand and nothing from the
districts. Frames: `place(0, 0, -2)` yaw π for the skyline (dim, few lit
panes) and the growth on the balcony; `place(0, 0, -70)` yaw π pitch -0.45
for the terrace floor (standing water, cracks, moss in the seams, most of the
inlay out); `place(-112, 0, -77)` yaw -π/2 pitch 0.12 for the light ship,
back in its yard with round cells at its upper aft corner and fallen beams on
the yard floor; `place(-5.3, 0, -4.9)` yaw -π/2 for the Archivist, whose
first line is `You found it`, and the wall behind it with entry zero's cell
(column 19, row 5) lit white. What the ship made (`world/eramade.js`): `far().state().made` → `{shown,
cubes, at, corner, due, show}`. Needs `ch.home: true` seeded as well as the
stage, or the city skips its era set-up. While `due`, the compass
(`#compass`) reads `GALLERY`; `capital.place(-118, 0, -77)` starts the showing
by itself (`show` counts 0 → 15.5, `body.ch-cine` set, three lines), after
which `due` is false, `ez.made` is saved and the compass reads `DOOR` again.
From the gallery, yaw -1.15 has the bow and its dome on the left, the strands
running back over the ship, and the block of cells on the right. `made.at` is
the middle of the dome's floor in the hangar root's frame (0, 94, 340). With a stage before `ez_era` the city is as
5.7.4 left it: `districts` and `race` build, and the ship is gone.

The launch (`world/launch.js`, stage `ez_launch` on boarding, `ez_beyond` at
the end): in the era city the console at the gallery (-124, 0, -77) reads `E
— BOARD THE LIGHT SHIP` and opens the Archivist's last question; `e` three
times, then `2` leaves it (asked again on the next press), `1` hops
`'launch'` (or `farLanding.door('launch')` from inside the city). Then
`far().state()` has `onLaunch`, `launch` → `{u, end: 74, cross: 56, hole,
inside, mega, megaShown, worlds, crew, day}` and `launchSeek(sec)`. The scene
is 74 game seconds and far too slow to play through under SwiftShader:
`launchSeek` it. At 5 the megaworld is off the starboard quarter, lit, beside
the archive wall; at 21 the ring of young worlds shows (`worlds` 9; with
`EZ_NEW_WORLDS` false, 0 and Marrow's other line); by 40 `hole` is past 0.8
and the camera has come round to it; at 57.5 `inside` has begun to rise; the
last line comes at 61; `megaShown` goes false by 60. `launchSeek(72.5)`, then
`u` reads -1: stage `ez_beyond` saved, codex `Into the Hole`, bars out,
`inside` 1. The bridge is the dome of `world/eramade.js` at walking
size: `launch.bridge` → `{helm, pilot, stands}` (x, z), `launch.r` the floor's
radius, `launch.flight` the cells' under-way value (0 at rest, about 0.6 at
the end). Shots worth taking: `launchSeek(4)` (the megaworld past the
captains), 27 (the light ship, the strands and the archive), 40 (ahead, the
hole). Afterwards `place` the walker within 5 of one of `launch.bridge.stands`
and `interact()` to talk to that captain. Come back to the game with `ez_beyond` seeded and no
docking is needed: after `launch()` the game parks on the landing, steps out
and hops to the bridge by itself (`onLaunch` true, `launch.u` -1,
`farLanding.state().far` 4000). With any earlier stage the ship stays in
flight (`farLanding.state().dock` `'sky'`).

## The light ship as a home base (GDD 5.7.8)

Seed a far-side save in open space: `fgsf.journal` `{quests: {tenretni: 'ship'}}`
and `fgsf.tenretni` `{city: [0.956, 0.174, -0.236], at: 'terra', eaten:
['neptunia', 'wyattmattoe'], size: 1.2, end: 'far', star: [0, 0, -9000], met:
true, landed: true, ch: {stage: 'hz_open', picks: {}, seen: [], epilogue: true,
home: true, ez: {stay: 'vask', lost: ['lux']}}}`. Optionally `fgsf.voyage`
`{v: 1, at: 'proving', visited: ['horizon', 'proving'], crew: ['marrow']}` to
boot in the example system with a captain on the trip. Seed with an init script
guarded by a `sessionStorage` flag so a reload keeps what the game then saved.

Boot: `__debug.launch()`, wait for `tenretni.chapter()`, then poll until
`base.state().beyondStep === 2 && base.state().doorT < 0 &&
tenretni.base().state().inside === 'bridge'`. That is the whole resume path:
parked in the bay, stepped out, through the door to the bridge. `tenretni.far()`
stays null on such a save (the megaworld is never built).

Serve the game for a headless run with hot reload off, or a file saved mid-run
reloads the page under the test: a second config that spreads `vite.config.js`
and sets `server: { hmr: false, port: 5174, strictPort: true }`, `root` the repo.

`__debug.base`: `state()` → `{phase, dock, platform, landState, skyLanding,
lift, beyondStep, doorT, doorTo, armed: {bay, system}, ship, speed, bay,
isolated, far}`; `door(key)` walks through any hop key from a walked place
(`base:bay`, `base:bridge`, `base:bridge-aft`, `base:helm`, `base:archive`,
`base:archive-up`, `base:holo`, `hz:*`); `board()` from the bay puts the pilot
in the seat, parked; `launch()` starts the run out of the forward mouth (free
flight when `landState === null`, about `BASE_BAY_LIFT` seconds, leaving at
~240 u/s); `approach([x, y, z], dist = 1400)` puts the freighter that way off
the hull flying in, and it must reach `landState === 'landed'` with `dock ===
'bay'` from astern, ahead, either side, above and below; `dock()` parks;
`stepOut()` walks the bay. `systemApproach()` / `systemDock()` /
`systemStepOut()` do the same for the current system's nearest dock.
`guests()` → the captains standing in the freighter's hall.

`tenretni.base().state()` → `{built, inside: 'bay' | 'bridge' | 'archive' |
null, bay: info, bridge: {u, end, warp, going, crew, figures, star, bodies},
archive: info, places, crew: [{id, lost, along}], bridgeSeek(sec)}`.
`tenretni.voyage()` → `state()` `{open, applied, at, visited, crew, systems,
docks, planets, star, record}`, `travel(id)` (the swap itself, no passage),
`setCrew(ids)`, `instance(id)` (a built system: the example's has `go(stage)`).
`tenretni.openSpace()` is what the chapter of 5.7.7 calls at its end.

A meal: at the lounge table (`place(-10, 0, 5.8)`, `e`) the pilot and every
captain aboard are sat at the table (`deck.doing === 'eat'` for 15 game
seconds, bars up, the camera going slowly round), two lines of table talk from
`DECK.dinner` come up on `#chHud .line`, E skips, and it ends on `YOU EAT
WITH …`.

The crew deck (`world/basedeck.js`): on the bridge `place(4.6, 0, 4.6)` reads
`E — CREW DECK`; `e` and `tenretni.base().state().inside` is `'deck'`
(`deck` info → `{doing, u, lost, star, rooms}`; `places.deck` has
`bridgeDoor`, `quarters.{pilot, marrow, lux, vask}`, `lounge`, `med`). The
corridor runs x -22..22 at z 0, quarters at -z (glass at z -10.4), lounge and
medical bay at +z. `place(-20.5, 0, -5.8)` REST, `(-10, 0, 5.8)` SIT DOWN TO
EAT, `(18.4, 0, 4.8)` CHECK-UP: each sets `doing` for a few seconds and ends on
a `#chHud .line`. A lost captain's room (`ez.lost`) has `own` lights hidden and
the candle shown. `place(-20.4, 0, 0.8)` and `e` is back on the bridge.

The chart by hand: the helm is the pilot's seat. `walkSite().capital.place(0.9,
0, -4.1)` on the bridge reads `E — SIT AT THE HELM`; `e` sits
(`bridge.seated()`, the pilot shown seated by `site.pilotPose()`, the prompt
`E — THE CHART · MOVE — STAND UP`), `e` again opens the chart, `e`, then a
digit. Any move stands the pilot up. The captains aboard sit in their own
seats behind it (`places.crewSeats`). `#dlgPanel` lists every charted system but the current one
and STAY HERE; picking one sets `bridge.going`, `bridge.u` runs 0..9 with the
bars up (`e` skips), `voyage().state().at` changes at the middle, and
`fgsf.voyage` is written. With the freighter out of the bay the chart refuses.

The holodeck: from the archive (`base.door('base:archive')`),
`holodeck.catalog()` → rows `{id, label, note, unlocked, show}`: terra, rustia,
wavemall prime, actuality, shadowreach, wyattmattoe, saturnia, neptunia,
stevenlacey, lightcity, then seven locked rows. `holodeck.startFrom(id)` starts
one; `holodeck.active()` is its id; key `g` ends it and
`tenretni.base().state().inside` is `'archive'` again. Compare `isolation()`,
`phase` and the count of `planets` with `removed` before and after: they must
match for every program. The console is at `place(2.2, 0, 25)`; `e` opens
`#holopanel` (`holodeck.panel()` → `{open, rows, pick(i)}`), and picking a
locked row does nothing. The City of Light program first frames from the
balcony; `saturnia` is the only program that is not isolated.

The example system (`proving`): `voyage().state()` lists dock `relay` and
planet `cinder`. At the relay, `place(0, 0.14, -31.8)` and `e` reads the log:
record `{stage: 'logged'}` under `fgsf.voyage.chapters.proving`. Cinder: put
the ship at `planet.group.position + sunDir * radius * 1.5` falling in at 120
u/s; the world takes the helm (`landState` `'auto'` then `'landed'`), `g`
steps out (`walk.planet.cfg.name === 'cinder'`), `g` boards. Then
`base.approach()` home. A `launch()` mid-flight (the reset) must come back to
the bridge with `voyage().state().at` unchanged.

Cinder's surface gravity is the home worlds' (about 30): from its surface,
throttle up must climb. NAV to `proving:relay` from Cinder's surface (the
world between) climbs clear first: `__debug.autopilot.ended()` reads
`'arrived'` at the end (or `'heat'`, or `'stall:<phase>'` when a trip that
went nowhere for 4 s handed the controls back, with a `COURSE BLOCKED` toast);
then W in closes on the relay and its dock takes the helm (`landState`
`'auto'`, then `'landed'` with `dock: 'system'`).

A chapter's debrief: a system instance's `debrief()` returns `{title,
complete, lines: [[captain id, text]], nextCourse, nextNone}` once it has
ended (The Long Dusk: stage `done`; its lines follow `fixed.outcome('flare').how`).
`voyage().debrief()` adds `key` and `next`, and is null once
`season.get('debrief.<system>')` is true. Seed `fgsf.voyage` `{v: 1, at:
'dusk', visited: ['horizon', 'proving', 'dusk'], chapters: {dusk: {stage:
'done'}}, season: {v: 1, facts: {'ch2.decision': 'warn'}, events: {flare:
{seen: true, how: 'rerouted', detail: {groups: 3}}}}}`: the boot ends on the
bridge and `base().state().bridge.debrief` counts through the lines
(`#chHud .line`), then `#chHud .card.show` reads the title, COMPLETE and where
next; E skips to the card and then past it. Afterwards the fact
`debrief.dusk` is saved and a reload plays nothing. The bay's welcome toast
reads `BASE.bayDebrief` while one is waiting. On the ground, the panel reads
`TALK TO RENN` at stage `flare` and `DONE — BACK TO THE LIGHT SHIP` at `done`.

The roster: bay console at `place(20, 0, 7.6)`, `e`, a digit toggles a captain,
`x` closes. `voyage().state().crew`, `base().state().bay.crew` (waiting by the
pad), `base.guests()` after `board()`, and at the relay
`voyage().state().record.crew` moving with the walker.

Load checks that must hold after any change here: a fresh profile writes
neither `fgsf.tenretni` nor `fgsf.voyage`; a `ch.stage: 'done'` save
round-trips its `ch` unchanged with no `hz` key and no `fgsf.voyage`; a
`ch.stage: 'ez_beyond'` save still ends on the launch bridge
(`far().state().launch`) with `base.state().dock === 'landing'`.

## Season 1: fixed events, the season record, and The Long Dusk (GDD 5.7.9)

Seed and boot as for the home base (`ch.stage: 'hz_open'`). `tenretni.voyage().courses()` lists `dusk`. To have nobody aboard, `tenretni.chapter().setCrewDebug([])` BEFORE entering the camp (`ez.lost` cannot hold the captain in `ez.stay`).

`s = __debug.tenretni.season()`: `state()` → `{facts, events, cp}`, `set(k, v)`, `events()`, `resolve(id, how, detail)`, `remember(captainId)`, `pending()`, `clear()`. Saved as `fgsf.voyage.season`.

`I = __debug.tenretni.voyage().instance('dusk')` (null until the ship has been there: `voyage().travel('dusk')`). `I.state()` → `{stage, decision, pending, flare, clock, pinned, ground, places}`; `ground` → `{term, camp, elder, shelter, heat, cold, onVent, scene: {kind, u} | null, lamp, seen, sky, act: {t, left, done, broke} | null, groups: [{i, state, at, counted, turn}], fires, flash, aurora, outcome, dead, panel, ground(x, z)}`. Site frame: +x the star, -x the night, pad about (34, 118), picket line x -215, band x -470; the camp's x is `ground.camp` and moves unless `I.sway(x)` pins the twilight line.

Getting there: `voyage().travel('dusk')`, `base.door('base:bay')`, `base.board()`, `base.launch()`, wait `landState === null`, then `base.systemApproach(1500)` and wait for `landState === 'landed'` with `dock: 'system'` (about a minute), key `g`. `systemDock()` + `systemStepOut()` skip the flight. On foot it is `walkSite().capital`; place with `cap.place(x, I.state().ground.ground(x, z), z)`.

A pass, waiting on state each time:
1. On the first step out `__debug.cine.active()` with `kind() === 'comm'` and `from` ending `FORECAST`; `cine.skip()`; stage `forecast`, `season().state().events.flare.seen`.
2. Stand 3 from `ground.elder`, key `e` (prompt `E — TALK`), `cine.skip()`: stage `asked`, groups `mill`.
3. `place(-190, 0)`: `ground.scene.kind === 'edge'`, prompt `E — SKIP`, key `e`: stage `edge`, `ground.lamp` set.
4. From `place(-205, 0)`, `q` twice (infrared), face each group's `at` (`cWalk.yaw = atan2(dx, dz)`): its `counted` goes true after 1.2 s, and only while aimed within about 18°. Then `q` once more (H-alpha), `cWalk.yaw = -π/2`, `pitch` 0.3: scene `seen`; `I.skip()`: stage `seen`. `I.dbg.sky()` does all of step 4.
5. `e` at Renn, `cine.skip()` (must stop at the choice: `cine.text().options` has two), key `x` leaves it unasked with `pending.key === 'ch2.decision'` and stage `seen`; `e` again, `cine.pick(0)` ARM or `pick(1)` WARN: stage `decided`, `ground.act.left` counting down, `fgsf.voyage.chapters.dusk.stage` still `'seen'`.
6. WARN: for each group, `place` 26 nightward of its `at` (smaller x), step the band to `bluegreen`, face it: `state` goes `led` after 2.2 s, then `safe`. From the sunward side `turn` stays 0 and the group backs away. ARM: `place(-196, 0)` on blue-green and face whichever group reads `charge` (they start 10, 45 and 80 s in): `driven`, then `penned`. `I.dbg.turn(i)` does either.
7. Stand at `ground.shelter`, prompt `E — GET UNDER THE SLEDGES`, key `e`: stage `acted`, scene `flare` (`ground.flash` peaks near u 5, `ground.aurora` from u 16). `I.skip()`: stage `flare`, `pending` null, `state().flare.how` one of `armed | rerouted | partial | unheeded`.
8. `e` at Renn: stage `done`. `voyage().talk('marrow')` ends with that outcome's line.

Checks that must hold:
- A death after the choice (`I.kill('trampled')`, or `I.dbg.time(3)` away from the sledges) ends at stage `seen` with `decision` null, `pending.key` still set, and the walker within 5 of `ground.elder`. A death before it (`I.go('asked')`, `I.kill('cold')`) ends at `places.pad` with the stage kept.
- `base.door('base:bridge')` at stage `decided` leaves stage `seen`, `decision` null, `renderState().fog` null, and neither `ch-cine` nor `ez-lamp` on `body`.
- A `fgsf.voyage` with `chapters.dusk.stage: 'decided'` and the fact set loads as `seen` with `decision` null.
- After the flare a reload keeps `decision`, `flare` and `ground.outcome`.
- With no crew, each scene's lines on `#chHud .line` are the `solo` ones and none carries a captain's name.
- A fresh profile writes no `fgsf.voyage`; a 5.7.8 save (`{v, at, visited, crew, chapters}`) is written back byte for byte, with no `season` key.

### Chapter 3: Under the Ice

`I = __debug.tenretni.voyage().instance('ice')` after `voyage().travel('ice')`. Reach the surface as for the dusk camp (`systemDock()` + `systemStepOut()`, or `systemApproach(1500)` and `g`). `I.state()` → `{stage, decision, pending, contact, surface: {inside, plume, panel, ground(x, z)}, ocean, places: {surface: {pad, bore}, ocean: {first, city, roof, under, bore}}}`. `ocean` is null until the vessel has gone down once; then `{inside, at, yaw, pitch, speed, scene: {kind, u} | null, lamp, signal, tone: {round, phase, got, want} | null, lead, callers, asking, melt, pull, leave, open, dead, panel, pads}`. Ocean frame: the bore's mouth at the origin, y 0 the underside of the ice, the floor about -520.

A pass, waiting on state each time. The ocean runs at a few frames a second under SwiftShader and its scenes are 20 to 36 game seconds: wait on `ocean.scene` and the stage, never on a timeout, and do not `put` the vessel while a scene has it.
1. First step out: `cine.kind() === 'comm'`, `cine.skip()`: stage `forecast`.
2. `cap.place` at `places.surface.bore`, prompt `E — RIDE THE VESSEL DOWN`, key `e`, `cine.skip()`, `cine.pick(0)`: `base.state().isolated.active`, `ocean.scene.kind === 'descent'`; key `e` skips: stage `down`. (`base.door('ice:down')` skips the console.)
3. By ear: `I.dbg.put({ look: places.ocean.first })`. Off the radio band `ocean.signal` is 0 and the panel says to switch; `I.dbg.band('radio')` and it rises past 0.6; `put` looking the other way and it falls to 0. Holding `w` moves `ocean.at` at up to about 39 u/s.
4. `put` the vessel 110 from `first` looking at it, on the radio band: stage `heard` within 1.5 game seconds. Wait for `tone.phase === 'input'`, then press `tone.want` (keys `Digit1`..`Digit3`, or `I.dbg.press(i)`); a wrong key sets `phase: 'gap'` and the call is said again. After round 2 the scene `answered` starts; `I.skip()`: stage `answered`, `ocean.callers` 16.
5. `ocean.lead` moves toward `places.ocean.city` only while the vessel is within 220 of it. `put` within 260 of `city`: scene `city`; skip: stage `city`. `put` within 260 of `under`: stage `asked`, and a few seconds later `cine.active()` with two options. Key `x` leaves it unasked (`pending.key === 'ch3.decision'`, stage `asked`) and it is asked again within about 7 game seconds.
6. SHOW (`cine.pick(0)`): `put({ at: under, pitch: 1.2 })`; `ocean.melt` reaches 1 in 12 game seconds, then `ocean.pull` counts from 0 and `ocean.open` is 1. Hands off, the vessel is taken up the hole. Hold `s` and `Shift` and it is not; after 16 game seconds the scene `sky` starts. Skip: stage `contact`, `contact.how === 'shown'`. `put({ at: [0, 20, 0] })` and hold `Space`: back on the ice, stage `done`, `surface.plume` true.
7. LEAVE (`cine.pick(1)`): `ocean.leave` counts down from 110. `put({ at: [0, -70, 10] })`: scene `away`; at its end the pilot is on the ice, stage `done`, `contact.how === 'left'`, `season().state().facts['ch3.archived'] === false`.
8. `voyage().debrief()` is non-null with title `CHAPTER 3 — UNDER THE ICE`; on the bridge it plays once.

Checks that must hold:
- `I.dbg.time(2)` after LEAVE, or hands off under the hole after SHOW, ends at stage `asked` with `decision` null, `pending.key` set, `ocean.at` equal to `places.ocean.under`, and the death's line on `#chHud .line`.
- A reload at stage `decided` comes back as `asked` with `decision` null; `base.door('ice:ask')` then puts the vessel under the thin ice and the question is asked again.
- After surfacing: `base.state().isolated.active` false, and neither `ez-lamp` nor `ch-cine` on `body`.
- With nobody aboard (`chapter().setCrewDebug([])` first) every scene's lines are the `solo` ones and the question's speaker is the vessel.

### Chapters 4 and 5: the free port

`I = __debug.tenretni.voyage().instance('concourse')` after `voyage().travel('concourse')`. Two docks, `port` and `tender`: `systemDock()` takes whichever is nearer the ship, so to go to one put the ship over it first (`ship.position.copy(voyage().dock(id).site.group.position); ship.position.y += 300`), then `systemDock()` and `systemStepOut()`. To board from a deck: `cap.place` on the pad (port (0, 0.14, 92), tender (0, 0.14, 34)) and key `g`. `I.state().places` → `{hub: {pad, varn, market, bar, envoy, assessor, hatch}, tender: {pad, boss, stores}, hold: {door, case, thief}}`. The market is `__debug.holodeck.panel()` → `{open, rows, pick(i)}`: eight rows, BUY then SELL for each of the four goods; `Digit1`..`Digit8`, `x` closes.

Chapter 4, waiting on `I.state().s4` each time:
1. Step out at the port: `cine.kind() === 'comm'`, `cine.skip()`: `docked`.
2. `cap.place` at `places.hub.varn`, prompt `E — TALK`, `e`, `cine.skip()` (stops at TAKE IT / NOT YET), `cine.pick(0)`: `met`.
3. Tender: stand at `places.tender.boss`, `e`, `cine.skip()`: `hauled`, `ticks` 40, and KEEP / SPLIT is up. `x` leaves it (`hauled` still, `fee` null) and `e` puts it again. `pick(0)`: `paid`, `fee: 'kept'`, 40 ticks; `pick(1)`: `fee: 'split'`, 20.
4. `places.tender.stores`, `e`: the panel. `Digit1` buys vent glass: `cargo.glass` up, `ticks` down by `prices.tender[0]`, and `prices` change after every trade. A row the purse or the hold cannot cover is locked.
5. Port: `places.hub.market`, `e`, `Digit2` sells it: with `prices.hub[0]` above what was paid, `traded`.
6. `places.hub.bar` (stand 1 short of it), prompt `E — GO IN`, `e`: `hub.scene.kind === 'bar'`; `e` skips; the envoy's talk opens (`cine.text().speaker`); skip it: `done`. `voyage().debrief()` has key `concourse`.
7. On the bridge the debrief plays; when it has, `state().open5` is true and not before.

Chapter 5, waiting on `s5`:
1. Back on the deck (`base.door('concourse:deck')`): `hub.assessor` true. `e` at `places.hub.assessor`, skip: `valued`; about 9 game seconds later a `comm` scene from the light ship; skip: `robbed`.
2. `base.door('base:archive')`: `state().guest` → `{rooms, touched, counted, panel}`. Every plinth's prompt is `E — LOOK AT THIS ONE` (the archive's own TAKE prompts are behind it). At an untouched one `found` stays as it was; at each of `guest.touched` (stand a fifth of the way from it to its room's middle) it gains a bit. With all three (`found` 7): `tracked`.
3. Deck again, `places.hub.hatch`, `e`: `hold.inside`, scene `hold`; `e` skips. `places.hold.case` (stand 1.6 short), `e`: a `comm` scene; `I.hold().dbg.sealed()` is its lines, the third naming whoever is aboard. Then `e` at `places.hold.thief`: HAND THEM OVER / LET THEM GO. `x` leaves it; `pick(0)` → `thieves: 'held'`, `pick(1)` → `'freed'`: `found`. The door's console only then: `e` at `places.hold.door`: back on the deck, `done`, `debrief()` key `appraisal`.

Checks that must hold:
- With nobody aboard the scenes' lines are the `solo` ones and the forecast's third line says the pilot comes alone.
- A reload keeps `s4`, `s5`, `ticks`, `cargo`, `fee`, `thieves`, `found`, `sealed`.
- After chapter 5 the archive's first console is its own again (no `LOOK AT THIS ONE`).
- `I.go4(stage)` and `I.go5(stage)` jump either chapter; `go5` sets `debrief.concourse`.

### Chapter 6: Futures

`I = __debug.tenretni.voyage().instance('futures')` after `voyage().travel('futures')`; `systemDock()` + `systemStepOut()`. `I.state()` → `{stage, signed, flood, city: {inside, ct, seen, hour, scene, pending, next: {who, at, in}, late, citizens, panel}, places: {pad, keeper, stations}}`.

A pass, waiting on `stage`:
1. First step out: a `comm` forecast; `cine.skip()`: `forecast`.
2. `cap.place` at `places.keeper`, `e`, `cine.skip()`: the scene `hour` starts by itself once the talk has closed; at its end `welcomed`.
3. The board: `city.next` is who arrives where and in how many seconds. Away from it when it happens, the line is `YOU WERE NOT THERE…` and `seen` stays. Stand within 10 of `next.at`, then `I.dbg.nearly(1.5)`: `seen` goes up on the second. Three times: `predicted`, and `city.hour` counts down from 26.
4. `I.dbg.hour(1.5)`: `missed`. `city.late` is where she is (it moves: re-read it); stand just inside it, `e`, skip: `found`.
5. `e` at the Keeper, `cine.skip()` stops at SIGN / TALK HER DOWN. `x` leaves it (`found`, `signed` null). `cine.pick(0)` → `signed: true`, `flood.how: 'bound'`; `pick(1)` → `false`, `'free'`. The scene `fix` follows by itself; at its end `done`.
6. `voyage().debrief()` title `CHAPTER 6 — FUTURES`. `voyage().instance('concourse').state().prices` are doubled from then on.
### Chapter 8: The Weight of Hands

`I = __debug.tenretni.voyage().instance('swarm')` after `voyage().travel('swarm')`. One dock, `yard`: reach it as for the dusk camp (`systemApproach(1500)` and `g`, or `systemDock()` + `systemStepOut()`). `I.state()` → `{stage, seen, decision, pending, yard, places: {pad, post, frame, old, cradle}}`; `yard` → `{inside, scene: {kind, u} | null, lamp, read, seen, offer, panel, builders: [{id, at, y, read, hold}], crowd, stopped, sending, made, mirrors}`. `builders` is the four that are read, in the order hauler, welder, maker, old; the Hauler and the Welder move.

A pass, waiting on state each time (the scenes are 27 to 30 game seconds: wait on `yard.scene`, and do not `cap.place` while one is up):
1. First step out: `yard.scene.kind === 'arrive'`, prompt `E — SKIP`, key `e`: stage `docked`, `yard.lamp` set, panel `READ 0 / 4`.
2. `q` four times: `yard.lamp.band === 'xray'` (reach 175). For each builder, `cap.place` about 15 from its `at` and set `cWalk.yaw = atan2(dx, dz)`, `pitch` 0.07, re-aiming at the two that move: its `read` goes true after 1.6 game seconds, and `#chHud .line` names it. On any other band, or from further than 34, nothing is read; aimed from too far the line says to come closer. `I.dbg.read(i)` reads one without the lamp.
3. With all four read and their lines said, scene `read` starts by itself; `I.skip()`: stage `read`. About 6 game seconds later a `comm` scene (`cine.text().from` ends `TWO OFFERS`); `cine.skip()`: stage `offered`.
4. `cap.place` at `places.post`, prompt `E — THE WORK ORDER`, `e`, `cine.skip()` (stops at the choice; two options). `x` leaves it (`pending.key === 'ch8.builders'`, stage `offered`); `e` again and `cine.pick(0)` END or `pick(1)` ASSIGN: `decision` is `freed` or `contracted`, `pending` null, and after the reply the scene `end` starts. `I.skip()` or wait: stage `done`.
5. Freed: `yard.stopped` 1, `yard.made` 1. Contracted: `yard.sending` 1. `voyage().debrief()` has title `CHAPTER 8 — THE WEIGHT OF HANDS`.

Checks that must hold:
- With nobody aboard (`chapter().setCrewDebug([])` first) every line is the `solo` one and the work order's first line is the order itself, with no captain's word before it.
- A reload at `offered` keeps `seen` 15 and the offers do not come again; `base.door('swarm:post')` stands the pilot at the post with the lamp in hand.
- `base.door('base:bridge')` while the scene `end` plays leaves stage `done`, with neither `ch-cine` nor `ez-lamp` on `body`.
- `I.go(stage, opt)` jumps either way; `go('decided', opt)` lands on `done`.
- A fresh profile writes no `fgsf.voyage`.
### Chapter 7: The Pulsar Choir

`I = __debug.tenretni.voyage().instance('choir')` after `voyage().travel('choir')`; one dock (`systemDock()` + `systemStepOut()`, or `systemApproach(1500)` and `g`). `I.state()` → `{stage, choir, pending, hall, places: {pad, eldest, actuary, rose, stand}}`; `hall` → `{inside, scene: {kind, u} | null, lamp, signal, hear, atStand, tone: {round, phase, got, want} | null, table, actuary, bells, panel, pads, starDir}`. Hall frame: the forecourt and pad at (0, 150), the nave down -z, the stand at (0, -20) on a dais 0.5 high, the listening ring at (0, -98), the First Voice at (0, -122), the rose at z -190.

A pass, waiting on `stage` and `hall.scene` each time (scenes are 14 to 31 game seconds and run slowly under SwiftShader; never `place` during one):
1. On the first step out `hall.scene.kind === 'arrive'`, prompt `E — SKIP`; `e`: `docked`, `hall.lamp` set.
2. `cap.place` at `places.eldest`, prompt `E — TALK`, `e`, `cine.skip()`: `met`.
3. `cap.place` at `places.rose`; `I.dbg.aim()` points the look at the star. Off the radio band `hall.signal` is 0; step the lamp to radio (`q`, or `I.dbg.band('radio')`) and it reads 1; look away (`cWalk.yaw = 0`) and it falls to 0. Held above 0.6 on the ring for 2 game seconds: `heard`.
4. `cap.place(0, 0.5, -18.5)`, prompt `E — TAKE THE CANTOR'S STAND`, `e`: `hall.atStand`, and after the teaching line `hall.tone`. Wait for `tone.phase === 'input'`, then press `tone.want` (`Digit1`..`Digit4`, or `I.dbg.press(i)`). `Digit4` off the radio band says so and leaves `tone` as it was; a wrong bell sets `phase: 'gap'` and the verse comes again. After verse 2 the scene `chorus` starts; `I.skip()`: `sung`.
5. `e` at the First Voice, `cine.skip()` (stops at the two options). `x` leaves it (`sung`, `pending.key === 'ch7.choir'`); `e` again and `cine.pick(0)` → `choir: 'free'`, `pick(1)` → `'forecast'`: `decided`, `pending` null. Once the reply and the crew's line have gone, the scene `answer` plays by itself and ends at `done`.
6. `voyage().debrief()` has title `CHAPTER 7 — THE PULSAR CHOIR`.

Checks that must hold:
- `'forecast'`: `hall.table` true and `hall.actuary` true after `done`; his talk is the forecast line. `'free'`: both false after `done`, and there is no `E — TALK` where he stood.
- With nobody aboard (`chapter().setCrewDebug([])` first) every scene's lines are the `solo` ones, with no captain named.
- A reload keeps `stage` and `choir`. `I.go('decided', 'free')` then `base.door('choir:nave')` starts the `answer` scene at once.
- `I.restore({ stage: 'done' })` with no `ch7.choir` on record gives stage `sung`.
- On leaving: neither `ez-lamp` nor `#choirPads.on`, and `sun.ambient.intensity` is what it was before the hall (0.95 inside it).

### Chapter 10: The Siege

At the port: `I.go10('idle')` opens it (and marks chapters 4 and 5 done). Set the season facts that decide who comes first: `season().set('ch7.choir', 'free')`, `('ch8.builders', 'freed')`, `('ch4.fee', 'split')`, `('ch5.thieves', 'held')`. `e` at the dockmaster: `s10: 'called'`. `cap.place(-7, 0, 72)`, prompt `E — TO THE LIGHT SHIP'S HELM`, `e`: `state().siege.inside`. A `comm` forecast (skip), then the scene `intro` (`e` skips), then the pad opens (`siege.pad`).

Drawing: `const m = await import('/src/drawPad.js'); m.drawPadDebug.stroke(points); m.drawPadDebug.done()`. Points are pad units, -1..1, y up; the chart's z is `-y`. `siege.columns` are the lines (`from`, `to`, chart units) and `siege.flag` the flagship's. A circle of radius 0.46 crosses every column; from the second pass draw the arc that leaves out about 1.2 rad either side of the flagship's bearing. `siege.phase` goes `plan → fly → after`, `broken` and `reached` count, and `ring` is the eight sections' points.

Checks: a stroke through `flag` gives the line `…DRAW THE PASS AGAIN` and the same pass again. After the third pass a `comm` scene with two options; `x` leaves it and it is asked again within 5 game seconds; `cine.pick(0)` → `decision: 'evac'`, `pick(1)` → `'hold'`. Lost on the fourth pass: `decision` null and the question again. After the fourth: scene `fall`; skip: `s10: 'done'`, back on the deck, `siegeEvent.how` `evacuated` or `held`, `voyage().debrief()` key `siege`. Afterwards neither `ch-pad` nor `ch-cine` is on `body`.
### Chapter 9: The Forecast of Love

In the `concourse` system: `I = __debug.tenretni.voyage().instance('concourse')`. To start at it: `I.go5('done')` and `tenretni.season().set('debrief.appraisal', true)`; `I.state().open9` is then true. `I.state().love` → `{how, ione, hill: {inside, talked, run: {s, x}, gates, her, panel}, patio: {inside, scene, pending, panel}, archive, places: {hill: {top, her, ski, bottom, out, yB}, patio: {door, her}}}` (a place's entries are null until it has been entered once).

A pass, waiting on `I.state().s9`:
1. `base.door('concourse:deck')`: a `comm` forecast; `cine.skip()`: `forecast`. The compass reads `BAR`.
2. Stand 2.5 from `places.hub.envoy`, `e`, skip: `asked`; `hub.envoy` goes false (she has gone aboard) and `voyage().talk('lux')` is a line about her.
3. `base.door('base:holo')` (the archive): `love.archive` is where she stands. 1.6 to her -x side the prompt is `E — WYATTMATTOE, THE SKI HILL. WITH HER.`; `e`: `love.hill.inside`.
4. At `places.hill.ski` there is no prompt until she has been talked to (`e` at `places.hill.her`, skip). Then `e` there: `hill.run.s` runs 0 to 1 in about 22 game seconds; holding `d` moves `run.x`; `e` skips to the bottom. At the end `hill`, and the walker is on the flat at `y = places.hill.yB`.
5. `e` at `places.hill.bottom` (place the walker at `yB`), skip: `told`. `e` at `places.hill.out`: back in the archive, `isolated` still active, panel `DINNER…`.
6. `base.door('base:deck')`: stand on the console whose prompt has `EAT`, `e`: `base().state().deck.doing === 'eat'` for 31 game seconds (`e` skips), her lines and one captain's between them on `#chHud .line`; at its end `dinner` and the door opens onto the patio by itself (`love.patio.inside`).
7. `e` at `places.patio.her`, `cine.skip()` stops at two options. `x` leaves it (`dinner`, `season().pending().key === 'ch9.why'`). `cine.pick(0)` → `how: 'trusts'`; `pick(1)` → `'wary'`: `patio`, then the scene `stay` by itself; at its end `done`.
8. `voyage().debrief()` has key `love`. `e` at `places.patio.door`: the crew deck.

Checks that must hold:
- With nobody aboard (`chapter().setCrewDebug([])` first) the meal still runs, with only her lines.
- A reload keeps `s9`, `how` and `ione`; `fgsf.voyage.chapters.concourse.s9` is the stage.
- After the chapter the crew deck's first console is its own again, and with no guest the dinner is the one it was (15 seconds, two captains' lines).
- `I.go9(stage, how)` jumps it either way.
### Chapter 11: The Vault

Played in `concourse`. `I = __debug.tenretni.voyage().instance('concourse')`; `V = I.state().vault` → `{stage, open, world, label, friend, how, event, camp, newWorld, scene, pendingEnd, worlds, places: {camp, record}}`. `I.go11('idle')` sets chapters 4 and 5 done and debriefed, so it is open. The case is decided by who is lost: seed `ez.lost: ['lux']` for one captain lost, or `chapter().setCrewDebug([])` for all three (both give the person case); with nobody lost it is the world case.

A pass, waiting on `V.stage`:
1. `base.door('concourse:deck')`: a `comm` forecast; `cine.skip()`: `forecast`, `V.camp` true.
2. `e` at `places.hub.varn`, `cine.skip()`. World case: it stops at WHICH WORLD?, one option per row of `V.worlds`; `x` leaves it; `cine.pick(i)`: `asked`, `V.world` set. Person case: no choice; `asked` at once, `V.friend` set.
3. `base.door('base:archive')`. World case: the corner panel names the world; at the holodeck console (`cap.place(2.2, 0, 25)`, `e`) pick its row: `walked` as the program starts (`voyage().holo(id)` does the same; another world's id does nothing); `g` ends the program. Person case: `cap.place(-2.4, 0, 25)`, prompt `E — READ THEIR RECORD`, `e`: a `comm` scene; skip: `walked`.
4. Deck again, `e` at the dockmaster, `cine.skip()`: each captain aboard has a line, then SELL / RECOMPILE (or RECOMPILE THEM / LET THEM REST). `x` leaves it with `season().pending().key === 'ch11.choice'`. `cine.pick(0 | 1)`: `decided`, `V.how` set, and once the talk has closed `V.scene` counts up; `e` skips: `done`, `V.camp` false.
5. `voyage().debrief()` key `vault`, title `CHAPTER 11 — THE VAULT`.

Checks that must hold:
- After `sold` or `recompiled`, `holodeck.catalog()` has that world `unlocked: false` with `lockedNote: 'GIVEN UP'`, after a reload and in every other system; picking the row in the panel does nothing. After `friend` or `rest` every world row is as it was and `facts['ch11.world']` is absent.
- After `recompiled`, `V.newWorld` is true whenever the deck is entered.
- With nobody aboard no captain's line precedes the choice and the scene's lines are the `solo` ones.
- A reload keeps `stage`, `world`, `friend` and `how`.

## Season 2 visual prototypes (GDD 5.7.10)

Two test scenes, in no story. `__debug` is a dev-server object, so they are not in a production build at all; in dev they are one lazy chunk (`world/proto-scenes.js`), fetched on the first `open()`.

After `__debug.launch()` and free flight: `P = __debug.proto`. `await P.glass.open()` / `await P.strobe.open()` take the view (opening one closes the other); `.close()` (or `P.close()`) gives it back; `P.which()` names the open one. A prototype is built for the tier that is set when it is first opened on that tier (`__debug.quality.set('low' | 'high')` before `open()`).

- Glass: `P.glass.state()` → `{open, tier, view, shards, scene, steps, disperse, target, frames, fps, uniforms}` (`scene: false` and `target: null` on LOW: no second drawing). `P.glass.set({ view: 'crown' | 'figure', orbit, angle, dist, height, spin, refract, disperse, absorb, mind, mindSpeed, rim, beam })`; `dist: null` and `height: null` go back to the view's own.
- Strobe: `P.strobe.state()` → `{open, tier, ships, alive, debris, sweeps, rate, asked, maxRate, soft, hold, phase, lit, width, peak, floor, frames, fps}`. `P.strobe.set({ rate, soft, hold, orbit, angle, dist, height, loss, shaft, reset })`: `hold: 0` stops the beam on the field's middle (a lit still), `hold: Math.PI` stops it on the far side (dark), `hold: false` lets it run. `P.strobe.step(n)` moves the battle on `n` sweeps at once.

Checks that must hold:
- `JSON.stringify(__debug.renderState())`, `__debug.paused`, `__debug.hideCockpit` and `document.body.className` are the same after `close()` as before `open()`, for each, twice over.
- `P.strobe.set({ rate: 20 }).rate` is 3 (`STROBE_MAX_RATE`).
- With `hold: Math.PI` and `soft: false` a screenshot shows stars and the pulsar and no hull; with `hold: 0` the hulls are lit from one side.
- After `step(8)`, `alive` is lower and `debris` is above 0.
- Under SwiftShader a frame is slow and `dt` is capped at 0.1 s, so sweeps come slower than `rate` says; count frames from `state().frames` over wall time for a frame rate.

## The chapter past the horizon (GDD 5.7.7)

Structure only: what happens in it is in files named `SEALED-*`, which are not
to be opened or quoted. Host `src/horizon.js`; five places in
`world/SEALED-horizon-{deck,hall,helm,hull,keel}.js`, shared code in
`-ship.js` and `-sky.js`, every word in `-words.js`, tunables `HZ_*` in
`src/constants.js` (blank names on purpose; the legend is in the sealed ship
file).

Handles: `h = __debug.tenretni.hz()`.
- `h.state()` → `{built, inside, stage, hz: {d, lost, cp}, resume}`;
  `h.site()` → the info of the place being walked (`place`, `stage`, `scene`
  seconds or -1, `held`, `asking`, `pending`, `phase`, and the place's own
  fields).
- `h.go(stage)`, `h.hopTo(key)` (through one of the chapter's doors from a
  place of the chapter), `h.seek(u)`, `h.skip()` (false while a decision is
  up), `h.crew(ids)` (who is aboard; set it BEFORE entering a place),
  `h.audit()` (every scene's lines as the crew aboard would be shown them),
  `h.effects()`, and `h.dbg(name, ...args)` for a place's own steps:
  - deck: `seat`, `aim(i)` (0..3; each sets a bit of `n1` after about a
    second), `table`, `hold(seconds)`, `door`
  - hall: `talk(i)` (a payload), `take(i)` (0..6), `mid`, `door`
  - helm: `set(x, t)`, `lean(v)`, `band(i)`, `dose(v)`, `auto()`
  - hull: `back(id)` (`'freighter'` first, then each captain's id),
    `clock(seconds)`, `end`, `tune`, `fill(v)`, `door`
  - keel: `set(x, t)`, `lean(v)`, `auto()`, `touch()`
- Decisions are cinematic talks: `__debug.cine.text()`, `.advance()`,
  `.pick(i)`. A decision closed without a pick (key `x`) is asked again within
  a second.

Doors: `hz:deck`, `hz:hall`, `hz:helm`, `hz:hull`, `hz:keel`; `hz:back` puts
the story back to its last checkpoint (the engine calls `chapter.hz.die()`).
From a far-side seed with `ch.stage: 'ez_beyond'` the pilot is on the launch
bridge at its helm console: `input.interact = true` goes in (or
`__debug.base.door('hz:deck')`).

Stages and where a reload at each puts the pilot (`h.state().resume`):
`hz_bell1`..`hz_bell3` deck, `hz_bell4` hall, `hz_bell5`, `hz_bell6` helm,
`hz_bell7`, `hz_bell8` hull, `hz_bell9`, `hz_bell10` keel, then `hz_open` (the
home base bridge: `tenretni.voyage().state().open` and
`tenretni.base().state().inside === 'bridge'`).

Record (`ch.hz.d` in `fgsf.tenretni`): `n1` integer bitmask (15 when full),
`n4` integer, `c1` integer 0..6, `n2` integer 0..100, `n3` string, `c2`
`'a'` | `'b'`, `t` integer. Checkpoints: `c1` (offered in the hall, door
`hz:hall`, committed on arriving at the hull) and `c2` (offered on the hull,
door `hz:hull`, committed in the keel). `ch.hz.lost` is a list of captain ids.
Useful seeds: `ch.stage: 'hz_bell3', hz: {d: {n1: 15, n4: 61896}}` (deck, last
door open); `'hz_bell4'` with the same `d` (hall); `'hz_bell7'` with `d` plus
`c1: 4, n2: 10` (hull); `'hz_bell9'` with `d` plus `n3: '-lvm', c2: 'a'`
(keel).

A pass by handles, waiting on state each time (about four and a half minutes
headless; the helm alone is three unless jumped):
1. deck: `h.skip()` until `site().scene < 0`; `dbg('seat')`; `dbg('aim', i)`
   for 0..3 and wait for bit i of `site().n1`; `aim(3)` with
   `input.allBands = true` until a scene starts; skip; `dbg('table')`; skip;
   wait `site().phase === 'hold'`; `dbg('hold', 3.2)` (or hold `input.brake`
   for three seconds); wait for the next scene, skip; `site().ready`;
   `dbg('door')`.
2. hall: skip; wait `site().pending === 'c1'`; `dbg('take', i)`;
   `dbg('mid')`; `cine.pick(0)`; skip; `dbg('door')`.
3. helm: skip; `dbg('set', -0.2, 1.62)` to jump (optional); `dbg('auto')`;
   wait `site().phase === 'cross'`; skip; the hull is entered.
4. hull: skip; `dbg('back', 'freighter')`, then each captain aboard; a scene
   starts by itself; skip; `stage === 'hz_bell8'`; `dbg('end')`; skip;
   `dbg('tune')`; wait `site().asking`; `cine.pick(0 | 1)`; with 0,
   `dbg('fill', 1)`; skip; `dbg('door')`.
5. keel: skip; `dbg('auto')`; wait `site().through`; skip; the bridge.

The three ways back to a checkpoint (each must leave `chapter().stage()` and
`hz.state()` as they were at the asking, with `cp.key` still set): in the
hall, `dbg('door')` with nothing taken and `cine.pick(0)`; at the helm,
`dbg('set', 0.6, 1.2)` then `dbg('lean', 1)`; in the keel, `dbg('touch')`.
`dbg('clock', 0.1)` on the hull, once `'freighter'` is back and before the
rest, adds ids to `ch.hz.lost`; those must still be there after a later
`touch()`.

Checks that must hold: `h.audit()` for all eight crews (three captains to
none) has no empty scene among the ones every crew sees and no `{...}` left in
a line other than `{n}`; on the deck `site().k1` is 42.1 and `site().k2`
11048; no `PLACEHOLDER` in any `SEALED-horizon-*` file; a
`ch.stage: 'ez_beyond'` save writes no `hz` key until the deck's second stage.
