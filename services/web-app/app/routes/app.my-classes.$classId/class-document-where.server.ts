import {
  buildClassStudentWorkOnAssignmentBranches,
  buildEnrolledClassDocumentsScope,
  buildStudentClassDocumentsScope,
} from '~/utils/class-assignment-scope';

type ClassDocumentScope = {
  OR: Array<
    | ReturnType<typeof buildClassStudentWorkOnAssignmentBranches>[number]
    | ReturnType<typeof buildEnrolledClassDocumentsScope>['OR'][number]
    | ReturnType<typeof buildStudentClassDocumentsScope>['OR'][number]
    | { id: { in: string[] } }
  >;
};

export function buildClassDocumentScope(
  classId: string,
  legacyDocumentIds: string[],
  options?: {
    membershipId?: string | null;
    enrolledMembershipIds?: string[];
    schoolYear: string;
  }
): ClassDocumentScope {
  const schoolYear = options?.schoolYear ?? '';
  const scope: ClassDocumentScope = {
    OR: options?.membershipId
      ? buildStudentClassDocumentsScope({
          classId,
          membershipId: options.membershipId,
          schoolYear,
        }).OR
      : buildEnrolledClassDocumentsScope(
          classId,
          options?.enrolledMembershipIds ?? [],
          schoolYear
        ).OR,
  };

  if (legacyDocumentIds.length > 0) {
    scope.OR.push({ id: { in: legacyDocumentIds } });
  }

  return scope;
}
