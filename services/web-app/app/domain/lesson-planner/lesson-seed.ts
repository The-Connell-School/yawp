/**
 * The seam between the Class Summary and the Lesson Planner.
 *
 * A Class Summary next step already names a concrete teaching move and the
 * rubric skill it targets. Rather than making the teacher retype it, the
 * "Plan this lesson" link carries ids and this module rebuilds the opening ask
 * from the stored summary — so the text handed to the model is always the text
 * Yawp generated, not something a URL could rewrite.
 */
import { rubricCategories } from '~/domain/grading/rubric';
import type {
  ClassInsightSummary,
  TeachingNextStep,
} from '~/domain/assignment-insights/class-insight-synthesis';

export type LessonSeed = {
  /** The pre-filled opening message for the composer. */
  prompt: string;
  /** One line of provenance for the "from your class summary" banner. */
  context: string;
};

const labelByKey = new Map<string, string>(
  rubricCategories.map((category) => [category.key, category.label])
);

function humanizeRubricKey(key: string): string {
  return (
    labelByKey.get(key) ??
    key
      .replace(/_and_/g, '/')
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase())
  );
}

/**
 * Resolve the `step` query parameter against a summary's next steps. Anything
 * that is not a real index of a real step resolves to null, and the caller
 * treats that as "no seed" rather than guessing at a different lesson.
 */
export function pickNextStep(
  summary: ClassInsightSummary,
  rawIndex: string | null
): TeachingNextStep | null {
  const index = rawIndex === null ? 0 : Number(rawIndex);
  if (!Number.isInteger(index) || index < 0) return null;
  return summary.nextSteps[index] ?? null;
}

export function buildLessonSeed({
  step,
  className,
  assignmentTitle,
}: {
  step: TeachingNextStep;
  className: string | null;
  assignmentTitle: string | null;
}): LessonSeed {
  const skill = humanizeRubricKey(step.rubricCategory);
  const forClass = className ? ` for ${className}` : '';
  const afterAssignment = assignmentTitle
    ? ` They just finished "${assignmentTitle}".`
    : '';

  const prompt = [
    `Yawp's class summary${forClass} recommended this next teaching move: "${step.title}" — ${step.detail}`,
    `It targets the ${skill} rubric skill.${afterAssignment}`,
    '',
    'Build me a lesson that does it. Ask me anything you need to know about this class first.',
  ].join('\n');

  const context = [
    className ? `${className}: ` : '',
    `“${step.title}” · ${skill}`,
  ].join('');

  return { prompt, context };
}
