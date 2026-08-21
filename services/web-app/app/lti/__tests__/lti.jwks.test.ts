import { describe, expect, test } from 'bun:test';
import { loader } from '~/routes/lti.jwks.ts';

function req(): Request {
  return new Request('https://example.test/lti/jwks');
}

describe('/lti/jwks', () => {
  test('returns a JWKS with one RSA key', async () => {
    const res = await loader({ request: req(), params: {} } as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.keys)).toBe(true);
    expect(body.keys[0].kty).toBe('RSA');
    expect(body.keys[0].kid).toBeDefined();
  });
});

