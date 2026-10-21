import { useRef, useState } from 'react';
import { Mail, MoreHorizontal } from 'lucide-react';
import { useFreeAccountUsage } from '~/components/free-account-usage';
import { useTeachingAccess } from '~/components/free-tier/teaching-access-context';
import { LockedTeachingControl } from '~/components/free-tier/locked-teaching-control';
import { Button } from '~/components/ui/button';
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
import { getClassCardHeading } from '~/utils/class-display';

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
}: {
  klass: TeacherClassCardData;
  showSchoolYear?: boolean;
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
    teachingLocked && usage?.classId === klass.id && usage?.monthly;
  const [invitationOpen, setInvitationOpen] = useState(false);
  const invitationTriggerRef = useRef<HTMLButtonElement>(null);
  const inviteLockProps = {
    locked: true as const,
    adminName: teachingAccessAdminName,
    mobileSheetBody: teachingAccessMobileSheetBodyInvite(teachingAccessAdminName),
    tooltip: TEACHING_ACCESS_LOCKED_TOOLTIP,
  };

  return (
    <div className="flex min-h-full flex-col overflow-hidden rounded-lg bg-popover shadow-sm ring-1 ring-black/5 transition-shadow hover:shadow-md">
      <Link
        to={`/app/my-classes/${klass.id}`}
        className={
          enabled
            ? 'flex min-h-0 flex-1 flex-col'
            : 'flex min-h-full flex-1 flex-col'
        }
      >
        <div className="h-32 w-full border-b border-black/5">
          <ClassArt
            seed={klass.id}
            classArtKey={klass.classArtKey}
            legacyClassArtIndex={klass.legacyClassArtIndex ?? null}
          />
        </div>

        <div className="flex flex-1 flex-col gap-3 p-4">
          <div>
            {klass.school?.name || showSchoolYear ? (
              <p className="flex items-center gap-1.5 font-mono text-[0.625rem] font-medium uppercase tracking-wide text-muted-foreground">
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
            <h4 className="mt-1 text-balance text-base font-semibold tracking-tight text-foreground">
              {title}
            </h4>
            {subtitle ? (
              <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
            ) : null}
          </div>
        </div>

        <div className="mt-auto grid grid-cols-2 divide-x divide-black/5 border-t border-black/5">
          <div className="flex flex-col gap-0.5 px-4 py-3">
            <p className="text-xl font-semibold tabular-nums text-foreground">
              {klass._count.students}
            </p>
            <p className="text-xs text-muted-foreground">
              {klass._count.students === 1 ? 'Student' : 'Students'}
            </p>
          </div>
          <div className="flex flex-col gap-0.5 px-4 py-3">
            <p className="text-xl font-semibold tabular-nums text-foreground">
              {klass._count.assignments}
            </p>
            <p className="text-xs text-muted-foreground">
              {klass._count.assignments === 1 ? 'Assignment' : 'Assignments'}
            </p>
          </div>
        </div>
      </Link>
      {showLockedInvite ? (
        <div className="flex items-center justify-end border-t px-4 py-3">
          <LockedTeachingControl {...inviteLockProps}>
            <Button
              type="button"
              size="sm"
              variant="outline"
              data-testid="my-classes-invite-students"
            >
              <Mail className="mr-2 h-4 w-4" />
              Invite students
            </Button>
          </LockedTeachingControl>
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
