// Derive banner-shaped crops from the full hero artwork.
//
// Run after adding or regenerating images:  node scripts/build-hero-banners.mjs
//
// Why this exists: the trip banner is a LOW strip — roughly 9:1 at desktop width.
// The generated artwork is about 2.4:1. Dropping 2.4:1 art into a 9:1 slot with
// object-fit:cover shows only ~26% of the image, and the visible window lands
// mid-composition — slicing straight through the sun and the tops of trees and
// cabins. No object-position value fixes that; the aspect ratios are just too far
// apart.
//
// So each image gets a second, banner-shaped asset: a wide band cut from the
// original. In a 9:1 slot a 7:1 band shows ~78% of its height instead of 26%, so
// the composition survives.
//
// The band is centred at 60% of the image height, not 50%. These illustrations
// put the horizon a little below centre with silhouettes beneath it, so 60%
// captures the horizon line and the mass below it — the part that reads as "a
// place" — while dropping empty sky. The sun usually falls outside the band; that
// is the trade for a strip this low.
//
// The full-size images stay as they are: the dashboard card wash uses a much
// squarer box and wants the whole frame.

import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, extname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const HERO_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'lib', 'assets', 'hero');
const OUT_DIR = join(HERO_DIR, 'banner');

/** Target aspect for the banner crop. */
const BAND_ASPECT = 7;
/** Vertical centre of the band, as a fraction of image height.
 *  0.57 rather than 0.60: at 0.60 the band's top edge landed exactly on the
 *  apex of the tallest silhouettes (tree tips, tent peak) and shaved them. A
 *  little headroom keeps them whole. */
const BAND_CENTER = 0.57;

const SOURCES = /\.(webp|jpg|jpeg|png|avif)$/i;

await mkdir(OUT_DIR, { recursive: true });

const files = (await readdir(HERO_DIR)).filter((f) => SOURCES.test(f));
if (!files.length) {
  console.log(`No hero artwork in ${HERO_DIR} — nothing to do.`);
  process.exit(0);
}

for (const file of files) {
  const src = join(HERO_DIR, file);
  const name = basename(file, extname(file));
  const out = join(OUT_DIR, `${name}.webp`);

  const { width, height } = await sharp(src).metadata();
  if (!width || !height) {
    console.warn(`  ${file}: could not read dimensions, skipped`);
    continue;
  }

  const bandH = Math.round(width / BAND_ASPECT);
  if (bandH >= height) {
    // Already at least as wide as the target band — use it whole.
    await sharp(src).webp({ quality: 82 }).toFile(out);
    console.log(`  ${name}: already ${(width / height).toFixed(2)}:1, copied as-is`);
    continue;
  }

  // Centre the band at BAND_CENTER, clamped inside the image.
  const top = Math.max(0, Math.min(height - bandH, Math.round(height * BAND_CENTER - bandH / 2)));

  await sharp(src)
    .extract({ left: 0, top, width, height: bandH })
    .webp({ quality: 82 })
    .toFile(out);

  console.log(
    `  ${name}: ${width}×${height} → ${width}×${bandH} (band at y=${top}, ${(width / bandH).toFixed(1)}:1)`
  );
}

console.log(`\nWrote ${files.length} banner crops to ${OUT_DIR}`);
