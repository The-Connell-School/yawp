import { createHash, createHmac } from 'node:crypto';

export const INTERNAL_API_HEADER_KEY_ID = 'X-Yawp-Key-Id';
export const INTERNAL_API_HEADER_TIMESTAMP = 'X-Yawp-Timestamp';
export const INTERNAL_API_HEADER_NONCE = 'X-Yawp-Nonce';
export const INTERNAL_API_HEADER_ACTOR = 'X-Yawp-Actor';
export const INTERNAL_API_HEADER_SIGNATURE = 'X-Yawp-Signature';

const bodyHashHex = (body: Uint8Array | string) => {
  const bytes =
    typeof body === 'string' ? Buffer.from(body, 'utf8') : Buffer.from(body);
  return createHash('sha256').update(bytes).digest('hex');
};

/** Raw query string exactly as sent (no leading `?`, no sorting or decoding). */
export function internalApiRawQueryString(url: URL | string) {
  const search =
    typeof url === 'string' ? new URL(url).search : url.search;
  return search.startsWith('?') ? search.slice(1) : search;
}

export function buildInternalApiSignatureBaseString(input: {
  method: string;
  pathname: string;
  search: string;
  timestamp: string;
  nonce: string;
  actor: string;
  body: Uint8Array | string;
}) {
  const query = input.search.startsWith('?')
    ? input.search.slice(1)
    : input.search;
  return [
    input.method.toUpperCase(),
    input.pathname,
    query,
    input.timestamp,
    input.nonce,
    input.actor.toLowerCase(),
    bodyHashHex(input.body),
  ].join('\n');
}

export function signInternalApiRequest(input: {
  method: string;
  url: string;
  body?: Uint8Array | string;
  keyId: string;
  secret: string;
  actor: string;
  timestamp?: string;
  nonce?: string;
}) {
  const url = new URL(input.url);
  const timestamp = input.timestamp ?? String(Math.floor(Date.now() / 1000));
  const nonce = input.nonce ?? createHash('sha256').update(`${Date.now()}-${Math.random()}`).digest('base64url');
  const body = input.body ?? '';
  const base = buildInternalApiSignatureBaseString({
    method: input.method,
    pathname: url.pathname,
    search: internalApiRawQueryString(url),
    timestamp,
    nonce,
    actor: input.actor,
    body,
  });
  const signature = createHmac('sha256', input.secret).update(base).digest('base64url');
  return {
    timestamp,
    nonce,
    signature,
    headers: {
      [INTERNAL_API_HEADER_KEY_ID]: input.keyId,
      [INTERNAL_API_HEADER_TIMESTAMP]: timestamp,
      [INTERNAL_API_HEADER_NONCE]: nonce,
      [INTERNAL_API_HEADER_ACTOR]: input.actor,
      [INTERNAL_API_HEADER_SIGNATURE]: signature,
    },
  };
}
