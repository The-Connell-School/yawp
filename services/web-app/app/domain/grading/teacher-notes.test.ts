import { describe, expect, test } from 'bun:test';
import {
  TEACHER_NOTES_EVIDENCE_RULE,
  authorizeOutputSchemaTeacherNotes,
  gradingRepairPrivateObservationRules,
  normalizeTeacherNote,
  overallCommentWriterRules,
  staffTeacherNoteLoaderField,
} from './teacher-notes';

const dailyPagesOnlyPhrases = [
  'Never mention grammar, spelling, syntax, or organization as a grading judgment.',
  'Never evaluate whether the content is correct; this is an engagement judgment, not a correctness judgment.',
  'Feedback is 1–3 warm sentences; do not turn the private note into student-facing feedback.',
];

describe('teacher-notes', () => {
  test('TEACHER_NOTES_EVIDENCE_RULE uses real newlines, not literal backslash-n', () => {
    expect(TEACHER_NOTES_EVIDENCE_RULE.includes('\\n')).toBe(false);
    expect(TEACHER_NOTES_EVIDENCE_RULE.includes('\n')).toBe(true);
    // Sanity: multi-line content
    const lines = TEACHER_NOTES_EVIDENCE_RULE.split('\n');
    expect(lines.length).toBeGreaterThan(1);
  });

  test('TEACHER_NOTES_EVIDENCE_RULE omits Daily Pages grading-only lines', () => {
    for (const phrase of dailyPagesOnlyPhrases) {
      expect(TEACHER_NOTES_EVIDENCE_RULE).not.toContain(phrase);
    }
    expect(TEACHER_NOTES_EVIDENCE_RULE).toContain('Do not claim or suggest that AI');
  });

  test('repair and overall-comment helpers omit note rules when disabled', () => {
    expect(gradingRepairPrivateObservationRules(false)).toBe('');
    expect(overallCommentWriterRules(false)).not.toContain('Teacher Note rules:');
    expect(overallCommentWriterRules(true)).not.toContain('Teacher Note rules:');
    expect(gradingRepairPrivateObservationRules(true)).toContain('Teacher Note rules:');
  });

  test('authorizeOutputSchemaTeacherNotes ignores crafted toggle from plain admins', () => {
    expect(
      authorizeOutputSchemaTeacherNotes(
        { schemaVersion: 1, teacherNotesEnabled: true },
        { schemaVersion: 1 },
        false
      )
    ).toEqual({ schemaVersion: 1 });
    expect(
      authorizeOutputSchemaTeacherNotes(
        { schemaVersion: 1, teacherNotesEnabled: false },
        { schemaVersion: 1, teacherNotesEnabled: true },
        false
      )
    ).toEqual({ schemaVersion: 1, teacherNotesEnabled: true });
  });

  test('normalizeTeacherNote trims and enforces max length', () => {
    expect(normalizeTeacherNote('  hello  ')).toBe('hello');
    expect(normalizeTeacherNote('')).toBeNull();
    expect(normalizeTeacherNote(null)).toBeNull();
    expect(
      normalizeTeacherNote('a'.repeat(2001)),
    ).toBeNull();
    expect(
      normalizeTeacherNote('a'.repeat(2000)),
    ).toBe('a'.repeat(2000));
  });

  test('staffTeacherNoteLoaderField respects the output toggle and staff role', () => {
    const run = {
      status: 'succeeded',
      metadata: { teacherNote: 'PRIVATE: vocabulary shift.' },
    };
    expect(
      staffTeacherNoteLoaderField({
        isOwner: false,
        isTeacher: true,
        isAdmin: false,
        outputSchemaSnapshot: { teacherNotesEnabled: true },
        run,
      })
    ).toEqual({ teacherNote: 'PRIVATE: vocabulary shift.' });
    expect(
      staffTeacherNoteLoaderField({
        isOwner: false,
        isTeacher: true,
        isAdmin: false,
        outputSchemaSnapshot: { teacherNotesEnabled: false },
        run,
      })
    ).toEqual({});
    expect(
      staffTeacherNoteLoaderField({
        isOwner: true,
        isTeacher: false,
        isAdmin: false,
        outputSchemaSnapshot: { teacherNotesEnabled: true },
        run,
      })
    ).toEqual({});
  });
});

