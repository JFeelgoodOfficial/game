# Performance & Experience Audit — July 2026

Three parallel audits (rendering hot paths, player experience, assets/loading/build)
of the deployed game. This file records every finding — what was fixed in the
audit branch, what was already good, and what was deliberately deferred.

## Baseline → after (production build)

| Metric | Before | After |
|---|---|---|
| Initial download (JS + images) | ~4.53 MB (748 kB JS + 3.78 MB PNG) | ~0.87 MB (641 kB JS + 113 kB WebP) |
| Initial JS (gzip) | 209 kB | 172 kB + lazy 42 kB walk chunk |
| Cockpit overlays | 2 × 1.9 MB PNG | 2 WebP, 113 kB total (visible-pixel diff ~2/255) |
| Music | 13.7 MB bundled through Vite | streamed on demand from `public/music/` |
| Planet vertex shader | ~74k heavy noise evals/frame/planet | baked once, pass-through shader |
| Land fragment cost | ~4× elevation field/pixel (~500 noise hashes) | 1× + derivative relief; 6/4/3 octaves by distance |
| Nebula | ~80 noise hashes/pixel, full-screen, every frame | one-time 512³ cubemap, 1 tap/pixel |

> Rebased onto `main` after PRs #17/#18 landed. `main`'s "instant title screen"
> (static `#menu` markup painted before the module loads) already solves the
> black-screen-on-boot problem, so this branch's separate `#boot` indicator was
> dropped in favour of it. `main` also took **P/R** for photo/record, so the
> pause control moved to **Backspace**.

## Fixed in this pass

### Performance
1. **Terra vertex displacement baked** (`planet.js` `startPlanetBake`, `shaders/surfaceBaked.vert`).
   The warped-fbm + ridged field was re-evaluated per vertex every frame on static
   meshes (up to ~74k verts × 5 planets). Now baked on the CPU (exact port in
   `terrain.js`) in ~10 ms background slices after boot; each planet swaps to a
   pass-through vertex shader when done. Dev note: after the swap, tuning
   `SEA_LEVEL`/`TERRAIN_HEIGHT` recolours but doesn't move geometry — reload to re-bake.
2. **Fragment relief from screen-space derivatives** (`shaders/surface.frag`).
   Was 3 extra `elevation()` calls per lit land pixel for finite differences;
   now reconstructed from `dFdx/dFdy` of the already-computed elevation.
3. **Distance-based octave falloff** (`planet.js` → `uOct`): 6 octaves under 8 radii,
   4 under 40, 3 beyond; detail grain only at full octaves. LOW quality caps at 4.
4. **Nebula baked to a cubemap** (`nebula.js`): the sky is static, so the noise
   shader renders once into a HalfFloat cube target; per-frame cost is one texture
   tap. Accent changes (dev tuning) trigger a re-bake.
5. **Station animation distance-gated** (`stations.js`): mining beams/shuttles/embers
   and spin skip beyond 6000 units (motion is absolute-time, so resuming is seamless).
   Origin-shift position updates still run every frame.
6. **Walk mode code-split** (`walkLazy.js`): `walk.js` + `dressing.js` + six `world/`
   modules load as a separate chunk on idle after boot.

### Experience
7. **Settings panel** (`settings.js`, `settingsPanel.js`): music volume/mute, mouse
   sensitivity, invert-Y, quality HIGH/LOW. Persisted to localStorage (fail-open),
   reachable from the start menu and pause overlay. Sensitivity/invert are applied
   at the input source (`input.js`) so flight, interior, and on-foot look inherit them.
8. **Real pause** (Backspace): freezes the physics accumulator, heat, and music under
   a PAUSED overlay. Input is swallowed while paused. (Pointer-lock loss can't be the
   pause trigger — the WARP button and radio are designed to be clicked unlocked; and
   P/R belong to the in-game camera, so pause takes Backspace.)
