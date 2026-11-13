export function isTeacherAssignmentPreviewSelfGrading(params: {
  artifactKind: string | null | undefined;
  viewerMembershipId: string;
  viewerRole: string;
  documentOwnerMembershipId: string | null | undefined;
  previewClassTeacherMembershipIds: readonly string[];
}): boolean {
  return (
    params.artifactKind === 'TEACHER_ASSIGNMENT_PREVIEW' &&
    params.viewerRole === 'TEACHER' &&
    params.documentOwnerMembershipId != null &&
    params.viewerMembershipId === params.documentOwnerMembershipId &&
    params.previewClassTeacherMembershipIds.includes(params.viewerMembershipId)
  );
}
