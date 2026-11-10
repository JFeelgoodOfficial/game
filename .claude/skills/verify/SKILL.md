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

## Flight audio and lighting
`__debug.sfx.state()` → `{built, running, active, warpLevel}`; the context only
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

## Warzone (towns on terra / rustia / neptunia / wyattmattoe)
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
