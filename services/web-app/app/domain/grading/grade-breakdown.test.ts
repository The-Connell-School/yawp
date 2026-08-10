import { describe, expect, test } from 'bun:test';
import { buildGradeBreakdown } from './grade-breakdown';

const categories = [
  { key: 'thesis', label: 'Thesis & Content', description: '', weight: 40 },
  { key: 'evidence', label: 'Evidence', description: '', weight: 60 },
];

describe('buildGradeBreakdown', () => {
  test('shows each category score, the percent it maps to, and its weight', () => {
    const breakdown = buildGradeBreakdown({
      rubricScores: { thesis: { score: 4 }, evidence: { score: 3 } },
      categories,
      maxScore: 5,
      pointValue: null,
    });

    expect(breakdown?.rows).toEqual([
      {
        key: 'thesis',
        label: 'Thesis & Content',
        score: 4,
        percent: 89,
        weight: 40,
        weightShare: 40,
      },
      {
        key: 'evidence',
        label: 'Evidence',
        score: 3,
        percent: 79,
        weight: 60,
        weightShare: 60,
      },
    ]);
    // 89*40 + 79*60 = 8300, over a total weight of 100.
    expect(breakdown?.weightedPercent).toBe(83);
  });

  test('turns the weighted percent into gradebook points', () => {
    const breakdown = buildGradeBreakdown({
      rubricScores: { thesis: { score: 5 }, evidence: { score: 5 } },
      categories,
      maxScore: 5,
      pointValue: 30,
    });

    expect(breakdown?.weightedPercent).toBe(100);
    expect(breakdown?.earnedPoints).toBe(30);
    expect(breakdown?.pointValue).toBe(30);
  });

  // The floor of the 1-5 scale is 59%, not 0 — worth showing plainly, because
  // "all ones" still earns well over half the points and nothing else says so.
  test('reports the floor the scale actually produces', () => {
    const breakdown = buildGradeBreakdown({
      rubricScores: { thesis: { score: 1 }, evidence: { score: 1 } },
      categories,
      maxScore: 5,
      pointValue: 30,
    });

    expect(breakdown?.weightedPercent).toBe(59);
    expect(breakdown?.earnedPoints).toBe(18);
  });

  test('normalizes weights that do not add up to 100', () => {
    const breakdown = buildGradeBreakdown({
      rubricScores: { thesis: { score: 5 }, evidence: { score: 1 } },
      categories: [
        { key: 'thesis', label: 'Thesis & Content', description: '', weight: 50 },
        { key: 'evidence', label: 'Evidence', description: '', weight: 50 },
      ],
      maxScore: 5,
      pointValue: null,
    });

    // (100 + 59) / 2, the same answer 25/25 or 1/1 would give.
    expect(breakdown?.weightedPercent).toBe(80);
  });

  // The built-in rubrics store weights as fractions (0.25) while the editor
  // writes percents (25). Only the share of the total is meaningful to show.
  test('reports each weight as a share of the total, whatever it was stored as', () => {
    const breakdown = buildGradeBreakdown({
      rubricScores: { thesis: { score: 4 }, evidence: { score: 4 } },
      categories: [
        { key: 'thesis', label: 'Thesis & Content', description: '', weight: 0.25 },
        { key: 'evidence', label: 'Evidence', description: '', weight: 0.75 },
      ],
      maxScore: 5,
      pointValue: null,
    });

    expect(breakdown?.rows.map((row) => row.weightShare)).toEqual([25, 75]);
  });

  test('omits points when the assignment carries no point value', () => {
    const breakdown = buildGradeBreakdown({
      rubricScores: { thesis: { score: 4 }, evidence: { score: 4 } },
      categories,
      maxScore: 5,
      pointValue: null,
    });

    expect(breakdown?.earnedPoints).toBeNull();
  });

  test('returns null until every category has been scored', () => {
    expect(
      buildGradeBreakdown({
        rubricScores: { thesis: { score: 4 } },
        categories,
        maxScore: 5,
        pointValue: 30,
      })
    ).toBeNull();
  });

  test('returns null on a scale the percentage math does not cover', () => {
    // A 1-7 rubric is configurable today but has no percentage mapping, so the
    // breakdown must say nothing rather than invent one.
    expect(
      buildGradeBreakdown({
        rubricScores: { thesis: { score: 7 }, evidence: { score: 6 } },
        categories,
        maxScore: 7,
        pointValue: 30,
      })
    ).toBeNull();
  });
});
