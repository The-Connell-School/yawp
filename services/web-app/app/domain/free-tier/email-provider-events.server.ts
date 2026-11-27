import { createHmac, createVerify, timingSafeEqual, X509Certificate } from 'node:crypto';
import { recordUndeliverableByProviderMessage } from './admin-approval-undeliverable.server';

const FIVE_MINUTES_MS = 5 * 60 * 1000;

export function isSnsAmazonUrl(value: string) {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      /^sns\.[a-z0-9-]+\.amazonaws\.com(\.cn)?$/.test(url.hostname)
    );
  } catch {
    return false;
  }
}

export function verifyResendWebhookSignature(args: {
  rawBody: string;
  headers: Headers;
  secret: string;
  now?: number;
}) {
  const id = args.headers.get('svix-id');
  const timestamp = args.headers.get('svix-timestamp');
  const signature = args.headers.get('svix-signature');
  if (!id || !timestamp || !signature || !args.secret) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  const now = args.now ?? Date.now();
  if (Math.abs(now - ts * 1000) > FIVE_MINUTES_MS) return false;
  const secret = args.secret.startsWith('whsec_')
    ? args.secret.slice('whsec_'.length)
    : args.secret;
  let key: Buffer;
  try {
    key = Buffer.from(secret, 'base64');
  } catch {
    return false;
  }
  if (!key.length) return false;
  const expected = createHmac('sha256', key)
    .update(`${id}.${timestamp}.${args.rawBody}`)
    .digest('base64');
  const expectedBuf = Buffer.from(expected);
  return signature.split(' ').some((part) => {
    const sig = part.startsWith('v1,') ? part.slice(3) : part;
    const actual = Buffer.from(sig);
    return actual.length === expectedBuf.length && timingSafeEqual(actual, expectedBuf);
  });
}

export function snsStringToSign(message: Record<string, string>) {
  const type = message.Type;
  const keys =
    type === 'Notification'
      ? [
          'Message',
          'MessageId',
          ...(message.Subject ? ['Subject'] : []),
          'Timestamp',
          'TopicArn',
          'Type',
        ]
      : type === 'SubscriptionConfirmation' || type === 'UnsubscribeConfirmation'
        ? ['Message', 'MessageId', 'SubscribeURL', 'Timestamp', 'Token', 'TopicArn', 'Type']
        : null;
  if (!keys || keys.some((key) => message[key] == null)) return null;
  return keys.map((key) => `${key}\n${message[key]}\n`).join('');
}

export function verifySnsMessageSignature(args: {
  message: Record<string, string>;
  certificatePem: string;
}) {
  const signed = snsStringToSign(args.message);
  const signature = args.message.Signature;
  if (!signed || !signature) return false;
  if (!isSnsAmazonUrl(args.message.SigningCertURL ?? '') || !args.message.SigningCertURL?.endsWith('.pem')) {
    return false;
  }
  try {
    const cert = new X509Certificate(args.certificatePem);
    const algorithm =
      args.message.SignatureVersion === '2' ? 'RSA-SHA256' : 'RSA-SHA1';
    const verifier = createVerify(algorithm);
    verifier.update(signed, 'utf8');
    return verifier.verify(cert.publicKey, signature, 'base64');
  } catch {
    return false;
  }
}

function reasonFromResendType(type: unknown): 'bounced' | 'failed' | null {
  if (type === 'email.bounced' || type === 'email.complained') return 'bounced';
  if (type === 'email.failed') return 'failed';
  return null;
}

function reasonFromSesNotification(message: string): {
  reason: 'bounced' | 'failed';
  providerMessageId: string;
} | null {
  let parsed: {
    notificationType?: string;
    eventType?: string;
    mail?: { messageId?: string };
  };
  try {
    parsed = JSON.parse(message) as typeof parsed;
  } catch {
    return null;
  }
  const type = parsed.notificationType ?? parsed.eventType;
  const providerMessageId = parsed.mail?.messageId;
  if (!providerMessageId) return null;
  if (type === 'Bounce' || type === 'Complaint') {
    return { reason: 'bounced', providerMessageId };
  }
  if (type === 'Reject') return { reason: 'failed', providerMessageId };
  return null;
}

export async function handleInboundEmailEvent(args: {
  rawBody: string;
  headers: Headers;
  now?: number;
  fetchImpl?: typeof fetch;
  record?: typeof recordUndeliverableByProviderMessage;
}): Promise<{ status: number; body: Record<string, unknown> }> {
  const record = args.record ?? recordUndeliverableByProviderMessage;
  const svix = args.headers.get('svix-id');
  if (svix) {
    const secret = process.env.RESEND_WEBHOOK_SECRET ?? '';
    if (
      !verifyResendWebhookSignature({
        rawBody: args.rawBody,
        headers: args.headers,
        secret,
        now: args.now,
      })
    ) {
      return { status: 401, body: { error: 'invalid_signature' } };
    }
    let event: { type?: string; data?: { email_id?: string } };
    try {
      event = JSON.parse(args.rawBody) as typeof event;
    } catch {
      return { status: 400, body: { error: 'invalid_json' } };
    }
    const reason = reasonFromResendType(event.type);
    const providerMessageId = event.data?.email_id;
    if (!reason || !providerMessageId) {
      return { status: 200, body: { ignored: true } };
    }
    const result = await record({
      providerMessageId,
      reason,
    });
    if (!result.teacherNotified && !result.skipped) {
      return { status: 500, body: { error: 'teacher_notice_failed' } };
    }
    return { status: 200, body: { received: true, skipped: result.skipped ?? null } };
  }

  let message: Record<string, string>;
  try {
    message = JSON.parse(args.rawBody) as Record<string, string>;
  } catch {
    return { status: 400, body: { error: 'invalid_json' } };
  }
  if (!message.Type || !message.Signature) {
    return { status: 400, body: { error: 'unsupported_event' } };
  }
  if (!isSnsAmazonUrl(message.SigningCertURL ?? '') || !message.SigningCertURL.endsWith('.pem')) {
    return { status: 401, body: { error: 'invalid_signature' } };
  }
  const fetchImpl = args.fetchImpl ?? fetch;
  let certificatePem = '';
  try {
    const certResponse = await fetchImpl(message.SigningCertURL);
    certificatePem = await certResponse.text();
  } catch {
    return { status: 401, body: { error: 'invalid_signature' } };
  }
  if (!verifySnsMessageSignature({ message, certificatePem })) {
    return { status: 401, body: { error: 'invalid_signature' } };
  }
  if (message.Type === 'SubscriptionConfirmation') {
    if (!isSnsAmazonUrl(message.SubscribeURL ?? '')) {
      return { status: 400, body: { error: 'invalid_subscribe_url' } };
    }
    try {
      await fetchImpl(message.SubscribeURL);
    } catch {
      return { status: 502, body: { error: 'subscribe_failed' } };
    }
    return { status: 200, body: { subscribed: true } };
  }
  if (message.Type !== 'Notification') {
    return { status: 200, body: { ignored: true } };
  }
  const ses = reasonFromSesNotification(message.Message ?? '');
  if (!ses) return { status: 200, body: { ignored: true } };
  const result = await record(ses);
  if (!result.teacherNotified && !result.skipped) {
    return { status: 500, body: { error: 'teacher_notice_failed' } };
  }
  return { status: 200, body: { received: true, skipped: result.skipped ?? null } };
}
