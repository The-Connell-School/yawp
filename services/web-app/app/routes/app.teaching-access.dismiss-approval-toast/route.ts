import { type ActionFunctionArgs } from 'react-router';
import { requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import { markTeachingAccessApprovalToastSeen } from '~/domain/free-tier/teaching-access-shell.server';
import { isFeatureFlagEnabled } from '~/domain/feature-flags/feature-flags.server';
import { FREE_TIER_FLAG } from '~/domain/feature-flags/feature-flags';

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return new Response(null, { status: 405 });
  }
  const userId = await requireUserId(request);
  if (!(await isFeatureFlagEnabled(FREE_TIER_FLAG))) {
    return new Response(null, { status: 404 });
  }
  const application = await prisma.freeTierApplication.findFirst({
    where: { userId, status: 'APPROVED' },
    select: { id: true },
  });
  if (!application) {
    return new Response(null, { status: 404 });
  }
  await markTeachingAccessApprovalToastSeen(application.id);
  return new Response(null, { status: 204 });
}
