/**
 * Pixel diff helper for pass 10 design | preview captures.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

function loadPng(path) {
  return PNG.sync.read(readFileSync(path));
}

function padToSize(img, width, height) {
  if (img.width === width && img.height === height) return img;
  const out = new PNG({ width, height });
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (width * y + x) << 2;
      if (x < img.width && y < img.height) {
        const sidx = (img.width * y + x) << 2;
        out.data[idx] = img.data[sidx];
        out.data[idx + 1] = img.data[sidx + 1];
        out.data[idx + 2] = img.data[sidx + 2];
        out.data[idx + 3] = img.data[sidx + 3];
      } else {
        out.data[idx] = 0xf9;
        out.data[idx + 1] = 0xf7;
        out.data[idx + 2] = 0xf4;
        out.data[idx + 3] = 255;
      }
    }
  }
  return out;
}

/**
 * @returns {{ diffPercent: number, mismatchedPixels: number, totalPixels: number, diffPath: string | null }}
 */
export function computeDesignPreviewDiff(designPath, previewPath, diffPath) {
  const a = loadPng(designPath);
  const b = loadPng(previewPath);
  const width = Math.max(a.width, b.width);
  const height = Math.max(a.height, b.height);
  const img1 = padToSize(a, width, height);
  const img2 = padToSize(b, width, height);
  const diff = new PNG({ width, height });
  const mismatched = pixelmatch(img1.data, img2.data, diff.data, width, height, {
    threshold: 0.12,
    includeAA: true,
  });
  const total = width * height;
  if (diffPath) {
    mkdirSync(dirname(diffPath), { recursive: true });
    writeFileSync(diffPath, PNG.sync.write(diff));
  }
  return {
    diffPercent: total === 0 ? 0 : (mismatched / total) * 100,
    mismatchedPixels: mismatched,
    totalPixels: total,
    diffPath: diffPath ?? null,
  };
}