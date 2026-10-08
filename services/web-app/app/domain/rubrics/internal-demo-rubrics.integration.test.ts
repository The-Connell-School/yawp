import { afterAll, beforeAll, beforeEach, expect, test } from 'bun:test';
import { randomUUID } from 'node:crypto';
import fixture from './__fixtures__/prod-rubric-catalog.json';

// Real Postgres with every migration applied (CI: the migrated job database).
// The `internal` schema belongs to Yawp Internal v3 and does not exist in
// local/CI databases, so these tests create a minimal stand-in for the
// contract (internal.demo_orgs + internal.platform_demo_revisions) and remove
// it afterwards. They refuse to run against a database that already has one.
const enabled = process.env.RUBRIC_CATALOG_DB_TESTS === '1';
const { basePrisma: db } = enabled ? await import('~/utils/db.server') : ({} as never);
const preexistingInternalSchema = enabled
  ? Boolean((await db.$queryRaw<{ present: boolean }[]>`SELECT to_regnamespace('internal') IS NOT NULL AS present`)[0]?.present)
  : false;
const run = test.skipIf(!enabled || preexistingInternalSchema);

const suffix = randomUUID().slice(0, 8);
const cleanup: (() => Promise<unknown>)[] = [];
const FLAG = 'INTERNAL_DEMO_RUBRICS_ENABLED';
const originalFlag = process.env[FLAG];

async function createInternalSchema() {
  await db.$executeRawUnsafe('CREATE SCHEMA internal');
  await db.$executeRawUnsafe('CREATE TABLE internal.demo_orgs (org_id text PRIMARY KEY, label text)');
  await db.$executeRawUnsafe('CREATE TABLE internal.platform_demo_revisions (rubric_key text PRIMARY KEY, platform_revision_id text NOT NULL, version_number int NOT NULL, staged_at timestamptz NOT NULL DEFAULT now())');
}
async function dropInternalSchema() {
  await db.$executeRawUnsafe('DROP SCHEMA IF EXISTS internal CASCADE');
}

beforeAll(async () => { if (enabled && !preexistingInternalSchema) await createInternalSchema(); });
afterAll(async () => {
  for (const step of cleanup.reverse()) await step().catch(() => undefined);
  if (enabled && !preexistingInternalSchema) await dropInternalSchema().catch(() => undefined);
  if (originalFlag === undefined) delete process.env[FLAG]; else process.env[FLAG] = originalFlag;
});
beforeEach(() => { process.env[FLAG] = 'true'; });

const prodLibrary = (name: string) => fixture.libraryRubrics.find((rubric) => rubric.name === name)!;

async function organizationWithClass(label: string, demo: boolean) {
  const organization = await db.organization.create({ data: { name: `${label} ${suffix}` } });
  const school = await db.school.create({ data: { name: `${label} school`, code: `demo-${suffix}-${randomUUID().slice(0, 6)}`, organizationId: organization.id } });
  const klass = await db.class.create({ data: { code: `c-${randomUUID().slice(0, 8)}`, schoolId: school.id } });
  if (demo) await db.$executeRaw`INSERT INTO internal.demo_orgs (org_id, label) VALUES (${organization.id}, ${label})`;
  cleanup.push(async () => {
    await db.classAssignment.deleteMany({ where: { classId: klass.id } });
    await db.class.delete({ where: { id: klass.id } });
    await db.school.delete({ where: { id: school.id } });
    await db.organization.delete({ where: { id: organization.id } });
  });
  return { organization, school, klass };
}

