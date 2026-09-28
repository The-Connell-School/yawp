import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { rubricKeys } from '~/domain/grading/rubric';

const prisma = {
  $transaction: mock(),
  user: { findUnique: mock() },
  submission: {
    findFirst: mock(),
    update: mock(),
  },
  assignment: { findUnique: mock() },
  assignmentType: {
    findUnique: mock(),
  },
  submissionGradingAssistantRun: {
    create: mock(),
  },
  submissionActivity: { create: mock() },
};

const getLLMCompletion = mock();
const getGradingActor = mock();
const canManageGrades = mock();
const buildTeacherClassWhere = mock();
const buildGradeWriteSubjectWhere = mock();
const isGradingOwnDocument = mock();
const redirectWithToast = mock();

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/getLLMCompletion', () => ({
  AgentType: {
    Assistant: 'assistant',
    User: 'user',
  },
  getLLMCompletion,
}));
mock.module('~/utils/grading-auth.server', () => ({
  getGradingActor,
  canManageGrades,
  buildTeacherClassWhere,
  buildGradeWriteSubjectWhere,
  isGradingOwnDocument,
}));
mock.module('~/utils/toast.server', () => ({
  redirectWithToast,
}));

const { LlmFallbackRetrySignal } =
  await import('~/utils/getLLMCompletion/llm-provider-errors.server');
const { action, getRubricEvaluationMaxTokens } = await import('./route');

test('expands the rubric response budget for category-heavy grading assistants', () => {
  expect(getRubricEvaluationMaxTokens(4)).toBe(900);
  expect(getRubricEvaluationMaxTokens(5)).toBe(900);
  expect(getRubricEvaluationMaxTokens(9)).toBe(2100);
  expect(getRubricEvaluationMaxTokens(20)).toBe(2400);
});

function buildRubricResponseJson(
  scoresByKey: Partial<Record<(typeof rubricKeys)[number], number>> = {}
) {
  return JSON.stringify({
    categories: rubricKeys.map((key) => ({
      key,
      score: scoresByKey[key] ?? 3,
      comment: `Comment for ${key}`,
    })),
    overallComment: 'Jordan, this draft has clear progress and focus.',
  });
}

function buildRubricCategoriesJson(
  scoresByKey: Partial<Record<(typeof rubricKeys)[number], number>> = {}
) {
  return JSON.stringify(
    rubricKeys.map((key) => ({
      key,
      score: scoresByKey[key] ?? 3,
      comment: `Comment for ${key}`,
    }))
  );
}

function buildOverallCommentJson() {
  return JSON.stringify({
    overallComment: 'Jordan, this draft has clear progress and focus.',
  });
}

const assignmentFixtures = new Map<string, {assignmentTypeId: string; rubricRevision: null}>();
function mockSubmission(overrides: Record<string, unknown> = {}) {
  const submission = {
    id: 'sub-1',
    text: 'Frozen AI essay text',
    html: '<p>Frozen AI essay text</p>',
    gradedAt: null,
    updatedAt: new Date('2026-08-20T10:00:00.000Z'),
    releasedAt: null,
    unsubmittedAt: null,
    score: null,
    feedback: null,
    rubricScores: null,
    overallScore: null,
    overallComment: null,
    numericPercentage: null,
    letterGrade: null,
    grammarIssues: null,
    document: {
      id: 'doc-1',
      membershipId: 'student-profile-1',
      assignmentTypeId: 'assignment-type-legacy',
      assignmentType: {
        id: 'assignment-type-legacy',
        kind: null,
        title: 'Critical Essay',
      },
      classAssignment: { class: { schoolId: 'school-1' } },
      membership: {
        organizationId: 'org-1',
        organization: { submissionActivityEnabled: false },
        classesAsStudent: [],
        user: { name: 'Jordan Student' },
      },
    },
    ...overrides,
  };
  const document = submission.document as any;
  if (document.assignment?.id) assignmentFixtures.set(document.assignment.id, {assignmentTypeId: document.assignmentTypeId, rubricRevision: null});
  return submission;
}

function mockAssignmentType(overrides: Record<string, unknown> = {}) {
  return {
    id: 'assignment-type-legacy',
    title: 'Critical Essay',
    kind: null,
    scoringScaleJson: null,
    rubricJson: null,
    gradingPromptConfigJson: null,
    gradingOutputSchemaJson: null,
    gradingCalibrationNotes: null,
    gradingAssistantVersion: 1,
    gradingAssistantSourceTemplateId: null,
    gradingAssistantSourceTemplateSlug: null,
    ...overrides,
  };
}

const dbqSnapshot = {
  schemaVersion: 1,
  libraryEntryId: 'apush-dbq-reconstruction',
  course: 'apush',
  essayType: 'dbq',
  prompt:
    'Evaluate the extent to which Reconstruction changed political rights for African Americans.',
  period: 'Period 5: 1844-1877',
  periodNumber: 5,
  reasoningSkill: 'Causation',
  sources: [
    {
      externalKey: 'doc-1',
      position: 1,
      title: 'Fourteenth Amendment',
      attribution: 'United States Constitution, 1868',
      body: 'All persons born or naturalized in the United States are citizens.',
      caption: null,
      mediaType: 'text',
      imageUrl: null,
      imageAlt: null,
      provenanceUrl: null,
    },
    {
      externalKey: 'doc-2',
      position: 2,
      title: 'Freedmen Petition',
      attribution: 'Petition from formerly enslaved people, 1865',
      body: 'We ask for land and protection of our rights.',
      caption: null,
      mediaType: 'text',
      imageUrl: null,
      imageAlt: null,
      provenanceUrl: null,
    },
  ],
  rubric: {
    rubricId: 'ap-history-dbq-2026',
    totalPoints: 7,
  },
  timing: {
    mode: 'timed',
    durationMinutes: 60,
  },
};

const leqSnapshot = {
  schemaVersion: 1,
  libraryEntryId: 'apush-leq-market-revolution',
  course: 'apush',
  essayType: 'leq',
  prompt:
    'Evaluate the extent to which the Market Revolution changed American society.',
  period: 'Period 4: 1800-1848',
  periodNumber: 4,
  reasoningSkill: 'Continuity and Change',
  sources: [],
  rubric: {
    rubricId: 'ap-history-leq-2026',
    totalPoints: 6,
  },
  timing: {
    mode: 'timed',
    durationMinutes: 40,
  },
};

