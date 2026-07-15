// Launch music (user request — a deliberate override of GDD 1.2's "no sound
// beyond, at most, engine tone"). The user's uploaded track starts when the
// player presses LAUNCH — a real click gesture, so autoplay is permitted —
// and loops. Idempotent: dying and relaunching doesn't restart the song.

import trackUrl from './Wave Collector -Men\'s Casualwear.mp3';

let audio = null;

export function startMusic() {
  if (!audio) {
    audio = new Audio(trackUrl);
    audio.loop = true;
    audio.volume = 0.5;
  }
  if (audio.paused) {
    audio.play().catch(() => {
      // If the browser still refuses (no gesture registered), retry on the
      // next real interaction anywhere on the page.
      const retry = () => {
        audio.play().catch(() => {});
        window.removeEventListener('pointerdown', retry);
        window.removeEventListener('keydown', retry);
      };
      window.addEventListener('pointerdown', retry);
      window.addEventListener('keydown', retry);
    });
  }
}
