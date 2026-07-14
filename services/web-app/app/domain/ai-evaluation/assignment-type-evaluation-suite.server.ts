import type { ResolvedAssignmentTypeGradingConfig } from '~/domain/assignment-types/assignment-type-grading-config.server';
import { runGradingAssistantScratchEvaluation } from './grading-assistant-scratch-evaluation.server';

export type AssignmentTypeEvaluationCaseInput = {
  id: string;
  title: string;
  rubricCategoryKey: string;
  documentText: string;
  criterion: string;
  expectedOutputJson?: unknown;
};

export type AssignmentTypeEvaluationExecution = {
  evaluationCase: AssignmentTypeEvaluationCaseInput;
  purpose: 'grading' | 'criterion';
  system: string;
  messages: Array<{ role: 'user'; content: string }>;
  maxTokens: number;
  temperature?: number;
};

export type AssignmentTypeEvaluationSuiteResult = {
  summary: {
    total: number;
    passed: number;
    failed: number;
    needsReview: number;
  };
  results: Array<{
    caseId: string;
    caseTitle: string;
    rubricCategoryKey: string;
    criterion: string;
    expectedOutput: unknown;
    status: 'pass' | 'fail' | 'needs_review';
    evidence: string;
    gradingOutput: {
      categories: Array<{ key: string; score: number; comment: string }>;
      overallComment: string;
    } | null;
    responseContract: {
      status: 'pass' | 'fail' | 'blocked';
      evidence: string;
    };
    requestSnapshot: {
      system: string;
      userMessage: string;
    } | null;
  }>;
};

export async function runAssignmentTypeEvaluationSuite({
  gradingConfig,
  evaluationCases,
  execute,
}: {
  gradingConfig: ResolvedAssignmentTypeGradingConfig;
  evaluationCases: AssignmentTypeEvaluationCaseInput[];
  execute: (input: AssignmentTypeEvaluationExecution) => Promise<string>;
}): Promise<AssignmentTypeEvaluationSuiteResult> {
  const results: AssignmentTypeEvaluationSuiteResult['results'] = [];

  for (const evaluationCase of evaluationCases) {
    try {
      const result = await runGradingAssistantScratchEvaluation({
        gradingConfig,
        documentText: evaluationCase.documentText,
        criterion: evaluationCase.criterion,
        expectedOutput: evaluationCase.expectedOutputJson,
        studentFirstName: 'Jordan',
        strictnessLevel: 'intermediate',
        execute: (input) => execute({ ...input, evaluationCase }),
      });
      const status = result.status;
      const evidence =
        result.responseContract.status === 'fail'
          ? result.responseContract.evidence
          : result.criterion.evidence;

      results.push({
        caseId: evaluationCase.id,
        caseTitle: evaluationCase.title,
        rubricCategoryKey: evaluationCase.rubricCategoryKey,
        criterion: evaluationCase.criterion,
        expectedOutput: evaluationCase.expectedOutputJson ?? null,
        status,
        evidence,
        gradingOutput: result.gradingOutput,
        responseContract: result.responseContract,
        requestSnapshot: result.requestSnapshot,
      });
    } catch (error) {
      results.push({
        caseId: evaluationCase.id,
        caseTitle: evaluationCase.title,
        rubricCategoryKey: evaluationCase.rubricCategoryKey,
        criterion: evaluationCase.criterion,
        expectedOutput: evaluationCase.expectedOutputJson ?? null,
        status: 'fail',
        evidence:
          error instanceof Error
            ? error.message
            : 'This evaluation case could not run.',
        gradingOutput: null,
        responseContract: {
          status: 'blocked',
          evidence: 'The grading attempt did not complete.',
        },
        requestSnapshot: null,
      });
    }
  }

  return {
    summary: {
      total: results.length,
      passed: results.filter((result) => result.status === 'pass').length,
      failed: results.filter((result) => result.status === 'fail').length,
      needsReview: results.filter((result) => result.status === 'needs_review')
        .length,
    },
    results,
  };
}
