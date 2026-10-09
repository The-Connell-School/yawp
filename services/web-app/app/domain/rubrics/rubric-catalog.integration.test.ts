import { afterAll, expect, test } from 'bun:test';
import { randomUUID } from 'node:crypto';
import fixture from './__fixtures__/prod-rubric-catalog.json';

// Real Postgres with every migration applied (CI: the migrated job database).
const enabled = process.env.RUBRIC_CATALOG_DB_TESTS === '1';
const run = test.skipIf(!enabled);
const suffix = randomUUID().slice(0, 8);
const cleanup: (() => Promise<unknown>)[] = [];
afterAll(async () => { for (const step of cleanup.reverse()) await step().catch(() => undefined); });

async function setup() {
  const { basePrisma: db } = await import('~/utils/db.server');
  const { RubricCatalog, perTypeKey } = await import('./rubric-catalog.server');
  const { resolveAssignmentTypeGradingConfig } = await import('../assignment-types/assignment-type-grading-config.server');
  return { db, catalog: new RubricCatalog(db), perTypeKey, resolve: resolveAssignmentTypeGradingConfig };
}
const prodLibrary = (name: string) => fixture.libraryRubrics.find((rubric) => rubric.name === name)!;
const actor = 'brian@theconnellschool.com';

async function libraryRubric(db: any, prodName: string) {
  const source = prodLibrary(prodName);
  const name = `${prodName}-${suffix}-${Math.random().toString(36).slice(2, 7)}`;
  const schemaJson = { ...(source.schemaJson as object), name };
  const rubric = await db.rubric.create({ data: { name, title: source.title, schemaJson } });
  const type = await db.assignmentType.create({ data: { title: `Type for ${name}`, position: 9000, rubricId: rubric.id } });
  return { rubric, type, name };
}

run('first edit of a never-versioned library rubric captures the live content, pins existing work, and versions the edit with who and why', async () => {
  const { db, catalog, resolve } = await setup();
  const { rubric, type, name } = await libraryRubric(db, 'daily-pages-engagement');
  const before = await db.assignment.create({ data: { assignmentTypeId: type.id, prompt: 'Existing assignment' } });
  expect(before.rubricRevisionId).toBeNull(); // no current revision yet, so nothing to pin to

  const detail = await catalog.get(name);
  expect(detail.rubric.currentVersion).toBeNull();
  expect(detail.rubric.editable).toBe(true);
  expect(detail.live.validation).toEqual({ ok: true, issues: [] });
  const document = structuredClone(detail.live.editable) as any;
  const originalDescription = document.rubric.categories[0].description;
  document.rubric.categories[0].description = `${originalDescription} (clarified)`;

  const requestId = randomUUID();
  const saved = await catalog.save({ key: name, requestId, actorEmail: actor, reason: 'Clarify first criterion', expectedFingerprint: detail.live.fingerprint, document });
  expect(saved.captured?.version).toBe(1);
  expect(saved.captured?.createdBy).toBe('capture-before-edit');
  expect(saved.revision).toMatchObject({ version: 2, createdBy: actor, reason: 'Clarify first criterion' });

  const row = await db.rubric.findUniqueOrThrow({ where: { id: rubric.id } });
  expect(row.currentRevisionId).toBe(saved.revision.id);
  expect((row.schemaJson as any).rubric.categories[0].description).toBe(`${originalDescription} (clarified)`);

  const pinnedBefore = await db.assignment.findUniqueOrThrow({ where: { id: before.id } });
  expect(pinnedBefore.rubricRevisionId).toBe(saved.captured!.id);
  const after = await db.assignment.create({ data: { assignmentTypeId: type.id, prompt: 'New assignment' } });
  expect(after.rubricRevisionId).toBe(saved.revision.id);

  const oldConfig = await resolve({ assignmentTypeId: type.id, assignmentId: before.id });
  const newConfig = await resolve({ assignmentTypeId: type.id, assignmentId: after.id });
  expect(JSON.stringify(oldConfig)).toContain(originalDescription);
  expect(JSON.stringify(oldConfig)).not.toContain('(clarified)');
  expect(JSON.stringify(newConfig)).toContain('(clarified)');

  // Replays are idempotent; reusing the id for different content is refused.
  const replay = await catalog.save({ key: name, requestId, actorEmail: actor, reason: 'Clarify first criterion', expectedFingerprint: detail.live.fingerprint, document });
  expect(replay.replayed).toBe(true); expect(replay.revision.id).toBe(saved.revision.id);
  await expect(catalog.save({ key: name, requestId, actorEmail: actor, reason: 'Different', expectedFingerprint: detail.live.fingerprint, document })).rejects.toMatchObject({ statusCode: 409 });
  // A save based on what the operator saw before the edit is stale.
  await expect(catalog.save({ key: name, requestId: randomUUID(), actorEmail: actor, reason: 'Stale tab', expectedFingerprint: detail.live.fingerprint, document: { ...document, title: 'Stale' } })).rejects.toMatchObject({ statusCode: 409 });

  const history = await catalog.get(name);
  expect(history.revisions.map((r: any) => r.version)).toEqual([2, 1]);
  expect(history.rubric.currentVersion).toBe(2);
  expect(history.revisions.find((r: any) => r.version === 1)!.assignmentCount).toBe(1);
  expect(history.revisions.find((r: any) => r.version === 2)!.assignmentCount).toBe(1);
  cleanup.push(() => db.assignment.deleteMany({ where: { assignmentTypeId: type.id } }));
});

