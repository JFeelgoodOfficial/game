// stevenlacey — the bestiary.
//
// The ten creatures of the coin world: eight from the Sanctuary face (heads),
// two from the Claws face (tails). Data and drawing only, no state. Three
// modules read it: the 2D walker (src/coinWalk.js) to put them in the world,
// the battle (src/coinBattle.js) for their numbers, and the ship's terrarium
// (src/terrarium.js) to show the ones you have brought home. That last one is
// why this lives in the boot bundle rather than the on-foot chunk, and why it
// is kept small.
//
// Every creature is drawn in code on a 16 x 16 pixel cell, feet on the bottom
// row, facing right. `frame` is 0 or 1: the two-frame idle.

// Ember beats Moss beats Tide beats Ember. Shade stands outside the triangle.
export const BEATS = { ember: 'moss', moss: 'tide', tide: 'ember' };
export const ELEMENT_COLOR = { ember: '#ff8a4a', moss: '#7fd65a', tide: '#5ab4ff', shade: '#c8c6e0' };

// How a move of element `a` lands on a creature of element `b`.
export function matchup(a, b) {
  if (BEATS[a] === b) return 1.6;
  if (BEATS[b] === a) return 0.6;
  return 1.1;
}

export const SPECIMENS = {
  sprout: { name: 'Sproutling', element: 'moss', face: 'heads', hp: 30, atk: 8, spd: 6, move: 'LEAF LASH' },
  burrow: { name: 'Burrowback', element: 'moss', face: 'heads', hp: 36, atk: 6, spd: 3, move: 'ROOT SLAM' },
  puddle: { name: 'Puddlefin', element: 'tide', face: 'heads', hp: 26, atk: 7, spd: 7, move: 'SPLASH' },
  cinder: { name: 'Cindercub', element: 'ember', face: 'heads', hp: 28, atk: 9, spd: 8, move: 'EMBER BITE' },
  lantern: { name: 'Lanternmoth', element: 'ember', face: 'heads', hp: 22, atk: 7, spd: 10, move: 'GLOW BURST' },
  crown: { name: 'Crownstag', element: 'tide', face: 'heads', hp: 44, atk: 10, spd: 5, move: 'TIDAL CHARGE' },
  thorn: { name: 'Thornwyrm', element: 'moss', face: 'heads', hp: 48, atk: 11, spd: 4, move: 'BRIAR COIL' },
  storm: { name: 'Stormray', element: 'tide', face: 'heads', hp: 40, atk: 12, spd: 9, move: 'THUNDER FIN' },
  husk: { name: 'Huskling', element: 'shade', face: 'tails', hp: 34, atk: 10, spd: 7, move: 'HOLLOW CRY' },
  whelp: { name: "Rimwarden's Whelp", element: 'shade', face: 'tails', hp: 52, atk: 12, spd: 4, move: 'COIN CRUSH' },
};
export const SPECIMEN_ORDER = [
  'sprout', 'burrow', 'puddle', 'cinder', 'lantern', 'crown', 'thorn', 'storm', 'husk', 'whelp',
];

// ---- drawing ------------------------------------------------------------------

let _g = null, _x = 0, _y = 0, _s = 1;
function P(x, y, w, h, c) {
  _g.fillStyle = c;
  _g.fillRect(_x + x * _s, _y + y * _s, w * _s, h * _s);
}
// pixel ellipse, centre (cx, cy), radii rx / ry
function E(cx, cy, rx, ry, c) {
  for (let dy = -ry; dy <= ry; dy++) {
    const w = Math.round(rx * Math.sqrt(1 - (dy * dy) / ((ry + 0.5) * (ry + 0.5))));
    P(cx - w, cy + dy, w * 2 + 1, 1, c);
  }
}
const INK = '#1a1410';
function eyes(x, y, gap = 3) {
  P(x, y, 1, 2, INK);
  P(x + gap, y, 1, 2, INK);
}

