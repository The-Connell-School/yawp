import { describe, expect, test } from 'bun:test';
import {
  analyzeLiveEvalResults,
  buildLiveEvalBenchmarkBaseline,
  calculateAnthropicUsageCost,
  diffLiveEvalBenchmarkBaseline,
  evaluateLiveEvalGate,
  parseEvalCaseId,
  parseJsonl,
  renderLiveEvalBaselineDiff,
  renderLiveEvalAnalysis,
  renderLiveEvalGate,
} from './live-results-analysis';
import { CLAUDE_PRICING } from './cost';

function analysisCounts(overrides = {}) {
  return {
    requestCount: 1,
    okCount: 1,
    errorCount: 0,
    inputTokens: 100,
    outputTokens: 20,
    cacheWrite5mInputTokens: 0,
    cacheWrite1hInputTokens: 0,
    cacheReadInputTokens: 0,
    costUsd: 0.0006,
    canonicalCurrentDocumentRequests: 1,
    changeSummaryRequests: 0,
    estimatedInputTokens: 90,
    mustUseEligibleChecks: 1,
    exactMustUseAllPasses: 1,
    exactMustUseAnyPasses: 1,
    mustUseAnchorsAbsentFromPrompt: 0,
    mustNotChecks: 0,
    mustNotViolations: 0,
    ...overrides,
  };
}

