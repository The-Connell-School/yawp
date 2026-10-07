export function filterClassStudentsByQuery<
  T extends {
    user: { name: string | null; email: string | null; username?: string | null };
  },
>(students: T[], query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return students;

  return students.filter((student) => {
    const name = student.user.name?.toLowerCase() ?? '';
    const email = student.user.email?.toLowerCase() ?? '';
    const username = student.user.username?.toLowerCase() ?? '';
    const handle = username ? `@${username}` : '';
    return (
      name.includes(normalizedQuery) ||
      email.includes(normalizedQuery) ||
      handle.includes(normalizedQuery) ||
      username.includes(normalizedQuery)
    );
  });
}
