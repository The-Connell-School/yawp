import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('ClassCodeInput', () => {
  test('debounces live availability checks against the API route', () => {
    const source = readFileSync(
      join(import.meta.dirname, 'class-code-input.tsx'),
      'utf8'
    );

    expect(source).toContain('useDebounce(value, 400)');
    expect(source).toContain('/api/class-code-availability');
    expect(source).toContain('skipLiveAvailability');
    expect(source).toContain('CLASS_CODE_COLLISION_MESSAGE');
  });
});