describe('AI context eval live results analysis', () => {
  test('parses non-empty JSONL rows', () => {
    expect(parseJsonl('{"a":1}\n\n{"a":2}\n')).toEqual([{ a: 1 }, { a: 2 }]);
  });

  test('parses domain-aware eval case ids without folding the domain into the scenario', () => {
    expect(parseEvalCaseId('ap-history-dbq__specific-detail-question-100')).toEqual({
      documentDomainId: 'ap-history-dbq',
      scenarioId: 'specific-detail-question',
      documentWordCount: 100,
    });
    expect(parseEvalCaseId('specific-detail-question-100')).toEqual({
      documentDomainId: null,
      scenarioId: 'specific-detail-question',
      documentWordCount: 100,
    });
  });

  test('calculates Anthropic usage cost with cache token fields', () => {
    const cost = calculateAnthropicUsageCost({
      usage: {
        input_tokens: 1000,
        output_tokens: 100,
        cache_read_input_tokens: 2000,
        cache_creation: {
          ephemeral_5m_input_tokens: 3000,
          ephemeral_1h_input_tokens: 4000,
        },
      },
      pricing: CLAUDE_PRICING['claude-sonnet-4-6'],
    });

    expect(cost.inputTokens).toBe(1000);
    expect(cost.outputTokens).toBe(100);
    expect(cost.cacheReadInputTokens).toBe(2000);
    expect(cost.cacheWrite5mInputTokens).toBe(3000);
    expect(cost.cacheWrite1hInputTokens).toBe(4000);
    expect(cost.usd).toBeCloseTo(0.04035, 8);
  });

  test('groups live results by strategy and ignores impossible anchor checks', () => {
    const summary = analyzeLiveEvalResults({
      pricing: CLAUDE_PRICING['claude-sonnet-4-6'],
      plannedRows: [
        {
          strategyId: 'full-document-each-turn',
          evalCaseId: 'ap-history-dbq__specific-detail-question-100',
          documentDomainId: 'ap-history-dbq',
          scenarioId: 'specific-detail-question',
          documentWordCount: 100,
          turnIndex: 0,
          estimatedInputTokens: 10,
          contextCoverage: {
            hasCanonicalCurrentDocument: true,
            hasChangeSummary: false,
          },
          mustUseAnchors: ['March 5, 1770'],
          mustNotUseAnchors: ['deleted example'],
          trapTypes: ['changed-date'],
          messages: [{ role: 'user', content: 'The March 5, 1770 detail is here.' }],
        },
        {
          strategyId: 'full-document-each-turn',
          evalCaseId: 'ap-history-dbq__specific-detail-question-100',
          documentDomainId: 'ap-history-dbq',
          scenarioId: 'specific-detail-question',
          documentWordCount: 100,
          turnIndex: 1,
          estimatedInputTokens: 10,
          contextCoverage: {
            hasCanonicalCurrentDocument: true,
            hasChangeSummary: false,
          },
          mustUseAnchors: ['absent anchor'],
          mustNotUseAnchors: [],
          messages: [{ role: 'user', content: 'No required anchor here.' }],
        },
      ],
      resultRows: [
        {
          status: 'ok',
          strategyId: 'full-document-each-turn',
          evalCaseId: 'ap-history-dbq__specific-detail-question-100',
          turnIndex: 0,
          response: 'The March 5, 1770 detail works. Avoid the deleted example.',
          usage: {
            input_tokens: 100,
            output_tokens: 20,
            cache_read_input_tokens: 0,
          },
        },
        {
          status: 'ok',
          strategyId: 'full-document-each-turn',
          evalCaseId: 'ap-history-dbq__specific-detail-question-100',
          turnIndex: 1,
          response: 'Looks good.',
          usage: {
            input_tokens: 100,
            output_tokens: 20,
            cache_read_input_tokens: 0,
          },
        },
      ],
    });

    expect(summary.totalRequests).toBe(2);
    expect(summary.strategies).toHaveLength(1);
    expect(summary.strategies[0]).toMatchObject({
      strategyId: 'full-document-each-turn',
      okCount: 2,
      canonicalCurrentDocumentRequests: 2,
      mustUseEligibleChecks: 1,
      exactMustUseAllPasses: 1,
      mustUseAnchorsAbsentFromPrompt: 1,
      mustNotViolations: 1,
    });
    expect(summary.scenarios).toHaveLength(1);
    expect(summary.scenarios[0]).toMatchObject({
      strategyId: 'full-document-each-turn',
      scenarioId: 'specific-detail-question',
      documentWordCount: 100,
      okCount: 2,
      mustUseEligibleChecks: 1,
      mustNotViolations: 1,
    });
    expect(summary.trapTypes).toHaveLength(1);
    expect(summary.trapTypes[0]).toMatchObject({
      strategyId: 'full-document-each-turn',
      trapType: 'changed-date',
      requestCount: 1,
      mustUseEligibleChecks: 1,
      exactMustUseAnyPasses: 1,
    });
    expect(summary.documentSizes).toHaveLength(1);
    expect(summary.documentSizes[0]).toMatchObject({
      strategyId: 'full-document-each-turn',
      documentWordCount: 100,
      requestCount: 2,
    });
  });

  test('does not count must-not anchors while they are still present in the current prompt', () => {
    const summary = analyzeLiveEvalResults({
      pricing: CLAUDE_PRICING['claude-sonnet-4-6'],
      plannedRows: [
        {
          strategyId: 'full-document-each-turn',
          evalCaseId: 'literary-analysis__local-revision-follow-up-200',
          documentDomainId: 'literary-analysis',
          scenarioId: 'local-revision-follow-up',
          documentWordCount: 200,
          turnIndex: 1,
          estimatedInputTokens: 10,
          contextCoverage: {
            hasCanonicalCurrentDocument: true,
            hasChangeSummary: false,
          },
          mustUseAnchors: ['Jordan', 'active helper'],
          mustNotUseAnchors: ['Maya is the narrator'],
          trapTypes: ['changed-name'],
          messages: [
            {
              role: 'user',
              content:
                'Current document says Jordan is active helper. A weak paragraph says Maya is the narrator in every chapter.',
            },
          ],
        },
      ],
      resultRows: [
        {
          status: 'ok',
          strategyId: 'full-document-each-turn',
          evalCaseId: 'literary-analysis__local-revision-follow-up-200',
          turnIndex: 1,
          response:
            'The draft has a consistency issue: Jordan is active helper, but a weak paragraph says Maya is the narrator.',
          usage: {
            input_tokens: 100,
            output_tokens: 20,
            cache_read_input_tokens: 0,
          },
        },
      ],
    });

    expect(summary.strategies[0]).toMatchObject({
      mustNotChecks: 0,
      mustNotViolations: 0,
    });
    expect(summary.scenarios[0]).toMatchObject({
      mustNotChecks: 0,
      mustNotViolations: 0,
    });
    expect(summary.trapTypes[0]).toMatchObject({
      mustNotChecks: 0,
      mustNotViolations: 0,
    });
  });

  test('renders an operator-readable live analysis report', () => {
    const report = renderLiveEvalAnalysis({
      totalRequests: 1,
      strategies: [
        {
          strategyId: 'full-document-each-turn',
          requestCount: 1,
          okCount: 1,
          errorCount: 0,
          inputTokens: 100,
          outputTokens: 20,
          cacheWrite5mInputTokens: 0,
          cacheWrite1hInputTokens: 0,
          cacheReadInputTokens: 0,
          costUsd: 0.0006,
          canonicalCurrentDocumentRequests: 1,
          changeSummaryRequests: 0,
          estimatedInputTokens: 90,
          mustUseEligibleChecks: 1,
          exactMustUseAllPasses: 1,
          exactMustUseAnyPasses: 1,
          mustUseAnchorsAbsentFromPrompt: 0,
          mustNotChecks: 0,
          mustNotViolations: 0,
        },
      ],
      scenarios: [
        {
          strategyId: 'full-document-each-turn',
          scenarioId: 'local-revision-follow-up',
          documentWordCount: 100,
          requestCount: 1,
          okCount: 1,
          errorCount: 0,
          inputTokens: 100,
          outputTokens: 20,
          cacheWrite5mInputTokens: 0,
          cacheWrite1hInputTokens: 0,
          cacheReadInputTokens: 0,
          costUsd: 0.0006,
          canonicalCurrentDocumentRequests: 1,
          changeSummaryRequests: 0,
          estimatedInputTokens: 90,
          mustUseEligibleChecks: 1,
          exactMustUseAllPasses: 1,
          exactMustUseAnyPasses: 1,
          mustUseAnchorsAbsentFromPrompt: 0,
          mustNotChecks: 0,
          mustNotViolations: 0,
        },
      ],
      trapTypes: [
        {
          strategyId: 'full-document-each-turn',
          trapType: 'changed-date',
          requestCount: 1,
          okCount: 1,
          errorCount: 0,
          inputTokens: 100,
          outputTokens: 20,
          cacheWrite5mInputTokens: 0,
          cacheWrite1hInputTokens: 0,
          cacheReadInputTokens: 0,
          costUsd: 0.0006,
          canonicalCurrentDocumentRequests: 1,
          changeSummaryRequests: 0,
          estimatedInputTokens: 90,
          mustUseEligibleChecks: 1,
          exactMustUseAllPasses: 1,
          exactMustUseAnyPasses: 1,
          mustUseAnchorsAbsentFromPrompt: 0,
          mustNotChecks: 0,
          mustNotViolations: 0,
        },
      ],
      documentSizes: [
        {
          strategyId: 'full-document-each-turn',
          documentWordCount: 100,
          requestCount: 1,
          okCount: 1,
          errorCount: 0,
          inputTokens: 100,
          outputTokens: 20,
          cacheWrite5mInputTokens: 0,
          cacheWrite1hInputTokens: 0,
          cacheReadInputTokens: 0,
          costUsd: 0.0006,
          canonicalCurrentDocumentRequests: 1,
          changeSummaryRequests: 0,
          estimatedInputTokens: 90,
          mustUseEligibleChecks: 1,
          exactMustUseAllPasses: 1,
          exactMustUseAnyPasses: 1,
          mustUseAnchorsAbsentFromPrompt: 0,
          mustNotChecks: 0,
          mustNotViolations: 0,
        },
      ],
    });

    expect(report).toContain('# AI Context Live Eval Analysis');
    expect(report).toContain('full-document-each-turn');
    expect(report).toContain('## Scenario Reliability');
    expect(report).toContain('local-revision-follow-up');
    expect(report).toContain('## Tiny-Change Trap Reliability');
    expect(report).toContain('changed-date');
    expect(report).toContain('## Document Size Pricing');
    expect(report).toContain('| full-document-each-turn | 100 |');
    expect(report).toContain('$0.0006');
  });

  test('passes the latest-context regression gate for healthy eval results', () => {
    const gate = evaluateLiveEvalGate({
      totalRequests: 2,
      strategies: [
        {
          strategyId: 'full-document-each-turn',
          requestCount: 2,
          okCount: 2,
          errorCount: 0,
          inputTokens: 100,
          outputTokens: 20,
          cacheWrite5mInputTokens: 0,
          cacheWrite1hInputTokens: 0,
          cacheReadInputTokens: 0,
          costUsd: 0.0006,
          canonicalCurrentDocumentRequests: 2,
          changeSummaryRequests: 0,
          estimatedInputTokens: 90,
          mustUseEligibleChecks: 2,
          exactMustUseAllPasses: 1,
          exactMustUseAnyPasses: 2,
          mustUseAnchorsAbsentFromPrompt: 0,
          mustNotChecks: 1,
          mustNotViolations: 0,
        },
      ],
      scenarios: [
        {
          strategyId: 'full-document-each-turn',
          scenarioId: 'local-revision-follow-up',
          documentWordCount: null,
          requestCount: 1,
          okCount: 1,
          errorCount: 0,
          inputTokens: 50,
          outputTokens: 10,
          cacheWrite5mInputTokens: 0,
          cacheWrite1hInputTokens: 0,
          cacheReadInputTokens: 0,
          costUsd: 0.0003,
          canonicalCurrentDocumentRequests: 1,
          changeSummaryRequests: 0,
          estimatedInputTokens: 45,
          mustUseEligibleChecks: 1,
          exactMustUseAllPasses: 1,
          exactMustUseAnyPasses: 1,
          mustUseAnchorsAbsentFromPrompt: 0,
          mustNotChecks: 0,
          mustNotViolations: 0,
        },
        {
          strategyId: 'full-document-each-turn',
          scenarioId: 'specific-detail-question',
          documentWordCount: null,
          requestCount: 1,
          okCount: 1,
          errorCount: 0,
          inputTokens: 50,
          outputTokens: 10,
          cacheWrite5mInputTokens: 0,
          cacheWrite1hInputTokens: 0,
          cacheReadInputTokens: 0,
          costUsd: 0.0003,
          canonicalCurrentDocumentRequests: 1,
          changeSummaryRequests: 0,
          estimatedInputTokens: 45,
          mustUseEligibleChecks: 1,
          exactMustUseAllPasses: 0,
          exactMustUseAnyPasses: 1,
          mustUseAnchorsAbsentFromPrompt: 0,
          mustNotChecks: 1,
          mustNotViolations: 0,
        },
      ],
      trapTypes: [
        {
          strategyId: 'full-document-each-turn',
          trapType: 'changed-date',
          requestCount: 1,
          okCount: 1,
          errorCount: 0,
          inputTokens: 50,
          outputTokens: 10,
          cacheWrite5mInputTokens: 0,
          cacheWrite1hInputTokens: 0,
          cacheReadInputTokens: 0,
          costUsd: 0.0003,
          canonicalCurrentDocumentRequests: 1,
          changeSummaryRequests: 0,
          estimatedInputTokens: 45,
          mustUseEligibleChecks: 1,
          exactMustUseAllPasses: 1,
          exactMustUseAnyPasses: 1,
          mustUseAnchorsAbsentFromPrompt: 0,
          mustNotChecks: 0,
          mustNotViolations: 0,
        },
      ],
      documentSizes: [],
    });

    expect(gate.passed).toBe(true);
    expect(renderLiveEvalGate(gate)).toContain('Gate: PASS');
  });

  test('fails the latest-context regression gate for errors, stale anchors, or weak changed-detail recall', () => {
    const gate = evaluateLiveEvalGate({
      totalRequests: 2,
      strategies: [
        {
          strategyId: 'delta-since-last-turn',
          requestCount: 2,
          okCount: 1,
          errorCount: 1,
          inputTokens: 100,
          outputTokens: 20,
          cacheWrite5mInputTokens: 0,
          cacheWrite1hInputTokens: 0,
          cacheReadInputTokens: 0,
          costUsd: 0.0006,
          canonicalCurrentDocumentRequests: 1,
          changeSummaryRequests: 1,
          estimatedInputTokens: 90,
          mustUseEligibleChecks: 4,
          exactMustUseAllPasses: 1,
          exactMustUseAnyPasses: 2,
          mustUseAnchorsAbsentFromPrompt: 0,
          mustNotChecks: 1,
          mustNotViolations: 1,
        },
      ],
      scenarios: [
        {
          strategyId: 'delta-since-last-turn',
          scenarioId: 'specific-detail-question',
          documentWordCount: null,
          requestCount: 2,
          okCount: 1,
          errorCount: 1,
          inputTokens: 100,
          outputTokens: 20,
          cacheWrite5mInputTokens: 0,
          cacheWrite1hInputTokens: 0,
          cacheReadInputTokens: 0,
          costUsd: 0.0006,
          canonicalCurrentDocumentRequests: 1,
          changeSummaryRequests: 1,
          estimatedInputTokens: 90,
          mustUseEligibleChecks: 4,
          exactMustUseAllPasses: 1,
          exactMustUseAnyPasses: 2,
          mustUseAnchorsAbsentFromPrompt: 0,
          mustNotChecks: 1,
          mustNotViolations: 1,
        },
      ],
      trapTypes: [
        {
          strategyId: 'delta-since-last-turn',
          trapType: 'changed-number',
          requestCount: 2,
          okCount: 1,
          errorCount: 1,
          inputTokens: 100,
          outputTokens: 20,
          cacheWrite5mInputTokens: 0,
          cacheWrite1hInputTokens: 0,
          cacheReadInputTokens: 0,
          costUsd: 0.0006,
          canonicalCurrentDocumentRequests: 1,
          changeSummaryRequests: 1,
          estimatedInputTokens: 90,
          mustUseEligibleChecks: 4,
          exactMustUseAllPasses: 1,
          exactMustUseAnyPasses: 2,
          mustUseAnchorsAbsentFromPrompt: 0,
          mustNotChecks: 1,
          mustNotViolations: 1,
        },
      ],
      documentSizes: [],
    });

    expect(gate.passed).toBe(false);
    expect(gate.failures.join('\n')).toContain('delta-since-last-turn had 1 errors');
    expect(gate.failures.join('\n')).toContain('stale/deleted anchor');
    expect(gate.failures.join('\n')).toContain('specific-detail-question');
    expect(renderLiveEvalGate(gate)).toContain('Gate: FAIL');
  });

  test('fails the gate when the full-document control does not send the canonical current document every turn', () => {
    const gate = evaluateLiveEvalGate({
      totalRequests: 2,
      strategies: [
        {
          strategyId: 'full-document-each-turn',
          ...analysisCounts({
            requestCount: 2,
            okCount: 2,
            canonicalCurrentDocumentRequests: 1,
            mustUseEligibleChecks: 2,
            exactMustUseAnyPasses: 2,
          }),
        },
      ],
      scenarios: [],
      trapTypes: [],
      documentSizes: [],
    });

    expect(gate.passed).toBe(false);
    expect(gate.failures.join('\n')).toContain(
      'canonical current document on 1/2 requests'
    );
  });

  test('compares a current run against a blessed baseline and fails material regressions', () => {
    const baselineSummary = {
      totalRequests: 1,
      strategies: [
        {
          strategyId: 'full-document-each-turn',
          ...analysisCounts(),
        },
      ],
      scenarios: [
        {
          strategyId: 'full-document-each-turn',
          scenarioId: 'specific-detail-question',
          documentWordCount: null,
          ...analysisCounts(),
        },
      ],
      trapTypes: [
        {
          strategyId: 'full-document-each-turn',
          trapType: 'changed-date',
          ...analysisCounts(),
        },
      ],
      documentSizes: [],
    };
    const baselineGate = evaluateLiveEvalGate(baselineSummary);
    const baseline = buildLiveEvalBenchmarkBaseline({
      summary: baselineSummary,
      gate: baselineGate,
      createdAt: '2026-07-06T00:00:00.000Z',
    });
    const currentSummary = {
      ...baselineSummary,
      strategies: [
        {
          strategyId: 'full-document-each-turn',
          ...analysisCounts({
            mustUseEligibleChecks: 10,
            exactMustUseAnyPasses: 8,
          }),
        },
      ],
      scenarios: [
        {
          strategyId: 'full-document-each-turn',
          scenarioId: 'specific-detail-question',
          documentWordCount: null,
          ...analysisCounts({
            mustUseEligibleChecks: 10,
            exactMustUseAnyPasses: 8,
          }),
        },
      ],
      trapTypes: [
        {
          strategyId: 'full-document-each-turn',
          trapType: 'changed-date',
          ...analysisCounts({
            mustUseEligibleChecks: 10,
            exactMustUseAnyPasses: 8,
          }),
        },
      ],
    };
    const currentGate = evaluateLiveEvalGate(currentSummary, {
      minFullDocumentControlAnyAnchorRate: 0.75,
    });
    const current = buildLiveEvalBenchmarkBaseline({
      summary: currentSummary,
      gate: currentGate,
      createdAt: '2026-07-06T01:00:00.000Z',
    });
    const diff = diffLiveEvalBenchmarkBaseline({ baseline, current });

    expect(diff.passed).toBe(false);
    expect(diff.failures.join('\n')).toContain('any-anchor recall dropped');
    expect(renderLiveEvalBaselineDiff(diff)).toContain('Baseline diff: FAIL');
  });
});
