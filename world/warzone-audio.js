// Warzone audio — every sound synthesized in Web Audio, no files (the
// project's no-downloaded-assets rule). One AudioContext, opened lazily on the
// first shot (a mouse press is a user gesture, so it starts unsuspended), one
// shared white-noise buffer, and short-lived node graphs per event.
//
// The player's rifle is three layers, the same split Claude of Duty's foley
// uses: a high-passed noise crack (the supersonic snap), a pitched-down sine
// thump (the chamber pressure you feel), and a band-passed noise tail that
// stands in for the street's reflections. Enemy fire is the same recipe,
// distance-filtered, attenuated and panned — you hear where it comes from.

let ctx = null;
let master = null;
let noise = null;

function ensure() {
  if (ctx) return ctx.state === 'closed' ? null : ctx;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  ctx = new Ctx();
  master = ctx.createGain();
  master.gain.value = 0.55;
  // A soft limiter so a full-auto burst under enemy fire never clips.
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.knee.value = 8;
  comp.ratio.value = 6;
  comp.attack.value = 0.002;
  comp.release.value = 0.12;
  master.connect(comp).connect(ctx.destination);
  const len = Math.floor(ctx.sampleRate * 1.2);
  noise = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = noise.getChannelData(0);
  // Deterministic LCG noise — no Math.random in anything the game produces.
  let s = 0x2545f491;
  for (let i = 0; i < len; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    d[i] = (s / 4294967296) * 2 - 1;
  }
  return ctx;
}

function noiseSrc(offset = 0) {
  const src = ctx.createBufferSource();
  src.buffer = noise;
  src.start(ctx.currentTime, offset % 1.0);
  return src;
}

function env(gainNode, t0, peak, attack, decay) {
  const g = gainNode.gain;
  g.setValueAtTime(0.0001, t0);
  g.exponentialRampToValueAtTime(peak, t0 + attack);
  g.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
}

let shotN = 0;

// Player rifle shot.
export function playShot() {
  if (!ensure()) return;
  const t = ctx.currentTime;
  const off = (shotN++ * 0.137) % 1;

  // Crack: bright noise, very fast.
  const crack = noiseSrc(off);
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 1800;
  const cg = ctx.createGain();
  env(cg, t, 0.9, 0.001, 0.07);
  crack.connect(hp).connect(cg).connect(master);
  crack.stop(t + 0.12);

  // Thump: sine sweeping 150 -> 45 Hz.
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(150, t);
  osc.frequency.exponentialRampToValueAtTime(45, t + 0.12);
  const og = ctx.createGain();
  env(og, t, 0.85, 0.002, 0.16);
  osc.connect(og).connect(master);
  osc.start(t);
  osc.stop(t + 0.2);

  // Tail: mid band noise, slow decay — the street answering back.
  const tail = noiseSrc(off + 0.5);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 700;
  bp.Q.value = 0.7;
  const tg = ctx.createGain();
  env(tg, t + 0.01, 0.22, 0.01, 0.55);
  tail.connect(bp).connect(tg).connect(master);
  tail.stop(t + 0.7);
}

// Enemy shot at distance `dist` (units), pan -1..1 (left..right).
export function playEnemyShot(dist, pan) {
  if (!ensure()) return;
  const t = ctx.currentTime;
  const off = (shotN++ * 0.211) % 1;
  const near = 1 / (1 + dist * 0.045);
  const panner = ctx.createStereoPanner();
  panner.pan.value = Math.max(-1, Math.min(1, pan));
  panner.connect(master);

  const src = noiseSrc(off);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  // Distance eats the highs first.
  lp.frequency.value = 900 + 6000 * near;
  const g = ctx.createGain();
  env(g, t, 0.7 * near + 0.02, 0.002, 0.1 + (1 - near) * 0.25);
  src.connect(lp).connect(g).connect(panner);
  src.stop(t + 0.5);

  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(220, t);
  osc.frequency.exponentialRampToValueAtTime(70, t + 0.08);
  const og = ctx.createGain();
  env(og, t, 0.3 * near + 0.01, 0.002, 0.09);
  osc.connect(og).connect(panner);
  osc.start(t);
  osc.stop(t + 0.15);
}

