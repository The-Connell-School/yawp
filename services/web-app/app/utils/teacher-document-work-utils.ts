import { formatAssignmentGrade } from '~/domain/grading/gradeMath';
import {
  TEACHER_DOCUMENT_STATUS_BADGE_CLASSES,
  TEACHER_DOCUMENT_STATUS_LABELS,
  getTeacherDocumentStatus,
  type TeacherDocumentStatus,
} from '~/utils/teacher-document-status';

export type TeacherDocumentWorkClassSummary = {
  id: string;
  grade: string;
  period: string;
  title: string | null;
};

export type TeacherDocumentWorkSubmission = {
  id: string;
  title?: string | null;
  submittedAt?: Date | string | null;
  createdAt?: Date | string | null;
  releasedAt?: Date | string | null;
  gradedAt?: Date | string | null;
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
    user: { id?: string; name: string | null; email: string };
  };
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
};

export function formatClassLabel(klass: TeacherDocumentWorkClassSummary) {
  const base = `Grade ${klass.grade} • Period ${klass.period}`;
  return klass.title ? `${base} — ${klass.title}` : base;
}

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
}) {
  const encodedExitTo = encodeURIComponent(params.exitTo);

  if (params.document.latestSubmission?.id) {
    return `/app/submissions/${params.document.latestSubmission.id}?edit=1&exitTo=${encodedExitTo}`;
  }

  return `/app/documents/${params.document.id}?left=tutor&exitTo=${encodedExitTo}`;
}

export function getTeacherDocumentWorkStatusDisplay(document: TeacherDocumentWorkRow) {
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
