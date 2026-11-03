import type { GradingRubricSummary } from '~/domain/assignment-types/grading-rubric-summary';

/** Read-only summary of the rubric the Grading Assistant grades with. */
export function GradingRubricSummaryCard({
  summary,
}: {
  summary: GradingRubricSummary;
}) {
  return (
    <div
      data-testid="grading-rubric-summary"
      className="space-y-3 rounded-lg border bg-muted/30 px-4 py-3"
    >
      <div className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Grading Assistant uses
        </p>
        <p className="text-sm font-medium" data-testid="grading-rubric-source">
          {summary.sourceText}
        </p>
        <p
          className="text-sm text-muted-foreground"
          data-testid="grading-rubric-scale"
        >
          {summary.scaleText}
        </p>
      </div>
      {summary.categories.length > 0 ? (
        <ul className="space-y-2">
          {summary.categories.map((category) => (
            <li key={category.key} className="text-sm">
              <p data-testid="grading-rubric-category">
                {category.label} · {category.weightPercent}%
              </p>
              {category.levels.length > 0 ? (
                <ul className="mt-1 flex flex-wrap gap-1.5">
                  {category.levels.map((level) => (
                    <li
                      key={level}
                      data-testid="grading-rubric-level"
                      className="rounded border bg-background px-1.5 py-0.5 text-xs text-foreground/80"
                    >
                      {level}
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