run('editing an already-versioned rubric leaves pinned assignments and every old revision untouched', async () => {
  const { db, catalog } = await setup();
  const { type, name } = await libraryRubric(db, 'gba300-nonverbal-rubric-STUDENT');
  // Baseline the way production did on 2026-09-30: a write of schemaJson creates v1 via the trigger.
  const first = await catalog.get(name);
  const doc1 = structuredClone(first.live.editable) as any; doc1.calibrationNotes = 'Baseline notes';
  const v1 = await catalog.save({ key: name, requestId: randomUUID(), actorEmail: actor, reason: 'Baseline', expectedFingerprint: first.live.fingerprint, document: doc1 });
  const existing = await db.assignment.create({ data: { assignmentTypeId: type.id, prompt: 'Pinned to current' } });
  expect(existing.rubricRevisionId).toBe(v1.revision.id);
  const snapshot = await db.rubricRevision.findMany({ where: { rubricName: name }, orderBy: { version: 'asc' } });

  const second = await catalog.get(name);
  const doc2 = structuredClone(second.live.editable) as any;
  doc2.rubric.categories[0].weight = doc2.rubric.categories[0].weight + 1;
  const v2 = await catalog.save({ key: name, requestId: randomUUID(), actorEmail: 'bryant@brock.software', reason: 'Reweight', expectedFingerprint: second.live.fingerprint, document: doc2 });
  expect(v2.captured).toBeNull();
  expect(v2.revision.version).toBe(v1.revision.version + 1);
  expect((await db.assignment.findUniqueOrThrow({ where: { id: existing.id } })).rubricRevisionId).toBe(v1.revision.id);
  const afterRows = await db.rubricRevision.findMany({ where: { rubricName: name }, orderBy: { version: 'asc' } });
  expect(afterRows.slice(0, snapshot.length)).toEqual(snapshot);
  await expect((async () => db.rubricRevision.update({ where: { id: v1.revision.id }, data: { reason: 'tamper' } }))()).rejects.toBeTruthy();
  cleanup.push(() => db.assignment.deleteMany({ where: { assignmentTypeId: type.id } }));
});

run('writers that do not set an actor keep the old trigger defaults', async () => {
  const { db } = await setup();
  const { rubric, name } = await libraryRubric(db, 'thesis-driven-essay');
  await db.rubric.update({ where: { id: rubric.id }, data: { schemaJson: { ...(rubric.schemaJson as object), calibrationNotes: 'direct write' } } });
  const revision = await db.rubricRevision.findFirstOrThrow({ where: { rubricName: name }, orderBy: { version: 'desc' } });
  expect(revision.createdBy).toBe('auto-revision');
  expect(revision.reason).toBe('Rubric updated');
});

