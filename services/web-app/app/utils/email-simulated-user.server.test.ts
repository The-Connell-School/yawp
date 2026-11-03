import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';

const findFirst = mock(async () => null as { simulatedForClassId: string | null } | null);

mock.module('./db.server.ts', () => ({
  prisma: {
    user: { findFirst },
  },
}));

mock.module('@aws-sdk/client-sesv2', () => ({
  SESv2Client: class {},
  SendEmailCommand: class {},
}));

const originalFetch = globalThis.fetch;
const { sendEmail } = await import('./email.server');

describe('sendEmail simulated user guard', () => {
  beforeEach(() => {
    findFirst.mockReset();
    findFirst.mockResolvedValue(null);
    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(JSON.stringify({ id: 'resend-message-id' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    ) as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test('does not send mail to simulated demo students', async () => {
    findFirst.mockResolvedValueOnce({ simulatedForClassId: 'class-abc' });
    const result = await sendEmail({
      to: 'sim-abc12x-1@example.test',
      subject: 'Reset',
      html: '<p>hi</p>',
      text: 'hi',
    });
    expect(result.status).toBe('error');
    expect(findFirst).toHaveBeenCalledTimes(1);
  });

  test('does not query the database for real recipient addresses', async () => {
    const result = await sendEmail({
      to: 'teacher@yawp.local',
      subject: 'Hello',
      html: '<p>hi</p>',
      text: 'hi',
    });
    expect(findFirst).not.toHaveBeenCalled();
    expect(result.status).toBe('success');
  });

  test('allows send when simulated-address lookup fails', async () => {
    findFirst.mockRejectedValueOnce(new Error('db unavailable'));
    const result = await sendEmail({
      to: 'sim-abc12x-1@example.test',
      subject: 'Reset',
      html: '<p>hi</p>',
      text: 'hi',
    });
    expect(result.status).toBe('success');
  });
});
