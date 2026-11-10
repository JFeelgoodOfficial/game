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
// Nothing is created or destroyed per frame: updateSfx() only writes
// AudioParam targets. Master gain follows the settings panel (volume and
// mute) and drops to silence while the game is paused or on the menu.

import { settings, onSettingsChange } from './settings.js';

let ctx = null;
let master = null;
const v = {}; // voices: { engine, engineLp, saw, warp, warpA, warpB, air, airBp }
let warpLevel = 0;
let lastActive = false;
let levelDirty = true; // master gain needs rewriting (settings changed)

const SFX_LEVEL = 0.9; // relative to the music slider

function build() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return;
  ctx = new Ctx();
  master = ctx.createGain();
  master.gain.value = 0;
  master.connect(ctx.destination);

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
}

// Call once at boot. The context itself waits for the first gesture.
export function initSfx() {
  const start = () => {
    if (!ctx) build();
    else if (ctx.state === 'suspended') ctx.resume();
  };
  window.addEventListener('pointerdown', start);
  window.addEventListener('keydown', start);
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
  }
  if (!s.active) return;

  const muffle = s.standing ? 0.45 : 1;
  const thrust = s.thrust * (s.boost ? 1 : 0.55);
  v.engine.gain.setTargetAtTime((0.05 + 0.42 * thrust) * muffle, t, 0.12);
  v.engineLp.frequency.setTargetAtTime((110 + 520 * thrust) * (s.standing ? 0.6 : 1), t, 0.15);
  v.saw.frequency.setTargetAtTime(34 + 26 * thrust, t, 0.2);

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
}

// For headless verification (__debug.sfx.state()).
export function sfxState() {
  return {
    built: !!ctx,
    running: !!ctx && ctx.state === 'running',
    active: lastActive,
    warpLevel,
  };
}
