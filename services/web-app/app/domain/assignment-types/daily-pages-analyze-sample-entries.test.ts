import { describe, expect, test } from 'bun:test';

import { computeWeightedBandPercentage } from '~/domain/grading/gradeMath';
import { findExcerptRange } from '~/utils/excerpt-position';
import shortFormPrompts from '~/routes/app.assignment-types.$id/short-form-prompts-library/prompts.json';

import {
  DAILY_PAGES_ANALYZE_SAMPLE_ASSIGNMENT,
  DAILY_PAGES_ANALYZE_SAMPLE_DRAFT,
  DAILY_PAGES_ANALYZE_SAMPLE_ENTRIES,
} from './daily-pages-analyze-sample-entries';
import { getParagraphMode } from './daily-pages-paragraph-modes';
import {
  buildSampleGrammarIssues,
  buildSampleRubricScores,
  sampleGradeFields,
} from './daily-pages-sample-entries';
import {
  DAILY_PAGES_SHORT_FORM_CATEGORY_KEYS,
  DAILY_PAGES_SHORT_FORM_RUBRIC,
  DAILY_PAGES_SHORT_FORM_SCORING_SCALE,
} from './daily-pages-short-form-rubric';

const entries = DAILY_PAGES_ANALYZE_SAMPLE_ENTRIES;
const percent = (entry: (typeof entries)[number]) =>
  sampleGradeFields(entry).numericPercentage;

/**
 * An Analyze class set for seeded environments: what a Daily Pages
 * assignment run as an analysis paragraph looks like once a class has
 * written it — and one draft left open, so the live tutor can be tried on it.
 */
describe('the seeded Analyze assignment', () => {
  test('is an Analyze paragraph, timed like a Daily Pages entry', () => {
    expect(DAILY_PAGES_ANALYZE_SAMPLE_ASSIGNMENT.paragraphMode).toBe('analyze');
    expect(
      getParagraphMode(DAILY_PAGES_ANALYZE_SAMPLE_ASSIGNMENT.paragraphMode)
    ).not.toBeNull();
    expect(DAILY_PAGES_ANALYZE_SAMPLE_ASSIGNMENT.writingTimeMinutes).toBe(15);
  });

  test('uses a library Analyze prompt word for word', () => {
    const libraryPrompt = (
      shortFormPrompts as Array<{
        id: string;
        prompt: string;
        cognitiveMoves: string[];
      }>
    ).find((prompt) => prompt.id === DAILY_PAGES_ANALYZE_SAMPLE_ASSIGNMENT.libraryPromptId);
    expect(libraryPrompt?.cognitiveMoves).toContain('analyze');
    expect(DAILY_PAGES_ANALYZE_SAMPLE_ASSIGNMENT.prompt as string).toBe(
      libraryPrompt!.prompt
    );
  });
});

describe('the seeded Analyze entries', () => {
  test('score every rubric category, inside the scale', () => {
    const { minScore, maxScore } = DAILY_PAGES_SHORT_FORM_SCORING_SCALE;
    for (const entry of entries) {
      expect(Object.keys(entry.scores).sort()).toEqual(
        [...DAILY_PAGES_SHORT_FORM_CATEGORY_KEYS].sort()
      );
      expect(Object.keys(entry.comments).sort()).toEqual(
        [...DAILY_PAGES_SHORT_FORM_CATEGORY_KEYS].sort()
      );
      for (const score of Object.values(entry.scores)) {
        expect(score).toBeGreaterThanOrEqual(minScore);
        expect(score).toBeLessThanOrEqual(maxScore);
      }
    }
  });

  test('carry the percentage the grading assistant would compute', () => {
    for (const entry of entries) {
      expect(percent(entry)).toBe(
        computeWeightedBandPercentage(
          buildSampleRubricScores(entry),
          DAILY_PAGES_SHORT_FORM_RUBRIC.categories
        ) as number
      );
    }
  });

  test('highlight grammar excerpts that are actually in the entry', () => {
    for (const entry of entries) {
      for (const issue of buildSampleGrammarIssues(entry).issues) {
        expect(
          findExcerptRange(entry.text, issue.excerpt, issue.occurrence)
        ).not.toBeNull();
      }
    }
  });

  test('address each student by name', () => {
    for (const entry of entries) {
      expect(entry.overallComment.startsWith(`${entry.studentFirstName},`)).toBe(
        true
      );
    }
  });

  test('give each seeded student one piece of work, the draft included', () => {
    const personas = [
      ...entries.map((entry) => entry.personaKey),
      DAILY_PAGES_ANALYZE_SAMPLE_DRAFT.personaKey,
    ];
    expect(new Set(personas).size).toBe(personas.length);
  });

  test('leave one graded but unreleased', () => {
    expect(entries.filter((entry) => !entry.released)).toHaveLength(1);
  });
});

/**
 * Analysis is won or lost on explaining the evidence. The set shows the three
 * places an analysis paragraph lands: one that explains how the words work,
 * one that quotes and never explains, one that retells the scene.
 */
describe('what the set teaches about Analyze', () => {
  const byKey = (key: string) => entries.find((entry) => entry.key === key)!;

  test('the strong entry quotes the line and explains how it works', () => {
    const strong = byKey('analyze-explains');
    expect(strong.text).toContain("'Tis but thy name that is my enemy");
    expect(percent(strong)).toBeGreaterThanOrEqual(90);
  });

  test('quoting without explaining stays below a passing grade', () => {
    const quotes = byKey('analyze-quotes-only');
    expect(quotes.text).toContain('This shows');
    expect(quotes.scores.development_of_thought).toBeLessThanOrEqual(2);
    expect(percent(quotes)).toBeLessThan(65);
    expect(quotes.comments.development_of_thought.toLowerCase()).toContain(
      'explain'
    );
  });

  test('retelling the scene is not analysis', () => {
    const summary = byKey('analyze-retells');
    expect(summary.scores.depth_of_thought).toBe(1);
    expect(percent(summary)).toBeLessThan(percent(byKey('analyze-quotes-only')));
  });

  /** Left unsubmitted so the live Analyze tutor has a draft to coach. */
  test('the draft has a claim and a quote, and stops before the analysis', () => {
    const draft = DAILY_PAGES_ANALYZE_SAMPLE_DRAFT;
    expect(draft.text).toContain("'Tis but thy name that is my enemy");
    expect(draft.text.split(/(?<=[.?!])\s/).length).toBeLessThanOrEqual(3);
  });
});
