import { DEFAULT_OUTPUT_SCHEMA_JSON } from '~/domain/assignment-types/assignment-type-rubric.shared';
import type { RubricSchema } from './rubric-schema';
import {
  THESIS_DRIVEN_ESSAY,
  THESIS_DRIVEN_ESSAY_RUBRIC_NAME,
} from './thesis-driven-essay';
import {
  GBA300_INTERNATIONAL_ETIQUETTE,
  GBA300_INTERNATIONAL_EXPANSION,
  GBA300_NONVERBAL_RUBRIC_STUDENT,
} from './gba300-rubrics';
import { CRISTO_REY_HORNBUCKLE_FIVE_PARAGRAPH_ESSAY } from './cristo-rey-rubrics';
import {
  CLASS_STARTER_PROMPT_CONFIG,
  CLASS_STARTER_RUBRIC,
  CLASS_STARTER_SCORING_SCALE,
} from '~/domain/assignment-types/class-starter-rubric';
import {
  DAILY_PAGES_SHORT_FORM_PROMPT_CONFIG,
  DAILY_PAGES_SHORT_FORM_RUBRIC,
  DAILY_PAGES_SHORT_FORM_SCORING_SCALE,
} from '~/domain/assignment-types/daily-pages-short-form-rubric';

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

export const CLASS_STARTER_RUBRIC_NAME = 'class-starter-engagement';
export const DAILY_PAGES_SHORT_FORM_RUBRIC_NAME = 'daily-pages-short-form';

/**
 * The two assistants Daily Pages split into, as library rubrics an admin can
 * select rather than retype.
 *
 * Both are built from the same constants grading falls back to, so the library
 * copy and the built-in default cannot drift apart. `daily-pages-engagement`
 * above is untouched: it is what production grades Daily Pages with today, and
 * it stays in the library through the transition.
 */
const classStarterEngagement: RubricSchema = {
  name: CLASS_STARTER_RUBRIC_NAME,
  title: 'Class Starter engagement',
  scoringScale: CLASS_STARTER_SCORING_SCALE,
  rubric: CLASS_STARTER_RUBRIC,
  promptConfig: CLASS_STARTER_PROMPT_CONFIG,
  outputSchema: { ...DEFAULT_OUTPUT_SCHEMA_JSON },
  calibrationNotes:
    'Soft, effort-based. Checks that the student wrote and reflected; honest effort earns full credit.',
};

const dailyPagesShortForm: RubricSchema = {
  name: DAILY_PAGES_SHORT_FORM_RUBRIC_NAME,
  title: 'Daily Pages short-form writing',
  scoringScale: DAILY_PAGES_SHORT_FORM_SCORING_SCALE,
  rubric: DAILY_PAGES_SHORT_FORM_RUBRIC,
  promptConfig: DAILY_PAGES_SHORT_FORM_PROMPT_CONFIG,
  outputSchema: { ...DEFAULT_OUTPUT_SCHEMA_JSON },
  calibrationNotes:
    'A short piece graded like an essay: idea, support, structure, voice and grammar, on the essay 1-5 scale. Grammar and syntax are marked, unlike Class Starter. Effort alone earns the middle of the scale, and length is never rewarded or penalized on its own.',
};

export const STARTER_RUBRICS: RubricSchema[] = [
  THESIS_DRIVEN_ESSAY,
  dailyPagesEngagement,
  GBA300_INTERNATIONAL_EXPANSION,
  GBA300_INTERNATIONAL_ETIQUETTE,
  GBA300_NONVERBAL_RUBRIC_STUDENT,
  CRISTO_REY_HORNBUCKLE_FIVE_PARAGRAPH_ESSAY,
  // Appended, never inserted: the library is ordered and existing rows are
  // matched by name.
  classStarterEngagement,
  dailyPagesShortForm,
];
