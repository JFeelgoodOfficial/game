// The Rim Circuit's cast and the player's standing in it. Shared by the city
// (world/skycity.js draws the poster, so it is up whenever the city is on
// screen) and the race itself (src/skyRace.js).
//
// Each race has a headline rival: the next name down the card. Beat them (win
// the race) and the mechanics fit a faster engine, and the card moves on to
// someone quicker. The standing lives in localStorage on its own key so it
// survives reloads without touching the main inventory.

import { storyRacePending } from '../src/crownErrand.js';

const KEY = 'nova7.skyrace';

// Vex Halcyon is the Sky City's champion: the last name on the card, and the
// driver the High Cantor sets against Terra's pilot (the Crown errand,
// src/crownErrand.js). While that race is owed, Halcyon heads the poster
// whatever the standing says.
export const HALCYON = { name: 'VEX HALCYON', color: 0x3aa0ff, quote: "I've seen cargo haulers corner better than you. Stay out of my mirrors, Terran." };
export const RIVALS = [
  { name: 'DUCHESS NOVA-KANE', color: 0xc86aff, quote: 'Bring a parachute, darling. The drones are tired of fetching you.' },
  { name: 'BRAKK THE UNBURNT', color: 0xffc83a, quote: 'I put three drivers over the rail last week. You will be number four.' },
  { name: 'ZERO-G ZELDA', color: 0x5ae08a, quote: 'You brake for the jump? Adorable. I will wave on my way past.' },
  { name: 'OLD MAN TORQUE', color: 0xff8a3a, quote: 'Forty years on this ribbon, kid. The city itself moves over for me.' },
  HALCYON,
];

export const ENGINES = ['STOCK', 'MK II', 'MK III', 'MK IV', 'MK V', 'MK VI', 'PROTOTYPE'];

let state = null;

export function standing() {
  if (!state) {
    state = { wins: 0, races: 0 };
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (raw && Number.isFinite(raw.wins)) state = { wins: Math.max(0, raw.wins | 0), races: Math.max(0, raw.races | 0) };
    } catch { /* a corrupt or blocked store just means a fresh card */ }
  }
  return state;
}

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* private mode: play on */ }
}

// Engine level: one step per win, capped by the list.
export const engineLevel = () => Math.min(standing().wins, ENGINES.length - 1);
export const engineName = () => ENGINES[engineLevel()];
// The headline rival of the next race.
export const nextRival = () => (storyRacePending() ? HALCYON : RIVALS[standing().wins % RIVALS.length]);

export function recordRace(won) {
  const s = standing();
  s.races++;
  if (won) s.wins++;
  save();
}

// Debug / tests.
export function resetStanding(wins = 0) {
  state = { wins, races: 0 };
  save();
}

// Paint the poster. `canvas` is 512 x 768. Everything is drawn: a helmeted
// driver in the rival's colour, their name, the quote in a speech panel, and
// the stakes along the bottom.
export function drawPoster(canvas) {
  const g = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const r = nextRival();
  const hex = '#' + r.color.toString(16).padStart(6, '0');
  // backdrop: dark, with speed lines in the rival's colour
  g.fillStyle = '#0b0d14';
  g.fillRect(0, 0, W, H);
  g.strokeStyle = hex;
  g.globalAlpha = 0.22;
  g.lineWidth = 5;
  for (let i = 0; i < 26; i++) {
    const y = 60 + i * 17;
    g.beginPath();
    g.moveTo(-20, y + ((i * 37) % 23));
    g.lineTo(W + 20, y - 110 + ((i * 53) % 31));
    g.stroke();
  }
  g.globalAlpha = 1;
  // header
  g.fillStyle = '#ff4a6a';
  g.fillRect(0, 0, W, 74);
  g.fillStyle = '#0b0d14';
  g.font = '900 44px Impact, "Arial Black", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('NEXT RACE — RIM CIRCUIT', W / 2, 39);
  // the driver: shoulders, helmet, visor
  const cx = W / 2, cy = 268;
  g.fillStyle = '#1a1d26';
  g.beginPath();
  g.moveTo(cx - 170, 420); g.quadraticCurveTo(cx - 150, 330, cx - 60, 322);
  g.lineTo(cx + 60, 322); g.quadraticCurveTo(cx + 150, 330, cx + 170, 420);
  g.closePath(); g.fill();
  g.fillStyle = hex;
  g.fillRect(cx - 170, 398, 340, 22);
  g.beginPath(); g.ellipse(cx, cy, 104, 112, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.28)';
  g.beginPath(); g.ellipse(cx - 34, cy - 58, 40, 22, -0.5, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#07080c';
  g.beginPath();
  g.moveTo(cx - 92, cy - 14); g.quadraticCurveTo(cx, cy - 46, cx + 92, cy - 14);
  g.quadraticCurveTo(cx + 84, cy + 44, cx, cy + 50); g.quadraticCurveTo(cx - 84, cy + 44, cx - 92, cy - 14);
  g.fill();
  // a glare across the visor and two narrowed eyes behind it
  g.fillStyle = hex;
  g.globalAlpha = 0.9;
  g.beginPath(); g.moveTo(cx - 62, cy + 4); g.lineTo(cx - 14, cy + 14); g.lineTo(cx - 60, cy + 18); g.closePath(); g.fill();
  g.beginPath(); g.moveTo(cx + 62, cy + 4); g.lineTo(cx + 14, cy + 14); g.lineTo(cx + 60, cy + 18); g.closePath(); g.fill();
  g.globalAlpha = 1;
  g.fillStyle = '#0b0d14';
  g.fillRect(cx - 8, cy - 112, 16, 60); // helmet stripe
  // name
  g.fillStyle = '#ffffff';
  g.font = '900 54px Impact, "Arial Black", sans-serif';
  let size = 54;
  while (g.measureText(r.name).width > W - 40 && size > 28) { size -= 2; g.font = `900 ${size}px Impact, "Arial Black", sans-serif`; }
  g.fillText(r.name, W / 2, 464);
  // the quote, wrapped, in a speech panel
  g.fillStyle = hex;
  g.fillRect(28, 500, W - 56, 176);
  g.beginPath(); g.moveTo(W / 2 - 22, 500); g.lineTo(W / 2, 474); g.lineTo(W / 2 + 22, 500); g.fill();
  g.fillStyle = '#0b0d14';
  g.font = 'italic 700 27px Georgia, "Times New Roman", serif';
  const words = `“${r.quote}”`.split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    const t = line ? line + ' ' + w : w;
    if (g.measureText(t).width > W - 96 && line) { lines.push(line); line = w; } else line = t;
  }
  lines.push(line);
  const lh = 32, y0 = 588 - ((lines.length - 1) * lh) / 2;
  lines.forEach((l, i) => g.fillText(l, W / 2, y0 + i * lh));
  // the stakes
  const s = standing();
  g.fillStyle = '#ffd060';
  g.font = '700 22px ui-monospace, Menlo, monospace';
  g.fillText(`BEAT THEM: ${ENGINES[Math.min(s.wins + 1, ENGINES.length - 1)]} ENGINE`, W / 2, 706);
  g.fillStyle = '#9aa3b0';
  g.font = '600 18px ui-monospace, Menlo, monospace';
  g.fillText(`YOUR ENGINE: ${engineName()} · WINS ${s.wins}`, W / 2, 738);
}
