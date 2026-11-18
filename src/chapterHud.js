// What the megaworld chapter puts on the screen (GDD 5.7.4): the bars of a
// scene being shown, one line of words under it, and a white for the cuts.
//
// DOM, like every other HUD here, made the first time it is asked for. While
// the bars are in, the rest of the HUD is put away (body.ch-cine): a scene is
// watched, not played.
//
//   cine(on)        bars in / out
//   say(text, sec)  one line, bottom centre, for `sec` seconds (null clears)
//   white(v)        0..1, a flash over everything
//   clocks(a, b, labelA, labelB, c, labelC)   two clocks, top left, in seconds (null
//                   hides them); a third, above them, if c is given
//   panel(text)     a few lines top left (null hides it)
//   tick(dt)        once a frame while anything might be showing

const CSS = `
#chHud { position: fixed; inset: 0; pointer-events: none; z-index: 60; font-family: 'Courier New', monospace; }
#chHud .bar { position: absolute; left: 0; right: 0; height: 12vh; background: #000; transition: transform 0.9s cubic-bezier(0.4, 0, 0.2, 1); }
#chHud .top { top: 0; transform: translateY(-101%); }
#chHud .bot { bottom: 0; transform: translateY(101%); }
#chHud.on .bar { transform: none; }
#chHud .line {
  position: absolute; left: 6vw; right: 6vw; bottom: 14.5vh; text-align: center;
  color: #eaffff; font-size: clamp(13px, 2.1vw, 22px); letter-spacing: 0.34em; text-transform: uppercase;
  text-shadow: 0 0 14px rgba(130, 247, 255, 0.9), 0 0 2px #000, 0 2px 10px rgba(0, 0, 0, 0.8);
  opacity: 0; transition: opacity 0.7s;
}
#chHud .line.show { opacity: 1; }
/* outside a scene the bottom of the screen is the game's: the line goes up top */
#chHud:not(.on) .line { bottom: auto; top: 17vh; }
#chHud .clocks {
  position: absolute; left: max(2.2vw, env(safe-area-inset-left)); top: 2.4vh; display: none;
  padding: 0.7em 1em; background: rgba(4, 12, 20, 0.55); border: 1px solid rgba(130, 247, 255, 0.5);
  color: #a9f7ff; font-size: clamp(11px, 1.5vw, 16px); letter-spacing: 0.18em; white-space: pre; line-height: 1.7;
  text-shadow: 0 0 10px rgba(130, 247, 255, 0.7);
}
#chHud .clocks.show { display: block; }
#chHud .clocks b { font-weight: normal; color: #ffc9ec; text-shadow: 0 0 10px rgba(212, 64, 143, 0.9); }
#chHud .panel {
  position: absolute; left: max(2.2vw, env(safe-area-inset-left)); top: 2.4vh; display: none;
  padding: 0.7em 1em; background: rgba(4, 12, 20, 0.55); border: 1px solid rgba(130, 247, 255, 0.5);
  color: #a9f7ff; font-size: clamp(10px, 1.4vw, 15px); letter-spacing: 0.16em; white-space: pre; line-height: 1.7;
  text-shadow: 0 0 10px rgba(130, 247, 255, 0.7);
}
#chHud .panel.show { display: block; }
/* flying a race: the on-foot key list and the compass are not for this */
body.ch-race #walkHint, body.ch-race #compass { opacity: 0 !important; }
/* ...and the line sits under the race's own panel */
body.ch-race #chHud:not(.on) .line { top: 27vh; }
#chHud .white { position: absolute; inset: 0; background: #fff; opacity: 0; }
body.ch-cine > *:not(canvas):not(#chHud):not(#flash) { opacity: 0 !important; pointer-events: none !important; }
@media (prefers-reduced-motion: reduce) { #chHud .bar { transition: none; } }
`;

let root = null, panel = null, line = null, white = null, clocks = null, clockA = null, clockB = null, clockC = null;
let lineT = 0;
let shownA = -2, shownB = -2, shownC = -2; // the seconds the clocks last showed
let cineOn = false;

function build() {
  if (root) return;
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  root = document.createElement('div');
  root.id = 'chHud';
  root.innerHTML = '<div class="white"></div><div class="bar top"></div><div class="bar bot"></div><div class="line"></div><div class="panel"></div><div class="clocks"><span class="c"></span><span class="a"></span>\n<b class="b"></b></div>';
  document.body.appendChild(root);
  line = root.querySelector('.line');
  white = root.querySelector('.white');
  panel = root.querySelector('.panel');
  clocks = root.querySelector('.clocks');
  clockA = root.querySelector('.clocks .a');
  clockB = root.querySelector('.clocks .b');
  clockC = root.querySelector('.clocks .c');
}

const two = (n) => String(Math.floor(n)).padStart(2, '0');
// seconds as a clock; past a day, days; past a year, years
function stamp(sec) {
  const d = Math.floor(sec / 86400), y = Math.floor(d / 365);
  const hms = `${two((sec / 3600) % 24)}:${two((sec / 60) % 60)}:${two(sec % 60)}`;
  if (y > 0) return `${y}Y ${String(d % 365).padStart(3, '0')}D ${hms}`;
  if (d > 0) return `${d}D ${hms}`;
  return hms;
}

export const chapterHud = {
  cine(on) {
    if (on === cineOn) return;
    build();
    cineOn = on;
    root.classList.toggle('on', on);
    document.body.classList.toggle('ch-cine', on);
  },
  say(text, seconds = 4.5) {
    build();
    if (!text) {
      line.classList.remove('show');
      lineT = 0;
      return;
    }
    line.textContent = text;
    line.classList.add('show');
    lineT = seconds;
  },
  white(v) {
    if (!root && v <= 0) return;
    build();
    white.style.opacity = v <= 0.004 ? '0' : v.toFixed(3);
  },
  clocks(a, b, labelA = '', labelB = '', c = null, labelC = '') {
    if (a == null) {
      if (clocks) clocks.classList.remove('show');
      shownA = shownB = shownC = -2;
      return;
    }
    build();
    clocks.classList.add('show');
    // (strings are only made when a second that is shown has changed)
    const fa = Math.floor(a), fb = Math.floor(b), fc = c == null ? -1 : Math.floor(c);
    if (fa !== shownA) clockA.textContent = `${labelA.padEnd(10)}${stamp((shownA = fa))}`;
    if (fb !== shownB) clockB.textContent = `${labelB.padEnd(10)}${stamp((shownB = fb))}`;
    if (fc !== shownC) clockC.textContent = (shownC = fc) < 0 ? '' : `${labelC.padEnd(10)}${stamp(fc)}\n`;
  },
  // a race is being flown (puts the on-foot hints away)
  racing(on) {
    document.body.classList.toggle('ch-race', !!on);
  },
  // a few lines of text, top left (the race's lap, gate, time and boost); null hides it
  panel(text) {
    if (text == null) {
      if (panel) panel.classList.remove('show');
      return;
    }
    build();
    panel.textContent = text;
    panel.classList.add('show');
  },
  tick(dt) {
    if (lineT > 0) {
      lineT -= dt;
      if (lineT <= 0) line.classList.remove('show');
    }
  },
  // everything off, at once (the place was left by a door, the menu, a reset)
  clear() {
    if (!root) return;
    this.cine(false);
    this.say(null);
    this.white(0);
  },
  state: () => ({ cine: cineOn, line: line && lineT > 0 ? line.textContent : null }),
};
