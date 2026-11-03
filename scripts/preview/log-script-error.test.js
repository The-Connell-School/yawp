import { describe, expect, test } from 'bun:test';
import { buildSafeErrorForLog } from './log-script-error.mjs';

describe('preview log-script-error', () => {
  test('buildSafeErrorForLog redacts token-like substrings in messages', () => {
    const safe = buildSafeErrorForLog(new Error('connect failed password=super-secret'));
    expect(safe.message).toBe('connect failed [redacted-token]');
    expect(safe.name).toBe('Error');
  });
});