run('per-type rubric (production Daily Pages content) saves as a new revision, moves the baseline and keeps prompt keys the editor does not own', async () => {
  const { db, catalog, perTypeKey, resolve } = await setup();
  const daily = fixture.perTypeRubrics.find((type) => type.title === 'Daily Pages')!;
  const promptConfig = { ...((daily.gradingPromptConfigJson as object) ?? {}), gradingInstructionsOverride: 'Teacher override stays' };
  const type = await db.assignmentType.create({ data: {
    title: `Daily Pages ${suffix}`, position: 9001, scoringScaleJson: daily.scoringScaleJson as any, rubricJson: daily.rubricJson as any,
    gradingPromptConfigJson: promptConfig as any, gradingOutputSchemaJson: (daily.gradingOutputSchemaJson ?? undefined) as any, gradingCalibrationNotes: daily.gradingCalibrationNotes,
  } });
  const key = perTypeKey(type.id);
  const before = await db.assignment.create({ data: { assignmentTypeId: type.id, prompt: 'Existing Daily Pages entry' } });
  const detail = await catalog.get(key);
  expect(detail.rubric.source).toBe('assignment-type');
  expect(detail.live.preservedPromptConfigKeys).toEqual(['gradingInstructionsOverride']);
  const doc = structuredClone(detail.live.editable) as any;
  doc.rubric.categories[0].label = `${doc.rubric.categories[0].label} (renamed)`;
  const saved = await catalog.save({ key, requestId: randomUUID(), actorEmail: actor, reason: 'Rename criterion', expectedFingerprint: detail.live.fingerprint, document: doc });
  expect(saved.revision.createdBy).toBe(actor);
  const row = await db.assignmentType.findUniqueOrThrow({ where: { id: type.id }, include: { rubricBaseline: true } });
  expect(row.rubricBaseline?.rubricRevisionId).toBe(saved.revision.id);
  expect((row.gradingPromptConfigJson as any).gradingInstructionsOverride).toBe('Teacher override stays');
  expect((row.rubricJson as any).categories[0].label).toContain('(renamed)');
  const pinned = await db.assignment.findUniqueOrThrow({ where: { id: before.id } });
  expect(pinned.rubricRevisionId).not.toBe(saved.revision.id);
  expect(pinned.rubricRevisionId).toBeTruthy();
  const after = await db.assignment.create({ data: { assignmentTypeId: type.id, prompt: 'New entry' } });
  expect(after.rubricRevisionId).toBe(saved.revision.id);
  expect(JSON.stringify(await resolve({ assignmentTypeId: type.id, assignmentId: before.id }))).not.toContain('(renamed)');
  expect(JSON.stringify(await resolve({ assignmentTypeId: type.id, assignmentId: after.id }))).toContain('(renamed)');
  cleanup.push(() => db.assignment.deleteMany({ where: { assignmentTypeId: type.id } }));
});

run('code-seeded starters are editable and flagged; library-linked types are read-only; list counts every library rubric', async () => {
  const { db, catalog } = await setup();
  const listed = await catalog.list();
  expect(listed.totals.libraryRubrics).toBe(await db.rubric.count());
  const linked = await libraryRubric(db, 'gba300-international-etiquette');
  await db.assignmentType.update({ where: { id: linked.type.id }, data: { rubricJson: { categories: [{ key: 'old', label: 'Old', description: 'Unused', weight: 1 }] } } });
  const again = await catalog.list();
  expect(again.rubrics.some((r: any) => r.key === `assignment-type:${linked.type.id}`)).toBe(false);
  expect(again.assignmentTypes.find((t: any) => t.id === linked.type.id)).toMatchObject({ rubricSource: 'library', rubricKey: linked.name, hasUnusedOwnRubricColumns: true });
  if (!(await db.rubric.findUnique({ where: { name: 'class-starter-engagement' } }))) {
    const source = prodLibrary('class-starter-engagement');
    await db.rubric.create({ data: { name: source.name, title: source.title, schemaJson: source.schemaJson as any } });
  }
  {
    const detail = await catalog.get('class-starter-engagement');
    expect(detail.rubric.editable).toBe(true);
    expect(detail.rubric.seededFromCode).toBe(true);
    const title = `Class Starter engagement ${suffix}`;
    const saved = await catalog.save({ key: 'class-starter-engagement', requestId: randomUUID(), actorEmail: actor, reason: 'Rename starter', expectedFingerprint: detail.live.fingerprint, document: { ...(detail.live.editable as object), title } });
    expect((await db.rubric.findUniqueOrThrow({ where: { name: 'class-starter-engagement' } })).title).toBe(title);
    expect(saved.revision.createdBy).toBe(actor);
  }
  await expect(catalog.get('does-not-exist')).rejects.toMatchObject({ statusCode: 404 });
});
const source = () => ({ contentId: randomUUID(), version: 3, fingerprint: 'e'.repeat(64) });

