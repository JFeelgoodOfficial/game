// Ship radio (user mechanic — a deliberate override of GDD 1.2's "no sound
// beyond, at most, engine tone"). Ten Wave Collector tracks play in
// sequence, starting from the LAUNCH click (a real gesture, so autoplay is
// permitted). The radio pop-up (radioPopup.js) switches/pauses tracks and
// shows the title; the sequential auto-advance is the user's own playlist
// logic.

import { settings, onSettingsChange } from './settings.js';
import { assetUrl } from './assetBase.js';

// Tracks are the heaviest thing the game touches: ten MP3s, 33 MB, and only
// ever one of them streaming. They used to sit in public/, which meant every
// Vercel deployment (production and every preview) shipped all 33 MB and every
// build re-uploaded them. They now live in /music at the repo root, alongside
// the paintings, and come from the CDN — see assetBase.js for the whole story.
//
// VITE_MUSIC_BASE still overrides the tracks alone, if they ever move
// somewhere the rest of the media does not follow.
const MUSIC_BASE = import.meta.env.VITE_MUSIC_BASE || assetUrl('music/');

const TRACKS = [
  { url: `${MUSIC_BASE}wave-collector-move-78.mp3`, title: 'WAVE COLLECTOR — MOVE 78' },
  { url: `${MUSIC_BASE}wave-collector-i-know-youre-there.mp3`, title: "WAVE COLLECTOR — I KNOW YOU'RE THERE" },
  { url: `${MUSIC_BASE}wave-collector-electronics-dept.mp3`, title: 'WAVE COLLECTOR — ELECTRONICS DEPT.' },
  { url: `${MUSIC_BASE}wave-collector-mens-casualwear.mp3`, title: "WAVE COLLECTOR — MEN'S CASUALWEAR" },
  { url: `${MUSIC_BASE}wave-collector-one-way-in.mp3`, title: 'WAVE COLLECTOR — ONE WAY IN' },
  { url: `${MUSIC_BASE}wave-collector-question-air.mp3`, title: 'WAVE COLLECTOR — QUESTION AIR' },
  { url: `${MUSIC_BASE}wave-collector-the-masterpiece.mp3`, title: 'WAVE COLLECTOR — THE MASTERPIECE' },
  { url: `${MUSIC_BASE}wave-collector-the-mouse-shaman-acoustic.mp3`, title: 'WAVE COLLECTOR — THE MOUSE SHAMAN (ACOUSTIC)' },
  { url: `${MUSIC_BASE}wave-collector-bright-pearl-comes-out-from-the-sea.mp3`, title: 'WAVE COLLECTOR — BRIGHT PEARL COMES OUT FROM THE SEA' },
  { url: `${MUSIC_BASE}wave-collector-life-cycle.mp3`, title: 'WAVE COLLECTOR — LIFE CYCLE' },
];

let audio = null;
let currentIndex = 0;
let errorSkips = 0; // consecutive failed track loads (see the 'error' handler)
let wantPlaying = false; // last intent — an error only skips ahead if we were trying to play
const listeners = [];
const playListeners = [];

export function currentTitle() {
  return TRACKS[currentIndex].title;
}

export function trackTitles() {
  return TRACKS.map((t) => t.title);
}

export function getCurrentIndex() {
  return currentIndex;
}

// The radio console subscribes here to refresh its readout on any track
// change — manual switch or the playlist rolling over on its own.
export function onTrackChange(cb) {
  listeners.push(cb);
}

function emit() {
  for (const cb of listeners) cb(currentTitle(), currentIndex);
}

// The radio pop-up subscribes here to keep its play/pause glyph honest: the
// events come from the Audio element itself, so a play() blocked by the
// browser (no gesture yet) never shows as "playing".
export function onPlayStateChange(cb) {
  playListeners.push(cb);
}

function emitPlayState() {
  const playing = !!audio && !audio.paused;
  for (const cb of playListeners) cb(playing);
}

export function isMusicPlaying() {
  return !!audio && !audio.paused;
}

// If the browser refuses playback (no gesture registered yet), retry on the
// next real interaction anywhere on the page.
function play() {
  wantPlaying = true;
  audio.play().catch(() => {
    const retry = () => {
      audio.play().catch(() => {});
      window.removeEventListener('pointerdown', retry);
      window.removeEventListener('keydown', retry);
    };
    window.addEventListener('pointerdown', retry);
    window.addEventListener('keydown', retry);
  });
}

function setTrack(index) {
  currentIndex = ((index % TRACKS.length) + TRACKS.length) % TRACKS.length;
  audio.src = TRACKS[currentIndex].url;
  audio.currentTime = 0;
  emit();
}

function applyVolume() {
  if (!audio) return;
  audio.volume = settings.musicVolume;
  audio.muted = settings.muted;
}
onSettingsChange(applyVolume);

function ensureAudio() {
  if (audio) return;
  audio = new Audio(TRACKS[currentIndex].url);
  applyVolume();
  // sequential playlist: when a track ends, the next one starts
  audio.addEventListener('ended', () => {
    setTrack(currentIndex + 1);
    play();
  });
  audio.addEventListener('play', emitPlayState);
  audio.addEventListener('pause', emitPlayState);
  // The tracks are on a CDN now, so a fetch can fail in ways a local file
  // never did — one bad edge node, a network that drops mid-stream. Without
  // this the radio just goes quiet forever on the dead track. Skip to the
  // next one, but only while some track is still untried: ten failures in a
  // row means the whole source is unreachable, and cycling the playlist
  // against a dead origin helps nobody.
  audio.addEventListener('error', () => {
    if (!wantPlaying) return; // a source that fails while deliberately paused stays paused
    if (errorSkips >= TRACKS.length - 1) {
      console.warn('[radio] no track could be loaded — is the music CDN reachable?');
      return;
    }
    errorSkips++;
    setTrack(currentIndex + 1);
    play();
  });
  // A track that actually starts clears the run: the next failure gets its
  // own full set of retries.
  audio.addEventListener('playing', () => {
    errorSkips = 0;
  });
}

export function nextTrack() {
  ensureAudio();
  setTrack(currentIndex + 1);
  play();
}

export function prevTrack() {
  ensureAudio();
  setTrack(currentIndex - 1);
  play();
}

export function playTrackAt(index) {
  ensureAudio();
  setTrack(index);
  play();
}

// User-facing play/pause (radio pop-up). Clearing pausedByGame keeps a
// deliberate user pause from being undone by a later game unpause, and a
// user resume from leaving a stale "resume me" flag around.
export function toggleMusicPlayback() {
  ensureAudio();
  pausedByGame = false;
  if (audio.paused) play();
  else {
    wantPlaying = false;
    audio.pause();
  }
}

export function startMusic() {
  ensureAudio();
  if (audio.paused) play();
}

// Game pause (game.js): the radio stops with the rest of the ship. The flag
// is only set when pauseMusic actually paused something, so a track the user
// paused themselves (toggleMusicPlayback) stays paused across a game
// pause/resume cycle.
let pausedByGame = false;

export function pauseMusic() {
  if (audio && !audio.paused) {
    wantPlaying = false;
    audio.pause();
    pausedByGame = true;
  }
}

export function resumeMusic() {
  if (audio && pausedByGame) {
    pausedByGame = false;
    play();
  }
}
