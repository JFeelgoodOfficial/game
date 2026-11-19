# Nova7: Entry Zero (GDD 5.7.5) build plan (IMPLEMENTED)

## Context

The megaworld chapter (GDD 5.7.4) ends with the light ship leaving and the three captains following the pilot round the City of Light. Entry Zero is the next and last chapter of the saga: the Tenretni find one empty record in their archive, the pilot and the captains go down through the hollow megaworld to the planet the Tenretni came from, learn what drove the machine, and come back up a million years later to a world that has let go. It ends aboard the returned light ship, heading into the black hole.

The build brief is `nova7-entry-zero-prompt.md`. This plan fits it to the repo as it stands.

## Decisions taken (from the owner's answers)

| Question | Answer |
|---|---|
| Who stays aboard at the centre | The pilot chooses one of three. Each option gets placeholder consequences, flagged. |
| Captain death | The two walking captains follow the pilot inside the ship's pool of solid ground. The pool shrinks as light eaters wear the lamp down. A captain outside the edge when it passes dies. Avoidable. |
| Permanence | Permanent, saved in a `lost` list. The ascent, far era and launch adapt to who is left. |
| The old city after the jump | Replaced for good. Racing, district finds and the 40-generation crowd are unreachable once `ez_era` is reached. |
| Failure in the descent | The lattice pulse pulls the submersible back to the last node, meters reset, log kept. No death, no story reset. |
| `EZ_LIGHT` | Flag with all three built, default `'sun'`. |
| `EZ_NEW_WORLDS` | Flag, default on. |
| Descent length | Full five zones, every zone length tunable in `EZ_*`. |
| Delivery | One pull request per build step. |

Decisions I made where the brief said "pick one and tell me":

- **The release is shown as the yearly ritual**, not a memory. Every empty cage is lit, then let go dark. It reuses the pooled cage stars in `world/megaworld.js`, plays on the surface in flight and from the city, and is a present-tense act by the descendants. A memory would be a one-time cutscene.
- **Submersible controls**: mouse is torque on pitch and yaw at the ship's feel (`src/ship.js`), `W/S` thrust, `A/D` strafe, `Space/Shift` rise and sink, water drag so it comes to rest. `Q/E` change band, `L` lamp on or off, hold `Z` for every band at once (unlocked at the centre). Q, L and Z are unbound today. Touch gets band and lamp buttons in `src/touchControls.js`.
- **Still placeholders** (data in the dialogue file, marked `PLACEHOLDER`): what the one who was afraid lost, the reveal text, the three stay-aboard consequences, and every line beyond the brief's first drafts.

## Conflicts between the brief and the repo

1. **GDD 8 says "no placeholders, no TODOs".** The brief asks for placeholders. They will be data only (strings and one `EZ_STAY` table), never stubbed code.
2. **The megaworld has no inside.** It is a flat shader disc at y = -2800. The descent is therefore a set of isolated sites, as the dive bridge and shuttle are; no flight below the surface.
3. **Nothing supports weightless movement on a platform.** `src/capitalWalk.js` always applies gravity. The submersible is a site that returns `held()` true, integrates its own body in `tick()` in clamped sub-steps (site `tick` runs at render rate, not the 60 Hz step), and supplies `camera()`. Same pattern as `world/shuttle.js:433-444`.
4. **`ISO_FAR` is 4000 for every preset** (`src/isolate.js:159`). Moon-sized globes will not fit. Add an optional `far` field to presets and build the hollow at a compressed scale.
5. **The bridge, shuttle and ship sites are retired once the epilogue has played** (`src/farside.js:556-559`). The launch needs its own site; it reuses the exported `SKY_VERT/SKY_FRAG` from `world/divebridge.js`.
6. **`done` and `epilogue` can happen in either order.** The offer gates on `reached('done') && epilogue()`.
7. **Save traps.** An unknown stage name silently loads as `'suite'`; `serialize()` drops fields it does not know. Stage names are append-only and every new field goes in both `serialize()` and `restore()` (`src/chapter.js:146-161`).
8. **An unregistered hop key silently sends the player to the Landing** (`src/game.js:2555-2559`). Every new key is added in both directions in the same commit as its site.
9. **`uAged` is four separate uniforms set from four places.** The new era uses one shared `{ value }` object by reference, the way `world/farhole.js:279-330` shares `uTime`.
10. **The "upper forward corner" of the light ship is upper aft in the ship's own frame**, beside the drive rings (`world/lightvessel.js:205-218`; high grid z maps to negative local z). I will fill the cells the skip removed, wherever they sit. One seeded RNG drives the whole build, so the loop is left alone and the new cells are a third `InstancedMesh` added after it.
11. **5.7.4 says the light ship never returns** and the Wall of Names gives the captains "no end date". 5.7.5 will say what changed; 5.7.4 gets a one-line forward reference.
12. **The GDD prefers diegetic readouts.** Lamp band, energy, dose and cabin temperature go in a `chapterHud`-style strip, because the same lamp is used on foot where there is no dashboard.
13. **One session branch and one PR per step** means the steps are serial: each PR must merge before the next branch restart.
14. **I have not seen the six reference images.** Plan mode bars writes, so unpacking them is step 0.

