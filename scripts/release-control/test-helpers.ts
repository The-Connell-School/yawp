import type { ApprovalIssuer } from './approval-verifier';
import { signApproval } from './approval-verifier';
import type { ArtifactBinding, PromotionScope } from './types';
import type { GrantBinding } from './grant-binding';

export const TEST_ISSUER: ApprovalIssuer = {
  issuerId: 'yawp-promotion-issuer-test',
  signingSecret: () => 'test-signing-secret-not-for-workers',
};

export const WORKER_FORGED_SECRET = 'worker-stolen-secret';

export const TEST_BROKER_BINDING: GrantBinding = {
  environment: 'production',
  repository: 'The-Connell-School/yawp',
  operation: 'prod_deploy',
};

export const TEST_MAIN_MERGE_BINDING: GrantBinding = {
  environment: 'production',
  repository: 'The-Connell-School/yawp',
  operation: 'main_merge',
};

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
  binding: GrantBinding;
  artifact: ArtifactBinding;
  generation?: number;
  nowMs: number;
  ttlMs?: number;
  jti?: string;
}): string {
  const token = signApproval(TEST_ISSUER, {
    subject: input.subject,
    binding: input.binding,
    artifact: input.artifact,
    generation: input.generation ?? 0,
    expiresAtMs: input.nowMs + (input.ttlMs ?? 60_000),
    jti: input.jti ?? `jti-${input.nowMs}`,
  });
  if (!token) throw new Error('sign failed');
  return token;
}

/** Legacy helper — prefer explicit binding in tests. */
export function signTestApprovalForScope(input: {
  subject: string;
  scope: PromotionScope;
  artifact: ArtifactBinding;
  generation?: number;
  nowMs: number;
  ttlMs?: number;
}): string {
  const binding: GrantBinding = {
    environment: 'production',
    repository: 'The-Connell-School/yawp',
    operation: input.scope,
  };
  return signTestApproval({ ...input, binding });
}
