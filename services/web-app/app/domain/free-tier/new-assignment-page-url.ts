export function buildFreeTierNewAssignmentHref(input: {
  assignmentTypeId: string;
  classId?: string | null;
  prompt?: string | null;
  first?: boolean;
}) {
  const params = new URLSearchParams();
  if (input.first) params.set('first', '1');
  params.set('assignmentTypeId', input.assignmentTypeId);
  if (input.classId) params.set('classId', input.classId);
  const prompt = input.prompt?.trim();
  if (prompt) params.set('prompt', prompt);
  return `/app/assignments/new?${params.toString()}`;
}
