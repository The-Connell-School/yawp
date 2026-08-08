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

function pasteAlertRequest(body: unknown, method = 'POST') {
  return new Request('https://example.com/api/paste-alert', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: method === 'POST' ? JSON.stringify(body) : undefined,
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

  test('rejects non-POST methods', async () => {
    const response = await action({
      request: pasteAlertRequest(null, 'GET'),
      params: {},
      context: {} as never,
    });
    expect(response.init?.status).toBe(405);
  });

  test('rejects a request missing documentId or textLength', async () => {
    const response = await action({
      request: pasteAlertRequest({ documentId: 'doc-1' }),
      params: {},
      context: {} as never,
    });
    expect(response.init?.status).toBe(400);
    expect(prisma.pasteAlert.create).not.toHaveBeenCalled();
  });

  test('404s when the document is not owned by the requesting membership', async () => {
    prisma.document.findFirst.mockResolvedValue(null);

    const response = await action({
      request: pasteAlertRequest({ documentId: 'doc-1', textLength: 250 }),
      params: {},
      context: {} as never,
    });

    expect(response.init?.status).toBe(404);
    expect(prisma.pasteAlert.create).not.toHaveBeenCalled();
  });

  test('scopes the document lookup to the requesting membership', async () => {
    await action({
      request: pasteAlertRequest({ documentId: 'doc-1', textLength: 250 }),
      params: {},
      context: {} as never,
    });

    expect(prisma.document.findFirst).toHaveBeenCalledWith({
      where: { id: 'doc-1', membershipId: 'membership-1' },
    });
  });

  test('creates a PasteAlert with the submitted content and text length', async () => {
    const response = await action({
      request: pasteAlertRequest({
        documentId: 'doc-1',
        textLength: 250,
        content: 'pasted content',
      }),
      params: {},
      context: {} as never,
    });

    expect(response.data).toEqual({ success: true });
    expect(prisma.pasteAlert.create).toHaveBeenCalledWith({
      data: {
        documentId: 'doc-1',
        membershipId: 'membership-1',
        textLength: 250,
        content: 'pasted content',
      },
    });
  });

  test('stores null content when none is submitted', async () => {
    await action({
      request: pasteAlertRequest({ documentId: 'doc-1', textLength: 250 }),
      params: {},
      context: {} as never,
    });

    expect(prisma.pasteAlert.create).toHaveBeenCalledWith({
      data: {
        documentId: 'doc-1',
        membershipId: 'membership-1',
        textLength: 250,
        content: null,
      },
    });
  });
});
