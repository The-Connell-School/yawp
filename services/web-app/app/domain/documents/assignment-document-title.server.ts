/**
 * Class-assignment documents use the teacher's assignment title as the
 * document and submission name so students never invent a separate title.
 */
export function assignmentDocumentTitleFromAssignment(
  assignmentTitle: string | null | undefined
): string {
  return assignmentTitle?.trim() ?? '';
}

export async function loadAssignmentTitleForDocumentBinding(
  db: {
    assignment: {
      findUnique: (args: {
        where: { id: string };
        select: { title: true };
      }) => Promise<{ title: string | null } | null>;
    };
    classAssignment: {
      findUnique: (args: {
        where: { id: string };
        select: { assignment: { select: { title: true } } };
      }) => Promise<{ assignment: { title: string | null } } | null>;
    };
  },
  input: {
    assignmentId?: string | null;
    classAssignmentId?: string | null;
  }
): Promise<string> {
  if (input.classAssignmentId) {
    const row = await db.classAssignment.findUnique({
      where: { id: input.classAssignmentId },
      select: { assignment: { select: { title: true } } },
    });
    if (row) {
      return assignmentDocumentTitleFromAssignment(row.assignment.title);
    }
  }
  if (input.assignmentId) {
    const row = await db.assignment.findUnique({
      where: { id: input.assignmentId },
      select: { title: true },
    });
    if (row) {
      return assignmentDocumentTitleFromAssignment(row.title);
    }
  }
  return '';
}