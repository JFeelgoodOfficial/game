// Orbital Art Gallery — walkable-interior layout, shared numbers only.
// Pure data (no THREE, boot-safe): stations.js builds the visible geometry
// from these values and stationWalk.js builds the matching collision + NPC
// placement, so the two can never drift apart.
//
// Every coordinate is STATION-GROUP-LOCAL (the frame of the gallery's
// group). The station only ever spins about +Y and translates on its orbit,
// so local up is permanently world up and all floors are flat planes.
//
// The spine runs along local Z (solid r6 cylinder, top at y 6); the Grand
// Hall tower stands at (0, 50, 150) — tower-local y = groupY - 50, shell
// radius tapering 55 (bottom, groupY -40) to 70 (top, groupY 140).

// Tower center (x/z) and shell radius at a group-local height.
export const TOWER = { x: 0, z: 150 };
export function towerR(gy) {
  return 55 + ((gy + 40) / 180) * 15;
}

// Gallery decks. A (index 0) is the full atrium floor disc; B/C/D are
// annuli (inner radius DECK_INNER_R) hugging the shell.
export const DECKS = [0, 35, 70, 105];
export const DECK_INNER_R = 40; // open atrium void above deck A
export const ATRIUM_FLOOR_R = 57.5; // deck A disc radius (shell there is 58.3)
export const DECK_THICKNESS = 0.8;
export const RAIL_HEIGHT = 1.1; // inner-edge rail: walk-blocked, jump-overable

// Deck notches: the sector cut out of an annulus where its arrival ramp
// rises through the deck plane (deg, [start, end] counter-clockwise; polar
// angle about TOWER, theta = atan2(z - TOWER.z, x - TOWER.x)). The radial
// band matches the ramp exactly (RAMP_R_IN..RAMP_R_OUT) so anything that
// drops through a notch lands on the ramp below; the sector starts where
// ramp headroom under the deck falls below ~4u and ends just past the ramp
// top. Deck A has no notch.
export const DECK_NOTCH = [null, [148, 172], [328, 352], [148, 172]];

// Spiral ramps between decks, radius band RAMP_R_IN..RAMP_R_OUT. Degrees;
// y runs linearly in theta from yA (at th0) to yB (at th1).
export const RAMP_R_IN = 45;
export const RAMP_R_OUT = 52;
export const RAMPS = [
  { th0: 10, th1: 170, yA: 0, yB: 35 }, // A -> B
  { th0: 190, th1: 350, yA: 35, yB: 70 }, // B -> C
  { th0: 10, th1: 170, yA: 70, yB: 105 }, // C -> D
];

// The shell door: where the vestibule corridor pierces the tower wall
// (theta 270deg faces the spine). The radial wall clamp leaves this sector
// open between y 0 and SHELL_DOOR.top.
export const SHELL_DOOR = { thDeg: 270, halfDeg: 6, top: 12 };

// --- spine complex (floors at y 7, atop the r6 spine) ---
// One rectangular makeStructure covers all of it: origin (ROOMS.ox, ROOMS.oz),
// halfExtent wide enough for z 46..114 and x -27..16.
export const ROOMS = {
  ox: 0,
  oz: 80,
  halfExtent: 36,
  floorY: 7,
  ceilY: 11.5,
  berthPad: { x0: -26, x1: -8, z0: 48, z1: 66, topY: 6.6 }, // open EVA pad
  airlock: { x0: -5, x1: 5, z0: 50, z1: 64 }, // west opening to the pad z 54..60
  padDoor: { z0: 54, z1: 60 }, // gap in the airlock's west wall
  aftDoor: { x0: -2.2, x1: 2.2 }, // airlock -> promenade doorway
  promenade: { x0: -3, x1: 3, z0: 64, z1: 92 }, // glazed viewing corridor
  bay: { x0: -7, x1: 7, z0: 72, z1: 82 }, // widened observation bay (west side)
  crew: { x0: 3, x1: 15, z0: 68, z1: 82 }, // maintenance bay (east side)
  crewDoor: { z0: 70, z1: 74 }, // gap in the promenade's east wall
  vestibule: { x0: -3, x1: 3, z0: 92, z1: 112 }, // ramp y 7 -> 0 into the atrium
  sillTop: 8.1, // window parapet top (visual; collision is full-height glass)
  headerY: 10.2, // window header bottom — view band 8.1..10.2, eye at 9
};

// Docking flow anchors.
export const BERTH_LOCAL = { x: -17, y: 9.4, z: 57 }; // parked player ship
export const SPAWN = { x: 0, y: 7, z: 57 }; // disembark point, facing +Z
export const AIRLOCK_POINT = { x: 0, y: 7, z: 57 }; // G — UNDOCK zone center

// Atrium furniture (deck A): circle colliders for player and NPCs alike.
export const DESK = { x: 4, z: 122, r: 1.6, h: 1.1 }; // curator's desk
export const EASELS = [
  { x: -14, z: 160, r: 1.6 },
  { x: 14, z: 160, r: 1.6 },
];

