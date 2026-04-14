import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  submission: { findFirst: mock(), update: mock() },
};

const getGradingActor = mock();
const canManageGrades = mock();

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/grading-auth.server', () => ({
  getGradingActor,
  canManageGrades,
}));

const { action } = await import('./route');

function makeRequest(body: Record<string, unknown>) {
  return new Request('https://example.com/api/domain/update-submission', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('api.domain.update-submission', () => {
  beforeEach(() => {
    prisma.submission.findFirst.mockReset();
    prisma.submission.update.mockReset();
    getGradingActor.mockReset();
    canManageGrades.mockReset();

    getGradingActor.mockResolvedValue({
      profileId: 'teacher-1',
      isTeacher: true,
      isAdmin: false,
    });
    canManageGrades.mockReturnValue(true);
  });

  test('updates grading fields on a submission', async () => {
    prisma.submission.findFirst.mockResolvedValue({
      id: 'sub-1',
      gradedAt: new Date(),
      gradedById: 'teacher-1',
    });
    prisma.submission.update.mockResolvedValue({
      id: 'sub-1',
      score: '85% B',
      feedback: 'Great work',
    });

    const response = (await action({
      request: makeRequest({
        submissionId: 'sub-1',
        score: '85% B',
        feedback: 'Great work',
      }),
    } as any)) as Response;

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.submission.score).toBe('85% B');
    expect(prisma.submission.update).toHaveBeenCalledTimes(1);
  });

  test('sets gradedAt and gradedById on first grading edit', async () => {
    prisma.submission.findFirst.mockResolvedValue({
      id: 'sub-1',
      gradedAt: null,
      gradedById: null,
    });
    prisma.submission.update.mockResolvedValue({ id: 'sub-1', score: '90% A' });

    await action({
      request: makeRequest({ submissionId: 'sub-1', score: '90% A' }),
    } as any);

    const updateCall = prisma.submission.update.mock.calls[0]?.[0];
    expect(updateCall.data.gradedAt).toBeInstanceOf(Date);
    expect(updateCall.data.gradedById).toBe('teacher-1');
  });

  test('does not overwrite gradedAt on subsequent edits', async () => {
    const existingGradedAt = new Date('2026-01-01');
    prisma.submission.findFirst.mockResolvedValue({
      id: 'sub-1',
      gradedAt: existingGradedAt,
      gradedById: 'teacher-1',
    });
    prisma.submission.update.mockResolvedValue({ id: 'sub-1' });

    await action({
      request: makeRequest({ submissionId: 'sub-1', feedback: 'Updated' }),
    } as any);

    const updateCall = prisma.submission.update.mock.calls[0]?.[0];
    expect(updateCall.data.gradedAt).toBeUndefined();
    expect(updateCall.data.gradedById).toBeUndefined();
  });

  test('rejects non-teachers', async () => {
    canManageGrades.mockReturnValue(false);

    const response = (await action({
      request: makeRequest({ submissionId: 'sub-1', score: '100' }),
    } as any)) as Response;

    expect(response.status).toBe(403);
  });

  test('returns 404 when submission not found', async () => {
    prisma.submission.findFirst.mockResolvedValue(null);

    const response = (await action({
      request: makeRequest({ submissionId: 'nonexistent' }),
    } as any)) as Response;

    expect(response.status).toBe(404);
  });

  test('returns 400 when submissionId missing', async () => {
    const response = (await action({
      request: makeRequest({ score: '100' }),
    } as any)) as Response;

    expect(response.status).toBe(400);
  });
});
