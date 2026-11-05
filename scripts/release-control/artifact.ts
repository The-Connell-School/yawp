import type { ArtifactBinding } from './types';

const SHA_RE = /^[0-9a-f]{40}$/;
const DIGEST_RE = /^sha256:[0-9a-f]{64}$/;

export function normalizeCommitSha(sha: string): string | 'malformed' {
  const normalized = sha.trim().toLowerCase();
  return SHA_RE.test(normalized) ? normalized : 'malformed';
}

export function normalizeImageDigest(digest: string | undefined): string | undefined | 'malformed' {
  if (digest === undefined) return undefined;
  const normalized = digest.trim().toLowerCase();
  return DIGEST_RE.test(normalized) ? normalized : 'malformed';
}

export function artifactsMatch(
  expected: ArtifactBinding,
  actual: ArtifactBinding
): boolean {
  if (expected.commitSha !== actual.commitSha) return false;
  if (expected.imageDigest === undefined && actual.imageDigest === undefined) {
    return true;
  }
  if (expected.imageDigest === undefined || actual.imageDigest === undefined) {
    return false;
  }
  return expected.imageDigest === actual.imageDigest;
}

export function parseArtifactBinding(input: {
  commitSha: string;
  imageDigest?: string;
}): ArtifactBinding | 'malformed' {
  const commitSha = normalizeCommitSha(input.commitSha);
  if (commitSha === 'malformed') return 'malformed';
  const imageDigest = normalizeImageDigest(input.imageDigest);
  if (imageDigest === 'malformed') return 'malformed';
  return { commitSha, imageDigest };
}
