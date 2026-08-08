import { Minus, TrendingUp, TriangleAlert, type LucideIcon } from 'lucide-react';
import { Badge } from '~/components/ui/badge';
import {
  combineSectionInsights,
  type SectionCategoryStatus,
  type SectionCoverage,
  type SectionInsightInput,
} from '~/domain/assignment-insights/combine-section-insights';

const STATUS_META: Record<
  SectionCategoryStatus,
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

function submissionsLabel(count: number) {
  return `${count} submission${count === 1 ? '' : 's'}`;
}

/**
 * One card per section, always shown before any combined figure. The combined
 * read is only trustworthy in proportion to what each section contributed, so
 * the contribution is the first thing on the page rather than a footnote.
 */
function SectionCoverageCard({
  section,
  isCurrent,
}: {
  section: SectionCoverage;
  isCurrent: boolean;
}) {
  return (
    <li
      className="flex flex-col gap-1.5 rounded-lg border bg-card p-3"
      data-testid="across-sections-coverage-card"
      data-section-class-id={section.classId}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">{section.label}</span>
        {isCurrent && (
          <Badge variant="outline" size="sm">
            This class
          </Badge>
        )}
        {section.isThin && (
          <Badge variant="warning-soft" size="sm" data-testid="section-thin-badge">
            Fewer submissions
          </Badge>
        )}
      </div>

      {section.hasSummary ? (
        <>
          <div className="flex items-baseline gap-1.5">
            <span className="text-lg font-semibold tabular-nums">
              {section.submissionCount}
            </span>
            <span className="text-xs text-muted-foreground">
              submissions · {Math.round(section.shareOfTotal * 100)}% of the
              combined view
            </span>
          </div>
          <div
            className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
            aria-hidden
          >
            <div
              className={`h-full rounded-full ${
                section.isThin ? 'bg-orange-500' : 'bg-primary'
              }`}
              style={{ width: `${Math.round(section.shareOfTotal * 100)}%` }}
            />
          </div>
        </>
      ) : (
        <p className="text-xs text-muted-foreground">
          No summary yet
          {section.gradedCount > 0
            ? ` · ${section.gradedCount} graded ${
                section.gradedCount === 1 ? 'submission' : 'submissions'
              } ready to summarize`
            : ' · nothing graded yet'}
        </p>
      )}
    </li>
  );
}

export function AcrossSectionsPanel({
  sections,
  currentClassId,
}: {
  sections: SectionInsightInput[];
  currentClassId: string;
}) {
  const combined = combineSectionInsights(sections);

  return (
    <section
      className="@container overflow-hidden rounded-xl border bg-card shadow-sm dark:shadow-none"
      data-testid="across-sections-panel"
    >
      <div className="flex flex-col items-stretch gap-3 border-b bg-gradient-to-r from-primary/[0.07] to-transparent p-4 @xl:flex-row @xl:items-start @xl:justify-between">
        <div className="min-w-0">
          <h3 className="text-base font-semibold leading-tight text-foreground">
            Class performance summary
          </h3>
          <p
            className="mt-0.5 text-base/7 text-muted-foreground [overflow-wrap:anywhere] @sm:text-sm/6"
            data-testid="across-sections-subtitle"
          >
            {combined.reportingSections.length} of {sections.length} sections
            summarized · {submissionsLabel(combined.totalSubmissions)} in total.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-5 p-4">
        {combined.coverageWarnings.length > 0 && (
          <div
            className="flex items-start gap-2 rounded-md border border-orange-500/30 bg-orange-500/10 p-3 text-sm text-foreground"
            data-testid="across-sections-coverage-warning"
            role="note"
          >
            <TriangleAlert
              className="mt-0.5 h-4 w-4 shrink-0 text-orange-600 dark:text-orange-400"
              aria-hidden
            />
            <div className="flex flex-col gap-1">
              {combined.coverageWarnings.map((warning) => (
                <p key={warning}>{warning}</p>
              ))}
            </div>
          </div>
        )}

        <div>
          <h4 className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            What each section contributed
          </h4>
          <ul className="grid gap-2.5 @xl:grid-cols-2">
            {combined.sections.map((section) => (
              <SectionCoverageCard
                key={section.classId}
                section={section}
                isCurrent={section.classId === currentClassId}
              />
            ))}
          </ul>
        </div>

        {combined.reportingSections.length === 0 ? (
          <p
            className="text-sm text-muted-foreground"
            data-testid="across-sections-empty"
          >
            None of these sections has a class performance summary yet.
            Generate one from a section to start comparing them.
          </p>
        ) : (
          <>
            {combined.categories.length > 0 && (
              <div>
                <h4 className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  How the sections did
                </h4>
                <ul className="grid gap-2.5 @xl:grid-cols-2">
                  {combined.categories.map((category) => {
                    const meta =
                      STATUS_META[category.status] ?? STATUS_META.mixed;
                    const { Icon } = meta;
                    return (
                      <li
                        key={category.key}
                        className={`rounded-lg border border-l-4 bg-card p-3.5 ${meta.accent}`}
                        data-testid="across-sections-category"
                        data-category-key={category.key}
                        data-agreement={category.agreement}
                      >
                        <div className="flex items-start gap-3">
                          <span
                            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${meta.iconWrap}`}
                          >
                            <Icon className="h-4 w-4" aria-hidden />
                          </span>
                          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-medium leading-none text-foreground">
                                {category.label}
                              </span>
                              {category.agreement === 'split' ? (
                                <Badge variant="secondary" size="sm">
                                  Split across sections
                                </Badge>
                              ) : (
                                <Badge variant={meta.badge} size="sm">
                                  {meta.label} in every section
                                </Badge>
                              )}
                            </div>

                            {/*
                             * Per-section verdicts stay visible even when the
                             * sections agree — the combined badge is a
                             * shorthand for these, never a replacement.
                             */}
                            <ul className="flex flex-col gap-1">
                              {category.sections.map((entry) => {
                                const entryMeta =
                                  STATUS_META[entry.status] ??
                                  STATUS_META.mixed;
                                return (
                                  <li
                                    key={entry.classAssignmentId}
                                    className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs"
                                  >
                                    <span className="font-medium text-foreground">
                                      {entry.label}
                                    </span>
                                    <Badge
                                      variant={entryMeta.badge}
                                      size="sm"
                                    >
                                      {entryMeta.label}
                                    </Badge>
                                    <span className="text-muted-foreground">
                                      {submissionsLabel(entry.submissionCount)}
                                    </span>
                                  </li>
                                );
                              })}
                            </ul>

                            {category.notReportedBy.length > 0 && (
                              <p className="text-xs text-muted-foreground">
                                Not covered in{' '}
                                {category.notReportedBy.join(', ')}.
                              </p>
                            )}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {combined.nextSteps.length > 0 && (
              <div>
                <h4 className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Suggested next steps
                </h4>
                <ol className="flex flex-col gap-2.5">
                  {combined.nextSteps.map((step, index) => (
                    <li
                      key={`${step.rubricCategory}-${step.title}`}
                      className="flex gap-3 rounded-lg border bg-card p-3.5"
                      data-testid="across-sections-next-step"
                    >
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                        {index + 1}
                      </span>
                      <div className="flex min-w-0 flex-col gap-1">
                        <p className="text-base/7 font-semibold [overflow-wrap:anywhere] @sm:text-sm/6">
                          {step.title}
                        </p>
                        <p className="text-base/7 text-muted-foreground [overflow-wrap:anywhere] @sm:text-sm/6">
                          {step.detail}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Raised in {step.sectionLabels.join(', ')}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
