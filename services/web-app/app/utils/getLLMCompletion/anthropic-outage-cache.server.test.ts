import { beforeEach, describe, expect, test } from 'bun:test';
import {
  getAnthropicOutageState,
  isAnthropicOutageCircuitOpen,
  markAnthropicOutageClosed,
  markAnthropicOutageOpen,
  resetAnthropicOutageForTest,
} from './anthropic-outage-cache.server';

describe('anthropic outage cache', () => {
  beforeEach(() => {
    resetAnthropicOutageForTest();
  });

  test('opens for the configured ttl and expires after it', () => {
    const now = Date.parse('2026-06-23T15:00:00.000Z');

    expect(isAnthropicOutageCircuitOpen(now)).toBe(false);

    markAnthropicOutageOpen({
      reason: 'status:529',
      now,
      ttlMs: 300_000,
    });

    expect(isAnthropicOutageCircuitOpen(now + 299_999)).toBe(true);
    expect(isAnthropicOutageCircuitOpen(now + 300_001)).toBe(false);
    expect(getAnthropicOutageState(now + 300_001)).toMatchObject({
      isOpen: false,
      reason: 'status:529',
    });
  });

  test('can be closed after a successful Anthropic probe', () => {
    const now = Date.parse('2026-06-23T15:00:00.000Z');

    markAnthropicOutageOpen({
      reason: 'status:504',
      now,
      ttlMs: 300_000,
    });
    expect(isAnthropicOutageCircuitOpen(now + 1)).toBe(true);

    markAnthropicOutageClosed();

    expect(isAnthropicOutageCircuitOpen(now + 2)).toBe(false);
    expect(getAnthropicOutageState(now + 2)).toEqual({
      isOpen: false,
      openUntilMs: 0,
      openedAtMs: null,
      reason: null,
    });
  });
});
