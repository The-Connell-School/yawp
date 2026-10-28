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
  AlertTriangle,
  ChartNoAxesColumn,
  Check,
  ChevronRight,
  Copy,
  Heart,
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
  isLessonPlannerMonthlyExhausted,
} from '~/domain/free-tier/inapp-usage';
import { lessonPlanMonthWindow } from '~/utils/lesson-planner/month-window';
import { cn } from '~/utils/misc';
import {
  assignmentTypeHasHowItWorksGuide,
  assignmentTypeHowItWorksPath,
  siteLicenseLockedTileHasHowItWorksGuide,
} from '~/domain/assignment-types/assignment-type-how-it-works';
import { AssignmentTypeTileImage } from '~/components/assignment-type-tile-image';
import { dashboardAssignmentTileTestId } from '~/components/assignment-type-tile-layout';
import {
  FreeTierAssignmentCarouselControls,
  FreeTierAssignmentCarouselTrack,
  FreeTierAssignmentTileImageBadge,
  freeTierAssignmentTileImageWrapClassName,
  freeTierAssignmentTileShellClassName,
  useFreeTierAssignmentCarousel,
} from '~/components/free-tier/free-tier-assignment-carousel';
import { LockedTeachingControl } from '~/components/free-tier/locked-teaching-control';
import { LockedDashboardGettingStarted } from '~/components/free-tier/locked-dashboard-getting-started';
import { LockedDashboardPendingCard } from '~/components/free-tier/locked-dashboard-pending-card';
import { useTeachingAccess } from '~/components/free-tier/teaching-access-context';
import type { RefObject } from 'react';
import {
  teachingAccessMobileSheetBodyInvite,
  TEACHING_ACCESS_LOCKED_TOOLTIP,
} from '~/domain/free-tier/teaching-access-copy';
import type { SiteLicenseLockedAssignmentTile } from '~/domain/free-tier/site-license-locked-assignment-tiles';
import {
  FREE_TIER_UNLIMITED_TILE_LABEL,
  SITE_LICENSE_ONLY_TILE_LABEL,
} from '~/domain/free-tier/locked-dashboard-copy';
import { SeeHowItWorksLink } from '~/components/how-it-works/guide';

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
        style={{
          width: `${count.total === 0 ? 100 : Math.min(100, (count.used / count.total) * 100)}%`,
        }}
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
            {usage.monthly ? 'Monthly usage' : 'Usage'}{' '}
            <ChevronRight size={14} />
          </>
        ) : (
          <Users size={18} />
        )}
      </span>
      {expanded && (
        <>
          <span className="flex justify-between text-xs">
            <span>{usage.monthly ? 'Lesson Planner' : 'Students'}</span>
            <span className="text-muted-foreground">
              {usage.monthly
                ? `${usage.lessonPlans.remaining} left`
                : usage.students.remaining === 0
                  ? 'Full'
                  : `${usage.students.remaining} left`}
            </span>
          </span>
          <Meter count={usage.monthly ? usage.lessonPlans : usage.students} />
          {usage.monthly && usage.reporter && (
            <>
              <span className="flex justify-between text-xs">
                <span>Reporter</span>
                <span className="text-muted-foreground">
                  {usage.reporter.remaining} left
                </span>
              </span>
              <Meter count={usage.reporter} />
            </>
          )}
          {!usage.monthly && usage.warning && (
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
        {(usage.monthly
          ? [
              { label: 'Lesson Planner', ...usage.lessonPlans },
              { label: 'Reporter', ...usage.reporter! },
            ]
          : [
              { label: 'Students', ...usage.students },
              ...usage.assignments,
              { label: 'Lesson plans', ...usage.lessonPlans },
            ]
        ).map((row) => (
          <div key={row.label}>
            <div className="mb-1.5 flex justify-between gap-2 text-sm">
              <span>{row.label}</span>
              <span
                className={cn(
                  'text-xs text-muted-foreground',
                  !usage.monthly && row.remaining === 0 && 'text-amber-800'
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
        {usage.monthly ? (
          'Monthly uses reset on the first day of each month (UTC). Deleting a report or draft does not restore a use.'
        ) : (
          <>
            Assignments count when you create them. Deleting one doesn't give it
            back.
          </>
        )}
      </p>
      <Link
        to={usage.monthly ? FULL_ACCESS_CONTACT : '/app/free-tier/status'}
        className="mt-4 inline-block text-sm text-primary underline"
      >
        Need more? Talk to us
      </Link>
    </>
  );
}
const freeTierAssignmentTileImageClassName = 'size-[168px] object-cover';

function FreeTierCarouselTileCaption({
  label,
  meta,
  metaClassName,
}: {
  label: string;
  meta: string;
  metaClassName?: string;
}) {
  return (
    <span className="flex min-h-[58px] flex-col gap-0.5 px-3 py-2.5">
      <span className="text-sm font-medium leading-snug text-foreground">
        {label}
      </span>
      <span
        className={cn('text-xs leading-snug', metaClassName ?? 'font-semibold text-[#1f3532]')}
      >
        {meta}
      </span>
    </span>
  );
}

function FreeTierCarouselTileImage({
  imageId,
  imageTitle,
  siteLicense,
  badge,
}: {
  imageId?: string | null;
  imageTitle?: string | null;
  siteLicense?: boolean;
  badge: 'create' | 'locked';
}) {
  return (
    <div
      className={cn(
        freeTierAssignmentTileImageWrapClassName(),
        siteLicense && 'saturate-[0.6]'
      )}
    >
      <AssignmentTypeTileImage
        imageId={imageId}
        imageTitle={imageTitle}
        className={freeTierAssignmentTileImageClassName}
      />
      {siteLicense ? (
        <div className="pointer-events-none absolute inset-0 bg-muted/35" aria-hidden />
      ) : null}
      <FreeTierAssignmentTileImageBadge variant={badge} />
    </div>
  );
}

function FreeTierCarouselTile({
  label,
  meta,
  metaClassName,
  imageId,
  imageTitle,
  siteLicense,
  teachingLocked,
  assignmentTypeId,
  assignmentTypeTitle,
  assignmentTypeKind,
  siteLicenseTileKey,
  onCreate,
  tileDisabled,
}: {
  label: string;
  meta: string;
  metaClassName?: string;
  imageId?: string | null;
  imageTitle?: string | null;
  siteLicense?: boolean;
  teachingLocked: boolean;
  assignmentTypeId: string;
  assignmentTypeTitle?: string;
  assignmentTypeKind?: string | null;
  siteLicenseTileKey?: string;
  tileDisabled?: boolean;
}) {
  const shellClass = freeTierAssignmentTileShellClassName(
    cn(
      siteLicense ? 'bg-secondary' : 'bg-[#fffdf9]',
      'outline-none focus-visible:ring-2 focus-visible:ring-ring'
    )
  );
  const caption = (
    <FreeTierCarouselTileCaption
      label={label}
      meta={meta}
      metaClassName={metaClassName}
    />
  );
  const image = (
    <FreeTierCarouselTileImage
      imageId={imageId}
      imageTitle={imageTitle}
      siteLicense={siteLicense}
      badge={teachingLocked || siteLicense ? 'locked' : 'create'}
    />
  );
  const testId = siteLicense
    ? 'site-license-locked-assignment-tile'
    : dashboardAssignmentTileTestId;

  const guideOnly = teachingLocked || siteLicense;
  const hasHowItWorksGuide =
    siteLicenseTileKey != null
      ? siteLicenseLockedTileHasHowItWorksGuide(siteLicenseTileKey)
      : assignmentTypeHasHowItWorksGuide({
          title: assignmentTypeTitle ?? label,
          kind: assignmentTypeKind ?? null,
        });

  if (guideOnly && hasHowItWorksGuide) {
    const ariaLabel = `${label}, ${meta}. See how it works`;
    return (
      <Link
        to={assignmentTypeHowItWorksPath(assignmentTypeId)}
        data-testid={testId}
        aria-label={ariaLabel}
        className={shellClass}
      >
        {image}
        {caption}
      </Link>
    );
  }

  if (guideOnly) {
    return (
      <div data-testid={testId} className={cn(shellClass, 'cursor-default')}>
        {image}
        {caption}
      </div>
    );
  }

  const tileLabel = `New ${label} assignment`;
  if (tileDisabled) {
    return (
      <button
        type="button"
        data-testid={testId}
        disabled
        aria-label={tileLabel}
        className={cn(shellClass, 'cursor-not-allowed opacity-60')}
      >
        {image}
        {caption}
      </button>
    );
  }

  return (
    <Link
      to={`/app/assignment-types/${assignmentTypeId}`}
      data-testid={testId}
      aria-label={tileLabel}
      className={shellClass}
    >
      {image}
      {caption}
    </Link>
  );
}

export function FreeAssignmentTiles({
  usage,
  types,
  siteLicenseLockedAssignmentTiles = [],
  assignmentsSeeHowItWorksTo,
  teachingLocked = false,
  onCreate,
  createTriggerRef,
}: {
  usage: FreeAccountUsage;
  types: Array<{
    id: string;
    title?: string | null;
    kind?: string | null;
    imageId?: string | null;
    imageTitle?: string | null;
  }>;
  siteLicenseLockedAssignmentTiles?: SiteLicenseLockedAssignmentTile[];
  assignmentsSeeHowItWorksTo?: string;
  teachingLocked?: boolean;
  onCreate: (id?: string) => void;
  createTriggerRef?: RefObject<HTMLButtonElement | null>;
}) {
  const carousel = useFreeTierAssignmentCarousel();

  const headerActions = teachingLocked ? (
    assignmentsSeeHowItWorksTo ? (
      <SeeHowItWorksLink to={assignmentsSeeHowItWorksTo} />
    ) : null
  ) : (
    <button
      ref={createTriggerRef as RefObject<HTMLButtonElement> | undefined}
      type="button"
      disabled={
        !usage.unlimitedFreeAssignmentTiles && usage.allAssignmentsUsed
      }
      onClick={() => onCreate()}
      className="text-[13px] font-medium text-muted-foreground hover:text-foreground disabled:opacity-50"
    >
      + New assignment
    </button>
  );

  return (
    <div data-testid="free-assignment-tiles" data-tour="dashboard-assignments">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">Assignments</h2>
        <span className="inline-flex shrink-0 items-center gap-3">
          {headerActions}
          <FreeTierAssignmentCarouselControls
            canScrollLeft={carousel.canScrollLeft}
            canScrollRight={carousel.canScrollRight}
            onScrollLeft={() => carousel.scrollByPage(-1)}
            onScrollRight={() => carousel.scrollByPage(1)}
          />
        </span>
      </div>
      <FreeTierAssignmentCarouselTrack
        trackRef={carousel.trackRef}
        onScroll={carousel.updateScrollState}
      >
        {usage.assignments.map((row) => {
          const type = types.find((t) => t.kind === row.kind);
          const meta = usage.unlimitedFreeAssignmentTiles
            ? FREE_TIER_UNLIMITED_TILE_LABEL
            : row.remaining
              ? `${row.remaining} of ${row.total} left`
              : 'None left';
          if (!type) return null;
          return (
            <FreeTierCarouselTile
              key={row.kind}
              label={row.label}
              meta={meta}
              metaClassName={
                usage.unlimitedFreeAssignmentTiles
                  ? 'font-semibold text-[#1f3532]'
                  : row.remaining === 0
                    ? 'font-normal text-amber-800'
                    : undefined
              }
              imageId={type.imageId}
              imageTitle={type.imageTitle}
              teachingLocked={teachingLocked}
              assignmentTypeId={type.id}
              assignmentTypeTitle={type.title}
              assignmentTypeKind={type.kind}
              tileDisabled={
                !teachingLocked &&
                !usage.unlimitedFreeAssignmentTiles &&
                row.remaining === 0
              }
            />
          );
        })}
        {siteLicenseLockedAssignmentTiles.map((tile) => (
          <FreeTierCarouselTile
            key={tile.key}
            label={tile.label}
            meta={SITE_LICENSE_ONLY_TILE_LABEL}
            metaClassName="font-normal text-muted-foreground"
            imageId={tile.imageId}
            siteLicense
            teachingLocked={teachingLocked}
            assignmentTypeId={tile.assignmentTypeId}
            siteLicenseTileKey={tile.key}
          />
        ))}
      </FreeTierAssignmentCarouselTrack>
    </div>
  );
}
function FreeTierChecklistStepMarker({
  done,
  current,
}: {
  done: boolean;
  current: boolean;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex size-[22px] shrink-0 items-center justify-center rounded-full border-2',
        done && 'border-emerald-800 bg-emerald-800 text-white',
        current && !done && 'border-primary bg-primary',
        !done && !current && 'border-border bg-background'
      )}
    >
      {done ? <Check size={14} /> : null}
      {current && !done ? (
        <span className="size-1.5 rounded-full bg-primary-foreground" />
      ) : null}
    </span>
  );
}

function FreeTierClassCodeChip({ code }: { code: string }) {
  return (
    <div className="flex min-w-0 items-center gap-1.5 rounded-lg border bg-background py-1 pl-3 pr-1">
      <code className="min-w-0 flex-1 truncate font-mono text-sm font-bold tracking-wide text-foreground">
        {code}
      </code>
      <button
        type="button"
        aria-label="Copy class code"
        className="inline-flex size-[30px] shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        onClick={() => void navigator.clipboard.writeText(code)}
      >
        <Copy size={15} aria-hidden />
      </button>
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

  if (usage.monthly) {
    const pe3Steps = [
      {
        key: 'class',
        label: 'Class ready',
        done: usage.checklist.classReady,
      },
      {
        key: 'assignment',
        label: 'First assignment created',
        done: usage.checklist.assignmentCreated,
        hint: 'Welcome to Yawp! Class Starter',
        to: '/app/assignments',
      },
      {
        key: 'students',
        label: 'Add your students',
        done: usage.students.used > 0,
      },
      {
        key: 'grade',
        label: 'Grade your first submission',
        done: usage.checklist.graded,
        to: '/app/documents?status=needs-grading&reset=1',
      },
    ] as const;
    const doneCount = pe3Steps.filter((step) => step.done).length;
    const currentKey =
      pe3Steps.find((step) => !step.done)?.key ?? pe3Steps[pe3Steps.length - 1].key;

    return (
      <>
        <aside
          className="rounded-xl border bg-popover p-5 shadow-sm"
          data-testid="free-account-checklist"
        >
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-[15px] font-bold">Getting started</h2>
            <span className="text-xs text-muted-foreground">
              {doneCount} of 4 done
            </span>
          </div>
          <ol className="mt-2 list-none space-y-0 p-0">
            {pe3Steps.map((step) => {
              const current = step.key === currentKey && !step.done;
              const isStudentsStep = step.key === 'students';
              const showStudentsPanel =
                isStudentsStep &&
                usage.classCode &&
                !step.done &&
                !teachingLocked;

              return (
                <li key={step.key} className="border-t py-3 first:border-t-0">
                  <div className="flex gap-3 text-sm">
                    <FreeTierChecklistStepMarker
                      done={step.done}
                      current={current}
                    />
                    <div className="min-w-0 flex-1">
                      <span
                        className={cn(
                          step.done && 'text-muted-foreground line-through',
                          current && 'font-semibold text-foreground'
                        )}
                      >
                        {step.label}
                      </span>
                      {'hint' in step && step.hint && !step.done ? (
                        <span className="mt-1 block text-[13px] text-muted-foreground">
                          {step.hint}
                        </span>
                      ) : null}
                      {showStudentsPanel ? (
                        <div className="mt-2 space-y-2 rounded-lg border bg-secondary/40 p-3">
                          <p className="text-[13px] leading-snug text-foreground">
                            Students join with your class code. It takes about
                            five minutes with your class in the room.
                          </p>
                          <FreeTierClassCodeChip code={usage.classCode!} />
                          <button
                            type="button"
                            ref={invitationTriggerRef}
                            onClick={() => setInvitationOpen(true)}
                            className="inline-flex h-9 w-full items-center justify-center rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground"
                          >
                            Invite students
                          </button>
                        </div>
                      ) : null}
                      {isStudentsStep &&
                      !showStudentsPanel &&
                      !step.done &&
                      'to' in step === false &&
                      usage.classId &&
                      (usage.classCodeHidden ||
                        (teachingLocked && !usage.classCode)) ? (
                        <LockedTeachingControl {...lockedInviteProps}>
                          <button
                            type="button"
                            data-testid="checklist-invite-locked"
                            className="mt-1 text-left text-primary underline opacity-60"
                          >
                            {step.label}
                          </button>
                        </LockedTeachingControl>
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </aside>
        {usage.classCode ? (
          <StudentInvitationDialog
            returnFocusRef={invitationTriggerRef}
            code={usage.classCode}
            freeTierCopy
            open={invitationOpen}
            onOpenChange={setInvitationOpen}
          />
        ) : null}
      </>
    );
  }

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
  const doneCount = steps.filter((s) => s.done).length;
  return (
    <>
      <aside
        className="rounded-xl border bg-popover p-5 shadow-sm"
        data-testid="free-account-checklist"
      >
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-lg font-bold">Get your class going</h2>
          <span className="text-xs text-muted-foreground">
            {doneCount} of 4
          </span>
        </div>
        <ol className="mt-3">
          {steps.map((step) => (
            <li key={step.label} className="border-t py-3">
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
            </li>
          ))}
        </ol>
      </aside>
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
          <UsageNavRingMiniStatic />
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

function UsageNavRingMiniStatic() {
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 18 18"
      className="shrink-0 text-muted-foreground"
      aria-hidden
    >
      <circle
        cx={9}
        cy={9}
        r={7}
        fill="none"
        className="stroke-muted"
        strokeWidth={2}
      />
    </svg>
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
    <section
      className="rounded-xl border bg-popover p-5 shadow-sm"
      data-testid="free-tier-advocate-rail"
    >
      <span
        aria-hidden
        className="mb-3 flex size-10 items-center justify-center rounded-full bg-secondary"
      >
        <Heart size={18} className="text-foreground/80" />
      </span>
      <p className="text-sm leading-snug text-foreground">
        Loving what Yawp! is doing for your students? Tell a colleague. They can
        start their own free classroom.
      </p>
      <Link
        to="/app/advocate-pack"
        className="mt-4 inline-flex h-10 w-full items-center justify-center rounded-full border text-sm font-medium text-foreground hover:bg-muted/50"
      >
        Share with a colleague
      </Link>
    </section>
  );
}

export function FreeAccountRail({ usage }: { usage: FreeAccountUsage }) {
  const { locked: teachingLocked } = useTeachingAccess();
  if (teachingLocked) {
    return (
      <div className="flex flex-col gap-4" data-testid="free-account-rail">
        <LockedDashboardPendingCard />
        <LockedDashboardGettingStarted />
      </div>
    );
  }
  const showChecklist = usage.monthly && usage.students.used === 0;
  const showAdvocatePack = usage.monthly && usage.students.used > 0;
  return (
    <div className="space-y-5" data-testid="free-account-rail">
      {showChecklist ? <FreeAccountChecklist usage={usage} /> : null}
      {showAdvocatePack ? <AdvocatePackEntry /> : null}
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