describe('api.domain.grade-essay-ai', () => {
  beforeEach(() => {
    prisma.submission.findFirst.mockReset();
    prisma.user.findUnique.mockReset();
    prisma.submission.update.mockReset();
    prisma.assignmentType.findUnique.mockReset();
    // These are legacy assignments without a published rubric revision pin.
    assignmentFixtures.clear();
    prisma.assignment.findUnique.mockReset().mockImplementation(async ({where}: any) => assignmentFixtures.get(where.id) ?? null);
    prisma.submissionGradingAssistantRun.create.mockReset();
    prisma.submissionActivity.create.mockReset();
    prisma.$transaction.mockReset();
    getLLMCompletion.mockReset();
    getGradingActor.mockReset();
    canManageGrades.mockReset();
    buildTeacherClassWhere.mockReset();
    buildGradeWriteSubjectWhere.mockReset().mockReturnValue({});
    isGradingOwnDocument.mockReset();
    redirectWithToast.mockReset();

    getGradingActor.mockResolvedValue({
      membershipId: 'teacher-1',
      organizationId: 'org-1',
      teacherProfileId: 'teacher-1',
      isTeacher: true,
      isAdmin: false,
    });
    canManageGrades.mockReturnValue(true);
    buildTeacherClassWhere.mockReturnValue({});
    isGradingOwnDocument.mockImplementation(
      (actorId: string, docProfileId: string) => actorId === docProfileId
    );
    redirectWithToast.mockResolvedValue(new Response(null, { status: 302 }));
    prisma.submission.update.mockResolvedValue({ id: 'sub-1' });
    prisma.user.findUnique.mockResolvedValue({
      name: 'Teacher One',
      email: 'teacher@example.test',
    });
    prisma.assignmentType.findUnique.mockResolvedValue(mockAssignmentType());
    prisma.submissionGradingAssistantRun.create.mockResolvedValue({
      id: 'ga-run-1',
    });
    prisma.$transaction.mockImplementation(async (callback: any) =>
      callback(prisma)
    );

    getLLMCompletion
      .mockResolvedValueOnce(buildRubricResponseJson())
      .mockResolvedValueOnce(
        JSON.stringify({
          issues: [
            {
              excerpt: 'Frozen',
              kind: 'error',
              message: 'This phrase needs a stronger verb choice.',
            },
          ],
        })
      );
  });

  test.each([
    { isAdmin: false, sameMembership: true },
    { isAdmin: true, sameMembership: true },
    { isAdmin: true, sameMembership: false },
  ])('refuses AI grading for a group owner before generating private output: %j', async ({ isAdmin, sameMembership }) => {
    getGradingActor.mockResolvedValue({ membershipId: 'teacher-1', userId: 'owner-user', organizationId: 'org-1', isTeacher: true, isAdmin });
    const submission = mockSubmission() as any;
    submission.document.group = { label: 'Group', members: [{ membershipId: sameMembership ? 'teacher-1' : 'other-org-membership', membership: { userId: 'owner-user' } }] };
    prisma.submission.findFirst.mockResolvedValue(submission);
    const form = new FormData(); form.set('submissionId', 'sub-1');
    const result = await action({ request: new Request('https://example.test/api/domain/grade-essay-ai', { method: 'POST', body: form }) } as any) as any;
    expect(result.init?.status ?? result.status).toBe(403);
    expect(result.data).not.toHaveProperty('teacherNote');
    expect(getLLMCompletion).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  test('returns AI suggestions and persists to submission', async () => {
    prisma.submission.findFirst.mockResolvedValue(
      mockSubmission({ id: 'sub-1' })
    );

    const form = new FormData();
    form.append('submissionId', 'sub-1');

    const request = new Request(
      'https://example.com/api/domain/grade-essay-ai',
      {
        method: 'POST',
        body: form,
      }
    );

    const response = await action({ request } as any);
    const payload = (response as { data: Record<string, unknown> }).data;

    expect(payload.success).toBe(true);
    expect(payload.message).toBe('Grading Assistant suggestions generated.');
    expect(payload.overallComment).toBe(
      'Jordan, this draft has clear progress and focus.'
    );
    expect(Object.keys(payload.rubricScores ?? {})).toEqual(rubricKeys);
    expect(
      (payload.rubricConfig as { source?: string } | undefined)?.source
    ).toBe('thesis-default');
    expect(prisma.submission.update).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.submissionActivity.create).toHaveBeenCalledTimes(1);
    expect(prisma.submissionActivity.create.mock.calls[0][0].data).toEqual(
      expect.objectContaining({
        submissionId: 'sub-1',
        organizationId: 'org-1',
        actorMembershipId: 'teacher-1',
        eventType: 'submission.grading_assistant_updated',
        occurredAfterRelease: false,
        metadata: expect.objectContaining({
          gradingAssistantRunId: 'ga-run-1',
          model: expect.any(String),
          gradingConfigSource: 'thesis-default',
          gradingConfigVersion: 1,
        }),
      })
    );
    expect(prisma.assignmentType.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'assignment-type-legacy' },
      })
    );
    expect(
      prisma.submission.update.mock.calls[0]?.[0].data.aiMeta
    ).toMatchObject({
      gradingConfigSource: 'thesis-default',
      assignmentTypeRubricSource: 'thesis-default',
      assignmentTypeGradingVersion: 1,
      assignmentTypeGradingLabel: 'Thesis-driven essay grading assistant',
      gradingAssistantStrictnessLevel: 'intermediate',
      assignmentTypeId: 'assignment-type-legacy',
      assignmentTypeKind: null,
      rubricCategoryKeys: rubricKeys,
      documentContext: {
        documentSource: 'submission-snapshot',
        documentId: 'doc-1',
        submissionId: 'sub-1',
        documentTextLength: 20,
        documentTextSha256:
          '073d1a79b60fbc3caaccdb440a9c17a1e12c9360f209e321e3b0bada66abb5d9',
      },
    });
    expect(
      prisma.submissionGradingAssistantRun.create.mock.calls[0]?.[0].data
    ).toMatchObject({
      submissionId: 'sub-1',
      assignmentTypeId: 'assignment-type-legacy',
      assignmentTypeGradingVersion: 1,
      source: 'thesis-default',
      status: 'succeeded',
      assignmentTypePromptConfigSnapshot: {
        instructionsPreset: 'legacy_thesis_driven_essay',
      },
      metadata: {
        assignmentTypeGradingLabel: 'Thesis-driven essay grading assistant',
        assignmentTypeRubricSource: 'thesis-default',
        gradingAssistantStrictnessLevel: 'intermediate',
        rubricCategoryKeys: rubricKeys,
        documentContext: {
          documentSource: 'submission-snapshot',
          documentId: 'doc-1',
          submissionId: 'sub-1',
          documentTextLength: 20,
          documentTextSha256:
            '073d1a79b60fbc3caaccdb440a9c17a1e12c9360f209e321e3b0bada66abb5d9',
        },
      },
    });

    expect(getLLMCompletion.mock.calls[0]?.[0].metadata).toMatchObject({
      feature: 'grading',
      kind: 'rubric-evaluation',
      gradingConfigSource: 'thesis-default',
      assignmentTypeRubricSource: 'thesis-default',
      assignmentTypeGradingVersion: 1,
      assignmentTypeId: 'assignment-type-legacy',
      rubricCategoryKeys: rubricKeys,
      documentSource: 'submission-snapshot',
      documentId: 'doc-1',
      submissionId: 'sub-1',
      documentTextLength: 20,
      documentTextSha256:
        '073d1a79b60fbc3caaccdb440a9c17a1e12c9360f209e321e3b0bada66abb5d9',
    });
    expect(getLLMCompletion.mock.calls[1]?.[0].metadata).toMatchObject({
      feature: 'grading',
      kind: 'grammar-issues',
      assignmentTypeRubricSource: 'thesis-default',
      assignmentTypeGradingVersion: 1,
      assignmentTypeId: 'assignment-type-legacy',
      rubricCategoryKeys: rubricKeys,
      documentSource: 'submission-snapshot',
      documentId: 'doc-1',
      submissionId: 'sub-1',
      documentTextLength: 20,
      documentTextSha256:
        '073d1a79b60fbc3caaccdb440a9c17a1e12c9360f209e321e3b0bada66abb5d9',
    });
  });

  test('fails closed when required grading-assistant activity recording is unavailable', async () => {
    const previous = process.env.SUBMISSION_ACTIVITY_WRITES_ENABLED;
    process.env.SUBMISSION_ACTIVITY_WRITES_ENABLED = 'false';
    prisma.submission.findFirst.mockResolvedValue(mockSubmission());
    const form = new FormData();
    form.append('submissionId', 'sub-1');

    try {
      await expect(
        action({
          request: new Request(
            'https://example.com/api/domain/grade-essay-ai',
            { method: 'POST', body: form }
          ),
        } as any)
      ).rejects.toThrow(
        'Submission activity recording is temporarily unavailable'
      );
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.submission.update).toHaveBeenCalledTimes(1);
      expect(prisma.submissionGradingAssistantRun.create).toHaveBeenCalledTimes(
        1
      );
      expect(prisma.submissionActivity.create).not.toHaveBeenCalled();
    } finally {
      if (previous === undefined) {
        delete process.env.SUBMISSION_ACTIVITY_WRITES_ENABLED;
      } else {
        process.env.SUBMISSION_ACTIVITY_WRITES_ENABLED = previous;
      }
    }
  });

  test('never stores a cross-tenant admin membership as AI grader attribution', async () => {
    getGradingActor.mockResolvedValue({
      userId: 'admin-user',
      membershipId: 'admin-membership',
      organizationId: 'admin-org',
      teacherProfileId: null,
      isTeacher: false,
      isAdmin: true,
    });
    const base = mockSubmission();
    prisma.submission.findFirst.mockResolvedValue({
      ...base,
      document: {
        ...(base.document as Record<string, unknown>),
        membership: {
          ...(base.document.membership as Record<string, unknown>),
          userId: 'student-user',
          organizationId: 'org-1',
        },
      },
    });

    const form = new FormData();
    form.append('submissionId', 'sub-1');
    const response = await action({
      request: new Request('https://example.com/api/domain/grade-essay-ai', {
        method: 'POST',
        body: form,
      }),
    } as any);

    expect((response as { data: { success: boolean } }).data.success).toBe(
      true
    );
    expect(prisma.submission.update.mock.calls[0][0].data).toEqual(
      expect.objectContaining({ gradedByMembershipId: null })
    );
    expect(prisma.submissionActivity.create.mock.calls[0][0].data).toEqual(
      expect.objectContaining({
        organizationId: 'org-1',
        actorMembershipId: null,
      })
    );
  });

  test('returns 409 and rolls back activity when a general AI grade is stale', async () => {
    prisma.submission.findFirst.mockResolvedValue(mockSubmission());
    prisma.submission.update.mockRejectedValue({ code: 'P2025' });

    const form = new FormData();
    form.append('submissionId', 'sub-1');
    const response = await action({
      request: new Request('https://example.com/api/domain/grade-essay-ai', {
        method: 'POST',
        body: form,
      }),
    } as any);

    expect((response as { init?: { status?: number } }).init?.status).toBe(409);
    expect(prisma.submissionGradingAssistantRun.create).not.toHaveBeenCalled();
    expect(prisma.submissionActivity.create).not.toHaveBeenCalled();
  });

  test('records every persisted assistant run even when its grade values are unchanged', async () => {
    const category = {
      key: 'daily_habit',
      label: 'Daily Habit',
      description: 'Did the student write today?',
      weight: 1,
      grammarHighlighting: false,
    };
    prisma.assignmentType.findUnique.mockResolvedValue(
      mockAssignmentType({
        rubricJson: { categories: [category] },
        gradingPromptConfigJson: {
          gradingInstructions: 'Grade against this rubric.',
        },
      })
    );
    getLLMCompletion.mockReset();
    getLLMCompletion.mockResolvedValueOnce(
      JSON.stringify({
        categories: [
          {
            key: 'daily_habit',
            score: 3,
            comment: 'Comment for daily_habit',
          },
        ],
        overallComment: 'Jordan, this draft has clear progress.',
      })
    );
    prisma.submission.findFirst.mockResolvedValue(
      mockSubmission({
        gradedAt: new Date('2026-08-19T10:00:00.000Z'),
        rubricScores: {
          daily_habit: {
            score: 3,
            comment: 'Comment for daily_habit',
            isAi: true,
          },
        },
        overallScore: 3,
        overallComment: 'Jordan, this draft has clear progress.',
        numericPercentage: 79,
        letterGrade: 'C',
        score: '79% (C)',
        grammarIssues: { version: 1, issues: [] },
      })
    );

    const form = new FormData();
    form.append('submissionId', 'sub-1');
    const response = await action({
      request: new Request('https://example.com/api/domain/grade-essay-ai', {
        method: 'POST',
        body: form,
      }),
    } as any);

    expect((response as { data: { success: boolean } }).data.success).toBe(
      true
    );
    expect(prisma.submissionGradingAssistantRun.create).toHaveBeenCalledTimes(
      1
    );
    expect(prisma.submissionActivity.create).toHaveBeenCalledTimes(1);
    expect(prisma.submissionActivity.create.mock.calls[0][0].data).toEqual(
      expect.objectContaining({
        eventType: 'submission.grading_assistant_updated',
        changes: {},
        metadata: expect.objectContaining({
          gradingAssistantRunId: 'ga-run-1',
        }),
      })
    );
  });

  test('starts the grading deadline before request preflight work', async () => {
    const originalTimeout = AbortSignal.timeout;
    const timeout = mock((milliseconds: number) =>
      originalTimeout.call(AbortSignal, milliseconds)
    );
    Object.defineProperty(AbortSignal, 'timeout', {
      configurable: true,
      value: timeout,
    });
    getGradingActor.mockImplementationOnce(async () => {
      expect(timeout).toHaveBeenCalledWith(100_000);
      return {
        membershipId: 'teacher-1',
        teacherProfileId: 'teacher-1',
        isTeacher: true,
        isAdmin: false,
      };
    });
    prisma.submission.findFirst.mockResolvedValue(
      mockSubmission({ id: 'sub-action-deadline' })
    );

    const form = new FormData();
    form.append('submissionId', 'sub-action-deadline');

    try {
      const response = await action({
        request: new Request('https://example.com/api/domain/grade-essay-ai', {
          method: 'POST',
          body: form,
        }),
      } as any);
      expect((response as { data: { success: boolean } }).data.success).toBe(
        true
      );
    } finally {
      Object.defineProperty(AbortSignal, 'timeout', {
        configurable: true,
        value: originalTimeout,
      });
    }
  });

  test('returns a retry signal without persisting when fallback retry is requested', async () => {
    getLLMCompletion.mockReset();
    getLLMCompletion.mockImplementationOnce(() => {
      throw new LlmFallbackRetrySignal({
        reason: 'status:529',
        retryableStatus: 529,
        fallbackModel: 'gpt-4o-mini',
      });
    });
    prisma.submission.findFirst.mockResolvedValue(
      mockSubmission({ id: 'sub-retry' })
    );

    const form = new FormData();
    form.append('submissionId', 'sub-retry');

    const response = (await action({
      request: new Request('https://example.com/api/domain/grade-essay-ai', {
        method: 'POST',
        body: form,
      }),
    } as any)) as {
      init?: { status?: number };
      data: Record<string, unknown>;
    };

    expect(response.init?.status).toBe(202);
    expect(response.data.retrying).toBe(true);
    expect(prisma.submission.update).not.toHaveBeenCalled();
    expect(prisma.submissionGradingAssistantRun.create).not.toHaveBeenCalled();
  });

  test('forces fallback model on retry requests', async () => {
    prisma.submission.findFirst.mockResolvedValue(
      mockSubmission({ id: 'sub-fallback' })
    );

    const form = new FormData();
    form.append('submissionId', 'sub-fallback');
    form.append('llmRetry', 'fallback');

    await action({
      request: new Request('https://example.com/api/domain/grade-essay-ai', {
        method: 'POST',
        body: form,
      }),
    } as any);

    expect(getLLMCompletion).toHaveBeenCalled();
    for (const call of getLLMCompletion.mock.calls) {
      expect(call[0]).toMatchObject({
        forceFallback: true,
        signalFallbackRetry: false,
      });
    }
  });

  test('uses one abort signal for every grading model call', async () => {
    prisma.submission.findFirst.mockResolvedValue(
      mockSubmission({ id: 'sub-deadline-signal' })
    );

    const form = new FormData();
    form.append('submissionId', 'sub-deadline-signal');

    await action({
      request: new Request('https://example.com/api/domain/grade-essay-ai', {
        method: 'POST',
        body: form,
      }),
    } as any);

    const signals = getLLMCompletion.mock.calls.map((call) => call[0]?.signal);
    expect(signals.length).toBeGreaterThan(1);
    expect(signals.every((signal) => signal instanceof AbortSignal)).toBe(true);
    expect(new Set(signals).size).toBe(1);
  });

  test('returns structured JSON without persisting when grading times out', async () => {
    getLLMCompletion.mockReset();
    const expiredSignal = AbortSignal.timeout(0);
    await new Promise((resolve) => setTimeout(resolve, 1));
    getLLMCompletion.mockRejectedValueOnce(expiredSignal.reason);
    prisma.submission.findFirst.mockResolvedValue(
      mockSubmission({ id: 'sub-deadline-exceeded' })
    );

    const form = new FormData();
    form.append('submissionId', 'sub-deadline-exceeded');

    const response = (await action({
      request: new Request('https://example.com/api/domain/grade-essay-ai', {
        method: 'POST',
        body: form,
      }),
    } as any)) as {
      init?: { status?: number };
      data: Record<string, unknown>;
    };

    expect(response.init?.status).toBe(504);
    expect(response.data).toEqual({
      success: false,
      code: 'GRADING_REQUEST_TIMEOUT',
      message: 'Grading took too long. Please try again.',
    });
    expect(prisma.submission.update).not.toHaveBeenCalled();
    expect(prisma.submissionGradingAssistantRun.create).not.toHaveBeenCalled();
  });

  test('filters submission access through assignment class relation', async () => {
    buildTeacherClassWhere.mockReturnValue({
      assignment: {
        class: {
          teachers: { some: { id: 'teacher-profile-1' } },
        },
      },
    });
    prisma.submission.findFirst.mockResolvedValue(
      mockSubmission({ id: 'sub-1' })
    );

    const form = new FormData();
    form.append('submissionId', 'sub-1');

    await action({
      request: new Request('https://example.com/api/domain/grade-essay-ai', {
        method: 'POST',
        body: form,
      }),
    } as any);

    expect(prisma.submission.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          document: {
            is: {
              deletedAt: null,
              assignment: {
                class: {
                  teachers: { some: { id: 'teacher-profile-1' } },
                },
              },
            },
          },
        }),
      })
    );
  });

  test('uses the updated rubric instructions in the grading prompt', async () => {
    prisma.submission.findFirst.mockResolvedValue(
      mockSubmission({ id: 'sub-2' })
    );

    const form = new FormData();
    form.append('submissionId', 'sub-2');

    await action({
      request: new Request('https://example.com/api/domain/grade-essay-ai', {
        method: 'POST',
        body: form,
      }),
    } as any);

    const firstCallArgs = getLLMCompletion.mock.calls[0]?.[0];
    const prompt = firstCallArgs?.messages?.[0]?.content;

    expect(prompt).toContain('Philosophy Note');
    expect(prompt).toContain('Technical perfection without compelling content');
    expect(prompt).toContain('Thesis/Content (25%)');
    expect(prompt).toContain('Organization/Structure (25%)');
    expect(prompt).toContain('Evidence/Support (20%)');
    expect(prompt).toContain('Voice/Style (20%)');
    expect(prompt).toContain('Grammar/Syntax/Formatting (10%)');
    expect(prompt).toContain(
      'To calculate final grade, multiply each category score by its weight and sum the results.'
    );
  });

  test('includes the assignment prompt in the legacy-split/preset grading prompt, before the essay text', async () => {
    prisma.submission.findFirst.mockResolvedValue(
      mockSubmission({
        id: 'sub-prompt-1',
        document: {
          id: 'doc-prompt-1',
          membershipId: 'student-profile-1',
          assignmentTypeId: 'assignment-type-legacy',
          assignmentType: {
            id: 'assignment-type-legacy',
            kind: null,
            title: 'Critical Essay',
          },
          assignment: {
            id: 'assignment-1',
            gradingAssistantStrictnessLevel: 'intermediate',
            prompt:
              'Write a thesis-driven essay analyzing the theme of ambition in Macbeth.',
          },
          classAssignment: { class: { schoolId: 'school-1' } },
          membership: {
            classesAsStudent: [],
            user: { name: 'Jordan Student' },
          },
        },
      })
    );

    const form = new FormData();
    form.append('submissionId', 'sub-prompt-1');

    await action({
      request: new Request('https://example.com/api/domain/grade-essay-ai', {
        method: 'POST',
        body: form,
      }),
    } as any);

    const prompt = getLLMCompletion.mock.calls[0]?.[0]?.messages?.[0]?.content;

    expect(prompt).toContain(
      'Write a thesis-driven essay analyzing the theme of ambition in Macbeth.'
    );
    const promptIndex = prompt.indexOf('Assignment prompt:');
    const essayIndex = prompt.indexOf('Essay:');
    expect(promptIndex).toBeGreaterThan(-1);
    expect(essayIndex).toBeGreaterThan(-1);
    expect(promptIndex).toBeLessThan(essayIndex);
  });

  test('pins the exact composed user prompt shape for the legacy-split/preset branch', async () => {
    prisma.submission.findFirst.mockResolvedValue(
      mockSubmission({
        id: 'sub-prompt-pin',
        document: {
          id: 'doc-prompt-pin',
          membershipId: 'student-profile-1',
          assignmentTypeId: 'assignment-type-legacy',
          assignmentType: {
            id: 'assignment-type-legacy',
            kind: null,
            title: 'Critical Essay',
          },
          assignment: {
            id: 'assignment-pin',
            gradingAssistantStrictnessLevel: 'intermediate',
            prompt: 'Analyze the theme of ambition in Macbeth.',
          },
          classAssignment: { class: { schoolId: 'school-1' } },
          membership: {
            classesAsStudent: [],
            user: { name: 'Jordan Student' },
          },
        },
      })
    );

    const form = new FormData();
    form.append('submissionId', 'sub-prompt-pin');

    await action({
      request: new Request('https://example.com/api/domain/grade-essay-ai', {
        method: 'POST',
        body: form,
      }),
    } as any);

    const prompt = getLLMCompletion.mock.calls[0]?.[0]?.messages?.[0]?.content;

    // Locks the section order so a future edit can't silently drop or
    // reorder the assignment prompt relative to the essay text.
    const rubricInstructionsIndex = prompt.indexOf('Rubric Instructions:');
    const assignmentPromptIndex = prompt.indexOf('Assignment prompt:');
    const essayIndex = prompt.indexOf('Essay:');

    expect(prompt.startsWith('Student first name: Jordan')).toBe(true);
    expect(rubricInstructionsIndex).toBeGreaterThan(-1);
    expect(assignmentPromptIndex).toBeGreaterThan(rubricInstructionsIndex);
    expect(essayIndex).toBeGreaterThan(assignmentPromptIndex);
    expect(prompt.slice(assignmentPromptIndex, essayIndex).trim()).toBe(
      'Assignment prompt: Analyze the theme of ambition in Macbeth.'
    );
    expect(prompt.slice(essayIndex)).toBe('Essay:\nFrozen AI essay text');
  });

  test('includes the assignment prompt in the unified grading prompt, before the essay text', async () => {
    prisma.assignmentType.findUnique.mockResolvedValue(
      mockAssignmentType({
        gradingPromptConfigJson: {
          gradingInstructions: 'Grade against this rubric.',
        },
        rubricJson: {
          categories: [
            {
              key: 'claim',
              label: 'Claim',
              description: 'A clear defensible claim.',
              weight: 1,
            },
          ],
        },
      })
    );
    prisma.submission.findFirst.mockResolvedValue(
      mockSubmission({
        id: 'sub-prompt-2',
        document: {
          id: 'doc-prompt-2',
          membershipId: 'student-profile-1',
          assignmentTypeId: 'assignment-type-legacy',
          assignmentType: {
            id: 'assignment-type-legacy',
            kind: null,
            title: 'Critical Essay',
          },
          assignment: {
            id: 'assignment-2',
            gradingAssistantStrictnessLevel: 'intermediate',
            prompt: 'Compare and contrast two poems from the unit.',
          },
          classAssignment: { class: { schoolId: 'school-1' } },
          membership: {
            classesAsStudent: [],
            user: { name: 'Jordan Student' },
          },
        },
      })
    );

    const form = new FormData();
    form.append('submissionId', 'sub-prompt-2');

    await action({
      request: new Request('https://example.com/api/domain/grade-essay-ai', {
        method: 'POST',
        body: form,
      }),
    } as any);

    const prompt = getLLMCompletion.mock.calls[0]?.[0]?.messages?.[0]?.content;

    expect(prompt).toContain('Compare and contrast two poems from the unit.');
    const promptIndex = prompt.indexOf('Assignment prompt:');
    const essayIndex = prompt.indexOf('Essay:');
    expect(promptIndex).toBeGreaterThan(-1);
    expect(essayIndex).toBeGreaterThan(-1);
    expect(promptIndex).toBeLessThan(essayIndex);
  });

  test('says explicitly when the assignment has no prompt, instead of an empty section', async () => {
    prisma.submission.findFirst.mockResolvedValue(
      mockSubmission({
        id: 'sub-prompt-3',
        document: {
          id: 'doc-prompt-3',
          membershipId: 'student-profile-1',
          assignmentTypeId: 'assignment-type-legacy',
          assignmentType: {
            id: 'assignment-type-legacy',
            kind: null,
            title: 'Critical Essay',
          },
          assignment: {
            id: 'assignment-3',
            gradingAssistantStrictnessLevel: 'intermediate',
            prompt: '',
          },
          classAssignment: { class: { schoolId: 'school-1' } },
          membership: {
            classesAsStudent: [],
            user: { name: 'Jordan Student' },
          },
        },
      })
    );

    const form = new FormData();
    form.append('submissionId', 'sub-prompt-3');

    await action({
      request: new Request('https://example.com/api/domain/grade-essay-ai', {
        method: 'POST',
        body: form,
      }),
    } as any);

    const prompt = getLLMCompletion.mock.calls[0]?.[0]?.messages?.[0]?.content;

    expect(prompt).toContain(
      'Assignment prompt: No assignment prompt was provided.'
    );
  });

  test('uses assignment-type-owned ACT Writing grading config and records snapshots', async () => {
    getLLMCompletion.mockReset();
    getLLMCompletion
      .mockResolvedValueOnce(
        JSON.stringify({
          categories: [
            {
              key: 'ideas_and_analysis',
              score: 5,
              comment: 'Clear perspective with relevant analysis.',
            },
            {
              key: 'development_and_support',
              score: 5,
              comment: 'Examples support the main claim.',
            },
            {
              key: 'organization',
              score: 5,
              comment: 'The response is logically sequenced.',
            },
            {
              key: 'language_use_and_conventions',
              score: 5,
              comment: 'Language choices are clear.',
            },
          ],
          overallComment:
            'Jordan, this ACT response is clear and consistently developed.',
        })
      )
      .mockResolvedValueOnce(JSON.stringify({ issues: [] }));
    prisma.assignmentType.findUnique.mockResolvedValue(
      mockAssignmentType({
        id: 'assignment-type-act',
        title: 'ACT Writing',
        kind: 'act_writing',
        scoringScaleJson: {
          type: 'act_writing_2_12',
          minScore: 1,
          maxScore: 6,
        },
        rubricJson: {
          categories: [
            {
              key: 'ideas_and_analysis',
              label: 'Ideas and Analysis',
              description:
                'Generate productive ideas and analyze perspectives.',
              weight: 0.25,
            },
            {
              key: 'development_and_support',
              label: 'Development and Support',
              description: 'Develop claims with reasoning and examples.',
              weight: 0.25,
            },
            {
              key: 'organization',
              label: 'Organization',
              description: 'Organize the response purposefully.',
              weight: 0.25,
            },
            {
              key: 'language_use_and_conventions',
              label: 'Language Use and Conventions',
              description: 'Use language and conventions to support clarity.',
              weight: 0.25,
            },
          ],
        },
        gradingPromptConfigJson: {
          systemInstructions:
            'Grade this as ACT Writing with four rubric domains and no thesis-driven essay categories.',
          scoreInstructions: 'Scores must be integers 1-6 for each ACT domain.',
        },
        gradingOutputSchemaJson: { schemaVersion: 1 },
        gradingCalibrationNotes: 'Pilot ACT template.',
        gradingAssistantVersion: 3,
        gradingAssistantSourceTemplateId: 'template-act',
        gradingAssistantSourceTemplateSlug: 'act-writing-four-domain',
      })
    );
    prisma.submission.findFirst.mockResolvedValue(
      mockSubmission({
        id: 'sub-act',
        document: {
          id: 'doc-act',
          membershipId: 'student-profile-1',
          assignmentTypeId: 'assignment-type-act',
          assignmentType: {
            id: 'assignment-type-act',
            kind: 'act_writing',
            title: 'Renamed ACT demo title',
          },
          assignment: {
            id: 'assignment-act',
            gradingAssistantStrictnessLevel: 'advanced',
          },
          classAssignment: { class: { schoolId: 'school-1' } },
          membership: {
            classesAsStudent: [],
            user: { name: 'Jordan Student' },
          },
        },
      })
    );

    const form = new FormData();
    form.append('submissionId', 'sub-act');

    const response = await action({
      request: new Request('https://example.com/api/domain/grade-essay-ai', {
        method: 'POST',
        body: form,
      }),
    } as any);
    const payload = (response as { data: Record<string, unknown> }).data;
    const firstCallArgs = getLLMCompletion.mock.calls[0]?.[0];
    const prompt = firstCallArgs?.messages?.[0]?.content;
    const updateCall = prisma.submission.update.mock.calls[0]?.[0];
    const runCall =
      prisma.submissionGradingAssistantRun.create.mock.calls[0]?.[0];

    expect(payload.success).toBe(true);
    expect(prompt).toContain('ACT Writing');
    expect(prompt).toContain('Assignment type grading config: ACT Writing');
    expect(prompt).not.toContain('Grading assistant template:');
    expect(prompt).toContain('Grading assistant strictness: Advanced');
    expect(prompt).toContain('Ideas and Analysis (25%)');
    expect(prompt).not.toContain('Thesis/Content');
    expect(
      (payload.rubricConfig as { source?: string } | undefined)?.source
    ).toBe('assignment-type');
    expect(Object.keys(payload.rubricScores ?? {})).toEqual([
      'ideas_and_analysis',
      'development_and_support',
      'organization',
      'language_use_and_conventions',
    ]);
    expect(payload.overallScore).toBe(9);
    expect(payload.score).toBe('9/12');
    expect(updateCall.data.aiMeta).toMatchObject({
      gradingConfigSource: 'assignment-type',
      assignmentTypeRubricSource: 'assignment-type',
      assignmentTypeGradingVersion: 3,
      assignmentTypeGradingLabel: 'ACT Writing',
      assignmentTypeSourceTemplateId: 'template-act',
      assignmentTypeSourceTemplateSlug: 'act-writing-four-domain',
      gradingAssistantStrictnessLevel: 'advanced',
      rubricCategoryKeys: [
        'ideas_and_analysis',
        'development_and_support',
        'organization',
        'language_use_and_conventions',
      ],
    });
    expect(runCall.data).toMatchObject({
      submissionId: 'sub-act',
      assignmentTypeId: 'assignment-type-act',
      assignmentTypeGradingVersion: 3,
      source: 'assignment-type',
      status: 'succeeded',
      assignmentTypePromptConfigSnapshot: {
        systemInstructions:
          'Grade this as ACT Writing with four rubric domains and no thesis-driven essay categories.',
        scoreInstructions: 'Scores must be integers 1-6 for each ACT domain.',
      },
    });
    expect(runCall.data.assignmentTypeRubricSnapshot.categories).toHaveLength(
      4
    );
    expect(runCall.data.metadata).toMatchObject({
      assignmentTypeGradingLabel: 'ACT Writing',
      assignmentTypeRubricSource: 'assignment-type',
      assignmentTypeSourceTemplateSlug: 'act-writing-four-domain',
      gradingAssistantStrictnessLevel: 'advanced',
      assignmentId: 'assignment-act',
      rubricCategoryKeys: [
        'ideas_and_analysis',
        'development_and_support',
        'organization',
        'language_use_and_conventions',
      ],
    });
    expect(firstCallArgs?.metadata).toMatchObject({
      assignmentTypeRubricSource: 'assignment-type',
      assignmentTypeGradingVersion: 3,
      assignmentTypeId: 'assignment-type-act',
      rubricCategoryKeys: [
        'ideas_and_analysis',
        'development_and_support',
        'organization',
        'language_use_and_conventions',
      ],
    });
  });

  test('adjusts only the overall grade number for each strictness level', async () => {
    const cases = [
      { level: 'beginner', expectedPercentage: 84 },
      { level: 'intermediate', expectedPercentage: 79 },
      { level: 'advanced', expectedPercentage: 74 },
    ] as const;

    for (const strictnessCase of cases) {
      getLLMCompletion.mockReset();
      prisma.submission.findFirst.mockReset();
      prisma.submission.update.mockReset();
      prisma.submissionGradingAssistantRun.create.mockReset();
      prisma.assignmentType.findUnique.mockResolvedValue(mockAssignmentType());
      prisma.submission.update.mockResolvedValue({
        id: `sub-${strictnessCase.level}`,
      });
      prisma.submissionGradingAssistantRun.create.mockResolvedValue({
        id: `ga-run-${strictnessCase.level}`,
      });
      getLLMCompletion
        .mockResolvedValueOnce(buildRubricResponseJson())
        .mockResolvedValueOnce(JSON.stringify({ issues: [] }));
      prisma.submission.findFirst.mockResolvedValue(
        mockSubmission({
          id: `sub-${strictnessCase.level}`,
          document: {
            id: `doc-${strictnessCase.level}`,
            membershipId: 'student-profile-1',
            assignmentTypeId: 'assignment-type-legacy',
            assignmentType: {
              id: 'assignment-type-legacy',
              kind: null,
              title: 'Critical Essay',
            },
            assignment: {
              id: `assignment-${strictnessCase.level}`,
              gradingAssistantStrictnessLevel: strictnessCase.level,
            },
            classAssignment: { class: { schoolId: 'school-1' } },
            membership: {
              classesAsStudent: [],
              user: { name: 'Jordan Student' },
            },
          },
        })
      );

      const form = new FormData();
      form.append('submissionId', `sub-${strictnessCase.level}`);

      const response = await action({
        request: new Request('https://example.com/api/domain/grade-essay-ai', {
          method: 'POST',
          body: form,
        }),
      } as any);

      const payload = (response as { data: Record<string, unknown> }).data;
      const prompt =
        getLLMCompletion.mock.calls[0]?.[0]?.messages?.[0]?.content;
      const updateCall = prisma.submission.update.mock.calls[0]?.[0];
      const runCall =
        prisma.submissionGradingAssistantRun.create.mock.calls[0]?.[0];

      expect(payload.success).toBe(true);
      expect(prompt).toContain(`Grading assistant strictness: ${strictnessCase.level[0].toUpperCase()}${strictnessCase.level.slice(1)}`);
      expect(payload.numericPercentage).toBe(strictnessCase.expectedPercentage);
      expect(updateCall.data.numericPercentage).toBe(
        strictnessCase.expectedPercentage
      );
      expect(updateCall.data.aiMeta).toMatchObject({
        gradingAssistantStrictnessLevel: strictnessCase.level,
      });
      expect(runCall.data.metadata).toMatchObject({
        assignmentId: `assignment-${strictnessCase.level}`,
        gradingAssistantStrictnessLevel: strictnessCase.level,
      });
    }
  });

  test('returns numeric percentage using the updated category weights', async () => {
    getLLMCompletion.mockReset();
    getLLMCompletion
      .mockResolvedValueOnce(
        buildRubricResponseJson({
          thesis_and_content: 5,
          organization_and_structure: 1,
          evidence_and_support: 5,
          voice_and_style: 1,
          grammar_and_mechanics: 1,
        })
      )
      .mockResolvedValueOnce(
        JSON.stringify({
          issues: [
            {
              excerpt: 'Frozen',
              kind: 'error',
              message: 'This phrase needs a stronger verb choice.',
            },
          ],
        })
      );

    prisma.submission.findFirst.mockResolvedValue(
      mockSubmission({ id: 'sub-3' })
    );

    const form = new FormData();
    form.append('submissionId', 'sub-3');

    const response = await action({
      request: new Request('https://example.com/api/domain/grade-essay-ai', {
        method: 'POST',
        body: form,
      }),
    } as any);
    const payload = (response as { data: Record<string, unknown> }).data;

    expect(payload.numericPercentage).toBe(77);
    expect(payload.letterGrade).toBe('C');
    expect(payload.score).toBe('77% (C)');
  });

  test('grades AP History DBQ submissions with AP rubric points and skips grammar pass', async () => {
    getLLMCompletion.mockReset();
    getLLMCompletion.mockResolvedValueOnce(
      JSON.stringify({
        rubricVersion: 'ap-history-dbq-2026',
        points: {
          thesis: {
            earned: true,
            comment: 'The thesis makes a historically defensible claim.',
          },
          contextualization: {
            earned: true,
            comment:
              'The essay places Reconstruction in the Civil War context.',
          },
          document_use_describes: {
            earned: true,
            comment:
              'The essay accurately describes evidence from the documents.',
          },
          document_use_supports_argument: {
            earned: false,
            comment:
              'The documents are not yet tied consistently to the argument.',
          },
          outside_evidence: {
            earned: true,
            comment: 'The essay uses the Freedmen Bureau as outside evidence.',
          },
          sourcing: {
            earned: false,
            comment:
              'The essay needs clearer sourcing of document perspective.',
          },
          complexity: {
            earned: false,
            comment: 'The essay does not yet develop a complex argument.',
          },
        },
        overallComment:
          'Jordan, your DBQ establishes a defensible line of reasoning and should connect document evidence more directly to the argument.',
      })
    );

    prisma.submission.findFirst.mockResolvedValue(
      mockSubmission({
        id: 'ap-sub-1',
        text: 'Reconstruction changed political rights through amendments and federal enforcement.',
        document: {
          id: 'ap-doc-1',
          membershipId: 'student-profile-1',
          assignmentTypeId: 'ap-history-type',
          assignmentType: {
            id: 'ap-history-type',
            kind: null,
            title: 'AP History Essay',
          },
          assignment: {
            apHistorySnapshot: dbqSnapshot,
            class: { schoolId: 'school-1' },
          },
          membership: {
            classesAsStudent: [],
            user: { name: 'Jordan Student' },
          },
        },
      })
    );
    prisma.assignmentType.findUnique.mockResolvedValue(
      mockAssignmentType({
        id: 'ap-history-type',
        title: 'AP History Essay',
        gradingPromptConfigJson: {
          gradingInstructionsOverride:
            'Prioritize accurate sourcing before awarding the complexity point.',
        },
      })
    );

    const form = new FormData();
    form.append('submissionId', 'ap-sub-1');

    const response = await action({
      request: new Request('https://example.com/api/domain/grade-essay-ai', {
        method: 'POST',
        body: form,
      }),
    } as any);
    const payload = (response as { data: Record<string, unknown> }).data;

    expect(getLLMCompletion).toHaveBeenCalledTimes(1);
    const firstCallArgs = getLLMCompletion.mock.calls[0]?.[0];
    const system = firstCallArgs?.system;
    const prompt = firstCallArgs?.messages?.[0]?.content;
    expect(system).toContain('Return ONLY valid JSON with the schema');
    expect(system).toContain('"rubricVersion": "ap-history-dbq-2026"');
    expect(prompt).toContain('APUSH DBQ');
    expect(prompt).toContain(dbqSnapshot.prompt);
    expect(prompt).toContain('Period: Period 5: 1844-1877 (Period 5)');
    expect(prompt).toContain('Reasoning skill: Causation');
    expect(prompt).toContain('Rubric: ap-history-dbq-2026');
    expect(prompt).toContain('Total points: 7');
    expect(prompt).toContain('Grading instructions:');
    expect(prompt).toContain(
      'Prioritize accurate sourcing before awarding the complexity point.'
    );
    expect(prompt).toContain('Document 1: Fourteenth Amendment');
    expect(prompt).toContain(
      'Body: All persons born or naturalized in the United States are citizens.'
    );
    expect(prompt).toContain(
      'Reconstruction changed political rights through amendments and federal enforcement.'
    );
    expect(firstCallArgs?.metadata).toMatchObject({
      feature: 'grading',
      kind: 'ap-history-rubric',
      rubricId: 'ap-history-dbq-2026',
      essayType: 'dbq',
      assignmentTypeId: 'ap-history-type',
      assignmentTypeRubricSource: 'ap-history-snapshot',
      rubricCategoryKeys: [
        'thesis',
        'contextualization',
        'document_use_describes',
        'document_use_supports_argument',
        'outside_evidence',
        'sourcing',
        'complexity',
      ],
      documentSource: 'submission-snapshot',
      documentId: 'ap-doc-1',
      submissionId: 'ap-sub-1',
      documentTextLength: 83,
      documentTextSha256:
        '624d299a9fafbd01f2c77254380a20dfe4bf111c70eb9044456083878e6c0181',
    });

    expect(prisma.submission.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          document: expect.objectContaining({
            select: expect.objectContaining({
              assignment: {
                select: expect.objectContaining({
                  apHistorySnapshot: true,
                }),
              },
            }),
          }),
        }),
      })
    );

    expect(payload.success).toBe(true);
    expect(payload.grammarIssues).toBeNull();
    expect(payload.rubricScores).toEqual({
      schemaVersion: 1,
      rubricId: 'ap-history-dbq-2026',
      totalPoints: 7,
      earnedPoints: 4,
      points: {
        thesis: {
          earned: true,
          comment: 'The thesis makes a historically defensible claim.',
        },
        contextualization: {
          earned: true,
          comment: 'The essay places Reconstruction in the Civil War context.',
        },
        document_use_describes: {
          earned: true,
          comment:
            'The essay accurately describes evidence from the documents.',
        },
        document_use_supports_argument: {
          earned: false,
          comment:
            'The documents are not yet tied consistently to the argument.',
        },
        outside_evidence: {
          earned: true,
          comment: 'The essay uses the Freedmen Bureau as outside evidence.',
        },
        sourcing: {
          earned: false,
          comment: 'The essay needs clearer sourcing of document perspective.',
        },
        complexity: {
          earned: false,
          comment: 'The essay does not yet develop a complex argument.',
        },
      },
    });
    const updateData = prisma.submission.update.mock.calls[0]?.[0]?.data;
    expect(updateData).toEqual(
      expect.objectContaining({
        rubricScores: payload.rubricScores,
        aiMeta: expect.objectContaining({
          rubricMode: 'ap_history',
          documentContext: {
            documentSource: 'submission-snapshot',
            documentId: 'ap-doc-1',
            submissionId: 'ap-sub-1',
            documentTextLength: 83,
            documentTextSha256:
              '624d299a9fafbd01f2c77254380a20dfe4bf111c70eb9044456083878e6c0181',
          },
        }),
      })
    );
    expect(Object.hasOwn(updateData, 'grammarIssues')).toBe(false);
  });

  test('records an AP History assistant rerun when identical grade values still persist', async () => {
    const modelOutput = JSON.stringify({
      rubricVersion: 'ap-history-dbq-2026',
      points: {
        thesis: { earned: true, comment: 'Defensible thesis.' },
        contextualization: { earned: false, comment: 'Needs context.' },
        document_use_describes: {
          earned: false,
          comment: 'Needs document description.',
        },
        document_use_supports_argument: {
          earned: false,
          comment: 'Needs document support.',
        },
        outside_evidence: { earned: false, comment: 'Needs evidence.' },
        sourcing: { earned: false, comment: 'Needs sourcing.' },
        complexity: { earned: false, comment: 'Needs complexity.' },
      },
      overallComment: 'Jordan, keep developing the AP History response.',
    });
    const apDocument = {
      id: 'ap-repeat-doc',
      membershipId: 'student-profile-1',
      assignmentTypeId: 'ap-history-type',
      assignmentType: {
        id: 'ap-history-type',
        kind: null,
        title: 'AP History Essay',
      },
      assignment: {
        apHistorySnapshot: dbqSnapshot,
        class: { schoolId: 'school-1' },
      },
      membership: {
        organizationId: 'org-1',
        organization: { submissionActivityEnabled: true },
        classesAsStudent: [],
        user: { name: 'Jordan Student' },
      },
    };

    getLLMCompletion.mockReset();
    getLLMCompletion.mockResolvedValueOnce(modelOutput);
    prisma.submission.findFirst.mockResolvedValueOnce(
      mockSubmission({
        id: 'ap-repeat-sub',
        text: 'A repeated AP response.',
        document: apDocument,
      })
    );
    const form = new FormData();
    form.append('submissionId', 'ap-repeat-sub');
    await action({
      request: new Request('https://example.com/api/domain/grade-essay-ai', {
        method: 'POST',
        body: form,
      }),
    } as any);
    const persistedGrade = prisma.submission.update.mock.calls.at(-1)?.[0].data;

    getLLMCompletion.mockResolvedValueOnce(modelOutput);
    prisma.submissionActivity.create.mockReset();
    prisma.submission.findFirst.mockResolvedValueOnce(
      mockSubmission({
        id: 'ap-repeat-sub',
        text: 'A repeated AP response.',
        ...persistedGrade,
        updatedAt: new Date('2026-08-20T12:01:00.000Z'),
        document: apDocument,
      })
    );
    const repeatForm = new FormData();
    repeatForm.append('submissionId', 'ap-repeat-sub');
    const response = await action({
      request: new Request('https://example.com/api/domain/grade-essay-ai', {
        method: 'POST',
        body: repeatForm,
      }),
    } as any);

    expect((response as { data: { success: boolean } }).data.success).toBe(
      true
    );
    expect(prisma.submissionActivity.create).toHaveBeenCalledTimes(1);
    expect(prisma.submissionActivity.create.mock.calls[0][0].data).toEqual(
      expect.objectContaining({
        eventType: 'submission.grading_assistant_updated',
        changes: {},
        metadata: expect.objectContaining({
          rubricMode: 'ap_history',
          rubricId: 'ap-history-dbq-2026',
        }),
      })
    );
  });

  test('grades AP History LEQ with canonical keys, ignores DBQ-only keys, and caps scoring at snapshot total', async () => {
    getLLMCompletion.mockReset();
    getLLMCompletion.mockResolvedValueOnce(
      JSON.stringify({
        rubricVersion: 'ap-history-leq-2026',
        points: {
          thesis: {
            earned: true,
            comment: 'The thesis makes a defensible claim.',
          },
          contextualization: {
            earned: true,
            comment:
              'The essay situates the Market Revolution in the early republic.',
          },
          evidence: {
            earned: true,
            comment:
              'The essay uses specific evidence about canals and factories.',
          },
          analysis_reasoning: {
            earned: true,
            comment: 'The essay explains change over time.',
          },
          complexity: {
            earned: 'true',
            comment: 123,
          },
          document_use_describes: {
            earned: true,
            comment: 'This DBQ-only point must not count or persist for LEQ.',
          },
          sourcing: {
            earned: true,
            comment: 'This DBQ-only point must not count or persist for LEQ.',
          },
        },
        overallComment:
          'Jordan, your LEQ uses evidence effectively and should develop more complexity.',
      })
    );

    prisma.submission.findFirst.mockResolvedValue(
      mockSubmission({
        id: 'ap-leq-sub-1',
        text: 'The Market Revolution changed society through wage labor, transportation, and regional specialization.',
        document: {
          id: 'ap-leq-doc-1',
          membershipId: 'student-profile-1',
          assignment: {
            apHistorySnapshot: leqSnapshot,
            class: { schoolId: 'school-1' },
          },
          membership: {
            classesAsStudent: [],
            user: { name: 'Jordan Student' },
          },
        },
      })
    );

    const form = new FormData();
    form.append('submissionId', 'ap-leq-sub-1');

    const response = await action({
      request: new Request('https://example.com/api/domain/grade-essay-ai', {
        method: 'POST',
        body: form,
      }),
    } as any);
    const payload = (response as { data: Record<string, unknown> }).data;

    expect(payload.success).toBe(true);
    expect(payload.rubricScores).toEqual({
      schemaVersion: 1,
      rubricId: 'ap-history-leq-2026',
      totalPoints: 6,
      earnedPoints: 4,
      points: {
        thesis: {
          earned: true,
          comment: 'The thesis makes a defensible claim.',
        },
        contextualization: {
          earned: true,
          comment:
            'The essay situates the Market Revolution in the early republic.',
        },
        evidence: {
          earned: true,
          comment:
            'The essay uses specific evidence about canals and factories.',
        },
        analysis_reasoning: {
          earned: true,
          comment: 'The essay explains change over time.',
        },
        complexity: {
          earned: false,
          comment: '',
        },
        supporting_evidence: {
          earned: false,
          comment: '',
        },
      },
    });
    expect(
      (payload.rubricScores as any).points.document_use_describes
    ).toBeUndefined();
    expect((payload.rubricScores as any).points.sourcing).toBeUndefined();
  });

  test('returns a 502 response when AP History output omits the points object', async () => {
    getLLMCompletion.mockReset();
    getLLMCompletion.mockResolvedValueOnce(
      JSON.stringify({
        rubricVersion: 'ap-history-dbq-2026',
        overallComment: 'Jordan, this AP response is missing point data.',
      })
    );

    prisma.submission.findFirst.mockResolvedValue(
      mockSubmission({
        id: 'ap-sub-malformed',
        text: 'Reconstruction changed political rights through amendments.',
        document: {
          id: 'ap-doc-malformed',
          membershipId: 'student-profile-1',
          assignment: {
            apHistorySnapshot: dbqSnapshot,
            class: { schoolId: 'school-1' },
          },
          membership: {
            classesAsStudent: [],
            user: { name: 'Jordan Student' },
          },
        },
      })
    );

    const form = new FormData();
    form.append('submissionId', 'ap-sub-malformed');

    const response = (await action({
      request: new Request('https://example.com/api/domain/grade-essay-ai', {
        method: 'POST',
        body: form,
      }),
    } as any)) as {
      init?: {
        status?: number;
      };
      data: Record<string, unknown>;
    };

    expect(response.init?.status).toBe(502);
    expect(response.data).toEqual({
      success: false,
      message: 'Grading Assistant returned malformed data. Please try again.',
    });
    expect(prisma.submission.update).not.toHaveBeenCalled();
  });

  test('lets AP History persistence failures throw normally after valid model output', async () => {
    getLLMCompletion.mockReset();
    getLLMCompletion.mockResolvedValueOnce(
      JSON.stringify({
        rubricVersion: 'ap-history-dbq-2026',
        points: {
          thesis: { earned: true, comment: 'Defensible thesis.' },
          contextualization: {
            earned: false,
            comment: 'Needs broader context.',
          },
          document_use_describes: {
            earned: false,
            comment: 'Needs documents.',
          },
          document_use_supports_argument: {
            earned: false,
            comment: 'Needs argument support.',
          },
          outside_evidence: {
            earned: false,
            comment: 'Needs outside evidence.',
          },
          sourcing: { earned: false, comment: 'Needs sourcing.' },
          complexity: { earned: false, comment: 'Needs complexity.' },
        },
        overallComment: 'Jordan, this DBQ has a defensible thesis.',
      })
    );
    prisma.submission.update.mockRejectedValueOnce(new Error('database down'));
    prisma.submission.findFirst.mockResolvedValue(
      mockSubmission({
        id: 'ap-sub-db-failure',
        text: 'Reconstruction changed political rights through amendments.',
        document: {
          id: 'ap-doc-db-failure',
          membershipId: 'student-profile-1',
          assignment: {
            apHistorySnapshot: dbqSnapshot,
            class: { schoolId: 'school-1' },
          },
          membership: {
            classesAsStudent: [],
            user: { name: 'Jordan Student' },
          },
        },
      })
    );

    const form = new FormData();
    form.append('submissionId', 'ap-sub-db-failure');

    await expect(
      action({
        request: new Request('https://example.com/api/domain/grade-essay-ai', {
          method: 'POST',
          body: form,
        }),
      } as any)
    ).rejects.toThrow('database down');
  });

  test('returns 409 and rolls back activity when an AP History AI grade is stale', async () => {
    getLLMCompletion.mockReset();
    getLLMCompletion.mockResolvedValueOnce(
      JSON.stringify({
        rubricVersion: 'ap-history-dbq-2026',
        points: {
          thesis: { earned: true, comment: 'Defensible thesis.' },
          contextualization: {
            earned: false,
            comment: 'Needs broader context.',
          },
          document_use_describes: {
            earned: false,
            comment: 'Needs documents.',
          },
          document_use_supports_argument: {
            earned: false,
            comment: 'Needs argument support.',
          },
          outside_evidence: {
            earned: false,
            comment: 'Needs outside evidence.',
          },
          sourcing: { earned: false, comment: 'Needs sourcing.' },
          complexity: { earned: false, comment: 'Needs complexity.' },
        },
        overallComment: 'Jordan, this DBQ has a defensible thesis.',
      })
    );
    prisma.submission.update.mockRejectedValueOnce({ code: 'P2025' });
    prisma.submission.findFirst.mockResolvedValue(
      mockSubmission({
        id: 'ap-sub-stale',
        text: 'Reconstruction changed political rights through amendments.',
        document: {
          id: 'ap-doc-stale',
          membershipId: 'student-profile-1',
          assignment: {
            apHistorySnapshot: dbqSnapshot,
            class: { schoolId: 'school-1' },
          },
          membership: {
            classesAsStudent: [],
            user: { name: 'Jordan Student' },
          },
        },
      })
    );

    const form = new FormData();
    form.append('submissionId', 'ap-sub-stale');
    const response = await action({
      request: new Request('https://example.com/api/domain/grade-essay-ai', {
        method: 'POST',
        body: form,
      }),
    } as any);

    expect((response as { init?: { status?: number } }).init?.status).toBe(409);
    expect(prisma.submissionGradingAssistantRun.create).not.toHaveBeenCalled();
    expect(prisma.submissionActivity.create).not.toHaveBeenCalled();
  });

  test('repairs a top-level categories array response from the model', async () => {
    getLLMCompletion.mockReset();
    getLLMCompletion
      .mockResolvedValueOnce(buildRubricCategoriesJson())
      .mockResolvedValueOnce(buildOverallCommentJson())
      .mockResolvedValueOnce(
        JSON.stringify({
          issues: [
            {
              excerpt: 'Frozen',
              kind: 'error',
              message: 'This phrase needs a stronger verb choice.',
            },
          ],
        })
      );

    prisma.submission.findFirst.mockResolvedValue(
      mockSubmission({ id: 'sub-4' })
    );

    const form = new FormData();
    form.append('submissionId', 'sub-4');

    const response = await action({
      request: new Request('https://example.com/api/domain/grade-essay-ai', {
        method: 'POST',
        body: form,
      }),
    } as any);
    const payload = (response as { data: Record<string, unknown> }).data;

    expect(payload.success).toBe(true);
    expect(payload.overallComment).toBe(
      'Jordan, this draft has clear progress and focus.'
    );
    expect(Object.keys(payload.rubricScores ?? {})).toEqual(rubricKeys);
    expect(getLLMCompletion).toHaveBeenCalledTimes(3);
  });

  test('returns a 502 response when the model returns an empty categories array', async () => {
    getLLMCompletion.mockReset();
    getLLMCompletion
      .mockResolvedValueOnce(JSON.stringify([]))
      .mockResolvedValueOnce(JSON.stringify([]));

    prisma.submission.findFirst.mockResolvedValue(
      mockSubmission({ id: 'sub-5' })
    );

    const form = new FormData();
    form.append('submissionId', 'sub-5');

    const response = (await action({
      request: new Request('https://example.com/api/domain/grade-essay-ai', {
        method: 'POST',
        body: form,
      }),
    } as any)) as {
      init?: {
        status?: number;
      };
      data: Record<string, unknown>;
    };

    expect(response.init?.status).toBe(502);
    expect(response.data).toEqual({
      success: false,
      message: 'Grading Assistant returned malformed data. Please try again.',
    });
  });

  describe('per-category grammar highlighting', () => {
    function customRubricCategory(overrides: Record<string, unknown> = {}) {
      return {
        key: 'daily_habit',
        label: 'Daily Habit',
        description: 'Did the student write today?',
        weight: 1,
        ...overrides,
      };
    }

    function mockCustomRubricSubmission(id: string) {
      return mockSubmission({
        id,
        document: {
          id: `doc-${id}`,
          membershipId: 'student-profile-1',
          assignmentTypeId: 'assignment-type-legacy',
          assignmentType: {
            id: 'assignment-type-legacy',
            kind: null,
            title: 'Daily Pages',
          },
          classAssignment: { class: { schoolId: 'school-1' } },
          membership: {
            classesAsStudent: [],
            user: { name: 'Jordan Student' },
          },
        },
      });
    }

    async function gradeWithCategories(
      id: string,
      categories: Record<string, unknown>[]
    ) {
      prisma.assignmentType.findUnique.mockResolvedValue(
        mockAssignmentType({
          gradingPromptConfigJson: {
            gradingInstructions: 'Grade against this rubric.',
          },
          rubricJson: { categories },
        })
      );
      prisma.submission.findFirst.mockResolvedValue(
        mockCustomRubricSubmission(id)
      );
      getLLMCompletion.mockReset();
      getLLMCompletion
        .mockResolvedValueOnce(
          JSON.stringify({
            categories: categories.map((category) => ({
              key: category.key,
              score: 3,
              comment: `Comment for ${category.key}`,
            })),
            overallComment: 'Jordan, this draft has clear progress.',
          })
        )
        .mockResolvedValue(JSON.stringify({ issues: [] }));

      const form = new FormData();
      form.append('submissionId', id);
      await action({
        request: new Request('https://example.com/api/domain/grade-essay-ai', {
          method: 'POST',
          body: form,
        }),
      } as any);
    }

    async function gradeTimed(
      id: string,
      writingTimeMinutes: number | null,
      tutorEnabled?: boolean
    ) {
      prisma.assignmentType.findUnique.mockResolvedValue(
        mockAssignmentType({
          gradingPromptConfigJson: { gradingInstructions: 'Grade against this rubric.' },
          rubricJson: { categories: [customRubricCategory()] },
        })
      );
      const base = mockCustomRubricSubmission(id);
      const submission = {
        ...base,
        document: {
          ...base.document,
          assignment: {
            id: `assignment-${id}`,
            prompt: 'Is it possible to be honest and kind at once?',
            writingTimeMinutes,
            ...(tutorEnabled === undefined ? {} : { tutorEnabled }),
          },
        },
      };
      prisma.submission.findFirst.mockResolvedValue(submission);
      prisma.assignment.findUnique.mockResolvedValue({
        assignmentTypeId: 'assignment-type-legacy',
        rubricRevision: null,
      });
      getLLMCompletion.mockReset();
      getLLMCompletion
        .mockResolvedValueOnce(
          JSON.stringify({
            categories: [{ key: 'daily_habit', score: 5, comment: 'Clear.' }],
            overallComment: 'Jordan, this lands.',
          })
        )
        .mockResolvedValue(JSON.stringify({ issues: [] }));
      const form = new FormData();
      form.append('submissionId', id);
      await action({
        request: new Request('https://example.com/api/domain/grade-essay-ai', {
          method: 'POST',
          body: form,
        }),
      } as any);
      const byKind = (kind: string) =>
        getLLMCompletion.mock.calls.find(
          (call: any[]) => call[0]?.metadata?.kind === kind
        )?.[0];
      return { grading: byKind('rubric-evaluation'), grammar: byKind('grammar-issues') };
    }

    test('tells the grading assistant when the tutor was off: a cold write', async () => {
      const { grading } = await gradeTimed('sub-cold', 15, false);

      expect(grading.messages[0].content).toContain('Cold write:');
    });

    test('says nothing about a cold write when the tutor was on', async () => {
      const { grading } = await gradeTimed('sub-tutored', 15, true);

      expect(grading.messages[0].content).not.toContain('Cold write');
    });

    test('tells both the grading assistant and the grammar checker how long the student had', async () => {
      const { grading, grammar } = await gradeTimed('sub-timed', 10);

      expect(grading.messages[0].content).toContain('Writing time:');
      expect(grading.messages[0].content).toContain('10 minutes');
      expect(grammar.system).toContain('written in 10 minutes');
      expect(grammar.system).toMatch(/fragment used on purpose/);
      expect(grammar.messages[0].content).toContain('Written in 10 minutes');
    });

    test('without a writing time, both prompts are what they were before the setting', async () => {
      const { buildGrammarCheckerSystemPrompt } = await import(
        '~/domain/grading/writing-time'
      );
      const { grading, grammar } = await gradeTimed('sub-untimed', null);

      expect(grading.messages[0].content).not.toContain('Writing time');
      expect(grammar.system).toBe(buildGrammarCheckerSystemPrompt(null));
      expect(grammar.messages[0].content).toMatch(
        /^Essay:\n[\s\S]*\n\nReturn up to 15 issues\.$/
      );
    });

    function grammarCallCount() {
      return getLLMCompletion.mock.calls.filter(
        (call: any[]) => call[0]?.metadata?.kind === 'grammar-issues'
      ).length;
    }

    test('still runs for a custom rubric that says nothing about grammar highlighting', async () => {
      await gradeWithCategories('sub-grammar-default', [
        customRubricCategory(),
      ]);

      expect(grammarCallCount()).toBe(1);
      expect(
        prisma.submission.update.mock.calls.at(-1)?.[0].data.grammarIssues
      ).not.toBeNull();
    });

    test('is skipped entirely when every category opts out', async () => {
      await gradeWithCategories('sub-grammar-off', [
        customRubricCategory({ grammarHighlighting: false }),
      ]);

      expect(grammarCallCount()).toBe(0);
      // An empty issue set, so re-grading clears highlights an earlier run left.
      expect(
        prisma.submission.update.mock.calls.at(-1)?.[0].data.grammarIssues
      ).toEqual({ version: 1, issues: [] });
    });

    test('still runs when at least one category opts in, and the retry pass finds the custom grammar category', async () => {
      await gradeWithCategories('sub-grammar-mixed', [
        customRubricCategory({ weight: 0.5, grammarHighlighting: false }),
        customRubricCategory({
          key: 'syntax_and_style',
          label: 'Syntax and Style',
          weight: 0.5,
          grammarHighlighting: true,
        }),
      ]);

      // Two calls: the first pass, plus the low-score retry — which only fires
      // because the flagged category is now found by its flag rather than by a
      // hardcoded `grammar_and_mechanics` key match.
      expect(grammarCallCount()).toBe(2);
    });

    test('records the per-category options in the frozen rubric snapshot', async () => {
      await gradeWithCategories('sub-grammar-snapshot', [
        customRubricCategory({
          grammarHighlighting: false,
          feedbackEnabled: false,
          scoreLabels: [{ value: 3, label: 'Showed up' }],
        }),
      ]);

      const snapshot =
        prisma.submissionGradingAssistantRun.create.mock.calls.at(-1)?.[0].data
          .assignmentTypeRubricSnapshot as {
          categories: Record<string, unknown>[];
        };

      expect(snapshot.categories[0]).toMatchObject({
        key: 'daily_habit',
        grammarHighlighting: false,
        feedbackEnabled: false,
        scoreLabels: [{ value: 3, label: 'Showed up' }],
      });
    });
  });

  test('scores mixed 5- and 20-point sections as one weighted percentage', async () => {
    const bands = (max: number) => [
      { min: 0, max: 0, label: 'Absent', description: 'Missing.' },
      {
        min: 1,
        max,
        label: 'Present',
        description: 'Score inside this raw-point range.',
      },
    ];
    const categories = [
      {
        key: 'introduction',
        label: 'Introduction',
        description: 'Purposeful setup.',
        weight: 0.1,
        bands: bands(5),
        grammarHighlighting: false,
      },
      {
        key: 'country_1',
        label: 'Country 1',
        description: 'Two business-communication topics.',
        weight: 0.4,
        bands: bands(20),
        grammarHighlighting: false,
      },
      {
        key: 'country_2',
        label: 'Country 2',
        description: 'Two business-communication topics.',
        weight: 0.4,
        bands: bands(20),
        grammarHighlighting: false,
      },
      {
        key: 'conclusion',
        label: 'Conclusion',
        description: 'Comparative insight.',
        weight: 0.1,
        bands: bands(5),
        grammarHighlighting: false,
      },
    ];

    prisma.assignmentType.findUnique.mockResolvedValue(
      mockAssignmentType({
        id: 'assignment-type-gba300',
        title: 'GBA 300: International Etiquette',
        scoringScaleJson: {
          type: 'weighted_percent',
          minScore: 0,
          maxScore: 20,
          step: 1,
        },
        rubricJson: { categories },
        gradingPromptConfigJson: {
          gradingInstructions: 'Use raw points inside each category band.',
        },
      })
    );
    prisma.submission.findFirst.mockResolvedValue(
      mockSubmission({
        id: 'sub-gba300',
        document: {
          ...mockSubmission().document,
          assignmentTypeId: 'assignment-type-gba300',
          assignmentType: {
            id: 'assignment-type-gba300',
            kind: null,
            title: 'GBA 300: International Etiquette',
          },
        },
      })
    );
    getLLMCompletion.mockReset();
    getLLMCompletion.mockResolvedValueOnce(
      JSON.stringify({
        categories: [
          { key: 'introduction', score: 5, comment: 'Purposeful setup.' },
          { key: 'country_1', score: 18, comment: 'Specific analysis.' },
          { key: 'country_2', score: 16, comment: 'Clear comparison.' },
          { key: 'conclusion', score: 4, comment: 'Useful synthesis.' },
        ],
        overallComment: 'Jordan, the comparison is clear and specific.',
      })
    );

    const form = new FormData();
    form.append('submissionId', 'sub-gba300');
    await action({
      request: new Request('https://example.com/api/domain/grade-essay-ai', {
        method: 'POST',
        body: form,
      }),
    } as any);

    const stored = prisma.submission.update.mock.calls.at(-1)?.[0].data;
    expect(stored.numericPercentage).toBe(86);
    expect(stored.overallScore).toBe(86);
    expect(stored.score).toBe('86% (B)');
    expect(stored.rubricScores.introduction.score).toBe(5);
    expect(stored.rubricScores.country_1.score).toBe(18);
  });

  describe('a Class Starter submission', () => {
    function mockClassStarterSubmission(id: string) {
      return mockSubmission({
        id,
        text: 'I kept writing until the ten minutes were up.',
        document: {
          id: `doc-${id}`,
          membershipId: 'student-profile-1',
          assignmentTypeId: 'assignment-type-class-starter',
          assignmentType: {
            id: 'assignment-type-class-starter',
            kind: 'class_starter',
            title: 'Class Starter',
          },
          classAssignment: { class: { schoolId: 'school-1' } },
          membership: {
            classesAsStudent: [],
            user: { name: 'Jordan Student' },
          },
        },
      });
    }

    async function gradeClassStarter(id: string, engagementScore = 2) {
      prisma.assignmentType.findUnique.mockResolvedValue(
        mockAssignmentType({
          id: 'assignment-type-class-starter',
          title: 'Class Starter',
          kind: 'class_starter',
        })
      );
      prisma.submission.findFirst.mockResolvedValue(
        mockClassStarterSubmission(id)
      );
      getLLMCompletion.mockReset();
      getLLMCompletion.mockResolvedValue(
        JSON.stringify({
          categories: [{ key: 'engagement', score: engagementScore }],
          overallComment: 'Jordan, you stayed with the thought all the way.',
        })
      );

      const form = new FormData();
      form.append('submissionId', id);
      const response = await action({
        request: new Request('https://example.com/api/domain/grade-essay-ai', {
          method: 'POST',
          body: form,
        }),
      } as any);

      return response;
    }

    function gradingCall() {
      return getLLMCompletion.mock.calls.find(
        (call: any[]) => call[0]?.metadata?.kind === 'rubric-evaluation'
      )?.[0];
    }

    test('grades on the Class Starter rubric without the assignment type saving one', async () => {
      await gradeClassStarter('sub-class-starter-config');

      const run =
        prisma.submissionGradingAssistantRun.create.mock.calls.at(-1)?.[0].data;
      expect(run.source).toBe('class-starter-default');
      expect(
        (
          run.assignmentTypeRubricSnapshot as { categories: { key: string }[] }
        ).categories.map((category) => category.key)
      ).toEqual(['engagement']);
    });

    test('asks the model for one engagement judgment on the 0-3 scale', async () => {
      await gradeClassStarter('sub-class-starter-prompt');

      const call = gradingCall();
      expect(call.system).toContain('Make one judgment: Engagement.');
      expect(call.system).toContain('integers 0-3');
      expect(call.messages[0].content).toContain(
        'Score meanings: 0 = Absent; 1 = Hardly there; 2 = Showed up; 3 = All in'
      );
    });

    test('asks for overall feedback only, never per-category feedback', async () => {
      await gradeClassStarter('sub-class-starter-feedback');

      const call = gradingCall();
      expect(call.system).not.toContain('"comment": string');
      expect(call.system).toContain(
        'Do not write per-category feedback. Every word of feedback belongs in overallComment.'
      );
      expect(call.system).toContain('"overallComment": string');
    });

    test('never asks for grammar or syntax highlighting', async () => {
      await gradeClassStarter('sub-class-starter-grammar');

      // The rubric prompt never asks for grammar output. The grading
      // instructions do tell the model not to grade grammar, which is the
      // opposite ask and has to survive.
      const call = gradingCall();
      expect(call.system.toLowerCase()).not.toContain('grammar');
      expect(call.system.toLowerCase()).not.toContain('syntax');
      expect(call.system.toLowerCase()).not.toContain('highlight');
      expect(call.messages[0].content).toContain(
        'Do not grade grammar, spelling, punctuation, or formatting'
      );
      expect(
        getLLMCompletion.mock.calls.filter(
          (call: any[]) => call[0]?.metadata?.kind === 'grammar-issues'
        )
      ).toHaveLength(0);
      expect(
        prisma.submission.update.mock.calls.at(-1)?.[0].data.grammarIssues
      ).toEqual({ version: 1, issues: [] });
    });

    test('accepts a scored category with no comment and stores an empty one', async () => {
      await gradeClassStarter('sub-class-starter-score', 3);

      const stored = prisma.submission.update.mock.calls.at(-1)?.[0].data;
      expect(stored.rubricScores).toEqual({
        engagement: { score: 3, comment: '', isAi: true },
      });
      expect(stored.overallComment).toBe(
        'Jordan, you stayed with the thought all the way.'
      );
    });

    test('grades out of 3 points rather than as a percentage', async () => {
      await gradeClassStarter('sub-class-starter-grade', 3);

      const stored = prisma.submission.update.mock.calls.at(-1)?.[0].data;
      expect(stored.score).toBe('3/3');
      // An engagement judgment is not a percentage grade, so it never becomes
      // one: 3 of 3 must not come back as the 79% the 1-5 bands would give it.
      expect(stored.numericPercentage).toBeNull();
      expect(stored.letterGrade).toBeNull();
    });

    test('grades Absent as a real score rather than a missing one', async () => {
      await gradeClassStarter('sub-class-starter-absent', 0);

      const stored = prisma.submission.update.mock.calls.at(-1)?.[0].data;
      expect(stored.rubricScores).toEqual({
        engagement: { score: 0, comment: '', isAi: true },
      });
    });
  });

  describe('the revised production Daily Pages library rubric', () => {
    async function gradeRevisedDailyPages(engagementScore: number, pointValue = 30, pin?: 'current' | 'legacy') {
      const { STARTER_RUBRICS, DAILY_PAGES_RUBRIC_NAME } = await import('~/domain/rubrics/starter-rubrics');
      const schema = STARTER_RUBRICS.find(r => r.name === DAILY_PAGES_RUBRIC_NAME)!;
      prisma.assignmentType.findUnique.mockResolvedValue(mockAssignmentType({
        id: 'daily-pages-production', title: 'Daily Pages', kind: 'daily_pages',
        rubric: { name: schema.name, schemaJson: schema },
      }));
      prisma.submission.findFirst.mockResolvedValue(mockSubmission({
        id: 'daily-pages-band',
        document: {
          ...mockSubmission().document,
          assignmentTypeId: 'daily-pages-production',
          assignmentType: { id: 'daily-pages-production', kind: 'daily_pages', title: 'Daily Pages' },
          assignment: { id: 'daily-assignment', prompt: 'Describe a place that matters to you.', pointValue },
        },
      }));
      const pinnedSchema = structuredClone(schema);
      if (pin === 'legacy') {
        delete pinnedSchema.outputSchema.assignmentPointScaling;
        pinnedSchema.scoringScale.step = 10;
        delete pinnedSchema.rubric.categories[0].bands;
      }
      prisma.assignment.findUnique.mockResolvedValue({
        assignmentTypeId: 'daily-pages-production',
        rubricRevision: pin ? { id: 'pinned-revision', version: pin === 'legacy' ? 5 : 7, rubricName: schema.name, schemaJson: pinnedSchema } : null,
      });
      getLLMCompletion.mockReset();
      getLLMCompletion.mockResolvedValue(JSON.stringify({
        categories: [{ key: 'engagement_with_prompt', score: engagementScore }],
        overallComment: 'Jordan, the kitchen detail brings the memory alive.',
      }));
      const form = new FormData();
      form.append('submissionId', 'daily-pages-band');
      return action({ request: new Request('https://example.com/api/domain/grade-essay-ai', { method: 'POST', body: form }) } as any);
    }

    test.each([0, 7, 13, 17, 18, 23, 28, 29, 30])('preserves %i raw points in storage, response and the immutable suggestion', async (score) => {
      const response = await gradeRevisedDailyPages(score);
      const stored = prisma.submission.update.mock.calls.at(-1)?.[0].data;
      expect(stored).toMatchObject({ overallScore: score, score: `${score}/30`, numericPercentage: null, letterGrade: null });
      expect(stored.rubricScores.engagement_with_prompt.score).toBe(score);
      const run = prisma.submissionGradingAssistantRun.create.mock.calls.at(-1)?.[0].data;
      expect(run.assignmentTypeRubricSnapshot.step).toBe(1);
      expect(run.metadata.output.score).toBe(`${score}/30`);
      expect((response as any).data.score).toBe(`${score}/30`);
      const call = getLLMCompletion.mock.calls.find((call: any[]) => call[0]?.metadata?.kind === 'rubric-evaluation')?.[0];
      expect(call.messages[0].content).toContain('Assignment prompt: Describe a place that matters to you.');
      expect(getLLMCompletion.mock.calls.filter((call: any[]) => call[0]?.metadata?.kind === 'grammar-issues')).toHaveLength(0);
    });

    test.each([undefined, 'current'] as const)('grades a new 90-point assignment directly at 55/90 with pin %s', async (pin) => {
      const response = await gradeRevisedDailyPages(55, 90, pin);
      expect((response as any).data).toMatchObject({ success: true, overallScore: 55, score: '55/90', rubricConfig: { maxScore: 90, step: 1 } });
      expect(prisma.submission.update.mock.calls.at(-1)?.[0].data).toMatchObject({ overallScore: 55, score: '55/90', numericPercentage: null, letterGrade: null });
      const snapshot = prisma.submissionGradingAssistantRun.create.mock.calls.at(-1)?.[0].data.assignmentTypeRubricSnapshot;
      expect(snapshot.maxScore).toBe(90);
      expect(snapshot.categories[0].bands.map((band: any) => [band.min, band.max])).toEqual([[0, 0], [21, 39], [51, 69], [84, 90]]);
      const call = getLLMCompletion.mock.calls.find((call: any[]) => call[0]?.metadata?.kind === 'rubric-evaluation')?.[0];
      expect(call.system).toContain('"score": 0-90');
      expect(call.messages[0].content).toContain('51-69 SHOWED UP');
      expect(call.messages[0].content).toContain('Configured anchor: 60/90');
    });

    test('scales a 10-point assignment and rejects a score in its scaled gap', async () => {
      const response = await gradeRevisedDailyPages(7, 10, 'current');
      expect((response as any).data.score).toBe('7/10');
      prisma.submission.update.mockClear();
      const invalid = await gradeRevisedDailyPages(8, 10, 'current');
      expect((invalid as any).init?.status).toBe(502);
      expect(prisma.submission.update).not.toHaveBeenCalled();
    });

    test('does not rescale an explicitly pinned legacy rubric on a 90-point assignment', async () => {
      const response = await gradeRevisedDailyPages(20, 90, 'legacy');
      expect((response as any).data).toMatchObject({ score: '20/30', rubricConfig: { maxScore: 30, step: 10 } });
    });

    test.each([1, 6, 14, 16, 24, 27])('rejects %i in a gap between authored tiers instead of rounding it', async (score) => {
      const response = await gradeRevisedDailyPages(score);
      expect((response as any).init?.status).toBe(502);
      expect(prisma.submission.update).not.toHaveBeenCalled();
    });
  });


  describe('private teacher notes', () => {
    async function gradeWithNote({ enabled = true, response, fallback, managed = false }: { enabled?: boolean; response: unknown; fallback?: unknown; managed?: boolean }) {
      const { STARTER_RUBRICS } = await import('~/domain/rubrics/starter-rubrics');
      const schema = structuredClone(STARTER_RUBRICS.find(r => r.name === 'daily-pages-engagement')!);
      schema.outputSchema.teacherNotesEnabled = enabled;
      prisma.assignmentType.findUnique.mockResolvedValue(mockAssignmentType({
        rubric: { name: schema.name, schemaJson: schema },
        ...(managed ? { gradingPromptConfigJson: { systemMessageTemplate: '{{grading_instructions}}', userMessageTemplate: '{{document}}' } } : {}),
      }));
      prisma.submission.findFirst.mockResolvedValue(mockSubmission());
      getLLMCompletion.mockReset();
      getLLMCompletion.mockResolvedValueOnce(JSON.stringify(response));
      if (fallback) getLLMCompletion.mockResolvedValueOnce(JSON.stringify(fallback));
      const form = new FormData(); form.append('submissionId', 'sub-1');
      return action({ request: new Request('https://example.com/api/domain/grade-essay-ai', { method: 'POST', body: form }) } as any);
    }
    const categories = [{ key: 'engagement_with_prompt', score: 18 }];
    const teacherNote = 'The final paragraph shifts from short sentences to specialized vocabulary.';
    const overallComment = 'Jordan, your kitchen detail makes the memory vivid.';

    test('stores a separate private observation without score penalty or public feedback contamination', async () => {
      const result = await gradeWithNote({ response: { categories, teacherNote, overallComment } });
      expect((result as any).data.teacherNote).toBe(teacherNote);
      const grade = prisma.submission.update.mock.calls.at(-1)?.[0].data;
      expect(grade.score).toBe('18/30');
      expect(JSON.stringify(grade)).not.toContain(teacherNote);
      const run = prisma.submissionGradingAssistantRun.create.mock.calls.at(-1)?.[0].data;
      expect(run.metadata.teacherNote).toBe(teacherNote);
      expect(JSON.stringify(run.metadata.output)).not.toContain(teacherNote);
      const call = getLLMCompletion.mock.calls[0][0];
      expect(call.system).toContain('"teacherNote"');
      expect(call.system).toContain('Never put private observations in overallComment');
      expect(call.system).toContain('Do not infer AI authorship');
      expect(call.system).toContain('without supplied comparison writing');
    });

    test('ignores unsolicited notes from rubrics that have not opted in', async () => {
      const result = await gradeWithNote({ enabled: false, response: { categories, teacherNote, overallComment } });
      expect((result as any).data).not.toHaveProperty('teacherNote');
      expect(prisma.submissionGradingAssistantRun.create.mock.calls.at(-1)?.[0].data.metadata).not.toHaveProperty('teacherNote');
      expect(getLLMCompletion.mock.calls[0][0].system).not.toContain('"teacherNote"');
    });

    test('retains the separate note while generating missing student feedback with the authored constraints', async () => {
      const result = await gradeWithNote({ response: { categories, teacherNote }, fallback: { overallComment } });
      expect((result as any).data.teacherNote).toBe(teacherNote);
      expect((result as any).data.overallComment).toBe(overallComment);
      const fallbackCall = getLLMCompletion.mock.calls[1][0];
      expect(fallbackCall.system).toContain('Do not include private observations');
      expect(fallbackCall.messages[0].content).toContain('Never mention grammar, spelling, syntax, or organization');
      expect(fallbackCall.messages[0].content).not.toContain(teacherNote);
    });

    test('schema repair keeps a private note separate and obeys the same source constraints', async () => {
      const result = await gradeWithNote({ response: { categories: [{ key: 'engagement_with_prompt', score: 24 }], teacherNote, overallComment }, fallback: { categories, teacherNote, overallComment } });
      expect((result as any).data.teacherNote).toBe(teacherNote);
      expect((result as any).data.score).toBe('18/30');
      const repair = getLLMCompletion.mock.calls[1][0];
      expect(repair.system).toContain('"teacherNote"');
      expect(repair.system).toContain('Never put them in overallComment');
      expect(repair.messages[0].content).toContain('Never mention grammar, spelling, syntax, or organization');
      expect(prisma.submission.update.mock.calls.at(-1)?.[0].data.overallComment).toBe(overallComment);
    });

    test.each(['missing-feedback', 'schema-repair'] as const)('preserves authored system-template constraints during %s', async (mode) => {
      const response = mode === 'missing-feedback'
        ? { categories, teacherNote }
        : { categories: [{ key: 'engagement_with_prompt', score: 24 }], teacherNote, overallComment };
      const result = await gradeWithNote({ managed: true, response, fallback: { categories, teacherNote, overallComment } });
      expect((result as any).data.teacherNote).toBe(teacherNote);
      const retry = getLLMCompletion.mock.calls[1][0];
      const retryPrompt = retry.system + retry.messages[0].content;
      expect(retryPrompt).toContain('Never mention grammar, spelling, syntax, or organization');
      expect(retryPrompt).toContain('Never evaluate whether the content is correct');
      expect(retryPrompt).toContain('Feedback is 1–3 warm sentences');
      expect(retryPrompt).toContain('don’t penalize on suspicion');
      expect(retry.system).toContain('without supplied comparison writing');
      if (mode === 'missing-feedback') {
        expect(retryPrompt).not.toContain(teacherNote);
        expect(retry.system).not.toContain('"teacherNote":');
      }
    });

    test('an empty new note clears the prior suggestion instead of retaining an old observation', async () => {
      const result = await gradeWithNote({ response: { categories, overallComment, teacherNote: '   ' } });
      expect((result as any).data.teacherNote).toBeNull();
      expect(prisma.submissionGradingAssistantRun.create.mock.calls.at(-1)?.[0].data.metadata.teacherNote).toBeNull();
    });
  });

});
