/**
 * Graded counts per assignment, derived from the class's submissions list.
 * Shared between the class detail page (assignments table) and the
 * assignment detail page (single-assignment header stat) so both read the
 * same computation instead of drifting.
 */
export function buildGradedCountByAssignmentId(
  submissions: { document: { assignment?: { id: string } | null }; gradedAt: unknown }[]
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const submission of submissions) {
    const assignmentId = submission.document.assignment?.id;
    if (!assignmentId || !submission.gradedAt) continue;
    counts.set(assignmentId, (counts.get(assignmentId) ?? 0) + 1);
  }
  return counts;
}
