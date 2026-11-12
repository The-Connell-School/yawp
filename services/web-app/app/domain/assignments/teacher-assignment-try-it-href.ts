export function buildAssignmentTryItHref(
  assignment: { id: string; classId?: string | null },
  opts?: { returnTo?: string }
) {
  const params = new URLSearchParams();
  if (assignment.classId) params.set('classId', assignment.classId);
  if (opts?.returnTo?.startsWith('/app')) {
    params.set('returnTo', opts.returnTo);
  }
  const qs = params.toString();
  return `/app/assignments/${assignment.id}/try-it${qs ? `?${qs}` : ''}`;
}
