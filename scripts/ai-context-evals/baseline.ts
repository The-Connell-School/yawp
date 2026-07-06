import { formatUsd, estimateUsd, type ModelPricing } from './cost';

type RawLogRow = {
  id?: string;
  model?: unknown;
  provider?: unknown;
  inputTokens?: unknown;
  outputTokens?: unknown;
  error?: unknown;
  metadata?: unknown;
  messages?: unknown;
};

export type TutorBaselineRow = {
  id: string;
  model: string;
  provider: 'anthropic';
  cmsId: string | null;
  inputTokens: number;
  outputTokens: number;
  documentTextLength: number | null;
  messageCount: number | null;
  isFirstTurn: boolean;
  source: 'tagged-metadata' | 'legacy-tutor-marker';
};

export type TutorBaselineSummary = {
  totalCalls: number;
  taggedTutorCalls: number;
  legacyTutorMarkerCalls: number;
  totalModuleSessions: number;
  averageTurnsPerModuleSession: number;
  documentSizedCalls: number;
  averageDocumentWordsPerCall: number;
  averageMessagesPerCall: number;
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
        metadata,
        messages
      FROM "LlmLog"
      WHERE "createdAt" >= now() - ($1::int * interval '1 day')
        AND provider = 'anthropic'
        AND error IS NULL
        AND (
          (
            metadata->>'feature' = 'tutor'
            AND metadata->>'kind' = 'assignment-module-tutor'
          )
          OR messages::text ILIKE '%Get started! Begin your message%'
        )
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

function messageCount(messages: unknown) {
  return Array.isArray(messages) ? messages.length : null;
}

function hasLegacyTutorMarker(messages: unknown) {
  return JSON.stringify(messages ?? '').includes(
    'Get started! Begin your message'
  );
}

export function normalizeTutorLogRows(rows: RawLogRow[]): TutorBaselineRow[] {
  return rows.flatMap((row) => {
    if (row.provider !== 'anthropic') return [];
    if (row.error) return [];
    const metadata = isRecord(row.metadata) ? row.metadata : {};
    const isTaggedTutor =
      metadata.feature === 'tutor' &&
      metadata.kind === 'assignment-module-tutor';
    const isLegacyTutor = !isTaggedTutor && hasLegacyTutorMarker(row.messages);
    if (!isTaggedTutor && !isLegacyTutor) return [];

    const inputTokens = numberValue(row.inputTokens);
    const outputTokens = numberValue(row.outputTokens);
    const model = stringValue(row.model);
    const cmsId = stringValue(metadata.cmsId);

    if (inputTokens == null || outputTokens == null || !model) {
      return [];
    }

    const source = isTaggedTutor
      ? ('tagged-metadata' as const)
      : ('legacy-tutor-marker' as const);
    const count = messageCount(row.messages);

    return [
      {
        id: stringValue(row.id) ?? `${cmsId}-${inputTokens}-${outputTokens}`,
        model,
        provider: 'anthropic' as const,
        cmsId,
        inputTokens,
        outputTokens,
        documentTextLength: numberValue(metadata.documentTextLength),
        messageCount: count,
        isFirstTurn: source === 'legacy-tutor-marker' && count === 3,
        source,
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
    if (row.source === 'tagged-metadata' && row.cmsId) {
      sessions.set(row.cmsId, [...(sessions.get(row.cmsId) ?? []), row]);
    }
  }
  const legacySessionCount = rows.filter((row) => row.isFirstTurn).length;
  const totalModuleSessions = sessions.size + legacySessionCount;
  const documentWordEstimates = rows
    .map((row) => estimateDocumentWordsFromChars(row.documentTextLength))
    .filter((value) => value > 0);
  const messageCounts = rows.flatMap((row) =>
    row.messageCount == null ? [] : [row.messageCount]
  );

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
    taggedTutorCalls: rows.filter((row) => row.source === 'tagged-metadata')
      .length,
    legacyTutorMarkerCalls: rows.filter(
      (row) => row.source === 'legacy-tutor-marker'
    ).length,
    totalModuleSessions,
    averageTurnsPerModuleSession:
      totalModuleSessions === 0 ? 0 : rows.length / totalModuleSessions,
    documentSizedCalls: documentWordEstimates.length,
    averageDocumentWordsPerCall: Math.round(average(documentWordEstimates)),
    averageMessagesPerCall: average(messageCounts),
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
    `Tagged tutor calls: ${summary.taggedTutorCalls}`,
    `Legacy tutor-marker calls: ${summary.legacyTutorMarkerCalls}`,
    `Module sessions: ${summary.totalModuleSessions}`,
    `Average turns/module: ${summary.averageTurnsPerModuleSession.toFixed(2)}`,
    `Document-sized calls: ${summary.documentSizedCalls}`,
    `Average document words/call: ${summary.averageDocumentWordsPerCall}`,
    `Average messages/call: ${summary.averageMessagesPerCall.toFixed(2)}`,
    `Average input tokens/call: ${summary.averageInputTokensPerCall}`,
    `Average output tokens/call: ${summary.averageOutputTokensPerCall}`,
    `Average cost/call: ${formatUsd(summary.averageCostUsdPerCall)}`,
    `Average cost/module: ${formatUsd(
      summary.averageCostUsdPerModuleSession
    )}`,
  ].join('\n');
}
