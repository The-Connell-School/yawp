/** Teachers assign work from this page; students still see their documents here. */
export function showAssignmentTypeDocumentsSection(
  membershipRole: string | null | undefined
): boolean {
  return membershipRole !== 'TEACHER';
}

/** Labels for the teacher New menu on non–AP History assignment type pages. */
export function teacherAssignmentTypeNewMenuItems(options: {
  showAnyPromptGenerator: boolean;
}): string[] {
  const items = ['Assignment'];
  if (options.showAnyPromptGenerator) {
    items.push('Generate a prompt');
  }
  return items;
}
