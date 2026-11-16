# Neptunia rework: all-ocean world with the Indigo Reach factory ship

## Context

Neptunia is currently a normal terrain planet (land, a shallow sea, the Indigo Reach town, two wonders, a warzone). The owner wants it turned into a storm-ocean world whose only settlement is a large, highly detailed metal fishing-vessel city riding real 3D swells, per the reference painting. Weather and sky stay exactly as they are.

Decisions already made by the owner:
- Real displaced wave geometry around the ship; hull heaves, pitches and rolls.
- Walkable multi-level decks plus four interiors (bridge, mess hall, processing hold, market).
- Indigo Reach's people and the jetpack quest move aboard; wonders become sea features.
- Ship holds a fixed spot on the globe but looks under way (wake, spray, waves streaming astern).
- Landing works like the Sky City: atmosphere capture, auto arc to a hover point, vertical descent, scripted liftoff.

Everything below comes from reading the code, not running it. Line numbers drift; grep before editing.

## Approach in one paragraph

Only the *landing* copies the Sky City. On foot, the ship presents itself to `src/walk.js` as a registry **city**, because that path already supplies isolation, `planetsky`, diamond rain, marine snow, swim/dive, citizens, governor, tour beacons and the jetpack. A new ocean patch replaces a 600 u disc of the water sphere around the ship with Gerstner geometry, and a CPU mirror of the same wave table drives the hull pose and wave-aware swimming.

## Key design decisions

**Config (`src/planet.js`, neptunia block).** `seaLevel: 1.0` (elevation is strictly below 1, so no land), `oceanDepth: 110` (seabed about -16 to -85 u; diving and creatures unchanged), `noLand: true`, drop `dress`, `iceLat: 2`. Keep `divable`, `diamondRain`, `clouds`, `water`, `palette`, `spin`. Retune only `palette.deep/shallow` if the from-orbit colour shifts.

**Ocean patch (`world/seapatch.js`, `src/shaders/ocean.vert|frag`).**
- Polar grid in the ship anchor frame, child of `planet.surface`; vertex shader maps flat (x,z) onto the sphere so it follows curvature (R = 1400).
- Five Gerstner waves on high (λ 160/95/48/27/15 u, A 1.1/0.7/0.35/0.18/0.09), three on low; phase field advected astern at 8 u/s.
- Relief fades to zero over 380→560 u; patch is flat sphere 560→700 u. The base water sphere gets a `uHole` discard at 600 u (`src/shaders/water.frag` + uniform in `planet.js`). No alpha blending at the rim.
- `ocean.frag` reuses `water.frag` lighting (fresnel, glint, Snell view from below, fog) and shares uniform objects by reference with `planet.waterMesh.material`, so `planetsky` drives it with no new code.
- Foam: Jacobian whitecaps, Kelvin bow arms, stern strip, hull-contact ring; fragments inside the hull outline discarded.
- Spray: one `THREE.Points` (600 high / 250 medium / 0 low).
- Active within 4000 u. GLSL wave constants are generated from the JS table so the two cannot drift.
- API: `createSeaPatch(planet, anchor, opts) → { mesh, update(dt, camWorld), waveAt(x,z,t,out), poseAt(t,out), setActive(b) }`; installs `planet.water.swellAt(worldDir)`.

**Ship motion and walking.**
- Static `anchor` group (what `walk.js` caches) holds a moving `hull` child. Pose from waves 1–2 sampled at five points; clamps: heave ±1.0 u, pitch ±1.6°, roll ±3°.
- The city adapter's `resolveWalls` carries the walker by the hull's frame-to-frame transform while standing on deck. Walker up stays planet-radial, so the horizon stays level and the ship moves around you.
- Overboard: past the rail the floor is seabed, the existing swim branch takes over. Two accommodation ladders (ramps with their foot 1.5 u under water) get you back aboard.
- `walk.js`: add `seaR(planet, up) = water.r + (water.swellAt?.(up) ?? 0)` and use it at the swim test, buoyancy, dive ceiling, underwater depth and camera clamps (about six sites). Other worlds are unaffected.
- All walkable floors sit at least 5 u above the mean waterline.

**Landing (`src/game.js` sky block, ~1059–1222).**
- Replace the hard-coded `saturnia`/`skyCity` globals with a `dock` descriptor; two entries, `sky` and `reach`. `beginSkyAutoLand`, `stepSkyAutoLand`, `stepSkyLanded`, `setOnSkyPad`, `checkSkyCapture` take the dock.
- Host contract `host.padPose(out)` → live and mean pad position, up and quaternion. `skyCity.padPose` is the current `skyPadPose` body verbatim, so Saturnia is unchanged by construction.
- The Reach rides the spinning `planet.surface`; `reach` docks freeze planet spin for the arc (`setPlanetSpinFrozen`), isolate at touchdown, thaw at liftoff/reset.
- Heaving pad: the arc ends at the *mean* hover point; the descent lerps hover → live pad and slerps mean → live orientation each tick; once landed the ship is pinned to the live pose.
- G step-out calls `beginWalk(neptunia)`; boarding back calls `setOnSkyPad(dock)`.
- `reachShip.update` must run outside the `isolated.active` branch (~2196).

