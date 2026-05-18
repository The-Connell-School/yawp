type ClassDocumentScope = {
  OR: Array<
    | { assignment: { classId: string } }
    | {
        assignmentId: null;
        studentProfile: { classes: { some: { id: string } } };
      }
    | { id: { in: string[] } }
  >;
};

export function buildClassDocumentScope(
  classId: string,
  legacyDocumentIds: string[]
): ClassDocumentScope {
  const scope: ClassDocumentScope = {
    OR: [
      { assignment: { classId } },
      {
        assignmentId: null,
        studentProfile: { classes: { some: { id: classId } } },
      },
    ],
  };

  if (legacyDocumentIds.length > 0) {
    scope.OR.push({ id: { in: legacyDocumentIds } });
  }

  return scope;
}
