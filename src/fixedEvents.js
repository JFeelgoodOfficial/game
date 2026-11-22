// Fixed events (GDD 5.7.9): the things in Season 1 that happen anyway.
//
// The arc's rule is that the big events are certain and the pilot's choices
// change how they go. So every one of them is the same three things, kept here
// once for every chapter:
//
//   forecast(id)        before it happens, what is coming is shown on screen:
//                       a dialogue payload for src/dialogue.js openDialogue,
//                       drawn as a transmission by src/cineTalk.js (bars, SKIP).
//                       Asking for it marks the event as forecast in this save.
//   resolve(id, how, detail)   it has happened; this is how it went here
//   outcome(id)         { seen, how, detail } | null, for a later chapter
//   remember(captainId) what that captain says about the latest one, or null
//                       (src/voyage.js offers it wherever the ship is)
//
// The words are world/season-dialogue.js FIXED. The record is the season's
// (src/season.js `events`).

import { FIXED } from '../world/season-dialogue.js';

export const FIXED_IDS = FIXED.map((e) => e.id);

export function createFixedEvents(season) {
  const row = (id) => FIXED.find((e) => e.id === id) || null;
  const api = {
    list: () => FIXED.map((e) => ({ id: e.id, chapter: e.chapter, label: e.label, ...(season.event(e.id) || {}) })),
    label: (id) => row(id)?.label || null,
    forecast(id) {
      const e = row(id);
      if (!e || !e.forecast) return null;
      const f = e.forecast;
      if (!season.event(id)?.seen) season.setEvent(id, { seen: true });
      return { speaker: f.speaker, cine: { kind: 'comm', from: f.from }, lines: [...f.lines, f.certain, f.open] };
    },
    shown: (id) => !!season.event(id)?.seen,
    resolve(id, how, detail) {
      if (!row(id) || typeof how !== 'string') return false;
      season.setEvent(id, { seen: true, how, detail: detail && Object.keys(detail).length ? { ...detail } : undefined });
      return true;
    },
    outcome: (id) => season.event(id),
    resolved: (id) => !!season.event(id)?.how,
    // the latest event that has gone one way or another, and what this captain makes of it
    remember(captainId) {
      for (let i = FIXED.length - 1; i >= 0; i--) {
        const e = FIXED[i];
        const how = season.event(e.id)?.how;
        if (!how) continue;
        const line = e.remember?.[how]?.[captainId];
        return line ? [line] : null;
      }
      return null;
    },
  };
  return api;
}
