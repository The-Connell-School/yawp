import { describe, expect, mock, test } from 'bun:test';
import type { PrismaClient } from '../generated/prisma';
import {
  seedFreeTierBundleAssignmentTypes,
} from './seed-free-tier-bundle-assignment-types';
import { buildPrismaPgPoolConfig } from './local-dev/connection';

describe('seed-free-tier-bundle-assignment-types connection', () => {
  test('uses TLS when running through the production migration tunnel', () => {
    expect(
      buildPrismaPgPoolConfig(
        'postgresql://yawp:secret@localhost:3306/yawp',
        { REMOTE_MIGRATE_TUNNEL: '1' }
      )
    ).toEqual({
      connectionString: 'postgresql://yawp:secret@localhost:3306/yawp',
      ssl: { rejectUnauthorized: false },
    });
  });

  test('keeps local migration validation non-TLS', () => {
    expect(
      buildPrismaPgPoolConfig(
        'postgresql://postgres:postgres@127.0.0.1:5432/yawp_migration_ci',
        {}
      )
    ).toEqual({
      connectionString:
        'postgresql://postgres:postgres@127.0.0.1:5432/yawp_migration_ci',
      ssl: false,
    });
  });
});

describe('seedFreeTierBundleAssignmentTypes', () => {
  test('creates parent assignment types separately from module rows', async () => {
    const createdTypes = new Map<string, { id: string; kind: string }>();
    const prisma = {
      assignmentType: {
        upsert: mock(() => {
          throw new Error('nested assignmentType.upsert should not be used');
        }),
        findUnique: mock(({ where }: { where: { kind?: string } }) => {
          if (!where.kind) return null;
          return createdTypes.get(where.kind) ?? null;
        }),
        create: mock(
          ({
            data,
          }: {
            data: { kind: string; title: string; position: number };
          }) => {
            const row = { id: `${data.kind}-id`, kind: data.kind };
            createdTypes.set(data.kind, row);
            return row;
          }
        ),
        update: mock(({ where }: { where: { id: string } }) => ({
          id: where.id,
        })),
        findMany: mock(() =>
          Array.from(createdTypes.values()).map((row) => ({
            ...row,
            rubricJson: { categories: [] },
            assignmentModules: [{ id: `${row.id}-module` }],
          }))
        ),
      },
      assignmentModule: {
        count: mock(() => 0),
        create: mock(({ data }: { data: { assignmentTypeId: string } }) => ({
          id: `${data.assignmentTypeId}-module`,
        })),
      },
      assignmentTypeImage: {
        upsert: mock(() => ({ id: 'image-id' })),
        findUnique: mock(() => ({ id: 'image-id' })),
      },
      $executeRawUnsafe: mock(() => ({})),
    } as unknown as PrismaClient;

    await seedFreeTierBundleAssignmentTypes(prisma);

    expect(prisma.assignmentType.upsert).not.toHaveBeenCalled();
    expect(prisma.assignmentType.create).toHaveBeenCalledTimes(3);
    expect(prisma.assignmentModule.create).not.toHaveBeenCalled();
    expect(prisma.$executeRawUnsafe).toHaveBeenCalledTimes(7);
    expect(prisma.assignmentTypeImage.upsert).toHaveBeenCalledTimes(3);
  });
});
