import { createHmac, timingSafeEqual } from 'node:crypto';
import type { ArtifactBinding, PromotionScope, VerifiedApproval } from './types';
import { parseArtifactBinding } from './artifact';
import {
  artifactMeetsOperationRequirements,
  normalizeRepository,
  type GrantBinding,
} from './grant-binding';
import { PROMOTION_SCOPES } from './types';

/**
 * HMAC test fixture issuer — simulates signature shape only.
 * NOT human approval: no GitHub Environment, no OIDC, no audit trail to a person.
 * Production must replace with broker-fed attestation (see ARCHITECTURE.md).
 */
export type ApprovalIssuer = {
  signingSecret: () => string | null;
  issuerId: string;
};

export type ApprovalVerifyResult =
  | { ok: true; approval: VerifiedApproval }
  | {
      ok: false;
      reason:
        | 'unconfigured'
        | 'malformed'
        | 'bad_signature'
        | 'expired'
        | 'scope_mismatch'
        | 'binding_mismatch'
        | 'generation_mismatch'
        | 'digest_required';
    };

type ApprovalPayload = {
  iss: string;
  sub: string;
  scope: PromotionScope;
  env: GrantBinding['environment'];
  repo: string;
  gen: number;
  commitSha: string;
  imageDigest?: string;
  exp: number;
  jti: string;
};

export type ApprovalVerifyConstraints = {
  brokerBinding: GrantBinding;
  /** When set, approval.gen must equal this (fail closed on drift). */
  expectedGeneration?: number;
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
    binding: GrantBinding;
    artifact: ArtifactBinding;
    generation: number;
    expiresAtMs: number;
    jti: string;
  }
): string | null {
  const secret = issuer.signingSecret();
  if (!secret) return null;
  const payload: ApprovalPayload = {
    iss: issuer.issuerId,
    sub: input.subject,
    scope: input.binding.operation,
    env: input.binding.environment,
    repo: input.binding.repository,
    gen: input.generation,
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
  nowMs: number,
  constraints?: ApprovalVerifyConstraints
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
  if (!(PROMOTION_SCOPES as readonly string[]).includes(parsed.scope)) {
    return { ok: false, reason: 'scope_mismatch' };
  }
  if (typeof parsed.exp !== 'number' || parsed.exp <= nowMs) {
    return { ok: false, reason: 'expired' };
  }
  if (typeof parsed.jti !== 'string' || !parsed.jti) {
    return { ok: false, reason: 'malformed' };
  }
  if (typeof parsed.gen !== 'number' || parsed.gen < 0) {
    return { ok: false, reason: 'malformed' };
  }

  const repo = normalizeRepository(parsed.repo);
  if (repo === 'malformed') return { ok: false, reason: 'malformed' };

  const binding: GrantBinding = {
    environment: parsed.env,
    repository: repo,
    operation: parsed.scope,
  };

  if (constraints) {
    if (
      binding.environment !== constraints.brokerBinding.environment ||
      binding.repository !== constraints.brokerBinding.repository ||
      binding.operation !== constraints.brokerBinding.operation
    ) {
      return { ok: false, reason: 'binding_mismatch' };
    }
    if (
      constraints.expectedGeneration !== undefined &&
      parsed.gen !== constraints.expectedGeneration
    ) {
      return { ok: false, reason: 'generation_mismatch' };
    }
  }

  const artifact = parseArtifactBinding({
    commitSha: parsed.commitSha,
    imageDigest: parsed.imageDigest,
  });
  if (artifact === 'malformed') return { ok: false, reason: 'malformed' };
  if (!artifactMeetsOperationRequirements(parsed.scope, artifact)) {
    return { ok: false, reason: 'digest_required' };
  }

  return {
    ok: true,
    approval: {
      subject: parsed.sub,
      scope: parsed.scope,
      binding,
      artifact,
      generation: parsed.gen,
      expiresAtMs: parsed.exp,
      jti: parsed.jti,
    },
  };
}

export function approvalRefIsUntrustedWorkerHint(_approvalRef: string): true {
  return true;
}

export const HMAC_FIXTURE_ISSUER_DISCLAIMER =
  'Test HMAC issuer is a cryptographic fixture only; it does not record human consent or GitHub Environment approval.';
