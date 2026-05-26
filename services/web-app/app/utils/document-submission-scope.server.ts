type SchoolScopedClass = {
  id?: string | null;
  schoolId: string | null;
  teachers?: Array<{ id: string | null }>;
};

type DocumentSubmissionClassScope = {
  schoolId: string | null;
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
      classIds: distinctIds([assignmentClass.id]),
      teacherProfileIds,
      classScopes: [
        {
          schoolId: assignmentClass.schoolId,
          classId: assignmentClass.id,
          teacherProfileIds,
        },
      ],
    };
  }

  const classes = document.studentProfile?.classes ?? [];

  return {
    schoolIds: distinctIds(classes.map((klass) => klass.schoolId)),
    classIds: distinctIds(classes.map((klass) => klass.id)),
    teacherProfileIds: distinctIds(
      classes.flatMap((klass) =>
        (klass.teachers ?? []).map((teacher) => teacher.id)
      )
    ),
    classScopes: classes.map((klass) => ({
      schoolId: klass.schoolId,
      classId: klass.id,
      teacherProfileIds: distinctIds(
        (klass.teachers ?? []).map((teacher) => teacher.id)
      ),
    })),
  };
}
