#!/usr/bin/env bun

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { CLAUDE_PRICING, formatUsd, type ModelPricing } from './cost';

type PlannedJsonlRow = {
  strategyId: string;
  evalCaseId: string;
  documentDomainId?: string;
  scenarioId?: string;
  documentWordCount?: number;
  turnIndex: number;
  estimatedInputTokens?: number;
  contextCoverage?: {
    hasCanonicalCurrentDocument?: boolean;
    hasChangeSummary?: boolean;
  };
  mustUseAnchors?: string[];
  mustNotUseAnchors?: string[];
  trapTypes?: string[];
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

export type TrapTypeLiveAnalysis = StrategyLiveAnalysis & {
  trapType: string;
};

export type DocumentSizeLiveAnalysis = StrategyLiveAnalysis & {
  documentWordCount: number;
};

export type LiveEvalAnalysis = {
  totalRequests: number;
  strategies: StrategyLiveAnalysis[];
  scenarios: ScenarioLiveAnalysis[];
  trapTypes: TrapTypeLiveAnalysis[];
  documentSizes: DocumentSizeLiveAnalysis[];
};

export type LiveEvalGateOptions = {
  requireAllRequestsOk: boolean;
  maxMustNotViolations: number;
  minStrategyAnyAnchorRate: number;
  minCriticalScenarioAnyAnchorRate: number;
  criticalScenarioIds: string[];
  minCriticalTrapAnyAnchorRate: number;
  criticalTrapTypes: string[];
  fullDocumentControlStrategyId: string;
  minFullDocumentControlAnyAnchorRate: number;
  requireFullDocumentControlCanonicalEveryRequest: boolean;
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
  minCriticalTrapAnyAnchorRate: 0.75,
  criticalScenarioIds: [
    'local-revision-follow-up',
    'specific-detail-question',
    'deleted-content-trap',
  ],
  criticalTrapTypes: [
    'changed-name',
    'changed-date',
    'changed-number',
    'negation-flip',
    'deleted-paragraph',
    'reordered-claim',
  ],
  fullDocumentControlStrategyId: 'full-document-each-turn',
  minFullDocumentControlAnyAnchorRate: 0.85,
  requireFullDocumentControlCanonicalEveryRequest: true,
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

function makeTrapType({
  strategyId,
  trapType,
}: {
  strategyId: string;
  trapType: string;
}): TrapTypeLiveAnalysis {
  return {
    strategyId,
    trapType,
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

export function parseEvalCaseId(evalCaseId: string) {
  const match = /^(?:(.*?)__)?(.+)-(\d+)$/.exec(evalCaseId);
  if (!match) {
    return {
      documentDomainId: null,
      scenarioId: evalCaseId,
      documentWordCount: null,
    };
  }

  return {
    documentDomainId: match[1] ?? null,
    scenarioId: match[2]!,
    documentWordCount: Number(match[3]),
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

  const mustNotUseAnchors = (planned.mustNotUseAnchors ?? []).filter(
    (anchor) => !normalizedIncludes(promptText, anchor)
  );
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
  const trapTypes = new Map<string, TrapTypeLiveAnalysis>();
  const documentSizes = new Map<string, DocumentSizeLiveAnalysis>();

  for (const result of resultRows) {
    const planned = plannedByKey.get(resultKey(result));
    const parsedEvalCaseId = parseEvalCaseId(result.evalCaseId);
    const scenarioId = planned?.scenarioId ?? parsedEvalCaseId.scenarioId;
    const documentWordCount =
      planned?.documentWordCount ?? parsedEvalCaseId.documentWordCount;
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

    for (const trapType of planned?.trapTypes ?? []) {
      const trapTypeKey = `${result.strategyId}|${trapType}`;
      const trapTypeAnalysis =
        trapTypes.get(trapTypeKey) ??
        makeTrapType({
          strategyId: result.strategyId,
          trapType,
        });
      trapTypes.set(trapTypeKey, trapTypeAnalysis);
      addResultToAnalysis({
        analysis: trapTypeAnalysis,
        result,
        planned,
        pricing,
      });
    }

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
    trapTypes: [...trapTypes.values()],
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

function sortByStrategyAndTrapType(
  a: { strategyId: string; trapType: string },
  b: { strategyId: string; trapType: string }
) {
  return (
    a.strategyId.localeCompare(b.strategyId) ||
    a.trapType.localeCompare(b.trapType)
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
    '## Tiny-Change Trap Reliability',
    '',
    '| Strategy | Trap type | OK | Exact anchors | Any anchor | Must-not violations | Cost |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: |'
  );

  for (const trapType of [...summary.trapTypes].sort(sortByStrategyAndTrapType)) {
    lines.push(
      `| ${trapType.strategyId} | ${trapType.trapType} | ${trapType.okCount}/${trapType.requestCount} | ${ratio(trapType.exactMustUseAllPasses, trapType.mustUseEligibleChecks)} | ${ratio(trapType.exactMustUseAnyPasses, trapType.mustUseEligibleChecks)} | ${ratio(trapType.mustNotViolations, trapType.mustNotChecks)} | ${formatUsd(trapType.costUsd)} |`
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

  const fullDocumentControl = summary.strategies.find(
    (strategy) => strategy.strategyId === gateOptions.fullDocumentControlStrategyId
  );
  if (!fullDocumentControl) {
    failures.push(
      `${gateOptions.fullDocumentControlStrategyId} control strategy did not run.`
    );
  } else {
    if (
      gateOptions.requireFullDocumentControlCanonicalEveryRequest &&
      fullDocumentControl.canonicalCurrentDocumentRequests !==
        fullDocumentControl.requestCount
    ) {
      failures.push(
        `${fullDocumentControl.strategyId} control included the canonical current document on ${fullDocumentControl.canonicalCurrentDocumentRequests}/${fullDocumentControl.requestCount} requests.`
      );
    }

    const anyAnchorRate = rate(
      fullDocumentControl.exactMustUseAnyPasses,
      fullDocumentControl.mustUseEligibleChecks
    );
    if (
      fullDocumentControl.mustUseEligibleChecks > 0 &&
      anyAnchorRate < gateOptions.minFullDocumentControlAnyAnchorRate
    ) {
      failures.push(
        `${fullDocumentControl.strategyId} control latest-anchor recall ${formatPercent(anyAnchorRate)} is below ${formatPercent(gateOptions.minFullDocumentControlAnyAnchorRate)} (${fullDocumentControl.exactMustUseAnyPasses}/${fullDocumentControl.mustUseEligibleChecks}).`
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

  const criticalTrapTypes = new Set(gateOptions.criticalTrapTypes);
  for (const trapType of summary.trapTypes) {
    if (!criticalTrapTypes.has(trapType.trapType)) continue;

    if (
      gateOptions.requireAllRequestsOk &&
      trapType.okCount !== trapType.requestCount
    ) {
      failures.push(
        `${trapType.strategyId} ${trapType.trapType} trap had ${trapType.errorCount} errors (${trapType.okCount}/${trapType.requestCount} ok).`
      );
    }

    if (trapType.mustNotViolations > gateOptions.maxMustNotViolations) {
      failures.push(
        `${trapType.strategyId} ${trapType.trapType} trap had ${trapType.mustNotViolations} stale/deleted anchor violations.`
      );
    }

    const anyAnchorRate = rate(
      trapType.exactMustUseAnyPasses,
      trapType.mustUseEligibleChecks
    );
    if (
      trapType.mustUseEligibleChecks > 0 &&
      anyAnchorRate < gateOptions.minCriticalTrapAnyAnchorRate
    ) {
      failures.push(
        `${trapType.strategyId} ${trapType.trapType} trap latest-anchor recall ${formatPercent(anyAnchorRate)} is below ${formatPercent(gateOptions.minCriticalTrapAnyAnchorRate)} (${trapType.exactMustUseAnyPasses}/${trapType.mustUseEligibleChecks}).`
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
    `Minimum critical-trap any-anchor recall: ${formatPercent(
      gate.options.minCriticalTrapAnyAnchorRate
    )}`,
    `Full-document control: ${gate.options.fullDocumentControlStrategyId}`,
    `Minimum full-document control any-anchor recall: ${formatPercent(
      gate.options.minFullDocumentControlAnyAnchorRate
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

export type LiveEvalBaselineMetric = {
  id: string;
  requestCount: number;
  okRate: number;
  anyAnchorRate: number;
  exactAnchorRate: number;
  canonicalCurrentDocumentRate: number;
  mustNotViolations: number;
  costUsd: number;
};

export type LiveEvalBenchmarkBaseline = {
  schemaVersion: 1;
  createdAt: string;
  totalRequests: number;
  gatePassed: boolean;
  strategies: LiveEvalBaselineMetric[];
  scenarios: LiveEvalBaselineMetric[];
  trapTypes: LiveEvalBaselineMetric[];
};

export type LiveEvalBaselineDiffOptions = {
  maxAnyAnchorRateDrop: number;
  maxOkRateDrop: number;
  maxCanonicalCurrentDocumentRateDrop: number;
  maxMustNotViolationIncrease: number;
};

export type LiveEvalBaselineDiff = {
  passed: boolean;
  failures: string[];
  lines: string[];
  options: LiveEvalBaselineDiffOptions;
};

export const DEFAULT_LIVE_EVAL_BASELINE_DIFF_OPTIONS: LiveEvalBaselineDiffOptions =
  {
    maxAnyAnchorRateDrop: 0.05,
    maxOkRateDrop: 0,
    maxCanonicalCurrentDocumentRateDrop: 0,
    maxMustNotViolationIncrease: 0,
  };

function baselineMetric(
  id: string,
  analysis: StrategyLiveAnalysis
): LiveEvalBaselineMetric {
  return {
    id,
    requestCount: analysis.requestCount,
    okRate: rate(analysis.okCount, analysis.requestCount),
    anyAnchorRate: rate(
      analysis.exactMustUseAnyPasses,
      analysis.mustUseEligibleChecks
    ),
    exactAnchorRate: rate(
      analysis.exactMustUseAllPasses,
      analysis.mustUseEligibleChecks
    ),
    canonicalCurrentDocumentRate: rate(
      analysis.canonicalCurrentDocumentRequests,
      analysis.requestCount
    ),
    mustNotViolations: analysis.mustNotViolations,
    costUsd: analysis.costUsd,
  };
}

export function buildLiveEvalBenchmarkBaseline({
  summary,
  gate,
  createdAt = new Date().toISOString(),
}: {
  summary: LiveEvalAnalysis;
  gate: LiveEvalGate;
  createdAt?: string;
}): LiveEvalBenchmarkBaseline {
  return {
    schemaVersion: 1,
    createdAt,
    totalRequests: summary.totalRequests,
    gatePassed: gate.passed,
    strategies: summary.strategies.map((strategy) =>
      baselineMetric(strategy.strategyId, strategy)
    ),
    scenarios: summary.scenarios.map((scenario) =>
      baselineMetric(`${scenario.strategyId}|${scenario.scenarioId}`, scenario)
    ),
    trapTypes: summary.trapTypes.map((trapType) =>
      baselineMetric(`${trapType.strategyId}|${trapType.trapType}`, trapType)
    ),
  };
}

function signedPercentPoints(value: number) {
  const sign = value > 0 ? '+' : '';
  return `${sign}${(value * 100).toFixed(1)} pts`;
}

function compareBaselineMetric({
  label,
  previous,
  current,
  options,
  failures,
  lines,
}: {
  label: string;
  previous: LiveEvalBaselineMetric;
  current?: LiveEvalBaselineMetric;
  options: LiveEvalBaselineDiffOptions;
  failures: string[];
  lines: string[];
}) {
  if (!current) {
    const failure = `${label} is missing from the current run.`;
    failures.push(failure);
    lines.push(`- ${failure}`);
    return;
  }

  const anyAnchorDelta = current.anyAnchorRate - previous.anyAnchorRate;
  const okDelta = current.okRate - previous.okRate;
  const canonicalDelta =
    current.canonicalCurrentDocumentRate -
    previous.canonicalCurrentDocumentRate;
  const mustNotDelta =
    current.mustNotViolations - previous.mustNotViolations;
  const costDelta = current.costUsd - previous.costUsd;

  lines.push(
    `- ${label}: any-anchor ${formatPercent(previous.anyAnchorRate)} -> ${formatPercent(current.anyAnchorRate)} (${signedPercentPoints(anyAnchorDelta)}), ok ${formatPercent(previous.okRate)} -> ${formatPercent(current.okRate)} (${signedPercentPoints(okDelta)}), canonical ${formatPercent(previous.canonicalCurrentDocumentRate)} -> ${formatPercent(current.canonicalCurrentDocumentRate)} (${signedPercentPoints(canonicalDelta)}), must-not ${previous.mustNotViolations} -> ${current.mustNotViolations}, cost ${formatUsd(previous.costUsd)} -> ${formatUsd(current.costUsd)} (${formatUsd(costDelta)})`
  );

  if (previous.anyAnchorRate - current.anyAnchorRate > options.maxAnyAnchorRateDrop) {
    failures.push(
      `${label} any-anchor recall dropped by ${signedPercentPoints(anyAnchorDelta)}.`
    );
  }
  if (previous.okRate - current.okRate > options.maxOkRateDrop) {
    failures.push(`${label} OK rate dropped by ${signedPercentPoints(okDelta)}.`);
  }
  if (
    previous.canonicalCurrentDocumentRate -
      current.canonicalCurrentDocumentRate >
    options.maxCanonicalCurrentDocumentRateDrop
  ) {
    failures.push(
      `${label} canonical-current-document rate dropped by ${signedPercentPoints(canonicalDelta)}.`
    );
  }
  if (mustNotDelta > options.maxMustNotViolationIncrease) {
    failures.push(
      `${label} stale/deleted anchor violations increased by ${mustNotDelta}.`
    );
  }
}

function metricMap(metrics: LiveEvalBaselineMetric[]) {
  return new Map(metrics.map((metric) => [metric.id, metric]));
}

export function diffLiveEvalBenchmarkBaseline({
  baseline,
  current,
  options = {},
}: {
  baseline: LiveEvalBenchmarkBaseline;
  current: LiveEvalBenchmarkBaseline;
  options?: Partial<LiveEvalBaselineDiffOptions>;
}): LiveEvalBaselineDiff {
  const diffOptions = {
    ...DEFAULT_LIVE_EVAL_BASELINE_DIFF_OPTIONS,
    ...options,
  };
  const failures: string[] = [];
  const lines: string[] = [];

  if (!current.gatePassed) {
    failures.push('Current run failed the latest-context gate.');
  }

  const metricGroups = [
    {
      label: 'strategy',
      baselineMetrics: baseline.strategies,
      currentMetrics: metricMap(current.strategies),
    },
    {
      label: 'scenario',
      baselineMetrics: baseline.scenarios,
      currentMetrics: metricMap(current.scenarios),
    },
    {
      label: 'trap',
      baselineMetrics: baseline.trapTypes,
      currentMetrics: metricMap(current.trapTypes),
    },
  ];

  for (const group of metricGroups) {
    for (const previous of group.baselineMetrics) {
      compareBaselineMetric({
        label: `${group.label} ${previous.id}`,
        previous,
        current: group.currentMetrics.get(previous.id),
        options: diffOptions,
        failures,
        lines,
      });
    }
  }

  return {
    passed: failures.length === 0,
    failures,
    lines,
    options: diffOptions,
  };
}

export function renderLiveEvalBaselineDiff(diff: LiveEvalBaselineDiff) {
  const lines = [
    '# AI Context Blessed Baseline Diff',
    '',
    `Baseline diff: ${diff.passed ? 'PASS' : 'FAIL'}`,
    `Allowed any-anchor recall drop: ${signedPercentPoints(
      -diff.options.maxAnyAnchorRateDrop
    )}`,
    `Allowed OK-rate drop: ${signedPercentPoints(-diff.options.maxOkRateDrop)}`,
    `Allowed canonical-current-document drop: ${signedPercentPoints(
      -diff.options.maxCanonicalCurrentDocumentRateDrop
    )}`,
    `Allowed stale/deleted anchor violation increase: ${diff.options.maxMustNotViolationIncrease}`,
  ];

  if (diff.failures.length > 0) {
    lines.push('', 'Failures:');
    for (const failure of diff.failures) {
      lines.push(`- ${failure}`);
    }
  }

  lines.push('', 'Metric changes:', ...diff.lines);

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
  const baselineWritePath = args
    .find((arg) => arg.startsWith('--write-baseline='))
    ?.slice('--write-baseline='.length);
  const baselineComparePath = args
    .find((arg) => arg.startsWith('--compare-baseline='))
    ?.slice('--compare-baseline='.length);
  if (!runDir) {
    console.error(
      'Usage: bun run scripts/ai-context-evals/live-results-analysis.ts <run-dir> [--gate] [--write-baseline=<path>] [--compare-baseline=<path>]'
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
  const gate =
    shouldGate || baselineWritePath || baselineComparePath
      ? evaluateLiveEvalGate(summary)
      : null;
  let shouldExitWithFailure = false;

  if (gate && shouldGate) {
    console.log('');
    console.log(renderLiveEvalGate(gate));
    if (!gate.passed) {
      shouldExitWithFailure = true;
    }
  }

  const currentBaseline = gate
    ? buildLiveEvalBenchmarkBaseline({
        summary,
        gate,
      })
    : null;

  if (baselineWritePath && currentBaseline) {
    mkdirSync(dirname(baselineWritePath), { recursive: true });
    writeFileSync(
      baselineWritePath,
      `${JSON.stringify(currentBaseline, null, 2)}\n`
    );
    console.log('');
    console.log(`Wrote baseline: ${baselineWritePath}`);
  }

  if (baselineComparePath && currentBaseline) {
    const baseline = JSON.parse(
      readFileSync(baselineComparePath, 'utf8')
    ) as LiveEvalBenchmarkBaseline;
    const diff = diffLiveEvalBenchmarkBaseline({
      baseline,
      current: currentBaseline,
    });
    console.log('');
    console.log(renderLiveEvalBaselineDiff(diff));
    if (!diff.passed) {
      shouldExitWithFailure = true;
    }
  }

  if (shouldExitWithFailure) {
    process.exit(1);
  }
}
