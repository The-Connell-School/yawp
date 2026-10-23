import { beforeEach, describe, expect, mock, test } from 'bun:test';

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

const { sendEmail } = await import('./email.server');

describe('sendEmail simulated user guard', () => {
  beforeEach(() => {
    findFirst.mockReset();
    findFirst.mockResolvedValue(null);
  });

  test('does not send mail to simulated demo students', async () => {
    findFirst.mockResolvedValueOnce({ simulatedForClassId: 'class-abc' });
    const result = await sendEmail({
      to: 'sim-abc12-1@example.test',
      subject: 'Reset',
      html: '<p>hi</p>',
      text: 'hi',
    });
    expect(result.status).toBe('error');
  });
});
