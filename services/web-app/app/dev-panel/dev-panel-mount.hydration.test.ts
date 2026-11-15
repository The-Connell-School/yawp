import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('DevPanelMount hydration deferral', () => {
  test('defers mounting until client hydration completes', () => {
    const source = readFileSync(join(import.meta.dir, 'dev-panel-mount.tsx'), 'utf8');
    expect(source).toContain('useAfterHydration');
    expect(source).toMatch(/if\s*\(\s*!hydrated\s*\)\s*return\s*null/);
  });
});