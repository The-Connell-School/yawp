/**
 * Clicking a mark in the graded essay asks one question — "what was said about
 * this?" — so the answer has to come to the student: the panel reopens if they
 * collapsed it, moves to the tab that holds the note, and scrolls that note
 * into view.
 *
 * The selector lives here rather than inline so the attribute the panel renders
 * and the attribute it later queries cannot drift apart: a mismatch would leave
 * the panel opening on the right tab and silently not scrolling, which reads as
 * the click having done nothing.
 */

export type FeedbackFocusKind = 'teacher' | 'assistant';

export type FeedbackFocusRequest = {
  kind: FeedbackFocusKind;
  id: string;
  /**
   * Distinguishes one click from the next. Without it, clicking the same mark
   * twice would not reopen a panel the student collapsed in between, because
   * the request would be unchanged.
   */
  nonce: number;
};

export type FeedbackFocusTarget = {
  tab: FeedbackFocusKind;
  selector: string;
};

/** Attribute the teacher comment cards already carry, from the shared card. */
export const TEACHER_CARD_ATTRIBUTE = 'data-grade-comment-card';
/** Attribute the assistant notes carry for the same purpose. */
export const ASSISTANT_NOTE_ATTRIBUTE = 'data-assistant-note-id';

function escapeAttributeValue(value: string): string {
  // Ids are generated (cuid) or fixture-authored, so quotes are not expected —
  // but a selector built from data must not be breakable by one.
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

export function resolveFeedbackFocusTarget(
  request: Pick<FeedbackFocusRequest, 'kind' | 'id'>
): FeedbackFocusTarget {
  const attribute =
    request.kind === 'teacher'
      ? TEACHER_CARD_ATTRIBUTE
      : ASSISTANT_NOTE_ATTRIBUTE;

  return {
    tab: request.kind,
    selector: `[${attribute}="${escapeAttributeValue(request.id)}"]`,
  };
}

/**
 * A click lands on whichever marks wrap that text. Teacher comments win over
 * assistant marks when both do: the teacher's note is the one the student is
 * being graded on, and the assistant note is reachable from its own mark
 * elsewhere in the sentence.
 */
export function resolveClickedFeedback({
  commentId,
  grammarIssueIds,
}: {
  commentId: string | null;
  grammarIssueIds: string[];
}): { kind: FeedbackFocusKind; id: string } | null {
  if (commentId) return { kind: 'teacher', id: commentId };
  const [firstIssueId] = grammarIssueIds;
  if (firstIssueId) return { kind: 'assistant', id: firstIssueId };
  return null;
}
