import { describe, expect, test } from 'bun:test';
import { buildStarterGradingEvaluations } from './starter-grading-evaluations';

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
