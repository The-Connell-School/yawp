import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('UnifiedLogin fetcher completion', () => {
  test('resolves transport when fetcher goes idle without JSON after redirect actions', () => {
    const source = readFileSync(
      join(import.meta.dir, 'unified-login.tsx'),
      'utf8'
    );
    expect(source).toContain('pendingRedirectTo');
    expect(source).toMatch(
      /if \(fetcher\.data\)[\s\S]*resolve\(fetcher\.data\)[\s\S]*resolve\(\{ redirectTo/
    );
  });
});