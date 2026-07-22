import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  document: {
    findFirst: mock(),
    updateMany: mock(),
  },
};
const requireMutableRequest = mock();
const requireUserId = mock();
const requireMembership = mock();

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/auth.server', () => ({
  requireMutableRequest,
  requireUserId,
  requireMembership,
}));

const { action } = await import('./route');

const timedSnapshot = {
  schemaVersion: 2,
  origin: 'library',
  libraryEntryId: 'apush-dbq-new-deal',
  course: 'apush',
  essayType: 'dbq',
  prompt: 'Evaluate the extent of change.',
  period: 'Period 7',
  periodNumber: 7,
  reasoningSkill: 'causation',
  rubric: { rubricId: 'ap-history-dbq-2026', totalPoints: 7 },
  timing: { mode: 'timed', durationMinutes: 60 },
  sources: [
    {
      externalKey: 'doc-1',
      position: 1,
      title: 'Document 1',
      attribution: 'National Archives',
      body: 'Source text.',
      mediaType: 'text',
      provenanceUrl: 'https://www.archives.gov/example',
      licenseName: 'Public Domain',
      licenseUrl: 'https://creativecommons.org/public-domain/mark/1.0/',
    },
  ],
};

function requestFor(documentId = 'doc-1') {
  const form = new FormData();
  form.set('documentId', documentId);
  return new Request('https://example.test/api/ap-history/timer', {
    method: 'POST',
    body: form,
  });
}

async function bodyOf(response: any) {
  return typeof response.json === 'function' ? response.json() : response.data;
}

function statusOf(response: any) {
  return response.status ?? response.init?.status;
}

describe('api.ap-history.timer', () => {
  beforeEach(() => {
    for (const fn of [
      prisma.document.findFirst,
      prisma.document.updateMany,
      requireMutableRequest,
      requireUserId,
      requireMembership,
    ]) {
      fn.mockReset();
    }
    requireMutableRequest.mockResolvedValue(undefined);
    requireUserId.mockResolvedValue('user-1');
    requireMembership.mockResolvedValue({
      id: 'student-1',
      role: 'STUDENT',
      organization: { id: 'org-1' },
    });
    prisma.document.findFirst
      .mockResolvedValueOnce({
        id: 'doc-1',
        apHistoryTimerStartedAt: null,
        assignment: { apHistorySnapshot: timedSnapshot },
      })
      .mockResolvedValueOnce({
        id: 'doc-1',
        apHistoryTimerStartedAt: new Date('2026-07-22T16:00:00.000Z'),
      });
    prisma.document.updateMany.mockResolvedValue({ count: 1 });
  });

  test('starts a timed AP History document once and returns the stored time', async () => {
    const response = await action({ request: requestFor(), params: {} } as any);
    expect((await bodyOf(response)).timerStartedAt).toBe(
      '2026-07-22T16:00:00.000Z',
    );
    expect(prisma.document.findFirst).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: {
          id: 'doc-1',
          membershipId: 'student-1',
          deletedAt: null,
        },
      }),
    );
    expect(prisma.document.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'doc-1',
        membershipId: 'student-1',
        apHistoryTimerStartedAt: null,
      },
      data: { apHistoryTimerStartedAt: expect.any(Date) },
    });
  });

  test('is idempotent after the timer has started', async () => {
    const startedAt = new Date('2026-07-22T15:30:00.000Z');
    prisma.document.findFirst.mockReset();
    prisma.document.findFirst.mockResolvedValue({
      id: 'doc-1',
      apHistoryTimerStartedAt: startedAt,
      assignment: { apHistorySnapshot: timedSnapshot },
    });

    const response = await action({ request: requestFor(), params: {} } as any);
    expect((await bodyOf(response)).timerStartedAt).toBe(startedAt.toISOString());
    expect(prisma.document.updateMany).not.toHaveBeenCalled();
  });

  test('fails closed for another student document', async () => {
    prisma.document.findFirst.mockReset();
    prisma.document.findFirst.mockResolvedValue(null);

    const response = await action({ request: requestFor('cross-student'), params: {} } as any);
    expect(statusOf(response)).toBe(404);
    expect(prisma.document.updateMany).not.toHaveBeenCalled();
  });

  test('rejects untimed assignments without mutating the document', async () => {
    prisma.document.findFirst.mockReset();
    prisma.document.findFirst.mockResolvedValue({
      id: 'doc-1',
      apHistoryTimerStartedAt: null,
      assignment: {
        apHistorySnapshot: {
          ...timedSnapshot,
          timing: { mode: 'untimed', durationMinutes: 60 },
        },
      },
    });

    const response = await action({ request: requestFor(), params: {} } as any);
    expect(statusOf(response)).toBe(400);
    expect(prisma.document.updateMany).not.toHaveBeenCalled();
  });

  test('rejects non-students', async () => {
    requireMembership.mockResolvedValue({
      id: 'teacher-1',
      role: 'TEACHER',
      organization: { id: 'org-1' },
    });

    const response = await action({ request: requestFor(), params: {} } as any);
    expect(statusOf(response)).toBe(403);
    expect(prisma.document.findFirst).not.toHaveBeenCalled();
  });
});
