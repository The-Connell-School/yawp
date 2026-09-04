import type {
  PromptConfigData,
  RubricData,
  RubricScoreLabel,
  ScoringScaleData,
} from './assignment-type-rubric.shared';
import { getCategoryScoreLabel } from './rubric-category-options';

/** The `AssignmentType.kind` Daily Pages rows carry. */
export const DAILY_PAGES_ASSIGNMENT_TYPE_KIND = 'daily_pages';

/** Daily Pages judges one thing, so it has one rubric category. */
export const DAILY_PAGES_ENGAGEMENT_CATEGORY_KEY = 'engagement';

/**
 * The four words a Daily Pages entry can earn, and the score each is worth.
 * Stored ascending so the rubric round-trips through the admin editor, which
 * always serializes score labels low to high.
 */
export const DAILY_PAGES_SCORE_LABELS: RubricScoreLabel[] = [
  { value: 0, label: 'Absent' },
  { value: 1, label: 'Hardly there' },
  { value: 2, label: 'Showed up' },
  { value: 3, label: 'All in' },
];

export const DAILY_PAGES_SCORING_SCALE: ScoringScaleData = {
  type: 'points_scale',
  minScore: 0,
  maxScore: 3,
};

export const DAILY_PAGES_RUBRIC: RubricData = {
  categories: [
    {
      key: DAILY_PAGES_ENGAGEMENT_CATEGORY_KEY,
      label: 'Engagement',
      weight: 1,
      description:
        'How fully the student showed up to the writing: whether they took the prompt somewhere, stayed with their own thinking, and gave the entry real effort rather than filling the space.',
      scoreLabels: DAILY_PAGES_SCORE_LABELS,
      // Daily Pages gets overall feedback only.
      feedbackEnabled: false,
      // Daily Pages is low-stakes writing; it is never marked up for grammar.
      grammarHighlighting: false,
    },
  ],
};

export const DAILY_PAGES_PROMPT_CONFIG: PromptConfigData = {
  gradingInstructions: [
    'You are reading a Daily Pages entry: low-stakes, exploratory writing.',
    '',
    'Judge one thing, in depth: engagement. Engagement is how fully the student showed up to the writing. Read for whether they took the prompt somewhere of their own, stayed with a thought long enough to develop it, and gave the entry real effort — not for whether the writing is polished.',
    '',
    'Weigh substance over length. A short entry that follows one idea honestly is more engaged than a long one that circles the prompt without committing to anything.',
    '',
    'Do not grade grammar, spelling, punctuation, or formatting, and do not comment on them. Rough edges are expected in Daily Pages and never lower the score.',
    '',
    'Score engagement using these words exactly:',
    '- 3, All in: took the prompt somewhere of their own and stayed with it; the thinking develops.',
    '- 2, Showed up: engaged with the prompt and did the work, without pushing past the obvious.',
    '- 1, Hardly there: touched the prompt but did not invest; the entry stops before it starts.',
    '- 0, Absent: nothing to read, or nothing that responds to the prompt.',
    '',
    'Write the overall feedback to the student about their engagement: what they reached for, and the one thing that would take the next entry further.',
  ].join('\n'),
};

/** The word Daily Pages shows for an engagement score, if the score is in range. */
export function dailyPagesEngagementLabel(score: number): string | null {
  return getCategoryScoreLabel(DAILY_PAGES_RUBRIC.categories[0], score);
}

/** The engagement score a Daily Pages word is worth, if it is one of the four. */
export function dailyPagesEngagementScore(label: string): number | null {
  return (
    DAILY_PAGES_SCORE_LABELS.find((entry) => entry.label === label)?.value ??
    null
  );
}
