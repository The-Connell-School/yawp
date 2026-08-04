import { useState } from 'react';
import { Link, useFetcher } from 'react-router';
import {
  ArrowUpRight,
  ChevronDown,
  Lightbulb,
  Minus,
  TrendingUp,
  TriangleAlert,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { timeAgo } from '~/utils/timeAgo';
import { useClassInsightGenerateAvailability } from './use-class-insight-generate-availability';

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

type DifferentiationStudent = {
  name: string;
  href: string | null;
};

type DifferentiationGroup = {
  category: string;
  label: string;
  students: DifferentiationStudent[];
};

type DifferentiationFlag = {
  kind: 'support' | 'extension';
  student: DifferentiationStudent;
  categoryLabels: string[];
};

type DifferentiationSummary = {
  focusGroups: DifferentiationGroup[];
  individuals: DifferentiationFlag[];
};

export type ClassInsightSummary = {
  overview: string;
  categories: CategoryInsight[];
  nextSteps: TeachingNextStep[];
  /** Deterministic starting points for grouping/supporting students; absent when the data suggests nothing. */
  differentiation?: DifferentiationSummary | null;
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

type ClassInsightExample = {
  snippet: string;
  score: number;
  studentName: string;
  href: string;
};
type ExamplesData = { examples: ClassInsightExample[]; message?: string };

const STATUS_META: Record<
  CategoryStatus,
  {
    label: string;
    badge: 'success' | 'secondary' | 'warning-soft';
    Icon: LucideIcon;
    accent: string;
    iconWrap: string;
  }
> = {
  strength: {
    label: 'Strength',
    badge: 'success',
    Icon: TrendingUp,
    accent: 'border-l-green-500',
    iconWrap: 'bg-green-500/10 text-green-600 dark:text-green-400',
  },
  mixed: {
    label: 'Mixed',
    badge: 'secondary',
    Icon: Minus,
    accent: 'border-l-muted-foreground/30',
    iconWrap: 'bg-muted text-muted-foreground',
  },
  gap: {
    label: 'Needs work',
    badge: 'warning-soft',
    Icon: TriangleAlert,
    accent: 'border-l-orange-500',
    iconWrap: 'bg-orange-500/10 text-orange-600 dark:text-orange-400',
  },
};

function humanizeCategoryKey(key: string) {
  return key
    .replace(/_and_/g, ' & ')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function CategoryCard({
  category,
  classAssignmentId,
}: {
  category: CategoryInsight;
  classAssignmentId: string;
}) {
  const meta = STATUS_META[category.status] ?? STATUS_META.mixed;
  const { Icon } = meta;
  const [expanded, setExpanded] = useState(false);
  const fetcher = useFetcher<ExamplesData>();

  const toggle = () => {
    const next = !expanded;
    setExpanded(next);
    if (next && !fetcher.data && fetcher.state === 'idle') {
      const params = new URLSearchParams({
        classAssignmentId,
        category: category.key,
        status: category.status,
      });
      fetcher.load(
        `/api/domain/assignment-insights/examples?${params.toString()}`
      );
    }
  };

  const isLoading = fetcher.state !== 'idle';
  const examples = fetcher.data?.examples ?? [];

  return (
    <li className={`rounded-lg border border-l-4 bg-card p-3.5 ${meta.accent}`}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={expanded}
        className="flex w-full items-start gap-3 text-left"
      >
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${meta.iconWrap}`}
        >
          <Icon className="h-4 w-4" aria-hidden />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium leading-none text-foreground">
              {category.label}
            </span>
            <Badge variant={meta.badge} size="sm">
              {meta.label}
            </Badge>
            <ChevronDown
              className={`ml-auto h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
                expanded ? 'rotate-180' : ''
              }`}
              aria-hidden
            />
          </div>
          <p className="text-base/7 text-muted-foreground [overflow-wrap:anywhere] @sm:text-sm/6">
            {category.summary}
          </p>
          <span className="text-xs font-medium text-primary">
            {expanded ? 'Hide student examples' : 'Show student examples'}
          </span>
        </div>
      </button>

      {expanded && (
        <div className="ml-11 mt-3 border-t pt-3">
          {isLoading && (
            <div className="flex flex-col gap-2" aria-hidden>
              <div className="h-10 animate-pulse rounded-md bg-muted" />
              <div className="h-10 animate-pulse rounded-md bg-muted" />
            </div>
          )}
          {!isLoading && examples.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No clear example to show from the graded work yet.
            </p>
          )}
          {!isLoading && examples.length > 0 && (
            <ul className="flex flex-col gap-2">
              {examples.map((example, index) => (
                <li
                  key={index}
                  className="rounded-md border-l-2 border-muted-foreground/25 bg-muted/40 p-2.5"
                >
                  <p className="text-base/7 italic text-foreground/90 [overflow-wrap:anywhere] @sm:text-sm/6">
                    “{example.snippet}”
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                    <Link
                      to={example.href}
                      className="inline-flex items-center gap-0.5 font-medium text-primary hover:underline"
                    >
                      {example.studentName}
                      <ArrowUpRight className="h-3 w-3" aria-hidden />
                    </Link>
                    <span className="text-muted-foreground">
                      Scored {example.score}/5 on {category.label.toLowerCase()}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}

function StudentLink({ student }: { student: DifferentiationStudent }) {
  if (!student.href) {
    return <span className="text-sm font-medium">{student.name}</span>;
  }
  return (
    <Link
      to={student.href}
      className="inline-flex items-center gap-0.5 text-sm font-medium text-primary hover:underline"
    >
      {student.name}
      <ArrowUpRight className="h-3 w-3" aria-hidden />
    </Link>
  );
}

function DifferentiationSection({
  differentiation,
}: {
  differentiation: DifferentiationSummary;
}) {
  const { focusGroups, individuals } = differentiation;
  if (focusGroups.length === 0 && individuals.length === 0) return null;

  return (
    <div>
      <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Differentiation starting points
      </h4>
      <p className="mb-2.5 text-xs text-muted-foreground">
        Patterns in the rubric scores worth a second look — you know your
        students best.
      </p>
      <div className="flex flex-col gap-2.5">
        {focusGroups.map((group) => (
          <div key={group.category} className="rounded-lg border bg-card p-3.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Users className="h-4 w-4" aria-hidden />
              </span>
              <p className="text-sm font-semibold">
                Small group · {group.label}
              </p>
              <span className="text-xs text-muted-foreground">
                {group.students.length} students scored 2 or below
              </span>
            </div>
            <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 pl-9">
              {group.students.map((student) => (
                <li key={student.name}>
                  <StudentLink student={student} />
                </li>
              ))}
            </ul>
          </div>
        ))}

        {individuals.length > 0 && (
          <ul className="flex flex-col gap-2">
            {individuals.map((flag) => (
              <li
                key={`${flag.kind}-${flag.student.name}`}
                className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border bg-card px-3.5 py-2.5"
              >
                <StudentLink student={flag.student} />
                <Badge
                  variant={flag.kind === 'support' ? 'warning-soft' : 'success'}
                  size="sm"
                >
                  {flag.kind === 'support' ? 'Check in' : 'Ready for more'}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {flag.kind === 'support'
                    ? `Scored 2 or below in ${flag.categoryLabels.join(', ')}`
                    : 'Strong across the rubric — consider an extension'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function StatChip({
  value,
  label,
  className,
}: {
  value: number;
  label: string;
  className?: string;
}) {
  return (
    <div className="flex w-fit max-w-full items-center gap-1.5 rounded-full border bg-card px-2.5 py-1">
      <span className={`text-sm font-semibold tabular-nums ${className ?? ''}`}>
        {value}
      </span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

function InsightBody({
  insight,
  classAssignmentId,
  lessonPlannerEnabled,
}: {
  insight: ClassInsight;
  classAssignmentId: string;
  lessonPlannerEnabled: boolean;
}) {
  const summary = insight.summary;
  if (!summary) return null;

  const strengthCount = summary.categories.filter(
    (category) => category.status === 'strength'
  ).length;
  const gapCount = summary.categories.filter(
    (category) => category.status === 'gap'
  ).length;

  return (
    <div className="flex flex-col gap-5">
      {/* Stat row */}
      <div className="flex flex-wrap items-center gap-2">
        <StatChip value={insight.submissionCount} label="submissions" />
        {strengthCount > 0 && (
          <StatChip
            value={strengthCount}
            label={strengthCount === 1 ? 'strength' : 'strengths'}
            className="text-green-600 dark:text-green-400"
          />
        )}
        {gapCount > 0 && (
          <StatChip
            value={gapCount}
            label={gapCount === 1 ? 'area to grow' : 'areas to grow'}
            className="text-orange-600 dark:text-orange-400"
          />
        )}
      </div>

      {/* Overview lede */}
      <div className="rounded-lg border border-primary/15 bg-primary/5 p-4">
        <p className="text-base/7 text-foreground [overflow-wrap:anywhere] @sm:text-sm/6">
          {summary.overview}
        </p>
      </div>

      {summary.categories.length > 0 && (
        <div>
          <h4 className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            How the class did
          </h4>
          <ul className="grid gap-2.5 @xl:grid-cols-2">
            {summary.categories.map((category) => (
              <CategoryCard
                key={category.key}
                category={category}
                classAssignmentId={classAssignmentId}
              />
            ))}
          </ul>
        </div>
      )}

      {summary.nextSteps.length > 0 && (
        <div>
          <h4 className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Suggested next steps
          </h4>
          <ol className="flex flex-col gap-2.5">
            {summary.nextSteps.map((step, index) => {
              const categoryLabel =
                summary.categories.find(
                  (category) => category.key === step.rubricCategory
                )?.label ?? humanizeCategoryKey(step.rubricCategory);
              return (
                <li
                  key={`${step.rubricCategory}-${index}`}
                  className="flex gap-3 rounded-lg border bg-card p-3.5"
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                    {index + 1}
                  </span>
                  <div className="flex min-w-0 flex-col gap-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-base/7 font-semibold [overflow-wrap:anywhere] @sm:text-sm/6">
                        {step.title}
                      </p>
                      {step.rubricCategory && (
                        <Badge
                          variant="outline"
                          size="sm"
                          className="max-w-full whitespace-normal text-left [overflow-wrap:anywhere]"
                        >
                          {categoryLabel}
                        </Badge>
                      )}
                    </div>
                    <p className="text-base/7 text-muted-foreground [overflow-wrap:anywhere] @sm:text-sm/6">
                      {step.detail}
                    </p>
                    {lessonPlannerEnabled ? (
                      <Link
                        // Ids only: the planner rebuilds the ask from the
                        // stored insight rather than trusting URL text.
                        to={`/app/lesson-planner?from=${classAssignmentId}&step=${index}`}
                        className="mt-1 inline-flex w-fit items-center gap-1.5 rounded-md text-sm font-medium text-primary hover:underline"
                      >
                        <Lightbulb size={14} className="shrink-0" />
                        Plan this lesson
                      </Link>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      )}

      {summary.differentiation && (
        <DifferentiationSection differentiation={summary.differentiation} />
      )}
    </div>
  );
}

export function ClassInsightsPanel({
  classAssignmentId,
  initialInsight,
  gradedCount,
  lessonPlannerEnabled = false,
}: {
  classAssignmentId: string;
  initialInsight: ClassInsight | null;
  gradedCount: number;
  /** Adds a "Plan this lesson" hand-off to each next step. */
  lessonPlannerEnabled?: boolean;
}) {
  const fetcher = useFetcher<InsightActionData>();
  const isWorking = fetcher.state !== 'idle';

  const fetcherInsight =
    fetcher.data && fetcher.data.success ? fetcher.data.insight : null;
  const errorMessage =
    fetcher.data && !fetcher.data.success ? fetcher.data.message : null;

  const insight = fetcherInsight ?? initialInsight;
  const hasInsight = Boolean(insight?.summary);
  const generatedAt = insight?.generatedAt ?? null;

  const generateAvailability = useClassInsightGenerateAvailability({
    classInsightsEnabled: true,
    gradedCount,
    existingInsight: hasInsight
      ? { submissionCount: insight!.submissionCount, generatedAt }
      : null,
  });

  const generate = () => {
    fetcher.submit(
      { classAssignmentId },
      { method: 'post', action: '/api/domain/assignment-insights' }
    );
  };

  return (
    <section className="@container overflow-hidden rounded-xl border bg-card shadow-sm dark:shadow-none">
      {/* Header band */}
      <div className="flex flex-col items-stretch gap-3 border-b bg-gradient-to-r from-primary/[0.07] to-transparent p-4 @xl:flex-row @xl:items-start @xl:justify-between">
        <div className="flex min-w-0 gap-3">
          <div className="min-w-0">
            <h3 className="text-base font-semibold leading-tight text-foreground">
              Class performance summary
            </h3>
            <p className="mt-0.5 text-base/7 text-muted-foreground [overflow-wrap:anywhere] @sm:text-sm/6">
              {hasInsight
                ? `Based on ${insight!.submissionCount} submissions${
                    generatedAt ? ` · updated ${timeAgo(generatedAt)}` : ''
                  }.`
                : 'See how the whole class did on this assignment — strengths, gaps, and what to teach next.'}
            </p>
          </div>
        </div>
        {isWorking || generateAvailability.canGenerate ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="w-full shrink-0 @xl:w-auto"
            onClick={generate}
            disabled={isWorking}
            isLoading={isWorking}
          >
            {isWorking
              ? 'Analyzing…'
              : hasInsight
                ? 'Regenerate'
                : 'Summarize class performance'}
          </Button>
        ) : (
          <p
            className="w-full shrink-0 text-sm text-muted-foreground @xl:w-auto @xl:text-right"
            data-testid="class-insight-generate-unavailable-reason"
          >
            {generateAvailability.reason}
          </p>
        )}
      </div>

      <div className="p-4">
        {errorMessage && (
          <div
            className="flex items-start gap-2 rounded-md border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive"
            role="alert"
          >
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>{errorMessage}</span>
          </div>
        )}

        {isWorking && !hasInsight && (
          <div className="flex flex-col gap-3" aria-hidden>
            <div className="h-16 animate-pulse rounded-lg bg-muted" />
            <div className="grid gap-2.5 @xl:grid-cols-2">
              <div className="h-20 animate-pulse rounded-lg bg-muted" />
              <div className="h-20 animate-pulse rounded-lg bg-muted" />
            </div>
          </div>
        )}

        {!isWorking && !hasInsight && !errorMessage && (
          <p className="text-sm text-muted-foreground">
            No summary yet. Generate one to see class-wide strengths, gaps, and
            teaching next steps.
          </p>
        )}

        {hasInsight && (
          <InsightBody
            insight={insight!}
            classAssignmentId={classAssignmentId}
            lessonPlannerEnabled={lessonPlannerEnabled}
          />
        )}
      </div>
    </section>
  );
}
