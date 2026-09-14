// Where the heavy media lives.
//
// Two folders at the repo ROOT — /music and /artgallery — are deliberately
// outside public/ and outside the import graph, so neither the bundler nor a
// Vercel deployment ever sees them. They are served instead from jsDelivr's
// GitHub CDN, which reads the same public repo.
//
// The reason is deployment size. Every push keeps a full copy of dist/ on
// Vercel, forever, and the media dwarfs the game: 33 MB of MP3s and 7.4 MB of
// paintings against ~1.5 MB of JavaScript. Moving both out took dist/ from
// ~71 MB to ~3.5 MB, which is the difference between an archive of builds
// measured in gigabytes and one measured in megabytes.
//
// Nothing about the player's experience changes. The paintings were already
// fetched lazily (the gallery hangs its art on approach, the nebulae read
// 128 px thumbnails on idle), and a track was always streamed one at a time.
// They now arrive from a CDN edge instead of Vercel's.
//
// Dev keeps a local path: Vite serves files from the project root, so the
// same relative URLs work with no network at all.
//
// ASSET_REF is what jsDelivr caches against. A branch is re-checked roughly
// every 12 hours; pin a tag instead if a file is ever replaced IN PLACE and
// the change has to be immediate. A file added under a NEW name appears as
// soon as the deploy referencing it goes out.
//
// VITE_ASSET_BASE overrides both if the media ever moves again (a mirror, a
// bucket) without touching any of this.
const ASSET_REF = 'main';

export const ASSET_BASE =
  import.meta.env.VITE_ASSET_BASE ||
  (import.meta.env.DEV
    ? import.meta.env.BASE_URL
    : `https://cdn.jsdelivr.net/gh/JFeelgoodOfficial/game@${ASSET_REF}/`);

// Build a URL for a repo-root-relative path. Each segment is percent-encoded,
// because the paintings carry their exhibition titles as filenames — spaces,
// apostrophes and parentheses included ("The Two Brothers (1).webp").
export function assetUrl(relPath) {
  return ASSET_BASE + relPath.split('/').map(encodeURIComponent).join('/');
}
