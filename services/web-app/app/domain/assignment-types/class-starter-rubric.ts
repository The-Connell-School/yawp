import type {
  PromptConfigData,
  RubricData,
  ScoringScaleData,
} from './assignment-type-rubric.shared';
import {
  DAILY_PAGES_ENGAGEMENT_CATEGORY_KEY,
  DAILY_PAGES_ENGAGEMENT_PROMPT_CONFIG,
  DAILY_PAGES_ENGAGEMENT_RUBRIC,
  DAILY_PAGES_ENGAGEMENT_SCORING_SCALE,
} from './daily-pages-engagement-rubric';

/** The `AssignmentType.kind` Class Starter rows carry. */
export const CLASS_STARTER_ASSIGNMENT_TYPE_KIND = 'class_starter';

/** Class Starter judges the same engagement category as Daily Pages. */
export const CLASS_STARTER_ENGAGEMENT_CATEGORY_KEY =
  DAILY_PAGES_ENGAGEMENT_CATEGORY_KEY;

export const CLASS_STARTER_SCORING_SCALE: ScoringScaleData =
  DAILY_PAGES_ENGAGEMENT_SCORING_SCALE;

export const CLASS_STARTER_RUBRIC: RubricData = DAILY_PAGES_ENGAGEMENT_RUBRIC;

export const CLASS_STARTER_PROMPT_CONFIG: PromptConfigData = {
  gradingInstructions: [
    'You are reading a Class Starter entry: a short, open-ended piece of writing done to begin class. It is low-stakes, exploratory, and effort-based.',
    '',
    DAILY_PAGES_ENGAGEMENT_PROMPT_CONFIG.gradingInstructions ?? '',
  ].join('\n'),
};
