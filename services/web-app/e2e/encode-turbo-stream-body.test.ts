import { describe, expect, test } from 'bun:test';
import { encodeTurboStreamBody } from './encode-turbo-stream-body';

describe('encodeTurboStreamBody', () => {
  test('materializes turbo-stream v3 without using Response on string chunks', async () => {
    const body = await encodeTurboStreamBody({
      data: { ok: true, redeemed: true },
    });
    expect(body).toContain('"ok":true');
    expect(body.endsWith('\n')).toBe(true);
  });
});
