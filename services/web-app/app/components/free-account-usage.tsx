import { StudentInvitationDialog } from '~/components/student-invitation-dialog';
import { useRef, useState } from 'react';
import { Link, useRouteLoaderData } from 'react-router';
import {
  AlertTriangle,
  ChartNoAxesColumn,
  Check,
  Lock,
  Plus,
  Users,
} from 'lucide-react';
import type { FreeAccountUsage } from '~/domain/free-tier/inapp-usage';
import {
  formatUsageRenewsLabel,
  freeAssignmentKindUsageMeta,
  isLessonPlannerMonthlyExhausted,
} from '~/domain/free-tier/inapp-usage';
import { lessonPlanMonthWindow } from '~/utils/lesson-planner/month-window';
import { cn } from '~/utils/misc';
import { AssignmentTypeTileImage } from '~/components/assignment-type-tile-image';
import { SiteLicenseLockButton } from '~/components/site-license-lock-button';
import {
  assignmentTypeTileCardClassName,
  assignmentTypeTileFooterClassName,
  assignmentTypeTileImageClassName,
  assignmentTypeTileImageWrapClassName,
  DashboardAssignmentTileFooter,
  dashboardAssignmentTileClassName,
  dashboardAssignmentTileTestId,
  assignmentTypeTileTrailingIconClassName,
} from '~/components/assignment-type-tile-layout';
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
function lockedDashboardAssignmentMeta(
  usage: FreeAccountUsage,
  row: FreeAccountUsage['assignments'][number]
) {
  return freeAssignmentKindUsageMeta(usage, row);
}

