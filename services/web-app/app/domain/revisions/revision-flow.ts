/**
 * Student revision flow (V1) — routing and access rules.
 *
 * V1 gives a student whose grade has been released a split screen: the frozen
 * graded submission (with grading-assistant and teacher feedback) on the left,
 * their live document on the right. The revision tutor lands in V2, so nothing
 * here knows about the tutor yet.
 *
 * Every rule lives in this module as a pure function so the loader, the entry
 * point on the submission page, and the tests all agree on one definition of
 * "this student may revise".
 */

export const LEGACY_REVISE_QUERY = 'revise=1';

export type RevisionEntryInput = {
  /** Organization rollout gate — off means the legacy path, always. */
  revisionFlowEnabled: boolean;
  submissionId: string;
  documentId: string;
  /** A grade the teacher has released to the student. */
  isReleased: boolean;
  /** Student withdrew the submission, so there is nothing graded to revise. */
  isWithdrawn?: boolean;
};

/**
 * Where the "Revise Essay" button on the graded submission page points.
 *
 * The legacy destination is the fallback for every case the new flow does not
 * cover, so turning the flag off anywhere restores today's behavior exactly.
 */
export function resolveRevisionEntryPath({
  revisionFlowEnabled,
  submissionId,
  documentId,
  isReleased,
  isWithdrawn = false,
}: RevisionEntryInput): string {
  const legacyPath = `/app/documents/${documentId}?${LEGACY_REVISE_QUERY}`;
  if (!revisionFlowEnabled) return legacyPath;
  if (!isReleased || isWithdrawn) return legacyPath;
  return `/app/revise/${submissionId}`;
}

export type RevisionDenialReason =
  | 'flag-off'
  | 'not-owner'
  | 'not-released'
  | 'withdrawn';

export type RevisionAccess =
  | { allowed: true }
  | { allowed: false; reason: RevisionDenialReason };

export type RevisionAccessInput = {
  revisionFlowEnabled: boolean;
  /** The viewer owns the document behind this submission. */
  isOwner: boolean;
  isReleased: boolean;
  isWithdrawn: boolean;
};

/**
 * Who may open /app/revise/:submissionId.
 *
 * Owner-only by design: a teacher revising a student's essay would write into
 * the student's live document. Teachers keep the grading view they already
 * have.
 */
export function resolveRevisionAccess({
  revisionFlowEnabled,
  isOwner,
  isReleased,
  isWithdrawn,
}: RevisionAccessInput): RevisionAccess {
  if (!revisionFlowEnabled) return { allowed: false, reason: 'flag-off' };
  if (!isOwner) return { allowed: false, reason: 'not-owner' };
  if (isWithdrawn) return { allowed: false, reason: 'withdrawn' };
  if (!isReleased) return { allowed: false, reason: 'not-released' };
  return { allowed: true };
}

export type RevisionDenialRedirect = {
  path: string;
  description: string;
  type: 'error' | 'message';
};

/**
 * Every denial lands somewhere useful rather than on an error page: the flag
 * being off is not a mistake the student made, and neither is arriving before
 * the grade is released.
 */
export function resolveRevisionDenialRedirect({
  reason,
  submissionId,
  documentId,
}: {
  reason: RevisionDenialReason;
  submissionId: string;
  documentId: string;
}): RevisionDenialRedirect {
  switch (reason) {
    case 'flag-off':
      return {
        path: `/app/documents/${documentId}?${LEGACY_REVISE_QUERY}`,
        description: 'Opening your draft.',
        type: 'message',
      };
    case 'withdrawn':
      return {
        path: `/app/documents/${documentId}?${LEGACY_REVISE_QUERY}`,
        description:
          'You unsubmitted this document. You can revise and resubmit it.',
        type: 'message',
      };
    case 'not-released':
      return {
        path: `/app/submissions/${submissionId}`,
        description: 'You can revise this essay once your grade is released.',
        type: 'message',
      };
    case 'not-owner':
      return {
        path: `/app/submissions/${submissionId}`,
        description: 'Only the student who wrote this essay can revise it.',
        type: 'error',
      };
  }
}
