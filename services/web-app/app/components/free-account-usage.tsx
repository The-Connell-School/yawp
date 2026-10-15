import { Link, useRouteLoaderData } from 'react-router';
import { Check, ChevronRight, Lock, Plus, Users } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '~/components/ui/popover';
import type {
  FreeAccountUsage,
  UsageCount,
} from '~/domain/free-tier/inapp-usage';
import { cn } from '~/utils/misc';

export function useFreeAccountUsage() {
  return (
    useRouteLoaderData<{ freeAccountUsage?: FreeAccountUsage | null }>(
      'routes/app'
    )?.freeAccountUsage ?? null
  );
}
function Meter({ count }: { count: UsageCount }) {
  return (
    <div
      className="h-1.5 overflow-hidden rounded-full bg-secondary"
      aria-hidden="true"
    >
      <div
        className={cn(
          'h-full rounded-full bg-primary',
          count.remaining === 0 && 'bg-amber-600'
        )}
        style={{ width: `${Math.min(100, (count.used / count.total) * 100)}%` }}
      />
    </div>
  );
}
export function FreeAccountUsagePopover({
  usage,
  expanded,
}: {
  usage: FreeAccountUsage;
  expanded: boolean;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Usage"
          className={cn(
            'mx-4 mb-3 flex flex-col gap-2 rounded-lg border bg-popover p-3 text-left text-sm',
            !expanded && 'mx-1 p-2'
          )}
        >
          <span className="flex items-center justify-between font-semibold">
            {expanded ? (
              <>
                Usage <ChevronRight size={14} />
              </>
            ) : (
              <Users size={18} />
            )}
          </span>
          {expanded && (
            <>
              <span className="flex justify-between text-xs">
                <span>Students</span>
                <span className="text-muted-foreground">
                  {usage.students.remaining === 0
                    ? 'Full'
                    : `${usage.students.remaining} left`}
                </span>
              </span>
              <Meter count={usage.students} />
              {usage.warning && (
                <span className="text-xs text-amber-800">{usage.warning}</span>
              )}
            </>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="right"
        align="end"
        aria-label="Usage"
        className="w-[min(340px,calc(100vw-24px))] rounded-xl p-5"
      >
        <h2 className="mb-4 text-lg font-bold">Usage</h2>
        <div className="space-y-4">
          {[
            { label: 'Students', ...usage.students },
            ...usage.assignments,
            { label: 'Lesson plans', ...usage.lessonPlans },
          ].map((row) => (
            <div key={row.label}>
              <div className="mb-1.5 flex justify-between gap-2 text-sm">
                <span>{row.label}</span>
                <span
                  className={cn(
                    'text-xs text-muted-foreground',
                    row.remaining === 0 && 'text-amber-800'
                  )}
                >
                  {row.used} of {row.total} ·{' '}
                  {row.remaining === 0 ? 'none left' : `${row.remaining} left`}
                </span>
              </div>
              <Meter count={row} />
            </div>
          ))}
        </div>
        <p className="mt-5 text-xs leading-relaxed text-muted-foreground">
          Assignments count when you create them. Deleting one doesn't give it
          back.
        </p>
        <Link
          to="/app/free-tier/status"
          className="mt-4 inline-block text-sm text-primary underline"
        >
          Need more? Talk to us
        </Link>
      </PopoverContent>
    </Popover>
  );
}
export function FreeAssignmentTiles({
  usage,
  types,
  onCreate,
}: {
  usage: FreeAccountUsage;
  types: Array<{ id: string; kind?: string | null }>;
  onCreate: (id?: string) => void;
}) {
  return (
    <div data-testid="free-assignment-tiles">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-bold">Assignments</h2>
        <button
          type="button"
          disabled={usage.allAssignmentsUsed}
          onClick={() => onCreate()}
          className="text-sm text-primary underline disabled:text-muted-foreground"
        >
          New assignment
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {usage.assignments.map((row) => {
          const type = types.find((t) => t.kind === row.kind);
          return (
            <button
              key={row.kind}
              type="button"
              disabled={!type || row.remaining === 0}
              onClick={() => onCreate(type?.id)}
              aria-label={`New ${row.label} assignment`}
              className="flex min-h-[92px] flex-col gap-1.5 rounded-xl border bg-popover p-3.5 text-left shadow-sm disabled:bg-muted/30"
            >
              <span className="flex w-full items-start justify-between gap-2 text-[15px] font-medium">
                {row.label}
                <Plus
                  size={16}
                  className="mt-1 shrink-0 text-muted-foreground"
                />
              </span>
              <span
                className={cn(
                  'text-[13px] text-muted-foreground',
                  row.remaining === 0 && 'text-amber-800'
                )}
              >
                {row.remaining
                  ? `${row.remaining} of ${row.total} left`
                  : 'None left'}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
export function FreeAccountChecklist({ usage }: { usage: FreeAccountUsage }) {
  const steps = [
    {
      label: 'Share your class code',
      done: usage.checklist.classReady,
      to: usage.classId
        ? `/app/my-classes/${usage.classId}?tab=students`
        : '/app/my-classes',
    },
    {
      label: 'Create your first assignment',
      done: usage.checklist.assignmentCreated,
      to: '/app/assignments',
      hint: 'Class Starter is a good first one.',
    },
    {
      label: 'A student turns in writing',
      done: usage.checklist.writingSubmitted,
      to: '/app/documents',
    },
    {
      label: 'Grade it',
      done: usage.checklist.graded,
      to: '/app/documents?status=needs-grading&reset=1',
      hint: 'Using the grading assistant.',
    },
  ];
  return (
    <aside
      className="rounded-xl border bg-popover p-5 shadow-sm"
      data-testid="free-account-checklist"
    >
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-lg font-bold">Get your class going</h2>
        <span className="text-xs text-muted-foreground">
          {steps.filter((s) => s.done).length} of 4
        </span>
      </div>
      <ol className="mt-3">
        {steps.map((step) => (
          <li key={step.label} className="border-t py-3">
            <Link to={step.to} className="flex gap-3 text-sm">
              <span
                className={cn(
                  'flex size-[22px] shrink-0 items-center justify-center rounded-full border-2',
                  step.done && 'border-emerald-800 bg-emerald-800 text-white'
                )}
              >
                {step.done && <Check size={14} />}
              </span>
              <span>
                <span
                  className={cn(
                    step.done && 'text-muted-foreground line-through'
                  )}
                >
                  {step.label}
                </span>
                {step.hint && !step.done && (
                  <span className="mt-1 block text-[13px] text-muted-foreground">
                    {step.hint}
                  </span>
                )}
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </aside>
  );
}
export function FreeReporterLocked() {
  return (
    <section
      data-testid="free-reporter-locked"
      className="flex h-full flex-col overflow-auto"
    >
      <div className="border-b bg-secondary px-5 py-6 sm:px-12">
        <h1>Reporter</h1>
      </div>
      <div className="m-auto flex max-w-md flex-col items-center gap-5 px-6 py-20 text-center">
        <Lock size={28} className="text-muted-foreground" />
        <h2 className="text-xl font-semibold">
          Reporter comes with a YAWP paid plan
        </h2>
        <p className="text-muted-foreground">
          Writing growth across every class
        </p>
        <p className="text-muted-foreground">
          Reports for departments and families
        </p>
        <Link
          to="/app/free-tier/status"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Talk to us
        </Link>
      </div>
    </section>
  );
}
