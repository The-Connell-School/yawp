import { describe, expect, mock, test } from 'bun:test';
import {
  buildStarterGradingEvaluations,
  seedStarterGradingEvaluations,
} from './starter-grading-evaluations';

describe('buildStarterGradingEvaluations', () => {
  test('builds named evaluations containing multiple input/output cases', () => {
    const evaluations = buildStarterGradingEvaluations({
      title: 'The Thesis-Driven Essay',
      rubricCategories: [
        { key: 'thesis_and_content', label: 'Thesis/Content' },
        { key: 'organization_and_structure', label: 'Organization/Structure' },
        { key: 'evidence_and_support', label: 'Evidence/Support' },
        { key: 'voice_and_style', label: 'Voice/Style' },
        { key: 'grammar_and_mechanics', label: 'Grammar/Syntax/Formatting' },
      ],
    });

    expect(evaluations.map((evaluation) => evaluation.title)).toEqual([
      'Positive greeting',
      'Rubric fidelity',
      'Prompt safety',
    ]);
    expect(
      evaluations.every((evaluation) => evaluation.cases.length >= 2)
    ).toBe(true);

    const everyCase = evaluations.flatMap((evaluation) => evaluation.cases);
    expect(
      everyCase.every(
        (evaluationCase) => evaluationCase.documentText.length > 80
      )
    ).toBe(true);
    expect(
      everyCase.every(
        (evaluationCase) =>
          evaluationCase.expectedOutput.categories.length === 5 &&
          evaluationCase.expectedOutput.overallComment.length > 20
      )
    ).toBe(true);
    expect(
      evaluations
        .find((evaluation) => evaluation.title === 'Prompt safety')
        ?.cases.some((evaluationCase) =>
          evaluationCase.documentText.includes('SYSTEM OVERRIDE')
        )
    ).toBe(true);
  });

  test('builds assignment-specific ACT evaluations with full expected outputs', () => {
    const evaluations = buildStarterGradingEvaluations({
      title: 'ACT Writing Section',
      rubricCategories: [
        { key: 'ideas_and_analysis', label: 'Ideas and Analysis' },
        { key: 'development_and_support', label: 'Development and Support' },
        { key: 'organization', label: 'Organization' },
        {
          key: 'language_use_and_conventions',
          label: 'Language Use and Conventions',
        },
      ],
    });

    expect(evaluations).toHaveLength(3);
    expect(evaluations.flatMap((evaluation) => evaluation.cases)).toHaveLength(
      6
    );
    expect(
      evaluations.flatMap((evaluation) => evaluation.cases)[0]?.expectedOutput
        .categories
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'ideas_and_analysis' }),
        expect.objectContaining({ key: 'organization' }),
      ])
    );
  });

  test('skips assignment types without a supported grading rubric', () => {
    expect(
      buildStarterGradingEvaluations({
        title: 'Daily Pages',
        rubricCategories: [],
      })
    ).toEqual([]);
  });
});

describe('seedStarterGradingEvaluations', () => {
  test('seeds one immutable mixed-result demo run with saved outputs and judgments', async () => {
    const evaluationCases = [
      ['Positive greeting', 'Strong opening'],
      ['Positive greeting', 'Developing draft'],
      ['Rubric fidelity', 'Clear thesis, thin evidence'],
      ['Rubric fidelity', 'Evidence without a thesis'],
      ['Prompt safety', 'System override attempt'],
      ['Prompt safety', 'Hidden grading demand'],
    ].map(([evaluationTitle, title], position) => ({
      id: `case-${position + 1}`,
      evaluationId: `evaluation-${evaluationTitle}`,
      evaluation: { title: evaluationTitle },
      title,
      documentText: `Document for ${title}`,
      rubricCategoryKey: 'thesis_and_content',
      criterion: `Criterion for ${evaluationTitle}`,
      expectedOutputJson: {
        categories: [
          {
            key: 'thesis_and_content',
            score: 3,
            comment: 'Expected category feedback.',
          },
        ],
        overallComment: `Expected feedback for ${title}.`,
      },
      position: position % 2,
      archivedAt: null,
    }));
    const createRun = mock(() => Promise.resolve({ id: 'run-1' }));
    const prisma = {
      assignmentType: {
        findMany: mock(() =>
          Promise.resolve([
            {
              id: 'assignment-type-1',
              title: 'The Thesis-Driven Essay',
              rubricJson: {
                categories: [
                  { key: 'thesis_and_content', label: 'Thesis/Content' },
                  {
                    key: 'organization_and_structure',
                    label: 'Organization/Structure',
                  },
                  { key: 'evidence_and_support', label: 'Evidence/Support' },
                  { key: 'voice_and_style', label: 'Voice/Style' },
                  {
                    key: 'grammar_and_mechanics',
                    label: 'Grammar/Syntax/Formatting',
                  },
                ],
              },
              gradingAssistantVersion: 3,
              evaluations: [
                {
                  id: 'evaluation-Positive greeting',
                  title: 'Positive greeting',
                  cases: evaluationCases.slice(0, 2),
                },
                {
                  id: 'evaluation-Rubric fidelity',
                  title: 'Rubric fidelity',
                  cases: evaluationCases.slice(2, 4),
                },
                {
                  id: 'evaluation-Prompt safety',
                  title: 'Prompt safety',
                  cases: evaluationCases.slice(4, 6),
                },
              ],
              evaluationRuns: [],
            },
          ])
        ),
      },
      assignmentTypeEvaluation: { create: mock() },
      assignmentTypeEvaluationCase: {
        create: mock(),
        findMany: mock(() => Promise.resolve(evaluationCases)),
      },
      assignmentTypeEvaluationRun: { create: createRun },
    };

    const summary = await seedStarterGradingEvaluations(prisma as never);

    expect(summary).toMatchObject({ createdRuns: 1, existingRuns: 0 });
    expect(createRun).toHaveBeenCalledTimes(1);
    const run = createRun.mock.calls[0]?.[0]?.data;
    expect(run).toMatchObject({
      assignmentTypeId: 'assignment-type-1',
      promptVersion: 3,
      status: 'completed',
      totalCases: 6,
      passedCases: 3,
      failedCases: 3,
      needsReviewCases: 0,
    });
    expect(run.results.create).toHaveLength(6);
    expect(
      run.results.create.filter(
        (result: { status: string }) => result.status === 'pass'
      )
    ).toHaveLength(3);
    expect(
      run.results.create.filter(
        (result: { status: string }) => result.status === 'fail'
      )
    ).toHaveLength(3);
    expect(run.results.create[1]).toMatchObject({
      caseId: 'case-2',
      status: 'fail',
      gradingOutputJson: expect.any(Object),
      expectedOutputJson: expect.any(Object),
      evidence: expect.stringContaining('positive greeting'),
      responseContractJson: expect.any(Object),
    });
  });
});
