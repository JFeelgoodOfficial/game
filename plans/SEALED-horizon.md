SEALED: the owner has not played this yet. Do not open.

# Horizon: the first chapter after the saga (build plan, phase 1: design)

Working title on screen: none. Stage ids, hop keys, file names and record keys are deliberately blank of meaning, because they are listed in public places. Everything below this line is plot.

Reader of this file in phase 2: this plan is meant to be enough to build from without re-deriving anything. Every line of dialogue is written here (section 11). Nothing is a placeholder.

---

## 0. One paragraph

The crew are inside the horizon with a known, finite time left. The ship opens its glass and the sky has not gone out: the real view of someone falling in is shown, with three clocks, one of which (home, as seen) slows to a stop and is never the future. The lamp from Entry Zero finds, hanging in the dark ahead, the last light of everything that ever fell in, including this ship on its first voyage, a million years ago, which came home with nobody aboard. The hole turns out to spin, so the end is not a ceiling across their way but a ring off to one side, behind two "roofs". One roof is passable only as light. The ship's hull is full of archive and a hull holds what its surface can hold, so one world's record has to be put down for good (the cost). The pilot flies the crossing on a spacetime chart, where forward is later, obstacles are lines whose futures are visible, and the right move at the end is to let go of the controls. The pilot crosses awake, alone, and on the far side walks the hull and looks the others back into matter with every band of the lamp; anyone not looked back in time stays in the hull as light. In the still region past the roof nothing that happened before decides what happens next, the ring gives off lights that nothing caused, and the ship's corner of round cells turns out to be its first pilot, written into the hull and never looked back. The player decides whether to bring it back to one place or leave it whole (this changes the ending and who is aboard afterwards). Then through the middle of the ring, where for a moment effects come before causes, and out the other side, where the same ring pushes them away into plain stars, a thousand ship-years from the megaworld, with a clock that no longer says how long is left.

Themes, kept light on screen: struggling makes it shorter; you can still see what you left but never answer it; being kept is not the same as being alive; past the roof your history stops deciding for you, and what you carry out is what you choose to.

---

## 1. Physics: what each beat stands on, and where the story leaves it

