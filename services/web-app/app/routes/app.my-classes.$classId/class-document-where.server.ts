import {
  buildClassAssignmentDocumentScope,
  buildStudentClassDocumentsScope,
} from '~/utils/class-assignment-scope.server';

type ClassDocumentScope = {
  OR: Array<
    | ReturnType<typeof buildClassAssignmentDocumentScope>
    | ReturnType<typeof buildStudentClassDocumentsScope>['OR'][number]
    | { id: { in: string[] } }
  >;
};

export function buildClassDocumentScope(
  classId: string,
  legacyDocumentIds: string[],
  options?: { membershipId?: string | null }
): ClassDocumentScope {
  const scope: ClassDocumentScope = {
    OR: options?.membershipId
      ? buildStudentClassDocumentsScope({
          classId,
          membershipId: options.membershipId,
        }).OR
      : [buildClassAssignmentDocumentScope(classId)],
  };

  if (legacyDocumentIds.length > 0) {
    scope.OR.push({ id: { in: legacyDocumentIds } });
  }

  return scope;
}
