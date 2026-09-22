import type {
  PromptConfigData,
  RubricCategory,
  RubricData,
  RubricScoreBand,
  RubricScoreLabel,
  ScoringScaleData,
} from './assignment-type-rubric.shared';

export const DAILY_PAGES_REFLECTION_SCORE_LABELS: RubricScoreLabel[] = [
  { value: 0, label: 'Absent' },
  { value: 1, label: 'Off the mark' },
  { value: 2, label: 'Showed up' },
  { value: 3, label: 'Thought it through' },
  { value: 4, label: 'Went further' },
];

export const DAILY_PAGES_REFLECTION_SCORING_SCALE: ScoringScaleData = {
  type: 'points_scale', minScore: 0, maxScore: 4, step: 1, compositeMin: 0, compositeMax: 4,
};

function bands(descriptions: [string, string, string, string, string]): RubricScoreBand[] {
  return DAILY_PAGES_REFLECTION_SCORE_LABELS.map((entry, index) => ({
    min: entry.value, max: entry.value, label: entry.label, description: descriptions[index],
  }));
}

function category(key: string, label: string, weight: number, description: string, descriptions: [string, string, string, string, string]): RubricCategory {
  return {
    key, label, weight, description, scoreLabels: DAILY_PAGES_REFLECTION_SCORE_LABELS,
    bands: bands(descriptions), feedbackEnabled: true, grammarHighlighting: false,
  };
}

/** Static rubric definition for text- or topic-anchored Daily Pages reflection. */
export const DAILY_PAGES_REFLECTION_RUBRIC: RubricData = {
  categories: [
    category('engagement_with_source', 'Engagement with the Text or Topic', 0.35,
      'Whether the reflection is actually about what it was assigned about: it holds onto specifics from the text or topic rather than writing around it in generalities.',
      [
        'Nothing to read, or an entry with no relationship to the assigned text or topic.',
        'Names the text or topic but works from a vague impression of it; no specifics a reader could point to.',
        'Refers to the text or topic accurately and uses at least one specific, though the specifics sit next to the thinking rather than feeding it.',
        'Works from real specifics and uses them: the details chosen are the ones the point needs.',
        'Reads closely enough to notice a tension, omission, or word doing unexpected work.',
      ]),
    category('depth_of_reflection', 'Depth of Reflection', 0.4,
      'Whether the thinking goes past a first reaction: the student questions, complicates, connects, or changes their mind, and stays with the idea long enough for it to move.',
      [
        'Nothing to read, or no reflection of any kind.',
        'A reaction and no more: liked it, did not like it, agree, disagree, restated.',
        'A genuine response with a reason behind it, held at the level it started on.',
        'Pushes past the first reaction — asks a real question, tests the idea, or follows a consequence.',
        'Arrives somewhere the entry did not begin: an earned complication, connection, or position the student can see the cost of.',
      ]),
    category('clarity_of_expression', 'Clarity of Expression', 0.25,
      'Whether the entry is shaped so a reader can follow the thinking: one idea leads to the next. Judges coherence, never correctness.',
      [
        'Nothing to read.',
        'A reader cannot follow it; the pieces do not connect.',
        'Followable, though the reader does some of the assembling.',
        'Clear throughout: the thinking arrives in an order that makes sense.',
        'Shaped with care — the order of the thinking is itself part of the point.',
      ]),
  ],
};

export const DAILY_PAGES_REFLECTION_PROMPT_CONFIG: PromptConfigData = {
  gradingInstructions: [
    'You are reading a Daily Pages entry: a written reflection on an assigned text or topic. The prompt names what the student was asked to reflect on. Read the entry as a response to that.',
    '',
    'This is a step up from a Class Starter. Effort alone earns the middle of the scale. The top of the scale is for a student who got past a first reaction and worked with something specific from the text or topic.',
    '',
    'Judge three things separately: Engagement with the Text or Topic, Depth of Reflection, and Clarity of Expression.',
    '',
    'Do not mark grammar, spelling, punctuation, or formatting, and do not comment on them. This is thinking prose, not a polished draft. Rough edges never lower any score.',
    '',
    'Weigh substance over length. A short entry that stays with one specific and takes it somewhere beats a long one that never lands on anything.',
    '',
    'Use the bands written on each category to choose a score, then write feedback for that category: name what the student did, and the one move that would take it up one band. Speak to the student.',
  ].join('\n'),
};
