// Quality tiers and the frame governor.
//
// Two layers keep the frame rate. The TIER (constants.js TIERS) decides which
// effects exist at all; changing it rebuilds render targets and can recompile
// shaders, so it moves rarely. Under it the GOVERNOR trims the composer's
// internal resolution a step at a time — cheap, reversible, and invisible next
// to a dropped frame — and only when that runs out does auto mode give up a
// whole tier. Auto never climbs a tier by itself: requestAnimationFrame is capped
// at the display's refresh rate, so a steady 60 says "holding", not "headroom".
// The starting tier comes from the GPU's name instead.
//
// Q is the flat, allocation-free view the frame loop and the shaders' owners
// read: the tier's flags plus the live scale and effective pixel ratio.

import { settings, saveSettings, onSettingsChange } from './settings.js';
import { TIERS, TIER_ORDER, GOVERNOR as G } from './constants.js';

export const Q = {
  tier: 'medium',
  bloom: true,
  aa: 'fxaa',
  basePixelRatio: 1, // the canvas: devicePixelRatio under the tier's cap
  scale: 1, // governor's multiplier on the composer's internal resolution
  pixelRatio: 1, // basePixelRatio * scale — what the scene is rendered at
  minScale: 0.7,
};

let gpuName = '';
const listeners = [];

// Called with Q whenever the tier or the render scale changes.
export function onQualityChange(cb) {
  listeners.push(cb);
}

function emit() {
  for (const cb of listeners) cb(Q);
}

// A starting tier from the unmasked renderer string. Deliberately coarse: it
// only has to land within one step, the governor covers the rest downward and
// the settings panel covers the rest upward.
export function guessTier(name, coarsePointer) {
  const n = name.toLowerCase();
  if (/swiftshader|llvmpipe|software|basic render/.test(n)) return 'low';
  if (coarsePointer) return /apple/.test(n) ? 'medium' : 'low';
  if (/rtx|radeon rx|radeon pro|arc\(tm\) a|geforce gtx 1[06-9]/.test(n)) return 'ultra';
  if (/nvidia|geforce|radeon|apple m\d|apple gpu/.test(n)) return 'high';
  return 'medium'; // integrated Intel, and anything unrecognised
}

function syncTier() {
  const t = TIERS[settings.quality];
  Q.tier = settings.quality;
  Q.bloom = t.bloom;
  Q.aa = t.aa;
  Q.minScale = t.minScale;
  Q.basePixelRatio = Math.min(window.devicePixelRatio || 1, t.pixelRatio);
  if (Q.scale < Q.minScale) Q.scale = Q.minScale;
  Q.pixelRatio = Q.basePixelRatio * Q.scale;
}

export function initQuality(renderer) {
  const gl = renderer.getContext();
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  gpuName = String((ext && gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) || gl.getParameter(gl.RENDERER) || '');
  // Auto with no pick yet (first run, or the player just chose AUTO again):
  // take the tier from the GPU's name.
  const probe = () => {
    if (settings.qualityMode !== 'auto' || settings.qualityProbed) return;
    settings.quality = guessTier(gpuName, window.matchMedia('(pointer: coarse)').matches);
    settings.qualityProbed = true; // set before saving: the save re-enters the listener below
    saveSettings();
  };
  probe();
  syncTier();
  let applied = settings.quality;
  onSettingsChange(() => {
    probe();
    if (settings.quality === applied) return; // fires for every setting
    applied = settings.quality;
    resetGovernor();
    Q.scale = 1;
    syncTier();
    emit();
  });
  window.addEventListener('resize', () => {
    // devicePixelRatio changes when the window moves between displays
    const before = Q.basePixelRatio;
    syncTier();
    if (Q.basePixelRatio !== before) emit();
  });
}

// --- governor ---
let acc = 0; // seconds summed over the current window
let count = 0;
let fastRun = 0; // consecutive fast windows
let slowAtFloor = 0; // consecutive slow windows with the scale already at minScale
let upWait = G.UP_WINDOWS;
let sinceUp = Infinity; // windows since the last step up

function resetGovernor() {
  acc = count = fastRun = slowAtFloor = 0;
  upWait = G.UP_WINDOWS;
  sinceUp = Infinity;
}

function setScale(s) {
  Q.scale = s;
  Q.pixelRatio = Q.basePixelRatio * s;
  emit();
}

function decide(mean) {
  const i = G.SCALES.indexOf(Q.scale);
  sinceUp++;
  if (mean > G.SLOW) {
    fastRun = 0;
    const next = G.SCALES[i + 1];
    if (next !== undefined && next >= Q.minScale) {
      // A step up that fell straight back down was a mistake: wait longer
      // before trying it again, so the image does not pump.
      if (sinceUp <= G.RELAPSE_WINDOWS) upWait = Math.min(upWait * 2, G.UP_WINDOWS_MAX);
      slowAtFloor = 0;
      setScale(next);
    } else if (++slowAtFloor >= G.TIER_DROP_WINDOWS) {
      slowAtFloor = 0;
      const ti = TIER_ORDER.indexOf(settings.quality);
      if (settings.qualityMode === 'auto' && ti > 0) {
        settings.quality = TIER_ORDER[ti - 1];
        saveSettings(); // the settings listener above resyncs and emits
      }
    }
  } else {
    slowAtFloor = 0;
    if (mean < G.FAST && i > 0 && ++fastRun >= upWait) {
      fastRun = 0;
      sinceUp = 0;
      setScale(G.SCALES[i - 1]);
    } else if (mean >= G.FAST) {
      fastRun = 0;
    }
  }
}

// One call per rendered frame with the raw (unclamped) frame time in seconds.
// `live` is false whenever the frame time is not the renderer's own doing:
// paused, recording (the encoder eats frames), or terrain still baking.
export function governFrame(dt, live) {
  if (!live || dt > G.IGNORE_ABOVE) {
    acc = count = 0;
    return;
  }
  acc += dt;
  if (++count < G.WINDOW) return;
  const mean = acc / count;
  acc = count = 0;
  decide(mean);
}

export function qualityReport() {
  return {
    gpu: gpuName,
    mode: settings.qualityMode,
    tier: Q.tier,
    scale: Q.scale,
    pixelRatio: Q.pixelRatio,
    bloom: Q.bloom,
    aa: Q.aa,
    upWait,
  };
}
