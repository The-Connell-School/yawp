import { describe, expect, test } from 'bun:test';

import { getParagraphMode } from '~/domain/assignment-types/daily-pages-paragraph-modes';
import {
  DAILY_PAGES_SHORT_FORM_CATEGORY_KEYS,
  DAILY_PAGES_SHORT_FORM_RUBRIC,
} from '~/domain/assignment-types/daily-pages-short-form-rubric';

import { dailyPagesCalibrationV1 } from './daily-pages-calibration.v1';
import {
  runGradingBenchmark,
  type GradingBenchmarkCase,
} from './grading-benchmark';

const suite = dailyPagesCalibrationV1;

function caseTagged(tag: string) {
  return suite.cases.filter((benchmarkCase) =>
    benchmarkCase.tags.includes(tag)
  );
}

/** The weighted percentage an output scoring at one end of every band earns. */
function composite(
  benchmarkCase: GradingBenchmarkCase,
  end: 'min' | 'max'
): number {
  const total = DAILY_PAGES_SHORT_FORM_RUBRIC.categories.reduce(
    (sum, category) =>
      sum +
      (benchmarkCase.expectations.scoreBands[category.key][end] / 5) *
        category.weight,
    0
  );
  return Math.round(total * 100);
}

describe('the Daily Pages calibration suite', () => {
  test('scores on the Daily Pages rubric, not the essay one', () => {
    expect(suite.rubric.categoryKeys).toEqual([
      ...DAILY_PAGES_SHORT_FORM_CATEGORY_KEYS,
    ]);
    expect(suite.rubric.minScore).toBe(1);
    expect(suite.rubric.maxScore).toBe(5);
  });

  /**
   * Big enough to see drift, small enough to run live after every change.
   * The ceiling grows a little as each paragraph type adds its cases.
   */
  test('is big enough to see drift across the scale', () => {
    expect(suite.cases.length).toBeGreaterThanOrEqual(8);
    expect(suite.cases.length).toBeLessThanOrEqual(30);
  });

  test('gives every case a band for every category, inside the scale', () => {
    for (const benchmarkCase of suite.cases) {
      for (const key of DAILY_PAGES_SHORT_FORM_CATEGORY_KEYS) {
        const band = benchmarkCase.expectations.scoreBands[key];
        expect(band).toBeDefined();
        expect(band.min).toBeGreaterThanOrEqual(1);
        expect(band.max).toBeLessThanOrEqual(5);
        expect(band.min).toBeLessThanOrEqual(band.max);
      }
    }
  });

  /** A Daily Pages entry is graded as timed writing to a prompt, never untimed. */
  test('grades every case as timed writing to a prompt', () => {
    for (const benchmarkCase of suite.cases) {
      expect(benchmarkCase.input.writingTimeMinutes).toBeGreaterThan(0);
      expect(benchmarkCase.input.assignmentPrompt?.length).toBeGreaterThan(20);
    }
  });

  test('gives every case unique ids and at least one qualitative check', () => {
    const ids = suite.cases.map((benchmarkCase) => benchmarkCase.id);
    expect(new Set(ids).size).toBe(ids.length);
    const evaluatorIds = new Set(suite.evaluations.map((item) => item.id));
    for (const benchmarkCase of suite.cases) {
      expect(benchmarkCase.expectations.qualitative.length).toBeGreaterThan(0);
      for (const item of benchmarkCase.expectations.qualitative) {
        expect(evaluatorIds.has(item.evaluatorId)).toBe(true);
      }
    }
  });

  test('is synthetic and review-gated like the core benchmark', () => {
    for (const benchmarkCase of suite.cases) {
      expect(benchmarkCase.provenance.kind).toBe('synthetic');
      expect(benchmarkCase.approval.status).toBe('draft');
    }
  });
});

/**
 * The bands are where the strictness decision lives. The first examples were
 * too lenient, so the suite pins effort-only work below a passing grade and
 * keeps strong work — including strong work with a few slips — at the top.
 */
