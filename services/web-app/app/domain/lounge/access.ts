/**
 * Who may use the Teacher's Lounge community. Teachers with an active
 * membership at a school the flag is on for; the Yawp team (admins) always,
 * as staff. Students never.
 */
export function decideLoungeAccess(params: {
  role: 'TEACHER' | 'STUDENT' | string | null | undefined;
  isActive: boolean;
  isAdmin: boolean;
  flagOn: boolean;
}): { allowed: boolean; isStaff: boolean } {
  if (params.isAdmin) return { allowed: true, isStaff: true };
  const allowed = params.role === 'TEACHER' && params.isActive && params.flagOn;
  return { allowed, isStaff: false };
}
