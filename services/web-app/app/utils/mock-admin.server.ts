import { requireUserId } from './auth.server';
import { prisma } from './db.server';
import { mockAdminEnvironment } from './mock-admin-environment';
import { requireFreeTierEnabled } from './free-tier/free-tier-feature-gate.server';

export function isMockAdminEnabled() {
  return (
    process.env.MOCK_ADMIN_ENABLED === 'true' &&
    isMockAdminRuntimeAllowed(process.env)
  );
}

export function isMockAdminRuntimeAllowed(env: {
  PREVIEW_SLUG?: string;
  YAWP_ENVIRONMENT?: string;
  NODE_ENV?: string;
}) {
  const previewSlug = env.PREVIEW_SLUG?.trim().toLowerCase();
  const yawpEnvironment = env.YAWP_ENVIRONMENT?.trim().toLowerCase();
  const nodeEnv = env.NODE_ENV?.trim().toLowerCase();
  if (previewSlug === 'demo') return true;
  if (yawpEnvironment === 'production') return false;
  return nodeEnv !== 'production';
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
    environment: mockAdminEnvironment(process.env),
  };
}
