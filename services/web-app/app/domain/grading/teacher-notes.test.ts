import { describe, expect, test } from 'bun:test';
import { TEACHER_NOTES_EVIDENCE_RULE, normalizeTeacherNote } from './teacher-notes';

describe('teacher-notes', () => {
  test('TEACHER_NOTES_EVIDENCE_RULE uses real newlines, not literal backslash-n', () => {
    expect(TEACHER_NOTES_EVIDENCE_RULE.includes('\\n')).toBe(false);
    expect(TEACHER_NOTES_EVIDENCE_RULE.includes('\n')).toBe(true);
    // Sanity: multi-line content
    const lines = TEACHER_NOTES_EVIDENCE_RULE.split('\n');
    expect(lines.length).toBeGreaterThan(1);
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
});

