import type {
  PromptConfigData,
  RubricData,
  RubricScoreLabel,
  ScoringScaleData,
} from './assignment-type-rubric.shared';
import { getCategoryScoreLabel } from './rubric-category-options';

/**
 * Class Starter: the open-ended write-to-begin-class assignment. This is what
 * Daily Pages was before the split, kept intact under the name teachers
 * actually use for it. Its assistant is deliberately soft — it checks that the
 * student wrote and reflected, and stops there. The harder, text-anchored
 * assistant lives in `daily-pages-reflection-rubric.ts`.
 *
 * The scale and the four words are defined here rather than imported from the
 * legacy Daily Pages default so this assignment type stands on its own once
 * that default is retired. A test asserts the two match, so drift during the
 * transition is a failure rather than a surprise on a teacher's gradebook.
 */

/** The `AssignmentType.kind` Class Starter rows carry. */
export const CLASS_STARTER_ASSIGNMENT_TYPE_KIND = 'class_starter';

/** Class Starter judges one thing, so it has one rubric category. */
export const CLASS_STARTER_ENGAGEMENT_CATEGORY_KEY = 'engagement';

/**
 * The four words a Class Starter entry can earn, and the score each is worth.
 * Stored ascending so the rubric round-trips through the admin editor, which
 * always serializes score labels low to high.
 */
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
      key: CLASS_STARTER_ENGAGEMENT_CATEGORY_KEY,
      label: 'Engagement',
      weight: 1,
      description:
        'How fully the student showed up to the writing: whether they took the prompt somewhere, stayed with their own thinking, and gave the entry real effort rather than filling the space.',
      scoreLabels: CLASS_STARTER_SCORE_LABELS,
      // Class Starter gets overall feedback only.
      feedbackEnabled: false,
      // Class Starter is low-stakes writing; it is never marked up for grammar.
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

/** The word Class Starter shows for an engagement score, if it is in range. */
export function classStarterEngagementLabel(score: number): string | null {
  return getCategoryScoreLabel(CLASS_STARTER_RUBRIC.categories[0], score);
}

/** The engagement score a Class Starter word is worth, if it is one of the four. */
export function classStarterEngagementScore(label: string): number | null {
  return (
    CLASS_STARTER_SCORE_LABELS.find((entry) => entry.label === label)?.value ??
    null
  );
}
