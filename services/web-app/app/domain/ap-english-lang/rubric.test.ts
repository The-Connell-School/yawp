import { describe, expect, test } from 'bun:test';
import {
  AP_ENGLISH_LANG_RUBRIC,
  AP_ENGLISH_LANG_RUBRIC_ID,
  AP_ENGLISH_LANG_RUBRIC_TOTAL_POINTS,
  getApEnglishLangRubricRow,
  maxEvidenceCommentaryForSourcesCited,
  SYNTHESIS_SOURCE_RULES,
} from './rubric';

describe('AP English Language rubric', () => {
  test('is the 6-point analytic rubric', () => {
    expect(AP_ENGLISH_LANG_RUBRIC.rubricId).toBe(AP_ENGLISH_LANG_RUBRIC_ID);
    expect(AP_ENGLISH_LANG_RUBRIC_TOTAL_POINTS).toBe(6);

    const rowTotal = AP_ENGLISH_LANG_RUBRIC.rows.reduce(
      (sum, row) => sum + row.maxPoints,
      0,
    );
    expect(rowTotal).toBe(AP_ENGLISH_LANG_RUBRIC_TOTAL_POINTS);
  });

  test('has exactly three rows worth 1 / 4 / 1 points', () => {
    expect(AP_ENGLISH_LANG_RUBRIC.rows.map((r) => r.rowId)).toEqual([
      'thesis',
      'evidence-commentary',
      'sophistication',
    ]);
    expect(AP_ENGLISH_LANG_RUBRIC.rows.map((r) => r.maxPoints)).toEqual([
      1, 4, 1,
    ]);
    expect(AP_ENGLISH_LANG_RUBRIC.rows.map((r) => r.label)).toEqual([
      'A',
      'B',
      'C',
    ]);
  });

  test('every row enumerates a level for each point from 0 to its maximum', () => {
    for (const row of AP_ENGLISH_LANG_RUBRIC.rows) {
      const points = row.levels.map((level) => level.points);
      const expected = Array.from({ length: row.maxPoints + 1 }, (_, i) => i);
      expect(points).toEqual(expected);

      for (const level of row.levels) {
        expect(level.summary.trim().length).toBeGreaterThan(0);
        expect(level.criteria.length).toBeGreaterThan(0);
      }
    }
  });

  test('every row documents common failure modes', () => {
    for (const row of AP_ENGLISH_LANG_RUBRIC.rows) {
      expect(row.commonFailures.length).toBeGreaterThan(0);
    }
  });

  test('getApEnglishLangRubricRow returns the requested row', () => {
    expect(getApEnglishLangRubricRow('evidence-commentary').maxPoints).toBe(4);
    expect(getApEnglishLangRubricRow('thesis').label).toBe('A');
  });

  test('getApEnglishLangRubricRow throws on an unknown row', () => {
    // @ts-expect-error — exercising the runtime guard
    expect(() => getApEnglishLangRubricRow('style')).toThrow();
  });
});

describe('synthesis source minimums', () => {
  test('encodes the College Board source floors', () => {
    expect(SYNTHESIS_SOURCE_RULES.minSourcesForOnePoint).toBe(2);
    expect(SYNTHESIS_SOURCE_RULES.minSourcesForTwoOrMorePoints).toBe(3);
  });

  test('citing fewer than two sources caps Row B at 0', () => {
    expect(maxEvidenceCommentaryForSourcesCited(0)).toBe(0);
    expect(maxEvidenceCommentaryForSourcesCited(1)).toBe(0);
  });

  test('citing exactly two sources caps Row B at 1', () => {
    expect(maxEvidenceCommentaryForSourcesCited(2)).toBe(1);
  });

  test('citing three or more sources lifts the cap entirely', () => {
    expect(maxEvidenceCommentaryForSourcesCited(3)).toBe(4);
    expect(maxEvidenceCommentaryForSourcesCited(7)).toBe(4);
  });

  test('rejects a negative source count', () => {
    expect(() => maxEvidenceCommentaryForSourcesCited(-1)).toThrow();
  });
});