const DRAW = {
  sprout(f) {
    const b = f;
    E(8, 11 - b, 5, 4, '#4f9a3a');
    E(8, 12 - b, 3, 2, '#b4e08a');
    eyes(7, 9 - b);
    P(7, 4 - b, 1, 3, '#2f6b3a'); // stem
    P(4 + b, 3 - b, 3, 2, '#58c05a'); // leaves
    P(8, 2 - b, 3, 2, '#58c05a');
    P(5, 15, 2, 1, '#2f6b3a');
    P(9, 15, 2, 1, '#2f6b3a');
  },
  burrow(f) {
    E(8, 11, 7, 4, '#6a5a34');
    E(8, 9, 5, 3, '#4f7a3a'); // mossy shell
    P(5, 7, 2, 1, '#7fb04a');
    P(9, 6, 2, 1, '#7fb04a');
    P(7, 9, 2, 1, '#7fb04a');
    eyes(11, 11, 2);
    P(2 + f, 15, 3, 1, '#3a3020');
    P(10 - f, 15, 3, 1, '#3a3020');
  },
  puddle(f) {
    E(8, 11, 5, 4, '#3f7fd0');
    E(8, 12, 3, 2, '#9fd0f4');
    P(7, 4 + f, 2, 3, '#5ab4ff'); // dorsal fin
    P(8, 3 + f, 1, 1, '#5ab4ff');
    P(1, 9 + f, 2, 4, '#5ab4ff'); // tail
    P(3, 10 + f, 1, 2, '#3f7fd0');
    eyes(9, 9);
  },
  cinder(f) {
    E(8, 11, 5, 4, '#d8552a');
    E(9, 12, 3, 2, '#f4a35a');
    P(5, 5, 2, 3, '#d8552a'); // ears
    P(10, 5, 2, 3, '#d8552a');
    eyes(8, 9);
    // flame tail
    P(1, 9 - f, 2, 4, '#ffb030');
    P(0 + f, 7 - f, 2, 2, '#ffe070');
    P(2, 11, 2, 2, '#d8552a');
    P(6, 15, 2, 1, '#8a2f18');
    P(10, 15, 2, 1, '#8a2f18');
  },
  lantern(f) {
    const up = f ? -2 : 0;
    // wings
    E(4, 7 + up, 3, 3 - f, '#fff2c0');
    E(12, 7 + up, 3, 3 - f, '#fff2c0');
    P(3, 7 + up, 2, 1, '#e0b060');
    P(11, 7 + up, 2, 1, '#e0b060');
    // body, glowing tail
    P(7, 5, 2, 5, '#5a4020');
    E(8, 11, 2, 2, '#ffd040');
    P(7, 10, 2, 2, '#fff8c0');
    P(6, 3, 1, 2, '#5a4020');
    P(9, 3, 1, 2, '#5a4020');
    P(7, 6, 1, 1, '#fff');
    P(8, 6, 1, 1, '#fff');
  },
  crown(f) {
    P(4, 8, 9, 4, '#4a7ac8'); // barrel
    P(11, 5, 3, 5, '#4a7ac8'); // neck + head
    P(12, 6, 3, 2, '#6a9ae0');
    P(13, 6, 1, 1, INK);
    // antlers
    P(11, 1, 1, 4, '#dff0ff');
    P(13, 1, 1, 4, '#dff0ff');
    P(9, 2, 2, 1, '#dff0ff');
    P(14, 2, 2, 1, '#dff0ff');
    P(10, 0, 1, 2, '#dff0ff');
    P(15, 0, 1, 2, '#dff0ff');
    // legs
    P(4 + f, 12, 1, 4, '#2f5090');
    P(7 - f, 12, 1, 4, '#2f5090');
    P(10 + f, 12, 1, 4, '#2f5090');
    P(12 - f, 12, 1, 4, '#2f5090');
    P(2, 8, 2, 2, '#9fd0f4'); // tail tuft
  },
  thorn(f) {
    // a coil of segments, spined
    const seg = [[2, 13], [4, 11 + f], [6, 13], [8, 11 + f], [10, 12], [12, 9], [12, 6]];
    for (const [x, y] of seg) {
      E(x + 1, y, 2, 2, '#2f6b3a');
      P(x + 1, y - 3, 1, 1, '#c8e08a');
    }
    E(13, 4, 2, 2, '#3f8a48');
    P(14, 3, 1, 1, '#ff5040');
    P(15, 5, 1, 1, '#ff5040'); // tongue
    P(11, 1, 1, 2, '#c8e08a');
    P(14, 1, 1, 2, '#c8e08a');
  },
  storm(f) {
    const y = 8 + f;
    P(7, y - 4, 2, 1, '#5a6ad0');
    P(5, y - 3, 6, 1, '#5a6ad0');
    P(3, y - 2, 10, 1, '#5a6ad0');
    P(1, y - 1, 14, 2, '#6a7ae8');
    P(3, y + 1, 10, 1, '#5a6ad0');
    P(5, y + 2, 6, 1, '#4050a8');
    P(7, y + 3, 2, 3, '#4050a8'); // tail
    P(8, y + 6, 1, 2, '#ffe070');
    eyes(6, y - 1, 3);
    P(2 + f * 10, y - 3, 1, 1, '#ffe070'); // sparks
    P(13 - f * 10, y + 2, 1, 1, '#ffe070');
  },
  husk(f) {
    P(5, 8 - f, 7, 7 + f, '#15131c'); // cloak
    P(4, 12, 9, 3, '#15131c');
    E(8, 6 - f, 3, 3, '#eef0ff'); // mask
    P(5, 0 - f, 1, 4, '#eef0ff'); // horns
    P(11, 0 - f, 1, 4, '#eef0ff');
    P(7, 5 - f, 1, 3, '#15131c');
    P(9, 5 - f, 1, 3, '#15131c');
  },
  whelp(f) {
    E(8, 10, 6, 5, '#6a6884');
    E(8, 11, 4, 3, '#8a88a8');
    P(2, 7, 12, 2, '#d9a93a'); // a collar of milled gold
    P(3, 7, 1, 2, '#8a6420');
    P(6, 7, 1, 2, '#8a6420');
    P(9, 7, 1, 2, '#8a6420');
    P(12, 7, 1, 2, '#8a6420');
    P(5, 4, 6, 3, '#4a4860');
    P(6, 5, 4, 1, '#ffd98a'); // the one slit eye
    P(4, 2, 1, 3, '#4a4860');
    P(11, 2, 1, 3, '#4a4860');
    P(4 + f, 15, 3, 1, '#2e2c3e');
    P(9 - f, 15, 3, 1, '#2e2c3e');
  },
};

// Draw creature `id` with its cell's top-left at (x, y), each pixel `s` canvas
// pixels. `flip` faces it left.
export function drawMon(g, id, frame, x, y, s = 1, flip = false) {
  const fn = DRAW[id];
  if (!fn) return;
  _g = g;
  _s = s;
  if (flip) {
    g.save();
    g.translate(x + 16 * s, y);
    g.scale(-1, 1);
    _x = 0;
    _y = 0;
    fn(frame);
    g.restore();
  } else {
    _x = x;
    _y = y;
    fn(frame);
  }
}