**Ship as a city (`world/reachship.js`, `world/cityRegistry.js`, `src/walk.js`).**
- Registry entry keeps id `neptunia-indigo` (saves survive), site, voice, quest, citizens; adds `host: 'reachShip'`, `noFlatten: true`, new pad and wonder offsets. `src/cityflatten.js` skips `noFlatten` defs.
- `reachShip.asCity(def)` returns the `createCity` contract plus optional members `walkFloorYAt`, `spawnLocal`, `npcRoot`, `adoptParked`, `persistent`. About 15 lines of optional-member hooks in `walk.js` (city creation ~724, spawn ~760, floor ~1447, citizen parenting ~985, return beacon ~2056, dispose).
- Collision: one `makeStructure` (`world/city.js:242`) for the whole ship: AABB walls, slabs, z-axis ramps. Stairs therefore all run fore-aft. Doors are 2.4 u wall gaps.
- Citizens: `world/citizens.js` gets a `noStroll` home flag. Ossva on the bridge, others at the chart table, market stalls, mess, pad gangway and processing hold.
- Wonders: leviathan gains a `seabed` option so the ribs root on a seamount and break the surface; diamond veil's pool becomes a moored pontoon ring. Both are swim/jetpack trips.

**Warzone: dropped from Neptunia.** `createWarzone` assumes a flat town disc; fitting a 260×46 multi-level hull means rewriting a 2,500-line module. Remove Neptunia from `WARZONE_WORLDS` (`world/warzone.js:54`) and `TROPHY_WORLDS` (`src/arsenal.js:125`); the plasma launcher becomes a crate in the ship's market.

**Materials.** Shader patches on `MeshStandardMaterial`, modelled on `makePavingMaterial` (`world/skycity.js:99`); no canvas textures.
- `makeDeckMaterial()`: 4 u plate seams, diamond-tread normals, rust noise, paint via a vertex attribute (hazard chevrons, walk lines, pad circle/H/approach bars).
- `makeBulkheadMaterial()`: 3×2 u plating, rivet rows, vertical rust streaks, boot-topping and fouling by height.
- Amber window/work-light glow and red pad lamps scaled over the bloom threshold, as in the Sky City.
- Budget: ≤18 draw calls on deck, ≤250k triangles on high. Geometry built with the Sky City `tint/box/cyl` + merge pattern and `mulberry32`; detail group hidden beyond 5000 u.

**Layout (hull-local, +Z bow, origin amidships at the waterline; walker 1.9 u, freighter ~24 u).**

| Item | Position |
|---|---|
| Hull | 260 long, 46 beam, keel y -7 |
| Main deck / lower deck | y 10 / y 5 |
| Forecastle | y 14, z 88..125 |
| Landing pad (stern) | (0, 13, -100), r 21, ramps to main deck, red edge lamps |
| Superstructure | z -58..-14: market (y 10), mess (y 15), bridge (y 20), roof y 25 with radar domes, mast to 52 |
| Working deck | z 0..88: A-frame gantry, trawl booms, two cranes, net drums, hatch covers, ~300 instanced crab pots |
| Processing hold | lower deck, z 10..70 |
| Lifeboats | davits on tier-2 side galleries |
| Ladders | port and starboard quarters, y -1.5 → 10 |

Globe position: the existing Indigo Reach site, unless the probe shows the seabed there is shallower than -25 u.

## Phases (each committable and verifiable)

1. **All-ocean config.** `src/planet.js`, registry `noFlatten`, `src/cityflatten.js`, `scripts/probe-pads.mjs`, warzone/arsenal removal. `noLand` not yet set; old town temporarily rides the sea.
2. **Ocean patch.** `world/seapatch.js`, shaders, `uHole`, `seaR` in `walk.js`.
3. **Ship exterior.** `world/reachship.js`, wired beside `createSkyCity` in `game.js`. Measure boot cost; fall back to build-on-approach if it hitches.
4. **Walkable decks.** City adapter, `walk.js` hooks, hull carry, ladders, parked freighter on the pad.
5. **Dock landing.** `game.js` dock refactor, `skyCity.padPose`, `noLand: true`, `C.REACH_HOVER`.
6. **Interiors and people.** Rooms (fit-out groups culled by room AABB + 25 u, one roaming shadowless `PointLight`), citizen homes, governor, wonders, plasma crate.
7. **Polish and tiers.** Wake, spray, whitecap tuning, low tier, zero-allocation audit, docs.

