import { useFetcher } from 'react-router';
import { Loader2, Sparkles } from 'lucide-react';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';

type CategoryStatus = 'strength' | 'mixed' | 'gap';

type CategoryInsight = {
  key: string;
  label: string;
  status: CategoryStatus;
  summary: string;
};

type TeachingNextStep = {
  title: string;
  detail: string;
  rubricCategory: string;
};

export type ClassInsightSummary = {
  overview: string;
  categories: CategoryInsight[];
  nextSteps: TeachingNextStep[];
};

export type ClassInsight = {
  status: 'ready' | 'failed';
  submissionCount: number;
  generatedAt: string | null;
  summary: ClassInsightSummary | null;
};

type InsightActionData =
  | { success: true; insight: ClassInsight }
  | { success: false; message: string };

const STATUS_META: Record<
  CategoryStatus,
  { label: string; variant: 'success' | 'secondary' | 'warning-soft' }
> = {
  strength: { label: 'Strength', variant: 'success' },
  mixed: { label: 'Mixed', variant: 'secondary' },
  gap: { label: 'Needs work', variant: 'warning-soft' },
};

function CategoryRow({ category }: { category: CategoryInsight }) {
  const meta = STATUS_META[category.status] ?? STATUS_META.mixed;
  return (
    <li className="flex flex-col gap-1 rounded-lg border bg-card p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">{category.label}</span>
        <Badge variant={meta.variant} size="sm">
          {meta.label}
        </Badge>
      </div>
      <p className="text-sm text-muted-foreground">{category.summary}</p>
    </li>
  );
}

function InsightBody({ insight }: { insight: ClassInsight }) {
  const summary = insight.summary;
  if (!summary) return null;
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm">{summary.overview}</p>

      {summary.categories.length > 0 && (
        <div>
          <h4 className="mb-2 text-sm font-semibold text-muted-foreground">
            How the class did
          </h4>
          <ul className="flex flex-col gap-2">
            {summary.categories.map((category) => (
              <CategoryRow key={category.key} category={category} />
            ))}
          </ul>
        </div>
      )}

      {summary.nextSteps.length > 0 && (
        <div>
          <h4 className="mb-2 text-sm font-semibold text-muted-foreground">
            Suggested next steps
          </h4>
          <ol className="flex flex-col gap-2">
            {summary.nextSteps.map((step, index) => (
              <li
                key={`${step.rubricCategory}-${index}`}
                className="rounded-lg border-l-2 border-primary bg-muted/40 p-3"
              >
                <p className="text-sm font-medium">{step.title}</p>
                <p className="text-sm text-muted-foreground">{step.detail}</p>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

export function ClassInsightsPanel({
  classAssignmentId,
  initialInsight,
}: {
  classAssignmentId: string;
  initialInsight: ClassInsight | null;
}) {
  const fetcher = useFetcher<InsightActionData>();
  const isWorking = fetcher.state !== 'idle';

  const fetcherInsight =
    fetcher.data && fetcher.data.success ? fetcher.data.insight : null;
  const errorMessage =
    fetcher.data && !fetcher.data.success ? fetcher.data.message : null;

  const insight = fetcherInsight ?? initialInsight;
  const hasInsight = Boolean(insight?.summary);

  const generate = () => {
    fetcher.submit(
      { classAssignmentId },
      { method: 'post', action: '/api/domain/assignment-insights' }
    );
  };

  return (
    <section className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-base font-semibold">
            <Sparkles className="h-4 w-4 text-primary" aria-hidden />
            Class performance summary
          </h3>
          <p className="text-sm text-muted-foreground">
            {hasInsight
              ? `Based on ${insight!.submissionCount} submissions.`
              : 'See how the whole class did on this assignment — strengths, gaps, and what to teach next.'}
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant={hasInsight ? 'outline' : 'default'}
          onClick={generate}
          disabled={isWorking}
          isLoading={isWorking}
        >
          {isWorking ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
              Analyzing…
            </>
          ) : hasInsight ? (
            'Regenerate'
          ) : (
            'Summarize class performance'
          )}
        </Button>
      </div>

      {errorMessage && (
        <p className="mt-3 rounded-md bg-destructive/10 p-2 text-sm text-destructive">
          {errorMessage}
        </p>
      )}

      {hasInsight && (
        <div className="mt-4">
          <InsightBody insight={insight!} />
        </div>
      )}
    </section>
  );
}
