/**
 * Writing Practice availability (always on).
 *
 * Writing Practice is now live for every organization. These tests prove it's
 * visible and reachable even when an org previously had the flag off.
 */
import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

const requireUserId = mock();
const requireMembership = mock();
const classFindMany = mock();
const createWritingPracticeAssignmentForClasses = mock();

mock.module('~/utils/auth.server', () => ({
  requireUserId,
  requireMembership,
}));

mock.module('~/utils/db.server', () => ({
  prisma: { class: { findMany: classFindMany } },
}));

mock.module('~/utils/writing-lessons/practice-assignments.server', () => ({
  createWritingPracticeAssignmentForClasses,
}));

const { FLAT_SIDEBAR_SECTIONS, getVisibleSidebarSections } = await import(
  './sidebar-nav'
);
const { loader: indexLoader } = await import(
  '~/routes/app.writing-lessons._index/route'
);
const { loader: lessonLoader } = await import(
  '~/routes/app.writing-lessons.$lessonSlug/route'
);
const { action: assignAction } = await import(
  '~/routes/app.writing-lessons.assign/route'
);

afterAll(() => {
  mock.restore();
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
  return getVisibleSidebarSections(
    FLAT_SIDEBAR_SECTIONS,
    user
  ).flatMap((section) => section.links.map((link) => link.to));
}

describe('Writing Practice navigation is visible', () => {
  test('a teacher sees the Writing Practice navigation entry even when the org flag is off', () => {
    const destinations = destinationsFor(pausedUser('TEACHER'));
    expect(destinations).toContain('/app/writing-lessons');
  });

  test('a student sees the Writing Practice navigation entry even when the org flag is off', () => {
    const destinations = destinationsFor(pausedUser('STUDENT'));
    expect(destinations).toContain('/app/writing-lessons');
  });
});

describe('Writing Practice routes are reachable', () => {
  beforeEach(() => {
    requireUserId.mockReset();
    requireMembership.mockReset();
    classFindMany.mockReset();
    createWritingPracticeAssignmentForClasses.mockReset();

    requireUserId.mockResolvedValue('user-1');
    classFindMany.mockResolvedValue([{ id: 'class-1' }]);
  });

  test('the library index loads for a student even when the org flag is off', async () => {
    requireMembership.mockResolvedValue({
      id: 'student-1',
      role: 'STUDENT',
      organization: { id: 'org-1', writingPracticeEnabled: false },
    });

    const response = await indexLoader({
      request: new Request('https://example.test/app/writing-lessons'),
      params: {},
      context: {} as never,
    } as any);
    expect(response.data.lessonCount).toBeGreaterThan(0);
  });

  test('the library index loads for a teacher even when the org flag is off', async () => {
    requireMembership.mockResolvedValue({
      id: 'teacher-1',
      role: 'TEACHER',
      organization: { id: 'org-1', writingPracticeEnabled: false },
    });

    const response = await indexLoader({
      request: new Request('https://example.test/app/writing-lessons'),
      params: {},
      context: {} as never,
    } as any);
    expect(response.data.isTeacher).toBe(true);
    expect(classFindMany).toHaveBeenCalled();
  });

  test('a lesson detail URL loads', async () => {
    requireMembership.mockResolvedValue({
      id: 'student-1',
      role: 'STUDENT',
      organization: { id: 'org-1', writingPracticeEnabled: false },
    });

    const response = await lessonLoader({
      request: new Request(
        'https://example.test/app/writing-lessons/weak-construction'
      ),
      params: { lessonSlug: 'weak-construction' },
      context: {} as never,
    } as any);
    expect(response.data.lesson.slug).toBe('weak-construction');
  });

  test('the assign action allows a teacher and writes practice', async () => {
    requireMembership.mockResolvedValue({
      id: 'teacher-1',
      role: 'TEACHER',
      organization: { id: 'org-1', writingPracticeEnabled: false },
    });

    const response = await assignAction({
      request: new Request('https://example.test/app/writing-lessons/assign', {
        method: 'POST',
        body: new URLSearchParams([
          ['title', 'Practice when disabled'],
          ['lessonSlugs', 'weak-construction'],
          ['classIds', 'class-1'],
          ['problemCount', '5'],
          ['dueAt', '2026-09-01'],
        ]),
      }),
      params: {},
      context: {} as never,
    } as any);

    expect(response.init?.status).toBe(200);
    expect(response.data.success).toBe(true);
    expect(createWritingPracticeAssignmentForClasses).toHaveBeenCalled();
  });
});
