import { formatAssignmentGrade } from '~/domain/grading/gradeMath';
import {
  TEACHER_DOCUMENT_STATUS_BADGE_CLASSES,
  TEACHER_DOCUMENT_STATUS_LABELS,
  getTeacherDocumentStatus,
  hasMeaningfulGrade,
  type TeacherDocumentStatus,
} from '~/utils/teacher-document-status';

export type TeacherDocumentWorkClassSummary = {
  id: string;
  grade: string | null;
  period: string | null;
  title: string | null;
};

export type TeacherDocumentWorkSubmission = {
  id: string;
  title?: string | null;
  submittedAt?: Date | string | null;
  createdAt?: Date | string | null;
  releasedAt?: Date | string | null;
  gradedAt?: Date | string | null;
  archivedAt?: Date | string | null;
  score?: string | null;
  feedback?: string | null;
  rubricScores?: unknown | null;
  overallComment?: string | null;
  numericPercentage?: number | null;
  letterGrade?: string | null;
};

export type TeacherDocumentWorkRow = {
  id: string;
  title: string | null;
  updatedAt: Date;
  membership: {
    id: string;
    user: { id?: string; name: string | null; email: string | null; username?: string | null };
  };
  group?: {
    id: string;
    label: string;
    members: Array<{
      membershipId: string;
      membership: {
        id: string;
        user: { id?: string; name: string | null; email: string | null; username?: string | null };
      };
    }>;
  } | null;
  assignment: {
    id: string;
    title: string | null;
    submitForGrade?: boolean;
    pointValue?: number | null;
  } | null;
  resolvedClass: TeacherDocumentWorkClassSummary | null;
  submissions: TeacherDocumentWorkSubmission[];
  latestSubmission: TeacherDocumentWorkSubmission | null;
  submissionCount: number;
  /** True when the document has recorded external-paste activity. */
  hasPasteActivity?: boolean;
};

export type ReleaseGradeRow = {
  id: string;
  score: string | null;
  feedback: string | null;
  archivedAt: Date | string | null;
  document: {
    id: string;
    title: string;
    membership: {
      user: {
        name: string | null;
        email: string | null;
        username?: string | null;
      };
    };
  };
};

export type TeacherUnsubmitRow = {
  id: string;
  score: string | null;
  submittedAt: Date | string | null;
  document: {
    id: string;
    title: string;
    membership: {
      user: {
        name: string | null;
        email: string | null;
        username?: string | null;
      };
    };
  };
};

export { formatClassLabel } from '~/utils/class-display';

export function getDraftDisplayTitle(document: {
  title?: string | null;
  assignment?: { title?: string | null } | null;
}) {
  const documentTitle = document.title?.trim();
  if (documentTitle) return documentTitle;

  const assignmentTitle = document.assignment?.title?.trim();
  if (assignmentTitle) return assignmentTitle;

  return 'Untitled draft';
}

export function getTeacherDocumentWorkDetailLink(params: {
  document: TeacherDocumentWorkRow;
  exitTo: string;
  /**
   * The list's current column sort, serialized as `field:direction`. The
   * grading view replays it so its prev/next student arrows walk the stack in
   * the same order the teacher is looking at here. Filters already travel in
   * `exitTo`; the sort lives in component state, so it has to be passed along.
   */
  queueSort?: string | null;
}) {
  const encodedExitTo = encodeURIComponent(params.exitTo);

  if (params.document.latestSubmission?.id) {
    const queueSort = params.queueSort
      ? `&queueSort=${encodeURIComponent(params.queueSort)}`
      : '';
    return `/app/submissions/${params.document.latestSubmission.id}?edit=1&exitTo=${encodedExitTo}${queueSort}`;
  }

  if (params.document.group) {
    return `/app/group-drafts/${params.document.id}?exitTo=${encodedExitTo}`;
  }

  return `/app/documents/${params.document.id}?left=tutor&exitTo=${encodedExitTo}`;
}

export function getTeacherDocumentWorkStatusDisplay(
  document: TeacherDocumentWorkRow
) {
  const status = getTeacherDocumentStatus(document.latestSubmission);
  const submission = document.latestSubmission;

  if (status !== 'graded' && status !== 'released') {
    return {
      status,
      label: TEACHER_DOCUMENT_STATUS_LABELS[status],
      badgeClassName: TEACHER_DOCUMENT_STATUS_BADGE_CLASSES[status],
    };
  }

  const grade = submission
    ? formatAssignmentGrade({
        submitForGrade: document.assignment?.submitForGrade,
        numericPercentage: submission.numericPercentage ?? null,
        letterGrade: submission.letterGrade ?? null,
        pointValue: document.assignment?.pointValue ?? null,
        score: submission.score,
      })
    : null;

  return {
    status,
    label: grade
      ? `${TEACHER_DOCUMENT_STATUS_LABELS[status]} · ${grade}`
      : TEACHER_DOCUMENT_STATUS_LABELS[status],
    badgeClassName: TEACHER_DOCUMENT_STATUS_BADGE_CLASSES[status],
  };
}

export function countTeacherDocumentWorkStatuses(
  documents: TeacherDocumentWorkRow[]
): Record<TeacherDocumentStatus, number> {
  const counts: Record<TeacherDocumentStatus, number> = {
    'in-progress': 0,
    'needs-grading': 0,
    graded: 0,
    released: 0,
  };

  for (const document of documents) {
    counts[getTeacherDocumentStatus(document.latestSubmission)] += 1;
  }

  return counts;
}

export function buildReleaseGradeRows(
  documents: TeacherDocumentWorkRow[]
): ReleaseGradeRow[] {
  return documents.flatMap((document) =>
    document.submissions
      .filter((submission) => {
        return hasMeaningfulGrade(submission) && !submission.releasedAt;
      })
      .map((submission) => {
        const score =
          formatAssignmentGrade({
            submitForGrade: document.assignment?.submitForGrade,
            numericPercentage: submission.numericPercentage ?? null,
            letterGrade: submission.letterGrade ?? null,
            pointValue: document.assignment?.pointValue ?? null,
            score: submission.score,
          }) ??
          submission.score ??
          null;

        return {
          id: submission.id,
          score,
          feedback: submission.feedback ?? null,
          archivedAt: submission.archivedAt ?? null,
          document: {
            id: document.id,
            title:
              submission.title?.trim() ||
              document.title?.trim() ||
              getDraftDisplayTitle(document),
            membership: {
              user: {
                name: document.membership.user.name,
                email: document.membership.user.email,
              },
            },
          },
        };
      })
  );
}

export function buildTeacherUnsubmitRows(
  documents: TeacherDocumentWorkRow[]
): TeacherUnsubmitRow[] {
  return documents.flatMap((document) => {
    const submission = document.latestSubmission;
    if (!submission) return [];

    const score =
      formatAssignmentGrade({
        submitForGrade: document.assignment?.submitForGrade,
        numericPercentage: submission.numericPercentage ?? null,
        letterGrade: submission.letterGrade ?? null,
        pointValue: document.assignment?.pointValue ?? null,
        score: submission.score,
      }) ??
      submission.score ??
      null;

    return [
      {
        id: submission.id,
        score,
        submittedAt: submission.submittedAt ?? submission.createdAt ?? null,
        document: {
          id: document.id,
          title:
            submission.title?.trim() ||
            document.title?.trim() ||
            getDraftDisplayTitle(document),
          membership: {
            user: {
              name: document.membership.user.name,
              email: document.membership.user.email,
            },
          },
        },
      },
    ];
  });
}
