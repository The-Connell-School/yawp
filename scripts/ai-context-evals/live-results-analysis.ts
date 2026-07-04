#!/usr/bin/env bun

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { CLAUDE_PRICING, formatUsd, type ModelPricing } from './cost';

type PlannedJsonlRow = {
  strategyId: string;
  evalCaseId: string;
  turnIndex: number;
  estimatedInputTokens?: number;
  contextCoverage?: {
    hasCanonicalCurrentDocument?: boolean;
    hasChangeSummary?: boolean;
  };
  mustUseAnchors?: string[];
  mustNotUseAnchors?: string[];
  messages?: Array<{ role: string; content: string }>;
};

type AnthropicUsage = {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation?: {
    ephemeral_5m_input_tokens?: number;
    ephemeral_1h_input_tokens?: number;
  };
};

type ResultJsonlRow = {
  status: 'ok' | 'error';
  strategyId: string;
  evalCaseId: string;
  turnIndex: number;
  response?: string;
  usage?: AnthropicUsage;
};

export type StrategyLiveAnalysis = {
  strategyId: string;
  requestCount: number;
  okCount: number;
  errorCount: number;
  inputTokens: number;
  outputTokens: number;
  cacheWrite5mInputTokens: number;
  cacheWrite1hInputTokens: number;
  cacheReadInputTokens: number;
  costUsd: number;
  canonicalCurrentDocumentRequests: number;
  changeSummaryRequests: number;
  estimatedInputTokens: number;
  mustUseEligibleChecks: number;
  exactMustUseAllPasses: number;
  exactMustUseAnyPasses: number;
  mustUseAnchorsAbsentFromPrompt: number;
  mustNotChecks: number;
  mustNotViolations: number;
};

export type LiveEvalAnalysis = {
  totalRequests: number;
  strategies: StrategyLiveAnalysis[];
};

type UsageCost = {
  inputTokens: number;
  outputTokens: number;
  cacheWrite5mInputTokens: number;
  cacheWrite1hInputTokens: number;
  cacheReadInputTokens: number;
  usd: number;
};

export function parseJsonl<T = unknown>(content: string): T[] {
  return content
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}

export function calculateAnthropicUsageCost({
  usage,
  pricing,
}: {
  usage?: AnthropicUsage;
  pricing: ModelPricing;
}): UsageCost {
  const inputTokens = usage?.input_tokens ?? 0;
  const outputTokens = usage?.output_tokens ?? 0;
  const cacheWrite5mInputTokens =
    usage?.cache_creation?.ephemeral_5m_input_tokens ??
    usage?.cache_creation_input_tokens ??
    0;
  const cacheWrite1hInputTokens =
    usage?.cache_creation?.ephemeral_1h_input_tokens ?? 0;
  const cacheReadInputTokens = usage?.cache_read_input_tokens ?? 0;

  return {
    inputTokens,
    outputTokens,
    cacheWrite5mInputTokens,
    cacheWrite1hInputTokens,
    cacheReadInputTokens,
    usd:
      (inputTokens / 1_000_000) * pricing.inputUsdPerMillion +
      (outputTokens / 1_000_000) * pricing.outputUsdPerMillion +
      (cacheWrite5mInputTokens / 1_000_000) *
        pricing.cacheWrite5mUsdPerMillion +
      (cacheWrite1hInputTokens / 1_000_000) *
        pricing.cacheWrite1hUsdPerMillion +
      (cacheReadInputTokens / 1_000_000) * pricing.cacheReadUsdPerMillion,
  };
}

function resultKey(row: {
  strategyId: string;
  evalCaseId: string;
  turnIndex: number;
}) {
  return `${row.strategyId}|${row.evalCaseId}|${row.turnIndex}`;
}

