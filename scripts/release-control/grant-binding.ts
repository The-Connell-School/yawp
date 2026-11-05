import type { ArtifactBinding, PromotionScope } from './types';
import { normalizeCommitSha, normalizeImageDigest } from './artifact';

export type PromotionEnvironment = 'production' | 'staging';

/** Narrow binding to prevent cross-repo / cross-env / cross-operation replay. */
export type GrantBinding = {
  environment: PromotionEnvironment;
  /** Normalized `owner/repo` (case-sensitive GitHub canonical form). */
  repository: string;
  operation: PromotionScope;
};

export function normalizeRepository(repository: string): string | 'malformed' {
  const trimmed = repository.trim();
  if (!/^[\w.-]+\/[\w.-]+$/.test(trimmed)) return 'malformed';
  return trimmed;
}

export function grantBindingsMatch(expected: GrantBinding, actual: GrantBinding): boolean {
  return (
    expected.environment === actual.environment &&
    expected.repository === actual.repository &&
    expected.operation === actual.operation
  );
}

export function artifactMeetsOperationRequirements(
  operation: PromotionScope,
  artifact: ArtifactBinding
): boolean {
  if (operation === 'prod_deploy') {
    return normalizeImageDigest(artifact.imageDigest) !== 'malformed' && Boolean(artifact.imageDigest);
  }
  return normalizeCommitSha(artifact.commitSha) !== 'malformed';
}
