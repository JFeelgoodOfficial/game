// Sky City audio — the Lance, the dragon's death, the recovery drones. Every
// sound is synthesised in Web Audio (the project's no-downloaded-assets rule),
// the same arrangement as warzone-audio.js: one AudioContext opened lazily on
// the first sound (which always follows a key or mouse press, so it starts
// unsuspended), one shared noise buffer, short-lived node graphs per event,
// and one long-lived voice for the drones' rotors.
//
// Level follows the settings panel (the music slider and mute), read each time
// something plays.

import { settings } from '../src/settings.js';

let ctx = null;
let master = null;
let noise = null;
let drone = null; // { gain, a, b, lfo, bp } — the rotor voice, built on first use
let plays = 0; // sounds triggered, for headless verification

const LEVEL = 0.8; // relative to the music slider

function ensure() {
  if (!ctx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    ctx = new Ctx();
    master = ctx.createGain();
    // a limiter: the explosion stacks a dozen layers and must not clip
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.knee.value = 8;
    comp.ratio.value = 8;
    comp.attack.value = 0.002;
    comp.release.value = 0.25;
    master.connect(comp).connect(ctx.destination);
    const len = Math.floor(ctx.sampleRate * 2);
    noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noise.getChannelData(0);
    let s = 0x51f15e77;
    for (let i = 0; i < len; i++) {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      d[i] = (s / 4294967296) * 2 - 1;
    }
  }
  if (ctx.state === 'closed') return null;
  if (ctx.state === 'suspended') ctx.resume();
  master.gain.value = settings.muted ? 0 : settings.musicVolume * LEVEL;
  return ctx;
}

// A burst of filtered noise: `type` filter swept f0 -> f1, peak gain, attack,
// then an exponential tail of time-constant tau. Stops itself.
function noiseHit(at, type, f0, f1, q, peak, attack, tau, dur) {
  const src = ctx.createBufferSource();
  src.buffer = noise;
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.Q.value = q;
  f.frequency.setValueAtTime(f0, at);
  f.frequency.exponentialRampToValueAtTime(Math.max(f1, 20), at + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(peak, at + attack);
  g.gain.setTargetAtTime(0, at + attack, tau);
  src.connect(f).connect(g).connect(master);
  src.start(at, (at * 0.37) % 1.5);
  src.stop(at + dur + 0.1);
}

// An oscillator gliding f0 -> f1 with the same envelope shape.
function tone(at, wave, f0, f1, peak, attack, tau, dur, detune = 0) {
  const o = ctx.createOscillator();
  o.type = wave;
  o.detune.value = detune;
  o.frequency.setValueAtTime(f0, at);
  o.frequency.exponentialRampToValueAtTime(Math.max(f1, 10), at + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(peak, at + attack);
  g.gain.setTargetAtTime(0, at + attack, tau);
  o.connect(g).connect(master);
  o.start(at);
  o.stop(at + dur + 0.1);
}

// The coil winding up: a whine climbing three octaves over the charge, with
// a hiss gathering under it. `seconds` is the charge time, so the top of the
// climb lands exactly on the shot.
export function playLanceCharge(seconds) {
  if (!ensure()) return;
  plays++;
  const t = ctx.currentTime;
  for (const [wave, det, peak] of [['sawtooth', 0, 0.07], ['sawtooth', 14, 0.06], ['sine', 0, 0.12]]) {
    const o = ctx.createOscillator();
    o.type = wave;
    o.detune.value = det;
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(1500, t + seconds);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + seconds);
    g.gain.setTargetAtTime(0, t + seconds, 0.02);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + seconds + 0.2);
  }
  const src = ctx.createBufferSource();
  src.buffer = noise;
  src.loop = true;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 3;
  bp.frequency.setValueAtTime(700, t);
  bp.frequency.exponentialRampToValueAtTime(6000, t + seconds);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.16, t + seconds);
  g.gain.setTargetAtTime(0, t + seconds, 0.02);
  src.connect(bp).connect(g).connect(master);
  src.start(t);
  src.stop(t + seconds + 0.2);
}

// The shot: a hard crack as the beam lights, a screaming mid that tears
// downward, two fat detuned saws underneath falling an octave, a sub thump for
// the recoil, and a sizzle left hanging in the air.
export function playLanceFire() {
  if (!ensure()) return;
  plays++;
  const t = ctx.currentTime;
  noiseHit(t, 'highpass', 3000, 1200, 0.7, 0.55, 0.002, 0.05, 0.35); // crack
  tone(t, 'sawtooth', 2600, 260, 0.2, 0.004, 0.22, 0.9); // the tear
  tone(t, 'square', 1300, 180, 0.09, 0.004, 0.2, 0.8, 9);
  tone(t, 'sawtooth', 110, 52, 0.32, 0.006, 0.34, 1.2); // body
  tone(t, 'sawtooth', 110, 52, 0.28, 0.006, 0.34, 1.2, 23);
  tone(t, 'sine', 95, 30, 0.6, 0.004, 0.2, 0.8); // recoil thump
  noiseHit(t + 0.03, 'bandpass', 5200, 900, 1.2, 0.26, 0.02, 0.4, 1.6); // sizzle
}

