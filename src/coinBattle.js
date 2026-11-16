// stevenlacey — the Sanctuary's battles.
//
// Turn-based, small on purpose. You bring a team of up to three and have one
// out at a time; when it faints the next steps in. A turn is one of: STRIKE
// (plain damage), the creature's own element move (strong, even or weak by the
// triangle in world/coin-bestiary.js), or SWAP, which spends the turn. The
// quicker creature goes first. No levels, no items.
//
// The battle draws itself onto the same 2D canvas the walker uses and is
// driven by the walker's input edges, so it needs no DOM and nothing of
// three.js. It owns no persistent state: the team entries it is handed are the
// walker's own, and the hit points it leaves in them are what the walker keeps.

import { SPECIMENS, ELEMENT_COLOR, matchup, drawMon } from '../world/coin-bestiary.js';

const FONT = "bold 10px 'Courier New', monospace";
const MSG_HOLD = 1.25; // seconds a line stays up if you do not press on
const MSG_MIN = 0.22; // ...and the least it stays up, so a held key cannot skip a turn unread

export function drawText(g, str, x, y, col = '#eaffff', align = 'left', font = FONT) {
  g.font = font;
  g.textAlign = align;
  g.textBaseline = 'top';
  g.fillStyle = '#05080c';
  g.fillText(str, x + 1, y + 1);
  g.fillStyle = col;
  g.fillText(str, x, y);
}

// A team or foe entry: { id, hp, max, atk, spd }.
export function makeFighter(id, scale = 1) {
  const s = SPECIMENS[id];
  const max = Math.round(s.hp * scale);
  return { id, hp: max, max, atk: s.atk * scale, spd: s.spd };
}

