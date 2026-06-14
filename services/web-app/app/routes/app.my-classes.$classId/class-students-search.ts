export function filterClassStudentsByQuery<
  T extends { user: { name: string | null; email: string } },
>(students: T[], query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return students;

  return students.filter((student) => {
    const name = student.user.name?.toLowerCase() ?? '';
    const email = student.user.email.toLowerCase();
    return (
      name.includes(normalizedQuery) || email.includes(normalizedQuery)
    );
  });
}
