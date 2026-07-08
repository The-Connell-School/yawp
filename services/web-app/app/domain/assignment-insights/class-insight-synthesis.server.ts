import { getLLMCompletion } from '~/utils/getLLMCompletion/getLLMCompletion';
import type { ClassRubricAggregate } from './aggregate-rubric-performance';
import {
  buildInsightPrompt,
  parseInsightResponse,
  type ClassInsightSummary,
  type InsightPromptContext,
} from './class-insight-synthesis';

const INSIGHT_MAX_TOKENS = 1200;
const INSIGHT_TEMPERATURE = 0.4;

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