describe('the strictness the suite encodes', () => {
  test('effort alone cannot reach a passing composite', () => {
    const effortOnly = caseTagged('effort-only');
    expect(effortOnly.length).toBeGreaterThanOrEqual(3);
    for (const benchmarkCase of effortOnly) {
      expect(composite(benchmarkCase, 'max')).toBeLessThan(65);
    }
  });

  test('strong paragraphs of more than one kind can reach the top', () => {
    const strong = caseTagged('strong');
    expect(strong.length).toBeGreaterThanOrEqual(3);
    for (const benchmarkCase of strong) {
      expect(composite(benchmarkCase, 'min')).toBeGreaterThanOrEqual(80);
    }
  });

  test('a strong paragraph need not open with a claim', () => {
    const noSingleForm = caseTagged('no-single-form');
    expect(noSingleForm.length).toBeGreaterThanOrEqual(1);
    for (const benchmarkCase of noSingleForm) {
      expect(
        benchmarkCase.expectations.scoreBands.organization_and_structure.min
      ).toBeGreaterThanOrEqual(4);
    }
  });

  test('scattered slips keep the top grammar bands; distracting errors do not', () => {
    const slips = caseTagged('ap-grammar-slips');
    const distracting = caseTagged('ap-grammar-distracting');
    expect(slips.length).toBeGreaterThanOrEqual(1);
    expect(distracting.length).toBeGreaterThanOrEqual(1);
    for (const benchmarkCase of slips) {
      expect(
        benchmarkCase.expectations.scoreBands.grammar_and_mechanics.min
      ).toBeGreaterThanOrEqual(4);
    }
    for (const benchmarkCase of distracting) {
      expect(
        benchmarkCase.expectations.scoreBands.grammar_and_mechanics.max
      ).toBeLessThanOrEqual(2);
    }
  });

  test('unedited prose is held below the top of Voice/Style', () => {
    for (const benchmarkCase of caseTagged('unedited')) {
      expect(
        benchmarkCase.expectations.scoreBands.voice_and_style.max
      ).toBeLessThanOrEqual(3);
    }
  });
});

/**
 * A paragraph type is switched on only after it is calibrated, so the suite
 * grades cases under it the way an assignment with that type is graded: with
 * the type's guidance in the prompt.
 */
describe('the paragraph types the suite grades under', () => {
  function gradedUnder(key: string) {
    return suite.cases.filter(
      (benchmarkCase) => benchmarkCase.input.paragraphMode === key
    );
  }

  test('names only paragraph types that are switched on', () => {
    for (const benchmarkCase of suite.cases) {
      const key = benchmarkCase.input.paragraphMode;
      if (key === undefined) continue;
      expect(getParagraphMode(key)).not.toBeNull();
    }
  });

  test('grades Argue a position across the scale', () => {
    const argued = gradedUnder('argue');
    expect(argued.length).toBeGreaterThanOrEqual(3);
    expect(
      argued.some((benchmarkCase) => composite(benchmarkCase, 'min') >= 80)
    ).toBe(true);
  });

  /**
   * A top Argue paragraph takes a side with a stated condition, gives one
   * reason, faces a hard case, and ends on the narrower position the test
   * produced. More than one such paragraph, on different prompts, keeps the
   * top band from being calibrated on a single example.
   */
  test('reaches the top for argued paragraphs that face their hardest case', () => {
    const exemplars = gradedUnder('argue').filter((benchmarkCase) =>
      benchmarkCase.tags.includes('strong')
    );
    expect(exemplars.length).toBeGreaterThanOrEqual(3);
    expect(
      new Set(exemplars.map((c) => c.input.assignmentPrompt)).size
    ).toBe(exemplars.length);
    for (const benchmarkCase of exemplars) {
      expect(composite(benchmarkCase, 'min')).toBeGreaterThanOrEqual(80);
      expect(
        benchmarkCase.expectations.scoreBands.depth_of_thought.min
      ).toBeGreaterThanOrEqual(4);
      expect(
        benchmarkCase.expectations.scoreBands.development_of_thought.min
      ).toBeGreaterThanOrEqual(4);
    }
  });

  /** "Both sides have a point" is not a position, however well it is written. */
  test('a straddle that takes no position stays low on Depth of Thought', () => {
    const straddles = caseTagged('argue-straddle');
    expect(straddles.length).toBeGreaterThanOrEqual(1);
    for (const benchmarkCase of straddles) {
      expect(benchmarkCase.input.paragraphMode).toBe('argue');
      expect(
        benchmarkCase.expectations.scoreBands.depth_of_thought.max
      ).toBeLessThanOrEqual(2);
    }
  });

  /** Reasons held up only by generalities have not been tested. */
  test('a position never tested against a specific case stays low on Development', () => {
    const untested = caseTagged('argue-untested');
    expect(untested.length).toBeGreaterThanOrEqual(1);
    for (const benchmarkCase of untested) {
      expect(benchmarkCase.input.paragraphMode).toBe('argue');
      expect(
        benchmarkCase.expectations.scoreBands.development_of_thought.max
      ).toBeLessThanOrEqual(2);
    }
  });
});

