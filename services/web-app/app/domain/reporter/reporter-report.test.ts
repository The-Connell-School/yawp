import { describe, expect, test } from 'bun:test';
import {
  averagePercentage,
  buildGrowthSeries,
  buildPlanProgress,
  buildRubricTrends,
  captureRubricLevels,
  findStudentsNeedingAttention,
  humanizeRubricCategory,
  summarizeClassRubrics,
  summarizeStudentGrades,
  type GradedSubmissionRow,
  type PlanBaseline,
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
    // Labels come straight from the canonical grading rubric (rubric.ts).
    expect(humanizeRubricCategory('evidence_and_support')).toBe(
      'Evidence/Support'
    );
    expect(humanizeRubricCategory('grammar_and_mechanics')).toBe(
      'Grammar/Syntax/Formatting'
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

describe('summarizeClassRubrics', () => {
  test('averages each category across all scored submissions in rubric order', () => {
    const rubrics = summarizeClassRubrics([
      row({
        studentMembershipId: 'stu-1',
        rubricScores: { evidence_and_support: 2, thesis_and_content: 4 },
      }),
      row({
        studentMembershipId: 'stu-2',
        rubricScores: { evidence_and_support: 3, thesis_and_content: 5 },
      }),
      row({
        studentMembershipId: 'stu-3',
        rubricScores: { evidence_and_support: 2 },
      }),
    ]);

    // Known order: thesis before evidence.
    expect(rubrics.map((r) => r.category)).toEqual([
      'thesis_and_content',
      'evidence_and_support',
    ]);
    const evidence = rubrics.find(
      (r) => r.category === 'evidence_and_support'
    )!;
    // (2 + 3 + 2) / 3 = 2.33 → 2.3
    expect(evidence.averageLevel).toBe(2.3);
    expect(evidence.scoredCount).toBe(3);
    expect(evidence.label).toBe('Evidence/Support');
  });

  test('returns nothing when no submission carries rubric scores', () => {
    expect(summarizeClassRubrics([row({ rubricScores: null })])).toEqual([]);
  });
});

describe('findStudentsNeedingAttention', () => {
  test('flags below-threshold, declining-overall, and slipping-skill students, ranked by severity', () => {
    const rows: GradedSubmissionRow[] = [
      // Struggling + declining student: 60 → 50, evidence 4 → 2.
      row({
        submissionId: 'a1',
        studentMembershipId: 'stu-low',
        studentName: 'Amelia Brooks',
        submittedAt: new Date('2026-01-01T00:00:00.000Z'),
        numericPercentage: 60,
        rubricScores: { evidence_and_support: 4 },
      }),
      row({
        submissionId: 'a2',
        studentMembershipId: 'stu-low',
        studentName: 'Amelia Brooks',
        submittedAt: new Date('2026-03-01T00:00:00.000Z'),
        numericPercentage: 50,
        letterGrade: 'F',
        rubricScores: { evidence_and_support: 2 },
      }),
      // Healthy student: high and steady — should not appear.
      row({
        submissionId: 'b1',
        studentMembershipId: 'stu-ok',
        studentName: 'Grace Hopper',
        submittedAt: new Date('2026-01-01T00:00:00.000Z'),
        numericPercentage: 92,
        rubricScores: { evidence_and_support: 5 },
      }),
      row({
        submissionId: 'b2',
        studentMembershipId: 'stu-ok',
        studentName: 'Grace Hopper',
        submittedAt: new Date('2026-03-01T00:00:00.000Z'),
        numericPercentage: 94,
        rubricScores: { evidence_and_support: 5 },
      }),
    ];

    const flagged = findStudentsNeedingAttention(rows);

    expect(flagged.map((s) => s.studentName)).toEqual(['Amelia Brooks']);
    const amelia = flagged[0];
    expect(amelia.averagePercentage).toBe(55);
    expect(amelia.latestPercentage).toBe(50);
    expect(amelia.trend).toBe('declining');
    const types = amelia.flags.map((f) => f.type).sort();
    expect(types).toEqual([
      'below_average',
      'declining_overall',
      'declining_skill',
      'low_latest_grade',
    ]);
    const skill = amelia.flags.find((f) => f.type === 'declining_skill');
    expect(skill).toMatchObject({
      category: 'evidence_and_support',
      first: 4,
      latest: 2,
    });
  });

  test('honors a custom threshold and orders by severity', () => {
    const rows: GradedSubmissionRow[] = [
      row({
        submissionId: 'c1',
        studentMembershipId: 'stu-1',
        studentName: 'Mild Case',
        numericPercentage: 78,
      }),
      row({
        submissionId: 'd1',
        studentMembershipId: 'stu-2',
        studentName: 'Severe Case',
        numericPercentage: 40,
      }),
    ];

    const flagged = findStudentsNeedingAttention(rows, {
      averageThreshold: 80,
    });
    // Both are below 80, but the 40 is far more severe and sorts first.
    expect(flagged.map((s) => s.studentName)).toEqual([
      'Severe Case',
      'Mild Case',
    ]);
  });

  test('returns nobody when everyone is above threshold and steady', () => {
    const rows: GradedSubmissionRow[] = [
      row({ studentMembershipId: 'stu-1', numericPercentage: 90 }),
    ];
    expect(findStudentsNeedingAttention(rows)).toEqual([]);
  });
});

describe('captureRubricLevels', () => {
  test('records the latest level per category and the overall average', () => {
    const snapshot = captureRubricLevels([
      row({
        submittedAt: new Date('2026-01-01T00:00:00.000Z'),
        numericPercentage: 60,
        rubricScores: { evidence_and_support: 4, voice_and_style: 3 },
      }),
      row({
        submittedAt: new Date('2026-03-01T00:00:00.000Z'),
        numericPercentage: 80,
        rubricScores: { evidence_and_support: 2, voice_and_style: 4 },
      }),
    ]);

    expect(snapshot.averagePercentage).toBe(70);
    // Latest level per category (chronologically last submission).
    expect(snapshot.rubricLevels).toEqual({
      evidence_and_support: 2,
      voice_and_style: 4,
    });
  });
});

describe('buildPlanProgress', () => {
  const baseline: PlanBaseline = {
    capturedAt: '2026-03-01T00:00:00.000Z',
    averagePercentage: 70,
    rubricLevels: { evidence_and_support: 2, organization_and_structure: 3 },
  };

  test('measures average and per-target-skill movement since the baseline', () => {
    const currentRows: GradedSubmissionRow[] = [
      row({
        submittedAt: new Date('2026-04-01T00:00:00.000Z'),
        numericPercentage: 78,
        rubricScores: {
          evidence_and_support: 3,
          organization_and_structure: 3,
        },
      }),
    ];

    const progress = buildPlanProgress(
      baseline,
      ['evidence_and_support', 'organization_and_structure'],
      currentRows
    );

    expect(progress.averagePercentage).toEqual({
      baseline: 70,
      current: 78,
      delta: 8,
    });
    const evidence = progress.skills.find(
      (s) => s.category === 'evidence_and_support'
    )!;
    expect(evidence).toMatchObject({
      baselineLevel: 2,
      currentLevel: 3,
      delta: 1,
    });
    const organization = progress.skills.find(
      (s) => s.category === 'organization_and_structure'
    )!;
    expect(organization.delta).toBe(0);
  });

  test('reports null deltas when the current data lacks a targeted skill', () => {
    const progress = buildPlanProgress(
      baseline,
      ['evidence_and_support'],
      [row({ numericPercentage: null, rubricScores: null })]
    );
    const evidence = progress.skills[0];
    expect(evidence.baselineLevel).toBe(2);
    expect(evidence.currentLevel).toBeNull();
    expect(evidence.delta).toBeNull();
    expect(progress.averagePercentage.delta).toBeNull();
  });
});
