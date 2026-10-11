import { resolveDisplayOptions } from './rubric-display-options';
import type { RubricDisplayCategory } from './rubric-display';
import {
  readOutputSchemaDisplay,
  type ResolvedDisplayOptions,
} from '~/domain/rubrics/output-schema-display';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

/** Options frozen on the submission at grading time (`aiMeta.displaySnapshot`). */
export function readDisplaySnapshotFromAiMeta(
  aiMeta: unknown
): ResolvedDisplayOptions | null {
  if (!isRecord(aiMeta)) return null;
  const snapshot = aiMeta.displaySnapshot;
  if (!isRecord(snapshot)) return null;
  if (typeof snapshot.showCategories !== 'boolean') return null;
  if (typeof snapshot.perCategoryComments !== 'boolean') return null;
  if (
    snapshot.grammarHighlight !== 'off' &&
    snapshot.grammarHighlight !== 'highlight' &&
    snapshot.grammarHighlight !== 'deduct'
  ) {
    return null;
  }
  if (typeof snapshot.teacherNotes !== 'boolean') return null;
  const grammarMaxDeductionPct = snapshot.grammarMaxDeductionPct;
  return {
    showCategories: snapshot.showCategories,
    perCategoryComments: snapshot.perCategoryComments,
    grammarHighlight: snapshot.grammarHighlight,
    teacherNotes: snapshot.teacherNotes,
    ...(typeof grammarMaxDeductionPct === 'number' &&
    Number.isFinite(grammarMaxDeductionPct)
      ? { grammarMaxDeductionPct }
      : {}),
  };
}

export function grammarHighlightingEnabledForDisplay(
  display: ResolvedDisplayOptions
): boolean {
  return display.grammarHighlight !== 'off';
}

export function rubricDisplayConfigurationIsExplicit(
  outputSchema: unknown,
  aiMeta: unknown
): boolean {
  return (
    readDisplaySnapshotFromAiMeta(aiMeta) != null ||
    readOutputSchemaDisplay(outputSchema) != null
  );
}

export function derivedPerCategoryCommentsFromCategories(
  categories: readonly RubricDisplayCategory[]
): boolean {
  return resolveDisplayOptions({}, categories, {}).perCategoryComments;
}
