import { redirect, type LoaderFunctionArgs } from 'react-router';
import { TEACHER_LOUNGE_DISABLED_HOME } from '~/domain/teacher-lounge/teacher-lounge-temporary-disable';
import { requireMembership, requireUserId } from '~/utils/auth.server';

export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  await requireMembership(request, userId);
  return redirect(TEACHER_LOUNGE_DISABLED_HOME);
}