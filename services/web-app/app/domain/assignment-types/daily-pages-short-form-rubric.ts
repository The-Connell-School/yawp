import type {
  PromptConfigData,
  RubricCategory,
  RubricData,
  RubricScoreBand,
  RubricScoreLabel,
  ScoringScaleData,
} from './assignment-type-rubric.shared';

/**
 * Daily Pages, after the split: a short piece of real thinking, graded
 * formally.
 *
 * Both halves of that matter, and it is the combination that separates it from
 * a Class Starter.
 *
 * What it is looking for is depth of thought and the development of thought —
 * not that the student has a pulse. A Class Starter credits honest effort. This
 * asks the student to get past a first reaction and take an idea somewhere,
 * and it does not give the top of the scale for showing up.
 *
 * How it is graded is the way an essay is graded, at a fraction of the length.
 * Structure, voice, grammar and syntax all count, and the writing is marked up.
 * A Class Starter is never marked up; that is the sharpest single line between
 * the two assistants.
 *
 * Thinking outweighs craft on purpose: a clean, well-ordered piece with nothing
 * in it is not a good Daily Pages entry. It scores on the essay's own 1-5
 * scale, and its three craft categories are the essay's own keys, so a teacher
 * grading both reads the same dimensions and a score means the same thing in
 * either place.
 */

/** The five things a Daily Pages entry is judged on, in rubric order. */
export const DAILY_PAGES_SHORT_FORM_CATEGORY_KEYS = [
  'depth_of_thought',
  'development_of_thought',
  'organization_and_structure',
  'voice_and_style',
  'grammar_and_mechanics',
] as const;

/**
 * The category that produces grammar and syntax highlighting. Deliberately the
 * essay's legacy grammar key, so highlighting resolves correctly even through
 * a path that predates the per-category flag.
 */
export const DAILY_PAGES_SHORT_FORM_GRAMMAR_CATEGORY_KEY =
  'grammar_and_mechanics';

/**
 * Plain proficiency language rather than the Class Starter's four words. This
 * one lands on a gradebook, where a student and a parent both have to read it.
 */
export const DAILY_PAGES_SHORT_FORM_SCORE_LABELS: RubricScoreLabel[] = [
  { value: 1, label: 'Beginning' },
  { value: 2, label: 'Developing' },
  { value: 3, label: 'Proficient' },
  { value: 4, label: 'Strong' },
  { value: 5, label: 'Exemplary' },
];

export const DAILY_PAGES_SHORT_FORM_SCORING_SCALE: ScoringScaleData = {
  type: 'weighted_1_5',
  minScore: 1,
  maxScore: 5,
  step: 1,
};

function bands(
  descriptions: [string, string, string, string, string]
): RubricScoreBand[] {
  return DAILY_PAGES_SHORT_FORM_SCORE_LABELS.map((entry, index) => ({
    min: entry.value,
    max: entry.value,
    label: entry.label,
    description: descriptions[index],
  }));
}

function category(
  key: (typeof DAILY_PAGES_SHORT_FORM_CATEGORY_KEYS)[number],
  label: string,
  weight: number,
  description: string,
  bandDescriptions: [string, string, string, string, string],
  options: { grammarHighlighting?: boolean } = {}
): RubricCategory {
  return {
    key,
    label,
    weight,
    description,
    scoreLabels: DAILY_PAGES_SHORT_FORM_SCORE_LABELS,
    bands: bands(bandDescriptions),
    // Every category earns its own feedback, as on an essay.
    feedbackEnabled: true,
    grammarHighlighting: options.grammarHighlighting ?? false,
  };
}

