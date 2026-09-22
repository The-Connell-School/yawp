export function filterClassAssignmentsByQuery<
  T extends {
    title: string | null;
    assignmentType: { title: string } | null;
  },
>(assignments: T[], query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return assignments;

  return assignments.filter((assignment) => {
    const title = assignment.title?.toLowerCase() ?? '';
    const typeTitle = assignment.assignmentType?.title.toLowerCase() ?? '';
    return title.includes(normalizedQuery) || typeTitle.includes(normalizedQuery);
  });
}
