import { describe, expect, test } from 'bun:test';
import { getClientIp, ipHash } from './ip.server';

function req(headers: Record<string, string>) {
  return new Request('https://yawp.school/', { headers });
}

describe('getClientIp (CloudFront -> App Runner: "client, edge")', () => {
  test('takes the second-from-last entry', () => {
    expect(getClientIp(req({ 'x-forwarded-for': '203.0.113.9, 198.51.100.7' }))).toBe('203.0.113.9');
  });

  test('a spoofed prefix cannot change the identity (CloudFront appends the real viewer)', () => {
    const spoofed = req({ 'x-forwarded-for': '1.1.1.1, 2.2.2.2, 203.0.113.9, 198.51.100.7' });
    expect(getClientIp(spoofed)).toBe('203.0.113.9');
  });

  test('single entry is used as-is, missing header is "unknown" without fallbacks', () => {
    expect(getClientIp(req({ 'x-forwarded-for': '203.0.113.9' }))).toBe('203.0.113.9');
    expect(getClientIp(req({}))).toBe('unknown');
  });

  test('tolerates whitespace and empty segments', () => {
    expect(getClientIp(req({ 'x-forwarded-for': ' 203.0.113.9 ,, 198.51.100.7 ' }))).toBe('203.0.113.9');
  });
});

describe('ipHash', () => {
  test('is stable and does not collide for a large sample of addresses', () => {
    const seen = new Set<string>();
    for (let a = 0; a < 200; a += 1) {
      for (let b = 0; b < 200; b += 1) seen.add(ipHash(`10.${a}.${b}.1`));
    }
    expect(seen.size).toBe(40_000);
    expect(ipHash('203.0.113.9')).toBe(ipHash('203.0.113.9'));
  });
});
