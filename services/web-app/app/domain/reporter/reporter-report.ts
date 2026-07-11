/**
 * Pure report-shaping logic for the Yawp Reporter.
 *
 * These functions take already-fetched, teacher-scoped submission rows and
 * turn them into the aggregate shapes the reporter chat surfaces (class grade
 * summaries, per-student growth series). Keeping them free of Prisma makes the
 * grading math independently unit-testable.
 */
import { rubricCategories } from '~/domain/grading/rubric';

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

// Single source of truth: the canonical grading rubric. Deriving labels here
// (rather than hand-maintaining a second copy) keeps the reporter's language
// matched to the rubric teachers actually grade against, so it never renames a
// skill or drifts from Brian's rubric.
const RUBRIC_LABELS: Record<string, string> = Object.fromEntries(
  rubricCategories.map((category) => [category.key, category.label])
);

/** Human-readable label for a rubric category key. */
export function humanizeRubricCategory(category: string): string {
  if (RUBRIC_LABELS[category]) return RUBRIC_LABELS[category];
  const spaced = category.replace(/_/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * Order rubric categories in a stable, readable order: the known rubric
 * sequence first, then any unrecognized categories alphabetically.
 */
function orderRubricCategories(categories: Iterable<string>): string[] {
  const knownOrder = Object.keys(RUBRIC_LABELS);
  return [...new Set(categories)].sort((a, b) => {
    const ia = knownOrder.indexOf(a);
    const ib = knownOrder.indexOf(b);
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return a.localeCompare(b);
  });
}

export type ClassRubricSummary = {
  category: string;
  label: string;
  /** Mean rubric level (typically 1–5) across every scored submission, 1 dp. */
  averageLevel: number;
  scoredCount: number;
};

/**
 * Average each rubric category across every scored submission in a class, so
 * the reporter can answer "which writing skill is my class weakest in?" from a
 * single class report instead of walking student by student.
 */
export function summarizeClassRubrics(
  rows: GradedSubmissionRow[]
): ClassRubricSummary[] {
  const byCategory = new Map<string, number[]>();
  for (const row of rows) {
    if (!row.rubricScores) continue;
    for (const [category, value] of Object.entries(row.rubricScores)) {
      if (typeof value !== 'number' || Number.isNaN(value)) continue;
      const existing = byCategory.get(category);
      if (existing) existing.push(value);
      else byCategory.set(category, [value]);
    }
  }

  const summaries: ClassRubricSummary[] = [];
  for (const category of orderRubricCategories(byCategory.keys())) {
    const values = byCategory.get(category);
    if (!values || values.length === 0) continue;
    const mean =
      values.reduce((sum, value) => sum + value, 0) / values.length;
    summaries.push({
      category,
      label: humanizeRubricCategory(category),
      averageLevel: Math.round(mean * 10) / 10,
      scoredCount: values.length,
    });
  }

  return summaries;
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

  const ordered = orderRubricCategories(categories);

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

export type RubricLevelSnapshot = {
  /** Overall average percentage at capture, or null if ungraded. */
  averagePercentage: number | null;
  /** Latest rubric level per category at capture, keyed by category. */
  rubricLevels: Record<string, number>;
};

/**
 * Snapshot a student's current standing — overall average plus the latest level
 * in each rubric category — so a growth plan can record a baseline and later
 * reports can measure movement against it.
 */
export function captureRubricLevels(
  rows: GradedSubmissionRow[]
): RubricLevelSnapshot {
  const [summary] = summarizeStudentGrades(rows);
  const rubricLevels: Record<string, number> = {};
  for (const trend of buildRubricTrends(rows)) {
    rubricLevels[trend.category] = trend.latest;
  }
  return {
    averagePercentage: summary?.averagePercentage ?? null,
    rubricLevels,
  };
}

export type PlanBaseline = RubricLevelSnapshot & { capturedAt: string };

export type PlanSkillProgress = {
  category: string;
  label: string;
  baselineLevel: number | null;
  currentLevel: number | null;
  delta: number | null;
};

export type PlanProgress = {
  averagePercentage: {
    baseline: number | null;
    current: number | null;
    delta: number | null;
  };
  skills: PlanSkillProgress[];
};

/**
 * Measure a student's movement since a growth plan's baseline: the change in
 * overall average and, for each skill the plan targets, the baseline vs current
 * rubric level. This is what lets a later report say "since the plan, evidence
 * & analysis moved from 2 to 3."
 */
export function buildPlanProgress(
  baseline: PlanBaseline,
  targetSkills: string[],
  currentRows: GradedSubmissionRow[]
): PlanProgress {
  const current = captureRubricLevels(currentRows);
  const skills = orderRubricCategories(targetSkills).map((category) => {
    const baselineLevel = baseline.rubricLevels[category] ?? null;
    const currentLevel = current.rubricLevels[category] ?? null;
    const delta =
      baselineLevel != null && currentLevel != null
        ? currentLevel - baselineLevel
        : null;
    return {
      category,
      label: humanizeRubricCategory(category),
      baselineLevel,
      currentLevel,
      delta,
    };
  });

  const baselineAvg = baseline.averagePercentage;
  const currentAvg = current.averagePercentage;
  return {
    averagePercentage: {
      baseline: baselineAvg,
      current: currentAvg,
      delta:
        baselineAvg != null && currentAvg != null
          ? currentAvg - baselineAvg
          : null,
    },
    skills,
  };
}

export type AttentionFlag =
  | { type: 'below_average'; averagePercentage: number; threshold: number }
  | { type: 'low_latest_grade'; latestPercentage: number; threshold: number }
  | { type: 'declining_overall'; deltaPercentage: number }
  | {
      type: 'declining_skill';
      category: string;
      label: string;
      first: number;
      latest: number;
    };

export type StudentAttention = {
  studentMembershipId: string;
  studentName: string;
  gradedCount: number;
  averagePercentage: number | null;
  latestPercentage: number | null;
  latestLetterGrade: string | null;
  deltaPercentage: number | null;
  trend: GrowthTrend;
  flags: AttentionFlag[];
  /** Higher = more concerning. Used to rank who to look at first. */
  severity: number;
};

export type AttentionOptions = {
  /** Averages/latest grades below this (0–100) are flagged. Default 70. */
  averageThreshold?: number;
  /** Ignore students with fewer than this many graded papers. Default 1. */
  minGraded?: number;
};

/**
 * Scan every graded submission a teacher can see and surface the students who
 * look like they need attention — below a grade threshold, trending down
 * overall, or slipping on specific writing skills — ranked by severity. Runs
 * over rows already fetched in one query, so "who needs attention across my
 * classes?" is a single aggregation rather than a per-student walk.
 */
export function findStudentsNeedingAttention(
  rows: GradedSubmissionRow[],
  options: AttentionOptions = {}
): StudentAttention[] {
  const threshold = options.averageThreshold ?? 70;
  const minGraded = options.minGraded ?? 1;

  const byStudent = new Map<string, GradedSubmissionRow[]>();
  for (const row of rows) {
    const existing = byStudent.get(row.studentMembershipId);
    if (existing) existing.push(row);
    else byStudent.set(row.studentMembershipId, [row]);
  }

  const results: StudentAttention[] = [];
  for (const [studentMembershipId, studentRows] of byStudent) {
    if (studentRows.length < minGraded) continue;

    const [summary] = summarizeStudentGrades(studentRows);
    const growth = buildGrowthSeries(studentRows);
    const rubricTrends = buildRubricTrends(studentRows);
    const average = summary?.averagePercentage ?? null;

    const flags: AttentionFlag[] = [];
    let severity = 0;

    if (average != null && average < threshold) {
      flags.push({ type: 'below_average', averagePercentage: average, threshold });
      severity += (threshold - average) * 1.5;
    }

    if (
      growth.latestPercentage != null &&
      growth.latestPercentage < threshold
    ) {
      flags.push({
        type: 'low_latest_grade',
        latestPercentage: growth.latestPercentage,
        threshold,
      });
      severity += threshold - growth.latestPercentage;
    }

    if (growth.trend === 'declining' && growth.deltaPercentage != null) {
      flags.push({
        type: 'declining_overall',
        deltaPercentage: growth.deltaPercentage,
      });
      severity += Math.abs(growth.deltaPercentage);
    }

    for (const trend of rubricTrends) {
      if (trend.direction === 'declining') {
        flags.push({
          type: 'declining_skill',
          category: trend.category,
          label: trend.label,
          first: trend.first,
          latest: trend.latest,
        });
        severity += Math.abs(trend.delta) * 3;
      }
    }

    if (flags.length === 0) continue;

    results.push({
      studentMembershipId,
      studentName: summary?.studentName ?? 'Unknown student',
      gradedCount: studentRows.length,
      averagePercentage: average,
      latestPercentage: growth.latestPercentage,
      latestLetterGrade: summary?.latestLetterGrade ?? null,
      deltaPercentage: growth.deltaPercentage,
      trend: growth.trend,
      flags,
      severity: Math.round(severity),
    });
  }

  return results.sort(
    (a, b) =>
      b.severity - a.severity || a.studentName.localeCompare(b.studentName)
  );
}
