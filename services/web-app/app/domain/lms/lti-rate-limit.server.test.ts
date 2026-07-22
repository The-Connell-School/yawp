import { beforeEach, describe, expect, test } from 'bun:test';
import {
  admitLtiPublicRequest,
  clearLtiRateLimitsForTests,
} from './lti-rate-limit.server';

describe('bounded public LTI request admission', () => {
  beforeEach(clearLtiRateLimitsForTests);

  test('limits each public request kind and requester independently', () => {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      admitLtiPublicRequest({ kind: 'login', requester: 'ip-a', nowMs: 100 });
    }
    expect(() =>
      admitLtiPublicRequest({ kind: 'login', requester: 'ip-a', nowMs: 100 })
    ).toThrow('rate limit');
    expect(() =>
      admitLtiPublicRequest({ kind: 'login', requester: 'ip-b', nowMs: 100 })
    ).not.toThrow();
    expect(() =>
      admitLtiPublicRequest({ kind: 'launch', requester: 'ip-a', nowMs: 100 })
    ).not.toThrow();
  });

  test('opens a new window after one minute', () => {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      admitLtiPublicRequest({ kind: 'login', requester: 'ip-a', nowMs: 100 });
    }
    expect(() =>
      admitLtiPublicRequest({
        kind: 'login',
        requester: 'ip-a',
        nowMs: 60_101,
      })
    ).not.toThrow();
  });
});
