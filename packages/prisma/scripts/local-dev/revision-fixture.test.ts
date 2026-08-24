import { describe, expect, test } from 'bun:test';

import { findExcerptRange } from '../../../../services/web-app/app/utils/excerpt-position.ts';
import { parseGrammarIssuesPayload } from '../../../../services/web-app/app/domain/grading/grammarIssues.ts';
import {
  REVISION_DRAFT_COMMENTS,
  REVISION_ESSAY_PARAGRAPHS,
  REVISION_ESSAY_TEXT,
  REVISION_GRAMMAR_ISSUES,
  REVISION_RUBRIC_SCORES,
  REVISION_TEACHER_COMMENTS,
  buildRevisionDraftComments,
  buildRevisionEssayHtml,
  buildRevisionGrammarIssuesPayload,
} from './revision-fixture';

/**
 * Anchors that do not resolve disappear from the UI without an error — the
 * highlight overlay simply renders nothing and the grammar parser drops the
 * issue. A fixture whose comments silently stop landing is worse than a sparse
 * one, because it looks like the feature is broken.
 */
describe('local dev revision fixture', () => {
  test('is long enough to exercise the split screen', () => {
    expect(REVISION_ESSAY_PARAGRAPHS.length).toBeGreaterThanOrEqual(6);
    expect(REVISION_ESSAY_TEXT.split(/\s+/).length).toBeGreaterThan(400);
  });

  test('every teacher comment anchors to the essay', () => {
    for (const comment of REVISION_TEACHER_COMMENTS) {
      const range = findExcerptRange(
        REVISION_ESSAY_TEXT,
        comment.excerpt,
        comment.occurrence
      );
      expect(range, `unanchored teacher comment: ${comment.excerpt}`).not.toBeNull();
    }
  });

  test('teacher comments cover the whole essay, not just the opening', () => {
    const positions = REVISION_TEACHER_COMMENTS.map(
      (comment) =>
        findExcerptRange(
          REVISION_ESSAY_TEXT,
          comment.excerpt,
          comment.occurrence
        )!.start
    );

    expect(REVISION_TEACHER_COMMENTS.length).toBeGreaterThanOrEqual(8);
    expect(Math.min(...positions)).toBeLessThan(REVISION_ESSAY_TEXT.length / 4);
    expect(Math.max(...positions)).toBeGreaterThan(
      (REVISION_ESSAY_TEXT.length * 3) / 4
    );
  });

  test('every assistant mark survives the grammar parser', () => {
    const parsed = parseGrammarIssuesPayload(
      buildRevisionGrammarIssuesPayload(),
      { sourceText: REVISION_ESSAY_TEXT }
    );

    expect(parsed).toHaveLength(REVISION_GRAMMAR_ISSUES.length);
    expect(parsed.map((issue) => issue.id).sort()).toEqual(
      REVISION_GRAMMAR_ISSUES.map((issue) => issue.id).sort()
    );
    // Both kinds render differently in the panel; keep one of each in the mix.
    expect(parsed.some((issue) => issue.kind === 'error')).toBe(true);
    expect(parsed.some((issue) => issue.kind === 'style')).toBe(true);
  });

  test('every rubric category carries feedback, not just a number', () => {
    const entries = Object.values(REVISION_RUBRIC_SCORES);
    expect(entries.length).toBeGreaterThanOrEqual(5);
    for (const entry of entries) {
      expect(entry.score).toBeGreaterThan(0);
      expect(entry.comment.length).toBeGreaterThan(80);
    }
  });

  test('draft comment marks are written into the essay html', () => {
    const comments = buildRevisionDraftComments('doc-1');
    const html = buildRevisionEssayHtml(comments);

    for (const comment of comments) {
      expect(
        html.includes(`data-comment-id="${comment.id}"`),
        `draft comment never anchored: ${comment.anchor}`
      ).toBe(true);
      expect(REVISION_ESSAY_TEXT).toContain(comment.anchor);
    }
  });

  test('draft comment keys are unique', () => {
    const keys = REVISION_DRAFT_COMMENTS.map((comment) => comment.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  // The preview-seat script seeds one organization per seat into a single
  // shared database, so hardcoded ids made the second seat die on
  // DocumentComment_pkey and took the preview-access E2E suite down with it.
  test('two seed runs produce no colliding document comment ids', () => {
    const first = buildRevisionDraftComments('doc-1');
    const second = buildRevisionDraftComments('doc-2');
    const all = [...first, ...second].map((comment) => comment.id);

    expect(new Set(all).size).toBe(all.length);
  });

  test('essay html carries the ids of the comments it was built with', () => {
    const comments = buildRevisionDraftComments('doc-2');
    const html = buildRevisionEssayHtml(comments);

    expect(html).not.toContain('doc-1');
    for (const comment of comments) {
      expect(html).toContain(`data-comment-id="${comment.id}"`);
    }
  });
});
