import type { E2EPrismaClient } from '../prisma-client';

export async function waitForFreeTierEmailPayload(
  prisma: E2EPrismaClient,
  args: { applicationId: string; kind: string; timeoutMs?: number }
) {
  const deadline = Date.now() + (args.timeoutMs ?? 15_000);
  while (Date.now() < deadline) {
    const log = await prisma.freeTierEmailLog.findFirst({
      where: { applicationId: args.applicationId, kind: args.kind, success: true },
      orderBy: { createdAt: 'desc' },
      select: { payload: true },
    });
    const payload = log?.payload as Record<string, string> | null;
    if (payload && Object.keys(payload).length > 0) return payload;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Timed out waiting for FreeTierEmailLog kind=${args.kind}`);
}
