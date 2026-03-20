# NOVA-7 Endless Void `v2.0.0`

> **Free browser asteroid shooter. No download. No account. No mercy.**

A single-file HTML5 arcade game where you pilot a lone fighter through infinite procedural sectors, face 12 named boss dreadnoughts, and build a ship loadout from 9 upgrades — one run at a time. The difficulty never plateaus. The void never ends.

**[▶ Play Now — https://nov7game.org)**

---

## Contents

- [Quickstart](#quickstart)
- [How to Play](#how-to-play)
- [Milestone Timeline](#milestone-timeline)
- [The 12 Bosses](#the-12-bosses)
- [9 Ship Upgrades](#9-ship-upgrades)
- [8 Sector Environments](#8-sector-environments)
- [Scoring & Combos](#scoring--combos)
- [Shield Economy](#shield-economy)
- [ECHO-1 Wingmate](#echo-1-wingmate)
- [Transwarp Drive](#transwarp-drive)
- [Leaderboard](#leaderboard)
- [Deployment](#deployment)
- [Technical Reference](#technical-reference)
- [Changelog](#changelog)

---

## Quickstart

```bash
# No build step. No dependencies. Just open the file.
open nova7_v2_0_0.html
```

Or drop `nova7_v2_0_0.html` on any static host — GitHub Pages, Netlify, Vercel, S3. Done.

---

## How to Play

### Controls

| Input | Action |
|-------|--------|
| `←` `→` `↑` `↓` or `WASD` | Move ship |
| `Space` | Fire |
| `R` | Quick restart (from death screen) |
| `1` / `2` or `←` / `→` | Select upgrade (upgrade menu) |
| `Space` / `Enter` | Confirm upgrade |
| Touch drag | Move (mobile) |
| Tap | Fire (mobile) |
| TRANSWARP button | Activate Transwarp Drive (mobile) |
| Fullscreen button | Enter/exit fullscreen |

### Objective

Survive. Kill the boss at 10,000 pts. Warp to the next sector. Repeat. Your run ends the moment an unshielded asteroid hits your hull — so every shield, every upgrade, and every combo chain matters.

---

## Milestone Timeline

Every sector resets the score clock to zero and runs the same sequence of events, escalating harder each time.

| Score | Event |
|-------|-------|
| **0** | Asteroid storm begins. 100 pts per kill. |
| **2,000** | **Density Surge** — asteroid count temporarily doubles. |
| **3,000** | **Hardened Cores** (sector 3+) — asteroids now require 2 hits. |
| **4,000** | **Space Warp** — cannon doubles in damage. Chrome Power activates after warp resolves (double damage, permanent for the sector). |
| **5,000** | **Derelict Vessel I** drifts past — shoot it for +1 shield hit. |
| **6,000** | **ECHO-1 arrives** — AI wingmate, 50 HP, auto-targets asteroids. |
| **7,000** | **Derelict Vessel II** — shoot for +2 shield hits. |
| **8,000** | **Enemy Rocket** spawns — 10 HP, targets ECHO-1. Destroy it: +3 shields + **Laser Cannons unlocked** (50 dmg/hit). |
| **9,000** | **Derelict Vessel III** — shoot for +4 shield hits. |
| **10,000** | **Sector Boss drops in.** Kill it to warp. |

> Miss a derelict, skip the rocket — and you enter the boss fight naked.

---

## The 12 Bosses

Bosses cycle in order across sectors. From sector 13 onward they repeat with an `MK-N` suffix (e.g. `GOLIATH MK-13`). Each boss enters **Phase 2 at 50% HP** — faster, angrier, more attack patterns.

| # | Name | Archetype | Color |
|---|------|-----------|-------|
| 1 | **GOLIATH** | Dreadnought | 🟠 Orange |
| 2 | **XERATH** | Hive Mind | 🟢 Green |
| 3 | **VOIDMAW** | Crystal Golem | 🟣 Purple |
| 4 | **CORRUPTUS** | Plague Carrier | 🔴 Red |
| 5 | **SPECTERION** | Phantom Leviathan | 🔵 Cyan |
| 6 | **IRONCLAD** | Iron Behemoth | 🟡 Gold |
| 7 | **GAZER-PRIME** | Void Eye | 🟣 Magenta |
| 8 | **QUEEN VESPA** | Swarm Queen | 🟢 Teal |
| 9 | **MYCOTHRIX** | Fungal Titan | 🟠 Orange (cycle) |
| 10 | **PRISMACH** | Prism Overlord | 🟢 Green (cycle) |
| 11 | **REAPER-IX** | Necro Warship | 🟣 Purple (cycle) |
| 12 | **CHRONOVORE** | Chrono Beast | 🔴 Red (cycle) |

### HP Formula

```
HP = round((80 + sector × 20) × 1.3^(sector − 1))
```

GOLIATH (sector 1) is fixed at **500 HP** as the introductory exception.

### Attack Patterns

Bosses draw from 8 patterns, gaining one additional pattern every 2 sectors (max 4 simultaneous in deep sectors):

- `dual_spread` — two angled bullet fans
- `triple_burst` — three-shot burst
- `spiral` — rotating volley
- `aimed_volley` — targeted shots at your position
- `fan_shot` — wide spread
- `random_burst` — scatter fire
- `tracking` — homing projectiles
- `mine_drop` — stationary mines seeded across the field

### Movement Styles

Cycle every 5 sectors: `sine_h` → `zigzag` → `circle` → `dive_bomb` → `figure8`

---

## 9 Ship Upgrades

After each boss kill, pick one of two randomly offered upgrades. Stackable upgrades can be taken up to 3 times across separate sectors.

| Upgrade | Effect | Stackable |
|---------|--------|-----------|
| ⚡ **RAPID FIRE** | Fire rate +25% | Yes ×3 |
| 💥 **ARMOR PIERCE** | Bullet damage +50% | Yes ×3 |
| 🚀 **AFTERBURNER** | Ship speed +20% | Yes ×3 |
| 🔱 **TRIPLE CANNON** | Fire 3 bullets simultaneously | One-time |
| 🎯 **HOMING ROUNDS** | Bullets auto-track enemies | One-time |
| 🛡 **SHIELD REGEN** | Shields regenerate slowly over time | One-time |
| ↩ **REAR TURRET** | Auto-fires backward continuously | One-time |
| ☄ **BURST MODE** | Each shot fires a 3-bullet burst | One-time |
| ◈ **SHIELD BOOST** | +3 shield hits immediately | Always available |

**Upgrade menu triggers** (score thresholds):
`6k · 18k · 30k · 42k · 54k · 66k · 78k · 90k · 102k · 114k`

> **Laser Cannons** (50 dmg/hit) are a special unlock — destroy the enemy rocket at 8,000 pts.

---

## 8 Sector Environments

Sectors cycle through 8 themed environments. Each has a unique color palette, nebula tint, and hazard layer.

| Mod-8 | Name | Hazard |
|-------|------|--------|
| 1 | **VOID SECTOR** | — |
| 2 | **CRIMSON NEBULA** | Pulsar fields deal area damage |
| 3 | **GREEN RIFT** | Stationary explosive mines |
| 4 | **CRYSTAL EXPANSE** | Gravity anomalies warp bullet trajectories |
| 5 | **IRON GRAVEYARD** | Tumbling derelict hulks cross the field |
| 6 | **VOID PLAGUE** | Organic spore clouds (chain-detonate them) |
| 7 | **PHANTOM RIFT** | Invisible threats materialize mid-dodge |
| 8 | **STORM SECTOR** | Intensified asteroid storm |

### Difficulty Scaling

```
Asteroid speed  = 0.7 + min(sector × 0.15, 2.5) × 0.25
Asteroid radius = 7 + sector × 0.8 px
Spawn interval  = max(16, 60 − sector × 3) frames
Enemy bullet speed = 2.2 + min(sector × 0.15, 2.5) × 0.3
Hardened cores  = active from sector 3+
Double spawns   = active from sector 5+ (every 3rd sector)
```

---

## Scoring & Combos

- **Base score:** 100 pts per asteroid destroyed
- **Combo multiplier:** Chain kills without missing

| Chain | Multiplier |
|-------|-----------|
| 3 kills | 2× |
| 6 kills | 3× |
| 10 kills | 4× |
| 20+ kills | 5× |

Missing a shot or taking a hit resets the chain. Building and maintaining a 5× combo is the primary lever for high-score runs.

---

## Shield Economy

One unshielded hit ends the run. Shields are earned — not given.

| Source | Shields |
|--------|---------|
| Derelict Vessel I (5,000 pts) | +1 hit |
| Derelict Vessel II (7,000 pts) | +2 hits |
| Derelict Vessel III (9,000 pts) | +4 hits |
| Enemy Rocket kill (8,000 pts) | +3 hits |
| Shield Boost upgrade | +3 hits |
| Shield Regen upgrade | Slow passive regen |

**Maximum possible shields entering a boss fight (no upgrades):** 10 hits — but only if you hit every derelict and kill the rocket. Miss one and you're already compromised.

---

## ECHO-1 Wingmate

ECHO-1 deploys at 6,000 pts each sector and fights alongside you until she's destroyed or the sector ends.

- **50 HP** — takes damage from enemy bullets and the enemy rocket
- Auto-targets and destroys asteroids on her own
- Covers your flanks; positioned to intercept threats you can't reach
- If destroyed, you finish the sector and face the boss alone
- Respawns fresh at 6,000 pts every new sector — she doesn't carry HP over

> Keeping ECHO-1 alive into the boss fight means the boss is splitting aggression between two targets. Losing her before 8,000 pts often cascades: no rocket kill, no laser unlock, no +3 shields.

---

## Transwarp Drive

Each boss kill charges the **Transwarp Drive** with 1 charge.

- Activating the drive skips **10 sectors** instantly
- Use it to jump from sector 1 → 11, or 5 → 15
- Primarily useful for score-chasing runs where you want to reach high-difficulty sectors with a strong build
- Tap the TRANSWARP button (mobile) or trigger via the on-screen HUD

---

## Leaderboard

Top 5 scores persist for the browser session via `sessionStorage`:

```js
// Storage key
sessionStorage.getItem('nova7_scores')

// Entry format
{ score: Number, sector: Number, kills: Number }
```

The leaderboard displays on the **title screen** (top 3 runs) and the **death screen** (top 5 with the current run highlighted). Scores reset when the tab closes.

---

## Deployment

The entire game is a **single HTML file**. No build step, no bundler, no server-side logic.

```
nova7_v2_0_0.html   ← the whole game
llms.txt            ← AI/LLM context file
README.md           ← this file
```

### Static hosting options

| Host | Deploy |
|------|--------|
| **GitHub Pages** | Push to repo, enable Pages on `/root` or `/docs` |
| **Netlify** | Drag and drop the file into the Netlify dashboard |
| **Vercel** | `vercel --prod` from the project folder |
| **AWS S3** | Upload file, enable static website hosting, set public read |
| **Any web server** | Drop the file in the document root |

> Update the `<link rel="canonical">` and Open Graph `og:url` in the `<head>` to your actual deployed URL before going live.

---

## Technical Reference

| Property | Value |
|----------|-------|
| File | Single `.html` — no dependencies |
| Renderer | HTML5 Canvas 2D (`#game`, `#starfield`) |
| Game canvas | 400 × 600 px |
| Starfield | Separate canvas, 220 animated stars, renders every other frame |
| Loop | `requestAnimationFrame` |
| Fonts | Google Fonts — Orbitron (UI), Share Tech Mono (HUD) |
| Persistence | `sessionStorage` only (scores clear on tab close) |
| Mobile | Full touch: drag-to-move, tap-to-fire, touch buttons |
| Fullscreen | Native Fullscreen API with scaled canvas |
| SEO | JSON-LD `VideoGame` schema, Open Graph, Twitter Card, canonical URL |
| AI context | `llms.txt` at site root |
| Accessibility | `role="application"` + `aria-label` on game canvas |

### Key JS Constants

```js
BOSS_ARCHETYPES  // 12 archetype strings
BOSS_NAMES       // 12 name strings
BOSS_COLOR_SCHEMES // 8 color objects (cycle after 8)
ALL_UPGRADES     // 9 upgrade definitions
UPGRADE_THRESHOLDS // [6000, 18000, ..., 114000]
DOSSIER_HINTS    // 5 unlockable sector intel entries
buildSectorParams(sector) // returns full sector config object
generateBoss(sector)      // returns procedural boss object
```

---

## Changelog

### v2.0.0
- All 12 named bosses confirmed and documented: GOLIATH · XERATH · VOIDMAW · CORRUPTUS · SPECTERION · IRONCLAD · GAZER-PRIME · QUEEN VESPA · MYCOTHRIX · PRISMACH · REAPER-IX · CHRONOVORE
- Transwarp Drive system (10-sector skip per charge)
- Laser Cannons unlock on enemy rocket kill (50 dmg/hit)
- Combo multiplier system (up to 5×)
- Sector Dossier intel (unlocks by reaching prior sector)
- Leaderboard on title screen and death screen (top 5, session)
- Chrome Power / Space Warp rework
- Full SEO head: JSON-LD schema, Open Graph, Twitter Card, canonical
- `llms.txt` AI context file
- Mobile touch controls refined
- Fullscreen API with centered scaled canvas
- Accessibility: `aria-label` and `role` on game canvas and SVGs

---

*The void never ends. How deep can you get?*
