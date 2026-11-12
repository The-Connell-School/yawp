import { useFreeAccountUsage } from '~/components/free-account-usage';
import { useTeachingAccess } from '~/components/free-tier/teaching-access-context';
import { Link } from 'react-router';
import type { RefObject } from 'react';
import { ClassArt } from '~/components/class-art';
import { TeacherClassCardMenuOverlay } from '~/components/teacher-class-card-menu-overlay';
import { getClassCardHeading } from '~/utils/class-display';
import { buildMyClassTabHref } from '~/utils/class-page-tab-href';
import { cn } from '~/utils/misc';
import type { FirstAssignmentCelebrationPreview } from '~/components/free-tier/first-assignment-congratulations-dialog';

export type TeacherClassCardFeaturedAssignment = Pick<
  FirstAssignmentCelebrationPreview,
  'assignmentId' | 'title' | 'dueAt'
>;

function formatFeaturedAssignmentDue(iso: string) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(iso));
}

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
    documentCount: number;
  };
};

export { formatClassCardTitle as formatTeacherClassLabel } from '~/utils/class-display';

const IMAGE_HEIGHT_CLASS = 'h-32';

function ClassCardTabLink({
  to,
  count,
  label,
  testId,
}: {
  to: ReturnType<typeof buildMyClassTabHref>;
  count: number;
  label: string;
  testId: string;
}) {
  return (
    <Link
      to={to}
      data-testid={testId}
      onClick={(event) => event.stopPropagation()}
      className="relative z-[1] flex flex-col gap-0.5 px-4 py-3 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
    >
      <p className="text-xl font-semibold tabular-nums text-foreground">{count}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </Link>
  );
}

export function TeacherClassCard({
  klass,
  showSchoolYear = false,
  showAssignmentsTab = true,
  featuredAssignment,
  highlightFeaturedAssignment = false,
  featuredAssignmentRowRef,
  celebrationElevated = false,
}: {
  klass: TeacherClassCardData;
  showSchoolYear?: boolean;
  showAssignmentsTab?: boolean;
  featuredAssignment?: TeacherClassCardFeaturedAssignment | null;
  highlightFeaturedAssignment?: boolean;
  featuredAssignmentRowRef?: RefObject<HTMLAnchorElement | null>;
  celebrationElevated?: boolean;
}) {
  const { title, subtitle } = getClassCardHeading(klass);
  const usage = useFreeAccountUsage();
  const { locked: teachingLocked } = useTeachingAccess();
  const enabled =
    usage?.monthly && usage.classId === klass.id && Boolean(klass.code);
  const showLockedInvite = teachingLocked && usage?.classId === klass.id;
  const showInviteMenu = Boolean(enabled && !showLockedInvite);
  const classPath = `/app/my-classes/${klass.id}`;
  const documentCount = klass.stats?.documentCount ?? 0;

  const footerTabs = [
    {
      id: 'students' as const,
      to: buildMyClassTabHref(klass.id, 'students'),
      count: klass._count.students,
      label: klass._count.students === 1 ? 'Student' : 'Students',
      testId: 'teacher-class-card-tab-students',
    },
    {
      id: 'documents' as const,
      to: buildMyClassTabHref(klass.id, 'documents'),
      count: documentCount,
      label: documentCount === 1 ? 'Document' : 'Documents',
      testId: 'teacher-class-card-tab-documents',
    },
    ...(showAssignmentsTab
      ? [
          {
            id: 'assignments' as const,
            to: buildMyClassTabHref(klass.id, 'assignments'),
            count: klass._count.assignments,
            label: klass._count.assignments === 1 ? 'Assignment' : 'Assignments',
            testId: 'teacher-class-card-tab-assignments',
          },
        ]
      : []),
  ];

  return (
    <div
      className={cn(
        'relative flex min-h-full flex-col overflow-hidden rounded-lg bg-popover shadow-sm ring-1 ring-black/5 transition-shadow hover:shadow-md',
        celebrationElevated && 'z-[8] shadow-md ring-primary/30'
      )}
    >
      <Link
        to={classPath}
        data-testid="teacher-class-card-main-link"
        className="block shrink-0"
      >
        <div
          className={`${IMAGE_HEIGHT_CLASS} w-full shrink-0 overflow-hidden border-b border-black/5`}
        >
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
      </Link>
      {featuredAssignment ? (
        <div className="space-y-2 px-4 pb-4">
          <p className="text-xs font-medium text-muted-foreground">Assignments</p>
          <Link
            ref={featuredAssignmentRowRef as React.Ref<HTMLAnchorElement>}
            to={`/app/assignments/${featuredAssignment.assignmentId}`}
            data-testid="teacher-class-card-featured-assignment"
            className={cn(
              'flex flex-col gap-0.5 rounded-md border border-border bg-popover px-3 py-2.5 text-left transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              highlightFeaturedAssignment &&
                'border-primary shadow-[0_0_0_2px_hsl(var(--primary))]'
            )}
          >
            <span className="text-sm font-medium text-foreground">
              {featuredAssignment.title.trim() || 'Untitled assignment'}
            </span>
            {featuredAssignment.dueAt ? (
              <span className="text-xs text-muted-foreground">
                Due {formatFeaturedAssignmentDue(featuredAssignment.dueAt)}
              </span>
            ) : null}
          </Link>
        </div>
      ) : null}
      <div
        className={cn(
          'relative z-[1] mt-auto grid divide-x divide-black/5 border-t border-black/5',
          footerTabs.length === 3 ? 'grid-cols-3' : 'grid-cols-2'
        )}
      >
        {footerTabs.map((tab) => (
          <ClassCardTabLink
            key={tab.id}
            to={tab.to}
            count={tab.count}
            label={tab.label}
            testId={tab.testId}
          />
        ))}
      </div>
      <TeacherClassCardMenuOverlay
        title={title}
        imageHeightClass={IMAGE_HEIGHT_CLASS}
        showLockedInvite={showLockedInvite}
        showInviteMenu={showInviteMenu}
        classCode={klass.code}
      />
    </div>
  );
}
