export type TeacherResetTargetUser = {
  email: string | null;
  isAdmin: boolean;
  isSuperAdmin: boolean;
};

export type TeacherResetTargetMembership = {
  role: string;
  isActive: boolean;
};

export type TeacherResetEligibilityResult =
  | { ok: true }
  | { ok: false; code: string; message: string };

export function evaluateTeacherResetHandleStudentEligibility(
  user: TeacherResetTargetUser,
  memberships: TeacherResetTargetMembership[]
): TeacherResetEligibilityResult {
  if (user.email) {
    return {
      ok: false,
      code: 'has_email',
      message: 'Password reset from the roster is only for handle-only student accounts.',
    };
  }
  if (user.isAdmin || user.isSuperAdmin) {
    return {
      ok: false,
      code: 'privileged_user',
      message: 'Cannot reset the password for this account.',
    };
  }
  const active = memberships.filter((m) => m.isActive);
  const nonStudent = active.find((m) => m.role !== 'STUDENT');
  if (nonStudent) {
    return {
      ok: false,
      code: 'non_student_membership',
      message: 'Cannot reset the password for this account.',
    };
  }
  return { ok: true };
}
