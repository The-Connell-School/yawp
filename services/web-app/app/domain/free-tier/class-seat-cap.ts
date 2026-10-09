import {
  FREE_CLASSROOM_STUDENT_SEAT_CAP,
  getEntitlementsForPlan,
} from '~/utils/entitlements.server';

export const FREE_CLASS_CLASS_FULL_MESSAGE =
  'This class is full. Ask your teacher for help.';

export function canAddStudentToFreeClass(params: {
  currentStudents: number;
  pendingInvites?: number;
}) {
  return getEntitlementsForPlan('FREE_CLASSROOM').canAddStudent(params);
}

export { FREE_CLASSROOM_STUDENT_SEAT_CAP };
