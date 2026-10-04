import { describe, expect, test } from 'bun:test';

import {
  DAILY_PAGES_SHORT_FORM_CATEGORY_KEYS,
  DAILY_PAGES_SHORT_FORM_STEP_TUTOR_INSTRUCTIONS,
  DAILY_PAGES_SHORT_FORM_TUTOR_INSTRUCTIONS,
  DAILY_PAGES_SHORT_FORM_WELCOME,
  DAILY_PAGES_SHORT_FORM_GRAMMAR_CATEGORY_KEY,
  DAILY_PAGES_SHORT_FORM_PROMPT_CONFIG,
  DAILY_PAGES_SHORT_FORM_RUBRIC,
  DAILY_PAGES_SHORT_FORM_SCORE_LABELS,
  DAILY_PAGES_SHORT_FORM_SCORING_SCALE,
} from './daily-pages-short-form-rubric';
import { CLASS_STARTER_RUBRIC } from './class-starter-rubric';
import { rubricCategories as essayCategories } from '~/domain/grading/rubric';
import {
  getCategoryScoreBand,
  getCategoryScoreLabel,
  isCategoryFeedbackEnabled,
  isGrammarHighlightCategory,
  resolveGrammarHighlightingEnabled,
} from './rubric-category-options';

const categories = DAILY_PAGES_SHORT_FORM_RUBRIC.categories;

describe('the Daily Pages short-form rubric shape', () => {
  test('judges thinking first, then the craft an essay is judged on', () => {
    expect(categories.map((category) => category.key)).toEqual([
      ...DAILY_PAGES_SHORT_FORM_CATEGORY_KEYS,
    ]);
    expect(categories).toHaveLength(5);
  });

  /**
   * The craft half of Daily Pages is the essay's craft. Three of its five
   * categories are the essay's own keys, so a teacher grading both sees the
   * same dimensions and a score means the same thing in either place.
   */
  test('reuses the essay rubric keys wherever the dimension is the same', () => {
    const essayKeys = new Set(essayCategories.map((category) => category.key));

    for (const key of [
      'organization_and_structure',
      'voice_and_style',
      'grammar_and_mechanics',
    ] as const) {
      expect(essayKeys.has(key)).toBe(true);
      expect(categories.some((category) => category.key === key)).toBe(true);
    }
  });

  test('weights sum to one, so the composite is the weighted score', () => {
    const total = categories.reduce((sum, c) => sum + c.weight, 0);
    expect(Number(total.toFixed(4))).toBe(1);
  });

  /**
   * Thinking is what this assignment is for. Craft and correctness are graded
   * and carry real weight, but they cannot outweigh what the student actually
   * thought — a clean, well-ordered piece with nothing in it is not a good
   * Daily Pages entry.
   */
  test('weights thinking above craft', () => {
    const weightOf = (key: string) =>
      categories.find((category) => category.key === key)?.weight ?? 0;

    const thinking =
      weightOf('depth_of_thought') + weightOf('development_of_thought');

    expect(thinking).toBeGreaterThan(0.5);
  });

  test('scores on the same 1-5 scale the essay uses', () => {
    expect(DAILY_PAGES_SHORT_FORM_SCORING_SCALE).toMatchObject({
      type: 'weighted_1_5',
      minScore: 1,
      maxScore: 5,
      step: 1,
    });
    expect(
      DAILY_PAGES_SHORT_FORM_SCORE_LABELS.map((entry) => entry.value)
    ).toEqual([1, 2, 3, 4, 5]);
  });

  test('every category carries the shared words and a band for each score', () => {
    for (const category of categories) {
      expect(category.scoreLabels).toEqual(DAILY_PAGES_SHORT_FORM_SCORE_LABELS);
      for (const { value, label } of DAILY_PAGES_SHORT_FORM_SCORE_LABELS) {
        expect(getCategoryScoreLabel(category, value)).toBe(label);
        const band = getCategoryScoreBand(category, value);
        expect(band).not.toBeNull();
        expect(band?.description.trim().length).toBeGreaterThan(0);
      }
    }
  });

  test('gives feedback on every category, unlike the Class Starter', () => {
    for (const category of categories) {
      expect(isCategoryFeedbackEnabled(category)).toBe(true);
    }
    expect(isCategoryFeedbackEnabled(CLASS_STARTER_RUBRIC.categories[0])).toBe(
      false
    );
  });
});

