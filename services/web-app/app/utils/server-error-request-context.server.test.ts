import { describe, expect, test } from 'bun:test';
import { buildServerErrorRequestContext } from './server-error-request-context.server';

describe('buildServerErrorRequestContext', () => {
  test('logs method, path without query string, request id, and allow-listed headers only', () => {
    const request = new Request('https://example.test/app/classes?secret=1', {
      method: 'POST',
      headers: {
        cookie: 'session=super-secret',
        authorization: 'Bearer token-value',
        'x-forwarded-for': '203.0.113.1',
        'set-cookie': 'other=bad',
        'user-agent': 'test-agent/1.0',
        'x-request-id': 'req-abc-123',
      },
    });

    expect(buildServerErrorRequestContext(request)).toEqual({
      method: 'POST',
      path: '/app/classes',
      requestId: 'req-abc-123',
      headers: {
        'user-agent': 'test-agent/1.0',
        'x-request-id': 'req-abc-123',
      },
    });
  });
});
