import { getLLMCompletion } from '~/utils/getLLMCompletion/getLLMCompletion';
import type {
  CategoryAggregate,
  ClassRubricAggregate,
} from './aggregate-rubric-performance';
import {
  buildInsightPrompt,
  parseInsightResponse,
  type CategoryInsightStatus,
  type ClassInsightSummary,
  type InsightPromptContext,
} from './class-insight-synthesis';

const INSIGHT_MAX_TOKENS = 1200;
const INSIGHT_TEMPERATURE = 0.4;

/** Deterministic, no-network path so e2e never calls a real model. */
function shouldUseE2EInsightFixture() {
  return (
    process.env.E2E === 'true' &&
    process.env.E2E_ASSIGNMENT_INSIGHTS_FIXTURE === 'true' &&
    !process.env.ANTHROPIC_API_KEY
  );
}

function fixtureStatus(category: CategoryAggregate): CategoryInsightStatus {
  if (category.averageScore === null) return 'mixed';
  if (category.averageScore >= 4) return 'strength';
  if (category.averageScore <= 2.5) return 'gap';
  return 'mixed';
}

function buildE2EInsightSummary(
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
  if (shouldUseE2EInsightFixture()) {
    return {
      summary: buildE2EInsightSummary(aggregate),
      model: 'e2e-fixture',
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
    metadata: {
      feature: 'assignment-level-feedback',
      submissionCount: aggregate.submissionCount,
      ...metadata,
    },
  });

  return { summary: parseInsightResponse(raw), model, raw };
}
