import { describe, expect, test } from 'bun:test';
import { RATE_LIMITS } from '~/config/rate-limits';
import {
  rateLimitedFormResponse,
  rateLimitedJson,
  sessionTurnLimitJson,
} from './rate-limit.server';

// Measured maxima from AI_ENDPOINT_THROTTLING_PLAN.md. A limit below any of
// these cuts off real, observed usage.
describe('configured limits clear the observed maxima', () => {
  test('tutor session turns > 102, global per minute > 27, per-student windows', () => {
    expect(RATE_LIMITS.tutor.maxSessionTurns).toBeGreaterThan(102);
    expect(RATE_LIMITS.tutor.globalPerMinute).toBeGreaterThan(27);
    expect(RATE_LIMITS.tutor.globalPerHour).toBeGreaterThan(171);
    expect(RATE_LIMITS.tutor.perHour).toBeGreaterThan(35);
    expect(RATE_LIMITS.tutor.perDay).toBeGreaterThan(70);
  });

  test('grading windows pass a ~40 submission class batch and observed teacher maxima', () => {
    expect(RATE_LIMITS.grading.perTenMinutes).toBeGreaterThanOrEqual(40);
    expect(RATE_LIMITS.grading.perHour).toBeGreaterThan(31);
    expect(RATE_LIMITS.grading.perHour).toBeGreaterThanOrEqual(40);
    expect(RATE_LIMITS.grading.perDay).toBeGreaterThan(69);
    expect(RATE_LIMITS.grading.globalPerMinute).toBeGreaterThan(3);
    expect(RATE_LIMITS.grading.maxLlmCallsPerSubmission).toBeGreaterThan(9);
  });

  test('unauthenticated per-IP budgets cover a 47-person school NAT', () => {
    for (const cfg of Object.values(RATE_LIMITS.unauth)) {
      expect(cfg.perIpPerHour).toBeGreaterThan(47);
    }
    expect(RATE_LIMITS.unauth.signup.perIpPerMinute).toBeGreaterThan(47);
    expect(RATE_LIMITS.unauth.verify.perIpPerMinute).toBeGreaterThan(47);
  });
});

describe('429 responses', () => {
  test('rateLimitedJson: Retry-After header and both body shapes', async () => {
    const res = rateLimitedJson('user', 12.2, 'Slow down');
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('13');
    const body = await res.json();
    expect(body).toMatchObject({
      success: false,
      message: 'Slow down',
      error: { code: 'RATE_LIMITED', scope: 'user', message: 'Slow down' },
    });
  });

  test('sessionTurnLimitJson: no Retry-After, says what to do', async () => {
    const res = sessionTurnLimitJson(130);
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBeNull();
    const body = await res.json();
    expect(body.error.code).toBe('SESSION_TURN_LIMIT');
    expect(body.message).toContain('Start a new tutor session');
    expect(body.message).not.toMatch(/try again (later|soon)/i);
  });

  test('rateLimitedFormResponse: 429 with the message under the form field', () => {
    const res = rateLimitedFormResponse('email', 30, 'Too many attempts');
    expect(res.init?.status).toBe(429);
    expect((res.data as { fieldErrors: Record<string, string> }).fieldErrors.email).toBe('Too many attempts');
  });
});
