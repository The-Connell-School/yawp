import { beforeEach, describe, expect, mock, test } from 'bun:test';

const requireUserId = mock();
const requireMembership = mock();

// Only auth is stubbed. Assignment-type access and the save itself run for real
// against the mocked prisma, so this file never replaces a module the
// assignment-type route also imports — bun's module mocks are global to the
// test run, and overriding a shared export there breaks other suites.
const prisma = {
  class: { findMany: mock() },
  assignmentType: { findFirst: mock(), findMany: mock() },
  organizationAssignmentType: { findMany: mock() },
  school: { findMany: mock() },
  orgMembership: { findMany: mock() },
  savedApEnglishLangPrompt: { upsert: mock() },
};

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/auth.server', () => ({ requireUserId, requireMembership }));

const { action } = await import('./route');

function statusOf(response: any) {
  return response.init?.status ?? response.status;
}

async function readBody(response: any) {
  return typeof response.json === 'function' ? response.json() : response.data;
}

function request(fields: Record<string, string>) {
  const body = new URLSearchParams(fields);
  return new Request(
    'https://example.test/api/domain/ap-english-lang-prompt-save',
    { method: 'POST', body }
  );
}

const validFields = {
  assignmentTypeId: 'at-1',
  title: 'What We Owe Strangers',
  prompt: 'Write an essay that argues your position on what we owe strangers.',
  facets: JSON.stringify({
    frqType: 'argument',
    focusSkill: 'line-of-reasoning',
    difficulty: 'developing',
  }),
};

describe('api.domain.ap-english-lang-prompt-save', () => {
  beforeEach(() => {
    requireUserId.mockReset();
    requireMembership.mockReset();
    prisma.class.findMany.mockReset();
    prisma.assignmentType.findFirst.mockReset();
    prisma.organizationAssignmentType.findMany.mockReset();
    prisma.school.findMany.mockReset();
    prisma.orgMembership.findMany.mockReset();
    prisma.savedApEnglishLangPrompt.upsert.mockReset();

    requireUserId.mockResolvedValue('user-1');
    requireMembership.mockResolvedValue({
      id: 'teacher-1',
      role: 'TEACHER',
      organization: { id: 'org-1' },
    });
    prisma.class.findMany.mockResolvedValue([
      { id: 'class-1', school: { id: 'school-1', organizationId: 'org-1' } },
    ]);
    prisma.assignmentType.findFirst.mockResolvedValue({ id: 'at-1' });
    prisma.organizationAssignmentType.findMany.mockResolvedValue([
      { organizationId: 'org-1', assignmentTypeId: 'at-1' },
    ]);
    prisma.school.findMany.mockResolvedValue([]);
    prisma.orgMembership.findMany.mockResolvedValue([]);
    prisma.savedApEnglishLangPrompt.upsert.mockResolvedValue({
      id: 'saved-1',
      title: 'What We Owe Strangers',
      prompt: 'Write an essay that argues your position on what we owe strangers.',
      facets: { frqType: 'argument' },
      createdAt: new Date('2026-07-28T12:00:00.000Z'),
    });
  });

  test('saves the prompt for the signed-in teacher', async () => {
    const body = await readBody(
      await action({ request: request(validFields) } as never)
    );

    expect(body.success).toBe(true);
    const upsert = prisma.savedApEnglishLangPrompt.upsert.mock.calls[0][0];
    expect(upsert.where.membershipId_assignmentTypeId_promptHash).toMatchObject({
      membershipId: 'teacher-1',
      assignmentTypeId: 'at-1',
    });
    expect(upsert.create).toMatchObject({
      title: 'What We Owe Strangers',
      prompt: 'Write an essay that argues your position on what we owe strangers.',
      facets: {
        frqType: 'argument',
        focusSkill: 'line-of-reasoning',
        difficulty: 'developing',
      },
    });
  });

  test('drops unparseable facets instead of failing the save', async () => {
    await action({
      request: request({ ...validFields, facets: 'not json' }),
    } as never);

    expect(
      prisma.savedApEnglishLangPrompt.upsert.mock.calls[0][0].create.facets
    ).toEqual({});
  });

  test('rejects a teacher who cannot see the assignment type', async () => {
    prisma.assignmentType.findFirst.mockResolvedValue(null);

    const response = await action({ request: request(validFields) } as never);

    expect(statusOf(response)).toBe(404);
    expect(prisma.savedApEnglishLangPrompt.upsert).not.toHaveBeenCalled();
  });

  test('rejects non-teachers', async () => {
    requireMembership.mockResolvedValue({ id: 'student-1', role: 'STUDENT' });

    const response = await action({ request: request(validFields) } as never);

    expect(statusOf(response)).toBe(403);
    expect(prisma.savedApEnglishLangPrompt.upsert).not.toHaveBeenCalled();
  });

  test('requires a prompt and an assignment type', async () => {
    const noPrompt = await action({
      request: request({ ...validFields, prompt: '   ' }),
    } as never);
    expect(statusOf(noPrompt)).toBe(400);

    const noType = await action({
      request: request({ ...validFields, assignmentTypeId: '' }),
    } as never);
    expect(statusOf(noType)).toBe(400);

    expect(prisma.savedApEnglishLangPrompt.upsert).not.toHaveBeenCalled();
  });

  test('surfaces a validation failure from the domain layer', async () => {
    const response = await action({
      request: request({ ...validFields, prompt: 'x'.repeat(5000) }),
    } as never);
    const body = await readBody(response);

    expect(statusOf(response)).toBe(400);
    expect(body.message).toBe('That prompt is too long to save.');
    expect(prisma.savedApEnglishLangPrompt.upsert).not.toHaveBeenCalled();
  });

  test('hides an unexpected failure behind a generic message', async () => {
    prisma.savedApEnglishLangPrompt.upsert.mockRejectedValue(
      new Error('db exploded')
    );

    const response = await action({ request: request(validFields) } as never);
    const body = await readBody(response);

    expect(statusOf(response)).toBe(500);
    expect(body.message).not.toContain('db exploded');
  });
});
