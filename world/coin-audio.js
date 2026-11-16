// stevenlacey — sound. Square-wave blips, in keeping with the pixels.
//
// Effects only: the ship's radio keeps playing through the visit, and a second
// tune under it would only fight it. One AudioContext, made on the first sound
// (by then a key has been pressed, so the browser allows it) and closed when
// the walker tears down, like every other world's audio here.

import { settings } from '../src/settings.js';

let ctx = null;
let out = null;

function ensure() {
  if (ctx) return true;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return false;
  try {
    ctx = new AC();
    out = ctx.createGain();
    out.connect(ctx.destination);
  } catch {
    ctx = null;
    return false;
  }
  return true;
}

// One note: frequency sliding f0 -> f1 over `dur` seconds, starting `at` from now.
function note(f0, f1, dur, at = 0, type = 'square', vol = 0.12) {
  const t = ctx.currentTime + at;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(f1, 20), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g);
  g.connect(out);
  o.start(t);
  o.stop(t + dur + 0.02);
}

const SOUNDS = {
  jump: () => note(280, 520, 0.09),
  land: () => note(140, 90, 0.05, 0, 'triangle'),
  dash: () => note(700, 180, 0.14, 0, 'sawtooth', 0.08),
  slash: () => note(900, 300, 0.07, 0, 'sawtooth', 0.09),
  hit: () => note(220, 110, 0.1),
  hurt: () => { note(300, 80, 0.22, 0, 'sawtooth'); },
  select: () => note(520, 520, 0.04, 0, 'square', 0.07),
  ok: () => note(660, 880, 0.06, 0, 'square', 0.08),
  flip: () => { note(300, 1200, 0.5, 0, 'triangle'); note(1200, 300, 0.5, 0.5, 'triangle'); },
  battle: () => { note(330, 330, 0.08); note(440, 440, 0.08, 0.09); note(660, 660, 0.14, 0.18); },
  win: () => { note(523, 523, 0.1); note(659, 659, 0.1, 0.1); note(784, 784, 0.1, 0.2); note(1046, 1046, 0.25, 0.3); },
  lose: () => { note(392, 392, 0.14); note(330, 330, 0.14, 0.15); note(262, 200, 0.3, 0.3); },
  gain: () => { note(660, 660, 0.08); note(880, 880, 0.08, 0.09); note(1320, 1320, 0.2, 0.18); },
  rest: () => { note(440, 440, 0.12, 0, 'triangle'); note(554, 554, 0.12, 0.12, 'triangle'); note(659, 659, 0.3, 0.24, 'triangle'); },
  boss: () => note(90, 50, 0.4, 0, 'sawtooth', 0.14),
};

export function blip(kind) {
  if (settings.muted || !ensure()) return;
  const fn = SOUNDS[kind];
  if (!fn) return;
  out.gain.value = settings.sfxVolume ?? settings.musicVolume ?? 0.6;
  try {
    if (ctx.state === 'suspended') ctx.resume();
    fn();
  } catch { /* a sound that fails to play is not worth a crash */ }
}

export function closeCoinAudio() {
  if (!ctx) return;
  try { ctx.close(); } catch { /* already closed */ }
  ctx = null;
  out = null;
}
