import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

describe('free-tier mobile shell padding at 320px', () => {
  test('applies 32px without a back link and 72px when the back link renders', () => {
    const script = path.join(
      import.meta.dir,
      '../scripts/verify-free-tier-mobile-chrome-padding.mjs'
    );
    const result = spawnSync(process.execPath, [script], {
      cwd: path.join(import.meta.dir, '..'),
      encoding: 'utf8',
      env: process.env,
    });
    if (result.status !== 0) {
      throw new Error(
        [result.stderr, result.stdout, 'verify-free-tier-mobile-chrome-padding failed']
          .filter(Boolean)
          .join('\n')
      );
    }
    expect(result.stdout.trim()).toBe('ok');
  });
});
