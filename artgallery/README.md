# Orbital Art Gallery collection

Drop image files here (`.png`, `.jpg`, `.jpeg`, or `.webp`, lowercase
extensions) and they hang themselves on the exhibit panels inside the
Orbital Art Gallery's Grand Hall tower — alphabetical order by filename,
cycling across all 32 panel slots when there are fewer than 32 images.
Empty slots show a procedural placeholder.

Landscape images around 10:7 fit the panels best. Restart the dev server
(or rebuild) after adding files — the panels are wired at build time via
Vite's `import.meta.glob`.
