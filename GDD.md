# Game Design Document — Untitled Space Flight

**Status:** pre-flight. Written before any code exists. Section 3 contains assumptions to be replaced with measured values after Phase 1 ships. Do not treat Section 3 numbers as design decisions; they are starting points for tuning.

**Audience:** build spec for an AI coding agent. Constraints and acceptance criteria, not pitch material.

**Constraints:** solo developer, spare time, browser target, Vercel static deploy, no art budget, no downloaded assets.

---

## 1. What this is

A first-person space flight experience in the browser. The player sits in a cockpit and flies a ship with real momentum through a star system containing nebulae, a star, planets, and a black hole. Gravity acts on the ship. Eventually the ship can descend through an atmosphere, fly low over terrain, and climb back out.

You never leave the cockpit. This is the defining constraint of the project and everything below depends on it.

The reference point is the first thirty seconds of No Man's Sky — cockpit, stars, weight, a planet ahead — not its content systems.

### 1.1 The test

If a player flies for two minutes and says "that felt like a real ship," the project succeeded. Every decision below is subordinate to that.

### 1.2 Non-goals

Permanent. These are what kill hobby space games, and several were considered and cut:

- Combat, weapons, enemy ships
- EVA — leaving the ship in open space
- Walking, on planets or anywhere.
  > **Owner override (2026-07):** the original cut here was "never leave the
  > cockpit." Two walk modes have since been added, on separate keys:
  > - **C — ship interior** (`interior.js`): stand up from the seat and walk
  >   the freighter — flight deck, a vestibule with the Wave Collector plaque,
  >   a 30 m gallery hall hanging the whole painting collection under a glass
  >   roof, and a stern observation lounge. Sit back down to fly. Collision is
  >   a short list of axis-aligned boxes with a circle push-out (the hall has
  >   freestanding partitions, so range clamps no longer suffice); it is local
  >   to the interior and nothing else collides. The ship holds attitude and
  >   brakes to a drift while you're up; gravity and the black hole stay live.
  >   (2026-11: this replaced the separate Orbital Art Gallery station.)
  > - **G — on-foot planet walk** (`walk.js`): disembark over a rocky planet
  >   when low and slow, walk its terrain (feet snap to the terrain height
  >   field the surface shader already uses — a snap-to-ground, not a general
  >   collider), G again to board. This is the one exception to "never leave
  >   the ship"; EVA in open space stays cut.
- **Landing.** The ship never touches down. See 1.3.
- Collision of any kind. Nothing in this project can be crashed into.
- Multiplayer
- Resource gathering, inventory, crafting
- Multiple star systems, warp, galactic map
- Ship customization or upgrades
- Mobile or touch support
- Save state or persistence
- Sound beyond, at most, engine tone

Combat and EVA were cut deliberately. Combat would force Section 3 to be re-tuned toward responsiveness, the opposite of what this document builds. EVA required a modeled ship exterior, a surface-walking controller, and a physics answer for standing on an accelerating body — the item most likely to consume the project without producing a shippable build.

### 1.3 Why no landing

Landing was in an earlier draft and was cut. It cost about a week — contact points, gear, a settle — but it was a week spent arriving somewhere with nothing to do.

Removing it changes the terminal state from a destination to a loop (Section 7), and it drops the altitude floor into the terrain design (5.1), which is where most of the savings actually come from. The ship never stops moving. That's the design, not a limitation.

---

## 2. Technical foundation

| Concern | Decision | Reason |
|---|---|---|
| Renderer | Three.js (r160+) | Raw WebGL costs 1,000 lines before a triangle appears. |
| Build | Vite, defaults | `base: './'` for Vercel. |
| Language | Vanilla JS, ES modules | No framework. There is no UI tree. |
| Dependencies | `three`, plus `lil-gui` in dev only | See 2.3. The panel is not optional. |
| Assets | None. All procedural. | No art budget. Shaders and geometry only. |
| Deploy | Vercel static | `vite build`, output `dist/`. |

### 2.1 Performance budget

60fps on integrated graphics (Intel Iris Xe class). Hard constraint — it dictates the LOD design in Section 5.

- Zero allocation inside the frame loop. Vectors, quaternions, matrices preallocated at module scope.
- Anything repeated uses `InstancedMesh` or `Points`.
- One draw call per starfield layer.
- Fixed-timestep physics, decoupled from render rate.

### 2.2 File layout

```
index.html
vite.config.js
src/
  main.js           loop, composer, resize
  constants.js      every tunable number, single source
  input.js          pointer lock, keyboard state
  ship.js           physics: velocity, angular velocity, integration
  gravity.js        bodies register here; returns accel at a point
  origin.js         floating origin. see 5.2.
  camera.js         cockpit camera, rotation lag, drift
  tuning.js         lil-gui panel, dev build only
  starfield.js
  nebula.js
  cockpit.js
  blackhole.js
  planet/
    planet.js       sphere, LOD control
    surface.js      procedural surface shader
    atmosphere.js   scattering shell
    water.js        sea-level plane
  shaders/
    nebula.frag
    lensing.frag
    accretion.frag
    surface.frag
    surface.vert
    atmosphere.frag
```

`constants.js` is load-bearing. Every number a human might want to change lives there and nowhere else.

### 2.3 The tuning panel

`lil-gui`, bound to every value in `constants.js`, mounted only when `import.meta.env.DEV`. Stripped from production.

Not a nice-to-have. Section 3's constants are guesses, and the only way to replace them is fly, adjust, fly again within a few seconds. Edit-rebuild-refocus takes long enough that the comparison is gone by reload. Build the panel in Phase 1, before tuning anything.

Include a button that dumps current values as a `constants.js` literal to the clipboard. Tuning that can't be saved gets lost.

---

## 3. Flight model

**Assumption. Replace after Phase 1.**

The ship is a rigid body with linear and angular velocity persisting across frames. Not a camera with a move speed.

### 3.1 Behavior

Thrust applies force along the ship's local forward vector. Releasing thrust does not decelerate — the ship coasts. This is the most important rule in the document. A ship that slows when you let go feels like a cursor.

Mouse input applies **torque**, not rotation. The ship resists, follows, then keeps rotating after input stops. Angular damping bleeds it off. The gap between input and response is where "heavy" comes from.

### 3.2 Gravity

Phase 1, not a later addition. A model tuned in vacuum feels wrong the instant mass exists, and re-tuning after means throwing the tuning away.

`gravity.js` holds bodies with position and mass. Each frame it returns summed acceleration at a point: `a = Σ G·m·r̂ / max(r², softening)`. The softening term prevents r→0 from launching the ship to infinity. Applied to velocity before integration.

What this buys cheaply: orbits emerge unscripted. Slingshots emerge. Coasting past a planet bends. The ship gains a reason to have momentum — in empty vacuum momentum is a control annoyance; with mass in the world it becomes the mechanic.

Real G at real masses produces float32 problems and timescales in hours. Use a scaled `G` tuned for play. One of the panel's most important sliders.

**Speed cap.** No drag means sustained thrust reaches a speed where parallax stops reading and precision fails. Above `SOFT_CAP_SPEED`, scale thrust effectiveness toward zero rather than clamping velocity. A hard clamp is felt as a wall; a soft one is felt as the engine topping out.

### 3.3 Controls

| Input | Action |
|---|---|
| Mouse | Pitch and yaw torque |
| W | Thrust forward — full power. W *is* the boost; there is no separate boost key |
| S | Thrust reverse (base power) |
| [ / ] | Roll (also the two paddles either side of the CODEX disc). Over the megaworld the wings ease level when neither is held. |
| Space | Counter-thrust (kill velocity, held) |

Pointer lock on click. No menus.

### 3.4 Starting constants — replace by measurement

```js
ANGULAR_DAMPING   = 0.94    // per frame, at 60hz
LINEAR_DAMPING    = 1.0     // exactly 1.0. no drag in vacuum.
TORQUE_SCALE      = 0.0008
THRUST            = 12.0
BOOST_MULTIPLIER  = 7.0     // applied whenever W is held (see 3.3)
CAMERA_LAG        = 0.12    // slerp factor, camera toward ship rotation
CAMERA_DRIFT      = 0.03    // positional offset under acceleration
G                 = 400.0   // scaled, not real. tune for play.
GRAVITY_SOFTENING = 25.0    // min r² term
SOFT_CAP_SPEED    = 800.0   // thrust falls off above this

// Phase 5. See 5.1.
MIN_ALTITUDE      = 2000.0  // meters. drag climbs sharply below this.
FLOOR_DRAG_POWER  = 4.0     // how sharply. higher = harder floor.
ATMOS_TOP         = 80000.0 // where drag starts at all
SEA_LEVEL         = 0.48    // noise threshold for water
```

Guesses. `ANGULAR_DAMPING` and `CAMERA_LAG` decide whether it feels like a ship; `G` decides whether the system is a place or a backdrop; `MIN_ALTITUDE` decides the entire terrain budget. Expect real time on those four.

### 3.5 Acceptance criteria for Phase 1

- Releasing thrust far from mass results in indefinite coasting, no velocity loss.
- Stopping mouse movement results in rotation decaying over roughly half a second.
- Pointing 90° off velocity and thrusting produces a curved path, not an instant direction change.
- Camera visibly lags ship rotation during hard turns.
- A stable circular orbit around a test mass is achievable by hand. This is the gravity test — if orbits can't be flown, `G` or softening is wrong.
- Flying into a test mass produces no NaN and no infinite velocity.
- 60fps with only the test mass in scene.

If these hold, Phase 1 is done regardless of how it looks.

---

## 4. Space environment

### 4.1 Starfield

Three `Points` layers at different distances with different parallax rates. Near layer sparse and bright, far layer dense and dim. Not a skybox — parallax across depth is what makes motion legible in a featureless void. Without it, flying looks like standing still.

Star colors from a rough blackbody range: blue-white through yellow to dim red. Mostly dim. A few bright.

### 4.2 Nebula

Inverted sphere, fragment shader, layered value noise written out in GLSL. Dark, desaturated. One accent color — magenta or cyan, chosen once and committed to across the whole project.

Failure mode: a nebula that looks like a screensaver. Too bright, too colorful, too much of frame. It should be barely there. Restraint reads as expensive.

### 4.3 Cockpit

Geometry only. Two canopy struts crossing the view, a dashboard lip along the bottom edge, one interior light positioned to catch the struts as the ship rotates.

The moving highlight on the strut sells the interior. Worth more than any HUD element, costs almost nothing.

No instruments, no HUD. If a speed indicator proves necessary, it is diegetic — geometry on the dashboard, not DOM.

Since the player never leaves, the cockpit is the only part of the ship that is ever seen. There is no exterior and none needs to be built. This is a significant saving and a direct consequence of cutting EVA.

> **Owner override (2026-07):** the interior grew beyond the canopy — see the
> §1.2 note. The ship now has a walkable corridor (`interior.js`, key C)
> rendered as a second overlay scene, and an overhead canopy window glanced
> at by holding V. There is still no modeled ship *exterior* — the on-foot
> planet walk (`walk.js`, key G) reuses the pilot as a ground camera and
> never shows the ship's hull. A seventh station, Foundry Anchorage, adds an
> asteroid being actively mined (`stations.js`).

### 4.4 Post-processing

`EffectComposer` with `UnrealBloomPass`. Threshold high enough that stars and emissive accents bloom while cockpit geometry doesn't. Mild chromatic aberration at frame edges.

No film grain. No vignette. Both disguise a scene that isn't working; fix the scene.

### 4.5 Black hole

Phase 2. Cheap relative to how it looks — the best-value item in this document.

**Lensing.** Screen-space pass, or a shader on a sphere at the horizon radius, bending rays toward the background by impact parameter and sampling the starfield along the bent path. Full geodesic integration is unnecessary — a weak-field `1/b` deflection reads correctly and costs almost nothing. The payoff is the starfield warping as you orbit.

**Accretion disk.** Flat annulus, additive blend, procedural noise scrolling in differential rotation (inner edge faster). Temperature gradient, white at inner edge to red at outer. Reuse the 4.2 accent color.

**Photon ring.** Bright thin circle at roughly 1.5× horizon radius. One line in the shader, and most of what makes the image legible as a black hole rather than a dark blob.

**Gravity coupling.** Registers in `gravity.js` like any body. Its mass makes flying near it interesting and makes the speed cap matter — a close pass builds real velocity.

The horizon is not a hazard. Falling in does nothing; death does not exist in this project.

Acceptance: fly a close pass and watch the starfield bend. If that isn't beautiful, the lensing math is wrong.

---

## 5. Planets and the flyover

**The expensive half of the project.** Sequenced so stopping after any phase leaves something that runs.

The terminal goal is the flyover: descend from orbit through an atmosphere, fly low enough to see mountains, lakes, and oceans as landforms, then climb back to space. No touchdown. The ship never stops moving.

### 5.1 The altitude floor

`MIN_ALTITUDE = 2000` meters, roughly. Enforced as rapidly increasing drag below the floor, not a hard wall — the ship feels the air thicken and refuses to go lower. Never a collision, never a stop.

This single constant is the most load-bearing decision in the document after `ANGULAR_DAMPING`, because it sets the entire terrain budget. At 2km a mountain is a silhouette and a lake is a shape. Nothing needs to survive close inspection. No rocks, no ground texture, no meter-scale anything.

Lower the floor and the LOD requirement grows nonlinearly. Do not lower it casually. If terrain looks good at 2km and the temptation arrives to go to 500m, understand that's a different project.

The floor also removes collision entirely. Nothing can be flown into, so nothing needs a contact model. This is why there is no `contact.js` in the file layout.

### 5.2 Why descent is still hard

Scale range. From orbit a planet is a sphere thousands of km across. At 2km it's a landscape with a horizon. The same object has to be both, and float32 breaks somewhere between.

Cutting landing helped less than it seems. Landing was Phase 6 — maybe a week of contact points and gear. Descent is Phase 5, and Phase 5 is the wall. What the flyover actually saves is the bottom of the LOD tree and the entire precision fight at ground level. Call it a third off Phase 5, not the elimination of it.

### 5.3 Floating origin

The ship stays near (0,0,0); the universe translates around it. `origin.js` owns this.

Retrofitting it later means touching every system that holds a position. **Build it in Phase 1.** Cheap upfront, expensive after. The one place where building ahead is correct.

### 5.4 Phase 3 — planet from orbit

Single icosphere. Surface color from a procedural fragment shader: layered noise for continents, elevation-banded color, no geometry displacement yet. Slow rotation.

Acceptance: a planet you can fly toward and orbit that reads as a planet from far out.

### 5.5 Phase 4 — atmosphere

Second sphere, slightly larger, backside-rendered, scattering approximation in the fragment shader. Rim glow, thicker at grazing angles.

Disproportionate visual win. The limb against black is most of what makes the orbital view beautiful.

Acceptance: visible atmospheric limb, sun-angle-dependent.

### 5.6 Phase 5 — descent and terrain

**Months, even with the floor.** Three things at once:

**LOD.** Quadtree subdivision on the sphere, subdividing faces near the camera. Vertex displacement from the same noise field the orbital shader uses, so the near surface is continuous with the distant view. One sphere, procedural. The floor caps subdivision depth — tune the depth limit against `MIN_ALTITUDE` and stop there.

**Two flight regimes.** Vacuum has no drag. Atmosphere has drag, lift, and a down vector. The transition must be continuous or the ship jerks at the boundary. `LINEAR_DAMPING` becomes altitude-dependent rather than exactly 1.0, and below `MIN_ALTITUDE` it climbs sharply to enforce the floor.

**Water.** Threshold the terrain noise at `SEA_LEVEL` and render a flat reflective plane there. Oceans emerge where the field falls below it; lakes emerge in basins that happen to dip below it inland. Lakes are not built — they're a consequence of the noise having real basins. If none appear, the noise is too ridged; tune toward broader, lower-frequency features.

The flat-water-against-rough-land contrast is most of what makes terrain read as a planet from the air. It's a threshold and a plane. Highest value per line in the project.

Acceptance: fly orbit to 2km continuously. No loading, no LOD popping, no jitter, no discontinuity at the atmosphere boundary. Mountains read as mountains. Water reads as water.

No shippable midpoint. Expect a long stretch where the project is broken.

### 5.7 Phase 6 — planet variation

Small, once 5.6 works. One `biome` parameter fed to the same shader, not separate systems:

- Ocean world: `SEA_LEVEL` high, most of the surface water
- Ice world: `SEA_LEVEL` high, white-blue palette, water frozen (flat but not reflective)
- Dead rock: `SEA_LEVEL` below the terrain minimum, so no water appears at all

"If it's got them" is the design. Not every planet has oceans. The variation is a palette and a threshold, and it's why the system has more than one planet worth flying to.

Acceptance: three planets that read as different places using one shader.

**Recorded exception — wyattmattoe.** The extreme-alpine world is still one config object (palette + thresholds + the shared shader; the tallest `terrainHeight` and heaviest ridge weight in the system), but it carries one opt-in system on top of the archetype contract: the snowboard, gated by `boardable: true` and implemented as a branch of the on-foot walker (`walk.boarding` in walk.js, `BOARD_*` block in constants.js — the diving precedent, not a separate loop). No new shaders, no new render passes, no per-frame allocation. Any future planet can opt in with the flag alone.

