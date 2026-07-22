import { describe, expect, test } from 'bun:test';
import {
  getLtiRequesterFingerprint,
  isEmbeddedLtiRequest,
  readBoundedLtiForm,
} from './lti-request.server';

describe('LTI browser request boundary', () => {
  test.each(['iframe', 'embed', 'object'])(
    'rejects %s presentation while allowing a top-level document',
    (destination) => {
      expect(
        isEmbeddedLtiRequest(
          new Request('https://yawp.example/lti/login', {
            headers: { 'sec-fetch-dest': destination },
          })
        )
      ).toBe(true);
      expect(
        isEmbeddedLtiRequest(
          new Request('https://yawp.example/lti/login', {
            headers: { 'sec-fetch-dest': 'document' },
          })
        )
      ).toBe(false);
    }
  );

  test('does not trust caller-controlled forwarded-for values', () => {
    expect(
      getLtiRequesterFingerprint(
        new Request('https://yawp.example/lti/login', {
          headers: { 'x-forwarded-for': '203.0.113.8' },
        })
      )
    ).toBe('unattributed');
    expect(
      getLtiRequesterFingerprint(
        new Request('https://yawp.example/lti/login', {
          headers: { 'x-nf-client-connection-ip': '203.0.113.9' },
        })
      )
    ).toBe('203.0.113.9');
  });
});

describe('bounded LTI form reader', () => {
  test('accepts the exact form media type with an optional charset', async () => {
    const request = new Request('https://yawp.example/lti/launch', {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
      },
      body: 'state=one&id_token=two',
    });
    const result = await readBoundedLtiForm(request, { maxBytes: 100 });
    expect(Object.fromEntries(result)).toEqual({
      state: 'one',
      id_token: 'two',
    });
  });

  test.each([
    'application/json',
    'text/plain',
    'application/x-www-form-urlencoded-evil',
  ])('rejects non-form media type %s', async (contentType) => {
    await expect(
      readBoundedLtiForm(
        new Request('https://yawp.example/lti/launch', {
          method: 'POST',
          headers: { 'content-type': contentType },
          body: 'state=one',
        }),
        { maxBytes: 100 }
      )
    ).rejects.toThrow('form encoding');
  });

  test('stops an undeclared streaming body at the byte limit', async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('state='));
        controller.enqueue(new TextEncoder().encode('x'.repeat(100)));
        controller.close();
      },
    });
    await expect(
      readBoundedLtiForm(
        new Request('https://yawp.example/lti/launch', {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body,
          duplex: 'half',
        } as RequestInit & { duplex: 'half' }),
        { maxBytes: 32 }
      )
    ).rejects.toThrow('too large');
  });

  test('rejects a declared body larger than the limit before reading it', async () => {
    await expect(
      readBoundedLtiForm(
        new Request('https://yawp.example/lti/launch', {
          method: 'POST',
          headers: {
            'content-type': 'application/x-www-form-urlencoded',
            'content-length': '1000',
          },
          body: 'state=one',
        }),
        { maxBytes: 32 }
      )
    ).rejects.toThrow('length');
  });
});
