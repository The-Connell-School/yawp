import { useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from '~/components/ui/sheet';
import { Link, useRouteLoaderData } from 'react-router';
import {
  ChartNoAxesColumn,
  Check,
  ChevronRight,
  Lock,
  Plus,
  Users,
} from 'lucide-react';
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
  isMobile,
  onMobileOpen,
  onMobileClose,
}: {
  usage: FreeAccountUsage;
  expanded: boolean;
  isMobile: boolean;
  onMobileOpen: () => void;
  onMobileClose: () => void;
}) {
  const [open, setOpen] = useState(false);
  const trigger = (
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
  );
  const details = <FreeAccountUsageDetails usage={usage} />;
  if (isMobile) {
    return (
      <Sheet
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (next) onMobileOpen();
        }}
      >
        <SheetTrigger asChild>{trigger}</SheetTrigger>
        <SheetContent
          side="bottom"
          aria-describedby={undefined}
          overlayClassName="free-usage-overlay bg-foreground/35"
          className="h-auto max-h-[90dvh] rounded-t-2xl border-x-0 border-b-0 bg-background px-5 pb-7 pt-5"
          onCloseAutoFocus={(event) => {
            // The Usage trigger is now in the closed drawer. Restore focus to
            // the visible navigation opener instead of the hidden trigger.
            event.preventDefault();
            onMobileClose();
          }}
        >
          <SheetTitle className="mb-4 font-bold">Usage</SheetTitle>
          {details}
        </SheetContent>
      </Sheet>
    );
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        side="right"
        align="end"
        aria-label="Usage"
        className="w-[min(340px,calc(100vw-24px))] rounded-xl p-5"
      >
        <h2 className="mb-4 text-lg font-bold">Usage</h2>
        {details}
      </PopoverContent>
    </Popover>
  );
}
function FreeAccountUsageDetails({ usage }: { usage: FreeAccountUsage }) {
  return (
    <>
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
    </>
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
      <header className="bg-secondary px-4 py-6 sm:px-12">
        <h1 className="text-[28px] font-bold leading-[1.2]">Reporter</h1>
      </header>
      <div className="px-4 pb-12 pt-6 sm:px-12">
        <section
          data-testid="free-reporter-card"
          className="flex max-w-[616px] flex-col items-start gap-3.5 rounded-xl border bg-popover p-7 text-left shadow-sm"
        >
          <span
            data-testid="reporter-lock-badge"
            className="flex size-10 items-center justify-center rounded-full bg-secondary"
          >
            <Lock size={20} aria-hidden="true" />
          </span>
          <h2 className="text-xl font-bold leading-[1.35]">
            Reporter comes with a YAWP paid plan
          </h2>
          <ul className="flex flex-col gap-2.5 text-[15px]">
            <li className="flex gap-2.5">
              <ChartNoAxesColumn
                size={18}
                className="mt-0.5 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              Writing growth across every class
            </li>
            <li className="flex gap-2.5">
              <Users
                size={18}
                className="mt-0.5 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              Reports for departments and families
            </li>
          </ul>
          <Link
            to="/app/free-tier/status"
            className="inline-flex h-10 items-center rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground"
          >
            Talk to us
          </Link>
        </section>
      </div>
    </section>
  );
}
