import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { createHmac } from 'node:crypto';

const create = mock();
mock.module('~/utils/db.server', () => ({
  prisma: { aiUsageDecisionLog: { create } },
}));

const { computeIpHash, logAllowedUsage, logDeniedUsage } =
  await import('./ai-usage-log.server');
const { CLOUDFRONT_IPV4_RANGES } = await import('./cloudfront-ranges.server');

const EDGE = CLOUDFRONT_IPV4_RANGES[0]!
  .split('/')[0]!
  .replace(/\d+$/, (n) => String(Number(n) + 1));
const req = (xff?: string) =>
  new Request('https://yawp.school/', {
    headers: xff ? { 'x-forwarded-for': xff } : {},
  });

let saved: string | undefined;
beforeEach(() => {
  saved = process.env.AI_USAGE_IP_HMAC_SECRET;
  process.env.AI_USAGE_IP_HMAC_SECRET = 'test-secret';
  create.mockReset();
});
afterEach(() => {
  if (saved === undefined) delete process.env.AI_USAGE_IP_HMAC_SECRET;
  else process.env.AI_USAGE_IP_HMAC_SECRET = saved;
});

describe('computeIpHash', () => {
  test('is an HMAC of the trusted client address, never the raw IP', () => {
    const h = computeIpHash(req(`203.0.113.9, ${EDGE}`));
    expect(h).toBe(
      createHmac('sha256', 'test-secret').update('203.0.113.9').digest('hex')
    );
    expect(h).not.toContain('203.0.113.9');
  });

  test('forged leading X-Forwarded-For entries do not change the hash', () => {
    const real = computeIpHash(req(`203.0.113.9, ${EDGE}`));
    expect(computeIpHash(req(`1.2.3.4, 203.0.113.9, ${EDGE}`))).toBe(real);
    expect(computeIpHash(req(`9.9.9.9, 203.0.113.9, ${EDGE}`))).toBe(real);
  });

  test('null without a secret, without a header, or with only infrastructure hops', () => {
    expect(computeIpHash(req())).toBeNull();
    expect(computeIpHash(req(EDGE))).toBeNull();
    delete process.env.AI_USAGE_IP_HMAC_SECRET;
    expect(computeIpHash(req(`203.0.113.9, ${EDGE}`))).toBeNull();
  });
});

describe('writers never throw', () => {
  test('allowed and denied rows are written without prompts or raw IPs', async () => {
    await logAllowedUsage({
      route: 'r',
      requestId: 'q',
      units: 1,
      inputTokens: 3,
      outputTokens: 4,
      latencyMs: 5,
      ipHash: 'abc',
    });
    await logDeniedUsage({
      route: 'r',
      requestId: 'q',
      units: 1,
      decision: 'DENIED_USER',
    });
    expect(create).toHaveBeenCalledTimes(2);
    const keys = Object.keys(create.mock.calls[0]![0].data);
    expect(keys.some((k) => /prompt|message|body|content|^ip$/i.test(k))).toBe(
      false
    );
  });

  test('a database failure is swallowed', async () => {
    create.mockRejectedValue(new Error('db down'));
    await expect(
      logAllowedUsage({ route: 'r', requestId: 'q', units: 1 })
    ).resolves.toBeUndefined();
    await expect(
      logDeniedUsage({
        route: 'r',
        requestId: 'q',
        units: 1,
        decision: 'DENIED_ORG',
      })
    ).resolves.toBeUndefined();
  });
});
