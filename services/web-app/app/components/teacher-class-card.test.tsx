import { describe, expect, test } from 'bun:test';

import { formatTeacherClassLabel } from './teacher-class-card';

describe('formatTeacherClassLabel', () => {
  test('uses class title when present', () => {
    expect(
      formatTeacherClassLabel({ grade: '9', period: '2', title: 'Honors' })
    ).toBe('Honors');
  });

  test('falls back to grade and period when title is missing', () => {
    expect(formatTeacherClassLabel({ grade: '9', period: '2' })).toBe(
      'Grade 9 • Period 2'
    );
  });

  test('falls back to grade only when period is null', () => {
    expect(formatTeacherClassLabel({ grade: '9', period: null })).toBe('Grade 9');
  });
});
