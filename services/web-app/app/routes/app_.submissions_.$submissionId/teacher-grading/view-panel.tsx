import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '~/components/ui/accordion';
import { formatPointGrade } from '~/domain/grading/gradeMath';
import { hasRecordedGrade } from '~/domain/grading/recorded-grade';
import { isScored } from '~/domain/grading/rubric-display';

export type ViewPanelSubmission = {
  numericPercentage: number | null;
  letterGrade: string | null;
  overallScore?: number | null;
  score?: string | null;
  overallComment: string | null;
  rubricScores: unknown;
  /** The scale this rubric was scored on, so rows read against it. */
  rubricConfig?: { minScore: number; maxScore: number } | null;
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
  // A grade exists when this rubric's own scale recorded one. A points scale
  // records raw points and never a percentage, so asking for a percentage
  // here showed a fully graded Daily Pages entry as "Not yet graded".
  const hasGrade = isSubmittedForGrade && hasRecordedGrade(submission);
  const pointGrade = !isSubmittedForGrade
    ? null
    : formatPointGrade(
        submission.numericPercentage,
        submission.document?.assignment?.pointValue ?? null
      );
  const percentageDisplay =
    submission.numericPercentage != null
      ? `${submission.numericPercentage}%${
          submission.letterGrade ? ` (${submission.letterGrade})` : ''
        }`
      : null;
  const overallGradeDisplay =
    pointGrade ?? percentageDisplay ?? submission.score ?? null;

  return (
    <div className="p-4 space-y-4">
      {hasGrade ? (
        <>
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
          </div>
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
          {rubricEntries.length > 0 ? (
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
