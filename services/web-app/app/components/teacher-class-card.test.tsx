import { describe, expect, test } from 'bun:test';

import { formatTeacherClassLabel } from './teacher-class-card';

describe('formatTeacherClassLabel', () => {
  test('includes the period when present', () => {
    expect(formatTeacherClassLabel({ grade: '9', period: '2' })).toBe(
      'Grade 9 • Period 2'
    );
  });

  test('omits the period segment when period is null', () => {
    expect(formatTeacherClassLabel({ grade: '9', period: null })).toBe(
      'Grade 9'
    );
  });

  test('keeps the title suffix when period is null', () => {
    expect(
      formatTeacherClassLabel({ grade: '9', period: null, title: 'Honors' })
    ).toBe('Grade 9 — Honors');
  });
});
