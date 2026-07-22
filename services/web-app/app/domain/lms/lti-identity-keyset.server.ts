import { createHmac } from 'node:crypto';

const KEY_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,39}$/i;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;

export type LtiIdentityHmacKey = {
  id: string;
  encodedSecret: string;
};

export function parseLtiIdentityHmacKeyset(source: string | undefined) {
  const entries = (source ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (!entries.length) {
    throw new Error(
      'LTI_IDENTITY_HMAC_KEYS must contain an active versioned key.'
    );
  }
  const ids = new Set<string>();
  return entries.map((entry): LtiIdentityHmacKey => {
    const separator = entry.indexOf('=');
    const id = entry.slice(0, separator);
    const encodedSecret = entry.slice(separator + 1);
    if (
      separator <= 0 ||
      !KEY_ID_PATTERN.test(id) ||
      !BASE64URL_PATTERN.test(encodedSecret) ||
      ids.has(id)
    ) {
      throw new Error('LTI identity HMAC keyset entry is invalid.');
    }
    const decoded = Buffer.from(encodedSecret, 'base64url');
    if (
      decoded.byteLength < 32 ||
      decoded.toString('base64url') !== encodedSecret
    ) {
      throw new Error(
        'Each LTI identity HMAC key must contain at least 32 random bytes.'
      );
    }
    ids.add(id);
    return { id, encodedSecret };
  });
}

export function getLtiIdentityHmacKeyset() {
  return parseLtiIdentityHmacKeyset(process.env.LTI_IDENTITY_HMAC_KEYS);
}

export function deriveLtiIdentityHash(input: {
  key: LtiIdentityHmacKey;
  registrationId: string;
  subject: string;
}) {
  return createHmac('sha256', Buffer.from(input.key.encodedSecret, 'base64url'))
    .update('yawp:lti:identity', 'utf8')
    .update('\0', 'utf8')
    .update(input.registrationId, 'utf8')
    .update('\0', 'utf8')
    .update(input.subject, 'utf8')
    .digest('hex');
}

export function deriveLtiIdentityHashCandidates(input: {
  registrationId: string;
  subject: string;
}) {
  return getLtiIdentityHmacKeyset().map((key) => ({
    keyId: key.id,
    subjectHash: deriveLtiIdentityHash({ ...input, key }),
  }));
}

export function hashLtiOperationalValue(input: {
  label: string;
  registrationId: string;
  value: string;
}) {
  const [active] = getLtiIdentityHmacKeyset();
  return createHmac('sha256', Buffer.from(active.encodedSecret, 'base64url'))
    .update(`yawp:lti:${input.label}`, 'utf8')
    .update('\0', 'utf8')
    .update(input.registrationId, 'utf8')
    .update('\0', 'utf8')
    .update(input.value, 'utf8')
    .digest('hex');
}
