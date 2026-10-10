import { applyAssignmentGrammarGrading } from '~/domain/assignment-types/assignment-grammar-grading';
import {
  isGrammarHighlightCategory,
  resolveGrammarHighlightingEnabled,
  type RubricCategoryOptions,
} from '~/domain/assignment-types/rubric-category-options';
import { resolveCategoryFeedbackEnabled } from './grading-prompt-shape';
import {
  readOutputSchemaDisplay,
  type GrammarHighlightMode,
  type ResolvedDisplayOptions,
} from '~/domain/rubrics/output-schema-display';

export type DisplayResolutionAssignment = {
  grammarGradingEnabled?: boolean | null;
};

export function resolveDisplayOptions(
  outputSchema: unknown,
  categories: readonly Partial<RubricCategoryOptions>[],
  assignment: DisplayResolutionAssignment = {}
): ResolvedDisplayOptions {
  const display = readOutputSchemaDisplay(outputSchema) ?? {};
  const derivedPerCategoryComments = resolveCategoryFeedbackEnabled(categories);
  let perCategoryComments =
    display.perCategoryComments ?? derivedPerCategoryComments;
  const showCategories = display.showCategories ?? true;
  if (!showCategories) {
    perCategoryComments = false;
  }

  let grammarHighlight: GrammarHighlightMode;
  if (assignment.grammarGradingEnabled === false) {
    grammarHighlight = 'off';
  } else if (display.grammarHighlight) {
    grammarHighlight = display.grammarHighlight;
  } else {
    grammarHighlight = resolveGrammarHighlightingEnabled(categories)
      ? 'deduct'
      : 'off';
  }

  return {
    showCategories,
    perCategoryComments,
    grammarHighlight,
    ...(display.grammarMaxDeductionPct !== undefined
      ? { grammarMaxDeductionPct: display.grammarMaxDeductionPct }
      : {}),
    teacherNotes: display.teacherNotes ?? true,
  };
}

/** Grammar categories drop only when grammar is explicitly turned off. */
export function applyDisplayGrammarCategories<T extends RubricCategoryOptions>(
  categories: readonly T[],
  outputSchema: unknown,
  assignment: DisplayResolutionAssignment = {}
): T[] {
  const explicitGrammarOff =
    readOutputSchemaDisplay(outputSchema)?.grammarHighlight === 'off';
  if (assignment.grammarGradingEnabled === false || explicitGrammarOff) {
    return applyAssignmentGrammarGrading(categories, false);
  }
  return applyAssignmentGrammarGrading(categories, undefined);
}

export function shouldRunGrammarChecker(display: ResolvedDisplayOptions) {
  return (
    display.grammarHighlight === 'highlight' ||
    display.grammarHighlight === 'deduct'
  );
}

export function grammarCategoriesForHighlightMode<
  T extends RubricCategoryOptions,
>(categories: readonly T[]) {
  return categories.filter((category) => isGrammarHighlightCategory(category));
}

export function serializeDisplaySnapshot(
  display: ResolvedDisplayOptions
): Record<string, unknown> {
  return { ...display };
}
