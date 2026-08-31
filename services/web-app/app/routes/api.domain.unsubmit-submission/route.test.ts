import { beforeEach, describe, expect, mock, test } from 'bun:test';

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
  submissionActivity: { create: mock() },
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
    document: {
      membershipId: 'student-1',
      membership: { organizationId: 'org-1' },
    },
    ...overrides,
  };
}

type ActionResponse = {
  data: { success?: boolean; message?: string };
  init?: { status?: number };
};

describe('api.domain.unsubmit-submission', () => {
  beforeEach(() => {
    prisma.$transaction.mockReset();
    prisma.submission.findFirst.mockReset();
    prisma.submission.updateMany.mockReset();
    prisma.submissionActivity.create.mockReset();
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
    expect(prisma.submissionActivity.create).toHaveBeenCalledTimes(1);
    expect(prisma.submissionActivity.create.mock.calls[0][0].data).toEqual(
      expect.objectContaining({
        submissionId: 'sub-1',
        organizationId: 'org-1',
        actorMembershipId: 'student-1',
        eventType: 'submission.unsubmitted',
        occurredAfterRelease: false,
      })
    );
    expect(prisma.submission.findFirst).toHaveBeenCalledTimes(1);
    const lookup = prisma.submission.findFirst.mock.calls[0][0];
    expect(lookup.where).toEqual({
      id: 'sub-1',
      unsubmittedAt: null,
      document: {
        is: {
          OR: [
            { membershipId: 'student-1' },
            {
              group: {
                is: {
                  members: {
                    some: { membershipId: 'student-1', removedAt: null },
                  },
                },
              },
            },
          ],
        },
      },
    });
  });

  test('allows an active group member to unsubmit the shared submission', async () => {
    prisma.submission.findFirst.mockResolvedValue(
      ownedSubmission({
        document: {
          membershipId: null,
          membership: null,
          classAssignment: {
            class: { school: { organizationId: 'org-1' } },
          },
        },
      })
    );

    const response = (await action({
      request: makeRequest('sub-1'),
    } as any)) as ActionResponse;

    expect(response.data.success).toBe(true);
    expect(
      prisma.submission.findFirst.mock.calls[0][0].where.document.is.OR[1]
    ).toEqual({
      group: {
        is: {
          members: {
            some: { membershipId: 'student-1', removedAt: null },
          },
        },
      },
    });
    expect(
      prisma.submissionActivity.create.mock.calls[0][0].data.organizationId
    ).toBe('org-1');
  });

  test('fails closed when the required unsubmit audit write is unavailable', async () => {
    const previous = process.env.SUBMISSION_ACTIVITY_WRITES_ENABLED;
    process.env.SUBMISSION_ACTIVITY_WRITES_ENABLED = 'false';
    prisma.submission.findFirst.mockResolvedValue(ownedSubmission());

    try {
      await expect(
        action({ request: makeRequest('sub-1') } as any)
      ).rejects.toThrow(
        'Submission activity recording is temporarily unavailable'
      );
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.submissionActivity.create).not.toHaveBeenCalled();
    } finally {
      if (previous === undefined) {
        delete process.env.SUBMISSION_ACTIVITY_WRITES_ENABLED;
      } else {
        process.env.SUBMISSION_ACTIVITY_WRITES_ENABLED = previous;
      }
    }
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
    expect(prisma.submission.findFirst.mock.calls[0][0].where.document).toEqual(
      {
        is: {
          OR: [
            { membershipId: 'student-1' },
            {
              group: {
                is: {
                  members: {
                    some: { membershipId: 'student-1', removedAt: null },
                  },
                },
              },
            },
          ],
        },
      }
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
      document: {
        is: {
          OR: [
            { membershipId: 'student-1' },
            {
              group: {
                is: {
                  members: {
                    some: { membershipId: 'student-1', removedAt: null },
                  },
                },
              },
            },
          ],
        },
      },
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
    expect(prisma.submissionActivity.create).not.toHaveBeenCalled();
  });
});
