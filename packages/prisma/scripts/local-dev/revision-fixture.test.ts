import { describe, expect, test } from 'bun:test';

import { findExcerptRange } from '../../../../services/web-app/app/utils/excerpt-position.ts';
import { parseGrammarIssuesPayload } from '../../../../services/web-app/app/domain/grading/grammarIssues.ts';
import {
  GRADED_ESSAY_FIXTURES,
  buildEarlyDraftHtml,
  buildEssayHtml,
  buildGrammarIssuesPayload,
  buildRevisionDraftComments,
  essayText,
} from './revision-fixture';

/**
 * Anchors that do not resolve disappear from the UI without an error — the
 * highlight overlay simply renders nothing and the grammar parser drops the
 * issue. A fixture whose comments silently stop landing is worse than a sparse
 * one, because it looks like the feature is broken.
 */
describe.each(GRADED_ESSAY_FIXTURES.map((f) => [f.key, f] as const))(
  'graded essay fixture: %s',
  (_key, fixture) => {
    const text = essayText(fixture);

    test('is long enough to exercise the split screen', () => {
      expect(fixture.paragraphs.length).toBeGreaterThanOrEqual(5);
      expect(text.split(/\s+/).length).toBeGreaterThan(180);
    });

    test('every teacher comment anchors to the essay', () => {
      for (const comment of fixture.teacherComments) {
        expect(
          findExcerptRange(text, comment.excerpt, comment.occurrence),
          `unanchored teacher comment: ${comment.excerpt}`
        ).not.toBeNull();
      }
    });

    test('every assistant mark survives the grammar parser', () => {
      const parsed = parseGrammarIssuesPayload(
        buildGrammarIssuesPayload(fixture),
        { sourceText: text }
      );

      expect(parsed).toHaveLength(fixture.grammarIssues.length);
      for (const issue of parsed) {
        expect(
          findExcerptRange(text, issue.excerpt, issue.occurrence ?? 1),
          `unanchored assistant mark: ${issue.excerpt}`
        ).not.toBeNull();
      }
    });

    // A clean paper genuinely earns "Clean. Nothing to flag." — the bar is a
    // real sentence per category, not a minimum word count.
    test('every rubric category carries feedback, not just a number', () => {
      const entries = Object.values(fixture.rubricScores);
      expect(entries.length).toBeGreaterThanOrEqual(5);
      for (const entry of entries) {
        expect(entry.score).toBeGreaterThan(0);
        expect(entry.comment.trim().length).toBeGreaterThan(15);
      }
      const longest = Math.max(...entries.map((e) => e.comment.length));
      expect(longest).toBeGreaterThan(100);
    });

    test('draft comment marks are written into the essay html', () => {
      const comments = buildRevisionDraftComments(fixture, 'doc-1');
      const html = buildEssayHtml(fixture, comments);

      for (const comment of comments) {
        expect(
          html.includes(`data-comment-id="${comment.id}"`),
          `draft comment never anchored: ${comment.anchor}`
        ).toBe(true);
        expect(text).toContain(comment.anchor);
      }
    });

    test('has an overall comment worth reading', () => {
      expect(fixture.overallComment.length).toBeGreaterThan(120);
    });

    test('early draft html is built when an early draft exists', () => {
      const html = buildEarlyDraftHtml(fixture);
      if (fixture.earlyDraftText) {
        expect(html).toContain('<p>');
      } else {
        expect(html).toBeNull();
      }
    });
  }
);

describe('the fixture set as a whole', () => {
  test('keys are unique, so seeded row ids cannot collide', () => {
    const keys = GRADED_ESSAY_FIXTURES.map((fixture) => fixture.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  test('titles are distinct, so the document list is scannable', () => {
    const titles = GRADED_ESSAY_FIXTURES.map((fixture) => fixture.title);
    expect(new Set(titles).size).toBe(titles.length);
  });

  // The point of seeding more than one essay is range: a screen that only ever
  // sees medium-density feedback hides both failure modes.
  test('covers a heavy, a medium and an all-but-empty feedback load', () => {
    const loads = GRADED_ESSAY_FIXTURES.map(
      (fixture) =>
        fixture.teacherComments.length + fixture.grammarIssues.length
    ).sort((a, b) => a - b);

    expect(loads[0]).toBeLessThanOrEqual(3);
    expect(loads[loads.length - 1]).toBeGreaterThanOrEqual(15);
  });

  test('at least one essay has no assistant marks at all', () => {
    expect(
      GRADED_ESSAY_FIXTURES.some(
        (fixture) => fixture.grammarIssues.length === 0
      )
    ).toBe(true);
  });

  test('grades span a range rather than clustering', () => {
    const grades = GRADED_ESSAY_FIXTURES.map((f) => f.numericPercentage);
    expect(Math.max(...grades) - Math.min(...grades)).toBeGreaterThanOrEqual(
      20
    );
  });

  // The preview-seat script seeds one organization per seat into a single
  // shared database, so hardcoded ids made the second seat die on
  // DocumentComment_pkey and took the preview-access E2E suite down with it.
  test('two seed runs produce no colliding document comment ids', () => {
    const ids = GRADED_ESSAY_FIXTURES.flatMap((fixture) => [
      ...buildRevisionDraftComments(fixture, 'org-1'),
      ...buildRevisionDraftComments(fixture, 'org-2'),
    ]).map((comment) => comment.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  test('assistant mark ids are unique across essays', () => {
    const ids = GRADED_ESSAY_FIXTURES.flatMap(
      (fixture) => buildGrammarIssuesPayload(fixture).issues
    ).map((issue) => issue.id);

    expect(new Set(ids).size).toBe(ids.length);
  });
});
