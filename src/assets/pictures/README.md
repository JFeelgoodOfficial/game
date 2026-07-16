# Hallway pictures

Drop image files here (`.png`, `.jpg`, `.jpeg`, or `.webp`, lowercase
extensions) and they hang themselves in the picture frames along the ship's
corridor — alphabetical order by filename, up to five frames. Frames without
an image show a procedural placeholder.

Landscape images around 5:4 fit the frames best. Restart the dev server (or
rebuild) after adding files — the frames are wired at build time via Vite's
`import.meta.glob`.
