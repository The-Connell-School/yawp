import { redirect } from 'react-router';
import {
  TEACHER_LOUNGE_DISABLED_HOME,
  TEACHER_LOUNGE_TEMPORARILY_DISABLED,
} from '~/domain/teacher-lounge/teacher-lounge-temporary-disable';

export function loader() {
  return redirect(
    TEACHER_LOUNGE_TEMPORARILY_DISABLED
      ? TEACHER_LOUNGE_DISABLED_HOME
      : '/app/teacher-trainings'
  );
}
