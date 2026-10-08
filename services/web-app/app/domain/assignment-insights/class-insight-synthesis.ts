import { parseFirstJsonValue } from '~/utils/llm-json.server';
import type { ClassRubricAggregate } from './aggregate-rubric-performance';
import {
  DEFAULT_INSIGHT_RUBRIC,
  insightRubricKeys,
  insightRubricLabels,
  type InsightRubric,
} from './insight-rubric';

export type CategoryInsightStatus = 'strength' | 'mixed' | 'gap';

const CATEGORY_STATUSES: CategoryInsightStatus[] = ['strength', 'mixed', 'gap'];

export type CategoryInsight = {
  key: string;
  label: string;
  status: CategoryInsightStatus;
  summary: string;
};

/**
 * A concrete teaching move for the whole class. `rubricCategory` ties the step
 * back to the weakness it addresses — the seam a future lesson-recommendation
 * loop plugs into without reworking this shape.
 */
export type TeachingNextStep = {
  title: string;
  detail: string;
  rubricCategory: string;
};

export type ClassInsightSummary = {
  overview: string;
  categories: CategoryInsight[];
  nextSteps: TeachingNextStep[];
};

export type InsightPromptContext = {
  assignmentTitle?: string | null;
  className?: string | null;
  /**
   * The conditions the class wrote under. A cold write and a revised essay
   * should not get the same next steps, and without these the summary reads
   * every assignment as the second. All optional: absent, the prompt is
   * exactly what it was.
   */
  assignmentTypeTitle?: string | null;
  /** True when the tutor was off. */
  coldWrite?: boolean | null;
  /** False when the teacher switched grammar grading off for the assignment. */
  grammarGraded?: boolean | null;
};

function writingConditionLines(context: InsightPromptContext): string[] {
  return [
    context.assignmentTypeTitle
      ? `Assignment type: ${context.assignmentTypeTitle}`
      : null,
    context.coldWrite
      ? 'Tutor: off — this was a cold write, written without tutor support'
      : null,
    context.grammarGraded === false
      ? 'Grammar: not graded on this assignment'
      : null,
  ].filter((line): line is string => Boolean(line));
}

function formatAverage(average: number | null, outOf: number): string {
  return average === null ? 'not scored' : `${average.toFixed(2)} / ${outOf}`;
}

