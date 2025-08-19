import { type ActionFunctionArgs, data as dataResponse } from 'react-router';
import { prisma } from '~/utils/db.server';

function assertInternalToken(request: Request) {
  const token =
    new URL(request.url).searchParams.get('token') ||
    request.headers.get('x-internal-token');
  if (!token || token !== process.env.INTERNAL_COMMAND_TOKEN) {
    return false;
  }
  return true;
}

export async function loader({ request }: ActionFunctionArgs) {
  if (!assertInternalToken(request)) {
    return new Response('Unauthorized', { status: 401 });
  }

  const now = new Date();
  const oneDay = 24 * 60 * 60 * 1000;
  const cutoffVersions = new Date(now.getTime() - 3 * oneDay);
  const cutoffSnapshots = new Date(now.getTime() - 90 * oneDay);

  const [versionsResult, snapshotsResult] = await Promise.all([
    prisma.documentVersion.deleteMany({
      where: { createdAt: { lt: cutoffVersions } },
    }),
    prisma.documentSnapshot.deleteMany({
      where: { createdAt: { lt: cutoffSnapshots } },
    }),
  ]);

  return dataResponse({
    deletedVersions: versionsResult.count,
    deletedSnapshots: snapshotsResult.count,
  });
}

export const action = loader;
