// Cinematic conversations (owner request). The story talks — a governor
// handing over the tour, a fleet captain, the Warden — are shown, not played:
// the bars come in (chapterHud.cine), the camera frames the speaker, the
// player stands still, and the words are large subtitles in the lower bar.
//
// dialogue.js is still the one state machine (lines, choices, offers). A
// payload marked `cine` is drawn here instead of in #dlgPanel:
//
//   cine: true            on foot: the camera takes a two-shot / close-up
//   cine: { kind: 'comm', from: 'RSV HAMMERFALL' }
//                         a transmission, in flight or anywhere: no camera
//                         move, an INCOMING TRANSMISSION header, and this
//                         module reads E / Space / Enter itself (no walker is
//                         routing E to the dialogue up there)
//
// The walkers ask cineHeld() to freeze movement and look, and hand their
// camera to cineCamera() with the two world points that matter.

import * as THREE from 'three';
import { chapterHud } from './chapterHud.js';
import { isTouch } from './touchText.js';

const CSS = `
#cineTalk {
  position: fixed; inset: 0; z-index: 61; display: none;
  font-family: 'Courier New', ui-monospace, monospace; user-select: none;
  -webkit-user-select: none; touch-action: none;
}
#cineTalk.open { display: block; }
#cineTalk .ct-box {
  position: absolute; left: 0; right: 0; bottom: 0; box-sizing: border-box;
  min-height: 12vh; padding: 10px max(6vw, env(safe-area-inset-left)) max(12px, env(safe-area-inset-bottom));
  display: flex; flex-direction: column; align-items: center; justify-content: flex-end; gap: 8px;
  background: linear-gradient(to top, #000 0, #000 12vh, rgba(0,0,0,0.78) calc(12vh + 40px), rgba(0,0,0,0) 100%);
  padding-top: 70px; text-align: center;
}
#cineTalk .ct-from {
  font-size: 13px; letter-spacing: 0.4em; color: #8cffd1;
  text-shadow: 0 0 10px rgba(140,255,209,0.7); animation: ct-blink 1.1s step-end infinite;
}
@keyframes ct-blink { 50% { opacity: 0.45; } }
#cineTalk .ct-speaker {
  font-size: 14px; letter-spacing: 0.32em; color: #ffc9ec;
  text-shadow: 0 0 10px rgba(212,64,143,0.8), 0 0 2px #000;
}
#cineTalk .ct-speaker .ct-meta { color: #7ad7e0; text-shadow: 0 0 6px rgba(130,247,255,0.5), 0 0 2px #000; }
#cineTalk .ct-line {
  max-width: 62ch; font-size: clamp(18px, 2.3vw, 24px); line-height: 1.45; letter-spacing: 0.03em;
  color: #f2feff; text-shadow: 0 0 2px #000, 0 2px 10px rgba(0,0,0,0.9);
  background: rgba(3, 8, 14, 0.78); padding: 0.4em 0.9em; border-radius: 6px; /* something to read it against */
}
#cineTalk .ct-options { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; }
#cineTalk .ct-opt {
  font: inherit; font-size: clamp(15px, 1.9vw, 19px); letter-spacing: 0.06em; cursor: pointer;
  min-height: 46px; padding: 8px 18px; color: #ffe1f3; border-radius: 4px;
  background: rgba(212,64,143,0.2); border: 1px solid rgba(255,140,205,0.75);
}
#cineTalk .ct-opt:active { background: rgba(212,64,143,0.5); }
#cineTalk .ct-hint { font-size: 12px; letter-spacing: 0.3em; color: #7ad7e0; opacity: 0.85; }
#cineTalk .ct-skip {
  position: absolute; top: max(14px, env(safe-area-inset-top)); right: max(16px, env(safe-area-inset-right));
  font: inherit; font-size: 14px; letter-spacing: 0.3em; cursor: pointer;
  min-height: 44px; padding: 0 18px; color: #a9f7ff; border-radius: 4px;
  background: rgba(4,12,20,0.7); border: 1px solid rgba(130,247,255,0.55);
}
#cineTalk .ct-skip:active { background: rgba(130,247,255,0.25); }
@media (max-height: 480px) {
  #cineTalk .ct-box { gap: 5px; padding-top: 40px; }
  #cineTalk .ct-line { font-size: 18px; line-height: 1.3; }
  #cineTalk .ct-speaker { font-size: 12px; }
  #cineTalk .ct-opt { min-height: 42px; padding: 6px 14px; }
}
`;

let root = null, fromEl, speakerEl, lineEl, optionsEl, hintEl, skipEl;
let active = false;
let kind = 'talk'; // 'talk' (camera takes a shot) | 'comm' (a transmission)
let handlers = null; // { advance, pick, skip } from dialogue.js
let keyHandler = null;

