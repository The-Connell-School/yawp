import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import {
  checkPreviewAccessAttempt,
  clearFailedPreviewAccessAttempts,
  recordFailedPreviewAccessAttempt,
  resetPreviewAccessRateLimitForTests,
} from './preview-access-rate-limit.server';

const originalWarn = console.warn;

function request(address: string) {
  return new Request('https://preview.yawp.school/auth/preview-access', {
    method: 'POST',
    headers: { 'x-forwarded-for': `198.51.100.1, ${address}` },
  });
}

describe('preview access rate limit', () => {
  beforeEach(() => {
    resetPreviewAccessRateLimitForTests();
    console.warn = mock(() => {});
  });

  afterEach(() => {
    console.warn = originalWarn;
    resetPreviewAccessRateLimitForTests();
  });

  test('blocks a client for fifteen minutes after ten failures', () => {
    const attempt = request('203.0.113.10');
    for (let count = 0; count < 10; count += 1) {
      recordFailedPreviewAccessAttempt(attempt, 1_000);
    }

    expect(checkPreviewAccessAttempt(attempt, 1_000)).toEqual({
      allowed: false,
      retryAfter: 900,
    });
    expect(checkPreviewAccessAttempt(attempt, 901_001)).toEqual({
      allowed: true,
      retryAfter: 0,
    });
  });

  test('applies an aggregate brake across many client addresses', () => {
    for (let count = 0; count < 100; count += 1) {
      recordFailedPreviewAccessAttempt(
        request(`203.0.113.${count + 1}`),
        2_000
      );
    }

    expect(checkPreviewAccessAttempt(request('192.0.2.1'), 2_000)).toEqual({
      allowed: false,
      retryAfter: 900,
    });
  });

  test('a valid credential clears only that client failure bucket', () => {
    const first = request('203.0.113.20');
    const second = request('203.0.113.21');
    for (let count = 0; count < 10; count += 1) {
      recordFailedPreviewAccessAttempt(first, 3_000);
      recordFailedPreviewAccessAttempt(second, 3_000);
    }

    clearFailedPreviewAccessAttempts(first);

    expect(checkPreviewAccessAttempt(first, 3_000).allowed).toBe(true);
    expect(checkPreviewAccessAttempt(second, 3_000).allowed).toBe(false);
  });
});
