#!/usr/bin/env bun

import { mkdirSync, writeFileSync } from 'fs';
import { createRequire } from 'module';
import { join } from 'path';
import {
  buildBaselineReport,
  buildTutorBaselineQuery,
  normalizeTutorLogRows,
  summarizeTutorBaseline,
} from './baseline';
import { CLAUDE_PRICING } from './cost';

type BaselineOptions = {
  databaseUrl: string;
  model: string;
  days: number;
  limit: number;
  outputDir: string;
};

type PgModule = {
  Client: new (config: { connectionString: string }) => {
    connect: () => Promise<void>;
    query: (text: string, values: unknown[]) => Promise<{ rows: unknown[] }>;
    end: () => Promise<void>;
  };
};

export function loadPgModuleForBaseline(): PgModule {
  const requireFromPrismaWorkspace = createRequire(
    new URL('../../packages/prisma/package.json', import.meta.url)
  );
  return requireFromPrismaWorkspace('pg') as PgModule;
}

function parseArgs(args: string[]): BaselineOptions {
  const options: BaselineOptions = {
    databaseUrl: process.env.DATABASE_URL || '',
    model: process.env.AI_MODEL || 'claude-sonnet-4-6',
    days: 60,
    limit: 1000,
    outputDir: '.worktree-local/ai-context-evals/baseline',
  };

  for (const arg of args) {
    if (arg.startsWith('--database-url=')) {
      options.databaseUrl = arg.slice('--database-url='.length);
    } else if (arg.startsWith('--model=')) {
      options.model = arg.slice('--model='.length);
    } else if (arg.startsWith('--days=')) {
      const parsed = Number(arg.slice('--days='.length));
      if (Number.isFinite(parsed) && parsed > 0) options.days = parsed;
    } else if (arg.startsWith('--limit=')) {
      const parsed = Number(arg.slice('--limit='.length));
      if (Number.isFinite(parsed) && parsed > 0) options.limit = parsed;
    } else if (arg.startsWith('--output-dir=')) {
      options.outputDir = arg.slice('--output-dir='.length);
    }
  }

  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.databaseUrl) {
    throw new Error('DATABASE_URL is required for the baseline runner.');
  }

  const pg = loadPgModuleForBaseline();
  const client = new pg.Client({ connectionString: options.databaseUrl });
  await client.connect();
  try {
    const query = buildTutorBaselineQuery({
      days: options.days,
      limit: options.limit,
    });
    const result = await client.query(query.text, query.values);
    const rows = normalizeTutorLogRows(result.rows);
    const pricing =
      CLAUDE_PRICING[options.model] ?? CLAUDE_PRICING['claude-sonnet-4-6'];
    const summary = summarizeTutorBaseline({ rows, pricing });
    const report = buildBaselineReport({
      summary,
      sourceLabel: `DATABASE_URL over last ${options.days} days, limit ${options.limit}`,
    });

    mkdirSync(options.outputDir, { recursive: true });
    const outputPath = join(options.outputDir, 'tutor-baseline.md');
    writeFileSync(outputPath, `${report}\n`);
    console.log(`Wrote ${outputPath}`);
  } finally {
    await client.end();
  }
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
