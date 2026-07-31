import {
  AP_HISTORY_DBQ_RUBRIC_POINTS,
  AP_HISTORY_LEQ_RUBRIC_POINTS,
  type ApHistoryRubricPoint,
} from '~/domain/ap-history/rubric';

type Props = {
  audience: 'teacher' | 'student';
};

// Sits directly above the prompt library so the rubric is visible before a
// prompt is chosen. The tutor coaches these points and the grader scores them,
// but neither one is a place to go read what "complexity" means.
export function ApHistoryGradingBreakdown({ audience }: Props) {
  return (
    <section className="mb-6 rounded-lg border bg-muted/40 p-4">
      <h3 className="mb-2 text-base font-semibold">
        How DBQs and LEQs are graded
      </h3>
      <p className="mb-4 text-sm text-muted-foreground">
        {audience === 'teacher' ? (
          <>
            Every point below is all-or-nothing — a student either earns it or
            doesn&rsquo;t, and grammar or spelling slips never cost one. The
            tutor coaches toward these points while students write; after they
            submit, the AI returns feedback point by point for you to review and
            override before releasing grades.
          </>
        ) : (
          <>
            Every point below is all-or-nothing — you either earn it or you
            don&rsquo;t, and grammar or spelling slips never cost you a point.
            Your tutor coaches toward these points while you write, and your
            feedback comes back point by point after you submit.
          </>
        )}
      </p>
      <div className="grid gap-6 sm:grid-cols-2">
        <RubricColumn
          title="DBQ"
          subtitle={`${AP_HISTORY_DBQ_RUBRIC_POINTS.length} points`}
          points={AP_HISTORY_DBQ_RUBRIC_POINTS}
        />
        <RubricColumn
          title="LEQ"
          subtitle={`${AP_HISTORY_LEQ_RUBRIC_POINTS.length} points`}
          points={AP_HISTORY_LEQ_RUBRIC_POINTS}
        />
      </div>
    </section>
  );
}

function RubricColumn({
  title,
  subtitle,
  points,
}: {
  title: string;
  subtitle: string;
  points: readonly ApHistoryRubricPoint[];
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {title} &mdash; {subtitle}
      </p>
      <ol className="list-decimal space-y-1.5 pl-5 text-sm text-foreground/80">
        {points.map((point) => (
          <li key={point.key}>
            <span className="font-medium text-foreground">{point.label}</span>{' '}
            &mdash; {point.summary}
          </li>
        ))}
      </ol>
    </div>
  );
}
