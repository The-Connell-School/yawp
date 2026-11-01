import type { RubricSchema } from '~/domain/rubrics/rubric-schema';
import {
  DEFAULT_OUTPUT_SCHEMA_JSON,
  type PromptConfigData,
  type RubricData,
  type RubricScoreLabel,
  type ScoringScaleData,
} from './assignment-type-rubric.shared';
import { CLASS_STARTER_ENGAGEMENT_CATEGORY_KEY } from './class-starter-rubric';

/**
 * Class Starter on three bands: Excellent, Partial Credit, No Credit.
 *
 * A library rubric an admin selects for the Class Starter assignment type in
 * Admin → Assignment Types. The built-in four-word rubric in
 * `class-starter-rubric.ts` is untouched, so nothing changes for any
 * Class Starter until the type is switched to this one, and switching back
 * restores the old behaviour. Assignments already pinned to the old rubric
 * keep grading with it.
 *
 * Scored 0-2 on every whole number, with no step. The Grading Assistant's
 * score is rescaled to the assignment's point value (on a 10-point Class
 * Starter: 0, 5 or 10), and the teacher's score field still accepts any
 * whole number from 0 to the point value.
 */

export const CLASS_STARTER_THREE_BAND_RUBRIC_NAME = 'class-starter-three-band';

export const CLASS_STARTER_THREE_BAND_TITLE =
  'Class Starter (Excellent / Partial Credit / No Credit)';

/** Ascending, so the rubric round-trips through the admin editor unchanged. */
export const CLASS_STARTER_THREE_BAND_SCORE_LABELS: RubricScoreLabel[] = [
  { value: 0, label: 'No Credit' },
  { value: 1, label: 'Partial Credit' },
  { value: 2, label: 'Excellent' },
];

export const CLASS_STARTER_THREE_BAND_SCORING_SCALE: ScoringScaleData = {
  type: 'points_scale',
  minScore: 0,
  maxScore: 2,
};

export const CLASS_STARTER_THREE_BAND_RUBRIC: RubricData = {
  categories: [
    {
      key: CLASS_STARTER_ENGAGEMENT_CATEGORY_KEY,
      label: 'Engagement',
      weight: 1,
      description:
        'Whether the student actually wrote and actually reflected on the prompt: Excellent for real engagement, Partial Credit for a start that stops short, No Credit for nothing that responds.',
      scoreLabels: CLASS_STARTER_THREE_BAND_SCORE_LABELS,
      // Class Starter gets overall feedback only.
      feedbackEnabled: false,
      // Class Starter is low-stakes writing; it is never marked up for grammar.
      grammarHighlighting: false,
    },
  ],
};

export const CLASS_STARTER_THREE_BAND_PROMPT_CONFIG: PromptConfigData = {
  gradingInstructions: [
    'You are reading a Class Starter entry: a short, open-ended piece of writing done to begin class. It is low-stakes, exploratory, and effort-based.',
    '',
    'Judge one thing: engagement. Engagement is whether the student actually wrote and actually reflected. Read for whether they took the prompt somewhere of their own and gave the entry real effort — not for whether the writing is polished, and not for whether the thinking is sophisticated.',
    '',
    'Weigh substance over length. A short entry that follows one idea honestly is engaged; a long one that circles the prompt without committing to anything is not.',
    '',
    'Do not grade grammar, spelling, punctuation, or formatting, and do not comment on them. Rough edges are expected here and never lower the score.',
    '',
    'This is not a formally graded writing assignment. Honest effort earns full credit.',
    '',
    'Score engagement using these words exactly:',
    '- 2, Excellent: the student engaged with the prompt and reflected; the entry is a real, good-faith response.',
    '- 1, Partial Credit: the student touched the prompt but stopped short — a start, a single thin line, or writing that drifts away from what was asked.',
    '- 0, No Credit: nothing to read, or nothing that responds to the prompt.',
    '',
    'Write the overall feedback to the student about their engagement: what they reached for, and the one thing that would take the next entry further. Keep it warm and brief.',
  ].join('\n'),
};

export const CLASS_STARTER_THREE_BAND_SCHEMA: RubricSchema & {
  rubric: RubricData;
  promptConfig: PromptConfigData;
} = {
  name: CLASS_STARTER_THREE_BAND_RUBRIC_NAME,
  title: CLASS_STARTER_THREE_BAND_TITLE,
  scoringScale: CLASS_STARTER_THREE_BAND_SCORING_SCALE,
  rubric: CLASS_STARTER_THREE_BAND_RUBRIC,
  promptConfig: CLASS_STARTER_THREE_BAND_PROMPT_CONFIG,
  outputSchema: { ...DEFAULT_OUTPUT_SCHEMA_JSON },
  calibrationNotes:
    'Soft, effort-based, three bands. Excellent is full credit for real engagement; Partial Credit for a start that stops short; No Credit only when nothing responds to the prompt.',
};
