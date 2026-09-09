import { describe, expect, test } from 'bun:test';

import {
  ASSISTANT_NOTE_ATTRIBUTE,
  TEACHER_CARD_ATTRIBUTE,
  resolveClickedFeedback,
  resolveFeedbackFocusTarget,
} from './feedback-focus';

describe('resolveFeedbackFocusTarget', () => {
  test('a teacher comment opens the Teacher tab and targets its card', () => {
    expect(
      resolveFeedbackFocusTarget({ kind: 'teacher', id: 'comment-1' })
    ).toEqual({
      tab: 'teacher',
      selector: `[${TEACHER_CARD_ATTRIBUTE}="comment-1"]`,
    });
  });

  test('an assistant mark opens the Assistant tab and targets its note', () => {
    expect(
      resolveFeedbackFocusTarget({ kind: 'assistant', id: 'issue-1' })
    ).toEqual({
      tab: 'assistant',
      selector: `[${ASSISTANT_NOTE_ATTRIBUTE}="issue-1"]`,
    });
  });

  // The selector is built from data, so a quote in an id must not be able to
  // terminate it early and silently match the wrong element (or nothing).
  test('a quote in an id cannot break out of the selector', () => {
    const { selector } = resolveFeedbackFocusTarget({
      kind: 'teacher',
      id: 'a"] , [data-grade-comment-card="b',
    });

    // Every embedded quote is escaped, so the attribute value still ends at
    // the closing quote this module wrote rather than one from the id.
    expect(selector).toBe(
      `[${TEACHER_CARD_ATTRIBUTE}="a\\"] , [data-grade-comment-card=\\"b"]`
    );
    expect(selector.match(/(?<!\\)"/g)).toHaveLength(2);
  });
});

describe('resolveClickedFeedback', () => {
  test('a teacher mark wins when a click lands on both', () => {
    expect(
      resolveClickedFeedback({
        commentId: 'comment-1',
        grammarIssueIds: ['issue-1'],
      })
    ).toEqual({ kind: 'teacher', id: 'comment-1' });
  });

  test('an assistant mark is used when there is no teacher mark', () => {
    expect(
      resolveClickedFeedback({
        commentId: null,
        grammarIssueIds: ['issue-1', 'issue-2'],
      })
    ).toEqual({ kind: 'assistant', id: 'issue-1' });
  });

  test('a click on unmarked text focuses nothing', () => {
    expect(
      resolveClickedFeedback({ commentId: null, grammarIssueIds: [] })
    ).toBeNull();
  });
});
