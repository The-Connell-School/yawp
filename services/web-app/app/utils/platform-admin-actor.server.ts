import { prisma } from '~/utils/db.server';
import { requireUserId } from '~/utils/auth.server';

export async function resolvePlatformAdminActorEmail(request: Request) {
  const userId = await requireUserId(request);
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });
  return user?.email ?? null;
}
