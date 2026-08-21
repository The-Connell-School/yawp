import { createHash, randomUUID } from 'node:crypto';
import { exportJWK, generateKeyPair, type JWK, SignJWT } from 'jose';

type ToolKeyPair = {
  kid: string;
  privateKey: CryptoKey;
  publicKey: CryptoKey;
  publicJwk: JWK;
};

let cachedKeysPromise: Promise<ToolKeyPair> | null = null;

async function computeKid(jwk: JWK): Promise<string> {
  const normalized = JSON.stringify(
    Object.fromEntries(
      Object.entries(jwk).filter(([k]) => !['kid', 'key_ops'].includes(k))
    )
  );
  const digest = createHash('sha256').update(normalized).digest('base64url');
  return digest.slice(0, 16);
}

export async function getToolKeyPair(): Promise<ToolKeyPair> {
  if (!cachedKeysPromise) {
    cachedKeysPromise = (async () => {
      const { privateKey, publicKey } = await generateKeyPair('RS256', {
        modulusLength: 2048,
      });
      const publicJwk = await exportJWK(publicKey);
      publicJwk.kty = publicJwk.kty || 'RSA';
      const kid = (await computeKid(publicJwk)) || randomUUID();
      publicJwk.kid = kid;
      publicJwk.use = 'sig';
      publicJwk.alg = 'RS256';
      return { kid, privateKey, publicKey, publicJwk };
    })();
  }
  return cachedKeysPromise;
}

export async function getToolJwks() {
  const { publicJwk } = await getToolKeyPair();
  return { keys: [publicJwk] };
}

export async function signToolJwt(
  payload: Record<string, unknown>,
  header: Record<string, unknown> = {}
): Promise<string> {
  const { privateKey, kid } = await getToolKeyPair();
  const signer = new SignJWT(payload)
    .setProtectedHeader({ alg: 'RS256', kid, ...header });
  // Caller should set iss/aud/iat/exp as needed.
  return await signer.sign(privateKey);
}

