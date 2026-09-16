import { beforeEach, expect, mock, test } from 'bun:test';
const prisma = {
  document: { findFirst: mock() },
  pasteAlert: { create: mock(), createMany: mock(), findUnique: mock() },
};
mock.module('~/utils/db.server.js', () => ({ prisma }));
mock.module('~/utils/auth.server.js', () => ({
  requireUserId: async () => 'user',
  requireMembership: async () => ({ id: 'student' }),
}));
const { action } = await import('./route');
const eventId = 'paste_12345678-1234-4321-8123-123456789abc';
const body = {
  documentId: 'doc',
  textLength: 200,
  content: 'x'.repeat(200),
  eventId,
};
const post = (data: any) =>
  action({
    request: new Request('http://localhost/api/paste-alert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  } as any);
const status = (response: any) => response.init?.status ?? 200;
beforeEach(() => {
  for (const obj of Object.values(prisma))
    for (const fn of Object.values(obj)) fn.mockReset();
  prisma.document.findFirst.mockResolvedValue({ id: 'doc' });
  prisma.pasteAlert.findUnique.mockResolvedValue({
    documentId: 'doc',
    membershipId: 'student',
  });
});
test('new event IDs persist idempotently without replacing legacy rows', async () => {
  expect(status(await post(body))).toBe(200);
  expect(prisma.pasteAlert.createMany.mock.calls[0][0]).toMatchObject({
    skipDuplicates: true,
    data: {
      id: eventId,
      documentId: 'doc',
      membershipId: 'student',
      textLength: 200,
    },
  });
});
test('old clients continue writing ordinary alerts without an event ID', async () => {
  const { eventId: _, ...legacy } = body;
  expect(status(await post(legacy))).toBe(200);
  expect(prisma.pasteAlert.create).toHaveBeenCalledTimes(1);
});
test('event identity cannot be rebound to another document or owner', async () => {
  prisma.pasteAlert.findUnique.mockResolvedValue({
    documentId: 'other',
    membershipId: 'someone',
  });
  expect(status(await post(body))).toBe(409);
});
test('rejects invalid event IDs and malformed lengths before database writes', async () => {
  for (const changes of [
    { eventId: '<script>' },
    { textLength: -1 },
    { textLength: 1.5 },
    { content: {} },
    { textLength: 2000000 },
  ])
    expect(status(await post({ ...body, ...changes }))).toBe(400);
  expect(prisma.pasteAlert.createMany).not.toHaveBeenCalled();
});
test('nonowners cannot record events on another student’s document', async () => {
  prisma.document.findFirst.mockResolvedValue(null);
  expect(status(await post(body))).toBe(404);
  expect(prisma.pasteAlert.createMany).not.toHaveBeenCalled();
});

test('legacy method, missing field, optional content and owner-query contracts remain intact', async () => {
  expect(
    status(
      await action({
        request: new Request('http://localhost/api/paste-alert'),
      } as any)
    )
  ).toBe(405);
  expect(status(await post({ documentId: 'doc' }))).toBe(400);
  expect(status(await post({ documentId: 'doc', textLength: 250 }))).toBe(200);
  expect(prisma.document.findFirst.mock.calls[0][0]).toEqual({
    where: { id: 'doc', membershipId: 'student' },
  });
  expect(prisma.pasteAlert.create.mock.calls[0][0]).toEqual({
    data: {
      documentId: 'doc',
      membershipId: 'student',
      textLength: 250,
      content: null,
    },
  });
});
