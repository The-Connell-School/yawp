import { beforeEach, describe, expect, mock, test } from 'bun:test';
import {
  matchesDocumentWhere,
  type ScopedDocument,
} from '~/utils/testing/where-eval';

const prisma = {
  user: { findUnique: mock() },
  documentComment: { findFirst: mock() },
  documentCommentResponse: { create: mock() },
};

const requireUserId = mock();
const requireMembership = mock();

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/auth.server.js', () => ({
  requireUserId,
  requireMembership,
}));

const { action } = await import('./route');

// Student B owns doc-b and comment-b hangs off it. Teacher T teaches a class B is
// enrolled in. Student A is unrelated to both.
const DOC_B: ScopedDocument = {
  id: 'doc-b',
  membershipId: 'profile-b',
  teacherProfileIds: ['profile-teacher'],
};

function responseRequest(commentId: string) {
  const form = new FormData();
  form.append('commentId', commentId);
  form.append('content', 'a reply');
  return new Request(
    'https://example.com/api/model/document-comment-response',
    { method: 'POST', body: form }
  );
}

async function readBody(response: any) {
  return typeof response?.json === 'function' ? response.json() : response?.data;
}

describe('api.model.document-comment-response authorization', () => {
  beforeEach(() => {
    prisma.user.findUnique.mockReset();
    prisma.documentComment.findFirst.mockReset();
    prisma.documentCommentResponse.create.mockReset();
    requireUserId.mockReset();
    requireMembership.mockReset();

    requireUserId.mockResolvedValue('user-b');
    requireMembership.mockResolvedValue({ id: 'profile-b', role: 'STUDENT' });
    prisma.user.findUnique.mockResolvedValue({ isAdmin: false });
    // Stands in for the database: comment-b comes back only when the route's own where
    // clause selects the document it hangs off. A route with no predicate at all hands
    // the row over to anybody, which is what the pre-fix run demonstrates.
    prisma.documentComment.findFirst.mockImplementation(async ({ where }: any) => {
      if (where?.id !== 'comment-b') return null;
      const documentWhere = where?.document?.is ?? where?.document;
      return matchesDocumentWhere(documentWhere, DOC_B)
        ? { id: 'comment-b' }
        : null;
    });
    prisma.documentCommentResponse.create.mockImplementation(
      async ({ data }: any) => ({
        id: 'response-1',
        commentId: data.commentId,
        membershipId: data.membershipId,
        content: data.content,
      })
    );
  });

  test("refuses to reply in another student's comment thread", async () => {
    requireUserId.mockResolvedValue('user-a');
    requireMembership.mockResolvedValue({ id: 'profile-a', role: 'STUDENT' });

    const response = (await action({
      request: responseRequest('comment-b'),
      params: {},
    } as any)) as any;

    expect(response.init?.status).toBe(404);
    expect(prisma.documentCommentResponse.create).not.toHaveBeenCalled();
  });

  test('answers 404 for a comment id that does not exist, rather than a 500', async () => {
    const response = (await action({
      request: responseRequest('comment-missing'),
      params: {},
    } as any)) as any;

    expect(response.init?.status).toBe(404);
    expect(prisma.documentCommentResponse.create).not.toHaveBeenCalled();
  });

  test('lets the student who owns the document reply on their own thread', async () => {
    const response = (await action({
      request: responseRequest('comment-b'),
      params: {},
    } as any)) as any;

    expect(response.init?.status).toBe(201);
    const body = await readBody(response);
    expect(body.commentId).toBe('comment-b');
    expect(body.membershipId).toBe('profile-b');
    expect(prisma.documentCommentResponse.create).toHaveBeenCalledTimes(1);
  });

  test('lets a teacher of the class reply on the student thread', async () => {
    requireUserId.mockResolvedValue('user-teacher');
    requireMembership.mockResolvedValue({
      id: 'profile-teacher',
      role: 'TEACHER',
    });

    const response = (await action({
      request: responseRequest('comment-b'),
      params: {},
    } as any)) as any;

    expect(response.init?.status).toBe(201);
    const body = await readBody(response);
    expect(body.membershipId).toBe('profile-teacher');
  });
});
