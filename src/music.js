// Ship radio (user mechanic — a deliberate override of GDD 1.2's "no sound
// beyond, at most, engine tone"). Four Wave Collector tracks play in
// sequence, starting from the LAUNCH click (a real gesture, so autoplay is
// permitted). The radio console (radio.js) switches tracks and shows the
// title; the sequential auto-advance is the user's own playlist logic.

import { settings, onSettingsChange } from './settings.js';

// Tracks live in public/music/ and stream on demand — they stay out of the
// JS bundle and out of Vite's asset pipeline. BASE_URL keeps the relative
// `./` base working on the Pages deploy.
const MUSIC_BASE = `${import.meta.env.BASE_URL}music/`;

const TRACKS = [
  { url: `${MUSIC_BASE}mean-streets-wave-collector-remix.mp3`, title: 'MEAN STREETS (WAVE COLLECTOR REMIX)' },
  { url: `${MUSIC_BASE}wave-collector-i-know-youre-there.mp3`, title: "WAVE COLLECTOR — I KNOW YOU'RE THERE" },
  { url: `${MUSIC_BASE}wave-collector-electronics-dept.mp3`, title: 'WAVE COLLECTOR — ELECTRONICS DEPT.' },
  { url: `${MUSIC_BASE}wave-collector-mens-casualwear.mp3`, title: "WAVE COLLECTOR — MEN'S CASUALWEAR" },
];

let audio = null;
let currentIndex = 0;
const listeners = [];

export function currentTitle() {
  return TRACKS[currentIndex].title;
}

// The radio console subscribes here to refresh its readout on any track
// change — manual switch or the playlist rolling over on its own.
export function onTrackChange(cb) {
  listeners.push(cb);
}

function emit() {
  for (const cb of listeners) cb(currentTitle(), currentIndex);
}

// If the browser refuses playback (no gesture registered yet), retry on the
// next real interaction anywhere on the page.
function play() {
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

export function startMusic() {
  ensureAudio();
  if (audio.paused) play();
}

// Game pause (main.js): the radio stops with the rest of the ship.
let pausedByGame = false;

export function pauseMusic() {
  if (audio && !audio.paused) {
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
