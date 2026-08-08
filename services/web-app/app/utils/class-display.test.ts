import { describe, expect, test } from 'bun:test';

import {
  formatClassCardSubtitle,
  formatClassCardTitle,
  formatClassGradePeriod,
  formatClassLabel,
  getClassCardHeading,
} from './class-display';

describe('formatClassGradePeriod', () => {
  test('includes grade and period when both are present', () => {
    expect(formatClassGradePeriod({ grade: '9', period: '2' })).toBe(
      'Grade 9 • Period 2'
    );
  });

  test('includes only grade when period is missing', () => {
    expect(formatClassGradePeriod({ grade: '9', period: null })).toBe('Grade 9');
  });

  test('includes only period when grade is missing', () => {
    expect(formatClassGradePeriod({ grade: null, period: '2' })).toBe('Period 2');
  });

  test('returns null when grade and period are missing', () => {
    expect(formatClassGradePeriod({ grade: null, period: null })).toBeNull();
  });
});

describe('getClassCardHeading', () => {
  test('shows title with grade/period below when a custom title exists', () => {
    expect(
      getClassCardHeading({ grade: '9', period: '2', title: 'Honors' })
    ).toEqual({
      title: 'Honors',
      subtitle: 'Grade 9 • Period 2',
    });
  });

  test('shows grade/period as title only when no custom title exists', () => {
    expect(
      getClassCardHeading({ grade: '9', period: '2', title: null })
    ).toEqual({
      title: 'Grade 9 • Period 2',
      subtitle: null,
    });
  });

  test('shows only grade as title when period is missing and there is no custom title', () => {
    expect(
      getClassCardHeading({ grade: '9', period: null, title: null })
    ).toEqual({
      title: 'Grade 9',
      subtitle: null,
    });
  });
});

describe('formatClassCardTitle', () => {
  test('uses class title when present', () => {
    expect(
      formatClassCardTitle({ grade: '9', period: '2', title: 'AP English 11' })
    ).toBe('AP English 11');
  });

  test('falls back to grade and period when title is missing', () => {
    expect(formatClassCardTitle({ grade: '9', period: '2', title: null })).toBe(
      'Grade 9 • Period 2'
    );
  });

  test('falls back to grade only when title and period are missing', () => {
    expect(formatClassCardTitle({ grade: '9', period: null, title: null })).toBe(
      'Grade 9'
    );
  });

  test('falls back to untitled class when nothing is set', () => {
    expect(formatClassCardTitle({ grade: null, period: null, title: null })).toBe(
      'Untitled Class'
    );
  });
});

describe('formatClassCardSubtitle', () => {
  test('shows grade and period when a title exists', () => {
    expect(
      formatClassCardSubtitle({ grade: '9', period: '2', title: 'Honors' })
    ).toBe('Grade 9 • Period 2');
  });

  test('shows only period when grade is missing', () => {
    expect(
      formatClassCardSubtitle({ grade: null, period: '2', title: 'Honors' })
    ).toBe('Period 2');
  });

  test('returns null when there is no title', () => {
    expect(
      formatClassCardSubtitle({ grade: '9', period: '2', title: null })
    ).toBeNull();
  });

  test('returns null when title exists but grade and period are missing', () => {
    expect(
      formatClassCardSubtitle({ grade: null, period: null, title: 'Honors' })
    ).toBeNull();
  });
});

describe('formatClassLabel', () => {
  test('leads with title for combined labels', () => {
    expect(
      formatClassLabel({ grade: '9', period: '2', title: 'Honors' })
    ).toBe('Honors · Grade 9 • Period 2');
  });

  test('uses title alone when grade and period are missing', () => {
    expect(formatClassLabel({ grade: null, period: null, title: 'Honors' })).toBe(
      'Honors'
    );
  });

  test('uses grade and period when title is missing', () => {
    expect(formatClassLabel({ grade: '9', period: null, title: null })).toBe(
      'Grade 9'
    );
  });

  test('falls back to untitled class when grade, period, and title are all missing', () => {
    expect(formatClassLabel({ grade: null, period: null, title: null })).toBe(
      'Untitled Class'
    );
  });

  test('falls back to untitled class when grade, period, and title are blank', () => {
    expect(formatClassLabel({ grade: '  ', period: '  ', title: '  ' })).toBe(
      'Untitled Class'
    );
  });

  test('tolerates a class record carrying unrelated fields', () => {
    expect(
      formatClassLabel({
        id: 'c1',
        schoolYear: '2026-2027',
        grade: null,
        period: null,
        title: null,
      })
    ).toBe('Untitled Class');
  });
});

describe('getClassCardHeading with no grade and no period', () => {
  test('returns the untitled fallback with no subtitle when nothing is set', () => {
    expect(
      getClassCardHeading({ grade: null, period: null, title: null })
    ).toEqual({
      title: 'Untitled Class',
      subtitle: null,
    });
  });

  test('keeps the custom title and drops the subtitle', () => {
    expect(
      getClassCardHeading({ grade: null, period: null, title: 'Honors' })
    ).toEqual({
      title: 'Honors',
      subtitle: null,
    });
  });
});
