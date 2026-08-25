import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  classAssignment: { findFirst: mock() },
  document: { findMany: mock() },
  classAssignmentInsight: {
    findUnique: mock(),
    upsert: mock(),
    updateMany: mock(),
    create: mock(),
  },
};

const resolveAssignmentTypeGradingConfig = mock();
const generateClassInsight = mock();
const reserveAiRequest = mock();

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module(
  '~/domain/assignment-types/assignment-type-grading-config.server',
  () => ({ resolveAssignmentTypeGradingConfig })
);
mock.module('./class-insight-synthesis.server', () => ({
  generateClassInsight,
}));
mock.module('~/utils/ai-admission.server', () => ({
  reserveAiRequest,
  AiRateLimitError: class AiRateLimitError extends Error {},
}));

const { generateClassAssignmentInsight } = await import(
  './class-insight-generation.server'
);

const ACT_RUBRIC_CATEGORIES = [
  {
    key: 'conventions',
    label: 'Conventions',
    weight: 0.25,
    description: 'Grammar and usage',
  },
  {
    key: 'development',
    label: 'Development',
    weight: 0.25,
    description: 'Ideas and analysis',
  },
];

function mockGradedDocuments() {
  prisma.document.findMany.mockResolvedValue([
    {
      id: 'doc-1',
      membership: { user: { name: 'Student A', email: 'a@test.com' } },
      submissions: [
        {
          id: 'sub-1',
          rubricScores: {
            conventions: { score: 2, comment: 'Fix comma splices' },
            development: { score: 4, comment: 'Clear analysis' },
          },
          overallComment: 'Keep revising conventions.',
        },
      ],
    },
    {
      id: 'doc-2',
      membership: { user: { name: 'Student B', email: 'b@test.com' } },
      submissions: [
        {
          id: 'sub-2',
          rubricScores: {
            conventions: { score: 3, comment: 'Better' },
            development: { score: 5, comment: 'Strong' },
          },
          overallComment: null,
        },
      ],
    },
  ]);
}

describe('generateClassAssignmentInsight rubric scoping', () => {
  beforeEach(() => {
    for (const model of Object.values(prisma)) {
      for (const fn of Object.values(model)) {
        (fn as ReturnType<typeof mock>).mockReset();
      }
    }
    resolveAssignmentTypeGradingConfig.mockReset();
    generateClassInsight.mockReset();
    reserveAiRequest.mockReset();

    prisma.classAssignment.findFirst.mockResolvedValue({
      id: 'ca-1',
      assignment: {
        title: 'ACT Writing Prompt',
        assignmentTypeId: 'act-writing-type',
        assignmentType: { title: 'ACT Writing', kind: 'act_writing' },
      },
      class: {
        grade: '11',
        period: '2',
        school: {
          organizationId: 'org-1',
          organization: { classInsightsEnabled: true },
        },
      },
    });
    prisma.classAssignmentInsight.findUnique.mockResolvedValue(null);
    mockGradedDocuments();
    resolveAssignmentTypeGradingConfig.mockResolvedValue({
      rubricCategories: ACT_RUBRIC_CATEGORIES,
    });
    generateClassInsight.mockResolvedValue({
      summary: {
        overview: 'Class did well on development but conventions need work.',
        categories: [
          {
            key: 'development',
            label: 'Development',
            status: 'strength',
            summary: 'Strong analysis overall.',
          },
          {
            key: 'conventions',
            label: 'Conventions',
            status: 'gap',
            summary: 'Comma issues showed up repeatedly.',
          },
        ],
        nextSteps: [
          {
            title: 'Reteach comma rules',
            detail: 'Model fixing comma splices with one paragraph.',
            rubricCategory: 'conventions',
          },
        ],
      },
      model: 'class-insight-fixture',
      raw: '',
    });
    prisma.classAssignmentInsight.upsert.mockResolvedValue({ id: 'insight-1' });
  });

  test('aggregates and prompts against the assignment type rubric, not the thesis default', async () => {
    const result = await generateClassAssignmentInsight({
      classAssignmentId: 'ca-1',
      organizationId: 'org-1',
      generatedByMembershipId: 'teacher-1',
    });

    expect(result.success).toBe(true);
    expect(resolveAssignmentTypeGradingConfig).toHaveBeenCalledWith({
      assignmentTypeId: 'act-writing-type',
      assignmentTypeKind: 'act_writing',
      assignmentTypeTitle: 'ACT Writing',
    });

    const aggregate = generateClassInsight.mock.calls[0]?.[0]?.aggregate;
    expect(aggregate.categories.map((category: { key: string }) => category.key)).toEqual(
      ['conventions', 'development']
    );
    expect(aggregate.weakest).toBe('conventions');
    expect(aggregate.strongest).toBe('development');
    expect(result.success && result.insight.summary.nextSteps[0].rubricCategory).toBe(
      'conventions'
    );
  });
});
