/**
 * Strip grade and feedback from submission-shaped payloads before they reach
 * students. The UI hiding fields is not enough — loader and API responses must
 * not carry unreleased scores, comments, or anything derived from them.
 */

export type SubmissionReleaseState = {
  releasedAt?: Date | string | null;
};

export function isSubmissionGradeReleasedToStudent(
  submission: SubmissionReleaseState | null | undefined
): boolean {
  return submission?.releasedAt != null;
}

/** Top-level submission columns that are grade or feedback (or grading metadata). */
export const SUBMISSION_GRADE_AND_FEEDBACK_FIELDS = [
  'score',
  'feedback',
  'rubricScores',
  'overallScore',
  'overallComment',
  'numericPercentage',
  'letterGrade',
  'grammarIssues',
  'aiMeta',
  'gradedAt',
  'gradedByMembershipId',
] as const;

export type SubmissionGradeAndFeedbackField =
  (typeof SUBMISSION_GRADE_AND_FEEDBACK_FIELDS)[number];

/** Per-version rows in document.submissions lists on the submission page. */
export const SUBMISSION_VERSION_GRADE_FIELDS = [
  'numericPercentage',
  'letterGrade',
  'score',
] as const;

export type SubmissionSummaryGradeField =
  (typeof SUBMISSION_VERSION_GRADE_FIELDS)[number];

function nullGradeFields<T extends Record<string, unknown>>(
  submission: T,
  fields: readonly string[]
): T {
  const next = { ...submission };
  for (const field of fields) {
    if (field in next) {
      (next as Record<string, unknown>)[field] = null;
    }
  }
  return next;
}

/**
 * Removes grade columns from a submission summary when the grade is not released.
 */
export function stripUnreleasedGradeFromSubmissionSummary<
  T extends SubmissionReleaseState & Record<string, unknown>,
>(submission: T): T {
  if (isSubmissionGradeReleasedToStudent(submission)) {
    return submission;
  }
  return nullGradeFields(submission, SUBMISSION_VERSION_GRADE_FIELDS);
}

export function stripUnreleasedGradeFromSubmissionSummaries<
  T extends SubmissionReleaseState & Record<string, unknown>,
>(submissions: T[]): T[] {
  return submissions.map(stripUnreleasedGradeFromSubmissionSummary);
}

export type StudentSubmissionLoaderPayload = Record<string, unknown> & {
  releasedAt?: Date | string | null;
  comments?: unknown;
  document?: {
    submissions?: Array<SubmissionReleaseState & Record<string, unknown>>;
  } | null;
  assistantSuggestion?: unknown;
};

/**
 * Full submission loader/API shape for a student owner before release.
 */
export function stripUnreleasedGradeFromStudentSubmissionPayload<
  T extends StudentSubmissionLoaderPayload,
>(submission: T): T {
  if (isSubmissionGradeReleasedToStudent(submission)) {
    return submission;
  }

  let next = nullGradeFields(submission, SUBMISSION_GRADE_AND_FEEDBACK_FIELDS);
  next = { ...next, comments: [] };

  if ('assistantSuggestion' in next) {
    const { assistantSuggestion: _removed, ...rest } = next as T & {
      assistantSuggestion?: unknown;
    };
    next = rest as T;
  }

  const document = next.document;
  if (document && Array.isArray(document.submissions)) {
    next = {
      ...next,
      document: {
        ...document,
        submissions: stripUnreleasedGradeFromSubmissionSummaries(
          document.submissions
        ),
      },
    };
  }

  return next;
}

/** True when the viewer is the student (or group member) but not staff. */
export function shouldHideUnreleasedGradeFromStudent({
  isOwner,
  isTeacher,
  isAdmin,
}: {
  isOwner: boolean;
  isTeacher: boolean;
  isAdmin: boolean;
}): boolean {
  return isOwner && !isTeacher && !isAdmin;
}
