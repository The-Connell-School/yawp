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
    await db.assignmentType.deleteMany({
      where: {
        kind: {
          in: [
            'class_starter',
            'exit_ticket',
            'five_paragraph_essay',
            'prewriting',
            'thesis_statement',
            'claim_evidence_reasoning',
          ],
        },
      },
    });
    await db.rubric.upsert({
      where: { name: 'c-e-r' },
      create: {
        name: 'c-e-r',
        title: 'C-E-R',
        schemaJson: {
          name: 'c-e-r',
          title: 'C-E-R',
          scoringScale: { type: 'weighted_1_5', minScore: 1, maxScore: 5, step: 1 },
          rubric: { categories: [] },
        },
      },
      update: {},
    });
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
    expect(first.types).toHaveLength(baselineCount + 6);
    expect(first.modules).toBeGreaterThanOrEqual(baselineModules + 3);
    expect(first.images).toBeGreaterThanOrEqual(baselineImages + 3);
    expect(first.orgs).toEqual(baselineOrgs);
    expect(first.orgs).toContainEqual(org);
    expect(first.types.find(t => t.id === unrelated.id)).toEqual(unrelated);
    for (const row of first.types.filter((t) =>
      [
        'class_starter',
        'exit_ticket',
        'five_paragraph_essay',
        'prewriting',
        'thesis_statement',
        'claim_evidence_reasoning',
      ].includes(t.kind ?? '')
    )) {
      if (row.kind === 'claim_evidence_reasoning') {
        // Brian's name for it (Nov 24). Deploys re-run this seed, so it must not write C-E-R back.
        expect(row.title).toBe('CER Paragraph');
        expect(row.rubricId).toBeTruthy();
      } else {
        expect(row.rubricJson).toBeTruthy();
      }
    }
    await seedFreeTierBundleAssignmentTypes(db);
    expect(await snapshot()).toEqual(first);
  } finally { await db.$disconnect(); }
});
