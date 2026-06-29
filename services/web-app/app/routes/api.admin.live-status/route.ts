import { data, type LoaderFunctionArgs } from 'react-router';
import { requireAdmin } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';

type DatabaseHealth =
  | {
      status: 'ok';
      latencyMs: number;
    }
  | {
      status: 'error';
      latencyMs: number;
      error: string;
    };

function nowMs() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function roundMegabytes(bytes: number) {
  return Math.round((bytes / 1024 / 1024) * 10) / 10;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  return 'Unknown database error';
}

async function checkDatabase(): Promise<DatabaseHealth> {
  const startedAt = nowMs();

  try {
    await prisma.$queryRaw`SELECT 1`;
    return {
      status: 'ok',
      latencyMs: Math.round(nowMs() - startedAt),
    };
  } catch (error) {
    return {
      status: 'error',
      latencyMs: Math.round(nowMs() - startedAt),
      error: getErrorMessage(error),
    };
  }
}

export async function loader({ request }: LoaderFunctionArgs) {
  await requireAdmin(request);

  const database = await checkDatabase();
  const memory = process.memoryUsage();

  return data(
    {
      status: database.status === 'ok' ? 'ok' : 'degraded',
      serverTime: new Date().toISOString(),
      runtime: {
        uptimeSeconds: Math.round(process.uptime()),
        nodeVersion: process.version,
        memory: {
          rssMb: roundMegabytes(memory.rss),
          heapUsedMb: roundMegabytes(memory.heapUsed),
          heapTotalMb: roundMegabytes(memory.heapTotal),
        },
      },
      database,
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