/**
 * The sharpest line between the two assistants. A Class Starter is never marked
 * up; a Daily Pages entry is graded for grammar and syntax the way an essay is.
 */
describe('grammar is graded, which is what Class Starter never does', () => {
  test('marks the writing up for grammar and syntax', () => {
    expect(resolveGrammarHighlightingEnabled(categories)).toBe(true);
    expect(
      resolveGrammarHighlightingEnabled(CLASS_STARTER_RUBRIC.categories)
    ).toBe(false);
  });

  test('highlighting comes from the grammar category and only that one', () => {
    const highlighting = categories.filter(isGrammarHighlightCategory);

    expect(highlighting.map((category) => category.key)).toEqual([
      DAILY_PAGES_SHORT_FORM_GRAMMAR_CATEGORY_KEY,
    ]);
  });

  test('carries real weight rather than being a token category', () => {
    const grammar = categories.find(
      (category) => category.key === DAILY_PAGES_SHORT_FORM_GRAMMAR_CATEGORY_KEY
    );

    expect(grammar?.weight).toBeGreaterThan(0.1);
  });
});

/**
 * The AP standard for timed writing: some grammar and spelling errors are
 * expected in a piece written in ten or fifteen minutes, and they cost only
 * when they are frequent enough to distract from meaning. The errors are still
 * marked up so the student can see them — the standard governs the score.
 */
describe('grammar is scored on the AP standard for timed writing', () => {
  const instructions = (
    DAILY_PAGES_SHORT_FORM_PROMPT_CONFIG.gradingInstructions ?? ''
  ).toLowerCase();
  const grammar = categories.find(
    (category) => category.key === DAILY_PAGES_SHORT_FORM_GRAMMAR_CATEGORY_KEY
  );

  test('tells the grader errors cost only when they distract from meaning', () => {
    expect(instructions).toContain('the ap standard');
    expect(instructions).toContain('frequent enough to distract from meaning');
  });

  test('still marks the errors up, so the student can see them', () => {
    expect(instructions).toContain('mark the errors');
  });

  test('describes the standard where a teacher reads the category', () => {
    expect(grammar?.description.toLowerCase()).toContain(
      'distract from meaning'
    );
  });

  test('lets a piece with occasional errors reach the top band', () => {
    const top = grammar?.bands?.at(-1)?.description.toLowerCase() ?? '';
    expect(top).toContain('occasional');
    expect(top).not.toContain('clean and controlled');
  });

  test('keeps the low bands for errors that get in the way of meaning', () => {
    const low = grammar?.bands?.[1]?.description.toLowerCase() ?? '';
    expect(low).toContain('meaning');
  });
});

describe('the Daily Pages short-form grading instructions', () => {
  const instructions = (
    DAILY_PAGES_SHORT_FORM_PROMPT_CONFIG.gradingInstructions ?? ''
  ).toLowerCase();

  test('says to grade grammar, syntax and mechanics', () => {
    expect(instructions).toContain('grammar');
    expect(instructions).toContain('syntax');
    expect(instructions).not.toContain('do not grade grammar');
    expect(instructions).not.toContain('do not mark grammar');
  });

  test('grades it like an essay, scaled to its length', () => {
    expect(instructions).toContain('essay');
    expect(instructions).toContain('short');
  });

  test('asks for thinking that goes past a first reaction and develops', () => {
    expect(instructions).toContain('depth of thought');
    expect(instructions).toContain('development of thought');
    expect(instructions).toContain('first reaction');
  });

  /** Not "did they write something", which is the Class Starter question. */
  test('rules out crediting mere presence on the page', () => {
    expect(instructions).toContain('showing up');
  });

  test('does not penalize the piece for being short', () => {
    expect(instructions).toContain('length');
  });

  test('names the higher bar so it is not graded like a class starter', () => {
    expect(instructions).toContain('class starter');
    expect(instructions).toContain('effort alone');
  });

  test('covers every rubric category by label', () => {
    for (const category of categories) {
      expect(instructions).toContain(category.label.toLowerCase());
    }
  });
});

