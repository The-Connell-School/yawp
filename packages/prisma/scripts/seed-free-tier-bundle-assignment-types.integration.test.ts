import { expect, test } from 'bun:test';
import { createPrismaClient } from './local-dev/connection';
import { seedFreeTierBundleAssignmentTypes } from './seed-free-tier-bundle-assignment-types';

const url = process.env.BUNDLE_SEED_TEST_DATABASE_URL;
test.skipIf(!url)('missing bundle is seeded once and repeated runs preserve unrelated data and existing rubrics', async () => {
  const target = new URL(url!);
  if (!['localhost', '127.0.0.1'].includes(target.hostname) || !target.pathname.endsWith('_bundle_seed_test')) throw new Error('Disposable local bundle database required');
  const db = createPrismaClient(url!);
  try {
    const org = await db.organization.create({ data: { id: 'bundle-seed-unrelated', name: 'Unrelated fixture' } });
    const unrelated = await db.assignmentType.create({ data: { title: 'Unrelated custom writing', position: 0 } });
    // Migrations also provision baseline types. Remove bundle parents only in
    // this empty disposable database to exercise genuinely missing seed data.
    await db.assignmentType.deleteMany({ where: { kind: { in: ['class_starter', 'prewriting', 'thesis_statement'] } } });
    const baselineCount = await db.assignmentType.count();
    const baselineModules = await db.assignmentModule.count();
    const baselineImages = await db.assignmentTypeImage.count();
    const baselineOrgs = await db.organization.findMany();
    await seedFreeTierBundleAssignmentTypes(db);
    const snapshot = async () => ({
      types: await db.assignmentType.findMany({ orderBy: { id: 'asc' } }),
      modules: await db.assignmentModule.count(),
      steps: await db.assignmentModuleInstruction.count(),
      images: await db.assignmentTypeImage.count(),
      orgs: await db.organization.findMany(),
    });
    const first = await snapshot();
    expect(first.types).toHaveLength(baselineCount + 3);
    expect(first.modules).toBe(baselineModules + 3);
    expect(first.images).toBe(baselineImages + 3);
    expect(first.orgs).toEqual(baselineOrgs);
    expect(first.orgs).toContainEqual(org);
    expect(first.types.find(t => t.id === unrelated.id)).toEqual(unrelated);
    for (const row of first.types.filter(t => ['class_starter', 'prewriting', 'thesis_statement'].includes(t.kind ?? ''))) expect(row.rubricJson).toBeTruthy();
    await seedFreeTierBundleAssignmentTypes(db);
    expect(await snapshot()).toEqual(first);
  } finally { await db.$disconnect(); }
});
