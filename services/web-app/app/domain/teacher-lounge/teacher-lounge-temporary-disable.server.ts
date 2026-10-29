import { redirect } from 'react-router';
import {
  TEACHER_LOUNGE_DISABLED_HOME,
  TEACHER_LOUNGE_TEMPORARILY_DISABLED,
} from './teacher-lounge-temporary-disable';

export function redirectIfTeacherLoungeTemporarilyDisabled() {
  if (TEACHER_LOUNGE_TEMPORARILY_DISABLED) {
    throw redirect(TEACHER_LOUNGE_DISABLED_HOME);
  }
}
