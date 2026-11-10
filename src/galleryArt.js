// Painting textures for the freighter's gallery hall (interior.js).
//
// The collection is 33 canvases at up to 2048 px. Uploading every one at full
// size with mipmaps is ~700 MB of texture memory, which no phone survives, so
// the hall keeps two tiers:
//
//   mid  — every painting, decoded straight to C.ART_MID_PX on its long side.
//          Resident for as long as the hall has been opened.
//   full — the native file, for the few canvases the pilot is standing at.
//          interior.js asks for these by distance and disposes them again.
//
// Each file is fetched ONCE: the compressed blob (a few hundred KB) is kept,
// and both tiers decode from it with createImageBitmap, off the main thread.
// Decodes run two at a time so a stand-up never stalls on 33 at once.
//
// Textures come back with flipY = false (ImageBitmaps ignore UNPACK_FLIP_Y in
// some browsers, so the hall's painting planes carry flipped UVs instead).

import * as THREE from 'three';
import { C } from './constants.js';
import { galleryUrl } from './gallery.js';

// Exhibition title from a filename. Camera-roll names have no title to give.
export function titleOf(file) {
  let t = file.replace(/\.[a-z0-9]+$/i, '');
  if (/^(IMG_|\d{6,})/.test(t)) return 'Untitled';
  t = t.replace(/\s+by JFeelgood$/i, '').replace(/\s+big$/i, '');
  t = t.replace(/\s*\((\d+)\)$/, (_, n) => ' ' + (['', 'I', 'II', 'III', 'IV'][+n] || n));
  return t.replace(/\b[a-z]/g, (ch) => ch.toUpperCase());
}

const blobs = new Map(); // file -> Promise<Blob>
function blobOf(file) {
  let p = blobs.get(file);
  if (!p) {
    p = fetch(galleryUrl(file)).then((r) => {
      if (!r.ok) throw new Error(`art ${r.status}`);
      return r.blob();
    });
    blobs.set(file, p);
    p.catch(() => blobs.delete(file)); // a failed fetch may be retried
  }
  return p;
}

// --- two-wide decode queue ---
const queue = [];
let running = 0;
function pump() {
  while (running < 2 && queue.length) {
    const job = queue.shift();
    running++;
    job.run().then(job.resolve, job.reject).finally(() => {
      running--;
      pump();
    });
  }
}
function enqueue(run, front) {
  return new Promise((resolve, reject) => {
    const job = { run, resolve, reject };
    if (front) queue.unshift(job);
    else queue.push(job);
    pump();
  });
}

function toTexture(bitmap, anisotropy) {
  const tex = new THREE.Texture(bitmap);
  tex.flipY = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = anisotropy;
  tex.needsUpdate = true;
  return tex;
}

// -> { tex, aspect } — aspect is the painting's true width / height.
export function loadArtMid(file) {
  return enqueue(async () => {
    const blob = await blobOf(file);
    let bmp = await createImageBitmap(blob);
    const aspect = bmp.width / bmp.height;
    const long = Math.max(bmp.width, bmp.height);
    if (long > C.ART_MID_PX) {
      const k = C.ART_MID_PX / long;
      const small = await createImageBitmap(blob, {
        resizeWidth: Math.round(bmp.width * k),
        resizeHeight: Math.round(bmp.height * k),
        resizeQuality: 'high',
      });
      bmp.close();
      bmp = small;
    }
    return { tex: toTexture(bmp, 4), aspect };
  }, false);
}

// The native file. Jumps the queue: someone is standing in front of it.
export function loadArtFull(file) {
  return enqueue(async () => toTexture(await createImageBitmap(await blobOf(file)), 16), true);
}

export function disposeArt(tex) {
  if (!tex) return;
  tex.image?.close?.();
  tex.dispose();
}
