export type AssignmentTypeEvaluationStatus =
  'pass' | 'fail' | 'needs_review' | 'blocked';

export type AssignmentTypeEvaluationHistory = {
  cases: Array<{
    id: string;
    title: string;
    rubricCategoryKey: string;
    documentText: string;
    criterion: string;
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
    }>;
  }>;
};
