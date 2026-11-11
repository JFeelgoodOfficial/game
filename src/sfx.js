// Flight sound. Until now the cockpit was silent apart from the radio: no
// engine, no warp, no air. This is the hull's own noise — what a pilot hears
// through the seat, which is why it exists in vacuum.
//
// Everything is synthesised in Web Audio (the project's no-downloaded-assets
// rule): one AudioContext, opened on the first key or pointer press (browsers
// refuse to start audio before a user gesture), a shared noise buffer, and
// three voices that run for the whole session with their gains at zero:
//
//   engine — low-passed noise plus a low saw. Gain and brightness follow
//            thrust, so W opens it up and coasting lets it idle.
//   warp   — two detuned sines that climb as the drive spools, over a
//            band-passed hiss.
//   air    — band-passed noise for atmosphere: silent in space, a rush that
//            rises with density and speed, and a roar as the hull heats.
//
// The voices feed one bus: a short synthesised reverb (the cabin answering
// back) and a limiter, so stacked voices compress instead of clipping. A
// second, always-open bus carries the interface sounds — button clicks,
// chart selections, the camera shutter — from a small pool of voices that are
// built once and re-triggered by scheduling their parameters.
//
// Nothing is created or destroyed per frame: updateSfx() only writes
// AudioParam targets. Master gain follows the settings panel (volume and
// mute) and drops to silence while the game is paused or on the menu.

import { settings, onSettingsChange } from './settings.js';
import { setMusicDuck } from './music.js';

let ctx = null;
let master = null;
const v = {}; // voices: { engine, engineLp, saw, warp, warpA, warpB, air, airBp }
let warpLevel = 0;
let duckLevel = 1; // what the radio is being held to, 0..1
let lastActive = false;
let levelDirty = true; // master gain needs rewriting (settings changed)
let ui = null; // interface bus: open whenever sound is on, flying or not
let uiCount = 0; // interface sounds triggered (for sfxState)
const tone = [null, null]; // two re-triggerable tone voices: { osc, gain }
let tick = null; // one re-triggerable noise voice: gain after a band-pass

const UI_LEVEL = 0.5; // interface sounds, relative to the music slider
const REVERB_SEND = 0.2;
const DUCK_WARP = 0.45; // share of radio level given up at full warp
const DUCK_THRUST = 0.15; // ...and at full thrust

const SFX_LEVEL = 0.9; // relative to the music slider

