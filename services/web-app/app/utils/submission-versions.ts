export type SubmissionWithArchive = {
  id: string;
  archivedAt?: Date | string | null;
};

export function partitionSubmissionsByArchive<T extends SubmissionWithArchive>(
  submissionsNewestFirst: T[]
): { active: T[]; archived: T[] } {
  const active: T[] = [];
  const archived: T[] = [];
  for (const s of submissionsNewestFirst) {
    if (s.archivedAt != null) archived.push(s);
    else active.push(s);
  }
  return { active, archived };
}

/**
 * Version label for non-archived submissions only (newest = highest v).
 * `activeNewestFirst` must be the active subset, same order as the full list.
 */
export function versionLabelForActiveSubmission(
  activeNewestFirst: SubmissionWithArchive[],
  submissionId: string
): number | null {
  const idx = activeNewestFirst.findIndex((s) => s.id === submissionId);
  if (idx === -1) return null;
  return activeNewestFirst.length - idx;
}

export function displaySubmissionTitle(
  title: string | null | undefined,
  version: number | null,
  fallback: string
): string {
  const t = title?.trim();
  const base = t || fallback;
  if (version == null) return base;
  return `${base} · v${version}`;
}
