export type StudentClassAssignmentTypeOrder = {
  id: string;
  title: string;
};

export type StudentClassAssignmentWithType = {
  assignment: { assignmentType: { id: string; title: string } };
};

export type StudentClassAssignmentTypeGroup<
  T extends StudentClassAssignmentWithType,
> = {
  assignmentTypeId: string;
  title: string;
  assignments: T[];
};

/**
 * Groups class assignments under assignment-type headings using the org/school
 * type order when available. Types with no assignments are omitted.
 */
export function groupStudentClassAssignmentsByType<
  T extends StudentClassAssignmentWithType,
>(
  assignments: T[],
  assignmentTypeOrder: StudentClassAssignmentTypeOrder[]
): StudentClassAssignmentTypeGroup<T>[] {
  const byTypeId = new Map<string, T[]>();
  for (const classAssignment of assignments) {
    const typeId = classAssignment.assignment.assignmentType.id;
    const bucket = byTypeId.get(typeId);
    if (bucket) bucket.push(classAssignment);
    else byTypeId.set(typeId, [classAssignment]);
  }

  const groups: StudentClassAssignmentTypeGroup<T>[] = [];
  const seen = new Set<string>();

  for (const type of assignmentTypeOrder) {
    const bucket = byTypeId.get(type.id);
    if (!bucket?.length) continue;
    seen.add(type.id);
    groups.push({
      assignmentTypeId: type.id,
      title: type.title,
      assignments: bucket,
    });
  }

  const remaining = [...byTypeId.entries()]
    .filter(([typeId]) => !seen.has(typeId))
    .sort(([, a], [, b]) =>
      a[0]!.assignment.assignmentType.title.localeCompare(
        b[0]!.assignment.assignmentType.title
      )
    );

  for (const [assignmentTypeId, bucket] of remaining) {
    groups.push({
      assignmentTypeId,
      title: bucket[0]!.assignment.assignmentType.title,
      assignments: bucket,
    });
  }

  return groups;
}