/**
 * Define a term, Interpret, Evaluate and Synthesize each get a strong
 * paragraph that reaches the top, and a miss for each of the two ways the
 * type most often goes wrong: one held down on Depth of Thought, the other on
 * Development of Thought.
 */
describe.each([
  { key: 'define', depthMiss: 'define-dictionary', developmentMiss: 'define-untested' },
  { key: 'interpret', depthMiss: 'interpret-paraphrase', developmentMiss: 'interpret-unsupported' },
  { key: 'evaluate', depthMiss: 'evaluate-no-standard', developmentMiss: 'evaluate-unapplied' },
  { key: 'synthesize', depthMiss: 'synthesize-summaries', developmentMiss: 'synthesize-one-source' },
])('calibrating $key', ({ key, depthMiss, developmentMiss }) => {
  const gradedUnder = suite.cases.filter(
    (benchmarkCase) => benchmarkCase.input.paragraphMode === key
  );

  test('grades it across the scale', () => {
    expect(gradedUnder.length).toBeGreaterThanOrEqual(3);
    expect(
      new Set(gradedUnder.map((c) => c.input.assignmentPrompt)).size
    ).toBe(gradedUnder.length);
  });

  test('reaches the top for a paragraph with all three parts', () => {
    const strong = gradedUnder.filter((c) => c.tags.includes('strong'));
    expect(strong.length).toBeGreaterThanOrEqual(1);
    for (const benchmarkCase of strong) {
      expect(composite(benchmarkCase, 'min')).toBeGreaterThanOrEqual(80);
      expect(
        benchmarkCase.expectations.scoreBands.depth_of_thought.min
      ).toBeGreaterThanOrEqual(4);
      expect(
        benchmarkCase.expectations.scoreBands.development_of_thought.min
      ).toBeGreaterThanOrEqual(4);
    }
  });

  test(`${depthMiss} stays low on Depth of Thought`, () => {
    const misses = caseTagged(depthMiss);
    expect(misses.length).toBeGreaterThanOrEqual(1);
    for (const benchmarkCase of misses) {
      expect(benchmarkCase.input.paragraphMode).toBe(key);
      expect(
        benchmarkCase.expectations.scoreBands.depth_of_thought.max
      ).toBeLessThanOrEqual(2);
    }
  });

  test(`${developmentMiss} stays low on Development of Thought`, () => {
    const misses = caseTagged(developmentMiss);
    expect(misses.length).toBeGreaterThanOrEqual(1);
    for (const benchmarkCase of misses) {
      expect(benchmarkCase.input.paragraphMode).toBe(key);
      expect(
        benchmarkCase.expectations.scoreBands.development_of_thought.max
      ).toBeLessThanOrEqual(2);
    }
  });
});

describe('running the suite', () => {
  test('an output inside every band passes the code checks', async () => {
    const result = await runGradingBenchmark({
      suite,
      execute: async (benchmarkCase) => ({
        categories: DAILY_PAGES_SHORT_FORM_CATEGORY_KEYS.map((key) => ({
          key,
          score: benchmarkCase.expectations.scoreBands[key].min,
          comment: `Feedback for ${key}.`,
        })),
        overallComment: `${benchmarkCase.input.studentFirstName}, keep going.`,
      }),
    });

    for (const caseResult of result.cases) {
      expect(caseResult.evaluations).toContainEqual(
        expect.objectContaining({
          evaluatorId: 'score-calibration',
          status: 'pass',
        })
      );
    }
  });
});