// A round snapping past your head: short, bright, panned.
export function playWhiz(pan) {
  if (!ensure()) return;
  const t = ctx.currentTime;
  const src = noiseSrc((shotN++ * 0.31) % 1);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.setValueAtTime(5200, t);
  bp.frequency.exponentialRampToValueAtTime(1400, t + 0.12);
  bp.Q.value = 3;
  const panner = ctx.createStereoPanner();
  panner.pan.value = Math.max(-1, Math.min(1, pan));
  const g = ctx.createGain();
  env(g, t, 0.35, 0.01, 0.12);
  src.connect(bp).connect(g).connect(panner).connect(master);
  src.stop(t + 0.2);
}

// Hitmarker tick. kill = the heavier double tick.
export function playHit(kill, head) {
  if (!ensure()) return;
  const t = ctx.currentTime;
  const n = kill ? 2 : 1;
  for (let i = 0; i < n; i++) {
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = head ? 2600 : 1900;
    const g = ctx.createGain();
    env(g, t + i * 0.06, 0.12, 0.001, 0.035);
    o.connect(g).connect(master);
    o.start(t + i * 0.06);
    o.stop(t + i * 0.06 + 0.06);
  }
}

// Body-armor impact on the player: a dull, low thud.
export function playHurt() {
  if (!ensure()) return;
  const t = ctx.currentTime;
  const src = noiseSrc((shotN++ * 0.17) % 1);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 380;
  const g = ctx.createGain();
  env(g, t, 0.8, 0.003, 0.18);
  src.connect(lp).connect(g).connect(master);
  src.stop(t + 0.25);
}

// Reload foley: mag out, mag in, bolt. `step` 0..2.
export function playReload(step) {
  if (!ensure()) return;
  const t = ctx.currentTime;
  const freqs = [900, 1300, 2200];
  const src = noiseSrc((shotN++ * 0.07) % 1);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = freqs[step] ?? 1200;
  bp.Q.value = 4;
  const g = ctx.createGain();
  env(g, t, step === 2 ? 0.5 : 0.35, 0.002, step === 2 ? 0.09 : 0.06);
  src.connect(bp).connect(g).connect(master);
  src.stop(t + 0.15);
}

export function playDryFire() {
  if (!ensure()) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  o.type = 'square';
  o.frequency.value = 3100;
  const g = ctx.createGain();
  env(g, t, 0.08, 0.001, 0.02);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + 0.04);
}

export function playPickup() {
  if (!ensure()) return;
  const t = ctx.currentTime;
  for (let i = 0; i < 2; i++) {
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = i ? 1320 : 880;
    const g = ctx.createGain();
    env(g, t + i * 0.07, 0.12, 0.004, 0.09);
    o.connect(g).connect(master);
    o.start(t + i * 0.07);
    o.stop(t + i * 0.07 + 0.12);
  }
}

// ---------------------------------------------------------------------------
// The rest of the arsenal. Each takes the carbine's three-layer recipe and
// bends it: the scattergun is all thump and a long tail, the lance a rising
// whine cut off by a crack, the launcher a hollow cough, the caster a buzz.
// ---------------------------------------------------------------------------

function tone(type, f0, f1, t, dur, peak, dest, attack = 0.003) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = ctx.createGain();
  env(g, t, peak, attack, dur);
  o.connect(g).connect(dest);
  o.start(t);
  o.stop(t + attack + dur + 0.05);
}

function burst(kind, freq, q, t, dur, peak, dest, offset = 0) {
  const src = noiseSrc(offset);
  const f = ctx.createBiquadFilter();
  f.type = kind;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ctx.createGain();
  env(g, t, peak, 0.002, dur);
  src.connect(f).connect(g).connect(dest);
  src.stop(t + dur + 0.1);
}

