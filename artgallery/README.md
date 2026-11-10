# The freighter's gallery collection

Drop image files here (`.png`, `.jpg`, `.jpeg`, or `.webp`, lowercase
extensions) and they hang themselves in the gallery hall aboard the player's
freighter (`src/interior.js` — press C in flight to stand up and walk aft).
They hang in alphabetical order by filename, door end first, each at its true
aspect ratio. The hall has 34 wall spots; a spot the collection does not fill
carries the collection card instead. The filename is the title on the plaque
under the frame ("by JFeelgood" and camera-roll names are tidied away).

## After adding a file, run the script

    node scripts/optimize-images.mjs

This is not optional any more. It does three things: downsizes and re-encodes
in place (WebP q82, longest side 2048 px), writes the 128 px thumbnail the
painting's nebula reads its palette from, and refreshes `manifest.json` —
the committed list of filenames that tells the game which paintings exist.
The filename, and so the hang order, is left untouched.

The manifest exists because these files are **not** bundled. They are served
from jsDelivr's GitHub CDN off this same repo (see `src/assetBase.js`), which
keeps ~7.4 MB of paintings out of every Vercel deployment. Nothing imports
them, so Vite's `import.meta.glob` cannot see them — hence the list.

A painting added without running the script is invisible to the game. One
added and committed but not yet on the CDN's cached copy of `main` appears
within about 12 hours.
