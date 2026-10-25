import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('dev-panel mobile styles', () => {
  test('positions jump toasts at the top inside the safe area on phone', () => {
    const css = readFileSync(join(import.meta.dir, 'dev-panel.css'), 'utf8');
    expect(css).toMatch(
      /@media \(max-width: 639px\)[\s\S]*yawp-dev-panel-jump-toast[\s\S]*env\(safe-area-inset-top/
    );
    expect(css).toMatch(/min\(calc\(100vw - 32px\), 360px\)/);
  });
});