9. **Pointer-lock hint restored**: `input.js` always toggled `#hint`, but the element
   never existed. It now lives in `index.html` — "MOUSE FREE — CLICK VIEW TO STEER ·
   BACKSPACE — PAUSE" whenever lock drops during flight/walk.
10. **Onboarding**: start screen now lists C (walk the ship), G (land & walk), and
    Backspace-pause; a one-time first-launch toast points at Terra ("dead ahead")
    without marking the deliberately-hidden nav chart.
11. **prefers-reduced-motion**: heat warning/countdown stop strobing (CSS); camera
    shake and turbulence damp to 25% (`MOTION_SCALE` in `game.js`).
12. **Corridor burn-up trap**: hull heat no longer accrues while out of the pilot
    seat (controls are disengaged there, making the death nearly unavoidable);
    it holds until reseated, and cooling still works.
13. **Nav chart resizes** with the window (`nav.js sizeCanvas`).

### Hygiene
15. Deleted the unused React/shadcn scaffold from `world/` (67 files — a leftover
    template app; the game only uses the seven root `world/*.js` modules).
16. MP3s moved from `src/` to `public/music/` with URL-safe names; streamed via
    `BASE_URL`-relative paths instead of passing through the bundler.
17. Cockpit PNGs (2 × 1.9 MB) converted to WebP (113 kB total; alpha-weighted mean
    pixel difference ~2/255 — imperceptible).

## Already good (verified, left untouched)

- Zero-allocation frame loop; all scratch vectors at module scope.
- Fixed 60 Hz accumulator with `MAX_FRAME_DELTA` tab-switch guard.
- Pixel ratio capped at 2; bloom at half resolution via `setSize` intercept.
- Lensing is a cheap single-tap screen-space pass (not a raymarch); collapse pass
  only enabled ~0.9 s during a reset; skyfog/interior passes disabled at zero cost.
- Starfield: 13,800 stars in 3 draw calls with shader-side infinite wrap.
- Instancing throughout dressing/crowds/creatures; mining debris is one `Points` draw.
- Full geometry/material disposal on `exitWalk` — no leaks across repeated landings.
- localStorage wrappers fail open everywhere (private-mode safe).
- Modal UIs add/remove their key listeners symmetrically.
- Audio streams on demand and starts from a real user gesture with a retry path.
- Shaders imported as `?raw` strings — no runtime fetches.

## Deferred (known, not addressed)

- **Planet LOD / quadtree**: planets keep full tessellation (up to ~147k tris) at any
  distance. Frustum culling hides off-screen ones; a real LOD tree is the next big
  perf lever if needed.
- **Dressing frustum culling**: `frustumCulled=false` on grass/trees/shrubs/rocks is
  intentional — the patches are centred on the player/landing site, so whole-mesh
  culling can never reject them. A win here needs sector-split instanced meshes.
- **Station mesh merging**: Port Feelgood is ~50–100 draw calls of small meshes.
  Merging static parts would cut draw calls but complicate the per-part animation.
- **Disembark hitch**: world spawn (grass placement up to 144k noise-checked attempts,
  city/creatures build) is synchronous on `enterWalk`. Chunking it over frames or a
  worker would smooth the transition. (The permanent-city registry did not change
  this cost: still exactly one city is built per landing — the nearest registry
  entry — plus its single wonder and a handful of vendor rigs.)
- **Mobile/touch**: only the WARP button has touch handlers; dialogue is keyboard-only.
  Either a touch scheme or a friendly "desktop only" notice is still needed —
  `index.html` ships a mobile viewport meta but the game is unplayable on touch.
- **E is double-bound** (roll right + interact edge) in `input.js`. Harmless in
  current flows; worth splitting if on-foot roll ever becomes a thing.
- **Music external hosting**: tracks still ship in the repo/deploy (13.7 MB). Moving
  to a CDN would shrink deploys; `music.js` now builds URLs in one place if so.
- **Escape both closes the nav map and drops pointer lock** in the same press.
