import { describe, expect, mock, test } from 'bun:test';

mock.module('~/utils/db.server', () => ({ prisma: {} }));

const {
  builtinAiPromptVersion,
  createAiPromptDraft,
  promoteAiPromptVersion,
  resolveAiPromptVersion,
  rollbackAiPromptVersion,
} = await import('./prompt-version-control.server');

describe('AI prompt version control', () => {
  test('falls back safely when no prompt has been promoted', async () => {
    const db = {
      assignmentTypePromptVersion: {
        findFirst: mock(() => Promise.resolve(null)),
      },
    };
    const resolved = await resolveAiPromptVersion({
      assignmentTypeId: 'type-1',
      surface: 'tutor',
      db: db as never,
    });
    expect(resolved).toEqual(builtinAiPromptVersion('tutor'));
  });

  test('rejects a corrupt production hash and uses the canonical fallback', async () => {
    const db = {
      assignmentTypePromptVersion: {
        findFirst: mock(() =>
          Promise.resolve({
            id: 'prompt-1',
            version: 1,
            revision: 1,
            source: 'admin',
            contentHash: 'not-the-template-hash',
            systemMessageTemplate:
              '{{base_system}} {{assignment_prompt}} {{rubric_version}} {{rubric}}',
            userMessageTemplate: '{{document_context}} {{student_message}}',
          })
        ),
      },
    };
    const resolved = await resolveAiPromptVersion({
      assignmentTypeId: 'type-1',
      surface: 'tutor',
      db: db as never,
    });
    expect(resolved.id).toBeNull();
    expect(resolved.source).toBe('invalid-production-fallback');
  });

  test('creates a draft from the current safe prompt with a monotonic version', async () => {
    const create = mock((args) => Promise.resolve({ id: 'draft-4', ...args.data }));
    const findFirst = mock((args) => {
      if (args.where.status === 'production') return Promise.resolve(null);
      return Promise.resolve({ version: 3 });
    });
    const db = {
      assignmentType: {
        findUnique: mock(() => Promise.resolve({ id: 'type-1' })),
      },
      assignmentTypePromptVersion: { findFirst, create },
    };

    const draft = await createAiPromptDraft({
      assignmentTypeId: 'type-1',
      surface: 'grading',
      authorUserId: 'admin-1',
      db: db as never,
    });
    expect(draft.version).toBe(4);
    expect(draft.status).toBe('draft');
    expect(draft.authorUserId).toBe('admin-1');
    expect(draft.contentHash).toHaveLength(64);
  });

  test('promotes only the exact clean reviewed run and records rollback target', async () => {
    const updates: unknown[] = [];
    const tx = {
      assignmentTypePromptVersion: {
        findFirst: mock((args) => {
          if (args.where.id === 'draft-2') {
            return Promise.resolve({
              id: 'draft-2',
              assignmentTypeId: 'type-1',
              surface: 'tutor',
              contentHash: 'hash-2',
              status: 'draft',
            });
          }
          return Promise.resolve({ id: 'production-1' });
        }),
        update: mock((args) => {
          updates.push(args);
          return Promise.resolve({ id: args.where.id, ...args.data });
        }),
      },
      assignmentTypeEvaluationRun: {
        findFirst: mock(() =>
          Promise.resolve({
            id: 'run-2',
            promptVersionId: 'draft-2',
            assignmentTypeId: 'type-1',
            promptContentHash: 'hash-2',
            status: 'passed',
            failedCases: 0,
            needsReviewCases: 0,
            calibrationReviewedAt: new Date(),
            calibrationReviewedByUserId: 'teacher-reviewer',
          })
        ),
      },
    };
    const db = { $transaction: (callback: (value: typeof tx) => unknown) => callback(tx) };

    await promoteAiPromptVersion({
      assignmentTypeId: 'type-1',
      promptVersionId: 'draft-2',
      runId: 'run-2',
      db: db as never,
    });

    expect(updates).toContainEqual({
      where: { id: 'production-1' },
      data: { status: 'retired' },
    });
    expect(updates).toContainEqual({
      where: { id: 'draft-2' },
      data: {
        status: 'production',
        promotedAt: expect.any(Date),
        promotionRunId: 'run-2',
        rollbackTargetId: 'production-1',
      },
    });
  });

  test('rolls the first promoted version back to the canonical runtime fallback', async () => {
    const update = mock(() => Promise.resolve({}));
    const tx = {
      assignmentTypePromptVersion: {
        findFirst: mock(() =>
          Promise.resolve({ id: 'production-1', rollbackTargetId: null })
        ),
        update,
      },
    };
    const db = { $transaction: (callback: (value: typeof tx) => unknown) => callback(tx) };
    const result = await rollbackAiPromptVersion({
      assignmentTypeId: 'type-1',
      surface: 'grading',
      productionVersionId: 'production-1',
      db: db as never,
    });
    expect(result).toEqual({ rolledBackTo: 'canonical-runtime-v1' });
    expect(update).toHaveBeenCalledWith({
      where: { id: 'production-1' },
      data: { status: 'retired' },
    });
  });
});
