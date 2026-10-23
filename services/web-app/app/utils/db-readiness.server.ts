export const DB_READINESS_TIMEOUT_MS = 2_000;

export async function isDatabaseReady(): Promise<boolean> {
  try {
    const { prisma } = await import('~/utils/db.server');
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise<never>((_, reject) => {
        setTimeout(
          () => reject(new Error('database readiness timeout')),
          DB_READINESS_TIMEOUT_MS
        );
      }),
    ]);
    return true;
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