**Recorded addition — wyattmattoe's resort (lifts, riders, weather).** The basecamp scene (`world/wyattmattoe.js`) grew three sub-modules, each its own file, all additive and all torn down with the walk session. *The Highline chairlift* (`world/wyattmattoe-lifts.js`): two terminals, towers footed on the real terrain, one closed haul cable and a loop of chairs. The line is PROBED per landing, not authored — 24 bearings x 5 lengths scored for height difference, penalising wrong-way slope, long lake crossings and cliffs, and rejecting anything across the town or the parked ship — so the far terminal may be above the basecamp or below it. From the Kite Saddle pad the town sits on levelled high ground, so the basecamp terminal is the TOP station and the lift drops ~85 u to a valley terminal on the lake ice. E at a terminal's gate takes the next empty chair (~30 s at 7 u/s, look around freely, E again hops off early); it sets you down on the ground at the far end, and works in both directions. The ride is a walker override stepped from `stepWalk` (the elevator precedent), with a seated `'lift'` astronaut pose. A groomed piste is cut from the terrain mesh's own triangles under the line so it cannot float or z-fight. *Riders* (`world/wyattmattoe-riders.js`): 22 snowboarders and skiers (14 on low quality) as four InstancedMeshes — rigid figures that yaw onto their line and lean into each carve, descend, queue, ride the chairs back up and drop in again. Ambience only: no collision, one terrain sample each per frame. *Weather* (`world/wyattmattoe-storm.js`): every 2.5–4 minutes on foot (first one 75–120 s after stepping out) a snowstorm blows through for 30–45 s — a purple storm dome over the sky, driven snow, fog closing to a couple of hundred units, and a gusting wind that drifts the walker 1.2–4.2 u/s (a displacement added before the collision pass, so walls still hold; standing still through a storm carries you ~80 u, walking into it still makes headway). When it clears, the sky stays dusk-dark and an aurora — additive folded curtains, green to violet — hangs for 60–75 s before the day returns. The storm never writes the scene's fog, sun or environment itself: it animates a small weather record that `world/planetsky.js` folds in after its own per-frame blend (`planetSky.setWeather`), which is what makes leaving mid-storm leave nothing behind. No new render passes, no per-frame allocation, no dependencies; other worlds never construct any of it.

**Recorded addition — permanent towns (cities v2).** Cities stopped being pop-up (seeded from the landing direction, rebuilt differently every landing) and became registry entries; v2 then consolidated each landable world down to ONE flagship town (`world/cityRegistry.js`: fixed site, fixed seed, fixed landing pad) that inherited its deleted sibling cities' wonders into a `wonders[]` tour. A town is ~8 named citizens — REAL humans via `world/people.js` — each with their own fully enterable building (real floors, glass windows, open doorways, high ceilings, role-keyed furnishing, all from the shared PBR material registry), plus an elevator tower whose enclosed cab rides to a glass penthouse where the town's GOVERNOR lives. The governor gives the town's quest — a beacon-chain tour of all its wonders — and completing it awards one of four persistent vehicles (plane, motorcycle, jetpack, hang glider; `src/inventory.js`, deployed on foot via the I selector, ridden as walker branches like the snowboard). The landing pad sits just OUTSIDE the town edge with a lit walkway in; the G auto-land arcs to it, manual touchdown anywhere still works, and far-from-town landings are wilderness. The story worlds (actuality, shadowreach, wavemall prime) have no registry entries and keep their total conversions. glacia and oceana were retired from the roster; Frostwatch Relay re-parked at wyattmattoe.

---

### 5.7.1 The Emberdeep and the aft patio (Rustia)

*(Owner addition, like the walkable interior and the towns. A quest line with a place at the end of it and a reward you can stand on.)*

Redline Claim is a mining town, and until now nothing in it was a mine. The Emberdeep is: a steel headframe beside the walkway in from the landing pad, a cage, and a hundred and twenty metres of shaft.

**The loop.** Walk to the headframe, step into the cage, **E**. The cage drops — eleven and a half seconds of rough rock, steel sets and caged bulbs going past, with more and more ore showing in the walls the deeper it gets and the daylight at the collar shrinking to a point. At pit bottom a haulage tunnel runs to a working stope, where the live seam crosses the far wall and one loose piece sits on a crate, ringed in light (**E** takes it), and on into the reason to come down at all:

**The cathedral.** Four generations of miners carved it out of the ore-bearing rock between shifts, in the manner of the salt cathedrals (Wieliczka, Zipaquirá). A narthex with a font of raw ore; a nave eighty metres long under a ribbed pointed vault twenty-eight metres up; ten bays of clustered columns and moulded arcade arches with a glowing clerestory above them; side aisles with blind niches; three chapels a side (the Lamp, the Pick, the Cage); stone pews; five ore chandeliers; and at the east end a raised chancel, an altar, the Heart-ember — the first crystal the claim ever struck, left standing — and a great window of thin-pared ore behind carved tracery, five lancets under a rose. Five miners are down there and will talk. The light is the ore: veins in the rock, crystal on the capitals and the bosses, backlit panes, and bloom to carry it. Dark rock, warm light, nothing else.

**The reward.** Carry the ore back up and show it to Baron Rynva in the penthouse. He keeps it, and has his fitters cut a door in the stern of your ship: an **aft patio**. Stand up from the pilot seat (C), walk the length of the gallery and through the lounge, and step outside onto an open deck with a rail, two lamps and somewhere to sit — and the whole live sky around you, planets, rings, sun and nebulae, with no glass in the way. It persists with the rest of the inventory.

**How it is built.**
- `world/minehead.js` — the surface works, built in the town's flat frame after the city and the warzone exist so it can find clear ground by itself; it joins `city.structures` the way warzone cover does. `world/embermine.js` — the whole underground as one self-contained flat world: half of it authored, half mirrored, merged to one mesh per material; three canvas textures (rock normal, vein network, translucent ore); twelve unshadowed point lights; collision as a union of room rectangles plus obstacle boxes and circles. Ore is drawn unlit with a colour per facet, so crystals read as crystals without a light on each.
- `src/mineWalk.js` — a flat walker *nested* in the planet walk. The town stays built and is merely hidden; nothing on the surface is stepped while you are below, so combat does not follow you down and resumes where it stopped. `walk.js` reaches it through one generic `sub` hook (not a guard per function), stores the walker's position in the planet's unrotated frame on the way down, and restores it on the way up — you come out of the cage where you went in, however far the planet turned meanwhile.
- `src/patio.js` — geometry and obstacles only; `interior.js` owns the walker. The interior is already an overlay drawn over the finished space scene, so a deck with no roof needs no rendering trick: where there is no ship, there is the sky.
- State: `inventory.js` gained `cargo` (carried, can be handed over) and `upgrades` (permanent), kept apart from the vehicle catalog; the journal tracks `rustia-emberdeep` as `found → ore → done`. Old saves load unchanged.

**Feel constants worth knowing:** cage speed and shaft depth (`RIDE_SPEED` 13 m/s over `SHAFT_H` 120 m — the ride is the first act; shorter and it is a loading screen, longer and it is a wait); the mine's exposure, bloom threshold and fog (`MINE_*` in `mineWalk.js` — the difference between a cathedral and an orange room is almost entirely these three and the light intensities in `embermine.js`); `PATIO_LEN`.

### 5.7.2 Tenretni: the governor's secret (Rustia → Terra)

Owner addition. Once the patio is fitted, Baron Rynva ends the hand-over with
"Do you want to know a secret?" (registry `mine.secret`, `src/mineWalk.js`
`secretOffer`/`secretOutcome`). No closes the panel and he asks again on later
visits; yes sets the journal stage `tenretni` to `armed`. Only one choice fits
a dialogue, so while his wonder-tour offer is pending the secret waits behind it.

With the secret armed, choosing Terra in NAV (`engageWarp`, `src/tenretniLazy.js`)
ends with the ship glided to a fixed viewpoint 2,600 units off Terra and held
there (`stepTenretniHold` replaces `stepShip`): stern to open space, sun
`TENRETNI_HALF_ANGLE` to the left, Terra the same to the right. The pilot can
stand, walk and look, but not fly. Stepping onto the patio deck starts a
90-second script (`src/tenretni.js`, its own lazy chunk):

| Script time | Beat |
|---|---|
| 0–10 | wormhole opens |
| 12–26 | the machine-world Tenretni comes through |
| 26–42 | beams; the swarm (one `Points`, 4k/12k/30k by tier) leaves for Terra |
| 40–56 | the tunnel reaches out and strikes |
| 57–76 | the sea drains up the tunnel; Terra dries outward from the strike; the city grows there |
| 74–90 | tunnel breaks (two ring frames stay adrift), Tenretni withdraws, wormhole settles |

Every object is placed by `pose(u)` from the script clock alone, so the debug
handle can seek and a reload into the finished world is `pose(90)`. Afterwards
the stage is `done`: Terra is dry (`setPlanetDrain` in `src/planet.js`,
`uDrain`/`uTech` in `surface.frag`), carries the city at the saved strike point
(`localStorage['fgsf.tenretni']`), takes no landings (`cfg.noLand`), and the
wormhole remains. A world reset mid-event drops it and leaves the secret armed.
Tunables: `C.TENRETNI_*`. Tenretni is an original design, not a copy of any
existing franchise's ships.

**Act two: the worldship** (script time 90–165, stage `done` → `ship`). The
script runs straight on. Terra stops turning (`p.spinLock`); the city takes the
whole surface behind a bright front, with 700 instanced spires (`uTech` span to
π); a bore opens over the magma core (`uBore` discards the surface inside a
cone; behind it an inward shell and the core, `tenretniShell.frag` /
`tenretniCore.frag`); three engines grow opposite the bore and light. A save
already at `done` plays this the next time it is in space, unheld.

**The capital** (`world/capital.js`) comes up on the strike point at 160: a deck
on a pylon 280 units over the datum, clear of the towers. Landing pad, plaza,
a command station on a raised dais, a navigation deck with a chart of the
system. `game.js` docks on it as a third entry in `DOCKS`, beside the Sky City
and the Indigo Reach: enter Terra's shell at stage `ship` and the capital takes
the helm. `src/capitalWalk.js` is the Sky City walker reduced
to walking; it cannot leave the deck. Nine robots stand there (tall, green, one
eye bar; every head follows the player). The Warden says the ship's navigation
log has been copied and the world needs a planet with water; the navigation
console offers Wyattmattoe or Neptunia.

**The voyage.** Picking one moves Terra's whole group to a standoff beside that
planet in about 42 s (`startSail`/`stepSail` in `src/tenretni.js`), written
between live vectors so origin rebases cannot fight it. The walker, parked
ship, capital and Terra's two stations ride along; the wormhole and the loose
ring frames stay behind on their own anchor. `terra.sunBase` is refreshed every
frame. On arrival it holds there; nothing happens to the water planet yet. The
console then offers the other one. Saved in `fgsf.tenretni` as
`{city, bore, rotY, at}`; a reload mid-voyage has already arrived, and a world
reset re-parks it.

**Assimilation** (`src/assimilate.js`). On arrival the worldship does to the
water world what Tenretni did to Terra, and then takes it apart. One script
clock, about 85 s (100 s for Wyattmattoe): a heat beam melts the ice world to
open water first (`setPlanetMelt`); the swarm crosses; the tube strikes; the
sea drains; the city takes the surface; then the planet shrinks to nothing
while 420 instanced chunks stream to the worldship, and it is removed from
space (`removePlanet`: hidden, no gravity, no floor, off NAV with its stations,
its dock skipped). The worldship then grows ×1.5 (`setPlanetScale`; the capital
re-seats and its pylon stretches). After the first world an iris shield closes
over the bore; after the second it has a thin green air shell. Either order
works. Saved as `eaten[]`, `size`, `eating` in `fgsf.tenretni`; a reload or
world reset part-way finds the planet already gone.

**The holodeck** (`src/holodeck.js`, `src/holoPanel.js`). With both water
worlds gone the Warden thanks the pilot and the ship gains the `holodeck`
upgrade: the third starboard window of the gallery becomes a doorway into a
gridded room with a wall panel. The panel lists programs, one per assimilated
world worth keeping: Wyattmattoe (lands at Kite Saddle, beside the ski hill
and lift) from the start, then Shadowreach, Actuality and Stevenlacey as each
is consumed. A program is the real on-foot world: `startHolo` in `game.js`
puts the removed world back for the session (`holoWorld`), keeps the ship's
true position in absolute coordinates, and runs the ordinary walk. **G ends a
program from anywhere** and stands the pilot back at the panel; Actuality's
finale and the coin's fold-up end it the same way instead of resetting the
game. The worldship's clock is paused while a program runs on an isolating
world.

**The clock.** After the second water world the worldship takes no more
headings. Every `TENRETNI_QUICK_WAIT` + ~50 s it sails to and consumes the
next of Shadowreach, Actuality, Stevenlacey (the assimilator's short form: no
tube, no drain; ×1.12 growth each), then Wavemall Prime, Saturnia and Rustia
`TENRETNI_SIEGE_WAIT` (4 min) apart. With nothing left it flies into the
wormhole and is gone (`end: 'gone'`), unless the pilot is docked at or walking
the capital, in which case it waits. There is no reset.

**The war** (`src/fleets.js`, `world/warships.js`, `src/explosion.js`). The
worldship's first meal launches the fleets of the three worlds it reaches
last. Three warships guard each of Rustia (iron wedges with ember seams),
Saturnia (pale spindles ringed in halos) and Wavemall Prime (stacked blocks
with dance-floor lights that cycle colour); two freighters shuttle on each of
the three routes between them. A class is two merged geometries shared by all
its ships. Positions are a function of the clock and the planets' live
positions, so nothing is simulated or saved. All fifteen are on the NAV chart
under FLEETS and the autopilot flies to them. Once the quick worlds are gone,
the next planet's warships are wrapped in a dogfight (one swarm `Points` and
flickering tracer lines each); as the planet is assimilated they explode one
by one, and freighters die with either end of their route.

**Boarding** (`world/warships.js` `buildDeck`, `src/turretGun.js`). Fly close
to any fleet ship and it takes the helm: one `DOCKS` entry (`vessel`) serves
them all, with a stand-in planet centred on the nearest ship so the Sky City's
arc-and-descend flies round a moving hull. G steps out onto a deck kit built
on first boarding: the pad, a gangway to starboard and an open bridge wing
with the captain, two crew (alien rigs) and, on warships, a gunnery console.
`src/capitalWalk.js` walks it unchanged, and gained a gun mode. The captain
offers a comm channel (`comms[faction]`, saved). The console seats the pilot
at the ship's lance: aim, half-second charge, beam; a hit on any other fleet
ship destroys it for good (`lost[]`, saved) and helps nobody but the
worldship. A ship the pilot is docked on or walking cannot be lost.

**The ending** (`src/endgame.js`). With a channel open to all three fleets, at
least one warship left in each, and the pilot's ship within 9,000 units of the
worldship, a CALL THE FLEETS control appears (H, or a tap). One 74 s script:
every surviving warship jumps to a ring round the worldship (`fleets.muster`),
charges, and fires together; white; the worldship is removed and a new star
burns in its place; each remaining world (the coin included) falls into the
old sun and bursts; the black hole crosses to the sun and swallows it. Saved
as `end: 'star'` with the star's absolute position, and re-laid on every load
and world reset: no planets, no sun (`sun.gone`), the black hole where the sun
was, THE NEW STAR on the chart, the warships on a ring round it, freighters
adrift, the wormhole. The other ending is `end: 'gone'` (the clock ran out).
Neither can be undone.

**The rally.** After the star the three fleets cheer (40 s of lines, on the
clock only while flying), put themselves under the pilot, and a second control
appears: WE GO INTO THE WORMHOLE, TOGETHER. Every ship left forms a chevron on
the pilot's ship (`fleets.follow`), the wormhole opens wide and goes on the
chart, the autopilot flies to its mouth and hands back the helm, and the pilot
takes them in. What is through it is 5.7.3.

### 5.7.3 The far side: the megaworld (owner exception to 5.4, 5.7 and the cycle)

Owner addition. The wormhole used to reload the game onto a save with the story
taken out (a "new cycle"). It no longer does: the pilot and the fleet come out
the other side, in the same page, over a Tenretni machine world so large its
surface is flat to the horizon, with captive stars held above it in cages of
ring frames. The wormhole closes behind them. There is no way back, nothing
resets, and a save that has been through stays there (`end: 'far'`). Version
one was arrival and free flight; the black hole, the landing, the door and the
City of Light (below) came next.

**It is not a sphere.** The camera is 0.1..1e6 with no logarithmic depth and
planets have no LOD, so a world of this size cannot be drawn as one. It is a
plane in the game's absolute frame (`originOffset + local`): the arrival point
is absolute (0,0,0), where every world reset puts the ship, and the surface is
absolute y = -`FAR_ARRIVE_ALT`. Everything is placed each frame from where the
camera is, so rebases and resets need no handling of their own. `FAR_RADIUS`
(8e6) only bends the horizon and sets the pull.

| Layer | What it is |
|---|---|
| Ground | One polar disc under the camera (`megaGround.vert/.frag`). The city is its fragment shader: districts, blocks and plating at three scales, each handed the camera's place wrapped to its own period in doubles, so fp32 never holds a large number. The rim is dropped by d²/2R. |
| Towers | One instanced box on a 24,576 u tile that wraps round the camera in the vertex shader (`megaTower.vert`, with `tenretniHull.frag`). Counts by tier 4,000 / 11,000 / 17,000 / 24,000; they sink to nothing at the tile's edge. |
| Caged stars, near | Up to `FAR_CAGE_FULL` (4) within `FAR_CAGE_LOD` (45,000): a star, one merged frame (three meridian rings, an equator, two lighter rings, pedestal, pylons, spire) and a glow each. On the chart as CAGED STAR. |
| Caged stars, far | Every other one out to 8 lattice cells, one additive point each, culled by the world's own curve. |

