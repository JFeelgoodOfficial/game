// Image budget enforcement (September 2026 deploy-size pass).
//
// Every image in this repo is shipped to the browser, and several were straight
// off the camera or the scanner: paintings up to 6000x8000, PNG billboards at
// 3 MB each. Nothing in the game samples them at anything like that density —
// a gallery panel is a few hundred pixels tall on screen, a corridor picture is
// 0.5 world units wide — so the pixels were paying deploy size, bandwidth, decode
// time and VRAM for detail no player can see.
//
// Run `node scripts/optimize-images.mjs` after dropping new artwork in. It
// rewrites files IN PLACE (originals stay recoverable in git history) and is
// idempotent: an already-small file re-encodes to roughly itself, and re-running
// costs nothing but CPU. `--dry` prints what would change without writing.
//
// PNG->WebP conversions delete the PNG, because the code that loads them globs
// by extension (world/shadowreach.js) or imports an explicit path
// (world/actuality.js) — leaving both would double-ship the asset.

import { readdir, stat, writeFile, unlink, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DRY = process.argv.includes('--dry');

const kb = (n) => `${(n / 1024).toFixed(0)} kB`;
let savedTotal = 0;

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function listDir(dir, re) {
  try {
    return (await readdir(dir)).filter((f) => re.test(f)).sort();
  } catch {
    return [];
  }
}

// Re-encode one file. `out` may differ from `file` (PNG -> WebP); when it does,
// the source is removed so only one copy ships.
async function convert(file, out, pipeline, label) {
  const before = (await stat(file)).size;
  const buf = await pipeline(sharp(file)).toBuffer();
  const delta = before - buf.length;
  const renamed = out !== file;
  // Only rewrite when it actually helps. A rename always goes through: the
  // point there is the format, not the byte count.
  if (!renamed && delta <= 0) {
    console.log(`  = ${path.relative(ROOT, file)} ${kb(before)} (already optimal)`);
    return;
  }
  savedTotal += delta;
  console.log(
    `  ${DRY ? '?' : '✓'} ${path.relative(ROOT, out)} ${kb(before)} -> ${kb(buf.length)}` +
      `  (-${kb(delta)})${label ? `  ${label}` : ''}`
  );
  if (DRY) return;
  await writeFile(out, buf);
  if (renamed) await unlink(file);
}

// Longest side capped, aspect preserved, metadata dropped. `withoutEnlargement`
// keeps this idempotent for files already under the cap.
const fit = (max, opts) => (img) =>
  img.rotate().resize({ width: max, height: max, fit: 'inside', withoutEnlargement: true }).webp(opts);

async function run() {
  // --- the owner's paintings: gallery panels + painting nebulae -------------
  // 24 hang in the Orbital Art Gallery, the titled ones also seed a nebula's
  // palette. 2048 is generous for a panel viewed from across an atrium.
  console.log('artgallery/ (<=2048px, webp q82)');
  const galleryDir = path.join(ROOT, 'artgallery');
  for (const f of await listDir(galleryDir, /\.(webp|png|jpe?g)$/i)) {
    const src = path.join(galleryDir, f);
    const out = src.replace(/\.(png|jpe?g)$/i, '.webp');
    await convert(src, out, fit(2048, { quality: 82, effort: 5 }));
  }

  // --- corridor pictures inside the ship -----------------------------------
  // Five frames, each 0.5 x 0.4 world units. 1024 is already luxurious.
  console.log('src/assets/pictures/ (<=1024px, webp q80)');
  const picDir = path.join(ROOT, 'src/assets/pictures');
  for (const f of await listDir(picDir, /\.(webp|png|jpe?g)$/i)) {
    const src = path.join(picDir, f);
    const out = src.replace(/\.(png|jpe?g)$/i, '.webp');
    await convert(src, out, fit(1024, { quality: 80, effort: 5 }));
  }

  // --- Shadowreach character portraits -------------------------------------
  // Player-facing holograms with alpha. world/shadowreach.js globs the folder
  // by extension and keys on the filename stem, so WebP drops straight in.
  console.log('shadowreach-characters/ (png -> webp q85, alpha kept)');
  const charDir = path.join(ROOT, 'shadowreach-characters');
  for (const f of await listDir(charDir, /\.png$/i)) {
    const src = path.join(charDir, f);
    await convert(src, src.replace(/\.png$/i, '.webp'), (img) =>
      img.webp({ quality: 85, alphaQuality: 90, effort: 5 })
    );
  }

  // --- Actuality's dragon billboards ---------------------------------------
  // Two 1024x1536 layers (granite statue + additive hologram) on a 20x30 plane.
  // world/actuality.js imports these by explicit path — that import is updated
  // to .webp alongside this script.
  console.log('src/assets/actuality-* (png -> webp q85, alpha kept)');
  for (const name of ['actuality-dragon-nobox', 'actuality-dragon-granite']) {
    const src = path.join(ROOT, 'src/assets', `${name}.png`);
    if (await exists(src)) {
      await convert(src, path.join(ROOT, 'src/assets', `${name}.webp`), (img) =>
        img.webp({ quality: 85, alphaQuality: 90, effort: 5 })
      );
    }
  }

  // --- cottage textures (public/, served unhashed) --------------------------
  // Tiled 2x and 6x respectively, so per-texel detail is invisible. Bump and
  // roughness are grayscale data stored as three-channel JPEG: half the
  // resolution and one channel each.
  console.log('public/textures/ (jpeg re-encode, data maps halved + grayscale)');
  const texDir = path.join(ROOT, 'public/textures');
  const texPlan = [
    ['brick_diffuse.jpg', 1024, false],
    ['brick_bump.jpg', 512, true],
    ['brick_roughness.jpg', 512, true],
    ['hardwood2_diffuse.jpg', 1024, false],
    ['hardwood2_bump.jpg', 512, true],
    ['hardwood2_roughness.jpg', 512, true],
  ];
  for (const [name, max, gray] of texPlan) {
    const src = path.join(texDir, name);
    if (!(await exists(src))) continue;
    await convert(
      src,
      src,
      (img) => {
        let p = img.resize({ width: max, height: max, fit: 'inside', withoutEnlargement: true });
        if (gray) p = p.toColorspace('b-w');
        return p.jpeg({ quality: 80, mozjpeg: true, chromaSubsampling: gray ? '4:4:4' : '4:2:0' });
      },
      gray ? '(grayscale)' : ''
    );
  }

  // --- social preview + icons ----------------------------------------------
  // og.jpg is the card every link to the game renders as. Supernova is the
  // most legible painting at card size and it is the owner's own work.
  console.log('public/ social + icons');
  const ogSource = path.join(ROOT, 'artgallery/Supernova.webp');
  if (await exists(ogSource)) {
    const buf = await sharp(ogSource)
      .resize(1200, 630, { fit: 'cover', position: 'attention' })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer();
    console.log(`  ${DRY ? '?' : '✓'} public/og.jpg ${kb(buf.length)}`);
    if (!DRY) await writeFile(path.join(ROOT, 'public/og.jpg'), buf);
  }

  // The same magenta targeting ring as the inline SVG favicon in index.html,
  // rasterised so browsers, iOS and the manifest have real files to point at.
  const iconSvg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="512" height="512">` +
      `<rect width="16" height="16" fill="#04000a"/>` +
      `<circle cx="8" cy="8" r="5" fill="none" stroke="#d4408f" stroke-width="1.5"/>` +
      `<circle cx="8" cy="8" r="2" fill="#0a0010"/></svg>`
  );
  for (const [name, size] of [
    ['favicon-32.png', 32],
    ['icon-192.png', 192],
    ['apple-touch-icon.png', 180],
    ['icon-512.png', 512],
  ]) {
    const buf = await sharp(iconSvg).resize(size, size).png({ compressionLevel: 9 }).toBuffer();
    console.log(`  ${DRY ? '?' : '✓'} public/${name} ${kb(buf.length)}`);
    if (!DRY) await writeFile(path.join(ROOT, 'public', name), buf);
  }

  console.log(`\ntotal saved: ${kb(savedTotal)}${DRY ? ' (dry run — nothing written)' : ''}`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
