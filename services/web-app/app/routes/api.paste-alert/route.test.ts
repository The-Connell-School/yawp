import { beforeEach, describe, expect, mock, test } from 'bun:test';
import {
  matchesDocumentWhere,
  type ScopedDocument,
} from '~/utils/testing/where-eval';

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

const OWNED_BY_CALLER: ScopedDocument = {
  id: 'doc-1',
  membershipId: 'membership-1',
  teacherProfileIds: ['teacher-1'],
  classAssignmentId: 'class-assignment-1',
  collaboratorMembershipIds: [],
  enrolledStudentIds: ['membership-1'],
};

const SHARED_WITH_CALLER: ScopedDocument = {
  ...OWNED_BY_CALLER,
  membershipId: 'owner-2',
  collaboratorMembershipIds: ['membership-1'],
  enrolledStudentIds: ['owner-2', 'membership-1'],
};

const SOMEONE_ELSES: ScopedDocument = {
  ...OWNED_BY_CALLER,
  membershipId: 'owner-2',
  collaboratorMembershipIds: [],
  enrolledStudentIds: ['owner-2', 'membership-1'],
};

/** Invite withdrawn: revokedAt is set, so the row is absent from the live list. */
const REVOKED: ScopedDocument = { ...SOMEONE_ELSES };

/** Live collaborator row, but the caller is no longer on the class roster. */
const UNENROLLED: ScopedDocument = {
  ...SHARED_WITH_CALLER,
  enrolledStudentIds: ['owner-2'],
};

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
    } as any);
    expect(response.init?.status).toBe(405);
  });

  test('rejects a request missing documentId or textLength', async () => {
    const response = await action({
      request: pasteAlertRequest({ documentId: 'doc-1' }),
    } as any);
    expect(response.init?.status).toBe(400);
    expect(prisma.pasteAlert.create).not.toHaveBeenCalled();
  });

  test('404s when the document is not owned by the requesting membership', async () => {
    prisma.document.findFirst.mockResolvedValue(null);

    const response = await action({
      request: pasteAlertRequest({ documentId: 'doc-1', textLength: 250 }),
    } as any);

    expect(response.init?.status).toBe(404);
    expect(prisma.pasteAlert.create).not.toHaveBeenCalled();
  });

  test('scopes the document lookup to the caller, owner or collaborator', async () => {
    await action({
      request: pasteAlertRequest({ documentId: 'doc-1', textLength: 250 }),
    } as any);

    const where = prisma.document.findFirst.mock.calls[0][0].where;
    expect(where.id).toBe('doc-1');

    // The caller owns it.
    expect(matchesDocumentWhere(where, OWNED_BY_CALLER)).toBe(true);
    // The caller is a live collaborator, still enrolled. This arm is why the gate
    // widened at all: it was owner-only, and the client ignores the response
    // (`.catch(() => {})`), so a collaborator's pastes were dropped in silence and
    // the plagiarism detector went dark for exactly the group case.
    expect(matchesDocumentWhere(where, SHARED_WITH_CALLER)).toBe(true);
    // ...but not a stranger's document,
    expect(matchesDocumentWhere(where, SOMEONE_ELSES)).toBe(false);
    // ...not one whose invite was revoked,
    expect(matchesDocumentWhere(where, REVOKED)).toBe(false);
    // ...and not one the caller collaborates on after leaving the class.
    expect(matchesDocumentWhere(where, UNENROLLED)).toBe(false);
  });

  test('creates a PasteAlert with the submitted content and text length', async () => {
    const response = await action({
      request: pasteAlertRequest({
        documentId: 'doc-1',
        textLength: 250,
        content: 'pasted content',
      }),
    } as any);

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
    } as any);

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
