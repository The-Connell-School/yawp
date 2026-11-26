// Every way into creating an exit ticket ends in the same builder (Brian,
// Nov 25). The generic new-assignment page cannot build one, so it sends the
// teacher to the Exit Ticket page with the builder already open.

/** On an assignment type page, `?new=1` opens the creation sheet once. */
export const NEW_ASSIGNMENT_PARAM = 'new';

export function exitTicketBuilderHref(
  assignmentTypeId: string,
  classId?: string | null
): string {
  const params = new URLSearchParams({ [NEW_ASSIGNMENT_PARAM]: '1' });
  if (classId) params.set('classId', classId);
  return `/app/assignment-types/${encodeURIComponent(assignmentTypeId)}?${params}`;
}
