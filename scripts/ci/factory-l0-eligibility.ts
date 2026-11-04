// Factory L0 CI fast-path eligibility (see .github/FACTORY-L0.md).
// Workflow path filters mirror FACTORY_L0_SCOPE_VIOLATION_GLOBS in this file.

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

export type FactoryL0BlockedReason = 'prisma_migrations' | 'scope_violation';

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
