import { describe, expect, test } from 'bun:test';
import {
  DAILY_PAGES_ONLY_TEACHER_NOTE_PHRASES,
  TEACHER_NOTES_EVIDENCE_RULE,
  gradingRepairPrivateObservationRules,
  normalizeTeacherNote,
  overallCommentWriterRules,
} from './teacher-notes';

describe('teacher-notes', () => {
  test('TEACHER_NOTES_EVIDENCE_RULE uses real newlines, not literal backslash-n', () => {
    expect(TEACHER_NOTES_EVIDENCE_RULE.includes('\\n')).toBe(false);
    expect(TEACHER_NOTES_EVIDENCE_RULE.includes('\n')).toBe(true);
    // Sanity: multi-line content
    const lines = TEACHER_NOTES_EVIDENCE_RULE.split('\n');
    expect(lines.length).toBeGreaterThan(1);
  });

  test('TEACHER_NOTES_EVIDENCE_RULE omits Daily Pages grading-only lines', () => {
    for (const phrase of DAILY_PAGES_ONLY_TEACHER_NOTE_PHRASES) {
      expect(TEACHER_NOTES_EVIDENCE_RULE).not.toContain(phrase);
    }
    expect(TEACHER_NOTES_EVIDENCE_RULE).toContain('Do not claim or suggest that AI');
  });

  test('repair and overall-comment helpers omit note rules when disabled', () => {
    expect(gradingRepairPrivateObservationRules(false)).toBe('');
    expect(overallCommentWriterRules(false)).not.toContain('Teacher Note rules:');
    expect(gradingRepairPrivateObservationRules(true)).toContain('Teacher Note rules:');
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

