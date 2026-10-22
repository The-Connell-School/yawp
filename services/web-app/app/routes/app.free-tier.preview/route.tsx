import { redirect, type LoaderFunctionArgs } from 'react-router';
import { requireUserId } from '~/utils/auth.server';
import {
  ensureLockedPreviewClassroomForUser,
  userHasPendingFreeTierTeachingLock,
} from '~/domain/free-tier/locked-preview.server';
import { prisma } from '~/utils/db.server';
import { requireFreeTierEnabled } from '~/utils/free-tier/free-tier-feature-gate.server';

function redirectToPending() {
  throw redirect('/app/free-tier/pending');
}

export async function loader({ request }: LoaderFunctionArgs) {
  await requireFreeTierEnabled();
  const userId = await requireUserId(request);
  if (!(await userHasPendingFreeTierTeachingLock(userId))) {
    redirectToPending();
  }
  const app = await prisma.freeTierApplication.findFirst({
    where: { userId },
    select: { status: true },
  });
  if (!app || !['SENT', 'MANUAL_REVIEW'].includes(app.status)) {
    redirectToPending();
  }
  let provision: Awaited<
    ReturnType<typeof ensureLockedPreviewClassroomForUser>
  > = null;
  try {
    provision = await ensureLockedPreviewClassroomForUser(userId);
  } catch (error) {
    if (error instanceof Response) throw error;
    redirectToPending();
  }
  if (
    provision &&
    provision.status !== 'provisioned' &&
    provision.status !== 'already_provisioned'
  ) {
    redirectToPending();
  }
  throw redirect('/app');
}

export default function LockedPreviewRedirectRoute() {
  return null;
}
