export type NewAssignmentPageHrefOptions = {
  assignmentTypeId?: string;
  classId?: string | null;
  prompt?: string | null;
  title?: string | null;
  first?: boolean;
};

export function buildNewAssignmentPageHref(input: NewAssignmentPageHrefOptions) {
  const params = new URLSearchParams();
  if (input.first) params.set('first', '1');
  if (input.assignmentTypeId) {
    params.set('assignmentTypeId', input.assignmentTypeId);
  }
  if (input.classId) params.set('classId', input.classId);
  const prompt = input.prompt?.trim();
  if (prompt) params.set('prompt', prompt);
  const title = input.title?.trim();
  if (title) params.set('title', title);
  const query = params.toString();
  return query ? `/app/assignments/new?${query}` : '/app/assignments/new';
}

/** @deprecated use buildNewAssignmentPageHref */
export const buildFreeTierNewAssignmentHref = buildNewAssignmentPageHref;