// id: an arsenal.js weapon id. charge01 scales the lance's weight.
export function playWeaponShot(id, charge01 = 1) {
  if (id === 'carbine') return playShot();
  if (!ensure()) return;
  const t = ctx.currentTime;
  const off = (shotN++ * 0.137) % 1;
  if (id === 'scatter') {
    burst('highpass', 900, 0.5, t, 0.13, 1.0, master, off);
    tone('sine', 120, 32, t, 0.26, 1.0, master);
    burst('bandpass', 420, 0.6, t + 0.01, 0.9, 0.34, master, off + 0.4);
  } else if (id === 'lance') {
    const k = 0.5 + 0.5 * charge01;
    tone('sawtooth', 2400, 180, t, 0.22, 0.32 * k, master);
    burst('highpass', 3200, 0.7, t, 0.09, 0.9 * k, master, off);
    tone('sine', 90, 28, t, 0.45, 0.95 * k, master);
    burst('bandpass', 1500, 2, t + 0.02, 1.1, 0.2 * k, master, off + 0.3);
  } else if (id === 'plasma') {
    tone('sine', 210, 60, t, 0.28, 0.85, master);
    burst('bandpass', 520, 1.2, t, 0.3, 0.55, master, off);
    tone('triangle', 900, 300, t, 0.18, 0.14, master);
  } else if (id === 'arc') {
    tone('sawtooth', 140 + (shotN % 5) * 23, 90, t, 0.07, 0.22, master, 0.001);
    burst('bandpass', 3800 + (shotN % 3) * 700, 5, t, 0.06, 0.3, master, off);
  }
}

// The lance's capacitor: one held oscillator whose pitch follows the charge.
let chargeOsc = null;
let chargeGain = null;
export function setChargeTone(level01) {
  if (level01 <= 0) {
    if (chargeOsc) {
      const t = ctx.currentTime;
      chargeGain.gain.cancelScheduledValues(t);
      chargeGain.gain.setTargetAtTime(0.0001, t, 0.02);
      chargeOsc.stop(t + 0.12);
      chargeOsc = null;
      chargeGain = null;
    }
    return;
  }
  if (!ensure()) return;
  const t = ctx.currentTime;
  if (!chargeOsc) {
    chargeOsc = ctx.createOscillator();
    chargeOsc.type = 'sawtooth';
    chargeGain = ctx.createGain();
    chargeGain.gain.value = 0.0001;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2600;
    chargeOsc.connect(lp).connect(chargeGain).connect(master);
    chargeOsc.start(t);
  }
  chargeOsc.frequency.setTargetAtTime(180 + 900 * level01 * level01, t, 0.03);
  chargeGain.gain.setTargetAtTime(0.03 + 0.07 * level01, t, 0.03);
}

export function playSwitch() {
  if (!ensure()) return;
  const t = ctx.currentTime;
  burst('bandpass', 1700, 5, t, 0.05, 0.3, master, (shotN++ * 0.09) % 1);
  burst('bandpass', 950, 4, t + 0.09, 0.06, 0.34, master, (shotN * 0.19) % 1);
}

// A blast at `dist` units, panned.
export function playExplosion(dist, pan = 0, size = 1) {
  if (!ensure()) return;
  const t = ctx.currentTime;
  const near = 1 / (1 + dist * 0.03);
  const p = ctx.createStereoPanner();
  p.pan.value = Math.max(-1, Math.min(1, pan));
  p.connect(master);
  tone('sine', 95 * (1.2 - 0.2 * size), 24, t, 0.5 + 0.3 * size, (0.5 + 0.5 * size) * near + 0.03, p);
  burst('lowpass', 500 + 3000 * near, 0.5, t, 0.5 + 0.5 * size, 0.8 * near + 0.03, p, (shotN++ * 0.23) % 1);
}

// ---------------------------------------------------------------------------
// Monsters. `size` 0..1 picks the register: a swarmling is a shriek, a titan
// is something you feel before you hear.
// ---------------------------------------------------------------------------

