/**
 * Writing Practice is paused for the pre-school-start release.
 *
 * The feature code stays on the branch but ships dark behind
 * `Organization.writingPracticeEnabled`, which defaults to false. This file
 * pins the paused state in one place: with the flag off, neither a teacher nor
 * a student gets a navigation entry, and every Writing Practice route refuses
 * instead of rendering. Deleting or weakening these assertions is how the
 * feature would leak into a release it was pulled from.
 */
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  mock,
  test,
} from 'bun:test';

const ORIGINAL_COMPOSITION_FLAG = process.env.COMPOSITION_PRACTICE_ENABLED;

const requireUserId = mock();
const requireMembership = mock();
const classFindMany = mock();
const createWritingPracticeAssignmentForClasses = mock();
const buildActPracticeSequence = mock();
const buildMixedGeneratedPracticeSequence = mock();
const getAssignedPracticeForStudentById = mock();
const getOrCreateStudentPracticeSet = mock();
const getWritingPracticeResultsForTeacher = mock();
const recordCompositionPracticeAttempt = mock();
const recordWritingPracticeAttempt = mock();
const listWritingPracticeAssignmentsForStudent = mock();
const listWritingPracticeAssignmentsForTeacher = mock();

mock.module('~/utils/auth.server', () => ({
  requireUserId,
  requireMembership,
}));

mock.module('~/utils/db.server', () => ({
  prisma: { class: { findMany: classFindMany } },
}));

// bun's mock.module() swaps the whole namespace, so every export the routes
// under test import has to be listed here or the import fails outright.
mock.module('~/utils/writing-lessons/practice-assignments.server', () => ({
  buildActPracticeSequence,
  buildMixedGeneratedPracticeSequence,
  createWritingPracticeAssignmentForClasses,
  getAssignedPracticeForStudentById,
  getOrCreateStudentPracticeSet,
  getWritingPracticeResultsForTeacher,
  listWritingPracticeAssignmentsForStudent,
  listWritingPracticeAssignmentsForTeacher,
  recordCompositionPracticeAttempt,
  recordWritingPracticeAttempt,
}));

const { FLAT_SIDEBAR_SECTIONS, getVisibleSidebarSections } =
  await import('./sidebar-nav');
const { loader: indexLoader } =
  await import('~/routes/app.writing-lessons._index/route');
const { loader: lessonLoader } =
  await import('~/routes/app.writing-lessons.$lessonSlug/route');
const { action: assignAction } =
  await import('~/routes/app.writing-lessons.assign/route');
const { loader: practiceLoader, action: practiceAction } =
  await import('~/routes/app.writing-lessons.practice/route');
const { loader: assignedLoader, action: assignedAction } =
  await import('~/routes/app.writing-lessons.assigned.$classAssignmentId/route');
const { loader: resultsLoader } =
  await import('~/routes/app.writing-lessons.results.$classAssignmentId/route');

afterAll(() => {
  mock.restore();
});

afterEach(() => {
  if (ORIGINAL_COMPOSITION_FLAG === undefined) {
    delete process.env.COMPOSITION_PRACTICE_ENABLED;
  } else {
    process.env.COMPOSITION_PRACTICE_ENABLED = ORIGINAL_COMPOSITION_FLAG;
  }
});

function pausedUser(role: 'TEACHER' | 'STUDENT') {
  return {
    isAdmin: false,
    selectedMembership: {
      role,
      isOrgOwner: false,
      organization: { name: 'Org', writingPracticeEnabled: false },
    },
  } as any;
}

function destinationsFor(user: any) {
  return getVisibleSidebarSections(FLAT_SIDEBAR_SECTIONS, user).flatMap(
    (section) => section.links.map((link) => link.to)
  );
}

describe('Writing Practice is invisible while paused', () => {
  test('a teacher gets no Writing Practice navigation entry', () => {
    const destinations = destinationsFor(pausedUser('TEACHER'));

    expect(destinations).not.toContain('/app/writing-lessons');
    expect(
      destinations.some((to) => to.startsWith('/app/writing-lessons'))
    ).toBe(false);
  });

  test('a student gets no Writing Practice navigation entry', () => {
    const destinations = destinationsFor(pausedUser('STUDENT'));

    expect(destinations).not.toContain('/app/writing-lessons');
    expect(
      destinations.some((to) => to.startsWith('/app/writing-lessons'))
    ).toBe(false);
  });
});

