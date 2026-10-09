import { afterAll, beforeAll, beforeEach, expect, test } from 'bun:test';
import { randomUUID } from 'node:crypto';
import fixture from './__fixtures__/prod-rubric-catalog.json';

// Real Postgres with every migration applied (CI: the migrated job database).
//   RUBRIC_CATALOG_DB_TESTS=1 DATABASE_URL=... bun test app/domain/rubrics/rubric-release.integration.test.ts
//
// Yawp Internal releases a rubric version through the catalog `stage`
// endpoint, which records it in the platform's own `RubricRelease` table.
// The `internal_rubrics` feature flag decides, per school, whether a new
// assignment pins to that released version instead of the current one.
const enabled = process.env.RUBRIC_CATALOG_DB_TESTS === '1';
const { basePrisma: db } = enabled ? await import('~/utils/db.server') : ({} as never);
const run = test.skipIf(!enabled);

const FLAG_SETTING = 'feature_flag.internal_rubrics';
const LEGACY_ENV = 'INTERNAL_DEMO_RUBRICS_ENABLED';
const suffix = randomUUID().slice(0, 8);
const actor = 'staff@yawp.test';
const cleanup: (() => Promise<unknown>)[] = [];
let originalFlag: { value: string; valueType: string; description: string | null } | null = null;
const originalLegacyEnv = process.env[LEGACY_ENV];

beforeAll(async () => {
  if (!enabled) return;
  originalFlag = await db.setting.findUnique({ where: { name: FLAG_SETTING }, select: { value: true, valueType: true, description: true } });
});
afterAll(async () => {
  for (const step of cleanup.reverse()) await step().catch(() => undefined);
  if (enabled) {
    await db.setting.deleteMany({ where: { name: FLAG_SETTING } });
    if (originalFlag) await db.setting.create({ data: { name: FLAG_SETTING, ...originalFlag } });
  }
  if (originalLegacyEnv === undefined) delete process.env[LEGACY_ENV]; else process.env[LEGACY_ENV] = originalLegacyEnv;
});
beforeEach(async () => {
  delete process.env[LEGACY_ENV];
  if (enabled) await db.setting.deleteMany({ where: { name: FLAG_SETTING } });
});

async function setFlag(mode: 'off' | 'everyone' | 'targeted', orgIds: string[] = []) {
  const value = JSON.stringify({ mode, orgIds });
  await db.setting.upsert({ where: { name: FLAG_SETTING }, create: { name: FLAG_SETTING, value, valueType: 'json' }, update: { value } });
}

const prodLibrary = (name: string) => fixture.libraryRubrics.find((rubric) => rubric.name === name)!;
const source = () => ({ contentId: randomUUID(), version: 1, fingerprint: 'a'.repeat(64) });

async function catalog() {
  const { RubricCatalog } = await import('./rubric-catalog.server');
  return new RubricCatalog(db);
}

async function schoolWithClass(label: string) {
  const organization = await db.organization.create({ data: { name: `${label} ${suffix}` } });
  const school = await db.school.create({ data: { name: `${label} school`, code: `rel-${suffix}-${randomUUID().slice(0, 6)}`, organizationId: organization.id } });
  const klass = await db.class.create({ data: { code: `c-${randomUUID().slice(0, 8)}`, schoolId: school.id } });
  cleanup.push(async () => {
    await db.classAssignment.deleteMany({ where: { classId: klass.id } });
    await db.class.deleteMany({ where: { schoolId: school.id } });
    await db.school.delete({ where: { id: school.id } });
    await db.organization.delete({ where: { id: organization.id } });
  });
  return { organization, school, klass };
}

async function anotherClass(school: { id: string }) {
  return db.class.create({ data: { code: `c-${randomUUID().slice(0, 8)}`, schoolId: school.id } });
}

