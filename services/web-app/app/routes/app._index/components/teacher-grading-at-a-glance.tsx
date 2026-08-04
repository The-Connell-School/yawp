import {
  CheckCircle2,
  FileText,
  GraduationCap,
  Send,
  Users,
} from 'lucide-react';
import { Link } from 'react-router';
import { cn } from '~/utils/misc';

const GRADING_LINKS = {
  all: '/app/documents',
  needsGrading: '/app/documents?status=needs-grading',
  byStudent: '/app/documents?status=needs-grading&group=student',
  byClass: '/app/documents?status=needs-grading&group=class',
  byAssignment: '/app/documents?status=needs-grading&group=assignment',
  toRelease: '/app/documents?status=graded',
} as const;

function GradingModeCard({
  to,
  title,
  description,
  icon: Icon,
  accentClassName,
  testId,
  ariaLabel,
}: {
  to: string;
  title: string;
  description: string;
  icon: typeof Users;
  accentClassName: string;
  testId?: string;
  ariaLabel?: string;
}) {
  return (
    <Link
      to={to}
      data-testid={testId}
      aria-label={ariaLabel}
      className="group flex h-full min-w-0 flex-col overflow-hidden rounded-lg bg-popover shadow-sm ring-1 ring-black/5 transition-shadow hover:shadow-md"
    >
      <div
        className={cn('flex h-16 items-center justify-center', accentClassName)}
      >
        <Icon className="h-6 w-6 text-foreground/80" aria-hidden="true" />
      </div>
      <div className="flex flex-1 flex-col p-3">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
          {description}
        </p>
      </div>
    </Link>
  );
}

function GradingQueueStatStrip({
  needsGradingCount,
  readyToReleaseCount,
}: {
  needsGradingCount: number;
  readyToReleaseCount: number;
}) {
  return (
    <div className="mt-3 grid grid-cols-2 overflow-hidden rounded-lg bg-popover shadow-sm ring-1 ring-black/5">
      <Link
        to={GRADING_LINKS.needsGrading}
        className="border-r border-black/5 p-3 transition-colors hover:bg-muted/40"
      >
        <p className="text-xs font-medium text-muted-foreground">To grade</p>
        <p className="mt-0.5 text-2xl font-semibold tabular-nums text-foreground">
          {needsGradingCount}
        </p>
      </Link>
      <Link
        to={GRADING_LINKS.toRelease}
        className="p-3 transition-colors hover:bg-muted/40"
      >
        <p className="text-xs font-medium text-muted-foreground">To release</p>
        <p className="mt-0.5 text-2xl font-semibold tabular-nums text-foreground">
          {readyToReleaseCount}
        </p>
      </Link>
    </div>
  );
}

export function TeacherGradingAtAGlance({
  needsGradingCount,
  readyToReleaseCount,
}: {
  needsGradingCount: number;
  readyToReleaseCount: number;
}) {
  const allCaughtUp = needsGradingCount === 0 && readyToReleaseCount === 0;

  return (
    <div data-testid="teacher-grading-grid">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">Grading</h2>
        <Link
          to={GRADING_LINKS.all}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          View all
        </Link>
      </div>

      {allCaughtUp ? (
        <div className="rounded-lg bg-popover p-5 shadow-sm ring-1 ring-black/5">
          <p className="flex items-center gap-1.5 text-sm font-medium text-green-700">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            All caught up
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            No submissions waiting for grades or release.
          </p>
        </div>
      ) : (
        <>
          <GradingQueueStatStrip
            needsGradingCount={needsGradingCount}
            readyToReleaseCount={readyToReleaseCount}
          />
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <GradingModeCard
              to={GRADING_LINKS.byStudent}
              title="By student"
              description="Group the queue by student name."
              icon={Users}
              accentClassName="bg-amber-50"
              testId="teacher-workspace-cards"
              ariaLabel="Documents, grade by student"
            />
            <GradingModeCard
              to={GRADING_LINKS.byClass}
              title="By class"
              description="Work through one class at a time."
              icon={GraduationCap}
              accentClassName="bg-sky-50"
            />
            <GradingModeCard
              to={GRADING_LINKS.byAssignment}
              title="By assignment"
              description="Grade the same prompt across students."
              icon={FileText}
              accentClassName="bg-violet-50"
            />
            <GradingModeCard
              to={GRADING_LINKS.toRelease}
              title="To release"
              description="Return graded work to students."
              icon={Send}
              accentClassName="bg-blue-50"
            />
          </div>
        </>
      )}
    </div>
  );
}
