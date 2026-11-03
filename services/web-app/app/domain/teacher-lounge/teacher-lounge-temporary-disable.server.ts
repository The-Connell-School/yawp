import { redirect } from 'react-router';
import {
  TEACHER_LOUNGE_DISABLED_HOME,
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
