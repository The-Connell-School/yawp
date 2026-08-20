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

type DeleteQueryResult = {
  rows: { id: string }[];
  rowCount: number | null;
};

type DeleteQueryable = {
  query(
    sql: string,
    values: unknown[]
  ): Promise<{ rows: { id: string }[]; rowCount: number | null }>;
};

/**
 * Delete submissions first, then remove redirects only for rows PostgreSQL
 * actually deleted. A concurrent activity write can make a selected row
 * ineligible between discovery and deletion; its redirect must survive too.
 */
export async function deleteSubmissionsAndRedirects(
  client: DeleteQueryable,
  requestedIds: string[]
): Promise<number> {
  if (requestedIds.length === 0) return 0;

  const deleted: DeleteQueryResult = await client.query(
    `DELETE FROM "Submission"
     WHERE id = ANY($1::text[])
       AND NOT EXISTS (
         SELECT 1 FROM "SubmissionActivity" sa
         WHERE sa."submissionId" = "Submission".id
       )
     RETURNING id`,
    [requestedIds]
  );
  const deletedIds = deleted.rows.map((row) => row.id);
  if (deletedIds.length > 0) {
    await client.query(
      `DELETE FROM "LegacyGradeRedirect" WHERE "submissionId" = ANY($1::text[])`,
      [deletedIds]
    );
  }

  return deleted.rowCount ?? 0;
}
