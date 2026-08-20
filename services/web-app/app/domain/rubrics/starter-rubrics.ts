import { DEFAULT_OUTPUT_SCHEMA_JSON } from '~/domain/assignment-types/assignment-type-rubric.shared';
import type { RubricSchema } from './rubric-schema';
import {
  THESIS_DRIVEN_ESSAY,
  THESIS_DRIVEN_ESSAY_RUBRIC_NAME,
} from './thesis-driven-essay';
import {
  GBA300_INTERNATIONAL_ETIQUETTE,
  GBA300_INTERNATIONAL_EXPANSION,
} from './gba300-rubrics';

/**
 * Protected rubrics the library starts with. Thesis and Daily Pages preserve
 * production exactly; GBA 300 rubrics are department-supplied definitions.
 *
 * Thesis deliberately uses the same preset as the production fallback instead
 * of copying and translating that text. Daily Pages carries the exact config
 * stored on production's assignment type row. Verified against the payload in
 * `grading-request.ts`; see
 * `scripts/dump-grading-prompt.ts` to print what any assignment type sends.
 */

export { THESIS_DRIVEN_ESSAY_RUBRIC_NAME };
export const DAILY_PAGES_RUBRIC_NAME = 'daily-pages-engagement';

/**
 * Production's Daily Pages rubric, copied from the assignment type row rather
 * than from the built-in Daily Pages default: production scores engagement out
 * of 30 in steps of ten with its own four words, which is not what the code
 * default does.
 */
const dailyPagesEngagement: RubricSchema = {
  name: DAILY_PAGES_RUBRIC_NAME,
  title: 'Daily Pages engagement',
  scoringScale: {
    type: 'rubric_points',
    minScore: 0,
    maxScore: 30,
    step: 10,
    compositeMin: 0,
    compositeMax: 30,
  },
  rubric: {
    categories: [
      {
        key: 'engagement_with_prompt',
        label: 'Engagement with Prompt',
        weight: 1,
        description:
          "Measures the student's genuine engagement with the day's prompt — real thoughts, specific details, a mind visibly at work. Does not measure grammar, spelling, syntax, organization, or correctness of content. Judge whether the student took up the prompt, wrestled with it, and responded to what it asked. If no prompt is available, judge engagement with the act of writing itself.",
        scoreLabels: [
          { value: 0, label: 'NOT HANDED IN' },
          { value: 10, label: 'HARDLY THERE' },
          { value: 20, label: 'SHOWED UP' },
          { value: 30, label: 'ALL IN' },
        ],
        feedbackEnabled: false,
        grammarHighlighting: false,
      },
    ],
  },
  promptConfig: {
    gradingInstructions:
      'Daily Pages are an opportunity for students to workout their writing muscles. Correct grammar and syntax are a bonus, but not a requirement. The goal is for students to engage with an idea or prompt through writing. Daily Pages assingments might include start-of-class reflections, journal-type writing, or "exit tickets" designed to capture proof of a lesson learned. Students who demonstrate high engagement and the ability to reflect on/discuss ideas in a complex way earn the highest score. Students who write minimally or with little apparent interest or personal stake earn the lowest score.',
  },
  outputSchema: { ...DEFAULT_OUTPUT_SCHEMA_JSON },
  calibrationNotes: null,
};

export const STARTER_RUBRICS: RubricSchema[] = [
  THESIS_DRIVEN_ESSAY,
  dailyPagesEngagement,
  GBA300_INTERNATIONAL_EXPANSION,
  GBA300_INTERNATIONAL_ETIQUETTE,
];
