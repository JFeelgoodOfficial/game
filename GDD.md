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
  > - **C — ship interior** (`interior.js`): stand up from the seat, walk the
  >   corridor behind the cockpit (pictures on the walls, portholes and an aft
  >   window showing live space), sit back down to fly. Movement is
  >   range-clamped to the two rooms — three axis clamps, no intersection
  >   tests — so the "no collision system" rule below still holds. The ship
  >   coasts on attitude hold while you're up; gravity, heat, and the black
  >   hole stay live.
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

**Recorded addition — permanent towns (cities v2).** Cities stopped being pop-up (seeded from the landing direction, rebuilt differently every landing) and became registry entries; v2 then consolidated each landable world down to ONE flagship town (`world/cityRegistry.js`: fixed site, fixed seed, fixed landing pad) that inherited its deleted sibling cities' wonders into a `wonders[]` tour. A town is ~8 named citizens — REAL humans via `world/people.js` — each with their own fully enterable building (real floors, glass windows, open doorways, high ceilings, role-keyed furnishing, all from the shared PBR material registry), plus an elevator tower whose enclosed cab rides to a glass penthouse where the town's GOVERNOR lives. The governor gives the town's quest — a beacon-chain tour of all its wonders — and completing it awards one of four persistent vehicles (plane, motorcycle, jetpack, hang glider; `src/inventory.js`, deployed on foot via the I selector, ridden as walker branches like the snowboard). The landing pad sits just OUTSIDE the town edge with a lit walkway in; the G auto-land arcs to it, manual touchdown anywhere still works, and far-from-town landings are wilderness. The story worlds (actuality, shadowreach, wavemall prime) have no registry entries and keep their total conversions. glacia and oceana were retired from the roster; Frostwatch Relay re-parked at wyattmattoe.

---

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