/** A library rubric with a current (school-facing) revision and, unless `release` is false, a version released from Internal. */
async function libraryRubric({ release = true }: { release?: boolean } = {}) {
  const source0 = prodLibrary('daily-pages-engagement');
  const name = `daily-pages-engagement-rel-${suffix}-${Math.random().toString(36).slice(2, 7)}`;
  const schemaJson = { ...(source0.schemaJson as object), name } as any;
  const rubric = await db.rubric.create({ data: { name, title: source0.title, schemaJson } });
  // A direct write makes the revision trigger record v1 and point current at it.
  await db.rubric.update({ where: { id: rubric.id }, data: { schemaJson: { ...schemaJson, calibrationNotes: 'School version' } } });
  const current = await db.rubric.findUniqueOrThrow({ where: { id: rubric.id } });
  expect(current.currentRevisionId).toBeTruthy();
  const type = await db.assignmentType.create({ data: { title: `Release type ${name}`, position: 9200, rubricId: rubric.id } });
  cleanup.push(() => db.assignment.deleteMany({ where: { assignmentTypeId: type.id } }));
  cleanup.push(() => db.rubricRelease.deleteMany({ where: { catalogKey: name } }));
  if (!release) return { rubric, name, type, currentRevisionId: current.currentRevisionId!, released: null };
  const c = await catalog();
  const detail = await c.get(name);
  const document = structuredClone(detail.live.editable) as any;
  document.calibrationNotes = 'Released from Internal';
  const released = await c.stage({ key: name, requestId: randomUUID(), actorEmail: actor, reason: 'Release to schools', document, source: source() });
  return { rubric, name, type, currentRevisionId: current.currentRevisionId!, released };
}

async function create(assignmentTypeId: string, classIds: string[], extra: Record<string, unknown> = {}) {
  const { createAssignmentDeployedToClasses } = await import('~/utils/assignment-deployment.server');
  return createAssignmentDeployedToClasses({ data: { assignmentTypeId, prompt: 'Release rollout prompt', ...extra } as any, classIds });
}

run('stage releases the new revision for its key without moving the live rubric', async () => {
  const { rubric, name, currentRevisionId, released } = await libraryRubric();
  expect(released!.revision).toMatchObject({ rubricName: name, version: 2, fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/) });
  expect(released!.release).toEqual({ revisionId: released!.revision.id, version: 2, releasedAt: expect.any(String) });
  const row = await db.rubricRelease.findUniqueOrThrow({ where: { catalogKey: name } });
  expect(row).toMatchObject({ rubricRevisionId: released!.revision.id, releasedBy: actor });
  expect(row.releasedAt.toISOString()).toBe(released!.release.releasedAt);
  // Live content and the school-facing pointer are untouched.
  expect((await db.rubric.findUniqueOrThrow({ where: { id: rubric.id } })).currentRevisionId).toBe(currentRevisionId);
});

run('flag off (no row): new assignments keep the current revision even when a release exists', async () => {
  const { type, currentRevisionId } = await libraryRubric();
  const school = await schoolWithClass('Flag off school');
  expect((await create(type.id, [school.klass.id])).rubricRevisionId).toBe(currentRevisionId);
  await setFlag('off');
  expect((await create(type.id, [school.klass.id])).rubricRevisionId).toBe(currentRevisionId);
  // The retired demo env var no longer pins anything on its own.
  process.env[LEGACY_ENV] = 'true';
  expect((await create(type.id, [school.klass.id])).rubricRevisionId).toBe(currentRevisionId);
});

run('flag on for everyone: new assignments pin to the released revision and grade with it, without the legacy env var', async () => {
  const { type, released } = await libraryRubric();
  const school = await schoolWithClass('Everyone school');
  await setFlag('everyone');
  expect(process.env[LEGACY_ENV]).toBeUndefined();
  const assignment = await create(type.id, [school.klass.id]);
  expect(assignment.rubricRevisionId).toBe(released!.revision.id);
  expect(await db.classAssignment.count({ where: { assignmentId: assignment.id } })).toBe(1);
  const { resolveAssignmentTypeGradingConfig } = await import('../assignment-types/assignment-type-grading-config.server');
  const config = await resolveAssignmentTypeGradingConfig({ assignmentTypeId: type.id, assignmentId: assignment.id });
  expect(config.calibrationNotes).toBe('Released from Internal');
});

