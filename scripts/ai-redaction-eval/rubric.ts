/**
 * Re-exports the REAL default rubric (thesis-driven essay grading
 * assistant) that `resolveAssignmentTypeGradingConfig` falls back to when
 * an assignment type has no owned rubric — this is the common/default path
 * described in the eval brief. Pulled via relative import from the actual
 * app source so the eval always tracks future rubric-copy changes instead
 * of drifting from a hand-copied snapshot.
 */
export {
  rubricCategories,
  rubricKeys,
  type RubricCategory,
} from '../../services/web-app/app/domain/grading/rubric';
export {
  gradingAssistantRubricInstructions,
  gradingAssistantScoreScaleInstructions,
} from '../../services/web-app/app/domain/grading/rubric-instructions';

export const DEFAULT_MIN_SCORE = 1;
export const DEFAULT_MAX_SCORE = 5;
