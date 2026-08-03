import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '~/components/ui/accordion';
import { formatPointGrade } from '~/domain/grading/gradeMath';

export type ViewPanelSubmission = {
  numericPercentage: number | null;
  letterGrade: string | null;
  overallComment: string | null;
  rubricScores: unknown;
  document?: {
    assignment?: {
      submitForGrade: boolean;
      pointValue: number | null;
    } | null;
  };
};

/** Read-only grade fields for student view / teacher view mode. */
export function ViewPanel({ submission }: { submission: ViewPanelSubmission }) {
  const rawRubric = (submission.rubricScores ?? {}) as Record<
    string,
    number | { score: number; comment?: string }
  >;
  const rubricEntries = Object.entries(rawRubric).map(([key, val]) => {
    const score =
      typeof val === 'object' && val !== null
        ? (val as { score: number }).score
        : (val as number);
    const comment =
      typeof val === 'object' && val !== null
        ? (val as { comment?: string }).comment
        : undefined;
    return { key, score, comment };
  });
  const hasGrade =
    submission.document?.assignment?.submitForGrade !== false &&
    submission.numericPercentage != null;
  const pointGrade =
    submission.document?.assignment?.submitForGrade === false
      ? null
      : formatPointGrade(
          submission.numericPercentage,
          submission.document?.assignment?.pointValue ?? null
        );

  return (
    <div className="p-4 space-y-4">
      {hasGrade ? (
        <>
          <div>
            <h3 className="text-sm font-medium text-muted-foreground">
              Overall Grade
            </h3>
            <p className="text-2xl font-semibold">
              {pointGrade ??
                `${submission.numericPercentage}%${
                  submission.letterGrade ? ` (${submission.letterGrade})` : ''
                }`}
            </p>
            {pointGrade ? (
              <p className="text-sm text-muted-foreground">
                {submission.numericPercentage}%
                {submission.letterGrade ? ` (${submission.letterGrade})` : ''}
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
                        <span className="text-muted-foreground">{score}/5</span>
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