// --- camera state ---
let shot = 0; // 0 two-shot over the player's shoulder, 1 close on the speaker
let lineNo = 0;
let blend = 0; // 0..1 ease from the walker's camera into the first shot
let cut = true; // snap to the shot (a cut), not a drift
const _off = new THREE.Vector3(); // camera offset from the player, eased
const _dir = new THREE.Vector3();
const _side = new THREE.Vector3();
const _want = new THREE.Vector3();
const _look = new THREE.Vector3();
const _lookNow = new THREE.Vector3();
let haveLook = false;

function build() {
  if (root) return;
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  root = document.createElement('div');
  root.id = 'cineTalk';
  root.setAttribute('data-nocapture', '');
  root.innerHTML = `
    <button class="ct-skip" type="button">SKIP ▸▸</button>
    <div class="ct-box">
      <div class="ct-from"></div>
      <div class="ct-speaker"></div>
      <div class="ct-line"></div>
      <div class="ct-options"></div>
      <div class="ct-hint"></div>
    </div>`;
  document.body.appendChild(root);
  fromEl = root.querySelector('.ct-from');
  speakerEl = root.querySelector('.ct-speaker');
  lineEl = root.querySelector('.ct-line');
  optionsEl = root.querySelector('.ct-options');
  hintEl = root.querySelector('.ct-hint');
  skipEl = root.querySelector('.ct-skip');
  // One press handler for the whole overlay: a choice, SKIP, or (anywhere
  // else) the next line. pointerdown covers mouse and touch; under pointer
  // lock the mouse never reaches here and E does the work.
  root.addEventListener('pointerdown', (e) => {
    if (!active || !handlers) return;
    e.preventDefault();
    e.stopPropagation();
    const t = e.target;
    const opt = t.closest && t.closest('.ct-opt');
    if (opt) handlers.pick(Number(opt.dataset.i));
    else if (t.closest && t.closest('.ct-skip')) handlers.skip();
    else handlers.advance();
  });
  root.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
}

// dialogue.js opens a cinematic talk. `cine` is the payload's field.
export function cineOpen(cine, h) {
  build();
  handlers = h;
  kind = cine && cine.kind === 'comm' ? 'comm' : 'talk';
  fromEl.textContent = kind === 'comm' ? 'INCOMING TRANSMISSION' + (cine.from ? ' — ' + cine.from : '') : '';
  fromEl.style.display = kind === 'comm' ? '' : 'none';
  active = true;
  framing = false;
  resetShots(); // (ease into the first shot from wherever the camera is)
  root.classList.add('open');
  chapterHud.cine(true);
  if (kind === 'comm' && !keyHandler) {
    keyHandler = (e) => {
      if (e.repeat || !handlers) return;
      if (e.code === 'KeyE' || e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        handlers.advance();
      }
    };
    document.addEventListener('keydown', keyHandler);
  }
}

// dialogue.js redraws on every line / choice. d: { speaker, meta, line,
// options (labels) | null, last, shotHint }
export function cineRender(d) {
  if (!active) return;
  speakerEl.textContent = '';
  const name = document.createElement('span');
  name.textContent = d.speaker;
  speakerEl.appendChild(name);
  if (d.meta) {
    const meta = document.createElement('span');
    meta.className = 'ct-meta';
    meta.textContent = d.meta;
    speakerEl.appendChild(meta);
  }
  lineEl.textContent = d.line;
  optionsEl.textContent = '';
  if (d.options) {
    d.options.forEach((label, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ct-opt';
      b.dataset.i = String(i);
      b.textContent = isTouch ? label : `${i + 1} · ${label}`;
      optionsEl.appendChild(b);
    });
    hintEl.textContent = isTouch ? 'TAP A CHOICE' : `1–${d.options.length} — CHOOSE`;
    skipEl.style.display = 'none'; // a choice is the player's: nothing to skip past
    setShot(1);
  } else {
    hintEl.textContent = isTouch
      ? (d.last ? 'TAP TO FINISH' : 'TAP TO CONTINUE')
      : (d.last ? 'E — FINISH' : 'E — CONTINUE');
    skipEl.style.display = '';
    // a new angle every other line, unless the line asks for one
    lineNo++;
    if (d.shotHint === 'close') setShot(1);
    else if (d.shotHint === 'two') setShot(0);
    else if (lineNo > 1 && lineNo % 2 === 1) setShot(1 - shot);
  }
}

