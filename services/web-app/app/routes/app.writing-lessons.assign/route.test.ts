import { beforeEach, describe, expect, mock, test } from 'bun:test';

const requireUserId = mock();
const requireMembership = mock();
const isWritingPracticeEnabledForOrganization = mock();
const createWritingPracticeAssignmentForClasses = mock();
const classFindMany = mock();

mock.module('~/utils/auth.server', () => ({
  requireUserId,
  requireMembership,
}));
mock.module('~/utils/feature-gates.server', () => ({
  isWritingPracticeEnabledForOrganization,
}));
mock.module('~/utils/db.server', () => ({
  prisma: { class: { findMany: classFindMany } },
}));
mock.module('~/utils/writing-lessons/practice-assignments.server', () => ({
  createWritingPracticeAssignmentForClasses,
}));

const { action } = await import('./route');

function buildRequest(fields: Record<string, string | string[]>) {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(fields)) {
    if (Array.isArray(value)) value.forEach((v) => body.append(key, v));
    else body.append(key, value);
  }
  return new Request('http://localhost/app/writing-lessons/assign', {
    method: 'POST',
    body,
  });
}

async function run(fields: Record<string, string | string[]>) {
  const response = await action({
    request: buildRequest(fields),
    params: {},
    context: {},
  } as never);
  return (response as unknown as { data?: unknown }).data ?? response;
}

beforeEach(() => {
  requireUserId.mockReset();
  requireMembership.mockReset();
  isWritingPracticeEnabledForOrganization.mockReset();
  createWritingPracticeAssignmentForClasses.mockReset();
  classFindMany.mockReset();

  requireUserId.mockResolvedValue('user-1');
  requireMembership.mockResolvedValue({
    id: 'teacher-1',
    role: 'TEACHER',
    organization: { id: 'org-1', name: 'Org' },
  });
  isWritingPracticeEnabledForOrganization.mockResolvedValue(true);
  classFindMany.mockResolvedValue([{ id: 'class-a' }]);
  createWritingPracticeAssignmentForClasses.mockResolvedValue({ id: 'wpa-1' });
});

describe('writing-lessons assign action', () => {
  test('creates the assignment for an owned class', async () => {
    const result = (await run({
      lessonSlugs: 'fixing-comma-splices',
      classIds: 'class-a',
      problemCount: '5',
    })) as { success: boolean; classCount?: number };

    expect(result.success).toBe(true);
    expect(result.classCount).toBe(1);
    expect(createWritingPracticeAssignmentForClasses).toHaveBeenCalledTimes(1);
    const [input, classIds] =
      createWritingPracticeAssignmentForClasses.mock.calls[0];
    expect(input.createdByMembershipId).toBe('teacher-1');
    expect(input.lessonSlugs).toEqual(['fixing-comma-splices']);
    expect(input.problemCount).toBe(5);
    expect(classIds).toEqual(['class-a']);
  });

  test('rejects non-teachers', async () => {
    requireMembership.mockResolvedValue({
      id: 'student-1',
      role: 'STUDENT',
      organization: { id: 'org-1', name: 'Org' },
    });

    const result = (await run({
      lessonSlugs: 'fixing-comma-splices',
      classIds: 'class-a',
      problemCount: '5',
    })) as { success: boolean };

    expect(result.success).toBe(false);
    expect(createWritingPracticeAssignmentForClasses).not.toHaveBeenCalled();
  });

  test('rejects an unknown lesson slug', async () => {
    const result = (await run({
      lessonSlugs: 'not-a-real-lesson',
      classIds: 'class-a',
      problemCount: '5',
    })) as { success: boolean; message: string };

    expect(result.success).toBe(false);
    expect(result.message).toContain('Unknown lesson');
    expect(createWritingPracticeAssignmentForClasses).not.toHaveBeenCalled();
  });

  test('rejects a class the teacher does not own', async () => {
    classFindMany.mockResolvedValue([]); // ownership query returns nothing

    const result = (await run({
      lessonSlugs: 'fixing-comma-splices',
      classIds: 'class-x',
      problemCount: '5',
    })) as { success: boolean; message: string };

    expect(result.success).toBe(false);
    expect(result.message).toContain('your own classes');
    expect(createWritingPracticeAssignmentForClasses).not.toHaveBeenCalled();
  });

  test('rejects an out-of-range problem count', async () => {
    const result = (await run({
      lessonSlugs: 'fixing-comma-splices',
      classIds: 'class-a',
      problemCount: '99',
    })) as { success: boolean; message: string };

    expect(result.success).toBe(false);
    expect(result.message).toContain('Number of problems');
    expect(createWritingPracticeAssignmentForClasses).not.toHaveBeenCalled();
  });
});
