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
| Q / E | Roll |
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
ribbon meshes (`farStream.frag`) hang from it: the tethers, streaks of fire
from the hole's lower rim fanning down to the world all along the horizon, and
the wisps, faint embers looping off the ends of the disc. The mining itself is
the conduits (`farConduit.vert/.frag`): tubes of iridescent glass from two
collectors on each full-detail cage's gantry up and over into the disc, with
gold light falling down the inside. Their shape is made in the vertex shader
each frame from the mesh's own place (the collector, fixed in the world) and
the hole's (a direction in the sky); they fade out well short of the hole,
because eight of them crossing the same patch of sky add up to white. Nine spiral galaxies (one mesh) stand in
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

`src/capitalWalk.js` gained what a place with no ship needs, all optional:
entry options (`spawn`, `yaw`, `quiet`), `site.noShip`, `site.exit`,
`site.leaveHint`, `site.onEnter` / `onLeave`, and `site.tick(dt, t)`.
The greeting's words are a first draft (`GREETING` in `src/farside.js`).

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

