import { describe, expect, test } from 'bun:test';
import { createHmac } from 'node:crypto';
import {
  COLLAB_TOKEN_TTL_SECONDS,
  signCollabToken,
} from './collab-token.server';

const SECRET = 'test-collab-secret';
const NOW = 1_770_000_000; // fixed clock: tokens carry timestamps

const decodeSegment = (segment: string) =>
  JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'));

const parse = (token: string) => {
  const [header, payload, signature] = token.split('.');
  return {
    header: decodeSegment(header),
    payload: decodeSegment(payload),
    signature,
    signingInput: `${header}.${payload}`,
  };
};

describe('signCollabToken', () => {
  test('produces a three-segment HS256 JWT', () => {
    const token = signCollabToken({
      documentId: 'doc-1',
      membershipId: 'member-1',
      readOnly: false,
      secret: SECRET,
      nowSeconds: NOW,
    });

    expect(token.split('.')).toHaveLength(3);
    expect(parse(token).header).toEqual({ alg: 'HS256', typ: 'JWT' });
  });

  test('scopes the token to exactly one document name', () => {
    // The whole point of a per-document token: a student holding one for their
    // own group's draft must not be able to join any other room with it.
    const { payload } = parse(
      signCollabToken({
        documentId: 'doc-1',
        membershipId: 'member-1',
        readOnly: false,
        secret: SECRET,
        nowSeconds: NOW,
      })
    );

    expect(payload.allowedDocumentNames).toEqual(['doc-1']);
  });

  test('carries the membership so the provider can label presence', () => {
    const { payload } = parse(
      signCollabToken({
        documentId: 'doc-1',
        membershipId: 'member-1',
        readOnly: false,
        secret: SECRET,
        nowSeconds: NOW,
      })
    );

    expect(payload.sub).toBe('member-1');
  });

  test('marks read-only access for a teacher', () => {
    const { payload } = parse(
      signCollabToken({
        documentId: 'doc-1',
        membershipId: 'teacher-1',
        readOnly: true,
        secret: SECRET,
        nowSeconds: NOW,
      })
    );

    expect(payload.readOnly).toBe(true);
  });

  test('expires, and does not mint a long-lived credential', () => {
    const { payload } = parse(
      signCollabToken({
        documentId: 'doc-1',
        membershipId: 'member-1',
        readOnly: false,
        secret: SECRET,
        nowSeconds: NOW,
      })
    );

    expect(payload.iat).toBe(NOW);
    expect(payload.exp).toBe(NOW + COLLAB_TOKEN_TTL_SECONDS);
    // An hour is plenty for a class period's reconnects and short enough that a
    // leaked token is not a standing grant.
    expect(COLLAB_TOKEN_TTL_SECONDS).toBeLessThanOrEqual(60 * 60);
  });

  test('signature verifies against the secret', () => {
    const token = signCollabToken({
      documentId: 'doc-1',
      membershipId: 'member-1',
      readOnly: false,
      secret: SECRET,
      nowSeconds: NOW,
    });
    const { signingInput, signature } = parse(token);

    const expected = createHmac('sha256', SECRET)
      .update(signingInput)
      .digest('base64url');

    expect(signature).toBe(expected);
  });

  test('a different secret produces a different signature', () => {
    const args = {
      documentId: 'doc-1',
      membershipId: 'member-1',
      readOnly: false,
      nowSeconds: NOW,
    };

    expect(signCollabToken({ ...args, secret: SECRET })).not.toBe(
      signCollabToken({ ...args, secret: 'other-secret' })
    );
  });

  test('tampering with the payload invalidates the signature', () => {
    const token = signCollabToken({
      documentId: 'doc-1',
      membershipId: 'member-1',
      readOnly: true,
      secret: SECRET,
      nowSeconds: NOW,
    });
    const [header, payload, signature] = token.split('.');

    // Flip readOnly to false, as an attacker wanting write access would.
    const forged = Buffer.from(
      JSON.stringify({ ...decodeSegment(payload), readOnly: false })
    ).toString('base64url');

    const expected = createHmac('sha256', SECRET)
      .update(`${header}.${forged}`)
      .digest('base64url');

    expect(signature).not.toBe(expected);
  });

  test('refuses to sign without a secret', () => {
    // Fail loudly rather than mint an unsigned or predictably-signed token.
    expect(() =>
      signCollabToken({
        documentId: 'doc-1',
        membershipId: 'member-1',
        readOnly: false,
        secret: '',
        nowSeconds: NOW,
      })
    ).toThrow(/secret/i);
  });

  test('refuses to sign a token with no document scope', () => {
    expect(() =>
      signCollabToken({
        documentId: '',
        membershipId: 'member-1',
        readOnly: false,
        secret: SECRET,
        nowSeconds: NOW,
      })
    ).toThrow(/document/i);
  });
});
