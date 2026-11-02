import { TEACHER_LOUNGE_TEMPORARILY_DISABLED } from '../../app/domain/teacher-lounge/teacher-lounge-temporary-disable';

/** Shared with app routes — skip Lounge e2e while the prod hotfix flag is on. */
export const teacherLoungeE2eSkipped = TEACHER_LOUNGE_TEMPORARILY_DISABLED;

export const teacherLoungeE2eSkipReason =
  "Teacher's Lounge is temporarily disabled (TEACHER_LOUNGE_TEMPORARILY_DISABLED)";
