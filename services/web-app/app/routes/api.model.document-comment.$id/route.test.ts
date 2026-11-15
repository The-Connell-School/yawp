import { beforeEach, describe, expect, mock, test } from 'bun:test';
import {
  matchesDocumentWhere,
  type ScopedDocument,
} from '~/utils/testing/where-eval';

const prisma = {
  user: { findUnique: mock() },
  documentComment: {
    findFirst: mock(),
    update: mock(),
    delete: mock(),
  },
};

const requireUserId = mock();
const requireMembership = mock();

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/auth.server.js', () => ({
  requireUserId,
  requireMembership,
}));

const { action } = await import('./route');

const DOC: ScopedDocument = {
  id: 'doc-b',
  membershipId: 'profile-b',
  teacherProfileIds: ['profile-teacher'],
};

function patchRequest(intent: 'resolve' | 'reopen') {
  const form = new FormData();
  form.append('intent', intent);
  return new Request(
    'https://example.com/api/model/document-comment/comment-1',
    { method: 'PATCH', body: form }
  );
}

describe('api.model.document-comment.$id resolve/reopen', () => {
  beforeEach(() => {
    prisma.user.findUnique.mockReset();
    prisma.documentComment.findFirst.mockReset();
    prisma.documentComment.update.mockReset();
    requireUserId.mockReset();
    requireMembership.mockReset();

    requireUserId.mockResolvedValue('user-teacher');
    requireMembership.mockResolvedValue({
      id: 'profile-teacher',
      role: 'TEACHER',
    });
    prisma.user.findUnique.mockResolvedValue({ isAdmin: false });
    prisma.documentComment.findFirst.mockImplementation(async ({ where }: any) => {
      if (where.id !== 'comment-1') return null;
      return {
        id: 'comment-1',
        documentId: 'doc-b',
        membershipId: 'profile-b',
        archivedAt: where.archivedAt === null ? null : new Date(),
        document: { id: 'doc-b', membershipId: 'profile-b' },
      };
    });
    prisma.documentComment.update.mockImplementation(async ({ data }: any) => ({
      id: 'comment-1',
      archivedAt: data.archivedAt ?? null,
    }));
  });

  test('lets a teacher resolve a comment on student work', async () => {
    prisma.documentComment.findFirst.mockImplementation(async ({ where }: any) => {
      const docWhere = where.document;
      if (!matchesDocumentWhere(docWhere, DOC)) return null;
      return {
        id: 'comment-1',
        documentId: DOC.id,
        membershipId: 'profile-b',
        archivedAt: null,
        document: { id: DOC.id, membershipId: DOC.membershipId },
      };
    });

    const response = (await action({
      request: patchRequest('resolve'),
      params: { id: 'comment-1' },
    } as any)) as any;

    expect(response.init?.status).toBe(200);
    expect(prisma.documentComment.update).toHaveBeenCalled();
    const archivedAt =
      prisma.documentComment.update.mock.calls[0][0].data.archivedAt;
    expect(archivedAt).toBeInstanceOf(Date);
  });
});