/**
 * Teacher Notes are document observations, not an authorship detector. Keep
 * this contract in the shared prompt so every rubric that opts in gets the
 * same conservative behavior.
 */
export const TEACHER_NOTES_EVIDENCE_RULE = [
  'Teacher Note rules:',
  '- Use only observable features of the supplied document and supplied context.',
  '- Look for internal inconsistencies such as abrupt shifts in vocabulary, register, specificity, formatting, citation style, or level of detail across sections.',
  '- Describe where the contrast occurs and what is different; do not infer why it occurred.',
  '- It is acceptable to say that one passage is substantially more advanced or specific than another when the text itself supports that comparison.',
  '- Do not claim or suggest that AI, plagiarism, copying, or another person wrote the work.',
  '- Do not assign probabilities, make misconduct accusations, recommend discipline, change a score, or penalize suspicion.',
  '- Do not compare against the student’s usual writing unless comparison writing is explicitly supplied.',
  '- Never mention grammar, spelling, syntax, or organization as a grading judgment.',
  '- Never evaluate whether the content is correct; this is an engagement judgment, not a correctness judgment.',
  '- Feedback is 1–3 warm sentences; do not turn the private note into student-facing feedback.',
  '- If an entry appears pasted or unlike the student’s own register, don’t penalize on suspicion — describe only an observable contrast for the teacher.',
  '- Do not make a comparison without supplied comparison writing.',
  '- Return null when no clear, useful inconsistency is supported. Avoid vague warnings and overflagging.',
].join('\n');

/** Private observations belong to the teacher, never to released feedback. */
export function teacherNotesEnabled(outputSchema: unknown): boolean {
  return Boolean(outputSchema && typeof outputSchema === 'object' &&
    (outputSchema as Record<string, unknown>).teacherNotesEnabled === true);
}

export function normalizeTeacherNote(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const note = value.trim();
  return note && note.length <= 2000 ? note : null;
}

export function readTeacherNote(run: { status?: string | null; metadata?: unknown } | null): string | null {
  if (!run || run.status !== 'succeeded' || !run.metadata || typeof run.metadata !== 'object') return null;
  return normalizeTeacherNote((run.metadata as Record<string, unknown>).teacherNote);
}