export function buildInsightPrompt(
  aggregate: ClassRubricAggregate,
  context: InsightPromptContext,
  /** The rubric the class was graded on; its keys are what the model may use. */
  rubric: InsightRubric = DEFAULT_INSIGHT_RUBRIC
): { system: string; user: string } {
  const labelByKey = insightRubricLabels(rubric);
  const rangeByKey = new Map(
    rubric.categories.map((category) => [category.key, category])
  );
  const rubricKeys = rubric.categories.map((category) => category.key);

  // Thresholds are stated per category rather than once, because each category
  // carries its own range — "strong" is a 4 on one rubric and a 75 on another,
  // and a model told the wrong number reads the data backwards.
  const categoryLines = aggregate.categories
    .map((category) => {
      const range = rangeByKey.get(category.key);
      const max = range?.maxScore ?? 5;
      const min = range?.minScore ?? 1;
      const strongAt = min + (max - min) * 0.75;
      const strugglingAt = min + (max - min) * 0.25;
      return `- ${category.label} (${category.key}): avg ${formatAverage(
        category.averageScore,
        max
      )} across ${category.scoredCount} scored; ${category.highCount} strong (>=${strongAt}), ${category.lowCount} struggling (<=${strugglingAt}).`;
    })
    .join('\n');

  const conditionLines = writingConditionLines(context);
  const contextLines = [
    context.className ? `Class: ${context.className}` : null,
    context.assignmentTitle ? `Assignment: ${context.assignmentTitle}` : null,
    ...conditionLines,
  ]
    .filter(Boolean)
    .join('\n');
  // Only when there are conditions to read, so a summary without them is
  // prompted exactly as before.
  const conditionRules = conditionLines.length
    ? `
- Read the scores in light of the writing conditions given with the assignment.
- If it was a cold write, the students had no tutor: do not recommend relying on the tutor to fix what the scores show.
- If grammar was not graded, do not target grammar in next steps.`
    : '';

  const system = `You are an instructional coach helping a teacher understand how their whole class performed on a single writing assignment. You are given aggregate rubric data (not individual students). Identify class-wide strengths and gaps and recommend concrete next teaching moves.

Return ONLY valid JSON, no markdown, matching this schema:
{
  "overview": string,            // 1-2 sentences on how the class did overall
  "categories": [                // one entry per rubric category worth commenting on
    {
      "key": string,             // one of: ${rubricKeys.join(', ')}
      "status": "strength" | "mixed" | "gap",
      "summary": string          // one sentence grounded in the data
    }
  ],
  "nextSteps": [                 // 2-4 concrete, actionable teaching moves
    {
      "title": string,           // short imperative title
      "detail": string,          // what to do, specific to this class's gap
      "rubricCategory": string   // the rubric key this step targets (from the list above)
    }
  ]
}
Rules:
- Base every claim on the supplied aggregate data; do not invent student names or specifics.
- Prioritize the weakest categories in next steps.
- Keep language warm, concrete, and teacher-facing.${conditionRules}`;

  const user = `${
    contextLines ? `${contextLines}\n\n` : ''
  }Based on ${aggregate.submissionCount} submissions${
    aggregate.strongest
      ? `, strongest category: ${labelByKey.get(aggregate.strongest)}`
      : ''
  }${
    aggregate.weakest
      ? `, weakest category: ${labelByKey.get(aggregate.weakest)}`
      : ''
  }.

Per-category performance:
${categoryLines}`;

  return { system, user };
}

function coerceStatus(value: unknown): CategoryInsightStatus {
  return CATEGORY_STATUSES.includes(value as CategoryInsightStatus)
    ? (value as CategoryInsightStatus)
    : 'mixed';
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null;
}

export function parseInsightResponse(
  text: string,
  rubric: InsightRubric = DEFAULT_INSIGHT_RUBRIC
): ClassInsightSummary | null {
  const rubricKeySet = insightRubricKeys(rubric);
  const labelByKey = insightRubricLabels(rubric);

  let parsed: unknown;
  try {
    parsed = parseFirstJsonValue(text);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return null;
  }

  const record = parsed as Record<string, unknown>;
  const overview = asString(record.overview);
  if (!overview) return null;

  const rawCategories = Array.isArray(record.categories)
    ? record.categories
    : [];
  const rawNextSteps = Array.isArray(record.nextSteps) ? record.nextSteps : [];

  const categories: CategoryInsight[] = [];
  for (const item of rawCategories) {
    if (!item || typeof item !== 'object') continue;
    const entry = item as Record<string, unknown>;
    const key = entry.key;
    if (typeof key !== 'string' || !rubricKeySet.has(key)) continue;
    const summary = asString(entry.summary);
    if (!summary) continue;
    categories.push({
      key,
      label: labelByKey.get(key) ?? key,
      status: coerceStatus(entry.status),
      summary,
    });
  }

  const nextSteps: TeachingNextStep[] = [];
  for (const item of rawNextSteps) {
    if (!item || typeof item !== 'object') continue;
    const entry = item as Record<string, unknown>;
    const rubricCategory = entry.rubricCategory;
    if (
      typeof rubricCategory !== 'string' ||
      !rubricKeySet.has(rubricCategory)
    ) {
      continue;
    }
    const title = asString(entry.title);
    const detail = asString(entry.detail);
    if (!title || !detail) continue;
    nextSteps.push({ title, detail, rubricCategory });
  }

  return { overview, categories, nextSteps };
}
