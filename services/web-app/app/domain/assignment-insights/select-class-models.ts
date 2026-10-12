import {
  readRubricEntryScore,
  type GradedSubmissionInput,
} from './aggregate-rubric-performance';
import {
  DEFAULT_INSIGHT_RUBRIC,
  isHighScore,
  isLowScore,
  scoreFraction,
  type InsightRubric,
  type InsightRubricCategory,
} from './insight-rubric';
import { toSubmissionSnippet } from './submission-snippet';

/** A short list the teacher can actually plan around, not a report. */
const MAX_FOCUSES = 2;

export type ClassModelInput = GradedSubmissionInput & {
  href: string;
  text?: string | null;
  html?: string | null;
};

/** One student's work, chosen to show the class. Teacher-facing only. */
export type ClassModelExample = {
  submissionId: string;
  studentName: string;
  href: string;
  snippet: string;
  score: number;
  maxScore: number;
};

/**
 * One rubric category the class could study together: a strong model of what
 * the skill looks like and, when there is one, an instructive example of a
 * fixable miss — each with questions for the teacher to think through before
 * putting the work in front of the class.
 */
export type ClassModelFocus = {
  category: string;
  label: string;
  exemplar: ClassModelExample | null;
  instructive: ClassModelExample | null;
  exemplarPrompts: string[];
  instructivePrompts: string[];
};

export type ClassModelsSummary = {
  focuses: ClassModelFocus[];
};

type Candidate = {
  input: ClassModelInput;
  name: string;
  snippet: string;
  scores: Map<string, number>;
  /** Mean position across the rubric, 0 to 1, so mixed ranges compare. */
  overall: number;
};

function buildCandidates(
  inputs: ClassModelInput[],
  rubric: InsightRubric
): Candidate[] {
  const candidates: Candidate[] = [];
  for (const input of inputs) {
    const scores = new Map<string, number>();
    const fractions: number[] = [];
    for (const category of rubric.categories) {
      const score = readRubricEntryScore(input.rubricScores?.[category.key]);
      if (score === null) continue;
      scores.set(category.key, score);
      const fraction = scoreFraction(category, score);
      if (fraction !== null) fractions.push(fraction);
    }
    if (scores.size === 0) continue;
    candidates.push({
      input,
      name: input.studentName?.trim() || 'Unknown student',
      snippet: toSubmissionSnippet(
        (typeof input.text === 'string' && input.text.trim()) ||
          (typeof input.html === 'string' && input.html) ||
          ''
      ),
      scores,
      overall: fractions.length
        ? fractions.reduce((sum, value) => sum + value, 0) / fractions.length
        : 0,
    });
  }
  return candidates;
}

function classAverageFraction(
  category: InsightRubricCategory,
  candidates: Candidate[]
): number | null {
  const fractions = candidates
    .map((candidate) => candidate.scores.get(category.key))
    .filter((score): score is number => score !== undefined)
    .map((score) => scoreFraction(category, score))
    .filter((fraction): fraction is number => fraction !== null);
  if (fractions.length === 0) return null;
  return fractions.reduce((sum, value) => sum + value, 0) / fractions.length;
}

function toExample(
  candidate: Candidate,
  category: InsightRubricCategory
): ClassModelExample {
  return {
    submissionId: candidate.input.submissionId,
    studentName: candidate.name,
    href: candidate.input.href,
    snippet: candidate.snippet,
    score: candidate.scores.get(category.key) as number,
    maxScore: category.maxScore,
  };
}

function exemplarPrompts(label: string): string[] {
  const skill = label.toLowerCase();
  return [
    `What exactly makes the ${skill} work here? Name the move you want every student to try.`,
    'Which sentence would you pause on when you show this to the class?',
  ];
}

function instructivePrompts(label: string): string[] {
  const skill = label.toLowerCase();
  return [
    `What is the one revision that would most improve the ${skill}?`,
    'Could the class revise this together, side by side with the strong model?',
    'Remove the student’s name before sharing, or ask them first.',
  ];
}

/**
 * Pick student work a teacher could use on purpose with the whole class: for
 * the class's weakest rubric categories, the strongest piece as a model and a
 * "near miss" as an instructive example — low in that category but solid
 * elsewhere, so the class sees one fixable problem rather than a struggling
 * student. A student is spotlighted as an instructive example at most once.
 *
 * Purely deterministic; student work never reaches an LLM. Returns null when
 * the graded work does not support a comparison.
 */
export function selectClassModels(
  inputs: ClassModelInput[],
  rubric: InsightRubric = DEFAULT_INSIGHT_RUBRIC
): ClassModelsSummary | null {
  const candidates = buildCandidates(inputs, rubric).filter(
    (candidate) => candidate.snippet.length > 0
  );
  if (candidates.length < 2) return null;

  const rankedCategories = rubric.categories
    .map((category) => ({
      category,
      average: classAverageFraction(category, candidates),
    }))
    .filter(
      (entry): entry is { category: InsightRubricCategory; average: number } =>
        entry.average !== null
    )
    .sort((a, b) => a.average - b.average);

  const usedInstructive = new Set<string>();
  const focuses: ClassModelFocus[] = [];

  for (const { category } of rankedCategories) {
    if (focuses.length >= MAX_FOCUSES) break;
    const scored = candidates.filter((candidate) =>
      candidate.scores.has(category.key)
    );
    const scoreOf = (candidate: Candidate) =>
      candidate.scores.get(category.key) as number;

    const exemplar =
      scored
        .filter((candidate) => isHighScore(category, scoreOf(candidate)))
        .sort(
          (a, b) =>
            scoreOf(b) - scoreOf(a) ||
            b.overall - a.overall ||
            a.name.localeCompare(b.name)
        )[0] ?? null;

    const instructive =
      scored
        .filter(
          (candidate) =>
            isLowScore(category, scoreOf(candidate)) &&
            !usedInstructive.has(candidate.input.submissionId) &&
            candidate.input.submissionId !== exemplar?.input.submissionId
        )
        // The near miss: the stronger the rest of the paper, the more the
        // class can see this one skill in isolation.
        .sort(
          (a, b) =>
            b.overall - a.overall ||
            scoreOf(b) - scoreOf(a) ||
            a.name.localeCompare(b.name)
        )[0] ?? null;

    if (!exemplar && !instructive) continue;
    if (instructive) usedInstructive.add(instructive.input.submissionId);

    focuses.push({
      category: category.key,
      label: category.label,
      exemplar: exemplar ? toExample(exemplar, category) : null,
      instructive: instructive ? toExample(instructive, category) : null,
      exemplarPrompts: exemplarPrompts(category.label),
      instructivePrompts: instructivePrompts(category.label),
    });
  }

  return focuses.length ? { focuses } : null;
}