The cages stand on a jittered lattice (`FAR_CAGE_SPACING`). Which cells hold one, and where,
is an integer hash exact in fp32, written once in GLSL (`CAGE_GLSL`) and once in
JS (`cageAt`, `world/megaworld.js`): the ground shader lays the plate, the light
and the conduits under a cage from the same numbers the cage stands on. Change
one and you must change the other.

**Physics** is the game's own. The megaworld is one gravity body, a sphere of
radius `FAR_RADIUS` whose centre is kept straight under the ship, so up is
always +y and the altitude floor (5.1) holds the ship off the roofs by drag.
Three additions to `src/gravity.js`, all opt-in per body: `noHeat` (its floor
never heats the hull: this is a place to skim at speed), `ceiling`/`ceilSoft`
(climbing eases off and stops, so the horizon stays inside the disc and the far
plane), and a constant `groundAt` (the canopy). Each caged star in view has a
floor and no pull.

**The hand-off** (`src/game.js`, the `collapse` phase). The stretch holds, the
screen whites out over `FAR_WHITE_IN`, and under the white `enterFar()` saves
`end: 'far'` and a world reset runs. `tenretni.abort()` then lays the far side
out through `applyFar()`, the same path every later reset and load takes:
`hideOldSystem()` (the wormhole, the new star, the black hole, the nebulae and
the stations, off screen and off the chart for good) and `far.apply()`. The
fleet keeps station on the pilot with a floor under it. `src/farside.js` is
part of the Tenretni chunk, not one of its own: a chunk fetch that fails at the
mouth is one the browser will not retry without a reload.

Feel constants: `FAR_ARRIVE_ALT` (how much of the first cage towers over the
pilot), `FAR_SURFACE_G` (14, under the planets' ~30, so an idle pilot is not on
the roofs in seconds), `FAR_CEIL`, `FAR_STAR_HDR`. Not measured: frame rate on
the Iris Xe reference machine. The ground shader covers half the screen.

