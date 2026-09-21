import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '~/components/ui/accordion';
import { formatAssignmentGrade, formatPointGrade } from '~/domain/grading/gradeMath';
import { hasRecordedGrade } from '~/domain/grading/recorded-grade';
import { isScored } from '~/domain/grading/rubric-display';
import { getCategoryScoreBand } from '~/domain/assignment-types/rubric-category-options';
import type { RubricScoreBand } from '~/domain/assignment-types/assignment-type-rubric.shared';

export type ViewPanelSubmission = {
  numericPercentage: number | null;
  letterGrade: string | null;
  overallScore?: number | null;
  score?: string | null;
  overallComment: string | null;
  rubricScores: unknown;
  /**
   * The scale this rubric was scored on, so rows read against it. `categories`
   * carries the bands the grader chose from, which the route already passes
   * through -- the panel only ever narrowed them away.
   */
  rubricConfig?: {
    minScore: number;
    maxScore: number;
    categories?: {
      key: string;
      label?: string;
      bands?: RubricScoreBand[];
    }[];
  } | null;
  document?: {
    assignment?: {
      submitForGrade: boolean;
      pointValue: number | null;
    } | null;
  };
};

/** Read-only grade fields for student view / teacher view mode. */
export function ViewPanel({ submission }: { submission: ViewPanelSubmission }) {
  const minScore = submission.rubricConfig?.minScore ?? 1;
  const maxScore = submission.rubricConfig?.maxScore ?? 5;
  const rawRubric = (submission.rubricScores ?? {}) as Record<
    string,
    number | { score: number | null; comment?: string }
  >;
  const rubricEntries = Object.entries(rawRubric)
    .map(([key, val]) => {
      const score =
        typeof val === 'object' && val !== null
          ? (val as { score: number | null }).score
          : (val as number);
      const comment =
        typeof val === 'object' && val !== null
          ? (val as { comment?: string }).comment
          : undefined;
      return { key, score, comment };
    })
    // A category nobody scored has nothing to report to the student.
    .filter((entry) => isScored(entry.score, minScore));

  const isSubmittedForGrade =
    submission.document?.assignment?.submitForGrade !== false;
  /**
   * Whether this was read and scored at all. A points scale records raw points
   * and never a percentage, so asking for a percentage here showed a fully
   * graded Daily Pages entry as "Not yet graded".
   *
   * Deliberately not conditioned on `submitForGrade`. Work that is not for a
   * grade is still assessed -- an exit ticket read for understanding is the
   * common case -- and folding the two together hid the feedback and the rubric
   * along with the grade, leaving the submission looking untouched.
   */
  const hasAssessment = hasRecordedGrade(submission);
  /** Only work submitted for a grade shows one. */
  const showsGrade = isSubmittedForGrade && hasAssessment;
  const overallGradeDisplay = formatAssignmentGrade({
    submitForGrade: isSubmittedForGrade,
    numericPercentage: submission.numericPercentage,
    pointValue:
      submission.document?.assignment?.pointValue ??
      (submission.numericPercentage != null ? 100 : null),
    score: submission.score,
  });
  const pointGrade = !isSubmittedForGrade
    ? null
    : formatPointGrade(
        submission.numericPercentage,
        submission.document?.assignment?.pointValue ?? null
      );
  /**
   * The band the grader landed in, when the whole rubric is one banded
   * category. That is the shape of every exit ticket, Daily Pages entry and
   * Class Starter: the model picks the band from its description first and
   * only then a score inside it, so the band is the judgement and the number
   * is the refinement. Showing the number alone published the refinement and
   * threw the judgement away.
   */
  const soleEntry = rubricEntries.length === 1 ? rubricEntries[0] : null;
  const soleBand =
    soleEntry && soleEntry.score != null
      ? getCategoryScoreBand(
          {
            bands: submission.rubricConfig?.categories?.find(
              (category) => category.key === soleEntry.key
            )?.bands,
          },
          soleEntry.score
        )
      : null;
  /**
   * With one category at weight 1 the category score IS the overall score, so
   * a row carrying no comment of its own can only restate the grade -- and its
   * disclosure opened onto "No feedback for this category". Dropped, but only
   * once the band is standing in for it: a rubric with no bands keeps the row,
   * because then it is the only sign the work was read at all.
   */
  const rubricRestatesTheGrade =
    soleEntry != null && !soleEntry.comment?.trim() && soleBand != null;

  const percentageDisplay =
    submission.numericPercentage != null
      ? `${submission.numericPercentage}%${
          submission.letterGrade ? ` (${submission.letterGrade})` : ''
        }`
      : null;

  return (
    <div className="p-4 space-y-4">
      {hasAssessment ? (
        <>
          {showsGrade ? (
            <div>
              <h3 className="text-sm font-medium text-muted-foreground">
                Overall Grade
              </h3>
              <p className="text-2xl font-semibold">{overallGradeDisplay}</p>
              {pointGrade && percentageDisplay ? (
                <p className="text-sm text-muted-foreground">
                  {percentageDisplay}
                </p>
              ) : null}
          {soleBand ? (
            <div className="mt-2">
              <span className="inline-flex items-center rounded-full border border-primary/25 bg-primary/[0.06] px-2.5 py-0.5 text-xs font-medium text-foreground/80">
                {soleBand.label}
              </span>
              {soleBand.description ? (
                <p className="mt-1.5 text-sm text-muted-foreground">
                  {soleBand.description}
                </p>
              ) : null}
            </div>
          ) : null}
            </div>
          ) : null}
          {/* Work assessed but not for a grade still reports what it was read
              as -- the band is the only assessment signal it has. */}
          {!showsGrade && soleBand ? (
            <div>
              <h3 className="text-sm font-medium text-muted-foreground">
                Assessed
              </h3>
          {soleBand ? (
            <div className="mt-1">
              <span className="inline-flex items-center rounded-full border border-primary/25 bg-primary/[0.06] px-2.5 py-0.5 text-xs font-medium text-foreground/80">
                {soleBand.label}
              </span>
              {soleBand.description ? (
                <p className="mt-1.5 text-sm text-muted-foreground">
                  {soleBand.description}
                </p>
              ) : null}
            </div>
          ) : null}
            </div>
          ) : null}
          {submission.overallComment ? (
            <div>
              <h3 className="text-sm font-medium text-muted-foreground">
                Overall Feedback
              </h3>
              <p className="mt-1 text-sm whitespace-pre-wrap">
                {submission.overallComment}
              </p>
            </div>
          ) : null}
          {rubricEntries.length > 0 && !rubricRestatesTheGrade ? (
            <div>
              <h3 className="text-sm font-medium text-muted-foreground">
                Rubric
              </h3>
              <Accordion type="multiple" className="mt-2">
                {rubricEntries.map(({ key, score, comment }) => (
                  <AccordionItem
                    key={key}
                    value={key}
                    className="border-b last:border-0"
                  >
                    <AccordionTrigger className="py-2 text-sm hover:no-underline">
                      <div className="flex w-full items-center justify-between pr-2">
                        <span className="font-medium">
                          {key
                            .replace(/_/g, ' ')
                            .replace(/\b\w/g, (c) => c.toUpperCase())}
                        </span>
                        <span className="text-muted-foreground">
                          {score}/{maxScore}
                        </span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      {comment ? (
                        <p className="text-xs text-muted-foreground whitespace-pre-wrap">
                          {comment}
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground italic">
                          No feedback for this category
                        </p>
                      )}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>
          ) : null}
        </>
      ) : (
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          <p className="text-sm font-medium text-muted-foreground">
            Not yet graded
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed max-w-[200px]">
            Your grade will appear here once the teacher has reviewed your
            submission.
          </p>
        </div>
      )}
    </div>
  );
}
