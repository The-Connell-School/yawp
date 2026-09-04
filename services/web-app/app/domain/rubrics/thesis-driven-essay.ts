import { getThesisDefaultRubricConfig } from '~/domain/assignment-types/assignment-type-rubric-config';
import type { RubricSchema } from './rubric-schema';

export const THESIS_DRIVEN_ESSAY_RUBRIC_NAME = 'thesis-driven-essay';

/**
 * Production's Thesis-driven Essay grading configuration, without translation
 * or cleanup. The library points at the same source of truth as the legacy
 * fallback so the two paths cannot drift apart.
 */
const productionThesis = getThesisDefaultRubricConfig();

export const THESIS_DRIVEN_ESSAY: RubricSchema = {
  name: THESIS_DRIVEN_ESSAY_RUBRIC_NAME,
  title:
    productionThesis.defaultLabel ?? 'Thesis-driven essay grading assistant',
  scoringScale: productionThesis.scoringScale,
  rubric: productionThesis.rubric,
  promptConfig: productionThesis.promptConfig,
  outputSchema: productionThesis.outputSchema,
  calibrationNotes: productionThesis.calibrationNotes,
};
