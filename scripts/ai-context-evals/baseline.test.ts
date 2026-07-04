import { describe, expect, test } from 'bun:test';
import {
  buildBaselineReport,
  buildTutorBaselineQuery,
  normalizeTutorLogRows,
  summarizeTutorBaseline,
} from './baseline';
import { CLAUDE_PRICING } from './cost';

describe('AI context eval production baseline summary', () => {
  const rawRows = [
    {
      id: 'llm-1',
      model: 'claude-sonnet-4-6',
      provider: 'anthropic',
      inputTokens: 1200,
      outputTokens: 150,
      metadata: {
        feature: 'tutor',
        kind: 'assignment-module-tutor',
        cmsId: 'cms-a',
        documentTextLength: 2400,
      },
    },
    {
      id: 'llm-2',
      model: 'claude-sonnet-4-6',
      provider: 'anthropic',
      inputTokens: 1400,
      outputTokens: 170,
      metadata: {
        feature: 'tutor',
        kind: 'assignment-module-tutor',
        cmsId: 'cms-a',
        documentTextLength: 2800,
      },
    },
    {
      id: 'llm-3',
      model: 'gpt-4o-mini',
      provider: 'openai',
      inputTokens: 999,
      outputTokens: 99,
      metadata: {
        feature: 'tutor',
        kind: 'assignment-module-tutor',
        cmsId: 'cms-fallback',
      },
    },
    {
      id: 'llm-4',
      model: 'claude-sonnet-4-6',
      provider: 'anthropic',
      inputTokens: 800,
      outputTokens: 110,
      metadata: {
        feature: 'grading',
        kind: 'grading-assistant',
      },
    },
  ];

  test('normalizes only successful Anthropic tutor logs', () => {
    const rows = normalizeTutorLogRows(rawRows);

    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.cmsId)).toEqual(['cms-a', 'cms-a']);
  });

  test('summarizes average turns, document size, and cost per module session', () => {
    const summary = summarizeTutorBaseline({
      rows: normalizeTutorLogRows(rawRows),
      pricing: CLAUDE_PRICING['claude-sonnet-4-6'],
    });

    expect(summary.totalCalls).toBe(2);
    expect(summary.totalModuleSessions).toBe(1);
    expect(summary.averageTurnsPerModuleSession).toBe(2);
    expect(summary.averageDocumentWordsPerCall).toBe(520);
    expect(summary.averageInputTokensPerCall).toBe(1300);
    expect(summary.averageOutputTokensPerCall).toBe(160);
    expect(summary.averageCostUsdPerModuleSession).toBeGreaterThan(0);
  });

  test('renders an operator-readable baseline report', () => {
    const report = buildBaselineReport({
      summary: summarizeTutorBaseline({
        rows: normalizeTutorLogRows(rawRows),
        pricing: CLAUDE_PRICING['claude-sonnet-4-6'],
      }),
      sourceLabel: 'sample rows',
    });

    expect(report).toContain('Tutor Baseline');
    expect(report).toContain('sample rows');
    expect(report).toContain('Average turns/module: 2.00');
    expect(report).toContain('Average document words/call: 520');
  });

  test('builds a read-only tutor LLM log query scoped by recency and limit', () => {
    const query = buildTutorBaselineQuery({ days: 60, limit: 250 });

    expect(query.text).toContain('FROM "LlmLog"');
    expect(query.text).toContain("metadata->>'feature' = 'tutor'");
    expect(query.text).toContain("metadata->>'kind' = 'assignment-module-tutor'");
    expect(query.values).toEqual([60, 250]);
  });
});