export function FreeAssignmentTiles({
  usage,
  types,
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
  teachingLocked?: boolean;
  onCreate: (id?: string) => void;
  createTriggerRef?: RefObject<HTMLButtonElement | null>;
}) {
  if (teachingLocked) {
    return (
      <div data-testid="free-assignment-tiles">
        <h2 className="mb-4 text-lg font-bold">Assignments</h2>
        <div className="grid auto-rows-min grid-cols-2 items-start gap-3 lg:grid-cols-3">
          {usage.assignments.map((row) => {
            const type = types.find((t) => t.kind === row.kind);
            const tileLabel = `New ${row.label} assignment`;
            const tileBody = (
              <div
                className={dashboardAssignmentTileClassName(
                  'relative h-full w-full'
                )}
              >
                <DashboardAssignmentTileFooter
                  label={row.label}
                  meta={lockedDashboardAssignmentMeta(usage, row)}
                  metaClassName={
                    !usage.monthly && row.remaining === 0
                      ? 'text-amber-800'
                      : undefined
                  }
                  trailing={<SiteLicenseLockButton />}
                />
              </div>
            );
            if (type) {
              return (
                <Link
                  key={row.kind}
                  to={`/app/assignment-types/${type.id}`}
                  data-testid={dashboardAssignmentTileTestId}
                  aria-label={tileLabel}
                  className="block min-w-0 outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xl"
                >
                  {tileBody}
                </Link>
              );
            }
            return (
              <div
                key={row.kind}
                data-testid={dashboardAssignmentTileTestId}
                className="min-w-0"
              >
                {tileBody}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  const createButton = (
    <button
      ref={createTriggerRef as RefObject<HTMLButtonElement> | undefined}
      type="button"
      disabled={
        !usage.unlimitedFreeAssignmentTiles && usage.allAssignmentsUsed
      }
      onClick={() => onCreate()}
      className="text-sm text-primary underline disabled:text-muted-foreground"
    >
      New assignment
    </button>
  );
  return (
    <div data-testid="free-assignment-tiles">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-bold">Assignments</h2>
        {createButton}
      </div>
      <div className="grid auto-rows-min grid-cols-2 items-start gap-3 lg:grid-cols-3">
        {usage.assignments.map((row) => {
          const type = types.find((t) => t.kind === row.kind);
          const tileDisabled =
            !type ||
            (!usage.unlimitedFreeAssignmentTiles && row.remaining === 0);
          const tileClassName = cn(
            assignmentTypeTileCardClassName(
              'bg-popover shadow-sm disabled:bg-muted/30'
            ),
            !tileDisabled &&
              'outline-none focus-visible:ring-2 focus-visible:ring-ring'
          );
          const tileLabel = `New ${row.label} assignment`;
          const tileBody = (
            <>
              <div className={assignmentTypeTileImageWrapClassName()}>
                <AssignmentTypeTileImage
                  imageId={type?.imageId}
                  imageTitle={type?.imageTitle}
                  className={assignmentTypeTileImageClassName}
                />
              </div>
              <div className={assignmentTypeTileFooterClassName('px-3 py-2')}>
                <DashboardAssignmentTileFooter
                  label={row.label}
                  meta={freeAssignmentKindUsageMeta(usage, row)}
                  metaClassName={
                    !usage.monthly && row.remaining === 0
                      ? 'text-amber-800'
                      : undefined
                  }
                  trailing={
                    <Plus
                      size={16}
                      className={assignmentTypeTileTrailingIconClassName(
                        'text-muted-foreground'
                      )}
                      aria-hidden
                    />
                  }
                />
              </div>
            </>
          );
          if (type && !tileDisabled) {
            return (
              <Link
                key={row.kind}
                to={`/app/assignment-types/${type.id}`}
                data-testid={dashboardAssignmentTileTestId}
                aria-label={tileLabel}
                className={tileClassName}
              >
                {tileBody}
              </Link>
            );
          }
          return (
            <button
              key={row.kind}
              type="button"
              data-testid={dashboardAssignmentTileTestId}
              disabled={tileDisabled}
              onClick={() => onCreate(type?.id)}
              aria-label={tileLabel}
              className={tileClassName}
            >
              {tileBody}
            </button>
          );
        })}
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
      label: 'Create your first assignment',
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
export function FreeReporterLocked({
  variant = 'pending',
}: {
  variant?: 'pending' | 'site-license';
}) {
  return (
    <section
      data-testid="free-reporter-locked"
      className="flex h-full flex-col overflow-auto"
    >
      <header className="bg-secondary px-4 py-6 sm:px-12">
        <h1 className="text-[28px] font-bold leading-[1.2]">Reporter</h1>
        {variant === 'pending' ? (
          <p className="mt-1 text-sm text-muted-foreground">
            Your class reports.
          </p>
        ) : null}
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
            {variant === 'pending'
              ? 'Unlocks after approval'
              : 'Reporter comes with a Yawp! site license'}
          </h2>
          {variant === 'pending' ? (
            <p className="text-[15px] text-muted-foreground">
              Reporter opens once your administrator approves your free
              classroom.
            </p>
          ) : (
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
          )}
          <Link
            to={variant === 'pending' ? '/app/free-tier/status' : '/app/free-tier/status'}
            className="inline-flex h-10 items-center rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground"
          >
            Talk to us
          </Link>
        </section>
      </div>
    </section>
  );
}

export function FreeReporterMonthlyLimit({
  usage,
}: {
  usage: FreeAccountUsage;
}) {
  if (!usage.renewsAt || !usage.reporter) return null;
  const renews = formatUsageRenewsLabel(usage.renewsAt).replace(/^Renews /, '');
  return (
    <section
      data-testid="free-reporter-monthly-limit"
      className="flex h-full flex-col overflow-auto"
    >
      <header className="bg-secondary px-4 py-6 sm:px-12">
        <h1 className="text-[28px] font-bold leading-[1.2]">Reporter</h1>
        <p className="mt-1 text-sm text-muted-foreground">Your class reports.</p>
      </header>
      <div className="px-4 pb-12 pt-6 sm:px-12">
        <section className="flex max-w-[616px] flex-col items-start gap-3 rounded-xl border bg-popover p-7 text-left shadow-sm">
          <h2 className="text-xl font-bold leading-[1.35]">
            You&apos;ve reached this month&apos;s Reporter limit
          </h2>
          <p className="text-[15px] text-muted-foreground">
            Renews {renews}. Unlimited with a site license.
          </p>
          <a
            href={FULL_ACCESS_CONTACT}
            className="inline-flex h-10 items-center rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground"
          >
            Talk to us
          </a>
        </section>
      </div>
    </section>
  );
}

export const FULL_ACCESS_CONTACT =
  'mailto:hello@yawp.school?subject=More%20access%20to%20Yawp!';

export function LessonPlannerMonthlyLimitNotice({
  usage,
}: {
  usage: FreeAccountUsage;
}) {
  if (
    !usage.lessonPlannerMonthlyMetering ||
    !isLessonPlannerMonthlyExhausted(usage) ||
    !usage.renewsAt
  ) {
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
        Renews {renews}. Unlimited with a site license.
      </p>
      <a
        href={FULL_ACCESS_CONTACT}
        className="mt-3 inline-flex h-10 items-center rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground"
      >
        Talk to us
      </a>
    </div>
  );
}

export function lessonPlannerPausedPlaceholder(usage: FreeAccountUsage): string {
  if (!usage.renewsAt) return 'Lesson Planner is paused until next month.';
  const renews = formatUsageRenewsLabel(usage.renewsAt).replace(/^Renews /, '');
  return `Lesson Planner is paused until ${renews}.`;
}

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
  const { locked: teachingLocked } = useTeachingAccess();
  if (teachingLocked) {
    return null;
  }
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
