import {
  hasMeaningfulGrade,
  type GradeSignals,
  type TeacherStatusSubmission,
} from '~/utils/teacher-document-status';

export function hasTeacherSavedGradeContent(submission: GradeSignals): boolean {
  return hasMeaningfulGrade({ ...submission, gradedAt: null });
}

export const FREE_TIER_NEEDS_GRADING_DOCUMENTS_HREF =
  '/app/documents?status=needs-grading&reset=1';

export type GettingStartedGradeSubmission = TeacherStatusSubmission & {
  gradedByMembershipId?: string | null;
};

export function teacherCompletedGettingStartedGrade(
  submission: GettingStartedGradeSubmission,
  teacherMembershipId: string
): boolean {
  if (submission.gradedByMembershipId !== teacherMembershipId) return false;
  if (submission.releasedAt) return true;
  return hasTeacherSavedGradeContent(submission);
}

export function resolveFreeTierGradeStepHref(params: {
  firstNeedsGradingSubmissionId: string | null;
  exitTo?: string;
}): string {
  const exitTo = params.exitTo ?? FREE_TIER_NEEDS_GRADING_DOCUMENTS_HREF;
  if (params.firstNeedsGradingSubmissionId) {
    return `/app/submissions/${params.firstNeedsGradingSubmissionId}?edit=1&exitTo=${encodeURIComponent(exitTo)}`;
  }
  return FREE_TIER_NEEDS_GRADING_DOCUMENTS_HREF;
}

export function freeTierShowGettingStartedChecklist(usage: {
  monthly?: boolean;
  checklist: { graded: boolean };
}): boolean {
  return Boolean(usage.monthly && !usage.checklist.graded);
}

export function freeTierShowAdvocatePack(usage: {
  monthly?: boolean;
  checklist: { graded: boolean };
}): boolean {
  return Boolean(usage.monthly && usage.checklist.graded);
}