run('flag on without a release keeps the current revision', async () => {
  const { type, currentRevisionId } = await libraryRubric({ release: false });
  const school = await schoolWithClass('No release school');
  await setFlag('everyone');
  expect((await create(type.id, [school.klass.id])).rubricRevisionId).toBe(currentRevisionId);
});

run('targeted: only the listed schools get the released revision', async () => {
  const { type, currentRevisionId, released } = await libraryRubric();
  const listed = await schoolWithClass('Targeted school');
  const other = await schoolWithClass('Untargeted school');
  await setFlag('targeted', [listed.organization.id]);
  expect((await create(type.id, [listed.klass.id])).rubricRevisionId).toBe(released!.revision.id);
  expect((await create(type.id, [other.klass.id])).rubricRevisionId).toBe(currentRevisionId);
});

run('several classes: one school uses its flag; classes from different schools keep the default pin', async () => {
  const { type, currentRevisionId, released } = await libraryRubric();
  const first = await schoolWithClass('Multi class school');
  const second = await anotherClass(first.school);
  const other = await schoolWithClass('Second school');
  await setFlag('everyone');
  expect((await create(type.id, [first.klass.id, second.id])).rubricRevisionId).toBe(released!.revision.id);
  expect((await create(type.id, [first.klass.id, other.klass.id])).rubricRevisionId).toBe(currentRevisionId);
  // No classes: no school to evaluate the flag for.
  expect((await create(type.id, [])).rubricRevisionId).toBe(currentRevisionId);
});

run('a release that points at another rubric is ignored', async () => {
  const first = await libraryRubric({ release: false });
  const other = await libraryRubric();
  const school = await schoolWithClass('Mismatch school');
  await setFlag('everyone');
  await db.rubricRelease.create({ data: { catalogKey: first.name, rubricRevisionId: other.released!.revision.id, releasedBy: actor, requestId: randomUUID() } });
  const assignment = await create(first.type.id, [school.klass.id]);
  expect(assignment.rubricRevisionId).toBe(first.currentRevisionId);
});

run('an explicit rubric revision on the create input is never replaced', async () => {
  const { type, currentRevisionId } = await libraryRubric();
  const school = await schoolWithClass('Explicit school');
  await setFlag('everyone');
  expect((await create(type.id, [school.klass.id], { rubricRevisionId: currentRevisionId })).rubricRevisionId).toBe(currentRevisionId);
});

run('per-type rubrics are released under assignment-type:<id>', async () => {
  const { perTypeKey } = await import('./rubric-catalog.server');
  const daily = fixture.perTypeRubrics.find((type) => type.title === 'Daily Pages')!;
  const type = await db.assignmentType.create({ data: {
    title: `Daily Pages release ${suffix}`, position: 9201, scoringScaleJson: daily.scoringScaleJson as any, rubricJson: daily.rubricJson as any,
    gradingPromptConfigJson: (daily.gradingPromptConfigJson ?? undefined) as any, gradingOutputSchemaJson: (daily.gradingOutputSchemaJson ?? undefined) as any, gradingCalibrationNotes: daily.gradingCalibrationNotes,
  } });
  const key = perTypeKey(type.id);
  cleanup.push(() => db.assignment.deleteMany({ where: { assignmentTypeId: type.id } }));
  cleanup.push(() => db.rubricRelease.deleteMany({ where: { catalogKey: key } }));
  const c = await catalog();
  const detail = await c.get(key);
  const document = structuredClone(detail.live.editable) as any;
  document.calibrationNotes = 'Released per-type';
  const released = await c.stage({ key, requestId: randomUUID(), actorEmail: actor, reason: 'Release per-type', document, source: source() });
  expect(released.release.revisionId).toBe(released.revision.id);
  const baseline = await db.assignmentTypeRubricBaseline.findUniqueOrThrow({ where: { assignmentTypeId: type.id } });
  const on = await schoolWithClass('Per-type on');
  const off = await schoolWithClass('Per-type off');
  await setFlag('targeted', [on.organization.id]);
  expect((await create(type.id, [on.klass.id])).rubricRevisionId).toBe(released.revision.id);
  expect((await create(type.id, [off.klass.id])).rubricRevisionId).toBe(baseline.rubricRevisionId);
});

