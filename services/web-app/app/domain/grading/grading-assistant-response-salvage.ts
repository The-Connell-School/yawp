import type { ZodIssue } from 'zod';
import type { RubricCategory as GradingRubricCategory } from '~/domain/assignment-types/assignment-type-rubric.shared';
import {
  getCategoryScoreBounds,
  isScoreInCategoryBands,
  isScoreInCategoryAllowedScores,
} from '~/domain/assignment-types/rubric-category-options';

export type GradingAiParseFailureStage =
  | 'initial'
  | 'repair'
  | 'salvage'
  | 'missing-category-repair'
  | 'overall-comment'
  | 'clamp';

export type GradingAiParseFailureLog = {
  stage: GradingAiParseFailureStage;
  zodIssues?: Array<{ code: string; message: string }>;
  rubricKeyCount: number;
  scoringMode: string | null;
  gradingMode: string | null;
  grammarHighlightMode: string | null;
  modelStopReason: string | null;
  modelOutputTokens: number | null;
  salvageReason?: string;
};

export function serializeZodIssuesForLog(
  issues: ZodIssue[] | undefined
): Array<{ code: string; message: string }> | undefined {
  if (!issues?.length) return undefined;
  return issues.map((issue) => ({
    code: issue.code,
    message: issue.message,
  }));
}

export function logGradingAiParseFailed(payload: GradingAiParseFailureLog) {
  console.warn('grading_ai_parse_failed', payload);
}

export function neutralOverallCommentFallback(studentFirstName: string) {
  return `${studentFirstName}, thank you for sharing your work.`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function coerceScoreNumber(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string' && raw.trim() !== '') {
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

export function listCategoryScoreCandidates(
  category: GradingRubricCategory,
  minScore: number,
  maxScore: number
): number[] {
  if (category.allowedScores?.length) {
    return [...category.allowedScores].sort((a, b) => a - b);
  }

  if (category.bands?.length) {
    const bounds = getCategoryScoreBounds(category);
    if (bounds) {
      const scores: number[] = [];
      for (let score = bounds.min; score <= bounds.max; score += 1) {
        if (isScoreInCategoryBands(category, score)) {
          scores.push(score);
        }
      }
      if (scores.length > 0) return scores;
    }
  }

  const scores: number[] = [];
  for (let score = minScore; score <= maxScore; score += 1) {
    scores.push(score);
  }
  return scores;
}

export function snapScoreToCategory({
  category,
  rawScore,
  minScore,
  maxScore,
  gradingMode,
}: {
  category: GradingRubricCategory;
  rawScore: number;
  minScore: number;
  maxScore: number;
  gradingMode?: 'step' | 'bands';
}): number {
  const rounded = Math.round(rawScore);
  const clamped = Math.min(maxScore, Math.max(minScore, rounded));
  const candidates = listCategoryScoreCandidates(category, minScore, maxScore);
  let snapped = candidates.reduce((best, candidate) =>
    Math.abs(candidate - clamped) < Math.abs(best - clamped) ? candidate : best
  );

  if (
    gradingMode === 'step' &&
    category.allowedScores?.length &&
    !isScoreInCategoryAllowedScores(category, snapped)
  ) {
    const allowed = category.allowedScores;
    snapped = allowed.reduce((best, candidate) =>
      Math.abs(candidate - clamped) < Math.abs(best - clamped)
        ? candidate
        : best
    );
  }

  if (!isScoreInCategoryBands(category, snapped)) {
    const inBand = candidates.filter((score) =>
      isScoreInCategoryBands(category, score)
    );
    if (inBand.length) {
      snapped = inBand.reduce((best, candidate) =>
        Math.abs(candidate - clamped) < Math.abs(best - clamped)
          ? candidate
          : best
      );
    }
  }

  return snapped;
}

export type SalvagedGradingCategory = {
  key: string;
  score: number;
  comment: string;
  grammarImpairsMeaning?: boolean;
};

export function extractSalvageableCategoryRows(
  value: unknown,
  allowedKeys: readonly string[]
): Array<Record<string, unknown>> {
  const allowed = new Set(allowedKeys);
  const expanded = Array.isArray(value)
    ? value
    : isRecord(value) && Array.isArray(value.categories)
      ? value.categories
      : null;
  if (!expanded) return [];

  const rows: Array<Record<string, unknown>> = [];
  const seen = new Set<string>();
  for (const entry of expanded) {
    if (!isRecord(entry)) continue;
    const key = entry.key;
    if (typeof key !== 'string' || !allowed.has(key) || seen.has(key)) continue;
    seen.add(key);
    rows.push(entry);
  }
  return rows;
}

export function salvageGradingAssistantCategories({
  sources,
  rubricCategories,
  minScore,
  maxScore,
  gradingMode,
  categoryFeedbackEnabled,
  grammarHighlightMode,
}: {
  sources: unknown[];
  rubricCategories: GradingRubricCategory[];
  minScore: number;
  maxScore: number;
  gradingMode?: 'step' | 'bands';
  categoryFeedbackEnabled: boolean;
  grammarHighlightMode?: 'off' | 'highlight' | 'deduct';
}): { categories: SalvagedGradingCategory[]; missingKeys: string[] } {
  const rubricKeys = rubricCategories.map((category) => category.key);
  const categoryByKey = new Map(
    rubricCategories.map((category) => [category.key, category])
  );
  const mergedRows = new Map<string, Record<string, unknown>>();

  for (const source of sources) {
    for (const row of extractSalvageableCategoryRows(source, rubricKeys)) {
      const key = row.key as string;
      if (!mergedRows.has(key)) mergedRows.set(key, row);
    }
  }

  const categories: SalvagedGradingCategory[] = [];
  const missingKeys: string[] = [];

  for (const key of rubricKeys) {
    const configured = categoryByKey.get(key);
    if (!configured) continue;
    const row = mergedRows.get(key);
    if (!row) {
      missingKeys.push(key);
      continue;
    }

    const rawScore = coerceScoreNumber(row.score);
    const score =
      rawScore == null
        ? minScore
        : snapScoreToCategory({
            category: configured,
            rawScore,
            minScore,
            maxScore,
            gradingMode,
          });

    let comment = '';
    if (categoryFeedbackEnabled) {
      comment =
        typeof row.comment === 'string' && row.comment.trim()
          ? row.comment.trim()
          : 'See overall feedback.';
    }

    const salvaged: SalvagedGradingCategory = { key, score, comment };
    if (
      grammarHighlightMode === 'highlight' &&
      typeof row.grammarImpairsMeaning === 'boolean'
    ) {
      salvaged.grammarImpairsMeaning = row.grammarImpairsMeaning;
    }
    categories.push(salvaged);
  }

  return { categories, missingKeys };
}

export function extractOverallCommentFromUnknown(value: unknown): string | null {
  if (!isRecord(value)) return null;
  const overallComment = value.overallComment;
  return typeof overallComment === 'string' && overallComment.trim()
    ? overallComment.trim()
    : null;
}