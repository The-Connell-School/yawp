/**
 * The lifecycle a student can actually observe on their own documents.
 *
 * The teacher lifecycle (`teacher-document-status.ts`) has four states because
 * a teacher can see the gap between "graded" and "released". A student cannot:
 * the My Documents card only ever renders three badges — the in-progress module
 * title, "Submitted", or "N graded" (which is keyed on `releasedAt`) — and the
 * student loader does not even read grade fields. So `graded` here means the
 * grade has been released to the student, and everything submitted but not yet
 * released is simply `submitted`.
 */
export type StudentDocumentStatus = 'in-progress' | 'submitted' | 'graded';

export const STUDENT_DOCUMENT_STATUSES: StudentDocumentStatus[] = [
  'in-progress',
  'submitted',
  'graded',
];

export const STUDENT_DOCUMENT_STATUS_LABELS: Record<
  StudentDocumentStatus,
  string
> = {
  'in-progress': 'In Progress',
  submitted: 'Submitted',
  graded: 'Graded',
};

export const STUDENT_DOCUMENT_STATUS_DOT_CLASSES: Record<
  StudentDocumentStatus,
  string
> = {
  'in-progress': 'bg-zinc-500',
  submitted: 'bg-amber-500',
  graded: 'bg-emerald-600',
};

export type StudentStatusSubmission = {
  id?: string;
  releasedAt?: Date | string | null;
  submittedAt?: Date | string | null;
  archivedAt?: Date | string | null;
  unsubmittedAt?: Date | string | null;
};

/**
 * Mirrors the visibility rules in `DocumentLink`: archived and unsubmitted
 * submissions are invisible to the student, so they cannot make a document
 * count as submitted or graded.
 */
export function visibleStudentSubmissions<T extends StudentStatusSubmission>(
  submissions: T[]
): T[] {
  return submissions.filter(
    (submission) =>
      submission.archivedAt == null && submission.unsubmittedAt == null
  );
}

export function getStudentDocumentStatus(
  submissions: StudentStatusSubmission[] | null | undefined
): StudentDocumentStatus {
  const visible = visibleStudentSubmissions(submissions ?? []);

  if (visible.length === 0) return 'in-progress';
  if (visible.some((submission) => submission.releasedAt != null)) {
    return 'graded';
  }

  return 'submitted';
}

export function countStudentDocumentStatuses(
  documents: Array<{ submissions?: StudentStatusSubmission[] | null }>
): Record<StudentDocumentStatus, number> {
  const counts: Record<StudentDocumentStatus, number> = {
    'in-progress': 0,
    submitted: 0,
    graded: 0,
  };

  for (const document of documents) {
    counts[getStudentDocumentStatus(document.submissions)] += 1;
  }

  return counts;
}
