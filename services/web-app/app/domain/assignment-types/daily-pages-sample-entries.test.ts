import { describe, expect, test } from 'bun:test';

import { computeWeightedBandPercentage } from '~/domain/grading/gradeMath';
import { findExcerptRange } from '~/utils/excerpt-position';

import {
  DAILY_PAGES_SHORT_FORM_CATEGORY_KEYS,
  DAILY_PAGES_SHORT_FORM_RUBRIC,
  DAILY_PAGES_SHORT_FORM_SCORING_SCALE,
} from './daily-pages-short-form-rubric';
import {
  DAILY_PAGES_SAMPLE_ASSIGNMENT,
  DAILY_PAGES_SAMPLE_ENTRIES,
  buildSampleGrammarIssues,
  buildSampleRubricScores,
  sampleGradeFields,
} from './daily-pages-sample-entries';

describe('the seeded Daily Pages entries', () => {
  test('score every rubric category, and only those', () => {
    for (const entry of DAILY_PAGES_SAMPLE_ENTRIES) {
      expect(Object.keys(entry.scores).sort()).toEqual(
        [...DAILY_PAGES_SHORT_FORM_CATEGORY_KEYS].sort()
      );
      expect(Object.keys(entry.comments).sort()).toEqual(
        [...DAILY_PAGES_SHORT_FORM_CATEGORY_KEYS].sort()
      );
    }
  });

  test('stay inside the rubric’s own scale', () => {
    const { minScore, maxScore } = DAILY_PAGES_SHORT_FORM_SCORING_SCALE;
    for (const entry of DAILY_PAGES_SAMPLE_ENTRIES) {
      for (const score of Object.values(entry.scores)) {
        expect(Number.isInteger(score)).toBe(true);
        expect(score).toBeGreaterThanOrEqual(minScore);
        expect(score).toBeLessThanOrEqual(maxScore);
      }
    }
  });

  test('carry the percentage the grading assistant would compute', () => {
    for (const entry of DAILY_PAGES_SAMPLE_ENTRIES) {
      const expected = computeWeightedBandPercentage(
        buildSampleRubricScores(entry),
        DAILY_PAGES_SHORT_FORM_RUBRIC.categories
      );
      // A null here would mean the helper could not read the scores at all,
      // which is a failure in its own right rather than a match.
      expect(expected).not.toBeNull();
      expect(sampleGradeFields(entry).numericPercentage).toBe(
        expected as number
      );
    }
  });

  test('spread across the scale rather than clustering', () => {
    const percentages = DAILY_PAGES_SAMPLE_ENTRIES.map(
      (entry) => sampleGradeFields(entry).numericPercentage
    );
    expect(new Set(percentages).size).toBe(percentages.length);
    expect(Math.max(...percentages) - Math.min(...percentages)).toBeGreaterThan(
      30
    );
    // The set has to include one entry that earns the top band and one that
    // does not clear the middle, or it teaches nothing about the rubric.
    expect(Math.max(...percentages)).toBeGreaterThanOrEqual(90);
    expect(Math.min(...percentages)).toBeLessThan(60);
  });

  test('write comments that name a next step, per category', () => {
    for (const entry of DAILY_PAGES_SAMPLE_ENTRIES) {
      for (const comment of Object.values(entry.comments)) {
        expect(comment.length).toBeGreaterThan(40);
      }
      expect(
        entry.overallComment.startsWith(`${entry.studentFirstName},`)
      ).toBe(true);
    }
  });

  test('highlight grammar excerpts that are actually in the entry', () => {
    for (const entry of DAILY_PAGES_SAMPLE_ENTRIES) {
      for (const issue of buildSampleGrammarIssues(entry).issues) {
        // A highlight whose excerpt cannot be located renders nothing, which
        // is the one way this seed could look broken in a preview.
        expect(
          findExcerptRange(entry.text, issue.excerpt, issue.occurrence)
        ).not.toBeNull();
      }
    }
  });

  test('give each seeded student exactly one entry on the sample prompt', () => {
    const personas = DAILY_PAGES_SAMPLE_ENTRIES.map((e) => e.personaKey);
    expect(new Set(personas).size).toBe(personas.length);
    expect(DAILY_PAGES_SAMPLE_ASSIGNMENT.prompt).toContain('counterexample');
  });

  test('leave one graded but unreleased, which is a real teacher state', () => {
    const unreleased = DAILY_PAGES_SAMPLE_ENTRIES.filter((e) => !e.released);
    expect(unreleased).toHaveLength(1);
  });
});

/**
 * The set exists to teach the shape, so the shape has to be visible in it:
 * the exemplar opens on its claim, and one entry hedges on purpose so the
 * coaching the rubric describes has something to point at.
 */
describe('what the set teaches', () => {
  const HEDGES = ['I think', 'I feel like', 'In my opinion'];

  test('the top-scoring entry opens on its claim, with no hedge', () => {
    const best = [...DAILY_PAGES_SAMPLE_ENTRIES].sort(
      (a, b) =>
        sampleGradeFields(b).numericPercentage -
        sampleGradeFields(a).numericPercentage
    )[0];
    const firstSentence = best.text.split(/(?<=[.?!])\s/)[0];

    for (const hedge of HEDGES) {
      expect(firstSentence.toLowerCase()).not.toContain(hedge.toLowerCase());
    }
    expect(firstSentence.length).toBeLessThan(200);
  });

  test('one entry hedges its opener, so the feedback has a case to work on', () => {
    const hedged = DAILY_PAGES_SAMPLE_ENTRIES.filter((entry) =>
      HEDGES.some((hedge) =>
        entry.text.toLowerCase().startsWith(hedge.toLowerCase())
      )
    );
    expect(hedged.length).toBeGreaterThanOrEqual(1);

    // And at least one of them is shown the cut, so the register rule has a
    // worked example and not just a statement.
    const coached = hedged.some((entry) => {
      const voice = entry.comments.voice_and_style.toLowerCase();
      return voice.includes('hedge') || voice.includes('i think that');
    });
    expect(coached).toBe(true);
  });

  test('no feedback tells a student to stop writing in the first person', () => {
    for (const entry of DAILY_PAGES_SAMPLE_ENTRIES) {
      const feedback = [...Object.values(entry.comments), entry.overallComment]
        .join(' ')
        .toLowerCase();
      expect(feedback).not.toContain('avoid the first person');
      expect(feedback).not.toContain('do not use first person');
      expect(feedback).not.toContain('don\'t use "i"');
    }
  });
});
