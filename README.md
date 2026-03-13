NOVA-7
LAST PILOT STANDING
v1.1.0  ·  Single-Player Browser Game  ·  Year 2187

OVERVIEW
NOVA-7 is a single-player, top-down arcade space shooter playable entirely in the browser — no installation, no dependencies, no server required. Open the nova7_v1100.html file and fly.
You are Commander Voss, the last surviving pilot of the Terran Defense Fleet. The asteroid mining corridor in Sector NOVA-7 has gone dark. Forty-two ships, six thousand crew — silenced in under an hour. You are the only one who made it through.
Fight through an escalating gauntlet of asteroid storms, a rogue ally, an enemy rocket, and — at the apex — the GOLIATH DREADNOUGHT. Survive everything, and the coordinates to Elysian-4 unlock: a living green world beyond the reach of war.

QUICK START
›	Open  nova7_v1100.html  in any modern browser (Chrome, Firefox, Edge, Safari)
›	Scroll down to the LAUNCH MISSION button — or scroll straight to the game canvas
›	Click the canvas once to activate audio, then fly
›	No build step, no npm install, no server. The entire game is one self-contained HTML file

Tested on: Chrome 120+, Firefox 121+, Edge 120+, Safari 17+. Requires a browser with HTML5 Canvas and Web Audio API support.

CONTROLS
Keyboard
← / A	Move left
→ / D	Move right
Space  (hold)	Fire cannon (auto-fire while held)
F  (hold)	Fire laser cannon — unlocked after ECHO-1 is terminated; charges per asteroid kill
Touch / Mobile
›	Drag finger anywhere on the canvas to reposition your ship
›	Ship fires automatically while touch is active

THREAT ESCALATION
Events trigger automatically at score milestones. You cannot skip them.

SCORE	EVENT	DESCRIPTION
0	ASTEROID STORM	Blue plasma-rocks fall continuously. One shot, one kill. 100 pts each.
1,000	NICE SHOOTING	Fleet Command acknowledges. Asteroids continue.
2,000	ASTEROID SURGE	Spawn rate doubles until 3,000 pts. Survive the flood.
3,000	HARDENED CORE	Asteroids require two hits to destroy. Patience required.
4,000	SPACE WARP EVENT	Reality bends. Cannon becomes double-damage Chrome mode.
5,000	ABANDONED VESSEL	Shoot the blinking derelict for a +1 energy shield hit.
6,000	ECHO-1 ARRIVES	Ally joins the fight. Shoots asteroids and the enemy rocket for you.
7,000	ABANDONED VESSEL II	Blinking derelict carries a +2 shield. Don't miss it.
8,000	ENEMY ROCKET	Hostile bogey in upper-right. 10 HP. Reward: 3-hit shield + 500 pts.
9,000	WAY TO GO	Fleet Command checks in. Nothing changes — yet.
10,000	THE BETRAYAL	ECHO-1 turns and opens fire. Destroy her to unlock the laser cannon.
11,000	ABANDONED VESSEL III	4-hit shield. Last resupply before the final boss.
12,000	GOLIATH DREADNOUGHT	Final boss. 250 HP. Dual cannons. Laser blasts deal 10 HP each.
VICTORY	ELYSIAN-4	Destroy GOLIATH. Coordinates to a living green world unlock.

SCORING
+100 pts	Destroy an asteroid
+50 pts	Destroy an orbital satellite (enemy homeworld phase)
+300 pts	Destroy a drone / terminate ECHO-1 (the turned ally)
+500 pts	Destroy the enemy rocket bogey (also grants 3-hit shield)
+2,000 pts	Destroy GOLIATH Dreadnought (final boss)

