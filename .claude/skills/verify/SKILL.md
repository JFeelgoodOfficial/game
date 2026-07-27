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

## Surface-child frames
Landing-site content is parented to `planet.surface` in its UNROTATED frame.
To convert world → surface-local: subtract `planet.body.position`, then
`applyAxisAngle(+Y, -planet.surface.rotation.y)`. Module content (city group,
wavemall district frames `{pos, q, qInv}`) is placed in that frame.

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
