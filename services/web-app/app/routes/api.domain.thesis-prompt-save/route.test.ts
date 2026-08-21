import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

const requireUserId = mock();
const requireMembership = mock();
const isAssignmentTypeAvailableForAnyScope = mock();
const saveThesisPrompt = mock();
const findMany = mock();

class SavedPromptError extends Error {}

// bun's module mocks are global to the test run and mock.restore() does not
// undo mock.module — restore from the pristine copies test-preload.ts
// captured before any file could mock.module() these paths (see comment
// there).
const actualAssignmentTypeAccess = globalThis.__realModules[
  '~/utils/assignment-type-access.server'
];
const actualSavedPrompts = globalThis.__realModules[
  '~/domain/thesis-prompts/saved-prompts.server'
];

mock.module('~/utils/auth.server', () => ({ requireUserId, requireMembership }));
mock.module('~/utils/assignment-type-access.server', () => ({
  ...actualAssignmentTypeAccess,
  isAssignmentTypeAvailableForAnyScope,
}));
mock.module('~/domain/thesis-prompts/saved-prompts.server', () => ({
  ...actualSavedPrompts,
  saveThesisPrompt,
  SavedPromptError,
}));
mock.module('~/utils/db.server', () => ({
  prisma: { class: { findMany } },
}));

const { action } = await import('./route');

afterAll(() => {
  mock.restore();
  mock.module(
    '~/utils/assignment-type-access.server',
    () => actualAssignmentTypeAccess
  );
  mock.module(
    '~/domain/thesis-prompts/saved-prompts.server',
    () => actualSavedPrompts
  );
});

async function readBody(response: any) {
  return typeof response.json === 'function' ? response.json() : response.data;
}

function statusOf(response: any) {
  return response.init?.status ?? response.status ?? 200;
}

function request(fields: Record<string, string | undefined>) {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) body.set(key, value);
  }
  return new Request('https://example.test/api/domain/thesis-prompt-save', {
    method: 'POST',
    body,
  });
}

const VALID = {
  assignmentTypeId: 'at-1',
  title: 'Loyalty Under Pressure',
  prompt: 'Write a thesis-driven critical essay on loyalty under pressure.',
};

describe('api.domain.thesis-prompt-save', () => {
  beforeEach(() => {
    requireUserId.mockReset();
    requireMembership.mockReset();
    isAssignmentTypeAvailableForAnyScope.mockReset();
    saveThesisPrompt.mockReset();
    findMany.mockReset();

    requireUserId.mockResolvedValue('user-1');
    requireMembership.mockResolvedValue({
      id: 'teacher-1',
      role: 'TEACHER',
      organization: { id: 'org-1' },
    });
    findMany.mockResolvedValue([
      { id: 'class-1', school: { id: 'school-1', organizationId: 'org-1' } },
    ]);
    isAssignmentTypeAvailableForAnyScope.mockResolvedValue(true);
    saveThesisPrompt.mockResolvedValue({
      id: 'saved-1',
      title: 'Loyalty Under Pressure',
      prompt: VALID.prompt,
      savedAt: '2026-07-27T12:00:00.000Z',
    });
  });

  test('saves the prompt for the signed-in teacher', async () => {
    const response = await action({
      request: request(VALID),
      params: {},
      context: {},
    } as any);

    expect(await readBody(response)).toEqual({
      success: true,
      saved: {
        id: 'saved-1',
        title: 'Loyalty Under Pressure',
        prompt: VALID.prompt,
        savedAt: '2026-07-27T12:00:00.000Z',
      },
    });
    expect(saveThesisPrompt).toHaveBeenCalledWith({
      membershipId: 'teacher-1',
      assignmentTypeId: 'at-1',
      title: 'Loyalty Under Pressure',
      prompt: VALID.prompt,
    });
  });

  test('students cannot save prompts', async () => {
    requireMembership.mockResolvedValue({
      id: 'student-1',
      role: 'STUDENT',
      organization: { id: 'org-1' },
    });

    const response = await action({
      request: request(VALID),
      params: {},
      context: {},
    } as any);

    expect(statusOf(response)).toBe(403);
    expect((await readBody(response)).success).toBe(false);
    expect(saveThesisPrompt).not.toHaveBeenCalled();
  });

  test('rejects a save for an assignment type the teacher cannot access', async () => {
    isAssignmentTypeAvailableForAnyScope.mockResolvedValue(false);

    const response = await action({
      request: request(VALID),
      params: {},
      context: {},
    } as any);

    expect(statusOf(response)).toBe(404);
    expect(saveThesisPrompt).not.toHaveBeenCalled();
  });

  test('rejects a request with no prompt body', async () => {
    const response = await action({
      request: request({ ...VALID, prompt: '   ' }),
      params: {},
      context: {},
    } as any);

    expect(statusOf(response)).toBe(400);
    expect(saveThesisPrompt).not.toHaveBeenCalled();
  });

  test('rejects a request with no assignment type', async () => {
    const response = await action({
      request: request({ ...VALID, assignmentTypeId: undefined }),
      params: {},
      context: {},
    } as any);

    expect(statusOf(response)).toBe(400);
    expect(saveThesisPrompt).not.toHaveBeenCalled();
  });

  test('surfaces a validation failure from the domain layer as a 400', async () => {
    saveThesisPrompt.mockRejectedValue(
      new SavedPromptError('That prompt is too long to save.')
    );

    const response = await action({
      request: request(VALID),
      params: {},
      context: {},
    } as any);

    expect(statusOf(response)).toBe(400);
    expect((await readBody(response)).message).toBe(
      'That prompt is too long to save.'
    );
  });

  test('degrades gracefully when the write fails', async () => {
    saveThesisPrompt.mockRejectedValue(new Error('db down'));

    const response = await action({
      request: request(VALID),
      params: {},
      context: {},
    } as any);

    expect(statusOf(response)).toBe(500);
    expect((await readBody(response)).success).toBe(false);
  });
});
