import type { PlannedTutorRequest } from './context-strategies';

export type ModelPricing = {
  inputUsdPerMillion: number;
  outputUsdPerMillion: number;
  cacheWrite5mUsdPerMillion: number;
  cacheWrite1hUsdPerMillion: number;
  cacheReadUsdPerMillion: number;
};

export const CLAUDE_PRICING: Record<string, ModelPricing> = {
  'claude-sonnet-4-6': {
    inputUsdPerMillion: 3,
    outputUsdPerMillion: 15,
    cacheWrite5mUsdPerMillion: 3.75,
    cacheWrite1hUsdPerMillion: 6,
    cacheReadUsdPerMillion: 0.3,
  },
  'claude-sonnet-5': {
    inputUsdPerMillion: 2,
    outputUsdPerMillion: 10,
    cacheWrite5mUsdPerMillion: 2.5,
    cacheWrite1hUsdPerMillion: 4,
    cacheReadUsdPerMillion: 0.2,
  },
};

export function estimateTokensFromText(text: string) {
  if (!text.trim()) return 0;
  return Math.max(1, Math.ceil(text.length / 4));
}

export function estimateUsd({
  inputTokens,
  outputTokens,
  pricing,
  cacheReadInputTokens = 0,
  cacheWriteInputTokens = 0,
}: {
  inputTokens: number;
  outputTokens: number;
  pricing: ModelPricing;
  cacheReadInputTokens?: number;
  cacheWriteInputTokens?: number;
}) {
  const uncachedInputTokens = Math.max(
    0,
    inputTokens - cacheReadInputTokens - cacheWriteInputTokens
  );
  return (
    (uncachedInputTokens / 1_000_000) * pricing.inputUsdPerMillion +
    (cacheReadInputTokens / 1_000_000) * pricing.cacheReadUsdPerMillion +
    (cacheWriteInputTokens / 1_000_000) *
      pricing.cacheWrite5mUsdPerMillion +
    (outputTokens / 1_000_000) * pricing.outputUsdPerMillion
  );
}

export function estimateStrategyCost({
  requests,
  pricing,
  assumedOutputTokensPerTurn,
}: {
  requests: PlannedTutorRequest[];
  pricing: ModelPricing;
  assumedOutputTokensPerTurn: number;
}) {
  const totalInputTokens = requests.reduce(
    (sum, request) => sum + request.estimatedInputTokens,
    0
  );
  const totalCacheReadInputTokens = requests.reduce(
    (sum, request) => sum + (request.cachePlan?.cacheReadInputTokens ?? 0),
    0
  );
  const totalCacheWriteInputTokens = requests.reduce(
    (sum, request) => sum + (request.cachePlan?.cacheWriteInputTokens ?? 0),
    0
  );
  const totalOutputTokens = requests.length * assumedOutputTokensPerTurn;

  return {
    requestCount: requests.length,
    totalInputTokens,
    totalOutputTokens,
    totalCacheReadInputTokens,
    totalCacheWriteInputTokens,
    totalUsd: estimateUsd({
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      cacheReadInputTokens: totalCacheReadInputTokens,
      cacheWriteInputTokens: totalCacheWriteInputTokens,
      pricing,
    }),
  };
}

export function formatUsd(value: number) {
  return `$${value.toFixed(4)}`;
}
