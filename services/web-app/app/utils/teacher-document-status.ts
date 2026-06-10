export type TeacherDocumentStatus =
  | 'in-progress'
  | 'needs-grading'
  | 'graded'
  | 'released';

export type GradeSignals = {
  score?: string | null;
  feedback?: string | null;
  rubricScores?: unknown | null;
  overallComment?: string | null;
  numericPercentage?: number | null;
  letterGrade?: string | null;
  gradedAt?: Date | string | null;
};

export type TeacherStatusSubmission = GradeSignals & {
  releasedAt?: Date | string | null;
};

export function hasMeaningfulGrade(submission: GradeSignals): boolean {
  return Boolean(
    submission.gradedAt ||
      submission.score ||
      submission.feedback ||
      submission.overallComment ||
      submission.letterGrade ||
      (submission.numericPercentage !== null &&
        submission.numericPercentage !== undefined) ||
      (submission.rubricScores &&
        typeof submission.rubricScores === 'object' &&
        Object.keys(submission.rubricScores as Record<string, unknown>)
          .length > 0)
  );
}

export function getTeacherDocumentStatus(
  latestSubmission: TeacherStatusSubmission | null | undefined
): TeacherDocumentStatus {
  if (!latestSubmission) return 'in-progress';
  if (latestSubmission.releasedAt) return 'released';
  if (hasMeaningfulGrade(latestSubmission)) return 'graded';
  return 'needs-grading';
}

export const TEACHER_DOCUMENT_STATUSES: TeacherDocumentStatus[] = [
  'in-progress',
  'needs-grading',
  'graded',
  'released',
];

export const TEACHER_DOCUMENT_STATUS_LABELS: Record<
  TeacherDocumentStatus,
  string
> = {
  'in-progress': 'In Progress',
  'needs-grading': 'Needs Grading',
  graded: 'Graded',
  released: 'Released',
};

export const TEACHER_DOCUMENT_STATUS_BADGE_CLASSES: Record<
  TeacherDocumentStatus,
  string
> = {
  'in-progress': 'bg-muted text-muted-foreground border-transparent',
  'needs-grading':
    'bg-yellow-100 text-yellow-800 border-yellow-200 hover:bg-yellow-100',
  graded: 'bg-blue-100 text-blue-700 border-blue-200 hover:bg-blue-100',
  released: 'bg-green-100 text-green-700 border-green-200 hover:bg-green-100',
};
