import { expect, test } from 'bun:test';
import { action } from './route';

test('an unsigned body is refused before any approval is updated', async () => {
  const response = await action({
    request: new Request('https://yawp.school/api/email/events', {
      method: 'POST',
      body: '{"type":"email.bounced","data":{"email_id":"re_1"}}',
      headers: { 'svix-id': 'msg_1', 'svix-timestamp': '1', 'svix-signature': 'v1,nope' },
    }),
  } as never);
  expect(response.status).toBe(401);
  expect(await response.json()).toEqual({ error: 'invalid_signature' });
});
