import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  document: { findFirst: mock() },
  pasteAlert: { create: mock() },
};

const requireUserId = mock();
const requireMembership = mock();

mock.module('~/utils/db.server.js', () => ({ prisma }));
mock.module('~/utils/auth.server.js', () => ({
  requireUserId,
  requireMembership,
}));

const { action } = await import('./route');

function jsonRequest(body: unknown) {
  return new Request('https://example.test/api/paste-alert', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

describe('api.paste-alert action', () => {
  beforeEach(() => {
    prisma.document.findFirst.mockReset();
    prisma.pasteAlert.create.mockReset();
    requireUserId.mockReset();
    requireMembership.mockReset();

    requireUserId.mockResolvedValue('user-1');
    requireMembership.mockResolvedValue({ id: 'membership-1' });
    prisma.document.findFirst.mockResolvedValue({ id: 'doc-1' });
    prisma.pasteAlert.create.mockResolvedValue({ id: 'alert-1' });
  });

  test('creates a paste alert for a valid request', async () => {
    const response = await action({
      request: jsonRequest({
        documentId: 'doc-1',
        textLength: 250,
        content: 'pasted text',
      }),
      params: {},
      context: {},
    } as any);

    expect(response.init?.status ?? 200).toBe(200);
    expect(prisma.pasteAlert.create).toHaveBeenCalledWith({
      data: {
        documentId: 'doc-1',
        membershipId: 'membership-1',
        textLength: 250,
        content: 'pasted text',
      },
    });
  });

  test('rejects malformed JSON bodies', async () => {
    const response = await action({
      request: jsonRequest('not-json'),
      params: {},
      context: {},
    } as any);

    expect(response.init?.status).toBe(400);
    expect(prisma.pasteAlert.create).not.toHaveBeenCalled();
  });

  test('rejects negative text lengths', async () => {
    const response = await action({
      request: jsonRequest({ documentId: 'doc-1', textLength: -5 }),
      params: {},
      context: {},
    } as any);

    expect(response.init?.status).toBe(400);
    expect(prisma.pasteAlert.create).not.toHaveBeenCalled();
  });

  test('rejects fractional text lengths', async () => {
    const response = await action({
      request: jsonRequest({ documentId: 'doc-1', textLength: 200.5 }),
      params: {},
      context: {},
    } as any);

    expect(response.init?.status).toBe(400);
    expect(prisma.pasteAlert.create).not.toHaveBeenCalled();
  });

  test('rejects non-string content', async () => {
    const response = await action({
      request: jsonRequest({
        documentId: 'doc-1',
        textLength: 250,
        content: { evil: true },
      }),
      params: {},
      context: {},
    } as any);

    expect(response.init?.status).toBe(400);
    expect(prisma.pasteAlert.create).not.toHaveBeenCalled();
  });

  test('rejects when document is not owned by the membership', async () => {
    prisma.document.findFirst.mockResolvedValue(null);

    const response = await action({
      request: jsonRequest({ documentId: 'doc-1', textLength: 250 }),
      params: {},
      context: {},
    } as any);

    expect(response.init?.status).toBe(404);
    expect(prisma.pasteAlert.create).not.toHaveBeenCalled();
  });
});