/**
 * The shape rules. Daily Pages is short academic paragraph practice, and the
 * paragraph can be of more than one kind — analyzing, arguing, comparing,
 * defining. What separates it from a Class Starter is that it is a deliberate
 * academic move rather than an exploration; what it must not do is force every
 * kind of paragraph into one rigid form.
 */
describe('paragraph practice, not one fixed form', () => {
  const instructions = (
    DAILY_PAGES_SHORT_FORM_PROMPT_CONFIG.gradingInstructions ?? ''
  ).toLowerCase();
  const organization = categories.find(
    (category) => category.key === 'organization_and_structure'
  );

  test('tells the grader this is paragraph practice', () => {
    expect(instructions).toContain('paragraph practice');
  });

  test('does not require the claim in the first sentence', () => {
    expect(instructions).not.toContain('first sentence');
    expect(organization?.description.toLowerCase()).not.toContain(
      'first sentence'
    );
    expect(instructions).toContain('does not have to open with a claim');
  });

  test('judges structure against the kind of paragraph asked for', () => {
    expect(organization?.description.toLowerCase()).toContain(
      'kind of paragraph'
    );
    expect(instructions).toContain('kind of paragraph the prompt asks for');
  });

  test('rules out exploration, and says where it belongs instead', () => {
    expect(instructions).toContain('not an exploration');
    expect(instructions).toContain('class starter');
  });

  test('every category band reaches the top without requiring a journey', () => {
    // The old top bands rewarded arriving somewhere the piece did not begin,
    // which is the exploration shape this assignment moved away from.
    const topBands = categories.map(
      (category) => category.bands?.at(-1)?.description.toLowerCase() ?? ''
    );
    for (const band of topBands) {
      expect(band).not.toContain('did not begin');
      expect(band).not.toContain('compounds');
    }
  });
});

describe('first person and hedging', () => {
  const instructions = (
    DAILY_PAGES_SHORT_FORM_PROMPT_CONFIG.gradingInstructions ?? ''
  ).toLowerCase();

  test('allows first person outright, so a grader cannot invent the essay rule', () => {
    expect(instructions).toContain('first person');
    expect(instructions).toContain('never an error');
    expect(instructions).toContain('never mark a student down for it');
  });

  test('coaches the hedge rather than deducting for the phrase', () => {
    expect(instructions).toContain('i think that');
    expect(instructions).toContain(
      'coach the difference rather than deducting for a phrase'
    );
  });

  /**
   * The ceiling is what stops an unedited draft reaching the top of the scale
   * on the strength of its ideas alone — which is exactly what the first
   * seeded exemplar did, at 94%.
   */
  test('caps unedited prose below the top two bands', () => {
    expect(instructions).toContain('unedited first draft');
    expect(instructions).toContain('no higher than 3 in voice/style');
    expect(instructions).toContain(
      'the top two bands are for prose that has been edited'
    );

    const voice = categories.find(
      (category) => category.key === 'voice_and_style'
    );
    expect(voice?.description).toContain('does not reach the top two bands');
    expect(voice?.bands?.[2]?.description.toLowerCase()).toContain('unedited');
  });

  test('still names first person done well as top-entry writing', () => {
    expect(instructions).toContain(
      'first person done well belongs in a top entry'
    );
  });

  test('names the hedge in the category a teacher reads it under', () => {
    const voice = categories.find(
      (category) => category.key === 'voice_and_style'
    );
    expect(voice?.description).toContain('I think that');
    expect(voice?.description.toLowerCase()).toContain('never an error');
  });
});

describe('the Daily Pages tutor instructions', () => {
  const tutor = DAILY_PAGES_SHORT_FORM_TUTOR_INSTRUCTIONS.toLowerCase();

  test('coaches the point first, the support next, the hedge last', () => {
    expect(tutor.indexOf('the point.')).toBeGreaterThan(-1);
    expect(tutor.indexOf('the point.')).toBeLessThan(
      tutor.indexOf('the support.')
    );
    expect(tutor.indexOf('the support.')).toBeLessThan(
      tutor.indexOf('the hedge.')
    );
  });

  test('does not hold every paragraph to a claim-in-the-first-sentence form', () => {
    expect(tutor).not.toContain('first sentence');
    expect(tutor).toContain('paragraph practice');
  });

  test('tells the tutor not to coach exploration, which is the old behaviour', () => {
    expect(tutor).toContain('do not encourage the student to explore');
    expect(tutor).toContain('class starter');
  });

  test('keeps first person allowed in coaching too', () => {
    expect(tutor).toContain('writing "i" is fine');
    expect(tutor).toContain('never tell a student to avoid it');
  });

  test('never writes for the student', () => {
    expect(tutor).toContain('never write content for the student');
  });
});

