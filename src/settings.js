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
  // The tier in effect: 'low' | 'medium' | 'high' | 'ultra' (constants.js TIERS).
  // Every module that scales its detail reads this one field.
  quality: 'medium',
  // 'auto' lets src/quality.js pick and lower the tier; 'manual' pins it.
  qualityMode: 'auto',
  qualityProbed: false, // auto mode has already chosen `quality` on this device
  reducedMotion: 'system', // 'system' | 'on' | 'off' — camera shake and warp smear (motion.js)
};

const TIER_NAMES = ['low', 'medium', 'high', 'ultra'];

function sanitize() {
  settings.musicVolume = Math.min(Math.max(+settings.musicVolume || 0, 0), 1);
  settings.muted = !!settings.muted;
  settings.sensitivity = Math.min(Math.max(+settings.sensitivity || 1, 0.25), 3);
  settings.invertY = !!settings.invertY;
  if (!TIER_NAMES.includes(settings.quality)) settings.quality = 'medium';
  if (settings.qualityMode !== 'manual') settings.qualityMode = 'auto';
  settings.qualityProbed = !!settings.qualityProbed;
  if (settings.reducedMotion !== 'on' && settings.reducedMotion !== 'off') settings.reducedMotion = 'system';
}

try {
  const stored = JSON.parse(localStorage.getItem(KEY));
  if (stored && typeof stored === 'object') {
    // Settings saved before the four tiers existed carry only 'high' | 'low'.
    // LOW was a deliberate choice and stays pinned. HIGH was the default, so
    // it says nothing about the device: hand those players to auto.
    if (stored.qualityMode === undefined) {
      if (stored.quality === 'low') stored.qualityMode = 'manual';
      else delete stored.quality;
    }
    Object.assign(settings, stored);
  }
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
