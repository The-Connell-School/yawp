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
  /** Per-rubric-category scores (typically 1–5), keyed by category. */
  rubricScores?: Record<string, number> | null;
  /** The teacher's / assistant's overall written comment on the submission. */
  overallComment?: string | null;
};

export type RubricTrend = {
  category: string;
  label: string;
  first: number;
  latest: number;
  delta: number;
  direction: 'improving' | 'declining' | 'steady';
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

const RUBRIC_LABELS: Record<string, string> = {
  thesis_and_content: 'Thesis & content',
  organization_and_structure: 'Organization & structure',
  evidence_and_support: 'Evidence & analysis',
  voice_and_style: 'Voice & style',
  grammar_and_mechanics: 'Grammar & mechanics',
};

/** Human-readable label for a rubric category key. */
export function humanizeRubricCategory(category: string): string {
  if (RUBRIC_LABELS[category]) return RUBRIC_LABELS[category];
  const spaced = category.replace(/_/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * Compute first→latest movement for each rubric category across a student's
 * submissions, so the reporter can talk about *which writing skills* are
 * improving or slipping — not just the overall grade. Categories are returned
 * in a stable order (known rubric order first, then any extras alphabetically).
 */
export function buildRubricTrends(rows: GradedSubmissionRow[]): RubricTrend[] {
  const chronological = sortBySubmittedAtAsc(rows);
  const categories = new Set<string>();
  for (const row of chronological) {
    if (row.rubricScores) {
      for (const key of Object.keys(row.rubricScores)) categories.add(key);
    }
  }

  const knownOrder = Object.keys(RUBRIC_LABELS);
  const ordered = [...categories].sort((a, b) => {
    const ia = knownOrder.indexOf(a);
    const ib = knownOrder.indexOf(b);
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return a.localeCompare(b);
  });

  const trends: RubricTrend[] = [];
  for (const category of ordered) {
    const scored = chronological
      .map((row) => row.rubricScores?.[category])
      .filter((value): value is number => typeof value === 'number');
    if (scored.length === 0) continue;
    const first = scored[0];
    const latest = scored[scored.length - 1];
    const delta = latest - first;
    trends.push({
      category,
      label: humanizeRubricCategory(category),
      first,
      latest,
      delta,
      direction: delta > 0 ? 'improving' : delta < 0 ? 'declining' : 'steady',
    });
  }

  return trends;
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
