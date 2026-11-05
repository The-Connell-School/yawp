import { isTeacherLoungeGloballyDisabledForE2e } from '../../app/domain/teacher-lounge/teacher-lounge-temporary-disable.server';

/** Shared with app routes — skip Lounge e2e while the flag is not on for everyone. */
export async function teacherLoungeE2eSkipped() {
  return isTeacherLoungeGloballyDisabledForE2e();
}

export const teacherLoungeE2eSkipReason =
  "Teacher's Lounge is temporarily disabled (teacher-lounge feature flag not everyone)";
