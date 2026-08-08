import { beforeEach, describe, expect, mock, test } from 'bun:test';
import {
  matchesSubmissionWhere,
  type ScopedDocument,
  type ScopedSubmission,
} from '~/utils/testing/where-eval';

// Deliberately do NOT stub prisma.document or prisma.documentRevision here.
// If the unsubmit action ever touches either model, calling an unstubbed
// method throws a TypeError and the test fails loudly — that's how we prove
// the student's document and its full revision history are never written to.
const prisma = {
  $transaction: mock(),
  submission: {
    findFirst: mock(),
    updateMany: mock(),
  },
};

const getGradingActor = mock();

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/grading-auth.server', () => ({ getGradingActor }));

const { action } = await import('./route');

function makeRequest(submissionId?: string) {
  const form = new FormData();
  if (submissionId) form.append('submissionId', submissionId);
  return new Request('https://example.com/api/domain/unsubmit-submission', {
    method: 'POST',
    body: form,
  });
}

function studentActor(overrides: Record<string, unknown> = {}) {
  return {
    membershipId: 'student-1',
    organizationId: 'org-1',
    teacherProfileId: null,
    isTeacher: false,
    isAdmin: false,
    ...overrides,
  };
}

function ownedSubmission(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sub-1',
    gradedAt: null,
    releasedAt: null,
    document: { membershipId: 'student-1' },
    ...overrides,
  };
}

const MY_DOC: ScopedDocument = {
  id: 'doc-1',
  membershipId: 'student-1',
  teacherProfileIds: ['teacher-1'],
  classAssignmentId: 'class-assignment-1',
  collaboratorMembershipIds: ['student-2'],
  enrolledStudentIds: ['student-1', 'student-2'],
};

/** Submitted by me, on my document. */
const MY_SUBMISSION: ScopedSubmission = {
  id: 'sub-1',
  submittedByMembershipId: 'student-1',
  unsubmittedAt: null,
  document: MY_DOC,
};

/** Written before the column existed: NULL means the document's owner, which is me. */
const MY_LEGACY_SUBMISSION: ScopedSubmission = {
  id: 'sub-1',
  submittedByMembershipId: null,
  unsubmittedAt: null,
  document: MY_DOC,
};

/** Someone else's document entirely. */
const ANOTHER_STUDENTS_SUBMISSION: ScopedSubmission = {
  id: 'sub-2',
  submittedByMembershipId: 'student-9',
  unsubmittedAt: null,
  document: {
    ...MY_DOC,
    id: 'doc-9',
    membershipId: 'student-9',
    collaboratorMembershipIds: [],
    enrolledStudentIds: ['student-9'],
  },
};

/** My teammate's submission, made on the document I own. */
const TEAMMATE_SUBMISSION_ON_MY_DOC: ScopedSubmission = {
  id: 'sub-2',
  submittedByMembershipId: 'student-2',
  unsubmittedAt: null,
  document: MY_DOC,
};

type ActionResponse = {
  data: { success?: boolean; message?: string };
  init?: { status?: number };
};

