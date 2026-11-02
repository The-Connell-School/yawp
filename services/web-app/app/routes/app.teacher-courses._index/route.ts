import { redirect, type LoaderFunctionArgs } from 'react-router';
import {
  TEACHER_LOUNGE_DISABLED_HOME,
  isTeacherLoungeTemporarilyDisabledForUser,
} from '~/domain/teacher-lounge/teacher-lounge-temporary-disable';
import { requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';

export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });
  return redirect(
    isTeacherLoungeTemporarilyDisabledForUser({
      email: user?.email ?? null,
    })
      ? TEACHER_LOUNGE_DISABLED_HOME
      : '/app/teacher-trainings'
  );
}
