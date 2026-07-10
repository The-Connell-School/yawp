/**
 * Pure report-shaping logic for the Yawp Reporter.
 *
 * These functions take already-fetched, teacher-scoped submission rows and
 * turn them into the aggregate shapes the reporter chat surfaces (class grade
 * summaries, per-student growth series). Keeping them free of Prisma makes the
 * grading math independently unit-testable.
 */

export type GradedSubmissionRow = {
  submissionId: string;
  studentMembershipId: string;
  studentName: string;
  assignmentTitle: string;
  submittedAt: Date;
  numericPercentage: number | null;
  letterGrade: string | null;
};

export type StudentGradeSummary = {
  studentMembershipId: string;
  studentName: string;
  gradedCount: number;
  averagePercentage: number | null;
  latestLetterGrade: string | null;
};

export type GrowthPoint = {
  submissionId: string;
  assignmentTitle: string;
  submittedAt: string;
  numericPercentage: number | null;
  letterGrade: string | null;
};

export type GrowthTrend = 'improving' | 'declining' | 'steady' | 'insufficient';

export type GrowthSeries = {
  points: GrowthPoint[];
  firstPercentage: number | null;
  latestPercentage: number | null;
  deltaPercentage: number | null;
  trend: GrowthTrend;
};

/**
 * Average of the defined numeric values, rounded to the nearest integer.
 * Returns null when there is nothing to average.
 */
export function averagePercentage(
  values: Array<number | null | undefined>
): number | null {
  const defined = values.filter(
    (value): value is number =>
      typeof value === 'number' && !Number.isNaN(value)
  );
  if (defined.length === 0) return null;
  const total = defined.reduce((sum, value) => sum + value, 0);
  return Math.round(total / defined.length);
}

function sortBySubmittedAtAsc<T extends { submittedAt: Date }>(rows: T[]): T[] {
  return [...rows].sort(
    (a, b) => a.submittedAt.getTime() - b.submittedAt.getTime()
  );
}

/**
 * Group graded submissions by student and compute each student's average
 * percentage and most-recent letter grade. Students are returned sorted by
 * name for stable, readable output.
 */
export function summarizeStudentGrades(
  rows: GradedSubmissionRow[]
): StudentGradeSummary[] {
  const byStudent = new Map<string, GradedSubmissionRow[]>();
  for (const row of rows) {
    const existing = byStudent.get(row.studentMembershipId);
    if (existing) {
      existing.push(row);
    } else {
      byStudent.set(row.studentMembershipId, [row]);
    }
  }

  const summaries: StudentGradeSummary[] = [];
  for (const [studentMembershipId, studentRows] of byStudent) {
    const chronological = sortBySubmittedAtAsc(studentRows);
    const latestWithLetter = [...chronological]
      .reverse()
      .find((row) => row.letterGrade != null);
    summaries.push({
      studentMembershipId,
      studentName: chronological[0]?.studentName ?? 'Unknown student',
      gradedCount: studentRows.length,
      averagePercentage: averagePercentage(
        studentRows.map((row) => row.numericPercentage)
      ),
      latestLetterGrade: latestWithLetter?.letterGrade ?? null,
    });
  }

  return summaries.sort((a, b) => a.studentName.localeCompare(b.studentName));
}

/**
 * Build a chronological growth series for a single student's graded
 * submissions, including the first→latest delta and a coarse trend label.
 */
export function buildGrowthSeries(rows: GradedSubmissionRow[]): GrowthSeries {
  const chronological = sortBySubmittedAtAsc(rows);
  const points: GrowthPoint[] = chronological.map((row) => ({
    submissionId: row.submissionId,
    assignmentTitle: row.assignmentTitle,
    submittedAt: row.submittedAt.toISOString(),
    numericPercentage: row.numericPercentage,
    letterGrade: row.letterGrade,
  }));

  const scored = chronological.filter(
    (row): row is GradedSubmissionRow & { numericPercentage: number } =>
      typeof row.numericPercentage === 'number'
  );

  if (scored.length < 2) {
    return {
      points,
      firstPercentage: scored[0]?.numericPercentage ?? null,
      latestPercentage: scored[0]?.numericPercentage ?? null,
      deltaPercentage: null,
      trend: 'insufficient',
    };
  }

  const firstPercentage = scored[0].numericPercentage;
  const latestPercentage = scored[scored.length - 1].numericPercentage;
  const deltaPercentage = latestPercentage - firstPercentage;
  const trend: GrowthTrend =
    deltaPercentage > 2
      ? 'improving'
      : deltaPercentage < -2
        ? 'declining'
        : 'steady';

  return {
    points,
    firstPercentage,
    latestPercentage,
    deltaPercentage,
    trend,
  };
}
