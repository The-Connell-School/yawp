import { rubricCategories } from '~/domain/grading/rubric';
import {
  DAILY_PAGES_PROMPT_CONFIG,
  DAILY_PAGES_RUBRIC,
  DAILY_PAGES_SCORING_SCALE,
} from '~/domain/assignment-types/daily-pages-rubric';
import {
  DEFAULT_OUTPUT_SCHEMA_JSON,
  DEFAULT_SCORING_SCALE,
} from '~/domain/assignment-types/assignment-type-rubric.shared';
import type { RubricSchema } from './rubric-schema';

/**
 * The two rubrics the library starts with, lifted from what the application
 * already grades with so that seeding changes nothing about how anything is
 * scored. They exist as rows so they can be read, copied, and moved between
 * environments; the code they came from stays as the fallback for assignment
 * types that have not been pointed at a library rubric.
 */

export const THESIS_DRIVEN_ESSAY_RUBRIC_NAME = 'thesis-driven-essay';
export const DAILY_PAGES_RUBRIC_NAME = 'daily-pages-engagement';

export const STARTER_RUBRICS: RubricSchema[] = [
  {
    name: THESIS_DRIVEN_ESSAY_RUBRIC_NAME,
    title: 'Thesis-driven essay',
    scoringScale: DEFAULT_SCORING_SCALE,
    rubric: {
      categories: rubricCategories.map((category) => ({
        key: category.key,
        label: category.label,
        description: category.description,
        weight: category.weight,
      })),
    },
    promptConfig: { instructionsPreset: 'legacy_thesis_driven_essay' },
    outputSchema: { ...DEFAULT_OUTPUT_SCHEMA_JSON },
    calibrationNotes:
      'The rubric the Grading Assistant has always used for thesis-driven essays.',
  },
  {
    name: DAILY_PAGES_RUBRIC_NAME,
    title: 'Daily Pages engagement',
    scoringScale: DAILY_PAGES_SCORING_SCALE,
    rubric: DAILY_PAGES_RUBRIC,
    promptConfig: DAILY_PAGES_PROMPT_CONFIG,
    outputSchema: { ...DEFAULT_OUTPUT_SCHEMA_JSON },
    calibrationNotes:
      'Daily Pages judges engagement only, with overall feedback and no grammar highlighting.',
  },
];
