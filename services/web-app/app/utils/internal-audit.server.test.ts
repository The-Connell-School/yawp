import { expect, test } from 'bun:test';
import { createAuditHandler } from './internal-audit.server';
const key = 'k'.repeat(43);
const request = (query = '', credential = key) => new Request(`https://yawp.test/api/internal/v1/impersonation-audit?${query}`, { headers: { authorization: `Bearer ${credential}` } });
const event = (id: string) => ({ id, sessionId: 'session', actorId: 'operator', userId: 'teacher', organizationId: 'org-a', action: 'update', resourceType: 'Document', resourceId: 'doc', requestId: 'request', requestAction: 'http.POST', jobId: null, createdAt: new Date('2026-09-09T10:00:00Z') });
test('audit authenticates before queries and rejects invalid scope and pagination', async () => {
  let calls = 0;
  const read = createAuditHandler({ findMany: async () => { calls++; return []; } }, () => key);
  expect((await read(request('', 'bad'))).status).toBe(401);
  for (const query of ['limit=101', 'organizationId=bad%2Fscope', 'organizationId=a&organizationId=b', 'cursor=bad', 'token=secret']) {
    expect((await read(request(query))).status).toBe(400);
  }
  expect(calls).toBe(0);
  expect((await createAuditHandler({ findMany: async () => [] }, () => undefined)(request())).status).toBe(404);
});
test('audit filters before paging and returns only provenance with a scope-bound cursor', async () => {
  const queries: any[] = [];
  const read = createAuditHandler({ findMany: async query => { queries.push(query); return [event('event-b'), event('event-a')]; } }, () => key);
  const first = await read(request('organizationId=org-a&sessionId=session&limit=1'));
  expect(first.headers.get('cache-control')).toBe('no-store');
  const page = await first.json();
  expect(page.events).toHaveLength(1);
  expect(page.events[0]).toMatchObject({ actorId: 'operator', userId: 'teacher', resourceId: 'doc', sessionId: 'session' });
  expect(queries[0].where).toMatchObject({ organizationId: 'org-a', sessionId: 'session' });
  expect(queries[0].take).toBe(2);
  expect((await read(request(`organizationId=org-b&sessionId=session&cursor=${page.nextCursor}`))).status).toBe(400);
  expect(queries).toHaveLength(1);
  expect((await read(request(`organizationId=org-a&sessionId=session&cursor=${page.nextCursor}`))).status).toBe(200);
  expect(queries[1].cursor).toEqual({ id: 'event-b' });
  expect(queries[1].skip).toBe(1);
});
