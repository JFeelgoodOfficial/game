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

export function disposeAudio() {
  if (ctx && ctx.state !== 'closed') ctx.close();
  ctx = null;
  master = null;
  noise = null;
}
