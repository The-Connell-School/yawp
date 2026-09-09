import { expect, test } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { isAbsolute, join } from 'node:path';

test.skipIf(!process.env.INTERNAL_PAIR_WORKSPACE)('Internal worker publishes through authenticated Yawp HTTP with exact provenance and lost acknowledgement recovery', async () => {
  const internalRoot = process.env.INTERNAL_PAIR_WORKSPACE || '';
  if (!isAbsolute(internalRoot)) throw new Error('INTERNAL_PAIR_WORKSPACE must name the local Internal repository');
  const connection = process.env.INTERNAL_DIRECTORY_TEST_DATABASE_URL || '';
  const url = new URL(connection);
  if (!['127.0.0.1', 'localhost'].includes(url.hostname) || !url.pathname.startsWith('/yawp_')) throw new Error('Owned local Yawp DB required');
  process.env.DATABASE_URL = connection; process.env.E2E_DATABASE_URL = connection;
  const { basePrisma: yawp } = await import('./db.server');
  const { InternalRubrics } = await import('./internal-rubrics.server');
  const { createRubricHttp } = await import('./internal-rubrics-http.server');
  const { PlatformStore } = await import(join(internalRoot, 'packages/database/store.ts'));
  const { ContentWorker } = await import(join(internalRoot, 'apps/worker/content.ts'));
  const { HttpContentAdapter } = await import(join(internalRoot, 'apps/worker/content-adapter.ts'));
  const { PrismaClient } = await import(join(internalRoot, 'node_modules/@prisma/client/index.js'));
  const internalUrl = 'postgresql://internal:local-development-only@127.0.0.1:55439/yawp_internal';
  const db = new PrismaClient({ datasourceUrl: internalUrl });
  const store = new PlatformStore(db);
  const key = 'local-pair-only-' + randomUUID().replaceAll('-', '');
  const http = createRubricHttp(new InternalRubrics(yawp), () => key, () => true);
  const server = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: request => new URL(request.url).pathname.endsWith('/validate') ? http.validate(request) : request.method === 'POST' ? http.publish(request) : http.inspect(request) });
  let worker: any, member: any, target: any;
  const name = `paired-${randomUUID()}`;
  try {
    expect(await db.job.count({ where: { kind: 'content.promote', status: { in: ['queued', 'running'] } } })).toBe(0);
    member = await db.member.create({ data: { subject: randomUUID(), email: `pair-${randomUUID()}@example.test`, grants: { create: [{ capability: 'content.manage', environment: 'development' }, { capability: 'content.promote', environment: 'production' }] } } });
    target = await db.contentDestination.create({ data: { id: randomUUID(), name: 'Local paired production authority', environment: 'production', origin: `https://${randomUUID()}.example.test`, credentialEnv: 'YAWP_CONTENT_PAIR_KEY' } });
    const schema = { name, title: 'Paired rubric', scoringScale: { type: 'rubric_points', minScore: 0, maxScore: 4 }, rubric: { categories: [{ key: 'claim', label: 'Claim', description: 'Explain the claim', weight: 1 }] } };
    const revision = await store.saveContentDraft(member.id, { contentId: randomUUID(), expectedVersion: 0, kind: 'rubric', name, title: schema.title, document: schema });
    let responses = 0;
    const adapter = new HttpContentAdapter((env: string) => { expect(env).toBe(target.credentialEnv); return key; }, async (destination: string, init: RequestInit) => {
      const requested = new URL(destination);
      expect(requested.origin).toBe(target.origin);
      expect(['/api/internal/v1/rubrics', '/api/internal/v1/rubrics/validate']).toContain(requested.pathname);
      // Only this harness maps the registered test origin onto its owned loopback server.
      const response = await fetch(new URL(requested.pathname + requested.search, server.url), init);
      if (requested.pathname === '/api/internal/v1/rubrics' && init.method === 'POST' && ++responses === 1) { expect(response.status).toBe(200); await response.body?.cancel(); throw new Error('Receipt lost after commit'); }
      return response;
    });
    const destination = { id: target.id, name: target.name, environment: target.environment, origin: target.origin, credentialEnv: target.credentialEnv, archived: target.archived };
    const beforeReview = await adapter.review(destination, schema, new AbortController().signal);
    expect(beforeReview.ok).toBe(true); expect(beforeReview.current).toBeNull();
    expect(await yawp.rubric.count({ where: { name } })).toBe(0);
    const invalidReview = await adapter.review(destination, { ...schema, rubric: { categories: [] } }, new AbortController().signal);
    expect(invalidReview.ok).toBe(false); expect(invalidReview.issues.length).toBeGreaterThan(0);
    worker = new ContentWorker(store, internalUrl, adapter);
    const job = await store.promoteContent(member.id, { requestKey: randomUUID(), contentId: revision.contentId, version: 1, targetId: target.id, expectedFingerprint: null, reason: 'Paired QA' });
    await worker.runOnce();
    expect((await store.readContentPromotion(member.id, job.id)).status).toBe('queued');
    const committed = await yawp.rubricRevision.findUniqueOrThrow({ where: { requestId: job.id } });
    expect(committed.createdBy).toBe(member.id);
    expect(committed.sourceContentId).toBe(revision.contentId);
    expect(committed.sourceFingerprint).toBe(revision.fingerprint);
    await worker.runOnce();
    expect((await store.readContentPromotion(member.id, job.id)).status).toBe('succeeded');
    expect(await yawp.rubricRevision.count({ where: { rubricName: name } })).toBe(1);
    const audit = await db.auditEvent.findFirstOrThrow({ where: { actorId: member.id, action: 'content.promotion.completed' } });
    expect(audit.metadata.destinationRevisionId).toBe(committed.id);
    expect(audit.metadata.destinationFingerprint).toBe(committed.fingerprint);
    expect(JSON.stringify(audit)).not.toContain(key);
    expect(await db.auditEvent.count({ where: { actorId: member.id, action: 'content.promotion.unconfirmed' } })).toBe(1);
    const afterReview = await adapter.review(destination, schema, new AbortController().signal);
    expect(afterReview.ok).toBe(true); expect(afterReview.current.fingerprint).toBe(committed.fingerprint);
    expect(afterReview.current.version).toBe(committed.version);
    // A fresh request with a stale destination fingerprint must not replace published content.
    const stale = await store.promoteContent(member.id, { requestKey: randomUUID(), contentId: revision.contentId, version: 1, targetId: target.id, expectedFingerprint: null, reason: 'Stale review' });
    for (let i = 0; i < 3; i++) await worker.runOnce();
    expect((await store.readContentPromotion(member.id, stale.id)).status).toBe('failed');
    expect(await yawp.rubricRevision.count({ where: { rubricName: name } })).toBe(1);
  } finally {
    server.stop(true);
    if (worker) await worker.close();
    if (member) { await db.member.update({ where: { id: member.id }, data: { disabled: true } }); await db.job.updateMany({ where: { actorId: member.id, status: { in: ['queued', 'running'] } }, data: { status: 'failed' } }); }
    if (target) await db.contentDestination.update({ where: { id: target.id }, data: { archived: true } });
    await yawp.rubric.deleteMany({ where: { name } });
    await Promise.all([db.$disconnect(), yawp.$disconnect()]);
  }
}, 60000);
