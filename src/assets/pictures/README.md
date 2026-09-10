# Hallway pictures

Drop image files here (`.png`, `.jpg`, `.jpeg`, or `.webp`, lowercase
extensions) and they hang themselves in the picture frames along the ship's
corridor — alphabetical order by filename, up to five frames. Frames without
an image show a procedural placeholder.

Landscape images around 5:4 fit the frames best. Restart the dev server (or
rebuild) after adding files — the frames are wired at build time via Vite's
`import.meta.glob`.

These hang on 0.5 x 0.4-unit frames, so 1024 px on the longest side is already
more than the screen can show. `node scripts/optimize-images.mjs` enforces that
in place after you add a file.