/**
 * The weighting decision, pinned. Voice/Style carries 20% because the
 * refinement ceiling has to cost something: at 10% an entry with top-band
 * ideas and unedited prose outscored a polished one, which is how the first
 * seeded exemplar reached 94% writing "I want to say yes, because…".
 */
describe('refinement costs something', () => {
  const weightOf = (key: string) =>
    categories.find((category) => category.key === key)?.weight ?? 0;

  function percentage(scores: Record<string, number>) {
    const total = categories.reduce(
      (sum, category) =>
        sum + (scores[category.key] / 5) * 100 * category.weight,
      0
    );
    return Math.round(total);
  }

  test('voice carries enough weight to be a rule rather than a rounding error', () => {
    expect(weightOf('voice_and_style')).toBeGreaterThanOrEqual(0.2);
  });

  test('an unedited entry scores below a refined one, however good its ideas', () => {
    const unedited = percentage({
      depth_of_thought: 5,
      development_of_thought: 5,
      organization_and_structure: 5,
      // The ceiling: unedited prose cannot pass Proficient here.
      voice_and_style: 3,
      grammar_and_mechanics: 5,
    });
    const refined = percentage({
      depth_of_thought: 5,
      development_of_thought: 5,
      organization_and_structure: 4,
      voice_and_style: 5,
      grammar_and_mechanics: 4,
    });

    expect(unedited).toBeLessThan(refined);
  });

  test('thinking still outweighs craft after the reweighting', () => {
    const thinking =
      weightOf('depth_of_thought') + weightOf('development_of_thought');
    expect(thinking).toBeGreaterThan(0.5);
  });
});

/**
 * The tutor's one step ("Today's Writing") carries instructions of its own,
 * joined after the module's. The step that shipped was the freewrite tutor —
 * brainstorming, journaling, big praise — which contradicted the module text
 * it followed. This is its replacement: how a feedback round runs and where
 * the tutor stops, with the coaching left to the module and the paragraph
 * type.
 */
describe('the Daily Pages step instructions', () => {
  const step = DAILY_PAGES_SHORT_FORM_STEP_TUTOR_INSTRUCTIONS.toLowerCase();

  test('do not ask for exploratory or brainstorming feedback', () => {
    for (const phrase of [
      'brainstorm',
      'exploratory',
      'journaling',
      'go deeper',
      'singlehandedly',
    ]) {
      expect(step).not.toContain(phrase);
    }
    expect(step).toContain('paragraph practice');
  });

  test('keep the safety boundaries the old step carried', () => {
    for (const topic of [
      'suicidal',
      'self-harm',
      'abuse',
      'unsafe',
      'sexual',
      'substance use',
      'school counselor',
    ]) {
      expect(step).toContain(topic);
    }
  });

  test('run each "Give me feedback" as the next turn, not a recap', () => {
    expect(step).toContain('give me feedback');
    expect(step).toContain('new writing');
    expect(step).toContain('do not repeat');
  });

  test('keep praise specific and earned', () => {
    expect(step).toContain('specific');
    expect(step).not.toContain('awesome');
  });

  test('never write the paragraph for the student', () => {
    expect(step).toContain('never write');
  });
});

describe('the Daily Pages welcome', () => {
  const welcome = DAILY_PAGES_SHORT_FORM_WELCOME.toLowerCase();

  test('no longer tells the student feedback is optional for this writing', () => {
    expect(welcome).not.toContain('may not need or want feedback');
    expect(welcome).not.toContain('brainstorm');
  });

  test('says what to write and how to ask for help', () => {
    expect(welcome).toContain('paragraph');
    expect(welcome).toContain('give me feedback');
    expect(welcome).toContain('chat');
  });
});
