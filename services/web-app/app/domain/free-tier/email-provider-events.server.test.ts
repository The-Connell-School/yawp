import { createHmac, createSign } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, expect, mock, test } from 'bun:test';
import {
  handleInboundEmailEvent,
  isSnsAmazonUrl,
  snsStringToSign,
  verifyResendWebhookSignature,
} from './email-provider-events.server';

const record = mock(
  async (_args: { providerMessageId: string; reason: 'bounced' | 'failed' }) => ({
    ok: true as const,
    teacherNotified: true,
    teamNotified: true,
  })
);

let certPem = '';
let keyPem = '';

beforeAll(() => {
  const dir = mkdtempSync(join(tmpdir(), 'sns-cert-'));
  const keyPath = join(dir, 'key.pem');
  const certPath = join(dir, 'cert.pem');
  execFileSync('openssl', [
    'req',
    '-x509',
    '-newkey',
    'rsa:2048',
    '-keyout',
    keyPath,
    '-out',
    certPath,
    '-days',
    '1',
    '-nodes',
    '-subj',
    '/CN=sns.test',
  ]);
  keyPem = readFileSync(keyPath, 'utf8');
  certPem = readFileSync(certPath, 'utf8');
  writeFileSync(join(dir, 'unused'), '');
});

function signSns(message: Record<string, string>) {
  const signed = snsStringToSign(message);
  const signer = createSign('RSA-SHA1');
  signer.update(signed!, 'utf8');
  return signer.sign(keyPem, 'base64');
}

test('resend signatures accept the current body and reject a swapped one', () => {
  const secret = `whsec_${Buffer.from('resend-test-secret').toString('base64')}`;
  const rawBody = JSON.stringify({
    type: 'email.bounced',
    data: { email_id: 're_1' },
  });
  const timestamp = '1700000000';
  const id = 'msg_1';
  const signature = createHmac('sha256', Buffer.from('resend-test-secret'))
    .update(`${id}.${timestamp}.${rawBody}`)
    .digest('base64');
  const headers = new Headers({
    'svix-id': id,
    'svix-timestamp': timestamp,
    'svix-signature': `v1,${signature}`,
  });
  expect(
    verifyResendWebhookSignature({
      rawBody,
      headers,
      secret,
      now: 1700000000 * 1000,
    })
  ).toBe(true);
  expect(
    verifyResendWebhookSignature({
      rawBody: `${rawBody} `,
      headers,
      secret,
      now: 1700000000 * 1000,
    })
  ).toBe(false);
});

test('sns certificate urls stay on amazonaws', () => {
  expect(isSnsAmazonUrl('https://sns.us-east-1.amazonaws.com/cert.pem')).toBe(true);
  expect(isSnsAmazonUrl('https://sns.us-east-1.amazonaws.com.evil.test/cert.pem')).toBe(
    false
  );
  expect(isSnsAmazonUrl('http://sns.us-east-1.amazonaws.com/cert.pem')).toBe(false);
});

test('a signed resend bounce records the provider message', async () => {
  record.mockClear();
  const secret = `whsec_${Buffer.from('resend-test-secret').toString('base64')}`;
  process.env.RESEND_WEBHOOK_SECRET = secret;
  const rawBody = JSON.stringify({
    type: 'email.bounced',
    data: { email_id: 're_bounce_1' },
  });
  const timestamp = '1700000000';
  const signature = createHmac('sha256', Buffer.from('resend-test-secret'))
    .update(`msg_1.${timestamp}.${rawBody}`)
    .digest('base64');
  const result = await handleInboundEmailEvent({
    rawBody,
    now: 1700000000 * 1000,
    record,
    headers: new Headers({
      'svix-id': 'msg_1',
      'svix-timestamp': timestamp,
      'svix-signature': `v1,${signature}`,
    }),
  });
  expect(result.status).toBe(200);
  expect(record).toHaveBeenCalledWith({
    providerMessageId: 're_bounce_1',
    reason: 'bounced',
  });
});

test('an unsigned bounce is refused', async () => {
  record.mockClear();
  const result = await handleInboundEmailEvent({
    rawBody: JSON.stringify({ type: 'email.bounced', data: { email_id: 're_1' } }),
    headers: new Headers({ 'svix-id': 'msg_1', 'svix-timestamp': '1', 'svix-signature': 'v1,nope' }),
    record,
  });
  expect(result.status).toBe(401);
  expect(record).not.toHaveBeenCalled();
});

test('a signed SES bounce notification records the message id', async () => {
  record.mockClear();
  const message: Record<string, string> = {
    Type: 'Notification',
    MessageId: 'sns-1',
    TopicArn: 'arn:aws:sns:us-east-1:1:bounces',
    Message: JSON.stringify({
      notificationType: 'Bounce',
      mail: { messageId: 'ses-bounce-1' },
    }),
    Timestamp: '2026-11-26T15:00:00.000Z',
    SignatureVersion: '1',
    SigningCertURL: 'https://sns.us-east-1.amazonaws.com/cert.pem',
  };
  message.Signature = signSns(message);
  const result = await handleInboundEmailEvent({
    rawBody: JSON.stringify(message),
    headers: new Headers(),
    record,
    fetchImpl: (async () => new Response(certPem)) as typeof fetch,
  });
  expect(result.status).toBe(200);
  expect(record).toHaveBeenCalledWith({
    providerMessageId: 'ses-bounce-1',
    reason: 'bounced',
  });
});
