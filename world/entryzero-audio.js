// Entry Zero's sounds (GDD 5.7.5), synthesised as world/skycity-audio.js
// does it: one private context, a limiter, a noise buffer, and voices built
// the first time they are wanted. Nothing is loaded.
//
//   setHum(level)            the submersible's drive, 0..1 with how hard it is pushed
//   bandClick(i)             the lamp stepping to band i
//   setRadio(on, near)       the radio band: static while it is on, and what is
//                            out there coming through as the lamp finds it (0..1)
//   doseTicks(rate, dt)      the dose meter, `rate` clicks a second on average
//   logChime()               something has been logged
//   setRoar(level)           the firewall, 0..1 with how near it is and whether it is being burnt
//   hush()                   everything long-lived down to nothing (leaving)

import { settings } from '../src/settings.js';

let ctx = null, master = null, noise = null;
let hum = null, radio = null, roar = null;
let plays = 0;
let seed = 0x2e20e;
const LEVEL = 0.8; // relative to the music slider

function ensure() {
  if (!ctx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    ctx = new Ctx();
    master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 6;
    master.connect(comp).connect(ctx.destination);
    const len = Math.floor(ctx.sampleRate * 2);
    noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noise.getChannelData(0);
    let s = 0x0e2e0;
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
const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);

function loopNoise(c) {
  const src = c.createBufferSource();
  src.buffer = noise;
  src.loop = true;
  return src;
}

// A short voice: an oscillator with a quick attack and an exponential tail.
function tone(type, f0, f1, peak, tau, dur) {
  const c = ensure();
  if (!c) return;
  const at = c.currentTime;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, at);
  o.frequency.exponentialRampToValueAtTime(f1, at + dur);
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(peak, at + 0.004);
  g.gain.setTargetAtTime(0, at + 0.004, tau);
  o.connect(g).connect(master);
  o.start(at);
  o.stop(at + dur + 0.1);
  plays++;
}

function buildHum(c) {
  // two low voices a few hertz apart, behind a filter that opens with the push
  const a = c.createOscillator(), b = c.createOscillator();
  a.type = 'sawtooth';
  b.type = 'triangle';
  a.frequency.value = 46;
  b.frequency.value = 49.5;
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 120;
  const g = c.createGain();
  g.gain.value = 0;
  a.connect(lp);
  b.connect(lp);
  lp.connect(g).connect(master);
  a.start();
  b.start();
  hum = { g, lp, level: 0 };
}

function buildRadio(c) {
  // static: narrow noise, always there on the band
  const n = loopNoise(c);
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 2100;
  bp.Q.value = 1.2;
  const sg = c.createGain();
  sg.gain.value = 0;
  n.connect(bp).connect(sg).connect(master);
  n.start();
  // what is out there: a low call, swelling slowly, with a second voice a
  // fifth above that drifts against it
  const o1 = c.createOscillator(), o2 = c.createOscillator();
  o1.type = 'sine';
  o2.type = 'sine';
  o1.frequency.value = 82;
  o2.frequency.value = 123.6;
  const swell = c.createGain();
  swell.gain.value = 0.55;
  const lfo = c.createOscillator(), depth = c.createGain();
  lfo.frequency.value = 0.19;
  depth.gain.value = 0.45;
  lfo.connect(depth).connect(swell.gain);
  const cg = c.createGain();
  cg.gain.value = 0;
  o1.connect(swell);
  o2.connect(swell);
  swell.connect(cg).connect(master);
  o1.start();
  o2.start();
  lfo.start();
  radio = { sg, cg, on: 0, near: 0 };
}

export function setHum(level) {
  const c = ensure();
  if (!c) return;
  if (!hum) buildHum(c);
  hum.level = level;
  hum.g.gain.setTargetAtTime(0.05 + 0.11 * level, c.currentTime, 0.25);
  hum.lp.frequency.setTargetAtTime(110 + 260 * level, c.currentTime, 0.3);
}

export function bandClick(i) {
  tone('square', 520 + i * 130, 480 + i * 130, 0.05, 0.03, 0.12);
}

export function setRadio(on, near) {
  if (!on && !radio) return;
  const c = ensure();
  if (!c) return;
  if (!radio) buildRadio(c);
  radio.on = on ? 1 : 0;
  radio.near = near;
  radio.sg.gain.setTargetAtTime(on ? 0.05 * (1 - 0.7 * near) : 0, c.currentTime, 0.08);
  radio.cg.gain.setTargetAtTime(on ? 0.2 * near * near : 0, c.currentTime, 0.2);
}

let tickDue = 0;
export function doseTicks(rate, dt) {
  if (rate <= 0) return;
  // (clicks arrive at random, as counts do: a rate, not a rhythm)
  tickDue -= dt * rate;
  if (tickDue > 0) return;
  tickDue = -Math.log(1 - rnd() * 0.98);
  tone('square', 3400, 2600, 0.035, 0.006, 0.03);
}

export function setRoar(level) {
  if (level <= 0 && !roar) return;
  const c = ensure();
  if (!c) return;
  if (!roar) {
    // fire: low noise, with a slow unevenness to it
    const n = loopNoise(c);
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 260;
    const g = c.createGain();
    g.gain.value = 0;
    const lfo = c.createOscillator(), depth = c.createGain();
    lfo.frequency.value = 0.7;
    depth.gain.value = 90;
    lfo.connect(depth).connect(lp.frequency);
    n.connect(lp).connect(g).connect(master);
    n.start();
    lfo.start();
    roar = { g, lp, level: 0 };
  }
  roar.level = level;
  roar.g.gain.setTargetAtTime(0.32 * level, c.currentTime, 0.3);
  roar.lp.frequency.setTargetAtTime(200 + 700 * level, c.currentTime, 0.4);
}

export function logChime() {
  tone('sine', 660, 660, 0.09, 0.25, 0.9);
  tone('sine', 990, 990, 0.06, 0.3, 1.1);
}

export function hush() {
  if (!ctx) return;
  if (hum) hum.g.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
  if (roar) roar.g.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
  if (radio) {
    radio.sg.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
    radio.cg.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
    radio.on = 0;
  }
}

// headless verification
export const ezAudioState = () => ({ built: !!ctx, running: !!ctx && ctx.state === 'running', plays, hum: hum ? +hum.level.toFixed(2) : null, radio: radio ? { on: radio.on, near: +radio.near.toFixed(2) } : null, roar: roar ? +roar.level.toFixed(2) : null });
