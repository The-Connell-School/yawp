import {
  defaultInsightRubricCategories,
  type InsightRubricCategory,
} from './insight-rubric-categories';
import {
  readRubricEntryScore,
  type GradedSubmissionInput,
} from './aggregate-rubric-performance';

/** Scores at or below this suggest a student needs support in a category. */
const LOW_SCORE_THRESHOLD = 2;
/** Scores at or above this mark a student as strong in a category. */
const HIGH_SCORE_THRESHOLD = 4;
/** Keep the panel a starting point, not a report: cap the groups shown. */
const MAX_FOCUS_GROUPS = 3;
/** Cap individual callouts so the section stays scannable. */
const MAX_INDIVIDUALS = 4;

export type DifferentiationInput = GradedSubmissionInput & {
  /** Link to the student's graded submission, when available. */
  href?: string | null;
};

export type DifferentiationStudent = {
  name: string;
  href: string | null;
};

/** Students who scored low on the same rubric category — a natural small group. */
export type DifferentiationGroup = {
  category: string;
  label: string;
  students: DifferentiationStudent[];
};

export type DifferentiationFlagKind = 'support' | 'extension';

/** An individual student whose overall pattern stands out from the class. */
export type DifferentiationFlag = {
  kind: DifferentiationFlagKind;
  student: DifferentiationStudent;
  /** Labels of the categories driving the flag, for grounded UI copy. */
  categoryLabels: string[];
};

export type DifferentiationSummary = {
  focusGroups: DifferentiationGroup[];
  individuals: DifferentiationFlag[];
};

type StudentProfile = {
  student: DifferentiationStudent;
  scores: Map<string, number>;
  averageScore: number;
};

function toStudent(input: DifferentiationInput): DifferentiationStudent {
  const name =
    typeof input.studentName === 'string' && input.studentName.trim()
      ? input.studentName.trim()
      : 'Unknown student';
  return { name, href: input.href ?? null };
}

function buildProfiles(
  inputs: DifferentiationInput[],
  rubricCategories: InsightRubricCategory[]
): StudentProfile[] {
  const profiles: StudentProfile[] = [];
  for (const input of inputs) {
    const scores = new Map<string, number>();
    for (const category of rubricCategories) {
      const score = readRubricEntryScore(input.rubricScores?.[category.key]);
      if (score !== null) scores.set(category.key, score);
    }
    if (scores.size === 0) continue;
    const total = [...scores.values()].reduce((sum, value) => sum + value, 0);
    profiles.push({
      student: toStudent(input),
      scores,
      averageScore: total / scores.size,
    });
  }
  return profiles;
}

/**
 * Derive light-touch differentiation starting points from graded submissions:
 * small groups of students who struggled with the same rubric category, plus
 * individuals whose overall pattern stands out (broadly struggling, or strong
 * everywhere and ready for more). Purely deterministic — student identities
 * never reach the LLM. Returns null when the data doesn't suggest anything,
 * so callers can omit the section entirely.
 */
export function buildDifferentiation(
  inputs: DifferentiationInput[],
  rubricCategories: InsightRubricCategory[] = defaultInsightRubricCategories()
): DifferentiationSummary | null {
  const profiles = buildProfiles(inputs, rubricCategories);
  if (profiles.length < 2) return null;

  const focusGroups: DifferentiationGroup[] = [];
  for (const category of rubricCategories) {
    const scored = profiles.filter((p) => p.scores.has(category.key));
    const low = scored
      .filter(
        (p) => (p.scores.get(category.key) as number) <= LOW_SCORE_THRESHOLD
      )
      .sort(
        (a, b) =>
          (a.scores.get(category.key) as number) -
            (b.scores.get(category.key) as number) ||
          a.student.name.localeCompare(b.student.name)
      );
    // A group needs at least two students; when most of the class is low the
    // gap is whole-class reteaching (already covered by next steps), not a
    // pull-out group.
    if (low.length < 2 || low.length > Math.ceil(scored.length / 2)) continue;
    focusGroups.push({
      category: category.key,
      label: category.label,
      students: low.map((p) => p.student),
    });
  }
  focusGroups.sort((a, b) => b.students.length - a.students.length);
  focusGroups.splice(MAX_FOCUS_GROUPS);

  const support = profiles
    .filter((p) => {
      const lowCount = [...p.scores.values()].filter(
        (score) => score <= LOW_SCORE_THRESHOLD
      ).length;
      // Low in at least two categories and in half or more of what was
      // scored: the pattern is the student, not a single skill.
      return lowCount >= 2 && lowCount * 2 >= p.scores.size;
    })
    .sort((a, b) => a.averageScore - b.averageScore)
    .map(
      (p): DifferentiationFlag => ({
        kind: 'support',
        student: p.student,
        categoryLabels: rubricCategories
          .filter(
            (category) =>
              (p.scores.get(category.key) ?? Infinity) <= LOW_SCORE_THRESHOLD
          )
          .map((category) => category.label),
      })
    );

  const extension = profiles
    .filter(
      (p) =>
        p.scores.size >= 2 &&
        [...p.scores.values()].every((score) => score >= HIGH_SCORE_THRESHOLD)
    )
    .sort((a, b) => b.averageScore - a.averageScore)
    .map(
      (p): DifferentiationFlag => ({
        kind: 'extension',
        student: p.student,
        categoryLabels: rubricCategories
          .filter((category) => p.scores.has(category.key))
          .map((category) => category.label),
      })
    );

  const individuals = [...support, ...extension].slice(0, MAX_INDIVIDUALS);

  if (focusGroups.length === 0 && individuals.length === 0) return null;
  return { focusGroups, individuals };
}
