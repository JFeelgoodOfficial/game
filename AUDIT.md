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
  worker would smooth the transition. (The towns-v2 rework kept this roughly
  neutral: still exactly one town per landing, but it's now ~9 merged buildings +
  an 8-person people.js crowd + 2–3 wonders instead of a 260-instance skyline,
  a 48-alien crowd, and one wonder.)
- **Mobile/touch**: only the WARP button has touch handlers; dialogue is keyboard-only.
  Either a touch scheme or a friendly "desktop only" notice is still needed —
  `index.html` ships a mobile viewport meta but the game is unplayable on touch.
- **E is double-bound** (roll right + interact edge) in `input.js`. Harmless in
  current flows; worth splitting if on-foot roll ever becomes a thing.
- ~~**Music external hosting**~~ — done in the September 2026 pass below.
- **Escape both closes the nav map and drops pointer lock** in the same press.


---

# Deploy Size, Loading & SEO — September 2026

The July pass fixed what the *bundle* cost. This one fixes what the *deploy*
cost, which had grown back: ten music tracks instead of four, thirty-three
paintings, and a habit of committing images at whatever size they came off the
camera.

## Baseline → after

| Metric | Before | After |
|---|---|---|
| `dist/` per deployment | ~71 MB | ~11 MB |
| Repo tree (what Vercel clones each build) | 76 MB | 44 MB, 33 MB of it music the deploy no longer touches |
| Images downloaded before LAUNCH | ~25 MB | 0 |
| Images in the 12 s after LAUNCH | (all of the above, at boot) | 450 kB |
| Boot JS | one 848 kB chunk (238 kB gzip) | 245 kB game + 589 kB `vendor-three` (236 kB gzip total, and the 151 kB vendor half survives the next deploy) |
| Largest single asset | 3.9 MB painting (5954×7926) | 796 kB painting (≤2048 px) |

## What changed

1. **An image budget, enforced by a script** (`scripts/optimize-images.mjs`).
   Paintings ≤2048 px, corridor pictures ≤1024, cottage textures 1024/512 with
   the bump and roughness maps single-channel, PNG billboards (Actuality's
   dragon, the Shadowreach portraits) converted to WebP with alpha. Idempotent —
   run it after dropping new artwork in. It also renders `og.jpg` and the icon
   set. 27 MB.
2. **Music moved out of the deploy** to jsDelivr's GitHub CDN, reading `/music`
   at the repo root (outside `public/`). Dev still serves it locally.
   `VITE_MUSIC_BASE` overrides both. 33 MB off every deploy, and the Audio
   element now skips a track that fails to load instead of going quiet.
3. **The gallery hangs its art on approach**, not at construction — inside 2200
   units, two loads at a time, with docking as a backstop. The gate reads the
   station position *after* the frame's orbit update; reading it before put the
   gallery on top of the ship at spawn.
4. **Painting nebulae read 128 px thumbnails** (`artgallery/thumbs/`, 96 kB for
   the set) instead of full paintings, and `await img.decode()` before drawing,
   so a multi-megapixel decode no longer happens inline on the main thread. The
   queue starts on the first idle callback after LAUNCH, as do the corridor
   photographs.
5. **The palette thumbnails are excluded from Vite's 4 kB inline threshold**
   (`build.assetsInlineLimit` as a function). At ~3 kB each they were being
   base64'd into the boot chunk — 100 kB of eagerly parsed JavaScript carrying
   images that are only wanted after LAUNCH.
