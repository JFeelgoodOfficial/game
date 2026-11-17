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

## The dash
Wheel on the right, throttle lever on the left, one row of six buttons and no
others. `__debug.cockpit` → `buttonNames()` (must be exactly WARP, RADIO,
CAMERA, STAND, LAND, NAV in that order), `press(name, on)`, `litOf(name)`,
`wheelRot()`, `screenPos(name)` (also `'LEVER'` and `'WHEEL'`), `lever()` →
`{value, held, shown}`, `setLever(v)` holds the throttle at v (-1..1) as a
finger would and `setLever(null)` lets go (it must read 0 on the next frame).
The throttle is `input.throttle`; W and S are the same lever at full throw.
There is no roll and no flight brake: Q, E and Space must leave
`ship.angularVelocity.z` and the speed alone in flight, and Space must still
jump on foot. Lift-off from a pad is throttle up (`setLever(1)` or W). Touch:
a context with `hasTouch: true`, then CDP `Input.dispatchTouchEvent` at
`screenPos('LEVER')` and a touchMove 80 px up or down; check the wheel is
still on screen while the lever is held. Look at 16:9, 4:3 and a phone shape.

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

Fleets: exist once `eaten` has any entry. `tenretni.state().fleets` →
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

