import { expect, test, mock } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { createAssignmentTypesHttp } from './internal-assignment-types-http.server';

const key = 'k'.repeat(43);
const service = {
  list: mock(async () => ({ items: [] })),
  read: mock(async () => null),
  updatePerType: mock(async () => ({ revision: { id: 'r', version: 1, fingerprint: 'f'.repeat(64) }, unchanged: false as const })),
  relinkLibrary: mock(async () => ({ revision: { id: 'r', version: 1, fingerprint: 'f'.repeat(64) }, unchanged: false as const })),
  compareRevisions: mock(async () => ({ a: { id: 'a', version: 1, fingerprint: 'a'.repeat(64) }, b: { id: 'b', version: 2, fingerprint: 'b'.repeat(64) }, ops: [] })),
};
const http = createAssignmentTypesHttp(service as any, () => key, () => true);

test('requires enabled service credential', async () => {
  const badKey = createAssignmentTypesHttp(service as any, () => undefined, () => true);
  const res = await badKey.list(new Request('https://yawp.test/api/internal/v1/assignment-types', { headers: { authorization: `Bearer ${key}` } }));
  expect(res.status).toBe(404);
  const wrong = await http.list(new Request('https://yawp.test/api/internal/v1/assignment-types', { headers: { authorization: `Bearer not-the-key` } }));
  expect(wrong.status).toBe(401);
});

test('lists assignment types', async () => {
  const res = await http.list(new Request('https://yawp.test/api/internal/v1/assignment-types', { headers: { authorization: `Bearer ${key}` } }));
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(Array.isArray(body.items)).toBe(true);
});

test('reads one assignment type', async () => {
  const res = await http.read(new Request('https://yawp.test/api/internal/v1/assignment-types/at_123', { headers: { authorization: `Bearer ${key}` } }));
  expect(res.status).toBe(200);
  expect(service.read.mock.calls.length).toBe(1);
});

test('validates per-type update body', async () => {
  const res = await http.updatePerType(
    new Request('https://yawp.test/api/internal/v1/assignment-types/at_xxx/rubric', {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ bad: 'shape' }),
    })
  );
  expect(res.status).toBe(400);
});

test('validates relink body', async () => {
  const res = await http.relink(
    new Request('https://yawp.test/api/internal/v1/assignment-types/at_xxx/relink', {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ bad: 'shape' }),
    })
  );
  expect(res.status).toBe(400);
});

test('compares two revisions', async () => {
  const res = await http.compare(
    new Request('https://yawp.test/api/internal/v1/assignment-types/compare', {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ a: randomUUID(), b: randomUUID() }),
    })
  );
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(Array.isArray(body.ops)).toBe(true);
});

