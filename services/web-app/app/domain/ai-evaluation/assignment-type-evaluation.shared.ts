const PROMPT_DATE_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Chicago',
  month: 'numeric',
  day: 'numeric',
  year: 'numeric',
});

// Renders as "7.14.2026" — periods between month, day, and year.
export function formatPromptDate(createdAt: string) {
  const parts = PROMPT_DATE_FORMATTER.formatToParts(new Date(createdAt));
  const month = parts.find((part) => part.type === 'month')?.value ?? '';
  const day = parts.find((part) => part.type === 'day')?.value ?? '';
  const year = parts.find((part) => part.type === 'year')?.value ?? '';
  return `${month}.${day}.${year}`;
}

// A prompt's display ID is just its creation date. If another prompt was
// created the same calendar day, same-day prompts get A/B/C suffixes in
// creation order instead — so a lone same-day prompt has no letter until a
// sibling shows up. Computed fresh from createdAt every time; nothing is
// stored.
export function computePromptVersionLabels(
  promptVersions: Array<{ id: string; createdAt: string }>
): Map<string, string> {
  const sorted = [...promptVersions].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
  const idsByDay = new Map<string, string[]>();
  for (const promptVersion of sorted) {
    const day = formatPromptDate(promptVersion.createdAt);
    const ids = idsByDay.get(day) ?? [];
    ids.push(promptVersion.id);
    idsByDay.set(day, ids);
  }
  const labels = new Map<string, string>();
  for (const [day, ids] of idsByDay) {
    if (ids.length === 1) {
      labels.set(ids[0], day);
      continue;
    }
    ids.forEach((id, index) => {
      labels.set(id, `${day} ${String.fromCharCode(65 + index)}`);
    });
  }
  return labels;
}

export type AssignmentTypeEvaluationStatus =
  | 'pass'
  | 'fail'
  | 'needs_review'
  | 'blocked';

export type AssignmentTypeEvaluationHistory = {
  promptVersions: Array<{
    id: string;
    version: number;
    revision: number;
    status: 'draft' | 'production' | 'previous';
    systemMessageTemplate: string;
    userMessageTemplate: string;
    variableSchema: unknown;
    contentHash: string;
    createdAt: string;
    updatedAt: string;
    promotedAt: string | null;
  }>;
  suiteVersions: Array<{
    id: string;
    version: number;
    contentHash: string;
    createdAt: string;
    evaluations: AssignmentTypeEvaluationHistory['evaluations'];
    cases: AssignmentTypeEvaluationHistory['cases'];
  }>;
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
    promptVersionId: string | null;
    promptRevision: number | null;
    evaluationSuiteVersionId: string | null;
    evaluationSuiteContentHash: string | null;
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
      requestSnapshot: unknown;
    }>;
  }>;
};

// Other assignment types' evaluation suites available to copy from, keyed
// off the current assignment type so its own suites never appear as a
// source. Only named evaluations are listed — legacy (unnamed) cases can't
// be copied individually and are excluded to keep the payload bounded.
export type EvaluationCopySourceCatalog = Array<{
  assignmentTypeId: string;
  assignmentTypeTitle: string;
  suites: Array<{
    id: string;
    version: number;
    evaluations: Array<{ id: string; title: string }>;
  }>;
}>;
