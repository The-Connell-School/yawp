import { mock } from 'bun:test';

/** In-memory Setting / Organization stubs for unit tests that mock Prisma partially. */
export function featureFlagPrismaTables() {
  return {
    setting: {
      findUnique: mock(async () => null),
      findMany: mock(async () => [] as Array<{ name?: string; value: string }>),
      upsert: mock(async (args: {
        create?: { value: string };
        update?: { value: string };
      }) => ({
        name: 'feature_flag.test',
        value: args.update?.value ?? args.create?.value ?? '{"mode":"off","orgIds":[]}',
        description: null,
        updatedAt: new Date(),
      })),
    },
    organization: {
      findMany: mock(async () => [] as Array<{ id: string }>),
      findUnique: mock(async () => null),
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