function build() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return;
  ctx = new Ctx();
  // out: limiter in front of the speakers
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -10;
  limiter.knee.value = 6;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.2;
  limiter.connect(ctx.destination);

  master = ctx.createGain();
  master.gain.value = 0;
  master.connect(limiter);
  ui = ctx.createGain();
  ui.gain.value = 0;
  ui.connect(limiter);

  // Cabin reverb: an impulse of decaying noise, generated here. Short and
  // dark — a metal room a few metres across, not a hall.
  const irLen = Math.floor(ctx.sampleRate * 1.1);
  const ir = ctx.createBuffer(2, irLen, ctx.sampleRate);
  let rs = 0x9e3779b9;
  for (let ch = 0; ch < 2; ch++) {
    const id = ir.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < irLen; i++) {
      rs = (Math.imul(rs, 1664525) + 1013904223) >>> 0;
      const white = (rs / 4294967296) * 2 - 1;
      lp += (white - lp) * 0.35; // roll the top off
      const k = i / irLen;
      id[i] = lp * Math.exp(-5.5 * k) * (1 - k);
    }
  }
  const reverb = ctx.createConvolver();
  reverb.buffer = ir;
  const send = ctx.createGain();
  send.gain.value = REVERB_SEND;
  master.connect(send);
  ui.connect(send);
  send.connect(reverb).connect(limiter);

  // deterministic noise, long enough that the loop is not audible
  const len = Math.floor(ctx.sampleRate * 2.5);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let s = 0x1f123bb5;
  let brown = 0;
  for (let i = 0; i < len; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const white = (s / 4294967296) * 2 - 1;
    brown = (brown + white * 0.04) / 1.04; // leaky integrator: brown-ish
    d[i] = brown * 5 + white * 0.25;
  }
  const loop = (offset) => {
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.start(0, offset);
    return src;
  };

  // engine
  v.engineLp = ctx.createBiquadFilter();
  v.engineLp.type = 'lowpass';
  v.engineLp.frequency.value = 140;
  v.engine = ctx.createGain();
  v.engine.gain.value = 0;
  loop(0).connect(v.engineLp).connect(v.engine).connect(master);
  v.saw = ctx.createOscillator();
  v.saw.type = 'sawtooth';
  v.saw.frequency.value = 38;
  const sawGain = ctx.createGain();
  sawGain.gain.value = 0.22;
  v.saw.connect(sawGain).connect(v.engineLp);
  v.saw.start();
  // Two more engine layers over the rumble: a band of mid noise that opens
  // with thrust (the burn itself), and a thin turbine whine that climbs with
  // speed.
  v.burnBp = ctx.createBiquadFilter();
  v.burnBp.type = 'bandpass';
  v.burnBp.frequency.value = 260;
  v.burnBp.Q.value = 0.9;
  v.burn = ctx.createGain();
  v.burn.gain.value = 0;
  loop(0.4).connect(v.burnBp).connect(v.burn).connect(master);
  v.whineOsc = ctx.createOscillator();
  v.whineOsc.type = 'triangle';
  v.whineOsc.frequency.value = 190;
  v.whine = ctx.createGain();
  v.whine.gain.value = 0;
  v.whineOsc.connect(v.whine).connect(master);
  v.whineOsc.start();

  // warp
  v.warp = ctx.createGain();
  v.warp.gain.value = 0;
  v.warp.connect(master);
  v.warpA = ctx.createOscillator();
  v.warpB = ctx.createOscillator();
  v.warpA.type = v.warpB.type = 'sine';
  v.warpA.frequency.value = 110;
  v.warpB.frequency.value = 111.5;
  v.warpA.connect(v.warp);
  v.warpB.connect(v.warp);
  v.warpA.start();
  v.warpB.start();
  const hiss = ctx.createBiquadFilter();
  hiss.type = 'bandpass';
  hiss.frequency.value = 2600;
  hiss.Q.value = 0.8;
  const hissGain = ctx.createGain();
  hissGain.gain.value = 0.5;
  loop(0.9).connect(hiss).connect(hissGain).connect(v.warp);

  // air
  v.airBp = ctx.createBiquadFilter();
  v.airBp.type = 'bandpass';
  v.airBp.frequency.value = 500;
  v.airBp.Q.value = 0.6;
  v.air = ctx.createGain();
  v.air.gain.value = 0;
  loop(1.7).connect(v.airBp).connect(v.air).connect(master);

  // interface voices: silent oscillators and a noise tap, waiting to be played
  for (let i = 0; i < tone.length; i++) {
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    const gain = ctx.createGain();
    gain.gain.value = 0;
    osc.connect(gain).connect(ui);
    osc.start();
    tone[i] = { osc, gain };
  }
  const tickBp = ctx.createBiquadFilter();
  tickBp.type = 'bandpass';
  tickBp.frequency.value = 3200;
  tickBp.Q.value = 1.4;
  tick = ctx.createGain();
  tick.gain.value = 0;
  loop(2.1).connect(tickBp).connect(tick).connect(ui);
}

// One enveloped note on a pooled voice: jump to f0, glide to f1, a 4 ms
// attack and an exponential tail of time-constant `tau`.
function note(voice, f0, f1, peak, tau, at) {
  const { osc, gain } = voice;
  osc.frequency.cancelScheduledValues(at);
  osc.frequency.setValueAtTime(f0, at);
  osc.frequency.exponentialRampToValueAtTime(f1, at + tau * 2.5);
  gain.gain.cancelScheduledValues(at);
  gain.gain.setValueAtTime(0, at);
  gain.gain.linearRampToValueAtTime(peak, at + 0.004);
  gain.gain.setTargetAtTime(0, at + 0.004, tau);
}

// Interface sounds. Safe to call before the first gesture (silently ignored).
//   click    any button: a short high tick
//   select   a chart body picked: a rising blip
//   engage   autopilot committed: two voices a fifth apart, sweeping up
//   shutter  photo taken: a noise snap
//   toggle   a cockpit switch thrown: a lower, rounder click
export function uiSound(kind) {
  if (!ctx || ctx.state !== 'running' || settings.muted) return;
  const t = ctx.currentTime;
  uiCount++;
  if (kind === 'select') note(tone[0], 880, 1320, 0.22, 0.05, t);
  else if (kind === 'engage') {
    note(tone[0], 440, 880, 0.2, 0.12, t);
    note(tone[1], 660, 1320, 0.14, 0.14, t + 0.05);
  } else if (kind === 'shutter') {
    tick.gain.cancelScheduledValues(t);
    tick.gain.setValueAtTime(0.9, t);
    tick.gain.setTargetAtTime(0, t + 0.01, 0.035);
  } else if (kind === 'toggle') note(tone[1], 520, 390, 0.2, 0.03, t);
  else note(tone[0], 1500, 1100, 0.14, 0.018, t);
}

