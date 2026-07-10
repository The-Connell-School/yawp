import { describe, expect, test } from 'bun:test';
import {
  averagePercentage,
  buildGrowthSeries,
  buildRubricTrends,
  humanizeRubricCategory,
  summarizeStudentGrades,
  type GradedSubmissionRow,
} from './reporter-report';

function row(overrides: Partial<GradedSubmissionRow>): GradedSubmissionRow {
  return {
    submissionId: 'sub-1',
    studentMembershipId: 'stu-1',
    studentName: 'Ada Lovelace',
    assignmentTitle: 'Essay 1',
    submittedAt: new Date('2026-01-01T00:00:00.000Z'),
    numericPercentage: 80,
    letterGrade: 'B',
    ...overrides,
  };
}

describe('averagePercentage', () => {
  test('averages defined values and rounds', () => {
    expect(averagePercentage([80, 91])).toBe(86);
  });

  test('ignores null and undefined', () => {
    expect(averagePercentage([90, null, undefined, 100])).toBe(95);
  });

  test('returns null when nothing to average', () => {
    expect(averagePercentage([])).toBeNull();
    expect(averagePercentage([null, undefined])).toBeNull();
  });
});

describe('summarizeStudentGrades', () => {
  test('groups by student, averages, and uses latest letter grade', () => {
    const summaries = summarizeStudentGrades([
      row({
        submissionId: 's1',
        studentMembershipId: 'stu-1',
        studentName: 'Ada Lovelace',
        numericPercentage: 70,
        letterGrade: 'C',
        submittedAt: new Date('2026-01-01T00:00:00.000Z'),
      }),
      row({
        submissionId: 's2',
        studentMembershipId: 'stu-1',
        studentName: 'Ada Lovelace',
        numericPercentage: 90,
        letterGrade: 'A',
        submittedAt: new Date('2026-02-01T00:00:00.000Z'),
      }),
      row({
        submissionId: 's3',
        studentMembershipId: 'stu-2',
        studentName: 'Grace Hopper',
        numericPercentage: 100,
        letterGrade: 'A',
        submittedAt: new Date('2026-01-15T00:00:00.000Z'),
      }),
    ]);

    expect(summaries).toHaveLength(2);
    // Sorted by name: Ada before Grace.
    const [ada, grace] = summaries;
    expect(ada.studentName).toBe('Ada Lovelace');
    expect(ada.gradedCount).toBe(2);
    expect(ada.averagePercentage).toBe(80);
    expect(ada.latestLetterGrade).toBe('A'); // from the Feb submission
    expect(grace.averagePercentage).toBe(100);
  });

  test('handles students with no numeric grade', () => {
    const [summary] = summarizeStudentGrades([
      row({ numericPercentage: null, letterGrade: null }),
    ]);
    expect(summary.averagePercentage).toBeNull();
    expect(summary.latestLetterGrade).toBeNull();
    expect(summary.gradedCount).toBe(1);
  });
});

describe('buildGrowthSeries', () => {
  test('orders points chronologically regardless of input order', () => {
    const series = buildGrowthSeries([
      row({
        submissionId: 'later',
        numericPercentage: 95,
        submittedAt: new Date('2026-03-01T00:00:00.000Z'),
      }),
      row({
        submissionId: 'earlier',
        numericPercentage: 60,
        submittedAt: new Date('2026-01-01T00:00:00.000Z'),
      }),
    ]);
    expect(series.points.map((p) => p.submissionId)).toEqual([
      'earlier',
      'later',
    ]);
    expect(series.firstPercentage).toBe(60);
    expect(series.latestPercentage).toBe(95);
    expect(series.deltaPercentage).toBe(35);
    expect(series.trend).toBe('improving');
  });

  test('flags declining and steady trends', () => {
    const declining = buildGrowthSeries([
      row({
        numericPercentage: 90,
        submittedAt: new Date('2026-01-01T00:00:00.000Z'),
      }),
      row({
        numericPercentage: 70,
        submittedAt: new Date('2026-02-01T00:00:00.000Z'),
      }),
    ]);
    expect(declining.trend).toBe('declining');

    const steady = buildGrowthSeries([
      row({
        numericPercentage: 88,
        submittedAt: new Date('2026-01-01T00:00:00.000Z'),
      }),
      row({
        numericPercentage: 89,
        submittedAt: new Date('2026-02-01T00:00:00.000Z'),
      }),
    ]);
    expect(steady.trend).toBe('steady');
  });

  test('reports insufficient data with fewer than two scored submissions', () => {
    const series = buildGrowthSeries([row({ numericPercentage: 80 })]);
    expect(series.trend).toBe('insufficient');
    expect(series.deltaPercentage).toBeNull();
  });
});

describe('humanizeRubricCategory', () => {
  test('maps known rubric keys to friendly labels', () => {
    expect(humanizeRubricCategory('evidence_and_support')).toBe(
      'Evidence & analysis'
    );
    expect(humanizeRubricCategory('grammar_and_mechanics')).toBe(
      'Grammar & mechanics'
    );
  });

  test('title-cases unknown keys', () => {
    expect(humanizeRubricCategory('sentence_fluency')).toBe('Sentence fluency');
  });
});

describe('buildRubricTrends', () => {
  test('computes first→latest movement per category in rubric order', () => {
    const trends = buildRubricTrends([
      row({
        submittedAt: new Date('2026-01-01T00:00:00.000Z'),
        rubricScores: {
          grammar_and_mechanics: 3,
          thesis_and_content: 4,
          evidence_and_support: 4,
        },
      }),
      row({
        submittedAt: new Date('2026-03-01T00:00:00.000Z'),
        rubricScores: {
          grammar_and_mechanics: 4,
          thesis_and_content: 4,
          evidence_and_support: 2,
        },
      }),
    ]);

    // Known rubric order: thesis before evidence before grammar.
    expect(trends.map((t) => t.category)).toEqual([
      'thesis_and_content',
      'evidence_and_support',
      'grammar_and_mechanics',
    ]);

    const evidence = trends.find((t) => t.category === 'evidence_and_support')!;
    expect(evidence.first).toBe(4);
    expect(evidence.latest).toBe(2);
    expect(evidence.delta).toBe(-2);
    expect(evidence.direction).toBe('declining');

    const grammar = trends.find((t) => t.category === 'grammar_and_mechanics')!;
    expect(grammar.direction).toBe('improving');

    const thesis = trends.find((t) => t.category === 'thesis_and_content')!;
    expect(thesis.direction).toBe('steady');
  });

  test('returns nothing when no submissions carry rubric scores', () => {
    expect(buildRubricTrends([row({ rubricScores: null })])).toEqual([]);
  });
});
