// Host-side quest/codex state for the interaction contract (world/interaction.js).
// The world modules (aliens.js, creatures.js) only RETURN intent — a Quest offer
// inside a DialoguePayload — and this module records the consequences: codex
// subjects discovered, choice outcomeTags taken, and the one active waypoint.
//
// Codex and outcomes persist in localStorage (same graceful degradation as the
// nav discovery log); the waypoint is session-only because its beacon lives in
// a landing site that despawns when the player boards the ship.

import { showViewToast } from './walkview.js';

const STORE_KEY = 'fgsf.journal';

let codex = new Set(); // codex subjects discovered (persisted)
let outcomes = new Set(); // choice outcomeTags taken (persisted)
let waypoint = null; // { targetHint } — session-only
// Governor wonder-tour progress, per city id (persisted): the number of tour
// stops reached so far, or 'done' once the reward has been claimed. The chain
// logic (which wonder is next, re-arming the beacon on re-land) lives with
// the city spawn code — the journal only stores the stage.
let quests = {};
// Everyone spoken to (persisted), for the CODEX: name -> { role, place }.
let people = {};
// Something new is in the codex that the player has not opened it to see
// (persisted): the dash CODEX button pulses while this is true.
let unread = false;

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (Array.isArray(data.codex)) codex = new Set(data.codex);
    if (Array.isArray(data.outcomes)) outcomes = new Set(data.outcomes);
    if (data.quests && typeof data.quests === 'object') quests = { ...data.quests };
    if (data.people && typeof data.people === 'object') people = { ...data.people };
    unread = !!data.unread;
  } catch {
    /* corrupt or unavailable — start empty, session-only */
  }
}

function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({
      codex: [...codex], outcomes: [...outcomes], quests, people, unread,
    }));
  } catch {
    /* session-only */
  }
}

export function initJournal() {
  load();
}

// Returns false (and stays quiet) when the subject was already known, so a
// repeat conversation never re-rewards.
export function addCodex(subject) {
  if (!subject || codex.has(subject)) return false;
  codex.add(subject);
  unread = true;
  save();
  showViewToast('CODEX UPDATED — ' + subject.toUpperCase().slice(0, 40), 4);
  return true;
}

export function addOutcome(tag) {
  if (!tag || outcomes.has(tag)) return false;
  outcomes.add(tag);
  save();
  showViewToast('CHOICE RECORDED', 3);
  return true;
}

export function setWaypoint(targetHint) {
  waypoint = { targetHint };
  showViewToast('WAYPOINT — ' + targetHint.toUpperCase(), 4);
}

export function completeWaypoint() {
  if (!waypoint) return;
  showViewToast('WAYPOINT REACHED — ' + waypoint.targetHint.toUpperCase(), 4);
  waypoint = null;
}

// Silent drop (boarding the ship, or a new offer replacing the old target).
export function clearWaypoint() {
  waypoint = null;
}

export function hasWaypoint() {
  return waypoint !== null;
}

// Quest stage accessors. Stage is undefined (never accepted), a number
// (accepted; count of tour stops reached), or 'done' (reward claimed).
export function questStage(cityId) {
  return quests[cityId];
}

export function setQuestStage(cityId, stage) {
  if (!cityId) return;
  if (quests[cityId] !== stage) unread = true;
  quests[cityId] = stage;
  save();
}

// A conversation was opened with someone (dialogue.js). First meetings are
// kept for the CODEX's PEOPLE page; a repeat only fills in what was missing.
export function addMet(name, role, place) {
  if (!name) return false;
  const had = people[name];
  if (had && (had.role || !role) && (had.place || !place)) return false;
  people[name] = { role: role || had?.role || '', place: place || had?.place || '' };
  if (!had) unread = true;
  save();
  return !had;
}

export const peopleMet = () => Object.entries(people).map(([name, p]) => ({ name, ...p }));
export const codexSubjects = () => [...codex];
export const allQuestStages = () => ({ ...quests });
export const codexUnread = () => unread;
export function markCodexRead() {
  if (!unread) return;
  unread = false;
  save();
}

// Debug/inspection hook (__debug.journal()).
export function journalState() {
  return { codex: [...codex], outcomes: [...outcomes], waypoint, quests: { ...quests }, people: { ...people }, unread };
}
