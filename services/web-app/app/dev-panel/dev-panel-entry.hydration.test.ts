import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('DevPanelMount hydration', () => {
  test('mounts without React.lazy Suspense', () => {
    const source = readFileSync(join(import.meta.dir, 'dev-panel-entry.tsx'), 'utf8');
    expect(source).toContain('./dev-panel-mount');
    expect(source).not.toContain('React.lazy');
    expect(source).not.toContain('lazy(');
    expect(source).not.toContain('<Suspense');
  });
});