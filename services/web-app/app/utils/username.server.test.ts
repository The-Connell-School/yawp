import { describe, expect, test } from 'bun:test';
import { validateUsername, normalizeUsername } from './username.server';

describe('validateUsername', () => {
  test('accepts valid handles', () => {
    expect(validateUsername('cool.writer_1')).toEqual({
      ok: true,
      username: 'cool.writer_1',
    });
  });

  test('rejects @ in handle', () => {
    const result = validateUsername('bad@handle');
    expect(result.ok).toBe(false);
  });

  test('rejects reserved words', () => {
    const result = validateUsername('teacher');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('reserved');
  });

  test('normalizes case', () => {
    expect(normalizeUsername('MyHandle')).toBe('myhandle');
  });
});
