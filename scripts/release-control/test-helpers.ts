import type { ApprovalIssuer } from './approval-verifier';
import { signApproval } from './approval-verifier';
import type { ArtifactBinding, PromotionScope } from './types';

export const TEST_ISSUER: ApprovalIssuer = {
  issuerId: 'yawp-promotion-issuer-test',
  signingSecret: () => 'test-signing-secret-not-for-workers',
};

export const WORKER_FORGED_SECRET = 'worker-stolen-secret';

export function seedAllScopes(store: import('./memory-store').MemoryPromotionStore, nowMs = 0) {
  const scopes = ['main_merge', 'prod_deploy', 'prod_flags'] as const;
  for (const scope of scopes) {
    store.seedScope(scope, {
      scope,
      generation: 0,
      hold: null,
      updatedAtMs: nowMs,
    });
  }
}

export function sampleArtifact(shaSuffix = 'a'.repeat(40)): ArtifactBinding {
  return {
    commitSha: shaSuffix,
    imageDigest: `sha256:${'b'.repeat(64)}`,
  };
}

export function signTestApproval(input: {
  subject: string;
  scope: PromotionScope;
  artifact: ArtifactBinding;
  nowMs: number;
  ttlMs?: number;
  jti?: string;
}): string {
  const token = signApproval(TEST_ISSUER, {
    subject: input.subject,
    scope: input.scope,
    artifact: input.artifact,
    expiresAtMs: input.nowMs + (input.ttlMs ?? 60_000),
    jti: input.jti ?? `jti-${input.nowMs}`,
  });
  if (!token) throw new Error('sign failed');
  return token;
}
