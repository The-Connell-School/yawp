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

export type ScenarioLiveAnalysis = StrategyLiveAnalysis & {
  scenarioId: string;
  documentWordCount: number | null;
};

export type DocumentSizeLiveAnalysis = StrategyLiveAnalysis & {
  documentWordCount: number;
};

export type LiveEvalAnalysis = {
  totalRequests: number;
  strategies: StrategyLiveAnalysis[];
  scenarios: ScenarioLiveAnalysis[];
  documentSizes: DocumentSizeLiveAnalysis[];
};

export type LiveEvalGateOptions = {
  requireAllRequestsOk: boolean;
  maxMustNotViolations: number;
  minStrategyAnyAnchorRate: number;
  minCriticalScenarioAnyAnchorRate: number;
  criticalScenarioIds: string[];
};

export type LiveEvalGate = {
  passed: boolean;
  failures: string[];
  options: LiveEvalGateOptions;
};

export const DEFAULT_LIVE_EVAL_GATE_OPTIONS: LiveEvalGateOptions = {
  requireAllRequestsOk: true,
  maxMustNotViolations: 0,
  minStrategyAnyAnchorRate: 0.75,
  minCriticalScenarioAnyAnchorRate: 0.75,
  criticalScenarioIds: [
    'local-revision-follow-up',
    'specific-detail-question',
    'deleted-content-trap',
  ],
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

function makeCounts() {
  return {
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

function makeStrategy(strategyId: string): StrategyLiveAnalysis {
  return {
    strategyId,
    ...makeCounts(),
  };
}

function makeScenario({
  strategyId,
  scenarioId,
  documentWordCount,
}: {
  strategyId: string;
  scenarioId: string;
  documentWordCount: number | null;
}): ScenarioLiveAnalysis {
  return {
    strategyId,
    scenarioId,
    documentWordCount,
    ...makeCounts(),
  };
}

function makeDocumentSize({
  strategyId,
  documentWordCount,
}: {
  strategyId: string;
  documentWordCount: number;
}): DocumentSizeLiveAnalysis {
  return {
    strategyId,
    documentWordCount,
    ...makeCounts(),
  };
}

function parseEvalCaseId(evalCaseId: string) {
  const match = /^(.*)-(\d+)$/.exec(evalCaseId);
  if (!match) {
    return {
      scenarioId: evalCaseId,
      documentWordCount: null,
    };
  }

  return {
    scenarioId: match[1]!,
    documentWordCount: Number(match[2]),
  };
}

function addResultToAnalysis({
  analysis,
  result,
  planned,
  pricing,
}: {
  analysis: Omit<StrategyLiveAnalysis, 'strategyId'>;
  result: ResultJsonlRow;
  planned?: PlannedJsonlRow;
  pricing: ModelPricing;
}) {
  analysis.requestCount += 1;
  if (result.status === 'ok') analysis.okCount += 1;
  if (result.status === 'error') analysis.errorCount += 1;

  const usageCost = calculateAnthropicUsageCost({
    usage: result.usage,
    pricing,
  });
  analysis.inputTokens += usageCost.inputTokens;
  analysis.outputTokens += usageCost.outputTokens;
  analysis.cacheWrite5mInputTokens += usageCost.cacheWrite5mInputTokens;
  analysis.cacheWrite1hInputTokens += usageCost.cacheWrite1hInputTokens;
  analysis.cacheReadInputTokens += usageCost.cacheReadInputTokens;
  analysis.costUsd += usageCost.usd;

  if (!planned) return;
  analysis.estimatedInputTokens += planned.estimatedInputTokens ?? 0;
  if (planned.contextCoverage?.hasCanonicalCurrentDocument) {
    analysis.canonicalCurrentDocumentRequests += 1;
  }
  if (planned.contextCoverage?.hasChangeSummary) {
    analysis.changeSummaryRequests += 1;
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
      analysis.mustUseEligibleChecks += 1;
      if (mustUseAnchors.every((anchor) => normalizedIncludes(response, anchor))) {
        analysis.exactMustUseAllPasses += 1;
      }
      if (mustUseAnchors.some((anchor) => normalizedIncludes(response, anchor))) {
        analysis.exactMustUseAnyPasses += 1;
      }
    } else {
      analysis.mustUseAnchorsAbsentFromPrompt += 1;
    }
  }

  const mustNotUseAnchors = planned.mustNotUseAnchors ?? [];
  if (mustNotUseAnchors.length > 0) {
    analysis.mustNotChecks += 1;
    analysis.mustNotViolations += mustNotUseAnchors.filter((anchor) =>
      normalizedIncludes(response, anchor)
    ).length;
  }
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
  const scenarios = new Map<string, ScenarioLiveAnalysis>();
  const documentSizes = new Map<string, DocumentSizeLiveAnalysis>();

  for (const result of resultRows) {
    const planned = plannedByKey.get(resultKey(result));
    const { scenarioId, documentWordCount } = parseEvalCaseId(result.evalCaseId);
    const strategy =
      strategies.get(result.strategyId) ?? makeStrategy(result.strategyId);
    strategies.set(result.strategyId, strategy);

    addResultToAnalysis({
      analysis: strategy,
      result,
      planned,
      pricing,
    });

    const scenarioKey = `${result.strategyId}|${scenarioId}`;
    const scenario =
      scenarios.get(scenarioKey) ??
      makeScenario({
        strategyId: result.strategyId,
        scenarioId,
        documentWordCount,
      });
    if (
      scenario.documentWordCount !== null &&
      documentWordCount !== scenario.documentWordCount
    ) {
      scenario.documentWordCount = null;
    }
    scenarios.set(scenarioKey, scenario);
    addResultToAnalysis({
      analysis: scenario,
      result,
      planned,
      pricing,
    });

    if (documentWordCount !== null) {
      const documentSizeKey = `${result.strategyId}|${documentWordCount}`;
      const documentSize =
        documentSizes.get(documentSizeKey) ??
        makeDocumentSize({
          strategyId: result.strategyId,
          documentWordCount,
        });
      documentSizes.set(documentSizeKey, documentSize);
      addResultToAnalysis({
        analysis: documentSize,
        result,
        planned,
        pricing,
      });
    }
  }

  return {
    totalRequests: resultRows.length,
    strategies: [...strategies.values()],
    scenarios: [...scenarios.values()],
    documentSizes: [...documentSizes.values()],
  };
}

function ratio(numerator: number, denominator: number) {
  return denominator === 0 ? 'n/a' : `${numerator}/${denominator}`;
}

function rate(numerator: number, denominator: number) {
  return denominator === 0 ? 1 : numerator / denominator;
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function perRequest(value: number, requestCount: number) {
  return requestCount === 0 ? 0 : value / requestCount;
}

function sortByStrategyAndScenario(
  a: { strategyId: string; scenarioId: string },
  b: { strategyId: string; scenarioId: string }
) {
  return (
    a.strategyId.localeCompare(b.strategyId) ||
    a.scenarioId.localeCompare(b.scenarioId)
  );
}

function sortByStrategyAndDocumentSize(
  a: { strategyId: string; documentWordCount: number },
  b: { strategyId: string; documentWordCount: number }
) {
  return (
    a.strategyId.localeCompare(b.strategyId) ||
    a.documentWordCount - b.documentWordCount
  );
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

  lines.push(
    '',
    '## Scenario Reliability',
    '',
    '| Strategy | Scenario | OK | Exact anchors | Any anchor | Must-not violations | Cost |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: |'
  );

  for (const scenario of [...summary.scenarios].sort(sortByStrategyAndScenario)) {
    lines.push(
      `| ${scenario.strategyId} | ${scenario.scenarioId} | ${scenario.okCount}/${scenario.requestCount} | ${ratio(scenario.exactMustUseAllPasses, scenario.mustUseEligibleChecks)} | ${ratio(scenario.exactMustUseAnyPasses, scenario.mustUseEligibleChecks)} | ${ratio(scenario.mustNotViolations, scenario.mustNotChecks)} | ${formatUsd(scenario.costUsd)} |`
    );
  }

  lines.push(
    '',
    '## Document Size Pricing',
    '',
    '| Strategy | Words | Requests | Input/request | Output/request | Cost/request | Cost |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: |'
  );

  for (const documentSize of [...summary.documentSizes].sort(
    sortByStrategyAndDocumentSize
  )) {
    lines.push(
      `| ${documentSize.strategyId} | ${documentSize.documentWordCount} | ${documentSize.requestCount} | ${Math.round(perRequest(documentSize.inputTokens, documentSize.requestCount))} | ${Math.round(perRequest(documentSize.outputTokens, documentSize.requestCount))} | ${formatUsd(perRequest(documentSize.costUsd, documentSize.requestCount))} | ${formatUsd(documentSize.costUsd)} |`
    );
  }

  return lines.join('\n');
}

export function evaluateLiveEvalGate(
  summary: LiveEvalAnalysis,
  options: Partial<LiveEvalGateOptions> = {}
): LiveEvalGate {
  const gateOptions = {
    ...DEFAULT_LIVE_EVAL_GATE_OPTIONS,
    ...options,
  };
  const failures: string[] = [];

  for (const strategy of summary.strategies) {
    if (
      gateOptions.requireAllRequestsOk &&
      strategy.okCount !== strategy.requestCount
    ) {
      failures.push(
        `${strategy.strategyId} had ${strategy.errorCount} errors (${strategy.okCount}/${strategy.requestCount} ok).`
      );
    }

    if (strategy.mustNotViolations > gateOptions.maxMustNotViolations) {
      failures.push(
        `${strategy.strategyId} had ${strategy.mustNotViolations} stale/deleted anchor violations across ${strategy.mustNotChecks} checks.`
      );
    }

    const anyAnchorRate = rate(
      strategy.exactMustUseAnyPasses,
      strategy.mustUseEligibleChecks
    );
    if (
      strategy.mustUseEligibleChecks > 0 &&
      anyAnchorRate < gateOptions.minStrategyAnyAnchorRate
    ) {
      failures.push(
        `${strategy.strategyId} latest-anchor recall ${formatPercent(anyAnchorRate)} is below ${formatPercent(gateOptions.minStrategyAnyAnchorRate)} (${strategy.exactMustUseAnyPasses}/${strategy.mustUseEligibleChecks}).`
      );
    }
  }

  const criticalScenarioIds = new Set(gateOptions.criticalScenarioIds);
  for (const scenario of summary.scenarios) {
    if (!criticalScenarioIds.has(scenario.scenarioId)) continue;

    if (
      gateOptions.requireAllRequestsOk &&
      scenario.okCount !== scenario.requestCount
    ) {
      failures.push(
        `${scenario.strategyId} ${scenario.scenarioId} had ${scenario.errorCount} errors (${scenario.okCount}/${scenario.requestCount} ok).`
      );
    }

    if (scenario.mustNotViolations > gateOptions.maxMustNotViolations) {
      failures.push(
        `${scenario.strategyId} ${scenario.scenarioId} had ${scenario.mustNotViolations} stale/deleted anchor violations.`
      );
    }

    const anyAnchorRate = rate(
      scenario.exactMustUseAnyPasses,
      scenario.mustUseEligibleChecks
    );
    if (
      scenario.mustUseEligibleChecks > 0 &&
      anyAnchorRate < gateOptions.minCriticalScenarioAnyAnchorRate
    ) {
      failures.push(
        `${scenario.strategyId} ${scenario.scenarioId} latest-anchor recall ${formatPercent(anyAnchorRate)} is below ${formatPercent(gateOptions.minCriticalScenarioAnyAnchorRate)} (${scenario.exactMustUseAnyPasses}/${scenario.mustUseEligibleChecks}).`
      );
    }
  }

  return {
    passed: failures.length === 0,
    failures,
    options: gateOptions,
  };
}

export function renderLiveEvalGate(gate: LiveEvalGate) {
  const lines = [
    '# AI Context Live Eval Gate',
    '',
    `Gate: ${gate.passed ? 'PASS' : 'FAIL'}`,
    `Minimum strategy any-anchor recall: ${formatPercent(
      gate.options.minStrategyAnyAnchorRate
    )}`,
    `Minimum critical-scenario any-anchor recall: ${formatPercent(
      gate.options.minCriticalScenarioAnyAnchorRate
    )}`,
    `Maximum stale/deleted anchor violations: ${gate.options.maxMustNotViolations}`,
  ];

  if (gate.failures.length > 0) {
    lines.push('', 'Failures:');
    for (const failure of gate.failures) {
      lines.push(`- ${failure}`);
    }
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
  const args = process.argv.slice(2);
  const runDir = args.find((arg) => !arg.startsWith('--'));
  const shouldGate = args.includes('--gate');
  if (!runDir) {
    console.error(
      'Usage: bun run scripts/ai-context-evals/live-results-analysis.ts <run-dir> [--gate]'
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
  if (shouldGate) {
    const gate = evaluateLiveEvalGate(summary);
    console.log('');
    console.log(renderLiveEvalGate(gate));
    if (!gate.passed) {
      process.exit(1);
    }
  }
}
