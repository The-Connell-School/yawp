import { describe, expect, test } from 'bun:test';
import { decodeRouterDataResponse } from './decode-router-data';
import { encodeTurboStreamBody } from './encode-turbo-stream-body';

describe('encodeTurboStreamBody', () => {
  test('produces a decodable React Router single-fetch body', async () => {
    const payload = {
      data: { ok: true, redeemed: true, bypassWaitlist: false },
    };
    const body = await encodeTurboStreamBody(payload);
    expect(body.endsWith('\n')).toBe(true);
    expect(body).not.toMatch(/^\d+,/);

    const decoded = decodeRouterDataResponse(body.trim()) as {
      data: typeof payload.data;
    };
    expect(decoded).toEqual(payload);
  });
});
