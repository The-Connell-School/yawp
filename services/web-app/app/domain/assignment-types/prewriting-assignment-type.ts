import type {
  PromptConfigData,
  RubricData,
  RubricScoreLabel,
  ScoringScaleData,
} from './assignment-type-rubric.shared';

export const PREWRITING_ASSIGNMENT_TYPE_KIND = 'prewriting';

export const PREWRITING_FOCUS_CATEGORY_KEY = 'focus_and_exploration';

export const PREWRITING_SCORE_LABELS: RubricScoreLabel[] = [
  { value: 1, label: 'Beginning' },
  { value: 2, label: 'Developing' },
  { value: 3, label: 'Proficient' },
  { value: 4, label: 'Advanced' },
  { value: 5, label: 'Exemplary' },
];

export const PREWRITING_SCORING_SCALE: ScoringScaleData = {
  type: 'weighted_1_5',
  minScore: 1,
  maxScore: 5,
};

export const PREWRITING_RUBRIC: RubricData = {
  categories: [
    {
      key: PREWRITING_FOCUS_CATEGORY_KEY,
      label: 'Focus and exploration',
      weight: 1,
      description:
        'Whether the student explored the prompt with real effort, moved from broad reactions toward a specific focus they could build an essay around, and stayed with their own thinking.',
      scoreLabels: PREWRITING_SCORE_LABELS,
      feedbackEnabled: true,
      grammarHighlighting: false,
    },
  ],
};

export const PREWRITING_PROMPT_CONFIG: PromptConfigData = {
  gradingInstructions: [
    'You are grading a standalone Pre-writing assignment (not a full essay).',
    '',
    'Judge whether the student explored the prompt with genuine effort and whether their writing moves toward a specific, arguable focus they discovered themselves.',
    '',
    'Do not grade grammar, spelling, or polish. Messy, exploratory writing is expected.',
    '',
    'Use the Focus and exploration category on the 1–5 scale. Honest exploration that lands a usable focus earns Proficient or higher.',
  ].join('\n'),
};