6. **GTAOPass is a chunk of its own**, fetched when the walk chunk lands rather
   than shipped to everyone; three.js is a `vendor-three` chunk whose hash
   survives game-code pushes; the renderer no longer requests MSAA it cannot
   use (every frame goes through the composer's targets).
7. **`vercel.json`**: hashed `/assets` immutable for a year — Vite content-hashes
   them, so a changed file is a changed URL. Everything from `public/` keeps its
   name across deploys, so those get a week plus background revalidation instead;
   `immutable` there would pin an edited texture in returning players' caches.
   `index.html` keeps Vercel's default no-cache. One canonical hostname, matching
   the canonical link tag. (Note for future edits: Vercel's schema rejects any
   key it doesn't define, `comment` included — the file cannot carry its own
   annotations, which is why they are here.)
8. **SEO**: description, canonical, Open Graph and Twitter cards with a real
   preview image, `VideoGame` JSON-LD, a screen-reader-only description of the
   game and its controls (a canvas is not indexable), a `<noscript>`
   explanation, `robots.txt`, `sitemap.xml`, `llms.txt` and a web manifest.

## Deleted

`actuality-dragon.png` and `actuality-body.png` (never referenced),
`spruit_sunrise_2k.hdr.jpg` (never referenced, still deployed), and the root
`CNAME` left over from GitHub Pages.

## Still deferred

Everything in the July list that is not struck through above, plus: the gallery
still uploads its paintings at full 2048 px with mipmaps, which is the largest
remaining VRAM item on a phone; a per-world split of the walk chunk (Actuality,
Shadowreach, WaveMall and the cottage all load together at 561 kB); and the
repo's own history still carries the original full-size images, which is fine —
they are the masters, and a clone is a one-time cost the CDN and the build no
longer pay for.

---

# Deployment Storage — September 2026 (second pass)

The September pass above cut `dist/` from ~71 MB to ~11 MB. The Vercel
dashboard still read **3 GB**. That number is not one build: it is every build
Vercel has kept.

## What the 3 GB actually was

Counted through the Vercel API on 14 September: **43 retained deployments**
for `nova7game` (20 production, 23 PR previews, none expired), the oldest from
26 July. Forty-one of them predate the deploy-size pass, so they are the 71 MB
kind:

    41 x ~71 MB + 2 x ~11 MB ~= 2.9 GB

Nothing the game does at runtime holds that storage. It is an archive of old
builds, and each push adds another copy. Two fixes, in that order of size.

## 1. Delete the stale deployments (Vercel side, no code)

    npx vercel login
    npx vercel remove nova7game --safe --yes
    npx vercel ls nova7game

`--safe` keeps anything an alias still points at — the live production build
and the newest deployment behind each branch alias — and drops the rest.
Delete the leftover branch previews by URL. Rollback is a Pro/Enterprise
feature, so on Hobby a superseded production build has no value.

If Project → Settings → Deployment Retention is available, set previews to
expire after a day; otherwise re-run the command occasionally.

## 2. The paintings follow the music to the CDN

| | Before | After |
|---|---|---|
| `dist/` per deployment | ~11 MB | **3.4 MB** |
| `artgallery/*.webp` in the deploy | 7.4 MB (33 files) | 0 |

The paintings were pulled into the bundle by three `import.meta.glob`
calls (`src/stations.js`, `src/paintingnebula.js`, `world/shadowreach.js`).
They now come from jsDelivr, the same CDN the music has used since the pass
above. `src/assetBase.js` holds the base URL and the percent-encoding for
filenames like `The Two Brothers (1).webp`; `src/gallery.js` reads the
committed `artgallery/manifest.json`, which `scripts/optimize-images.mjs`
now writes. `src/music.js` builds its own base from the same module.

What stays bundled, deliberately: the 128 px palette thumbnails (152 kB, and
every one is read on a first visit), the corridor pictures, the Shadowreach
portraits, the dragon billboards and everything in `public/`.

Nothing changes for the player. The gallery already hung its art on approach
and the nebulae already read thumbnails on idle; those fetches now resolve to
a CDN edge. Verified headless against the pre-change build on a second dev
server: 24 painting nebulae with identical palette colours, 24 exhibit panels
hung from 24 unique files with 5 procedural placeholders, Shadowreach's
windowpane on `dream mountain.webp`, zero page errors and zero failed
requests on both.

Not taken: skipping preview builds for `claude/*` branches. At 3.4 MB a
deployment, a hundred previews are 340 MB, and losing the preview URL on
every PR costs more than that is worth.
