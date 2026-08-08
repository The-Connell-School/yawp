export type ParseAssignmentTutorEnabledResult =
  | { success: true; value: boolean }
  | { success: false; message: string };

/**
 * Parses the per-assignment tutor toggle from create/edit assignment form
 * data. Defaults to `true` (tutor enabled) when the field is absent, which
 * preserves today's behavior for existing assignments and any form that
 * doesn't render the toggle.
 */
export function parseAssignmentTutorEnabled(
  formData: FormData
): ParseAssignmentTutorEnabledResult {
  const values = formData
    .getAll('tutorEnabled')
    .map((value) => value.toString().trim().toLowerCase())
    .filter(Boolean);
  const raw = values.at(-1);

  if (!raw) return { success: true, value: true };
  if (['true', 'on', '1', 'yes'].includes(raw)) {
    return { success: true, value: true };
  }
  if (['false', 'off', '0', 'no'].includes(raw)) {
    return { success: true, value: false };
  }

  return {
    success: false,
    message: 'Tutor enabled value is invalid.',
  };
}