// Call once at boot. The context itself waits for the first gesture.
export function initSfx() {
  const start = () => {
    if (!ctx) build();
    else if (ctx.state === 'suspended') ctx.resume();
  };
  window.addEventListener('pointerdown', start);
  window.addEventListener('keydown', start);
  // Every DOM button in the game — menus, settings, radio, gallery — clicks.
  window.addEventListener('click', (e) => {
    if (e.target instanceof Element && e.target.closest('button')) uiSound('click');
  });
  onSettingsChange(() => { levelDirty = true; });
}

// Per frame. All fields 0..1 unless noted:
//   active   the ship is being flown (fly phase, not paused)
//   thrust   forward throttle; boost true when W's full thrust is on
//   warp     the warp drive is engaged
//   atmo     atmosphere density at the ship
//   speed    airspeed as a fraction of the speed cap
//   heat     hull heat
//   standing the pilot is out of the seat (the hull sounds further away)
export function updateSfx(dt, s) {
  if (!ctx || ctx.state !== 'running') return;
  const t = ctx.currentTime;
  if (s.active !== lastActive || levelDirty) {
    lastActive = s.active;
    levelDirty = false;
    const level = s.active && !settings.muted ? settings.musicVolume * SFX_LEVEL : 0;
    master.gain.setTargetAtTime(level, t, 0.15);
    ui.gain.setTargetAtTime(settings.muted ? 0 : settings.musicVolume * UI_LEVEL, t, 0.05);
  }
  if (!s.active) {
    setMusicDuck(1);
    return;
  }

  const muffle = s.standing ? 0.45 : 1;
  const thrust = s.thrust * (s.boost ? 1 : 0.55);
  v.engine.gain.setTargetAtTime((0.05 + 0.42 * thrust) * muffle, t, 0.12);
  v.engineLp.frequency.setTargetAtTime((110 + 520 * thrust) * (s.standing ? 0.6 : 1), t, 0.15);
  v.saw.frequency.setTargetAtTime(34 + 26 * thrust, t, 0.2);
  // the burn bites faster than the rumble swells, so a throttle-up has an edge
  v.burn.gain.setTargetAtTime(0.3 * thrust * thrust * muffle, t, 0.05);
  v.burnBp.frequency.setTargetAtTime(220 + 380 * thrust, t, 0.1);
  v.whine.gain.setTargetAtTime((0.004 + 0.022 * thrust) * (0.4 + 0.6 * s.speed) * muffle, t, 0.2);
  v.whineOsc.frequency.setTargetAtTime(190 + 420 * s.speed + 60 * thrust, t, 0.3);

  warpLevel += ((s.warp ? 1 : 0) - warpLevel) * Math.min(1, dt * (s.warp ? 1.6 : 5));
  v.warp.gain.setTargetAtTime(warpLevel * 0.16 * muffle, t, 0.06);
  if (warpLevel > 0.002) {
    const f = 110 + 620 * warpLevel * warpLevel;
    v.warpA.frequency.setTargetAtTime(f, t, 0.05);
    v.warpB.frequency.setTargetAtTime(f * 1.012 + 2, t, 0.05);
  }

  const rush = s.atmo * (0.25 + 0.75 * s.speed);
  v.air.gain.setTargetAtTime(Math.min(0.6, rush * 0.5 + s.heat * 0.35) * muffle, t, 0.2);
  v.airBp.frequency.setTargetAtTime(320 + 1500 * s.speed + 600 * s.heat, t, 0.25);

  // The radio gives ground to the ship when the ship is loud.
  duckLevel = 1 - DUCK_WARP * warpLevel - DUCK_THRUST * thrust;
  setMusicDuck(duckLevel);
}

// For headless verification (__debug.sfx.state()).
export function sfxState() {
  return {
    built: !!ctx,
    running: !!ctx && ctx.state === 'running',
    active: lastActive,
    warpLevel,
    uiCount,
    duck: duckLevel,
    uiGain: ui ? ui.gain.value : 0,
  };
}
