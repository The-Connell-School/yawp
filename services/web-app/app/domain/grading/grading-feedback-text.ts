/**
 * Whether grading feedback text is visible to a teacher after trimming and
 * stripping empty rich-text shells (e.g. `<p></p>`, `&nbsp;`).
 */
export function hasMeaningfulGradingFeedbackText(
  value: string | null | undefined
): boolean {
  if (typeof value !== 'string') return false;
  const withoutTags = value
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\u00a0/g, ' ');
  return withoutTags.trim().length > 0;
}
