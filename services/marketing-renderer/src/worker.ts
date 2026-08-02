import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadConfig, type RendererConfig } from './config';
import { claimNextJob, markFailed, markSucceeded, type JobStore } from './jobs';
import { renderStoryboard } from './render';
import { createS3Client, uploadRenderedFiles } from './s3';
import { storeRenderedFilesOnDisk } from './storage';

function log(message: string, extra: Record<string, unknown> = {}) {
  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify({ at: new Date().toISOString(), message, ...extra })
  );
}

export async function processNextJob(params: {
  prisma: JobStore;
  config: RendererConfig;
  s3: ReturnType<typeof createS3Client>;
}): Promise<'idle' | 'rendered' | 'failed'> {
  const job = await claimNextJob({
    prisma: params.prisma,
    workerId: params.config.workerId,
  });
  if (!job) return 'idle';

  // A job records the environment it was queued against, but the worker's own
  // configured target wins: the queue must not be able to redirect the browser.
  const baseUrl = params.config.targetUrl;
  if (job.targetUrl && new URL(job.targetUrl).origin !== baseUrl) {
    log('job target differs from worker target, using worker target', {
      jobId: job.id,
      jobTarget: job.targetUrl,
      workerTarget: baseUrl,
    });
  }

  const workDir = fs.mkdtempSync(
    path.join(os.tmpdir(), `marketing-${job.id}-`)
  );
  log('rendering', {
    jobId: job.id,
    kind: job.kind,
    slug: job.storyboard.slug,
  });

  try {
    const { files, warnings } = await renderStoryboard({
      storyboard: job.storyboard,
      kind: job.kind,
      baseUrl,
      outDir: workDir,
      loginPath: params.config.loginPath,
      chromiumPath: params.config.chromiumPath,
      ffmpegPath: params.config.ffmpegPath,
      basicAuth: params.config.basicAuth,
    });

    if (files.length === 0) {
      throw new Error('The render produced no media.');
    }

    const outputs =
      params.config.storage === 'disk'
        ? storeRenderedFilesOnDisk({
            mediaDir: params.config.mediaDir as string,
            jobId: job.id,
            files,
          })
        : await uploadRenderedFiles({
            s3: params.s3,
            bucket: params.config.bucket,
            jobId: job.id,
            files,
          });

    await markSucceeded({ prisma: params.prisma, jobId: job.id, outputs });
    log('rendered', {
      jobId: job.id,
      outputs: outputs.length,
      warnings: warnings.length,
    });
    return 'rendered';
  } catch (err) {
    await markFailed({
      prisma: params.prisma,
      jobId: job.id,
      attempts: job.attempts,
      error: err,
    });
    log('render failed', {
      jobId: job.id,
      attempt: job.attempts,
      error: err instanceof Error ? err.message : String(err),
    });
    return 'failed';
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

async function main() {
  const once = process.argv.includes('--once');
  const config = loadConfig();
  // Loaded here rather than at module scope so the job orchestration above can
  // be tested without the generated Prisma client. require() rather than
  // import: the package's exports map only resolves correctly for CJS.
  const { createRequire } = await import('node:module');
  const requireCjs = createRequire(import.meta.url);
  const { PrismaClient } = requireCjs('@app/prisma');
  const { PrismaPg } = requireCjs('@prisma/adapter-pg');
  // Prisma 7 has no built-in engine; it drives pg through the adapter, the
  // same way the web app's db.server.ts constructs its client.
  const prisma = new PrismaClient({
    adapter: new PrismaPg({
      connectionString: config.databaseUrl,
      connectionTimeoutMillis: 15_000,
      max: 2,
      ...(process.env.DATABASE_SSL_REJECT_UNAUTHORIZED === 'false'
        ? { ssl: { rejectUnauthorized: false } }
        : {}),
    }),
  }) as unknown as JobStore & {
    $disconnect: () => Promise<void>;
  };
  const s3 = createS3Client(config.region);

  log('renderer started', {
    workerId: config.workerId,
    target: config.targetUrl,
    once,
  });

  let running = true;
  const stop = () => {
    if (!running) return;
    running = false;
    log('shutting down after the current job');
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);

  try {
    do {
      const result = await processNextJob({ prisma, config, s3 });
      if (once) break;
      if (result === 'idle') {
        await new Promise((resolve) =>
          setTimeout(resolve, config.pollIntervalMs)
        );
      }
    } while (running);
  } finally {
    await prisma.$disconnect();
  }
}

if (import.meta.main) {
  main().catch((err) => {
    log('renderer crashed', {
      error: err instanceof Error ? err.message : String(err),
    });
    process.exit(1);
  });
}
