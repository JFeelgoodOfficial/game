// One clock for a timed scene, and the crew's lines said from it (GDD 5.7.7).
//
// Every timed scene in the chapters is the same thing: a clock `u`, a pose(u)
// that places everything on screen from the clock alone, lines said as the
// clock passes them, and an end. world/launch.js writes that out by hand; this
// is the same pattern once, with the two things a chapter with decisions adds:
//
//   stops   times the clock holds at until release() (a decision is being
//           shown: the place asks, and lets the clock go when it is answered)
//   skip()  on to the next stop, or the end: never past a decision
//
//   const sc = createSceneClock({ T, lines, stops, pose, say, onStop, onEnd });
//   sc.begin(); each frame sc.tick(dt); sc.seek(u) from a debug handle.
//
// `lines` are [seconds, line] in order; `say(line)` is the place's own way of
// saying one (crewSay below, usually). A scene come back to after it has
// played is sc.finish(): the end pose, nothing said.

import { CAPTAINS } from './chapter-dialogue.js';
import { chapterHud } from '../src/chapterHud.js';

export function createSceneClock(o) {
  const T = o.T;
  const lines = o.lines || [];
  const stops = (o.stops || []).slice().sort((a, b) => a - b);
  let u = -1; // -1: over, or never begun
  let said = -1, stopAt = -1, passed = -1;

  function sayUpTo(x, quiet) {
    while (said + 1 < lines.length && x >= lines[said + 1][0]) {
      said++;
      if (!quiet && o.say) o.say(lines[said][1], said);
    }
  }
  // run the clock to x, holding at the first stop not yet released
  function run(x, quiet) {
    for (let i = passed + 1; i < stops.length; i++) {
      if (x < stops[i]) break;
      u = stops[i];
      stopAt = i;
      sayUpTo(u, quiet);
      o.pose(u);
      if (o.onStop) o.onStop(i, u);
      return;
    }
    u = x;
    sayUpTo(u, quiet);
    if (u >= T) {
      u = -1;
      o.pose(T);
      if (o.onEnd) o.onEnd();
    } else o.pose(u);
  }
  return {
    begin(from = 0) {
      said = -1;
      stopAt = -1;
      passed = -1;
      u = 0;
      if (from > 0) run(from, true);
      else o.pose(0);
    },
    tick(dt) {
      if (u < 0 || stopAt >= 0) return;
      run(u + Math.min(dt, 0.1), false);
    },
    // the decision at the stop has been answered: the clock goes on
    release() {
      if (stopAt < 0) return;
      passed = stopAt;
      stopAt = -1;
    },
    skip() {
      if (u < 0 || stopAt >= 0) return false;
      const next = stops.find((s, i) => i > passed && s > u);
      run(next ?? T, true);
      return true;
    },
    seek(x) {
      if (u < 0 || stopAt >= 0) return;
      run(Math.max(x, u), true);
    },
    // as it is left: the end pose, without playing
    finish() {
      u = -1;
      stopAt = -1;
      o.pose(T);
    },
    stop() {
      u = -1;
      stopAt = -1;
    },
    u: () => u,
    running: () => u >= 0,
    stopped: () => stopAt,
    over: () => u < 0,
    T,
  };
}

// A crew line: { by: captain id | null, text, solo }. Said by its captain if
// they are aboard, by another who is if not, and with nobody left aboard it is
// `solo` that is shown (what the pilot sees for himself, or the ship reports),
// or nothing at all where `solo` is null. `by: null` is the ship: no speaker.
// Returns the id of the captain who said it (or null), so the right figure can be seen to speak.
export function crewSay(chapter, line, sec = 7) {
  if (!line) return null;
  const crew = chapter.crew();
  if (line.by == null) {
    if (line.text) chapterHud.say(line.text, sec);
    return null;
  }
  const who = crew.find((c) => c.id === line.by) || crew[0];
  if (who) {
    // (a line borrowed from a lost captain may be given other words for who is left)
    const text = who.id !== line.by && line.other && line.other[who.id] ? line.other[who.id] : line.text;
    chapterHud.say(`${who.short} — ${text}`, sec);
    return who.id;
  }
  if (line.solo) chapterHud.say(line.solo, sec);
  return null;
}

// ...and the same choice for a talk payload: the speaker a line set belongs to
export const crewSpeaker = (chapter, id) => {
  const crew = chapter.crew();
  return crew.find((c) => c.id === id) || crew[0] || null;
};
export { CAPTAINS };
