import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    // three's core is ~650 kB minified on its own; the warning at 500 kB just
    // fires every build and says nothing new. The chunks that matter are
    // watched by hand (see the build log in AUDIT.md).
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        // three.js is the one dependency, it changes only when the version is
        // bumped, and it is most of the boot download. Splitting it out means
        // a game-code push leaves the ~600 kB vendor chunk's hash — and so
        // every returning player's cached copy of it — untouched.
        manualChunks(id) {
          if (!id.includes('node_modules/three/')) return; // app code: Rollup decides
          // GTAOPass is dynamically imported for isolated story worlds only
          // (src/game.js). Folding it into the eagerly-loaded vendor chunk
          // would undo that split, so it keeps its own chunk.
          if (/\/(GTAOPass|GTAOShader|PoissonDenoiseShader|SimplexNoise)\.js$/.test(id)) return;
          return 'vendor-three';
        },
      },
    },
  },
});
