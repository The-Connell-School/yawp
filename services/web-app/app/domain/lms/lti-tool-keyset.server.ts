import {
  createPrivateKey,
  createPublicKey,
  type JsonWebKey,
} from 'node:crypto';
import { z } from 'zod';

const ToolKeysetSchema = z
  .object({
    activeKeyId: z.string().min(1).max(80),
    keys: z
      .array(
        z.object({
          keyId: z.string().min(1).max(80),
          privateKeyPem: z.string().min(1).max(32_000),
        })
      )
      .min(1)
      .max(5),
  })
  .strict();

export type LtiToolSigningKey = Readonly<{
  keyId: string;
  privateKeyPem: string;
  publicJwk: JsonWebKey & { kid: string; alg: 'RS256'; use: 'sig' };
}>;

let cachedRaw: string | null = null;
let cachedKeys: readonly LtiToolSigningKey[] | null = null;

function parseToolKeys(raw: string): readonly LtiToolSigningKey[] {
  let decoded: unknown;
  try {
    decoded = JSON.parse(raw);
  } catch (error) {
    throw new Error('LTI tool signing keyset JSON is invalid.', {
      cause: error,
    });
  }
  const value = ToolKeysetSchema.parse(decoded);
  if (new Set(value.keys.map((key) => key.keyId)).size !== value.keys.length) {
    throw new Error('LTI tool signing key ids must be unique.');
  }
  if (!value.keys.some((key) => key.keyId === value.activeKeyId)) {
    throw new Error('LTI active tool signing key was not found.');
  }
  const keys = value.keys.map((key) => {
    let privateKey;
    try {
      privateKey = createPrivateKey(key.privateKeyPem);
    } catch (error) {
      throw new Error('LTI tool signing key is not a valid private key.', {
        cause: error,
      });
    }
    if (privateKey.asymmetricKeyType !== 'rsa') {
      throw new Error('LTI tool signing keys must use RSA.');
    }
    const details = privateKey.asymmetricKeyDetails;
    if (!details?.modulusLength || details.modulusLength < 2048) {
      throw new Error('LTI tool signing keys must use at least 2048-bit RSA.');
    }
    const publicJwk = createPublicKey(privateKey).export({
      format: 'jwk',
    }) as JsonWebKey;
    return {
      keyId: key.keyId,
      privateKeyPem: key.privateKeyPem,
      publicJwk: {
        ...publicJwk,
        kid: key.keyId,
        alg: 'RS256' as const,
        use: 'sig' as const,
      },
    };
  });
  const active = keys.find((key) => key.keyId === value.activeKeyId)!;
  return [active, ...keys.filter((key) => key !== active)];
}

export function getLtiToolSigningKeys(
  raw = process.env.LTI_TOOL_SIGNING_KEYSET_JSON
) {
  if (!raw?.trim()) {
    throw new Error('LTI tool signing keyset is not configured.');
  }
  if (cachedRaw !== raw || !cachedKeys) {
    cachedRaw = raw;
    cachedKeys = parseToolKeys(raw);
  }
  return cachedKeys;
}

export function getActiveLtiToolSigningKey(
  raw = process.env.LTI_TOOL_SIGNING_KEYSET_JSON
) {
  return getLtiToolSigningKeys(raw)[0]!;
}

export function getLtiToolJwks(raw = process.env.LTI_TOOL_SIGNING_KEYSET_JSON) {
  return { keys: getLtiToolSigningKeys(raw).map((key) => key.publicJwk) };
}

export function resetLtiToolSigningKeyCacheForTests() {
  cachedRaw = null;
  cachedKeys = null;
}
