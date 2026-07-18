// Player settings (audit fix: the tuning panel is dev-only, so shipped
// builds had no volume, sensitivity, invert-Y, or quality control at all).
// Persisted to localStorage with the same fail-open pattern as nav.js /
// journal.js — private-mode browsers just get session-only settings.

const KEY = 'nova7.settings';

export const settings = {
  musicVolume: 0.5,
  muted: false,
  sensitivity: 1.0, // multiplier on mouse deltas (flight, interior, on foot)
  invertY: false,
  quality: 'high', // 'high' | 'low' — pixel ratio, bloom, planet shader octaves
};

function sanitize() {
  settings.musicVolume = Math.min(Math.max(+settings.musicVolume || 0, 0), 1);
  settings.muted = !!settings.muted;
  settings.sensitivity = Math.min(Math.max(+settings.sensitivity || 1, 0.25), 3);
  settings.invertY = !!settings.invertY;
  if (settings.quality !== 'low') settings.quality = 'high';
}

try {
  const stored = JSON.parse(localStorage.getItem(KEY));
  if (stored && typeof stored === 'object') Object.assign(settings, stored);
} catch {
  // no storage — session-only defaults
}
sanitize();

const listeners = [];

// Modules that need to react live (music volume, renderer quality) subscribe
// here; hot paths (input scaling) just read `settings` directly each event.
export function onSettingsChange(cb) {
  listeners.push(cb);
}

export function saveSettings() {
  sanitize();
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // session-only
  }
  for (const cb of listeners) cb(settings);
}
