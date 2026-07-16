// Ship radio (user mechanic — a deliberate override of GDD 1.2's "no sound
// beyond, at most, engine tone"). Four Wave Collector tracks play in
// sequence, starting from the LAUNCH click (a real gesture, so autoplay is
// permitted). The radio console (radio.js) switches tracks and shows the
// title; the sequential auto-advance is the user's own playlist logic.

import track1 from './11 Mean Streets (Wave Collector Remix).mp3';
import track2 from './Wave Collector - I Know You\'re There.mp3';
import track3 from './Wave Collector -Electronics Dept.mp3';
import track4 from './Wave Collector -Men\'s Casualwear.mp3';

const TRACKS = [
  { url: track1, title: 'MEAN STREETS (WAVE COLLECTOR REMIX)' },
  { url: track2, title: "WAVE COLLECTOR — I KNOW YOU'RE THERE" },
  { url: track3, title: 'WAVE COLLECTOR — ELECTRONICS DEPT.' },
  { url: track4, title: "WAVE COLLECTOR — MEN'S CASUALWEAR" },
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

function ensureAudio() {
  if (audio) return;
  audio = new Audio(TRACKS[currentIndex].url);
  audio.volume = 0.5;
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
