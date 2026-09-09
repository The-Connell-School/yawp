import { expect, test } from 'bun:test';
import { createQaHttp } from './internal-qa-http.server';
const key = 'k'.repeat(43);
const id = 'abf51c57-a733-4fc2-9c66-0d613d9e2e37';
const payload = { id, actorId: 'operator', organizationId: 'org', reason: 'QA', users: [{ name: 'Teacher', role: 'TEACHER' }] };
const request = (body: unknown, credential = key) => new Request('https://yawp.test/api/internal/v1/qa/accounts', { method: 'POST', headers: { authorization: `Bearer ${credential}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
test('QA boundary rejects unauthenticated, disabled and malformed writes before mutation', async () => {
  let calls = 0;
  const service = { create: async () => { calls++; return {}; }, archive: async () => { calls++; return {}; }, list: async () => ({ fixtures: [], nextCursor: null }) } as any;
  const http = createQaHttp(service, () => key, () => true);
  expect((await http.create(request(payload, 'bad'))).status).toBe(401);
  expect((await createQaHttp(service, () => key, () => false).create(request(payload))).status).toBe(404);
  expect((await http.create(request({ ...payload, users: [{ name: 'Admin', role: 'ADMIN' }] }))).status).toBe(400);
  expect((await http.archive(request({ actorId: 'operator', organizationId: 'org' }), id)).status).toBe(400);
  expect(calls).toBe(0);
  expect((await http.create(request(payload))).status).toBe(200);
  expect((await http.archive(request({ actorId: 'operator', organizationId: 'org', confirmArchive: true }), id)).status).toBe(200);
  expect(calls).toBe(2);
});