run('staging a library rubric appends a source-tagged revision and changes nothing schools use', async () => {
  const { db, catalog } = await setup();
  const { rubric, type, name } = await libraryRubric(db, 'daily-pages-engagement');
  // Give the rubric a current (school-facing) revision and a pinned assignment.
  const first = await catalog.get(name);
  const doc1 = structuredClone(first.live.editable) as any; doc1.calibrationNotes = 'School notes';
  const v1 = await catalog.save({ key: name, requestId: randomUUID(), actorEmail: actor, reason: 'Baseline', expectedFingerprint: first.live.fingerprint, document: doc1 });
  const pinned = await db.assignment.create({ data: { assignmentTypeId: type.id, prompt: 'School assignment' } });
  const rubricBefore = await db.rubric.findUniqueOrThrow({ where: { id: rubric.id } });
  const typeBefore = await db.assignmentType.findUniqueOrThrow({ where: { id: type.id } });

  const detail = await catalog.get(name);
  const document = structuredClone(detail.live.editable) as any;
  document.calibrationNotes = 'Demo notes';
  document.rubric.categories[0].description = `${document.rubric.categories[0].description} (demo)`;
  const requestId = randomUUID();
  const src = source();
  const staged = await catalog.stage({ key: name, requestId, actorEmail: 'staff@yawp.test', reason: 'Stage for demo orgs', document, source: src });
  expect(staged.replayed).toBe(false);
  expect(staged.revision).toMatchObject({ rubricName: name, version: v1.revision.version + 1, createdBy: 'staff@yawp.test', reason: 'Stage for demo orgs' });

  const row = await db.rubricRevision.findUniqueOrThrow({ where: { id: staged.revision.id } });
  expect(row).toMatchObject({ requestId, sourceContentId: src.contentId, sourceVersion: src.version, sourceFingerprint: src.fingerprint });
  const { contentFingerprint } = await import('./rubric-catalog.server');
  expect(row.fingerprint).toBe(contentFingerprint(row.schemaJson));
  expect((row.schemaJson as any).calibrationNotes).toBe('Demo notes');
  expect((row.schemaJson as any).name).toBe(name);
  expect((row.schemaJson as any).rubric.categories[0].description).toContain('(demo)');
  // Nothing the platform reads by default moved.
  expect(await db.rubric.findUniqueOrThrow({ where: { id: rubric.id } })).toEqual(rubricBefore);
  expect(await db.assignmentType.findUniqueOrThrow({ where: { id: type.id } })).toEqual(typeBefore);
  expect((await db.assignment.findUniqueOrThrow({ where: { id: pinned.id } })).rubricRevisionId).toBe(v1.revision.id);
  const fresh = await db.assignment.create({ data: { assignmentTypeId: type.id, prompt: 'New school assignment' } });
  expect(fresh.rubricRevisionId).toBe(v1.revision.id);
  // An explicit pin to the staged revision is accepted by the pin trigger.
  const demo = await db.assignment.create({ data: { assignmentTypeId: type.id, prompt: 'Demo assignment', rubricRevisionId: staged.revision.id } });
  expect(demo.rubricRevisionId).toBe(staged.revision.id);

  // Replays are idempotent; reusing the id for different inputs is refused.
  const replay = await catalog.stage({ key: name, requestId, actorEmail: 'staff@yawp.test', reason: 'Stage for demo orgs', document, source: src });
  expect(replay).toMatchObject({ replayed: true, revision: { id: staged.revision.id } });
  await expect(catalog.stage({ key: name, requestId, actorEmail: 'staff@yawp.test', reason: 'Stage for demo orgs', document, source: { ...src, version: 4 } })).rejects.toMatchObject({ statusCode: 409 });
  // A later save still versions after the staged revision.
  const again = await catalog.get(name);
  const doc3 = structuredClone(again.live.editable) as any; doc3.calibrationNotes = 'School notes 2';
  const v3 = await catalog.save({ key: name, requestId: randomUUID(), actorEmail: actor, reason: 'School edit', expectedFingerprint: again.live.fingerprint, document: doc3 });
  expect(v3.revision.version).toBe(staged.revision.version + 1);
  cleanup.push(() => db.assignment.deleteMany({ where: { assignmentTypeId: type.id } }));
});