MECHANICS
Energy Shield
Shoot abandoned vessels to salvage shield charges. Each charge absorbs one hit — asteroid, boss cannon, or enemy bullet. Max 6 charges. The shield does not regenerate.
Chrome Cannon (Space Warp)
At 4,000 pts a warp event fires. After a brief hyperdrive sequence, your cannon permanently upgrades to double-damage output. All bullet damage doubles for the rest of the run.
Laser Cannon
Unlocked by terminating ECHO-1 after her betrayal. Hold F to fire. The beam deals 10 HP per second against the Goliath boss. Charge is built by killing asteroids (one kill = one second of charge). Laser charge drains while firing.
ECHO-1 (Ally / Traitor)
Appears at 6,000 pts and autonomously shoots asteroids and the enemy rocket. At 10,000 pts her transponder is compromised: she climbs, reverses, and opens fire. She is now your most dangerous enemy.
Reward for terminating her: +300 pts and the laser cannon unlock.
Goliath Dreadnought
Enters at 12,000 pts. The steampunk-class circular dreadnought has 250 HP and fires dual cannon blasts from side-mounted barrels. Standard shots deal 1 HP. Chrome shots deal 2 HP. Laser beam deals 10 HP per hit. Boss fires two aimed projectile streams.
Defeating GOLIATH triggers the victory cinematic and unlocks Elysian-4 coordinates.

CHANGELOG
v1.1.0  (Current)
›	GOLIATH DREADNOUGHT — complete visual redesign. Circular steampunk hull with radial gold gradient shading
›	Twin animated engine eyes with pulsing glow in the dark inner cockpit circle
›	Side-mounted cannon wings with barrel extensions on both flanks
›	Dual exhaust stacks on top with animated smoke particles and center antenna
›	Triple bottom thruster pods with live orange glow animation
›	Navigation targeting reticle / diamond cross in upper cockpit area
›	Dashed rivet ring around outer hull perimeter
›	HP bar scaled wider to match new hull proportions
›	Version string updated to v1.1.0 in both title screen and in-game HUD

v1.0.92
›	GOLIATH: original wedge-shaped red/orange hull with two side cannons and triple eye design
›	Space warp double-damage cannon event
›	Boarding sequence — pilot enters Magnathora, plants explosive, escapes
›	Enemy homeworld phase — destroy satellites, enter gateway
›	Final sacrifice cinematic (Commander Voss)
›	Full audio: procedural SFX via Web Audio API

FILE STRUCTURE
nova7_v1100.html  —  the entire game. HTML + CSS + JS in a single self-contained file.
No external assets. No network requests. No dependencies. Drop the file anywhere and open it.

Internal sections (by HTML comment block):
›	STYLES  — CSS variables, animations, layout
›	HERO  — landing page title card and CTA button
›	LORE  — mission briefing narrative
›	INTEL  — threat escalation dossier cards
›	GAME  — canvas element and all game JavaScript (~2,600 lines)

Key functions:
›	gameLoop()  — master tick: update + draw, runs at 60 fps via requestAnimationFrame
›	drawBoss()  — renders GOLIATH Dreadnought on the canvas (updated in v1.1.0)
›	checkMilestones()  — fires all score-triggered events
›	spawnVessel()  — spawns abandoned derelict vessels with shield pickups
›	explodeBoss()  — triggers boss death particle cascade and victory scene

TECHNICAL NOTES
›	Renderer:  HTML5 Canvas 2D API — no WebGL
›	Audio:  Web Audio API — procedurally generated SFX, no audio files
›	Frame rate:  requestAnimationFrame, targets 60 fps
›	Viewport:  fixed 320×480 px canvas, centered and scaled via CSS
›	No external requests:  fully offline-capable; works from file:// protocol
›	Mobile:  touch input supported via touchstart / touchmove / touchend
›	Audio unlock:  AudioContext resumed on first user interaction (browser policy)

CREDITS
Game & Code:  Original author
GOLIATH v1.1.0 Design:  Steampunk dreadnought redesign

Setting: Year 2187  ·  Deep Space Quadrant NOVA-7
Commander: Voss — last pilot of the Terran Defense Fleet
Destination: Elysian-4 — a living green world beyond the reach of war
