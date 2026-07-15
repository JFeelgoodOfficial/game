// lil-gui panel bound to every value in constants.js. Dev builds only —
// the guarded dynamic import is dead-code-eliminated from production
// (GDD 2.3). Includes a button that dumps current values as a constants.js
// literal to the clipboard: tuning that can't be saved gets lost.

import { C } from './constants.js';

export async function initTuning() {
  if (!import.meta.env.DEV) return;

  const { default: GUI } = await import('lil-gui');
  const gui = new GUI({ title: 'tuning' });

  for (const key of Object.keys(C)) {
    gui.add(C, key);
  }

  gui.add(
    {
      copy() {
        const lines = Object.keys(C).map((k) => `  ${k}: ${C[k]},`);
        const literal = `export const C = {\n${lines.join('\n')}\n};\n`;
        navigator.clipboard
          .writeText(literal)
          .catch(() => console.log(literal));
      },
    },
    'copy'
  ).name('copy constants.js');

  // Keep the panel usable while flying: don't let it steal pointer lock.
  gui.domElement.addEventListener('click', (e) => e.stopPropagation());
}