## Stages and save

Appended to `STAGES` in `src/chapter.js:25`:

`ez_offer` → `ez_descent` → `ez_firewall` → `ez_deep` → `ez_centre` → `ez_relics` → `ez_reveal` → `ez_ascent` → `ez_era` → `ez_launch` → `ez_beyond`

`ez_beyond` is the saved open stage; nothing is built past it. A reload there gives the end pose aboard the light ship.

New optional chapter field `ez`, written only when non-empty: `{ log, stay, lost, frags, node, clock }` (band-attribute bitmask, captain id, lost captain ids, relic bitmask, last lattice node, the crew's own clock). `chapter.clock` is left alone because `returnLine()` reads it. Old saves load unchanged.

## New files

| File | Purpose |
|---|---|
| `src/lamp.js` | Band state, the shared uniform set (`uBand`, `uAll`, lamp position, direction, reach), energy, dose, the log, and a `LAMP_GLSL` chunk every band-gated shader includes. Comments give the physical reason each thing shows in its band. |
| `src/lampHud.js` | The readout strip, cached-compare writes. |
| `src/era.js` | Shared `ERA` uniform, `EZ_LIGHT` resolution. |
| `world/entryzero-dialogue.js` | All writing, `ENTRY_ZERO` block. `chapter-dialogue.js` is 394 lines and already mixes three kinds of content. |
| `world/entryzero-audio.js` | Synthesised as `world/skycity-audio.js` does: the radio band (heard, not drawn), dose tick, lattice pulse, callers, weather and rain. |
| `world/submersible.js` | The vehicle site: body, cockpit camera, beam, emergence scene. |
| `world/hollow.js` | The interior by zone: ocean globes with ice crust and mist halo, ice shards, fog, lattice roots, strata wall. One zone resident at a time. |
| `world/hollowlife.js` | Six creatures and four threats, instanced or points, animated in the vertex shader. |
| `world/firewall.js` | The plasma wall, its guards, the burn-through. |
| `world/zeroplanet.js` | The planet as seen from the submersible, and the hover. |
| `world/zeroground.js` | Walker site: relics, handheld lamp, the shrinking pool, the captains. |
| `world/eracity.js` | The far-future additions to the City of Light. |
| `world/launch.js` | The launch site and the view from space. |
| `src/shaders/` | `hollowGlobe.frag`, `lampBeam.frag`, `firewall.frag`, `rainGlass.frag`. |

## Existing files to change

`src/chapter.js` (stages, `ez` field), `src/constants.js` (`EZ_*` block, new `CH_TIER` keys in every tier row), `src/game.js` (`FAR_HOPS` rows, debug hooks), `src/farside.js` (site builders, `door()` chain, `state()`, era light, cage ritual), `src/isolate.js` (presets, optional `far`), `src/input.js` and `src/touchControls.js` (Q, L, Z), `src/shaders/megaGround.frag` and `world/megaworld.js` (`uEra`, `#define ERA` gated like `DETAIL`), `src/shaders/tenretniHull.frag`, `world/farhole.js`, `world/divebridge.js` (`SKY_FRAG` era), `world/lightcity.js` (era mode, offer wall), `world/lightpavilion.js` (the Archivist's offer), `world/lightvessel.js` (the finished corner, crumbling hangar), `src/chapterHud.js` (clock width for `1048576Y`), `GDD.md`, `.claude/skills/verify/SKILL.md`.

## Build order

Each step is one commit set, one PR, with test steps in the PR body and a `__debug.ez` hook.

| # | Step | Stage reached | How to test |
|---|---|---|---|
| 0 | Unpack images to `plans/entry-zero/`, look at them, save this plan as `plans/entry-zero.md`. Stage names, `ez` save field, `EZ_*`, dialogue file, `__debug.ez.go()`. | none | Load an old save and a seeded new one; both round-trip. |
| 1 | The offer: the Archivist, the archive wall with one dark cell (the `uGiven*` match in `CELL_FRAG`), lamp and submersible given. | `ez_offer` | Seed `done` + `epilogue`, walk to the Archivist. |
| 2 | The lamp and the submersible in an empty test hollow: controller, bands, beam in mist, range by medium, energy, dose, log, HUD, radio audio. | none | `__debug.ez.sub()`; cycle bands, watch meters. |
| 3 | The hollow, zones 1 and 2: globes, lattice, the pulse ride, all creatures, light eaters and heat leeches, pull-back on failure. | `ez_descent` | Fly both zones; drain the lamp to see the pull-back. |
| 4 | The firewall, radiation feeders. | `ez_firewall` | Hold the key band on the wall. |
| 5 | Oldest layers, the radio threat, weight returning. | `ez_deep` | `seek` to zone 4. |
| 6 | The centre: full-log check, every band at once, the planet, the hover height, the choice. | `ez_centre` | Seed a full log; try each of the three choices. |
| 7 | The relics: walker site, handheld lamp, fragments, the pool, captain death. | `ez_relics` | Walk a captain past the edge; reload and confirm `lost` holds. |
| 8 | The reveal. | `ez_reveal` | Seed all fragments. |
| 9 | The ascent and the emergence shot: rain on the glass, weather first, then sky, then the empty cage. | `ez_ascent` | Scene `seek`; arrive after it has played to get the end pose. |
| 10 | The megaworld a million years on: `uEra`, seas, overgrowth, dark conduits, empty cages, `EZ_LIGHT`, the ritual. | `ez_era` | Fly the surface at each `EZ_LIGHT` value. |
| 11 | The far-future city, the finished corner of the light ship, three clocks in a line. | `ez_era` | Walk the city with zero, one and two captains lost. |
| 12 | The launch, the view from space, `EZ_NEW_WORLDS`, `ez_beyond`. GDD 5.7.5, verify skill paragraph. | `ez_beyond` | Play the launch; reload into the end pose. |

Steps 3 to 5 are the bulk of the work. Step 3 alone is larger than any single PR in the history so far and may split into two.

## Rules kept

No dependencies, no assets, no allocation in the frame loop, `InstancedMesh` or `Points` for anything repeated, counts from `CH_TIER`, every place a `capitalWalk` site under the white, every timed scene one clock and `pose(t)`, stages forward only.

## Verification

Per `.claude/skills/verify/SKILL.md`: headless Chromium with SwiftShader, `__debug.quality.set('medium')`, wait on state and never on timeouts. For each step: seed `fgsf.tenretni` with the stage before it, drive it through `__debug.ez`, screenshot at medium, and check draw calls and live geometries against the `AUDIT.md` method. Old-save check on every step: a 5.7.4 `done` save must load to the same state as on `main`. `npm run build` must pass before each PR.

## As built

Twelve steps, twelve pull requests (#107 to #118). GDD 5.7.5 describes the result; this is what differs from the plan above.

- **Files.** `world/firewall.js` was not written: the wall is zone 3 of `world/hollow.js`. `src/shaders/` gained nothing: every new shader is a template string in the module that uses it, as the chapter before did. `megaGround.frag` and `tenretniHull.frag` were extended in place.
- **Stages.** `ez_era` begins when the emergence ends, not when the city is first entered. `ez_ascent` is the stretch between the firewall (going up) and the end of the emergence.
- **H-alpha.** Seen and not a beam, except at the firewall, where it is a beam. The plan did not foresee that the key band would have to be both.
- **Lower nodes ask for the zone's bands** before they take the vessel. Not in the plan; added so the log is whole by the centre.
- **The way up skips zone 4.**
- **The reveal** is played aboard the vessel, carried up over the planet, not on the ground.
- **The rite** is on a timer (first at 25 s of flight, then every 260 s).
- **The corner of the light ship** is upper aft in the ship's own frame, as conflict 10 said.
- **Coming back at `ez_beyond`** is done in `src/game.js`: park, step out, hop.

Still placeholders, all in `world/entryzero-dialogue.js`: the three relic fragments, the four lines of the reveal, what each captain says when chosen, what is said when one is lost, and the `STAY` numbers.

Not verified, and said so in the pull requests: frame rate anywhere (the test rig is a software rasteriser), the feel of the submersible and of every chase, `EZ_LIGHT` at `'hole'` and `'none'`, `EZ_NEW_WORLDS` off, and a captain led past the edge on foot rather than placed there.
