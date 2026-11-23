// The blank canvas (GDD 5.7.4): the one place in the game where the player
// makes something.
//
// A square of nothing over a black screen, a finger or a mouse, and three
// buttons. What is drawn is handed back as strokes: lists of [x, y], each
// -1..1 with y up (world/firstcreature.js makes them live). Nothing is judged;
// the only rule is that there has to be something there before it can be let
// go.
//
//   openDrawPad(text, onDone)   text: { title, hint, undo, clear, done }
//                               and, for a pad drawn over something (the helm chart of GDD 5.7.9,
//                               chapter 10): back(g, w, h) paints under the strokes; minInk
//   closeDrawPad()              (leaving the place by any other way)
//   isDrawPadOpen()
//
// DOM, like the rest of the HUD. Pointer events, so touch, pen and mouse are
// one path; while it is open the rest of the HUD is put away and the mouse is
// let out of the view.

const MIN_STEP = 0.008; // a new point only this far from the last (canvas units)
const MIN_INK = 0.5; // how much has to be drawn before it can be let go

const CSS = `
#chPad {
  position: fixed; inset: 0; z-index: 200; display: none; flex-direction: column; align-items: center; justify-content: center;
  gap: 1.6vh; background: #000; font-family: 'Courier New', monospace; color: #a9f7ff; text-transform: uppercase;
  touch-action: none; user-select: none; -webkit-user-select: none;
}
#chPad.on { display: flex; animation: chPadIn 2.4s ease both; }
@keyframes chPadIn { from { opacity: 0; } to { opacity: 1; } }
#chPad .title { font-size: clamp(12px, 1.9vw, 20px); letter-spacing: 0.5em; color: #eaffff; text-shadow: 0 0 14px rgba(130, 247, 255, 0.8); }
#chPad .hint { font-size: clamp(9px, 1.15vw, 13px); letter-spacing: 0.3em; color: #ffc9ec; opacity: 0.85; transition: opacity 0.8s; }
#chPad.inked .hint { opacity: 0; }
#chPad canvas {
  width: min(88vw, 66vh); height: min(88vw, 66vh); touch-action: none; cursor: crosshair;
  border: 1px solid rgba(130, 247, 255, 0.28); box-shadow: 0 0 60px rgba(130, 247, 255, 0.07) inset;
}
#chPad .row { display: flex; gap: 2.4vw; }
#chPad button {
  font: inherit; font-size: clamp(11px, 1.4vw, 15px); letter-spacing: 0.26em; text-transform: uppercase;
  padding: 0.85em 1.5em; min-height: 44px; color: #a9f7ff; background: rgba(4, 12, 20, 0.55);
  border: 1px solid rgba(130, 247, 255, 0.5); cursor: pointer; touch-action: manipulation;
}
#chPad button:disabled { opacity: 0.3; cursor: default; }
#chPad button.go { color: #ffc9ec; border-color: #d4408f; text-shadow: 0 0 10px rgba(212, 64, 143, 0.9); }
#chPad button.go:not(:disabled) { box-shadow: 0 0 22px rgba(212, 64, 143, 0.45); }
body.ch-pad > *:not(#chPad) { opacity: 0 !important; pointer-events: none !important; }
body.ch-pad > canvas { opacity: 1 !important; }
@media (max-height: 420px) { #chPad canvas { width: min(60vw, 62vh); height: min(60vw, 62vh); } #chPad { gap: 1vh; } }
`;

let root = null, canvas = null, g = null, btnUndo = null, btnClear = null, btnDone = null;
let strokes = [];
let live = null; // the stroke under the finger
let pointer = null;
let done = null;
let open = false;
let back = null, minInk = MIN_INK; // (set per opening; the first creature's pad has neither)

function ink() {
  let total = 0;
  for (const s of strokes) for (let i = 1; i < s.length; i++) total += Math.hypot(s[i][0] - s[i - 1][0], s[i][1] - s[i - 1][1]);
  return total;
}

