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
      model: 'claude-sonnet-4-6',
      provider: 'anthropic',
      inputTokens: 2200,
      outputTokens: 210,
      metadata: null,
      messages: [
        {
          role: 'user',
          content:
            'Get started! Begin your message by introducing me. Pretend I am a person you are talking to.',
        },
        { role: 'user', content: 'This is my draft.' },
        { role: 'user', content: 'Can you help?' },
      ],
    },
    {
      id: 'llm-4',
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
      id: 'llm-5',
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

    expect(rows).toHaveLength(3);
    expect(rows.map((row) => row.cmsId)).toEqual(['cms-a', 'cms-a', null]);
    expect(rows.map((row) => row.source)).toEqual([
      'tagged-metadata',
      'tagged-metadata',
      'legacy-tutor-marker',
    ]);
    expect(rows[2]).toMatchObject({
      messageCount: 3,
      isFirstTurn: true,
    });
  });

  test('summarizes average turns, document size, and cost per module session', () => {
    const summary = summarizeTutorBaseline({
      rows: normalizeTutorLogRows(rawRows),
      pricing: CLAUDE_PRICING['claude-sonnet-4-6'],
    });

    expect(summary.totalCalls).toBe(3);
    expect(summary.taggedTutorCalls).toBe(2);
    expect(summary.legacyTutorMarkerCalls).toBe(1);
    expect(summary.totalModuleSessions).toBe(2);
    expect(summary.averageTurnsPerModuleSession).toBe(1.5);
    expect(summary.averageDocumentWordsPerCall).toBe(520);
    expect(summary.documentSizedCalls).toBe(2);
    expect(summary.averageMessagesPerCall).toBe(3);
    expect(summary.averageInputTokensPerCall).toBe(1600);
    expect(summary.averageOutputTokensPerCall).toBe(177);
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
    expect(report).toContain('Tagged tutor calls: 2');
    expect(report).toContain('Legacy tutor-marker calls: 1');
    expect(report).toContain('Average turns/module: 1.50');
    expect(report).toContain('Average document words/call: 520');
  });

  test('builds a read-only tutor LLM log query scoped by recency and limit', () => {
    const query = buildTutorBaselineQuery({ days: 60, limit: 250 });

    expect(query.text).toContain('FROM "LlmLog"');
    expect(query.text).toContain("metadata->>'feature' = 'tutor'");
    expect(query.text).toContain("metadata->>'kind' = 'assignment-module-tutor'");
    expect(query.text).toContain('messages::text ILIKE');
    expect(query.values).toEqual([60, 250]);
  });
});
