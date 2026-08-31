export type TeacherDocumentWorkFilterOption = {
  id: string;
  label: string;
  membershipIds?: string[];
  classId?: string;
  classIds?: string[];
  latestCreatedAt?: number;
};

export function parseDocumentWorkFilterIds(
  value: string | null | undefined
): string[] {
  if (!value || value === 'all') return [];

  return value
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
}

export function serializeDocumentWorkFilterIds(ids: string[]): string | null {
  const uniqueIds = [...new Set(ids.filter(Boolean))].sort();
  if (uniqueIds.length === 0) return null;
  return uniqueIds.join(',');
}

export function dedupeFilterOptionsById<T extends { id: string }>(
  options: T[]
): T[] {
  return Array.from(
    new Map(options.map((option) => [option.id, option])).values()
  );
}

function studentFilterLabel(membership: {
  user: { name: string | null; email: string };
}) {
  return (
    membership.user.name?.trim() || membership.user.email || 'Unknown student'
  );
}

export function buildStudentFilterOptionsFromDocuments(
  documents: Array<{
    membership: {
      id: string;
      user: { id?: string; name: string | null; email: string };
    };
    group?: {
      members: Array<{
        membershipId: string;
        membership: {
          id: string;
          user: { id?: string; name: string | null; email: string };
        };
      }>;
    } | null;
  }>
): TeacherDocumentWorkFilterOption[] {
  const byUserKey = new Map<
    string,
    {
      id: string;
      label: string;
      email: string;
      membershipIds: Set<string>;
    }
  >();

  for (const document of documents) {
    const participants = document.group?.members.map(
      (row) => row.membership
    ) ?? [document.membership];
    for (const participant of participants) {
      const userKey = participant.user.id ?? participant.id;
      const label = studentFilterLabel(participant);
      const existing = byUserKey.get(userKey);

      if (existing) {
        existing.membershipIds.add(participant.id);
        continue;
      }

      byUserKey.set(userKey, {
        id: userKey,
        label,
        email: participant.user.email,
        membershipIds: new Set([participant.id]),
      });
    }
  }

  const students = Array.from(byUserKey.values()).map(
    ({ id, label, email, membershipIds }) => ({
      id,
      label,
      email,
      membershipIds: [...membershipIds],
    })
  );

  const labelCounts = new Map<string, number>();
  for (const student of students) {
    labelCounts.set(student.label, (labelCounts.get(student.label) ?? 0) + 1);
  }

  return students
    .map(({ email, ...student }) => ({
      id: student.id,
      label:
        (labelCounts.get(student.label) ?? 0) > 1
          ? `${student.label} (${email})`
          : student.label,
      membershipIds: student.membershipIds,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function studentMatchesStudentFilters(
  document: {
    membership: {
      id: string;
      user: { id?: string };
    };
    group?: {
      members: Array<{
        membershipId: string;
        membership: { id: string; user: { id?: string } };
      }>;
    } | null;
  },
  selectedStudentIds: string[],
  studentOptions: TeacherDocumentWorkFilterOption[] = []
) {
  if (selectedStudentIds.length === 0) return true;

  const participants = document.group?.members.map((row) => row.membership) ?? [
    document.membership,
  ];

  if (
    participants.some(
      (participant) =>
        selectedStudentIds.includes(participant.id) ||
        Boolean(
          participant.user.id &&
          selectedStudentIds.includes(participant.user.id)
        )
    )
  ) {
    return true;
  }

  for (const option of studentOptions) {
    if (!selectedStudentIds.includes(option.id)) continue;
    if (
      participants.some((participant) =>
        option.membershipIds?.includes(participant.id)
      )
    ) {
      return true;
    }
  }

  return false;
}

export function dedupeAssignmentFilterOptions(
  assignments: Array<{
    id: string;
    label: string;
    classId?: string;
    createdAt?: Date | string | number;
  }>
): TeacherDocumentWorkFilterOption[] {
  const byId = new Map<
    string,
    {
      id: string;
      label: string;
      classIds: Set<string>;
      latestCreatedAt: number;
    }
  >();

  for (const assignment of assignments) {
    const createdAtMs = assignment.createdAt
      ? new Date(assignment.createdAt).getTime()
      : 0;
    const existing = byId.get(assignment.id);

    if (existing) {
      if (assignment.classId) {
        existing.classIds.add(assignment.classId);
      }
      existing.latestCreatedAt = Math.max(
        existing.latestCreatedAt,
        createdAtMs
      );
      continue;
    }

    byId.set(assignment.id, {
      id: assignment.id,
      label: assignment.label,
      classIds: new Set(assignment.classId ? [assignment.classId] : []),
      latestCreatedAt: createdAtMs,
    });
  }

  return Array.from(byId.values())
    .map(({ classIds, id, label, latestCreatedAt }) => {
      const classIdList = [...classIds];
      return {
        id,
        label,
        classIds: classIdList,
        classId: classIdList[0],
        latestCreatedAt,
      };
    })
    .sort((a, b) => {
      const createdAtDiff = (b.latestCreatedAt ?? 0) - (a.latestCreatedAt ?? 0);
      if (createdAtDiff !== 0) return createdAtDiff;
      return a.label.localeCompare(b.label);
    });
}

export function assignmentMatchesClassFilter(
  assignment: TeacherDocumentWorkFilterOption,
  classId: string
) {
  return (
    assignment.classId === classId ||
    assignment.classIds?.includes(classId) === true
  );
}

export function assignmentMatchesClassFilters(
  assignment: TeacherDocumentWorkFilterOption,
  classIds: string[]
) {
  if (classIds.length === 0) return true;
  return classIds.some((classId) =>
    assignmentMatchesClassFilter(assignment, classId)
  );
}
