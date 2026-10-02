import { describe, expect, test } from 'bun:test';
import { seedApHistoryLibrary } from './seed-ap-history-library';

type UpsertWhere = { organizationId_assignmentTypeId: { organizationId: string; assignmentTypeId: string } };

function makeMockPrisma() {
  const organizations = [{ id: 'org-1' }, { id: 'org-2' }];
  const assignedPairs = new Set<string>();
  let nextModuleId = 1;

  return {
    // Inspectable state
    __assignedPairs: assignedPairs,
    organization: {
      findUnique: async ({ where: { id } }: { where: { id: string } }) =>
        organizations.find((o) => o.id === id) ?? null,
      findFirst: async () => organizations[0] ?? null,
      findMany: async () => organizations.slice(),
    },
    assignmentType: {
      findUnique: async () => null,
      upsert: async () => ({ id: 'ap-history-type' }),
    },
    organizationAssignmentType: {
      upsert: async ({
        where,
        create,
      }: {
        where: UpsertWhere;
        create: { organizationId: string; assignmentTypeId: string };
        update: Record<string, never>;
      }) => {
        const key = `${where.organizationId_assignmentTypeId.organizationId}:${where.organizationId_assignmentTypeId.assignmentTypeId}`;
        // Emulate upsert: create if missing, otherwise no-op
        assignedPairs.add(key); // add is idempotent
        return { organizationId: create.organizationId, assignmentTypeId: create.assignmentTypeId };
      },
    },
    assignmentModule: {
      findFirst: async () => null,
      create: async () => ({ id: `mod-${nextModuleId++}` }),
      update: async ({ where: { id } }: { where: { id: string } }) => ({ id }),
    },
    assignmentModuleInstruction: {
      findFirst: async () => null,
      create: async () => ({}),
      update: async () => ({}),
    },
    apHistoryPromptLibraryEntry: {
      upsert: async () => ({ id: 'ple-1' }),
    },
    apHistoryPromptLibrarySource: {
      upsert: async () => ({}),
      updateMany: async () => ({ count: 1 }),
    },
    assignmentTypeImage: {
      findUnique: async () => ({ id: 'existing-image' }),
      create: async () => ({}),
    },
  } as unknown as Parameters<typeof seedApHistoryLibrary>[0];
}

describe('AP History seeder all-org linking and idempotency', () => {
  test('links to every organization and remains idempotent across runs', async () => {
    const prisma = makeMockPrisma();
    await seedApHistoryLibrary(prisma as any, 'org-1');
    expect((prisma as any).__assignedPairs.size).toBe(2); // org-1 and org-2

    // Run again; still exactly 2 unique pairs
    await seedApHistoryLibrary(prisma as any, 'org-1');
    expect((prisma as any).__assignedPairs.size).toBe(2);
  });
});

