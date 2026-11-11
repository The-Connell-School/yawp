export function assignmentStudentLink(origin: string, assignmentId: string) {
  const base = origin.replace(/\/+$/, '');
  return `${base}/app/assignments/${assignmentId}/open`;
}
