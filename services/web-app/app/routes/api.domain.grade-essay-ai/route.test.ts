import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { rubricKeys } from '~/domain/grading/rubric';

const prisma = {
  submission: {
    findFirst: mock(),
    update: mock(),
  },
  assignmentType: {
    findUnique: mock(),
  },
  submissionGradingAssistantRun: {
    create: mock(),
  },
};

const getLLMCompletion = mock();
const getGradingActor = mock();
const canManageGrades = mock();
const buildTeacherClassWhere = mock();
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
  isGradingOwnDocument,
}));
mock.module('~/utils/toast.server', () => ({
  redirectWithToast,
}));

const { action } = await import('./route');

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

function mockSubmission(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sub-1',
    text: 'Frozen AI essay text',
    html: '<p>Frozen AI essay text</p>',
    gradedAt: null,
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
        classesAsStudent: [],
        user: { name: 'Jordan Student' },
      },
    },
    ...overrides,
  };
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
    prisma.submission.update.mockReset();
    prisma.assignmentType.findUnique.mockReset();
    prisma.submissionGradingAssistantRun.create.mockReset();
    getLLMCompletion.mockReset();
    getGradingActor.mockReset();
    canManageGrades.mockReset();
    buildTeacherClassWhere.mockReset();
    isGradingOwnDocument.mockReset();
    redirectWithToast.mockReset();

    getGradingActor.mockResolvedValue({
      membershipId: 'teacher-1',
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
    prisma.assignmentType.findUnique.mockResolvedValue(mockAssignmentType());
    prisma.submissionGradingAssistantRun.create.mockResolvedValue({
      id: 'ga-run-1',
    });

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
    expect(prisma.submission.update).toHaveBeenCalledTimes(1);
    expect(prisma.assignmentType.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'assignment-type-legacy' },
      })
    );
    expect(prisma.submission.update.mock.calls[0]?.[0].data.aiMeta).toMatchObject({
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
        scoringScaleJson: { type: 'act_writing_2_12', minScore: 1, maxScore: 6 },
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
    expect(prompt).toContain(
      'Hold the student to an advanced standard for this rubric'
    );
    expect(prompt).toContain('Ideas and Analysis (25%)');
    expect(prompt).not.toContain('Thesis/Content');
    expect(Object.keys(payload.rubricScores ?? {})).toEqual([
      'ideas_and_analysis',
      'development_and_support',
      'organization',
      'language_use_and_conventions',
    ]);
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
    expect(runCall.data.assignmentTypeRubricSnapshot.categories).toHaveLength(4);
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

  test('sends each grading assistant strictness level to the model and audit trail', async () => {
    const cases = [
      {
        level: 'beginner',
        label: 'Beginner',
        promptText: 'Use beginner calibration.',
      },
      {
        level: 'intermediate',
        label: 'Intermediate',
        promptText: 'Use intermediate calibration.',
      },
      {
        level: 'advanced',
        label: 'Advanced',
        promptText: 'Use advanced calibration.',
      },
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
      expect(prompt).toContain(
        `Grading assistant strictness: ${strictnessCase.label}`
      );
      expect(prompt).toContain(strictnessCase.promptText);
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
            comment: 'The essay places Reconstruction in the Civil War context.',
          },
          document_use_describes: {
            earned: true,
            comment: 'The essay accurately describes evidence from the documents.',
          },
          document_use_supports_argument: {
            earned: false,
            comment: 'The documents are not yet tied consistently to the argument.',
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
          comment: 'The essay accurately describes evidence from the documents.',
        },
        document_use_supports_argument: {
          earned: false,
          comment: 'The documents are not yet tied consistently to the argument.',
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
            comment: 'The essay uses specific evidence about canals and factories.',
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
          comment: 'The essay uses specific evidence about canals and factories.',
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
          contextualization: { earned: false, comment: 'Needs broader context.' },
          document_use_describes: { earned: false, comment: 'Needs documents.' },
          document_use_supports_argument: {
            earned: false,
            comment: 'Needs argument support.',
          },
          outside_evidence: { earned: false, comment: 'Needs outside evidence.' },
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
});
