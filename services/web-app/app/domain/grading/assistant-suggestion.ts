/**
 * The Grading Assistant writes its suggestions straight onto the submission,
 * and a teacher's edits then overwrite them. The run record keeps a copy under
 * `metadata.output`, which is what "reset to the Grading Assistant suggestions"
 * puts back — including after a reload, when nothing is left in memory.
 *
 * Runs recorded before this existed have no `output`, so the reset is simply
 * unavailable for those submissions rather than restoring something wrong.
 */

export type AssistantSuggestion = {
  rubricScores: unknown;
  overallComment: string | null;
  numericPercentage: number | null;
  score: string | null;
  letterGrade: string | null;
  grammarIssues: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

export function parseAssistantSuggestion(
  run: { status?: string | null; metadata?: unknown } | null
): AssistantSuggestion | null {
  if (!run || (run.status && run.status !== 'succeeded')) return null;
  if (!isRecord(run.metadata)) return null;

  const output = run.metadata.output;
  if (!isRecord(output)) return null;

  // Rubric scores are the substance of a suggestion. Without them there is
  // nothing worth restoring, and offering the action would be a lie.
  if (!isRecord(output.rubricScores)) return null;

  return {
    rubricScores: output.rubricScores,
    overallComment:
      typeof output.overallComment === 'string' ? output.overallComment : null,
    numericPercentage:
      typeof output.numericPercentage === 'number'
        ? output.numericPercentage
        : null,
    score: typeof output.score === 'string' ? output.score : null,
    letterGrade:
      typeof output.letterGrade === 'string' ? output.letterGrade : null,
    grammarIssues: output.grammarIssues ?? null,
  };
}