## Risks

- Saturnia regression from the dock refactor (mitigated by `padPose` being the old code verbatim; re-run its verify steps).
- Rim match between patch and water sphere.
- Walker carry and ground snap on a heaving deck (`GROUND_SNAP = 8` means a 5 u deck edge snaps down instead of falling; existing city behaviour).
- 60 fps on Intel Iris Xe cannot be confirmed headlessly; needs real hardware.

## Verification

Use the `verify` skill (headless Playwright, `window.__debug`). New hooks: `reachShip`, `reachState()`, `reachApproach(side, speed)`, `reachDock()`, `reachStepOut()`, `reachSea({scale, t})`.

- P1: sample `body.terrainAtLocal` over 5,000 directions, all < 0; `node scripts/probe-pads.mjs`.
- P2: screenshots of the rim from 300 u and 1,500 u on low and high; `water.swellAt` is 0 beyond 560 u.
- P4: stand still 600 steps, hull-local drift < 0.05 u and still grounded; walk off the rail → swimming; swim to a ladder → grounded at deck y 10; dive under the keel.
- P5: approach → `auto` → `landed`; ship within 0.3 u of the live pad over 300 ticks; G out, G back, scripted lift, no re-capture until re-armed. Then the full Saturnia Sky City sequence unchanged.
- P6: talk to Ossva, complete both beacons, jetpack in inventory; an old save at tour stage 1 re-arms.
- P7: each quality tier: `renderer.info.render.calls` and screenshots (deck, underwater looking up at the hull, approach from 1,500 u).

## Docs to update

`GDD.md` (bespoke-world exception for Neptunia and the one displaced-water exception), `plans/reachship-neptunia.md` (this plan), `src/planet.js` header comment, `scripts/probe-pads.mjs`, `.claude/skills/verify/SKILL.md`, `.claude/agents/planet-creator.md` and `station-creator.md` Neptunia references, `world/warzone.js` and `world/cityRegistry.js` headers.

## Read before implementing

`src/walk.js`, `src/game.js` (sky block), `world/skycity.js`, `world/city.js` (`makeStructure`, `createCity` contract), `src/shaders/water.frag`, `plans/skycity-saturnia.md`.

## Addendum (owner, after approval): the tube and the detonation

- **Moon pool and tube.** Amidships on the working deck a moon pool heads a transparent tube that runs through the sea to a seabed hab. Descent is a glass lift capsule; existing sea life is routed past it. The processing hold shifts forward to make room.
- **Quest order.** Wonder tour first (still grants the jetpack), which unlocks Ossva's bomb mission: ride down, find the explosive, arm it, report back.
- **The twist.** Pressing the arm button detonates. The player dies and respawns through the normal death flow.
- **Aftermath, permanent in the save.** Neptunia becomes a half-planet: one intact ocean hemisphere with a fractured purple-rock cut face, the other half a debris field of chunks (some holding pockets of sea and drifting jellyfish). The ship is a dark tumbling derelict in the debris; fly-by only, no landing or walking, crew gone. Landing capture, nav, gravity and the nearby Halcyon station must respect the shattered state.
- **Phases 8–9.** P8: moon pool, tube, capsule ride, seabed hab, bomb mission dialogue and gating. P9: detonation sequence, death hand-off, persisted `neptuniaShattered` flag, shattered-planet rendering (hemisphere clip + cut face + instanced chunks + derelict), system guards.

## As built (differences from the plan above)

- **Site.** The ship moved off the old Indigo Reach site to `V(-0.933589, -0.142217, 0.328917)`, an even plain 205 u deep, and `oceanDepth` went to 260, so the riser has a long run.
- **Sea level near the hull.** The patch is a true plane inside 150 u and eases onto the sphere by 520 u; without that the sphere falls 6 u away at bow and stern. Swimmers and the camera follow it through `planet.water.swellAt`.
- **No walker carry.** Deck-standing walkers are tracked by hull-local height instead (`reachship.js` `hullFeet`), which is what stops a low frame rate dropping them through a deck that moved a metre between frames.
- **Collision.** The ship has its own small structure helper (slabs, z-ramps, wall boxes) so the boot bundle does not import `world/city.js`.
- **Warzone.** Dropped from Neptunia as planned; `TROPHY_WORLDS` keeps its Neptunia row so trophies already earned still hang.
- **Wonders.** Both stand awash in the open sea (210 u and 250 u off the ship); `placeOnSurface` lifts any wonder on a `noLand` world to the waterline.
- **Riser.** Anchor-frame, not hull-frame: the hull slides on its head. The lift's top station follows the deck.
- **Not built:** the spray particle system and a per-room visibility cull (the fit-out is merged into the ship's meshes instead).
- **Not measured:** frame rate on real hardware; triangle and draw-call counts against the budget in "Materials".