run('a later release replaces the earlier one; replaying a request never moves the release', async () => {
  const { name, type, released } = await libraryRubric();
  const c = await catalog();
  const detail = await c.get(name);
  const document = structuredClone(detail.live.editable) as any;
  document.calibrationNotes = 'Second release';
  const requestId = randomUUID();
  const src = source();
  const second = await c.stage({ key: name, requestId, actorEmail: actor, reason: 'Second release', document, source: src });
  expect(second.release.revisionId).toBe(second.revision.id);
  expect((await db.rubricRelease.findUniqueOrThrow({ where: { catalogKey: name } })).rubricRevisionId).toBe(second.revision.id);

  const school = await schoolWithClass('Replaced release school');
  await setFlag('everyone');
  expect((await create(type.id, [school.klass.id])).rubricRevisionId).toBe(second.revision.id);
  expect(released!.revision.id).not.toBe(second.revision.id);

  // Point the release back at the first version, then replay the second
  // request: the replay returns its original revision and does not re-release it.
  await db.rubricRelease.update({ where: { catalogKey: name }, data: { rubricRevisionId: released!.revision.id } });
  const replay = await c.stage({ key: name, requestId, actorEmail: actor, reason: 'Second release', document, source: src });
  expect(replay).toMatchObject({ replayed: true, revision: { id: second.revision.id }, release: { revisionId: released!.revision.id } });
  expect((await db.rubricRelease.findUniqueOrThrow({ where: { catalogKey: name } })).rubricRevisionId).toBe(released!.revision.id);
});

run('list and item expose each rubric’s current release', async () => {
  const withRelease = await libraryRubric();
  const without = await libraryRubric({ release: false });
  const c = await catalog();
  const list = await c.list();
  const listed = list.rubrics.find((rubric) => rubric.key === withRelease.name)!;
  expect(listed.release).toEqual({
    revisionId: withRelease.released!.revision.id, version: withRelease.released!.revision.version,
    fingerprint: withRelease.released!.revision.fingerprint, releasedAt: withRelease.released!.release.releasedAt,
  });
  expect(list.rubrics.find((rubric) => rubric.key === without.name)!.release).toBeNull();
  const item = await c.get(withRelease.name);
  expect(item.rubric.release).toEqual(listed.release);
  expect(item.revisions.filter((revision) => revision.isReleased).map((revision) => revision.id)).toEqual([withRelease.released!.revision.id]);
  expect((await c.get(without.name)).rubric.release).toBeNull();
});

run('clearing a release sends new assignments back to the current revision', async () => {
  const { name, type, currentRevisionId, released } = await libraryRubric();
  const school = await schoolWithClass('Cleared release school');
  await setFlag('everyone');
  expect((await create(type.id, [school.klass.id])).rubricRevisionId).toBe(released!.revision.id);
  const c = await catalog();
  const cleared = await c.clearRelease({ key: name, actorEmail: actor, reason: 'Roll back release' });
  expect(cleared).toEqual({ key: name, cleared: true, previous: { revisionId: released!.revision.id, version: released!.revision.version, fingerprint: released!.revision.fingerprint, releasedAt: released!.release.releasedAt } });
  expect(await db.rubricRelease.findUnique({ where: { catalogKey: name } })).toBeNull();
  expect((await create(type.id, [school.klass.id])).rubricRevisionId).toBe(currentRevisionId);
  // Idempotent: clearing again reports nothing to clear. The revision itself is kept.
  expect(await c.clearRelease({ key: name, actorEmail: actor, reason: 'Again' })).toEqual({ key: name, cleared: false, previous: null });
  expect(await db.rubricRevision.findUnique({ where: { id: released!.revision.id } })).not.toBeNull();
  await expect(c.clearRelease({ key: 'not a key!', actorEmail: actor, reason: 'Bad' })).rejects.toMatchObject({ statusCode: 404 });
});
