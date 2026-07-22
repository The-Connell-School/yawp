export class LtiRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LtiRequestError';
  }
}

const EMBEDDED_DESTINATIONS = new Set(['iframe', 'embed', 'object']);

/**
 * The pilot deliberately uses a top-level/new-window presentation. Yawp's
 * primary auth cookies remain SameSite=Lax, so silently accepting an embedded
 * launch would create an authentication loop and an inconsistent CSRF model.
 */
export function isEmbeddedLtiRequest(request: Request) {
  const destination = request.headers
    .get('sec-fetch-dest')
    ?.trim()
    .toLowerCase();
  return destination ? EMBEDDED_DESTINATIONS.has(destination) : false;
}

/**
 * Only infrastructure-owned client-address headers are trusted. A direct
 * request falls back to one bounded shared bucket rather than trusting a
 * caller-controlled X-Forwarded-For value.
 */
export function getLtiRequesterFingerprint(request: Request) {
  const candidate =
    request.headers.get('x-nf-client-connection-ip') ??
    request.headers.get('cf-connecting-ip') ??
    request.headers.get('fly-client-ip') ??
    'unattributed';
  const normalized = candidate.trim().toLowerCase();
  return normalized && normalized.length <= 128 ? normalized : 'unattributed';
}

export async function readBoundedLtiForm(
  request: Request,
  options: { maxBytes: number }
) {
  const mediaType = (request.headers.get('content-type') ?? '')
    .split(';', 1)[0]
    .trim()
    .toLowerCase();
  if (mediaType !== 'application/x-www-form-urlencoded') {
    throw new LtiRequestError('LTI request requires form encoding.');
  }
  const rawLength = request.headers.get('content-length');
  if (rawLength !== null) {
    const declaredLength = Number(rawLength);
    if (
      !Number.isInteger(declaredLength) ||
      declaredLength < 0 ||
      declaredLength > options.maxBytes
    ) {
      throw new LtiRequestError('LTI request body length is invalid.');
    }
  }
  if (!request.body) return new URLSearchParams();

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > options.maxBytes) {
      await reader.cancel();
      throw new LtiRequestError('LTI request body is too large.');
    }
    chunks.push(value);
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new URLSearchParams(new TextDecoder().decode(body));
}