export const DAILY_PAGES_SHORT_FORM_RUBRIC: RubricData = {
  categories: [
    category(
      'depth_of_thought',
      'Depth of Thought',
      0.35,
      'How far past a first reaction the thinking goes. Liking, disliking, agreeing, or restating the prompt is a reaction. Questioning it, complicating it, connecting it to something else, or arriving at a position the student can see the cost of is thought.',
      [
        'Nothing to read, or nothing that engages the prompt.',
        'A first reaction and no more: agreement, disagreement, or the prompt restated.',
        'A genuine response with a reason behind it, held at the level it started on.',
        'Gets past the first reaction — asks a real question of the material, tests the idea against something, or follows a consequence.',
        'Arrives somewhere the piece did not begin: an earned complication, a reframing, or a position whose cost the student can see.',
      ]
    ),
    category(
      'development_of_thought',
      'Development of Thought',
      0.25,
      'Whether the thinking moves across the piece rather than circling. The idea should be taken somewhere and backed — a reason, a specific, an example — so that the end of the entry is further along than the start.',
      [
        'No development; a single assertion, or the same point restated.',
        'Circles the idea without advancing it, or offers support that is never explained.',
        'Takes one step: at least one specific or reason, explained well enough to do its work.',
        'Builds — each part advances the idea, and the support is chosen for the point it carries.',
        'The thinking compounds; the entry ends somewhere the opening could not have stated.',
      ]
    ),
    category(
      'organization_and_structure',
      'Organization/Structure',
      0.15,
      'Whether the piece moves in an order a reader can follow: an opening that sets the idea, a middle that develops it, an ending that closes it. At this length, sound paragraphing counts as structure.',
      [
        'No order a reader can follow.',
        'Sequenced but not shaped; sentences arrive in the order they were thought of.',
        'A clear beginning, middle, and end, with the parts in a sensible order.',
        'Deliberate order, with transitions that carry the reader between parts.',
        'Structure that serves the thinking — the arrangement is part of the point.',
      ]
    ),
    category(
      'voice_and_style',
      'Voice/Style',
      0.1,
      'Whether the sentences sound like a person and read well: word choice that is precise rather than vague, and a tone that suits the assignment.',
      [
        'Flat or garbled; word choice obscures the meaning.',
        'Understandable but generic, with vague or repetitive word choice.',
        'Clear, readable prose in a tone that suits the assignment.',
        'Precise word choice and sentence variety; a voice is audible.',
        'Controlled, distinctive prose where the style earns its effects.',
      ]
    ),
    category(
      'grammar_and_mechanics',
      'Grammar/Syntax/Mechanics',
      0.15,
      'Sentence construction, punctuation, usage, spelling, and formatting. Graded here — unlike a Class Starter, where it never is — and marked up, so the student can see the specific errors rather than a general note about them.',
      [
        'Errors throughout that block the reader.',
        'Frequent errors; the reader has to work past them.',
        'Generally correct, with errors that do not interfere with meaning.',
        'Few errors, and none that pull a reader out of the piece.',
        'Clean and controlled, including the harder constructions it attempts.',
      ],
      { grammarHighlighting: true }
    ),
  ],
};

export const DAILY_PAGES_SHORT_FORM_PROMPT_CONFIG: PromptConfigData = {
  gradingInstructions: [
    'You are grading a Daily Pages entry: a short piece of real thinking, graded formally. Grade it the way you would grade an essay, scaled to its length.',
    '',
    'This is not a Class Starter and it is not graded like one. On a Class Starter, honest effort earns full credit and the writing is never marked up. Here, effort alone earns the middle of the scale. Do not give credit for showing up to the page — the question is not whether the student wrote something, it is how well they thought and how well they wrote it.',
    '',
    'Judge five things, and score each one separately. The first two matter most.',
    '',
    '1. Depth of Thought — how far past a first reaction does the thinking go? Liking, disliking, agreeing, or restating the prompt is a reaction. Questioning it, complicating it, connecting it to something else, or reaching a position whose cost the student can see is thought.',
    '',
    '2. Development of Thought — does the thinking move across the piece, or circle? Look for an idea that is taken somewhere and backed with a reason, a specific, or an example, so the end of the entry is further along than the start. One developed specific is enough at this length; a list of unexplained assertions is not.',
    '',
    '3. Organization/Structure — can a reader follow the order? Look for an opening that sets the idea, a middle that develops it, and an ending that closes it. At this length, sound paragraphing counts as structure.',
    '',
    '4. Voice/Style — is the word choice precise rather than vague, and does the tone suit the assignment?',
    '',
    '5. Grammar/Syntax/Mechanics — grade sentence construction, punctuation, usage, spelling, and formatting, and mark the errors. Grammar and syntax count in this assignment. Point to specific errors rather than describing them in general terms.',
    '',
    'Weigh thinking above craft. A clean, well-ordered entry with nothing in it is not a good Daily Pages entry, and a piece with a real idea and some rough sentences is not a bad one.',
    '',
    'Do not reward or penalize length on its own. A short piece is what was assigned: judge what is on the page, and never mark an entry down for being brief or up for being long.',
    '',
    'Use the bands written on each category to choose a score, then write feedback for that category: name what the student did, and the one change that would move it up a band. Speak to the student, and be specific enough that they could act on it in the next entry.',
  ].join('\n'),
};
