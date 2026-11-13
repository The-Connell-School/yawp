/** Teacher-only documents created via assignment Try it (stored as TEACHER_ASSIGNMENT_PREVIEW). */
export function isTeacherAssignmentTestDocument(
  artifactKind: string | null | undefined
): boolean {
  return artifactKind === 'TEACHER_ASSIGNMENT_PREVIEW';
}