run('staging keeps non-editable prompt keys and validates like save', async () => {
  const { db, catalog, perTypeKey } = await setup();
  const daily = fixture.perTypeRubrics.find((type) => type.title === 'Daily Pages')!;
  const promptConfig = { ...((daily.gradingPromptConfigJson as object) ?? {}), gradingInstructionsOverride: 'Teacher override stays' };
  const type = await db.assignmentType.create({ data: {
    title: `Daily Pages stage ${suffix}`, position: 9002, scoringScaleJson: daily.scoringScaleJson as any, rubricJson: daily.rubricJson as any,
    gradingPromptConfigJson: promptConfig as any, gradingOutputSchemaJson: (daily.gradingOutputSchemaJson ?? undefined) as any, gradingCalibrationNotes: daily.gradingCalibrationNotes,
  } });
  const key = perTypeKey(type.id);
  const typeBefore = await db.assignmentType.findUniqueOrThrow({ where: { id: type.id } });
  const detail = await catalog.get(key);
  const document = structuredClone(detail.live.editable) as any;
  document.rubric.categories[0].label = `${document.rubric.categories[0].label} (demo)`;
  const staged = await catalog.stage({ key, requestId: randomUUID(), actorEmail: actor, reason: 'Stage per-type', document, source: source() });
  const row = await db.rubricRevision.findUniqueOrThrow({ where: { id: staged.revision.id } });
  expect(row.rubricName).toBe(key);
  expect((row.schemaJson as any).promptConfig.gradingInstructionsOverride).toBe('Teacher override stays');
  expect((row.schemaJson as any).rubric.categories[0].label).toContain('(demo)');
  expect(await db.assignmentType.findUniqueOrThrow({ where: { id: type.id } })).toEqual(typeBefore);
  // Like a first save, staging captures the live content as the baseline first; the staged revision follows it.
  const baseline = await db.assignmentTypeRubricBaseline.findUniqueOrThrow({ where: { assignmentTypeId: type.id } });
  const baselineRow = await db.rubricRevision.findUniqueOrThrow({ where: { id: baseline.rubricRevisionId } });
  expect(baselineRow).toMatchObject({ rubricName: key, createdBy: 'capture-before-edit', version: staged.revision.version - 1, sourceContentId: null });
  expect(baselineRow.schemaJson).toEqual(detail.live.content as any);
  expect((await db.assignment.create({ data: { assignmentTypeId: type.id, prompt: 'School entry' } })).rubricRevisionId).toBe(baselineRow.id);
  cleanup.push(() => db.assignment.deleteMany({ where: { assignmentTypeId: type.id } }));

  await expect(catalog.stage({ key, requestId: randomUUID(), actorEmail: actor, reason: 'Broken', document: { ...document, rubric: { categories: [] } }, source: source() })).rejects.toMatchObject({ statusCode: 422 });
  await expect(catalog.stage({ key: 'does-not-exist', requestId: randomUUID(), actorEmail: actor, reason: 'Missing', document: { ...document, name: 'does-not-exist' }, source: source() })).rejects.toMatchObject({ statusCode: 404 });
  const { name } = await libraryRubric(db, 'daily-pages-engagement');
  const libDetail = await catalog.get(name);
  await expect(catalog.stage({ key: name, requestId: randomUUID(), actorEmail: actor, reason: 'Rename', document: { ...(libDetail.live.editable as object), name: 'renamed' }, source: source() })).rejects.toMatchObject({ statusCode: 422 });
  // Read-only rubrics (library-linked per-type key) are refused.
  const linked = await libraryRubric(db, 'gba300-international-etiquette');
  await db.assignmentType.update({ where: { id: linked.type.id }, data: { rubricJson: { categories: [{ key: 'old', label: 'Old', description: 'Unused', weight: 1 }] } } });
  await expect(catalog.stage({ key: perTypeKey(linked.type.id), requestId: randomUUID(), actorEmail: actor, reason: 'Read only', document, source: source() })).rejects.toMatchObject({ statusCode: 403 });
});
