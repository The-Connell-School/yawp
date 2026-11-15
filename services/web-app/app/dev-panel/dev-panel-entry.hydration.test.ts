import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('DevPanelMount hydration', () => {
  test('code-splits without React.lazy Suspense', () => {
    const source = readFileSync(join(import.meta.dir, 'dev-panel-entry.tsx'), 'utf8');
    expect(source).toContain("import('./dev-panel-mount')");
    expect(source).not.toMatch(/\blazy\s*\(/);
    expect(source).not.toContain('<Suspense');
    expect(source).toContain('useEffect');
  });
});