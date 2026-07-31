import { describe, expect, test } from 'bun:test';
import {
  AP_ENGLISH_LIT_RUBRIC,
  AP_ENGLISH_LIT_RUBRIC_ID,
  AP_ENGLISH_LIT_RUBRIC_TOTAL_POINTS,
  getApEnglishLitRubricRow,
} from './rubric';

describe('AP English Literature analytic rubric', () => {
  test('row max points sum to the 6-point total', () => {
    const sum = AP_ENGLISH_LIT_RUBRIC.rows.reduce(
      (total, row) => total + row.maxPoints,
      0,
    );
    expect(sum).toBe(AP_ENGLISH_LIT_RUBRIC_TOTAL_POINTS);
    expect(AP_ENGLISH_LIT_RUBRIC.totalPoints).toBe(6);
    expect(AP_ENGLISH_LIT_RUBRIC.rubricId).toBe(AP_ENGLISH_LIT_RUBRIC_ID);
  });

  test('rows follow the canonical A/B/C thesis-evidence-sophistication shape', () => {
    expect(AP_ENGLISH_LIT_RUBRIC.rows.map((r) => r.rowId)).toEqual([
      'thesis',
      'evidence-commentary',
      'sophistication',
    ]);
    expect(AP_ENGLISH_LIT_RUBRIC.rows.map((r) => r.label)).toEqual([
      'A',
      'B',
      'C',
    ]);
    expect(AP_ENGLISH_LIT_RUBRIC.rows.map((r) => r.maxPoints)).toEqual([1, 4, 1]);
  });

  test('each row exposes a level for every score point from 0 to its max', () => {
    for (const row of AP_ENGLISH_LIT_RUBRIC.rows) {
      const points = row.levels.map((level) => level.points);
      const expected = Array.from({ length: row.maxPoints + 1 }, (_, i) => i);
      expect(points).toEqual(expected);
      for (const level of row.levels) {
        expect(level.criteria.length).toBeGreaterThan(0);
      }
    }
  });

  test('every row documents common failure modes', () => {
    for (const row of AP_ENGLISH_LIT_RUBRIC.rows) {
      expect(row.commonFailures.length).toBeGreaterThan(0);
    }
  });

  test('getApEnglishLitRubricRow returns the requested row and throws on unknown ids', () => {
    expect(getApEnglishLitRubricRow('evidence-commentary').maxPoints).toBe(4);
    // @ts-expect-error exercising the runtime guard with an invalid id
    expect(() => getApEnglishLitRubricRow('grammar')).toThrow();
  });
});