Constants for comments (G = c = 1 in formulas; M is the hole's mass as a time, GM/c^3):

- `HZ_HOLE_SUNS = 4.0e9`. GM/c^3 = 4.9255e-6 s per solar mass, so M = 19,702 s. Horizon radius 2GM/c^2 = 1.18e10 km (79 AU).
- Free fall from far away ("rain" observer): proper time from horizon to the end = (4/3) M = 26,269 s = **07:17:49**.
- The longest proper time anyone can have inside a non-spinning hole = pi M = 61,896 s = **17:11:36**. It belongs to the path that starts from rest at the horizon and then free-falls. A faller from far away can get nearer to it with one short burn and then nothing; any thrust after that, in any direction, shortens the time (Lewis and Kwan 2007, "No Way Back").
- Home, as seen. Light falling in radially after the ship: along the rain worldline, d(v)/d(tau) = 1/(1 + beta), beta = sqrt(2M/r). At the horizon that is 1/2 (home's clock is seen at half speed, redshifted), and it goes to 0 at the end. Total home time ever seen between horizon and end: 4M (1/3 - 1/2 + 1 - ln 2) = 0.5607 M = 11,047 s = **03:04:07**. With x = sqrt(r/2M) = (tau_left / (4M/3))^(1/3) and F(x) = x^3/3 - x^2/2 + x - ln(1 + x): home seen so far = 4M (F(1) - F(x)). So the seen clock slows toward a fixed reading. This is the truth that replaces the myth: an infaller does not see the outside future run fast. They see a finite stretch, slowing to a halt, because later light cannot catch them.
- The black ahead (shadow), rain observer at r <= 3M. With q = 27 M^2 / r^2: p = (q - 1) / (beta + sqrt(1 - q (1 - beta^2))), and the shadow's half-angle from straight ahead has cosine p / (1 + beta p). At the horizon that is **42 degrees**. It reaches 90 degrees (half the sky) only at the very end. So the dark ahead covers less than half the sky for the whole fall.
- Colour of the sky. A photon from far away with energy 1 is measured at omega = 1 + beta p_r. Straight astern: omega = 1/(1 + beta): 1/2 at the horizon, fading to nothing. At the shadow's edge at the horizon: omega = 3.875. So the sky is dim and red astern, and crowds into a brightening, blue band round the edge of the dark. (The brief's "compresses and blueshifts in part".)
- Tides. Stretch along the fall 2M/r^3, squeeze across it M/r^3. For a radial plunge r^3 = (9/2) M tau_left^2, so stretch = 4 / (9 tau_left^2) per second squared per metre, whatever the hole's mass: 0.44 m/s^2 per metre with one second left, 44 with a tenth of a second. At the horizon of this hole it is 6.5e-10. Nothing is felt until the last second.
- At the horizon itself: nothing. The equivalence principle says a free faller notices no surface there. (The "firewall" argument, AMPS 2012, says an old hole's horizon might not be smooth. Unresolved. The story assumes smooth, and a comment says so.)
- Looking ahead. Outward-pointing light emitted just inside the horizon hangs near it for a long time before falling, so a later faller does see earlier fallers, as they were just after they crossed, redder and dimmer the earlier they were. The principle is real. (Line X2 below: the brightness is not.)
- Spin. A spinning (Kerr) hole drags space round with it (frame dragging); inside the outer horizon everything co-rotates. It has a second, inner horizon. Between the two, r is still a time. The diagram of that region (Penrose diagram, light at 45 degrees) is a diamond: two lower edges are the outer horizon, two upper edges ("roofs") are the inner horizon. Ordinary infallers have finite advanced time and leave through the roof on the side away from where they came in ("port"). The other roof ("starboard") is the Cauchy horizon proper: v goes to infinity there, and in the exact solution everything that ever falls in afterwards arrives on it at once, infinitely blueshifted. Perturbations make that energy diverge (mass inflation, Poisson and Israel 1990), leaving a weak null singularity. The port roof gets the outgoing stream (light of what fell before) and in a real hole carries a shock (Marolf and Ori 2012).
- Past the inner horizon in the exact Kerr solution: r is a place again; the singularity is a ring, timelike, visible, and avoidable; the future is no longer fixed by the past (the Cauchy horizon is the edge of predictability; strong cosmic censorship is the conjecture that nature never allows this); bound orbits exist there (Dokuchaev 2011, speculative); the disc spanned by the ring is ordinary space and leads to a second sheet, r < 0, with no horizon, where the ring acts as a negative mass and repels; near the ring on that sheet there are closed timelike curves.
- Information. The Bekenstein bound and the holographic principle: the most information a region can hold goes by its surface area, not its volume. No-cloning: quantum information cannot be copied. Complementarity, ER = EPR, islands and the Page curve are current proposals about whether a hole keeps or destroys what falls in; all speculative. The story uses the first two as the reason for the cost and only names the question for the rest.

**The line.** Code comments must mark these as the story's, not physics':

| # | Where | What is real | What is ours |
|---|---|---|---|
| X1 | everywhere | formulas above | the hole's mass; a megaworld beside it; one figure for all three clocks using non-spinning formulas even after the spin is known |
| X2 | bell2 | earlier fallers are seen as they crossed | that anything a million years old could be detected: its light dims by e^(-lag/4M). The lamp finds what no detector could |
| X3 | bell3 | spin, frame dragging, two horizons, the diamond | the spin value; the "to the roof" time (illustrative); that the turning of the sky is easy to see |
| X4 | bell5 | the chart is the Penrose diagram of the region between the horizons; light at 45 degrees; nothing leaves its cone; fighting costs proper time | the constant "river" slope, where the other lines are, the colour bands along the roof, a brightness that varies along the roof |
| X5 | bell6 | **the main line.** Real holes: nothing is known to get past the inner horizon; both roofs are thought to be singular in different ways | that the port roof can be crossed at all |
| X6 | bell4, bell6 | area bound; no-cloning | a ship that writes matter into its skin as light and back; the bound applied to "records" |
| X7 | bell7 | nothing | attention with every band making a thing solid (Entry Zero's rule, kept) |
| X8 | bell7, bell8 | exact Kerr inside: a visible ring, orbits, no predictability | that any of it survives in a real hole; lights actually coming out of the ring |
| X9 | bell9, bell10 | exact Kerr: the disc is passable, the far sheet repels, closed timelike curves near the ring | all of it as a place to fly; the out-of-order moment |
| X10 | bell10 | nothing | the far sheet being a distant part of the same universe, with stars, 1,024 ship-years from the megaworld (in exact Kerr it is a separate, empty region) |

Never shown, never said: the outside universe's future running fast. The starboard roof is described only as energy ("everything that falls in after us, landing at once"), and it kills.

A correction to make gently: `world/launch.js` ends with the outside closing to a ring astern and going out. Bell1 opens with the ship's glass having been shut for the crossing; it opens on the true sky. Lux's first line is the correction.

---

## 2. The new ways of playing, seeing and deciding

### N1. The chart (primary; `hz:helm`, again in `hz:keel`)

A held seat. The pilot is hidden; the camera sits behind and above the helm looking down a tilted, luminous diagram about 16 units across with the real sky over its far edge.

What is drawn (one shader plane plus three small dynamic lines):

- The diamond. Vertices in chart units: bottom (0,0), right (1,1), left (-1,1), top (0,2). Up is later. A faint 45-degree grid (light).
- The river: faint flow lines of slope `-HZ_RIVER` (0.30, drifting to port). Where the ship goes with no input.
- The ship: a bright point at (x, t). Behind it, its own line (its past; a pre-allocated polyline, one vertex every 0.004 of t, `drawRange` grown). Ahead of it, the cone: two lines at slope +/-`HZ_SLOPE` (0.8) with a faint fill, everywhere it can still reach, and inside the cone a dotted prediction of where the present lean leads.
- Other things falling: `HZ_STREAMS` (9) bright lines, each `{x0, t0, slope, width, band}` from a seeded table, drawn for their whole length, so their futures are visible. Where the prediction meets one, a mark.
- The ship's old course: one faint dashed line from the entry edge to the port roof at x = -0.45.
- The roofs. Port roof (t = x + 2, x in [-1,0]) drawn in five coloured lengths, from the left corner to the top: infrared, H-alpha, blue-green, ultraviolet, X-ray (the lamp's tints). Starboard roof (t = 2 - x) drawn white and flickering.

Inputs: A / D or the touch stick's x = lean, -1..1, smoothed (`HZ_LEAN_EASE`). Q / E = the hull's band (the lamp's band state, `setBand`; the lamp readout shows it). Nothing else. No throttle: t advances by itself at `HZ_CHART_RATE` (0.0075 per second: about 155 s from entry at (0.42, 0.42) to the roof).

State: `x, t, lean, reserve (1..0), dose (0..1), left (seconds, display)`.

Rules:

- slope = clamp(-HZ_RIVER + lean * HZ_LEAN, -HZ_SLOPE, HZ_SLOPE); x += slope * dt_chart.
- reserve falls by |lean| * `HZ_BURN` per second; at 0, lean is forced to 0 (it only falls).
- The "TO ROOF" clock runs at 1 + `HZ_COST` * lean^2 times its normal rate: leaning visibly eats time. (Display only; it cannot kill.)
- Crossing a stream adds width * `HZ_STREAM_DOSE` to the dose, unless the hull's band is that stream's band, in which case it passes through and costs nothing.
- Within `HZ_GLARE` of the starboard roof the dose climbs fast; reaching it is death.
- Falling straight from the entry reaches the port roof at x = -0.04, in the X-ray length (dose +0.35 even when matched). The old course crosses in the blue-green length. So the play is: lean to port, enough and no more, thread or wear the colour of each line on the way.
- The crossing (bell6) starts `HZ_LETGO_WARN` (10 s) before the roof. For the last `HZ_LETGO` (4 s) the helm must be let go: any lean above 0.05 adds dose at `HZ_LETGO_DOSE` per second. At the roof: hull band equal to that length's band adds 0.10 (0.35 in X-ray); not equal adds 0.60.
- dose >= 1 at any time: death.

Taught without a wall of text: a 22 s scene (S5) that points at four things, each with one subtitle, then two prompts only: `A / D — LEAN` and `Q / E — HULL BAND`. The first stream is placed dead ahead of the river line and in the band the hull starts on, so doing nothing passes through it and shows the rule; the second is in another band. `HANDS OFF` is the only prompt at the roof.

Why it is new: nowhere else in the game is the thing steered a line in time, are obstacles shown with their futures, or is the winning input no input.

### N2. Deciding by letting go

Three times the right thing is to stop pressing: the burn at the count (release at the peak), the roof (hands off), the far side of the ring (let it push). And the one certain death in the chapter is the option that refuses to put anything down.

### N3. Looking someone back (`hz:hull`)

Entry Zero's "it is only there while we look at it", turned on people. Each captain is a standing shape of hull cells in their colours. Holding Z (every band) on one from within `HZ_LOOK_RANGE` and inside the lamp's cone raises their `hold` to 1 in `HZ_LOOK_TIME` seconds; then the cells close and the dressed figure is there. Looking away lets it sink back slowly. The cells of anyone not yet back drain from the feet up on one shared timer (`HZ_FADE`); at zero they spread into the hull for good. The order the player goes to them in is a choice made by walking.

### N4. A decision carried by hand (`hz:hall`)

The cost is chosen by lifting a world off its stand and carrying it to the well, then confirming.

---

## 3. Stage table

Stage ids: `hz_bell1` .. `hz_bell10`, then the engine's `hz_open`. (A ship's bells mark time and say nothing.)

| Stage | Site (hop key) | What advances it | Cinematic for the beat | Decision | Saved |
|---|---|---|---|---|---|
| hz_bell1 | deck (`hz:deck`) | set on first arrival from the launch bridge; ends when the pilot takes the lamp station at the stern rail | S1 "the glass", 55 s | none | stage |
| hz_bell2 | deck | all four sightings logged, then the every-band look ahead | S2 "what went before", 40 s | none | `n1` (bitmask of sightings) |
| hz_bell3 | deck | the count table used; the burn tried; the redraw watched; then the door below | S3a 25 s, the burn (played), S3b 42 s | none | `n4` (what the burn left: seconds, integer) |
| hz_bell4 | hall (`hz:hall`) | a record put down and the helm door taken | S4 30 s on arrival; S4b 14 s after the fall | **D1** | `c1` on decide |
| hz_bell5 | helm (`hz:helm`) | the chart flown to within the warning distance of the port roof | S5 22 s | none | none |
| hz_bell6 | helm | the roof crossed alive | S6 "carried", 30 s, begins at the roof | none (`survive('c1')` here) | `n2` (dose at the roof, 0..100) |
| hz_bell7 | hull (`hz:hull`) | the freighter and every captain either looked back or lost | S7a 12 s on arrival; S7 "the ring", 45 s, when all are resolved | none (captains can be lost here) | `n3` (order looked back, a string of initials); `lose()` |
| hz_bell8 | hull | D2 made and its scene watched; then the hatch | S8 20 s at the corner; S8a 35 s or S8b 25 s | **D2** | `c2` on decide |
| hz_bell9 | keel (`hz:keel`) | a gap in the ring's line passed | S9 20 s | none (`survive('c2')` on passing) | none |
| hz_bell10 | keel | the ending scene ends; `ctx.openSpace()` | S10, 70 s | none | `t` (ship's clock, seconds) |
| hz_open | home base | (engine) | | | |

Every scene is a `createSceneClock` with `stops` at each line group so SKIP steps beat by beat and never passes a decision. Arriving at a site whose scene has already played (stage past it, or the record says so) calls `seek(T)`: end pose, no bars.

Resume map for a game come back to mid-chapter (`resumeKey()`): bell1-3 `hz:deck`; bell4 `hz:hall`; bell5-6 `hz:helm` (the chart starts again from the entry edge); bell7-8 `hz:hull` (captains already resolved stay resolved: see `n3` and `lose`); bell9-10 `hz:keel`.

---

## 4. Decisions, deaths, endings

### D1: what is put down (irreversible; the cost)

- Where: the hall. `chapter.hz.offer('c1', 'hz:hall')` when S4 ends.
- Shown: seven worlds hang on stands round a well: the six of `WORLDS` in their order (0 wyattmattoe, 1 shadowreach, 2 actuality, 3 stevenlacey, 4 saturnia, 5 wavemall prime) and 6, `HOME`. Round the well's lip a ring of hull cells, every one lit: full.
- `E — LOOK` at a stand: the dome (`holoplace`) closes round the pilot for 6 s painted with that world, one line is said, it opens.
- `E — LIFT` at a stand: the globe comes down to a light at the pilot's hand. At the well, a dialogue: prompt `PUT DOWN {NAME}. IT WILL NOT COME BACK.` options `LET IT FALL` (tag `hz:c1:<index>`) and `PUT IT BACK` (`hz:c1:none`, returns it to its stand).
- `LET IT FALL`: `decide('c1', index)`; `set('c1', index)`. S4b: the light drops down the well and is seen through the floor going ahead into the dark. One cell of the ring goes out. The stand is dark for good. The helm door opens.
- The helm door with nothing put down: dialogue, speaker the ship: `THE HULL IS FULL.` prompt `CROSS AS IT IS?` options `KEEP EVERYTHING. CROSS FULL.` (`hz:c1:keep`) and `NOT YET`. `keep` is `decide('c1', 'keep')` and then death DX1.
- Cost: that world's holodeck room is gone in this save. No copy exists (the chapter says why). If it is HOME, the pilot's lost world no longer exists anywhere as a record.
- Kept until: `survive('c1')` at the end of S6, on the far side of the roof. A death in the chart (DX2) restores to before D1, so the world is chosen again. That is by the rule: the decision that led to the crossing is the one returned to.

### D2: the corner (changes the ending)

- Where: the hull, at the corner of round cells. `offer('c2', 'hz:hull')` when S8 ends and the tone has been heard.
- Dialogue: speaker `THE CORNER`; prompt `EVERY BAND, HELD ON THE CORNER, WOULD BRING IT BACK TO ONE PLACE.` options `LOOK IT BACK` (`hz:c2:a`) and `LEAVE IT IN THE LIGHT` (`hz:c2:b`).
- `a`: the player holds Z on the corner for `HZ_WAKE_TIME`; the round cells close into a Tenretni (`buildRobot`), the corner goes dark. S8a. The first pilot comes aboard and stays aboard: it is at the helm rail in every scene after, calls the gaps in the keel, has the last line of the chapter, and is a fourth figure on the home base.
- `b`: the corner brightens. S8b: the helm moves by itself. The ship leans toward each gap in the keel by itself. In the ending the ship turns toward a star before anyone touches it. On the home base the corner stays lit and the ship has a will of its own.
- Neither is free: `a` takes a being that wanted nothing and puts it back in one place, not knowing what is behind it; `b` leaves someone in a wall. The captains disagree about what the tone says, each hearing themselves, and the game never says who was right.
- Kept until: `survive('c2')` on passing the ring's line. A death at the ring (DX3) restores to before D2.

### Captain loss (by play, not by menu): yes

In bell7, a captain not looked back before `HZ_FADE` runs out is spread through the hull: `chapter.hz.lose(id)`. Permanent. Their colours stay as a lit patch on the hull (and on the home base, through `effects()`). It happens before `offer('c2')`, so no checkpoint undoes it. Nobody has to be lost: walking straight to each and holding the lamp steady brings back three with about half the time to spare; each one back shortens the next (`HZ_LOOK_HELP`). What makes it a risk: the lights from the ring drift between the lamp and the figure and take the look for themselves while they are in the beam (`hold` stops rising), so the pilot has to move for a clear line.

This is also what makes the pilot-alone path reachable: Entry Zero can leave one captain; this chapter can lose that one.

### Deaths, and where each puts the player

| # | What kills | Shown as | `die()` returns to |
|---|---|---|---|
| DX1 | `KEEP EVERYTHING. CROSS FULL.` | 12 s scene in the hall: the cells stay full, the roof arrives white through the floor, every stand flares, white | `hz:hall`, before D1, at the well |
| DX2 | dose full in the chart: lines crossed in the wrong band, the starboard roof, hands on the helm at the port roof, wrong band at the roof | 8 s: the hull's cells go white one by one from the bow, white | `hz:hall`, before D1 |
| DX3 | the ship's line touching a solid length of the ring's line | 8 s: the loose lights on the bridge pull out into two long lines along the fall and thin across it (the tide, with one second left), white | `hz:hull`, before D2, at the corner |

All three set `site.portal = 'hz:back'`; `horizon.hop('hz:back')` calls `chapter.hz.die()` and returns the site for the key it gives. No death is possible while no offer is open: the deck and the hull cannot be fallen off (the walker never takes a step off every surface), and the lamp's dose is not lethal there.

A session-only flag (not saved) notes a death so one extra line is said on return (section 11, `AFTER_DEATH`).

### Endings (all arrive in open space aboard the ship)

Two ending scenes by `c2`, each varied by the crew and by `c1`:

- **Ending A** (`c2 = 'a'`): the first pilot stands at the rail with whoever is left. The corner is dark. Last line is its. With no captains: the pilot and the Tenretni, two figures at the rail.
- **Ending B** (`c2 = 'b'`): the corner blazes. The ship turns toward a star by itself. With no captains: the pilot alone at the rail, and the last subtitle says they are not alone aboard.

In both: the world that was put down goes by as one of the lights leaving the ring, in its colours; the HOME SEEN clock is stopped at its last reading; the LEFT clock is blank. Then `ctx.openSpace()`.

---

## 5. Every beat with every crew

Speaking rule: `crewSay(chapter, { by, text, solo }, sec)`. A lost `by` is said by another survivor; with nobody, `solo` is shown or the line is dropped. Two flags of my own, filtered in my code before `crewSay` is called (no engine change): `own: true` (said only by that captain, dropped otherwise) and `needs: [ids]` (said only if all are aboard). `alt` lists are tried in order and the first whose conditions hold is used.

| Beat | All three | Any pair | One | None (a written path) |
|---|---|---|---|---|
| S1 the glass | Lux corrects the sky, Marrow sizes the dark, Vask gives the clocks and the ring of lights | same lines, re-voiced; Lux's "seven hours" only if she is there | same, one voice | five subtitles: what the pilot sees and what the ship reports. The figures at the rail are absent; the camera stays on the sky and the pilot's back |
| bell2 the lamp | a line per sighting | same | same | the log line alone per sighting; the ship gives the stopping time of HOME SEEN |
| S2 | four lines, then Lux's joke | joke only with Lux | three lines | four subtitles; the last is "IT TOOK THE PILOT." and the camera turns to the pilot |
| S3 the count | Lux begs for the burn; Vask counts it; Lux's own line about fighting; Marrow sees the turning | the burn is asked for by whoever is there | same | the ship offers the engines; the result is a subtitle; the redraw is four subtitles |
| S4 the hall | each world's line from the captain it suits; Marrow and Lux speak for their own | a lost captain's own world gets the `alt` line from another | same | each stand gives the world's name and note only; HOME's says it exists nowhere else |
| S5, the chart | Vask teaches, Marrow points out the old line; barks from all | re-voiced | re-voiced | subtitles; the dose is on the lamp readout only |
| S6 carried | the captains go to light one at a time, each with a line | fewer | one | the decks and the freighter go to light; "THE SHIP CAN SHADE ONE SEAT. YOURS." |
| bell7 the hull | freighter, then three figures, one timer; each one back helps | two figures | one figure | the freighter only (it cannot be lost). Then the pilot walks the hull alone to the ring's view. The lights from the ring come closer to a lone figure (`HZ_LIGHTS_NEAR_SOLO`) |
| S7 the ring | common lines, then Vask and Marrow's exchange about the Last Seam, then Lux | the exchange only if both are aboard; otherwise the single-voice version for whichever of them is | their one version | four subtitles |
| S8, D2 | three hearings of the tone | whoever is there | one hearing | "A TONE. IT RISES AND FALLS. IT DOES NOT SAY." The decision is the pilot's alone, about the only other person in there |
| S8a / S8b | a: Vask's "Tenretni stay." b: Marrow, Lux, Vask in turn | re-voiced; Lux's doubt only with Lux | re-voiced | a: the first pilot's lines stand alone. b: two subtitles |
| S9, the keel | a: the first pilot calls gaps; b: the ship leans | same | same | same (the assist does not depend on captains) |
| S10 | as written | re-voiced; the world-colour line goes to the captain whose world it was if aboard | re-voiced | subtitles; ending A or B as above |

What a captain lost **in this chapter** changes: S7 gets the lost lines (`LOST`), D2's scene gets one more line (the ship kept them the same way), S10 gets the line about their colours, their patch stays lit on the hull site and through `effects().marks`, and `n3` lacks their initial. What a captain lost **in Entry Zero** changes: only who speaks; they are not kept anywhere and nothing here refers to them, except that Vask's or Marrow's single-voice Last Seam line is used.

---

## 6. The record (`chapter.hz`)

| Key | Type | Set | Meaning (sealed) | What later chapters could read |
|---|---|---|---|---|
| `c1` | integer 0..6 | D1 | which world was put down (index into `WORLDS`, 6 = `HOME`) | that holodeck room is gone; that world may be found for real, out there, changed |
| `c2` | `'a'` or `'b'` | D2 | the first pilot looked back / left in the hull | a: a Tenretni crew member aboard, the corner dark, the helm is the pilot's. b: the corner lit, the ship sometimes steers itself |
| `n1` | integer bitmask (4 bits) | bell2 | sightings logged with the lamp | codex |
| `n2` | integer 0..100 | bell6 | dose at the roof | how scarred the hull is |
| `n3` | string, up to 3 letters from `m l v` | bell7 | who was looked back, in order | who the pilot went to first |
| `n4` | integer (seconds) | bell3 | what the burn left on the clock | how well the pilot lets go |
| `t` | integer (seconds) | bell10 | the ship's clock at the exit | the crew's age |

Checkpoint keys are `c1` and `c2`. `lose(id)` for captains kept in the hull.

Exported for the home base, so the engine applies it without knowing why: `effects()` from `src/horizon.js` returning `{ rooms: { [worldId]: false }, figures: [{ id, build(), talk() }], marks: [{ id, color }], talk: { [captainId]: lines } }`.

---

## 7. Sites and files

Five sites, six hop keys. All are `capitalWalk` sites entered under the white. Each captures fog, sun and ambient in `onEnter` and restores them in `onLeave` (as `world/launch.js` does), hides the fleet, and calls `chapterHud.clear()` and `hush()` on leaving.

| File | Lines | What |
|---|---|---|
| `src/horizon.js` | 280 | `createHorizon(ctx)`: builds sites lazily, `hop(key)`, `update`, `onReset`, `state`, `resumeKey()`, `effects()`, the `hz:back` handling, the session death flag |
| `world/SEALED-horizon-words.js` | 560 | every word and every data table: scenes, barks, decisions, streams, look lines, after-talk |
| `world/SEALED-horizon-sky.js` | 340 | one sky shader for all sites, and the physics helpers (`shadowAngle(tauLeft)`, `homeSeen(tauLeft)`, `tide(tauLeft)`), with the formulas of section 1 in comments |
| `world/SEALED-horizon-ship.js` | 330 | the bridge shell shared by deck, helm and keel (floor, rail, helm, archive arc: the look of `world/launch.js`, rebuilt, not imported), crew placement for any subset, the ring of loose lights, the cell-figure builder |
| `world/SEALED-horizon-deck.js` | 640 | `hz:deck`: bell1-3 |
| `world/SEALED-horizon-hall.js` | 560 | `hz:hall`: bell4 |
| `world/SEALED-horizon-helm.js` | 820 | `hz:helm`: bell5-6, the chart |
| `world/SEALED-horizon-hull.js` | 760 | `hz:hull`: bell7-8 |
| `world/SEALED-horizon-keel.js` | 520 | `hz:keel`: bell9-10 (imports the chart plane and line helpers from helm) |
| `src/constants.js` | 70 | `HZ_*`, four `CH_TIER` keys |
| total | about 4,880 | |

Sound: `world/entryzero-audio.js` as it is (`setHum`, `bandClick`, `setRadio`, `doseTicks`, `logChime`, `setDread`, `hush`). No new audio file.

### The sky (`SEALED-horizon-sky.js`)

One back-side sphere, radius 3600, following the walker, `fog: false`, `depthWrite: false`. Uniforms: `uTime`, `uMode` (0 falling, 1 the still region, 2 the far side), `uAhead` (direction of the fall), `uShadow` (half-angle), `uEdge` (blue gain at the rim), `uBack` (red and dim astern), `uSwirl` (angle the star belt has turned about the spin axis), `uHome` (direction), `uHomeGlow`, `uRite` (the cages lit), `uPort`, `uStar` (glow of each roof, from the chart position), `uRing` (direction), `uRingR`, `uRingTilt`, `uFar` (0..1, plain stars), `uOpen` (the glass: 0 shut, 1 open).

- Mode 0: stars as in `launch.js` (one to a cell), but their directions are pushed from the whole sky into the part outside the shadow by an eased remap of the angle from `uAhead` (a comment says this is an interpolation between the true edge and the true astern values, not a ray trace); brightness and tint run from `uBack` astern to `uEdge` at the rim; a hard black disc of half-angle `uShadow`; a thin bright rim. Home is a small disc astern with a glint, cage lights when `uRite` > 0. The swirl rotates the star lookup about the spin axis.
- Mode 1: black, an amber sheet low astern (the roof just crossed), and the ring: a thin, exact circle of white light, tilted, about 25 degrees across; inside its disc a round window of ordinary, unbent stars.
- Mode 2: plain stars everywhere, fading in with `uFar`; the ring astern, shrinking.

### `hz:deck` (walked; look `dive`)

The shared bridge: disc floor radius 9, rail, helm, the archive arc astern. Added: the stern lamp station (a console; using it seats the pilot, `held()`, camera over the lamp, mouse aims, Q / E band, L lamp, Z every band); the count table at the centre (a round table whose top is the chart plane at small scale, the shader of the helm with `uKind` 0 non-spinning and 1 spinning and a 0..1 morph between); the door below. The ring of loose lights: `CH_TIER.hzMotes` points on a 1.2-unit circle over the table, drawn as an ellipse from `tide()`.

Lamp targets (bell2), each a small shader patch on the sky sphere answering `LAMP_GLSL`: home (infrared), the belt at the rim (blue-green), the gas falling in after (X-ray, costs dose as usual, not lethal here), and ahead in the dark a source that is only heard (radio) until every band is held on it. `EZ_LOOK_TIME` logs each. HUD: `chapterHud.clocks(ship, homeSeen, 'SHIP', 'HOME SEEN', left, 'LEFT')`.

The burn (bell3): `HOLD SPACE — BURN`. A value b rises while held. LEFT = 26,269 + (61,896 - 26,269) * g(b) with g rising to 1 at b = `HZ_BURN_BEST` and falling after it (g = 1 - ((b - best)/best)^2, clamped at -0.4). Released, or after 20 s, it is fixed and saved as `n4`.

`__debug`: `info()` (stage, scene u, clocks, sightings, burn), `seek(u)`, `jump('lamp' | 'count' | 'door')`, `log(i)`, `burn(b)`.

### `hz:hall` (walked; look `lightship`)

A round hall, radius 16, dark, walls of `HULL_FRAG`-style cells (own small shader; `CH_TIER.hzCells` instanced quads). Seven stands on a circle of radius 10, each a console, each carrying a `createLayerPlanet(1.5, { life: tierLife, seg: 32 })` filled from that world's five layers (`HOME.layers` for the seventh). 42 draws when all are up; on `low` the life layer is left empty (35). One `createPlace(15)` dome, shown for the 6 s of a look. The well: radius 2.2 at the centre, a glass floor round it through which the sky (mode 0) shows, a ring of 28 cell quads on its lip. The helm door at the forward end. The carried world: the planet's group scaled to 0.25 and held 0.9 ahead of the walker at chest height (set each tick from `setWalker`'s position and yaw).

`__debug`: `info()` (looked, lifted, c1, door), `lift(i)`, `drop()`, `seek(u)`, `jump('well' | 'door')`.

### `hz:helm` (held; look `dive`)

The shared bridge with the pilot hidden and the chart: a plane 16 by 16 tilted 38 degrees up toward the camera, one `ShaderMaterial` drawing everything static (diamond, grid, river, roofs in bands, streams from a uniform array of 9 `vec4` + 9 floats, the old course) and three `Line` objects with pre-allocated buffers (own line 512 points, cone 3 points, prediction 16 points) plus a point sprite for the ship. The sky's `uShadow`, `uPort`, `uStar` and `uHomeGlow` follow the chart position, so the window agrees with the diagram. Crew at the rail from the shared builder. At the roof (S6): the captains' rigs are swapped for cell-figures that rise off the deck and run into the archive arc; the floor's own cells light and lift; white.

`__debug`: `info()` (x, t, lean, reserve, dose, band, next stream, roof length ahead), `set(x, t)`, `lean(v)` (holds a lean), `band(i)`, `dose(v)`, `seek(u)`, `auto()` (flies the old course: for the driver).

### `hz:hull` (walked; look `dive`)

The ship's back, outside: a deck 120 long and 36 wide of cells (`CH_TIER.hzCells` instanced boxes, lit by the shared hull shader), low rails of light, the drive rings aft as two tori, the corner of round cells at the forward port end (an `InstancedMesh` of icosahedra, as `world/lightvessel.js` draws it). The sky in mode 1. The pilot is shown (third person works: the suit suits it), carries the lamp by hand as on the first world (`lamp.power` as there; `resetLamp`, `lamp.canAll = true`).

- Lights from the ring: `CH_TIER.hzLights` points, each on a seeded slow path from the ring outward past the hull, each with its own pattern (the fragment shader picks one of eight sprite patterns and a colour from the seed; no two near each other alike).
- The freighter's patch: by the spawn, a hatch-shaped patch of cells; held in every band it closes into the hangar hatch with the freighter's nose showing. No timer. It teaches the hold.
- The captains: one patch each, at fixed spots (Lux 18 aft of the spawn on the starboard side, Vask amidships to port, Marrow by the drive rings), each a cell-figure (`CH_TIER.hzFig` small boxes inside the figure's measured height and width) in their colours, with the dressed rig (`buildCaptain`) hidden inside until `hold` is 1. One back, a captain follows the pilot at a walk, as on the first world.
- The corner: at the far end. Reaching it with everyone resolved starts S8.

`__debug`: `info()` (fade timer, each hold, lost, corner, c2), `restore(id)`, `fade(seconds)`, `seek(u)`, `jump('lux' | 'vask' | 'marrow' | 'corner')`, `wake(v)`.

### `hz:keel` (held; look `dive`)

The shared bridge and the chart plane with `uKind` 2: the still region. The ring's line is vertical at x = -0.75, drawn broken: solid lengths and gaps (gap `HZ_GAP` long every `HZ_GAP_EVERY` of t). The ship's free motion is a slow swing, x = -0.35 + 0.18 sin(`HZ_SWING` t), that never reaches the line; leaning to port reaches it. The cone and prediction show where the present lean meets the line; a gap under the prediction's end lights. Reserve starts at 0.6 and trickles back (`HZ_TRICKLE`), so a miss costs time, never the game. Assist: with `c2 = 'a'` the next reachable gap is lit `HZ_CALL` seconds early and the first pilot says NOW; with `'b'` the lean is nudged toward the gap by `HZ_NUDGE`. Passing a gap: S10, with the sky going to mode 2 through a white rim.

`__debug`: `info()` (x, t, lean, reserve, next gap, through), `set(x, t)`, `lean(v)`, `seek(u)`, `auto()`.

### Tier counts (new `CH_TIER` keys)

| Key | low | medium | high | ultra | Used for |
|---|---|---|---|---|---|
| `hzMotes` | 60 | 120 | 200 | 260 | the ring of loose lights |
| `hzLights` | 120 | 300 | 500 | 700 | lights from the ring |
| `hzCells` | 600 | 1200 | 1800 | 2400 | hull and hall cells |
| `hzFig` | 400 | 900 | 1400 | 1800 | boxes per cell-figure |

Nothing in play depends on a tier: streams, gaps, timers and targets are the same everywhere. No allocation in any tick: every vector, every line buffer and every string that changes once a second (the clocks already do this) is made at build.

---

## 8. The fleets

They are not in open space, in any branch. Inside the story: the three fleets kept station over the megaworld; their companies went into the City of Light and stayed (5.7.4), and a million years on the hulls are part of what the megaworld is. Bell2 shows them one last time without naming them: when the rite lights the cages, a ring of smaller lights lights with them. The ship comes out a thousand years' flight from there (S10 says so with the ship's own 1,024 years, already canon), and a million years after anyone on those ships was alive. So: the `fleet` flag is false for every system the ship can reach after `hz_open`; if the megaworld's own system is ever a destination, its flag is true and its fleet is a monument, not an ally.

---

## 9. Tunables (`HZ_*` in `src/constants.js`)

```
HZ_HOLE_SUNS 4.0e9        HZ_M 19702 (s; derived, kept as a number with the sum in a comment)
HZ_FALL 26269             HZ_MOST 61896            HZ_HOME_STOP 11047
HZ_SPIN 0.6               HZ_TO_ROOF 6720 (s shown after the redraw; illustrative)
HZ_TAU [..]               ship-clock seconds at the start of each bell (ten numbers; the clocks jump between sites)
HZ_S1 55  HZ_S2 40  HZ_S3A 25  HZ_S3B 42  HZ_S4 30  HZ_S4B 14  HZ_S5 22  HZ_S6 30
HZ_S7A 12 HZ_S7 45  HZ_S8 20   HZ_S8A 35  HZ_S8B 25 HZ_S9 20   HZ_S10 70 HZ_DEATH 8  HZ_DEATH_FULL 12
HZ_BURN_BEST 3.2 (s of burn that gives the most)     HZ_BURN_WAIT 20
HZ_RIVER 0.30   HZ_SLOPE 0.80   HZ_LEAN 0.62   HZ_LEAN_EASE 4.0   HZ_CHART_RATE 0.0075
HZ_ENTRY [0.42, 0.42]   HZ_OLD_X -0.45   HZ_STREAMS 9   HZ_STREAM_DOSE 0.9   HZ_BURN 0.011   HZ_COST 3.0
HZ_GLARE 0.12   HZ_GLARE_DOSE 0.5 (per s)   HZ_LETGO_WARN 10   HZ_LETGO 4   HZ_LETGO_DOSE 0.12
HZ_ROOF_MATCH 0.10   HZ_ROOF_XRAY 0.35   HZ_ROOF_MISS 0.60
HZ_LOOK_RANGE 14   HZ_LOOK_TIME 9   HZ_LOOK_HELP 2 (s less per captain already back)   HZ_LOOK_SINK 0.08 (per s)
HZ_FADE 120   HZ_FADE_GRACE 20   HZ_LIGHTS_NEAR_SOLO 0.5   HZ_WAKE_TIME 8
HZ_GAP 0.05   HZ_GAP_EVERY 0.22   HZ_SWING 9.0   HZ_TRICKLE 0.02   HZ_CALL 3   HZ_NUDGE 0.35
HZ_LOOK_SEC 6 (a world's dome)   HZ_SHIP_YEARS = EZ_SHIP_YEARS (read, not copied)
```

Placement of the nine streams and the gap phase are tables in the words file (`CHART`), seeded and fixed.

`__debug.hz`: `go(stage)`, `hop(key)`, `state()`, `site()` (the current site's `info()`), `seek(u)`, `skip()`, `crew(ids)` (dev: overwrite who is aboard, for the subset tests), plus the per-site handles above. Decisions are picked through the existing `cineDebug().pick(i)`.

---

## 10. Verification (headless driver, medium tier, waits on state)

Seed `fgsf.tenretni` with `ch.stage = 'ez_beyond'` and `ch.ez.lost` as needed. For each row, also run with `lost: ['lux','vask']`-style seeds for one pair, one single, and `__debug.hz.crew([])` for none.

| Stage | Reach it | Proof |
|---|---|---|
| entry | hop to the launch bridge, use its console | `horizon.state().site === 'deck'`, `chapter.stage() === 'hz_bell1'`, `chapterHud.state().cine` true |
| hz_bell1 | `skip()` until S1 is over | `info().u >= HZ_S1`, clocks shown, `info().shadow` within 1 degree of 42 at tau 0 (unit check of `shadowAngle`), `homeSeen(0)` within 1 s of 11,047 |
| hz_bell2 | `jump('lamp')`, `log(0..3)`, hold every band | `hz.get('n1') === 15`; S2 plays; the stage stays `hz_bell2` until S2 ends and is `hz_bell3` after |
| hz_bell3 | `jump('count')`, `burn(3.2)`, `skip()` | `hz.get('n4')` within 60 of 61,896; `burn(9)` gives less than 26,269; `info().kind === 1` after S3b |
| hz_bell4 | `hop('hz:hall')`, `lift(4)`, `jump('well')`, pick 0 | `hz.get('c1') === 4`, stand 4 dark, `info().door` true. Separately: door with nothing lifted, pick 0: white, then site `hall`, `hz.get('c1')` undefined, stage `hz_bell4` |
| hz_bell5 | take the door; `auto()` | `info().dose < 1`, stage `hz_bell6` when t is within the warning |
| hz_bell6 | `auto()` continues with no lean | site `hull`, stage `hz_bell7`, `hz.get('n2')` set, checkpoint `c1` committed. Separately: `set(0.6, 1.2); lean(1)`: white, site `hall`, `c1` unset. Separately: `lean(0.5)` held through the roof: dose rises by more than `HZ_ROOF_MATCH` |
| hz_bell7 | `restore('lux')`, `restore('vask')`, `restore('marrow')` (those aboard) | `hz.get('n3') === 'lvm'`, nobody lost, S7 plays. Separately: `fade(0)` before restoring: `chapter.crew()` shorter, the save round-trips it, reload keeps it |
| hz_bell8 | `jump('corner')`, `skip()`, pick 0, `wake(1)` | `hz.get('c2') === 'a'`, a fourth figure in `info()`. Second run: pick 1: `'b'` |
| hz_bell9 | take the hatch; `auto()` | `info().through` true, checkpoint `c2` committed. Separately: `set(-0.74, t of a solid length); lean(-1)`: white, site `hull`, `c2` unset, lost captains still lost |
| hz_bell10 | `skip()` to the end | `hz.get('t') > 0`, `chapter.stage() === 'hz_open'`, the engine's home base is the site |
| old saves | a 5.7.4 `done` save and an `ez_beyond` save | load to the same state as before this chapter existed; `ch.hz` absent from the save until bell2 |
| words | grep | no `PLACEHOLDER` in any `SEALED-horizon-*` file |
| budget | draw calls and live geometries by the `AUDIT.md` method at each site | hall at most 42 planet draws plus about 10; every other site under 30 |

Not verifiable headless, to be said so: frame rate, the feel of the chart, whether three captains are comfortably saved by a first-time player.

---

## 11. Every word

Format: `[seconds, by, text, solo]`. `by` null is the ship or what is seen, always shown as a plain subtitle. Flags as in section 5. Captains: marrow (sees), lux (fears), vask (counts). The pilot never speaks.

### S1 the glass (stops 0, 22, 38, 55)

```
[3,  lux,    "It didn't go out. Look. It is all still there.",                                   "THE SKY DID NOT GO OUT."]
[10, marrow, "Behind us and beside us. Only ahead is dark, and that is not even half.",          "THE DARK AHEAD COVERS LESS THAN HALF THE SKY."]
[17, vask,   "Old light. It fell in with us. We can see out. Nothing we send goes back.",        "LIGHT STILL FALLS IN. NOTHING GOES BACK OUT."]
[24, vask,   "Three clocks. Ours. Home, as we see it: half speed, and slowing. And what is left.", "THREE CLOCKS. THE SHIP'S. HOME, AS SEEN. TIME LEFT."]
[32, lux,    "Seven hours. You measured the end of everything and it is seven hours.",           null]   own
[40, vask,   "Those lights are loose. Nothing holds them. When that ring stops being round, we have one second.", "A RING OF LOOSE LIGHTS. WHEN IT STRETCHES, ONE SECOND IS LEFT."]
[48, marrow, "No wall. No fire. We crossed, and felt nothing at all.",                           null]
```

### bell2 the lamp

```
prompt   "MOUSE — AIM · Q / E — BAND · L — LAMP"
home     log "HOME. EVERY CAGE IS LIT."
         [marrow, "The rite. They timed it for us. They knew how long their light could still catch us.", null]
         [vask,   "Their clock will never pass three hours four. They do not end there. It is only that nothing later can catch us.", "HOME, AS SEEN, WILL STOP AT 03:04:07. LATER LIGHT CANNOT CATCH THE SHIP."]
belt     log "THE WHOLE SKY, PRESSED INTO A BAND. BLUE AT ITS EDGE."
         [lux,    "It is brighter at the edge. Like it is leaning in to watch.", null]
gas      log "GAS, FALLING IN AFTER THE SHIP. HOT."
         [vask,   "That band costs dose. Do not hold it.", null]
ahead    log "AHEAD, IN THE DARK: SOMETHING ON THE RADIO BAND. VERY OLD."
         [marrow, "Ahead. Listen. The longer the wave, the longer ago it crossed.", "THE LONGER THE WAVE, THE LONGER AGO IT CROSSED."]
         [vask,   "Everything that ever fell in left its last light at the door. It is all still hanging there.", "EVERYTHING THAT EVER FELL IN LEFT ITS LAST LIGHT HERE."]
         [lux,    "So it keeps everything too.", null]   own
         [marrow, "And it was never afraid to.", null]   needs lux, marrow
prompt   "HOLD Z — EVERY BAND"
```

### S2 what went before (stops 0, 16, 32, 40)

```
[2,  lux,    "That is this ship.",                                                    "THE SHAPE AHEAD IS THIS SHIP."]
[9,  vask,   "A million years ago, by home's clock. One Tenretni at the helm.",       "IT CROSSED A MILLION YEARS AGO, WITH ONE TENRETNI ABOARD."]
[17, marrow, "And it came home by itself.",                                           "IT CAME HOME WITH NOBODY ABOARD."]
[25, vask,   "So there is a way out. And it cost a pilot.",                           "THERE IS A WAY OUT. IT TOOK THE PILOT."]
[33, lux,    "Nobody look at the pilot. ...We are all looking at the pilot.",         null]   own
```

### S3a the count (stops 0, 9, 17, 25)

```
[2,  vask, "A chart. Up is later. The slanted lines are light. Nothing leans past them.",          "UP IS LATER. THE SLANTED LINES ARE LIGHT. NOTHING LEANS PAST THEM."]
[10, vask, "The line across the top is the end. It is not a place. It is a time. Every line reaches it.", "THE LINE ACROSS THE TOP IS THE END. IT IS A TIME, NOT A PLACE."]
[18, lux,  "Then burn. Turn us round and burn.",                                                   "THE ENGINES ARE YOURS."]
prompt     "HOLD SPACE — BURN"
nudge (12 s untouched)  [vask, "Try it. I want it seen.", "HOLD SPACE."]
```

After the burn, by result:

```
near the best  [vask, "One burn, and then nothing. Seventeen hours is the most anyone gets. Every push after it takes time away.", "ONE BURN, THEN NOTHING, GIVES THE MOST THERE IS. EVERY PUSH AFTER TAKES TIME AWAY."]
too long       [vask, "Too long. You passed the best of it and burned hours off. The engine is not the way.",                 "TOO LONG. PAST THE BEST, EVERY PUSH TAKES TIME AWAY."]
none           [vask, "You did not touch it. Seven hours, then. You may be ahead of me.",                                      "SEVEN HOURS, UNTOUCHED."]
then           [lux,  "So the harder I fight it, the sooner it comes. I know this one. I have had this one my whole life.", null]   own
```

### S3b the turn (stops 0, 14, 28, 42)

```
[1,  marrow, "The stars are turning. Slowly. All one way.",                                            "THE SKY IS TURNING, ALL ONE WAY."]
[7,  vask,   "The hole spins. It drags everything round with it. Then my chart is wrong.",             "THE HOLE SPINS. THE CHART IS WRONG."]
[15, marrow, "The end stood up. It is not across our way any more. It is beside it.",                  "THE END IS NO LONGER ACROSS THE WAY. IT STANDS TO ONE SIDE."]
[22, vask,   "Two roofs before it. Starboard: everything that will ever fall in after us, landing at once. Nothing crosses that.", "STARBOARD ROOF: ALL THAT FALLS IN AFTER, AT ONCE. NOTHING CROSSES IT."]
[29, vask,   "Port: only what fell before. The ship crossed there. Past it I have no numbers. Nobody has.", "PORT ROOF: ONLY WHAT FELL BEFORE. THE SHIP CROSSED THERE. PAST IT, NOBODY HAS NUMBERS."]
[36, null,   "THE SHIP CAN CARRY WHAT IS ABOARD THROUGH THE PORT ROOF AS LIGHT. ITS HULL IS FULL."]
door prompt  "E — BELOW"
```

### S4 the hall (stops 0, 9, 17, 30)

```
[2,  marrow, "Light goes through light. So it will turn the decks to light, and your freighter, and us, and write us in its skin.", "LIGHT PASSES THROUGH LIGHT. THE SHIP WILL WRITE EVERYTHING ABOARD INTO ITS HULL."]
[10, vask,   "What a hull can hold goes by its skin, not its hold. Every cell has a record in it. The corner it grew is full too.", "A HULL HOLDS WHAT ITS SURFACE CAN. EVERY CELL IS FULL."]
[18, vask,   "One record has to be put down. No copy can be kept. What we put down, falls.",                                       "ONE RECORD MUST BE PUT DOWN. NO COPY CAN BE KEPT. IT WILL FALL."]
[25, lux,    "Seven worlds. And one of them is the pilot's.",                                                                     "SEVEN WORLDS HANG HERE. ONE IS YOURS."]
prompts  "E — LOOK"   "E — LIFT"   "E — PUT IT BACK"
```

Looks (`alt` in order):

```
wyattmattoe     [lux,    "Snow. Lifts. People falling down a hill on purpose. I never understood it and I would miss it.", "WYATTMATTOE. A WHITE SLOPE, AND RIDERS."]
shadowreach     [marrow, "The dream. Nobody lived there. Somebody slept there.",                                          "SHADOWREACH. A VIOLET DUSK. A SLEEPER."]
actuality       [vask,   "Cut grass, and a dragon. Somebody kept this one tidy.",                                         "ACTUALITY. A LONG AFTERNOON."]
stevenlacey     [lux,    "Coins. A whole world of small change. Somebody counted all of that, Vask.",                     "STEVENLACEY. THE COIN."]
saturnia        [marrow, "Mine. The bells are in there. I can sing every one of them without it. I think.", null]  own
          alt   [vask,   "The Cantor's. She is not here to speak for it.",                                                "SATURNIA. THE BELLS."]
wavemall prime  [lux,    "That is Saturday. Every Saturday there ever was. Do not look at me while you decide.", null]  own
          alt   [marrow, "Her floor. She would have made a joke of it, and meant none of the joke.",                      "WAVEMALL PRIME. SATURDAY."]
home            [vask,   "Yours. It exists nowhere but in there. Nobody here will ask it of you.",                        "HOME. IT EXISTS NOWHERE ELSE."]
```

D1 at the well: speaker `THE LIGHT SHIP`, lines `["ONE RECORD'S ROOM. NO COPY."]`, prompt `PUT DOWN {NAME}. IT WILL NOT COME BACK.`, options `LET IT FALL` / `PUT IT BACK`.

S4b the fall (stops 0, 7, 14):

```
[2, marrow, "It is ahead of us now. With everything else that went before.",               "IT FALLS AHEAD, TO JOIN WHAT WENT BEFORE."]
[8] one of, by what fell:
   saturnia        [marrow, "Then I am the only place it is kept. Good. I shall have to keep singing.", null]  own
   wavemall prime  [lux,    "It is fine. It is fine. It was always closing time somewhere.", null]  own
   home            [vask,   "You put down your own. I will count that for the rest of my life.", "YOU PUT DOWN YOUR OWN."]
   any other       [vask,   "One gap in the hull. That is our room.",                           "ONE CELL IS DARK. THERE IS ROOM."]
```

The helm door, nothing put down: speaker `THE LIGHT SHIP`, lines `["THE HULL IS FULL."]`, prompt `CROSS AS IT IS?`, options `KEEP EVERYTHING. CROSS FULL.` / `NOT YET`.

DX1: `[2, null, "EVERY CELL HOLDS A RECORD. NOTHING ABOARD HAS BEEN MADE LIGHT."]` `[7, null, "WHAT IS NOT LIGHT MEETS THE ROOF."]`

`AFTER_DEATH`:

```
DX1  [vask,   "Keep everything. That was the first order they were ever given. Look where it took them.", "KEEP EVERYTHING WAS THE FIRST ORDER. IT ENDS THE SAME WAY EVERY TIME."]
DX2  [marrow, "Again. Lean less. Let it carry us.",                                                     "AGAIN. LEAN LESS."]
DX3  [vask,   "The line is the ring. The gaps are its middle. Wait for one.",                           "WAIT FOR A GAP."]
```

### S5 the helm (stops 0, 7, 14, 22)

```
[1,  vask,   "Our line so far. The cone is everywhere we can still reach.",                                   "THE LINE IS THE SHIP'S PAST. THE CONE IS EVERYWHERE IT CAN STILL REACH."]
[8,  vask,   "The bright lines are other things falling. Here you can see where they will be. Do not let our line touch theirs.", "BRIGHT LINES ARE OTHER THINGS FALLING. DO NOT LET THE SHIP'S LINE TOUCH THEM."]
[15, marrow, "The faint one is the ship's own, from before. It knew where the roof was thin.",                "THE FAINT LINE IS THE SHIP'S OLD COURSE."]
prompts  "A / D — LEAN"   "Q / E — HULL BAND"
```

Barks (each once, except the dose):

```
first line passed in its band   [marrow, "It went through us. We were wearing its colour.",                         "THE HULL WAS IN THAT LINE'S BAND. IT PASSED THROUGH."]
first line hit                  [vask,   "DOSE AT {n} PERCENT. Go round them, or wear their colour.",               "DOSE {n}%. GO ROUND A LINE, OR MATCH ITS BAND."]
hard to starboard               [lux,    "Not that way. I know it is toward home. Not that way.",                   "STARBOARD IS THE FIRE."]
leaning long                    [vask,   "Every lean is time off the clock. Watch it run.",                         "LEANING COSTS TIME."]
reserve at a quarter            [vask,   "Drive is nearly spent. After that we only fall.",                         "DRIVE NEARLY SPENT."]
roof in sight                   [marrow, "The roof changes colour along its length. Wear the colour where we cross.", "MATCH THE HULL TO THE ROOF WHERE THE SHIP WILL CROSS."]
ten seconds                     [vask,   "Ten seconds. Let go of it.",                                              "LET GO OF THE HELM."]
four seconds                    [lux,    "Hands off. Hands OFF. This is the hardest thing I have ever not done.", null]  own
prompt                          "HANDS OFF"
```

### S6 carried (begins at the roof; stops 0, 13, 22, 30)

```
[0,  marrow, "It is starting with the decks.",                                                                    "THE DECKS GO FIRST."]
[6,  lux,    "Will it be me that comes out? Somebody say yes.", null]  own
[9,  vask,   "It will be every cell of you. I will count them.", null]  needs lux, vask
[14, marrow, "Pilot. You stay as you are. It can shade one seat. Somebody has to be awake on the other side.",    "THE SHIP CAN SHADE ONE SEAT. YOURS."]
[21, marrow, "Every band, on each of us. You know how. It is only there while you look at it.",                   "ON THE OTHER SIDE: EVERY BAND, ON EACH THING, UNTIL IT IS THERE."]
[27, null,   "THE ROOF."]
```

### bell7 the hull

```
S7a (stops 0, 12)
[2, null, "THEY ARE IN THE HULL, WHERE THEIR COLOURS ARE."]      (with no captains: "THE FREIGHTER AND THE DECKS ARE IN THE HULL.")
[7, null, "HOLD Z ON EACH. EVERY BAND, UNTIL IT IS THERE."]
prompt   "HOLD Z — EVERY BAND"
freighter back   [null, "THE HANGAR. YOUR FREIGHTER IS IN IT."]
timer starts     [null, "THE CELLS ARE LETTING GO."]
a light in the beam (once)   [null, "A LIGHT FROM THE RING IS IN THE BEAM. IT TAKES THE LOOK. MOVE."]
```

Each one back (all `own`):

```
lux     "Is it me? ...I checked. I am frightened. Oh, good. It is me."
vask    "Five seams on the arm. Two hundred and six in the head. All there. I half hoped it would lose the number. I am glad it did not."
marrow  "I was everywhere in the ship at once. Every order I ever gave, with no before and no after. That is how they see. It is not wisdom. It is only never having to choose."
```

Help, from whoever is back, while others are not (all `own`):

```
lux     "I will hold the lamp steady with you. Go."
vask    "{n} seconds on the others. Move."
marrow  "There, by the drive rings. That one is going fastest."
```

`LOST` (said by any survivor; solo shown if none):

```
[vask,   "{who} is in the hull. All through it. There is no one place left to look.",   "{WHO} IS IN THE HULL NOW. IN EVERY CELL, AND NO ONE PLACE."]
[marrow, "Kept. Not gone. That is not the comfort it sounds like.",                     null]
```

Near the lights from the ring (once each, `own`):

```
marrow  "A choir, with no song before it."
vask    "I have counted them four times. Four answers."
lux     "It looked at me. No, it did not. ...It did."
```

### S7 the ring (stops 0, 16, 31, 45)

```
[2,  lux,    "That ring. That is the end. And it is just... over there.",                                         "THE END IS A RING OF LIGHT, OFF TO ONE SIDE."]
[9,  vask,   "It is a place again. We can go round it. And the clock... I have nothing to count down from.",     "THE COUNT HAS STOPPED. NOTHING HERE HAS TO END."]
[17, marrow, "Things are coming out of it. Nothing sent them. There is nothing behind them at all.",              "LIGHTS COME OUT OF THE RING. NOTHING CAUSED THEM."]
[24, vask,   "In here, nothing that happened before decides what happens next. The numbers said so. I did not believe them.", "PAST THE ROOF, WHAT CAME BEFORE NO LONGER DECIDES WHAT COMES NEXT."]
[32] one of:
   needs vask, marrow   [vask,   "Then in here the Last Seam decides nothing. I owe it no answer, and you owe me none."]
                        [37, marrow, "I will owe it anyway. I am taking it out with me."]
                        [42, vask,   "...Good."]
   own vask             [vask,   "Then in here I owe my brother nothing. I find I want to owe it. I am taking it out with me."]
   own marrow           [marrow, "Then in here I never gave the order. No. I gave it. I am taking it out with me."]
   own lux              [lux,    "Then in here I was never frightened. ...No. I was. I would like to keep that. It was mine."]
[40 or 44, lux, "Every one of them is different. I planned to be scared of them. I am only looking.", null]  own, only when the pair exchange or another captain's line took 32
```

### S8 the corner (stops 0, 7, 13, 20)

```
[2,  marrow, "The round cells. The corner it grew while it was away.",                                           "THE CORNER OF ROUND CELLS."]
[8,  vask,   "It had room, then. It wrote its pilot there, and came out here with nobody awake to look.",        "THE SHIP HAD ROOM, THEN. IT WROTE ITS PILOT HERE. NOBODY WAS AWAKE TO LOOK."]
[14, lux,    "It has been in the wall. The whole time. We walked past it.",                                      "THE FIRST PILOT IS STILL IN THE HULL."]
if a captain was lost here   [17, vask, "It kept {who} the same way. But {who} is in all of it. This one it wrote in one place.", "THE SHIP KEPT {WHO} THE SAME WAY. THIS ONE IT WROTE IN ONE PLACE."]
prompt   "RADIO BAND — LISTEN"
the tone (each own)   marrow "It says: leave me."   lux "It says: help."   vask "It is a tone. It says nothing. You are both hearing yourselves."
                      solo [null, "A TONE. IT RISES AND FALLS. IT DOES NOT SAY."]
```

D2: speaker `THE CORNER`, lines `["A TONE."]`, prompt `EVERY BAND, HELD ON THE CORNER, WOULD BRING IT BACK TO ONE PLACE.`, options `LOOK IT BACK` / `LEAVE IT IN THE LIGHT`. After `a`: prompt `HOLD Z — EVERY BAND`.

S8a looked back (stops 0, 8, 17, 25, 35). The first pilot speaks as `THE FIRST PILOT` (species Tenretni), always shown:

```
[3,  first, "You looked."]
[9,  first, "I was in every cell. I saw the whole ship at once, and wanted nothing. It is what we were built to be. I had only just stopped."]
[18, first, "Now I am in one place, and I do not know what is behind me. It is terrible. Thank you."]
[26, first, "The way out is through the ring, not round it. I will call the gaps."]
[31, vask,  "Tenretni stay. Everybody says so.", null]
[33, first, "I am the one that went."]   (said only if the line before it was)
```

S8b left (stops 0, 9, 15, 25):

```
[3,  marrow, "Then it stays whole. Everywhere at once, and wanting nothing.",                  "THE CORNER STAYS LIT."]
[10, lux,    "Or it stays stuck. We will never know which we did.", null]  own
[16, vask,   "The helm moved. Nobody touched it.",                                             "THE SHIP IS TURNING TOWARD THE RING. NOBODY TOUCHED THE HELM."]
[21, marrow, "It goes where its pilot imagines. It still has one.",                            "IT GOES WHERE ITS PILOT IMAGINES. IT STILL HAS ONE."]
hatch prompt  "E — THE HELM"
```

### S9 the keel (stops 0, 9, 20)

```
[2,  vask (c2 a: first), "The broken line is the ring. The gaps are its middle. Go through a gap. Do not touch the line.", "THE BROKEN LINE IS THE RING. PASS THROUGH A GAP. DO NOT TOUCH THE LINE."]
[10, lux,  "And if we touch it?", null]  own
[13, vask, "The lights stop being round. One second.", null]  needs lux, vask
prompt  "A / D — LEAN"
gap (c2 a)   [first, "NOW."]
gap (c2 b)   [null,  "THE SHIP LEANS."]   (once)
miss         [vask,  "Missed. Round again. Drive at {n}.", "MISSED. ROUND AGAIN."]
```

DX3: `[1, null, "THE RING OF LIGHTS IS NOT ROUND."]`

### S10 the far side (stops 0, 12, 30, 50, 70)

The first twelve seconds are out of order on purpose: the line at 4 is shown before the white rim at 6 that it describes, and the line at 1 asks about it first.

```
[1,  lux,    "Did I already say this?",                                                 "FOR A MOMENT, THINGS HAPPEN BEFORE WHAT CAUSES THEM."]
[4,  lux,    "We are through.",                                                         "THROUGH."]
(6: the ship passes the middle of the ring)
[8,  vask,   "Effect, and then cause. Do not get used to it.",                          null]
[14, marrow, "It is pushing us. The same ring. From this side, it pushes.",             "FROM THIS SIDE THE RING PUSHES AWAY."]
[20, lux,    "Let it. Nobody touch anything.",                                          "LET GO OF THE HELM."]
[28] the world put down goes by, one of:
   saturnia, marrow aboard        [marrow, "...I can hear it."]
   wavemall prime, lux aboard     [lux,    "That is Saturday. That is Saturday, going past. Hello!"]
   home                           [vask,   "Pilot. Yours got out before we did.",                 "ONE OF THE LIGHTS HAS THE COLOURS OF HOME. IT GOT OUT FIRST."]
   any other                      [marrow, "That one, among the others. Those are {NAME}'s colours.", "ONE OF THE LIGHTS HAS {NAME}'S COLOURS."]
[38, vask,   "Stars. Plain ones. Nothing bent.",                                        "PLAIN STARS. NOTHING BENT."]
[44, vask,   "The ship was gone one thousand and twenty-four years, by its own clock. That is how far home is from here. It is out there. So is everything else.", "THE SHIP ONCE TOOK 1,024 YEARS TO FLY HOME FROM HERE. HOME IS OUT THERE. SO IS EVERYTHING ELSE."]
[52, lux,    "The clock that says how long we have left. It is blank.",                 "TIME LEFT: UNKNOWN."]
[57, marrow, "It was always blank. We only had a number for one afternoon.",            "AS IT ALWAYS WAS."]
[60] if a captain was lost here   [marrow, "{who}'s colours are still in the hull. {who} is coming too.", "{WHO}'S COLOURS ARE STILL IN THE HULL."]
[64] ending A   [first, "I have never been anywhere I had not already kept. Show me."]
     ending B   [vask,   "It has picked a star.",                                       "THE SHIP HAS CHOSEN A STAR."]
                [67, marrow, "Then let us go and see what it imagined.",                "YOU ARE NOT ALONE ABOARD."]
```

Clock labels: `SHIP`, `HOME SEEN`, `LEFT`; after S3b `LEFT` becomes `TO ROOF`; from S7 on the third clock is drawn as `LEFT      --:--:--`.

### Afterwards, on the home base (`effects().talk`, and the first pilot's)

```
vask     "No count. I keep reaching for one."   "I owe a debt I chose to bring. It is lighter than the one I was handed."
         if c1 was home: "You put down your own world. I have not forgotten whose turn it is."
marrow   "It is quiet, and nothing is ahead of us but what we pick."   "I am still singing the bells. I have lost none yet."  (the second only if c1 was saturnia; otherwise: "Listen. Plain stars make no sound at all. I like it.")
lux      "I checked again. Still me. Still a bit scared. It is nice to have a spare."   if c1 was wavemall prime: "Saturday is out there somewhere, for real this time. I want to go shopping."  otherwise: "Where to? I do not mind. I mean it. Listen to me, not minding."
first    "One place at a time. I am practising."   "Pick somewhere I have not kept. That is anywhere."
ship (c2 b, shown at the helm console)   "THE HELM IS WARM. NOBODY HAS BEEN STANDING AT IT."
```

Codex entries (subject, added at): `Inside` (S1), `The Last Light` (bell2), `The Roofs` (S3b), `What Was Put Down` (D1), `The Chart` (bell6), `Looked Back` (S7), `The First Pilot` (D2), `The Far Side` (S10). One paragraph each, written in the words file from sections 1 and 4 in the game's plain voice.

---

## 12. Build order for phase 2

1. Constants, the words file, `src/horizon.js` with empty sites, the record keys, `__debug.hz`. Old-save check.
2. Sky and physics helpers, with the unit checks of section 10. The shared ship shell.
3. Deck (bell1-3).
4. Hall (bell4, D1, DX1).
5. Helm (bell5-6, DX2).
6. Hull (bell7-8, D2, captain loss).
7. Keel (bell9-10, DX3, both endings), `effects()`.
8. The subset pass: every scene with three, each pair, each single, none. The grep for `PLACEHOLDER`. GDD section in structure only (stage ids, keys, file names), with the story left sealed.

## 13. What I need from the engine beyond the contract

- `crewSay` returning the id that spoke (or null), so the right figure's mouth moves and the camera can favour them.
- A resume query: the chapter module names the hop key for a game come back to at an `hz_*` stage.
- An effects query the home base applies without reading it: which holodeck rooms are available, any extra talkable figures to stand on the bridge (builder and lines supplied by the chapter), small lit marks on the hull, extra talk lines per captain.
- `chapter.hz.lose()` must not be undone by a later `die()` when it was called before the offer (as designed here it always is).
- The entry: one console on the launch bridge, shown from `ez_beyond` until `hz_open`, that sets `site.portal = 'hz:deck'`. Its prompt should say only `E — THE HELM`.
- Fleet flag false for every system reachable after `hz_open`.
- No new render preset: `dive` for four sites, `lightship` for one. Far plane 4000 is enough (the sky is a sphere of 3600).
