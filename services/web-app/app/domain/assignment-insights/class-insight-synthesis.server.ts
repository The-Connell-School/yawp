import { getLLMCompletion } from '~/utils/getLLMCompletion/getLLMCompletion';
import type { ClassRubricAggregate } from './aggregate-rubric-performance';
import { resolveClassInsightMockMode } from './class-insight-mock-mode';
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

function fixtureStatus(category: {
  averageScore: number | null;
}): CategoryInsightStatus {
  if (category.averageScore === null) return 'mixed';
  if (category.averageScore >= 4) return 'strength';
  if (category.averageScore <= 2.5) return 'gap';
  return 'mixed';
}

function buildFixtureInsightSummary(
  aggregate: ClassRubricAggregate
): ClassInsightSummary {
  const scored = aggregate.categories.filter((c) => c.scoredCount > 0);
  const weakest =
    scored.find((c) => c.key === aggregate.weakest) ?? scored[0] ?? null;

  return {
    overview: `Across ${aggregate.submissionCount} submissions, the class shows clear strengths and a few shared gaps.`,
    categories: scored.map((category) => ({
      key: category.key,
      label: category.label,
      status: fixtureStatus(category),
      summary: `Class average of ${
        category.averageScore?.toFixed(1) ?? 'n/a'
      } out of 5 on ${category.label.toLowerCase()}.`,
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
  model = process.env.AI_MODEL ?? 'claude-sonnet-4-6',
  metadata,
}: {
  aggregate: ClassRubricAggregate;
  context: InsightPromptContext;
  model?: string;
  metadata?: Record<string, unknown>;
}): Promise<GenerateClassInsightResult> {
  if (resolveClassInsightMockMode().usesFixture) {
    return {
      summary: buildFixtureInsightSummary(aggregate),
      model: 'class-insight-fixture',
      raw: '',
    };
  }

  const { system, user } = buildInsightPrompt(aggregate, context);

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

  return { summary: parseInsightResponse(raw), model, raw };
}
