import { useRef, useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { useFreeAccountUsage } from '~/components/free-account-usage';
import { useTeachingAccess } from '~/components/free-tier/teaching-access-context';
import { LockedTeachingControl } from '~/components/free-tier/locked-teaching-control';
import {
  teachingAccessMobileSheetBodyInvite,
  TEACHING_ACCESS_LOCKED_TOOLTIP,
} from '~/domain/free-tier/teaching-access-copy';
import { StudentInvitationDialog } from '~/components/student-invitation-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu';
import { Link } from 'react-router';
import { ClassArt } from '~/components/class-art';
import { freeTierGlassyOverlayChipClassName } from '~/components/free-tier/free-tier-assignment-carousel';
import { getClassCardHeading } from '~/utils/class-display';
import { cn } from '~/utils/misc';

export type TeacherClassCardData = {
  id: string;
  code?: string | null;
  grade: string | null;
  period: string | null;
  title: string | null;
  classArtKey: string | null;
  legacyClassArtIndex?: number | null;
  school: { id: string; name: string } | null;
  schoolYear?: string;
  _count: { students: number; assignments: number };
  stats?: {
    ungradedCount: number;
    gradedUnreleasedCount: number;
  };
};

export { formatClassCardTitle as formatTeacherClassLabel } from '~/utils/class-display';

export function TeacherClassCard({
  klass,
  showSchoolYear = false,
  pe3Dashboard = false,
}: {
  klass: TeacherClassCardData;
  showSchoolYear?: boolean;
  /** PE3 free-tier dashboard: short card, 112px art, no stretch. */
  pe3Dashboard?: boolean;
}) {
  const { title, subtitle } = getClassCardHeading(klass);
  const usage = useFreeAccountUsage();
  const { locked: teachingLocked, state: teachingAccessState } =
    useTeachingAccess();
  const teachingAccessAdminName =
    teachingAccessState.variant === 'locked'
      ? teachingAccessState.adminName
      : 'your administrator';
  const enabled =
    usage?.monthly && usage.classId === klass.id && Boolean(klass.code);
  const showLockedInvite =
    teachingLocked && usage?.classId === klass.id;
  const [invitationOpen, setInvitationOpen] = useState(false);
  const invitationTriggerRef = useRef<HTMLButtonElement>(null);
  const inviteLockProps = {
    locked: true as const,
    adminName: teachingAccessAdminName,
    mobileSheetBody: teachingAccessMobileSheetBodyInvite(teachingAccessAdminName),
    tooltip: TEACHING_ACCESS_LOCKED_TOOLTIP,
  };

  const imageHeightClass = pe3Dashboard ? 'h-[112px]' : 'h-32';

  return (
    <div
      className={
        pe3Dashboard
          ? 'relative flex w-full max-w-[300px] flex-col self-start overflow-hidden rounded-xl bg-popover shadow-[0_0_0_1px_rgba(0,0,0,0.05),0_1px_3px_0_hsl(0_0%_0%/0.1)]'
          : 'relative flex min-h-full flex-col overflow-hidden rounded-lg bg-popover shadow-sm ring-1 ring-black/5 transition-shadow hover:shadow-md'
      }
    >
      <Link
        to={`/app/my-classes/${klass.id}`}
        className={
          pe3Dashboard
            ? 'flex flex-col'
            : enabled
              ? 'flex min-h-0 flex-1 flex-col'
              : 'flex min-h-full flex-1 flex-col'
        }
      >
        <div
          className={cn(
            imageHeightClass,
            'w-full shrink-0 overflow-hidden',
            !pe3Dashboard && 'border-b border-black/5'
          )}
        >
          <ClassArt
            seed={klass.id}
            classArtKey={klass.classArtKey}
            legacyClassArtIndex={klass.legacyClassArtIndex ?? null}
            className={pe3Dashboard ? 'h-full w-full' : undefined}
          />
        </div>

        <div
          className={
            pe3Dashboard
              ? 'flex flex-col gap-0.5 border-b border-border px-4 py-3'
              : 'flex flex-1 flex-col gap-3 p-4'
          }
        >
          <div>
            {klass.school?.name || showSchoolYear ? (
              <p
                className={
                  pe3Dashboard
                    ? 'font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground'
                    : 'flex items-center gap-1.5 font-mono text-[0.625rem] font-medium uppercase tracking-wide text-muted-foreground'
                }
              >
                {klass.school?.name ? <span>{klass.school.name}</span> : null}
                {/*
                  Only while the list spans years: inside a single year every
                  card would carry the same label and it would be noise.
                */}
                {showSchoolYear && klass.schoolYear ? (
                  <>
                    {klass.school?.name ? <span aria-hidden>•</span> : null}
                    <span>{klass.schoolYear.replace('-', '–')}</span>
                  </>
                ) : null}
              </p>
            ) : null}
            <h4
              className={
                pe3Dashboard
                  ? 'mt-0.5 text-balance text-base font-bold text-[#0f172a]'
                  : 'mt-1 text-balance text-base font-semibold tracking-tight text-foreground'
              }
            >
              {title}
            </h4>
            {subtitle ? (
              <p
                className={
                  pe3Dashboard
                    ? 'mt-0.5 text-[13px] text-muted-foreground'
                    : 'mt-0.5 text-xs text-muted-foreground'
                }
              >
                {subtitle}
              </p>
            ) : null}
          </div>
        </div>

        <div
          className={
            pe3Dashboard
              ? 'grid grid-cols-2'
              : 'mt-auto grid grid-cols-2 divide-x divide-black/5 border-t border-black/5'
          }
        >
          <div
            className={
              pe3Dashboard
                ? 'flex flex-col gap-0.5 border-r border-border px-4 py-2.5'
                : 'flex flex-col gap-0.5 px-4 py-3'
            }
          >
            <p
              className={
                pe3Dashboard
                  ? 'text-lg font-bold tabular-nums text-[#0f172a]'
                  : 'text-xl font-semibold tabular-nums text-foreground'
              }
            >
              {klass._count.students}
            </p>
            <p className="text-xs text-muted-foreground">
              {klass._count.students === 1 ? 'Student' : 'Students'}
            </p>
          </div>
          <div
            className={
              pe3Dashboard
                ? 'flex flex-col gap-0.5 px-4 py-2.5'
                : 'flex flex-col gap-0.5 px-4 py-3'
            }
          >
            <p
              className={
                pe3Dashboard
                  ? 'text-lg font-bold tabular-nums text-[#0f172a]'
                  : 'text-xl font-semibold tabular-nums text-foreground'
              }
            >
              {klass._count.assignments}
            </p>
            <p className="text-xs text-muted-foreground">
              {klass._count.assignments === 1 ? 'Assignment' : 'Assignments'}
            </p>
          </div>
        </div>
      </Link>
      {showLockedInvite ? (
        <div
          className={cn(
            'pointer-events-none absolute inset-x-0 top-0 z-10',
            imageHeightClass
          )}
        >
          <div className="pointer-events-auto absolute right-2 top-2">
            <LockedTeachingControl {...inviteLockProps}>
              <button
                type="button"
                data-testid="my-classes-class-options"
                aria-label={`Class options for ${title}`}
                className={cn(
                  'flex size-8 items-center justify-center text-foreground hover:bg-white',
                  freeTierGlassyOverlayChipClassName()
                )}
              >
                <MoreHorizontal size={18} aria-hidden />
              </button>
            </LockedTeachingControl>
          </div>
        </div>
      ) : null}
      {enabled && !showLockedInvite && (
        <div className="flex items-center justify-between gap-2 border-t px-4 py-3">
          <div>
            <p className="text-xs text-muted-foreground">Class code</p>
            <p
              data-testid="class-code"
              className="break-all font-mono text-sm font-semibold"
            >
              {klass.code}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {usage.students.remaining} seats available
            </p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                ref={invitationTriggerRef}
                aria-label={`Class options for ${title}`}
                className="rounded-md p-2 hover:bg-secondary"
              >
                <MoreHorizontal size={20} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onSelect={() => setInvitationOpen(true)}>
                Add your students to your class
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
      {enabled && !showLockedInvite && klass.code ? (
        <StudentInvitationDialog
          returnFocusRef={invitationTriggerRef}
          code={klass.code}
          open={invitationOpen}
          onOpenChange={setInvitationOpen}
        />
      ) : null}
    </div>
  );
}
