import { createHmac, timingSafeEqual } from 'node:crypto';
import type { ArtifactBinding, PromotionScope, VerifiedApproval } from './types';
import { parseArtifactBinding } from './artifact';

/** Wire format: base64url(jsonPayload).base64url(hmac-sha256). */
export type ApprovalIssuer = {
  /** Returns null when issuer is not configured — consumers must fail closed. */
  signingSecret: () => string | null;
  /** Expected issuer label embedded in payload. */
  issuerId: string;
};

export type ApprovalVerifyResult =
  | { ok: true; approval: VerifiedApproval }
  | { ok: false; reason: 'unconfigured' | 'malformed' | 'bad_signature' | 'expired' };

type ApprovalPayload = {
  iss: string;
  sub: string;
  scope: PromotionScope;
  commitSha: string;
  imageDigest?: string;
  exp: number;
  jti: string;
};

function b64urlEncode(data: string | Buffer): string {
  return Buffer.from(data)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function b64urlDecode(data: string): Buffer | 'malformed' {
  try {
    const padded = data.replace(/-/g, '+').replace(/_/g, '/');
    const padLen = (4 - (padded.length % 4)) % 4;
    return Buffer.from(padded + '='.repeat(padLen), 'base64');
  } catch {
    return 'malformed';
  }
}

export function signApproval(
  issuer: ApprovalIssuer,
  input: {
    subject: string;
    scope: PromotionScope;
    artifact: ArtifactBinding;
    expiresAtMs: number;
    jti: string;
  }
): string | null {
  const secret = issuer.signingSecret();
  if (!secret) return null;
  const payload: ApprovalPayload = {
    iss: issuer.issuerId,
    sub: input.subject,
    scope: input.scope,
    commitSha: input.artifact.commitSha,
    imageDigest: input.artifact.imageDigest,
    exp: input.expiresAtMs,
    jti: input.jti,
  };
  const payloadPart = b64urlEncode(JSON.stringify(payload));
  const sig = createHmac('sha256', secret).update(payloadPart).digest();
  return `${payloadPart}.${b64urlEncode(sig)}`;
}

export function verifyApprovalToken(
  issuer: ApprovalIssuer,
  token: string,
  nowMs: number
): ApprovalVerifyResult {
  const secret = issuer.signingSecret();
  if (!secret) return { ok: false, reason: 'unconfigured' };

  const dot = token.lastIndexOf('.');
  if (dot <= 0) return { ok: false, reason: 'malformed' };
  const payloadPart = token.slice(0, dot);
  const sigPart = token.slice(dot + 1);

  const sigBuf = b64urlDecode(sigPart);
  if (sigBuf === 'malformed') return { ok: false, reason: 'malformed' };
  const expected = createHmac('sha256', secret).update(payloadPart).digest();
  if (sigBuf.length !== expected.length || !timingSafeEqual(sigBuf, expected)) {
    return { ok: false, reason: 'bad_signature' };
  }

  const jsonBuf = b64urlDecode(payloadPart);
  if (jsonBuf === 'malformed') return { ok: false, reason: 'malformed' };

  let parsed: ApprovalPayload;
  try {
    parsed = JSON.parse(jsonBuf.toString('utf8')) as ApprovalPayload;
  } catch {
    return { ok: false, reason: 'malformed' };
  }

  if (parsed.iss !== issuer.issuerId) return { ok: false, reason: 'malformed' };
  if (typeof parsed.sub !== 'string' || !parsed.sub) {
    return { ok: false, reason: 'malformed' };
  }
  if (typeof parsed.exp !== 'number' || parsed.exp <= nowMs) {
    return { ok: false, reason: 'expired' };
  }
  if (typeof parsed.jti !== 'string' || !parsed.jti) {
    return { ok: false, reason: 'malformed' };
  }

  const artifact = parseArtifactBinding({
    commitSha: parsed.commitSha,
    imageDigest: parsed.imageDigest,
  });
  if (artifact === 'malformed') return { ok: false, reason: 'malformed' };

  return {
    ok: true,
    approval: {
      subject: parsed.sub,
      scope: parsed.scope,
      artifact,
      expiresAtMs: parsed.exp,
      jti: parsed.jti,
    },
  };
}

/**
 * Workers may pass arbitrary approval_ref strings; they are not evidence until
 * verified through this issuer boundary (HMAC today; GitHub environment
 * attestation / OIDC in proposed production wiring).
 */
export function approvalRefIsUntrustedWorkerHint(_approvalRef: string): true {
  return true;
}
