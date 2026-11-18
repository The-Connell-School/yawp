import { redirect, type LoaderFunctionArgs } from 'react-router';
import { isLoungeCommunityEnabled } from '~/domain/feature-flags/feature-flags.server';
import { facultyLoungeTrainingsHome } from '~/domain/teacher-trainings/faculty-lounge-trainings';
import { TEACHER_LOUNGE_DISABLED_HOME } from '~/domain/teacher-lounge/teacher-lounge-temporary-disable';
import { redirectIfTeacherLoungeTemporarilyDisabled } from '~/domain/teacher-lounge/teacher-lounge-temporary-disable.server';
import { requireMembership, requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';

export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const profile = await requireMembership(request, userId);
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });
  await redirectIfTeacherLoungeTemporarilyDisabled({
    userId,
    email: user?.email ?? null,
    orgId: profile.organization.id,
  });

  if (profile.role !== 'TEACHER') {
    throw new Response('Teacher profile required', { status: 403 });
  }

  const communityEnabled = await isLoungeCommunityEnabled(profile.organization.id);
  throw redirect(
    communityEnabled
      ? facultyLoungeTrainingsHome(true)
      : TEACHER_LOUNGE_DISABLED_HOME
  );
}