import type {
  PromptConfigData,
  RubricData,
  RubricScoreLabel,
  ScoringScaleData,
} from './assignment-type-rubric.shared';

export const THESIS_STATEMENT_ASSIGNMENT_TYPE_KIND = 'thesis_statement';

export const THESIS_STATEMENT_CONTENT_KEY = 'thesis_and_content';
export const THESIS_STATEMENT_GRAMMAR_KEY = 'grammar_and_mechanics';

export const THESIS_STATEMENT_SCORE_LABELS: RubricScoreLabel[] = [
  { value: 1, label: 'Beginning' },
  { value: 2, label: 'Developing' },
  { value: 3, label: 'Proficient' },
  { value: 4, label: 'Advanced' },
  { value: 5, label: 'Exemplary' },
];

export const THESIS_STATEMENT_SCORING_SCALE: ScoringScaleData = {
  type: 'weighted_1_5',
  minScore: 1,
  maxScore: 5,
};

export const THESIS_STATEMENT_RUBRIC: RubricData = {
  categories: [
    {
      key: THESIS_STATEMENT_CONTENT_KEY,
      label: 'Thesis/Content',
      weight: 0.85,
      description:
        'A single clear, arguable thesis sentence that takes a position and connects observation to analysis.',
      scoreLabels: THESIS_STATEMENT_SCORE_LABELS,
      feedbackEnabled: true,
      grammarHighlighting: false,
    },
    {
      key: THESIS_STATEMENT_GRAMMAR_KEY,
      label: 'Grammar/Syntax',
      weight: 0.15,
      description:
        'The thesis sentence is grammatically sound and readable; minor issues should not outweigh a strong claim.',
      scoreLabels: THESIS_STATEMENT_SCORE_LABELS,
      feedbackEnabled: true,
      grammarHighlighting: true,
    },
  ],
};

export const THESIS_STATEMENT_PROMPT_CONFIG: PromptConfigData = {
  gradingInstructions: [
    'You are grading a standalone Thesis Statement assignment (one sentence, not a full essay).',
    '',
    'Judge the thesis sentence only: one sentence, clear arguable position, observation plus analysis, grammatically sound.',
    '',
    'Weight Thesis/Content most heavily. Grammar matters only insofar as it affects clarity.',
  ].join('\n'),
};