**The black hole** (`world/farhole.js`). The megaworld is there to mine time
from a black hole, and the hole fills the sky ahead of the arrival heading. It
is a sky object: its group is re-centred on the camera every frame, so it has
one direction and no parallax. A black disc drawn straight after the starfield
paints the stars out (at 500,000 u the depth buffer cannot tell it from them)
and is still depth-tested, so a cage's mast or a hull stands in front of it.
One additive quad (`farHole.frag`) is everything that gives light: the disc
(inclined, canted by `FAR_HOLE_ROLL`, torn lanes of fire in differential
rotation), its far side lensed into a thick ring right round the shadow, and
the photon ring. The palette is fire, white-gold only in the hottest streaks,
and that is structural as well as a look: bloom takes what is over its
threshold in luminance, a ring this size blooming fogs the shadow grey, and
saturated orange at full strength is well under the threshold. Two merged
One merged ribbon mesh (`farStream.frag`) hangs from it: the wisps, faint
embers looping off the ends of the disc. (An earlier fan of fire tethers from
the rim to the horizon was removed at the owner's request.) The mining itself is
the conduits (`farConduit.vert/.frag`): broad draped sheets of iridescent glass
that hang from the disc, twist as they fall and are gathered into a funnel
over two collectors on each full-detail cage's gantry, with gold light falling
down them. Each is a flattened tube (a fifth as thick as it is wide) whose
whole shape is made in the vertex shader every frame from the mesh's own place
(the collector, fixed in the world) and the hole's (a direction in the sky),
and it moves: the drape sways, folds travel down it, its twist turns and its
face ripples. They fade out short of the hole, because eight of them crossing
the same patch of sky add up to white. Nine spiral galaxies (one mesh) stand in
the far sky and the old system's nebula is dimmed to a tenth
(`setNebulaDim`): this is not the sky the pilot left. The game's screen-space
lens pass is not used: it assumes a hole a few degrees across, blacks out
whatever is in front of it, and switches off when the centre leaves the view.

**Surface detail.** `megaGround.frag` gained, above the low tier (`#define
DETAIL`), a circuit-trace layer (one run per half-block, a fifth of them live in
amber or cyan) and relief shading that reads each block as a building; amber
districts beside the green; and block-scale light that holds past the range a
plate can be seen. The green grid lines of version one are turned well down,
the conduits between cages and the lamps round each cage's plate are the
colour of the fire overhead, and the towers are denser (11,000 at medium, on
every district and thickest downtown). The cage lattice is 40,000 u, so a
second and third cage are usually in full detail. A second tower layer, the megastructures (220 at medium, up
to `FAR_SPIRE_MAX` tall, tapered, on a 65,536 u tile), gives the middle
distance a skyline. They stand higher than the altitude floor and are flown
through, as the cage frames are; none stands on a cage's plate or under the
landing. Each cage's merged frame carries a gantry ring on eight legs.

**The landing** (`world/farlanding.js`). One pad on a mast, 6,400 u from the
first caged star and `FAR_LAND_ALT` above the plane (clear of the canopy floor
and its drag), fixed in absolute coordinates and on the chart as THE LANDING.
It is a fifth `DOCKS` entry in `src/game.js`, built like the fleet's: a
stand-in planet centred on the platform, so the Sky City's capture, arc,
descent, G to step out, G to board and W to lift off all serve it unchanged.
It answers the platform contract of `src/capitalWalk.js`. The universe is not
paused on it: the megaworld, the star and the hole are in view from the deck.
The fleet cannot follow the pilot down. `src/fleets.js` has a station mode
inside follow: within `FAR_LAND_HOLD` of the landing every ship takes a ring
`FAR_LAND_RING_H` over it, and the chevron re-forms once the pilot is 1.3
times that clear. (Follow itself stays on: without it the fleet code counts
ships whose worlds are gone as lost.)

**The door and the City of Light** (`world/lightcity.js`). A causeway runs from
the pad to a door full of light. It is not pressed: walking through its plane
raises a flag, game.js whites out (`FAR_DOOR_FLASH`), and under the white the
platform walker is handed the other site. The city is self-contained, in the
cottage's manner: its group at the scene's origin, the universe paused round it
(`acquireUniverse(null)`, the `lightcity` render preset, far plane 4,000), and
everything it changes in the scene restored in its `onLeave`, which every exit
reaches (the door, the menu, a world reset). It borrows the game's one sun and
ambient for the stay, so no light is added and no lit material is rebuilt at
the door. The pilot arrives on a railed balcony over the view, crosses a bridge
to a terrace, and is met there by a Tenretni (the capital's robot in pale
metal, `buildRobot` with a palette) who speaks a short greeting; the first
meeting saves `met` and adds a codex entry. The door stays open behind, dark
from this side, and walking back through it returns the pilot to the landing.
The city itself is seen, never walked: two instanced tower meshes, a lit
plane, three rings and a sky dome, all unlit shaders. In the sky is the white
hole: the black hole outside in the same place, inside out, a white core where
the shadow was, rings of sparks where the disc of fire is, light pouring
outward, on a deep blue sky with stars by day. The towers are dark glass with
curtain walls of cyan and gold panes; the floor underfoot is polished plate
that mirrors the sky (it shares `SKY_GLSL` with the dome) inlaid with rings and
runs of light; points of air traffic move on lanes between the towers. The
look depends on restraint: the `lightcity` preset's exposure and bloom, and
every glare term in the sky, are set low, because the scene is bright
everywhere and washes to white otherwise.

**The hangar** (`world/lightvessel.js`). West of the terrace a second bridge
runs to a gallery hung over a hangar, where a vessel is being built: behemoth,
floating over its yard inside a frame of iridescent glass blades. Its body is
some five hundred cells, cubes and prisms two cells long or tall, each turning
through the whole spectrum at its own pace and each lived in: figures dance in
every cell (`CELL_FRAG` draws colour, frame, glass, figures and motes per
fragment from one seed per instance, so the hull is two draw calls). A truss
spine runs forward to a bulb of hexagonal cells; aft is the drive, a hub in two
great rings. The upper forward corner is unbuilt. Its purpose is not stated.

**The Pavilion and the pilot's home** (`world/lightpavilion.js`). East of the
terrace a third bridge runs to the Pavilion: a round floor under a glass canopy
on twelve columns, where a captain from each of the three fleets stands round a
table (the fleets' own crew rigs, `world/aliens.js`), each with a few lines
about the rooms their people have been given. A Tenretni steward stands by the
lift and says the same of the pilot's. The lift is a ring of light in the
floor: E moves the walker (the platform walker hands a site its position
vector, and the site may write to it). It goes to the pilot's suite at the top
of a tower beside the Pavilion, 300 u above the balcony: glass from floor to
ceiling all the way round, with a bed, a curved seat, a desk and lamps. The
city, the white hole, the Pavilion and the hangar with its vessel can all be
seen from it. The sky dome follows the walker so the far plane does not cut it
from up there. The captains' and the steward's words are first drafts.

**How the pilot moves there.** Anywhere in the City of Light the pilot walks
and runs at twice the usual pace (`site.speed`), and leaves a trail of light:
sparks wound in four strands round the path just walked, opening out and
fading over `TRAIL_LIFE` seconds.

`src/capitalWalk.js` gained what a place with no ship needs, all optional:
entry options (`spawn`, `yaw`, `quiet`), `site.noShip`, `site.exit`,
`site.leaveHint`, `site.onEnter` / `onLeave`, `site.tick(dt, t)` and
`site.speed`.
The greeting's words are a first draft (`GREETING` in `src/farside.js`).

### 5.7.4 The megaworld chapter: after the suite (owner's story)

What happens to the pilot once they have been given the suite. One state
machine, `src/chapter.js`, owned and saved by `src/tenretni.js` (`ch` inside
`fgsf.tenretni`); every word, the captains, the home world and the six archive
worlds with their fragments are in `world/chapter-dialogue.js`, the one file to
edit for the writing. Tunables are the `CH_*` block in `src/constants.js`.

Stages, in order (the story only goes forward): `suite` → `demo` → `holo` →
`dive` → `shuttle` → `dream` (unused as a saved stage) → `stall` → `canvas` →
`birth` → `return` → `done`. A separate saved flag, `home`, says the light
ship is back in its hangar.

| Stage | Where | What happens |
|---|---|---|
| suite | `world/lightpavilion.js` | The pilot's home world hangs outside the glass as a hologram, all but finished. The Archivist makes the offer. |
| demo | `world/lightdemo.js` | At the gallery rail a Tenretni takes the light ship out. It jumps through the archive in order, faster each time round, and is back where it began. |
| holo | `world/lightship.js` | Aboard: six rooms, one per archived world, each closing that world round the pilot (`world/holoplace.js`). One fragment may be taken from each; they stack into a planet (`world/layerplanet.js`). After `CH_ASSIGN_AFTER` rooms the shuttle is announced. |
| dive | `world/divebridge.js` | The bridge. Clocks are synced, the helm taken, the ship goes down to the horizon. The hole to port, the megaworld as a moon to starboard, the wire between. One value, drift, drives the megaworld's flicker, the wire's pulses and its clock. Then the archive floods in. |
| shuttle | `world/shuttle.js` | One seat on a tether, the ship overhead, the ring of fire round the horizon, a third and slowest clock. At the bottom, the dream: the worlds this pilot has seen, put together wrong. On waking the megaworld's clock reads `CH_YEARS_GONE` years. |
| stall | `world/shuttle.js` | The ship renders the planet the fragments make and stops short: the archive has that one. |
| canvas | `src/drawPad.js` | Black, and a blank canvas. Mouse, touch or pen. |
| birth | `world/firstcreature.js` | The drawing is let go as a creature of light and a world begins round it in colours taken from the drawing. Saved as `fgsf.firstentry`. |
| return | `world/divebridge.js` | From the helm the ship rises; the megaworld, a thousand years older and wrapped in a lattice of light, fills the glass. `home` is set. |
| done | city | The clocks are compared in a line, the Keeper speaks, the creature swims where the hologram hung, and one cell of the light ship keeps its colours. |

The epilogue (`world/lightepilogue.js`, saved flag `epilogue`), built the
first time the city is entered with the ship home:

- The crews left behind were taken into the city and stayed. A thousand years
  of Rustia, Saturnia and Wavemall Prime living together shows as bells in the
  Pavilion's canopy, braziers of ember on the terrace, lights and signs over
  the bridges in the ships' names, banners in three colours, and their
  descendants walking the terrace, the Pavilion and the gallery.
- Across the city from the suite stands a building in the shape of the
  pilot's drawing, in its colours, about 600 units across.
- The three captains wait in the suite. When the pilot comes up, a 48-second
  scene plays: four lines, a pause in which they look at each other, and the
  light ship leaving its hangar for the hole with a Tenretni at the helm. The
  ship does not come back and can no longer be boarded.
- Afterwards the captains follow the pilot anywhere in the city and each has
  something to say.

The districts (`world/lightdistricts.js`), built with the epilogue into the
city's own walkable site, each reached by a bridge that goes up and over the
terrace's rail:

- **The Seam** (Rustia's), south-west and four units below the terrace: four
  furnaces lit through their grates, ore carts going round on a rail, anvils,
  and a wall of names.
- **The Ninth Bell** (Saturnia's), south and three units above: a ring walk
  round a well of light, eight bells on arches, a garden of pale trees, and a
  ninth bell that swings when rung.
- **Saturday** (Wavemall Prime's), south-east: an arcade on two floors under a
  ribbed glass roof, twenty-four shops (each a lit room behind glass: shelves
  of stock, a rail of clothes and a figure in the window, or a counter and
  stools), a moving stair, a desk, a fountain inside the way in, palms and
  benches down the aisle. Its bridge comes down at the arcade's open west end
  under a lit portal; the shops along its long sides are solid.
- The district floors are one shader (`TILE_FRAG`): the Seam's bolted tread
  plate with rust, the Ninth Bell's limestone flags with gold joints,
  Saturday's veined marble checker with brass strips and lit bands, and setts
  on the bridges.
- Each shows the other two peoples inside it, has descendants walking it, and
  has one thing to find that adds a codex entry. Names, signs and the finds'
  lines are `DISTRICTS` in `world/chapter-dialogue.js`.
- They sit inside the 240-unit circle the city's towers keep clear of.

The city is lived in at every stage (`world/lightlife.js`): the three ships'
companies walk the balcony, the terrace, the gallery and the Pavilion and the
bridges between them (three `speciesCrowd` crowds, one per people; a few stop
and talk), and their craft fly closed lanes round the platforms, above 36 and
below -46 so they cross no floor, clear of the suite's tower and inside the
towers' circle: Rustian ore haulers, Saturnian skiffs under a ring, Wavemall
shuttles in pink and cyan. Counts by tier (people / craft): low 18/18, medium
39/36, high 54/54, ultra 72/72. A million years on a third of the craft fly.
The descendants in the districts after the epilogue are the three peoples too.

World racing (`src/worldRace.js`, `world/racecourse.js`, `world/racers.js`),
offered at the Starter's stand on the terrace once the epilogue has played:

- The pilot picks one of seven small worldships (`RACE.worlds` in
  `world/chapter-dialogue.js`: layers, speed, grip, boost, drive colour) and
  flies three laps against the clock.
- The course is one closed line, about 3,100 units, through air nothing
  stands in: over the Pavilion, up into the sky, west above the hangar, and
  back low over the three districts. Twenty-seven gates of radius 14, each
  set off the middle (up to 20 across and 12 up).
- A racer is held to the course and steered across and up within it. It goes
  forward on its own; boost is spent with Space and earned by clean gates; a
  missed gate costs two seconds. A gate counts if the world's middle passes
  within the ring plus a third of its own radius. While the stick is pushed, the
  pilot is helped toward the middle of the next gate (`ASSIST`, strongest in
  the last 220 units, giving way to a stick pushed hard); a world left alone
  gets no help, and rivals get none.
- The city holds the pilot and gives the race the camera. E leaves a race.
  Best time per world is saved under `fgsf.worldrace`.
- The grid is the pilot and up to six others (`CH_TIER[tier].rivals`): the
  three captains on worlds from their own peoples (`RACE.captainWorld`), then
  the names in `RACE.others`. Every racer is one record stepped by the same
  code; a rival's stick comes from `think()`, which makes for the next gate
  with an error set by its skill, and eases or finds more when the pilot is
  well behind or ahead.
- Worlds that touch shove each other apart across the course by mass, and the
  one behind is slowed. A world close in behind another and in line is pulled
  along (up to 9% more speed).
- The panel shows position and the running order; the finish gives the
  pilot's place.
- While a race is on (`world/racefx.js`): every world leaves a wake of light
  in its drive's colour that hangs for some seconds; a crowd stands at the
  rails of the terrace, the Pavilion and the districts and jumps when the
  leader is overhead; each district holds a beam of its own colour on the
  leader; a bell is rung the first time anyone starts each lap; fireworks go
  up at the finish. Counts are `wake` and `crowd` in `CH_TIER`.
- The course goes through the monument. `world/lightepilogue.js` finds the
  place in the drawing furthest from any line, preferring one that lines go
  round (the inside of a loop), and hands it to the race as `way`; the course
  is then laid out from the Pavilion down among the towers, through that gap,
  up over the city and home (about 3,800 units, 33 gates). Gates near the gap
  are set dead centre. A drawing with no gap wide enough, or no drawing, gets
  the shorter course that keeps to the sky.
- The towers make way: `course.makeWay()` cuts down any tower that stands in
  the course to pass under it. This changes the skyline for good once the
  race exists.
- The crowd each hold up a light, which is what shows from the air.
- A world that hits something is destroyed. "Something" is the monument
  (`hit()` in `world/lightepilogue.js`, both courses of it) and any tower
  near the course (`hitTower()` in `world/racecourse.js`). Towers are now cut
  down only where they stand in the middle of the course; one at the course's
  edge is left to be flown round. Worlds touching each other still shove.
- A destroyed world goes up in a ball of light, a ring and four bursts
  (`fx.explode`). A rival is marked out and placed last. The pilot's race
  ends there, and a new world is ready at the stand.

Rules the chapter keeps to:

- Every place is a site for the platform walker (`src/capitalWalk.js`), which
  gained three optional hooks for this: `held()`, `camera(pos, target)` and a
  console's `off()`.
- Places are reached by the far side's door handler (`FAR_HOPS` in
  `src/game.js`) under the same white as the City of Light's door, inside the
  same pause of the universe; only the render preset changes
  (`lightship`, `dive` in `src/isolate.js`).
- A planet is never pre-rendered. It is five layers, each filled by one
  fragment, stacked at draw time.
- Timed scenes are one clock and a pose from it, so arriving at a scene that
  has already played is the end pose.
- A thousand years on (`home`), the megaworld's ground carries conduits in
  four colours between every caged star and its eight neighbours, rings round
  each plate, lit district trenches and a blue horizon (`uAged` in
  `megaGround.frag`).
- What comes after is 5.7.5. There the light ship, which leaves in the
  epilogue, comes back, and the captains' names on the Wall may gain an end.

### 5.7.5 Entry Zero: under the megaworld, and after it (owner's story)

What happens once the Tenretni are curious. The same state machine,
`src/chapter.js`, carries on past `done`: the offer can be made once the
Keeper has been heard and the light ship seen off (`done` and `epilogue`, in
either order). Its own record is `ch.ez` inside `fgsf.tenretni`: the lamp's
log, the relics found, who stayed, who was lost, the last lattice node, the
crew's clock. It is written only when it holds something, so a save from 5.7.4
loads unchanged. Every word is in `world/entryzero-dialogue.js`; lines the
owner has not written are marked `PLACEHOLDER` there and on screen. Tunables
are the `EZ_*` block in `src/constants.js`.

Stages, in order (appended; the story only goes forward): `ez_offer` →
`ez_descent` → `ez_firewall` → `ez_deep` → `ez_centre` → `ez_relics` →
`ez_reveal` → `ez_ascent` → `ez_era` → `ez_launch` → `ez_beyond`.

| Stage | Where | What happens |
|---|---|---|
| ez_offer | `world/entryoffer.js` | The Archivist comes down to the arrival balcony and hangs the archive beyond the rail: 330 lit records and one dark one, entry zero, the world the Tenretni came from. Yes gives the pilot a lamp, a vessel and the three captains. |
| ez_descent | `world/submersible.js`, `world/hollow.js` | The vessel is boarded at the east rail. In the well under the city the lamp is tried on six targets. Then down through the membrane, and the lattice carries the vessel a zone at a time: the outer oceans, then the creature zone. |
| ez_firewall | `world/hollow.js` | One sheet of burning hydrogen across the whole hollow. Its guards show on one band only. That band, held on the wall, opens it. |
| ez_deep | `world/hollow.js` | The oldest strata: pieces of the first worlds, adrift and solid. Weight comes back. Something on the radio band comes to the sound of the drive. |
| ez_centre | `world/zeroplanet.js` | The lattice ends; the vessel falls. The first world is seen one band at a time, and whole with every band at once. It is solid only within about a hundred units, while the light holds. The pilot chooses which captain stays at the lamp. |
| ez_relics | `world/zeroground.js` | On foot, on a tether, with a lamp in the hand and the two other captains. Three relics, one fragment each. The lit ground shrinks. A captain past its edge is lost for good. |
| ez_reveal | `world/zeroplanet.js` | Every band on it once more, with every fragment: the first world as it was, lit, and the lights going out. |
| ez_ascent | `world/hollow.js`, `world/submersible.js` | Up under the firewall, which opens to every band. The lattice does the rest. The vessel breaks out into rain. |
| ez_era | `src/era.js`, `world/megaworld.js`, `world/lightcity.js` | A million years on: `EZ_YEARS_GONE`, 2^20. The megaworld and the city are what they have become. |
| ez_launch | `world/launch.js` | The Tenretni stay. The light ship, the archive and the crew go out from the megaworld and into the hole. |
| ez_beyond | `world/launch.js` | Inside. The chapter of 5.7.7 carries on from here. |

The lamp (`src/lamp.js`) is the system everything below the city is built on.
One instrument, six bands, one at a time; on one band the pilot is blind to
the other five. One set of uniforms (`LAMP_U`) is shared by reference by
every material that answers it, with one GLSL chunk (`LAMP_GLSL`). Nothing
exists at one wavelength only: a thing shows in a band because of what it is
made of, and the comments say what.

| Band | How | What answers |
|---|---|---|
| blue-green, 490 nm | a beam | living light; the colour water carries furthest |
| ultraviolet, 320 nm | a beam | fluorescence: pigment, mineral, the makers' writing |
| infrared, 10 µm | seen, no beam | anything warm. Water swallows it in metres |
| H-alpha, 656.3 nm | seen, no beam | excited hydrogen. At the firewall only, it is a beam |
| X-ray, 0.1 nm | a beam, and it goes through | density: bone in soft bodies, what is in rock or under ground. It adds to a dose |
| radio, 21 cm | heard, never drawn | louder as the lamp points at the source |

- Reach depends on what the lamp shines through (`EZ_REACH`): water, the dark
  between, or the mist over the first world. Every band at once reaches only
  as far as the shortest.
- The lamp runs down while lit and comes back when off or at a lattice node.
- Looking at something in its band for `EZ_LOOK_TIME` saves that band to the
  log. A lower node will not take the vessel until its zone's bands are
  logged, so the log is whole by the centre.
- The readout (`src/lampHud.js`) is on the glass, not a dashboard, because
  the same lamp is later carried by hand. Sound is `world/entryzero-audio.js`,
  synthesised.

The submersible is a platform-walker site whose one seat is never left. The
megaworld is a shell and inside a shell nothing pulls, so it is weightless:
W / S ahead and astern, A / D sideways, Space / Shift rise and sink, the mouse
a push on the hull that settles, Q / E the band, L the lamp, Z every band
(learned at the centre). The megaworld's inside is not flown from its
surface: it is a set of places under the white, as the dive was.

The hollow (`world/hollow.js`), one zone built at a time:

- The stolen oceans are separate globes the size of moons, each under a crust
  of its own ice with mist at the limb. One body of water that size would fall
  in on itself and light. They can be flown into.
- Between them: the dark, ice adrift, and the compute lattice running down
  through everything like roots. Follow it.
- A zone runs from one lattice node down to the next. Light takes 8 min 19 s
  from the shell to the centre, so the lattice carries the vessel between
  zones as a pulse (`EZ_RIDE_TIME`).
- Six kinds of life, one band each (`world/hollowlife.js`): drifters, painted
  swimmers, glass drifters seen by their heat, a veil of living hydrogen, soft
  bodies with bones, and callers that are only heard.
- Four things after the vessel's energy, not its hull: light eaters (drawn to
  any beam but H-alpha), heat leeches (seen only in infrared; they cannot hold
  on at speed), radiation feeders (woken by the X-ray band), and the listener
  in the oldest strata (it hears the drive; go quiet and it loses the place).
- If the lamp dies, the dose fills, the cabin freezes or the listener reaches
  the hull, the lattice takes the vessel back to the last node with a fresh
  lamp. The log is kept. Nothing else is lost.

The centre, the relics and the reveal:

- The first world is only there while it is looked at with everything. The
  vessel has to hover inside the shortest band's reach, holding every band on
  the ground, for the ground to be ground.
- The pilot chooses one captain to stay at the lamp. The choice is saved and
  cannot be changed. What each choice does is a table of placeholder numbers
  (`STAY`): how fast the lit ground shrinks, how early the eaters are called.
- On the ground the clock is the lamp overhead. The pilot is on a tether and
  cannot leave the light. The captains follow at a walk and can: one who is
  past the edge when it comes in is gone, saved in `ez.lost`, and is in
  nothing that follows. Nobody has to be lost.
- The relics are the makers' writing (ultraviolet), the last warm place
  (infrared) and what is buried (X-ray). What they say, and what the one who
  was afraid had lost, is not written. The theme is: curiosity is what stands
  up to fear.

A million years on (`ez_era`):

- What the light ship made (`world/eramade.js`). Back in its yard, the ship
  has finished the corner it was never given, in round cells, and on the top
  of its bow, where the glass blister was, stands a dome: the command bridge,
  with a helm, the pilot's seat and one for each of the three captains. From
  the finished corner a double strand of small cells runs the length of the
  ship, over the block and along the spine, down into the dome's crown. The
  first time the pilot walks onto the gallery the camera is taken for about
  fifteen seconds: the dome, back along the strands, the corner (`ERA.made`
  has the lines). Until then the compass reads GALLERY and points there, not
  at the door. Saved as `ez.made`.
- The launch (`world/launch.js`) is flown from inside that dome, at walking
  size: the helm forward, the pilot's seat behind it, each captain standing
  at their own seat behind that (`BRIDGE` in `world/eramade.js`). The rest of
  the light ship is behind and below, with the strands running back over it;
  under way its cells fall into one spectrum down the hull. A galaxy hangs over the bridge,
  astern. The camera looks at the megaworld, then up at the ship and its
  archive as Vask names it, then forward at the hole. `ez_beyond` is the same
  bridge, inside.

- Near the dense core the crew's clocks ran slow. The emergence gives the
  surface's clock beside their own; the city gives all three in a line, with
  the light ship's 1,024 years.
- One shared value, `ERA` in `src/era.js`, turns the megaworld's ground,
  towers and cage frames to their later look: seas where the land lies low,
  growth, cloud shadow, most conduits dark. The cages are open and empty.
- What lights it is not decided: `EZ_LIGHT` is `'sun'` (one kept, uncaged
  star; the default), `'hole'` or `'none'`. All three are built.
- The release of the stars is shown as a rite: every so often every empty
  cage is lit as if its star were back, and let go dark (`RITE`).
- The City of Light: most panes dark, the floor cracked and standing in
  water, vines on the rails. The descendants still walk it and the monument
  still glows. The white hole is unchanged. The districts and the racing of
  5.7.4 are not built in this era.
- The light ship is back in a fallen-in yard, the newest thing in the world.
  The corner of it that was never built is finished in round cells unlike the
  rest: the first thing the Tenretni imagined.

The launch:

- From outside the megaworld is a worn shell with its oceans showing through
  the gaps. Whether the Tenretni went on to make things is not decided:
  `EZ_NEW_WORLDS` (on by default) puts a ring of young planets round it, made
  from the shell's strata.
- Inside a horizon the centre is not a place that can be steered away from.
  It is later. So the archive is not being thrown away: it is carried into a
  future nobody holds. Past the horizon the whole outside closes to a ring
  astern and goes out, and nothing is drawn ahead.
- The saga stops at `ez_beyond`, on the bridge, with the people who are left
  and the archive lit behind them. A game come back to at that stage is put
  there.

Rules this chapter keeps to, beyond those of 5.7.4:

- A site may hide the pilot (`hidePilot`) and integrate a body of its own in
  `tick`; a render preset may set its own far plane (`hollow`, 9,000).
- A new look for an old material is one value shared by reference
  (`src/era.js`), set in one place. `uAged` is left as it was.
- Anything undecided is one constant or one table, named in the writing file
  or `src/constants.js`. Nothing undecided is in the code.
- The light ship's build loop is not disturbed: its new cells are a third
  mesh over the cells the loop skipped, so every older cell is where it was.

### 5.7.6 The Crown errand: the story spine (owner's story)

One thread, given by Patron Axilo in Meridian Crown, that explains every gate between the worlds. It is the journal quest `terra-errand`, owned by `src/crownErrand.js`; every walker that takes part calls in there to move it on, and the words live with the speakers.

| Stage | What has happened | Where the next beat is |
|---|---|---|
| (none) | Not met | Axilo, governor's penthouse, Meridian Crown |
| `mall` | Axilo welcomed the pilot home and sent them for his chair | Maribel, ground floor of the WaveMall Flagship |
| `pick` | Maribel gave the tour and the chair (`crownFurniture`); six pieces stand on lit rings | Take one (`world/mallPicks.js`), then back to Maribel |
| `car` | Piece chosen (inventory `decor`), race car aboard (`raceCar`), `ally-wavemall` set | High Cantor Oriel Vane, pad pier of the Sky City |
| `race` | Car delivered; Vex Halcyon heads the poster | Win the Rim Circuit from the booth |
| `won` | `ally-saturnia` set | Axilo |
| `rest` | Debriefed; chair stands in his penthouse | The bed in the pilot's suite |
| `morning` | Slept | Axilo |
| `sent` | The Neptunia mission | Madame Ossva, then the riser, then the wreck |
| `relic` | Crown Seal (`crownSeal`) taken from the wrecked bridge | Axilo |
| `done` | Seal on its plinth in the suite | — |

- **Home.** Meridian Crown has a second, taller tower (registry `homeTower`, `world/city.js` `buildTower({home})`): the pilot's suite, with a bed. `E — SLEEP` fades to black and turns the day round to the next morning (`src/walk.js` `beginSleep`; it adds to `planet.spinPhase`, which is re-derived on lift-off). The suite shows the chosen WaveMall piece and, at the end, the Seal.
- **Order of the gates.** Ossva offers the charge to a pilot at `sent`, whatever her survey stands at, and says what the riser is and that the Seal is the price; her survey's jetpack is granted on accepting, because she does not survive to hand it over. The Emberdeep cage on Rustia is chained until `neptunia-charge` is `blown` (a save that already rode it keeps it). Baron Rynva withholds his secret until the errand is `done`, because the Tenretni event takes Terra off the map.
- **The wreck.** After the blast the Indigo Reach is a dock like the Sky City (`DOCKS` entry `wreck`, `src/game.js`): come within `WRECK_CAPTURE × 1.25` and the autopilot sets the ship down on her flight deck. The hull stops tumbling from capture until lift-off. On foot it is a `capitalWalk` site over the hull's own decks (`world/wrecksite.js`): sun and ambient go out, and the pilot carries one real SpotLight, `L` to switch. The Seal hangs lit over the captain's chair on the bridge.
- **Old saves.** Charge already accepted or blown with no errand: Axilo's first talk goes straight to `sent`. Tenretni already past: Ossva keeps her old terms (survey, then charge) and the codex files the Seal as having no one left to take it.
- **Alliances** are story flags only in this pass; nothing in the fleet war reads them yet.

### 5.7.7 The chapter past the horizon (sealed)

The owner has not played this chapter. This section is its structure only: no plot, no names of what is in it, no account of how it ends. The story, every line of dialogue and the full design are in files whose names start with `SEALED-`, each headed `SEALED: the owner has not played this yet. Do not open.`

**Where it sits.** It carries on from `ez_beyond` (5.7.5) and ends at `hz_open`, where the light ship and its crew are in open space and 5.7.8 takes over. A save at `ez_beyond` goes straight on: the launch bridge (`world/launch.js`) has one console, `E — THE HELM`, shown from `ez_beyond` until `hz_open`. Saves from before it load unchanged: the record below is written only once it holds something.

**Stages.** Appended to `STAGES` in `src/chapter.js`, forward only:

`hz_bell1`, `hz_bell2`, `hz_bell3`, `hz_bell4`, `hz_bell5`, `hz_bell6`, `hz_bell7`, `hz_bell8`, `hz_bell9`, `hz_bell10`, `hz_open`

**Places.** Five, each a `capitalWalk` site entered under the white, built the first time it is wanted by the chapter's host, `src/horizon.js` (which holds no story: a table of doors and nothing else).

| Door | File | Kind | Stages | Look |
|---|---|---|---|---|
| `hz:deck` | `world/SEALED-horizon-deck.js` | walked, with held stations | 1 to 3 | `dive` |
| `hz:hall` | `world/SEALED-horizon-hall.js` | walked | 4 | `lightship` |
| `hz:helm` | `world/SEALED-horizon-helm.js` | held, its own camera and input | 5 to 6 | `dive` |
| `hz:hull` | `world/SEALED-horizon-hull.js` | walked | 7 to 8 | `dive` |
| `hz:keel` | `world/SEALED-horizon-keel.js` | held, its own camera and input | 9 to 10 | `dive` |
| `hz:back` | (none) | a death: see below | | |

Shared by them: `world/SEALED-horizon-words.js` (every word and data table), `world/SEALED-horizon-sky.js`, `world/SEALED-horizon-ship.js`, and `world/SEALED-horizon-place.js` (what the chart calls the place the ship is let go in, read by `src/systems.js`). The design is `plans/SEALED-horizon.md`.

**The record.** `ch.hz` inside `fgsf.tenretni`, beside `ch.ez`:

```js
{ d: { c1, c2, n1, n2, n3, n4, t },   // scalars by key
  lost: ['<captain id>', ...],          // captains lost in this chapter, for good
  cp: { key, to, stage, d, lost } }     // the one pending checkpoint, only while pending
```

| Key | Type |
|---|---|
| `c1` | integer 0..6 (a decision) |
| `c2` | `'a'` or `'b'` (a decision) |
| `n1` | integer, a 4-bit mask |
| `n2` | integer 0..100 |
| `n3` | string, up to 3 letters |
| `n4`, `t` | integer, seconds |

Later chapters read them with `chapter.hz.get(key)`. Captains can be lost in this chapter; `chapter.crew()` is `CAPTAINS` less `ez.lost` and `hz.lost`, and every scene is written for every crew from all three to none.

**Decisions, death and restore.** A decision is a dialogue choice the place holds on until one option is picked, asked again if the panel is closed without a pick; SKIP runs a scene to its end or its next hold and never passes a decision. The rule the owner asked for (die, and be put back just before the decision that led to it; a choice survived stays made) is one mechanism in `src/chapter.js`:

- `hz.offer(key, to)` when a decision is shown: the stage and the record as they stand are kept as the checkpoint, with the door (`to`) back to the asking.
- `hz.decide(key, option)` when it is answered.
- `hz.survive(key)` at the next safe beat: the checkpoint is dropped and the choice is permanent.
- `hz.die()` on a death: the stage and record are put back to the checkpoint (the only place a stage goes backwards) and the door is returned.

A place that kills the pilot raises `portal = 'hz:back'`; `farHop` in `src/tenretni.js` calls `die()` and walks the pilot back in through the door it returns. A game left in the middle of what a choice led to loads at the asking, because a scene is not resumed half-way. The two checkpoints are `c1` (door `hz:hall`) and `c2` (door `hz:hull`).

**Scenes.** Every timed scene is `createSceneClock` (`world/sceneClock.js`): one clock, `pose(u)`, lines said as the clock passes them, `stops` it holds at for a decision, `skip()` to the next stop or the end, `seek(u)`. Lines are `{ by, text, solo }` said through `crewSay`: by their captain if aboard, by another who is if not, and with nobody aboard `solo` (or nothing). Bars and subtitles are `chapterHud`; talks are `cineTalk`.

**Physics.** The chapter stands on real black-hole physics. Where a mechanic goes past what is established, the comment at that mechanic says so, in the SEALED file it is in.

**The ending.** The last place calls `ctx.openSpace()` (`src/tenretni.js`): the stage becomes `hz_open`, the megaworld is stowed for good (`far.stow()`), the first system is mounted, and the door it returns leads onto the home base's bridge. Every branch ends there. What the chapter leaves aboard is `horizon.effects()` (5.7.8).

**Tunables.** The `HZ_*` block in `src/constants.js` (numbers, inside `C`), the `HZ_TAU` export after it, and four `CH_TIER` counts: `hzA`, `hzB`, `hzC`, `hzD`. The names are neutral on purpose and the comments give units only; the legend that says what each one does is in `world/SEALED-horizon-ship.js`.

**Debug.** `__debug.tenretni.hz()` is the host: `go(stage)`, `hopTo(key)`, `site()`, `seek(u)`, `skip()`, `crew(ids)`, `audit()` (every scene's lines as the crew aboard would be shown them), `dbg(name, ...args)` (the current place's own handles), `state()`. `__debug.tenretni.chapter().hz` has `state()`, `pending()`, `die()`; `chapter().setCrewDebug(ids)` sets who is aboard. `__debug.base.door('hz:*')` walks through a door.

**How to verify.** The recipes are in `.claude/skills/verify/SKILL.md` under "The chapter past the horizon". What must hold: every stage is reached by play from an `ez_beyond` save and by `go(stage)` and a reload; every ending leaves `voyage().state().open` true with the pilot on the home base's bridge; each decision plays with all eight crews; a death after each decision restores the stage and record to the checkpoint and a survived choice persists across a reload; SKIP works on every scene and stops at a decision; an older save loads unchanged.

### 5.7.8 The light ship as a home base, and chapters as systems

From the moment the chapter of 5.7.7 lets the ship go (stage `hz_open`), the megaworld is behind it for good and the light ship is where the game lives. Every later chapter is a place the ship travels to. This section is the whole of that structure; none of it is story.

**What a save in open space is.** `fgsf.tenretni.end` stays `'far'`. Open space is derived from the chapter stage (`chapter.open()`), not saved as a state of its own. A game come back to is always aboard: the freighter parked in the bay, the pilot stepped out and stood on the bridge (`farBeyond()` in `src/tenretni.js` returns `{ dock: 'bay', hop: 'base:helm' }`, and the same two steps in `src/game.js` that used to put an `ez_beyond` pilot on the launch bridge do it). A world reset from anywhere (a death in the freighter, the menu) returns there too. "Landed somewhere" is not saved.

**The ship (`src/homebase.js`).** Three walked places, each a `capitalWalk` site, built the first time it is walked into and kept. The far side builds its own copies of the archive and bridge for the megaworld chapter and retires them; these are separate instances.

| Place | File | In the world? | What is there |
|---|---|---|---|
| Hangar bay | `world/basevessel.js` | Yes (the universe is not paused; the system is in view) | The freighter on its pad, two lifts (bridge, archive), the trip roster, the captains who are coming along |
| Bridge | `world/basebridge.js` | No (paused, look `dive`) | The helm chart, the captains who are staying, the sky of the current system, a lift to the bay, a door aft to the archive |
| Archive | `world/lightship.js` with `ctx.base` | No (paused, look `lightship`) | The six world rooms of 5.7.4 as they were, the holodeck console by the aft door, a door forward to the bridge, a lift to the bay |
| Crew deck | `world/basedeck.js` | No (paused, look `dive`) | A corridor off the bridge's starboard aft door. Quarters for the pilot and each captain, each with a floor-to-ceiling window onto the current system and something of its owner's; a lost captain's are kept, lights down, one left on. The dining lounge (long table, galley, window) and the medical bay (two beds, a scanner, cabinets). E: rest in the pilot's bed, eat (with whoever is aboard), a check-up, look round a captain's room |

Doors are hop keys. `src/game.js` whites out, asks `farHop(key)` (`src/tenretni.js`), and stands the walker where the answer says: `{ site, spawn, yaw, look, out }`. `out` leaves the pause for the world. The `FAR_HOPS` table of 5.7.4 and 5.7.5 is untouched; `farHop` is asked only for keys it does not hold.

| Key | Leads to |
|---|---|
| `base:bay` | the bay, off the lift |
| `base:bridge`, `base:bridge-aft`, `base:helm` | the bridge: off the lift, from the archive, at the helm |
| `base:archive`, `base:archive-up`, `base:holo` | the archive: from the bridge, off the lift, at the holodeck |
| `base:deck`, `base:bridge-deck` | the crew deck from the bridge, and back |
| `hz:*` | the chapter of 5.7.7 (`src/horizon.js`) |
| anything else | the current system's own `hop(key)` |

**The holodeck.** One system, the freighter's (`startHolo` in `src/game.js`), with one argument added: `startHolo(id, back)`. With `back` (a hop key) the program is started from a place being walked instead of from the freighter's panel, and G ends it by walking back in through that door. Without it every line runs as it did. The catalogue (`catalog()` in `src/tenretni.js`) gives each row a kind:

| Kind | Programs | How it is entered |
|---|---|---|
| `world` | Terra, Rustia, Wavemall Prime, Actuality, Shadowreach, Wyattmattoe | The planet record is put back in space for the session (`holoWorld`), as the freighter's holodeck does for an assimilated world. Aboard the light ship any world no longer in space qualifies, because the ending left the rest behind. Terra has the worldship taken off it for the session (`holoTerra`). |
| `sky` | Saturnia | The Sky City, from its pad. A fall ends the program, not the game. |
| `reach` | Neptunia | The Indigo Reach's flight deck, or her wreck if the save blew the charge (`shatter.active`). |
| `coin` | Stevenlacey | The freighter's own branch. |
| `site` | The City of Light | A second City of Light built with no chapter (`homebase.program`), walked under the pause; its doors lead nowhere. |

The rest of the archive (`ARCHIVE_LOCKED`) shows as rows that cannot be entered: three named megaworld places and four unnamed records. A later chapter opens one by moving it into `ARCHIVE` with a kind. `src/holoPanel.js` takes optional `{ title, sub, locked, foot }`, a tenth key `[0]`, and scrolls.

**The freighter as a shuttle.** Two entries are appended to `DOCKS` in `src/game.js`; the capture, arc and descent are the Sky City's.

- `bay` (`BAY_DOCK`). The stand-in planet is centred on the middle of the hull, so the arc goes round the whole ship. The hover point is astern of the stern mouth (`BASE_BAY_STANDOFF`), so the last leg is a level run in under the keel (`BASE_BAY_RUN` seconds). A dock with `exit: true` leaves its pad along the deck to its own exit point, out of the forward mouth, in `BASE_BAY_LIFT` seconds, with no climb and no pitch; every other dock lifts as before.
- `system` (`SYSTEM_DOCK`). Whatever the current system has to dock at, nearest first, as the `vessel` entry serves every fleet ship.

From the bay the freighter is boarded with G at the pad and launched with W. In a system it flies as it always has: a landable world takes the helm at its air and sets it down, G steps out. The freighter's interior, gallery, patio, terrarium and its own holodeck are unchanged.

**Who comes along.** The roster console in the bay lists the surviving captains; picking one toggles between coming along and staying (`fgsf.voyage.crew`). Those staying stand on the bridge and are talked to there. Those coming wait by the freighter in the bay, stand in the freighter's hall during the flight and can be talked to (`src/interior.js` guests; the rigs are built by the story chunk), and follow the pilot on foot on any platform that makes a `createCrewFollow` (`world/crewFollow.js`). Limit of this version: on a planet's surface they stay with the freighter. A pilot with no captains left has an empty roster and nobody aboard; nothing else changes.

**Chapters as systems (`src/systems.js`, `src/voyage.js`).** One registry entry per chapter:

```js
{ id, label, sealed, needs?(chapter, voyage), star: { dir, color } | null, nebula, fleet, base: [x, y, z],
  create(ctx) -> { docks, planets, hop(key), door(), update(dt, t, cam), talk(captainId),
                   serialize(), restore(raw), state() } }
```

The voyage mounts the current entry: its star (a disc and a glow in its direction, and the direction the game's one sun light is aimed), its docks (platform sites, charted on NAV), and its planets. A planet is a config for `buildPlanet(cfg, scene, { late: true })` in `src/planet.js`, the loop body of `initPlanets` factored out, with `pos` (absolute) added; it joins the terrain bake queue (`bakePlanet`). Everything mounted is laid out in the absolute frame and re-placed from it every frame, because nothing built after boot is in the world reset's snapshot (`src/origin.js`). A system the ship is not in is hidden and stays hidden through a pause (`userData.away`, `src/isolate.js`); its worlds are `removed`, and carry `away` so the ending's world list never counts them.

Travel is the helm chart on the bridge: a choice of every charted system but the one the ship is in, refused while the freighter is out of the bay. The passage is watched from the bridge (one clock and `pose(u)`, `BASE_TRAVEL_TIME`, E skips) and the systems are swapped at its middle.

**The save.** `fgsf.voyage`, written only once it holds something:

```js
{ v: 1, at: '<system id>', visited: ['<id>', ...], crew: ['<captain id>', ...],
  chapters: { '<system id>': <that chapter's own record> } }
```

**What a chapter leaves aboard.** `horizon.effects()` (5.7.7) returns `{ rooms, figures, marks, talk }` and the home base applies it as it stands: holodeck rows shut, figures stood on the bridge, lit plates in the bay, extra lines for the captains. A later chapter that needs the same reads its own record.

**Adding a chapter.**

1. Write its places in `world/` as `capitalWalk` sites (docks) and planet configs, and its words in a dialogue file of its own. `world/example-system.js` and `world/example-dialogue.js` are the smallest complete pair.
2. Give it a stage list (append-only) and a record: `serialize()` returns `undefined` while there is nothing to keep, `restore(raw)` validates what it is handed. Call `ctx.save()` whenever the record changes.
3. Return `{ docks, planets, hop, door, update, talk, serialize, restore, state }` from a `create(ctx)`. `ctx` is `{ scene, camera, chapter, voyage, sunDir, save, crewTalk }`. Namespace its doors `<id>:*`.
4. Add one entry to `SYSTEMS` in `src/systems.js`. `needs` keeps it off the chart until an earlier chapter's record says otherwise (`chapter.hz.get(key)`, or `voyage.instance(id).state()`).
5. Put its tunables in a block of their own in `src/constants.js` and its verify recipes in `.claude/skills/verify/SKILL.md`.
6. If its story is sealed, name its content files `SEALED-*`, set `sealed: true`, and take its label from a sealed file as chapter one does (`world/SEALED-horizon-place.js`).

**The example system.** `proving`, "The Proving Ground": a relay to dock at (a pad, a walk, a beacon with a log to read) and Cinder, one bare landable world (`BASE_EXAMPLE_PLANET`). Its stage machine is `arrived` -> `docked` -> `logged`. It is not story and is there to be flown.

**Tunables.** The `BASE_*` block in `src/constants.js`: `BASE_CAPTURE`, `BASE_BAY_STANDOFF`, `BASE_BAY_RUN`, `BASE_BAY_LIFT`, `BASE_BAY_HW`, `BASE_BAY_HL`, `BASE_BAY_ROOF`, `BASE_STAR_DIST`, `BASE_TRAVEL_TIME`, `BASE_DOCK_HOVER`, `BASE_FOLLOW_SPEED`, `BASE_FOLLOW_GAP`, `BASE_GUEST_TALK`, and the switch `BASE_EXAMPLE_PLANET`.

**Debug.** `__debug.base` (`approach(dir, dist)`, `dock()`, `stepOut()`, `board()`, `launch()`, `door(key)`, `systemApproach()`, `systemDock()`, `systemStepOut()`, `guests()`, `state()`), `__debug.holodeck.catalog()` and `startFrom(id, back)`, and through `__debug.tenretni`: `voyage()` (`state()`, `travel(id)`, `setCrew(ids)`, `instance(id)`), `base()` (`state()` with each room's `info()`, `places` and `bridgeSeek`), `hz()`, `openSpace()`.

**Rules.**
- A room of the ship that is walked under the pause captures fog, sun and ambient in `onEnter` and restores them in `onLeave`, as every far-side place does.
- Nothing mounted after boot relies on the reset snapshot: it keeps an absolute position and is re-placed.
- The freighter's holodeck path is not changed by the light ship's: `startHolo(id)` with no `back` is the code it was.
- A sealed chapter's label, places and words never appear in an unsealed file.

### 5.7.9 Season 1: The Voyage

The season's story is `plans/season-1-arc.md`: fourteen chapters in three parts, each a system the light ship goes to (5.7.8). This section is what every one of them stands on, and the chapters built so far.

**How history works.** The big events of the season happen whatever the pilot does. The pilot's decisions change how they happen, who is there and what is left afterwards.

| Fixed: it happens anyway | Yours: your choices bend it |
|---|---|
| The flare hits the dusk world (Ch 2) | Whether the night side's young are in its path |
| The ice ocean's people learn they aren't alone (Ch 3) | Whether they learn it from you, or later from someone who wants something |
| The Concourse floods with cheap ticks (Ch 6) | Whether the light ship is bound by a forecast going into the war |
| Ione defects (Ch 9) | Why she does it, and whether she trusts you |
| The siege comes, and the outer ring falls (Ch 10) | Who fights beside you, and who is still in the ring |
| Refugees need a home (Ch 11) | Which world they get, and what the archive loses |
| The black holes merge (Ch 13) | Whether the Foregone come out of it blind or curious |

Every fixed event is forecast on screen before it happens, and remembered afterwards by how it went in this save.

**Fixed events (`src/fixedEvents.js`, words in `world/season-dialogue.js` `FIXED`).** One row per event: `{ id, chapter, label, forecast, remember }`. Ids: `flare`, `contact`, `flood`, `defection`, `siege`, `refugees`, `merger`. A row without a `forecast` belongs to a chapter not yet built.

| Call | What it does |
|---|---|
| `fixed.forecast(id)` | A dialogue payload with `cine: { kind: 'comm', from }`: the forecast as a transmission (`src/cineTalk.js`: bars, SKIP). Its last two lines say what is certain and what is still the pilot's. Marks the event `seen`. |
| `fixed.resolve(id, how, detail)` | It has happened: how it went here. `detail` is scalars. |
| `fixed.outcome(id)`, `resolved(id)`, `shown(id)` | For a later chapter to read. |
| `fixed.remember(captainId)` | That captain's line about the latest resolved event, keyed `event → how → captain`. `voyage.talk()` appends it to whatever the current system has the captain say, so the bridge remembers in every later system. |

**The season record (`src/season.js`).** One record for the season, inside `fgsf.voyage` as `season`, written only once it holds something (a fresh profile and an older `fgsf.voyage` are untouched):

```js
{ v: 1,
  facts:  { '<chapter>.<key>': scalar },            // 'ch2.decision': 'arm' | 'warn', 'ch2.young': 0..9
  events: { '<id>': { seen, how, detail } },        // fixed events
  cp:     { key, to, snap } }                       // a decision not yet lived through
```

`season.get(k)` / `set(k, v)` for facts. Every chapter's `create(ctx)` is handed `ctx.season` and `ctx.fixed`.

**Dying, and decisions.** The rule for every chapter: a decision is shown plainly and waits; a death after it puts the pilot back just before it; a choice survived stays made. The season keeps the contract `chapter.hz` has in 5.7.7:

| Call | When |
|---|---|
| `season.offer(key, to, snap)` | As the decision is shown. `to` is the door back to the asking. Idempotent. |
| `season.decide(key, option)` | Picked. The fact `key` is set. |
| `season.survive(key)` | The next safe beat. The checkpoint is dropped. |
| `season.die()` | Died, or walked away, first. The fact is unset; the checkpoint stays until it is survived. |

A chapter's stages between deciding and surviving are never saved: its `serialize()` writes the stage of the asking, and its `restore()` calls `season.die()` if a checkpoint is pending.

**Placeholder names.** Concourse, tick, Foregone and Ione Vey are spelled in `world/season-names.js` (`SEASON_NAMES.hub`, `.currency`, `.rival`, `.envoy`) and nowhere else in code or dialogue. A chapter's own names (its world, its people) are in its dialogue file.

**Rules for every chapter.** The pilot is the one shared `Astronaut` the walker already drives: a chapter never builds or restyles one. The captains are the people of `world/chapter-dialogue.js`; every timed line is a `crewSay` line (`by`, `other`, `solo`) so all eight crews work, including nobody. Every story beat is a cinematic that can be skipped (a `cine` talk, or a `createSceneClock` scene with `E — SKIP`). Each chapter is a place first. Where the science goes past known physics, the file's header says so.

#### Chapter 2: The Long Dusk (`dusk`)

`world/dusk-system.js` (system, stages, record, doors), `world/dusk-ground.js` (the place), `world/dusk-dialogue.js` (every word and name). Charted from the moment the ship is in open space: it has no `needs`, because chapter 1 is not built.

**The place.** A red dwarf along +X and one world turned always the same way to it. The camp is a `capitalWalk` dock on the twilight line, walked in the world (not paused): a strip 1,020 by 350, +X the day, -X the night. The world under it is a globe of the site's own (`DUSK_GLOBE_R`), not a `src/planet.js` planet, because a planet's own landing would take the helm from the dock's; `dusk-system.js` keeps the freighter from flying through it. A chapter has no hook into the generic surface walk (`src/walk.js`), so a chapter's ground is a dock site.

**The lean.** The orbit is not quite a circle, so the star leans about a degree each way (libration) and the twilight line moves across the ground (`DUSK_SWAY_AMP`, `DUSK_SWAY_PERIOD`). The camp (sledges, `DUSK_WALKERS` figures, Renn) walks with it, and the system's `sunDir` is rocked by the same angle, so the star on the horizon is the one doing it. Sunward of the dusk a heat gauge fills, nightward a cold one (`DUSK_HOT_AT`, `DUSK_COLD_AT`, `DUSK_HEAT_TIME`, `DUSK_COLD_TIME`); either full is a death. Warm vents on the night side, seen only in the infrared, and lit picket fires give the cold back.

**Stages** (append-only):

| Stage | Reached when | Shown as |
|---|---|---|
| `arrived` | the ship is here | the passage (5.7.8) |
| `forecast` | first step out | `fixed.forecast('flare')` |
| `asked` | Renn (E) has asked for weapons | cinematic talk |
| `edge` | the night edge has been walked to | scene, `DUSK_EDGE_T`. The lamp is in hand from here. |
| `seen` | three warm groups held in the infrared (`DUSK_SEE_TIME`), then the night sky in H-alpha (`DUSK_SKY_TIME`) | scene, `DUSK_SEEN_T`, every band at once |
| `decided` | ARM or WARN picked. A clock to the flare runs (`DUSK_ARM_TIME`, `DUSK_WARN_TIME`). | cinematic talk with a choice |
| `acted` | under the sledges (E, or within reach when the clock ends) | the flare, `DUSK_FLARE_T` |
| `flare` | the scene has ended: `fixed.resolve('flare', how, { young, of, groups, safe })` and `season.survive` | |
| `done` | Renn has said goodbye | cinematic talk |

**The choice.** The tall turn from light, both ways. ARM: the fires become torches and each group comes at the line in turn (`DUSK_WAVES`); the blue-green beam held on one for `DUSK_TURN_TIME` turns it back into the band. One that reaches the line goes through; within `DUSK_TRAMPLE_R` of the pilot it kills. WARN: the fires go out, and the pilot goes out behind each group and holds the beam on its back to send it through the open edge to the lee. From the front the beam only drives a group deeper. The outcome: `armed`; or `rerouted` (all three groups out), `partial` (some), `unheeded` (none). The flare comes when the clock says, whichever it was, and in the open it kills.

**Deaths.** Heat, cold, a group through the line, the flare in the open. The site sets `portal = 'dusk:back'`; `hop('dusk:back')` stands the pilot beside Renn with the decision unmade if one had been made, and at the pad if not. Leaving the camp between deciding and the flare unmakes the choice the same way.

**Doors.** `dusk:back`, `dusk:ask`, `dusk:pad`.

**Tunables.** The `DUSK_*` block in `src/constants.js`, and the tables `DUSK_WAVES`, `DUSK_GROUPS_Z`.

**Debug.** `__debug.tenretni.season()` (`state()`, `get`, `set`, `events()`, `forecast(id)`, `resolve(id, how, detail)`, `remember(captainId)`, `pending()`, `clear()`). `__debug.tenretni.voyage().instance('dusk')`: `state()`, `go(stage, opt)`, `seek(u)`, `skip()`, `decide('arm' | 'warn')`, `kill(cause)`, `sway(x | null)`, and `dbg` (`see(i)`, `sky()`, `turn(i)`, `time(left)`, `shelter()`, `gauges(h, c)`).

**Science.** Real: tidal locking, a habitable terminator, libration, red-dwarf flares, bodies glowing at 10 µm against a cold night, particles steered by a planet's field onto its night side in a band, and a proton aurora's H-alpha glow. Stretched, and marked in `world/dusk-ground.js`: the band being deadly at ground level, and the particles following the light by seconds.

#### Chapters 4 and 5: the free port (`concourse`)

One system for two chapters, because they are in the same place. `world/concourse-system.js` holds both stage machines, the purse, the market, the record and the doors; `concourse-hub.js` is the deck that is walked, `concourse-tender.js` the top end of a tick mine, `concourse-hold.js` the thieves' hold, `appraisal-archive.js` the hunt aboard the light ship. Words: `concourse-dialogue.js` (chapter 4), `appraisal-dialogue.js` (chapter 5). The hub's name, the currency's, the rival's and the envoy's come from `world/season-names.js`.

**The place.** A ring station at the L4 point of a binary whose smaller star is a neutron star. Two docks: `port` (berth nine on one arm of the ring: the dockmaster's desk, six market stalls, a bar, embassy row, a hatch to the lower dock) and `tender` (a pad, a winch house, and a cable going down toward the neutron star). The deck is the same in every chapter that comes back to it; who stands on it and what can be used is the system's to say (`S` in the code), which is what "a hub that changes as the season goes" is built on.

**The money.** Prices are in the season's currency, kept as the season fact `ticks`. Four goods (`CONC_GOODS`), each with a base price at each end, cheap where it is made and dear where it is wanted. Each price swings `CONC_SWING` either side of its base as the market's clock turns, one turn per purchase or sale, so prices move because of what the pilot does. The hold takes `CONC_HOLD` units; what each unit cost is kept, so a sale above cost is known. The market is the list panel (`src/holoPanel.js`): a number buys or sells one, X closes.

**A system with more than one chapter.** `debrief()` may return a `key`; `voyage.debrief()` uses it in place of the system's id for the played-once fact (`debrief.concourse`, then `debrief.appraisal`). Chapter 5 opens only once chapter 4's debrief has been played on the bridge.

**A chapter's guest aboard the light ship.** A system instance may offer `aboard(room)`; `voyage.aboard('archive')` hands it to the home base's archive (`ctx.base.guest` in `world/lightship.js`), which, while the guest is `active()`, takes its `consoles()` before its own and calls its `enter(site)`, `tick(dt, t, walker)` and `leave()`. Chapter 5 uses it to turn the archive into the scene of the theft without the archive knowing the story.

**Chapter 4, The Concourse.** Stages `arrived → docked → met → hauled → paid → traded → done`.

| Stage | Reached when | Shown as |
|---|---|---|
| `docked` | first step out | traffic's hail, a transmission |
| `met` | the dockmaster (E) has said what the money is, and the coolant run is taken | cinematic talk with a choice (TAKE IT / NOT YET) |
| `hauled` | the coolant is delivered at the tender; `CONC_FEE` ticks paid | cinematic talk |
| `paid` | KEEP the fee or SPLIT it with the crew who mined it (`ch4.fee`: `kept` \| `split`) | the choice; asked again if left |
| `traded` | something bought has been sold for more than it cost | the market panel |
| `done` | the bar: the scene (`CONC_BAR_T`), then the envoy | scene, then cinematic talk |

**Chapter 5, Appraisal.** Stages `idle → valued → robbed → tracked → found → done`.

| Stage | Reached when | Shown as |
|---|---|---|
| `valued` | the assessor at the berth (E) | cinematic talk |
| `robbed` | `CONC_ALARM_DELAY` later | the light ship's alarm, a transmission |
| `tracked` | aboard, in the archive: the three handled plinths (`APPR_TOUCHED`) have been looked at | lines; a count is said on walking into each room |
| `found` | in berth forty: the scene (`CONC_HOLD_T`), the sealed case opened, and the two thieves handed over or let go (`ch5.thieves`: `held` \| `freed`) | scene, a transmission, then a choice |
| `done` | back up on the deck | the debrief, on the bridge |

The sealed forecast names whoever is aboard, by the names in `world/chapter-dialogue.js`; with nobody aboard it says the pilot comes alone.

**Decisions.** Neither chapter can kill the pilot, so each decision is offered, made and survived in one step. Both are season facts for later chapters to read: `ch4.fee` and `ch5.thieves`.

**Record.** `{ s4, s5?, clock?, cargo?, paid?, found?, sealed? }` under `fgsf.voyage.chapters.concourse`; `undefined` while pristine.

**Doors.** `concourse:hold`, `concourse:deck`.

**Tunables.** The `CONC_*` block, and the tables `CONC_GOODS` and `APPR_TOUCHED`.

**Debug.** `__debug.tenretni.voyage().instance('concourse')`: `state()` (`s4`, `s5`, `open5`, `ticks`, `clock`, `cargo`, `held`, `found`, `sealed`, `fee`, `thieves`, `prices`, `hub`, `tender`, `hold`, `guest`, `places`), `go4(stage, 'kept' | 'split')`, `go5(stage, 'held' | 'freed')`, `trade(place, 'b:<i>' | 's:<i>')`, `price(place, i)`, `hub.dbg` (`bar()`, `skip()`, `alarm()`), `hold()` and its `dbg`, `guest.look(room, plinth)`.

**Science.** Real: Lagrange points, and the stability of L4; gravitational time dilation, which near a neutron star is tens of per cent. Past known physics, and marked in `world/concourse-tender.js`: that the time a machine did not live can be banked and spent.

#### Chapter 6: Futures (`futures`)

Lux's chapter. `world/futures-system.js` (system, stages, record), `world/futures-city.js` (the square), `world/futures-dialogue.js` (every word and name). No `needs`.

**The place.** The Orrery: a world that sold its whole future to the season's rival three hundred years ago. The dock is a pad at the edge of a round square with a clock tower at its middle. Sixteen citizens each walk one beat between a door and a place in the square, on a period of their own, and where every one of them is, is a function of one clock (`ct`): that is what makes them predictable. Everyone on schedule wears a lit band at the ankle.

**The board.** The corner panel says who reaches where, and in how long. Three are watched being on time: stand within `FUT_WATCH_R` of the place as each arrives. The fourth is forecast to sit down on the south bench on the hour (`FUT_HOUR_WAIT` later) and does not come. She is the one figure with no band, walking the square the other way round.

**Stages** (append-only): `arrived → forecast → welcomed → predicted → missed → found → decided → done`.

| Stage | Reached when | Shown as |
|---|---|---|
| `forecast` | first step out | `fixed.forecast('flood')` |
| `welcomed` | the Keeper of Hours (E) has explained, and the hour has struck | cinematic talk, then a scene (`FUT_CLOCK_T`) |
| `predicted` | three arrivals watched | the board; a chime each |
| `missed` | the hour, and an empty bench | lines |
| `found` | the late one (E) | cinematic talk |
| `decided` | the Keeper offers the light ship a forecast of its own: SIGN, or refuse (`ch6.signed`: true \| false) | a choice; asked again if left |
| `done` | she has been walked back to her bench | scene (`FUT_FIX_T`), the same either way |

**The fixed event.** `flood` is forecast on the first step out and resolved by the decision: `how: 'bound'` if the ship is forecast, `'free'` if not. Once it is resolved, `world/concourse-system.js` multiplies every price at the free port by `CONC_FLOOD`: what was saved buys half.

**Crew.** The offer is Lux's temptation. With Lux lost the choice reads SIGN IT / REFUSE IT and the line is said by whoever is aboard; with nobody aboard it is the pilot's alone. Nothing here can kill the pilot, so the decision is survived as it is made.

**Tunables.** `FUT_*`, and `CONC_FLOOD` in the port's block.

**Debug.** `__debug.tenretni.voyage().instance('futures')`: `state()` (`stage`, `signed`, `flood`, `city`, `places`), `go(stage, 'signed' | 'refused')`, `skip()`, `decide('signed' | 'refused')`, `dbg.nearly(sec)` (runs the city's clock on to just before the next watched arrival), `dbg.hour(left)`.

**Science.** The premise is the stretch, and the file's header says so: a city is a chaotic system, and no measurement is fine enough to forecast one for an afternoon.
#### Chapter 8: The Weight of Hands (`swarm`)

Vask's chapter. `world/swarm-system.js` (system, stages, record, doors), `world/swarm-yard.js` (the place), `world/swarm-dialogue.js` (every word and name). No `needs`. No fixed event.

**The place.** A dim star with half a Dyson swarm round it, and the High Yard: a `capitalWalk` dock in the world, a deck 144 by 164 with a pad, a six-sided mirror frame stood on edge between two gantries, stacked stock, a pattern post, a cradle, and a ring of lamps round a builder that stopped long ago. The swarm is drawn as sky: `SWARM_MIRRORS` instanced plates on a part-shell (`SWARM_SHELL_R`) whose middle is carried `SWARM_SHELL_DIST` along the star's direction from the camera, the way `src/voyage.js` carries the star, so the two never part. Near plates are seen from behind and are dark; far ones face the star and the eye and are bright.

**The builders.** Four that are read (the Hauler, the Welder, the Maker, the Old Hand) and `SWARM_BUILDERS` more walking beats (`SWARM_PACE`). Each is a casing and, inside it, a second mesh that only the X-ray band draws (`lampLit(4.0, p)`, no depth test): the casing goes to a ghost of its edges in the beam and what is inside shows through it. Once read, the inside stays faintly lit in every band.

**Reading.** The lamp is carried by hand from the first scene on (Q steps the band, L is the lamp; `SWARM_LAMP_POWER`). Holding the X-ray beam on one of the four for `SWARM_READ_TIME` from within `SWARM_READ_RANGE` reads it: what is inside is said, then what a miner makes of it. Aimed from too far, the screen says to come closer. Which have been read is saved (`seen`, one bit each).
#### Chapter 7: The Pulsar Choir (`choir`)

`world/choir-system.js` (system, stages, record, door), `world/choir-hall.js` (the place), `world/choir-dialogue.js` (every word and name). Marrow's chapter. No `needs`: a standalone chapter. No fixed event.

**The place.** A millisecond pulsar and the white dwarf beside it (the chart's star is the dwarf; the pulsar is the hall's to draw). The dock is the choir hall: a forecourt and pad, then a nave of stone ribs open to the sky, 280 long, every rib the same, with three bells hung from the ridge and a great rose at the far end. The star stands low over that end, so that it is in the middle of the rose from the west door and still inside it from the listening ring before the altar. It is walked in the world (not paused).

**The star as a note.** A pulse every few milliseconds is not heard as beats: through a speaker it is a pitch. On the lamp's radio band, pointed at the star, the star is a note in the ear (`setRadio`) and a bar on the corner panel, strongest along the way the lamp points and nearest the listening ring. Off the band the panel says to switch.

**Stages** (append-only):

| Stage | Reached when | Shown as |
|---|---|---|
| `arrived` | the ship is here | the passage (5.7.8) |
| `docked` | first step out | scene, `SWARM_ARRIVE_T`: the swarm from the pad |
| `read` | all four read | scene, `SWARM_READ_T`: one X-ray beam from overhead with all four in it |
| `offered` | `SWARM_OFFER_DELAY` later: two buyers on one channel | a transmission |
| `decided` | at the pattern post (E): END THE ORDER or ASSIGN THE OUTPUT (`ch8.builders`: `freed` \| `contracted`) | cinematic talk with a choice; each captain aboard says their word first |
| `done` | what follows has been watched | scene, `SWARM_END_T` |

**The choice.** Freed: every builder stops, the yard's working lamps go out, and the Welder goes to the Old Hand and starts something that is in no pattern; the port does not get the star's power. Contracted: the swarm brightens and a line of light leaves it for the port's relay; the builders work on and are not told. Nothing here can kill the pilot, so the decision is offered, made and survived in one step; `decided` is saved as `done`, and leaving while the last scene plays ends at `done`. Chapter 10 reads `ch8.builders` for who comes to the siege.

**Doors.** `swarm:pad`, `swarm:post`.

**Tunables.** The `SWARM_*` block in `src/constants.js`.

**Debug.** `__debug.tenretni.voyage().instance('swarm')`: `state()` (`stage`, `seen`, `decision`, `pending`, `yard`, `places`), `go(stage, 'freed' | 'contracted')`, `seek(u)`, `skip()`, `decide(option)`, and `dbg` (`read(i)`, `understood()`, `offers()`).

**Science.** Real: a Dyson swarm of independent collectors (a rigid shell is not stable); a star a tenth as bright as the Sun still giving about 4e25 W; self-replicating machines as von Neumann proposed them. Stretched, and marked in `world/swarm-yard.js`: such machines would finish a swarm in decades, not leave it half done after ten thousand years; an X-ray picture needs a detector behind its subject; and the builders' inner lives are the story's.
| `docked` | first step out | scene, `CHOIR_ARRIVE_T`: the hall, and the bells stopping part way through the hour. The lamp is in hand from here. |
| `met` | the First Voice (E) has said what the star was and what it has done | cinematic talk |
| `heard` | on the listening ring (`CHOIR_LISTEN_R`), the star held on the radio band for `CHOIR_HEAR_TIME` | lines |
| `sung` | at the cantor's stand, the old hymn sung back three times | scene, `CHOIR_CHORUS_T`: the hall takes it up |
| `decided` | KEEP YOUR OWN TIME or TAKE THE TABLE | cinematic talk with a choice; asked again if left |
| `done` | the hall has answered | scene, `CHOIR_ANSWER_T`, then the debrief on the bridge |

**The hymn.** The choir sings a verse on the three bells and stops where the star's note used to go. The pilot sings it back: 1, 2, 3 for the bells and 4, the star as it now is, in the gap (keys, or four pads on screen, `#choirPads`). The star's pad needs the lamp on the radio band; off it the pad is refused, and that is not counted as a wrong note. Three verses, longer each time (`CHOIR_PHRASES`, `CHOIR_NOTES`). A wrong note and the verse is sung again; stepping more than `CHOIR_STAND_R` from the stand makes the hymn wait. The hymn is not mended: the step is sung.

**The choice.** An actuary of the season's rival stands by the altar with a table of every glitch to come, for the hall and the Choir's word. The First Voice asks the pilot. Season fact `ch7.choir`: `'free'` (they keep their own time, and will come when rung for; chapter 10 reads this) or `'forecast'` (the table is on the altar, the bells are tied, the actuary stays). Nothing here can kill the pilot, so the decision is offered, made and survived in one step. A game left between the choice and the hall's answer plays the answer on coming back.

**Crew.** Marrow's lines carry the teaching. Where she is lost another captain's `other` carries it; with nobody aboard the `solo` lines do, and the First Voice's own talk carries the rest.

**Door.** `choir:nave` (the cantor's stand).

**Tunables.** The `CHOIR_*` block in `src/constants.js`, and the tables `CHOIR_PHRASES` and `CHOIR_NOTES`.

**Debug.** `__debug.tenretni.voyage().instance('choir')`: `state()` (`stage`, `choir`, `pending`, `hall`, `places`), `go(stage, 'free' | 'forecast')`, `seek(u)`, `skip()`, `decide(option)`, and `dbg` (`band(id)`, `aim()`, `stand()`, `press(i)`).

**Science.** Real: millisecond pulsars and their use as clocks; glitches (the crust spun up, all at once, by the superfluid inside); a fast pulsar heard as a pitch. Stretched, and marked in `world/choir-hall.js`: a real glitch is a part in a million or less, far too small to hear, and here it is about a semitone so that it can be sung; and a beam sweeping hundreds of times a second is drawn as the steady smear it would be.

#### Chapter 10: The Siege of the Concourse (`concourse`, `s10`)

Fought at the free port, from the light ship's helm chart. `world/siege-helm.js` (the battle), `world/siege-dialogue.js` (its words), and a third stage machine in `world/concourse-system.js` (`idle → called → done`). It opens once the chapters before it at the port have been played and talked over (`S.open10()`).

**How it is reached.** On the port's deck the dockmaster calls every berth (E): `called`. A console at the berth then takes the pilot straight to the helm (`siege:helm`), a site under the pause with one seat.

**The helm chart, drawn.** `src/drawPad.js` gained two options for this, and is otherwise as it was: `back(g, w, h)` paints under the ink, and `minInk`. Each pass the pad opens over the chart: the port, the eight sections of its outer ring, the grey columns and the dashed lines they will keep to (`SIEGE_WAVES`), and from the second pass the red circles of the flagship's guns along its own line. The pilot draws; FLY IT; the light ship flies the stroke in `SIEGE_FLY` seconds. Where it has been, any grey ship that comes within `SIEGE_CUT` is broken. What is not broken reaches the section it was aimed at (`SIEGE_HITS` arrivals a point, `SIEGE_SEG_HP` points a section). A stroke through the red loses the ship, and the pass is drawn again.

**Who fights beside the port** is what was done earlier in the season: the Choir if `ch7.choir` is `free`, the swarm's builders if `ch8.builders` is `freed`, the cable crew if `ch4.fee` is `split`. Each thins the columns in one quarter of the sky by `SIEGE_ALLY_THIN`, and is named before the first pass. With none of them, that is said too.

**The choice,** before the fourth pass, as a transmission with each captain aboard saying their side: COVER THE LIFEBOATS (the defenders close on the ring, the ring takes no more hits because it is given up, and all but one section's people get out) or HOLD THE LINE (the pass is flown for the ring; whoever is in a section that has gone dark stays in it). `ch10.ring`: `evac` | `hold`. Lost on that last pass, the choice is unmade and asked again.

**The fixed event.** `siege` is forecast at the helm before anything else, and resolved by the fall: a scene (`SIEGE_FALL_T`) in which every section goes dark and comes away, either way. `how: 'evacuated' | 'held'`, `detail: { saved, of: 8, allies, debtors }`; `ch10.saved` is the sections whose people got out. If the two thieves of chapter 5 were handed over they were on the debtors' deck of the outer ring, and the scene says whether they got out.

**Tunables.** `SIEGE_*`, and the table `SIEGE_WAVES`.

**Debug.** `instance('concourse')`: `go10(stage, 'evac' | 'hold')`, `state().siege` (`phase`, `wave`, `pad`, `alive`, `broken`, `reached`, `ring`, `standing`, `allies`, `flag`, `columns`, `decision`, `outcome`), `siege().dbg` (`skip()`, `wave(n)`, `ask()`, `decide(option)`). The pad is driven with `drawPadDebug.stroke(points)` and `.done()`.
#### Chapter 9: The Forecast of Love (`concourse`, third chapter)

The pilot's chapter. It is played at the free port and aboard the light ship, so it is a third stage machine of the `concourse` system (`s9` in its record, `go9` to jump it, a debrief with `key: 'love'`). `world/love.js` is the chapter, `world/love-places.js` its two places of its own, `world/love-dialogue.js` every word. It opens once chapter 5's debrief has been played (`open9`). The envoy is the figure from the port's bar (the same seed) and the same person.

**Where it is played.**

| Beat | Place | How it is reached |
|---|---|---|
| She asks to be shown a world | the port's bar | the deck of chapters 4 and 5; the fixed event's forecast is shown first, on stepping onto the deck |
| A walk, and a ski run | the hill: a holodeck program of the ski hill on Wyattmattoe, a small site of its own | aboard, she waits in the archive by the holodeck; her console there is the door `love:hill` |
| What the engine forecast for her | the bottom of the hill | the run ends there |
| A meal | the crew deck's long table (`world/basedeck.js`), with whoever is aboard | the table's own SIT DOWN TO EAT |
| The decision | the freighter's patio, at night: a small site of its own | the meal ends on the door `love:patio`; afterwards a console on the crew deck leads aft |

The hill is not the whole Wyattmattoe program (the planet, its town, its lifts): the chapter wants one slope and one other person on it. The run is steered with A / D for `LOVE_RUN_LEN` at `LOVE_RUN_SPEED`; six gates are counted and nothing depends on them; E skips it.

**Stages** (append-only): `idle → forecast → asked → hill → told → dinner → patio → done`.

| Stage | Reached when | Shown as |
|---|---|---|
| `forecast` | on the port's deck, once the chapter is open | `fixed.forecast('defection')` |
| `asked` | the envoy at the bar (E). She leaves the bar for good. | cinematic talk |
| `hill` | the run has been skied (talk to her at the top, then E at the edge) | play, with her lines said on the way down |
| `told` | her, at the bottom (E) | cinematic talk |
| `dinner` | the meal has been eaten | the crew deck's dinner scene, `LOVE_DINNER_T`, E skips |
| `patio` | ASK HER FOR NOTHING, or ASK WHAT SHE KNOWS ABOUT THE ENGINE | a choice; asked again if left |
| `done` | first bell: a shuttle leaves without her | scene, `LOVE_STAY_T` |

**The fixed event.** `defection` is resolved by the decision: `how: 'trusts'` (asked for nothing) or `'wary'` (asked what she knows). She stays either way: the fact `ch9.ione` is `'stayed'`, and chapter 13 decides the rest. Nothing here can kill the pilot, so the decision (`ch9.why`: `nothing` | `engine`) is survived as it is made.

**Guests aboard.** Two rooms take a guest from `voyage.aboard(room)`, each doing nothing different when there is none:
- `'archive'` (5.7.9, chapters 4 and 5): she stands by the holodeck and her console comes before the room's own.
- `'deck'`: `ctx.guest` in `world/basedeck.js`. Its `consoles()` come first, as in the archive, and it may offer `dinner(hereIds) -> { rig, T, lines: [[seconds, who, text]], done() -> a door | null }`: the guest's figure is sat at the table, the talk and the length of the meal are the guest's, and when it ends the pilot goes through the door `done()` names.

The port's deck has four small hooks for a later chapter (`S.love` in `world/concourse-hub.js`): what the envoy says, whether she is still at the bar, a mark, and a call each frame for the chapter's forecast.

**Crew.** At the table each captain's line is said by whoever is sat there; with nobody aboard the meal is the two of them and she has one line more. Every other crew line has a `solo` or is hers.

**Tunables.** `LOVE_*`.

**Debug.** `__debug.tenretni.voyage().instance('concourse')`: `state()` adds `s9`, `open9` and `love` (`how`, `ione`, `hill`, `patio`, `archive`, `places`); `go9(stage, 'trusts' | 'wary')`; `love.L.decide(how)`; `love.patio().dbg.skip()`.
#### Chapter 11: The Vault (played in `concourse`)

`world/vault.js` (stages, the two cases, the decision, the scene, the archive guest), `world/vault-dialogue.js` (every word). It is a guest of the free port's system, as chapter 5 is of the archive: `world/concourse-system.js` builds it, saves it under `chapters.concourse.vault`, and hands it to the deck as `S.guest`.

**When it opens.** `S.open11()` in `world/concourse-system.js`, in one place: for now, chapter 5 done and its debrief played. It becomes `fixed.resolved('siege')` when chapter 10 is built.

**The place.** The port's deck, with the outer ring's people on it (`VAULT_PEOPLE` figures and what they carried, by the berth), and the light ship's archive.

**Stages** (append-only): `idle → forecast → asked → walked → decided → done`.

| Stage | Reached when | Shown as |
|---|---|---|
| `forecast` | first step onto the deck once it is open | `fixed.forecast('refugees')` |
| `asked` | the dockmaster (E) has put the two offers, and what is on the table is settled | cinematic talk; in the world case, a choice of which world |
| `walked` | the pilot has walked it once more | the holodeck program itself; or the record, a transmission |
| `decided` | chosen (`ch11.choice`); `fixed.resolve('refugees', how, …)`; `season.survive` | each captain aboard says their side, then the choice |
| `done` | the ring's people have gone to where they are to live | scene, `VAULT_END_T` |

**The two cases.** Which one a save gets is settled as the dockmaster asks, and kept.

| | Every captain alive: a WORLD | A captain lost: a PERSON |
|---|---|---|
| On the table | one of the archive's worlds that can still be walked (the holodeck's `world` rows); the pilot picks which | the first lost captain in the roster's order; the port wants recompiling proved on one complete record before it stakes four thousand lives on it |
| Walk it once more | start that world's program at the light ship's holodeck (`voyage.holo(id)` tells the chapter) | E at the record, across the walk from the holodeck's plinth in the archive |
| The choice | SELL (`sold`) or RECOMPILE (`recompiled`) | RECOMPILE THEM (`friend`) or LET THEM REST (`rest`) |
| Where the refugees go | berths bought with the price; or the world itself | berths the port pays for on the strength of the proof; or the lower docks, on credit |
| What the archive loses | that world, either way: `ch11.world` is its id | nothing: `ch11.world` is null; `ch11.friend` is the captain's id if recompiled |

**The cost is permanent.** `voyage.archiveGone()` reads `ch11.world`; `catalog()` in `src/tenretni.js` shuts that row in the holodeck for good, in every system, with the note `GIVEN UP` (`ARCHIVE_GONE_NOTE` in `world/season-dialogue.js`). Catalogue rows now carry their `kind`.

**What "made real" is, so far.** A recompiled world is a body in the port's sky (`VAULT_WORLD_DIST`, `VAULT_WORLD_R`), its row is shut, and the crew say so. It cannot be flown to or landed on. A recompiled captain is the fact `ch11.friend` only: `chapter.lost()` is unchanged, and nobody stands in their quarters yet.

**Hooks this chapter added.** `voyage.archive()` (the holodeck's rows), `voyage.archiveGone()`, `voyage.holo(id)` and an instance's optional `holo(id)`; in `src/homebase.js` the holodeck tells the voyage which program is started. On the deck (`world/concourse-hub.js`), `S.guest` may supply `talk('varn')`, `choice(tag)`, `mark()`, `panel(place)`, `held()`, `act()`, `heldPrompt()`, `camera(pos, target)`, `enter()`, `leave()` and `tick(d, t)` (true while its scene has the frame).

**Decision.** Nothing here can kill the pilot, so it is offered, made and survived in one step. Left with X, it is put again.

**Tunables.** `VAULT_*`.

**Debug.** `__debug.tenretni.voyage().instance('concourse')`: `state().vault` (`stage`, `open`, `world`, `label`, `friend`, `how`, `event`, `camp`, `newWorld`, `scene`, `worlds`, `places`), `go11(stage, 'sold' | 'recompiled' | 'friend' | 'rest', worldId)`, `vault.skip()`, `vault.decide(how)`, `vault.settle(worldId)`; `voyage().holo(id)`.

**Science.** All of it is past known physics: recompiling a world, or a person, from a record is the Tenretni's art. The header of `world/vault.js` says so.

**Ending a chapter.** A system instance may offer `debrief()`: once the
chapter has ended, `{ title, complete, lines: [[captain id, text]], nextCourse,
nextNone }`. The first time the pilot is on the bridge after that, the captains
talk it over in plain words (bars, the camera behind the helm, each line by its
captain or by whoever is aboard), then a card: the chapter's title, COMPLETE,
and where the story goes next (a new course on the chart, or that nothing new is
charted yet). It plays once (`season` fact `debrief.<system>`); the bay's
welcome says the captains are waiting while it has not. The Long Dusk's ends
with Renn's goodbye, and its lines follow how the flare went.

#### Chapter 3: Under the Ice (`ice`)

`world/ice-system.js` (system, stages, record, doors), `world/ice-surface.js` (the bore, on the ice), `world/ice-ocean.js` (the ocean), `world/ice-dialogue.js` (every word and name). No `needs`: the standalone chapters can be flown in any order.

**The place.** A rogue planet: `star: null`, so the only light is what the freighter brought. The dock is a pad on the ice beside a bore melted through it, built on a globe of its own as the dusk camp is. E at the bore's head is a plain choice (GO DOWN / NOT YET) and the door `ice:down`. Below is a second site, walked under the pause (look `dive`): the vessel of Entry Zero, flown as it was there (W A S D, Space / Shift, mouse; Q / E the lamp's band, L the lamp), in an ocean `ICE_DEPTH` deep under a ceiling of ice. It is built the first time the vessel goes down.

**Sound and radio over sight.** The people there (`ICE.people`) talk on the 21 cm band, which the lamp only hears. On that band the signal is strongest along the way the vessel points (the corner panel's `SIGNAL` bar, and `setRadio` in the ear); off it the panel says to switch. Everything in the chapter is found that way.

**First contact by tone.** The first one, found and held on the radio band for `ICE_HEAR_TIME` within `ICE_HEAR_R`, stops calling, then calls in three notes (`ICE_NOTES`). The call is given back on the hull's sounder: keys 1, 2, 3, or three pads on screen (`#icePads`, for touch). Three calls, longer each time (`ICE_PHRASES`). A wrong note and it says it again. The call is only heard, and only advances, while the lamp is on the radio band.

**Stages** (append-only):

| Stage | Reached when | Shown as |
|---|---|---|
| `arrived` | the ship is here | the passage (5.7.8) |
| `forecast` | first step out on the ice | `fixed.forecast('contact')` |
| `down` | the vessel is in the water | scene, `ICE_DESCENT_T` |
| `heard` | the first caller has been found by ear | lines |
| `answered` | three calls given back | scene, `ICE_ANSWERED_T`: the others come |
| `city` | followed to the vents (`ICE_ARRIVE_R`) | scene, `ICE_CITY_T`, every band at once |
| `asked` | followed up to the thinnest ice | a transmission with a choice; each captain aboard says their side first |
| `decided` | SHOW or LEAVE picked | |
| `contact` | settled: `fixed.resolve('contact', 'shown' \| 'left', { archived })`, `season.survive` | scene, `ICE_SKY_T` or `ICE_AWAY_T` |
| `done` | back on the ice | the debrief, on the bridge |

They lead and wait: the one that leads keeps `ICE_LEAD_GAP` ahead at `ICE_LEAD_SPEED` and stops when the vessel falls behind.

**The choice.** Marrow says show them, Lux says leave them, Vask counts what cannot be undone. SHOW: nose up under the thin ice (`ICE_ROOF_R`, `ICE_MELT_TIME`) until it opens; the sea rushes up the hole for `ICE_PULL_TIME` (`ICE_PULL`) and the vessel has to be driven clear, or it goes up with it (`ICE_HOLE_R`). Then the sky, through the hole, and `ch3.archived: true`. LEAVE: the bore is freezing shut (`ICE_LEAVE_TIME`); reach it in time and the way up plays, with `ch3.archived: false`. Afterwards the plume from the hole stands on the surface's horizon if it was opened.

**Deaths.** Taken up the hole (`vented`), or under the ice when the bore closes (`sealed`). The ocean sets `portal = 'ice:back'`; the pilot is put back under the thin ice with the choice unmade and is asked again. Leaving the water with the choice not lived through unmakes it the same way.

**Doors.** `ice:down`, `ice:up`, `ice:back`, `ice:ask`.

**Tunables.** The `ICE_*` block in `src/constants.js`, and the tables `ICE_PHRASES`, `ICE_NOTES`, `ICE_PLACES`.

**Debug.** `__debug.tenretni.voyage().instance('ice')`: `state()` (`stage`, `decision`, `pending`, `contact`, `surface`, `ocean`, `places`), `go(stage, opt)`, `seek(u)`, `skip()`, `decide('show' | 'leave')`, `kill(cause)`, and `dbg` once the ocean is built (`put({ at, look, yaw, pitch })`, `band(id)`, `press(i)`, `ask()`, `melt(v)`, `time(left)`).

**Science.** Real: rogue planets; an ocean kept liquid under ice by radiogenic heat with no star; vent life fed by chemistry; water boiling and freezing into a plume in vacuum; the 21 cm hydrogen line, and cold ice passing radio at that wavelength. Stretched, and marked in `world/ice-ocean.js`: liquid water swallows 1.4 GHz within centimetres, so nobody could talk across an ocean on it, and a hole held open by a warm plume would skin over.

### 5.7.10 Season 2: The Glass Crown

The season's story is `plans/season-2-arc.md`: ten chapters. No Season 2 chapter is built until Season 1 is, because nearly every one reads the Season 1 record (5.7.9: `fgsf.voyage.season`).

**Fixed events.** Season 2 follows the rule of 5.7.9, "How history works": its big events happen whatever the pilot does (the Choir falls; the Concourse is lost and retaken; someone dies at the Chonga; the pilot goes), and the pilot's decisions change who, how and what is left. Each one is forecast on screen before it happens and remembered afterwards (`src/fixedEvents.js`). Its rows are added to `FIXED` in `world/season-dialogue.js` as its chapters are built.

**What it reads from Season 1.**

| Season 1 outcome | Where it is kept | What it changes in Season 2 |
|---|---|---|
| The Foregone came out of Ch 13 blind or curious | fixed event `merger`, `how` | Blind: the Remnant is most of what is left of them, and the forged forecast in Ch 7 is cruelly easy to sell. Curious: the Remnant is a small splinter, the rest are a possible ally, and Ch 7 is about winning them over. |
| Ione stayed, or did not | fixed event `defection`, and Ch 13's record | If she stayed, she is the person the pilot loses at the Choir. If not, it is the Concourse dockmaster, and the chapter is written for that. |
| A captain was lost | `chapter.crew()`, `chapter.lost(id)` | Every role moves along. Lux gone: Vask takes command in Ch 2. Marrow gone: the death at the Chonga falls on whoever is left who believed in it, and with nobody left, on the Pulsar Choir's eldest. No captains at all: the pilot carries Ch 2 alone from inside the glass. |
| The swarm builders were freed or contracted (S1 Ch 8) | fact `ch8.builders` | Freed: they arrive at the Long Way Back unasked, and their ships turn the battle. Contracted: the Claudians encased them, and they are fought. |
| Lux signed the forecast (S1 Ch 6) | fact `ch6.signed`; fixed event `flood`, `how: 'bound' \| 'free'` | Signed: the Claudians find the light ship through the contract, and part of Ch 1 is learning how they knew. |
| A world was sold or recompiled (S1 Ch 11) | Ch 11's facts, fixed event `refugees` | A recompiled world is in the war as a place the Claudians can reach. A sold world turns up in Ch 10, in the hands of whoever bought it. |

Also kept from Season 1, for chapters that want them: `ch2.decision`, `ch3.decision`, `ch4.fee`, `ch5.thieves`, `ch7.choir`, `ticks`.

**Placeholder names.** Claudians, Chonga, Remnant and Marshal are placeholders, kept in one constants file as Season 1's four are (`world/season-names.js`), and spelled nowhere else in code or dialogue.

**Rules for every Season 2 chapter.** Those of 5.7.9, and: nothing in the season changes the pilot's model (an encased figure is a figure inside glass, not the pilot's own); each chapter has a named set piece, built first; Star Trek gives the structure only, and nothing is copied from it.

**Visual prototypes.** Two looks carry the season, and each has a standalone test scene, opened from `__debug.proto` in free flight and from nowhere else: no story stage, menu or key leads to either (`src/protoLazy.js` lends a scene the screen by drawing it in place of the game's own, and `close()` puts back the renderer, exposure, bloom, pause and HUD exactly). `__debug.proto.glass` (`world/proto-glass.js`) is glass that holds light: one shader that bends what is behind it (on MEDIUM and above the scene is drawn a second time at half size, without the glass, and each facet reads that picture to one side, red and blue apart on HIGH; on LOW the bent ray is looked up in the sky's own function, and the one shard with a figure in it is blended over the figure), takes light by thickness, catches the star on its rim, and has colour moving slowly at several depths inside it. It is shown on a crown of shards turning round a captured star with the star's light drawn between them, and on one made figure (`buildRig`, never the pilot's model) standing inside a shard. `__debug.proto.strobe` (`world/proto-strobe.js`) is a battle with no light of its own: `world/warships.js` hulls, instanced, black except for what a pulsar's sweeping beam puts on them, with the battle moved on in the dark between sweeps (hulls travel, some are lost, wreckage is left). The pulsar is slowed to `STROBE_RATE` (one sweep every two seconds) and can never flash faster than `STROBE_MAX_RATE` (3 a second); `set({ soft: true })` is a gentler mode that is wider, dimmer and never fully dark. Tunables are the `GLASS_*` and `STROBE_*` blocks and the `GLASS_TIER` and `STROBE_TIER` tables in `src/constants.js`. The four placeholder names are spelled in `world/season2-names.js` and nowhere else; the prototypes say "glass" and "pulsar".

### 5.8 The Sky City (Saturnia)

Saturnia has no surface, so it gets a place instead: a floating city 320 units
above the cloud tops (`world/skycity.js`), a child of the planet's group so the
bands turn beneath it. It is the only landing on the gas giant, and the landing
is not optional: crossing into Saturnia's air shell hands the helm to the city,
which flies the ship round the planet on a great circle, holds it over the pad
and sets it down (`src/game.js`, the `skyLanding` branch of the landing
sub-state). G steps out; W lifts off with a short scripted climb.

On foot (`src/skyWalk.js`) it is a flat walker in the city's own frame. The
edges are open. Walk or jump off the deck, an arm or the pad pier and you fall;
after a moment the screen whites out and the run restarts in the ship at the
start, with no death menu.

Saturnia itself is no longer a gas giant: it is a `terra` world with `noLand`,
flooded pole to pole (sea level above every peak) so it reads as one golden ocean
under a heavy cloud shell (`cloudCover`), with wider rings. The sea is in a
permanent gale (`storm: 1`): `water.frag` draws a mountainous crossing swell
with breaking whitecaps, `cloud.frag` darkens the cloud mass into fast-boiling
thunderheads and fires lightning cell by cell, and the city's fill light
flickers with it. Any planet can opt in with `storm`. There are
a few stray clouds around and above the city.

Things to do in the city:

- **Inhabitants.** A crowd from `world/aliens.js` wanders the main deck; E talks.
- **The dragon and the Lance.** A red dragon (`world/skydragon.js`) flies in
  every so often and circles. A lift at the foot of the tallest tower goes up
  to an open gallery; E at the console there seats you at the Lance. The view
  moves to the gun sight, the mouse sets an aim point and the heavy turret
  slews after it, and click, Space or E winds the coil for half a second and
  fires down the bore. The shot has to pass within a few units of the body.
  A hit detonates the dragon head to tail: flash, a chain of fireballs, shock
  rings, embers, and the charred body coming apart and falling. G steps back.
- **The Rim Circuit.** A bare ribbon of road with no barriers
  (`src/skyRace.js`; the route is built in `world/skycity.js`). From the start
  line it runs round the outside of the rim, over a kicker and a gap, turns in
  and climbs a bridge straight through the city (up an avenue, between the
  spires, over the dome, off a second jump) and back out to the rim. E at the
  booth puts you on the grid with four rivals for three laps. Cars collide
  properly: closing speed becomes a sideways shove on both, so drivers can
  knock each other off, and rivals will sometimes steer into the car
  alongside. A car that leaves the road, or falls short at a jump, is caught
  by a recovery drone from the mechanics' yard and towed round the rim to a
  bay; that ends the driver's race. G quits.
- **Rivals and engines** (`world/skyrace-roster.js`). Each race has a headline
  rival, shown on a poster by the booth with a line of trash talk. Win and the
  mechanics fit the next engine (more top speed and acceleration), the field
  gets a little quicker, and the poster moves on to the next name. The
  standing persists in localStorage (`nova7.skyrace`).
- **The paving.** The deck, terrace and pad wear one procedural tile pattern
  (`makePavingMaterial` in `world/skycity.js`): a glazed rosette on the
  terrace, rings of setts with inlaid feature rings, chequered avenues edged
  in brass.

Sound for the city's set pieces is synthesised in `world/skycity-audio.js`
(no audio files): the Lance's charge whine and shot, the dragon's explosion
(crack, sub boom, rumble, one pop per body segment in step with the fireballs,
crackle), and the recovery drones (a rotor voice that deepens under load, a
ping when the wire bites, a thunk when a car is set down). Level follows the
music slider and mute.

## 6. Build sequence

| Phase | Deliverable | Ship-able alone? |
|---|---|---|
| 1 | Scaffold, flight model, gravity, floating origin, tuning panel | Yes |
| 2 | Starfield, nebula, cockpit, bloom, black hole | Yes — the "beautiful" milestone |
| 3 | Planet from orbit | Yes |
| 4 | Atmosphere | Yes |
| 5 | Descent: LOD, dual flight regimes, water | No. Long. |
| 6 | Planet variation: biome parameter | Yes |

Phases 1 through 4 each end with a working deployed build. Phase 5 does not, and that's the risk the whole ordering is designed around: if the project is abandoned during descent, phases 1–4 remain deployed and worth having.

**Do not build ahead** — with the single exception of floating origin, which is Phase 1 for the reason in 5.2.

**Ship Phase 2 and fly it for a week before starting Phase 3.** Not a metaphor. Deploy it, fly it, and find out whether the flight model is right while it's still cheap to change. After Phase 3 the flight model is load-bearing for planet code and re-tuning gets expensive.

### 6.1 Honest odds

Phase 5 is the wall. Solo, spare-time, it's a months-long stretch with no visible progress and a high abandonment rate. Nothing in this document changes that.

What the phase ordering guarantees: if you stop at any point before 5, you have a deployed browser space flight game with gravity, a black hole, and planets you can orbit. That's a real thing. Phases 1–4 are not a means to the flyover; they're the project, and the flyover is what may or may not arrive.

---

## 7. The loop

Earlier drafts of this document had an unanswered question: what is landing for? Touchdown with nothing after it was a view of a rock, and months of work for a static image is a bad trade.

The flyover answers it. The descent *is* the loop:

Leave orbit. The atmosphere thickens and the limb flattens into a horizon. Drag catches the ship — the controls change feel, and the vacuum tuning from Section 3 stops applying. The sphere resolves into terrain. Mountains gain silhouettes. Water goes flat and catches the sun. You skim at the floor, pull up, and watch it all fall away and go dark again.

That has a beginning, a middle, and an end, and it returns you to where you started ready to do it again. It's a loop rather than a destination, which is why it works without objectives, rewards, or anything to do on the ground.

This is the whole game. Everything in this document serves those ninety seconds.

Still open, and only discoverable by flying:
- Is a speed indicator necessary? If yes, diegetic — geometry on the dashboard, not DOM.
- Does the atmosphere-boundary transition need a visual cue (heat, buffeting) or does the drag change carry it alone? Lean toward drag alone first.
- Is `MIN_ALTITUDE = 2000` right? It's a guess. It may be that 3km reads better and costs less, or that the floor wants to vary by planet.

---

## 8. Instructions to the coding agent

Read before writing: `threejs-fundamentals`, `threejs-geometry`, `threejs-materials`, `threejs-shaders`, `threejs-postprocessing`, `threejs-interaction`.

Build one phase at a time. Stop at the end of each and report:
1. What was built
2. What was cut and why
3. Which constants most affect feel, and what each does

Build only the current phase. Do not add HUD, sound, menus, or save state. There is no character controller, no combat, no ship exterior, no landing, and no collision detection in this project — if a phase seems to need one, stop and say so.

The altitude floor (5.1) is enforced by drag, never by a collision test or a hard clamp. If you find yourself writing an intersection test against terrain, you have misread the document.

All code complete. No placeholders, no TODOs, no stub functions.


### 5.9 stevenlacey, the coin world (owner exception to 5.7)

A gift world. Not a planet: a coin 1,200 units across, tumbling in open space (`world/coinworld.js`), with its own capture and landing in `src/game.js` on the Sky City pattern. It breaks the "palette + threshold" rule of 5.7 on purpose and brings three systems of its own:

- **A 2D walk mode** (`src/coinWalk.js`). Stepping out presses the ship flat and backs the camera onto a 14 degree lens; the visit is a side-scroller drawn on one canvas-textured quad. Heads is the Sanctuary (wild creatures, turn-based team battles in `src/coinBattle.js`, a champion). Tails is the Claws (a claw, a dash, enemies, a warden). A rim door flips between them. The dash from tails opens the grove on heads; a Lanternmoth from heads clears the dark on tails.
- **Specimens** (`world/coin-bestiary.js`, `specimens` in `fgsf.inventory`): ten creatures. Visit progress is in `fgsf.stevenlacey`.
- **The terrarium** (`src/terrarium.js`): a tank in the stern lounge showing every specimen brought home. E at the glass opens a close-up.

The full plan and the as-built notes are in `plans/planet-stevenlacey.md`.

### 5.10 The Indigo Reach and the charge (Neptunia — owner exception to 5.6, 5.7 and 2.1)

Neptunia is no longer a palette-and-threshold terra world. At the owner's request it is an all-ocean storm world whose only settlement is a ship, and it can be destroyed. Four exceptions are recorded here so nobody "fixes" them back.

- **A bespoke structure.** `world/reachship.js` builds the Indigo Reach, a 260 u steel factory ship, at boot (like the Sky City, it is seen long before it is walked). It is not a `createCity` layout: it answers the same contract (`asCity`), so the stock on-foot path runs on it — isolation, the real sky, diamond rain, swimming, citizens, the governor's quest. Registry entries with `host: 'reachShip'` and `noFlatten: true` take this route.
- **Displaced water.** Everywhere else the sea is a smooth sphere with shaded waves (5.6). Around the ship, `world/seapatch.js` swaps a 600 u disc of it for Gerstner geometry, with a CPU mirror the hull, swimmers and the camera ride. This is the one place the game displaces water; `seaStorm` roughens the rest of Neptunia's sea in the shader only. The wave table lives in one JS array and is generated into both shaders.
- **Landing.** Neptunia is `noLand`. The ship captures and auto-lands you exactly as the Sky City does (5.8): `src/game.js` drives a list of docks through one capture/arc/descent/liftoff routine. The Reach's dock freezes the planet's spin for the approach and follows the heaving pad for the last of the descent.
- **A world that can break.** After the wonder tour the governor offers a second errand (registry `charge`): ride the riser lift (`world/reachtube.js`) to the seabed and arm a charge. Arming it detonates it. The run ends as a death, and Neptunia is left as half a planet with its other half a debris field (`world/shatter.js`), the ship adrift and dark in it. This is permanent for the save (journal quest `neptunia-charge` = `blown`, re-applied at boot). The cut is one function of direction shared by `shatter.js` and the `shattered()` helper in `surface.frag`, `water.frag` and `cloud.frag`; change one and you must change all four.

Neptunia left `WARZONE_WORLDS`: the arena assumes a flat town disc. Its plasma launcher sits in an arms locker in the ship's market.

Not yet measured: frame rate on the Iris Xe reference machine (2.1). Everything was checked under headless software GL only.