describe('api.domain.unsubmit-submission', () => {
  beforeEach(() => {
    prisma.$transaction.mockReset();
    prisma.submission.findFirst.mockReset();
    prisma.submission.updateMany.mockReset();
    getGradingActor.mockReset();

    getGradingActor.mockResolvedValue(studentActor());
    prisma.submission.updateMany.mockResolvedValue({ count: 1 });
    prisma.$transaction.mockImplementation(async (callback: any) =>
      callback(prisma)
    );
  });

  test('allows a student to unsubmit their own ungraded, unreleased submission', async () => {
    prisma.submission.findFirst.mockResolvedValue(ownedSubmission());

    const response = (await action({
      request: makeRequest('sub-1'),
    } as any)) as ActionResponse;

    expect(response.data.success).toBe(true);
    expect(prisma.submission.findFirst).toHaveBeenCalledTimes(1);
    const lookup = prisma.submission.findFirst.mock.calls[0][0];
    // Run the route's own clause against fixture rows rather than asserting its
    // shape. A shape assertion passes just as happily against a predicate keyed on
    // document.membershipId, which is precisely the version that lets one group
    // member withdraw a teammate's submission.
    expect(matchesSubmissionWhere(lookup.where, MY_SUBMISSION)).toBe(true);
    expect(matchesSubmissionWhere(lookup.where, MY_LEGACY_SUBMISSION)).toBe(true);
  });

  test('refuses a teacher even for a submission in their own class', async () => {
    getGradingActor.mockResolvedValue(
      studentActor({
        membershipId: 'teacher-1',
        teacherProfileId: 'teacher-1',
        isTeacher: true,
      })
    );

    const response = (await action({
      request: makeRequest('sub-1'),
    } as any)) as ActionResponse;

    expect(response.init?.status).toBe(403);
    expect(response.data.message).toBe(
      'Only students can unsubmit their own work.'
    );
    expect(prisma.submission.findFirst).not.toHaveBeenCalled();
  });

  test('refuses an admin', async () => {
    getGradingActor.mockResolvedValue(
      studentActor({ membershipId: 'admin-1', isAdmin: true })
    );

    const response = (await action({
      request: makeRequest('sub-1'),
    } as any)) as ActionResponse;

    expect(response.init?.status).toBe(403);
    expect(response.data.message).toBe(
      'Only students can unsubmit their own work.'
    );
    expect(prisma.submission.findFirst).not.toHaveBeenCalled();
  });

  test("404s when a student tries to unsubmit another student's submission", async () => {
    prisma.submission.findFirst.mockResolvedValue(null);

    const response = (await action({
      request: makeRequest('sub-2'),
    } as any)) as ActionResponse;

    expect(response.init?.status).toBe(404);
    expect(response.data.message).toBe(
      'Submission not found, already unsubmitted, or you do not have permission to unsubmit it.'
    );
    const where = prisma.submission.findFirst.mock.calls[0][0].where;
    expect(matchesSubmissionWhere(where, ANOTHER_STUDENTS_SUBMISSION)).toBe(
      false
    );
    // The one a collaborator would reach for: a submission a TEAMMATE made on a
    // document this student owns. Owning the document is not owning the submission.
    expect(matchesSubmissionWhere(where, TEAMMATE_SUBMISSION_ON_MY_DOC)).toBe(
      false
    );
    expect(prisma.submission.updateMany).not.toHaveBeenCalled();
  });

  test('requires a submissionId', async () => {
    const response = (await action({
      request: makeRequest(),
    } as any)) as ActionResponse;

    expect(response.init?.status).toBe(422);
  });

  test('404s when the submission is already unsubmitted', async () => {
    prisma.submission.findFirst.mockResolvedValue(null);

    const response = (await action({
      request: makeRequest('sub-1'),
    } as any)) as ActionResponse;

    expect(response.init?.status).toBe(404);
    expect(prisma.submission.updateMany).not.toHaveBeenCalled();
  });

  test('refuses an owned graded submission server-side with a clear lifecycle message', async () => {
    prisma.submission.findFirst.mockResolvedValue(
      ownedSubmission({ gradedAt: new Date('2026-08-08T12:00:00Z') })
    );

    const response = (await action({
      request: makeRequest('sub-1'),
    } as any)) as ActionResponse;

    expect(response.init?.status).toBe(409);
    expect(response.data.message).toBe(
      'This submission can no longer be unsubmitted because it has been graded.'
    );
    expect(prisma.submission.updateMany).not.toHaveBeenCalled();
  });

  test('defensively refuses an owned released submission even if gradedAt is unexpectedly null', async () => {
    prisma.submission.findFirst.mockResolvedValue(
      ownedSubmission({ releasedAt: new Date('2026-08-08T12:00:00Z') })
    );

    const response = (await action({
      request: makeRequest('sub-1'),
    } as any)) as ActionResponse;

    expect(response.init?.status).toBe(409);
    expect(response.data.message).toBe(
      'This submission can no longer be unsubmitted because it has been graded.'
    );
    expect(prisma.submission.updateMany).not.toHaveBeenCalled();
  });

  test('writes only unsubmittedAt and unsubmittedByMembershipId', async () => {
    prisma.submission.findFirst.mockResolvedValue(ownedSubmission());

    const response = (await action({
      request: makeRequest('sub-1'),
    } as any)) as ActionResponse;

    expect(prisma.submission.updateMany).toHaveBeenCalledTimes(1);
    const call = prisma.submission.updateMany.mock.calls[0][0];
    expect(call.where).toEqual({
      id: 'sub-1',
      unsubmittedAt: null,
      gradedAt: null,
      releasedAt: null,
    });
    expect(call.data).toEqual({
      unsubmittedAt: expect.any(Date),
      unsubmittedByMembershipId: 'student-1',
    });
    expect(response.data.success).toBe(true);
  });

  test('preserves the document and its full DocumentRevision history', async () => {
    prisma.submission.findFirst.mockResolvedValue(ownedSubmission());

    await action({ request: makeRequest('sub-1') } as any);

    expect((prisma as any).document).toBeUndefined();
    expect((prisma as any).documentRevision).toBeUndefined();
  });

  test('409s on a concurrent unsubmit or grade change', async () => {
    prisma.submission.findFirst.mockResolvedValue(ownedSubmission());
    prisma.submission.updateMany.mockResolvedValue({ count: 0 });

    const response = (await action({
      request: makeRequest('sub-1'),
    } as any)) as ActionResponse;

    expect(response.init?.status).toBe(409);
    expect(response.data.message).toBe(
      'This submission was already changed. Please refresh and try again.'
    );
  });
});
