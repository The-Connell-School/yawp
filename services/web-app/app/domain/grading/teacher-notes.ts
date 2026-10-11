import {
  readOutputSchemaDisplay,
  type ResolvedDisplayOptions,
} from '~/domain/rubrics/output-schema-display';
import { AP_HISTORY_ASSIGNMENT_TYPE_KEY } from '~/domain/ap-history/schema';

export type TeacherNotesUiState =
  | { visible: false }
  | { visible: true; phase: 'pending' }
  | { visible: true; phase: 'empty' }
  | { visible: true; phase: 'content'; note: string };

/**
 * Teacher Notes are document observations, not an authorship detector. Keep
 * this contract in the shared prompt so every rubric gets the same conservative
 * behavior.
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

export function gradingRepairPrivateObservationRules(
  teacherNotesEnabled: boolean
): string {
  if (!teacherNotesEnabled) return '';
  return [
    '- Private observations belong only in teacherNote when the schema permits it. Never put them in overallComment or category comments. Do not infer AI authorship or penalize suspicion.',
    `- ${TEACHER_NOTES_EVIDENCE_RULE}`,
  ].join('\n');
}

/** Teacher notes default on; rubric display.teacherNotes can turn them off. */
export function teacherNotesEnabled(
  outputSchema: unknown,
  display?: ResolvedDisplayOptions
): boolean {
  if (display) return display.teacherNotes;
  const configured = readOutputSchemaDisplay(outputSchema)?.teacherNotes;
  return configured ?? true;
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

function latestSucceededGradingRun(
  runs: ReadonlyArray<{ status?: string | null; metadata?: unknown }>
) {
  return runs.find(run => run.status === 'succeeded') ?? null;
}

export function resolveTeacherNotesUiState(options: {
  assignmentTypeSystemKey: string | null | undefined;
  teacherNotesEnabled: boolean;
  runs: ReadonlyArray<{ status?: string | null; metadata?: unknown }>;
}): TeacherNotesUiState {
  if (
    options.assignmentTypeSystemKey === AP_HISTORY_ASSIGNMENT_TYPE_KEY ||
    !options.teacherNotesEnabled
  ) {
    return { visible: false };
  }
  if (!options.runs.length) {
    return { visible: true, phase: 'pending' };
  }
  const succeeded = latestSucceededGradingRun(options.runs);
  if (!succeeded) {
    return { visible: true, phase: 'pending' };
  }
  const note = readTeacherNote(succeeded);
  if (!note) {
    return { visible: true, phase: 'empty' };
  }
  return { visible: true, phase: 'content', note };
}

/** Loader fields for staff-only teacher notes (never exposed to students). */
export function staffTeacherNoteLoaderField(options: {
  isOwner: boolean;
  isTeacher: boolean;
  isAdmin: boolean;
  assignmentTypeSystemKey?: string | null;
  teacherNotesEnabled?: boolean;
  runs?: ReadonlyArray<{ status?: string | null; metadata?: unknown }>;
  run?: { status?: string | null; metadata?: unknown } | null;
}): { teacherNote: string | null; teacherNotesUi: TeacherNotesUiState } | Record<string, never> {
  if (options.isOwner || (!options.isTeacher && !options.isAdmin)) return {};
  const runs =
    options.runs ??
    (options.run ? [options.run] : []);
  const teacherNotesEnabled = options.teacherNotesEnabled ?? true;
  const teacherNotesUi = resolveTeacherNotesUiState({
    assignmentTypeSystemKey: options.assignmentTypeSystemKey,
    teacherNotesEnabled,
    runs,
  });
  const note =
    teacherNotesUi.visible && teacherNotesUi.phase === 'content'
      ? teacherNotesUi.note
      : null;
  return { teacherNote: note, teacherNotesUi };
}
