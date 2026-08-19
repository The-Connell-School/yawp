import { getLLMCompletion } from '~/utils/getLLMCompletion/getLLMCompletion';
import type { ClassRubricAggregate } from './aggregate-rubric-performance';
import { resolveClassInsightMockMode } from './class-insight-mock-mode';
import {
  DEFAULT_INSIGHT_RUBRIC,
  type InsightRubric,
} from './insight-rubric';
import {
  buildInsightPrompt,
  parseInsightResponse,
  type CategoryInsightStatus,
  type ClassInsightSummary,
  type InsightPromptContext,
} from './class-insight-synthesis';

const INSIGHT_MAX_TOKENS = 1200;
const INSIGHT_TEMPERATURE = 0.4;
const INSIGHT_REQUEST_DEADLINE_MS = 30_000;

function fixtureStatus(
  category: { averageScore: number | null },
  outOf: number
): CategoryInsightStatus {
  if (category.averageScore === null) return 'mixed';
  // Read as a share of the category's own range, so the fixture says the same
  // thing about a 75/100 as about a 4/5.
  const share = category.averageScore / outOf;
  if (share >= 0.8) return 'strength';
  if (share <= 0.5) return 'gap';
  return 'mixed';
}

function buildFixtureInsightSummary(
  aggregate: ClassRubricAggregate,
  rubric: InsightRubric
): ClassInsightSummary {
  const maxByKey = new Map(
    rubric.categories.map((category) => [category.key, category.maxScore])
  );
  const scored = aggregate.categories.filter((c) => c.scoredCount > 0);
  const weakest =
    scored.find((c) => c.key === aggregate.weakest) ?? scored[0] ?? null;

  return {
    overview: `Across ${aggregate.submissionCount} submissions, the class shows clear strengths and a few shared gaps.`,
    categories: scored.map((category) => ({
      key: category.key,
      label: category.label,
      status: fixtureStatus(category, maxByKey.get(category.key) ?? 5),
      summary: `Class average of ${
        category.averageScore?.toFixed(1) ?? 'n/a'
      } out of ${maxByKey.get(category.key) ?? 5} on ${category.label.toLowerCase()}.`,
    })),
    nextSteps: weakest
      ? [
          {
            title: `Reteach ${weakest.label.toLowerCase()}`,
            detail: `Plan a mini-lesson targeting ${weakest.label.toLowerCase()}, the class's weakest area.`,
            rubricCategory: weakest.key,
          },
        ]
      : [],
  };
}

export type GenerateClassInsightResult = {
  summary: ClassInsightSummary | null;
  model: string;
  raw: string;
};

export async function generateClassInsight({
  aggregate,
  context,
  rubric = DEFAULT_INSIGHT_RUBRIC,
  model = process.env.AI_MODEL ?? 'claude-sonnet-4-6',
  metadata,
}: {
  aggregate: ClassRubricAggregate;
  context: InsightPromptContext;
  /** The rubric the class was graded on. */
  rubric?: InsightRubric;
  model?: string;
  metadata?: Record<string, unknown>;
}): Promise<GenerateClassInsightResult> {
  if (resolveClassInsightMockMode().usesFixture) {
    return {
      summary: buildFixtureInsightSummary(aggregate, rubric),
      model: 'class-insight-fixture',
      raw: '',
    };
  }

  const { system, user } = buildInsightPrompt(aggregate, context, rubric);

  const raw = await getLLMCompletion({
    model,
    system,
    messages: [{ role: 'user', content: user }],
    maxTokens: INSIGHT_MAX_TOKENS,
    temperature: INSIGHT_TEMPERATURE,
    allowFallbackProvider: false,
    logPayload: 'metadata-only',
    signal: AbortSignal.timeout(INSIGHT_REQUEST_DEADLINE_MS),
    metadata: {
      feature: 'assignment-level-feedback',
      submissionCount: aggregate.submissionCount,
      ...metadata,
    },
  });

  return { summary: parseInsightResponse(raw, rubric), model, raw };
}
