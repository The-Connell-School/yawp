import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

const requireUserId = mock();
const requireMembership = mock();
const saveDailyPagesPrompt = mock();
const isAssignmentTypeAvailableForAnyScope = mock();

const prisma = {
  class: {
    findMany: mock(),
  },
};

class SavedPromptError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SavedPromptError';
  }
}

// bun's module mocks are global to the test run and mock.restore() does not
// undo mock.module — restore from the pristine copies test-preload.ts
// captured before any file could mock.module() these paths (see comment
// there).
const actualAssignmentTypeAccess = globalThis.__realModules[
  '~/utils/assignment-type-access.server'
];
const actualSavedPrompts = globalThis.__realModules[
  '~/domain/daily-pages-prompts/saved-prompts.server'
];

mock.module('~/utils/auth.server', () => ({ requireUserId, requireMembership }));
mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/assignment-type-access.server', () => ({
  ...actualAssignmentTypeAccess,
  isAssignmentTypeAvailableForAnyScope,
}));
mock.module('~/domain/daily-pages-prompts/saved-prompts.server', () => ({
  ...actualSavedPrompts,
  saveDailyPagesPrompt,
  SavedPromptError,
}));

const { action } = await import('./route');

afterAll(() => {
  mock.restore();
  mock.module(
    '~/utils/assignment-type-access.server',
    () => actualAssignmentTypeAccess
  );
  mock.module(
    '~/domain/daily-pages-prompts/saved-prompts.server',
    () => actualSavedPrompts
  );
});

async function readBody(response: any) {
  return typeof response.json === 'function' ? response.json() : response.data;
}

const PROMPT = 'You become who you spend time with. Defend or reject this.';

function request(fields: Record<string, string>) {
  const body = new URLSearchParams(fields);
  return new Request(
    'https://example.test/api/domain/daily-pages-prompt-save',
    { method: 'POST', body }
  );
}

describe('api.domain.daily-pages-prompt-save', () => {
  beforeEach(() => {
    requireUserId.mockReset();
    requireMembership.mockReset();
    saveDailyPagesPrompt.mockReset();
    isAssignmentTypeAvailableForAnyScope.mockReset();
    prisma.class.findMany.mockReset();

    requireUserId.mockResolvedValue('user-1');
    requireMembership.mockResolvedValue({
      id: 'teacher-1',
      role: 'TEACHER',
      organization: { id: 'org-1' },
    });
    prisma.class.findMany.mockResolvedValue([
      { id: 'class-1', school: { id: 'school-1', organizationId: 'org-1' } },
    ]);
    isAssignmentTypeAvailableForAnyScope.mockResolvedValue(true);
    saveDailyPagesPrompt.mockResolvedValue({
      id: 'saved-1',
      prompt: PROMPT,
      savedAt: '2026-07-28T12:00:00.000Z',
      facets: { type: 'agree-disagree' },
    });
  });

  test('saves a prompt with its facet tags', async () => {
    const response = await action({
      request: request({
        assignmentTypeId: 'at-1',
        prompt: PROMPT,
        facets: JSON.stringify({
          type: 'agree-disagree',
          seriousness: 'moderate',
          cognitiveMoves: ['take-a-stance'],
        }),
      }),
    } as never);
    const body = await readBody(response);

    expect(body.success).toBe(true);
    expect(body.saved.id).toBe('saved-1');
    expect(saveDailyPagesPrompt).toHaveBeenCalledWith({
      membershipId: 'teacher-1',
      assignmentTypeId: 'at-1',
      prompt: PROMPT,
      facets: {
        type: 'agree-disagree',
        seriousness: 'moderate',
        cognitiveMoves: ['take-a-stance'],
      },
    });
  });

  test('saves without facets when none are sent or they are unparseable', async () => {
    await action({
      request: request({ assignmentTypeId: 'at-1', prompt: PROMPT }),
    } as never);
    expect(saveDailyPagesPrompt.mock.calls[0][0].facets).toEqual({});

    await action({
      request: request({
        assignmentTypeId: 'at-1',
        prompt: PROMPT,
        facets: 'not json',
      }),
    } as never);
    expect(saveDailyPagesPrompt.mock.calls[1][0].facets).toEqual({});
  });

  test('rejects students', async () => {
    requireMembership.mockResolvedValue({
      id: 'student-1',
      role: 'STUDENT',
      organization: { id: 'org-1' },
    });

    const response = await action({
      request: request({ assignmentTypeId: 'at-1', prompt: PROMPT }),
    } as never);

    expect((response as any).init?.status).toBe(403);
    expect(saveDailyPagesPrompt).not.toHaveBeenCalled();
  });

  test('rejects a missing prompt or assignment type', async () => {
    const noPrompt = await action({
      request: request({ assignmentTypeId: 'at-1', prompt: '   ' }),
    } as never);
    expect((noPrompt as any).init?.status).toBe(400);

    const noType = await action({
      request: request({ assignmentTypeId: '', prompt: PROMPT }),
    } as never);
    expect((noType as any).init?.status).toBe(400);
    expect(saveDailyPagesPrompt).not.toHaveBeenCalled();
  });

  test('refuses an assignment type the teacher cannot reach', async () => {
    isAssignmentTypeAvailableForAnyScope.mockResolvedValue(false);

    const response = await action({
      request: request({ assignmentTypeId: 'at-other', prompt: PROMPT }),
    } as never);

    expect((response as any).init?.status).toBe(404);
    expect(saveDailyPagesPrompt).not.toHaveBeenCalled();
  });

  test('surfaces a save error as a 400 and anything else as a 500', async () => {
    saveDailyPagesPrompt.mockRejectedValueOnce(
      new SavedPromptError('That prompt is too long to save.')
    );
    const badRequest = await action({
      request: request({ assignmentTypeId: 'at-1', prompt: PROMPT }),
    } as never);
    expect((badRequest as any).init?.status).toBe(400);
    expect((await readBody(badRequest)).message).toBe(
      'That prompt is too long to save.'
    );

    saveDailyPagesPrompt.mockRejectedValueOnce(new Error('boom'));
    const serverError = await action({
      request: request({ assignmentTypeId: 'at-1', prompt: PROMPT }),
    } as never);
    expect((serverError as any).init?.status).toBe(500);
    expect((await readBody(serverError)).success).toBe(false);
  });
});