// A plain talk (the #dlgPanel, no bars) with someone who is speaking to the
// pilot frames them the same way: dialogue.js opens it, and each line can
// change the angle. The walkers ask talkFramed() and hand their camera to
// cineCamera() as they do for a scene; a walker that lets the pilot walk away
// from a plain talk (src/walk.js) gives the camera back the moment they move.
let framing = false;
function resetShots() {
  shot = 0;
  lineNo = 0;
  blend = 0;
  cut = false;
  haveLook = false;
}
export function talkFrameOpen() {
  framing = true;
  resetShots();
}
export function talkFrameLine(hint, choosing) {
  if (!framing) return;
  if (choosing) return setShot(1);
  lineNo++;
  if (hint === 'close') setShot(1);
  else if (hint === 'two') setShot(0);
  else if (lineNo > 1 && lineNo % 2 === 1) setShot(1 - shot);
}
export function talkFrameClose() {
  framing = false;
}
// a talk of either kind has the camera on its speaker
export const talkFramed = () => (active && kind === 'talk') || framing;

function setShot(s) {
  if (s === shot) return;
  shot = s;
  if (blend >= 1) cut = true; // once settled, angles change on a cut
}

export function cineClose() {
  if (!active) return;
  active = false;
  handlers = null;
  if (root) root.classList.remove('open');
  if (keyHandler) {
    document.removeEventListener('keydown', keyHandler);
    keyHandler = null;
  }
  chapterHud.cine(false);
}

// A story beat is a scene the first time and plain talk after: cineOnce(key)
// is true once per key, ever (saved), so a governor's pitch or the Warden's
// greeting does not replay as a cutscene on every visit.
const SEEN_KEY = 'fgsf.cineSeen';
let seen = null;
export function cineOnce(key) {
  if (!seen) {
    seen = new Set();
    try {
      const raw = JSON.parse(localStorage.getItem(SEEN_KEY) || '[]');
      if (Array.isArray(raw)) seen = new Set(raw);
    } catch { /* session-only */ }
  }
  if (seen.has(key)) return false;
  seen.add(key);
  try { localStorage.setItem(SEEN_KEY, JSON.stringify([...seen])); } catch { /* session-only */ }
  return true;
}

export const cineActive = () => active;
// The walkers stand still and stop looking about while this is true.
export const cineHeld = () => active;
// A transmission is up (flight holds the ship's controls for it).
export const cineComm = () => active && kind === 'comm';

// The walker's camera, for the length of a talk. `player` and `speaker` are
// the two feet points in world space, `up` the local up. Returns true when it
// has placed the camera. The pose is worked out from the live points each
// frame and eased as an offset from the player, so a floating-origin rebase
// passes through it unharmed.
export function cineCamera(camera, player, speaker, up, delta = 0.016, height = 1.75) {
  if (!talkFramed() || !speaker) return false;
  _dir.subVectors(speaker, player);
  _dir.addScaledVector(up, -_dir.dot(up)); // flat, player -> speaker
  const dist = _dir.length();
  if (dist < 0.05) return false;
  _dir.multiplyScalar(1 / dist);
  _side.crossVectors(_dir, up).normalize(); // the player's right

  // `height` is how tall the speaker stands: the shots aim at the chest and
  // head of whoever it is, a citizen or a three-metre fleet captain
  const hk = height / 1.75;
  if (shot === 0) {
    // over the player's right shoulder, the speaker left of centre
    _want.copy(player).addScaledVector(_dir, -1.15).addScaledVector(_side, 0.8).addScaledVector(up, 1.75);
    _look.copy(speaker).addScaledVector(up, 1.25 * hk).addScaledVector(_side, -0.1);
  } else {
    // close on the speaker, from just off the player's line
    const back = Math.min(2.1, Math.max(1.5, dist * 0.6)) * Math.max(1, hk * 0.85);
    _want.copy(speaker).addScaledVector(_dir, -back).addScaledVector(_side, -0.55).addScaledVector(up, 1.6 * hk);
    _look.copy(speaker).addScaledVector(up, 1.3 * hk);
  }

  _want.sub(player); // as offsets from the player
  _look.sub(player);
  if (blend <= 0 && !cut) _off.subVectors(camera.position, player); // where the walker left it
  blend = Math.min(1, blend + delta / 0.7);
  if (cut) {
    _off.copy(_want);
    _lookNow.copy(_look);
    cut = false;
  } else {
    const k = 1 - Math.exp(-6 * delta);
    _off.lerp(_want, k);
    if (!haveLook) _lookNow.copy(_look);
    else _lookNow.lerp(_look, k);
  }
  haveLook = true;
  camera.position.copy(player).add(_off);
  camera.up.copy(up);
  camera.lookAt(_look.copy(player).add(_lookNow));
  return true;
}

// dev/verification handle
export function cineDebug() {
  return {
    active: () => active,
    kind: () => kind,
    shot: () => shot,
    text: () => (active ? { speaker: speakerEl.textContent, line: lineEl.textContent, options: [...optionsEl.children].map((b) => b.textContent), from: fromEl.textContent } : null),
    skip: () => handlers && handlers.skip(),
    advance: () => handlers && handlers.advance(),
    pick: (i) => handlers && handlers.pick(i),
  };
}
