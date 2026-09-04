import { createSign, createVerify } from 'node:crypto';
import { publicKeyFromJwk } from './keys.mjs';

export function encodeJson(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

export function decodeJson(value) {
  return JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
}

export function decodeJwt(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) {
    throw new Error('JWT must have three parts');
  }
  return {
    header: decodeJson(parts[0]),
    payload: decodeJson(parts[1]),
    signature: parts[2],
    signingInput: `${parts[0]}.${parts[1]}`,
  };
}

export function signJwt(payload, privateKeyPem, { kid, typ = 'JWT' } = {}) {
  const header = { alg: 'RS256', typ, ...(kid ? { kid } : {}) };
  const signingInput = `${encodeJson(header)}.${encodeJson(payload)}`;
  const signer = createSign('RSA-SHA256');
  signer.update(signingInput);
  signer.end();
  const signature = signer.sign(privateKeyPem);
  return `${signingInput}.${signature.toString('base64url')}`;
}

function keyMaterial(jwkOrPem) {
  if (!jwkOrPem) {
    throw new Error('Missing verification key');
  }
  if (typeof jwkOrPem === 'string') return jwkOrPem;
  return publicKeyFromJwk(jwkOrPem);
}

export function verifyJwt(token, jwkOrPem, { now = Date.now(), ignoreExpiry = false } = {}) {
  const decoded = decodeJwt(token);
  const verifier = createVerify('RSA-SHA256');
  verifier.update(decoded.signingInput);
  verifier.end();
  const ok = verifier.verify(
    keyMaterial(jwkOrPem),
    Buffer.from(decoded.signature, 'base64url')
  );
  if (!ok) {
    throw new Error('JWT signature is invalid');
  }
  if (!ignoreExpiry && typeof decoded.payload.exp === 'number') {
    if (decoded.payload.exp <= Math.floor(now / 1000)) {
      throw new Error('JWT exp is in the past');
    }
  }
  return decoded;
}
