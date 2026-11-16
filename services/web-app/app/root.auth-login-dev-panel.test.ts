import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('root auth login dev panel gate', () => {
  test('does not mount dev panel on /auth/login', () => {
    const source = readFileSync(join(import.meta.dir, 'root.tsx'), 'utf8');
    expect(source).toContain("location.pathname !== '/auth/login'");
  });
});