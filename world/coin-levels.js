// stevenlacey — the two levels, one per face of the coin.
//
// Each level is a grid of tiles, W x H, x to the right and y DOWN, built by a
// handful of rectangle fills rather than typed out as a picture: the numbers
// that matter (how high a step is, how wide a gap) stay visible that way.
//
// The walker (src/coinWalk.js) jumps about 3.6 tiles high and clears a gap of
// about 6 at a run. A dash adds a little over 4. So:
//   - a step of 3 or less, a gap of 4 or less: anyone can cross
//   - a gap of 7 to 9: needs the dash
//
// Tiles: '#' solid, '=' one-way platform (stand on it, jump up through it),
// '~' water (scenery), '^' spikes (the Claws face only), 'D' the dark, a wall
// of it that a Lanternmoth clears.
//
// Positions of things are tile coordinates of the cell they stand IN: y is the
// row just above the ground they stand on.

export const LEVEL_W = 140;
export const LEVEL_H = 36;
export const GROUND = 30; // top row of the main floor

function grid() {
  const t = [];
  for (let y = 0; y < LEVEL_H; y++) t.push(new Array(LEVEL_W).fill(' '));
  const fill = (x0, y0, x1, y1, c = '#') => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) t[y][x] = c;
  };
  return { t, fill };
}

// ---- heads: the Sanctuary -----------------------------------------------------
// Left to right. The rim door and the ship are at the left end; the far right,
// past a chasm only a dash crosses, is the old grove.
function buildHeads() {
  const { t, fill } = grid();
  fill(0, GROUND, LEVEL_W - 1, LEVEL_H - 1);
  fill(0, 0, 0, LEVEL_H - 1);
  fill(LEVEL_W - 1, 0, LEVEL_W - 1, LEVEL_H - 1);

  // the meadow: a low rise and a bough to stand on
  fill(45, 28, 51, 29);
  fill(52, 25, 56, 25, '=');
  // the pond, with three steps up to the moth's perch
  fill(62, GROUND, 75, GROUND + 1, '~');
  fill(63, 27, 65, 27, '=');
  fill(68, 25, 70, 25, '=');
  fill(72, 22, 75, 22, '=');
  // the ember rocks
  fill(81, 28, 85, 29);
  fill(87, 26, 91, 29);
  // the champion's dais
  fill(95, 28, 101, 29);
  fill(96, 27, 100, 27);
  // the chasm: nine wide, no floor
  fill(104, GROUND, 112, LEVEL_H - 1, ' ');
  // the grove: a terrace and a high bough
  fill(120, 28, 126, 29);
  fill(128, 25, 132, 25, '=');

  return {
    name: 'heads',
    tiles: t,
    door: { x: 2, y: GROUND - 1 }, // the rim: through here to the other face
    pad: { x: 16, y: GROUND - 1 }, // where the ship stands
    nest: { x: 26, y: GROUND - 1 },
    shrines: [{ x: 33, y: GROUND - 1 }, { x: 78, y: GROUND - 1 }, { x: 116, y: GROUND - 1 }],
    // wild creatures: they wander between x0 and x1 on row y
    wild: [
      { id: 'burrow', x0: 37, x1: 43, y: GROUND - 1 },
      { id: 'puddle', x0: 57, x1: 61, y: GROUND - 1 },
      { id: 'lantern', x0: 72, x1: 75, y: 21, flies: true },
      { id: 'cinder', x0: 87, x1: 91, y: 25 },
      { id: 'thorn', x0: 120, x1: 126, y: 27 },
      { id: 'storm', x0: 128, x1: 132, y: 23, flies: true },
    ],
    champion: { x: 98, y: 26 },
    enemies: [],
    signs: [
      { x: 8, y: GROUND - 1, text: 'THE RIM · THE OTHER FACE LIES BEYOND' },
      { x: 102, y: GROUND - 1, text: 'THE OLD GROVE · TOO WIDE TO JUMP' },
    ],
  };
}

// ---- tails: the Claws ---------------------------------------------------------
// Right to left: the rim door and the ship are at the RIGHT end here (the two
// pads are back to back through the coin). A cavern; the warden waits at the
// far left, behind the dark.
function buildTails() {
  const { t, fill } = grid();
  fill(0, GROUND, LEVEL_W - 1, LEVEL_H - 1);
  fill(0, 0, LEVEL_W - 1, 4); // the roof
  fill(0, 0, 4, LEVEL_H - 1);
  fill(LEVEL_W - 1, 0, LEVEL_W - 1, LEVEL_H - 1);
  // hanging rock
  for (let x = 8; x < LEVEL_W - 4; x += 7) fill(x, 5, x + 1, 5 + ((x * 5) % 4));

  // first stretch: a spike bed with a slab over it
  fill(93, GROUND - 1, 95, GROUND - 1, '^');
  fill(92, 27, 96, 27, '=');
  // a pit anyone can jump
  fill(80, GROUND, 83, LEVEL_H - 1, ' ');
  // the climb to the dash
  fill(72, 27, 78, 29);
  fill(67, 24, 70, 24, '=');
  fill(60, 23, 65, 29);
  // the long gap: nine wide. A dash from the ledge above reaches the slab that
  // hangs over it; a dash at floor level crosses it.
  fill(44, GROUND, 52, LEVEL_H - 1, ' ');
  fill(49, 22, 52, 22, '=');
  // the dark
  fill(39, 5, 40, GROUND - 1, 'D');
  // the warden's hall: a raised lip at each end
  fill(5, 27, 7, 29);

  return {
    name: 'tails',
    tiles: t,
    door: { x: 137, y: GROUND - 1 },
    pad: { x: 122, y: GROUND - 1 },
    clawShrine: { x: 112, y: GROUND - 1 },
    dashOrb: { x: 62, y: 21 },
    shrines: [{ x: 112, y: GROUND - 1 }, { x: 56, y: GROUND - 1 }, { x: 37, y: GROUND - 1 }],
    wild: [],
    huskling: { x: 50, y: 21 },
    boss: { x: 16, y: GROUND - 1, x0: 8, x1: 30 },
    enemies: [
      { kind: 'crawler', x0: 99, x1: 107, y: GROUND - 1 },
      { kind: 'crawler', x0: 85, x1: 91, y: GROUND - 1 },
      { kind: 'flyer', x: 82, y: 24 },
      { kind: 'crawler', x0: 72, x1: 78, y: 26 },
      { kind: 'flyer', x: 68, y: 19 },
      { kind: 'charger', x: 33, y: GROUND - 1 },
      { kind: 'flyer', x: 103, y: 24 },
    ],
    signs: [
      { x: 132, y: GROUND - 1, text: 'THE RIM · THE OTHER FACE LIES BEYOND' },
      { x: 42, y: GROUND - 1, text: 'THE DARK · ONLY A LANTERN GETS THROUGH' },
    ],
  };
}

export function buildLevels() {
  return { heads: buildHeads(), tails: buildTails() };
}
