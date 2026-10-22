import { afterEach, expect, mock, test } from 'bun:test';

const sent: Array<{ subject: string }> = [];
mock.module('~/utils/email.server', () => ({
  sendEmail: async (message: { subject: string }) => {
    sent.push(message);
    return { status: 'success' };
  },
}));

const { deliverCode } = await import('./mail.server');

const original = { ...process.env };
afterEach(() => {
  for (const key of Object.keys(process.env))
    if (!(key in original)) delete process.env[key];
  Object.assign(process.env, original);
  sent.length = 0;
});

test('the sign-in code email subject writes the name as Yawp!', async () => {
  process.env.NODE_ENV = 'production';
  process.env.YAWP_ENVIRONMENT = 'production';
  process.env.DATABASE_URL = 'postgresql://user:pw@db.internal:5432/yawp';
  process.env.EMAIL_PROVIDER = 'ses';

  await deliverCode('teacher@example.org', '123456');

  expect(sent).toHaveLength(1);
  expect(sent[0]!.subject).toBe('Your Yawp! sign-in code');
});
