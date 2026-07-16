// Import all tracks as modules (Vite/webpack-style bundling)
import track1 from './11 Mean Streets (Wave Collector Remix).mp3';
import track2 from './Wave Collector - I Know You\'re There.mp3';
import track3 from './Wave Collector -Electronics Dept.mp3';
import track4 from './Wave Collector -Men\'s Casualwear.mp3';

const playlist = [track1, track2, track3, track4];
let audio: HTMLAudioElement | null = null;
let currentIndex = 0;

function initAudio(index: number) {
  currentIndex = index % playlist.length;
  if (!audio) {
    audio = new Audio(playlist[currentIndex]);
    audio.volume = 0.5;

    // When a song finishes, advance to the next and play it.
    audio.addEventListener('ended', () => {
      currentIndex = (currentIndex + 1) % playlist.length;
      audio!.src = playlist[currentIndex];
      audio!.currentTime = 0;
      audio!.play().catch(() => {
        // Same gesture fallback as initial play
        const retry = () => {
          audio!.play().catch(() => {});
          window.removeEventListener('pointerdown', retry);
          window.removeEventListener('keydown', retry);
        };
        window.addEventListener('pointerdown', retry);
        window.addEventListener('keydown', retry);
      });
    });
  } else {
    audio.src = playlist[currentIndex];
    audio.currentTime = 0;
  }
}

export function startMusic() {
  if (!audio) {
    initAudio(0); // start at first track
  }

  if (audio!.paused) {
    audio!.play().catch(() => {
      // If the browser still refuses (no gesture registered), retry on the
      // next real interaction anywhere on the page.
      const retry = () => {
        audio!.play().catch(() => {});
        window.removeEventListener('pointerdown', retry);
        window.removeEventListener('keydown', retry);
      };
      window.addEventListener('pointerdown', retry);
      window.addEventListener('keydown', retry);
    });
  }
}
