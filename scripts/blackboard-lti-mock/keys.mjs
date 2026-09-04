import {
  createHash,
  createPublicKey,
  generateKeyPairSync,
} from 'node:crypto';

export function jwkThumbprint(jwk) {
  const canonical = JSON.stringify({
    e: jwk.e,
    kty: 'RSA',
    n: jwk.n,
  });
  return createHash('sha256').update(canonical).digest('base64url');
}

export function generateRsaSigningKey() {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });
  const jwk = publicKey.export({ format: 'jwk' });
  const kid = jwkThumbprint(jwk);
  return {
    kid,
    privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }),
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }),
    publicJwk: {
      kty: 'RSA',
      use: 'sig',
      alg: 'RS256',
      kid,
      n: jwk.n,
      e: jwk.e,
    },
  };
}

export function publicKeyFromJwk(jwk) {
  return createPublicKey({ key: jwk, format: 'jwk' });
}

export function createRotatingKeySet() {
  const keys = [generateRsaSigningKey(), generateRsaSigningKey()];
  let activeIndex = 0;

  return {
    active() {
      return keys[activeIndex];
    },
    get(kid) {
      return keys.find((key) => key.kid === kid) || null;
    },
    jwks() {
      return { keys: keys.map((key) => ({ ...key.publicJwk })) };
    },
    rotate() {
      const next = generateRsaSigningKey();
      const previous = keys[activeIndex];
      keys.splice(0, keys.length, previous, next);
      activeIndex = 1;
      return next;
    },
  };
}
