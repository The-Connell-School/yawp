import { describe, expect, test } from 'bun:test';
import { sectionLabel, sectionLabels } from './section-labels';

describe('sectionLabel', () => {
  test('reads grade and period together when both are set', () => {
    expect(
      sectionLabel({ grade: '9', period: '2', title: 'English 9 Honors' })
    ).toBe('Grade 9 · Period 2');
  });

  test('falls back to the class title when grade and period are unset', () => {
    expect(
      sectionLabel({ grade: null, period: null, title: '  English 9  ' })
    ).toBe('English 9');
  });

  test('never renders empty', () => {
    expect(sectionLabel({ grade: null, period: null, title: '  ' })).toBe(
      'Untitled class'
    );
  });
});

describe('sectionLabels', () => {
  test('leaves labels alone when they are already distinct', () => {
    expect(
      sectionLabels([
        { grade: '9', period: '1', title: 'A' },
        { grade: '9', period: '2', title: 'B' },
      ])
    ).toEqual(['Grade 9 · Period 1', 'Grade 9 · Period 2']);
  });

  test('qualifies a repeated label with the class title', () => {
    expect(
      sectionLabels([
        { grade: '9', period: null, title: 'First Block' },
        { grade: '9', period: null, title: 'Last Block' },
        { grade: '10', period: null, title: 'Other' },
      ])
    ).toEqual(['Grade 9 · First Block', 'Grade 9 · Last Block', 'Grade 10']);
  });

  test('numbers sections whose titles collide too, so labels stay distinct', () => {
    expect(
      sectionLabels([
        { grade: '9', period: null, title: null },
        { grade: '9', period: null, title: null },
      ])
    ).toEqual(['Grade 9 (1)', 'Grade 9 (2)']);
  });
});
