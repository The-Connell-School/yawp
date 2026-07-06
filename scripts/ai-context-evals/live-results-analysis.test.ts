import { describe, expect, test } from 'bun:test';
import {
  analyzeLiveEvalResults,
  calculateAnthropicUsageCost,
  parseJsonl,
  renderLiveEvalAnalysis,
} from './live-results-analysis';
import { CLAUDE_PRICING } from './cost';

describe('AI context eval live results analysis', () => {
  test('parses non-empty JSONL rows', () => {
    expect(parseJsonl('{"a":1}\n\n{"a":2}\n')).toEqual([{ a: 1 }, { a: 2 }]);
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
          evalCaseId: 'local-revision-follow-up-100',
          turnIndex: 0,
          estimatedInputTokens: 10,
          contextCoverage: {
            hasCanonicalCurrentDocument: true,
            hasChangeSummary: false,
          },
          mustUseAnchors: ['survey statistic'],
          mustNotUseAnchors: ['deleted example'],
          messages: [{ role: 'user', content: 'The survey statistic is here.' }],
        },
        {
          strategyId: 'full-document-each-turn',
          evalCaseId: 'local-revision-follow-up-100',
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
          evalCaseId: 'local-revision-follow-up-100',
          turnIndex: 0,
          response: 'The survey statistic works. Avoid the deleted example.',
          usage: {
            input_tokens: 100,
            output_tokens: 20,
            cache_read_input_tokens: 0,
          },
        },
        {
          status: 'ok',
          strategyId: 'full-document-each-turn',
          evalCaseId: 'local-revision-follow-up-100',
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
      scenarioId: 'local-revision-follow-up',
      documentWordCount: 100,
      okCount: 2,
      mustUseEligibleChecks: 1,
      mustNotViolations: 1,
    });
    expect(summary.documentSizes).toHaveLength(1);
    expect(summary.documentSizes[0]).toMatchObject({
      strategyId: 'full-document-each-turn',
      documentWordCount: 100,
      requestCount: 2,
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
    expect(report).toContain('## Document Size Pricing');
    expect(report).toContain('| full-document-each-turn | 100 |');
    expect(report).toContain('$0.0006');
  });
});