/** A library rubric with a current (school-facing) revision and a separately staged demo revision. */
async function libraryWithStagedRevision() {
  const source = prodLibrary('daily-pages-engagement');
  const name = `daily-pages-engagement-demo-${suffix}-${Math.random().toString(36).slice(2, 7)}`;
  const schemaJson = { ...(source.schemaJson as object), name } as any;
  const rubric = await db.rubric.create({ data: { name, title: source.title, schemaJson } });
  // A direct write makes the revision trigger record v1 and point current at it.
  await db.rubric.update({ where: { id: rubric.id }, data: { schemaJson: { ...schemaJson, calibrationNotes: 'School version' } } });
  const current = await db.rubric.findUniqueOrThrow({ where: { id: rubric.id } });
  expect(current.currentRevisionId).toBeTruthy();
  const stagedContent = { ...schemaJson, calibrationNotes: 'Demo-only staged version' };
  const staged = await db.rubricRevision.create({ data: {
    id: randomUUID(), rubricName: name, version: 2, schemaJson: stagedContent, fingerprint: 'f'.repeat(64),
    requestId: randomUUID(), requestHash: 'f'.repeat(64), createdBy: 'staff@yawp.test', reason: 'Stage for demo orgs',
    sourceContentId: randomUUID(), sourceVersion: 1, sourceFingerprint: 'a'.repeat(64),
  } });
  const type = await db.assignmentType.create({ data: { title: `Demo type ${name}`, position: 9100, rubricId: rubric.id } });
  cleanup.push(() => db.assignment.deleteMany({ where: { assignmentTypeId: type.id } }));
  return { rubric, name, type, currentRevisionId: current.currentRevisionId!, staged };
}

async function stage(rubricKey: string, revisionId: string) {
  await db.$executeRaw`INSERT INTO internal.platform_demo_revisions (rubric_key, platform_revision_id, version_number) VALUES (${rubricKey}, ${revisionId}, 2)
    ON CONFLICT (rubric_key) DO UPDATE SET platform_revision_id = EXCLUDED.platform_revision_id`;
}

async function create(assignmentTypeId: string, classIds: string[], extra: Record<string, unknown> = {}) {
  const { createAssignmentDeployedToClasses } = await import('~/utils/assignment-deployment.server');
  return createAssignmentDeployedToClasses({ data: { assignmentTypeId, prompt: 'Demo rollout prompt', ...extra } as any, classIds });
}

run('demo org assignment pins to the staged revision and grades with its content', async () => {
  const { name, type, staged } = await libraryWithStagedRevision();
  const demo = await organizationWithClass('Demo org', true);
  await stage(name, staged.id);
  const assignment = await create(type.id, [demo.klass.id]);
  expect(assignment.rubricRevisionId).toBe(staged.id);
  expect(await db.classAssignment.count({ where: { assignmentId: assignment.id } })).toBe(1);
  const { resolveAssignmentTypeGradingConfig } = await import('../assignment-types/assignment-type-grading-config.server');
  const config = await resolveAssignmentTypeGradingConfig({ assignmentTypeId: type.id, assignmentId: assignment.id });
  expect(config.calibrationNotes).toBe('Demo-only staged version');
});

run('with the flag off a demo org keeps the current revision', async () => {
  const { name, type, staged, currentRevisionId } = await libraryWithStagedRevision();
  const demo = await organizationWithClass('Demo org flag off', true);
  await stage(name, staged.id);
  process.env[FLAG] = 'false';
  expect((await create(type.id, [demo.klass.id])).rubricRevisionId).toBe(currentRevisionId);
  delete process.env[FLAG];
  expect((await create(type.id, [demo.klass.id])).rubricRevisionId).toBe(currentRevisionId);
});

run('a school (non-demo) org keeps the current revision', async () => {
  const { name, type, staged, currentRevisionId } = await libraryWithStagedRevision();
  const school = await organizationWithClass('Real school', false);
  await stage(name, staged.id);
  expect((await create(type.id, [school.klass.id])).rubricRevisionId).toBe(currentRevisionId);
  expect((await create(type.id, [])).rubricRevisionId).toBe(currentRevisionId);
});

run('a staged revision that belongs to another rubric is ignored', async () => {
  const first = await libraryWithStagedRevision();
  const other = await libraryWithStagedRevision();
  const demo = await organizationWithClass('Demo org mismatch', true);
  await stage(first.name, other.staged.id);
  expect((await create(first.type.id, [demo.klass.id])).rubricRevisionId).toBe(first.currentRevisionId);
  await stage(first.name, randomUUID());
  expect((await create(first.type.id, [demo.klass.id])).rubricRevisionId).toBe(first.currentRevisionId);
});

run('an explicit rubric revision on the create input is never replaced', async () => {
  const { name, type, staged, currentRevisionId } = await libraryWithStagedRevision();
  const demo = await organizationWithClass('Demo org explicit', true);
  await stage(name, staged.id);
  expect((await create(type.id, [demo.klass.id], { rubricRevisionId: currentRevisionId })).rubricRevisionId).toBe(currentRevisionId);
});

