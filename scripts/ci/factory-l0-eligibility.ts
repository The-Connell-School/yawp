// Factory L0 CI fast-path eligibility (see .github/FACTORY-L0.md).
// Workflow path filters mirror FACTORY_L0_SCOPE_VIOLATION_GLOBS in this file.

/** Top-level agent Ship Review artifacts only (not other state/ files). */
export const FACTORY_L0_SHIP_REVIEW_MD_RE =
  /^state\/SHIP_REVIEW_[^/]+\.md$/;

export const FACTORY_L0_SCOPE_VIOLATION_GLOBS = [
  'packages/**',
  'scripts/**',
  '.github/**',
  'bin/**',
  'infra/**',
  'design/**',
  'qa/**',
  'granola/**',
  'state/**',
  'Dockerfile*',
  'bun.lock',
  'bun.lockb',
  'package.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'package-lock.json',
  'tsconfig*',
  'bunfig.toml',
  'playwright.config.*',
] as const;

/** Paths-filter negation paired with state/** in ci.yml (keep in sync). */
export const FACTORY_L0_STATE_SHIP_REVIEW_ALLOW_GLOB =
  '!state/SHIP_REVIEW_*.md' as const;

export type FactoryL0BlockedReason = 'prisma_migrations' | 'scope_violation';

export function isFactoryL0ShipReviewArtifactPath(filePath: string): boolean {
  return FACTORY_L0_SHIP_REVIEW_MD_RE.test(filePath);
}

function matchesFactoryL0ScopeViolationGlob(
  filePath: string,
  glob: (typeof FACTORY_L0_SCOPE_VIOLATION_GLOBS)[number]
): boolean {
  if (glob === 'state/**') {
    return (
      filePath.startsWith('state/') &&
      !isFactoryL0ShipReviewArtifactPath(filePath)
    );
  }
  if (glob.endsWith('/**')) {
    const prefix = glob.slice(0, -3);
    return filePath === prefix || filePath.startsWith(`${prefix}/`);
  }
  if (glob.endsWith('*')) {
    return filePath.startsWith(glob.slice(0, -1));
  }
  return filePath === glob;
}

export function isFactoryL0ScopeViolationPath(filePath: string): boolean {
  return FACTORY_L0_SCOPE_VIOLATION_GLOBS.some((glob) =>
    matchesFactoryL0ScopeViolationGlob(filePath, glob)
  );
}

export function changedFilesTouchPrismaMigrations(changedFiles: string[]): boolean {
  return changedFiles.some(
    (filePath) =>
      filePath.startsWith('packages/prisma/migrations/') ||
      filePath === 'packages/prisma/migrations'
  );
}

export function changedFilesHaveFactoryL0ScopeViolation(
  changedFiles: string[]
): boolean {
  return changedFiles.some(isFactoryL0ScopeViolationPath);
}

export function evaluateFactoryL0Eligibility(input: {
  hasFactoryL0Label: boolean;
  scopeViolation: boolean;
  prismaMigrations: boolean;
}): { active: boolean; blockedReason: FactoryL0BlockedReason | null } {
  if (!input.hasFactoryL0Label) {
    return { active: false, blockedReason: null };
  }
  if (input.prismaMigrations) {
    return { active: false, blockedReason: 'prisma_migrations' };
  }
  if (input.scopeViolation) {
    return { active: false, blockedReason: 'scope_violation' };
  }
  return { active: true, blockedReason: null };
}

export function evaluateFactoryL0EligibilityFromChangedFiles(input: {
  hasFactoryL0Label: boolean;
  changedFiles: string[];
}): { active: boolean; blockedReason: FactoryL0BlockedReason | null } {
  return evaluateFactoryL0Eligibility({
    hasFactoryL0Label: input.hasFactoryL0Label,
    scopeViolation: changedFilesHaveFactoryL0ScopeViolation(input.changedFiles),
    prismaMigrations: changedFilesTouchPrismaMigrations(input.changedFiles),
  });
}
