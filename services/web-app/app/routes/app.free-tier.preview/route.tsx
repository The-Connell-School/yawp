import { redirect, type LoaderFunctionArgs } from 'react-router';
import { requireUserId } from '~/utils/auth.server';
import {
  ensureLockedPreviewClassroomForUser,
  userHasPendingFreeTierTeachingLock,
} from '~/domain/free-tier/locked-preview.server';
import { prisma } from '~/utils/db.server';

export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  if (!(await userHasPendingFreeTierTeachingLock(userId))) {
    throw redirect('/app/free-tier/pending');
  }
  await ensureLockedPreviewClassroomForUser(userId);
  const app = await prisma.freeTierApplication.findFirst({
    where: { userId },
    select: { status: true },
  });
  if (!app || !['SENT', 'MANUAL_REVIEW'].includes(app.status)) {
    throw redirect('/app/free-tier/pending');
  }
  throw redirect('/app');
}

export default function LockedPreviewRedirectRoute() {
  return null;
}
