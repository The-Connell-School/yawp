import { formatUsd, estimateUsd, type ModelPricing } from './cost';

type RawLogRow = {
  id?: string;
  model?: unknown;
  provider?: unknown;
  inputTokens?: unknown;
  outputTokens?: unknown;
  error?: unknown;
  metadata?: unknown;
};

export type TutorBaselineRow = {
  id: string;
  model: string;
  provider: 'anthropic';
  cmsId: string;
  inputTokens: number;
  outputTokens: number;
  documentTextLength: number | null;
};

export type TutorBaselineSummary = {
  totalCalls: number;
  totalModuleSessions: number;
  averageTurnsPerModuleSession: number;
  averageDocumentWordsPerCall: number;
  averageInputTokensPerCall: number;
  averageOutputTokensPerCall: number;
  averageCostUsdPerCall: number;
  averageCostUsdPerModuleSession: number;
};

export function buildTutorBaselineQuery({
  days,
  limit,
}: {
  days: number;
  limit: number;
}) {
  return {
    text: `
      SELECT
        id,
        model,
        provider,
        "inputTokens",
        "outputTokens",
        error,
        metadata
      FROM "LlmLog"
      WHERE "createdAt" >= now() - ($1::int * interval '1 day')
        AND provider = 'anthropic'
        AND error IS NULL
        AND metadata->>'feature' = 'tutor'
        AND metadata->>'kind' = 'assignment-module-tutor'
      ORDER BY "createdAt" DESC
      LIMIT $2
    `,
    values: [days, limit],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function numberValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : null;
}

export function normalizeTutorLogRows(rows: RawLogRow[]): TutorBaselineRow[] {
  return rows.flatMap((row) => {
    if (row.provider !== 'anthropic') return [];
    if (row.error) return [];
    if (!isRecord(row.metadata)) return [];
    if (row.metadata.feature !== 'tutor') return [];
    if (row.metadata.kind !== 'assignment-module-tutor') return [];

    const inputTokens = numberValue(row.inputTokens);
    const outputTokens = numberValue(row.outputTokens);
    const model = stringValue(row.model);
    const cmsId = stringValue(row.metadata.cmsId);

    if (inputTokens == null || outputTokens == null || !model || !cmsId) {
      return [];
    }

    return [
      {
        id: stringValue(row.id) ?? `${cmsId}-${inputTokens}-${outputTokens}`,
        model,
        provider: 'anthropic' as const,
        cmsId,
        inputTokens,
        outputTokens,
        documentTextLength: numberValue(row.metadata.documentTextLength),
      },
    ];
  });
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function estimateDocumentWordsFromChars(charCount: number | null) {
  if (!charCount) return 0;
  return Math.round(charCount / 5);
}

export function summarizeTutorBaseline({
  rows,
  pricing,
}: {
  rows: TutorBaselineRow[];
  pricing: ModelPricing;
}): TutorBaselineSummary {
  const sessions = new Map<string, TutorBaselineRow[]>();
  for (const row of rows) {
    sessions.set(row.cmsId, [...(sessions.get(row.cmsId) ?? []), row]);
  }

  const perCallCosts = rows.map((row) =>
    estimateUsd({
      inputTokens: row.inputTokens,
      outputTokens: row.outputTokens,
      pricing,
    })
  );
  const perSessionCosts = [...sessions.values()].map((sessionRows) =>
    sessionRows.reduce(
      (sum, row) =>
        sum +
        estimateUsd({
          inputTokens: row.inputTokens,
          outputTokens: row.outputTokens,
          pricing,
        }),
      0
    )
  );

  return {
    totalCalls: rows.length,
    totalModuleSessions: sessions.size,
    averageTurnsPerModuleSession:
      sessions.size === 0 ? 0 : rows.length / sessions.size,
    averageDocumentWordsPerCall: Math.round(
      average(
        rows.map((row) => estimateDocumentWordsFromChars(row.documentTextLength))
      )
    ),
    averageInputTokensPerCall: Math.round(
      average(rows.map((row) => row.inputTokens))
    ),
    averageOutputTokensPerCall: Math.round(
      average(rows.map((row) => row.outputTokens))
    ),
    averageCostUsdPerCall: average(perCallCosts),
    averageCostUsdPerModuleSession: average(perSessionCosts),
  };
}

export function buildBaselineReport({
  summary,
  sourceLabel,
}: {
  summary: TutorBaselineSummary;
  sourceLabel: string;
}) {
  return [
    '# Tutor Baseline',
    '',
    `Source: ${sourceLabel}`,
    `Tutor calls: ${summary.totalCalls}`,
    `Module sessions: ${summary.totalModuleSessions}`,
    `Average turns/module: ${summary.averageTurnsPerModuleSession.toFixed(2)}`,
    `Average document words/call: ${summary.averageDocumentWordsPerCall}`,
    `Average input tokens/call: ${summary.averageInputTokensPerCall}`,
    `Average output tokens/call: ${summary.averageOutputTokensPerCall}`,
    `Average cost/call: ${formatUsd(summary.averageCostUsdPerCall)}`,
    `Average cost/module: ${formatUsd(
      summary.averageCostUsdPerModuleSession
    )}`,
  ].join('\n');
}
