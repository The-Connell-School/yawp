import type {
  PromptConfigData,
  RubricData,
  RubricScoreLabel,
  ScoringScaleData,
} from './assignment-type-rubric.shared';

/** Static rubric definition for low-stakes, effort-based Class Starter writing. */
export const CLASS_STARTER_SCORE_LABELS: RubricScoreLabel[] = [
  { value: 0, label: 'Absent' },
  { value: 1, label: 'Hardly there' },
  { value: 2, label: 'Showed up' },
  { value: 3, label: 'All in' },
];

export const CLASS_STARTER_SCORING_SCALE: ScoringScaleData = {
  type: 'points_scale',
  minScore: 0,
  maxScore: 3,
};

export const CLASS_STARTER_RUBRIC: RubricData = {
  categories: [
    {
      key: 'engagement',
      label: 'Engagement',
      weight: 1,
      description:
        'How fully the student showed up to the writing: whether they took the prompt somewhere, stayed with their own thinking, and gave the entry real effort rather than filling the space.',
      scoreLabels: CLASS_STARTER_SCORE_LABELS,
      feedbackEnabled: false,
      grammarHighlighting: false,
    },
  ],
};

export const CLASS_STARTER_PROMPT_CONFIG: PromptConfigData = {
  gradingInstructions: [
    'You are reading a Class Starter entry: a short, open-ended piece of writing done to begin class. It is low-stakes, exploratory, and effort-based.',
    '',
    'Judge one thing: engagement. Engagement is whether the student actually wrote and actually reflected. Read for whether they took the prompt somewhere of their own, stayed with a thought long enough to develop it, and gave the entry real effort — not for whether the writing is polished, and not for whether the thinking is sophisticated.',
    '',
    'Weigh substance over length. A short entry that follows one idea honestly is more engaged than a long one that circles the prompt without committing to anything.',
    '',
    'Do not grade grammar, spelling, punctuation, or formatting, and do not comment on them. Rough edges are expected here and never lower the score.',
    '',
    'This is not a graded reflection assignment. Do not ask the entry to be organized, to support its claims, or to build past a first response. Honest effort earns full credit.',
    '',
    'Score engagement using these words exactly:',
    '- 3, All in: took the prompt somewhere of their own and stayed with it; the thinking develops.',
    '- 2, Showed up: engaged with the prompt and did the work, without pushing past the obvious.',
    '- 1, Hardly there: touched the prompt but did not invest; the entry stops before it starts.',
    '- 0, Absent: nothing to read, or nothing that responds to the prompt.',
    '',
    'Write the overall feedback to the student about their engagement: what they reached for, and the one thing that would take the next entry further. Keep it warm and brief.',
  ].join('\n'),
};
