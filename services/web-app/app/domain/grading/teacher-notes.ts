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
  '- If an entry appears pasted or unlike the student’s own register, don’t penalize on suspicion — describe only an observable contrast for the teacher.',
  '- Do not make a comparison without supplied comparison writing.',
  '- Return null when no clear, useful inconsistency is supported. Avoid vague warnings and overflagging.',
].join('\n');

export function overallCommentWriterRules(_teacherNotesEnabled: boolean): string {
  return '- Do not include private observations, notes for the teacher, or speculation about authorship. Write only student feedback and obey the supplied grading constraints.';
}

/** Strip teacherNotesEnabled changes from non-superadmin assignment-type saves. */
export function authorizeOutputSchemaTeacherNotes(
  submitted: Record<string, unknown> | null,
  existingOutputSchema: unknown,
  canEditTeacherNotesToggle: boolean
): Record<string, unknown> | null {
  if (!submitted) return submitted;
  if (canEditTeacherNotesToggle) return submitted;
  const preserveEnabled = teacherNotesEnabled(existingOutputSchema);
  return withTeacherNotesEnabled(submitted, preserveEnabled);
}

export function gradingRepairPrivateObservationRules(
  teacherNotesEnabled: boolean
): string {
  if (!teacherNotesEnabled) return '';
  return [
    '- Private observations belong only in teacherNote when the schema permits it. Never put them in overallComment or category comments. Do not infer AI authorship or penalize suspicion.',
    `- ${TEACHER_NOTES_EVIDENCE_RULE}`,
  ].join('\n');
}

export function withTeacherNotesEnabled(
  outputSchema: Record<string, unknown>,
  enabled: boolean
): Record<string, unknown> {
  const next = { ...outputSchema };
  if (enabled) next.teacherNotesEnabled = true;
  else delete next.teacherNotesEnabled;
  return next;
}

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

/** Loader field for staff-only teacher notes, gated on the rubric output toggle. */
export function staffTeacherNoteLoaderField(options: {
  isOwner: boolean;
  isTeacher: boolean;
  isAdmin: boolean;
  outputSchemaSnapshot: unknown;
  run: { status?: string | null; metadata?: unknown } | null;
}): { teacherNote: string | null } | Record<string, never> {
  if (options.isOwner || (!options.isTeacher && !options.isAdmin)) return {};
  if (!teacherNotesEnabled(options.outputSchemaSnapshot)) return {};
  return { teacherNote: readTeacherNote(options.run) };
}
