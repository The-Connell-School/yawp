type SchoolScopedClass = {
  schoolId: string | null;
};

type DocumentSubmissionScope = {
  assignment?: {
    class?: SchoolScopedClass | null;
  } | null;
  studentProfile?: {
    classes?: SchoolScopedClass[];
  } | null;
};

export function getDocumentSubmissionSchoolIds(
  document: DocumentSubmissionScope
): string[] {
  const assignmentSchoolId = document.assignment?.class?.schoolId;
  if (assignmentSchoolId) {
    return [assignmentSchoolId];
  }

  return Array.from(
    new Set(
      document.studentProfile?.classes
        ?.map((klass) => klass.schoolId)
        .filter((schoolId): schoolId is string => Boolean(schoolId)) ?? []
    )
  );
}
