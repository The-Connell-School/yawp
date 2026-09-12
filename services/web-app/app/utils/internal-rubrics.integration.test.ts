import { expect, test } from 'bun:test';
import { randomUUID } from 'node:crypto';

test.skipIf(!process.env.INTERNAL_DIRECTORY_TEST_DATABASE_URL)('rubric publication preserves existing assignment pins and gives new assignments the new revision', async () => {
  const connection = process.env.INTERNAL_DIRECTORY_TEST_DATABASE_URL!;
  const url = new URL(connection);
  if (!['localhost', '127.0.0.1'].includes(url.hostname) || !url.pathname.startsWith('/yawp_')) throw new Error('Owned local DB required');
  process.env.DATABASE_URL = connection; process.env.E2E_DATABASE_URL = connection;
  const { basePrisma: db } = await import('./db.server');
  const { InternalRubrics } = await import('./internal-rubrics.server');
  const service = new InternalRubrics(db);
  const name = `revision-test-${randomUUID()}`;
  const schema = { name, title: 'Original rubric', scoringScale: { type: 'rubric_points', minScore: 0, maxScore: 4 }, rubric: { categories: [{ key: 'claim', label: 'Claim', description: 'Original requirement', weight: 1 }] } };
  const rubric = await db.rubric.create({ data: { name, title: schema.title, schemaJson: schema } });
  const type = await db.assignmentType.create({ data: { title: name, position: 0, rubricId: rubric.id } });
  try {
    const before = await db.assignment.create({ data: { assignmentTypeId: type.id, prompt: 'Before publication' } });
    expect(before.rubricRevisionId).toBeNull();
    const current = await service.inspect(name);
    const request = { requestId: randomUUID(), actorId: 'internal-operator', reason: 'QA rubric revision', source: { contentId: randomUUID(), version: 1, fingerprint: 'b'.repeat(64) }, expectedFingerprint: current!.fingerprint, schema: { ...schema, title: 'New rubric', rubric: { categories: [{ ...schema.rubric.categories[0], description: 'New requirement' }] } } };
    const { createRubricHttp } = await import('./internal-rubrics-http.server');
    const key = 'r'.repeat(43);
    const http = createRubricHttp(service, () => key, () => true);
    const publishHttp = async () => {
      const response = await http.publish(new Request('https://yawp.test/api/internal/v1/rubrics', { method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' }, body: JSON.stringify(request) }));
      expect(response.status).toBe(200); return response.json();
    };
    const [published, replay] = await Promise.all([publishHttp(), publishHttp()]);
    expect(published.id).toBe(replay.id);
    expect(published.createdBy).toBe('internal-operator');
    expect(published.sourceContentId).toBe(request.source.contentId);
    expect(published.sourceVersion).toBe(request.source.version);
    expect(published.sourceFingerprint).toBe(request.source.fingerprint);
    const pinned = await db.assignment.findUniqueOrThrow({ where: { id: before.id }, include: { rubricRevision: true } });
    expect(pinned.rubricRevision!.schemaJson).toMatchObject({ rubric: { categories: [{ description: 'Original requirement' }] } });
    const after = await db.assignment.create({ data: { assignmentTypeId: type.id, prompt: 'After publication' } });
    expect(after.rubricRevisionId).toBe(published.id);
    expect(after.rubricRevisionId).not.toBe(pinned.rubricRevisionId);
    const { resolveAssignmentTypeGradingConfig } = await import('../domain/assignment-types/assignment-type-grading-config.server');
    const oldConfig = await resolveAssignmentTypeGradingConfig({ assignmentTypeId: type.id, assignmentId: before.id });
    const newConfig = await resolveAssignmentTypeGradingConfig({ assignmentTypeId: type.id, assignmentId: after.id });
    expect(oldConfig.rubricCategories[0]!.description).toBe('Original requirement');
    expect(newConfig.rubricCategories[0]!.description).toBe('New requirement');
    expect(newConfig.version).toBe(published.version);

    expect((await db.rubric.findUniqueOrThrow({ where: { id: rubric.id } })).schemaJson).toEqual(schema);
    await expect(service.publish({ ...request, reason: 'Changed retry' })).rejects.toThrow('Idempotency');
    await expect(service.publish({ ...request, requestId: randomUUID() })).rejects.toThrow('changed');
    const latest = await service.inspect(name);
    expect(latest!.fingerprint).toBe(published.fingerprint);
    await expect(Promise.resolve(db.rubricRevision.update({ where: { id: published.id }, data: { createdBy: 'forged' } }))).rejects.toThrow();
    await expect(Promise.resolve(db.assignment.update({ where: { id: before.id }, data: { rubricRevisionId: published.id } }))).rejects.toThrow();
    await expect(Promise.resolve(db.assignment.update({ where: { id: before.id }, data: { rubricRevisionId: null } }))).rejects.toThrow();
    const third = await service.publish({ ...request, requestId: randomUUID(), expectedFingerprint: latest!.fingerprint, schema: { ...request.schema, title: 'Third rubric' } });
    expect((await db.assignment.findUniqueOrThrow({ where: { id: after.id } })).rubricRevisionId).toBe(published.id);
    const newest = await db.assignment.create({ data: { assignmentTypeId: type.id, prompt: 'Newest' } });
    expect(newest.rubricRevisionId).toBe(third.id);
    expect(await db.rubricRevision.count({ where: { rubricName: name } })).toBe(3);
    await expect(service.publish({ ...request, requestId: randomUUID(), expectedFingerprint: third.fingerprint, schema: { ...request.schema, rubric: { categories: [] } } })).rejects.toThrow('validation');
    await expect(service.publish({ ...request, requestId: randomUUID(), schema: { ...request.schema, name: 'daily-pages-engagement' } })).rejects.toThrow('Protected');
    expect((await service.publish(request)).id).toBe(published.id);
    const [fourth, racing] = await Promise.all([
      service.publish({ ...request, requestId: randomUUID(), expectedFingerprint: third.fingerprint, schema: { ...request.schema, title: 'Fourth rubric' } }),
      db.assignment.create({ data: { assignmentTypeId: type.id, prompt: 'Concurrent creation' } }),
    ]);
    const racePin = await db.assignment.findUniqueOrThrow({ where: { id: racing.id }, include: { rubricRevision: true } });
    expect(racePin.rubricRevisionId).not.toBeNull();
    expect([third.id, fourth.id]).toContain(racePin.rubricRevisionId!);
    expect((await resolveAssignmentTypeGradingConfig({ assignmentTypeId: type.id, assignmentId: racing.id })).version).toBe(racePin.rubricRevision!.version);
    await expect(resolveAssignmentTypeGradingConfig({ assignmentTypeId: 'wrong-type', assignmentId: before.id })).rejects.toThrow('context');

  } finally {
    await db.assignment.deleteMany({ where: { assignmentTypeId: type.id } });
    await db.assignmentType.delete({ where: { id: type.id } });
    await db.rubric.delete({ where: { id: rubric.id } });
    await db.$disconnect();
  }
}, 30000);
