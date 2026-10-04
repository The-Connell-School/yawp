import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import {
  checkPreviewAccessAttempt,
  clearFailedPreviewAccessAttempts,
  recordFailedPreviewAccessAttempt,
  resetPreviewAccessRateLimitForTests,
} from './preview-access-rate-limit.server';
import { CLOUDFRONT_IPV4_RANGES } from './cloudfront-ranges.server';

const originalWarn = console.warn;

// A real CloudFront edge address (first published range, +1), so the shared helper
// recognises it as the trusted hop to skip.
const CLOUDFRONT_EDGE_IP = `${CLOUDFRONT_IPV4_RANGES[0]!.split('/')[0]!.replace(/\d+$/, (n) => String(Number(n) + 1))}`;

function request(clientIp: string, cloudFrontEdgeIp = CLOUDFRONT_EDGE_IP) {
  return new Request('https://preview.yawp.school/auth/preview-access', {
    method: 'POST',
    // Behind CloudFront the last hop is the CloudFront edge; the real client is the first non-CloudFront hop from the right.
    headers: { 'x-forwarded-for': `${clientIp}, ${cloudFrontEdgeIp}` },
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
