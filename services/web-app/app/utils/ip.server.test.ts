import { describe, expect, test } from 'bun:test';
import { getClientIp, ipHash, isCloudFrontEdgeIp } from './ip.server';
import { CLOUDFRONT_IPV4_RANGES } from './cloudfront-ranges.server';

function req(xff?: string) {
  return new Request('https://yawp.school/', {
    headers: xff === undefined ? {} : { 'x-forwarded-for': xff },
  });
}

// Real CloudFront edge addresses taken from the published ranges.
const edgeIp = (n: number) => {
  const [base] = CLOUDFRONT_IPV4_RANGES[n]!.split('/');
  return base!.replace(/\d+$/, (o) => String(Number(o) + 1));
};
const EDGE = edgeIp(0);
const EDGE2 = edgeIp(7);
const VIEWER = '203.0.113.9';

describe('isCloudFrontEdgeIp', () => {
  test('recognises published edge addresses and nothing else', () => {
    expect(isCloudFrontEdgeIp(EDGE)).toBe(true);
    expect(isCloudFrontEdgeIp(EDGE2)).toBe(true);
    expect(isCloudFrontEdgeIp(VIEWER)).toBe(false);
    expect(isCloudFrontEdgeIp('10.0.0.1')).toBe(false);
    expect(isCloudFrontEdgeIp('2001:db8::1')).toBe(false);
    expect(isCloudFrontEdgeIp('not-an-ip')).toBe(false);
  });
});

describe('getClientIp: viewer -> CloudFront -> App Runner', () => {
  test('App Runner appends the edge: "viewer, edge" -> viewer', () => {
    expect(getClientIp(req(`${VIEWER}, ${EDGE}`))).toBe(VIEWER);
  });

  test('App Runner does not append: "viewer" -> viewer (same answer either way)', () => {
    expect(getClientIp(req(VIEWER))).toBe(VIEWER);
  });

  test('client-supplied prefixes cannot change the identity', () => {
    expect(getClientIp(req(`1.1.1.1, 2.2.2.2, ${VIEWER}, ${EDGE}`))).toBe(VIEWER);
    expect(getClientIp(req(`1.1.1.1, 2.2.2.2, ${VIEWER}`))).toBe(VIEWER);
  });

  test('a forged CloudFront address on the left is never reached', () => {
    expect(getClientIp(req(`${EDGE2}, ${VIEWER}, ${EDGE}`))).toBe(VIEWER);
  });

  test('several CloudFront hops are all skipped', () => {
    expect(getClientIp(req(`${VIEWER}, ${EDGE2}, ${EDGE}`))).toBe(VIEWER);
  });
});

describe('getClientIp: App Runner URL hit directly (no CloudFront)', () => {
  test('Envoy appends the real caller; a forged prefix is ignored', () => {
    expect(getClientIp(req(`6.6.6.6, ${VIEWER}`))).toBe(VIEWER);
    expect(getClientIp(req(`${EDGE}, ${VIEWER}`))).toBe(VIEWER);
  });
});

describe('getClientIp: malformed input', () => {
  test('missing header, empty header and garbage on the right are "unknown"', () => {
    expect(getClientIp(req())).toBe('unknown');
    expect(getClientIp(req(''))).toBe('unknown');
    expect(getClientIp(req(`${VIEWER}, garbage`))).toBe('unknown');
    expect(getClientIp(req(`${VIEWER}, `))).toBe('unknown');
  });

  test('spoofable alternates are ignored', () => {
    const r = new Request('https://yawp.school/', {
      headers: { 'cf-connecting-ip': '9.9.9.9', 'x-real-ip': '8.8.8.8' },
    });
    expect(getClientIp(r)).toBe('unknown');
  });

  test('ports and IPv6 are normalised', () => {
    expect(getClientIp(req(`${VIEWER}:51234, ${EDGE}`))).toBe(VIEWER);
    expect(getClientIp(req(`[2001:DB8::1]:443, ${EDGE}`))).toBe('2001:db8::1');
    expect(getClientIp(req(`2001:db8::2, ${EDGE}`))).toBe('2001:db8::2');
  });

  test('a header of only CloudFront hops has no client', () => {
    expect(getClientIp(req(`${EDGE}, ${EDGE2}`))).toBe('unknown');
  });
});

describe('ipHash', () => {
  test('is stable and does not collide for a large sample of addresses', () => {
    const seen = new Set<string>();
    for (let a = 0; a < 200; a += 1) {
      for (let b = 0; b < 200; b += 1) seen.add(ipHash(`10.${a}.${b}.1`));
    }
    expect(seen.size).toBe(40_000);
    expect(ipHash(VIEWER)).toBe(ipHash(VIEWER));
  });
});
