import { StudentInvitationDialog } from '~/components/student-invitation-dialog';
import { useRef, useState } from 'react';
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
import {
  formatUsageRenewsLabel,
  lessonPlannerMonthlyWarning,
  usagePercent,
} from '~/domain/free-tier/inapp-usage';
import { AlertTriangle } from 'lucide-react';
import { lessonPlanMonthWindow } from '~/utils/lesson-planner/month-window';
import { cn } from '~/utils/misc';
import { SiteLicenseLockedAssignmentTile } from '~/components/site-license-locked-assignment-tile';
import type { SiteLicenseLockedAssignmentTile as SiteLicenseLockedTile } from '~/domain/free-tier/site-license-locked-assignment-tiles';
import { AssignmentTypeTileImage } from '~/components/assignment-type-tile-image';
import { LockedTeachingControl } from '~/components/free-tier/locked-teaching-control';
import { useTeachingAccess } from '~/components/free-tier/teaching-access-context';
import type { RefObject } from 'react';
import {
  teachingAccessMobileSheetBodyInvite,
  TEACHING_ACCESS_LOCKED_TOOLTIP,
} from '~/domain/free-tier/teaching-access-copy';

export function useFreeAccountUsage() {
  return (
    useRouteLoaderData<{ freeAccountUsage?: FreeAccountUsage | null }>(
      'routes/app'
    )?.freeAccountUsage ?? null
  );
}
function MonthlyUsageBar({
  percent,
  tone,
}: {
  percent: number;
  tone: 'default' | 'warning' | 'limit';
}) {
  return (
    <div
      className="h-1 overflow-hidden rounded-full bg-secondary"
      aria-hidden="true"
    >
      <div
        className={cn(
          'h-full rounded-full bg-foreground/80 motion-safe:transition-[width] motion-safe:duration-300',
          tone === 'warning' && 'bg-amber-600',
          tone === 'limit' && 'bg-red-700'
        )}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

export function monthlyUsageShowsMobileDot(usage: FreeAccountUsage): boolean {
  if (!usage.monthly) return false;
  return lessonPlannerMonthlyWarning(usage.lessonPlans) !== 'none';
}

export function MonthlyUsageSidebarCard({
  usage,
  compact,
}: {
  usage: FreeAccountUsage;
  compact?: boolean;
}) {
  if (!usage.monthly || !usage.reporter) return null;
  const lpPercent = usagePercent(usage.lessonPlans);
  const lpWarning = lessonPlannerMonthlyWarning(usage.lessonPlans);
  const lpTone =
    lpWarning === 'limit'
      ? 'limit'
      : lpWarning === 'warning'
        ? 'warning'
        : 'default';
  const reporterPercent = usage.reporterLocked
    ? null
    : usagePercent(usage.reporter);
  return (
    <div
      className={cn('flex flex-col gap-2 text-sm', compact && 'gap-1.5')}
      data-testid="monthly-usage-card"
    >
      {!compact && (
        <p className="font-semibold leading-none">Monthly usage</p>
      )}
      <div className="space-y-1">
        <div className="flex items-baseline justify-between gap-2 text-xs">
          <span>Lesson Planner</span>
          <span
            className={cn(
              'font-medium tabular-nums',
              lpTone === 'warning' && 'text-amber-700',
              lpTone === 'limit' && 'text-red-800'
            )}
          >
            {lpPercent}%
          </span>
        </div>
        <MonthlyUsageBar percent={lpPercent} tone={lpTone} />
      </div>
      <div className="space-y-1">
        <div className="flex items-baseline justify-between gap-2 text-xs">
          <span className="flex items-center gap-1">
            Reporter
            {usage.reporterLocked ? (
              <Lock size={12} className="text-muted-foreground" aria-hidden />
            ) : null}
          </span>
          {usage.reporterLocked ? (
            <span className="text-[11px] text-muted-foreground">
              Unlocks after approval
            </span>
          ) : (
            <span className="font-medium tabular-nums">{reporterPercent}%</span>
          )}
        </div>
        {!usage.reporterLocked ? (
          <MonthlyUsageBar
            percent={reporterPercent ?? 0}
            tone="default"
          />
        ) : null}
      </div>
      {lpWarning === 'warning' ? (
        <p
          className="flex items-start gap-1.5 text-xs text-amber-800"
          data-testid="monthly-usage-warning"
        >
          <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden />
          Almost at this month&apos;s limit
        </p>
      ) : null}
      {lpWarning === 'limit' ? (
        <p
          className="flex items-start gap-1.5 text-xs text-red-800"
          data-testid="monthly-usage-limit"
        >
          <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden />
          Lesson Planner limit reached
        </p>
      ) : null}
      {usage.renewsAt ? (
        <p className="text-[11px] text-muted-foreground">
          {formatUsageRenewsLabel(usage.renewsAt)}
        </p>
      ) : null}
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
      aria-label="Monthly usage"
      className={cn(
        'mx-4 mb-3 flex flex-col gap-2 rounded-lg border bg-popover p-3 text-left text-sm',
        !expanded && 'mx-1 p-2'
      )}
    >
      {expanded ? (
        <>
          <span className="flex items-center justify-between font-semibold">
            Monthly usage
            <ChevronRight size={14} />
          </span>
          <MonthlyUsageSidebarCard usage={usage} compact />
        </>
      ) : (
        <ChartNoAxesColumn size={18} aria-hidden />
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
          <SheetTitle className="mb-4 font-bold">Monthly usage</SheetTitle>
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
        <h2 className="mb-4 text-lg font-bold">Monthly usage</h2>
        {details}
      </PopoverContent>
    </Popover>
  );
}
function FreeAccountUsageDetails({ usage }: { usage: FreeAccountUsage }) {
  if (!usage.monthly) return null;
  return (
    <>
      <MonthlyUsageSidebarCard usage={usage} />
      <Link
        to={FULL_ACCESS_CONTACT}
        className="mt-4 inline-block text-sm text-primary underline"
      >
        Talk to us
      </Link>
    </>
  );
}

export function LessonPlannerMonthlyLimitNotice({
  usage,
}: {
  usage: FreeAccountUsage;
}) {
  if (!usage.monthly || usage.lessonPlans.remaining > 0 || !usage.renewsAt) {
    return null;
  }
  const renews = formatUsageRenewsLabel(usage.renewsAt).replace(/^Renews /, '');
  return (
    <div
      className="w-full max-w-3xl rounded-xl border border-red-200 bg-popover p-4 text-left shadow-sm"
      data-testid="lesson-planner-monthly-limit"
    >
      <p className="flex items-start gap-2 text-sm font-semibold text-red-900">
        <AlertTriangle size={18} className="mt-0.5 shrink-0" aria-hidden />
        You&apos;ve reached this month&apos;s Lesson Planner limit
      </p>
      <p className="mt-2 text-sm text-muted-foreground">
        Renews {renews}. Unlimited with a site license.{' '}
        <a href={FULL_ACCESS_CONTACT} className="text-primary underline">
          Talk to us
        </a>
      </p>
    </div>
  );
}

export function lessonPlannerPausedPlaceholder(usage: FreeAccountUsage): string {
  if (!usage.renewsAt) return 'Lesson Planner is paused until next month.';
  const renews = formatUsageRenewsLabel(usage.renewsAt).replace(/^Renews /, '');
  return `Lesson Planner is paused until ${renews}.`;
}
export function FreeAssignmentTiles({
  usage,
  types,
  lockedAssignmentTiles = [],
  teachingLocked = false,
  onCreate,
  createTriggerRef,
}: {
  usage: FreeAccountUsage;
  types: Array<{
    id: string;
    kind?: string | null;
    imageId?: string | null;
    imageTitle?: string | null;
  }>;
  lockedAssignmentTiles?: SiteLicenseLockedTile[];
  teachingLocked?: boolean;
  onCreate: (id?: string) => void;
  createTriggerRef?: RefObject<HTMLButtonElement | null>;
}) {
  const { state } = useTeachingAccess();
  const adminName =
    state.variant === 'locked' ? state.adminName : 'your administrator';
  const createButton = (
    <button
      ref={createTriggerRef as RefObject<HTMLButtonElement> | undefined}
      type="button"
      disabled={!teachingLocked && !usage.monthly && usage.allAssignmentsUsed}
      onClick={() => onCreate()}
      className="text-sm text-primary underline disabled:text-muted-foreground"
    >
      {teachingLocked ? 'Create assignment' : 'New assignment'}
    </button>
  );
  return (
    <div data-testid="free-assignment-tiles">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-bold">Assignments</h2>
        {teachingLocked ? (
          <LockedTeachingControl locked adminName={adminName}>
            {createButton}
          </LockedTeachingControl>
        ) : (
          createButton
        )}
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {usage.assignments.map((row) => {
          const type = types.find((t) => t.kind === row.kind);
          return (
            <button
              key={row.kind}
              type="button"
              disabled={
                !teachingLocked &&
                (!type || (!usage.monthly && row.remaining === 0))
              }
              onClick={() => onCreate(type?.id)}
              aria-label={`New ${row.label} assignment`}
              className="flex min-h-[92px] flex-col overflow-hidden rounded-xl border bg-popover text-left shadow-sm disabled:bg-muted/30"
            >
              <AssignmentTypeTileImage
                imageId={type?.imageId}
                imageTitle={type?.imageTitle}
                className="h-16 w-full"
              />
              <span className="flex flex-col gap-1 p-3.5 pt-2">
                <span className="flex w-full items-start justify-between gap-2 text-[15px] font-medium">
                  {row.label}
                  {teachingLocked ? (
                    <Lock
                      size={16}
                      className="mt-1 shrink-0 text-muted-foreground"
                      aria-hidden
                    />
                  ) : (
                    <Plus
                      size={16}
                      className="mt-1 shrink-0 text-muted-foreground"
                    />
                  )}
                </span>
                <span className="text-[13px] text-muted-foreground">
                  {usage.monthly
                    ? 'Unlimited'
                    : row.remaining
                      ? `${row.remaining} of ${row.total} left`
                      : 'None left'}
                </span>
              </span>
            </button>
          );
        })}
        {lockedAssignmentTiles.map((tile) => (
          <SiteLicenseLockedAssignmentTile
            key={tile.key}
            label={tile.label}
            variant="dashboard"
            imageId={tile.imageId}
          />
        ))}
      </div>
    </div>
  );
}
export function FreeAccountChecklist({ usage }: { usage: FreeAccountUsage }) {
  const [invitationOpen, setInvitationOpen] = useState(false);
  const invitationTriggerRef = useRef<HTMLButtonElement>(null);
  const { locked: teachingLocked, state: teachingAccessState } =
    useTeachingAccess();
  const teachingAccessAdminName =
    teachingAccessState.variant === 'locked'
      ? teachingAccessState.adminName
      : 'your administrator';
  const lockedInviteProps = {
    locked: true as const,
    adminName: teachingAccessAdminName,
    mobileSheetBody: teachingAccessMobileSheetBodyInvite(teachingAccessAdminName),
    tooltip: TEACHING_ACCESS_LOCKED_TOOLTIP,
  };
  const steps = [
    {
      label: usage.monthly
        ? 'Add your students to your class'
        : 'Share your class code',
      done: usage.monthly
        ? usage.students.used > 0
        : usage.checklist.classReady,
      to: usage.classId
        ? `/app/my-classes/${usage.classId}?tab=students`
        : '/app/my-classes',
    },
    {
      label: usage.monthly ? 'Give your first assignment' : 'Create your first assignment',
      done: usage.checklist.assignmentCreated,
      to: '/app/assignments',
      hint: usage.monthly
        ? 'A five-minute Class Starter is the easiest way to begin.'
        : 'Class Starter is a good first one.',
    },
    ...(usage.monthly
      ? [
          {
            label: 'See what your class needs',
            done: usage.checklist.writingSubmitted,
            to: usage.classId
              ? `/app/my-classes/${usage.classId}`
              : '/app/my-classes',
            hint: 'Your Class Summary, after students submit.',
          },
        ]
      : [
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
        ]),
  ];
  const doneCount =
    steps.filter((s) => s.done).length + (usage.monthly ? 1 : 0);
  return (
    <>
      <aside
        className="rounded-xl border bg-popover p-5 shadow-sm"
        data-testid="free-account-checklist"
      >
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-lg font-bold">
            {usage.monthly ? 'Your first steps' : 'Get your class going'}
          </h2>
          <span className="text-xs text-muted-foreground">
            {doneCount} of 4
          </span>
        </div>
        <ol className="mt-3">
          {usage.monthly ? (
            <li className="flex gap-3 border-t py-3 text-sm">
              <span
                aria-hidden="true"
                className="flex size-[22px] shrink-0 items-center justify-center rounded-full border-2 border-emerald-800 bg-emerald-800 text-white"
              >
                <Check size={14} />
              </span>
              <span>
                <span className="text-muted-foreground">Your class is ready</span>
                <span className="mt-1 block text-[13px] text-muted-foreground">
                  1 class · up to {usage.students.total} students
                </span>
              </span>
            </li>
          ) : null}
          {steps.map((step) => (
            <li key={step.label} className="border-t py-3">
              {usage.monthly &&
              step.label === 'Add your students to your class' &&
              usage.classCode ? (
                <button
                  type="button"
                  ref={invitationTriggerRef}
                  onClick={() => setInvitationOpen(true)}
                  className="flex gap-3 text-left text-sm text-primary underline"
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      'flex size-[22px] shrink-0 items-center justify-center rounded-full border-2',
                      step.done &&
                        'border-emerald-800 bg-emerald-800 text-white'
                    )}
                  >
                    {step.done && <Check size={14} />}
                  </span>
                  Add your students to your class
                </button>
              ) : usage.monthly &&
                step.label === 'Add your students to your class' &&
                usage.classId &&
                (usage.classCodeHidden || (teachingLocked && !usage.classCode)) ? (
                <LockedTeachingControl {...lockedInviteProps}>
                  <button
                    type="button"
                    data-testid="checklist-invite-locked"
                    className="flex gap-3 text-left text-sm text-primary underline opacity-60"
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        'flex size-[22px] shrink-0 items-center justify-center rounded-full border-2',
                        step.done &&
                          'border-emerald-800 bg-emerald-800 text-white'
                      )}
                    >
                      {step.done && <Check size={14} />}
                    </span>
                    Add your students to your class
                  </button>
                </LockedTeachingControl>
              ) : (
                <Link to={step.to} className="flex gap-3 text-sm">
                  <span
                    className={cn(
                      'flex size-[22px] shrink-0 items-center justify-center rounded-full border-2',
                      step.done &&
                        'border-emerald-800 bg-emerald-800 text-white'
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
              )}
            </li>
          ))}
        </ol>
      </aside>
      {usage.monthly && usage.classCode && (
        <StudentInvitationDialog
          returnFocusRef={invitationTriggerRef}
          code={usage.classCode}
          freeTierCopy
          open={invitationOpen}
          onOpenChange={setInvitationOpen}
        />
      )}
    </>
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
            Reporter comes with a Yawp! site license
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

export const FULL_ACCESS_CONTACT =
  'mailto:hello@yawp.school?subject=More%20access%20to%20Yawp!';
export function AdvocatePackEntry() {
  return (
    <section className="rounded-xl border bg-popover p-5 shadow-sm">
      <h2 className="text-lg font-bold">
        Loving what Yawp! is doing for your students' writing?
      </h2>
      <p className="mt-2 text-sm">
        A site license opens the full platform to you and your colleagues. Our
        Advocate Pack makes it easy to share what you're seeing with your
        administrator.
      </p>
      <Link
        to="/app/advocate-pack"
        className="mt-3 inline-block text-sm font-medium text-primary underline"
      >
        Get the Advocate Pack
      </Link>
    </section>
  );
}

export function FreeAccountRail({ usage }: { usage: FreeAccountUsage }) {
  const complete =
    (usage.monthly ? usage.students.used > 0 : usage.checklist.classReady) &&
    usage.checklist.assignmentCreated &&
    usage.checklist.writingSubmitted &&
    usage.checklist.graded;
  return (
    <div className="space-y-5" data-testid="free-account-rail">
      {usage.monthly && complete && <AdvocatePackEntry />}
      <FreeAccountChecklist usage={usage} />
      {usage.monthly && !complete && <AdvocatePackEntry />}
    </div>
  );
}

export function MonthlyUsageNotice({
  usage,
  feature,
}: {
  usage: FreeAccountUsage;
  feature: 'lesson-planner' | 'reporter';
}) {
  if (!usage.monthly || !usage.reporter) return null;
  const count = feature === 'reporter' ? usage.reporter : usage.lessonPlans;
  const singular = feature === 'reporter' ? 'report' : 'lesson plan';
  const plural = feature === 'reporter' ? 'reports' : 'lesson plans';
  const date = new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(usage.renewsAt ?? lessonPlanMonthWindow(new Date()).lt));
  return (
    <div
      className="rounded-xl border bg-popover p-4 text-sm"
      data-testid={
        feature === 'reporter'
          ? 'reporter-monthly-remaining'
          : 'free-lesson-remaining'
      }
    >
      <p>{`Your free classroom includes ${usage.lessonPlans.total} lesson plans and ${usage.reporter.total} reports each month. Renews ${date}.`}</p>
      {count.remaining === 1 && (
        <p className="mt-2">{`You have one ${singular} left this month. It renews ${date}.`}</p>
      )}
      {count.remaining === 0 && (
        <p className="mt-2">{`You've used this month's free ${plural}. They renew ${date}, and everything you've already made is still here.`}</p>
      )}
      <p className="mt-1 text-xs text-muted-foreground">
        Unlimited with a site license{count.remaining === 0 ? '.' : ''}
      </p>
      {count.remaining === 0 && (
        <div className="mt-3 flex flex-wrap gap-3">
          <Link to="/app/advocate-pack" className="text-primary underline">
            Share Yawp! with my administrator
          </Link>
          <a href={FULL_ACCESS_CONTACT} className="text-primary underline">
            Learn about site licenses
          </a>
        </div>
      )}
    </div>
  );
}
