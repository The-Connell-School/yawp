export type AssignmentTypeEvaluationStatus =
  'pass' | 'fail' | 'needs_review' | 'blocked';

export type AssignmentTypeEvaluationHistory = {
  evaluations: Array<{
    id: string;
    title: string;
    description: string;
    position: number;
    archived: boolean;
    createdAt: string;
  }>;
  cases: Array<{
    id: string;
    evaluationId: string | null;
    title: string;
    rubricCategoryKey: string;
    documentText: string;
    criterion: string;
    expectedOutput: unknown;
    position: number;
    archived: boolean;
    createdAt: string;
  }>;
  runs: Array<{
    id: string;
    promptVersion: number;
    status: string;
    totalCases: number;
    passedCases: number;
    failedCases: number;
    needsReviewCases: number;
    createdAt: string;
    createdAtLabel: string;
    completedAt: string | null;
    promptSnapshot: unknown;
    results: Array<{
      id: string;
      caseId: string | null;
      caseTitle: string;
      rubricCategoryKey: string;
      criterion: string;
      status: AssignmentTypeEvaluationStatus;
      evidence: string;
      gradingOutput: unknown;
      expectedOutput: unknown;
    }>;
  }>;
};
