import {
  deidentifyLlmLogData,
  isLlmLogDeidentified,
} from '../app/utils/llm-log-deidentify.server';

type LlmLogRow = {
  id: string;
  model: string;
  provider: string;
  systemPrompt: string | null;
  messages: unknown;
  response: string | null;
  error: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  durationMs: number | null;
  metadata: unknown;
};

export type BackfillOptions = {
  dryRun: boolean;
  batchSize: number;
  environment: 'demo' | 'production';
  snapshotConfirmed: boolean;
};

export type BackfillSummary = {
  scanned: number;
  skipped: number;
  changed: number;
  textChanged: number;
  updated: number;
  batches: number;
  dryRun: boolean;
};

export type BackfillPrisma = {
  llmLog: {
    findMany: (args: {
      take: number;
      orderBy: { id: 'asc' };
      cursor?: { id: string };
      skip?: number;
      select: Record<keyof LlmLogRow, true>;
    }) => Promise<LlmLogRow[]>;
    update: (args: { where: { id: string }; data: any }) => Promise<unknown>;
  };
};

export function parseBackfillArgs(
  args: string[],
  env: Record<string, string | undefined> = process.env
): BackfillOptions {
  const dryRun = !args.includes('--apply');
  const batchSizeIndex = args.indexOf('--batch-size');
  const envIndex = args.indexOf('--environment');
  const allowed = new Set([
    '--dry-run',
    '--apply',
    '--batch-size',
    '--environment',
  ]);

  for (const arg of args) {
    if (arg.startsWith('--') && !allowed.has(arg)) throw new Error(usage());
  }
  if (args.includes('--dry-run') && args.includes('--apply')) {
    throw new Error(usage());
  }

  const batchSize =
    batchSizeIndex === -1 ? 500 : Number(args[batchSizeIndex + 1]);
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 5000) {
    throw new Error('Batch size must be an integer from 1 to 5000.');
  }

  const environment =
    envIndex === -1 ? 'demo' : args[envIndex + 1]?.trim();
  if (environment !== 'demo' && environment !== 'production') {
    throw new Error('Environment must be demo or production.');
  }

  const snapshotConfirmed =
    env.LLMLOG_BACKFILL_SNAPSHOT_CONFIRMED === 'true';
  if (!dryRun && environment === 'production' && !snapshotConfirmed) {
    throw new Error(
      'Take the required production RDS snapshot, then set LLMLOG_BACKFILL_SNAPSHOT_CONFIRMED=true before --apply.'
    );
  }

  return { dryRun, batchSize, environment, snapshotConfirmed };
}

function usage() {
  return [
    'Usage: bun scripts/backfill-llm-log-deidentify.ts [--dry-run|--apply] [--environment demo|production] [--batch-size N]',
    'Default is --dry-run. Production --apply requires LLMLOG_BACKFILL_SNAPSHOT_CONFIRMED=true.',
  ].join('\n');
}

function selectedFields(): Record<keyof LlmLogRow, true> {
  return {
    id: true,
    model: true,
    provider: true,
    systemPrompt: true,
    messages: true,
    response: true,
    error: true,
    inputTokens: true,
    outputTokens: true,
    totalTokens: true,
    durationMs: true,
    metadata: true,
  };
}

function rowToData(row: LlmLogRow) {
  return {
    model: row.model,
    provider: row.provider as 'anthropic' | 'openai',
    systemPrompt: row.systemPrompt ?? undefined,
    messages: row.messages as object,
    response: row.response ?? undefined,
    error: row.error ?? undefined,
    inputTokens: row.inputTokens ?? undefined,
    outputTokens: row.outputTokens ?? undefined,
    totalTokens: row.totalTokens ?? undefined,
    durationMs: row.durationMs ?? undefined,
    metadata: (row.metadata ?? {}) as object,
  };
}

function changed(row: LlmLogRow, data: ReturnType<typeof deidentifyLlmLogData>) {
  return (
    row.systemPrompt !== (data.systemPrompt ?? null) ||
    JSON.stringify(row.messages) !== JSON.stringify(data.messages) ||
    row.response !== (data.response ?? null) ||
    row.error !== (data.error ?? null) ||
    JSON.stringify(row.metadata ?? {}) !== JSON.stringify(data.metadata ?? {})
  );
}

function textChanged(
  row: LlmLogRow,
  data: ReturnType<typeof deidentifyLlmLogData>
) {
  return (
    row.systemPrompt !== (data.systemPrompt ?? null) ||
    JSON.stringify(row.messages) !== JSON.stringify(data.messages) ||
    row.response !== (data.response ?? null) ||
    row.error !== (data.error ?? null)
  );
}

export async function backfillLlmLogDeidentification({
  prisma,
  options,
  log = console.log,
}: {
  prisma: BackfillPrisma;
  options: BackfillOptions;
  log?: (message: string) => void;
}): Promise<BackfillSummary> {
  const summary: BackfillSummary = {
    scanned: 0,
    skipped: 0,
    changed: 0,
    textChanged: 0,
    updated: 0,
    batches: 0,
    dryRun: options.dryRun,
  };
  let cursor: { id: string } | undefined;

  for (;;) {
    const rows = await prisma.llmLog.findMany({
      take: options.batchSize,
      orderBy: { id: 'asc' },
      ...(cursor ? { cursor, skip: 1 } : {}),
      select: selectedFields(),
    });
    if (rows.length === 0) break;
    summary.batches += 1;

    for (const row of rows) {
      summary.scanned += 1;
      if (isLlmLogDeidentified(row.metadata)) {
        summary.skipped += 1;
        continue;
      }

      const data = deidentifyLlmLogData(rowToData(row));
      if (!changed(row, data)) {
        summary.skipped += 1;
        continue;
      }

      summary.changed += 1;
      if (textChanged(row, data)) summary.textChanged += 1;
      if (!options.dryRun) {
        await prisma.llmLog.update({
          where: { id: row.id },
          data: {
            systemPrompt: data.systemPrompt ?? null,
            messages: data.messages,
            response: data.response ?? null,
            error: data.error ?? null,
            metadata: data.metadata,
          },
        });
        summary.updated += 1;
      }
    }

    cursor = { id: rows[rows.length - 1].id };
    log(
      `llmlog deidentify batch=${summary.batches} scanned=${summary.scanned} changed=${summary.changed} textChanged=${summary.textChanged} updated=${summary.updated} dryRun=${summary.dryRun}`
    );
    if (rows.length < options.batchSize) break;
  }

  return summary;
}
