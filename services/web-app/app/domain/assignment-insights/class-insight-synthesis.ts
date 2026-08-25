import { parseFirstJsonValue } from '~/utils/llm-json.server';
import type { ClassRubricAggregate } from './aggregate-rubric-performance';

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
};

function rubricLookup(aggregate: ClassRubricAggregate) {
  const rubricKeySet = new Set(
    aggregate.categories.map((category) => category.key)
  );
  const labelByKey = new Map(
    aggregate.categories.map((category) => [category.key, category.label])
  );
  return { rubricKeySet, labelByKey };
}

function formatAverage(average: number | null): string {
  return average === null ? 'not scored' : `${average.toFixed(2)} / 5`;
}

export function buildInsightPrompt(
  aggregate: ClassRubricAggregate,
  context: InsightPromptContext
): { system: string; user: string } {
  const { labelByKey } = rubricLookup(aggregate);
  const rubricKeys = aggregate.categories.map((category) => category.key);
  const categoryLines = aggregate.categories
    .map(
      (category) =>
        `- ${category.label} (${category.key}): avg ${formatAverage(
          category.averageScore
        )} across ${category.scoredCount} scored; ${category.highCount} strong (>=4), ${category.lowCount} struggling (<=2).`
    )
    .join('\n');

  const contextLines = [
    context.className ? `Class: ${context.className}` : null,
    context.assignmentTitle ? `Assignment: ${context.assignmentTitle}` : null,
  ]
    .filter(Boolean)
    .join('\n');

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
- Keep language warm, concrete, and teacher-facing.`;

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
  aggregate: ClassRubricAggregate
): ClassInsightSummary | null {
  const { rubricKeySet, labelByKey } = rubricLookup(aggregate);

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
    nextSteps.push({
      title,
      detail,
      rubricCategory,
    });
  }

  return { overview, categories, nextSteps };
}