// The dragon coming apart. `chain` is how many body segments detonate and
// `gap` the seconds between them, so the pops line up with the fireballs.
// Layers: the first crack; a sub boom that drops through the floor; a long
// rolling rumble; one pop per segment running down the body; and a slow fall
// of crackle as the wreckage burns on its way down.
export function playDragonExplosion(chain = 16, gap = 0.07) {
  if (!ensure()) return;
  plays++;
  const t = ctx.currentTime;
  noiseHit(t, 'highpass', 1800, 500, 0.6, 0.8, 0.002, 0.07, 0.5); // crack
  tone(t, 'sine', 82, 24, 1.0, 0.006, 0.7, 3.2); // sub boom
  tone(t, 'triangle', 140, 34, 0.5, 0.006, 0.4, 2.2);
  noiseHit(t, 'lowpass', 1400, 90, 0.7, 0.9, 0.01, 1.3, 5.5); // rumble
  noiseHit(t + 0.05, 'bandpass', 420, 110, 0.9, 0.5, 0.05, 1.7, 5.5); // roll
  for (let i = 0; i < chain; i++) {
    const at = t + 0.05 + i * gap;
    // pops get smaller and higher toward the tail
    const k = i / Math.max(chain - 1, 1);
    tone(at, 'sine', 120 + 90 * k, 38 + 30 * k, 0.55 * (1 - 0.6 * k), 0.004, 0.16, 0.7);
    noiseHit(at, 'bandpass', 900 + 1400 * k, 240, 0.8, 0.38 * (1 - 0.5 * k), 0.003, 0.11, 0.5);
  }
  // crackle: sparse bright ticks thinning out over four seconds
  let s = 0x3c6ef372;
  let at = t + 0.6;
  for (let i = 0; i < 46; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    at += 0.02 + (s / 4294967296) * 0.16 * (1 + i / 14);
    noiseHit(at, 'bandpass', 2600 + (s % 2800), 1500, 4, 0.14 * Math.exp(-i / 22), 0.001, 0.012, 0.08);
  }
}

// The rotor voice: two saws beating against each other through a band-pass,
// chopped by a fast tremolo (the blades). Runs silent between rescues.
function buildDrone() {
  const gain = ctx.createGain();
  gain.gain.value = 0;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 520;
  bp.Q.value = 1.1;
  const chop = ctx.createGain();
  chop.gain.value = 0.6;
  const lfo = ctx.createOscillator();
  lfo.type = 'square';
  lfo.frequency.value = 38;
  const depth = ctx.createGain();
  depth.gain.value = 0.4;
  lfo.connect(depth).connect(chop.gain);
  const a = ctx.createOscillator();
  const b = ctx.createOscillator();
  a.type = b.type = 'sawtooth';
  a.frequency.value = 176;
  b.frequency.value = 181;
  a.connect(bp);
  b.connect(bp);
  bp.connect(chop).connect(gain).connect(master);
  a.start(); b.start(); lfo.start();
  drone = { gain, a, b, lfo, bp };
}

// Per physics tick while a race is on. level 0..1 is how loud the nearest
// working drone is at the listener; load 0..1 is how hard it is working (0
// free flight, 1 hauling a car), which pulls the pitch down and thickens it.
export function setDrone(level, load = 0) {
  if (level <= 0 && !drone) return;
  if (!ensure()) return;
  if (!drone) buildDrone();
  const t = ctx.currentTime;
  drone.gain.gain.setTargetAtTime(Math.min(level, 1) * 0.3, t, 0.08);
  const f = 205 - 60 * load;
  drone.a.frequency.setTargetAtTime(f, t, 0.15);
  drone.b.frequency.setTargetAtTime(f * 1.028, t, 0.15);
  drone.lfo.frequency.setTargetAtTime(44 - 14 * load, t, 0.15);
  drone.bp.frequency.setTargetAtTime(640 - 260 * load, t, 0.15);
}

// The wire taking the weight: a metallic ping and a ratchet of clicks.
export function playHook(level = 1) {
  if (level <= 0.02 || !ensure()) return;
  plays++;
  const t = ctx.currentTime;
  tone(t, 'triangle', 1480, 1320, 0.3 * level, 0.002, 0.12, 0.6);
  tone(t, 'sine', 2210, 2100, 0.16 * level, 0.002, 0.09, 0.5);
  for (let i = 0; i < 6; i++) noiseHit(t + 0.06 + i * 0.045, 'bandpass', 3400, 3000, 6, 0.2 * level, 0.001, 0.008, 0.04);
  tone(t + 0.05, 'sine', 160, 70, 0.3 * level, 0.004, 0.1, 0.4); // the load coming on
}

// A car set down in its bay: a dull thunk and the suspension settling.
export function playSetDown(level = 1) {
  if (level <= 0.02 || !ensure()) return;
  plays++;
  const t = ctx.currentTime;
  tone(t, 'sine', 110, 46, 0.5 * level, 0.004, 0.09, 0.4);
  noiseHit(t, 'lowpass', 900, 200, 0.7, 0.3 * level, 0.003, 0.06, 0.3);
  tone(t + 0.12, 'triangle', 300, 220, 0.08 * level, 0.01, 0.08, 0.3);
}

// For headless verification.
export function skyAudioState() {
  return {
    built: !!ctx,
    running: !!ctx && ctx.state === 'running',
    plays,
    drone: drone ? drone.gain.gain.value : 0,
    level: master ? master.gain.value : 0,
  };
}