describe('Writing Practice routes refuse while paused', () => {
  beforeEach(() => {
    requireUserId.mockReset();
    requireMembership.mockReset();
    classFindMany.mockReset();
    createWritingPracticeAssignmentForClasses.mockReset();
    buildActPracticeSequence.mockReset();
    buildMixedGeneratedPracticeSequence.mockReset();
    getAssignedPracticeForStudentById.mockReset();
    getOrCreateStudentPracticeSet.mockReset();
    getWritingPracticeResultsForTeacher.mockReset();
    recordCompositionPracticeAttempt.mockReset();
    recordWritingPracticeAttempt.mockReset();

    requireUserId.mockResolvedValue('user-1');
    classFindMany.mockResolvedValue([{ id: 'class-1' }]);
    buildActPracticeSequence.mockReturnValue([]);
    buildMixedGeneratedPracticeSequence.mockResolvedValue({
      items: [],
      source: 'static',
    });
  });

  test('the library index refuses for a student', async () => {
    requireMembership.mockResolvedValue({
      id: 'student-1',
      role: 'STUDENT',
      organization: { id: 'org-1', writingPracticeEnabled: false },
    });

    await expect(
      indexLoader({
        request: new Request('https://example.test/app/writing-lessons'),
        params: {},
        context: {} as never,
      } as any)
    ).rejects.toMatchObject({ status: 302 });
  });

  test('the library index refuses for a teacher', async () => {
    requireMembership.mockResolvedValue({
      id: 'teacher-1',
      role: 'TEACHER',
      organization: { id: 'org-1', writingPracticeEnabled: false },
    });

    await expect(
      indexLoader({
        request: new Request('https://example.test/app/writing-lessons'),
        params: {},
        context: {} as never,
      } as any)
    ).rejects.toMatchObject({ status: 302 });
    expect(classFindMany).not.toHaveBeenCalled();
  });

  test('a lesson detail URL refuses', async () => {
    requireMembership.mockResolvedValue({
      id: 'student-1',
      role: 'STUDENT',
      organization: { id: 'org-1', writingPracticeEnabled: false },
    });

    await expect(
      lessonLoader({
        request: new Request(
          'https://example.test/app/writing-lessons/weak-construction'
        ),
        params: { lessonSlug: 'weak-construction' },
        context: {} as never,
      } as any)
    ).rejects.toMatchObject({ status: 302 });
  });

  test('the self-directed session loader and action refuse', async () => {
    requireMembership.mockResolvedValue({
      id: 'student-1',
      role: 'STUDENT',
      organization: { id: 'org-1', writingPracticeEnabled: false },
    });

    await expect(
      practiceLoader({
        request: new Request(
          'https://example.test/app/writing-lessons/practice?skills=fixing-comma-splices&count=5'
        ),
        params: {},
        context: {} as never,
      } as any)
    ).rejects.toMatchObject({ status: 302 });
    expect(buildMixedGeneratedPracticeSequence).not.toHaveBeenCalled();

    await expect(
      practiceAction({
        request: new Request(
          'https://example.test/app/writing-lessons/practice',
          {
            method: 'POST',
            body: new URLSearchParams([
              ['intent', 'check-rewrite'],
              ['lessonSlug', 'fixing-comma-splices'],
            ]),
          }
        ),
        params: {},
        context: {} as never,
      } as any)
    ).rejects.toMatchObject({ status: 404 });
  });

  test('the assigned-practice loader and action refuse before reading or writing', async () => {
    requireMembership.mockResolvedValue({
      id: 'student-1',
      role: 'STUDENT',
      organization: { id: 'org-1', writingPracticeEnabled: false },
    });

    await expect(
      assignedLoader({
        request: new Request(
          'https://example.test/app/writing-lessons/assigned/class-assignment-1'
        ),
        params: { classAssignmentId: 'class-assignment-1' },
        context: {} as never,
      } as any)
    ).rejects.toMatchObject({ status: 302 });
    await expect(
      assignedAction({
        request: new Request(
          'https://example.test/app/writing-lessons/assigned/class-assignment-1',
          { method: 'POST', body: new URLSearchParams() }
        ),
        params: { classAssignmentId: 'class-assignment-1' },
        context: {} as never,
      } as any)
    ).rejects.toMatchObject({ status: 404 });
    expect(getAssignedPracticeForStudentById).not.toHaveBeenCalled();
    expect(recordWritingPracticeAttempt).not.toHaveBeenCalled();
    expect(recordCompositionPracticeAttempt).not.toHaveBeenCalled();
  });

  test('the teacher results route refuses before reading results', async () => {
    requireMembership.mockResolvedValue({
      id: 'teacher-1',
      role: 'TEACHER',
      organization: { id: 'org-1', writingPracticeEnabled: false },
    });

    await expect(
      resultsLoader({
        request: new Request(
          'https://example.test/app/writing-lessons/results/class-assignment-1'
        ),
        params: { classAssignmentId: 'class-assignment-1' },
        context: {} as never,
      } as any)
    ).rejects.toMatchObject({ status: 302 });
    expect(getWritingPracticeResultsForTeacher).not.toHaveBeenCalled();
  });

  test('the assign action refuses for a teacher and writes nothing', async () => {
    requireMembership.mockResolvedValue({
      id: 'teacher-1',
      role: 'TEACHER',
      organization: { id: 'org-1', writingPracticeEnabled: false },
    });

    const response = await assignAction({
      request: new Request('https://example.test/app/writing-lessons/assign', {
        method: 'POST',
        body: new URLSearchParams([
          ['title', 'Paused practice'],
          ['lessonSlugs', 'weak-construction'],
          ['classIds', 'class-1'],
          ['problemCount', '5'],
          ['dueAt', '2026-09-01'],
        ]),
      }),
      params: {},
      context: {} as never,
    } as any);

    expect(response.init?.status).toBe(404);
    expect(response.data.success).toBe(false);
    expect(response.data.message).toBe(
      'Writing practice is not enabled for your organization.'
    );
    expect(createWritingPracticeAssignmentForClasses).not.toHaveBeenCalled();
  });
});

