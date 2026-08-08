import { requireAdmin, requireMembership } from '~/utils/auth.server';
import { isIsolatedPreviewSeatMode } from '~/utils/preview-access.server';

/** Shared page/resource access gate for this preview-only admin feature. */
export async function requireSeedGeneratorAccess(request: Request) {
  const admin = await requireAdmin(request);
  if (!isIsolatedPreviewSeatMode()) {
    throw new Response('Not found', { status: 404 });
  }
  const membership = await requireMembership(request, admin.id);
  return { admin, membership };
}