// Central antigravity pad: stand on it (within r) and float straight up the
// atrium shaft (gravity off) to the ceiling; step out onto a catwalk at any
// deck level. Purple glowing disc at the middle of the atrium floor.
export const LIFT = { x: 0, z: 150, r: 4.5, baseY: 0, ceiling: 108 };

// Catwalk bridges from the lift shaft out to each balcony deck's inner edge,
// stacked at one azimuth (a boarding-gantry look). Cleared of the window,
// ramps/notches, and the shell door.
export const CATWALK_DEG = 210;
export const CATWALK_HALF_DEG = 4;
export const CATWALK_R_IN = 5;
export const CATWALK_R_OUT = 41;
export const CATWALKS = [
  { deck: 1, y: 35 },
  { deck: 2, y: 70 },
  { deck: 3, y: 105 },
];

// Full-height window: one tower-wall sector is floor-to-ceiling clear glass
// (opposite the entrance, facing +Z). Art is kept out of it; collision still
// treats it as a solid wall (see-through, not walk-through).
export const WINDOW = { thDeg: 90, halfDeg: 33 };

// Art sizing at foot scale: each piece keeps its ORIGINAL aspect ratio,
// scaled up to fit a per-slot bounding box (~3x the previous uniform
// panels; width capped by the 45-degree hang spacing so neighbors never
// touch). stations.js reads the true image dimensions as each texture
// loads and sizes the mesh to fit. Pieces hang bottom-aligned.
export const ART_MAX_W = 38; // shell panels, decks B/C/D
export const ART_MAX_H = 28.8;
export const ART_MAX_W_A = 34; // deck A wall panels (tighter radius/spacing)
export const ART_BOTTOM = 0.8; // canvas bottom above the deck
export const EASEL_MAX_W = 16; // freestanding atrium pieces
export const EASEL_MAX_H = 13;
export const EASEL_BASE = 1.7; // canvas bottom = pedestal top

const DEG = Math.PI / 180;

// True if a wall angle (deg) falls in the full-height window sector — art
// there would block the view, so those slots are dropped (a wider margin
// than the window itself, since the panels are large now).
function inWindow(deg) {
  let d = Math.abs(((deg - WINDOW.thDeg + 540) % 360) - 180);
  return d < WINDOW.halfDeg + 14;
}

// The exhibit slots, ordered bottom-up so /artgallery images keep their
// alphabetical hang order. Deck A: wall panels + 2 easel pieces; B/C/D:
// 8 shell panels each, staggered per deck and clear of the ramp notches,
// the entrance sector, and the window wall. Cycling fills any gaps.
// Each slot carries its bounding box (maxW/maxH) and the absolute y of the
// canvas BOTTOM (baseY) — stations.js sizes the mesh to the image's real
// aspect within that box. Wall radii are pulled in so a flat panel's edges
// never pierce the curved shell (chord bulge of a 38-wide plane is ~3.5u).
export function artSpots() {
  const spots = [];
  // Deck A wall panels at r 49 (shell there is 58.3), skipping the entrance
  // sector, the R1 ramp foot, and the window wall.
  for (const deg of [67.5, 112.5, 157.5, 202.5, 292.5, 337.5]) {
    if (inWindow(deg)) continue;
    const a = deg * DEG;
    spots.push({
      x: TOWER.x + Math.cos(a) * 49,
      z: TOWER.z + Math.sin(a) * 49,
      rotY: -a - Math.PI / 2, // face the atrium axis
      deck: 0,
      maxW: ART_MAX_W_A,
      maxH: ART_MAX_H,
      baseY: DECKS[0] + ART_BOTTOM,
    });
  }
  // Two easel pieces flanking the lift, facing the entrance (-Z).
  for (const e of EASELS) {
    spots.push({
      x: e.x,
      z: e.z,
      rotY: Math.PI + (e.x < 0 ? -0.25 : 0.25),
      deck: 0,
      maxW: EASEL_MAX_W,
      maxH: EASEL_MAX_H,
      baseY: EASEL_BASE,
    });
  }
  // Decks B/C/D: 8 panels on the shell, angle stagger chosen per deck to
  // clear that deck's notch sector.
  const stagger = [null, 11.25, 7.5, 11.25];
  for (let d = 1; d < DECKS.length; d++) {
    const r = towerR(DECKS[d]) - 5.5;
    for (let i = 0; i < 8; i++) {
      const deg = i * 45 + stagger[d];
      if (inWindow(deg)) continue;
      const a = deg * DEG;
      spots.push({
        x: TOWER.x + Math.cos(a) * r,
        z: TOWER.z + Math.sin(a) * r,
        rotY: -a - Math.PI / 2,
        deck: d,
        maxW: ART_MAX_W,
        maxH: ART_MAX_H,
        baseY: DECKS[d] + ART_BOTTOM,
      });
    }
  }
  return spots;
}
