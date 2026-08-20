/**
 * Pure helpers for archive-non-canonical-submissions.ts (unit-tested).
 */

export type SubmissionGradeFields = {
  gradedAt: Date | null;
  overallScore: number | null;
  numericPercentage: number | null;
  letterGrade: string | null;
  score: string | null;
  feedback: string | null;
};

/** True if this submission likely carries migrated or real grading — skip archiving when keepGraded. */
export function submissionHasGradeSignals(row: SubmissionGradeFields): boolean {
  if (row.gradedAt != null) return true;
  if (row.overallScore != null) return true;
  if (row.numericPercentage != null) return true;
  if (row.letterGrade != null && row.letterGrade.trim() !== '') return true;
  if (row.score != null && row.score.trim() !== '') return true;
  if (row.feedback != null && row.feedback.trim() !== '') return true;
  return false;
}

export function durableActivityExclusionSql(alias: string): string {
  return `NOT EXISTS (
    SELECT 1 FROM "SubmissionActivity" sa WHERE sa."submissionId" = ${alias}.id
  )`;
}
