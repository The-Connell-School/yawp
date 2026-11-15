import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('DevPanelMount hydration', () => {
  test('defers lazy Suspense until after hydration', () => {
    const source = readFileSync(join(import.meta.dir, 'dev-panel-entry.tsx'), 'utf8');
    expect(source).toContain('useAfterHydration');
    expect(source).toMatch(/if \(!interactive\)[\s\S]*return null/);
  });
});