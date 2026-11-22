/**
 * The second model that checks a lesson's facts (13-lesson review, Nov 22:
 * every lesson had at least one factual or quotation error). Claude Sonnet
 * 5.5 at low effort, its answer held to the fact check's JSON schema, on its
 * own limit, never handed to another provider, and logged without its
 * payload (the answer quotes the lesson). If the account cannot use that
 * model, the planner's own model checks instead.
 * `LESSON_PLANNER_FACT_CHECK_MODEL=off` turns it off.
 */
import { DEFAULT_ANTHROPIC_MODEL } from '~/config/default-anthropic-model';
import { AgentType, getLLMCompletion } from '~/utils/getLLMCompletion';
import { FACT_CHECK_SCHEMA, type AskFactChecker } from './fact-check.server';

export const DEFAULT_FACT_CHECK_MODEL = 'claude-sonnet-5-5';
const FACT_CHECK_MS = 30_000;

type Attribution = Parameters<typeof getLLMCompletion>[0]['attribution'];
type Complete = typeof getLLMCompletion;

const statusOf = (error: unknown) =>
  error &&
  typeof error === 'object' &&
  'status' in error &&
  typeof error.status === 'number'
    ? error.status
    : null;

export function factCheckCall(
  attribution: () => Attribution,
  {
    model = process.env.LESSON_PLANNER_FACT_CHECK_MODEL ||
      DEFAULT_FACT_CHECK_MODEL,
    fallbackModel = (process.env.AI_MODEL as string | undefined) ||
      DEFAULT_ANTHROPIC_MODEL,
    complete = getLLMCompletion,
  }: { model?: string; fallbackModel?: string; complete?: Complete } = {}
): AskFactChecker | undefined {
  if (model === 'off') return undefined;
  return async (system, prompt) => {
    const signal = AbortSignal.timeout(FACT_CHECK_MS);
    const request = (which: string, outputConfig?: Record<string, unknown>) =>
      complete({
        model: which,
        system,
        messages: [{ role: AgentType.User, content: prompt }],
        maxTokens: 4_000,
        attribution: attribution(),
        allowFallbackProvider: false,
        signal,
        logPayload: 'metadata-only',
        metadata: { feature: 'lesson-planner-fact-check' },
        ...(outputConfig ? { outputConfig } : {}),
      });
    try {
      return await request(model, {
        effort: 'low',
        format: { type: 'json_schema', schema: FACT_CHECK_SCHEMA },
      });
    } catch (error) {
      if (signal.aborted) throw error;
      const status = statusOf(error);
      // Settings the model will not take: once more without them.
      if (status === 400) return request(model);
      // A model this account cannot use: the planner's own.
      if ((status === 404 || status === 403) && fallbackModel !== model)
        return request(fallbackModel);
      throw error;
    }
  };
}
