import { createHmac } from 'node:crypto';

/**
 * Document-scoped access tokens for the realtime collaboration provider.
 *
 * The provider (Tiptap Collaboration Cloud, Hocuspocus underneath) authenticates
 * a client by a JWT the application signs with a shared secret. Authorization
 * therefore stays in Yawp: this module only mints the credential, and the route
 * that calls it is responsible for having checked that the caller may open the
 * document at all.
 *
 * Signed by hand with `node:crypto` rather than pulling in a JWT library. We only
 * ever *sign* here, never verify a token from an untrusted party — and signing
 * HS256 is a base64url header, a base64url payload, and one HMAC. Nearly all of
 * JWT's sharp edges (algorithm confusion, `alg: none`, key resolution) live in
 * verification, which the provider does with the shared secret, not us. If we
 * ever need to verify provider-issued tokens, reach for a real library then
 * rather than extending this.
 */

/**
 * One hour: comfortably longer than a class period's worth of reconnects, short
 * enough that a leaked token is not a standing grant on a student's writing.
 */
export const COLLAB_TOKEN_TTL_SECONDS = 60 * 60;

export type CollabTokenClaims = {
  /** Membership the token belongs to; the provider uses it to label presence. */
  sub: string;
  /**
   * The provider restricts the client to exactly these room names. One entry,
   * always: a token minted for one group's draft must not open another's.
   */
  allowedDocumentNames: string[];
  /** Teachers join to read and comment, not to write into student prose. */
  readOnly: boolean;
  iat: number;
  exp: number;
};

const base64url = (value: object) =>
  Buffer.from(JSON.stringify(value)).toString('base64url');

/**
 * Mints a token scoped to a single document.
 *
 * `nowSeconds` is injected rather than read from the clock so the timestamps are
 * testable.
 */
export function signCollabToken({
  documentId,
  membershipId,
  readOnly,
  secret,
  nowSeconds,
}: {
  documentId: string;
  membershipId: string;
  readOnly: boolean;
  secret: string;
  nowSeconds: number;
}): string {
  // Fail loudly rather than mint a token signed with an empty secret, which the
  // provider would reject in a way that reads as a client bug.
  if (!secret) {
    throw new Error('Collaboration provider secret is not configured.');
  }
  if (!documentId) {
    throw new Error('A collaboration token requires a document to scope it to.');
  }

  const claims: CollabTokenClaims = {
    sub: membershipId,
    allowedDocumentNames: [documentId],
    readOnly,
    iat: nowSeconds,
    exp: nowSeconds + COLLAB_TOKEN_TTL_SECONDS,
  };

  const signingInput = `${base64url({ alg: 'HS256', typ: 'JWT' })}.${base64url(claims)}`;
  const signature = createHmac('sha256', secret)
    .update(signingInput)
    .digest('base64url');

  return `${signingInput}.${signature}`;
}
