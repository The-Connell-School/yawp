import { mock } from 'bun:test';

/** In-memory Setting / Organization stubs for unit tests that mock Prisma partially. */
export function featureFlagPrismaTables() {
  return {
    setting: {
      findUnique: mock(),
      findMany: mock(),
      upsert: mock(),
    },
    organization: {
      findMany: mock(),
      findUnique: mock(),
    },
  };
}

/** Merge feature-flag tables into a partial Prisma mock (does not replace existing tables). */
export function mergeFeatureFlagPrisma<T extends Record<string, unknown>>(prisma: T) {
  const tables = featureFlagPrismaTables();
  return {
    ...prisma,
    setting: prisma.setting ?? tables.setting,
    organization: prisma.organization ?? tables.organization,
  };
}
