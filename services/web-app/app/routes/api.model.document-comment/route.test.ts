import { beforeEach, describe, expect, mock, test } from 'bun:test';
import {
  matchesDocumentWhere,
  type ScopedDocument,
} from '~/utils/testing/where-eval';

const prisma = {
  user: { findUnique: mock() },
  document: { findFirst: mock() },
  documentComment: { create: mock() },
};

const requireUserId = mock();
const requireMembership = mock();

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/auth.server.js', () => ({
  requireUserId,
  requireMembership,
}));

const { action } = await import('./route');

// Student B owns doc-b. Teacher T teaches a class B is enrolled in. Student A is
// unrelated.
const DOC_B: ScopedDocument = {
  id: 'doc-b',
  membershipId: 'profile-b',
  teacherProfileIds: ['profile-teacher'],
  // Unshared, but it IS a class-assignment document, so the collaborator arm's
  // enrollment condition is satisfiable. With no collaborator rows the arm still
  // cannot match -- which is the point: it proves the arm does not leak sideways.
  classAssignmentId: 'class-assignment-1',
  collaboratorMembershipIds: [],
  enrolledStudentIds: ['profile-b'],
};

function commentRequest(documentId: string) {
  const form = new FormData();
  form.append('id', 'comment-1');
  form.append('documentId', documentId);
  form.append('content', 'selected text');
  return new Request('https://example.com/api/model/document-comment', {
    method: 'POST',
    body: form,
  });
}

async function readBody(response: any) {
  return typeof response?.json === 'function' ? response.json() : response?.data;
}

describe('api.model.document-comment authorization', () => {
  beforeEach(() => {
    prisma.user.findUnique.mockReset();
    prisma.document.findFirst.mockReset();
    prisma.documentComment.create.mockReset();
    requireUserId.mockReset();
    requireMembership.mockReset();

    requireUserId.mockResolvedValue('user-b');
    requireMembership.mockResolvedValue({ id: 'profile-b', role: 'STUDENT' });
    prisma.user.findUnique.mockResolvedValue({ isAdmin: false });
    // Stands in for the database: the row comes back only when the query's own where
    // clause selects it.
    prisma.document.findFirst.mockImplementation(async ({ where }: any) =>
      matchesDocumentWhere(where, DOC_B) ? { id: DOC_B.id } : null
    );
    prisma.documentComment.create.mockImplementation(async ({ data }: any) => ({
      id: data.id,
      documentId: data.documentId,
      membershipId: data.membershipId,
      content: data.content,
    }));
  });

  test("refuses to comment on another student's document", async () => {
    requireUserId.mockResolvedValue('user-a');
    requireMembership.mockResolvedValue({ id: 'profile-a', role: 'STUDENT' });

    const response = (await action({
      request: commentRequest('doc-b'),
      params: {},
    } as any)) as any;

    expect(response.init?.status).toBe(404);
    expect(prisma.documentComment.create).not.toHaveBeenCalled();
  });

  test('lets the student who owns the document comment on it', async () => {
    const response = (await action({
      request: commentRequest('doc-b'),
      params: {},
    } as any)) as any;

    expect(response.init?.status).toBe(201);
    const body = await readBody(response);
    expect(body.documentId).toBe('doc-b');
    expect(prisma.documentComment.create).toHaveBeenCalledTimes(1);
  });

  test('lets a teacher of the class comment on the student work', async () => {
    requireUserId.mockResolvedValue('user-teacher');
    requireMembership.mockResolvedValue({
      id: 'profile-teacher',
      role: 'TEACHER',
    });

    const response = (await action({
      request: commentRequest('doc-b'),
      params: {},
    } as any)) as any;

    expect(response.init?.status).toBe(201);
    const body = await readBody(response);
    expect(body.membershipId).toBe('profile-teacher');
  });

  test('reports a duplicate client-supplied comment id as a conflict, not a 500', async () => {
    // The editor mints the comment id so the ProseMirror mark and the row agree, so the
    // id has to stay caller-supplied -- but a replayed one must not surface as an
    // unhandled unique-constraint violation.
    prisma.documentComment.create.mockImplementation(async () => {
      throw Object.assign(new Error('Unique constraint failed'), {
        code: 'P2002',
      });
    });

    const response = (await action({
      request: commentRequest('doc-b'),
      params: {},
    } as any)) as any;

    expect(response.init?.status).toBe(409);
  });
});
