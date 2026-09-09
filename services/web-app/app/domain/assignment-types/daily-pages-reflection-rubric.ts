import type {
  PromptConfigData,
  RubricCategory,
  RubricData,
  RubricScoreBand,
  RubricScoreLabel,
  ScoringScaleData,
} from './assignment-type-rubric.shared';

/**
 * Daily Pages, after the split: a thoughtful written reflection on a text or
 * topic the teacher assigned.
 *
 * It is a step up from a Class Starter in both directions. It is more
 * specific — the entry is about something, and an entry that never touches
 * that something has not done the assignment — and it asks more of the
 * student, who has to get past a first reaction and shape the thinking so a
 * reader can follow it. Effort alone earns the middle of this scale, not the
 * top, which is the single sharpest difference between the two assistants.
 *
 * What it still does not do is mark the writing up. Daily Pages is prose a
 * student thinks in, not a draft they polish; grammar stays out of the score
 * and out of the feedback.
 */

/** The three things a Daily Pages reflection is judged on, in rubric order. */
export const DAILY_PAGES_REFLECTION_CATEGORY_KEYS = [
  'engagement_with_source',
  'depth_of_reflection',
  'clarity_of_expression',
] as const;

/**
 * The words a Daily Pages reflection can earn on each category. Wider than the
 * Class Starter's four so there is room to distinguish "did the assignment"
 * from "thought about it", which is exactly the distinction the Class Starter
 * scale collapses.
 */
export const DAILY_PAGES_REFLECTION_SCORE_LABELS: RubricScoreLabel[] = [
  { value: 0, label: 'Absent' },
  { value: 1, label: 'Off the mark' },
  { value: 2, label: 'Showed up' },
  { value: 3, label: 'Thought it through' },
  { value: 4, label: 'Went further' },
];

export const DAILY_PAGES_REFLECTION_SCORING_SCALE: ScoringScaleData = {
  type: 'points_scale',
  minScore: 0,
  maxScore: 4,
  step: 1,
  compositeMin: 0,
  compositeMax: 4,
};

function bands(
  descriptions: [string, string, string, string, string]
): RubricScoreBand[] {
  return DAILY_PAGES_REFLECTION_SCORE_LABELS.map((entry, index) => ({
    min: entry.value,
    max: entry.value,
    label: entry.label,
    description: descriptions[index],
  }));
}

function category(
  key: (typeof DAILY_PAGES_REFLECTION_CATEGORY_KEYS)[number],
  label: string,
  weight: number,
  description: string,
  bandDescriptions: [string, string, string, string, string]
): RubricCategory {
  return {
    key,
    label,
    weight,
    description,
    scoreLabels: DAILY_PAGES_REFLECTION_SCORE_LABELS,
    bands: bands(bandDescriptions),
    // Unlike a Class Starter, a reflection earns feedback on each thing it was
    // asked for. That specificity is the point of the step up.
    feedbackEnabled: true,
    // Still never marked up for grammar.
    grammarHighlighting: false,
  };
}

export const DAILY_PAGES_REFLECTION_RUBRIC: RubricData = {
  categories: [
    category(
      'engagement_with_source',
      'Engagement with the Text or Topic',
      0.35,
      'Whether the reflection is actually about what it was assigned about: it holds onto specifics from the text or topic — a line, a moment, a claim, a detail — rather than writing around it in generalities.',
      [
        'Nothing to read, or an entry with no relationship to the assigned text or topic.',
        'Names the text or topic but works from a vague impression of it; no specifics a reader could point to.',
        'Refers to the text or topic accurately and uses at least one specific, though the specifics sit next to the thinking rather than feeding it.',
        'Works from real specifics and uses them: the details chosen are the ones the point needs.',
        'Reads closely enough to notice something the specifics do not hand over — a tension, an omission, a word doing unexpected work.',
      ]
    ),
    category(
      'depth_of_reflection',
      'Depth of Reflection',
      0.4,
      'Whether the thinking goes past a first reaction: the student questions, complicates, connects, or changes their mind, and stays with the idea long enough for it to move.',
      [
        'Nothing to read, or no reflection of any kind.',
        'A reaction and no more: liked it, did not like it, agree, disagree, restated.',
        'A genuine response with a reason behind it, held at the level it started on.',
        'Pushes past the first reaction — asks a real question of the material, tests the idea against something else, or follows a consequence.',
        'Arrives somewhere the entry did not begin: an earned complication, a connection that reframes the topic, or a position the student can see the cost of.',
      ]
    ),
    category(
      'clarity_of_expression',
      'Clarity of Expression',
      0.25,
      'Whether the entry is shaped so a reader can follow the thinking: one idea leads to the next, and the reader is not left assembling it. Judges coherence, never correctness.',
      [
        'Nothing to read.',
        'A reader cannot follow it; the pieces do not connect.',
        'Followable, though the reader does some of the assembling.',
        'Clear throughout: the thinking arrives in an order that makes sense.',
        'Shaped with care — the order of the thinking is itself part of the point.',
      ]
    ),
  ],
};

export const DAILY_PAGES_REFLECTION_PROMPT_CONFIG: PromptConfigData = {
  gradingInstructions: [
    'You are reading a Daily Pages entry: a written reflection on an assigned text or topic. The prompt names what the student was asked to reflect on. Read the entry as a response to that.',
    '',
    'This is a step up from a Class Starter, and it is not graded like one. On a Class Starter, honest effort earns full credit. Here, effort alone earns the middle of the scale. The top of the scale is for a student who got past a first reaction and worked with something specific from the text or topic.',
    '',
    'Judge three things, and score each one separately:',
    '',
    '1. Engagement with the Text or Topic — is the entry actually about what it was assigned about? Look for specifics: a line, a moment, a claim, a detail the student holds onto. An entry that writes around the topic in generalities has not done this assignment, however earnest it is.',
    '',
    '2. Depth of Reflection — does the thinking go past a first reaction? Liking, disliking, agreeing, or restating is a reaction. Questioning, complicating, connecting, following a consequence, or changing a position is reflection.',
    '',
    '3. Clarity of Expression — can a reader follow the thinking? Judge whether one idea leads to the next, not whether the sentences are correct.',
    '',
    'Do not mark grammar, spelling, punctuation, or formatting, and do not comment on them. This is thinking prose, not a polished draft. Rough edges never lower any of the three scores.',
    '',
    'Weigh substance over length. A short entry that stays with one specific and takes it somewhere beats a long one that never lands on anything.',
    '',
    'If the prompt does not name a text or topic, judge Engagement with the Text or Topic on how specifically the student engaged whatever the prompt did give them, and say so in the feedback.',
    '',
    'Use the bands written on each category to choose a score, then write feedback for that category: name what the student did, and the one move that would take it up one band. Speak to the student. Be specific enough that they could act on it tomorrow.',
  ].join('\n'),
};
