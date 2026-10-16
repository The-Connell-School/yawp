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
import type { Prisma } from '@app/prisma';

export type DisplayResolutionAssignment = {
  grammarGradingEnabled?: boolean | null;
};

export function resolveDisplayOptions(
  outputSchema: unknown,
  categories: readonly Partial<RubricCategoryOptions>[],
  assignment: DisplayResolutionAssignment = {}
): ResolvedDisplayOptions {
  const display = readOutputSchemaDisplay(outputSchema) ?? {};
  const categoryList = [...categories];
  const derivedPerCategoryComments = resolveCategoryFeedbackEnabled(
    categoryList.filter(
      (category): category is Partial<RubricCategoryOptions> & { key: string } =>
        Boolean(category.key)
    )
  );
  let perCategoryComments =
    display.perCategoryComments ?? derivedPerCategoryComments;
  const showCategories = display.showCategories ?? true;
  if (!showCategories) {
    perCategoryComments = false;
  }

  const categoriesAfterGrammarToggle = applyDisplayGrammarCategories(
    categoryList as RubricCategoryOptions[],
    outputSchema,
    assignment
  );
  const explicitGrammarHighlight = display.grammarHighlight;
  let grammarHighlight: GrammarHighlightMode;
  if (
    assignment.grammarGradingEnabled === false &&
    explicitGrammarHighlight
  ) {
    grammarHighlight = 'off';
  } else if (explicitGrammarHighlight) {
    grammarHighlight = explicitGrammarHighlight;
  } else {
    grammarHighlight = resolveGrammarHighlightingEnabled(
      categoriesAfterGrammarToggle
    )
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

export function shouldRunGrammarChecker(
  display: ResolvedDisplayOptions,
  rubricCategoriesAfterGrammarToggle: readonly Partial<RubricCategoryOptions>[],
  outputSchema: unknown
) {
  const explicit = readOutputSchemaDisplay(outputSchema)?.grammarHighlight;
  if (explicit === 'off') return false;
  if (explicit === 'highlight' || explicit === 'deduct') {
    return display.grammarHighlight !== 'off';
  }
  return resolveGrammarHighlightingEnabled([
    ...rubricCategoriesAfterGrammarToggle,
  ]);
}

export function grammarCategoriesForHighlightMode<
  T extends RubricCategoryOptions,
>(categories: readonly T[]) {
  return categories.filter((category) => isGrammarHighlightCategory(category));
}

export function serializeDisplaySnapshot(
  display: ResolvedDisplayOptions
): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(display)) as Prisma.InputJsonValue;
}
