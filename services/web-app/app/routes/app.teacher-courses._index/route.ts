import { redirect, type LoaderFunctionArgs } from 'react-router';
import { TEACHER_LOUNGE_DISABLED_HOME } from '~/domain/teacher-lounge/teacher-lounge-temporary-disable';
import { isTeacherLoungeTemporarilyDisabledForUser } from '~/domain/teacher-lounge/teacher-lounge-temporary-disable.server';
import { requireMembership, requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';

export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const profile = await requireMembership(request, userId);
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });
  return redirect(
    (await isTeacherLoungeTemporarilyDisabledForUser({
      userId,
      email: user?.email ?? null,
      orgId: profile.organization.id,
    }))
      ? TEACHER_LOUNGE_DISABLED_HOME
      : '/app/teacher-trainings'
  );
}
