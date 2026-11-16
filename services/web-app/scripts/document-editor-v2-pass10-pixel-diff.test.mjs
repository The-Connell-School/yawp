import { describe, expect, test, beforeAll, afterAll } from 'bun:test';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { computeDesignPreviewDiff } from './document-editor-v2-pass10-pixel-diff.mjs';

const TMP = '/tmp/doc-editor-v2-pixel-diff-test';

function solidPng(path, width, height, rgba) {
  const png = new PNG({ width, height });
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = rgba[0];
    png.data[i + 1] = rgba[1];
    png.data[i + 2] = rgba[2];
    png.data[i + 3] = rgba[3];
  }
  writeFileSync(path, PNG.sync.write(png));
}

describe('document-editor-v2-pass10-pixel-diff', () => {
  beforeAll(() => {
    mkdirSync(TMP, { recursive: true });
  });
  afterAll(() => {
    rmSync(TMP, { recursive: true, force: true });
  });

  test('identical images diff at 0%', () => {
    const path = join(TMP, 'same.png');
    solidPng(path, 20, 10, [10, 20, 30, 255]);
    const result = computeDesignPreviewDiff(path, path, null);
    expect(result.diffPercent).toBe(0);
  });

  test('mismatched images report non-zero diff', () => {
    const a = join(TMP, 'a.png');
    const b = join(TMP, 'b.png');
    solidPng(a, 10, 10, [0, 0, 0, 255]);
    solidPng(b, 10, 10, [255, 255, 255, 255]);
    const result = computeDesignPreviewDiff(a, b, join(TMP, 'diff.png'));
    expect(result.diffPercent).toBeGreaterThan(90);
    expect(result.mismatchedPixels).toBe(100);
  });
});