export function createBattle({ team, foes, canRun = true, opener }) {
  const b = {
    team, foes,
    ti: Math.max(0, team.findIndex((m) => m.hp > 0)),
    fi: 0,
    state: 'msg', // 'msg' | 'menu' | 'swap'
    done: null, // 'win' | 'lose' | 'run'
    msg: '', msgT: 0,
    sel: 0,
    hitP: 0, hitF: 0, // seconds of flinch left on each side
    showP: 0, showF: 0, // hit points as drawn (they slide to the real ones)
    plan: [],
  };
  const me = () => b.team[b.ti];
  const foe = () => b.foes[b.fi];
  const nm = (m) => SPECIMENS[m.id].name.toUpperCase();
  b.showP = me().hp;
  b.showF = foe().hp;

  // Run thunks until one has something to say. A thunk returns a line of text,
  // or nothing to be skipped. When the plan is empty the turn is over.
  function advance() {
    while (b.plan.length) {
      const line = b.plan.shift()();
      if (line) {
        b.msg = line;
        b.msgT = 0;
        b.state = 'msg';
        return;
      }
    }
    if (b.done) return;
    b.state = 'menu';
    b.sel = 0;
  }

  function attack(fromPlayer, elemental) {
    return () => {
      if (b.done) return null;
      const a = fromPlayer ? me() : foe();
      const d = fromPlayer ? foe() : me();
      if (a.hp <= 0 || d.hp <= 0) return null;
      const sa = SPECIMENS[a.id], sd = SPECIMENS[d.id];
      const k = elemental ? matchup(sa.element, sd.element) : 1;
      const dmg = Math.max(1, Math.round(a.atk * k * (0.9 + Math.random() * 0.2)));
      d.hp = Math.max(0, d.hp - dmg);
      if (fromPlayer) b.hitF = 0.3; else b.hitP = 0.3;
      const tail = !elemental ? '' : k > 1.3 ? ' — IT BITES DEEP' : k < 0.8 ? ' — IT BARELY LANDS' : '';
      return `${nm(a)} USED ${elemental ? sa.move : 'STRIKE'}${tail}`;
    };
  }

  function faint(playerSide) {
    return () => {
      if (b.done) return null;
      const m = playerSide ? me() : foe();
      if (m.hp > 0) return null;
      if (playerSide) {
        const next = b.team.findIndex((x) => x.hp > 0);
        if (next < 0) {
          b.plan = [() => { b.done = 'lose'; return 'YOUR TEAM IS SPENT'; }];
        } else {
          b.plan.unshift(() => { b.ti = next; b.showP = me().hp; return `GO, ${nm(me())}`; });
        }
      } else if (b.fi + 1 < b.foes.length) {
        b.plan.unshift(() => { b.fi++; b.showF = foe().hp; return `${nm(foe())} STEPS IN`; });
      } else {
        b.plan = [() => { b.done = 'win'; return 'YOU WON'; }];
      }
      return `${nm(m)} FAINTED`;
    };
  }

  // The foe's choice: its element move unless that would be the weak side.
  function foeElemental() {
    return matchup(SPECIMENS[foe().id].element, SPECIMENS[me().id].element) >= 1;
  }

  function takeTurn(action) {
    const fe = foeElemental();
    if (action.swap !== undefined) {
      b.plan = [
        () => { b.ti = action.swap; b.showP = me().hp; return `GO, ${nm(me())}`; },
        attack(false, fe), faint(true),
      ];
    } else {
      const first = me().spd >= foe().spd;
      const mine = [attack(true, action.elemental), faint(false)];
      const theirs = [attack(false, fe), faint(true)];
      b.plan = first ? [...mine, ...theirs] : [...theirs, ...mine];
    }
    advance();
  }

  function menuItems() {
    const items = ['STRIKE', SPECIMENS[me().id].move];
    if (b.team.some((m, i) => i !== b.ti && m.hp > 0)) items.push('SWAP');
    if (canRun) items.push('RUN');
    return items;
  }
  function swapItems() {
    const out = [];
    b.team.forEach((m, i) => { if (i !== b.ti && m.hp > 0) out.push(i); });
    return out;
  }

  b.plan = [() => opener || `A WILD ${nm(foe())} APPEARS`];
  advance();

  // inp: { up, down, ok } edges for this tick.
  b.update = (dt, inp) => {
    b.hitP = Math.max(0, b.hitP - dt);
    b.hitF = Math.max(0, b.hitF - dt);
    const slide = (cur, to) => (Math.abs(cur - to) < 0.5 ? to : cur + (to - cur) * Math.min(1, dt * 8));
    b.showP = slide(b.showP, me().hp);
    b.showF = slide(b.showF, foe().hp);
    if (b.state === 'msg') {
      b.msgT += dt;
      if (b.msgT > MSG_HOLD || (inp.ok && b.msgT > MSG_MIN)) {
        if (b.done) { b.over = true; return; }
        advance();
      }
      return;
    }
    const items = b.state === 'menu' ? menuItems() : [...swapItems().map((i) => nm(b.team[i])), 'BACK'];
    if (inp.up) b.sel = (b.sel + items.length - 1) % items.length;
    if (inp.down) b.sel = (b.sel + 1) % items.length;
    if (!inp.ok) return;
    const pick = items[b.sel];
    if (b.state === 'menu') {
      if (pick === 'STRIKE') takeTurn({ elemental: false });
      else if (pick === 'SWAP') { b.state = 'swap'; b.sel = 0; }
      else if (pick === 'RUN') { b.done = 'run'; b.plan = []; b.msg = 'YOU SLIPPED AWAY'; b.msgT = 0; b.state = 'msg'; }
      else takeTurn({ elemental: true });
    } else if (pick === 'BACK') {
      b.state = 'menu';
      b.sel = 0;
    } else {
      takeTurn({ swap: swapItems()[b.sel] });
    }
  };

  function plate(g, x, y, m, shown, t) {
    const s = SPECIMENS[m.id];
    g.fillStyle = 'rgba(4,12,20,0.85)';
    g.fillRect(x, y, 150, 30);
    g.strokeStyle = 'rgba(130,247,255,0.6)';
    g.strokeRect(x + 0.5, y + 0.5, 149, 29);
    g.fillStyle = ELEMENT_COLOR[s.element];
    g.fillRect(x + 5, y + 6, 6, 6);
    drawText(g, s.name.toUpperCase(), x + 15, y + 4);
    g.fillStyle = '#1a2a34';
    g.fillRect(x + 5, y + 18, 110, 6);
    const k = Math.max(0, shown / m.max);
    g.fillStyle = k > 0.5 ? '#7fd65a' : k > 0.22 ? '#ffd040' : '#ff5040';
    g.fillRect(x + 5, y + 18, Math.round(110 * k), 6);
    drawText(g, String(Math.ceil(shown)), x + 145, y + 15, '#eaffff', 'right');
    void t;
  }

  b.draw = (g, W, H, t) => {
    const grd = g.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, '#20384a');
    grd.addColorStop(0.6, '#3a6a4a');
    grd.addColorStop(1, '#16281c');
    g.fillStyle = grd;
    g.fillRect(0, 0, W, H);
    const frame = (t * 2.5) & 1;
    // the two stands
    g.fillStyle = 'rgba(0,0,0,0.28)';
    g.beginPath();
    g.ellipse(W * 0.74, 108, 52, 9, 0, 0, Math.PI * 2);
    g.ellipse(W * 0.24, 178, 60, 10, 0, 0, Math.PI * 2);
    g.fill();
    const jf = b.hitF > 0 ? Math.sin(b.hitF * 80) * 4 : 0;
    const jp = b.hitP > 0 ? Math.sin(b.hitP * 80) * 4 : 0;
    if (foe().hp > 0 || b.showF > 0.5) {
      drawMon(g, foe().id, frame, Math.round(W * 0.74 - 40 + jf), 28, 5, true);
    }
    if (me().hp > 0 || b.showP > 0.5) {
      drawMon(g, me().id, frame, Math.round(W * 0.24 - 48 + jp), 84, 6, false);
    }
    plate(g, 14, 14, foe(), b.showF, t);
    plate(g, W - 164, 136, me(), b.showP, t);
    // who is left, each side
    for (let i = 0; i < b.foes.length; i++) {
      g.fillStyle = b.foes[i].hp > 0 ? '#ff8a4a' : '#3a2a24';
      g.fillRect(14 + i * 9, 48, 6, 6);
    }
    for (let i = 0; i < b.team.length; i++) {
      g.fillStyle = b.team[i].hp > 0 ? '#82f7ff' : '#1e3038';
      g.fillRect(W - 164 + i * 9, 170, 6, 6);
    }
    // the box
    const by = H - 72;
    g.fillStyle = 'rgba(4,12,20,0.92)';
    g.fillRect(8, by, W - 16, 64);
    g.strokeStyle = 'rgba(130,247,255,0.6)';
    g.strokeRect(8.5, by + 0.5, W - 17, 63);
    if (b.state === 'msg') {
      drawText(g, b.msg, 20, by + 12);
      if (b.msgT > MSG_MIN && ((t * 3) & 1)) drawText(g, 'E ▸', W - 20, by + 46, '#82f7ff', 'right');
    } else {
      const items = b.state === 'menu' ? menuItems() : [...swapItems().map((i) => nm(b.team[i])), 'BACK'];
      drawText(g, b.state === 'menu' ? `WHAT WILL ${nm(me())} DO?` : 'SEND WHO?', 20, by + 8, '#9fd0f4');
      for (let i = 0; i < items.length; i++) {
        // both columns keep to the left half: the game's own on-screen buttons
        // sit over the right of this box
        const cx = 28 + (i % 2) * 124;
        const cy = by + 24 + Math.floor(i / 2) * 16;
        const on = i === b.sel;
        if (on) drawText(g, '▸', cx - 10, cy, '#ffd040');
        drawText(g, items[i], cx, cy, on ? '#ffd040' : '#eaffff');
      }
    }
  };

  return b;
}
