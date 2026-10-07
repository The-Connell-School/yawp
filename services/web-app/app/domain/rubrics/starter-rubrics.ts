import { DEFAULT_OUTPUT_SCHEMA_JSON } from '~/domain/assignment-types/assignment-type-rubric.shared';
import type { RubricSchema } from './rubric-schema';
import dailyPagesEngagementSchema from './library/daily-pages-engagement.json';
import strodeEng101Essay1Schema from './library/strode-eng101-essay-1-description.json';
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
 * Protected rubrics the library starts with. Thesis preserves the production fallback; Daily Pages carries the approved
 * library revision; GBA 300 rubrics are department-supplied definitions.
 *
 * Thesis deliberately uses the same preset as the production fallback instead
 * of copying and translating that text. Daily Pages keeps its existing library
 * identity; activation must respect stored assignment revisions. Inspect the payload in
 * `grading-request.ts`; see
 * `scripts/dump-grading-prompt.ts` to print what any assignment type sends.
 */

export { THESIS_DRIVEN_ESSAY_RUBRIC_NAME };
export const DAILY_PAGES_RUBRIC_NAME = 'daily-pages-engagement';

/**
 * The production-library Daily Pages identity with Brian's September 14
 * engagement instructions and integer bands. The portable library JSON is
 * also the seed definition, so publication and local verification use one copy.
 * The separate built-in 0–3 fallback and reflection rubric remain independent.
 */
const dailyPagesEngagement: RubricSchema = dailyPagesEngagementSchema;

export const CLASS_STARTER_RUBRIC_NAME = 'class-starter-engagement';
export const DAILY_PAGES_SHORT_FORM_RUBRIC_NAME = 'daily-pages-short-form';
export const DAILY_PAGES_REFLECTION_RUBRIC_NAME = 'daily-pages-reflection';

/** Library rubrics retired from the admin picker; rows remain for history. */
export const RETIRED_STARTER_RUBRIC_NAMES = new Set([
  DAILY_PAGES_SHORT_FORM_RUBRIC_NAME,
  DAILY_PAGES_REFLECTION_RUBRIC_NAME,
]);

/**
 * The two assistants Daily Pages split into, as library rubrics an admin can
 * select rather than retype.
 *
 * Both are built from the same constants grading falls back to, so the library
 * copy and the built-in default cannot drift apart. `daily-pages-engagement`
 * above remains a distinct rubric: revising its instructions does not select
 * either of these alternatives for existing assignments.
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
  // New: Strode ENG 101 Essay 1 (Description / Angle of Vision)
  strodeEng101Essay1Schema as RubricSchema,
];
