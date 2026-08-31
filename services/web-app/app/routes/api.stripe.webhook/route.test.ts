import { beforeEach, describe, expect, mock, test } from 'bun:test';

const processStripeWebhook = mock();

mock.module('~/domain/student-license/student-license.server', () => ({
  processStripeWebhook,
}));

const { action } = await import('./route');

describe('Stripe webhook route', () => {
  beforeEach(() => processStripeWebhook.mockReset());

  test('rejects a missing signature without processing the event', async () => {
    const response = await action({
      request: new Request('https://yawp.school/api/stripe/webhook', {
        method: 'POST',
        body: '{"id":"evt_1"}',
      }),
    } as any);

    expect(response.status).toBe(400);
    expect(processStripeWebhook).not.toHaveBeenCalled();
  });

  test('passes the untouched body and signature to verified processing', async () => {
    const rawBody = '{\n  "id": "evt_1"\n}';
    processStripeWebhook.mockResolvedValue({ duplicate: false, handled: true });

    const response = await action({
      request: new Request('https://yawp.school/api/stripe/webhook', {
        method: 'POST',
        headers: { 'stripe-signature': 'signed-header' },
        body: rawBody,
      }),
    } as any);

    expect(response.status).toBe(200);
    expect(processStripeWebhook).toHaveBeenCalledWith(
      rawBody,
      'signed-header'
    );
    expect(await response.json()).toEqual({
      received: true,
      duplicate: false,
      handled: true,
    });
  });

  test('returns 400 when signature or payload verification fails', async () => {
    processStripeWebhook.mockRejectedValue(new Error('bad signature'));

    const response = await action({
      request: new Request('https://yawp.school/api/stripe/webhook', {
        method: 'POST',
        headers: { 'stripe-signature': 'bad' },
        body: '{}',
      }),
    } as any);

    expect(response.status).toBe(400);
  });
});
