import { beforeEach, describe, expect, mock, test } from 'bun:test';

// Deliberately do NOT stub prisma.document or prisma.documentRevision here.
// If the unsubmit action ever touches either model, calling an unstubbed
// method throws a TypeError and the test fails loudly — that's how we prove
// the student's document and its revision history are never written to.
const prisma = {
  $transaction: mock(),
  submission: {
    findFirst: mock(),
    updateMany: mock(),
  },
};

const getGradingActor = mock();
const canManageGrades = mock();
const isGradingOwnDocument = mock();

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/grading-auth.server', () => ({
  getGradingActor,
  canManageGrades,
  isGradingOwnDocument,
}));

const { action } = await import('./route');

function makeRequest(submissionId?: string) {
  const form = new FormData();
  if (submissionId) form.append('submissionId', submissionId);
  return new Request('https://example.com/api/domain/unsubmit-submission', {
    method: 'POST',
    body: form,
  });
}

function eligibleSubmission(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sub-1',
    unsubmittedAt: null,
    document: {
      membershipId: 'student-1',
      classAssignment: {
        class: {
          id: 'class-1',
          teachers: [{ id: 'teacher-1' }],
        },
      },
    },
    ...overrides,
  };
}

describe('api.domain.unsubmit-submission', () => {
  beforeEach(() => {
    prisma.$transaction.mockReset();
    prisma.submission.findFirst.mockReset();
    prisma.submission.updateMany.mockReset();
    getGradingActor.mockReset();
    canManageGrades.mockReset();
    isGradingOwnDocument.mockReset();

    getGradingActor.mockResolvedValue({
      membershipId: 'teacher-1',
      teacherProfileId: 'teacher-1',
      isTeacher: true,
      isAdmin: false,
    });
    canManageGrades.mockReturnValue(true);
    isGradingOwnDocument.mockReturnValue(false);
    prisma.submission.updateMany.mockResolvedValue({ count: 1 });
    prisma.$transaction.mockImplementation(async (callback: any) =>
      callback(prisma)
    );
  });

  test('rejects non-teachers', async () => {
    canManageGrades.mockReturnValue(false);

    const response = (await action({
      request: makeRequest('sub-1'),
    } as any)) as { data: Record<string, unknown>; init?: { status?: number } };

    expect(response.init?.status).toBe(403);
    expect(prisma.submission.findFirst).not.toHaveBeenCalled();
  });

  test('requires a submissionId', async () => {
    const response = (await action({
      request: makeRequest(),
    } as any)) as { data: Record<string, unknown>; init?: { status?: number } };

    expect(response.init?.status).toBe(422);
  });

  test('404s when the submission is not found or the teacher does not own the class', async () => {
    prisma.submission.findFirst.mockResolvedValue(null);

    const response = (await action({
      request: makeRequest('sub-1'),
    } as any)) as { data: Record<string, unknown>; init?: { status?: number } };

    expect(response.init?.status).toBe(404);
    expect(prisma.submission.updateMany).not.toHaveBeenCalled();
  });

  test('scopes the lookup to submissions in a class the teacher teaches, excluding their own documents', async () => {
    prisma.submission.findFirst.mockResolvedValue(eligibleSubmission());

    await action({ request: makeRequest('sub-1') } as any);

    const where = prisma.submission.findFirst.mock.calls[0][0].where;
    expect(where.id).toBe('sub-1');
    expect(where.unsubmittedAt).toBeNull();
    expect(where.document.is.classAssignment.class.teachers.some.id).toBe(
      'teacher-1'
    );
    expect(where.document.is.membershipId.not).toBe('teacher-1');
  });

  test('rejects unsubmitting a submission already marked unsubmitted', async () => {
    prisma.submission.findFirst.mockResolvedValue(null); // where clause excludes unsubmittedAt != null

    const response = (await action({
      request: makeRequest('sub-1'),
    } as any)) as { data: Record<string, unknown>; init?: { status?: number } };

    expect(response.init?.status).toBe(404);
  });

  test('sets unsubmittedAt/unsubmittedByMembershipId and touches nothing else on the submission', async () => {
    prisma.submission.findFirst.mockResolvedValue(eligibleSubmission());

    const response = (await action({
      request: makeRequest('sub-1'),
    } as any)) as { data: Record<string, unknown> };

    expect(prisma.submission.updateMany).toHaveBeenCalledTimes(1);
    const call = prisma.submission.updateMany.mock.calls[0][0];
    expect(call.where).toEqual(
      expect.objectContaining({ id: 'sub-1', unsubmittedAt: null })
    );
    expect(call.data.unsubmittedByMembershipId).toBe('teacher-1');
    expect(call.data.unsubmittedAt).toBeInstanceOf(Date);

    // Grade / AI feedback fields must NOT be part of the update — they stay
    // on the row untouched so the action is reversible.
    expect(call.data).not.toHaveProperty('score');
    expect(call.data).not.toHaveProperty('feedback');
    expect(call.data).not.toHaveProperty('rubricScores');
    expect(call.data).not.toHaveProperty('aiMeta');
    expect(call.data).not.toHaveProperty('gradedAt');
    expect(call.data).not.toHaveProperty('releasedAt');
    expect(call.data).not.toHaveProperty('documentId');
    expect(call.data).not.toHaveProperty('html');
    expect(call.data).not.toHaveProperty('text');

    expect(response.data.success).toBe(true);
  });

  test('never calls prisma.document or prisma.documentRevision', async () => {
    prisma.submission.findFirst.mockResolvedValue(eligibleSubmission());

    await action({ request: makeRequest('sub-1') } as any);

    expect((prisma as any).document).toBeUndefined();
    expect((prisma as any).documentRevision).toBeUndefined();
  });

  test('409s on a concurrent unsubmit (optimistic concurrency)', async () => {
    prisma.submission.findFirst.mockResolvedValue(eligibleSubmission());
    prisma.submission.updateMany.mockResolvedValue({ count: 0 });

    const response = (await action({
      request: makeRequest('sub-1'),
    } as any)) as { data: Record<string, unknown>; init?: { status?: number } };

    expect(response.init?.status).toBe(409);
  });
});
