import { describe, expect, test } from 'bun:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const expressEntry = await Bun.file(
  path.join(path.dirname(fileURLToPath(import.meta.url)), 'express.ts')
).text();

describe('yawp production express server', () => {
  test('registers the site-license course gate before express.static("public")', () => {
    const gate = expressEntry.indexOf('siteLicenseCourseAssetExpressMiddleware');
    const publicStatic = expressEntry.indexOf('express.static(\'public\'');
    expect(gate).toBeGreaterThan(-1);
    expect(publicStatic).toBeGreaterThan(-1);
    expect(gate).toBeLessThan(publicStatic);
  });
});