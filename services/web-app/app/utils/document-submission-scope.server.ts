type SchoolScopedClass = {
  id?: string | null;
  schoolId: string | null;
  school?: { organizationId?: string | null } | null;
  teachers?: Array<{ id: string | null }>;
};

type DocumentSubmissionClassScope = {
  schoolId: string | null;
  organizationId?: string | null;
  classId?: string | null;
  teacherProfileIds: string[];
};

type DocumentSubmissionScope = {
  assignment?: {
    class?: SchoolScopedClass | null;
  } | null;
  studentProfile?: {
    classes?: SchoolScopedClass[];
  } | null;
};

function distinctIds(ids: Array<string | null | undefined>): string[] {
  return Array.from(new Set(ids.filter((id): id is string => Boolean(id))));
}

export function getDocumentSubmissionSchoolIds(
  document: DocumentSubmissionScope
): string[] {
  return getDocumentSubmissionScope(document).schoolIds;
}

export function getDocumentSubmissionScope(document: DocumentSubmissionScope): {
  schoolIds: string[];
  organizationIds: string[];
  classIds: string[];
  teacherProfileIds: string[];
  classScopes: DocumentSubmissionClassScope[];
} {
  const assignmentClass = document.assignment?.class;
  if (assignmentClass) {
    const teacherProfileIds = distinctIds(
      assignmentClass.teachers?.map((teacher) => teacher.id) ?? []
    );

    return {
      schoolIds: distinctIds([assignmentClass.schoolId]),
      organizationIds: distinctIds([assignmentClass.school?.organizationId]),
      classIds: distinctIds([assignmentClass.id]),
      teacherProfileIds,
      classScopes: [
        {
          schoolId: assignmentClass.schoolId,
          organizationId: assignmentClass.school?.organizationId,
          classId: assignmentClass.id,
          teacherProfileIds,
        },
      ],
    };
  }

  const classes = document.studentProfile?.classes ?? [];

  return {
    schoolIds: distinctIds(classes.map((klass) => klass.schoolId)),
    organizationIds: distinctIds(
      classes.map((klass) => klass.school?.organizationId)
    ),
    classIds: distinctIds(classes.map((klass) => klass.id)),
    teacherProfileIds: distinctIds(
      classes.flatMap((klass) =>
        (klass.teachers ?? []).map((teacher) => teacher.id)
      )
    ),
    classScopes: classes.map((klass) => ({
      schoolId: klass.schoolId,
      organizationId: klass.school?.organizationId,
      classId: klass.id,
      teacherProfileIds: distinctIds(
        (klass.teachers ?? []).map((teacher) => teacher.id)
      ),
    })),
  };
}
