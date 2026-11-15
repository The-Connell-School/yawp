import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  TEACHER_LOUNGE_MIGRATION_SEED,
  ensureTeacherLoungeEnabledForPreview,
} from './seed-teacher-lounge-feature-flag';

const NAME = 'feature_flag.teacher-lounge';
const ON = '{"mode":"everyone","orgIds":[]}';
const PREVIEW_DESCRIPTION = 'Started on for everyone in this PR preview';

type Row = { name: string; value: string; description: string | null };

/** A one-row stand-in for the Setting table. */
function fakePrisma(initial: Row | null) {
  let row = initial;
  const matches = (where: Partial<Row>) =>
    row !== null &&
    Object.entries(where).every(([key, value]) => row![key as keyof Row] === value);
  return {
    row: () => row,
    prisma: {
      setting: {
        updateMany: async ({ where, data }: { where: Partial<Row>; data: Partial<Row> }) => {
          if (!matches(where)) return { count: 0 };
          row = { ...row!, ...data };
          return { count: 1 };
        },
        upsert: async ({ create }: { create: Row & { valueType: string }; update: object }) => {
          if (row === null) {
            row = { name: create.name, value: create.value, description: create.description };
          }
          return {};
        },
      },
    } as any,
  };
}

describe('ensureTeacherLoungeEnabledForPreview', () => {
  test('a PR preview turns the migration’s seeded "off" into on for everyone', async () => {
    const { prisma, row } = fakePrisma({ name: NAME, ...TEACHER_LOUNGE_MIGRATION_SEED });
    expect(await ensureTeacherLoungeEnabledForPreview(prisma, 'yawp_pr_484')).toEqual({
      enabled: true,
    });
    expect(row()).toEqual({ name: NAME, value: ON, description: PREVIEW_DESCRIPTION });
  });

  test('a preview database with no row yet gets one, on for everyone', async () => {
    const { prisma, row } = fakePrisma(null);
    expect(await ensureTeacherLoungeEnabledForPreview(prisma, 'yawp_pr_484')).toEqual({
      enabled: true,
    });
    expect(row()).toEqual({ name: NAME, value: ON, description: PREVIEW_DESCRIPTION });
  });

  test('a flag someone changed in the preview is never overwritten', async () => {
    const changedByOperator: Row = {
      name: NAME,
      value: '{"mode":"off","orgIds":[]}',
      description: 'Last changed by someone@example.com',
    };
    const { prisma, row } = fakePrisma(changedByOperator);
    await ensureTeacherLoungeEnabledForPreview(prisma, 'yawp_pr_484');
    expect(row()).toEqual(changedByOperator);

    // Turned off again after this seed turned it on: a reseed leaves it off.
    const turnedOffLater: Row = { ...changedByOperator };
    const second = fakePrisma(turnedOffLater);
    await ensureTeacherLoungeEnabledForPreview(second.prisma, 'yawp_pr_484');
    await ensureTeacherLoungeEnabledForPreview(second.prisma, 'yawp_pr_484');
    expect(second.row()).toEqual(turnedOffLater);
  });

  test('demo, production, and local databases are left alone', async () => {
    for (const name of ['yawp_demo', 'yawp_production', 'yawp_local', '']) {
      const { prisma, row } = fakePrisma({ name: NAME, ...TEACHER_LOUNGE_MIGRATION_SEED });
      expect(await ensureTeacherLoungeEnabledForPreview(prisma, name)).toEqual({ skipped: true });
      expect(row()).toEqual({ name: NAME, ...TEACHER_LOUNGE_MIGRATION_SEED });
    }
  });
});

test('the seeded "off" it looks for is exactly what the migration inserts', () => {
  const sql = readFileSync(
    join(
      import.meta.dirname,
      '../../migrations/20261104120000_admin_config_access_lists/migration.sql'
    ),
    'utf8'
  );
  expect(sql).toContain(`'${NAME}'`);
  expect(sql).toContain(`'${TEACHER_LOUNGE_MIGRATION_SEED.value}'`);
  expect(sql).toContain(
    `'${TEACHER_LOUNGE_MIGRATION_SEED.description.replace(/'/g, "''")}'`
  );
});

test('the preview seed calls it', async () => {
  const source = await Bun.file(new URL('../seed-preview-seats.ts', import.meta.url)).text();
  expect(source).toContain('ensureTeacherLoungeEnabledForPreview(prisma, databaseName)');
});