function paint() {
  const w = canvas.width, h = canvas.height;
  g.clearRect(0, 0, w, h);
  if (back) {
    g.save();
    back(g, w, h);
    g.restore();
  }
  g.lineCap = g.lineJoin = 'round';
  // twice: a wide soft line, then a bright thin one
  for (const [width, alpha, blur] of [[w * 0.016, 0.35, w * 0.03], [w * 0.005, 1, w * 0.008]]) {
    g.lineWidth = width;
    g.strokeStyle = `rgba(200, 252, 255, ${alpha})`;
    g.shadowColor = '#82f7ff';
    g.shadowBlur = blur;
    for (const s of strokes) {
      g.beginPath();
      for (let i = 0; i < s.length; i++) {
        const x = (s[i][0] * 0.5 + 0.5) * w, y = (0.5 - s[i][1] * 0.5) * h;
        if (i) g.lineTo(x, y);
        else g.moveTo(x, y);
      }
      if (s.length === 1) g.lineTo((s[0][0] * 0.5 + 0.5) * w + 0.01, (0.5 - s[0][1] * 0.5) * h);
      g.stroke();
    }
  }
  const has = strokes.length > 0;
  btnUndo.disabled = btnClear.disabled = !has;
  btnDone.disabled = ink() < minInk;
  root.classList.toggle('inked', has);
}

function at(e) {
  const r = canvas.getBoundingClientRect();
  return [
    Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width) * 2 - 1)),
    Math.max(-1, Math.min(1, 1 - ((e.clientY - r.top) / r.height) * 2)),
  ];
}

function build() {
  if (root) return;
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  root = document.createElement('div');
  root.id = 'chPad';
  root.innerHTML = '<div class="title"></div><canvas></canvas><div class="hint"></div><div class="row"><button class="undo"></button><button class="clear"></button><button class="go"></button></div>';
  document.body.appendChild(root);
  canvas = root.querySelector('canvas');
  g = canvas.getContext('2d');
  btnUndo = root.querySelector('.undo');
  btnClear = root.querySelector('.clear');
  btnDone = root.querySelector('.go');

  canvas.addEventListener('pointerdown', (e) => {
    if (pointer !== null) return;
    e.preventDefault();
    pointer = e.pointerId;
    canvas.setPointerCapture(pointer);
    live = [at(e)];
    strokes.push(live);
    paint();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerId !== pointer || !live) return;
    e.preventDefault();
    const p = at(e), last = live[live.length - 1];
    if (Math.hypot(p[0] - last[0], p[1] - last[1]) < MIN_STEP) return;
    live.push(p);
    paint();
  });
  const lift = (e) => {
    if (e.pointerId !== pointer) return;
    pointer = null;
    live = null;
  };
  canvas.addEventListener('pointerup', lift);
  canvas.addEventListener('pointercancel', lift);
  btnUndo.addEventListener('click', () => {
    strokes.pop();
    paint();
  });
  btnClear.addEventListener('click', () => {
    strokes = [];
    paint();
  });
  btnDone.addEventListener('click', () => {
    if (ink() < minInk) return;
    const cb = done, out = strokes;
    closeDrawPad();
    if (cb) cb(out);
  });
  // keys are the game's while this is up; none of them should reach it
  root.addEventListener('keydown', (e) => e.stopPropagation());
  window.addEventListener('resize', () => {
    if (open) size();
  });
}

function size() {
  const r = canvas.getBoundingClientRect();
  const px = Math.round(Math.min(r.width * Math.min(window.devicePixelRatio || 1, 2), 1400));
  if (canvas.width !== px) canvas.width = canvas.height = px;
  paint();
}

export function openDrawPad(text, onDone) {
  build();
  if (open) return;
  open = true;
  done = onDone;
  back = typeof text.back === 'function' ? text.back : null;
  minInk = Number.isFinite(text.minInk) ? text.minInk : MIN_INK;
  strokes = [];
  live = null;
  pointer = null;
  root.querySelector('.title').textContent = text.title;
  root.querySelector('.hint').textContent = text.hint;
  btnUndo.textContent = text.undo;
  btnClear.textContent = text.clear;
  btnDone.textContent = text.done;
  root.classList.add('on');
  document.body.classList.add('ch-pad');
  if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
  size();
}

export function closeDrawPad() {
  if (!open) return;
  open = false;
  done = null;
  root.classList.remove('on');
  document.body.classList.remove('ch-pad');
}

export const isDrawPadOpen = () => open;

// dev/verification: draw without a pointer, and let go
export const drawPadDebug = {
  stroke(points) {
    if (!open) return false;
    strokes.push(points.map((p) => [p[0], p[1]]));
    paint();
    return true;
  },
  done: () => open && !btnDone.disabled && (btnDone.click(), true),
  state: () => ({ open, strokes: strokes.length, ink: ink(), canDone: !!btnDone && !btnDone.disabled }),
  repaint: () => open && (paint(), true),
};