run('per-type rubrics are staged under assignment-type:<id>', async () => {
  const { perTypeKey } = await import('./rubric-catalog.server');
  const daily = fixture.perTypeRubrics.find((type) => type.title === 'Daily Pages')!;
  const type = await db.assignmentType.create({ data: {
    title: `Daily Pages demo ${suffix}`, position: 9101, scoringScaleJson: daily.scoringScaleJson as any, rubricJson: daily.rubricJson as any,
    gradingPromptConfigJson: (daily.gradingPromptConfigJson ?? undefined) as any, gradingOutputSchemaJson: (daily.gradingOutputSchemaJson ?? undefined) as any, gradingCalibrationNotes: daily.gradingCalibrationNotes,
  } });
  cleanup.push(() => db.assignment.deleteMany({ where: { assignmentTypeId: type.id } }));
  const key = perTypeKey(type.id);
  const baseline = await db.rubricRevision.create({ data: {
    id: randomUUID(), rubricName: key, version: 1, schemaJson: { name: key }, fingerprint: 'b'.repeat(64),
    requestId: randomUUID(), requestHash: 'b'.repeat(64), createdBy: 'baseline-capture', reason: 'Baseline',
  } });
  await db.assignmentTypeRubricBaseline.create({ data: { assignmentTypeId: type.id, rubricRevisionId: baseline.id } });
  const staged = await db.rubricRevision.create({ data: {
    id: randomUUID(), rubricName: key, version: 2, schemaJson: { name: key, calibrationNotes: 'demo' }, fingerprint: 'c'.repeat(64),
    requestId: randomUUID(), requestHash: 'c'.repeat(64), createdBy: 'staff@yawp.test', reason: 'Stage',
    sourceContentId: randomUUID(), sourceVersion: 3, sourceFingerprint: 'd'.repeat(64),
  } });
  const demo = await organizationWithClass('Demo org per-type', true);
  const school = await organizationWithClass('School per-type', false);
  await stage(key, staged.id);
  expect((await create(type.id, [demo.klass.id])).rubricRevisionId).toBe(staged.id);
  expect((await create(type.id, [school.klass.id])).rubricRevisionId).toBe(baseline.id);
});

run('when the internal schema is absent assignment creation is unchanged', async () => {
  const { name, type, staged, currentRevisionId } = await libraryWithStagedRevision();
  const demo = await organizationWithClass('Demo org no schema', true);
  await stage(name, staged.id);
  await dropInternalSchema();
  try {
    expect((await create(type.id, [demo.klass.id])).rubricRevisionId).toBe(currentRevisionId);
    // Only the view missing (table present) also falls back.
    await db.$executeRawUnsafe('CREATE SCHEMA internal');
    await db.$executeRawUnsafe('CREATE TABLE internal.demo_orgs (org_id text PRIMARY KEY, label text)');
    await db.$executeRaw`INSERT INTO internal.demo_orgs (org_id) VALUES (${demo.organization.id})`;
    expect((await create(type.id, [demo.klass.id])).rubricRevisionId).toBe(currentRevisionId);
  } finally {
    await dropInternalSchema();
    await createInternalSchema();
  }
});

run('an error while reading the internal schema never blocks assignment creation', async () => {
  const { name, type, staged, currentRevisionId } = await libraryWithStagedRevision();
  const demo = await organizationWithClass('Demo org broken view', true);
  await stage(name, staged.id);
  // Replace the view contract with something the lookup cannot query.
  await db.$executeRawUnsafe('ALTER TABLE internal.platform_demo_revisions RENAME COLUMN platform_revision_id TO renamed_revision_id');
  try {
    const assignment = await create(type.id, [demo.klass.id]);
    expect(assignment.rubricRevisionId).toBe(currentRevisionId);
    expect(await db.classAssignment.count({ where: { assignmentId: assignment.id } })).toBe(1);
  } finally {
    await db.$executeRawUnsafe('ALTER TABLE internal.platform_demo_revisions RENAME COLUMN renamed_revision_id TO platform_revision_id');
  }
});

