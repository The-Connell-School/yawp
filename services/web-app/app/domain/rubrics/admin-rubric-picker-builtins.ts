import type { Prisma } from '@app/prisma';
import { CLASS_STARTER_ASSIGNMENT_TYPE_KIND } from '~/domain/assignment-types/class-starter-rubric';
import {
  DAILY_PAGES_SHORT_FORM_PROMPT_CONFIG,
  DAILY_PAGES_SHORT_FORM_RUBRIC,
  DAILY_PAGES_SHORT_FORM_SCORING_SCALE,
} from '~/domain/assignment-types/daily-pages-short-form-rubric';
import { DEFAULT_OUTPUT_SCHEMA_JSON } from '~/domain/assignment-types/assignment-type-rubric.shared';
import {
  getThesisDefaultRubricConfig,
  parseAssignmentTypeRubricConfig,
  type AssignmentTypeRubricConfig,
} from '~/domain/assignment-types/assignment-type-rubric-config';

export const ADMIN_BUILTIN_PICKER_PREFIX = 'builtin:';

export const ADMIN_BUILTIN_PICKER_KEYS = [
  `${ADMIN_BUILTIN_PICKER_PREFIX}thesis-default`,
  `${ADMIN_BUILTIN_PICKER_PREFIX}class-starter-default`,
  `${ADMIN_BUILTIN_PICKER_PREFIX}daily-pages-short-form-default`,
] as const;

export type AdminBuiltinPickerKey = (typeof ADMIN_BUILTIN_PICKER_KEYS)[number];

const BUILTIN_LIBRARY_NAME: Record<AdminBuiltinPickerKey, string> = {
  'builtin:thesis-default': 'thesis-driven-essay',
  'builtin:class-starter-default': 'class-starter-engagement',
  'builtin:daily-pages-short-form-default': 'daily-pages-short-form',
};

const BUILTIN_TITLE: Record<AdminBuiltinPickerKey, string> = {
  'builtin:thesis-default': 'Thesis-driven essay grading assistant',
  'builtin:class-starter-default': 'Class Starter engagement',
  'builtin:daily-pages-short-form-default': 'Daily Pages short-form writing',
};

function configToPublishedSchema(
  catalogKey: AdminBuiltinPickerKey,
  config: AssignmentTypeRubricConfig
): Prisma.JsonObject {
  const title = BUILTIN_TITLE[catalogKey];
  return {
    name: catalogKey,
    title,
    scoringScale: config.scoringScale as Prisma.JsonObject,
    rubric: config.rubric as Prisma.JsonObject,
    promptConfig: config.promptConfig as Prisma.JsonObject,
    outputSchema: config.outputSchema as Prisma.JsonObject,
    calibrationNotes: config.calibrationNotes,
  };
}

const builtinConfigByKey: Record<AdminBuiltinPickerKey, AssignmentTypeRubricConfig> = {
  'builtin:thesis-default': getThesisDefaultRubricConfig(),
  'builtin:class-starter-default': parseAssignmentTypeRubricConfig({
    assignmentTypeKind: CLASS_STARTER_ASSIGNMENT_TYPE_KIND,
    rubricJson: { categories: [] },
  }),
  'builtin:daily-pages-short-form-default': {
    source: 'daily-pages-short-form-default',
    scoringScale: DAILY_PAGES_SHORT_FORM_SCORING_SCALE,
    rubric: DAILY_PAGES_SHORT_FORM_RUBRIC,
    promptConfig: DAILY_PAGES_SHORT_FORM_PROMPT_CONFIG,
    outputSchema: { ...DEFAULT_OUTPUT_SCHEMA_JSON },
    calibrationNotes:
      'A short piece graded like an essay: idea, support, structure, voice and grammar, on the essay 1-5 scale. Grammar and syntax are marked, unlike Class Starter. Effort alone earns the middle of the scale, and length is never rewarded or penalized on its own.',
    rubricIncomplete: false,
    defaultLabel: 'Daily Pages short-form writing',
  },
};

export function isAdminBuiltinPickerKey(
  value: string
): value is AdminBuiltinPickerKey {
  return (ADMIN_BUILTIN_PICKER_KEYS as readonly string[]).includes(value);
}

export function libraryNameForAdminBuiltinPickerKey(
  catalogKey: AdminBuiltinPickerKey
): string {
  return BUILTIN_LIBRARY_NAME[catalogKey];
}

export function fallbackBuiltinPublishedSchema(
  catalogKey: AdminBuiltinPickerKey
): Prisma.JsonObject {
  return configToPublishedSchema(catalogKey, builtinConfigByKey[catalogKey]);
}
