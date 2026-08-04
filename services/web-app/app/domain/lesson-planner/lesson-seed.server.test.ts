import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = { classAssignment: { findFirst: mock() } };
mock.module('~/utils/db.server', () => ({ prisma }));

const { loadLessonSeed } = await import('./lesson-seed.server');

afterAll(() => {
  mock.restore();
});

const summaryJson = {
  overview: 'Soft conclusions.',
  categories: [],
  nextSteps: [
    {
      title: 'Teach conclusions that answer "so what?"',
      detail: 'Model two conclusions side by side.',
      rubricCategory: 'organization_and_structure',
    },
  ],
};

function classAssignmentRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ca-1',
    assignment: { title: 'The Crucible argument essay' },
    class: { title: null, grade: 'English 10', period: '3' },
    insight: { status: 'ready', summaryJson },
    ...overrides,
  };
}

beforeEach(() => {
  prisma.classAssignment.findFirst
    .mockReset()
    .mockResolvedValue(classAssignmentRow());
});

describe('loadLessonSeed', () => {
  test('builds a seed from the stored next step', async () => {
    const seed = await loadLessonSeed({
      membershipId: 'teacher-1',
      classAssignmentId: 'ca-1',
      stepIndex: '0',
    });

    expect(seed?.classAssignmentId).toBe('ca-1');
    expect(seed?.prompt).toContain('Teach conclusions that answer "so what?"');
    expect(seed?.prompt).toContain('The Crucible argument essay');
    // The class row has no explicit title, so the banner falls back to the
    // grade/period label teachers see elsewhere in the app.
    expect(seed?.context).toContain('English 10 · Period 3');
  });

  test('scopes the lookup to the calling teacher', async () => {
    await loadLessonSeed({
      membershipId: 'teacher-1',
      classAssignmentId: 'ca-1',
      stepIndex: '0',
    });

    expect(
      prisma.classAssignment.findFirst.mock.calls[0][0].where
    ).toMatchObject({
      id: 'ca-1',
      class: { teachers: { some: { id: 'teacher-1' } } },
    });
  });

  test('returns null without querying when no origin is in the URL', async () => {
    const seed = await loadLessonSeed({
      membershipId: 'teacher-1',
      classAssignmentId: null,
      stepIndex: null,
    });

    expect(seed).toBeNull();
    expect(prisma.classAssignment.findFirst).not.toHaveBeenCalled();
  });

  test('returns null when the assignment is not the teacher’s', async () => {
    prisma.classAssignment.findFirst.mockResolvedValue(null);
    const seed = await loadLessonSeed({
      membershipId: 'teacher-1',
      classAssignmentId: 'someone-elses',
      stepIndex: '0',
    });
    expect(seed).toBeNull();
  });

  test('returns null when the insight is missing, failed, or unparseable', async () => {
    for (const insight of [
      null,
      { status: 'failed', summaryJson },
      { status: 'ready', summaryJson: null },
      { status: 'ready', summaryJson: { overview: '', nextSteps: [] } },
    ]) {
      prisma.classAssignment.findFirst.mockResolvedValue(
        classAssignmentRow({ insight })
      );
      const seed = await loadLessonSeed({
        membershipId: 'teacher-1',
        classAssignmentId: 'ca-1',
        stepIndex: '0',
      });
      expect(seed).toBeNull();
    }
  });

  test('returns null when the step index points past the end', async () => {
    const seed = await loadLessonSeed({
      membershipId: 'teacher-1',
      classAssignmentId: 'ca-1',
      stepIndex: '7',
    });
    expect(seed).toBeNull();
  });
});
