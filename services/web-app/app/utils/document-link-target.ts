import { latestVisibleStudentSubmission } from './student-document-status';

export type DocumentLinkSubmission = {
  id: string;
  releasedAt: Date | string | null;
  archivedAt?: Date | string | null;
  /** Teacher-initiated unsubmit. Excluded the same as archivedAt. */
  unsubmittedAt?: Date | string | null;
  submittedAt?: Date | string | null;
};

function timestamp(value: Date | string | null | undefined) {
  if (value == null) return 0;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

export function pickLatestReleasedSubmission<T extends DocumentLinkSubmission>(
  submissions: T[]
): T | null {
  const released = submissions.filter(
    (submission) =>
      submission.archivedAt == null &&
      submission.unsubmittedAt == null &&
      submission.releasedAt != null
  );

  if (released.length === 0) {
    return null;
  }

  return [...released].sort((a, b) => {
    const byReleased = timestamp(b.releasedAt) - timestamp(a.releasedAt);
    if (byReleased !== 0) return byReleased;
    return timestamp(b.submittedAt) - timestamp(a.submittedAt);
  })[0];
}

export function resolveDocumentLinkTarget({
  documentId,
  exitTo,
  isStudentView,
  submissions,
}: {
  documentId: string;
  exitTo: string;
  isStudentView: boolean;
  submissions: DocumentLinkSubmission[];
}) {
  const encodedExitTo = encodeURIComponent(exitTo);

  if (isStudentView) {
    const latestSubmission = latestVisibleStudentSubmission(submissions);

    if (latestSubmission) {
      return `/app/submissions/${latestSubmission.id}?exitTo=${encodedExitTo}`;
    }
  }

  return `/app/documents/${documentId}?ssv=1&exitTo=${encodedExitTo}`;
}
