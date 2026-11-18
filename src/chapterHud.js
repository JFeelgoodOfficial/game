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
#chHud .white { position: absolute; inset: 0; background: #fff; opacity: 0; }
body.ch-cine > *:not(canvas):not(#chHud):not(#flash) { opacity: 0 !important; pointer-events: none !important; }
@media (prefers-reduced-motion: reduce) { #chHud .bar { transition: none; } }
`;

let root = null, line = null, white = null;
let lineT = 0;
let cineOn = false;

function build() {
  if (root) return;
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  root = document.createElement('div');
  root.id = 'chHud';
  root.innerHTML = '<div class="white"></div><div class="bar top"></div><div class="bar bot"></div><div class="line"></div>';
  document.body.appendChild(root);
  line = root.querySelector('.line');
  white = root.querySelector('.white');
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
