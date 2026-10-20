import { describe, expect, test } from 'bun:test';
import { loader } from '~/routes/lti.jwks/route.ts';

function req(): Request {
  return new Request('https://example.test/lti/jwks');
}

describe('/lti/jwks', () => {
  test('returns a JWKS with one RSA key', async () => {
    const res = await loader();
    const body = (res as { data: { keys: Array<{ kty: string; kid?: string }> } }).data;
    expect(Array.isArray(body.keys)).toBe(true);
    expect(body.keys[0].kty).toBe('RSA');
    expect(body.keys[0].kid).toBeDefined();
  });
});
