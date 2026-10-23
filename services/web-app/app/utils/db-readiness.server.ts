export const DB_READINESS_TIMEOUT_MS = 2_000;
export const DB_READINESS_CACHE_MS = 2_000;

let cached: { expiresAt: number; ready: boolean } | null = null;
let inFlight: Promise<boolean> | null = null;

async function probeDatabaseReady(): Promise<boolean> {
  try {
    const { prisma } = await import('~/utils/db.server');
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        prisma.$queryRaw`SELECT 1`,
        new Promise<never>((_, reject) => {
          timeoutId = setTimeout(
            () => reject(new Error('database readiness timeout')),
            DB_READINESS_TIMEOUT_MS
          );
        }),
      ]);
      return true;
    } finally {
      if (timeoutId !== undefined) clearTimeout(timeoutId);
    }
  } catch (error: unknown) {
    let kind = 'unknown';
    if (error instanceof Error) {
      kind =
        error.message === 'database readiness timeout' ? 'timeout' : error.name;
    }
    console.error('[readyz] database check failed', { kind });
    return false;
  }
}

export async function isDatabaseReady(): Promise<boolean> {
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return cached.ready;
  }
  if (inFlight) {
    return inFlight;
  }

  inFlight = (async () => {
    const ready = await probeDatabaseReady();
    cached = { ready, expiresAt: Date.now() + DB_READINESS_CACHE_MS };
    return ready;
  })();

  try {
    return await inFlight;
  } finally {
    inFlight = null;
  }
}

export function resetDatabaseReadinessCacheForTests() {
  cached = null;
  inFlight = null;
}
