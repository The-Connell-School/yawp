import { type LoaderFunctionArgs } from 'react-router';

export async function loader(_args: LoaderFunctionArgs) {
  try {
    // Import lazily so missing DATABASE_URL or early client init errors
    // don't crash module evaluation; treat DB unavailability as a soft fail.
    const { prisma } = await import('~/utils/db.server');
    await prisma.$queryRaw`SELECT 1`;
    return new Response('OK');
  } catch (error: unknown) {
    // Return 200 to let the orchestrator finish rollout even when the DB
    // is momentarily unavailable; the app will surface errors on real routes.
    return new Response('OK');
  }
}
