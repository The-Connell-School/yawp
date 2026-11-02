import { redirect } from 'react-router';
import { isTeacherLoungeCommunityEnabled } from '~/domain/feature-flags/feature-flags.server';
import {
  TEACHER_LOUNGE_DISABLED_HOME,
  TEACHER_LOUNGE_TEMPORARILY_DISABLED,
  isTeacherLoungeTemporarilyDisabledForUser,
} from './teacher-lounge-temporary-disable';

export function redirectIfTeacherLoungeTemporarilyDisabled({
  email,
}: {
  email: string | null | undefined;
}) {
  if (isTeacherLoungeTemporarilyDisabledForUser({ email })) {
    throw redirect(TEACHER_LOUNGE_DISABLED_HOME);
  }
}

/** Allows teacher-training URLs when the community forum flag is on for the school. */
export async function redirectIfTeacherLoungeTemporarilyDisabledForOrg(
  organizationId: string | null | undefined,
  {
    email,
  }: {
    email?: string | null;
  } = {},
) {
  if (!TEACHER_LOUNGE_TEMPORARILY_DISABLED) return;
  if (!isTeacherLoungeTemporarilyDisabledForUser({ email })) return;
  if (await isTeacherLoungeCommunityEnabled(organizationId)) return;
  throw redirect(TEACHER_LOUNGE_DISABLED_HOME);
}
