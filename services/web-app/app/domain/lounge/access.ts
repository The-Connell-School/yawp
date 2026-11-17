/**
 * Who may use the Teacher's Lounge community. Active teachers at a school
 * where `teacher_lounge_community` is on; Yawp team accounts post as staff
 * when the flag is on for their school. Students never. The flag alone gates
 * access—there is no admin bypass when it is off.
 */
export function decideLoungeAccess(params: {
  role: 'TEACHER' | 'STUDENT' | string | null | undefined;
  isActive: boolean;
  isAdmin: boolean;
  flagOn: boolean;
}): { allowed: boolean; isStaff: boolean } {
  const allowed = params.role === 'TEACHER' && params.isActive && params.flagOn;
  return { allowed, isStaff: allowed && params.isAdmin };
}
