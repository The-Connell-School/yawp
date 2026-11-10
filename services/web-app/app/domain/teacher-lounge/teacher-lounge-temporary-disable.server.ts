import { redirect } from 'react-router';
import { isOnAccessList } from '~/domain/access-lists/access-lists.server';
import { TEACHER_LOUNGE_ACCESS_LIST_KEY } from '~/domain/access-lists/access-lists';
import { TEACHER_LOUNGE_DISABLED_HOME } from './teacher-lounge-temporary-disable';

export async function isTeacherLoungeTemporarilyDisabledForUser({
  userId,
  email,
}: {
  userId?: string | null;
  email?: string | null;
  orgId?: string | null;
}): Promise<boolean> {
  if (
    await isOnAccessList(TEACHER_LOUNGE_ACCESS_LIST_KEY, {
      userId,
      email,
    })
  ) {
    return false;
  }
  return true;
}

export async function redirectIfTeacherLoungeTemporarilyDisabled(input: {
  userId?: string | null;
  email?: string | null;
  orgId?: string | null;
}) {
  if (await isTeacherLoungeTemporarilyDisabledForUser(input)) {
    throw redirect(TEACHER_LOUNGE_DISABLED_HOME);
  }
}

/** Lounge e2e runs only for users on the access list (no feature flag). */
export async function isTeacherLoungeGloballyDisabledForE2e(): Promise<boolean> {
  return true;
}