run('staging a never-versioned library rubric captures a baseline, keeps schools on it and pins demo orgs to the staged revision', async () => {
  const { RubricCatalog } = await import('./rubric-catalog.server');
  const catalog = new RubricCatalog(db);
  const source = prodLibrary('daily-pages-engagement');
  const name = `daily-pages-engagement-never-${suffix}`;
  const rubric = await db.rubric.create({ data: { name, title: source.title, schemaJson: { ...(source.schemaJson as object), name } as any } });
  const type = await db.assignmentType.create({ data: { title: `Never versioned ${name}`, position: 9102, rubricId: rubric.id } });
  cleanup.push(() => db.assignment.deleteMany({ where: { assignmentTypeId: type.id } }));
  const existing = await db.assignment.create({ data: { assignmentTypeId: type.id, prompt: 'Existing unpinned' } });
  expect(existing.rubricRevisionId).toBeNull();
  expect(await db.rubricRevision.count({ where: { rubricName: name } })).toBe(0);

  const detail = await catalog.get(name);
  const document = structuredClone(detail.live.editable) as any;
  document.calibrationNotes = 'Demo-only staged version';
  const staged = await catalog.stage({ key: name, requestId: randomUUID(), actorEmail: 'staff@yawp.test', reason: 'Stage for demo', document, source: { contentId: randomUUID(), version: 1, fingerprint: 'a'.repeat(64) } });

  const revisions = await db.rubricRevision.findMany({ where: { rubricName: name }, orderBy: { version: 'asc' } });
  expect(revisions.map((r) => [r.version, r.createdBy])).toEqual([[1, 'capture-before-edit'], [2, 'staff@yawp.test']]);
  const [baseline] = revisions;
  expect(staged.revision).toMatchObject({ id: revisions[1]!.id, version: 2 });
  const after = await db.rubric.findUniqueOrThrow({ where: { id: rubric.id } });
  expect(after.currentRevisionId).toBe(baseline!.id);
  expect(after.schemaJson).toEqual(rubric.schemaJson as any);
  expect(baseline!.schemaJson).toEqual(rubric.schemaJson as any);
  expect((await db.assignment.findUniqueOrThrow({ where: { id: existing.id } })).rubricRevisionId).toBe(baseline!.id);

  const demo = await organizationWithClass('Demo org never versioned', true);
  const school = await organizationWithClass('School never versioned', false);
  await stage(name, staged.revision.id);
  expect((await create(type.id, [demo.klass.id])).rubricRevisionId).toBe(staged.revision.id);
  expect((await create(type.id, [school.klass.id])).rubricRevisionId).toBe(baseline!.id);
});

run('staging a per-type rubric without a baseline lets demo orgs pin to it', async () => {
  const { RubricCatalog, perTypeKey } = await import('./rubric-catalog.server');
  const catalog = new RubricCatalog(db);
  const daily = fixture.perTypeRubrics.find((type) => type.title === 'Daily Pages')!;
  const type = await db.assignmentType.create({ data: {
    title: `Daily Pages unbaselined ${suffix}`, position: 9103, scoringScaleJson: daily.scoringScaleJson as any, rubricJson: daily.rubricJson as any,
    gradingPromptConfigJson: (daily.gradingPromptConfigJson ?? undefined) as any, gradingOutputSchemaJson: (daily.gradingOutputSchemaJson ?? undefined) as any, gradingCalibrationNotes: daily.gradingCalibrationNotes,
  } });
  cleanup.push(() => db.assignment.deleteMany({ where: { assignmentTypeId: type.id } }));
  const key = perTypeKey(type.id);
  const detail = await catalog.get(key);
  const document = structuredClone(detail.live.editable) as any;
  document.calibrationNotes = 'Demo per-type';
  const staged = await catalog.stage({ key, requestId: randomUUID(), actorEmail: 'staff@yawp.test', reason: 'Stage per-type', document, source: { contentId: randomUUID(), version: 1, fingerprint: 'a'.repeat(64) } });
  const baseline = await db.assignmentTypeRubricBaseline.findUniqueOrThrow({ where: { assignmentTypeId: type.id } });
  expect(baseline.rubricRevisionId).not.toBe(staged.revision.id);
  const demo = await organizationWithClass('Demo org unbaselined', true);
  const school = await organizationWithClass('School unbaselined', false);
  await stage(key, staged.revision.id);
  expect((await create(type.id, [demo.klass.id])).rubricRevisionId).toBe(staged.revision.id);
  expect((await create(type.id, [school.klass.id])).rubricRevisionId).toBe(baseline.rubricRevisionId);
});
