# Orbital Art Gallery collection

Drop image files here (`.png`, `.jpg`, `.jpeg`, or `.webp`, lowercase
extensions) and they hang themselves on the exhibit panels inside the
Orbital Art Gallery's Grand Hall tower — alphabetical order by filename,
cycling across all 32 panel slots when there are fewer than 32 images.
Empty slots show a procedural placeholder.

Landscape images around 10:7 fit the panels best. Restart the dev server
(or rebuild) after adding files — the panels are wired at build time via
Vite's `import.meta.glob`.

## Size budget

Every file here is downloaded by the browser, so keep them lean: the longest
side should be 2048 px or less. Drop a full-resolution file in and then run

    node scripts/optimize-images.mjs

which downsizes and re-encodes in place (WebP q82) and leaves the filename —
and so the hang order — untouched.
