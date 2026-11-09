/** Teacher prompt generator is on for every organization. */
export async function isTeacherPromptGeneratorEnabled(
  _orgId?: string | null
): Promise<boolean> {
  return true;
}

/** Reserved for compatibility; generator is always available. */
export async function teacherPromptGeneratorDisabledResponse(
  _orgId?: string | null
) {
  return null;
}