describe('Composition routes refuse while their rollout flag is off', () => {
  beforeEach(() => {
    process.env.COMPOSITION_PRACTICE_ENABLED = 'false';
    requireUserId.mockReset();
    requireMembership.mockReset();
    getAssignedPracticeForStudentById.mockReset();
    getOrCreateStudentPracticeSet.mockReset();
    getWritingPracticeResultsForTeacher.mockReset();

    requireUserId.mockResolvedValue('user-1');
  });

  test('the assigned student loader and action refuse composition sets', async () => {
    requireMembership.mockResolvedValue({
      id: 'student-1',
      role: 'STUDENT',
      organization: { id: 'org-1', writingPracticeEnabled: true },
    });
    getAssignedPracticeForStudentById.mockResolvedValue({
      id: 'class-assignment-1',
      assignment: {
        title: 'Composition set',
        lessonSlugs: ['topic-sentences'],
        problemCount: 1,
        instructions: null,
        dueAt: null,
      },
      attempts: [],
    });
    getOrCreateStudentPracticeSet.mockResolvedValue([
      {
        kind: 'composition',
        lessonSlug: 'topic-sentences',
        prompt: {
          id: 'topic-sentences-1',
          exercise: 'Write a claim.',
          instruction: 'Write one sentence.',
        },
      },
    ]);

    await expect(
      assignedLoader({
        request: new Request(
          'https://example.test/app/writing-lessons/assigned/class-assignment-1'
        ),
        params: { classAssignmentId: 'class-assignment-1' },
        context: {} as never,
      } as any)
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      assignedAction({
        request: new Request(
          'https://example.test/app/writing-lessons/assigned/class-assignment-1',
          { method: 'POST', body: new URLSearchParams([['kind', 'act']]) }
        ),
        params: { classAssignmentId: 'class-assignment-1' },
        context: {} as never,
      } as any)
    ).rejects.toMatchObject({ status: 404 });
  });

  test('the self-directed action refuses a Composition lesson', async () => {
    requireMembership.mockResolvedValue({
      id: 'student-1',
      role: 'STUDENT',
      organization: { id: 'org-1', writingPracticeEnabled: true },
    });

    await expect(
      practiceAction({
        request: new Request(
          'https://example.test/app/writing-lessons/practice',
          {
            method: 'POST',
            body: new URLSearchParams([
              ['kind', 'composition'],
              ['lessonSlug', 'topic-sentences'],
              ['response', 'a real attempt'],
            ]),
          }
        ),
        params: {},
        context: {} as never,
      } as any)
    ).rejects.toMatchObject({ status: 400 });
  });

  test('the teacher results route refuses composition sets', async () => {
    requireMembership.mockResolvedValue({
      id: 'teacher-1',
      role: 'TEACHER',
      organization: { id: 'org-1', writingPracticeEnabled: true },
    });
    getWritingPracticeResultsForTeacher.mockResolvedValue({
      classAssignment: {
        assignment: {
          title: 'Composition set',
          lessonSlugs: ['topic-sentences'],
          problemCount: 1,
          dueAt: null,
        },
        class: { title: 'English', grade: '10', period: '3' },
      },
      results: [],
      attemptsByStudent: {},
    });

    await expect(
      resultsLoader({
        request: new Request(
          'https://example.test/app/writing-lessons/results/class-assignment-1'
        ),
        params: { classAssignmentId: 'class-assignment-1' },
        context: {} as never,
      } as any)
    ).rejects.toMatchObject({ status: 404 });
  });
});
