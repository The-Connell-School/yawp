import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('DevPanelMount hydration', () => {
  test('lazy-loads dev panel mount without a static dev-panel-mount import', () => {
    const source = readFileSync(join(import.meta.dir, 'dev-panel-entry.tsx'), 'utf8');
    expect(source).toMatch(/\blazy\s*\(/);
    expect(source).toContain('<Suspense');
    expect(source).not.toMatch(
      /import\s+\{[^}]*DevPanelMount[^}]*\}\s+from\s+['"]\.\/dev-panel-mount['"]/
    );
  });
});