function panned(pan) {
  const p = ctx.createStereoPanner();
  p.pan.value = Math.max(-1, Math.min(1, pan));
  p.connect(master);
  return p;
}

// A roar: two detuned saws falling through a moving formant, over a growl of
// low noise. dist in units.
export function playRoar(size, dist, pan = 0) {
  if (!ensure()) return;
  const t = ctx.currentTime;
  const near = 1 / (1 + dist * 0.018);
  const dest = panned(pan);
  const dur = 0.7 + size * 1.3;
  const base = 150 - 105 * size;
  const formant = ctx.createBiquadFilter();
  formant.type = 'bandpass';
  formant.Q.value = 2.2;
  formant.frequency.setValueAtTime(900 - 400 * size, t);
  formant.frequency.exponentialRampToValueAtTime(260 - 120 * size, t + dur);
  const g = ctx.createGain();
  env(g, t, (0.5 + 0.5 * size) * near + 0.02, 0.08, dur);
  formant.connect(g).connect(dest);
  for (const det of [1, 1.013, 0.497]) {
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(base * det * 1.5, t);
    o.frequency.exponentialRampToValueAtTime(base * det * 0.62, t + dur);
    // a slow wobble, so it sounds like a throat rather than a synth
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 17 + size * 9;
    const lg = ctx.createGain();
    lg.gain.value = base * 0.09;
    lfo.connect(lg).connect(o.frequency);
    lfo.start(t);
    lfo.stop(t + dur + 0.2);
    o.connect(formant);
    o.start(t);
    o.stop(t + dur + 0.2);
  }
  burst('lowpass', 240 + 200 * (1 - size), 0.7, t, dur, (0.3 + 0.4 * size) * near + 0.01, dest, (shotN++ * 0.41) % 1);
}

// A footfall or a slam. size 0..1.
export function playStomp(size, dist, pan = 0) {
  if (!ensure()) return;
  const t = ctx.currentTime;
  const near = 1 / (1 + dist * 0.025);
  const dest = panned(pan);
  tone('sine', 70 - 30 * size, 22, t, 0.25 + 0.5 * size, (0.35 + 0.65 * size) * near + 0.01, dest);
  burst('lowpass', 300, 0.6, t, 0.2 + 0.3 * size, (0.2 + 0.4 * size) * near, dest, (shotN++ * 0.29) % 1);
}

// A swarmling committing to its dive.
export function playShriek(dist, pan = 0) {
  if (!ensure()) return;
  const t = ctx.currentTime;
  const near = 1 / (1 + dist * 0.05);
  const dest = panned(pan);
  tone('sawtooth', 1900 + (shotN++ % 4) * 160, 3400, t, 0.22, 0.16 * near + 0.01, dest, 0.02);
  burst('bandpass', 4200, 6, t, 0.2, 0.14 * near, dest, (shotN * 0.13) % 1);
}

// A spitter hawking a glob.
export function playSpit(dist, pan = 0) {
  if (!ensure()) return;
  const t = ctx.currentTime;
  const near = 1 / (1 + dist * 0.03);
  const dest = panned(pan);
  burst('bandpass', 700, 3, t, 0.16, 0.5 * near + 0.01, dest, (shotN++ * 0.37) % 1);
  tone('sine', 320, 90, t, 0.2, 0.3 * near, dest);
}

// Acid landing, or a body bursting.
export function playSplat(dist, pan = 0) {
  if (!ensure()) return;
  const t = ctx.currentTime;
  const near = 1 / (1 + dist * 0.04);
  const dest = panned(pan);
  burst('lowpass', 1200, 1, t, 0.25, 0.6 * near + 0.01, dest, (shotN++ * 0.43) % 1);
  burst('bandpass', 2600, 4, t + 0.03, 0.4, 0.16 * near, dest, (shotN * 0.11) % 1);
}

export function disposeAudio() {
  chargeOsc = null;
  chargeGain = null;
  if (ctx && ctx.state !== 'closed') ctx.close();
  ctx = null;
  master = null;
  noise = null;
}