function normalizedIncludes(haystack: string, needle: string) {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

function makeStrategy(strategyId: string): StrategyLiveAnalysis {
  return {
    strategyId,
    requestCount: 0,
    okCount: 0,
    errorCount: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheWrite5mInputTokens: 0,
    cacheWrite1hInputTokens: 0,
    cacheReadInputTokens: 0,
    costUsd: 0,
    canonicalCurrentDocumentRequests: 0,
    changeSummaryRequests: 0,
    estimatedInputTokens: 0,
    mustUseEligibleChecks: 0,
    exactMustUseAllPasses: 0,
    exactMustUseAnyPasses: 0,
    mustUseAnchorsAbsentFromPrompt: 0,
    mustNotChecks: 0,
    mustNotViolations: 0,
  };
}

export function analyzeLiveEvalResults({
  plannedRows,
  resultRows,
  pricing,
}: {
  plannedRows: PlannedJsonlRow[];
  resultRows: ResultJsonlRow[];
  pricing: ModelPricing;
}): LiveEvalAnalysis {
  const plannedByKey = new Map(
    plannedRows.map((row) => [resultKey(row), row])
  );
  const strategies = new Map<string, StrategyLiveAnalysis>();

  for (const result of resultRows) {
    const planned = plannedByKey.get(resultKey(result));
    const strategy =
      strategies.get(result.strategyId) ?? makeStrategy(result.strategyId);
    strategies.set(result.strategyId, strategy);

    strategy.requestCount += 1;
    if (result.status === 'ok') strategy.okCount += 1;
    if (result.status === 'error') strategy.errorCount += 1;

    const usageCost = calculateAnthropicUsageCost({
      usage: result.usage,
      pricing,
    });
    strategy.inputTokens += usageCost.inputTokens;
    strategy.outputTokens += usageCost.outputTokens;
    strategy.cacheWrite5mInputTokens += usageCost.cacheWrite5mInputTokens;
    strategy.cacheWrite1hInputTokens += usageCost.cacheWrite1hInputTokens;
    strategy.cacheReadInputTokens += usageCost.cacheReadInputTokens;
    strategy.costUsd += usageCost.usd;

    if (!planned) continue;
    strategy.estimatedInputTokens += planned.estimatedInputTokens ?? 0;
    if (planned.contextCoverage?.hasCanonicalCurrentDocument) {
      strategy.canonicalCurrentDocumentRequests += 1;
    }
    if (planned.contextCoverage?.hasChangeSummary) {
      strategy.changeSummaryRequests += 1;
    }

    const promptText = (planned.messages ?? [])
      .map((message) => message.content)
      .join('\n');
    const response = result.response ?? '';
    const mustUseAnchors = planned.mustUseAnchors ?? [];
    if (mustUseAnchors.length > 0) {
      const anchorsAvailable = mustUseAnchors.every((anchor) =>
        normalizedIncludes(promptText, anchor)
      );
      if (anchorsAvailable) {
        strategy.mustUseEligibleChecks += 1;
        if (
          mustUseAnchors.every((anchor) => normalizedIncludes(response, anchor))
        ) {
          strategy.exactMustUseAllPasses += 1;
        }
        if (
          mustUseAnchors.some((anchor) => normalizedIncludes(response, anchor))
        ) {
          strategy.exactMustUseAnyPasses += 1;
        }
      } else {
        strategy.mustUseAnchorsAbsentFromPrompt += 1;
      }
    }

    const mustNotUseAnchors = planned.mustNotUseAnchors ?? [];
    if (mustNotUseAnchors.length > 0) {
      strategy.mustNotChecks += 1;
      strategy.mustNotViolations += mustNotUseAnchors.filter((anchor) =>
        normalizedIncludes(response, anchor)
      ).length;
    }
  }

  return {
    totalRequests: resultRows.length,
    strategies: [...strategies.values()],
  };
}

function ratio(numerator: number, denominator: number) {
  return denominator === 0 ? 'n/a' : `${numerator}/${denominator}`;
}

export function renderLiveEvalAnalysis(summary: LiveEvalAnalysis) {
  const lines = [
    '# AI Context Live Eval Analysis',
    '',
    `Requests analyzed: ${summary.totalRequests}`,
    '',
    '| Strategy | OK | Input | Output | Cache write 5m | Cache write 1h | Cache read | Cost | Canonical doc | Change summary | Exact anchors | Any anchor | Must-not violations |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  ];

  for (const strategy of summary.strategies) {
    lines.push(
      `| ${strategy.strategyId} | ${strategy.okCount}/${strategy.requestCount} | ${strategy.inputTokens} | ${strategy.outputTokens} | ${strategy.cacheWrite5mInputTokens} | ${strategy.cacheWrite1hInputTokens} | ${strategy.cacheReadInputTokens} | ${formatUsd(strategy.costUsd)} | ${strategy.canonicalCurrentDocumentRequests}/${strategy.requestCount} | ${strategy.changeSummaryRequests}/${strategy.requestCount} | ${ratio(strategy.exactMustUseAllPasses, strategy.mustUseEligibleChecks)} | ${ratio(strategy.exactMustUseAnyPasses, strategy.mustUseEligibleChecks)} | ${ratio(strategy.mustNotViolations, strategy.mustNotChecks)} |`
    );
  }

  return lines.join('\n');
}

function readManifestModel(runDir: string) {
  const manifestPath = join(runDir, 'manifest.json');
  if (!existsSync(manifestPath)) return 'claude-sonnet-4-6';
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
    model?: string;
  };
  return manifest.model ?? 'claude-sonnet-4-6';
}

if (import.meta.main) {
  const runDir = process.argv[2];
  if (!runDir) {
    console.error(
      'Usage: bun run scripts/ai-context-evals/live-results-analysis.ts <run-dir>'
    );
    process.exit(1);
  }

  const model = readManifestModel(runDir);
  const pricing = CLAUDE_PRICING[model] ?? CLAUDE_PRICING['claude-sonnet-4-6'];
  const summary = analyzeLiveEvalResults({
    pricing,
    plannedRows: parseJsonl<PlannedJsonlRow>(
      readFileSync(join(runDir, 'planned-requests.jsonl'), 'utf8')
    ),
    resultRows: parseJsonl<ResultJsonlRow>(
      readFileSync(join(runDir, 'live-results.jsonl'), 'utf8')
    ),
  });

  console.log(renderLiveEvalAnalysis(summary));
}
