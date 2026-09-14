// The owner's painting collection — one list, three consumers.
//
// The paintings live in /artgallery at the repo root and are served from the
// CDN (see assetBase.js), so they are not part of the import graph and Vite's
// import.meta.glob cannot find them. artgallery/manifest.json, written by
// scripts/optimize-images.mjs and committed, is the list instead.
//
// Adding a painting is unchanged from the player's point of view and nearly
// unchanged from the artist's: drop the file in, run the script, commit. The
// script both re-encodes it and refreshes the manifest.
import manifest from '../artgallery/manifest.json';
import { assetUrl } from './assetBase.js';

// Sorted, because the exhibit panels hang in filename order and a manifest
// edited by hand should not be able to scramble them. Plain string compare —
// the same rule the glob's sort used.
export const GALLERY_FILES = [...manifest].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

export const galleryUrl = (file) => assetUrl(`artgallery/${file}`);
