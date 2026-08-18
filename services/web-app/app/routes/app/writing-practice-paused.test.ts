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

    requireUserId.mockResolvedValue('user-1');
    classFindMany.mockResolvedValue([{ id: 'class-1' }]);
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
