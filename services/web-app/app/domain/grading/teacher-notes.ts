export const TEACHER_NOTES_EVIDENCE_RULE = "Base observations only on supplied text and context. Do not claim a change from the student's usual writing without supplied comparison writing.";

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
