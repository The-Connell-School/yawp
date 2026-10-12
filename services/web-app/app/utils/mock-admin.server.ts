import { requireUserId } from './auth.server';
import { prisma } from './db.server';
import { requireFreeTierEnabled } from './free-tier/free-tier-feature-gate.server';

export function isMockAdminEnabled() {
  return process.env.MOCK_ADMIN_ENABLED === 'true';
}

export async function canUseMockAdmin(userId: string) {
  if (!isMockAdminEnabled()) return false;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { mockAdminGranted: true },
  });
  return user?.mockAdminGranted === true;
}

export async function requireMockAdmin(request: Request) {
  if (!isMockAdminEnabled()) throw new Response('Not found', { status: 404 });
  const id = await requireUserId(request);
  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, email: true, mockAdminGranted: true },
  });
  if (!user?.mockAdminGranted || !user.email)
    throw new Response('Forbidden', { status: 403 });
  await requireFreeTierEnabled();
  return {
    actorUserId: user.id,
    actorEmail: user.email,
    environment:
      process.env.PREVIEW_SLUG === 'demo'
        ? 'demo'
        : process.env.YAWP_ENVIRONMENT || process.env.NODE_ENV || 'development',
  };
}
