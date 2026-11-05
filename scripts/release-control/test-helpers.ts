import type { ApprovalIssuer } from './approval-verifier';
import { signApproval } from './approval-verifier';
import type { ArtifactBinding, PromotionScope } from './types';
import type { GrantBinding } from './grant-binding';
import { MemoryPromotionCasStore } from './memory-cas-store';
import { ReconciliationBroker } from './reconciliation-broker';

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

export function seedAllScopes(store: MemoryPromotionCasStore, nowMs = 0) {
  for (const scope of ['main_merge', 'prod_deploy', 'prod_flags'] as const) {
    store.seedScope(scope, { scope, generation: 0, hold: null, updatedAtMs: nowMs });
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

export function liveBroker(nowMs = 0) {
  const store = new MemoryPromotionCasStore();
  seedAllScopes(store, nowMs);
  const broker = new ReconciliationBroker({
    store,
    approvalIssuer: TEST_ISSUER,
    brokerBinding: TEST_BROKER_BINDING,
    enforcementMode: 'live',
  });
  return { store, broker, nowMs };
}

export async function issueTestGrant(
  broker: ReconciliationBroker,
  input: {
    grantId: string;
    artifact: ArtifactBinding;
    nowMs: number;
    generation?: number;
  }
) {
  const token = signTestApproval({
    subject: 'human:release',
    binding: TEST_BROKER_BINDING,
    artifact: input.artifact,
    generation: input.generation ?? 0,
    nowMs: input.nowMs,
  });
  await broker.promotion.issueGrantFromSignedApproval({
    grantId: input.grantId,
    signedApprovalToken: token,
    nowMs: input.nowMs,
    grantTtlMs: 120_000,
  });
}
