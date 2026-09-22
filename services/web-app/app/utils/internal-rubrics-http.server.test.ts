import { expect, test } from 'bun:test';
import { createRubricHttp } from './internal-rubrics-http.server';
const key = 'c'.repeat(43);
const schema = { name: 'qa-rubric', title: 'QA rubric', rubric: { categories: [{ key: 'claim', label: 'Claim', description: 'A claim', weight: 1 }] } };
const payload = { requestId: crypto.randomUUID(), actorId: 'operator', reason: 'Publish reviewed draft', expectedFingerprint: null, source: { contentId: crypto.randomUUID(), version: 2, fingerprint: 'a'.repeat(64) }, schema };
const request = (body: unknown, credential = key, path = '/api/internal/v1/rubrics') => new Request(`https://yawp.test${path}`, { method: 'POST', headers: { authorization: `Bearer ${credential}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
test('rubric publication requires its own enabled service credential and exact source metadata', async () => {
  const received: unknown[] = [];
  const service = { inspect: async () => null, publish: async (input: unknown) => { received.push(input); return { id: 'revision' }; } };
  const http = createRubricHttp(service as any, () => key, () => true);
  expect((await http.publish(request(payload, 'ordinary-management-key'))).status).toBe(401);
  expect((await createRubricHttp(service as any, () => key, () => false).publish(request(payload))).status).toBe(404);
  for (const extra of [{ source: undefined }, { source: { ...payload.source, version: 0 } }, { organizationId: 'scoped-org' }, { expectedFingerprint: undefined }, { environment: 'production' }]) {
    expect((await http.publish(request({ ...payload, ...extra }))).status).toBe(400);
  }
  expect(received).toHaveLength(0);
  const response = await http.publish(request(payload));
  expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toBe('no-store');
  expect(received).toEqual([payload]);
});
test('rubric validation reports field errors without publication and bounds streamed payloads', async () => {
  let calls = 0;
  const http = createRubricHttp({ inspect: async () => null, publish: async () => { calls++; return {}; } } as any, () => key, () => true);
  const invalid = { ...schema, rubric: { categories: [] } };
  expect((await (await http.validate(request({ schema: invalid }))).json()).ok).toBe(false);
  expect((await http.publish(request({ ...payload, schema: invalid }))).status).toBe(422);
  expect((await http.publish(request({ ...payload, schema: { ...schema, calibrationNotes: 'x'.repeat(310000) } }))).status).toBe(400);
  expect(calls).toBe(0);
});
test('rubric inspection rejects ambiguous query and suppresses infrastructure details', async () => {
  let calls = 0;
  const http = createRubricHttp({ inspect: async () => { calls++; throw new Error('postgres-password-private'); }, publish: async () => ({}) } as any, () => key, () => true);
  for (const query of ['name=one&name=two', 'name=one&organizationId=other', 'name=']) {
    expect((await http.inspect(new Request(`https://yawp.test/api/internal/v1/rubrics?${query}`, { headers: { authorization: `Bearer ${key}` } }))).status).toBe(400);
  }
  expect(calls).toBe(0);
  const response = await http.inspect(new Request('https://yawp.test/api/internal/v1/rubrics?name=qa-rubric', { headers: { authorization: `Bearer ${key}` } }));
  expect(response.status).toBe(503); expect(await response.text()).not.toContain('private');
});
